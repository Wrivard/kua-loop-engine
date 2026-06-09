"""Database access layer for the Trigger Gateway (spike S4).

TEMPORARY spike adapter: implemented with supabase-py (PostgREST client)
because the direct-SQL DB password is not available yet. It will be
rewritten on psycopg (plain SQL, real transactions) inside kua_core —
keep this interface stable:

    insert_event(source, external_id, payload) -> str | None
    get_loop(project_id, facade) -> dict | None
    create_thread_with_run(...) -> (thread_id, run_id)

Known spike limitation: create_thread_with_run is two sequential PostgREST
inserts, NOT a transaction. A crash between the two leaves an orphan
thread. The psycopg rewrite will wrap both inserts in one transaction.
"""

from __future__ import annotations

from typing import Any, Optional

from supabase import Client, create_client

from app.config import get_settings

_client: Optional[Client] = None


def get_client() -> Client:
    """Lazily build (and cache) the Supabase client."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def insert_event(
    source: str, external_id: str, payload: dict[str, Any]
) -> Optional[str]:
    """Insert an event row; return its id, or None if (source, external_id)
    already exists (dedup via INSERT ... ON CONFLICT DO NOTHING)."""
    res = (
        get_client()
        .table("events")
        .upsert(
            {"source": source, "external_id": external_id, "payload": payload},
            on_conflict="source,external_id",
            ignore_duplicates=True,
        )
        .execute()
    )
    if not res.data:
        return None
    return res.data[0]["id"]


def get_loop(project_id: str, facade: str) -> Optional[dict[str, Any]]:
    """Return the loop config row for (project_id, facade), or None."""
    res = (
        get_client()
        .table("loops")
        .select("*")
        .eq("project_id", project_id)
        .eq("facade", facade)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def create_thread_with_run(
    project_id: str,
    loop_id: str,
    facade: str,
    subject: str,
    source_event_id: str,
    goal: str,
) -> tuple[str, str]:
    """Create a thread and its first queued run; return (thread_id, run_id)."""
    client = get_client()
    thread_res = (
        client.table("threads")
        .insert(
            {
                "project_id": project_id,
                "loop_id": loop_id,
                "facade": facade,
                "subject": subject,
                "source_event_id": source_event_id,
            }
        )
        .execute()
    )
    thread_id: str = thread_res.data[0]["id"]
    run_res = (
        client.table("runs")
        .insert({"thread_id": thread_id, "status": "queued", "goal": goal})
        .execute()
    )
    run_id: str = run_res.data[0]["id"]
    return thread_id, run_id
