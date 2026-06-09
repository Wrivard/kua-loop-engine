import type { Config } from "tailwindcss";

// Design system: vercel_DESIGN.md (racine du repo) — monochrome Geist,
// shadow-as-border, couleurs de façade par doc 12.
const config: Config = {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Arial", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "#171717",
        paper: "#ffffff",
        "paper-dark": "#0a0a0a",
        facade: {
          bugfix: "#D85A30",
          discord: "#378ADD",
          demo: "#7F77DD",
          finish: "#1D9E75",
          seo: "#BA7517",
        },
      },
      boxShadow: {
        // Le « shadow-as-border » signature de vercel_DESIGN.md
        ring: "0 0 0 1px rgba(0,0,0,0.08)",
        "ring-dark": "0 0 0 1px rgba(255,255,255,0.14)",
        card: "0 0 0 1px rgba(0,0,0,0.08), 0 2px 2px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
