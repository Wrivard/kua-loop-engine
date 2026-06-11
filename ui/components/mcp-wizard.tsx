"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Retire les séquences ANSI/escape pour un affichage lisible du PTY.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        URL_RE.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Wizard MCP : terminal branché au bridge VPS (allowlist `claude mcp …`).
 *  Claude guide, donne les URL d'auth (cliquables), exécute. scope app|project. */
export function McpWizard({
  scope,
  projectId,
  trigger,
}: {
  scope: "app" | "project";
  projectId?: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [out, setOut] = useState("");
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [guide, setGuide] = useState("");
  const [cmd, setCmd] = useState("");
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [out]);

  function append(s: string) {
    setOut((prev) => prev + s);
  }
  function send(obj: Record<string, unknown>) {
    wsRef.current?.send(JSON.stringify(obj));
  }

  async function connect() {
    setOut("");
    setErr(null);
    setConnected(false);
    let res: Response;
    try {
      res = await fetch("/api/mcp-bridge/token", { method: "POST" });
    } catch {
      setErr("route token injoignable");
      return;
    }
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "bridge indisponible");
      return;
    }
    const { token, url } = await res.json();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setErr("URL du bridge invalide");
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ token }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "ready") setConnected(true);
      else if (m.type === "output") append(stripAnsi(m.data));
      else if (m.type === "guidance") append("\n┌─ guide ─\n" + m.text + "\n└─────────\n");
      else if (m.type === "refused") append("\n⛔ refusé : " + m.message + "\n");
      else if (m.type === "exit") {
        setRunning(false);
        append(`\n● terminé (code ${m.code})\n`);
      } else if (m.type === "error") setErr(m.message);
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setErr("erreur WebSocket (bridge non joignable ?)");
  }

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setRunning(false);
  }

  function runCmd() {
    if (!cmd.trim() || !connected) return;
    append("\n$ " + cmd + "\n");
    setRunning(true);
    send({ type: "run", command: cmd });
  }
  function askGuide() {
    if (!guide.trim() || !connected) return;
    const ctx = scope === "project" && projectId ? ` (projet ${projectId})` : " (app)";
    send({ type: "guide", query: guide + ctx });
  }
  function sendInput() {
    send({ type: "input", data: input + "\n" });
    append(input + "\n");
    setInput("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void connect();
        else disconnect();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col">
        <DialogHeader>
          <DialogTitle>Ajouter un serveur MCP — {scope === "project" ? "projet" : "app"}</DialogTitle>
          <DialogDescription>
            Claude te guide et exécute via le VPS (allowlist <code className="font-mono">claude mcp …</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          {err && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-warn">
              {err} — le bridge doit être en ligne (voir BUILD-NOTES « bring-live »).
            </p>
          )}

          <div className="flex items-end gap-2">
            <Input
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              placeholder="Quel serveur ? (ex : Linear, Notion…)"
              aria-label="Décris le serveur MCP"
              disabled={!connected}
            />
            <Button size="sm" variant="outline" onClick={askGuide} disabled={!connected || !guide.trim()}>
              Guide
            </Button>
          </div>

          <div className="flex items-end gap-2">
            <Input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="claude mcp add …"
              aria-label="Commande à lancer"
              className="font-mono"
              disabled={!connected}
            />
            <Button size="sm" onClick={runCmd} disabled={!connected || !cmd.trim()}>
              Lancer
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              <Linkified text={out || (connected ? "Connecté. Décris un serveur (Guide) ou tape une commande." : "Connexion…")} />
            </pre>
            <div ref={endRef} />
          </div>

          {running && (
            <div className="flex items-end gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendInput();
                  }
                }}
                placeholder="réponse / code OAuth à coller…"
                aria-label="Saisie interactive"
                className="font-mono"
              />
              <Button size="sm" variant="outline" onClick={sendInput}>
                Envoyer
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
