import { describe, it, expect } from "vitest";
import { deriveRunState, isAwaiting, latestRun } from "@/lib/run-state";

describe("deriveRunState", () => {
  it("mappe les statuts vers l'état haut-niveau", () => {
    expect(deriveRunState({ status: "queued" })).toBe("running");
    expect(deriveRunState({ status: "preparing" })).toBe("running");
    expect(deriveRunState({ status: "verifying" })).toBe("running");
    expect(deriveRunState({ status: "awaiting_approval" })).toBe("awaiting");
    expect(deriveRunState({ status: "approved" })).toBe("done");
    expect(deriveRunState({ status: "pushed" })).toBe("done");
    expect(deriveRunState({ status: "rejected" })).toBe("rejected");
    expect(deriveRunState({ status: "failed" })).toBe("failed");
    expect(deriveRunState({ status: "budget_exceeded" })).toBe("failed");
    expect(deriveRunState({ status: "timed_out" })).toBe("failed");
  });
  it("isAwaiting", () => {
    expect(isAwaiting({ status: "awaiting_approval" })).toBe(true);
    expect(isAwaiting({ status: "pushed" })).toBe(false);
  });
});

describe("latestRun", () => {
  it("retourne le run le plus récent", () => {
    const runs = [
      { id: "a", created_at: "2026-06-11T10:00:00Z" },
      { id: "b", created_at: "2026-06-11T12:00:00Z" },
      { id: "c", created_at: "2026-06-11T11:00:00Z" },
    ];
    expect(latestRun(runs)?.id).toBe("b");
    expect(latestRun([])).toBeNull();
  });
});
