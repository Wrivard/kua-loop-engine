"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { createThread } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import { facadeLabel, FACADE_ORDER } from "@/lib/facade";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Facade, Loop } from "@/lib/types";

/** « + Nouvelle » : crée une conversation (doc 12). Choisir la façade armée,
 *  taper la demande. En preview (sans backend), la persistance est désactivée. */
export function NewConversationDialog({
  projectId,
  loops,
}: {
  projectId: string;
  loops: Loop[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [facade, setFacade] = useState<Facade | null>(null);
  const [demand, setDemand] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Façades armées (une loop existe) — on ne crée que dans une façade active.
  const armed = useMemo(() => {
    const byFacade = new Map(loops.filter((l) => l.enabled).map((l) => [l.facade, l]));
    return FACADE_ORDER.filter((f) => byFacade.has(f)).map((f) => ({
      facade: f,
      loop: byFacade.get(f)!,
    }));
  }, [loops]);

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
    const subject = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    const loopId = armed.find((a) => a.facade === facade)?.loop.id ?? null;
    try {
      const who = await currentIdentity();
      const id = await createThread(projectId, facade, loopId, subject, text, who);
      if (id) {
        setOpen(false);
        reset();
        router.push(`/c/${id}`);
      } else {
        setNotice("En mode preview, la création est désactivée — connecte Supabase pour persister.");
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
          <DialogDescription>Choisis une façade, puis décris la demande.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-4">
          {armed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune façade armée sur ce projet. Arme une façade dans les filtres pour créer une
              conversation.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {armed.map(({ facade: f }) => (
                  <button
                    key={f}
                    onClick={() => setFacade(f)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      facade === f
                        ? "border-foreground bg-accent"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <FacadeDot facade={f} />
                    {facadeLabel(f)}
                  </button>
                ))}
              </div>
              <Textarea
                value={demand}
                onChange={(e) => setDemand(e.target.value)}
                placeholder="Ex : Le bouton « Réserver » ne fait rien sur mobile."
                rows={3}
              />
              {notice && <p className="text-xs text-amber-500">{notice}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button size="sm" onClick={() => void submit()} disabled={!facade || !demand.trim() || pending}>
                  {pending ? "Création…" : "Créer"}
                </Button>
              </div>
              {!isSupabaseConfigured && (
                <p className="text-[11px] text-muted-foreground">
                  Mode preview : la conversation ne sera pas persistée.
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
