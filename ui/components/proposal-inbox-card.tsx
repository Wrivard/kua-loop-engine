"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InboxDetail } from "@/components/inbox-detail";
import { FacadeDot } from "@/components/facade-mark";
import { SourceChip, CostBadge } from "@/components/ui/chips";
import { type ConfirmedProposal } from "@/components/proposal-card";
import { applyProposal } from "@/lib/apply-proposal";
import { getProjects, setProposalStatus } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { facadeLabel } from "@/lib/facade";
import { inboxDetailModel } from "@/lib/inbox-state";
import { cn, timeAgo } from "@/lib/utils";
import type { Project, Proposal } from "@/lib/types";

export function ProposalInboxCard({ proposal, onResolved }: { proposal: Proposal; onResolved?: () => void }) {
  const router = useRouter();
  const p = proposal.payload;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // Sortie animée (flow « vider l'inbox au pouce »).
  function resolve() {
    setLeaving(true);
    setTimeout(() => onResolved?.(), 180);
  }

  useEffect(() => {
    void getProjects().then(setProjects).catch(() => {});
  }, []);

  const { canQuickConfirm, preview } = inboxDetailModel(proposal);
  const projectName = projects.find((x) => x.id === proposal.project_id)?.name ?? null;

  async function done(cp: ConfirmedProposal) {
    setBusy(true);
    try {
      const res = await applyProposal(cp);
      await setProposalStatus(proposal.id, "approved", await currentIdentity());
      setOpen(false);
      resolve();
      if (res?.kind === "thread") router.push(`/c/${res.id}`);
      else if (res?.kind === "loop" || res?.kind === "project") router.push(`/p/${res.id}`);
    } catch {
      /* reste affiché */
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await setProposalStatus(proposal.id, "dismissed", await currentIdentity());
      setOpen(false);
      resolve();
    } finally {
      setBusy(false);
    }
  }

  function approveQuick() {
    // Sans projet résolu → ouvre le détail pour en choisir un (via Ajuster).
    if (!canQuickConfirm) {
      setOpen(true);
      return;
    }
    void done({ ...p, project_id: proposal.project_id ?? undefined });
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-border-strong",
        leaving && "animate-collapse-out",
      )}
    >
      <InboxDetail
        proposal={proposal}
        projects={projects}
        open={open}
        onOpenChange={setOpen}
        onConfirm={done}
        onReject={reject}
        busy={busy}
        trigger={
          <button type="button" className="flex w-full flex-col gap-1.5 p-3 text-left transition-colors hover:bg-accent/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FacadeDot facade={p.facade} />
              <span className="font-medium">{facadeLabel(p.facade)}</span>
              <SourceChip source={proposal.source} />
              {projectName && <span className="truncate">· {projectName}</span>}
              <span className="ml-auto shrink-0 tabular-nums">{timeAgo(proposal.created_at)}</span>
            </div>
            <p className="text-sm font-medium leading-snug">{p.title}</p>
            {preview && <p className="line-clamp-2 text-xs text-muted-foreground">{preview}</p>}
            <div className="flex items-center gap-2 pt-0.5">
              <CostBadge usd={p.budget_usd} />
              {p.priority === "high" && (
                <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                  prioritaire
                </span>
              )}
              <span className="ml-auto text-xs text-brand">détails →</span>
            </div>
          </button>
        }
      />
      <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void reject()}>
          Rejeter
        </Button>
        <Button size="sm" disabled={busy} onClick={approveQuick}>
          Confirmer
        </Button>
      </div>
    </div>
  );
}
