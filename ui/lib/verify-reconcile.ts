import { parseVerifyReport, type VerifyReport } from "@/lib/verify-report";

/**
 * Réconcilie le verdict de vérif en UN SEUL (fin de la contradiction). Le résumé
 * d'un run peut contenir une section « ## Verification / Verdict: … » écrite par
 * l'agent, EN PLUS du statut du gate. On extrait la section du résumé (→ `body`
 * nettoyé) et on choisit une source unique pour le verdict. Pur → testable.
 */

const VERIF_HEADING = /^#{1,6}\s*(verification|vérif|vérification|verify|tests?)\b/i;
const VERDICT_LINE = /^\*{0,2}\s*(verdict|résultat|result)\s*:?\s*\*{0,2}\s*:?/i;

/** Sépare le corps du résumé de sa section de vérif (si présente). */
export function splitSummaryVerification(summary: string | null | undefined): {
  body: string;
  verification: string | null;
} {
  const s = (summary ?? "").replace(/\r\n/g, "\n");
  if (!s.trim()) return { body: "", verification: null };
  const lines = s.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (VERIF_HEADING.test(t) || VERDICT_LINE.test(t)) {
      start = i;
      break;
    }
  }
  if (start === -1) return { body: s.trim(), verification: null };
  return {
    body: lines.slice(0, start).join("\n").trim(),
    verification: lines.slice(start).join("\n").trim(),
  };
}

/**
 * Verdict unique : gate définitif (passed/failed) prioritaire ; sinon la narration
 * de vérif du résumé (si présente) ; sinon le gate (skipped). Retourne aussi le
 * corps du résumé NETTOYÉ de sa section de vérif (pour « Fait »).
 */
export function reconcileVerify(args: {
  status?: string | null;
  command?: string | null;
  output?: string | null;
  summary?: string | null;
}): { body: string; report: VerifyReport | null } {
  const { body, verification } = splitSummaryVerification(args.summary);
  const gateStatus = (args.status ?? "").toLowerCase();
  const gateDefinitive = gateStatus === "passed" || gateStatus === "failed";
  const hasGate = !!(args.status || args.command || args.output);

  let report: VerifyReport | null = null;
  if (hasGate) {
    report =
      gateDefinitive || !verification
        ? parseVerifyReport({ status: args.status, command: args.command, output: args.output })
        : parseVerifyReport(verification); // gate skipped + narration agent → on préfère la narration
  } else if (verification) {
    report = parseVerifyReport(verification);
  }

  return { body: body || (args.summary ?? "").trim(), report };
}
