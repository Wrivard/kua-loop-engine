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

export type ConnectionStatus = "untested" | "ok" | "error";
export type ConnectionScope = "app" | "project";

/** Connexion (instance) — métadonnées + config NON-secrète. Le secret vit sur le
 *  VPS (/srv/kua/secrets/), référencé par secret_ref, JAMAIS en DB. */
export interface Connection {
  id: string;
  scope: ConnectionScope;
  project_id: string | null;
  type: string;
  label: string | null;
  config: Record<string, unknown>;
  secret_ref: string | null;
  status: ConnectionStatus;
  last_checked: string | null;
  created_at: string;
}

/** Binding d'un connecteur sur un projet (M4). */
export interface ProjectConnector {
  id: string;
  project_id: string;
  type: string;
  enabled: boolean;
  mode: "inherit" | "own";
  connection_id: string | null;
  config: Record<string, unknown>;
}

export interface ProjectSkill {
  id: string;
  project_id: string;
  skill: string;
  enabled: boolean;
}

export interface ProjectMcp {
  id: string;
  project_id: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  secret_ref: string | null;
}

/** Loop enrichie du nom de projet (table des modèles, Settings). */
export interface LoopWithProject extends Loop {
  project_name: string;
}

/** Action proposée par le cerveau (chat-first). Allowlist stricte côté serveur. */
export type AgentAction =
  | "create_thread"
  | "create_loop"
  | "update_loop"
  | "pause_loop"
  | "resume_loop"
  | "none";

/** Proposition structurée du cerveau (voir BUILD-NOTES § CHAT-FIRST). */
export interface AgentProposal {
  action: AgentAction;
  facade: string; // general | bugfix | discord | demo | finish | seo
  loop_id: string | null;
  title: string;
  goal: string;
  budget_usd: number;
  priority: "low" | "normal" | "high";
  questions_manquantes: string[];
  resume_humain: string;
}

/** Un run dans le dashboard activité (M19). */
export interface ActivityRun {
  id: string;
  status: string;
  cost_usd: number | string | null;
  created_at: string;
  pr_url: string | null;
  facade: string;
  subject: string | null;
}

/** Notification (cloche app — migration 011). */
export interface Notification {
  id: string;
  kind: string; // proposal|awaiting|failed|merged|budget
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

/** Proposition du cerveau dans l'inbox (migration 010). */
export interface Proposal {
  id: string;
  source: string; // chat|discord|sentry|cron|webhook
  project_id: string | null;
  payload: AgentProposal;
  status: "pending" | "approved" | "dismissed" | "expired";
  created_at: string;
}

/** Session de chat persistée (accueil chat-first, migration 007). */
export interface ChatSession {
  id: string;
  user_email: string | null;
  title: string | null;
  created_at: string;
}

/** Message d'une session de chat (user | brain | system) + proposition éventuelle. */
export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "brain" | "system";
  content: string;
  proposal: AgentProposal | null;
  created_at: string;
}

/** Un fichier dans le diff d'une PR (M13). */
export interface PrFile {
  filename: string;
  status: string;
  additions: number | null;
  deletions: number | null;
  patch: string;
}

/** Détail d'une PR pour la revue dans l'app (M13). */
export interface PrDetail {
  status: string;
  run?: {
    status?: string;
    cost_usd?: string | null;
    iterations?: number | null;
    summary?: string | null;
    verify_status?: string | null;
    verify_command?: string | null;
    verify_output?: string | null;
    branch?: string | null;
  };
  pr?: {
    title?: string;
    html_url?: string;
    state?: string;
    draft?: boolean;
    merged?: boolean;
    additions?: number | null;
    deletions?: number | null;
    changed_files?: number | null;
    commits?: number | null;
  } | null;
  files?: PrFile[];
  truncated?: boolean;
  reachable?: boolean;
  reason?: string;
}

/** Réglages système (singleton id=1) — pause moteur + heartbeat worker (migration 006). */
export interface SystemSettings {
  id: number;
  paused: boolean;
  worker_heartbeat_at: string | null;
  worker_pid: number | null;
  updated_at: string;
}

/** État d'un service dans /health. */
export interface ServiceHealth {
  up: boolean;
  detail?: string;
  last_heartbeat?: string;
  age_seconds?: number;
  pid?: number | null;
  configured?: boolean;
}

/** Action proposée par l'assistant debug (re-validée contre l'allowlist côté gateway). */
export interface ProposedAction {
  type: "restart_service" | "reinstall_dep";
  service?: string;
  key?: string;
}

/** Réponse de /api/system/debug/advise. */
export interface AdviseResult {
  status?: string;
  explanation?: string;
  proposed_action?: ProposedAction | null;
}

/** Un bloc de diagnostic (df/free/uptime/pip check). */
export interface DiagnosticBlock {
  name: string;
  exit_code: number;
  output: string;
}

/** Réponse de /api/health (proxy de la gateway). `reachable=false` = gateway non joignable. */
export interface HealthStatus {
  reachable: boolean;
  reason?: string;
  status?: string;
  version?: string;
  uptime_seconds?: number;
  paused?: boolean;
  services?: {
    gateway: ServiceHealth;
    db: ServiceHealth;
    worker: ServiceHealth;
    mcp_bridge: ServiceHealth;
  };
}
