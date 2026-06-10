import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Émet un token COURT-TERME pour le bridge MCP. Le secret LONG-TERME (BRIDGE_SECRET)
// reste côté serveur (jamais NEXT_PUBLIC, jamais dans le navigateur). Authentifié par
// la session Supabase. Format identique à gateway/app/bridge_auth.py.
function mint(secret: string, user: string, ttlSeconds = 300): string {
  const payload = JSON.stringify({ user, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const body = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export async function POST() {
  const secret = process.env.BRIDGE_SECRET;
  const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_URL;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!secret || !bridgeUrl) {
    return NextResponse.json({ error: "bridge non configuré (BRIDGE_SECRET / NEXT_PUBLIC_BRIDGE_URL)" }, { status: 503 });
  }
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

  const token = mint(secret, user.email ?? user.id);
  return NextResponse.json({ token, url: bridgeUrl });
}
