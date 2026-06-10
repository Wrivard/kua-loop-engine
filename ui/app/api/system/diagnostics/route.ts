import { gatewayProxy } from "@/lib/gateway";

export const maxDuration = 60;

export async function GET() {
  return gatewayProxy({ method: "GET", path: "/internal/diagnostics", timeoutMs: 45000 });
}
