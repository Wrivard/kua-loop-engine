import { gatewayProxy } from "@/lib/gateway";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return gatewayProxy({ method: "POST", path: "/internal/control", body });
}
