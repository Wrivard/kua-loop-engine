"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { setLoopAutonomy } from "@/lib/queries";
import { formatCost } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Autonomy, Loop } from "@/lib/types";

type AutonomyUI = "off" | "manuel" | "approbation" | "auto";

const OPTIONS: { key: AutonomyUI; label: string; hint: string }[] = [
  { key: "off", label: "Désarmée", hint: "Façade inactive — aucun run." },
  { key: "manuel", label: "Manuel", hint: "Tu déclenches chaque run à la main." },
  { key: "approbation", label: "Approbation", hint: "L'agent livre, puis attend ton OK." },
  { key: "auto", label: "Auto", hint: "L'agent agit sans confirmation." },
];

function toUI(loop: Loop): AutonomyUI {
  if (!loop.enabled) return "off";
  if (loop.autonomy === "auto") return "auto";
  if (loop.autonomy === "approve_final") return "approbation";
  return "manuel";
}

function toDb(ui: AutonomyUI): { enabled: boolean; autonomy: Autonomy } {
  switch (ui) {
    case "off":
      return { enabled: false, autonomy: "manual" };
    case "manuel":
      return { enabled: true, autonomy: "manual" };
    case "approbation":
      return { enabled: true, autonomy: "approve_final" };
    case "auto":
      return { enabled: true, autonomy: "auto" };
  }
}

// Monochrome (doc 12) : la couleur est réservée à l'identité de façade et au
// statut des runs. L'autonomie se distingue par le poids, jamais par une teinte.
const PILL_TONE: Record<AutonomyUI, string> = {
  off: "text-muted-foreground",
  manuel: "text-foreground",
  approbation: "text-foreground",
  auto: "text-foreground font-semibold",
};

/** Pill d'autonomie d'une façade (doc 12 : seul réglage de l'UI). Passer en
 *  `auto` demande une confirmation ; interdit sur le moteur (allowAuto=false). */
export function AutonomyPopover({ loop, allowAuto = true }: { loop: Loop; allowAuto?: boolean }) {
  const [current, setCurrent] = useState<AutonomyUI>(toUI(loop));
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [open, setOpen] = useState(false);
  const budget = formatCost(loop.budget_usd);

  async function choose(ui: AutonomyUI) {
    if (ui === "auto" && !confirmAuto) {
      setConfirmAuto(true);
      return;
    }
    const prev = current;
    setCurrent(ui);
    setConfirmAuto(false);
    setOpen(false);
    try {
      const { enabled, autonomy } = toDb(ui);
      await setLoopAutonomy(loop.id, enabled, autonomy);
    } catch {
      setCurrent(prev); // rollback
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setConfirmAuto(false);
      }}
    >
      <PopoverTrigger
        aria-label={`Autonomie : ${OPTIONS.find((o) => o.key === current)?.label}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-accent",
          PILL_TONE[current],
        )}
      >
        {OPTIONS.find((o) => o.key === current)?.label}
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="space-y-0.5">
          {OPTIONS.map((o) => {
            const disabled = o.key === "auto" && !allowAuto;
            const active = o.key === current;
            return (
              <button
                key={o.key}
                disabled={disabled}
                aria-current={active ? "true" : undefined}
                onClick={() => choose(o.key)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  disabled
                    ? "cursor-not-allowed opacity-40"
                    : "hover:bg-accent",
                )}
              >
                <span className="mt-0.5 w-3.5 shrink-0">
                  {active && <Check className="h-3.5 w-3.5" aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {o.label}
                    {o.key === "auto" && confirmAuto && (
                      <span className="ml-2 text-xs font-medium text-foreground">
                        cliquer pour confirmer
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {budget && (
          <p className="border-t border-border px-2 pt-2 mt-1 text-[11px] text-muted-foreground">
            Budget mensuel · {budget}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
