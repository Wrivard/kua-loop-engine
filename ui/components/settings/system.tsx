"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { getSystemSettings, setPaused } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SystemHealth } from "@/components/settings/system-health";
import { SystemLogs } from "@/components/settings/system-logs";
import { SystemDebug } from "@/components/settings/system-debug";

function PauseControl() {
  const [paused, setPausedState] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getSystemSettings();
        setPausedState(s?.paused ?? false);
      } catch {
        setPausedState(false);
      }
    })();
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    setErr(null);
    setPausedState(next); // optimiste
    try {
      await setPaused(next);
    } catch {
      setPausedState(!next); // rollback
      setErr("Échec de l'écriture (connexion requise).");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium">Pause du moteur</p>
          <p className="text-xs text-muted-foreground">
            En pause : aucun nouveau run ne démarre ; les runs en cours finissent. Le « débrancher »
            sécuritaire (marche sans la gateway).
          </p>
        </div>
        <Switch
          checked={paused === true}
          disabled={paused === null || saving || !isSupabaseConfigured}
          onCheckedChange={(v) => void toggle(v)}
          aria-label="Pause du moteur"
        />
      </div>
      {paused && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          ⏸ Moteur en pause — les nouveaux runs attendent la reprise.
        </p>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </section>
  );
}

export function SystemSettingsPanel() {
  return (
    <div className="space-y-6">
      <PauseControl />
      <SystemHealth />
      <SystemLogs />
      <SystemDebug />
    </div>
  );
}
