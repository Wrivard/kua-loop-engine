"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProposalCard, type ConfirmedProposal } from "@/components/proposal-card";
import { Expandable } from "@/components/expandable";
import { getProjects } from "@/lib/queries";
import { applyProposal } from "@/lib/apply-proposal";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import type { AgentProposal, ChatMessage, Project } from "@/lib/types";

type Turn =
  | { id: string; kind: "text"; role: "user" | "brain" | "system"; text: string }
  | { id: string; kind: "proposal"; proposal: AgentProposal };

// Compteur déterministe (pas de Math.random → pas de mismatch d'hydratation SSR/client).
let _uid = 0;
function uid() {
  return `t${(_uid += 1)}`;
}

export function BrainChat({
  source = "ui",
  projectId,
  placeholder = "Décris ce que tu veux faire…",
  greeting,
  initial,
  onTurn,
  onCreated,
}: {
  source?: string;
  projectId?: string;
  placeholder?: string;
  greeting?: string;
  initial?: ChatMessage[];
  onTurn?: (role: "user" | "brain" | "system", content: string) => void;
  onCreated?: (kind: "thread" | "loop", id: string) => void;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(() => {
    if (initial && initial.length) {
      return initial.map((m) => ({ id: uid(), kind: "text" as const, role: m.role, text: m.content }));
    }
    return greeting ? [{ id: uid(), kind: "text", role: "brain", text: greeting }] : [];
  });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getProjects().then(setProjects).catch(() => {});
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, thinking]);

  function add(t: Turn) {
    setTurns((prev) => [...prev, t]);
    if (t.kind === "text" && onTurn) onTurn(t.role, t.text); // persistance (M3) — texte seulement
  }

  function history() {
    return turns
      .filter((t): t is Extract<Turn, { kind: "text" }> => t.kind === "text" && t.role !== "system")
      .map((t) => ({ role: t.role, content: t.text }));
  }

  async function send() {
    const message = input.trim();
    if (!message || thinking) return;
    add({ id: uid(), kind: "text", role: "user", text: message });
    setInput("");
    setThinking(true);
    try {
      const r = await fetch("/api/agent/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history(), project_id: projectId ?? null, source }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 503) {
        add({
          id: uid(),
          kind: "text",
          role: "system",
          text: "Le cerveau n'est pas encore joignable (exposition Cloudflare en attente). En attendant, tu peux créer manuellement.",
        });
        return;
      }
      if (!r.ok || data?.status !== "ok") {
        add({ id: uid(), kind: "text", role: "system", text: data?.message || "Le cerveau a eu un souci. Réessaie." });
        return;
      }
      const p: AgentProposal = data.proposal;
      if (p.resume_humain) add({ id: uid(), kind: "text", role: "brain", text: p.resume_humain });
      if (p.questions_manquantes?.length) {
        add({ id: uid(), kind: "text", role: "brain", text: p.questions_manquantes.map((q) => `- ${q}`).join("\n") });
      } else if (p.action !== "none") {
        add({ id: uid(), kind: "proposal", proposal: p });
      }
    } catch {
      add({ id: uid(), kind: "text", role: "system", text: "Appel échoué. Réessaie." });
    } finally {
      setThinking(false);
    }
  }

  function dismissProposal() {
    setTurns((prev) => prev.filter((t) => t.kind !== "proposal"));
  }

  async function confirm(p: ConfirmedProposal) {
    setBusy(true);
    try {
      const res = await applyProposal(p);
      dismissProposal();
      if (res?.kind === "thread") {
        onCreated?.("thread", res.id);
        add({ id: uid(), kind: "text", role: "system", text: "Thread créé ✅" });
        router.push(`/c/${res.id}`);
      } else if (res?.kind === "loop" || res?.kind === "project") {
        onCreated?.("loop", res.id);
        add({ id: uid(), kind: "text", role: "system", text: "Fait ✅" });
        router.push(`/p/${res.id}`);
      } else if (res?.kind === "act") {
        add({ id: uid(), kind: "text", role: "system", text: "Appliqué ✅" });
      } else {
        add({ id: uid(), kind: "text", role: "system", text: "Action échouée ou refusée." });
      }
    } catch {
      add({ id: uid(), kind: "text", role: "system", text: "Action échouée." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-1">
        {turns.length === 0 && (
          <p className="px-2 py-10 text-center text-sm text-muted-foreground">{placeholder}</p>
        )}
        {turns.map((t) =>
          t.kind === "proposal" ? (
            <ProposalCard
              key={t.id}
              proposal={t.proposal}
              projects={projects}
              defaultProjectId={projectId}
              onConfirm={confirm}
              onAdjust={dismissProposal}
              onCancel={dismissProposal}
              busy={busy}
            />
          ) : (
            <Bubble key={t.id} role={t.role} text={t.text} />
          ),
        )}
        {thinking && <Thinking />}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={1}
          aria-label="Message"
          className="max-h-40 min-h-[44px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button size="sm" onClick={() => void send()} disabled={thinking || !input.trim()}>
          Envoyer
        </Button>
      </form>
    </div>
  );
}

function Bubble({ role, text }: { role: string; text: string }) {
  // Événement / système : ligne fine centrée (pas une bulle).
  if (role === "system") {
    return (
      <div className="flex items-center gap-3 py-0.5 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-center text-[11px]">{text}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl bg-secondary px-3.5 py-2 text-sm leading-relaxed text-secondary-foreground">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5">
        <Expandable collapsedHeight={200} fadeClass="from-card">
          <Markdown>{text}</Markdown>
        </Expandable>
      </div>
    </div>
  );
}

/** Indicateur « le cerveau réfléchit… » (remplace la bulle « … »). */
function Thinking() {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
        <span className="flex gap-1" aria-hidden>
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
        </span>
        le cerveau réfléchit…
      </div>
    </div>
  );
}
