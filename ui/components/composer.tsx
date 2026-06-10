"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { insertMessage } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";

/**
 * Composer → parle à l'agent de la façade (chemin nuancé, doc 12). Poste un
 * message `user` ; l'agent (couche conversationnelle) répondra / relancera un run.
 * onSend permet au parent d'afficher le message en optimiste.
 */
export function Composer({
  threadId,
  onSend,
}: {
  threadId: string;
  onSend?: (content: string, author: string) => void;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);

  async function send() {
    const content = value.trim();
    if (!content || pending) return;
    setPending(true);
    try {
      const who = await currentIdentity();
      await insertMessage(threadId, "user", content, who);
      onSend?.(content, who);
      setValue("");
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        aria-label="Message à l'agent"
        placeholder="Écrire à l'agent…  (Entrée pour envoyer)"
        className="min-h-[40px] max-h-40 border-0 bg-transparent px-2 py-2 focus-visible:ring-0"
      />
      <Button
        size="icon"
        onClick={() => void send()}
        disabled={!value.trim() || pending}
        aria-label="Envoyer"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  );
}
