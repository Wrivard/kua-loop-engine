"use client";

import { useState, type ReactNode } from "react";
import { FolderGit2, GitBranch } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProposalCard, type ConfirmedProposal } from "@/components/proposal-card";
import { Expandable } from "@/components/expandable";
import { FacadeDot } from "@/components/facade-mark";
import { SourceChip, CostBadge } from "@/components/ui/chips";
import { Markdown } from "@/lib/markdown";
import { facadeLabel } from "@/lib/facade";
import { inboxDetailModel } from "@/lib/inbox-state";
import { cn, timeAgo } from "@/lib/utils";
import type { Project, Proposal } from "@/lib/types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{title}</p>
      {children}
    </div>
  );
}

/**
 * Module de détail d'une proposition (confirmation ÉCLAIRÉE) : on voit TOUT avant
 * de décider — pourquoi (résumé), ce qui sera fait (instruction), où (projet/repo),
 * coût, façade, questions ouvertes. Plein écran sur mobile (drawer droite).
 * Boutons : Confirmer (vert) · Ajuster (édite l'instruction) · Rejeter.
 */
export function InboxDetail({
  proposal,
  projects,
  trigger,
  open,
  onOpenChange,
  onConfirm,
  onReject,
  busy,
}: {
  proposal: Proposal;
  projects: Project[];
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (cp: ConfirmedProposal) => void | Promise<void>;
  onReject: () => void | Promise<void>;
  busy?: boolean;
}) {
  const p = proposal.payload;
  const [edit, setEdit] = useState(false);
  const projectName = projects.find((x) => x.id === proposal.project_id)?.name ?? proposal.project_id ?? null;
  const { actionLabel, needsProject, showGoal } = inboxDetailModel(proposal);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setEdit(false);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent side="right" className="w-full sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-6 text-xs text-muted-foreground">
            <FacadeDot facade={p.facade} />
            <span className="font-medium">{facadeLabel(p.facade)}</span>
            <SourceChip source={proposal.source} />
            <span className="ml-auto shrink-0">{timeAgo(proposal.created_at)}</span>
          </div>
          <DialogTitle className="text-base leading-snug">{p.title}</DialogTitle>
          <p className="text-xs font-medium uppercase tracking-wide text-brand">{actionLabel}</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {edit ? (
            <ProposalCard
              proposal={p}
              projects={projects}
              defaultProjectId={proposal.project_id ?? undefined}
              onConfirm={onConfirm}
              onAdjust={() => setEdit(false)}
              onCancel={() => setEdit(false)}
              busy={busy}
            />
          ) : (
            <>
              {p.resume_humain && (
                <Section title="Pourquoi">
                  <Markdown className="text-muted-foreground">{p.resume_humain}</Markdown>
                </Section>
              )}

              {showGoal && p.goal && (
                <Section title="Ce qui sera fait">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <Expandable collapsedHeight={160} fadeClass="from-muted/30">
                      <Markdown>{p.goal}</Markdown>
                    </Expandable>
                  </div>
                </Section>
              )}

              <Section title="Où">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {projectName ?? <span className="text-muted-foreground">projet à choisir</span>}
                  </span>
                  {p.repo && (
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <GitBranch className="h-3 w-3" />
                      {p.repo}
                    </span>
                  )}
                </div>
              </Section>

              <div className="flex flex-wrap items-center gap-2">
                <CostBadge usd={p.budget_usd} />
                <span className="text-xs text-muted-foreground">budget / run</span>
                {p.priority === "high" && (
                  <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                    prioritaire
                  </span>
                )}
              </div>

              {p.questions_manquantes?.length > 0 && (
                <div className="rounded-lg border border-warn/30 bg-warn-soft p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-warn">
                    À préciser
                  </p>
                  <ul className="space-y-1">
                    {p.questions_manquantes.map((q, i) => (
                      <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="mt-[0.4em] h-1 w-1 shrink-0 rounded-full bg-warn" aria-hidden />
                        <span className="min-w-0 flex-1">{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {!edit && (
          <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onReject()}>
              Rejeter
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setEdit(true)}>
              Ajuster
            </Button>
            <Button
              size="sm"
              disabled={busy || (needsProject && !proposal.project_id)}
              className={cn(!busy && "bg-brand text-brand-foreground hover:bg-brand/90")}
              onClick={() => void onConfirm({ ...p, project_id: proposal.project_id ?? undefined })}
            >
              {busy ? "…" : "Confirmer"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
