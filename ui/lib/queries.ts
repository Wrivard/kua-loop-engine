// Fonctions de requête Supabase (PostgREST). Utilisées par les écrans (client
// components) qui s'abonnent en plus au Realtime via useLiveQuery.
// Contexte borné (CLAUDE.md) : on ne charge jamais l'historique des autres threads.

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  seedAllLoops,
  seedInboxGroups,
  seedLoopsByProject,
  seedMonthCost,
  seedProjectById,
  seedProjects,
  seedRunsByThread,
  seedSidebarProjects,
  seedThread,
  seedThreadMessages,
  seedThreadsByProject,
} from "@/lib/seed";
import { FACADE_ORDER } from "@/lib/facade";
import { monthStartDate } from "@/lib/utils";
import type {
  AgentProposal,
  ApprovalDecision,
  Autonomy,
  ChatMessage,
  Connection,
  Facade,
  InboxGroup,
  Loop,
  LoopWithProject,
  MessageRole,
  MessageWithRun,
  Plan,
  Project,
  ProjectConnector,
  ProjectMcp,
  ProjectSkill,
  RunRow,
  SidebarProject,
  SystemSettings,
  ThreadListItem,
  ThreadRow,
} from "@/lib/types";

type EmbeddedRun = Pick<
  RunRow,
  "id" | "status" | "cost_usd" | "pr_url" | "preview_url" | "summary" | "created_at"
>;

function latestRun(runs: EmbeddedRun[] | null | undefined): EmbeddedRun | null {
  if (!runs || runs.length === 0) return null;
  return [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function toListItem(row: ThreadRow & { runs?: EmbeddedRun[] }): ThreadListItem {
  const run = latestRun(row.runs);
  const { runs: _runs, ...thread } = row;
  return {
    ...thread,
    latest_run: run
      ? {
          id: run.id,
          status: run.status,
          cost_usd: run.cost_usd,
          pr_url: run.pr_url,
          preview_url: run.preview_url,
        }
      : null,
    last_message_preview: run?.summary ?? null,
  };
}

export async function getProjects(): Promise<Project[]> {
  if (!isSupabaseConfigured) return seedProjects();
  const { data, error } = await supabase.from("projects").select("*").order("name");
  if (error) throw error;
  return (data as Project[]) ?? [];
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  if (!isSupabaseConfigured) return seedProjectById(slug);
  const { data, error } = await supabase.from("projects").select("*").eq("id", slug).maybeSingle();
  if (error) throw error;
  return (data as Project) ?? null;
}

export async function getLoopsByProject(projectId: string): Promise<Loop[]> {
  if (!isSupabaseConfigured) return seedLoopsByProject(projectId);
  const { data, error } = await supabase
    .from("loops")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data as Loop[]) ?? [];
}

/** Inbox : toutes les conversations à confirmer, groupées par projet (doc 12). */
export async function getInboxGroups(): Promise<InboxGroup[]> {
  if (!isSupabaseConfigured) return seedInboxGroups();
  const { data, error } = await supabase
    .from("threads")
    .select(
      "*, runs(id,status,cost_usd,pr_url,preview_url,summary,created_at), projects(id,name,plan)",
    )
    .eq("status", "awaiting_approval")
    .order("last_activity_at", { ascending: false });
  if (error) throw error;

  const rows = (data as (ThreadRow & {
    runs?: EmbeddedRun[];
    projects?: Pick<Project, "id" | "name" | "plan"> | null;
  })[]) ?? [];

  const groups = new Map<string, InboxGroup>();
  for (const row of rows) {
    const proj = row.projects ?? {
      id: row.project_id ?? "—",
      name: row.project_id ?? "Sans projet",
      plan: "base" as const,
    };
    if (!groups.has(proj.id)) groups.set(proj.id, { project: proj, threads: [] });
    groups.get(proj.id)!.threads.push(toListItem(row));
  }
  return [...groups.values()];
}

/** Données de la sidebar : projets + compte « à confirmer » + façades armées. */
export async function getSidebarProjects(): Promise<SidebarProject[]> {
  if (!isSupabaseConfigured) return seedSidebarProjects();

  const [projectsRes, loopsRes, awaitingRes] = await Promise.all([
    supabase.from("projects").select("id,name,is_engine").order("name"),
    supabase.from("loops").select("project_id,facade,enabled").eq("enabled", true),
    supabase.from("threads").select("project_id").eq("status", "awaiting_approval"),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (loopsRes.error) throw loopsRes.error;
  if (awaitingRes.error) throw awaitingRes.error;

  const loops = (loopsRes.data as { project_id: string; facade: Facade }[]) ?? [];
  const awaiting = (awaitingRes.data as { project_id: string | null }[]) ?? [];
  const countByProject = new Map<string, number>();
  for (const t of awaiting) {
    if (!t.project_id) continue;
    countByProject.set(t.project_id, (countByProject.get(t.project_id) ?? 0) + 1);
  }
  const facadesByProject = new Map<string, Set<Facade>>();
  for (const l of loops) {
    if (!facadesByProject.has(l.project_id)) facadesByProject.set(l.project_id, new Set());
    facadesByProject.get(l.project_id)!.add(l.facade);
  }

  const projects = (projectsRes.data as Pick<Project, "id" | "name" | "is_engine">[]) ?? [];
  return projects.map((p) => {
    const set = facadesByProject.get(p.id) ?? new Set<Facade>();
    return {
      id: p.id,
      name: p.name,
      is_engine: p.is_engine,
      awaiting: countByProject.get(p.id) ?? 0,
      facades: FACADE_ORDER.filter((f) => set.has(f)),
    };
  });
}

/** Toutes les conversations d'un projet (l'appelant sépare actives / archivées). */
export async function getThreadsByProject(projectId: string): Promise<ThreadListItem[]> {
  if (!isSupabaseConfigured) return seedThreadsByProject(projectId);
  const { data, error } = await supabase
    .from("threads")
    .select("*, runs(id,status,cost_usd,pr_url,preview_url,summary,created_at)")
    .eq("project_id", projectId)
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return ((data as (ThreadRow & { runs?: EmbeddedRun[] })[]) ?? []).map(toListItem);
}

export async function getThread(threadId: string): Promise<ThreadRow | null> {
  if (!isSupabaseConfigured) return seedThread(threadId);
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw error;
  return (data as ThreadRow) ?? null;
}

/** Messages d'UNE conversation, run joint si role = "run", ordre chronologique. */
export async function getThreadMessages(threadId: string): Promise<MessageWithRun[]> {
  if (!isSupabaseConfigured) return seedThreadMessages(threadId);
  const { data, error } = await supabase
    .from("messages")
    .select("*, run:runs(*)")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as MessageWithRun[]) ?? [];
}

/** Runs bruts d'une conversation (fallback si pas encore de messages role=run). */
export async function getRunsByThread(threadId: string): Promise<RunRow[]> {
  if (!isSupabaseConfigured) return seedRunsByThread(threadId);
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as RunRow[]) ?? [];
}

/** Coût du mois courant pour un projet (somme runs.cost_usd des threads du projet). */
export async function getMonthCost(projectId: string): Promise<number> {
  if (!isSupabaseConfigured) return seedMonthCost(projectId);
  const monthStart = monthStartDate().toISOString();
  const { data, error } = await supabase
    .from("runs")
    .select("cost_usd, created_at, threads!inner(project_id)")
    .eq("threads.project_id", projectId)
    .gte("created_at", monthStart);
  if (error) throw error;
  const rows = (data as { cost_usd: number | string | null }[]) ?? [];
  return rows.reduce((sum, r) => sum + (r.cost_usd ? Number(r.cost_usd) : 0), 0);
}

// --- Settings : modèles, connecteurs (app), réglages app ---

/** Toutes les loops (avec nom de projet) — table des modèles dans Settings. */
export async function getAllLoops(): Promise<LoopWithProject[]> {
  if (!isSupabaseConfigured) return seedAllLoops();
  const { data, error } = await supabase
    .from("loops")
    .select("*, projects(name)")
    .order("project_id");
  if (error) throw error;
  return ((data as (Loop & { projects?: { name: string } | null })[]) ?? []).map((r) => {
    const { projects, ...loop } = r;
    return { ...loop, project_name: projects?.name ?? loop.project_id } as LoopWithProject;
  });
}

/** Connexions de scope app (Settings → Connecteurs). */
export async function getAppConnections(): Promise<Connection[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("scope", "app")
    .order("type");
  if (error) throw error;
  return (data as Connection[]) ?? [];
}

/** Réglage app (JSON) par clé (ex. agent_model, coder_model, skills). */
export async function getAppSetting(key: string): Promise<Record<string, unknown>> {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return ((data as { value: Record<string, unknown> } | null)?.value) ?? {};
}

// --- Écritures ---

/** Écrit un réglage app (upsert par clé). No-op en preview. */
export async function setAppSetting(key: string, value: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

/** Change le modèle d'une loop (Settings → Modèles). No-op en preview. */
export async function updateLoopModel(loopId: string, model: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("loops").update({ model }).eq("id", loopId);
  if (error) throw error;
}

/** Crée/arme une loop (project_id, facade) avec des défauts SÛRS : approve_final, jamais auto.
 *  `allow_auto` vit sur projects (reste false) — non touché ici. Retourne l'id, ou null en preview. */
export async function createLoop(
  projectId: string,
  facade: string,
  opts: { budget_usd?: number; model?: string } = {},
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("loops")
    .upsert(
      {
        project_id: projectId,
        facade,
        enabled: true,
        autonomy: "approve_final", // JAMAIS auto à la création
        budget_usd: opts.budget_usd ?? 5,
        model: opts.model ?? "sonnet",
      },
      { onConflict: "project_id,facade" },
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

/** Met à jour des champs d'une loop (M4 chat / M5 panneau). `autonomy="auto"` REFUSÉ ici aussi
 *  (défense en profondeur ; l'allowlist serveur /api/agent/act est la garde principale). */
export async function updateLoop(
  loopId: string,
  patch: { budget_usd?: number; model?: string; autonomy?: Autonomy; enabled?: boolean },
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const clean: Record<string, unknown> = {};
  if (patch.budget_usd != null) clean.budget_usd = patch.budget_usd;
  if (patch.model) clean.model = patch.model;
  if (patch.autonomy && patch.autonomy !== "auto") clean.autonomy = patch.autonomy;
  if (patch.enabled != null) clean.enabled = patch.enabled;
  if (Object.keys(clean).length === 0) return;
  const { error } = await supabase.from("loops").update(clean).eq("id", loopId);
  if (error) throw error;
}

/** Persiste le déclencheur choisi dans loops.config (UI seulement — pas encore branché). */
export async function updateLoopTrigger(loopId: string, trigger: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data } = await supabase.from("loops").select("config").eq("id", loopId).maybeSingle();
  const config = { ...((data as { config?: Record<string, unknown> } | null)?.config ?? {}), trigger };
  const { error } = await supabase.from("loops").update({ config }).eq("id", loopId);
  if (error) throw error;
}

// --- Chat-first : sessions + messages (accueil conversationnel, migration 007) ---

/** Dernière session de chat de l'utilisateur, sinon en crée une. null en preview. */
export async function getOrCreateChatSession(email: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((data as { id: string } | null)?.id) return (data as { id: string }).id;
  const { data: created, error } = await supabase
    .from("chat_sessions")
    .insert({ user_email: email })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return (created as { id: string } | null)?.id ?? null;
}

/** Démarre une NOUVELLE session de chat. */
export async function newChatSession(email: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_email: email })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as ChatMessage[]) ?? [];
}

export async function insertChatMessage(
  sessionId: string,
  role: "user" | "brain" | "system",
  content: string,
  proposal?: AgentProposal | null,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("chat_messages")
    .insert({ session_id: sessionId, role, content, proposal: proposal ?? null });
  if (error) throw error;
}

// --- Système (pause moteur) — écrit DIRECTEMENT via Supabase (marche sans la gateway) ---

/** Réglages système (singleton id=1). null en preview. */
export async function getSystemSettings(): Promise<SystemSettings | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("system_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return (data as SystemSettings | null) ?? null;
}

/** Met le moteur en pause / le reprend. Le worker vérifie ce flag avant de claim un run. */
export async function setPaused(paused: boolean): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("system_settings")
    .update({ paused, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

// --- Bindings par projet (connecteurs / skills / mcp) ---

export async function getProjectConnectors(projectId: string): Promise<ProjectConnector[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("project_connectors")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data as ProjectConnector[]) ?? [];
}

export async function upsertProjectConnector(
  projectId: string,
  type: string,
  patch: { enabled?: boolean; mode?: string; connection_id?: string | null; config?: Record<string, unknown> },
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("project_connectors")
    .upsert({ project_id: projectId, type, ...patch }, { onConflict: "project_id,type" });
  if (error) throw error;
}

export async function getProjectSkills(projectId: string): Promise<ProjectSkill[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("project_skills")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data as ProjectSkill[]) ?? [];
}

export async function setProjectSkill(projectId: string, skill: string, enabled: boolean): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("project_skills")
    .upsert({ project_id: projectId, skill, enabled }, { onConflict: "project_id,skill" });
  if (error) throw error;
}

export async function getProjectMcp(projectId: string): Promise<ProjectMcp[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("project_mcp").select("*").eq("project_id", projectId);
  if (error) throw error;
  return (data as ProjectMcp[]) ?? [];
}

export async function setProjectMcp(
  projectId: string,
  name: string,
  patch: { enabled?: boolean; config?: Record<string, unknown> },
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("project_mcp")
    .upsert({ project_id: projectId, name, ...patch }, { onConflict: "project_id,name" });
  if (error) throw error;
}


/** Enregistre une décision dans `approvals` (doc 12 : UI et Discord écrivent ici). */
export async function insertApproval(
  runId: string,
  decision: ApprovalDecision,
  decidedBy: string,
  comment?: string,
): Promise<void> {
  if (!isSupabaseConfigured) return; // preview : no-op (l'UI met à jour en optimiste)
  const { error } = await supabase
    .from("approvals")
    .insert({ run_id: runId, decision, decided_by: decidedBy, comment: comment ?? null });
  if (error) throw error;
}

/** Règle l'autonomie d'une façade (doc 12 : off/manuel/approbation/auto).
 *  off = loop désarmée (enabled=false). Le commit loops.yaml est géré côté backend. */
export async function setLoopAutonomy(
  loopId: string,
  enabled: boolean,
  autonomy: Autonomy,
): Promise<void> {
  if (!isSupabaseConfigured) return; // preview : no-op
  const { error } = await supabase.from("loops").update({ enabled, autonomy }).eq("id", loopId);
  if (error) throw error;
}

/** Arme une façade (loop) si absente — approve_final + budget par défaut (règle #2) —
 *  et retourne son id. Façade OUVERTE (preset ou libre). No-op (null) en preview. */
export async function ensureLoop(projectId: string, facade: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { error } = await supabase.from("loops").upsert(
    {
      project_id: projectId,
      facade,
      enabled: true,
      autonomy: "approve_final",
      model: "sonnet",
      budget_usd: 5,
      timeout_min: 30,
    },
    { onConflict: "project_id,facade", ignoreDuplicates: true },
  );
  if (error) throw error;
  const { data, error: selErr } = await supabase
    .from("loops")
    .select("id")
    .eq("project_id", projectId)
    .eq("facade", facade)
    .maybeSingle();
  if (selErr) throw selErr;
  return (data as { id: string } | null)?.id ?? null;
}

/** Crée un projet (slug + nom + repo_url ; repo_url vide = « nouveau projet » côté
 *  Runner). Retourne l'id (slug), ou null en preview. */
export async function createProject(
  id: string,
  name: string,
  repoUrl: string,
  plan: Plan = "base",
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { error } = await supabase
    .from("projects")
    .insert({ id, name, repo_url: repoUrl, plan });
  if (error) throw error;
  return id;
}

/** Crée une conversation (doc 12 : insère threads + 1er message ; le Runner
 *  déclenchera le 1er run). Façade OUVERTE. Retourne l'id du thread, ou null en preview. */
export async function createThread(
  projectId: string,
  facade: string,
  loopId: string | null,
  subject: string,
  firstMessage: string,
  author: string,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null; // preview : pas de persistance
  const { data, error } = await supabase
    .from("threads")
    .insert({ project_id: projectId, facade, loop_id: loopId, subject, status: "open" })
    .select("id")
    .single();
  if (error) throw error;
  const threadId = (data as { id: string }).id;
  await supabase
    .from("messages")
    .insert({ thread_id: threadId, role: "user", content: firstMessage, author });
  // Déclenche un vrai run : le Runner poll `runs` (status=queued) et exécute.
  await supabase.from("runs").insert({ thread_id: threadId, status: "queued", goal: firstMessage });
  return threadId;
}

/** Poste un message dans une conversation (composer → agent de façade). */
export async function insertMessage(
  threadId: string,
  role: MessageRole,
  content: string,
  author?: string,
): Promise<void> {
  if (!isSupabaseConfigured) return; // preview : no-op (l'UI met à jour en optimiste)
  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, role, content, author: author ?? null });
  if (error) throw error;
}
