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
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setName("");
    setRepoUrl("");
    setPlan("base");
    setMode("existing");
    setNotice(null);
    setPending(false);
  }

  async function submit() {
    const n = name.trim();
    if (!n || pending) return;
    setPending(true);
    setNotice(null);
    if (mode === "create") {
      await submitCreateRepo(n);
      return;
    }
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

  // Crée le repo GitHub via la gateway (proxy serveur). Si la gateway n'est pas
  // encore exposée → on affiche la commande CLI (la capacité marche déjà via l'engine).
  async function submitCreateRepo(n: string) {
    try {
      const resp = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, private: true }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.slug) {
        setOpen(false);
        reset();
        onCreated?.();
        router.push(`/p/${data.slug}`);
        return;
      }
      if (resp.status === 503 || resp.status === 502) {
        setNotice(
          `Gateway pas encore exposée. Crée le repo depuis l'engine :\n` +
            `kua project create --name "${n}" --private`,
        );
      } else {
        setNotice(data?.error || data?.status || "Échec de la création du repo.");
      }
    } catch {
      setNotice(`Crée le repo depuis l'engine :\nkua project create --name "${n}" --private`);
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
          {/* Mode : brancher un repo existant, ou en créer un neuf sur GitHub via l'engine. */}
          <div className="flex rounded-lg border border-border p-0.5 text-xs font-medium">
            {([
              ["existing", "Repo existant"],
              ["create", "Créer un repo GitHub"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setNotice(null);
                }}
                aria-pressed={mode === m}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 transition-colors",
                  mode === m ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nom</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Salon Élégance"
              aria-label="Nom du projet"
            />
            {name.trim() && (
              <p className="text-xs text-muted-foreground">
                slug : <code className="font-mono">{slugify(name)}</code>
              </p>
            )}
          </div>
          {mode === "existing" ? (
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
          ) : (
            <p className="rounded-lg border border-border bg-accent/30 p-2.5 text-xs text-muted-foreground">
              Crée un repo <strong>privé</strong> sur GitHub (README, branche main) via l&apos;engine, puis
              l&apos;enregistre comme projet chargé avec une loop <code className="font-mono">general</code>{" "}
              (approve_final). Le token GitHub reste sur le VPS — jamais dans le navigateur.
            </p>
          )}
          {mode === "existing" && (
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
          )}
          {notice && <p className="whitespace-pre-line font-mono text-xs text-warn">{notice}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={!name.trim() || pending}>
              {pending ? "Création…" : mode === "create" ? "Créer le repo" : "Créer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
