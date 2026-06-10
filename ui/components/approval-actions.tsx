"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { insertApproval } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { ApprovalDecision } from "@/lib/types";

/**
 * Boutons « ✓ Oui, confirmer » / « ↻ Refaire » (doc 12 : 90 % de l'usage).
 * Écrit dans `approvals` (decided_by = utilisateur courant) puis informe le
 * parent via onDecided (mise à jour optimiste : retirer de l'inbox, etc.).
 */
export function ApprovalActions({
  runId,
  size = "sm",
  className,
  onDecided,
}: {
  runId: string;
  size?: "sm" | "default";
  className?: string;
  onDecided?: (decision: ApprovalDecision) => void;
}) {
  const [pending, setPending] = useState<ApprovalDecision | null>(null);
  const [done, setDone] = useState<ApprovalDecision | null>(null);
  const [error, setError] = useState(false);

  async function decide(decision: ApprovalDecision) {
    if (pending || done) return;
    setPending(decision);
    setError(false);
    try {
      const who = await currentIdentity();
      await insertApproval(runId, decision, who);
      setDone(decision);
      onDecided?.(decision);
    } catch {
      setError(true);
    } finally {
      setPending(null);
    }
  }

  if (done) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium",
          done === "approved" ? "text-emerald-500" : "text-muted-foreground",
          className,
        )}
      >
        {done === "approved" ? (
          <>
            <Check className="h-3.5 w-3.5" /> Confirmé
          </>
        ) : (
          <>
            <RotateCcw className="h-3.5 w-3.5" /> Renvoyé à l&apos;agent
          </>
        )}
      </p>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button size={size} disabled={!!pending} onClick={() => decide("approved")}>
        <Check className="h-4 w-4" />
        {pending === "approved" ? (
          "…"
        ) : (
          <>
            <span className="sm:hidden">Confirmer</span>
            <span className="hidden sm:inline">Oui, confirmer</span>
          </>
        )}
      </Button>
      <Button
        size={size}
        variant="outline"
        disabled={!!pending}
        onClick={() => decide("redo")}
      >
        <RotateCcw className="h-4 w-4" />
        {pending === "redo" ? "…" : "Refaire"}
      </Button>
      {error && <span className="text-xs text-red-500">Échec — réessayer</span>}
    </div>
  );
}
