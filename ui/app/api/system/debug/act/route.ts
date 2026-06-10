import { gatewayProxy } from "@/lib/gateway";

// Réinstall de dépendance épinglée (pip) peut durer ; on relève le plafond serverless.
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return gatewayProxy({ method: "POST", path: "/internal/debug/act", body, timeoutMs: 110000 });
}
