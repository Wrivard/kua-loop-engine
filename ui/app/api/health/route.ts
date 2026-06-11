import { gatewayHealth } from "@/lib/gateway";

// Santé de la gateway pour le panneau Réglages « Système ». Toute la logique (auth Supabase,
// service token Cloudflare, état non-configuré) est centralisée dans lib/gateway.ts.
export async function GET() {
  return gatewayHealth();
}
