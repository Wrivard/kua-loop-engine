"use client";

import { useLiveQuery } from "@/lib/use-live-query";
import { getAppConnections } from "@/lib/queries";
import { CONNECTOR_TYPES } from "@/lib/connectors";
import { ConnStatus, ConnectorIcon, KindBadge, ScopeBadge } from "@/components/connector-bits";
import { McpWizard } from "@/components/mcp-wizard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { Connection } from "@/lib/types";

export function ConnectorsSettings() {
  const { data: conns } = useLiveQuery<Connection[]>(getAppConnections, ["connections"], []);
  const byType = new Map((conns ?? []).map((c) => [c.type, c]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Connexions au niveau <strong>APP</strong> (partagées). Secret sur le VPS, jamais en base ni ici.
        </p>
        <McpWizard
          scope="app"
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Ajouter MCP
            </Button>
          }
        />
      </div>
      <div className="space-y-2">
        {CONNECTOR_TYPES.map((t) => {
          const c = byType.get(t.type);
          return (
            <div key={t.type} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConnectorIcon />
                    <span className="text-sm font-medium">{t.label}</span>
                    <KindBadge kind={t.kind} />
                    <ScopeBadge shareable={t.shareable} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c
                      ? `${c.label || "connexion app"} · testé ${c.last_checked ? timeAgo(c.last_checked) : "jamais"}`
                      : "aucune connexion app"}
                  </p>
                </div>
                <ConnStatus status={c?.status} />
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
        L'entrée des secrets + le bouton « Tester » <strong>depuis l'UI</strong> arriveront avec le
        bridge/gateway. Pour l'instant : la CLI ci-dessus (ou « + Ajouter MCP » pour les serveurs MCP).
      </p>
    </div>
  );
}
