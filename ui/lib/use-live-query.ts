"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

type LiveQueryState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
  configured: boolean;
};

/**
 * Exécute `fetcher` puis refetch à chaque changement Realtime sur `tables`.
 * Le payload Realtime ne porte pas les jointures → on refait la requête (les
 * listes sont courtes, contexte borné). Backbone de tous les écrans live.
 *
 * @param fetcher  requête asynchrone (depuis lib/queries)
 * @param tables   tables Postgres à écouter (ex. ["threads","runs","approvals"])
 * @param deps     dépendances qui invalident le fetcher (ex. [projectId])
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  tables: string[],
  deps: ReadonlyArray<unknown> = [],
): LiveQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

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

  useEffect(() => {
    void refetch();
    if (!isSupabaseConfigured) return;

    const channelName = `live:${tables.join("-")}:${deps.join("-")}`;
    let channel = supabase.channel(channelName);
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => void refetch(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  return { data, error, loading, refetch, configured: isSupabaseConfigured };
}
