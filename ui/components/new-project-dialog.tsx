"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "projet"
  );
}

/** Crée un projet depuis l'UI : client, prospect, ou nouveau site (repo vide). */
export function NewProjectDialog({
  trigger,
  onCreated,
}: {
  trigger: ReactNode;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [plan, setPlan] = useState<Plan>("base");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setName("");
    setRepoUrl("");
    setPlan("base");
    setNotice(null);
    setPending(false);
  }

  async function submit() {
    const n = name.trim();
    if (!n || pending) return;
    setPending(true);
    setNotice(null);
    if (!isSupabaseConfigured) {
      setNotice("Mode preview : connecte Supabase pour créer un projet.");
      setPending(false);
      return;
    }
    const id = slugify(n);
    try {
      const created = await createProject(id, n, repoUrl.trim(), plan);
      if (created) {
        setOpen(false);
        reset();
        onCreated?.();
        router.push(`/p/${created}`);
      } else {
        setNotice("Création indisponible.");
      }
    } catch {
      setNotice(`Échec — le slug « ${id} » existe peut-être déjà.`);
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent side="center">
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
          <DialogDescription>Un client, un prospect, ou un nouveau site à construire.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nom</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Salon Élégance"
              aria-label="Nom du projet"
            />
            {name.trim() && (
              <p className="text-[11px] text-muted-foreground">
                slug : <code className="font-mono">{slugify(name)}</code>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Repo git <span className="font-normal">(vide = nouveau projet à créer)</span>
            </label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="github.com/org/repo (optionnel)"
              aria-label="URL du repo"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Plan</span>
            {(["base", "premium"] as Plan[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlan(p)}
                aria-pressed={plan === p}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                  plan === p ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {notice && <p className="text-xs text-amber-500">{notice}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={!name.trim() || pending}>
              {pending ? "Création…" : "Créer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
