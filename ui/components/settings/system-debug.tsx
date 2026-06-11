"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AdviseResult, DiagnosticBlock, ProposedAction } from "@/lib/types";

type Msg = { role: "user" | "assistant" | "system"; text: string; action?: ProposedAction | null };

const SERVICE_LABEL: Record<string, string> = {
  "kua-gateway": "Gateway",
  "kua-worker": "Worker",
  "kua-mcp-bridge": "Bridge MCP",
};

function actionLabel(a: ProposedAction): string {
  if (a.type === "restart_service") return `Redémarrer ${SERVICE_LABEL[a.service ?? ""] ?? a.service}`;
  if (a.type === "reinstall_dep") return `Réinstaller « ${a.key} »`;
  return "Action";
}

export function SystemDebug() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  function push(m: Msg) {
    setMsgs((prev) => [...prev, m]);
  }

  async function ask(question: string) {
    const text = question.trim();
    push({ role: "user", text: text || "Diagnostique l'état du backend." });
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/system/debug/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = (await r.json().catch(() => ({}))) as AdviseResult & { reason?: string; status?: string };
      if (!r.ok) {
        push({ role: "system", text: data?.reason || data?.status || `Assistant indisponible (${r.status}).` });
        return;
      }
      push({ role: "assistant", text: data.explanation || "Pas de diagnostic.", action: data.proposed_action ?? null });
    } catch {
      push({ role: "system", text: "Appel échoué." });
    } finally {
      setBusy(false);
    }
  }

  async function showDiagnostics() {
    push({ role: "user", text: "Voir les diagnostics bruts" });
    setBusy(true);
    try {
      const r = await fetch("/api/system/diagnostics", { cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        push({ role: "system", text: data?.reason || data?.status || `Indisponible (${r.status}).` });
        return;
      }
      const blocks = ((data.diagnostics ?? []) as DiagnosticBlock[])
        .map((d) => `== ${d.name} (exit ${d.exit_code}) ==\n${d.output}`)
        .join("\n\n");
      push({ role: "assistant", text: blocks || "(vide)" });
    } catch {
      push({ role: "system", text: "Appel échoué." });
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction(a: ProposedAction) {
    if (!window.confirm(`${actionLabel(a)} ?`)) return;
    setBusy(true);
    push({ role: "user", text: `✅ ${actionLabel(a)}` });
    try {
      const body =
        a.type === "restart_service" ? { type: a.type, service: a.service } : { type: a.type, key: a.key };
      const r = await fetch("/api/system/debug/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        push({ role: "system", text: data?.message || data?.status || `Échec (${r.status}).` });
        return;
      }
      const out =
        data.status === "scheduled"
          ? data.note || "Action planifiée."
          : `exit ${data.exit_code ?? "?"}\n${String(data.output ?? "").slice(-2000)}`;
      push({ role: "assistant", text: out });
    } catch {
      push({ role: "system", text: "Appel échoué." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-faint">Assistant de débogage</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Alimenté par Claude (plan Max). Lit les diagnostics et propose UNE action sûre et réversible —
          que tu confirmes.
        </p>
      </div>
      <div className="max-h-96 space-y-2 overflow-auto rounded-lg border border-border p-3">
        {msgs.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Pose une question (« le worker est down, pourquoi ? ») ou clique « Diagnostics ».
          </p>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              "text-sm",
              m.role === "user" ? "text-foreground" : m.role === "system" ? "text-warn" : "text-muted-foreground",
            )}
          >
            <span className="mr-1.5 font-mono text-xs uppercase opacity-60">
              {m.role === "user" ? "toi" : m.role === "assistant" ? "claude" : "sys"}
            </span>
            <span className="whitespace-pre-wrap break-words">{m.text}</span>
            {m.action && (
              <div className="mt-1.5">
                <Button size="sm" disabled={busy} onClick={() => void confirmAction(m.action!)}>
                  {actionLabel(m.action)}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Décris le problème…"
          aria-label="Question de débogage"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void ask(q);
          }}
        />
        <Button size="sm" disabled={busy} onClick={() => void ask(q)}>
          Demander
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void showDiagnostics()}>
          Diagnostics
        </Button>
      </div>
    </section>
  );
}
