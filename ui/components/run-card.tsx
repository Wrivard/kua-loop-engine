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
import { statusOf } from "@/lib/facade";
import { cn } from "@/lib/utils";
import type { ApprovalDecision, RunRow, RunStatus } from "@/lib/types";

function externalHref(value: string | null): string | undefined {
  if (!value) return undefined;
  return value.startsWith("http") ? value : `https://${value}`;
}

/** Cadre type « fenêtre » pour situer un aperçu (pas de capture réelle en MVP). */
function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex min-h-[72px] items-center justify-center p-3 text-center">{children}</div>
    </div>
  );
}

/**
 * Carte d'un message-run dans une conversation (doc 12) : Fait (markdown), rapport
 * de vérif (VerdictCard), avant-après, livrables (PR/branche/coût en chips),
 * boutons Revue/Confirmer/Refaire. Statut mis à jour en optimiste après décision.
 */
export function RunCard({
  run,
  onDecided,
}: {
  run: RunRow;
  onDecided?: (decision: ApprovalDecision) => void;
}) {
  const [decided, setDecided] = useState<RunStatus | null>(null);
  const status = decided ?? run.status;
  useEffect(() => {
    if (decided && (run.status === "approved" || run.status === "pushed" || run.status === "rejected")) {
      setDecided(null);
    }
  }, [run.status, decided]);

  const preview = externalHref(run.preview_url);
  const awaiting = status === "awaiting_approval";

  function handleDecided(decision: ApprovalDecision) {
    setDecided(decision === "approved" ? "approved" : "rejected");
    onDecided?.(decision);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <p className="text-sm font-medium leading-tight">{run.goal}</p>
        <StatusPill status={status} className="shrink-0" />
      </div>

      <div className="space-y-3 px-4 pb-4">
        {run.summary && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fait</p>
            <Expandable collapsedHeight={180} fadeClass="from-card">
              <Markdown>{run.summary}</Markdown>
            </Expandable>
          </div>
        )}

        {run.verify_status && (
          <VerdictCard
            input={{ status: run.verify_status, command: run.verify_command, output: run.verify_output }}
          />
        )}

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
          <div className={cn("flex items-center gap-2", !awaiting && "min-h-[2rem]")}>
            {awaiting ? (
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
            ) : (
              <StatusNote status={status} />
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

function StatusNote({ status }: { status: RunStatus }) {
  if (status === "approved" || status === "pushed") {
    return <span className="text-xs font-medium text-emerald-500">Confirmé</span>;
  }
  if (status === "rejected") {
    return <span className="text-xs font-medium text-muted-foreground">Renvoyé à l&apos;agent</span>;
  }
  if (status === "running" || status === "preparing" || status === "verifying") {
    return <span className="text-xs text-muted-foreground">Run · {statusOf(status).label}…</span>;
  }
  return null;
}
