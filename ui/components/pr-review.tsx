"use client";

import { useState, type ReactNode } from "react";
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
import { insertApproval } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { Markdown } from "@/lib/markdown";
import type { ApprovalDecision, PrDetail, PrFile } from "@/lib/types";

function DiffLines({ patch }: { patch: string }) {
  return (
    <pre className="overflow-x-auto bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
      {patch.split("\n").map((line, i) => {
        const c = line.startsWith("+") && !line.startsWith("+++")
          ? "text-emerald-500"
          : line.startsWith("-") && !line.startsWith("---")
            ? "text-red-500"
            : line.startsWith("@@")
              ? "text-sky-500"
              : "text-muted-foreground";
        return (
          <div key={i} className={c}>
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
    <div className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-accent/50"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate font-mono">{file.filename}</span>
        <span className="shrink-0 font-mono text-[10px]">
          <span className="text-emerald-500">+{file.additions ?? 0}</span>{" "}
          <span className="text-red-500">−{file.deletions ?? 0}</span>
        </span>
      </button>
      {open && <DiffLines patch={file.patch || "(pas de patch)"} />}
    </div>
  );
}

export function PrReview({
  runId,
  trigger,
  onDecided,
}: {
  runId: string;
  trigger: ReactNode;
  onDecided?: (d: ApprovalDecision) => void;
}) {
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
      if (r.status === 503) {
        setNote("Revue indisponible : la gateway n'est pas encore exposée (Cloudflare).");
      }
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
    } catch {
      setNote("Décision échouée.");
    } finally {
      setBusy(false);
    }
  }

  const run = data?.run;
  const pr = data?.pr;

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
      <DialogContent side="center" className="flex max-h-[90vh] flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{pr?.title || "Revue de la PR"}</DialogTitle>
          <DialogDescription>
            {pr ? (
              <span className="font-mono text-xs">
                <span className="text-emerald-500">+{pr.additions ?? 0}</span>{" "}
                <span className="text-red-500">−{pr.deletions ?? 0}</span> · {pr.changed_files ?? 0} fichier(s) ·{" "}
                {pr.commits ?? 0} commit(s){pr.draft ? " · draft" : ""}
              </span>
            ) : (
              "Diff, vérif et coût avant d'approuver."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
          {loading && <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>}
          {note && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-500">{note}</p>}

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

          {run?.summary && (
            <div className="rounded-lg border border-border bg-card p-3">
              <Markdown>{run.summary}</Markdown>
            </div>
          )}

          {run?.verify_status && (
            <VerdictCard
              input={{ status: run.verify_status, command: run.verify_command, output: run.verify_output }}
              defaultOpen={run.verify_status === "failed"}
            />
          )}

          {data?.truncated && (
            <p className="text-[11px] text-amber-500">⚠️ Diff volumineux — tronqué pour l'affichage.</p>
          )}
          <div className="space-y-1.5">
            {(data?.files ?? []).map((f) => (
              <DiffFile key={f.filename} file={f} />
            ))}
            {data && !loading && (data.files ?? []).length === 0 && pr && (
              <p className="text-xs text-muted-foreground">Aucun fichier dans le diff.</p>
            )}
          </div>
        </div>

        {/* Actions — mobile-first (boutons pleine largeur en bas) */}
        <div className="border-t border-border p-3">
          {mode === "view" ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode("changes")}>
                Demander des changements
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void decide("rejected")}>
                Rejeter
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void decide("approved")}>
                {busy ? "…" : "Approuver (merge)"}
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
                <Button
                  size="sm"
                  disabled={busy || !feedback.trim()}
                  onClick={() => void decide("redo", feedback.trim())}
                >
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
