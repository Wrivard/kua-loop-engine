import type { MessageWithRun, RunRow } from "@/lib/types";

/**
 * Construit le fil d'un thread selon la grammaire (UX-SPEC §7) : messages
 * user/agent (bulles), événements (lignes fines), et UNE SEULE carte de run qui
 * agrège tous les runs du thread (versions). Plus de N cartes, plus de bulles
 * d'annonce redondantes. Pur → testable.
 *
 * LIMITE : sans événements granulaires backend, on reclasse en « événement » les
 * messages agent COURTS qui ressemblent à un écho de run (PR ouverte, Fait, etc.).
 */

export type ThreadItem =
  | { kind: "message"; id: string; message: MessageWithRun }
  | { kind: "event"; id: string; text: string }
  | { kind: "runcard"; id: string; runs: RunRow[] };

const RUN_ECHO =
  /^(run\b|runs?\b|pr\s*#?\d|pr ouverte|pr\s*:|fait\b|fait\.|refait|refaire|nouvelle version|thread créé|branche\b|✅)/i;

/** Vrai si un message agent COURT est un écho machine d'un run (→ événement). */
export function isRunEcho(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t || t.length > 140) return false;
  return RUN_ECHO.test(t.toLowerCase()) || /github\.com\/[^\s]+\/pull\/\d+/.test(t);
}

export function buildThreadView(messages: MessageWithRun[], runs: RunRow[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  for (const m of messages ?? []) {
    if (m.role === "run") continue; // replié dans la carte unique
    const content = m.content ?? "";
    if (m.role === "system") {
      if (content.trim()) items.push({ kind: "event", id: m.id, text: content.trim() });
      continue;
    }
    if (m.role === "agent" && isRunEcho(content)) {
      items.push({ kind: "event", id: m.id, text: content.trim() });
      continue;
    }
    if (!content.trim()) continue;
    items.push({ kind: "message", id: m.id, message: m });
  }
  const list = runs ?? [];
  if (list.length) {
    const sorted = [...list].sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    );
    items.push({ kind: "runcard", id: `runcard-${sorted[sorted.length - 1].id}`, runs: sorted });
  }
  return items;
}
