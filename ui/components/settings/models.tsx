"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "@/lib/use-live-query";
import { getAllLoops, getAppSetting, setAppSetting, updateLoopModel } from "@/lib/queries";
import { MODEL_OPTIONS } from "@/lib/connectors";
import { facadeLabel } from "@/lib/facade";
import { Skeleton } from "@/components/ui/skeleton";
import type { LoopWithProject } from "@/lib/types";

function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (m: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {MODEL_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
      {!MODEL_OPTIONS.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}

export function ModelsSettings() {
  const { data: loops, loading } = useLiveQuery<LoopWithProject[]>(
    getAllLoops,
    ["loops", "projects"],
    [],
  );
  const [defaults, setDefaults] = useState<{ agent?: string; coder?: string }>({});

  useEffect(() => {
    getAppSetting("models").then((v) => setDefaults(v as { agent?: string; coder?: string }));
  }, []);

  async function saveDefault(key: "agent" | "coder", model: string) {
    const next = { ...defaults, [key]: model };
    setDefaults(next);
    await setAppSetting("models", next);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Modèles par défaut</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-xs text-muted-foreground">Agent (cerveau / conversation)</span>
            <ModelSelect value={defaults.agent || "haiku"} onChange={(m) => saveDefault("agent", m)} />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs text-muted-foreground">Coder (claude -p / Runner)</span>
            <ModelSelect value={defaults.coder || "sonnet"} onChange={(m) => saveDefault("coder", m)} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Défauts indicatifs (l'agent est cheap/mid, le coder = Sonnet par défaut, doc 13). Le modèle
          effectif d'un run vient de sa loop, ci-dessous.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Modèle par loop</h2>
        {loading && !loops ? (
          <Skeleton className="h-32 w-full" />
        ) : (loops ?? []).length === 0 ? (
          <p className="rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
            Aucune loop. Arme une façade dans un projet pour la voir ici.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {(loops ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{l.project_name}</span>
                  <span className="text-muted-foreground"> · {facadeLabel(l.facade)}</span>
                </span>
                <ModelSelect value={l.model} onChange={(m) => void updateLoopModel(l.id, m)} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
