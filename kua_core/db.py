"""Couche d'accès DB partagée (psycopg / SQL standard).

STATUT : squelette. Le gateway tourne pour l'instant sur un adaptateur
supabase-py temporaire (gateway/app/db.py, spike S4). Ce module est la cible
de la réécriture : SQL direct + vraies transactions (ex. create_thread_with_run
en UNE transaction, ce que le spike ne garantit pas). Les signatures publiques
ci-dessous sont volontairement alignées sur celles du spike pour rendre le swap
indolore (doc 02 : « Postgres comme contrat »).

Les implémentations lèvent NotImplementedError tant que les spikes ne les ont
pas matérialisées — c'est un scaffold (étape 1 du setup), pas du code Phase 1.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Optional

from kua_core.config import get_settings


@contextmanager
def connect() -> Iterator[Any]:
    """Connexion psycopg à Supabase Postgres (SUPABASE_DB_URL).

    Import paresseux de psycopg pour que le module s'importe même avant que la
    dépendance soit installée (scaffold).
    """
    import psycopg  # noqa: PLC0415 — import paresseux volontaire

    conn = psycopg.connect(get_settings().supabase_db_url)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# Un run est « actif » (occupe le créneau d'une façade) dans ces statuts (doc 06).
_ACTIVE_RUN_STATUSES = ("preparing", "running", "verifying")

# SQL en constantes : permet de les valider par EXPLAIN contre le schéma réel
# (test d'intégration), sans dupliquer les requêtes.
INSERT_EVENT_SQL = (
    "INSERT INTO events (source, external_id, payload) VALUES (%s, %s, %s) "
    "ON CONFLICT (source, external_id) DO NOTHING RETURNING id"
)
GET_LOOP_SQL = "SELECT * FROM loops WHERE project_id = %s AND facade = %s LIMIT 1"
INSERT_THREAD_SQL = (
    "INSERT INTO threads (project_id, loop_id, facade, subject, source_event_id) "
    "VALUES (%s, %s, %s, %s, %s) RETURNING id"
)
INSERT_RUN_SQL = "INSERT INTO runs (thread_id, status, goal) VALUES (%s, 'queued', %s) RETURNING id"
CLAIM_RUN_SQL = """
    UPDATE runs SET status = 'preparing', started_at = now()
    WHERE id = (
        SELECT r.id FROM runs r
        JOIN threads t ON t.id = r.thread_id
        WHERE r.status = 'queued'
          -- Garde-fou PAUSE (débrancher sécuritaire) : moteur en pause → aucun NOUVEAU
          -- run réclamé (les runs déjà en cours finissent). Atomique dans le claim.
          AND NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 1 AND paused)
          AND NOT EXISTS (
              SELECT 1 FROM runs r2
              JOIN threads t2 ON t2.id = r2.thread_id
              WHERE t2.project_id = t.project_id
                AND t2.facade = t.facade
                AND r2.status = ANY(%s)
          )
          -- Verrou d'avis transactionnel par (project,facade) : deux workers
          -- concurrents sur le même couple s'excluent (le NOT EXISTS seul est racé
          -- sous READ COMMITTED car la transition 'preparing' n'est pas encore visible).
          AND pg_try_advisory_xact_lock(hashtextextended(t.project_id || ':' || t.facade, 0))
        ORDER BY r.created_at
        FOR UPDATE OF r SKIP LOCKED
        LIMIT 1
    )
    RETURNING *
"""


def insert_event(
    source: str, external_id: Optional[str], payload: dict[str, Any]
) -> Optional[str]:
    """INSERT ... ON CONFLICT (source, external_id) DO NOTHING.
    Retourne l'id, ou None si déjà vu (dédup, doc 03/07)."""
    from psycopg.types.json import Json  # noqa: PLC0415 — import paresseux

    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(INSERT_EVENT_SQL, (source, external_id, Json(payload)))
            row = cur.fetchone()
    return str(row[0]) if row else None


def get_loop(project_id: str, facade: str) -> Optional[dict[str, Any]]:
    """Config de la loop (project_id, facade), ou None."""
    from psycopg.rows import dict_row  # noqa: PLC0415 — import paresseux

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(GET_LOOP_SQL, (project_id, facade))
            return cur.fetchone()


def create_thread_with_run(
    project_id: str,
    loop_id: str,
    facade: str,
    subject: str,
    source_event_id: Optional[str],
    goal: str,
) -> tuple[str, str]:
    """Thread + 1er run(queued) dans UNE transaction (le `with connect()` commit
    une seule fois en sortie, rollback sur exception). Retourne (thread_id, run_id)."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                INSERT_THREAD_SQL,
                (project_id, loop_id, facade, subject, source_event_id),
            )
            thread_id = cur.fetchone()[0]
            cur.execute(INSERT_RUN_SQL, (thread_id, goal))
            run_id = cur.fetchone()[0]
    return str(thread_id), str(run_id)


def claim_queued_run() -> Optional[dict[str, Any]]:
    """Réclame le plus ancien run `queued` et le passe en `preparing` (doc 06).

    `FOR UPDATE OF r SKIP LOCKED` : deux workers ne prennent jamais le même run.
    La garde NOT EXISTS + le verrou d'avis `pg_try_advisory_xact_lock` imposent
    « un seul run actif par (project, facade) » même sous concurrence.
    Retourne la ligne du run (dict) ou None s'il n'y a rien à réclamer.
    """
    from psycopg.rows import dict_row  # noqa: PLC0415 — import paresseux

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(CLAIM_RUN_SQL, (list(_ACTIVE_RUN_STATUSES),))
            return cur.fetchone()


# --------------------------------------------------------------- Runner (doc 06) ---

# Contexte complet d'un run (run → thread → project → loop) en une requête.
GET_RUN_CONTEXT_SQL = """
    SELECT
      r.id AS run_id, r.status AS run_status, r.goal AS goal, r.thread_id,
      r.branch AS branch, r.pr_url AS pr_url, r.delivered_sha AS delivered_sha,
      t.facade AS facade, t.subject AS subject, t.project_id AS project_id,
      t.loop_id AS loop_id, t.status AS thread_status,
      p.name AS project_name, p.repo_url AS repo_url,
      p.default_branch AS default_branch, p.is_engine AS is_engine,
      p.allow_auto AS allow_auto, p.workspace AS workspace,
      l.autonomy AS autonomy, l.budget_usd AS budget_usd, l.model AS model,
      l.timeout_min AS timeout_min, l.max_iterations AS max_iterations, l.config AS config
    FROM runs r
    JOIN threads t  ON t.id = r.thread_id
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN loops l ON l.id = t.loop_id
    WHERE r.id = %s
"""

POST_MESSAGE_SQL = (
    "INSERT INTO messages (thread_id, role, author, content, run_id) "
    "VALUES (%s, %s, %s, %s, %s) RETURNING id"
)

SET_THREAD_STATUS_SQL = """
    UPDATE threads SET
      status = %s,
      last_activity_at = now(),
      resolved_at = CASE WHEN %s = 'resolved' THEN now() ELSE resolved_at END,
      archived_at = CASE WHEN %s = 'archived' THEN now() ELSE archived_at END
    WHERE id = %s
"""

# Runs en attente de décision + la dernière approbation (watcher du Runner).
RUNS_AWAITING_DECISION_SQL = """
    SELECT r.id AS run_id, r.thread_id AS thread_id, r.goal AS goal,
           a.decision AS decision, a.comment AS comment, a.decided_by AS decided_by
    FROM runs r
    JOIN LATERAL (
        SELECT decision, comment, decided_by
        FROM approvals WHERE run_id = r.id
        ORDER BY decided_at DESC LIMIT 1
    ) a ON true
    WHERE r.status = 'awaiting_approval'
"""

# Colonnes du run que le Runner a le droit de mettre à jour (whitelist).
_RUN_UPDATE_COLUMNS = frozenset(
    {
        "status", "branch", "pr_url", "preview_url", "cost_usd",
        "iterations", "log_path", "summary", "started_at", "finished_at",
        "delivered_sha",
    }
)


def get_run_context(run_id: str) -> Optional[dict[str, Any]]:
    """Tout le contexte d'un run en une requête (run/thread/project/loop)."""
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(GET_RUN_CONTEXT_SQL, (run_id,))
            return cur.fetchone()


def update_run(run_id: str, **fields: Any) -> None:
    """UPDATE runs ... (colonnes whitelistées seulement). No-op si rien à écrire."""
    from psycopg import sql  # noqa: PLC0415

    items = [(k, v) for k, v in fields.items() if k in _RUN_UPDATE_COLUMNS]
    if not items:
        return
    assignments = sql.SQL(", ").join(
        sql.SQL("{} = %s").format(sql.Identifier(k)) for k, _ in items
    )
    query = sql.SQL("UPDATE runs SET {} WHERE id = %s").format(assignments)
    params = [v for _, v in items] + [run_id]
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)


def add_run(thread_id: str, goal: str) -> str:
    """Ajoute un run(queued) à un thread existant (ex. redo). Retourne l'id."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(INSERT_RUN_SQL, (thread_id, goal))
            return str(cur.fetchone()[0])


def post_message(
    thread_id: str,
    role: str,
    content: Optional[str],
    run_id: Optional[str] = None,
    author: Optional[str] = None,
) -> str:
    """Insère un message dans un thread (run/agent/system/user). Retourne l'id."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(POST_MESSAGE_SQL, (thread_id, role, author, content, run_id))
            return str(cur.fetchone()[0])


def set_thread_status(thread_id: str, status: str) -> None:
    """Met à jour le statut d'un thread (+ horodatages resolved/archived)."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(SET_THREAD_STATUS_SQL, (status, status, status, thread_id))


def runs_awaiting_decision() -> list[dict[str, Any]]:
    """Runs `awaiting_approval` ayant une approbation — avec la dernière décision."""
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(RUNS_AWAITING_DECISION_SQL)
            return cur.fetchall()


CLAIM_RUN_FOR_STATUS_SQL = "UPDATE runs SET status = %s WHERE id = %s AND status = %s RETURNING id"


def claim_run_for_status(run_id: str, expected: str, new_status: str) -> bool:
    """Transition atomique conditionnelle : passe `run_id` de `expected` à `new_status`
    UNIQUEMENT si son statut vaut encore `expected`. True pour le gagnant (un seul sous
    concurrence) — utilisé pour réclamer une décision/un merge sans double-exécution."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(CLAIM_RUN_FOR_STATUS_SQL, (new_status, run_id, expected))
            return cur.fetchone() is not None


LATEST_APPROVAL_SQL = (
    "SELECT decision, comment, decided_by FROM approvals "
    "WHERE run_id = %s ORDER BY decided_at DESC LIMIT 1"
)


def latest_approval(run_id: str) -> Optional[dict[str, Any]]:
    """Dernière décision d'approbation d'un run (ré-validation défensive avant merge)."""
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(LATEST_APPROVAL_SQL, (run_id,))
            return cur.fetchone()


# Récupère les runs « orphelins » (worker mort pendant l'exécution) et les libère.
REAP_ORPHANED_RUNS_SQL = """
    UPDATE runs SET status = 'failed', finished_at = now(),
        summary = COALESCE(summary, '') || ' [orphelin : worker mort pendant l''exécution]'
    WHERE status = ANY(%s)
      AND started_at IS NOT NULL
      AND started_at < now() - make_interval(mins => %s)
    RETURNING id, thread_id
"""


# Threads dont le DERNIER message est de l'utilisateur ET sans run en cours/file
# → l'agent de façade doit réagir (doc 16). (Le 1er message à la création a déjà
# un run queued → exclu par le NOT EXISTS, pas de double enqueue.)
THREADS_AWAITING_AGENT_SQL = """
    SELECT t.id AS thread_id, m.content AS message
    FROM threads t
    JOIN LATERAL (
        SELECT role, content FROM messages WHERE thread_id = t.id
        ORDER BY created_at DESC LIMIT 1
    ) m ON true
    WHERE m.role = 'user'
      AND t.status NOT IN ('archived', 'resolved', 'rejected')
      AND NOT EXISTS (
          SELECT 1 FROM runs r WHERE r.thread_id = t.id AND r.status = ANY(%s)
      )
"""

LAST_RUN_GOAL_SQL = "SELECT goal FROM runs WHERE thread_id = %s ORDER BY created_at DESC LIMIT 1"

# Statuts qui « occupent » un thread (un run est en file ou en cours).
_PENDING_RUN_STATUSES = ("queued", "preparing", "running", "verifying")


def threads_awaiting_agent() -> list[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(THREADS_AWAITING_AGENT_SQL, (list(_PENDING_RUN_STATUSES),))
            return cur.fetchall()


def last_run_goal(thread_id: str) -> Optional[str]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(LAST_RUN_GOAL_SQL, (thread_id,))
            row = cur.fetchone()
            return row[0] if row else None


def reap_orphaned_runs(grace_min: int) -> list[dict[str, Any]]:
    """Marque `failed` les runs actifs (preparing/running/verifying) bloqués depuis
    > grace_min (process mort) → débloque la façade. `awaiting_approval` est exclu
    (attente humaine, pas un orphelin)."""
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(REAP_ORPHANED_RUNS_SQL, (list(_ACTIVE_RUN_STATUSES), grace_min))
            return cur.fetchall()


# ----------------------------------------------------- Connexions (doc connecteurs) ---
# La DB ne stocke QUE métadonnées + config non-secrète + secret_ref. Jamais le secret.

GET_CONNECTION_SQL_APP = (
    "SELECT * FROM connections WHERE scope='app' AND type=%s AND project_id IS NULL LIMIT 1"
)
GET_CONNECTION_SQL_PROJECT = (
    "SELECT * FROM connections WHERE scope='project' AND type=%s AND project_id=%s LIMIT 1"
)


def get_connection(scope: str, type_: str, project_id: Optional[str] = None) -> Optional[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if scope == "app":
                cur.execute(GET_CONNECTION_SQL_APP, (type_,))
            else:
                cur.execute(GET_CONNECTION_SQL_PROJECT, (type_, project_id))
            return cur.fetchone()


def upsert_connection(
    scope: str,
    type_: str,
    project_id: Optional[str],
    label: Optional[str],
    config: dict[str, Any],
    secret_ref: Optional[str],
    status: str = "untested",
) -> str:
    """Crée/maj la connexion (scope,type[,project]). config = NON-secret seulement."""
    from psycopg.types.json import Json  # noqa: PLC0415

    existing = get_connection(scope, type_, project_id)
    with connect() as conn:
        with conn.cursor() as cur:
            if existing:
                cur.execute(
                    "UPDATE connections SET label=%s, config=%s, secret_ref=%s, status=%s, "
                    "last_checked=now() WHERE id=%s",
                    (label, Json(config), secret_ref, status, existing["id"]),
                )
                return str(existing["id"])
            cur.execute(
                "INSERT INTO connections (scope, project_id, type, label, config, secret_ref, status, last_checked) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, now()) RETURNING id",
                (scope, project_id, type_, label, Json(config), secret_ref, status),
            )
            return str(cur.fetchone()[0])


def set_connection_status(connection_id: str, status: str) -> None:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE connections SET status=%s, last_checked=now() WHERE id=%s",
                (status, connection_id),
            )


def list_connections(scope: Optional[str] = None) -> list[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if scope:
                cur.execute("SELECT * FROM connections WHERE scope=%s ORDER BY type", (scope,))
            else:
                cur.execute("SELECT * FROM connections ORDER BY scope, type")
            return cur.fetchall()


# --- Bindings par projet (lecture, pour la composition) ---

def get_project_connectors(project_id: str, enabled_only: bool = True) -> list[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    sql = "SELECT * FROM project_connectors WHERE project_id=%s"
    if enabled_only:
        sql += " AND enabled = true"
    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (project_id,))
            return cur.fetchall()


def get_project_skills(project_id: str, enabled_only: bool = True) -> list[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    sql = "SELECT * FROM project_skills WHERE project_id=%s"
    if enabled_only:
        sql += " AND enabled = true"
    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (project_id,))
            return cur.fetchall()


def get_project_mcp(project_id: str, enabled_only: bool = True) -> list[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    sql = "SELECT * FROM project_mcp WHERE project_id=%s"
    if enabled_only:
        sql += " AND enabled = true"
    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (project_id,))
            return cur.fetchall()


# ------------------------------------------------------ Projets / workspace (doc 06) ---
# Un projet « chargé » (workspace=true) est le SEUL sur lequel le Runner agit.
# `register_project` (création depuis l'engine) le marque chargé d'emblée.

def get_project(project_id: str) -> Optional[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM projects WHERE id = %s", (project_id,))
            return cur.fetchone()


def register_project(
    project_id: str,
    name: str,
    repo_url: str,
    *,
    default_branch: str = "main",
    workspace: bool = False,
    is_engine: bool = False,
    allow_auto: bool = False,
) -> str:
    """Upsert d'un projet (idempotent sur l'id/slug). Marque `workspace` explicitement.
    `allow_auto` reste fail-closed par défaut (règle #1)."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO projects (id, name, repo_url, default_branch, is_engine, allow_auto, workspace) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (id) DO UPDATE SET "
                "  name = EXCLUDED.name, repo_url = EXCLUDED.repo_url, "
                "  default_branch = EXCLUDED.default_branch, workspace = EXCLUDED.workspace "
                "RETURNING id",
                (project_id, name, repo_url, default_branch, is_engine, allow_auto, workspace),
            )
            return str(cur.fetchone()[0])


def ensure_loop(
    project_id: str,
    facade: str,
    *,
    autonomy: str = "approve_final",
    budget_usd: float = 5.0,
    model: str = "sonnet",
    timeout_min: int = 30,
    enabled: bool = True,
) -> str:
    """Crée la loop (project_id, facade) si absente (UNIQUE), sinon la retourne.
    budget_usd > 0 imposé en amont (un run sans budget ne démarre pas — règle #2)."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO loops (project_id, facade, enabled, autonomy, model, budget_usd, timeout_min) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (project_id, facade) DO NOTHING RETURNING id",
                (project_id, facade, enabled, autonomy, model, budget_usd, timeout_min),
            )
            row = cur.fetchone()
            if row:
                return str(row[0])
            cur.execute("SELECT id FROM loops WHERE project_id=%s AND facade=%s", (project_id, facade))
            return str(cur.fetchone()[0])


# ------------------------------------------------ Système : pause + heartbeat (doc 06) ---
# Singleton system_settings (id=1, migration 006). Le worker écrit via psycopg (hors RLS) ;
# l'UI écrit `paused` via l'API Supabase (RLS authenticated).

def is_paused() -> bool:
    """True si le moteur est en pause (aucun nouveau run réclamé). False si absent/erreur.
    Le garde-fou autoritaire reste la clause SQL du claim ; ceci sert au worker (log + skip)."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT paused FROM system_settings WHERE id = 1")
            row = cur.fetchone()
            return bool(row[0]) if row else False


def set_paused(paused: bool) -> None:
    """Met le moteur en pause / le reprend (CLI `kua pause`/`kua resume` ; l'UI passe par Supabase)."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE system_settings SET paused = %s, updated_at = now() WHERE id = 1",
                (paused,),
            )


def touch_worker_heartbeat(pid: Optional[int] = None) -> None:
    """Rafraîchit le heartbeat du worker (→ /health sait s'il est vivant)."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE system_settings SET worker_heartbeat_at = now(), worker_pid = %s WHERE id = 1",
                (pid,),
            )


def get_system_status() -> dict[str, Any]:
    """État système (paused + heartbeat worker) pour /health. {} si table absente."""
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT paused, worker_heartbeat_at, worker_pid, updated_at FROM system_settings WHERE id = 1"
            )
            return cur.fetchone() or {}


# ----------------------------------------- Gestion de loop (chat-first, allowlist) ---
# Actions confirmées par l'humain via le chat → appliquées ici. `autonomy='auto'` est REFUSÉ
# en amont (endpoint) ET ignoré ici (défense en profondeur) : allow_auto reste hors d'atteinte.

def get_loop_by_id(loop_id: str) -> Optional[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM loops WHERE id = %s", (loop_id,))
            return cur.fetchone()


def set_loop_enabled(loop_id: str, enabled: bool) -> None:
    """pause_loop = enabled false (plus de nouveau thread depuis les triggers) ; resume = true."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE loops SET enabled = %s WHERE id = %s", (enabled, loop_id))


def update_loop_fields(
    loop_id: str,
    *,
    budget_usd: Optional[float] = None,
    model: Optional[str] = None,
    autonomy: Optional[str] = None,
) -> None:
    """Maj de champs whitelistés. `autonomy='auto'` est IGNORÉ (jamais activé par le chat)."""
    from psycopg import sql  # noqa: PLC0415

    sets: list[Any] = []
    params: list[Any] = []
    if budget_usd is not None and float(budget_usd) > 0:
        sets.append(sql.SQL("budget_usd = %s"))
        params.append(float(budget_usd))
    if model:
        sets.append(sql.SQL("model = %s"))
        params.append(model)
    if autonomy in ("manual", "approve_final"):  # 'auto' exclu volontairement
        sets.append(sql.SQL("autonomy = %s"))
        params.append(autonomy)
    if not sets:
        return
    query = sql.SQL("UPDATE loops SET {} WHERE id = %s").format(sql.SQL(", ").join(sets))
    params.append(loop_id)
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)


def get_app_setting(key: str) -> dict[str, Any]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM app_settings WHERE key=%s", (key,))
            row = cur.fetchone()
            return (row[0] if row and isinstance(row[0], dict) else {}) or {}
