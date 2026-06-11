"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConnStatus, ScopeBadge } from "@/components/connector-bits";
import { ConnectorIcon } from "@/components/connector-icon";
import { McpWizard } from "@/components/mcp-wizard";
import { Plus } from "lucide-react";
import { useLiveQuery } from "@/lib/use-live-query";
import {
  getAppConnections,
  getProjectConnectors,
  getProjectMcp,
  getProjectSkills,
  setProjectMcp,
  setProjectSkill,
  upsertProjectConnector,
} from "@/lib/queries";
import { CONNECTOR_TYPES, SKILLS } from "@/lib/connectors";
import type { Connection, ProjectConnector, ProjectMcp, ProjectSkill } from "@/lib/types";

type Data = {
  connectors: ProjectConnector[];
  skills: ProjectSkill[];
  mcp: ProjectMcp[];
  appConns: Connection[];
};

export function ProjectSettingsDrawer({
  projectId,
  trigger,
}: {
  projectId: string;
  trigger: ReactNode;
}) {
  const { data, refetch } = useLiveQuery<Data>(
    async () => {
      const [connectors, skills, mcp, appConns] = await Promise.all([
        getProjectConnectors(projectId),
        getProjectSkills(projectId),
        getProjectMcp(projectId),
        getAppConnections(),
      ]);
      return { connectors, skills, mcp, appConns };
    },
    ["project_connectors", "project_skills", "project_mcp", "connections"],
    [projectId],
  );

  const connByType = new Map((data?.connectors ?? []).map((c) => [c.type, c]));
  const appByType = new Map((data?.appConns ?? []).map((c) => [c.type, c]));
  const skillEnabled = new Set((data?.skills ?? []).filter((s) => s.enabled).map((s) => s.skill));

  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");

  async function toggleConnector(type: string, shareable: boolean, enabled: boolean) {
    const mode = shareable ? "inherit" : "own";
    const app = appByType.get(type);
    await upsertProjectConnector(projectId, type, {
      enabled,
      mode,
      connection_id: shareable ? app?.id ?? null : null,
    });
    void refetch();
  }

  async function toggleSkill(skill: string, enabled: boolean) {
    await setProjectSkill(projectId, skill, enabled);
    void refetch();
  }

  async function toggleMcp(name: string, enabled: boolean) {
    await setProjectMcp(projectId, name, { enabled });
    void refetch();
  }

  async function addMcp() {
    const name = mcpName.trim();
    const url = mcpUrl.trim();
    if (!name || !url) return;
    await setProjectMcp(projectId, name, { enabled: true, config: { url } });
    setMcpName("");
    setMcpUrl("");
    void refetch();
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connecteurs · Skills · MCP</DialogTitle>
          <DialogDescription>Ce que reçoit ce projet. Les secrets restent sur le VPS.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 p-4">
          {/* Connecteurs */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-faint">Connecteurs</h3>
            {CONNECTOR_TYPES.map((t) => {
              const binding = connByType.get(t.type);
              const enabled = !!binding?.enabled;
              const app = appByType.get(t.type);
              return (
                <div key={t.type} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ConnectorIcon type={t.type} />
                      <span className="text-sm font-medium">{t.label}</span>
                      <ScopeBadge shareable={t.shareable} />
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => void toggleConnector(t.type, t.shareable, v)}
                      aria-label={`Activer ${t.label}`}
                    />
                  </div>
                  {enabled && t.shareable && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      hérite la connexion app
                      <ConnStatus status={app?.status} />
                    </p>
                  )}
                  {enabled && !t.shareable && (
                    <p className="mt-1.5 overflow-x-auto whitespace-nowrap font-mono text-xs text-muted-foreground">
                      connexion propre — secret via : kua connector set --scope project --project {projectId} --type{" "}
                      {t.type} {t.fields.map((f) => `--${f.name} …`).join(" ")}
                    </p>
                  )}
                </div>
              );
            })}
          </section>

          {/* Skills */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-faint">Skills</h3>
            <div className="divide-y divide-border rounded-lg border border-border">
              {SKILLS.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm">{s.label}</span>
                  <Switch
                    checked={skillEnabled.has(s.key)}
                    onCheckedChange={(v) => void toggleSkill(s.key, v)}
                    aria-label={s.label}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* MCP */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-faint">Serveurs MCP</h3>
              <McpWizard
                scope="project"
                projectId={projectId}
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus className="h-3.5 w-3.5" />
                    Guidé
                  </Button>
                }
              />
            </div>
            <div className="space-y-1">
              {(data?.mcp ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="min-w-0 truncate text-sm">
                    {m.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      {(m.config?.url as string) || ""}
                    </span>
                  </span>
                  <Switch
                    checked={m.enabled}
                    onCheckedChange={(v) => void toggleMcp(m.name, v)}
                    aria-label={m.name}
                  />
                </div>
              ))}
              {(data?.mcp ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun serveur MCP pour ce projet.</p>
              )}
            </div>
            <div className="flex items-end gap-2">
              <Input value={mcpName} onChange={(e) => setMcpName(e.target.value)} placeholder="nom" aria-label="Nom du MCP" />
              <Input value={mcpUrl} onChange={(e) => setMcpUrl(e.target.value)} placeholder="https://…/mcp" aria-label="URL du MCP" />
              <Button size="sm" onClick={() => void addMcp()} disabled={!mcpName.trim() || !mcpUrl.trim()}>
                Ajouter
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Token MCP (si requis) via la CLI — jamais saisi ici.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
