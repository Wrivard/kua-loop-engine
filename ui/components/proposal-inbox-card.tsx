"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProposalCard, type ConfirmedProposal } from "@/components/proposal-card";
import { applyProposal } from "@/lib/apply-proposal";
import { getProjects, setProposalStatus } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { facadeColor, facadeLabel } from "@/lib/facade";
import type { Project, Proposal } from "@/lib/types";

const SOURCE_LABEL: Record<string, string> = {
  chat: "Chat",
  discord: "Discord",
  sentry: "Sentry",
  cron: "Cron",
  webhook: "Webhook",
};

export function ProposalInboxCard({ proposal, onResolved }: { proposal: Proposal; onResolved?: () => void }) {
  const router = useRouter();
  const p = proposal.payload;
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (edit) void getProjects().then(setProjects).catch(() => {});
  }, [edit]);

  async function done(cp: ConfirmedProposal) {
    setBusy(true);
    try {
      const res = await applyProposal(cp);
      await setProposalStatus(proposal.id, "approved", await currentIdentity());
      onResolved?.();
      if (res?.kind === "thread") router.push(`/c/${res.id}`);
      else if (res?.kind === "loop" || res?.kind === "project") router.push(`/p/${res.id}`);
    } catch {
      /* reste affiché */
    } finally {
      setBusy(false);
    }
  }

  async function approveQuick() {
    if (!proposal.project_id) {
      setEdit(true); // pas de projet résolu → ouvrir l'édition pour en choisir un
      return;
    }
    await done({ ...p, project_id: proposal.project_id });
  }

  async function reject() {
    setBusy(true);
    try {
      await setProposalStatus(proposal.id, "dismissed", await currentIdentity());
      onResolved?.();
    } finally {
      setBusy(false);
    }
  }

  if (edit) {
    return (
      <ProposalCard
        proposal={p}
        projects={projects}
        defaultProjectId={proposal.project_id ?? undefined}
        onConfirm={done}
        onAdjust={() => setEdit(false)}
        onCancel={() => setEdit(false)}
        busy={busy}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: facadeColor(p.facade) }} />
        <span className="font-medium">{facadeLabel(p.facade)}</span>
        <span className="rounded-full bg-accent px-2 py-0.5">{SOURCE_LABEL[proposal.source] ?? proposal.source}</span>
        <span className="ml-auto tabular-nums">{p.budget_usd} $</span>
      </div>
      <p className="mt-1.5 text-sm font-medium">{p.title}</p>
      {p.resume_humain && <p className="mt-0.5 text-xs text-muted-foreground">{p.resume_humain}</p>}
      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void reject()}>
          Rejeter
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setEdit(true)}>
          Modifier
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void approveQuick()}>
          Approuver
        </Button>
      </div>
    </div>
  );
}
