/**
 * Parseur de rapport de vérification (présentation seulement). Pur → testé sans DOM.
 *
 * Deux sources possibles :
 *  1. Le gate de vérif du Runner (DB) : { status, command, output } où `output`
 *     est du stdout brut (`$ npm run lint\n…`). → verdict depuis `status`.
 *  2. Un rapport markdown produit par l'agent (« ## Verification / **Verdict:** PASS … »).
 *
 * Sortie structurée robuste ; rapport non reconnu → { verdict:null, … , raw } et le
 * `VerdictCard` retombe sur un rendu markdown brut. Aucune exception : entrée sale → fallback.
 */

export type Verdict = "PASS" | "SKIP" | "FAIL";

export type VerifyStep = { ok: boolean | null; text: string };

export type VerifyReport = {
  verdict: Verdict | null;
  claim: string | null;
  method: string | null;
  steps: VerifyStep[];
  findings: string | null;
  raw: string;
};

export type VerifyInput =
  | string
  | { status?: string | null; command?: string | null; output?: string | null }
  | null
  | undefined;

function verdictFromStatus(status: string): Verdict | null {
  const s = status.trim().toLowerCase();
  if (s === "passed" || s === "pass" || s === "ok" || s === "success") return "PASS";
  if (s === "skipped" || s === "skip" || s === "none") return "SKIP";
  if (s === "failed" || s === "fail" || s === "error") return "FAIL";
  return null;
}

/** `**Label:** value` ou `Label: value` (1re occurrence, insensible à la casse). */
function labelValue(text: string, label: string): string | null {
  const re = new RegExp(`(?:^|\\n)\\s*\\*{0,2}${label}\\*{0,2}\\s*:\\s*(.+)`, "i");
  const m = text.match(re);
  return m ? m[1].trim().replace(/\*+$/, "").trim() || null : null;
}

function verdictFromText(text: string): Verdict | null {
  const explicit = labelValue(text, "verdict") ?? labelValue(text, "verd:?dict") ?? labelValue(text, "result");
  if (explicit) {
    const v = verdictFromStatus(explicit);
    if (v) return v;
    if (/\bpass/i.test(explicit) || explicit.includes("✅")) return "PASS";
    if (/\bfail|\berror/i.test(explicit) || explicit.includes("❌")) return "FAIL";
    if (/\bskip/i.test(explicit)) return "SKIP";
  }
  // sinon : mots-clés globaux (FAIL prioritaire — un échec quelque part = échec).
  if (/\b(fail|failed|error|❌|✗)\b/i.test(text)) return "FAIL";
  if (/\b(pass|passed|success|✅|✓)\b/i.test(text)) return "PASS";
  if (/\b(skip|skipped)\b/i.test(text)) return "SKIP";
  return null;
}

function stepsFromText(text: string): VerifyStep[] {
  const steps: VerifyStep[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // puces markdown ou lignes commençant par un marqueur de statut
    const m = line.match(/^(?:[-*]\s+|\d+\.\s+)?(✅|❌|✓|✗|☑|☐)?\s*(.+)$/);
    if (!m) continue;
    const isListish = /^([-*]\s+|\d+\.\s+)/.test(line) || /^(✅|❌|✓|✗|☑|☐)/.test(line);
    if (!isListish) continue;
    const mark = m[1];
    const body = m[2].trim();
    if (!body) continue;
    const ok = mark === "✅" || mark === "✓" || mark === "☑" ? true : mark === "❌" || mark === "✗" ? false : null;
    steps.push({ ok, text: body });
  }
  return steps;
}

/** Découpe le stdout du gate (`$ cmd\n…`) en étapes ; la dernière est l'échec si FAIL. */
function stepsFromGateOutput(output: string, verdict: Verdict | null): VerifyStep[] {
  const cmds: string[] = [];
  for (const line of output.split("\n")) {
    const m = line.match(/^\$\s+(.+)$/);
    if (m) cmds.push(m[1].trim());
  }
  return cmds.map((c, i) => ({
    ok: verdict === "FAIL" ? i < cmds.length - 1 : true,
    text: c,
  }));
}

function firstHeadingOrLine(text: string): string | null {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) return h[1].trim() || null;
    return line.replace(/^\*+|\*+$/g, "").trim() || null;
  }
  return null;
}

const EMPTY = (raw: string): VerifyReport => ({
  verdict: null,
  claim: null,
  method: null,
  steps: [],
  findings: null,
  raw,
});

export function parseVerifyReport(input: VerifyInput): VerifyReport {
  if (input == null) return EMPTY("");

  // 1) Forme structurée du gate (DB).
  if (typeof input === "object") {
    const status = (input.status ?? "").toString();
    const command = input.command ?? null;
    const output = (input.output ?? "").toString();
    const verdict = verdictFromStatus(status);
    if (verdict || command || output) {
      const steps = output ? stepsFromGateOutput(output, verdict) : [];
      const findings =
        verdict === "FAIL" && output ? output.slice(-1200).trim() : verdict === "SKIP" ? output.trim() || null : null;
      return {
        verdict,
        claim: command ? `Commande : ${command}` : verdict === "SKIP" ? "Aucune gate de vérif détectée" : null,
        method: command,
        steps,
        findings: findings || null,
        raw: output,
      };
    }
    return EMPTY(output);
  }

  // 2) Texte / markdown.
  const text = input.toString();
  if (!text.trim()) return EMPTY(text);

  const verdict = verdictFromText(text);
  const claim = labelValue(text, "claim") ?? labelValue(text, "what") ?? firstHeadingOrLine(text);
  const method = labelValue(text, "method") ?? labelValue(text, "how") ?? labelValue(text, "command");
  const steps = stepsFromText(text);
  const findings = labelValue(text, "findings") ?? labelValue(text, "notes") ?? null;

  // Rien de reconnu → fallback markdown brut.
  if (!verdict && !claim && steps.length === 0) return EMPTY(text);

  return { verdict, claim, method, steps, findings, raw: text };
}

export function verdictLabel(v: Verdict | null): string {
  if (v === "PASS") return "Vérifié";
  if (v === "FAIL") return "Échec de vérif";
  if (v === "SKIP") return "Non vérifié";
  return "Vérification";
}
