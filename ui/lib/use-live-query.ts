"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/** Table à écouter, avec un filtre PostgREST optionnel (ex. `thread_id=eq.42`). */
export type TableSub = string | { table: string; filter?: string };

type LiveQueryState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
  configured: boolean;
};

function normalize(t: TableSub): { table: string; filter?: string } {
  return typeof t === "string" ? { table: t } : t;
}

/**
 * Exécute `fetcher` puis refetch à chaque changement Realtime sur `tables`.
 * Le payload Realtime ne porte pas les jointures → on refait la requête (les
 * listes sont courtes, contexte borné). Backbone de tous les écrans live.
 *
 * - Chaque instance a son propre canal (useId) : pas de collision quand le même
 *   hook est monté deux fois (sidebar desktop + drawer mobile, Strict Mode).
 * - Un filtre par table réduit les refetch inutiles (contexte borné, doc 12).
 *
 * @param fetcher  requête asynchrone (depuis lib/queries)
 * @param tables   tables à écouter, filtre optionnel (ex. [{table:"messages", filter:`thread_id=eq.${id}`}])
 * @param deps     dépendances qui invalident le fetcher (ex. [projectId])
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  tables: TableSub[],
  deps: ReadonlyArray<unknown> = [],
): LiveQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const instanceId = useId();

  const refetch = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const subs = tables.map(normalize);
  // Clé primitive stable → ré-abonnement uniquement quand les tables/filtres changent.
  const subsKey = subs.map((s) => `${s.table}${s.filter ? `:${s.filter}` : ""}`).join(",");

  useEffect(() => {
    void refetch();
    if (!isSupabaseConfigured) return;

    const channelName = `live:${subsKey}:${instanceId}`;
    let channel = supabase.channel(channelName);
    for (const s of subs) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        () => void refetch(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, subsKey, instanceId]);

  return { data, error, loading, refetch, configured: isSupabaseConfigured };
}
