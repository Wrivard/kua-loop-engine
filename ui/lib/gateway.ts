import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Proxy SERVEUR partagé des routes /api/system/* → gateway /internal/*.
// L'INTERNAL_TOKEN reste côté serveur (jamais NEXT_PUBLIC). Auth = session Supabase ;
// on transmet l'email comme X-Kua-User pour l'audit gateway. Si la gateway n'est pas
// exposée (GATEWAY_INTERNAL_URL absent) ou injoignable → réponse dégradée (503/502),
// jamais une exception : l'UI affiche « gateway non joignable » proprement.
export async function gatewayProxy(opts: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  timeoutMs?: number;
}): Promise<NextResponse> {
  const gatewayUrl = process.env.GATEWAY_INTERNAL_URL;
  const internalToken = process.env.INTERNAL_TOKEN;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supaUrl || !anon) {
    return NextResponse.json({ reachable: false, reason: "supabase non configuré" }, { status: 503 });
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

  // Garde-fou admin : si SYSTEM_ADMIN_EMAILS est défini (recommandé), SEULS ces emails
  // pilotent le panneau de contrôle → « seulement moi » imposé par le CODE, pas seulement
  // par le toggle « désactiver l'inscription » de Supabase.
  const admins = (process.env.SYSTEM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (admins.length > 0 && !admins.includes((user.email ?? "").toLowerCase())) {
    return NextResponse.json({ error: "accès réservé aux administrateurs" }, { status: 403 });
  }

  if (!gatewayUrl || !internalToken) {
    return NextResponse.json({ reachable: false, status: "gateway_unavailable" }, { status: 503 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const resp = await fetch(`${gatewayUrl}${opts.path}`, {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${internalToken}`,
        "X-Kua-User": user.email ?? user.id,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  } catch {
    return NextResponse.json({ reachable: false, status: "gateway_unreachable" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
