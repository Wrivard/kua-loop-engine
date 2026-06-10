"use client";

import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/status-pill";
import { formatCost, timeAgo } from "@/lib/utils";
import type { RunRow } from "@/lib/types";

function externalHref(value: string | null): string | undefined {
  if (!value) return undefined;
  return value.startsWith("http") ? value : `https://${value}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

/** Drawer latéral : timeline + méta brute d'un run. Jamais requis pour approuver. */
export function RunDetailsDrawer({ run }: { run: RunRow }) {
  const cost = formatCost(run.cost_usd);
  return (
    <Dialog>
      <DialogTrigger className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        détails
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Détails du run</DialogTitle>
          <DialogDescription>{run.goal}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-2 flex items-center justify-between">
            <StatusPill status={run.status} />
            {cost && <span className="text-xs tabular-nums text-muted-foreground">{cost}</span>}
          </div>

          <div className="divide-y divide-border">
            <Row label="Créé">{timeAgo(run.created_at)}</Row>
            {run.started_at && <Row label="Démarré">{timeAgo(run.started_at)}</Row>}
            {run.finished_at && <Row label="Terminé">{timeAgo(run.finished_at)}</Row>}
            {run.iterations != null && <Row label="Itérations">{run.iterations}</Row>}
            {run.branch && (
              <Row label="Branche">
                <code className="font-mono text-xs">{run.branch}</code>
              </Row>
            )}
            {run.pr_url && (
              <Row label="PR">
                <a
                  href={externalHref(run.pr_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  voir <ExternalLink className="h-3 w-3" />
                </a>
              </Row>
            )}
            {run.preview_url && (
              <Row label="Aperçu">
                <a
                  href={externalHref(run.preview_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  ouvrir <ExternalLink className="h-3 w-3" />
                </a>
              </Row>
            )}
          </div>

          {run.summary && (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Résumé</p>
              <p className="text-sm leading-relaxed">{run.summary}</p>
            </div>
          )}

          {run.log_path && (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Log</p>
              <code className="block break-all rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
                {run.log_path}
              </code>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
