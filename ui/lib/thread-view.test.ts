import { describe, it, expect } from "vitest";
import { buildThreadView, isRunEcho } from "@/lib/thread-view";
import type { MessageWithRun, RunRow } from "@/lib/types";

function msg(role: string, content: string | null, id: string): MessageWithRun {
  return {
    id,
    thread_id: "t1",
    role: role as MessageWithRun["role"],
    author: null,
    content,
    run_id: null,
    created_at: "2026-06-11T10:00:00Z",
    run: null,
  } as MessageWithRun;
}
function run(id: string, created_at: string): RunRow {
  return { id, status: "awaiting_approval", goal: "g", created_at } as unknown as RunRow;
}

describe("isRunEcho", () => {
  it("détecte les échos machine COURTS d'un run", () => {
    expect(isRunEcho("Run lancé")).toBe(true);
    expect(isRunEcho("PR #4 ouverte")).toBe(true);
    expect(isRunEcho("Fait. PR : https://github.com/x/y/pull/4")).toBe(true);
    expect(isRunEcho("voir https://github.com/x/y/pull/9")).toBe(true);
  });
  it("ne reclasse PAS un vrai message d'agent", () => {
    expect(isRunEcho("Le formulaire plante car le champ email n'est pas validé.")).toBe(false);
    expect(isRunEcho("")).toBe(false);
    expect(isRunEcho("Fait — voici une longue explication détaillée de tout ce qui a été changé dans le code et pourquoi cela résout durablement le problème signalé.")).toBe(false);
  });
});

describe("buildThreadView", () => {
  it("groupe TOUS les runs sous UNE carte, replie les messages run, garde la conversation", () => {
    const messages = [
      msg("user", "le bug plante", "m1"),
      msg("agent", "Je regarde ça.", "m2"),
      msg("run", null, "m3"), // message-run → replié dans la carte
      msg("system", "PR ouverte", "m4"),
    ];
    const runs = [run("r2", "2026-06-11T12:00:00Z"), run("r1", "2026-06-11T10:00:00Z")];
    const view = buildThreadView(messages, runs);

    const cards = view.filter((i) => i.kind === "runcard");
    expect(cards).toHaveLength(1); // UNE seule carte
    if (cards[0].kind === "runcard") {
      expect(cards[0].runs.map((r) => r.id)).toEqual(["r1", "r2"]); // triée ascendant (versions)
    }
    expect(view.filter((i) => i.kind === "message")).toHaveLength(2); // user + agent
    expect(view.some((i) => i.kind === "event" && i.text === "PR ouverte")).toBe(true);
    expect(view[view.length - 1].kind).toBe("runcard"); // carte en dernier
  });

  it("pas de runs → pas de carte", () => {
    const view = buildThreadView([msg("user", "salut", "m1")], []);
    expect(view.some((i) => i.kind === "runcard")).toBe(false);
  });
});
