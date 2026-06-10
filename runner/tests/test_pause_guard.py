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
def test_pause_blocks_claim_then_resume():
    pid, run_id = _seed()
    try:
        db.set_paused(True)
        # ★ En pause : aucun run réclamé (global, atomique dans le claim SQL).
        assert db.claim_queued_run() is None
        # ★ Notre run reste 'queued' (intact).
        assert db.get_run_context(run_id)["run_status"] == "queued"

        db.set_paused(False)
        # ★ Reprise : le claim redevient actif. claim_queued_run est GLOBAL → sur la DB
        # partagée il peut sortir un AUTRE run en file ; on le remet alors en file (aucun
        # dégât durable). L'assertion clé : la reprise réactive bien le claim.
        claimed = db.claim_queued_run()
        assert claimed is not None
        if str(claimed["id"]) != run_id:
            with db.connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE runs SET status='queued', started_at=NULL WHERE id=%s",
                        (claimed["id"],),
                    )
    finally:
        db.set_paused(False)  # NE JAMAIS laisser la DB partagée en pause.
        _cleanup(pid)


@requires_db
def test_heartbeat_and_status_roundtrip():
    db.touch_worker_heartbeat(424242)
    st = db.get_system_status()
    assert st.get("worker_pid") == 424242
    assert st.get("worker_heartbeat_at") is not None
    assert "paused" in st
