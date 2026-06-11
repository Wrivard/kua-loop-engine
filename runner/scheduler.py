"""Scheduler cron (M17) — PROPOSE-ONLY. À l'heure dite, fabrique une PROPOSITION dans l'inbox
(source=cron), JAMAIS un run direct. allow_auto reste FALSE : cron propose, l'humain approuve.
Logique pure + testable (is_due / tick avec db injectable + `now` injecté)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


def is_due(schedule: str, last_fired: datetime, now: datetime) -> bool:
    """True si une occurrence cron est passée depuis `last_fired` (et ≤ now)."""
    from croniter import croniter  # noqa: PLC0415

    try:
        prev = croniter(schedule, now).get_prev(datetime)
    except Exception:
        return False
    return prev > last_fired


def cron_proposal_payload(loop: dict[str, Any]) -> dict[str, Any]:
    """Construit l'AgentProposal d'une tâche planifiée à partir du gabarit du loop."""
    facade = loop.get("facade") or "general"
    cfg = loop.get("config") or {}
    goal = cfg.get("cron_goal") or f"Tâche planifiée ({facade}) — projet {loop.get('project_id')}."
    return {
        "action": "create_thread",
        "facade": facade,
        "loop_id": str(loop.get("id")) if loop.get("id") else None,
        "title": cfg.get("cron_title") or f"Cron · {facade}",
        "goal": goal,
        "budget_usd": float(loop.get("budget_usd") or 5),
        "priority": "normal",
        "questions_manquantes": [],
        "resume_humain": f"Proposition planifiée (cron « {loop.get('schedule_cron')} »).",
    }


def tick(now: datetime, *, db_module: Optional[Any] = None) -> list[str]:
    """Vérifie les loops planifiées et crée une PROPOSITION pour celles dues. Jamais de run direct.
    Retourne les loop_id tirés. `db_module` injectable (tests)."""
    db = db_module
    if db is None:
        from kua_core import db as _db  # noqa: PLC0415

        db = _db

    fired: list[str] = []
    for loop in db.loops_with_schedule():
        sched = loop.get("schedule_cron")
        if not sched:
            continue
        cfg = loop.get("config") or {}
        raw_last = cfg.get("last_cron_fired")
        if not raw_last:
            db.set_loop_cron_fired(str(loop["id"]), now.isoformat())  # initialise sans tirer
            continue
        try:
            last = datetime.fromisoformat(raw_last)
        except Exception:
            db.set_loop_cron_fired(str(loop["id"]), now.isoformat())
            continue
        if is_due(sched, last, now):
            payload = cron_proposal_payload(loop)
            db.create_proposal("cron", loop.get("project_id"), payload)
            db.create_notification(
                "proposal", f"Proposition (cron) — {loop.get('facade')}", payload["resume_humain"], "/inbox"
            )
            db.set_loop_cron_fired(str(loop["id"]), now.isoformat())
            fired.append(str(loop["id"]))
    return fired
