"use client";

import { useState } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import { ApprovalActions } from "@/components/approval-actions";
import { RunDetailsDrawer } from "@/components/run-details-drawer";
import { formatCost } from "@/lib/utils";
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
      <div className="flex min-h-[72px] items-center justify-center p-3 text-center">
        {children}
      </div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * Carte d'un message-run dans une conversation (doc 12) : Demandé / Fait,
 * avant-après, boutons Oui/Refaire, méta (coût · détails). Le statut est mis à
 * jour en optimiste après une décision.
 */
export function RunCard({
  run,
  onDecided,
}: {
  run: RunRow;
  onDecided?: (decision: ApprovalDecision) => void;
}) {
  const [status, setStatus] = useState<RunStatus>(run.status);
  const cost = formatCost(run.cost_usd);
  const preview = externalHref(run.preview_url);
  const pr = externalHref(run.pr_url);
  const awaiting = status === "awaiting_approval";

  function handleDecided(decision: ApprovalDecision) {
    setStatus(decision === "approved" ? "approved" : "rejected");
    onDecided?.(decision);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <p className="text-sm font-medium leading-tight">{run.goal}</p>
        <StatusPill status={status} className="shrink-0" />
      </div>

      <div className="space-y-3 px-4 pb-4">
        {run.summary && <Line label="Fait">{run.summary}</Line>}

        {preview && (
          <div className="grid grid-cols-2 gap-3">
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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className={cn("flex items-center gap-3", !awaiting && "min-h-[2rem]")}>
            {awaiting ? (
              <ApprovalActions runId={run.id} onDecided={handleDecided} />
            ) : (
              <StatusNote status={status} />
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {pr && (
              <a
                href={pr}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
              >
                <GitPullRequest className="h-3.5 w-3.5" /> PR
              </a>
            )}
            {cost && <span className="tabular-nums">{cost}</span>}
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
    return <span className="text-xs text-muted-foreground">L&apos;agent travaille…</span>;
  }
  return null;
}
