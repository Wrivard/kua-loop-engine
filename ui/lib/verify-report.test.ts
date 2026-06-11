import { describe, it, expect } from "vitest";
import { parseVerifyReport, verdictLabel } from "@/lib/verify-report";

describe("parseVerifyReport — forme structurée (gate DB)", () => {
  it("PASS : verdict + étapes depuis le stdout", () => {
    const r = parseVerifyReport({
      status: "passed",
      command: "npm run lint && npm run build",
      output: "$ npm run lint\nok\n$ npm run build\nok",
    });
    expect(r.verdict).toBe("PASS");
    expect(r.method).toBe("npm run lint && npm run build");
    expect(r.steps).toHaveLength(2);
    expect(r.steps.every((s) => s.ok === true)).toBe(true);
  });

  it("SKIP : aucune gate détectée", () => {
    const r = parseVerifyReport({ status: "skipped", command: null, output: "Aucune gate de vérif détectée." });
    expect(r.verdict).toBe("SKIP");
    expect(r.claim).toContain("Aucune gate");
  });

  it("FAIL : dernière étape en échec + findings", () => {
    const r = parseVerifyReport({
      status: "failed",
      command: "npm run build",
      output: "$ npm run build\nType error: boom",
    });
    expect(r.verdict).toBe("FAIL");
    expect(r.steps.at(-1)?.ok).toBe(false);
    expect(r.findings).toContain("Type error");
  });
});

describe("parseVerifyReport — rapport markdown (agent)", () => {
  it("PASS explicite + claim + étapes cochées", () => {
    const md = "## Verification\n**Verdict:** PASS\n**Claim:** The bug is fixed\n- ✅ reproduced\n- ✅ retested";
    const r = parseVerifyReport(md);
    expect(r.verdict).toBe("PASS");
    expect(r.claim).toBe("The bug is fixed");
    expect(r.steps.length).toBeGreaterThanOrEqual(2);
    expect(r.steps.every((s) => s.ok === true)).toBe(true);
  });

  it("FAIL via label", () => {
    expect(parseVerifyReport("**Verdict:** FAIL\nla compilation casse").verdict).toBe("FAIL");
  });

  it("SKIP via label", () => {
    expect(parseVerifyReport("Verdict: SKIP").verdict).toBe("SKIP");
  });
});

describe("parseVerifyReport — robustesse", () => {
  it("prose libre sans marqueur → fallback (verdict null, raw conservé)", () => {
    const r = parseVerifyReport("juste un paragraphe quelconque sans verdict");
    expect(r.verdict).toBeNull();
    expect(r.claim).toBeNull();
    expect(r.steps).toHaveLength(0);
    expect(r.raw).toContain("paragraphe");
  });

  it("null / vide / objet vide → fallback sûr", () => {
    expect(parseVerifyReport(null).verdict).toBeNull();
    expect(parseVerifyReport("").raw).toBe("");
    expect(parseVerifyReport({ status: null, command: null, output: null }).verdict).toBeNull();
  });
});

describe("verdictLabel", () => {
  it("libellés FR", () => {
    expect(verdictLabel("PASS")).toBe("Vérifié");
    expect(verdictLabel("FAIL")).toBe("Échec de vérif");
    expect(verdictLabel("SKIP")).toBe("Non vérifié");
    expect(verdictLabel(null)).toBe("Vérification");
  });
});
