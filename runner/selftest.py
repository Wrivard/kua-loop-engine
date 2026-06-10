"""Self-test end-to-end du Runner sur un repo git BARE LOCAL (doc : valider le
pipeline complet sans GitHub ni PAT).

Flow validé : repo bare local (= « origin » client simulé) → seed agent-ready
(CLAUDE.md + .kua/verify.sh) → projet/loop/thread/run en DB → process_run avec
FakeExecutor (modif déterministe) → branche poussée sur le bare → awaiting_approval
→ approbation `approved` → merge dans main + push → vérifie que main contient la modif.

Tout est créé sous un id `kua-selftest-*` et nettoyé en fin (sauf --keep).
"""

from __future__ import annotations

import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any, Optional

from kua_core import db
from runner import gitops, worker
from runner.deliver import LocalBareDeliverer
from runner.executor import Executor, FakeExecutor


def _seed_db(project_id: str, bare_path: str) -> tuple[str, str]:
    """Crée projet + loop (approve_final) + thread + run(queued). Retourne (thread_id, run_id)."""
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO projects (id, name, repo_url, default_branch, plan, is_engine) "
                "VALUES (%s, %s, %s, 'main', 'base', false)",
                (project_id, "Kua Selftest", bare_path),
            )
            cur.execute(
                "INSERT INTO loops (project_id, facade, enabled, autonomy, model, budget_usd, timeout_min) "
                "VALUES (%s, 'general', true, 'approve_final', 'sonnet', 5, 10) RETURNING id",
                (project_id,),
            )
            loop_id = str(cur.fetchone()[0])
    return db.create_thread_with_run(
        project_id, loop_id, "general", "Selftest run",
        None, "Ajoute une note de test dans KUA_RUN.md.",
    )


def _cleanup_db(project_id: str) -> None:
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM approvals WHERE run_id IN "
                "(SELECT r.id FROM runs r JOIN threads t ON t.id = r.thread_id WHERE t.project_id = %s)",
                (project_id,),
            )
            cur.execute(
                "DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE project_id = %s)",
                (project_id,),
            )
            cur.execute(
                "DELETE FROM runs WHERE thread_id IN (SELECT id FROM threads WHERE project_id = %s)",
                (project_id,),
            )
            cur.execute("DELETE FROM threads WHERE project_id = %s", (project_id,))
            cur.execute("DELETE FROM loops WHERE project_id = %s", (project_id,))
            cur.execute("DELETE FROM projects WHERE id = %s", (project_id,))


def run_selftest(*, keep: bool = False, executor: Optional[Executor] = None) -> dict[str, Any]:
    project_id = f"kua-selftest-{uuid.uuid4().hex[:8]}"
    workdir = Path(tempfile.mkdtemp(prefix="kua-selftest-"))
    bare = workdir / "origin.git"
    seed = workdir / "seed"
    report: dict[str, Any] = {"ok": False, "project_id": project_id, "steps": []}

    def step(name: str, **info: Any) -> None:
        report["steps"].append({name: info or "ok"})

    try:
        # 1) Repo bare (= origin client) + seed agent-ready poussé sur main.
        gitops.create_bare(bare)
        gitops.init_new(seed, "main")
        (seed / "CLAUDE.md").write_text("# Client selftest\nProjet de test pour le Runner.\n", encoding="utf-8")
        (seed / ".kua").mkdir()
        (seed / ".kua" / "verify.sh").write_text("#!/usr/bin/env bash\necho verify-ok\nexit 0\n", encoding="utf-8")
        gitops.commit_all(seed, "chore: agent-ready (selftest)")
        gitops.add_remote(seed, "origin", str(bare))
        gitops.push(seed, "origin", "main")
        step("seed_repo", bare=str(bare))

        # 2) DB : projet + loop + thread + run(queued).
        thread_id, run_id = _seed_db(project_id, str(bare))
        step("seed_db", thread_id=thread_id, run_id=run_id)

        # 3) Pipeline complet (Fake executor + livraison bare locale).
        ex = executor or FakeExecutor()
        deliver_rep = worker.process_run(
            run_id, executor=ex, deliverer=LocalBareDeliverer(), checkouts_dir=str(workdir / "checkouts")
        )
        report["deliver"] = deliver_rep
        if deliver_rep.get("status") != "awaiting_approval":
            report["error"] = f"deliver attendu awaiting_approval, obtenu {deliver_rep}"
            return report
        heads = gitops._run(["ls-remote", "--heads", str(bare)])
        if deliver_rep["branch"] not in heads:
            report["error"] = "branche de travail absente du bare"
            return report
        step("delivered", branch=deliver_rep["branch"], pr=deliver_rep["pr_url"])

        # 4) Approbation `approved` → merge dans main + push.
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO approvals (run_id, decision, decided_by) VALUES (%s, 'approved', 'selftest')",
                    (run_id,),
                )
        approvals_rep = worker.process_approvals()
        mine = [r for r in approvals_rep if r["run_id"] == run_id]
        report["approval"] = mine
        if not mine or mine[0].get("status") != "pushed":
            report["error"] = f"merge attendu pushed, obtenu {mine}"
            return report

        # 5) main du bare contient maintenant la modif → fusion réelle vérifiée.
        verify_clone = workdir / "verify_clone"
        gitops.clone(str(bare), verify_clone, "main")
        if not (verify_clone / "KUA_RUN.md").exists():
            report["error"] = "KUA_RUN.md absent de main après merge"
            return report
        step("merged_to_main", file="KUA_RUN.md")
        report["ok"] = True
        return report
    finally:
        if not keep:
            try:
                _cleanup_db(project_id)
            except Exception as exc:  # noqa: BLE001
                report["cleanup_error"] = str(exc)
            shutil.rmtree(workdir, ignore_errors=True)
        else:
            report["kept_workdir"] = str(workdir)
