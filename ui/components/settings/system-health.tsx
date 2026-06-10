"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HealthStatus } from "@/lib/types";

function Dot({ up }: { up?: boolean }) {
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

type HealthKey = keyof NonNullable<HealthStatus["services"]>;
const ROWS: { service?: string; healthKey: HealthKey; label: string }[] = [
  { service: "kua-gateway", healthKey: "gateway", label: "Gateway" },
  { service: "kua-worker", healthKey: "worker", label: "Worker" },
  { service: "kua-mcp-bridge", healthKey: "mcp_bridge", label: "Bridge MCP" },
  { healthKey: "db", label: "Base de données" },
];

export function SystemHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      setHealth((await r.json()) as HealthStatus);
    } catch {
      setHealth({ reachable: false, reason: "appel /api/health a échoué" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, [load]);

  async function pollUntilBack() {
    setRestarting(true);
    const start = Date.now();
    while (Date.now() - start < 45000) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const h = (await r.json()) as HealthStatus;
        setHealth(h);
        if (h.reachable && h.services?.gateway?.up) break;
      } catch {
        /* encore down — on continue */
      }
    }
    setRestarting(false);
  }

  async function control(service: string, action: "start" | "stop" | "restart", label: string) {
    if (
      (action === "stop" || action === "restart") &&
      !window.confirm(`${action === "stop" ? "Arrêter" : "Redémarrer"} ${label} ?`)
    ) {
      return;
    }
    setBusy(service);
    setNote(null);
    try {
      const r = await fetch("/api/system/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, action }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNote(data?.message || data?.status || `Échec (${r.status}).`);
        return;
      }
      if (data.status === "scheduled") {
        setNote(data.note || "Redémarrage en cours…");
        void pollUntilBack();
      } else {
        setNote(`${label} : ${action} → exit ${data.exit_code ?? "?"}.`);
        void load();
      }
    } catch {
      setNote("Appel échoué.");
    } finally {
      setBusy(null);
    }
  }

  const svc = health?.services;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Services</h3>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          Rafraîchir
        </Button>
      </div>
      {restarting && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          ⏳ Redémarrage… on revérifie la santé automatiquement.
        </p>
      )}
      {!health?.reachable ? (
        <div className="rounded-lg border border-border bg-accent/30 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-amber-500">Gateway non joignable</p>
          <p className="mt-1">{health?.reason ?? "…"}</p>
          <p className="mt-1">Normal tant que l&apos;engine n&apos;est pas exposé (runbook bring-live).</p>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>version {health.version ?? "—"}</span>
            <span>uptime {fmtUptime(health.uptime_seconds)}</span>
          </div>
          <div className="divide-y divide-border">
            {ROWS.map((row) => {
              const s = svc?.[row.healthKey];
              return (
                <div key={row.healthKey} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Dot up={s?.up} />
                    {row.label}
                    {row.healthKey === "worker" && s?.up && s.age_seconds != null && (
                      <span className="font-mono text-[10px] text-muted-foreground">♥ {Math.round(s.age_seconds)}s</span>
                    )}
                  </span>
                  {row.service && (
                    <span className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === row.service || restarting}
                        onClick={() => void control(row.service!, "restart", row.label)}
                      >
                        Redémarrer
                      </Button>
                      {s?.up ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === row.service || restarting}
                          onClick={() => void control(row.service!, "stop", row.label)}
                        >
                          Stop
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === row.service || restarting}
                          onClick={() => void control(row.service!, "start", row.label)}
                        >
                          Start
                        </Button>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {note && <p className="whitespace-pre-line text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}
