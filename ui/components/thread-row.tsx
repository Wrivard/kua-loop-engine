"use client";

import Link from "next/link";
import { FacadeIcon } from "@/components/facade-mark";
import { StatusPill } from "@/components/status-pill";
import { ApprovalActions } from "@/components/approval-actions";
import { Badge } from "@/components/ui/badge";
import { facadeColor, facadeLabel, THREAD_STATUS_LABEL } from "@/lib/facade";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ThreadListItem } from "@/lib/types";

/**
 * Une ligne de conversation (Inbox + vue projet). Liseré coloré = façade ;
 * pill = statut du run (canaux séparés, doc 12). Toute la ligne est cliquable
 * (→ conversation) via un Link en overlay ; les boutons inline restent au-dessus.
 */
export function ThreadRow({
  thread,
  showInlineApproval = false,
  onDecided,
}: {
  thread: ThreadListItem;
  showInlineApproval?: boolean;
  onDecided?: (threadId: string) => void;
}) {
  const run = thread.latest_run;
  const awaiting = thread.status === "awaiting_approval";
  const showActions = showInlineApproval && awaiting && run;

  return (
    <div className="group relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-transparent pl-4 pr-3 py-3 transition-colors hover:border-border hover:bg-accent/40">
      {/* Liseré façade */}
      <span
        aria-hidden
        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
        style={{ backgroundColor: facadeColor(thread.facade) }}
      />
      {/* Zone cliquable */}
      <Link href={`/c/${thread.id}`} className="absolute inset-0 z-0">
        <span className="sr-only">
          {facadeLabel(thread.facade)} — {thread.subject}
        </span>
      </Link>

      <FacadeIcon facade={thread.facade} className="pointer-events-none relative z-10" />

      <div className="pointer-events-none relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{thread.subject}</span>
        </div>
        {thread.last_message_preview && (
          <p className="truncate text-xs text-muted-foreground">{thread.last_message_preview}</p>
        )}
      </div>

      {showActions ? (
        <div className="relative z-10 flex w-full items-center gap-2 sm:w-auto sm:justify-end">
          <ApprovalActions runId={run!.id} onDecided={() => onDecided?.(thread.id)} />
        </div>
      ) : (
        <div className="relative z-10 flex shrink-0 items-center gap-3">
          {run ? (
            <StatusPill status={run.status} />
          ) : (
            <Badge className="bg-muted text-muted-foreground">
              {THREAD_STATUS_LABEL[thread.status]}
            </Badge>
          )}
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {timeAgo(thread.last_activity_at)}
          </span>
        </div>
      )}
    </div>
  );
}
