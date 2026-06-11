"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "error";
type Toast = { id: number; msg: string; tone: Tone };

const ToastCtx = createContext<{ toast: (msg: string, tone?: Tone) => void } | null>(null);

let _tid = 0;

/** Toasts sobres, non bloquants. Au-dessus du dock composer (mobile) / coin bas (desktop). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, tone: Tone = "default") => {
    const id = (_tid += 1);
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {/* Mobile : au-dessus du dock + tab-bar (safe-area incluse) ; desktop : coin bas droit. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pr-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto max-w-sm rounded-lg border bg-popover px-3.5 py-2.5 text-sm shadow-lg duration-200 animate-in fade-in slide-in-from-bottom-2",
              t.tone === "success" && "border-emerald-500/30 text-emerald-500",
              t.tone === "error" && "border-red-500/30 text-red-500",
              t.tone === "default" && "border-border text-foreground",
            )}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastCtx);
  return c?.toast ?? (() => {});
}
