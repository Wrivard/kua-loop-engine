import { describe, it, expect } from "vitest";
import { activeMentionQuery, buildSuggestions, applyMention, resolveProjectMention } from "@/lib/mention";

const PROJECTS = [
  { id: "alliance", name: "Alliance" },
  { id: "kua-cobaye-test", name: "Cobaye" },
];

describe("activeMentionQuery", () => {
  it("détecte une mention en cours de frappe en fin de champ", () => {
    expect(activeMentionQuery("@al")).toBe("al");
    expect(activeMentionQuery("le bug @bug")).toBe("bug");
    expect(activeMentionQuery("@")).toBe("");
  });
  it("null si pas de mention active", () => {
    expect(activeMentionQuery("hello")).toBeNull();
    expect(activeMentionQuery("@bug ")).toBeNull(); // espace → mention terminée
    expect(activeMentionQuery("a@b.co")).toBeNull(); // email, pas une mention
  });
});

describe("buildSuggestions", () => {
  it("propose projets matchés + façades", () => {
    const s = buildSuggestions("all", PROJECTS);
    expect(s.some((x) => x.kind === "project" && x.value === "alliance")).toBe(true);
  });
  it("matche une façade par clé/label", () => {
    const s = buildSuggestions("bug", PROJECTS);
    expect(s.some((x) => x.kind === "facade" && x.value === "bugfix")).toBe(true);
  });
});

describe("applyMention", () => {
  it("remplace la requête @ par le token + espace", () => {
    expect(applyMention("le bug @al", "alliance")).toBe("le bug @alliance ");
    expect(applyMention("@b", "bugfix")).toBe("@bugfix ");
  });
});

describe("resolveProjectMention", () => {
  it("extrait un @projet → project_id + message nettoyé", () => {
    const r = resolveProjectMention("@alliance le formulaire plante", PROJECTS, null);
    expect(r.projectId).toBe("alliance");
    expect(r.cleaned).toBe("le formulaire plante");
  });
  it("matche par nom aussi", () => {
    expect(resolveProjectMention("@Cobaye test", PROJECTS, null).projectId).toBe("kua-cobaye-test");
  });
  it("une @façade n'est PAS un projet (reste dans le message)", () => {
    const r = resolveProjectMention("@bugfix le bug", PROJECTS, null);
    expect(r.projectId).toBeNull();
    expect(r.cleaned).toContain("@bugfix");
  });
  it("garde le projet de contexte (fallback) sans mention", () => {
    expect(resolveProjectMention("juste une tâche", PROJECTS, "alliance").projectId).toBe("alliance");
  });
});
