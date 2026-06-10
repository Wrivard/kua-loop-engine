"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// Identité affichée en mode preview (sans Supabase) — sert aussi de decided_by.
export const PREVIEW_IDENTITY = "preview@kua.quebec";

type CurrentUser = { email: string; configured: boolean } | null;

/** Email de l'utilisateur courant (session Supabase) ou identité preview. */
export function useCurrentUser(): { user: CurrentUser; loading: boolean } {
  const [user, setUser] = useState<CurrentUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser({ email: PREVIEW_IDENTITY, configured: false });
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ? { email: data.user.email ?? "—", configured: true } : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { email: session.user.email ?? "—", configured: true } : null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

/** Qui a tranché (approvals.decided_by). Email de session, sinon identité preview. */
export async function currentIdentity(): Promise<string> {
  if (!isSupabaseConfigured) return PREVIEW_IDENTITY;
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? PREVIEW_IDENTITY;
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}
