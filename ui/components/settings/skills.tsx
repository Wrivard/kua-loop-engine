"use client";

import { useEffect, useState } from "react";
import { getAppSetting, setAppSetting } from "@/lib/queries";
import { SKILLS } from "@/lib/connectors";
import { Switch } from "@/components/ui/switch";
import { isSupabaseConfigured } from "@/lib/supabase";

export function SkillsSettings() {
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getAppSetting("skills").then((v) => setToggles((v as Record<string, boolean>) ?? {}));
  }, []);

  async function toggle(key: string, val: boolean) {
    const next = { ...toggles, [key]: val };
    setToggles(next);
    await setAppSetting("skills", next);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Skills disponibles globalement (catalogue). Activation fine par projet dans la vue projet.
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {SKILLS.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </div>
            <Switch
              checked={!!toggles[s.key]}
              onCheckedChange={(v) => void toggle(s.key, v)}
              aria-label={s.label}
            />
          </div>
        ))}
      </div>
      {!isSupabaseConfigured && (
        <p className="text-xs text-muted-foreground">Mode preview : les changements ne sont pas persistés.</p>
      )}
    </div>
  );
}
