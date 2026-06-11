"""kua-ops — LA couche d'actions des agents (doc 18). Source de vérité unique,
AU-DESSUS de l'existant (db, provision, chemins d'approbation du worker) — rien de dupliqué.

Classes d'actions (doc 18) :
- LECTURE  : exécution directe (toujours permise dans le scope du profil appelant).
- MUTATION : la règle de confirmation vit chez l'APPELANT (agent) — demande explicite de
  l'utilisateur dans son message → exécuter et confirmer dans le fil ; initiative de
  l'agent / ambigu → carte de proposition. Ici on garantit seulement les INVARIANTS :
  jamais de merge, jamais d'autonomy='auto', workspace=True requis, chemins atomiques.
- ADMIN    : PAS ici — restart_service/mcp_* restent dans gateway (sysctl/bridge, allowlists
  existantes) ; le serveur MCP les compose par-dessus.

Sécurité : aucun secret ne transite (les lectures ne renvoient ni token ni env) ; le redo
passe par `approvals(decision='redo')` → le watcher du worker rejette v1 + crée v2
ATOMIQUEMENT (claim) — jamais d'add_run direct pendant awaiting_approval.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from kua_core import db, provision

logger = logging.getLogger("kua.ops")


class OpsError(ValueError):
    """Refus AVANT exécution (état invalide, cible inexistante, invariant violé)."""


def _jsonable(v: Any) -> Any:
    """UUID/datetime/Decimal → types JSON (les tools MCP sérialisent la réponse)."""
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, datetime):
        return v.isoformat()
    try:
        from decimal import Decimal  # noqa: PLC0415

        if isinstance(v, Decimal):
            return float(v)
    except Exception:  # pragma: no cover
        pass
    return str(v)


def _rows(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    from psycopg.rows import dict_row  # noqa: PLC0415

    with db.connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return [{k: _jsonable(v) for k, v in r.items()} for r in cur.fetchall()]


# --------------------------------------------------------------------------- LECTURES


def get_thread_context(thread_id: str, message_limit: int = 20) -> dict[str, Any]:
    """Le thread + ses derniers messages + ses runs (versions). Pour « où en est-on ? »."""
    threads = _rows(
        "SELECT id, project_id, facade, subject, status, created_at FROM threads WHERE id = %s",
        (thread_id,),
    )
    if not threads:
        raise OpsError(f"thread introuvable : {thread_id}")
    messages = _rows(
        """SELECT role, content, created_at FROM messages
           WHERE thread_id = %s ORDER BY created_at DESC LIMIT %s""",
        (thread_id, message_limit),
    )
    runs = _rows(
        """SELECT id, status, goal, branch, pr_url, cost_usd, verify_status, created_at
           FROM runs WHERE thread_id = %s ORDER BY created_at ASC""",
        (thread_id,),
    )
    return {"thread": threads[0], "messages": list(reversed(messages)), "runs": runs}


def get_run_status(run_id: str) -> dict[str, Any]:
    """Statut riche d'un run (statut, coût, PR, vérif, résumé) — réutilise get_run_context."""
    ctx = db.get_run_context(run_id)
    if not ctx:
        raise OpsError(f"run introuvable : {run_id}")
    keys = (
        "run_status", "goal", "branch", "pr_url", "preview_url", "cost_usd", "iterations",
        "summary", "verify_status", "verify_command", "thread_id", "project_id", "facade",
    )
    return {k: ctx.get(k) for k in keys} | {"run_id": run_id}


def get_run_diff(run_id: str) -> dict[str, Any]:
    """Diff de la PR d'un run (fichiers, +/-, patchs tronqués) — réutilise gateway.pr_review.
    Import tardif assumé (monorepo) : si la couche gateway n'est pas déployée → erreur propre."""
    ctx = db.get_run_context(run_id)
    if not ctx:
        raise OpsError(f"run introuvable : {run_id}")
    pr_url = ctx.get("pr_url")
    if not pr_url:
        raise OpsError("ce run n'a pas (encore) de PR")
    try:
        from gateway.app import pr_review  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover - dépend du déploiement
        raise OpsError(f"diff indisponible (couche revue absente) : {exc}") from exc
    detail = pr_review.pr_detail(pr_url)
    return {"pr": detail.get("pr"), "files": detail.get("files"), "truncated": detail.get("truncated")}


def list_projects() -> list[dict[str, Any]]:
    return _rows(
        "SELECT id, name, workspace, allow_auto, is_engine FROM projects ORDER BY name"
    )


def list_loops(project_id: Optional[str] = None) -> list[dict[str, Any]]:
    sql = """SELECT id, project_id, facade, enabled, autonomy, budget_usd, model, schedule_cron
             FROM loops"""
    if project_id:
        return _rows(sql + " WHERE project_id = %s ORDER BY facade", (project_id,))
    return _rows(sql + " ORDER BY project_id, facade")


def get_loop_config(loop_id: str) -> dict[str, Any]:
    loop = db.get_loop_by_id(loop_id)
    if not loop:
        raise OpsError(f"loop introuvable : {loop_id}")
    return loop


def get_costs(project_id: Optional[str] = None, month: Optional[str] = None) -> dict[str, Any]:
    """Coûts agrégés (mois courant par défaut, ou 'YYYY-MM') : total + par façade + par statut.
    L'agrégat qui manquait partout (« combien j'ai dépensé ce mois ? »)."""
    if month:
        try:
            start = datetime.strptime(month, "%Y-%m").replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise OpsError(f"mois invalide (attendu YYYY-MM) : {month}") from exc
    else:
        now = datetime.now(timezone.utc)
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = (start.replace(year=start.year + 1, month=1) if start.month == 12
           else start.replace(month=start.month + 1))

    where = "r.created_at >= %s AND r.created_at < %s"
    params: tuple = (start, end)
    if project_id:
        where += " AND t.project_id = %s"
        params += (project_id,)

    rows = _rows(
        f"""SELECT t.project_id, t.facade, r.status, COUNT(*) AS n,
                   COALESCE(SUM(r.cost_usd), 0) AS cost
            FROM runs r JOIN threads t ON t.id = r.thread_id
            WHERE {where}
            GROUP BY t.project_id, t.facade, r.status""",
        params,
    )
    total = float(sum(float(r["cost"]) for r in rows))
    by_facade: dict[str, float] = {}
    by_status: dict[str, int] = {}
    for r in rows:
        by_facade[r["facade"]] = by_facade.get(r["facade"], 0.0) + float(r["cost"])
        by_status[r["status"]] = by_status.get(r["status"], 0) + int(r["n"])
    return {
        "month": start.strftime("%Y-%m"),
        "project_id": project_id,
        "total_usd": round(total, 4),
        "by_facade": {k: round(v, 4) for k, v in by_facade.items()},
        "runs_by_status": by_status,
    }


def get_health() -> dict[str, Any]:
    """Pause moteur + heartbeat worker (lecture seule, aucun secret)."""
    return db.get_system_status()


def list_proposals(status: str = "pending") -> list[dict[str, Any]]:
    return _rows(
        """SELECT id, source, project_id, status, created_at,
                  payload->>'title' AS title, payload->>'facade' AS facade
           FROM proposals WHERE status = %s ORDER BY created_at DESC LIMIT 50""",
        (status,),
    )


# -------------------------------------------------------------------------- MUTATIONS


def _insert_approval(run_id: str, decision: str, actor: str, comment: Optional[str]) -> None:
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO approvals (run_id, decision, decided_by, comment) VALUES (%s, %s, %s, %s)",
                (run_id, decision, actor, comment),
            )


def _require_awaiting(run_id: str) -> dict[str, Any]:
    ctx = db.get_run_context(run_id)
    if not ctx:
        raise OpsError(f"run introuvable : {run_id}")
    if ctx.get("run_status") != "awaiting_approval":
        raise OpsError(f"le run n'est pas à confirmer (statut : {ctx.get('run_status')})")
    return ctx


def redo_run(run_id: str, nuance: str, actor: str = "agent") -> dict[str, Any]:
    """« Refaire avec nuance » : approvals(decision='redo') → le watcher rejette v1 et
    crée v2 avec la nuance, ATOMIQUEMENT. Le merge reste gaté par approve_final."""
    nuance = (nuance or "").strip()
    if not nuance:
        raise OpsError("nuance vide — précise ce qui doit changer")
    ctx = _require_awaiting(run_id)
    _insert_approval(run_id, "redo", actor, nuance)
    logger.info("kua.ops redo_run run=%s actor=%s", run_id, actor)
    return {"status": "redo_queued", "run_id": run_id, "thread_id": ctx.get("thread_id")}


def reject_run(run_id: str, actor: str = "agent") -> dict[str, Any]:
    ctx = _require_awaiting(run_id)
    _insert_approval(run_id, "rejected", actor, None)
    logger.info("kua.ops reject_run run=%s actor=%s", run_id, actor)
    return {"status": "reject_queued", "run_id": run_id, "thread_id": ctx.get("thread_id")}


def create_thread(
    project_id: str,
    facade: str,
    subject: str,
    goal: str,
    actor: str = "agent",
    budget_usd: float = 2.0,
) -> dict[str, Any]:
    """Nouvelle unité de travail. INVARIANT : le Runner n'agit que sur un projet CHARGÉ
    (workspace=True) ; autonomie approve_final (jamais auto)."""
    if not subject.strip() or not goal.strip():
        raise OpsError("subject et goal sont requis")
    project = db.get_project(project_id)
    if not project:
        raise OpsError(f"projet introuvable : {project_id}")
    if not project.get("workspace"):
        raise OpsError(f"projet non chargé (workspace=false) : {project_id}")
    loop_id = db.ensure_loop(project_id, facade, autonomy="approve_final", budget_usd=budget_usd)
    thread_id, run_id = db.create_thread_with_run(
        project_id, str(loop_id), facade, subject.strip(), None, goal.strip()
    )
    logger.info("kua.ops create_thread project=%s facade=%s actor=%s", project_id, facade, actor)
    return {"thread_id": thread_id, "run_id": run_id, "loop_id": str(loop_id)}


def create_loop(project_id: str, facade: str, budget_usd: float = 2.0) -> dict[str, Any]:
    if not db.get_project(project_id):
        raise OpsError(f"projet introuvable : {project_id}")
    loop_id = db.ensure_loop(project_id, facade, autonomy="approve_final", budget_usd=budget_usd)
    return {"loop_id": str(loop_id), "project_id": project_id, "facade": facade}


def update_loop(loop_id: str, **patch: Any) -> dict[str, Any]:
    """Budget / modèle / schedule / autonomy — `autonomy='auto'` refusé par la couche db."""
    if not db.get_loop_by_id(loop_id):
        raise OpsError(f"loop introuvable : {loop_id}")
    db.update_loop_fields(loop_id, **patch)
    return {"loop_id": loop_id, "updated": sorted(k for k, v in patch.items() if v is not None)}


def pause_loop(loop_id: str) -> dict[str, Any]:
    if not db.get_loop_by_id(loop_id):
        raise OpsError(f"loop introuvable : {loop_id}")
    db.set_loop_enabled(loop_id, False)
    return {"loop_id": loop_id, "enabled": False}


def resume_loop(loop_id: str) -> dict[str, Any]:
    if not db.get_loop_by_id(loop_id):
        raise OpsError(f"loop introuvable : {loop_id}")
    db.set_loop_enabled(loop_id, True)
    return {"loop_id": loop_id, "enabled": True}


def import_repo(repo: str, facade: str = "general", budget_usd: float = 2.0) -> dict[str, Any]:
    return provision.import_existing_repo(repo, facade=facade, budget_usd=budget_usd)


def create_repo(name: str, private: bool = True, facade: str = "general", budget_usd: float = 2.0) -> dict[str, Any]:
    return provision.provision_repo_project(name, private=private, facade=facade, budget_usd=budget_usd)
