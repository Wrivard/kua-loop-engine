"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// 100 % local à l'appareil (localStorage) — AUCUN backend, aucune écriture DB.
const THEMES = [
  { k: "dark", l: "Sombre" },
  { k: "light", l: "Clair" },
  { k: "system", l: "Système" },
];
const DENSITIES = [
  { k: "normal", l: "Confortable" },
  { k: "compact", l: "Compact" },
];

function applyTheme(theme: string) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function applyDensity(d: string) {
  document.documentElement.setAttribute("data-density", d);
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { k: string; l: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          aria-pressed={value === o.k}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.k ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function AppearanceSettings() {
  const [theme, setTheme] = useState("dark");
  const [density, setDensity] = useState("normal");

  useEffect(() => {
    const t = localStorage.getItem("kua-theme") || "dark";
    const d = localStorage.getItem("kua-density") || "normal";
    setTheme(t);
    setDensity(d);
    applyTheme(t);
    applyDensity(d);
  }, []);

  function pickTheme(t: string) {
    setTheme(t);
    localStorage.setItem("kua-theme", t);
    applyTheme(t);
  }
  function pickDensity(d: string) {
    setDensity(d);
    localStorage.setItem("kua-density", d);
    applyDensity(d);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Thème</h2>
        <Segmented options={THEMES} value={theme} onChange={pickTheme} />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Densité</h2>
        <Segmented options={DENSITIES} value={density} onChange={pickDensity} />
      </div>
      <p className="text-xs text-muted-foreground">
        Ces réglages sont 100 % locaux à cet appareil (aucun backend, aucune écriture en base).
      </p>
    </div>
  );
}
