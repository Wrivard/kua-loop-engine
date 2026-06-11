import { describe, it, expect } from "vitest";
import { inboxDetailModel, deriveInboxListState } from "@/lib/inbox-state";
import type { AgentProposal, Proposal } from "@/lib/types";

function prop(payload: Partial<AgentProposal>, extra: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    source: "cron",
    project_id: null,
    status: "pending",
    created_at: "2026-06-11T00:00:00Z",
    payload: {
      action: "create_thread",
      facade: "bugfix",
      loop_id: null,
      title: "Titre",
      goal: "fais X",
      budget_usd: 0.4,
      priority: "normal",
      questions_manquantes: [],
      resume_humain: "",
      ...payload,
    },
    ...extra,
  };
}

describe("inboxDetailModel", () => {
  it("create_thread sans projet → besoin d'un projet, confirmation rapide bloquée", () => {
    const m = inboxDetailModel(prop({ action: "create_thread" }));
    expect(m.needsProject).toBe(true);
    expect(m.canQuickConfirm).toBe(false);
    expect(m.showGoal).toBe(true);
    expect(m.actionLabel).toBe("Lancer un thread");
  });

  it("create_thread AVEC projet → confirmation rapide possible", () => {
    const m = inboxDetailModel(prop({ action: "create_thread" }, { project_id: "kua-cobaye-test" }));
    expect(m.canQuickConfirm).toBe(true);
  });

  it("import_repo → pas de goal affiché, pas de projet requis", () => {
    const m = inboxDetailModel(prop({ action: "import_repo", repo: "Wrivard/x" }));
    expect(m.showGoal).toBe(false);
    expect(m.needsProject).toBe(false);
    expect(m.canQuickConfirm).toBe(true);
  });

  it("pause_loop → pas de goal", () => {
    expect(inboxDetailModel(prop({ action: "pause_loop" })).showGoal).toBe(false);
  });

  it("aperçu en clair — jamais de markdown brut", () => {
    const m = inboxDetailModel(prop({ resume_humain: "## Bug\n\nLe **form** plante." }));
    expect(m.preview).toBe("Bug Le form plante.");
    expect(m.preview).not.toContain("#");
    expect(m.preview).not.toContain("*");
  });
});

describe("deriveInboxListState", () => {
  it("chargement initial", () => {
    expect(deriveInboxListState({ loading: true, hasData: false, error: null, itemCount: 0 })).toBe("loading");
  });
  it("erreur sans données", () => {
    expect(deriveInboxListState({ loading: false, hasData: false, error: "boom", itemCount: 0 })).toBe("error");
  });
  it("vide", () => {
    expect(deriveInboxListState({ loading: false, hasData: true, error: null, itemCount: 0 })).toBe("empty");
  });
  it("contenu", () => {
    expect(deriveInboxListState({ loading: false, hasData: true, error: null, itemCount: 3 })).toBe("ready");
  });
  it("refetch en arrière-plan (données déjà là) ne repasse pas en loading", () => {
    expect(deriveInboxListState({ loading: true, hasData: true, error: null, itemCount: 2 })).toBe("ready");
  });
});
