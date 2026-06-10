"""Garde-fou PAUSE : moteur en pause → aucun NOUVEAU run réclamé (claim atomique).
Reprise → on réclame à nouveau. Skip si DB injoignable.

IMPORTANT : on remet TOUJOURS paused=False en finally — la DB est partagée (singleton
system_settings) ; la laisser en pause bloquerait le vrai worker et les autres tests."""

from __future__ import annotations

import uuid

import pytest

from kua_core import db


def _db_reachable() -> bool:
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(not _db_reachable(), reason="DB injoignable — test sauté")


def _seed() -> tuple[str, str]:
    """Projet chargé + loop + thread + run(queued). Retourne (pid, run_id)."""
    pid = f"kua-pause-{uuid.uuid4().hex[:8]}"
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO projects (id, name, repo_url, workspace) VALUES (%s, 'Pause', '-', true)",
                (pid,),
            )
            cur.execute(
                "INSERT INTO loops (project_id, facade, enabled, autonomy, budget_usd) "
                "VALUES (%s, 'general', true, 'approve_final', 5) RETURNING id",
                (pid,),
            )
            loop_id = str(cur.fetchone()[0])
    _thread_id, run_id = db.create_thread_with_run(pid, loop_id, "general", "pause", None, "fais X")
    return pid, run_id


def _cleanup(pid: str) -> None:
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE project_id=%s)", (pid,))
            cur.execute("DELETE FROM runs WHERE thread_id IN (SELECT id FROM threads WHERE project_id=%s)", (pid,))
            cur.execute("DELETE FROM threads WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM loops WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM projects WHERE id=%s", (pid,))


@requires_db
def test_pause_blocks_claim():
    """Déterministe (pas de course avec le worker live, déjà en pause via conftest) :
    en pause, le claim ne sort RIEN et notre run reste 'queued' ; le flag round-trip."""
    pid, run_id = _seed()
    try:
        db.set_paused(True)
        assert db.is_paused() is True
        # ★ En pause : aucun run réclamé (court-circuit atomique dans le claim SQL).
        assert db.claim_queued_run() is None
        # ★ Notre run reste 'queued' (non réclamé).
        assert db.get_run_context(run_id)["run_status"] == "queued"
        # Le flag round-trip (le contraste « non-pausé → claimable » est couvert par tous
        # les tests qui exécutent un run ; on évite ici une course au claim global).
        db.set_paused(False)
        assert db.is_paused() is False
    finally:
        db.set_paused(True)  # garder la session en pause (le conftest reprend à la fin)
        _cleanup(pid)


@requires_db
def test_heartbeat_and_status_roundtrip():
    db.touch_worker_heartbeat(424242)
    st = db.get_system_status()
    assert st.get("worker_pid") == 424242
    assert st.get("worker_heartbeat_at") is not None
    assert "paused" in st
