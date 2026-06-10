// Fonctions de requête Supabase (PostgREST). Utilisées par les écrans (client
// components) qui s'abonnent en plus au Realtime via useLiveQuery.
// Contexte borné (CLAUDE.md) : on ne charge jamais l'historique des autres threads.

import { supabase } from "@/lib/supabase";
import type {
  ApprovalDecision,
  InboxGroup,
  Loop,
  MessageRole,
  MessageWithRun,
  Project,
  RunRow,
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
  const { data, error } = await supabase.from("projects").select("*").order("name");
  if (error) throw error;
  return (data as Project[]) ?? [];
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", slug).maybeSingle();
  if (error) throw error;
  return (data as Project) ?? null;
}

export async function getLoopsByProject(projectId: string): Promise<Loop[]> {
  const { data, error } = await supabase
    .from("loops")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data as Loop[]) ?? [];
}

/** Inbox : toutes les conversations à confirmer, groupées par projet (doc 12). */
export async function getInboxGroups(): Promise<InboxGroup[]> {
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

/** Toutes les conversations d'un projet (l'appelant sépare actives / archivées). */
export async function getThreadsByProject(projectId: string): Promise<ThreadListItem[]> {
  const { data, error } = await supabase
    .from("threads")
    .select("*, runs(id,status,cost_usd,pr_url,preview_url,summary,created_at)")
    .eq("project_id", projectId)
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return ((data as (ThreadRow & { runs?: EmbeddedRun[] })[]) ?? []).map(toListItem);
}

export async function getThread(threadId: string): Promise<ThreadRow | null> {
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
  const start = new Date();
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1).toISOString();
  const { data, error } = await supabase
    .from("runs")
    .select("cost_usd, created_at, threads!inner(project_id)")
    .eq("threads.project_id", projectId)
    .gte("created_at", monthStart);
  if (error) throw error;
  const rows = (data as { cost_usd: number | string | null }[]) ?? [];
  return rows.reduce((sum, r) => sum + (r.cost_usd ? Number(r.cost_usd) : 0), 0);
}

// --- Écritures ---

/** Enregistre une décision dans `approvals` (doc 12 : UI et Discord écrivent ici). */
export async function insertApproval(
  runId: string,
  decision: ApprovalDecision,
  decidedBy: string,
  comment?: string,
): Promise<void> {
  const { error } = await supabase
    .from("approvals")
    .insert({ run_id: runId, decision, decided_by: decidedBy, comment: comment ?? null });
  if (error) throw error;
}

/** Poste un message dans une conversation (composer → agent de façade). */
export async function insertMessage(
  threadId: string,
  role: MessageRole,
  content: string,
  author?: string,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, role, content, author: author ?? null });
  if (error) throw error;
}
