import { plainText } from "@/lib/markdown-parse";
import type { Proposal } from "@/lib/types";

/** Logique PURE du module d'inbox (testable sans DOM). La présentation
 *  (InboxDetail / ProposalInboxCard / InboxView) consomme ces dérivations. */

export const ACTION_LABEL: Record<string, string> = {
  create_thread: "Lancer un thread",
  create_loop: "Créer un loop",
  update_loop: "Modifier le loop",
  pause_loop: "Mettre en pause",
  resume_loop: "Reprendre",
  import_repo: "Importer un repo",
  none: "Rien à faire",
};

export type InboxDetailModel = {
  actionLabel: string;
  needsProject: boolean;
  showGoal: boolean;
  /** Peut-on confirmer sans ouvrir l'éditeur (projet déjà résolu si requis) ? */
  canQuickConfirm: boolean;
  /** Aperçu en clair (jamais de markdown brut). */
  preview: string;
};

export function inboxDetailModel(proposal: Proposal): InboxDetailModel {
  const p = proposal.payload;
  const needsProject = p.action === "create_thread" || p.action === "create_loop";
  return {
    actionLabel: ACTION_LABEL[p.action] ?? p.action,
    needsProject,
    showGoal: p.action !== "pause_loop" && p.action !== "resume_loop" && p.action !== "import_repo",
    canQuickConfirm: !needsProject || !!proposal.project_id,
    preview: plainText(p.resume_humain || p.goal || ""),
  };
}

export type InboxListState = "loading" | "error" | "empty" | "ready";

/** État global de la liste d'inbox (skeleton / erreur / vide / contenu). */
export function deriveInboxListState(args: {
  loading: boolean;
  hasData: boolean;
  error: string | null;
  itemCount: number;
}): InboxListState {
  if (args.error && !args.hasData) return "error";
  if (args.loading && !args.hasData) return "loading";
  if (args.itemCount === 0) return "empty";
  return "ready";
}
