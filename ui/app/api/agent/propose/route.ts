import { NextResponse } from "next/server";
import { gatewayProxy } from "@/lib/gateway";

// Le cerveau (claude -p Max) vit sur la gateway. Cette route proxifie le tri d'un message
// → AgentProposal. Gateway non exposée (Cloudflare en attente) → 503, l'UI dégrade proprement.
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message manquant" }, { status: 400 });
  }
  return gatewayProxy({
    method: "POST",
    path: "/internal/agent/propose",
    body: {
      message,
      history: Array.isArray(body?.history) ? body.history.slice(-12) : [],
      project_id: body?.project_id ?? null,
      source: body?.source ?? "ui",
    },
    timeoutMs: 115000,
  });
}
