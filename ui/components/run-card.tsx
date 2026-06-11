"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import { ApprovalActions } from "@/components/approval-actions";
import { PrReview } from "@/components/pr-review";
import { RunDetailsDrawer } from "@/components/run-details-drawer";
import { VerdictCard } from "@/components/verdict-card";
import { Expandable } from "@/components/expandable";
import { PrLink, CostBadge, BranchChip } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/lib/markdown";
import { latestRun } from "@/lib/run-state";
import { reconcileVerify } from "@/lib/verify-reconcile";
import { cn } from "@/lib/utils";
import type { ApprovalDecision, RunRow, RunStatus } from "@/lib/types";

function externalHref(value: string | null): string | undefined {
  if (!value) return undefined;
  return value.startsWith("http") ? value : `https://${value}`;
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="flex min-h-[72px] items-center justify-center p-3 text-center">{children}</div>
    </div>
  );
}

/**
 * UNE carte par thread qui ÉVOLUE (UX-SPEC §4) : agrège tous les runs comme
 * versions (v1 repliée, dernière active). Verdict réconcilié en UNE ligne, chips,
 * actions au pied. `runs` est trié ascendant par buildThreadView.
 */
export function RunCard({ runs, onDecided }: { runs: RunRow[]; onDecided?: (decision: ApprovalDecision) => void }) {
  const active = latestRun(runs) ?? runs[runs.length - 1];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const run = runs.find((r) => r.id === selectedId) ?? active;
  const isActive = run.id === active.id;

  const [decided, setDecided] = useState<RunStatus | null>(null);
  const status = isActive && decided ? decided : run.status;
  useEffect(() => {
    if (decided && (active.status === "approved" || active.status === "pushed" || active.status === "rejected")) {
      setDecided(null);
    }
  }, [active.status, decided]);

  const awaiting = status === "awaiting_approval";
  const { body, report } = reconcileVerify({
    status: run.verify_status,
    command: run.verify_command,
    output: run.verify_output,
    summary: run.summary,
  });
  const preview = externalHref(run.preview_url);
  const versions = runs.length;

  function handleDecided(decision: ApprovalDecision) {
    setDecided(decision === "approved" ? "approved" : "rejected");
    onDecided?.(decision);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 pb-2.5">
        <p className="text-sm font-medium leading-tight">{run.goal}</p>
        <StatusPill status={status} className="shrink-0" />
      </div>

      {versions > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 text-[11px] text-muted-foreground">
          <span>refait {versions - 1}×</span>
          {runs.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              aria-pressed={r.id === run.id}
              className={cn(
                "rounded px-1.5 py-0.5 tabular-nums transition-colors",
                r.id === run.id ? "bg-accent font-medium text-foreground" : "hover:bg-accent/50",
              )}
            >
              v{i + 1}
            </button>
          ))}
          {!isActive && <span className="text-amber-500">version précédente</span>}
        </div>
      )}

      <div className="space-y-3 px-4 pb-4">
        {body && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fait</p>
            <Expandable collapsedHeight={180} fadeClass="from-card">
              <Markdown>{body}</Markdown>
            </Expandable>
          </div>
        )}

        {report && <VerdictCard report={report} defaultOpen={report.verdict === "FAIL"} />}

        {preview && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Frame label="Avant">
              <span className="text-xs text-muted-foreground">Site en production</span>
            </Frame>
            <Frame label="Après">
              <a
                href={preview}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline"
              >
                Ouvrir l&apos;aperçu <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Frame>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            {isActive && awaiting && (
              <>
                {run.pr_url && (
                  <PrReview
                    runId={run.id}
                    onDecided={handleDecided}
                    trigger={
                      <Button size="sm" variant="outline">
                        <GitPullRequest className="h-4 w-4" />
                        Revue
                      </Button>
                    }
                  />
                )}
                <ApprovalActions runId={run.id} onDecided={handleDecided} />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <PrLink url={run.pr_url} />
            <BranchChip branch={run.branch} className="max-w-[10rem]" />
            <CostBadge usd={run.cost_usd} />
            <RunDetailsDrawer run={run} />
          </div>
        </div>
      </div>
    </Card>
  );
}
