"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { facadeColor } from "@/lib/facade";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import type { AgentProposal, Project } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = {
  create_thread: "Nouveau thread",
  create_loop: "Nouveau loop",
  update_loop: "Modifier le loop",
  pause_loop: "Mettre en pause",
  resume_loop: "Reprendre",
  import_repo: "Importer un repo",
  none: "Rien à faire",
};

// Façades sélectionnables (clés système ; discord = « Modifs »).
const FACADES: { key: string; label: string }[] = [
  { key: "general", label: "Général" },
  { key: "bugfix", label: "Bugfix" },
  { key: "discord", label: "Modifs" },
  { key: "demo", label: "Démo" },
  { key: "finish", label: "Site" },
  { key: "seo", label: "SEO" },
];

export type ConfirmedProposal = AgentProposal & { project_id?: string };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ProposalCard({
  proposal,
  projects,
  defaultProjectId,
  onConfirm,
  onAdjust,
  onCancel,
  busy,
}: {
  proposal: AgentProposal;
  projects: Project[];
  defaultProjectId?: string;
  onConfirm: (p: ConfirmedProposal) => void;
  onAdjust: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [title, setTitle] = useState(proposal.title);
  const [goal, setGoal] = useState(proposal.goal);
  const [budget, setBudget] = useState(String(proposal.budget_usd));
  const [facade, setFacade] = useState(proposal.facade);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [repo, setRepo] = useState(proposal.repo ?? "");

  if (proposal.action === "none") {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-muted-foreground">
        {proposal.resume_humain ? (
          <Markdown className="text-muted-foreground">{proposal.resume_humain}</Markdown>
        ) : (
          <p className="text-sm">Rien à faire pour l&apos;instant.</p>
        )}
      </div>
    );
  }

  const isImport = proposal.action === "import_repo";
  const needsProject = proposal.action === "create_thread" || proposal.action === "create_loop";
  const showGoal = !isImport && proposal.action !== "pause_loop" && proposal.action !== "resume_loop";
  const canConfirm =
    !busy && title.trim().length > 0 && (!needsProject || !!projectId) && (!isImport || !!repo.trim());

  function confirm() {
    onConfirm({
      ...proposal,
      title: title.trim(),
      goal,
      facade,
      repo: repo.trim(),
      budget_usd: Number(budget) || proposal.budget_usd,
      project_id: projectId || undefined,
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: facadeColor(facade) }} />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {ACTION_LABEL[proposal.action] ?? proposal.action}
        </span>
        {proposal.priority === "high" && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">prioritaire</span>
        )}
      </div>
      {proposal.resume_humain && <Markdown className="text-muted-foreground">{proposal.resume_humain}</Markdown>}

      <div className="space-y-2.5">
        <Field label="Titre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre" />
        </Field>

        {isImport && (
          <Field label="Repo GitHub (owner/nom ou URL)">
            <Input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="Wrivard/mon-repo"
              aria-label="Repo"
              className="font-mono text-xs"
            />
          </Field>
        )}

        {needsProject && (
          <Field label="Projet">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Projet"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— choisir un projet —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Façade">
          <div className="flex flex-wrap gap-1">
            {FACADES.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFacade(f.key)}
                aria-pressed={facade === f.key}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  facade === f.key ? "border-foreground bg-accent" : "border-border text-muted-foreground hover:bg-accent/50",
                )}
                style={facade === f.key ? { color: facadeColor(f.key) } : undefined}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Field>

        {showGoal && (
          <Field label="Goal (exécutable)">
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={4} aria-label="Goal" />
          </Field>
        )}

        <Field label="Budget par run ($)">
          <Input
            type="number"
            min="0.1"
            step="0.5"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            aria-label="Budget"
            className="w-28"
          />
        </Field>

        <p className="text-[11px] text-muted-foreground">
          Autonomie : <strong>approve_final</strong> (le mode auto n'est pas encore activable). Tu confirmes chaque livraison.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
        <Button variant="outline" size="sm" onClick={onAdjust} disabled={busy}>
          Ajuster
        </Button>
        <Button size="sm" onClick={confirm} disabled={!canConfirm}>
          {busy
            ? "…"
            : isImport
              ? "Importer"
              : proposal.action === "create_loop"
                ? "Créer le loop"
                : proposal.action === "create_thread"
                  ? "Lancer"
                  : "Appliquer"}
        </Button>
      </div>
    </div>
  );
}
