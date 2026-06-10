"use client";

import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { getSystemSettings, setPaused } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { HealthStatus, ServiceHealth } from "@/lib/types";

function Dot({ up }: { up: boolean | undefined }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        up === undefined ? "bg-muted-foreground/40" : up ? "bg-emerald-500" : "bg-red-500",
      )}
    />
  );
}

function fmtUptime(s?: number): string {
  if (s == null) return "—";
  const sec = Math.floor(s);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}j ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}

type ServiceKey = keyof NonNullable<HealthStatus["services"]>;

const SERVICES: { key: ServiceKey; label: string }[] = [
  { key: "gateway", label: "Gateway" },
  { key: "worker", label: "Worker" },
  { key: "mcp_bridge", label: "Bridge MCP" },
  { key: "db", label: "Base de données" },
];

function statusText(key: ServiceKey, s: ServiceHealth | undefined): string {
  if (!s) return "—";
  if (!s.up) {
    if (key === "worker") return s.detail ?? "pas de heartbeat";
    if (key === "mcp_bridge" && s.configured === false) return "non configuré";
    return s.detail ?? "down";
  }
  if (key === "worker" && s.age_seconds != null) return `up · il y a ${Math.round(s.age_seconds)}s`;
  return "up";
}

export function SystemSettingsPanel() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [paused, setPausedState] = useState<boolean | null>(null);
  const [savingPause, setSavingPause] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const resp = await fetch("/api/health", { cache: "no-store" });
      setHealth((await resp.json()) as HealthStatus);
    } catch {
      setHealth({ reachable: false, reason: "appel /api/health a échoué" });
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const id = setInterval(() => void loadHealth(), 15000);
    return () => clearInterval(id);
  }, [loadHealth]);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getSystemSettings();
        setPausedState(s?.paused ?? false);
      } catch {
        setPausedState(false);
      }
    })();
  }, []);

  async function togglePause(next: boolean) {
    setSavingPause(true);
    setPauseError(null);
    setPausedState(next); // optimiste
    try {
      await setPaused(next);
    } catch {
      setPausedState(!next); // rollback
      setPauseError("Échec de l'écriture (connexion requise).");
    } finally {
      setSavingPause(false);
    }
  }

  const svc = health?.services;

  return (
    <div className="space-y-6">
      {/* Pause moteur — marche sans la gateway (écrit le flag via Supabase). */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Pause du moteur</p>
            <p className="text-xs text-muted-foreground">
              En pause : aucun nouveau run ne démarre ; les runs en cours finissent. Le « débrancher » sécuritaire.
            </p>
          </div>
          <Switch
            checked={paused === true}
            disabled={paused === null || savingPause || !isSupabaseConfigured}
            onCheckedChange={(v) => void togglePause(v)}
            aria-label="Pause du moteur"
          />
        </div>
        {paused && (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            ⏸ Moteur en pause — les nouveaux runs attendent la reprise.
          </p>
        )}
        {pauseError && <p className="text-xs text-red-500">{pauseError}</p>}
      </section>

      {/* Santé des services — via /api/health (proxy de la gateway). */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Santé des services</h3>
          <Button variant="ghost" size="sm" onClick={() => void loadHealth()} disabled={loadingHealth}>
            Rafraîchir
          </Button>
        </div>
        {!health?.reachable ? (
          <div className="rounded-lg border border-border bg-accent/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-amber-500">Gateway non joignable</p>
            <p className="mt-1">{health?.reason ?? "…"}</p>
            <p className="mt-1">
              Normal tant que l&apos;engine n&apos;est pas exposé (voir le runbook bring-live). La pause ci-dessus
              fonctionne quand même.
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>version {health.version ?? "—"}</span>
              <span>uptime {fmtUptime(health.uptime_seconds)}</span>
            </div>
            <div className="divide-y divide-border">
              {SERVICES.map(({ key, label }) => {
                const s = svc?.[key];
                return (
                  <div key={key} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="flex items-center gap-2">
                      <Dot up={s?.up} />
                      {label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{statusText(key, s)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
