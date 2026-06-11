/** État haut-niveau d'un run, DÉRIVÉ de run.status (le backend n'émet pas
 *  d'événements granulaires — limite notée dans UX-SPEC). Pur → testable. */

export type RunState = "running" | "awaiting" | "done" | "rejected" | "failed";

export function deriveRunState(run: { status: string }): RunState {
  switch (run.status) {
    case "queued":
    case "preparing":
    case "running":
    case "verifying":
      return "running";
    case "awaiting_approval":
      return "awaiting";
    case "approved":
    case "pushed":
      return "done";
    case "rejected":
      return "rejected";
    case "failed":
    case "budget_exceeded":
    case "timed_out":
      return "failed";
    default:
      return "running";
  }
}

export function isAwaiting(run: { status: string }): boolean {
  return deriveRunState(run) === "awaiting";
}

/** Le run le plus récent d'une liste (= version active de la carte). */
export function latestRun<T extends { created_at: string }>(runs: T[]): T | null {
  if (!runs.length) return null;
  return [...runs].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0];
}
