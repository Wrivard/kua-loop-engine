import type { Config } from "tailwindcss";

// Système de design (ui/DESIGN-SYSTEM.md) : tokens via CSS variables (globals.css).
// Discipline encodée ici :
//  - 5 tailles de texte, point final (les défauts 2xl+ sont retirés exprès) ;
//  - 3 rayons (sm/md/lg ; xl = alias de lg, 2xl+ n'existe plus) ;
//  - sémantiques success/warn/danger/info (+ fonds *-soft) — plus de emerald/red en dur ;
//  - une seule ombre (float) pour ce qui flotte ; élévation = couches + bordures.
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    // Échelle typographique stricte (12/13/14/16/19) — voir DESIGN-SYSTEM §3.
    fontSize: {
      xs: ["0.75rem", { lineHeight: "1.125rem" }],
      sm: ["0.8125rem", { lineHeight: "1.25rem" }],
      base: ["0.875rem", { lineHeight: "1.375rem" }],
      lg: ["1rem", { lineHeight: "1.625rem" }],
      xl: ["1.1875rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
    },
    borderRadius: {
      none: "0",
      sm: "6px",
      DEFAULT: "8px",
      md: "10px",
      lg: "14px",
      xl: "14px",
      full: "9999px",
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        faint: "hsl(var(--faint))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Accent de marque Küa — action primaire / état actif / focus, c'est tout.
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
        },
        // Sémantiques sourdes : texte saturé + fond teinté (soft).
        success: { DEFAULT: "hsl(var(--success))", soft: "hsl(var(--success) / 0.12)" },
        warn: { DEFAULT: "hsl(var(--warn))", soft: "hsl(var(--warn) / 0.12)" },
        danger: { DEFAULT: "hsl(var(--danger))", soft: "hsl(var(--danger) / 0.12)" },
        info: { DEFAULT: "hsl(var(--info))", soft: "hsl(var(--info) / 0.12)" },
        // Identité des façades (doc 12) — canal chromatique réservé.
        facade: {
          bugfix: "#D85A30",
          discord: "#378ADD",
          demo: "#7F77DD",
          finish: "#1D9E75",
          seo: "#BA7517",
        },
      },
      boxShadow: {
        // L'élévation vient des couches+bordures ; cette ombre = uniquement ce qui FLOTTE.
        float: "0 8px 32px -12px rgb(0 0 0 / 0.55)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "collapse-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.98)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-in": "slide-in 0.2s ease-out",
        "collapse-out": "collapse-out 0.18s ease-in forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
