"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useComposerSink, type ComposerTurn } from "@/components/composer/composer-context";
import { Markdown } from "@/lib/markdown";
import { Expandable } from "@/components/expandable";
import { getChatMessages, getOrCreateChatSession, insertChatMessage, newChatSession } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { cn } from "@/lib/utils";

let _uid = 0;
const uid = () => `j${(_uid += 1)}`;

/** Accueil = journal de la conversation globale avec le cerveau. La SAISIE vient du
 *  dock (composer omniprésent) ; ici on rend les tours + on persiste l'historique. */
export function BrainJournal() {
  const [turns, setTurns] = useState<ComposerTurn[]>([]);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const emailRef = useRef<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const email = await currentIdentity();
        emailRef.current = email;
        const sid = await getOrCreateChatSession(email);
        sessionRef.current = sid;
        const msgs = sid ? await getChatMessages(sid) : [];
        setTurns(msgs.map((m) => ({ id: uid(), role: m.role, text: m.content }) as ComposerTurn));
      } catch {
        /* preview — pas de backend */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const sink = useMemo(
    () => ({
      push: (t: ComposerTurn) => {
        setTurns((prev) => [...prev, t]);
        if (t.role !== "proposal" && sessionRef.current) {
          void insertChatMessage(sessionRef.current, t.role, t.text).catch(() => {});
        }
      },
    }),
    [],
  );
  useComposerSink(sink, null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  async function fresh() {
    const sid = emailRef.current ? await newChatSession(emailRef.current).catch(() => null) : null;
    sessionRef.current = sid;
    setTurns([]);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-5 sm:px-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="inline-block h-2 w-2 rounded-full bg-brand" />
            Küa
          </h1>
          <p className="text-xs text-muted-foreground">Dis-moi quoi faire — je propose, tu confirmes.</p>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => void fresh()}
            className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Nouvelle
          </button>
        )}
      </div>

      {ready && turns.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm">Salut 👋 Décris un bug, une modif, une démo — ou demande un nouveau loop.</p>
          <p className="mt-1 text-xs text-muted-foreground">Tape en bas ↓ — ou « @projet » pour cibler un client.</p>
        </div>
      )}

      <div className="space-y-3">
        {turns.map((t) => (
          <JournalTurn key={t.id} turn={t} />
        ))}
      </div>
      <div ref={endRef} />
    </div>
  );
}

function JournalTurn({ turn }: { turn: ComposerTurn }) {
  if (turn.role === "proposal") return null; // les propositions vivent dans le dock
  if (turn.role === "system") {
    return (
      <div className="flex items-center gap-3 py-0.5 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-center text-[11px]">{turn.text}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg bg-secondary px-3.5 py-2 text-sm leading-relaxed text-secondary-foreground">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex justify-start")}>
      <div className="max-w-[88%] rounded-lg rounded-tl-sm border border-border bg-card px-3.5 py-2.5">
        <Expandable collapsedHeight={200} fadeClass="from-card">
          <Markdown>{turn.text}</Markdown>
        </Expandable>
      </div>
    </div>
  );
}
