import { gatewayProxy } from "@/lib/gateway";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const service = encodeURIComponent(u.searchParams.get("service") ?? "");
  const lines = encodeURIComponent(u.searchParams.get("lines") ?? "200");
  return gatewayProxy({ method: "GET", path: `/internal/logs?service=${service}&lines=${lines}` });
}
