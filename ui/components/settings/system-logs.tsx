"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SERVICES = ["kua-gateway", "kua-worker", "kua-mcp-bridge"] as const;

export function SystemLogs() {
  const [service, setService] = useState<string>("kua-worker");
  const [output, setOutput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (svc: string) => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/system/logs?service=${encodeURIComponent(svc)}&lines=200`, { cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data?.reason || data?.message || data?.status || `Logs indisponibles (${r.status}).`);
        setOutput("");
        return;
      }
      setOutput(String(data.output ?? ""));
    } catch {
      setErr("Appel échoué.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(service);
  }, [service, load]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-faint">Logs (journalctl)</h3>
        <Button variant="ghost" size="sm" onClick={() => void load(service)} disabled={loading}>
          Rafraîchir
        </Button>
      </div>
      <div className="flex gap-1 rounded-lg border border-border p-0.5 text-xs font-medium">
        {SERVICES.map((s) => (
          <button
            key={s}
            onClick={() => setService(s)}
            aria-pressed={service === s}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 transition-colors",
              service === s ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {s.replace("kua-", "")}
          </button>
        ))}
      </div>
      {err ? (
        <p className="rounded-md bg-accent/30 px-3 py-2 text-xs text-muted-foreground">{err}</p>
      ) : (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {loading ? "…" : output || "(vide)"}
        </pre>
      )}
    </section>
  );
}
