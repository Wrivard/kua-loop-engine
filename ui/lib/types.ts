// Types TS miroir des 7 tables Postgres (docs/03-DATA-MODEL.md).
// Vocabulaire verrouillé (CLAUDE.md) : façade = config (loops) ; thread = conversation ;
// message = un tour ; run = une exécution claude -p.

export type Facade = "bugfix" | "discord" | "seo" | "demo" | "finish";
export type Autonomy = "manual" | "approve_final" | "auto";
export type Plan = "base" | "premium";
export type MessageRole = "user" | "agent" | "run" | "system";

// threads.status : open → working → awaiting_approval → resolved → archived ↘ rejected | failed
export type ThreadStatus =
  | "open"
  | "working"
  | "awaiting_approval"
  | "resolved"
  | "rejected"
  | "failed"
  | "archived";

// runs.status : queued → preparing → running → verifying → awaiting_approval → approved → pushed
//             ↘ failed | rejected | budget_exceeded | timed_out
export type RunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "verifying"
  | "awaiting_approval"
  | "approved"
  | "pushed"
  | "failed"
  | "rejected"
  | "budget_exceeded"
  | "timed_out";

export type ApprovalDecision = "approved" | "rejected" | "redo";
export type EventSource =
  | "sentry"
  | "posthog"
  | "discord"
  | "cron"
  | "calendar"
  | "ui"
  | "manual";

export interface Project {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  plan: Plan;
  discord_channel_id: string | null;
  sentry_project_slug: string | null;
  is_engine: boolean;
  created_at: string;
}

export interface Loop {
  id: string;
  project_id: string;
  facade: Facade;
  enabled: boolean;
  autonomy: Autonomy;
  schedule_cron: string | null;
  model: string;
  max_iterations: number;
  budget_usd: number | string;
  timeout_min: number;
  config: Record<string, unknown>;
}

export interface ThreadRow {
  id: string;
  project_id: string | null;
  loop_id: string | null;
  facade: Facade;
  subject: string;
  status: ThreadStatus;
  source_event_id: string | null;
  created_at: string;
  last_activity_at: string;
  resolved_at: string | null;
  archived_at: string | null;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  role: MessageRole;
  author: string | null;
  content: string | null;
  run_id: string | null;
  created_at: string;
}

export interface RunRow {
  id: string;
  thread_id: string;
  status: RunStatus;
  goal: string;
  branch: string | null;
  pr_url: string | null;
  preview_url: string | null;
  cost_usd: number | string | null;
  iterations: number | null;
  log_path: string | null;
  summary: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  run_id: string;
  decision: ApprovalDecision;
  decided_by: string;
  comment: string | null;
  decided_at: string;
}

// --- Types composites (résultats de jointures pour l'UI) ---

/** Une conversation enrichie de son dernier run + nom de projet (listes). */
export interface ThreadListItem extends ThreadRow {
  latest_run: Pick<RunRow, "id" | "status" | "cost_usd" | "pr_url" | "preview_url"> | null;
  last_message_preview: string | null;
}

/** Un message de conversation, avec le run joint si role = "run". */
export interface MessageWithRun extends MessageRow {
  run: RunRow | null;
}

/** Section de l'inbox : un projet + ses conversations à confirmer. */
export interface InboxGroup {
  project: Pick<Project, "id" | "name" | "plan">;
  threads: ThreadListItem[];
}

/** Entrée de la sidebar : projet + compte « à confirmer » + façades armées. */
export interface SidebarProject {
  id: string;
  name: string;
  is_engine: boolean;
  awaiting: number;
  facades: Facade[];
}
