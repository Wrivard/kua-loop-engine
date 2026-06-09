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


def insert_event(
    source: str, external_id: str, payload: dict[str, Any]
) -> Optional[str]:
    """INSERT ... ON CONFLICT (source, external_id) DO NOTHING.
    Retourne l'id, ou None si déjà vu (dédup, doc 03/07)."""
    raise NotImplementedError("kua_core.db : à implémenter (réécriture psycopg du spike S4)")


def get_loop(project_id: str, facade: str) -> Optional[dict[str, Any]]:
    """Config de la loop (project_id, facade), ou None."""
    raise NotImplementedError("kua_core.db : à implémenter")


def create_thread_with_run(
    project_id: str,
    loop_id: str,
    facade: str,
    subject: str,
    source_event_id: Optional[str],
    goal: str,
) -> tuple[str, str]:
    """Thread + 1er run(queued) dans UNE transaction. Retourne (thread_id, run_id)."""
    raise NotImplementedError("kua_core.db : à implémenter (transaction unique)")


def claim_queued_run() -> Optional[dict[str, Any]]:
    """SELECT ... FOR UPDATE SKIP LOCKED ; passe le run en 'preparing' (doc 06).
    Respecte « un run actif par (project, facade) »."""
    raise NotImplementedError("kua_core.db : à implémenter (Runner, doc 06)")
