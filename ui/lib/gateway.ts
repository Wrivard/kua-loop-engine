import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ── Centralisation des appels SERVEUR UI → gateway ─────────────────────────────
// La gateway est exposée via Cloudflare Tunnel + Zero Trust Access (engine.oryon-temple.ca).
// Access protège TOUT le hostname : chaque requête serveur doit porter le SERVICE TOKEN
// Cloudflare (CF-Access-Client-Id / CF-Access-Client-Secret) EN PLUS du bearer INTERNAL_TOKEN.
// Ces secrets sont lus depuis l'env SERVEUR Vercel UNIQUEMENT (jamais NEXT_PUBLIC_, donc
// JAMAIS dans le bundle client). Ce fichier importe next/headers → exécution server-only garantie.

type Target = { url: string; headers: Record<string, string> };

// Cible + en-têtes d'auth gateway, ou null si un secret serveur manque (= « non configuré »).
// Requiert les 4 : URL + bearer + les 2 en-têtes du service token Cloudflare.
function gatewayTarget(): Target | null {
  const url = process.env.GATEWAY_INTERNAL_URL;
  const token = process.env.INTERNAL_TOKEN;
  const cfId = process.env.CF_ACCESS_CLIENT_ID;
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!url || !token || !cfId || !cfSecret) return null;
  return {
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      "CF-Access-Client-Id": cfId,
      "CF-Access-Client-Secret": cfSecret,
    },
  };
}

async function currentUser(): Promise<{ email?: string; id: string } | null> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anon) return null;
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
  return user ? { email: user.email ?? undefined, id: user.id } : null;
}

// SYSTEM_ADMIN_EMAILS vide → tout user connecté ; sinon SEULS ces emails (« seulement moi »).
function isAdmin(email?: string): boolean {
  const admins = (process.env.SYSTEM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.length === 0 || admins.includes((email ?? "").toLowerCase());
}

/**
 * Proxy SERVEUR → gateway /internal/* (passthrough du statut + body). Admin-gardé.
 * Utilisé par le panneau Système (sysctl) ET create-repo. Si un secret serveur manque
 * → 503 « gateway_unavailable » (état non configuré propre, jamais une exception).
 */
export async function gatewayProxy(opts: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  timeoutMs?: number;
}): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "accès réservé aux administrateurs" }, { status: 403 });
  }
  const target = gatewayTarget();
  if (!target) {
    return NextResponse.json({ reachable: false, status: "gateway_unavailable" }, { status: 503 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const resp = await fetch(`${target.url}${opts.path}`, {
      method: opts.method,
      headers: {
        ...target.headers,
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

/**
 * Santé de la gateway pour le panneau Système. Enveloppe { reachable, ... }, toujours 200
 * (sauf 401 si non connecté) → l'UI affiche « non joignable » proprement. User-gardé (lecture
 * seule, pas admin). Passe AUSSI par le service token Cloudflare (Access protège /health).
 */
export async function gatewayHealth(): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  const target = gatewayTarget();
  if (!target) {
    return NextResponse.json({
      reachable: false,
      reason: "gateway non configurée (URL / INTERNAL_TOKEN / service token Cloudflare manquant)",
    });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`${target.url}/health`, {
      headers: { ...target.headers, "X-Kua-User": user.email ?? user.id },
      cache: "no-store",
      signal: controller.signal,
    });
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
