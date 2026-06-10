"use client";

import { useLiveQuery } from "@/lib/use-live-query";
import { getAppConnections } from "@/lib/queries";
import { CONNECTOR_TYPES, CONNECTION_STATUS_LABEL } from "@/lib/connectors";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import type { Connection } from "@/lib/types";

const STATUS_CLASS: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-500",
  error: "bg-red-500/10 text-red-500",
  untested: "bg-muted text-muted-foreground",
};

export function ConnectorsSettings() {
  const { data: conns } = useLiveQuery<Connection[]>(getAppConnections, ["connections"], []);
  const byType = new Map((conns ?? []).map((c) => [c.type, c]));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Connexions au niveau <strong>APP</strong> (partagées entre projets). Le secret vit sur le VPS
        (<code className="font-mono text-xs">/srv/kua/secrets/</code>, chmod 600) — jamais en base, jamais ici.
      </p>
      <div className="space-y-2">
        {CONNECTOR_TYPES.map((t) => {
          const c = byType.get(t.type);
          const status = c?.status ?? "untested";
          return (
            <div key={t.type} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t.label}</span>
                    <Badge className="bg-muted text-muted-foreground">{t.kind}</Badge>
                    <Badge className="bg-muted text-muted-foreground">
                      {t.shareable ? "partageable" : "par projet"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c
                      ? `${c.label || "connexion app"} · testé ${c.last_checked ? timeAgo(c.last_checked) : "jamais"}`
                      : "aucune connexion app"}
                  </p>
                </div>
                <Badge className={STATUS_CLASS[status]}>{CONNECTION_STATUS_LABEL[status]}</Badge>
              </div>
              <p className="mt-2 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                kua connector set --scope app --type {t.type}{" "}
                {t.fields.map((f) => `--${f.name} …`).join(" ")}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        L'entrée des secrets + le bouton « Tester » <strong>depuis l'UI</strong> arriveront avec la
        gateway. Pour l'instant : la CLI ci-dessus (M3) écrit le secret + valide + fixe le statut.
      </p>
    </div>
  );
}
