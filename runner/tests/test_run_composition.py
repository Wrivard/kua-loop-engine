"""Partie B — preuve que le run d'un projet reçoit SES secrets projet + son .mcp.json
composé, et JAMAIS les creds app. Bare-local + FakeExecutor. Skip si DB injoignable."""

from __future__ import annotations

import shutil
import tempfile
import uuid
from pathlib import Path

import pytest

from kua_core import db, secrets
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


def _cleanup(pid: str, work: Path) -> None:
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM project_connectors WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM project_mcp WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM project_skills WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM connections WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE project_id=%s)", (pid,))
            cur.execute("DELETE FROM runs WHERE thread_id IN (SELECT id FROM threads WHERE project_id=%s)", (pid,))
            cur.execute("DELETE FROM threads WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM loops WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM projects WHERE id=%s", (pid,))
    shutil.rmtree(work, ignore_errors=True)


@requires_db
def test_run_gets_project_secrets_not_app(tmp_path, monkeypatch):
    monkeypatch.setenv("KUA_SECRETS_DIR", str(tmp_path / "secrets"))
    pid = f"kua-comp-{uuid.uuid4().hex[:8]}"
    work = Path(tempfile.mkdtemp(prefix="kua-comp-"))
    bare = work / "origin.git"
    seed = work / "seed"
    try:
        # repo agent-ready sur bare local
        gitops.create_bare(bare)
        gitops.init_new(seed, "main")
        (seed / ".kua").mkdir()
        (seed / ".kua" / "verify.sh").write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
        gitops.commit_all(seed, "chore: agent-ready")
        gitops.add_remote(seed, "origin", str(bare))
        gitops.push(seed, "origin", "main")

        # secrets : projet (sentry) DOIT arriver ; app (github) NE DOIT PAS.
        secrets.set_secret("project", "sentry", pid, {"auth_token": "ST-PROJECT-SECRET"})
        secrets.set_secret("app", "github", None, {"token": "GH-APP-SECRET"})

        # DB : projet + loop + thread + run + connexion projet + bindings + mcp + skill
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO projects (id, name, repo_url) VALUES (%s, 'Comp', %s)", (pid, str(bare)))
                cur.execute(
                    "INSERT INTO loops (project_id, facade, enabled, autonomy, budget_usd) "
                    "VALUES (%s,'general',true,'approve_final',5) RETURNING id",
                    (pid,),
                )
                loop_id = str(cur.fetchone()[0])
        thread_id, run_id = db.create_thread_with_run(pid, loop_id, "general", "comp", None, "fais X")
        db.upsert_connection("project", "sentry", pid, "Sentry", {"org": "acme"}, f"project/{pid}.env", "ok")
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO project_connectors (project_id, type, enabled, mode) VALUES "
                    "(%s,'sentry',true,'own'), (%s,'github',true,'inherit')",
                    (pid, pid),
                )
                cur.execute(
                    "INSERT INTO project_mcp (project_id, name, enabled, config) VALUES (%s,'sentry',true,%s)",
                    (pid, '{"url":"https://mcp.sentry"}'),
                )
                cur.execute("INSERT INTO project_skills (project_id, skill, enabled) VALUES (%s,'code-review',true)", (pid,))

        fake = FakeExecutor()
        worker.process_run(run_id, executor=fake, deliverer=LocalBareDeliverer(), checkouts_dir=str(work / "checkouts"))

        # ★ Frontière de sécurité : secret PROJET présent, secret APP absent.
        assert fake.received_env.get("SENTRY_AUTH_TOKEN") == "ST-PROJECT-SECRET"
        assert "GITHUB_TOKEN" not in fake.received_env
        assert all("APP" not in v for v in fake.received_env.values())
        # ★ .mcp.json composé écrit dans le checkout avant le run.
        assert fake.received_mcp and "sentry" in fake.received_mcp["mcpServers"]
        # skills injectés dans le goal
        assert "code-review" in fake.received_goal
    finally:
        _cleanup(pid, work)
