"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getLoopsByProject, getProjectActivity } from "@/lib/queries";
import { PrLink } from "@/components/ui/chips";
import { facadeColor, facadeLabel, statusOf } from "@/lib/facade";
import { cn, formatCost, timeAgo } from "@/lib/utils";
import type { ActivityRun, Loop } from "@/lib/types";

function num(v: number | string | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function CostDashboard({
  projectId,
  projectName,
  trigger,
}: {
  projectId: string;
  projectName: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<ActivityRun[]>([]);
  const [loops, setLoops] = useState<Loop[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void Promise.all([getProjectActivity(projectId), getLoopsByProject(projectId)])
      .then(([r, l]) => {
        setRuns(r);
        setLoops(l);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, projectId]);

  const spent = runs.reduce((s, r) => s + num(r.cost_usd), 0);
  const budgetPerRun = loops.reduce((s, l) => s + num(l.budget_usd), 0);
  const byStatus = runs.reduce<Record<string, number>>((m, r) => {
    m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent side="center" className="flex max-h-[88vh] flex-col">
        <DialogHeader>
          <DialogTitle>Coûts & activité · {projectName}</DialogTitle>
          <DialogDescription>{runs.length} run(s) · données réelles de la DB.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Dépensé (total)" value={formatCost(spent) || "0 $"} />
                <Stat label="Budget / run (Σ loops)" value={`${budgetPerRun} $`} />
              </div>

              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Runs par statut
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(byStatus).map(([s, n]) => {
                    const st = statusOf(s);
                    return (
                      <span key={s} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", st.classes)}>
                        {st.label} · {n}
                      </span>
                    );
                  })}
                  {runs.length === 0 && <span className="text-xs text-muted-foreground">Aucun run.</span>}
                </div>
              </div>

              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Historique récent
                </h3>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {runs.slice(0, 30).map((r) => (
                    <div key={r.id} className="flex items-center gap-2 px-2.5 py-2 text-xs">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: facadeColor(r.facade) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{r.subject || facadeLabel(r.facade)}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{formatCost(num(r.cost_usd))}</span>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px]", statusOf(r.status).classes)}>
                        {statusOf(r.status).label}
                      </span>
                      {r.pr_url && <PrLink url={r.pr_url} className="shrink-0 border-0 px-0" />}
                      <span className="hidden shrink-0 text-muted-foreground sm:inline">{timeAgo(r.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
