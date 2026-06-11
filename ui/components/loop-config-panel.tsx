"use client";

import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateLoop, updateLoopTrigger } from "@/lib/queries";
import { MODEL_OPTIONS } from "@/lib/connectors";
import { facadeLabel } from "@/lib/facade";
import { cn } from "@/lib/utils";
import type { Autonomy, Loop } from "@/lib/types";

const TRIGGERS = ["manual", "cron", "discord", "sentry"] as const;

// Panneau config d'un loop — MÊME source de vérité que le chat (table loops). Le mode auto
// est visible mais DÉSACTIVÉ (garde-fou) ; les déclencheurs sont UI-seulement pour l'instant.
export function LoopConfigPanel({ loop, trigger }: { loop: Loop; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState(String(loop.budget_usd));
  const [model, setModel] = useState(loop.model);
  const [autonomy, setAutonomy] = useState<Autonomy>(loop.autonomy === "auto" ? "approve_final" : loop.autonomy);
  const [trig, setTrig] = useState<string>(
    (loop.config?.trigger as string) || (loop.schedule_cron ? "cron" : "manual"),
  );
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateLoop(loop.id, { budget_usd: Number(budget) || Number(loop.budget_usd), model, autonomy });
      await updateLoopTrigger(loop.id, trig);
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 700);
    } catch {
      /* no-op : l'UI reste ouverte */
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent side="center">
        <DialogHeader>
          <DialogTitle>Config · {facadeLabel(loop.facade)}</DialogTitle>
          <DialogDescription>Même source de vérité que le chat (table loops).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Autonomie</p>
            <div className="flex flex-wrap gap-1">
              {(["manual", "approve_final"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAutonomy(a)}
                  aria-pressed={autonomy === a}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    autonomy === a ? "border-foreground bg-accent" : "border-border text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {a === "manual" ? "Manuel" : "Approve final"}
                </button>
              ))}
              <span className="flex cursor-not-allowed items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-60">
                <Lock className="h-3 w-3" /> Auto
              </span>
            </div>
            <p className="text-[11px] text-amber-500">
              Le mode auto n'est pas encore activable (allow_auto verrouillé à false — activation façade par façade plus tard).
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Budget par run ($)</p>
            <Input
              type="number"
              min="0.1"
              step="0.5"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              aria-label="Budget"
              className="w-32"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Modèle (override)</p>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-40" aria-label="Modèle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Déclencheur</p>
            <div className="flex flex-wrap gap-1">
              {TRIGGERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTrig(t)}
                  aria-pressed={trig === t}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    trig === t ? "border-foreground bg-accent" : "border-border text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              UI seulement — les déclencheurs réels (cron / discord / sentry) ne sont pas encore branchés.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Fermer
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {done ? "Enregistré ✓" : saving ? "…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
