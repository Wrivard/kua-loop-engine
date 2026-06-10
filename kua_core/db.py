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
      p.allow_auto AS allow_auto,
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
