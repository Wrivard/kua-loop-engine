"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Replie tout contenu trop haut (mur de texte) derrière « voir plus ».
 * Mesure le dépassement réel (scrollHeight) → marche pour n'importe quel contenu
 * (markdown, log…). `fadeClass` doit matcher le fond du conteneur pour le dégradé.
 */
export function Expandable({
  children,
  collapsedHeight = 168,
  fadeClass = "from-card",
  className,
}: {
  children: ReactNode;
  collapsedHeight?: number;
  fadeClass?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflow(el.scrollHeight > collapsedHeight + 8);
  }, [children, collapsedHeight]);

  return (
    <div className={className}>
      <div
        ref={ref}
        className="relative overflow-hidden transition-[max-height] duration-200"
        style={{ maxHeight: open ? undefined : collapsedHeight }}
      >
        {children}
        {overflow && !open && (
          <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent", fadeClass)} />
        )}
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-xs font-medium text-brand underline-offset-2 hover:underline"
        >
          {open ? "voir moins" : "voir plus"}
        </button>
      )}
    </div>
  );
}
