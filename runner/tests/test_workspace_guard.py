"""Garde-fou WORKSPACE (permanent) : le Runner n'agit QUE sur un projet enregistré
ET chargé (workspace=true). Un projet non chargé est REFUSÉ avant tout checkout/spawn,
même si le repo est parfaitement accessible. Bare-local + FakeExecutor. Skip si DB injoignable.

La SEULE différence entre les deux tests est le flag `workspace` — ça isole la preuve."""

from __future__ import annotations

import shutil
import tempfile
import uuid
from pathlib import Path

import pytest

from kua_core import db
from runner import gitops, worker
from runner.deliver import LocalBareDeliverer
from runner.executor import FakeExecutor


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


def _setup(workspace: bool):
    """Repo bare local accessible + projet (workspace=param) + loop + thread + run."""
    pid = f"kua-wsguard-{uuid.uuid4().hex[:8]}"
    work = Path(tempfile.mkdtemp(prefix="kua-wsguard-"))
    bare = work / "origin.git"
    seed = work / "seed"
    gitops.create_bare(bare)
    gitops.init_new(seed, "main")
    (seed / ".kua").mkdir()
    (seed / ".kua" / "verify.sh").write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    gitops.commit_all(seed, "chore: agent-ready")
    gitops.add_remote(seed, "origin", str(bare))
    gitops.push(seed, "origin", "main")
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO projects (id, name, repo_url, workspace) VALUES (%s, 'WS guard', %s, %s)",
                (pid, str(bare), workspace),
            )
            cur.execute(
                "INSERT INTO loops (project_id, facade, enabled, autonomy, budget_usd) "
                "VALUES (%s, 'general', true, 'approve_final', 5) RETURNING id",
                (pid,),
            )
            loop_id = str(cur.fetchone()[0])
    thread_id, run_id = db.create_thread_with_run(pid, loop_id, "general", "WS guard", None, "fais X")
    return pid, thread_id, run_id, bare, work


def _cleanup(pid: str, work: Path) -> None:
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE project_id=%s)", (pid,))
            cur.execute("DELETE FROM runs WHERE thread_id IN (SELECT id FROM threads WHERE project_id=%s)", (pid,))
            cur.execute("DELETE FROM threads WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM loops WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM projects WHERE id=%s", (pid,))
    shutil.rmtree(work, ignore_errors=True)


def _heads(bare: Path) -> str:
    return gitops._run(["ls-remote", "--heads", str(bare)])


@requires_db
def test_run_refused_when_project_not_loaded():
    """workspace=false → REFUS avant tout : exécuteur jamais appelé, aucune branche poussée."""
    pid, _tid, run_id, bare, work = _setup(workspace=False)
    fake = FakeExecutor()
    try:
        rep = worker.process_run(
            run_id, executor=fake, deliverer=LocalBareDeliverer(), checkouts_dir=str(work / "checkouts")
        )
        assert rep["status"] == "failed"
        assert "workspace" in rep["summary"].lower()
        assert db.get_run_context(run_id)["run_status"] == "failed"
        # ★ L'exécuteur n'a JAMAIS été invoqué (refus avant le spawn).
        assert fake.received_goal == ""
        # ★ Aucune branche de travail poussée — le repo n'a pas été touché.
        assert "kua/" not in _heads(bare)
    finally:
        _cleanup(pid, work)


@requires_db
def test_run_allowed_when_project_loaded():
    """workspace=true (même repo, même tout) → le run procède normalement."""
    pid, _tid, run_id, bare, work = _setup(workspace=True)
    fake = FakeExecutor()
    try:
        rep = worker.process_run(
            run_id, executor=fake, deliverer=LocalBareDeliverer(), checkouts_dir=str(work / "checkouts")
        )
        assert rep["status"] == "awaiting_approval"
        assert fake.received_goal != ""        # exécuteur bien appelé
        assert "kua/" in _heads(bare)           # branche de travail poussée
    finally:
        _cleanup(pid, work)
