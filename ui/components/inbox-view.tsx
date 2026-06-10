"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox as InboxIcon } from "lucide-react";
import { ThreadRow } from "@/components/thread-row";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveQuery } from "@/lib/use-live-query";
import { getInboxGroups } from "@/lib/queries";
import type { InboxGroup } from "@/lib/types";

/** Inbox (doc 12) : toutes les conversations à confirmer, groupées par projet.
 *  Décision inline → on retire la conversation (inbox zéro). Realtime réconcilie. */
export function InboxView() {
  const { data, loading } = useLiveQuery<InboxGroup[]>(
    getInboxGroups,
    ["threads", "runs", "approvals", "projects"],
    [],
  );
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

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
        {total > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {total} à confirmer
          </span>
        )}
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="h-8 w-8" />}
          title="Rien à confirmer 🎉"
          description="Tout est traité. Les nouvelles conversations apparaîtront ici."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.project.id}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <Link
                  href={`/p/${g.project.id}`}
                  className="text-sm font-medium tracking-tight underline-offset-4 hover:underline"
                >
                  {g.project.name}
                </Link>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {g.threads.length}
                </span>
              </div>
              <div className="space-y-1">
                {g.threads.map((t) => (
                  <ThreadRow key={t.id} thread={t} showInlineApproval onDecided={dismiss} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
