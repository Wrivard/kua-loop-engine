import { describe, it, expect } from "vitest";
import { splitSummaryVerification, reconcileVerify } from "@/lib/verify-reconcile";

describe("splitSummaryVerification", () => {
  it("sépare la section de vérif du corps", () => {
    const s = "J'ai corrigé le formulaire.\n\n## Verification\n**Verdict:** PASS\n- ✅ testé";
    const { body, verification } = splitSummaryVerification(s);
    expect(body).toBe("J'ai corrigé le formulaire.");
    expect(verification).toContain("Verdict");
  });
  it("pas de section vérif → tout est corps", () => {
    const { body, verification } = splitSummaryVerification("Juste un résumé.");
    expect(body).toBe("Juste un résumé.");
    expect(verification).toBeNull();
  });
});

describe("reconcileVerify — UN seul verdict, jamais contradictoire", () => {
  it("gate définitif (passed) prioritaire ; corps nettoyé de la vérif", () => {
    const { body, report } = reconcileVerify({
      status: "passed",
      command: "npm run build",
      output: "$ npm run build\nok",
      summary: "Corrigé.\n\n## Verification\n**Verdict:** PASS",
    });
    expect(report?.verdict).toBe("PASS");
    expect(body).toBe("Corrigé."); // la narration n'est PAS dupliquée dans le corps
  });

  it("gate skipped + narration agent → on PRÉFÈRE la narration (fin de la contradiction)", () => {
    const { report } = reconcileVerify({
      status: "skipped",
      command: null,
      output: "Aucune gate détectée.",
      summary: "Fait.\n\n**Verdict:** PASS\n**Claim:** vérifié à la main",
    });
    expect(report?.verdict).toBe("PASS"); // PAS « Non vérifié » contradictoire
  });

  it("gate skipped sans narration → SKIP", () => {
    const { report } = reconcileVerify({ status: "skipped", command: null, output: "Aucune gate.", summary: "Fait." });
    expect(report?.verdict).toBe("SKIP");
  });

  it("ni gate ni narration → pas de carte de verdict", () => {
    const { report } = reconcileVerify({ summary: "Juste un résumé sans vérif." });
    expect(report).toBeNull();
  });
});
