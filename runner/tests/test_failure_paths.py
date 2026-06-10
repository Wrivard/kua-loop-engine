"""M5 — garanties de sécurité : un run en échec (budget/timeout/failed/verif) ne
livre JAMAIS de branche/PR. Bare-local + FakeExecutor (sans coût). Skip si DB injoignable."""

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


def _setup(verify_exit: int = 0):
    pid = f"kua-failtest-{uuid.uuid4().hex[:8]}"
    work = Path(tempfile.mkdtemp(prefix="kua-failtest-"))
    bare = work / "origin.git"
    seed = work / "seed"
    gitops.create_bare(bare)
    gitops.init_new(seed, "main")
    (seed / ".kua").mkdir()
    (seed / ".kua" / "verify.sh").write_text(f"#!/usr/bin/env bash\nexit {verify_exit}\n", encoding="utf-8")
    gitops.commit_all(seed, "chore: agent-ready")
    gitops.add_remote(seed, "origin", str(bare))
    gitops.push(seed, "origin", "main")
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO projects (id, name, repo_url) VALUES (%s, 'Fail test', %s)", (pid, str(bare)))
            cur.execute(
                "INSERT INTO loops (project_id, facade, enabled, autonomy, budget_usd) "
                "VALUES (%s, 'general', true, 'approve_final', 5) RETURNING id",
                (pid,),
            )
            loop_id = str(cur.fetchone()[0])
    thread_id, run_id = db.create_thread_with_run(pid, loop_id, "general", "Fail test", None, "fais X")
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
@pytest.mark.parametrize("status", ["budget_exceeded", "timed_out", "failed"])
def test_run_failure_delivers_nothing(status):
    pid, _tid, run_id, bare, work = _setup()
    try:
        rep = worker.process_run(
            run_id,
            executor=FakeExecutor(status=status),
            deliverer=LocalBareDeliverer(),
            checkouts_dir=str(work / "checkouts"),
        )
        assert rep["status"] == status
        assert db.get_run_context(run_id)["run_status"] == status
        assert "kua/" not in _heads(bare)  # AUCUNE branche de travail poussée
    finally:
        _cleanup(pid, work)


@requires_db
def test_verify_failure_delivers_nothing():
    pid, _tid, run_id, bare, work = _setup(verify_exit=1)  # la gate de vérif échoue
    try:
        rep = worker.process_run(
            run_id,
            executor=FakeExecutor(),  # produit une modif, mais la vérif casse
            deliverer=LocalBareDeliverer(),
            checkouts_dir=str(work / "checkouts"),
        )
        assert rep["status"] == "failed"
        assert db.get_run_context(run_id)["run_status"] == "failed"
        assert "kua/" not in _heads(bare)
    finally:
        _cleanup(pid, work)
