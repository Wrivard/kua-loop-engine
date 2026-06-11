"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ProposalCard, type ConfirmedProposal } from "@/components/proposal-card";
import { FacadeDot } from "@/components/facade-mark";
import { useComposer, type ComposerTurn } from "@/components/composer/composer-context";
import { useToast } from "@/components/ui/toast";
import { getProjects, insertMessage } from "@/lib/queries";
import { applyProposal } from "@/lib/apply-proposal";
import { currentIdentity } from "@/lib/auth";
import { Markdown } from "@/lib/markdown";
import { activeMentionQuery, applyMention, buildSuggestions, resolveProjectMention } from "@/lib/mention";
import { facadeLabel } from "@/lib/facade";
import { cn } from "@/lib/utils";
import type { AgentProposal, Project } from "@/lib/types";

let _uid = 0;
const uid = () => `c${(_uid += 1)}`;

type Target =
  | { kind: "global" }
  | { kind: "project"; id: string; name: string }
  | { kind: "thread"; id: string; subject: string; facade: string };

/** Composer DOCK — l'entrée UNIQUE, fixe en bas de toutes les vues. Mode dérivé de
 *  la route : global/projet → cerveau (proposition inline) ; thread → agent de façade. */
export function ComposerDock() {
  const pathname = usePathname();
  const router = useRouter();
  const { sink, pageScope } = useComposer();
  const toast = useToast();

  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<(AgentProposal & { project_id?: string }) | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mention, setMention] = useState<{ id: string; name: string } | null>(null);
  // Tours locaux : affichés en strip quand la vue n'a PAS de journal (sink null).
  const [localTurns, setLocalTurns] = useState<ComposerTurn[]>([]);
  const history = useRef<{ role: string; content: string }[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void getProjects().then(setProjects).catch(() => {});
  }, []);
  // Changement de route → on repart propre (cible, proposition, historique, strip).
  useEffect(() => {
    setMention(null);
    setProposal(null);
    setInput("");
    setLocalTurns([]);
    history.current = [];
  }, [pathname]);

  const threadId = pathname.startsWith("/c/") ? pathname.slice(3).split("/")[0] : null;
  const slug = pathname.startsWith("/p/") ? pathname.slice(3).split("/")[0] : null;
  const isThread = !!threadId;
  const isLogin = pathname === "/login";

  const target: Target = mention
    ? { kind: "project", id: mention.id, name: mention.name }
    : isThread
      ? pageScope?.kind === "thread"
        ? pageScope
        : { kind: "thread", id: threadId!, subject: "conversation", facade: "" }
      : slug
        ? pageScope?.kind === "project"
          ? pageScope
          : { kind: "project", id: slug, name: slug }
        : { kind: "global" };

  const mentionQ = activeMentionQuery(input);
  const suggestions = mentionQ != null ? buildSuggestions(mentionQ, projects) : [];

  function pushTurn(t: ComposerTurn) {
    if (sink) sink.push(t);
    else setLocalTurns((prev) => [...prev, t]); // pas de journal sur cette vue → strip local
  }

  function pickSuggestion(value: string, kind: "project" | "facade") {
    setInput((cur) => applyMention(cur, value));
    if (kind === "project") {
      const p = projects.find((x) => x.id === value);
      if (p) setMention({ id: p.id, name: p.name });
    }
    taRef.current?.focus();
  }

  async function send() {
    const raw = input.trim();
    if (!raw || thinking || busy) return;

    if (target.kind === "thread") {
      // Thread → agent de façade (insertMessage). Écho optimiste via le puits.
      setInput("");
      try {
        const who = await currentIdentity();
        pushTurn({ id: uid(), role: "user", text: raw });
        await insertMessage(target.id, "user", raw, who);
      } catch {
        toast("Envoi échoué", "error");
      }
      return;
    }

    // Global / projet → cerveau.
    const fallbackProject = target.kind === "project" ? target.id : null;
    const { projectId, cleaned } = resolveProjectMention(raw, projects, fallbackProject);
    const message = cleaned || raw;
    setInput("");
    pushTurn({ id: uid(), role: "user", text: message });
    history.current.push({ role: "user", content: message });
    setThinking(true);
    try {
      const r = await fetch("/api/agent/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.current.slice(0, -1), project_id: projectId, source: "ui" }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 503) {
        pushTurn({ id: uid(), role: "system", text: "Le cerveau n'est pas encore joignable (exposition Cloudflare en attente)." });
        return;
      }
      if (!r.ok || data?.status !== "ok") {
        pushTurn({ id: uid(), role: "system", text: data?.message || "Le cerveau a eu un souci. Réessaie." });
        return;
      }
      const p: AgentProposal = data.proposal;
      if (p.resume_humain) {
        pushTurn({ id: uid(), role: "brain", text: p.resume_humain });
        history.current.push({ role: "brain", content: p.resume_humain });
      }
      if (p.questions_manquantes?.length) {
        pushTurn({ id: uid(), role: "brain", text: p.questions_manquantes.map((q) => `- ${q}`).join("\n") });
      } else if (p.action !== "none") {
        setProposal({ ...p, project_id: projectId ?? undefined });
      }
    } catch {
      pushTurn({ id: uid(), role: "system", text: "Appel échoué. Réessaie." });
    } finally {
      setThinking(false);
    }
  }

  async function confirm(cp: ConfirmedProposal) {
    setBusy(true);
    try {
      const res = await applyProposal(cp);
      setProposal(null);
      history.current = [];
      if (res?.kind === "thread") {
        toast("Thread créé ✅", "success");
        router.push(`/c/${res.id}`);
      } else if (res?.kind === "loop" || res?.kind === "project") {
        toast("Fait ✅", "success");
        router.push(`/p/${res.id}`);
      } else if (res?.kind === "act") {
        toast("Appliqué ✅", "success");
      } else {
        toast("Action refusée", "error");
      }
    } catch {
      toast("Action échouée", "error");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mentionQ != null && suggestions.length) {
        pickSuggestion(suggestions[0].value, suggestions[0].kind);
        return;
      }
      void send();
    }
  }

  if (isLogin) return null;

  const placeholder =
    target.kind === "thread"
      ? "Réponds à l'agent…"
      : target.kind === "project"
        ? `Sur ${target.name} : décris une tâche…`
        : "Décris une tâche, ou tape @ pour cibler un projet…";

  return (
    <div className="shrink-0 bg-gradient-to-t from-background via-background/95 to-background/0 pt-1.5">
      <div className="mx-auto w-full max-w-[45rem] px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        {/* Strip de conversation (vues sans journal : inbox, projet, activité…) */}
        {!sink && localTurns.length > 0 && (
          <div className="mb-2 max-h-[40vh] space-y-2.5 overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-float animate-slide-in">
            {localTurns.slice(-8).map((t) => (
              <DockTurn key={t.id} turn={t} />
            ))}
          </div>
        )}

        {/* Proposition inline (au-dessus du dock) */}
        {proposal && (
          <div className="mb-2 max-h-[55vh] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-float animate-slide-in">
            <ProposalCard
              proposal={proposal}
              projects={projects}
              defaultProjectId={proposal.project_id}
              onConfirm={confirm}
              onAdjust={() => setProposal(null)}
              onCancel={() => setProposal(null)}
              busy={busy}
            />
          </div>
        )}

        {/* Autocomplete @mention */}
        {mentionQ != null && suggestions.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-md border border-border bg-popover shadow-float animate-fade-in">
            {suggestions.map((s) => (
              <button
                key={`${s.kind}:${s.value}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickSuggestion(s.value, s.kind);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
              >
                {s.kind === "facade" ? (
                  <FacadeDot facade={s.value} />
                ) : (
                  <span className="text-[11px] font-medium uppercase text-muted-foreground">projet</span>
                )}
                <span className="font-medium">{s.label}</span>
                {s.kind === "facade" && <span className="text-xs text-muted-foreground">façade</span>}
              </button>
            ))}
          </div>
        )}

        {/* Chip de scope */}
        {target.kind !== "global" && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-xs">
              {target.kind === "thread" ? (
                <>
                  {target.facade && <FacadeDot facade={target.facade} />}
                  <span className="max-w-[14rem] truncate">{target.subject}</span>
                </>
              ) : (
                <span className="max-w-[14rem] truncate font-medium">{target.name}</span>
              )}
            </span>
            {mention && (
              <button
                type="button"
                onClick={() => setMention(null)}
                aria-label="Retirer la cible"
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Dock */}
        {thinking && (
          <p className="flex items-center gap-2 px-1 pb-1.5 text-xs text-faint">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" aria-hidden />
            le cerveau réfléchit…
          </p>
        )}

        {/* Le dock : surface élevée flottante, focus-ring brand. */}
        <div className="flex items-end gap-2 rounded-lg border border-border bg-popover p-2 shadow-float transition-colors duration-150 focus-within:border-brand/40">
          <Textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label="Composer"
            placeholder={placeholder}
            className="max-h-40 min-h-[40px] border-0 bg-transparent px-2 py-2 focus-visible:ring-0"
          />
          <Button
            size="icon"
            onClick={() => void send()}
            disabled={!input.trim() || thinking || busy}
            aria-label="Envoyer"
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Rendu d'un tour dans le strip local (grammaire : user bulle / agent prose / événement). */
function DockTurn({ turn }: { turn: ComposerTurn }) {
  if (turn.role === "proposal") return null;
  if (turn.role === "system") {
    return <p className="text-center text-xs text-faint">{turn.text}</p>;
  }
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg rounded-br-sm bg-secondary px-3 py-1.5 text-base text-secondary-foreground">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[92%]">
      <Markdown>{turn.text}</Markdown>
    </div>
  );
}
