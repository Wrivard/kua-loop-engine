import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True si les 2 variables publiques sont présentes (anon key — JAMAIS service_role). */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Résilient : si non configuré, on instancie quand même avec des placeholders
// pour que le build et le dev server ne crashent pas. Les écrans vérifient
// `isSupabaseConfigured` et affichent un état « configuration manquante »
// (cf. ui/BUILD-NOTES.md — l'anon key doit être fournie avant le preview).
export const supabase = createBrowserClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
);
