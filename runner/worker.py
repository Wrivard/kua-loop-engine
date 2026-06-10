"""Worker du Runner (doc 06) — le pipeline d'un run + le watcher d'approbations.

Cycle (agnostique au type de loop) :
  claim → prepare (checkout isolé) → compile (goal libre + CLAUDE.md + règles) →
  run (claude -p, budget+timeout) → ensure-commit → verify-gate →
  deliver (push branche + PR draft) → gate d'autonomie.

Garde-fous : budget/timeout → échec PROPRE sans PR ; JAMAIS de merge/push sur la
branche de base sans une ligne `approvals` (sauf autonomy=auto, hors moteur).
"""

from __future__ import annotations

import shutil
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from kua_core import db
from kua_core.config import get_settings
from runner import gitops
from runner.context import RunCtx
from runner.deliver import Deliverer, make_deliverer
from runner.executor import ClaudeExecutor, Executor
from runner.goal import compile_goal
from runner.target import resolve_target
from runner.verify import run_verify_gate


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _checkouts_dir(override: Optional[str]) -> Path:
    base = Path(override) if override else Path(get_settings_safe("checkouts_dir", "/srv/kua/checkouts"))
    base.mkdir(parents=True, exist_ok=True)
    return base


def get_settings_safe(attr: str, default: str) -> str:
    try:
        return getattr(get_settings(), attr)
    except Exception:
        return default


def _write_log(run_id: str, content: str) -> Optional[str]:
    """Écrit le log brut du run (best-effort : ne casse pas si le dossier manque)."""
    try:
        log_dir = Path(get_settings_safe("log_dir", "/var/log/kua"))
        log_dir.mkdir(parents=True, exist_ok=True)
        path = log_dir / f"{run_id}.log"
        path.write_text(content or "", encoding="utf-8")
        return str(path)
    except Exception:
        return None


def _fail(ctx: RunCtx, status: str, summary: str, log_path: Optional[str] = None) -> dict[str, Any]:
    db.update_run(ctx.run_id, status=status, summary=summary, finished_at=_now(), log_path=log_path)
    db.set_thread_status(ctx.thread_id, "failed")
    db.post_message(ctx.thread_id, "agent", f"Échec du run ({status}) : {summary}", run_id=ctx.run_id)
    return {"status": status, "summary": summary}


def process_run(
    run_id: str,
    *,
    executor: Optional[Executor] = None,
    deliverer: Optional[Deliverer] = None,
    checkouts_dir: Optional[str] = None,
) -> dict[str, Any]:
    """Exécute UN run de bout en bout. Retourne un rapport. Robuste : toute
    exception inattendue marque le run `failed` au lieu de le laisser bloqué."""
    row = db.get_run_context(run_id)
    if not row:
        return {"status": "missing", "run_id": run_id}
    ctx = RunCtx.from_row(row)
    checkout = _checkouts_dir(checkouts_dir) / ctx.project_id / ctx.run_id

    try:
        # --- annonce + carte de run pour l'UI ---
        db.update_run(run_id, status="preparing", started_at=_now())
        db.set_thread_status(ctx.thread_id, "working")
        db.post_message(ctx.thread_id, "agent", f"Je lance un run : {ctx.goal[:160]}")
        db.post_message(ctx.thread_id, "run", None, run_id=run_id)  # carte de run (UI)

        # --- PREPARE : checkout isolé ---
        if checkout.exists():
            shutil.rmtree(checkout)
        checkout.parent.mkdir(parents=True, exist_ok=True)
        target = resolve_target(ctx)
        if target.mode == "existing":
            gitops.clone(target.repo_url, checkout, target.base_branch)
        else:
            gitops.init_new(checkout, target.base_branch)
            if ctx.repo_url and ctx.repo_url.strip() not in ("", "-", "new", "none", "tbd", "n/a"):
                gitops.add_remote(checkout, "origin", ctx.repo_url)
        gitops.checkout_new_branch(checkout, target.work_branch)

        # --- COMPILE ---
        goal = compile_goal(ctx, checkout)

        # --- RUN (claude -p ou Fake) ---
        db.update_run(run_id, status="running")
        ex = executor or ClaudeExecutor()
        result = ex.run(
            checkout, goal, budget_usd=ctx.budget_usd, timeout_min=ctx.timeout_min, model=ctx.model
        )
        log_path = _write_log(run_id, result.raw)
        db.update_run(
            run_id,
            cost_usd=result.cost_usd,
            iterations=result.iterations,
            summary=result.summary,
            log_path=log_path,
        )
        if not result.ok:
            # budget_exceeded / timed_out / failed → échec propre, AUCUNE PR.
            return _fail(ctx, result.status, result.summary, log_path)

        # --- ensure-commit (fallback si claude n'a pas committé) ---
        gitops.commit_all(checkout, f"kua: {(ctx.subject or ctx.goal)[:60]}")
        if gitops.commits_ahead(checkout, target.base_branch) == 0:
            return _fail(ctx, "failed", "Aucun changement produit par le run.", log_path)

        # --- VERIFY gate ---
        db.update_run(run_id, status="verifying")
        vr = run_verify_gate(checkout)
        if vr.status == "failed":
            return _fail(ctx, "failed", f"Gate de vérif échouée ({vr.command}).", log_path)

        # --- DELIVER (push branche + PR draft) ---
        dlv = deliverer or make_deliverer(ctx)
        dr = dlv.deliver(checkout, target.work_branch, target.base_branch, ctx)
        db.update_run(
            run_id,
            status="awaiting_approval",
            branch=target.work_branch,
            pr_url=dr.pr_url,
            finished_at=_now(),
        )
        db.set_thread_status(ctx.thread_id, "awaiting_approval")
        cost = f"{result.cost_usd:.4f} $" if result.cost_usd else "0 $"
        db.post_message(
            ctx.thread_id,
            "agent",
            f"Fait. PR : {dr.pr_url}\nCoût : {cost} · vérif : {vr.status} · branche : {target.work_branch}",
            run_id=run_id,
        )

        # --- GATE d'autonomie ---
        if ctx.autonomy == "auto" and not ctx.is_engine:
            # auto = pas de gate humaine (derrière flag par loop ET projet, jamais le moteur).
            return _merge_run(run_id) | {"auto": True}

        return {
            "status": "awaiting_approval",
            "pr_url": dr.pr_url,
            "branch": target.work_branch,
            "cost_usd": str(result.cost_usd),
            "verify": vr.status,
        }
    except Exception as exc:  # filet de sécurité : jamais de run bloqué en running
        return _fail(ctx, "failed", f"Erreur interne du Runner : {type(exc).__name__}: {exc}")


def _merge_run(run_id: str) -> dict[str, Any]:
    """Fusionne la branche approuvée dans la base et publie (clone frais → merge →
    push base). N'est appelé qu'après une décision `approved` (ou autonomy=auto)."""
    row = db.get_run_context(run_id)
    if not row:
        return {"status": "missing"}
    ctx = RunCtx.from_row(row)
    if not ctx.branch or not ctx.repo_url:
        db.update_run(run_id, status="approved", finished_at=_now())
        db.set_thread_status(ctx.thread_id, "resolved")
        db.post_message(ctx.thread_id, "agent", "Approuvé (rien à fusionner).", run_id=run_id)
        return {"status": "approved"}
    tmp = Path(tempfile.mkdtemp(prefix="kua-merge-"))
    try:
        gitops.clone(ctx.repo_url, tmp, ctx.default_branch)
        gitops._run(["fetch", "origin", ctx.branch], cwd=tmp)
        gitops._run(["merge", "--no-edit", f"origin/{ctx.branch}"], cwd=tmp)
        gitops.push(tmp, "origin", ctx.default_branch)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    db.update_run(run_id, status="pushed", finished_at=_now())
    db.set_thread_status(ctx.thread_id, "resolved")
    db.post_message(
        ctx.thread_id, "agent", f"Approuvé → fusionné dans {ctx.default_branch} et publié.", run_id=run_id
    )
    return {"status": "pushed"}


def process_approvals() -> list[dict[str, Any]]:
    """Watcher : agit sur les runs `awaiting_approval` ayant une décision (doc 06 §8).
    La transition de statut empêche le re-traitement."""
    results: list[dict[str, Any]] = []
    for row in db.runs_awaiting_decision():
        run_id = str(row["run_id"])
        thread_id = str(row["thread_id"])
        decision = row["decision"]
        if decision == "approved":
            res = _merge_run(run_id)
        elif decision == "rejected":
            db.update_run(run_id, status="rejected", finished_at=_now())
            db.set_thread_status(thread_id, "rejected")
            db.post_message(thread_id, "agent", "Refusé. Conversation fermée.", run_id=run_id)
            res = {"status": "rejected"}
        elif decision == "redo":
            nuance = (row.get("comment") or "").strip()
            new_goal = row["goal"] + (f"\n\nNuance demandée : {nuance}" if nuance else "")
            new_run_id = db.add_run(thread_id, new_goal)
            db.update_run(run_id, status="rejected")  # l'ancien run est remplacé
            db.set_thread_status(thread_id, "working")
            db.post_message(thread_id, "agent", "Refaire : je relance un run avec ta nuance.", run_id=run_id)
            res = {"status": "redo", "new_run_id": new_run_id}
        else:
            res = {"status": "ignored", "decision": decision}
        results.append({"run_id": run_id, "decision": decision, **res})
    return results


def run_worker(*, once: bool = False, poll_interval: float = 5.0, executor: Optional[Executor] = None) -> None:
    """Boucle principale : traite les approbations, réclame un run queued, l'exécute."""
    while True:
        process_approvals()
        claimed = db.claim_queued_run()
        if claimed:
            process_run(str(claimed["run_id"]), executor=executor)
        if once:
            break
        if not claimed:
            time.sleep(poll_interval)
