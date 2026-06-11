"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronRight, SlidersHorizontal } from "lucide-react";
import { ThreadRow } from "@/components/thread-row";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { FacadeDot } from "@/components/facade-mark";
import { AutonomyPopover } from "@/components/autonomy-popover";
import { LoopConfigPanel } from "@/components/loop-config-panel";
import { CostDashboard } from "@/components/cost-dashboard";
import { ProjectSettingsDrawer } from "@/components/project-settings-drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useComposer } from "@/components/composer/composer-context";
import { useLiveQuery } from "@/lib/use-live-query";
import {
  getLoopsByProject,
  getMonthCost,
  getProjectBySlug,
  getThreadsByProject,
} from "@/lib/queries";
import { facadeLabel, FACADE_ORDER } from "@/lib/facade";
import { formatCost } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Facade, Loop, Project, ThreadListItem } from "@/lib/types";

type ProjectData = {
  project: Project | null;
  threads: ThreadListItem[];
  loops: Loop[];
  monthCost: number;
};

export function ProjectView({ slug }: { slug: string }) {
  const { data, loading, error, refetch } = useLiveQuery<ProjectData>(
    async () => {
      const [project, threads, loops, monthCost] = await Promise.all([
        getProjectBySlug(slug),
        getThreadsByProject(slug),
        getLoopsByProject(slug),
        getMonthCost(slug),
      ]);
      return { project, threads, loops, monthCost };
    },
    [
      { table: "threads", filter: `project_id=eq.${slug}` },
      "runs", // runs n'a pas de project_id → écoute globale (refetch borné par les listes courtes)
      { table: "loops", filter: `project_id=eq.${slug}` },
      "approvals",
      "projects",
    ],
    [slug],
  );

  const [filter, setFilter] = useState<Facade | "all">("all");
  const [archivedOpen, setArchivedOpen] = useState(false);

  const project = data?.project ?? null;
  const threads = useMemo(() => data?.threads ?? [], [data]);
  const loops = useMemo(() => data?.loops ?? [], [data]);

  // Scope le composer-dock sur ce projet (création de thread via la saisie en bas).
  const { registerSink, setPageScope } = useComposer();
  useEffect(() => {
    registerSink(null);
    setPageScope({ kind: "project", id: slug, name: project?.name ?? slug });
    return () => {
      registerSink(null);
      setPageScope(null);
    };
  }, [slug, project?.name, registerSink, setPageScope]);

  const active = useMemo(() => threads.filter((t) => t.status !== "archived"), [threads]);
  const archived = useMemo(() => threads.filter((t) => t.status === "archived"), [threads]);

  // Façades à afficher en chips : armées (loop) ou présentes dans les fils actifs.
  const loopByFacade = useMemo(() => new Map(loops.map((l) => [l.facade, l])), [loops]);
  const countByFacade = useMemo(() => {
    const m = new Map<Facade, number>();
    for (const t of active) m.set(t.facade, (m.get(t.facade) ?? 0) + 1);
    return m;
  }, [active]);
  const chips = useMemo(
    () => FACADE_ORDER.filter((f) => loopByFacade.has(f) || (countByFacade.get(f) ?? 0) > 0),
    [loopByFacade, countByFacade],
  );

  const byFilter = (t: ThreadListItem) => filter === "all" || t.facade === filter;
  const activeShown = active.filter(byFilter);
  const archivedShown = archived.filter(byFilter);
  const selectedLoop = filter !== "all" ? loopByFacade.get(filter) ?? null : null;

  if (error && !data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <ErrorState message={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-6 h-9 w-full" />
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState title="Projet introuvable" description="Ce projet n'existe pas ou a été retiré." />
    );
  }

  const cost = formatCost(data?.monthCost);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="capitalize">{project.plan}</span>
          <span aria-hidden>·</span>
          <span>{cost ? `${cost} ce mois` : "aucun coût ce mois"}</span>
          {project.is_engine && (
            <>
              <span aria-hidden>·</span>
              <span>moteur (revue humaine)</span>
            </>
          )}
        </p>
      </div>

      {/* Chips de filtre + Nouvelle */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Tout
          <span className="tabular-nums text-muted-foreground">{active.length}</span>
        </FilterChip>
        {chips.map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
            <FacadeDot facade={f} />
            {facadeLabel(f)}
            <span className="tabular-nums text-muted-foreground">{countByFacade.get(f) ?? 0}</span>
          </FilterChip>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <CostDashboard
            projectId={project.id}
            projectName={project.name}
            trigger={
              <Button size="icon" variant="ghost" aria-label="Coûts & activité">
                <BarChart3 className="h-4 w-4" />
              </Button>
            }
          />
          <ProjectSettingsDrawer
            projectId={project.id}
            trigger={
              <Button size="icon" variant="ghost" aria-label="Connecteurs / Skills / MCP">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </div>

      {/* Panneau d'autonomie (façade filtrée) */}
      {selectedLoop && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">Autonomie · {facadeLabel(filter as Facade)}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <AutonomyPopover loop={selectedLoop} allowAuto={!project.is_engine} />
            <LoopConfigPanel
              loop={selectedLoop}
              trigger={
                <Button size="icon" variant="ghost" aria-label="Config du loop">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        </div>
      )}

      {/* Liste active */}
      {activeShown.length > 0 ? (
        <div className="space-y-1">
          {activeShown.map((t) => (
            <ThreadRow key={t.id} thread={t} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={filter === "all" ? "Aucune conversation active" : "Rien dans cette façade"}
          description="Tape en bas pour démarrer — décris un bug, une modif, une démo…"
          className="py-12"
        />
      )}

      {/* Archivées */}
      {archivedShown.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setArchivedOpen((o) => !o)}
            aria-expanded={archivedOpen}
            aria-controls="archived-list"
            className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              aria-hidden
              className={cn("h-4 w-4 transition-transform", archivedOpen && "rotate-90")}
            />
            Archivées · {archivedShown.length}
          </button>
          {archivedOpen && (
            <div id="archived-list" className="mt-1 space-y-1 opacity-70">
              {archivedShown.map((t) => (
                <ThreadRow key={t.id} thread={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
      )}
    >
      {children}
    </button>
  );
}
