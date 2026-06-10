"""M4 — l'agent de façade réagit à un message du composer (doc 16). Skip si DB injoignable.
Ciblé (handle_thread_message sur un thread dédié) → ne touche aucun autre thread."""

from __future__ import annotations

import uuid

import pytest

from kua_core import db
from runner import worker


def _db_reachable() -> bool:
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


def _cleanup(project_id: str) -> None:
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE project_id=%s)",
                (project_id,),
            )
            cur.execute(
                "DELETE FROM runs WHERE thread_id IN (SELECT id FROM threads WHERE project_id=%s)",
                (project_id,),
            )
            cur.execute("DELETE FROM threads WHERE project_id=%s", (project_id,))
            cur.execute("DELETE FROM loops WHERE project_id=%s", (project_id,))
            cur.execute("DELETE FROM projects WHERE id=%s", (project_id,))


requires_db = pytest.mark.skipif(not _db_reachable(), reason="DB injoignable — test agent sauté")


@requires_db
def test_composer_redo_enqueues_run_with_nuance():
    pid = f"kua-agenttest-{uuid.uuid4().hex[:8]}"
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO projects (id, name, repo_url) VALUES (%s, 'Agent test', '-')", (pid,))
                cur.execute(
                    "INSERT INTO loops (project_id, facade, enabled, autonomy, budget_usd) "
                    "VALUES (%s, 'general', true, 'approve_final', 5) RETURNING id",
                    (pid,),
                )
                loop_id = str(cur.fetchone()[0])
        thread_id, run_id = db.create_thread_with_run(pid, loop_id, "general", "Sujet", None, "Corrige le bug X")
        db.update_run(run_id, status="awaiting_approval")
        db.post_message(thread_id, "user", "Refaire : renomme e en err", author="test")

        res = worker.handle_thread_message(thread_id, "Refaire : renomme e en err")
        assert res["action"] == "enqueue_run"

        ctx = db.get_run_context(res["run_id"])
        assert ctx["run_status"] == "queued"
        assert "renomme e en err" in ctx["goal"]
        assert "Corrige le bug X" in ctx["goal"]  # greffé sur le goal précédent
    finally:
        _cleanup(pid)


@requires_db
def test_composer_question_gets_agent_reply():
    pid = f"kua-agenttest-{uuid.uuid4().hex[:8]}"
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO projects (id, name, repo_url) VALUES (%s, 'Agent test', '-')", (pid,))
                cur.execute(
                    "INSERT INTO loops (project_id, facade, enabled, autonomy, budget_usd) "
                    "VALUES (%s, 'general', true, 'approve_final', 5) RETURNING id",
                    (pid,),
                )
                loop_id = str(cur.fetchone()[0])
        thread_id, _ = db.create_thread_with_run(pid, loop_id, "general", "Sujet", None, "Fais X")

        res = worker.handle_thread_message(thread_id, "Pourquoi t'as fait ça comme ça ?")
        assert res["action"] == "reply"
        # un message agent (la réponse) a été posté
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM messages WHERE thread_id=%s AND role='agent'", (thread_id,))
                assert cur.fetchone()[0] >= 1
    finally:
        _cleanup(pid)
