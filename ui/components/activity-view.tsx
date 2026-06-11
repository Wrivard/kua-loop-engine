"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PauseCircle, PlayCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/empty-state";
import { SystemHealth } from "@/components/settings/system-health";
import { FacadeDot } from "@/components/facade-mark";
import { CostBadge, PrLink, StatusBadge } from "@/components/ui/chips";
import { useLiveQuery } from "@/lib/use-live-query";
import { getMonthCost, getProjectActivity, getProjects, getSystemSettings, setPaused } from "@/lib/queries";
import { facadeLabel } from "@/lib/facade";
import { cn, formatCost, timeAgo } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { ActivityRun, Project } from "@/lib/types";

type ActivityData = {
  projects: { project: Project; cost: number }[];
  runs: ActivityRun[];
  total: number;
};

const RUNNING = new Set(["queued", "preparing", "running", "verifying"]);
const FAILED = new Set(["failed", "budget_exceeded", "timed_out"]);

function PauseControl() {
  const [paused, setPausedState] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSystemSettings()
      .then((s) => setPausedState(s?.paused ?? false))
      .catch(() => setPausedState(false));
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    setPausedState(next);
    try {
      await setPaused(next);
    } catch {
      setPausedState(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border p-3",
        paused ? "border-warn/30 bg-warn-soft" : "border-border",
      )}
    >
      <div className="min-w-0">
        <p className={cn("flex items-center gap-1.5 text-sm font-medium", paused && "text-warn")}>
          {paused ? <PauseCircle className="h-4 w-4" strokeWidth={1.75} /> : <PlayCircle className="h-4 w-4 text-success" strokeWidth={1.75} />}
          {paused ? "Moteur en pause" : "Moteur actif"}
        </p>
        <p className="text-xs text-muted-foreground">
          En pause : aucun nouveau run ne démarre (les runs en cours finissent). Sûr, marche sans la gateway.
        </p>
      </div>
      <Switch
        checked={paused === true}
        disabled={paused === null || saving || !isSupabaseConfigured}
        onCheckedChange={(v) => void toggle(v)}
        aria-label="Pause du moteur"
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-2.5 sm:p-3">
      <p className="truncate text-xs uppercase tracking-wide text-faint">{label}</p>
      {/* Les chiffres sont les héros : gros, tabulaires ; étiquette discrète. */}
      <p className={cn("mt-0.5 truncate text-xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

export function ActivityView() {
  const { data, loading, error, refetch } = useLiveQuery<ActivityData>(
    async () => {
      const projects = await getProjects();
      const enriched = await Promise.all(
        projects.map(async (p) => ({
          project: p,
          cost: await getMonthCost(p.id),
          runs: await getProjectActivity(p.id, 20),
        })),
      );
      const runs = enriched
        .flatMap((e) => e.runs)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
        .slice(0, 40);
      return {
        projects: enriched.map((e) => ({ project: e.project, cost: e.cost })),
        runs,
        total: enriched.reduce((s, e) => s + e.cost, 0),
      };
    },
    ["runs", "threads", "projects", "loops"],
    [],
  );

  const runningN = (data?.runs ?? []).filter((r) => RUNNING.has(r.status)).length;
  const failedN = (data?.runs ?? []).filter((r) => FAILED.has(r.status)).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Activité</h1>
        <p className="mt-1 text-sm text-muted-foreground">Santé du moteur · coûts · ce qui roule.</p>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-5">
          <PauseControl />
          <SystemHealth />

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Coût du mois" value={formatCost(data?.total) || "0 $"} />
            <Stat label="En cours" value={String(runningN)} tone={runningN ? "text-info" : undefined} />
            <Stat label="Échoués" value={String(failedN)} tone={failedN ? "text-danger" : undefined} />
          </div>

          <section>
            <h2 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Par projet</h2>
            {loading && !data ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (data?.projects ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun projet. Tape en bas pour en importer un (« ajoute mon repo … »).
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {(data?.projects ?? []).map(({ project, cost }) => (
                  <Link
                    key={project.id}
                    href={`/p/${project.id}`}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatCost(cost) || "0 $"}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Runs récents</h2>
            {loading && !data ? (
              <Skeleton className="h-24 w-full" />
            ) : (data?.runs ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Rien encore. Tape en bas pour dispatcher une tâche.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {(data?.runs ?? []).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <FacadeDot facade={r.facade} />
                    <span className="min-w-0 flex-1 truncate">{r.subject || facadeLabel(r.facade)}</span>
                    <CostBadge usd={r.cost_usd} />
                    <StatusBadge status={r.status} />
                    {r.pr_url && <PrLink url={r.pr_url} className="hidden shrink-0 border-0 px-0 sm:inline-flex" />}
                    <span className="hidden shrink-0 text-muted-foreground sm:inline">{timeAgo(r.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
