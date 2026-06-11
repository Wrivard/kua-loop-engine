"use client";

import { useState } from "react";
import { GitPullRequest } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrReview } from "@/components/pr-review";
import { FacadeDot } from "@/components/facade-mark";
import { StatusBadge, CostBadge } from "@/components/ui/chips";
import { useToast } from "@/components/ui/toast";
import { insertApproval } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { facadeLabel } from "@/lib/facade";
import { cn, timeAgo } from "@/lib/utils";
import type { ThreadListItem } from "@/lib/types";

/** Livraison à confirmer, dans l'inbox : tap → module de revue (avant→après) SUR PLACE
 *  (on ne quitte pas l'inbox) ; quick Confirmer/Rejeter au pied ; « Ouvrir la loop » dans le module. */
export function InboxAwaitingCard({
  thread,
  projectName,
  onResolved,
}: {
  thread: ThreadListItem;
  projectName?: string;
  onResolved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const run = thread.latest_run;

  // Sortie animée : la carte se replie, puis l'item suivant remonte (flow au pouce).
  function resolve() {
    setLeaving(true);
    setTimeout(onResolved, 180);
  }

  async function decide(decision: "approved" | "rejected") {
    if (!run) return;
    setBusy(true);
    try {
      const who = await currentIdentity();
      await insertApproval(run.id, decision, who);
      toast(decision === "approved" ? "Confirmé ✅" : "Rejeté", decision === "approved" ? "success" : "default");
      resolve();
    } catch {
      toast("Action échouée", "error");
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FacadeDot facade={thread.facade} />
        <span className="font-medium">{facadeLabel(thread.facade)}</span>
        {projectName && <span className="truncate">· {projectName}</span>}
        <span className="ml-auto shrink-0 tabular-nums">{timeAgo(thread.last_activity_at)}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug">{thread.subject}</p>
      {thread.last_message_preview && (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{thread.last_message_preview}</p>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        {run && <StatusBadge status={run.status} />}
        <CostBadge usd={run?.cost_usd} />
        {run?.pr_url && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-brand">
            <GitPullRequest className="h-3.5 w-3.5" strokeWidth={1.75} /> revue →
          </span>
        )}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-border-strong",
        leaving && "animate-collapse-out",
      )}
    >
      {run?.pr_url ? (
        <PrReview
          runId={run.id}
          threadId={thread.id}
          onDecided={resolve}
          trigger={
            <button type="button" className="block w-full p-3 text-left transition-colors hover:bg-accent/30">
              {content}
            </button>
          }
        />
      ) : (
        <div className="p-3">{content}</div>
      )}
      <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
        <Button variant="ghost" size="sm" disabled={busy || !run} onClick={() => void decide("rejected")}>
          Rejeter
        </Button>
        <Button size="sm" disabled={busy || !run} onClick={() => void decide("approved")}>
          Confirmer
        </Button>
      </div>
    </div>
  );
}
