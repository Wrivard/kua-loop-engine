"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FACADE_COLORS, FACADE_LABELS, statusOf } from "@/lib/facade";

type RunRow = {
  id: string;
  status: string;
  goal: string;
  cost_usd: number | null;
  pr_url: string | null;
  created_at: string;
  threads: {
    subject: string;
    facade: string;
    project_id: string | null;
  } | null;
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return new Date(iso).toLocaleDateString("fr-CA");
}

export function RunsList() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("runs")
      .select("id, status, goal, cost_usd, pr_url, created_at, threads(subject, facade, project_id)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setRuns((data as unknown as RunRow[]) ?? []);
  }, []);

  useEffect(() => {
    void fetchRuns();
    // Realtime : tout INSERT/UPDATE sur runs ou threads → refetch (le payload
    // realtime n'inclut pas la jointure thread, et la liste est courte).
    const channel = supabase
      .channel("runs-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, () => void fetchRuns())
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () => void fetchRuns())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchRuns]);

  if (error) {
    return (
      <div className="rounded-lg p-4 shadow-ring dark:shadow-ring-dark">
        <p className="text-sm text-red-700 dark:text-red-300">Erreur de chargement : {error}</p>
        <button
          onClick={() => void fetchRuns()}
          className="mt-3 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-ink"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (runs === null) {
    return (
      <ul className="space-y-3" aria-label="Chargement des runs">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-[72px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-900" />
        ))}
      </ul>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-lg px-6 py-16 text-center shadow-ring dark:shadow-ring-dark">
        <p className="font-medium">Aucun run pour l'instant</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Les runs apparaîtront ici dès qu'un événement en déclenchera un.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {runs.map((run) => {
        const facade = run.threads?.facade ?? "bugfix";
        const status = statusOf(run.status);
        return (
          <li
            key={run.id}
            className="relative overflow-hidden rounded-lg bg-paper p-4 shadow-card transition hover:shadow-ring dark:bg-paper-dark dark:shadow-ring-dark"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ backgroundColor: FACADE_COLORS[facade] ?? "#666666" }}
            />
            <div className="flex items-start justify-between gap-4 pl-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: FACADE_COLORS[facade] }}>
                    {FACADE_LABELS[facade] ?? facade}
                  </span>
                  {run.threads?.project_id ? (
                    <span className="font-mono text-xs text-gray-500">{run.threads.project_id}</span>
                  ) : null}
                </div>
                <p className="mt-1 truncate font-medium">{run.threads?.subject ?? run.goal}</p>
                <p className="mt-1 text-xs text-gray-500">{timeAgo(run.created_at)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}
                >
                  {status.pulse ? (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
                  ) : null}
                  {status.label}
                </span>
                {run.cost_usd && Number(run.cost_usd) > 0 ? (
                  <span className="font-mono text-xs text-gray-500">{Number(run.cost_usd).toFixed(2)} $</span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
