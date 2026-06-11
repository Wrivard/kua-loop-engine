import { Plug } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Registre LOCAL type → { tint, glyph }. Aucune dépendance CDN. Pour swapper un logo plus
// tard (image de référence) : remplacer `glyph` (SVG inline) et `tint` de l'entrée concernée.
// Type non listé → fallback : pastille teintée + initiales.

type Entry = { tint: string; glyph: ReactNode };

const G = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const REGISTRY: Record<string, Entry> = {
  github: {
    tint: "#24292F",
    glyph: G(
      <>
        <circle cx="7" cy="6" r="2.2" />
        <circle cx="7" cy="18" r="2.2" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M7 8v8M17 11.2c0 3-3 3.8-6 3.8" />
      </>,
    ),
  },
  sentry: { tint: "#362D59", glyph: G(<path d="M4 18 L12 5 L20 18 M9 18 L12 12.5 L15 18" />) },
  cloudflare: {
    tint: "#F38020",
    glyph: G(<path d="M16 17H7a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 16 11.5a3 3 0 0 1 0 5.5Z" fill="currentColor" stroke="none" />),
  },
  supabase: { tint: "#3ECF8E", glyph: G(<path d="M13 3 L6 13 H11 L10 21 L18 10 H12 Z" fill="currentColor" stroke="none" />) },
  discord: {
    tint: "#5865F2",
    glyph: G(
      <>
        <path d="M5 7.5A14 14 0 0 1 12 6a14 14 0 0 1 7 1.5c1.8 3 2.4 6.3 2 9.5a14 14 0 0 1-4 2l-1-2" />
        <path d="M6 17a14 14 0 0 0 4 2l1-2" />
        <circle cx="9.5" cy="13" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none" />
      </>,
    ),
  },
  "google-drive": { tint: "#1FA463", glyph: G(<path d="M9 4 H15 L21 15 H15 L9 4 Z M9 4 L3 15 L6 20 L12 9 Z M6 20 H18 L21 15 H9 Z" fill="currentColor" stroke="none" />) },
  slack: {
    tint: "#611f69",
    glyph: G(
      <>
        <path d="M9 4v6M15 14v6M4 15h6M14 9h6" />
        <circle cx="9" cy="14" r="2" />
        <circle cx="15" cy="10" r="2" />
      </>,
    ),
  },
  mcp: { tint: "#00b562", glyph: <Plug className="h-[60%] w-[60%]" /> },
};

function tintFromType(type: string): string {
  // Couleur déterministe douce pour les types non répertoriés (fallback).
  let h = 0;
  for (let i = 0; i < type.length; i += 1) h = (h * 31 + type.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 45%)`;
}

export function ConnectorIcon({ type, size = 22, className }: { type: string; size?: number; className?: string }) {
  const entry = REGISTRY[type];
  if (entry) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center rounded-md text-white", className)}
        style={{ width: size, height: size, background: entry.tint }}
        aria-hidden
      >
        <span className="flex h-[62%] w-[62%] items-center justify-center">{entry.glyph}</span>
      </span>
    );
  }
  // Fallback : pastille teintée + initiales (1-2 lettres).
  const tint = tintFromType(type);
  const initials = type.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md font-semibold", className)}
      style={{ width: size, height: size, background: `${tint}22`, color: tint, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
