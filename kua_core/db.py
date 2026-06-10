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

    `FOR UPDATE OF r SKIP LOCKED` : deux workers concurrents ne prennent jamais le
    même run. La garde NOT EXISTS impose « un run actif par (project, facade) ».
    Retourne la ligne du run (dict) ou None s'il n'y a rien à réclamer.
    """
    from psycopg.rows import dict_row  # noqa: PLC0415 — import paresseux

    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(CLAIM_RUN_SQL, (list(_ACTIVE_RUN_STATUSES),))
            return cur.fetchone()
