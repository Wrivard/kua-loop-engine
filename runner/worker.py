"""Worker du Runner (doc 06) — pipeline d'un run + watcher d'approbations.

Cycle (agnostique) : claim → prepare (checkout isolé) → compile → run (claude/Fake)
→ ensure-commit → verify-gate → deliver (push branche + PR draft) → gate d'autonomie.

Garde-fous (revue adversariale) :
- Budget absent/≤0 → run REFUSÉ avant tout spawn (règle #2).
- `auto` exige loop=auto ET projet.allow_auto ET non-moteur ET vérif passée (règle #1).
- _merge_run est fail-closed et autonome : re-vérifie is_engine + approbation, fusionne le
  SHA REVIEWÉ (anti-TOCTOU), claim atomique anti-double-merge, échec git → run failed propre.
- process_approvals et la boucle survivent à toute exception (jamais de poison loop).
- Reaper : un worker mort laisse un run actif → libéré après un délai.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from agent.agent import handle_message as agent_decide
from kua_core import db
from kua_core.composition import compose_project_context, project_run_env
from kua_core.config import get_settings
from runner import gitops
from runner.context import RunCtx
from runner.deliver import Deliverer, make_deliverer
from runner.executor import ClaudeExecutor, Executor
from runner.goal import compile_goal
from runner.target import resolve_target
from runner.verify import run_verify_gate

logger = logging.getLogger("kua.runner")

# Délai au-delà duquel un run actif (preparing/running/verifying) est jugé orphelin.
ORPHAN_GRACE_MIN = int(os.environ.get("KUA_ORPHAN_GRACE_MIN", "60"))

# Intervalle du heartbeat worker (un thread daemon le rafraîchit même pendant un long
# run synchrone → /health distingue « worker occupé » de « worker mort »).
HEARTBEAT_SEC = float(os.environ.get("KUA_HEARTBEAT_SEC", "10"))


def _heartbeat_loop(pid: int) -> None:
    """Thread daemon : rafraîchit le heartbeat worker en continu (best-effort)."""
    while True:
        try:
            db.touch_worker_heartbeat(pid)
        except Exception:
            logger.exception("kua: heartbeat worker a échoué")
        time.sleep(HEARTBEAT_SEC)


SCHEDULER_SEC = float(os.environ.get("KUA_SCHEDULER_SEC", "60"))


def _scheduler_loop() -> None:
    """Thread daemon : cron PROPOSE-ONLY (M17) — fabrique des propositions dans l'inbox aux
    heures dites, JAMAIS un run direct. allow_auto reste FALSE."""
    from runner import scheduler  # noqa: PLC0415

    while True:
        try:
            scheduler.tick(datetime.now(timezone.utc))
        except Exception:
            logger.exception("kua: scheduler cron a échoué")
        time.sleep(SCHEDULER_SEC)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_settings_safe(attr: str, default: str) -> str:
    try:
        return getattr(get_settings(), attr)
    except Exception:
        return default


def _checkouts_dir(override: Optional[str]) -> Path:
    base = Path(override) if override else Path(get_settings_safe("checkouts_dir", "/srv/kua/checkouts"))
    base.mkdir(parents=True, exist_ok=True)
    return base


def _write_log(run_id: str, content: str) -> Optional[str]:
    try:
        log_dir = Path(get_settings_safe("log_dir", "/var/log/kua"))
        log_dir.mkdir(parents=True, exist_ok=True)
        path = log_dir / f"{run_id}.log"
        path.write_text(content or "", encoding="utf-8")
        return str(path)
    except Exception:
        return None


def _notify(kind: str, title: str, body: Optional[str] = None, link: Optional[str] = None) -> None:
    """Émet une notification (cloche app). Best-effort : ne casse jamais le pipeline."""
    try:
        db.create_notification(kind, title, body, link)
    except Exception:
        logger.exception("kua: notification a échoué (%s)", kind)


def _fail(ctx: RunCtx, status: str, summary: str, log_path: Optional[str] = None) -> dict[str, Any]:
    """Marque un run en échec — DÉFENSIF : chaque écriture est best-effort pour ne
    jamais laisser un run bloqué, même si la DB est transitoirement indisponible."""
    try:
        db.update_run(ctx.run_id, status=status, summary=summary, finished_at=_now(), log_path=log_path)
    except Exception:
        logger.exception("kua: _fail update_run a échoué run_id=%s", ctx.run_id)
    try:
        db.set_thread_status(ctx.thread_id, "failed")
    except Exception:
        logger.exception("kua: _fail set_thread_status a échoué thread_id=%s", ctx.thread_id)
    try:
        db.post_message(ctx.thread_id, "agent", f"Échec du run ({status}) : {summary}", run_id=ctx.run_id)
    except Exception:
        logger.exception("kua: _fail post_message a échoué thread_id=%s", ctx.thread_id)
    _notify(
        "budget" if status == "budget_exceeded" else "failed",
        f"Run {status} — {(ctx.subject or ctx.goal)[:50]}", summary[:200], f"/c/{ctx.thread_id}",
    )
    return {"status": status, "summary": summary}


def process_run(
    run_id: str,
    *,
    executor: Optional[Executor] = None,
    deliverer: Optional[Deliverer] = None,
    checkouts_dir: Optional[str] = None,
) -> dict[str, Any]:
    """Exécute UN run de bout en bout. Robuste : toute exception → run failed."""
    row = db.get_run_context(run_id)
    if not row:
        return {"status": "missing", "run_id": run_id}
    ctx = RunCtx.from_row(row)

    # Garde-fou #2 : un run sans budget explicite et positif ne démarre PAS.
    if ctx.budget_usd is None or ctx.budget_usd <= 0:
        return _fail(ctx, "failed", "Run sans budget explicite et positif — refusé (CLAUDE.md règle #2).")

    # GARDE-FOU WORKSPACE (permanent) : le Runner n'agit QUE sur un projet enregistré
    # ET chargé (workspace=true), même si le token a accès au repo. Refus AVANT tout
    # checkout/spawn — aucune action sur un repo hors de la liste des projets chargés.
    if not ctx.workspace:
        return _fail(
            ctx, "failed",
            "Projet hors workspace (non chargé) — le Runner refuse d'agir sur ce repo (garde-fou permanent).",
        )

    checkout = _checkouts_dir(checkouts_dir) / ctx.project_id / ctx.run_id
    try:
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
            if ctx.repo_url and ctx.repo_url.strip().lower() not in ("", "-", "new", "none", "tbd", "n/a"):
                gitops.add_remote(checkout, "origin", ctx.repo_url)
        gitops.checkout_new_branch(checkout, target.work_branch)

        # --- COMPILE + COMPOSITION (connecteurs/skills/mcp DU PROJET) ---
        goal = compile_goal(ctx, checkout)
        comp = compose_project_context(ctx.project_id)
        if comp["mcp"]["mcpServers"]:
            (checkout / ".mcp.json").write_text(json.dumps(comp["mcp"], indent=2), encoding="utf-8")
        if comp["skills"]:
            goal += "\n\nSKILLS ACTIVÉS POUR CE PROJET : " + ", ".join(comp["skills"])
        # SECRETS PROJET UNIQUEMENT dans l'env du run (jamais app — garanti par la composition).
        run_env = project_run_env(ctx.project_id)

        # --- RUN ---
        db.update_run(run_id, status="running")
        ex = executor or ClaudeExecutor()
        result = ex.run(
            checkout, goal, budget_usd=ctx.budget_usd, timeout_min=ctx.timeout_min,
            model=ctx.model, extra_env=run_env,
        )
        log_path = _write_log(run_id, result.raw)
        db.update_run(run_id, cost_usd=result.cost_usd, iterations=result.iterations, summary=result.summary, log_path=log_path)
        if not result.ok:
            return _fail(ctx, result.status, result.summary, log_path)  # budget/timeout/échec → AUCUNE PR

        # --- ensure-commit + détection « aucun changement » ---
        gitops.commit_all(checkout, f"kua: {(ctx.subject or ctx.goal)[:60]}")
        if gitops.commits_ahead(checkout, target.base_branch) == 0:
            return _fail(ctx, "failed", "Aucun changement produit par le run.", log_path)

        # --- VERIFY gate : rapport TOUJOURS attaché au run ; bloquant SEULEMENT si verify_mode=block.
        # Défaut 'report' (non bloquant) → la carte d'approbation montre le rouge/vert, l'humain décide.
        db.update_run(run_id, status="verifying")
        vr = run_verify_gate(checkout)
        try:
            db.set_verify_report(run_id, vr.status, vr.command, vr.output)
        except Exception:
            logger.exception("kua: set_verify_report a échoué run_id=%s", run_id)
        if ctx.verify_mode == "block" and vr.status == "failed":
            return _fail(ctx, "failed", f"Gate de vérif échouée ({vr.command}) — mode block.", log_path)

        # --- DELIVER (push branche + PR draft) ; pin du SHA reviewé (anti-TOCTOU) ---
        delivered_sha = gitops.head_sha(checkout)
        dlv = deliverer or make_deliverer(ctx)
        dr = dlv.deliver(checkout, target.work_branch, target.base_branch, ctx)
        db.update_run(
            run_id,
            status="awaiting_approval",
            branch=target.work_branch,
            pr_url=dr.pr_url or None,
            delivered_sha=delivered_sha,
            finished_at=_now(),
        )
        db.set_thread_status(ctx.thread_id, "awaiting_approval")
        cost = f"{result.cost_usd:.4f} $" if result.cost_usd else "0 $"
        if dr.pr_url:
            msg = f"Fait. PR : {dr.pr_url}\nCoût : {cost} · vérif : {vr.status} · branche : {target.work_branch}"
        else:
            msg = (
                f"Fait — branche {target.work_branch} poussée. ⚠️ PR à créer manuellement "
                f"(échec API). Coût : {cost} · vérif : {vr.status}"
            )
        db.post_message(ctx.thread_id, "agent", msg, run_id=run_id)
        _notify("awaiting", f"À confirmer — {(ctx.subject or ctx.goal)[:50]}", msg[:200], f"/c/{ctx.thread_id}")

        # --- GATE d'autonomie : auto = loop=auto ET projet.allow_auto ET non-moteur ET vérif passée ---
        if ctx.autonomy == "auto" and ctx.allow_auto and not ctx.is_engine and vr.status == "passed":
            return _merge_run(run_id) | {"auto": True}

        return {
            "status": "awaiting_approval",
            "pr_url": dr.pr_url,
            "branch": target.work_branch,
            "cost_usd": str(result.cost_usd),
            "verify": vr.status,
        }
    except Exception as exc:
        return _fail(ctx, "failed", f"Erreur interne du Runner : {type(exc).__name__}: {exc}")
    finally:
        shutil.rmtree(checkout, ignore_errors=True)  # ménage : pas d'accumulation disque


def _merge_run(run_id: str) -> dict[str, Any]:
    """Fusionne la branche APPROUVÉE dans la base et publie. Fail-closed et autonome :
    claim atomique (anti-double-merge) + re-vérif moteur/approbation + fusion du SHA reviewé."""
    # Claim atomique : un seul appelant passe awaiting_approval → merging.
    if not db.claim_run_for_status(run_id, "awaiting_approval", "merging"):
        return {"status": "already_handled", "run_id": run_id}
    row = db.get_run_context(run_id)
    if not row:
        return {"status": "missing"}
    ctx = RunCtx.from_row(row)
    thread_id = ctx.thread_id

    # Garde workspace — défense en profondeur : jamais de fusion sur un projet non chargé.
    if not ctx.workspace:
        _terminate(run_id, thread_id, "failed", "Refusé : projet hors workspace (non chargé) — aucune fusion.")
        return {"status": "refused", "reason": "workspace"}

    # Garde moteur (règle 5) — défense en profondeur, indépendante de l'appelant.
    if ctx.is_engine:
        _terminate(run_id, thread_id, "failed", "Refusé : le moteur ne se fusionne jamais via ce chemin (règle 5).")
        return {"status": "refused", "reason": "engine"}

    # Ré-validation de l'autorisation : approbation 'approved' OU auto autorisé.
    appr = db.latest_approval(run_id)
    authorized = (appr is not None and appr.get("decision") == "approved") or (
        ctx.autonomy == "auto" and ctx.allow_auto
    )
    if not authorized:
        _terminate(run_id, thread_id, "failed", "Refusé : aucune autorisation valide pour la fusion.")
        return {"status": "refused", "reason": "unauthorized"}

    if not ctx.branch or not ctx.repo_url:
        _terminate(run_id, thread_id, "approved", "Approuvé (rien à fusionner).", resolved=True)
        return {"status": "approved"}

    tmp = Path(tempfile.mkdtemp(prefix="kua-merge-"))
    try:
        gitops.clone(ctx.repo_url, tmp, ctx.default_branch)
        gitops.fetch(tmp, "origin", ctx.branch)
        # Anti-TOCTOU : on fusionne le SHA REVIEWÉ, pas l'état vivant de la branche.
        target_ref = f"origin/{ctx.branch}"
        if ctx.delivered_sha:
            fetched = gitops._run(["rev-parse", f"origin/{ctx.branch}"], cwd=tmp).strip()
            if fetched != ctx.delivered_sha:
                raise gitops.GitError(
                    f"la branche a changé depuis la revue (reviewé {ctx.delivered_sha[:8]}, distant {fetched[:8]})"
                )
            target_ref = ctx.delivered_sha
        gitops._run(["merge", "--no-edit", target_ref], cwd=tmp)
        gitops.push(tmp, "origin", ctx.default_branch)
    except Exception as exc:
        try:
            gitops._run(["merge", "--abort"], cwd=tmp)
        except Exception:
            pass
        _terminate(run_id, thread_id, "failed", f"Échec de la fusion dans {ctx.default_branch} : {exc}")
        return {"status": "merge_failed"}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    _terminate(run_id, thread_id, "pushed", f"Approuvé → fusionné dans {ctx.default_branch} et publié.", resolved=True)
    _notify("merged", f"Fusionné dans {ctx.default_branch} — {(ctx.subject or '')[:50]}", None, f"/c/{thread_id}")
    return {"status": "pushed"}


def _terminate(run_id: str, thread_id: str, run_status: str, message: str, *, resolved: bool = False) -> None:
    """Transition terminale d'un run + thread + message agent (best-effort)."""
    try:
        db.update_run(run_id, status=run_status, finished_at=_now())
    except Exception:
        logger.exception("kua: _terminate update_run a échoué run_id=%s", run_id)
    try:
        db.set_thread_status(thread_id, "resolved" if resolved else "failed")
    except Exception:
        logger.exception("kua: _terminate set_thread_status a échoué thread_id=%s", thread_id)
    try:
        db.post_message(thread_id, "agent", message, run_id=run_id)
    except Exception:
        logger.exception("kua: _terminate post_message a échoué thread_id=%s", thread_id)


def process_approvals() -> list[dict[str, Any]]:
    """Watcher (doc 06 §8). Chaque décision est traitée sous claim atomique + try/except
    par-run → ni double-exécution, ni poison loop si une décision plante."""
    results: list[dict[str, Any]] = []
    for row in db.runs_awaiting_decision():
        run_id = str(row["run_id"])
        thread_id = str(row["thread_id"])
        decision = row["decision"]
        try:
            if decision == "approved":
                res = _merge_run(run_id)  # claim atomique interne
            elif decision == "rejected":
                if db.claim_run_for_status(run_id, "awaiting_approval", "rejected"):
                    db.update_run(run_id, finished_at=_now())
                    db.set_thread_status(thread_id, "rejected")
                    db.post_message(thread_id, "agent", "Refusé. Conversation fermée.", run_id=run_id)
                    res = {"status": "rejected"}
                else:
                    res = {"status": "already_handled"}
            elif decision == "redo":
                if db.claim_run_for_status(run_id, "awaiting_approval", "rejected"):
                    db.update_run(run_id, finished_at=_now())
                    nuance = (row.get("comment") or "").strip()
                    new_goal = row["goal"] + (f"\n\nNuance demandée : {nuance}" if nuance else "")
                    new_run_id = db.add_run(thread_id, new_goal)
                    db.set_thread_status(thread_id, "working")
                    db.post_message(thread_id, "agent", "Refaire : je relance un run avec ta nuance.", run_id=run_id)
                    res = {"status": "redo", "new_run_id": new_run_id}
                else:
                    res = {"status": "already_handled"}
            else:
                res = {"status": "ignored", "decision": decision}
        except Exception as exc:  # filet par-run : sortir de awaiting_approval (anti poison loop)
            logger.exception("kua: décision %s échouée run_id=%s", decision, run_id)
            try:
                db.claim_run_for_status(run_id, "awaiting_approval", "failed")
                db.update_run(run_id, finished_at=_now())
                db.set_thread_status(thread_id, "failed")
                db.post_message(thread_id, "agent", f"Échec du traitement de la décision : {type(exc).__name__}: {exc}", run_id=run_id)
            except Exception:
                logger.exception("kua: filet process_approvals a échoué run_id=%s", run_id)
            res = {"status": "error", "error": str(exc)}
        results.append({"run_id": run_id, "decision": decision, **res})
    return results


def handle_thread_message(thread_id: str, message: str) -> dict[str, Any]:
    """Réaction de l'agent de façade à un message utilisateur (doc 16). Le message
    est une DONNÉE (la nuance), pas une instruction. enqueue_run → relance un run
    avec la précision (greffée sur le goal du dernier run) ; sinon → réponse agent."""
    action = agent_decide(thread_id, message)
    if action.kind == "enqueue_run":
        base = db.last_run_goal(thread_id)
        extra = action.goal_extra or message
        new_goal = f"{base}\n\nPrécision : {extra}" if base else extra
        run_id = db.add_run(thread_id, new_goal)
        db.set_thread_status(thread_id, "working")
        db.post_message(thread_id, "agent", "Compris — je relance un run avec ta précision.")
        return {"action": "enqueue_run", "run_id": run_id}
    db.post_message(thread_id, "agent", action.text or "")
    return {"action": action.kind}


def process_agent_messages() -> list[dict[str, Any]]:
    """Watcher de l'agent de façade : pour chaque thread dont le dernier message est
    de l'utilisateur (et sans run en cours), fait réagir l'agent (doc 16)."""
    results: list[dict[str, Any]] = []
    for row in db.threads_awaiting_agent():
        tid = str(row["thread_id"])
        try:
            res = handle_thread_message(tid, row.get("message") or "")
        except Exception as exc:  # noqa: BLE001
            logger.exception("kua: agent message échoué thread=%s", tid)
            res = {"action": "error", "error": str(exc)}
        results.append({"thread_id": tid, **res})
    return results


def _reap_orphans() -> None:
    for r in db.reap_orphaned_runs(ORPHAN_GRACE_MIN):
        try:
            db.set_thread_status(str(r["thread_id"]), "failed")
            db.post_message(
                str(r["thread_id"]), "agent",
                "Échec (orphelin) : le worker est mort pendant l'exécution. Run libéré, façade débloquée.",
                run_id=str(r["id"]),
            )
        except Exception:
            logger.exception("kua: reap message a échoué run_id=%s", r.get("id"))


def run_worker(*, once: bool = False, poll_interval: float = 5.0, executor: Optional[Executor] = None) -> None:
    """Boucle principale. Chaque étape est protégée : un run pourri ne tue jamais le daemon.

    Pause : le claim est gardé côté SQL (aucun NOUVEAU run réclamé quand `paused`) ; les
    runs déjà en cours finissent, et approbations/messages d'agent continuent (achèvement)."""
    # Warm-up : importer psycopg (+ psycopg.rows) DANS le thread principal AVANT de lancer
    # le thread heartbeat. Sinon les deux threads déclenchent le 1er import du module C
    # psycopg simultanément → course → « ImportError: cannot import name Row » au 1er reap
    # (bénin — un cycle raté — mais bruyant et alarmant dans les logs).
    try:
        import psycopg  # noqa: F401, PLC0415
        from psycopg.rows import dict_row  # noqa: F401, PLC0415
    except Exception:
        logger.exception("kua: warm-up psycopg a échoué")
    try:
        db.touch_worker_heartbeat(os.getpid())
    except Exception:
        logger.exception("kua: heartbeat worker a échoué")
    if not once:
        threading.Thread(
            target=_heartbeat_loop, args=(os.getpid(),), daemon=True, name="kua-heartbeat"
        ).start()
        threading.Thread(target=_scheduler_loop, daemon=True, name="kua-scheduler").start()
    was_paused = False
    while True:
        try:
            _reap_orphans()
        except Exception:
            logger.exception("kua: reap_orphaned_runs a échoué")
        try:
            process_approvals()
        except Exception:
            logger.exception("kua: process_approvals a levé")
        try:
            process_agent_messages()
        except Exception:
            logger.exception("kua: process_agent_messages a levé")
        # Pause : le garde-fou AUTORITAIRE est dans le claim SQL (atomique). Ici on lit le flag
        # pour logguer les transitions et éviter un aller-retour DB inutile pendant la pause.
        try:
            paused = db.is_paused()
        except Exception:
            logger.exception("kua: lecture de l'état pause a échoué")
            paused = False
        if paused != was_paused:
            logger.info("kua: moteur %s", "EN PAUSE — aucun nouveau run" if paused else "REPRIS")
            was_paused = paused
        claimed = None
        if not paused:
            try:
                claimed = db.claim_queued_run()
                if claimed:
                    process_run(str(claimed["id"]), executor=executor)  # RETURNING * → clé 'id'
            except Exception:
                logger.exception("kua: claim/process_run a levé")
        if once:
            break
        if not claimed:
            time.sleep(poll_interval)
