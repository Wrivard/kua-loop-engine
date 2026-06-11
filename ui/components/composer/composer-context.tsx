"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AgentProposal } from "@/lib/types";

/** Tour de conversation poussé par le dock vers la vue active (journal d'accueil ou thread). */
export type ComposerTurn =
  | { id: string; role: "user" | "brain" | "system"; text: string }
  | { id: string; role: "proposal"; proposal: AgentProposal };

/** Une vue (accueil / thread) s'enregistre comme « puits » pour rendre les tours. */
export type ComposerSink = { push: (turn: ComposerTurn) => void };

/** Étiquette de cible que la vue déclare au dock (nom de projet, sujet du thread…). */
export type PageScope =
  | { kind: "project"; id: string; name: string }
  | { kind: "thread"; id: string; subject: string; facade: string };

type Ctx = {
  sink: ComposerSink | null;
  registerSink: (s: ComposerSink | null) => void;
  pageScope: PageScope | null;
  setPageScope: (s: PageScope | null) => void;
};

const ComposerCtx = createContext<Ctx | null>(null);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [sink, setSink] = useState<ComposerSink | null>(null);
  const [pageScope, setPageScope] = useState<PageScope | null>(null);
  return (
    <ComposerCtx.Provider value={{ sink, registerSink: setSink, pageScope, setPageScope }}>
      {children}
    </ComposerCtx.Provider>
  );
}

export function useComposer(): Ctx {
  const c = useContext(ComposerCtx);
  if (!c) throw new Error("useComposer must be used within ComposerProvider");
  return c;
}

/** Helper pour une vue : enregistre un puits + un scope le temps du montage. */
export function useComposerSink(sink: ComposerSink | null, scope: PageScope | null) {
  const { registerSink, setPageScope } = useComposer();
  useEffect(() => {
    registerSink(sink);
    setPageScope(scope);
    return () => {
      registerSink(null);
      setPageScope(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.kind, scope?.kind === "thread" ? scope.id : scope?.kind === "project" ? scope.id : null]);
}
