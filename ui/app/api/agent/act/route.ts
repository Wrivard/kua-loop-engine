import { gatewayProxy } from "@/lib/gateway";

// Actions de gestion de loop confirmées par l'humain → gateway /internal/agent/act
// (allowlist STRICTE côté gateway ; auto/allow_auto impossibles). Admin-gardé via gatewayProxy.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return gatewayProxy({ method: "POST", path: "/internal/agent/act", body });
}
