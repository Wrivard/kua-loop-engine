import { gatewayProxy } from "@/lib/gateway";

// claude -p (Max) peut prendre ~30-90s ; on relève le plafond serverless (Vercel Pro).
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return gatewayProxy({ method: "POST", path: "/internal/debug/advise", body, timeoutMs: 110000 });
}
