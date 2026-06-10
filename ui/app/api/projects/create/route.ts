import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Proxy SERVEUR du bouton « créer un nouveau repo » → gateway POST /internal/projects.
// Le GITHUB_TOKEN reste sur le VPS (gateway) ; ce route handler ne détient qu'un
// bearer INTERNAL_TOKEN (server-side, jamais NEXT_PUBLIC). Tant que la gateway n'est
// pas exposée (GATEWAY_INTERNAL_URL absent) → 503 : l'UI bascule sur la CLI.
export async function POST(req: Request) {
  const gatewayUrl = process.env.GATEWAY_INTERNAL_URL;
  const internalToken = process.env.INTERNAL_TOKEN;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supaUrl || !anon) {
    return NextResponse.json({ error: "supabase non configuré" }, { status: 503 });
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

  if (!gatewayUrl || !internalToken) {
    // Gateway pas encore exposée : la capacité marche via la CLI `kua project create`.
    return NextResponse.json({ status: "gateway_unavailable" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "nom manquant" }, { status: 400 });
  }

  const resp = await fetch(`${gatewayUrl}/internal/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${internalToken}` },
    body: JSON.stringify({
      name,
      private: body?.private !== false,
      facade: body?.facade ?? "general",
      budget_usd: body?.budget_usd ?? 5,
    }),
  }).catch(() => null);

  if (!resp) {
    return NextResponse.json({ status: "gateway_unreachable" }, { status: 502 });
  }
  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}
