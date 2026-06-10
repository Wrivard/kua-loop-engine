import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Proxy de /health de la gateway pour le panneau Réglages « Système ».
// /health est public côté gateway (aucun secret) ; ici on exige juste un user connecté.
// Tant que la gateway n'est pas exposée (GATEWAY_INTERNAL_URL absent) ou injoignable,
// on renvoie { reachable:false } en 200 → l'UI affiche « gateway non joignable » proprement.
export async function GET() {
  const gatewayUrl = process.env.GATEWAY_INTERNAL_URL;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supaUrl || !anon) {
    return NextResponse.json({ reachable: false, reason: "supabase non configuré" });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(supaUrl, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        /* lecture seule */
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  if (!gatewayUrl) {
    return NextResponse.json({ reachable: false, reason: "gateway non exposée (GATEWAY_INTERNAL_URL absent)" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${gatewayUrl}/health`, { cache: "no-store", signal: controller.signal });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data) {
      return NextResponse.json({ reachable: false, reason: `gateway HTTP ${resp.status}` });
    }
    return NextResponse.json({ reachable: true, ...data });
  } catch {
    return NextResponse.json({ reachable: false, reason: "gateway injoignable" });
  } finally {
    clearTimeout(timer);
  }
}
