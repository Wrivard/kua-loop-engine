import { gatewayProxy } from "@/lib/gateway";

// Import d'un repo GitHub existant → gateway /internal/repo/import (vérifie + enregistre).
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return gatewayProxy({ method: "POST", path: "/internal/repo/import", body, timeoutMs: 25000 });
}
