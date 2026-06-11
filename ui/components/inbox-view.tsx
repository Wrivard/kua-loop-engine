"use client";

import { useState } from "react";
import { Inbox as InboxIcon } from "lucide-react";
import { InboxAwaitingCard } from "@/components/inbox-awaiting-card";
import { ProposalInboxCard } from "@/components/proposal-inbox-card";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveQuery } from "@/lib/use-live-query";
import { getInboxGroups, getPendingProposals } from "@/lib/queries";
import type { InboxGroup, Proposal } from "@/lib/types";

/** Inbox (doc 12) : toutes les conversations à confirmer, groupées par projet.
 *  Décision inline → on retire la conversation (inbox zéro). Realtime réconcilie. */
export function InboxView() {
  const { data, loading, error, refetch } = useLiveQuery<InboxGroup[]>(
    getInboxGroups,
    ["threads", "runs", "approvals", "projects"],
    [],
  );
  const { data: proposals } = useLiveQuery<Proposal[]>(getPendingProposals, ["proposals"], []);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [propDone, setPropDone] = useState<Set<string>>(new Set());

  const pendingProps = (proposals ?? []).filter((p) => !propDone.has(p.id));

  const groups = (data ?? [])
    .map((g) => ({ ...g, threads: g.threads.filter((t) => !dismissed.has(t.id)) }))
    .filter((g) => g.threads.length > 0);
  const total = groups.reduce((sum, g) => sum + g.threads.length, 0);

  function dismiss(threadId: string) {
    setDismissed((prev) => new Set(prev).add(threadId));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        {total + pendingProps.length > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {total + pendingProps.length} à confirmer
          </span>
        )}
      </div>

      {pendingProps.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Propositions
          </h2>
          <div className="space-y-2">
            {pendingProps.map((p) => (
              <ProposalInboxCard
                key={p.id}
                proposal={p}
                onResolved={() => setPropDone((s) => new Set(s).add(p.id))}
              />
            ))}
          </div>
        </section>
      )}

      {error && !data ? (
        <ErrorState message={error} onRetry={() => void refetch()} />
      ) : loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : groups.length === 0 && pendingProps.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="h-8 w-8" />}
          title="Rien à confirmer 🎉"
          description="Tout est traité. Tape en bas pour dispatcher une nouvelle tâche."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.project.id}>
              <div className="mb-2 flex items-center gap-2 px-1">
                {/* Libellé (pas un lien) : on agit DANS l'inbox ; sortie via « Ouvrir la loop ». */}
                <span className="text-sm font-medium tracking-tight">{g.project.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{g.threads.length}</span>
              </div>
              <div className="space-y-2">
                {g.threads.map((t) => (
                  <InboxAwaitingCard
                    key={t.id}
                    thread={t}
                    projectName={g.project.name}
                    onResolved={() => dismiss(t.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
