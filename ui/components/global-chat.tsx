"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BrainChat } from "@/components/brain-chat";
import {
  getChatMessages,
  getOrCreateChatSession,
  insertChatMessage,
  newChatSession,
} from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import type { ChatMessage } from "@/lib/types";

// Accueil chat-first : composer conversationnel pleine page, historique persisté (chat_sessions).
export function GlobalChat() {
  const [email, setEmail] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initial, setInitial] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const e = await currentIdentity();
        setEmail(e);
        const sid = await getOrCreateChatSession(e);
        setSessionId(sid);
        setInitial(sid ? await getChatMessages(sid) : []);
      } catch {
        setInitial([]);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  function persist(role: "user" | "brain" | "system", content: string) {
    if (sessionId) void insertChatMessage(sessionId, role, content).catch(() => {});
  }

  async function fresh() {
    const sid = email ? await newChatSession(email).catch(() => null) : null;
    setSessionId(sid);
    setInitial([]);
    setChatKey((k) => k + 1);
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-2xl flex-col px-4 py-3 sm:py-5">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="inline-block h-2 w-2 rounded-full bg-brand" />
            Küa
          </h1>
          <p className="text-xs text-muted-foreground">Dis-moi quoi faire — je propose, tu confirmes.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void fresh()}>
          Nouvelle
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {ready ? (
          <BrainChat
            key={chatKey}
            source="ui"
            initial={initial}
            onTurn={persist}
            greeting="Salut 👋 Décris un bug, une modif, une démo — ou demande un nouveau loop. Je propose, tu confirmes."
            placeholder="Ex : le formulaire d'Alliance plante sur mobile…"
          />
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">…</p>
        )}
      </div>
    </div>
  );
}
