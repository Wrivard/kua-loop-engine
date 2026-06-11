import { gatewayProxy } from "@/lib/gateway";

// Détail PR (diff/patch/commits/coût/résumé/vérif) → gateway /internal/pr/{run_id}.
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  return gatewayProxy({ method: "GET", path: `/internal/pr/${encodeURIComponent(params.runId)}`, timeoutMs: 25000 });
}
