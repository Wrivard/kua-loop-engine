import { NextResponse } from "next/server";
import { gatewayProxy } from "@/lib/gateway";

// Bouton « créer un nouveau repo » → gateway POST /internal/projects. Le GITHUB_TOKEN reste
// sur le VPS (gateway) ; l'UI ne détient que le bearer INTERNAL_TOKEN + le service token
// Cloudflare (server-side), centralisés dans lib/gateway.ts. Gateway non configurée → 503,
// l'UI bascule sur la CLI `kua project create`.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "nom manquant" }, { status: 400 });
  }
  return gatewayProxy({
    method: "POST",
    path: "/internal/projects",
    body: {
      name,
      private: body?.private !== false,
      facade: body?.facade ?? "general",
      budget_usd: body?.budget_usd ?? 5,
    },
  });
}
