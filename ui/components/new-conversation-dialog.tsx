"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FacadeDot } from "@/components/facade-mark";
import { createThread, ensureLoop } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Loop } from "@/lib/types";

// Types de conversation = presets (façades) + « Général / custom » (instructions
// libres). La façade est une CLÉ OUVERTE ; choisir un type non armé l'arme à la volée.
const TYPES: { key: string; label: string; hint: string }[] = [
  { key: "bugfix", label: "Bugfix", hint: "Corriger un bug" },
  { key: "discord", label: "Modifs", hint: "Changement de contenu / petite modif" },
  { key: "demo", label: "Démo", hint: "Démo pour un prospect" },
  { key: "finish", label: "Site", hint: "Finir le site par lots" },
  { key: "seo", label: "SEO", hint: "Audit / quick-wins SEO" },
  { key: "general", label: "Général / custom", hint: "Instructions libres" },
];

/** « + Nouvelle » : crée une conversation (doc 12). Choisir un type (preset ou
 *  custom), décrire la demande. Le type est armé automatiquement si besoin. */
export function NewConversationDialog({
  projectId,
  loops,
}: {
  projectId: string;
  loops: Loop[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [facade, setFacade] = useState<string | null>(null);
  const [demand, setDemand] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const armed = useMemo(
    () => new Set<string>(loops.filter((l) => l.enabled).map((l) => l.facade)),
    [loops],
  );

  function reset() {
    setFacade(null);
    setDemand("");
    setNotice(null);
    setPending(false);
  }

  async function submit() {
    const text = demand.trim();
    if (!facade || !text || pending) return;
    setPending(true);
    setNotice(null);
    if (!isSupabaseConfigured) {
      setNotice("Mode preview : connecte Supabase pour persister la conversation.");
      setPending(false);
      return;
    }
    const subject = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    try {
      const who = await currentIdentity();
      const loopId = await ensureLoop(projectId, facade); // arme la façade si besoin
      const id = await createThread(projectId, facade, loopId, subject, text, who);
      if (id) {
        setOpen(false);
        reset();
        router.push(`/c/${id}`);
      } else {
        setNotice("Création indisponible.");
      }
    } catch {
      setNotice("Échec de la création. Réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          Nouvelle
        </Button>
      </DialogTrigger>
      <DialogContent side="center">
        <DialogHeader>
          <DialogTitle>Nouvelle conversation</DialogTitle>
          <DialogDescription>Choisis un type, puis décris la demande.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setFacade(t.key)}
                aria-pressed={facade === t.key}
                title={t.hint}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  facade === t.key ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
                )}
              >
                <FacadeDot facade={t.key} />
                {t.label}
                {armed.has(t.key) && <Check className="h-3 w-3 text-emerald-500" aria-hidden />}
              </button>
            ))}
          </div>
          <Textarea
            value={demand}
            onChange={(e) => setDemand(e.target.value)}
            aria-label="Décris la demande"
            placeholder="Ex : Le bouton « Réserver » ne fait rien sur mobile."
            rows={3}
          />
          {notice && <p className="text-xs text-amber-500">{notice}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {facade && !armed.has(facade) ? "Cette façade sera armée (approbation requise)." : ""}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button size="sm" onClick={() => void submit()} disabled={!facade || !demand.trim() || pending}>
                {pending ? "Création…" : "Créer"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
