"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VerdictCard } from "@/components/verdict-card";
import { CostBadge } from "@/components/ui/chips";
import { useToast } from "@/components/ui/toast";
import { insertApproval } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { Markdown } from "@/lib/markdown";
import { reconcileVerify } from "@/lib/verify-reconcile";
import { cn } from "@/lib/utils";
import type { ApprovalDecision, PrDetail, PrFile } from "@/lib/types";

/** Diff lisible : fond code distinct, +/− en sémantique SOURDE (fond teinté pleine
 *  ligne + texte saturé), hunks en info — jamais d'aplats criards. */
function DiffLines({ patch }: { patch: string }) {
  return (
    <pre className="overflow-x-auto border-t border-border bg-muted/60 py-1.5 font-mono text-xs">
      {patch.split("\n").map((line, i) => {
        const cls =
          line.startsWith("+") && !line.startsWith("+++")
            ? "bg-success-soft text-success"
            : line.startsWith("-") && !line.startsWith("---")
              ? "bg-danger-soft text-danger"
              : line.startsWith("@@")
                ? "text-info"
                : "text-muted-foreground";
        return (
          <div key={i} className={cn("px-3 [overflow-wrap:anywhere]", cls)}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

function DiffFile({ file }: { file: PrFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-2 px-2.5 text-left text-xs transition-colors duration-150 hover:bg-accent"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono">{file.filename}</span>
        <span className="shrink-0 font-mono tabular-nums">
          <span className="text-success">+{file.additions ?? 0}</span>{" "}
          <span className="text-danger">−{file.deletions ?? 0}</span>
        </span>
      </button>
      {open && <DiffLines patch={file.patch || "(pas de patch)"} />}
    </div>
  );
}

/** Module de revue (AVANT→APRÈS) : diff, verdict réconcilié, coût, actions sur place.
 *  Plein écran mobile (drawer droite). `threadId` → lien secondaire « Ouvrir la loop ». */
export function PrReview({
  runId,
  threadId,
  trigger,
  onDecided,
}: {
  runId: string;
  threadId?: string;
  trigger: ReactNode;
  onDecided?: (d: ApprovalDecision) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PrDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [mode, setMode] = useState<"view" | "changes">("view");
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setNote(null);
    try {
      const r = await fetch(`/api/pr/${runId}`, { cache: "no-store" });
      const d = (await r.json()) as PrDetail;
      if (r.status === 503) setNote("Revue indisponible : la gateway n'est pas encore exposée (Cloudflare).");
      setData(d);
    } catch {
      setNote("Chargement de la revue échoué.");
    } finally {
      setLoading(false);
    }
  }

  async function decide(decision: ApprovalDecision, comment?: string) {
    setBusy(true);
    try {
      const who = await currentIdentity();
      await insertApproval(runId, decision, who, comment);
      onDecided?.(decision);
      setOpen(false);
      toast(
        decision === "approved" ? "Confirmé ✅" : decision === "redo" ? "Renvoyé avec feedback ↻" : "Rejeté",
        decision === "rejected" ? "default" : "success",
      );
    } catch {
      setNote("Décision échouée.");
      toast("Décision échouée", "error");
    } finally {
      setBusy(false);
    }
  }

  const run = data?.run;
  const pr = data?.pr;
  const reconciled = run ? reconcileVerify({ status: run.verify_status, command: run.verify_command, output: run.verify_output, summary: run.summary }) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !data) void load();
        if (!o) {
          setMode("view");
          setFeedback("");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent side="right" className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{pr?.title || "Revue de la livraison"}</DialogTitle>
          <DialogDescription>
            {pr ? (
              <span className="font-mono text-xs">
                <span className="text-success">+{pr.additions ?? 0}</span>{" "}
                <span className="text-danger">−{pr.deletions ?? 0}</span> · {pr.changed_files ?? 0} fichier(s) ·{" "}
                {pr.commits ?? 0} commit(s){pr.draft ? " · draft" : ""}
              </span>
            ) : (
              "Avant → après, vérif et coût avant d'approuver."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {loading && <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>}
          {note && <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">{note}</p>}

          {run && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CostBadge usd={run.cost_usd} />
              {pr?.html_url && (
                <a href={pr.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand">
                  ouvrir sur GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {reconciled?.body && (
            <div className="rounded-lg border border-border bg-card p-3">
              <Markdown>{reconciled.body}</Markdown>
            </div>
          )}
          {reconciled?.report && <VerdictCard report={reconciled.report} defaultOpen={reconciled.report.verdict === "FAIL"} />}

          {data?.truncated && <p className="text-xs text-warn">⚠️ Diff volumineux — tronqué pour l&apos;affichage.</p>}
          <div className="space-y-1.5">
            {(data?.files ?? []).map((f) => (
              <DiffFile key={f.filename} file={f} />
            ))}
            {data && !loading && (data.files ?? []).length === 0 && pr && (
              <p className="text-xs text-muted-foreground">Aucun fichier dans le diff.</p>
            )}
          </div>
        </div>

        {/* Actions sur place — mobile-first */}
        <div className="border-t border-border p-3">
          {mode === "view" ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {threadId && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/c/${threadId}`);
                  }}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:mr-auto"
                >
                  Ouvrir la loop →
                </button>
              )}
              {/* Hiérarchie : Confirmer primaire accent · Refaire secondaire · Rejeter tertiaire. */}
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void decide("rejected")}>
                Rejeter
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setMode("changes")}>
                Refaire avec nuance
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void decide("approved")}>
                {busy ? "…" : "Confirmer"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Qu'est-ce qui doit changer ? (le run repart avec ce feedback)"
                rows={2}
                aria-label="Feedback"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode("view")}>
                  Annuler
                </Button>
                <Button size="sm" disabled={busy || !feedback.trim()} onClick={() => void decide("redo", feedback.trim())}>
                  Renvoyer avec feedback
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
