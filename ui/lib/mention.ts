import { FACADE_ORDER, facadeLabel } from "@/lib/facade";

/** Logique PURE du @mention du composer (testable sans DOM).
 *  Cible un PROJET (ex: @alliance) ou une FAÇADE (ex: @bugfix). Les mentions de
 *  projet posent project_id ; les mentions de façade restent dans le message (le
 *  cerveau lit l'indice). */

export type MentionSuggestion = { kind: "project" | "facade"; value: string; label: string; sub: string };

type ProjectLite = { id: string; name: string };

/** Requête active pendant la frappe « @xxx » en fin de champ (null sinon). */
export function activeMentionQuery(input: string): string | null {
  const m = input.match(/(?:^|\s)@([\w-]*)$/);
  return m ? m[1] : null;
}

/** Suggestions d'autocomplete (projets matchés + façades), capées. */
export function buildSuggestions(query: string, projects: ProjectLite[]): MentionSuggestion[] {
  const q = query.toLowerCase();
  const projs = (projects ?? [])
    .filter((p) => !q || p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
    .slice(0, 5)
    .map((p) => ({ kind: "project" as const, value: p.id, label: p.name, sub: p.id }));
  const facs = FACADE_ORDER.filter((f) => !q || f.includes(q) || facadeLabel(f).toLowerCase().includes(q)).map((f) => ({
    kind: "facade" as const,
    value: f,
    label: facadeLabel(f),
    sub: f,
  }));
  return [...projs, ...facs].slice(0, 8);
}

/** Remplace la requête @ active par le token choisi + espace (préserve l'espace de tête). */
export function applyMention(input: string, token: string): string {
  return input.replace(/(?:^|\s)@([\w-]*)$/, (m) => {
    const lead = m.startsWith("@") ? "" : m[0];
    return `${lead}@${token} `;
  });
}

/** À l'envoi : extrait un @projet (→ project_id) et nettoie le message.
 *  Les @façade restent (indice pour le cerveau). fallbackProjectId = contexte de route. */
export function resolveProjectMention(
  input: string,
  projects: ProjectLite[],
  fallbackProjectId: string | null,
): { projectId: string | null; cleaned: string } {
  const tokens = [...input.matchAll(/(?:^|\s)@([\w-]+)/g)].map((m) => m[1]);
  let projectId = fallbackProjectId;
  let cleaned = input;
  for (const tok of tokens) {
    const p = (projects ?? []).find(
      (pr) => pr.id.toLowerCase() === tok.toLowerCase() || pr.name.toLowerCase() === tok.toLowerCase(),
    );
    if (p) {
      projectId = p.id;
      cleaned = cleaned.replace(new RegExp(`(?:^|\\s)@${tok}\\b`, "i"), " ");
    }
  }
  return { projectId, cleaned: cleaned.replace(/\s+/g, " ").trim() };
}
