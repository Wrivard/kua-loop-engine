"""Contexte d'un run, agnostique au type de loop (doc 06).

Un run porte un GOAL libre + une `facade` qui n'est qu'une CLÉ DE PRESET ouverte
(bugfix/discord/seo/demo/finish, mais aussi "general", "new_project", ou tout
autre texte). Le Runner ne branche JAMAIS sa logique sur la façade : il lit le
goal + le contexte projet et exécute. La façade sert seulement à charger un
gabarit optionnel (runner/goals/{facade}.md) s'il existe.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional


@dataclass
class RunCtx:
    run_id: str
    thread_id: str
    goal: str
    facade: str
    subject: str
    project_id: str
    project_name: str
    repo_url: Optional[str]
    default_branch: str
    is_engine: bool
    autonomy: str          # manual | approve_final | auto
    budget_usd: Decimal
    model: str
    timeout_min: int
    config: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "RunCtx":
        """Construit depuis kua_core.db.get_run_context (loop possiblement absente
        → défauts sûrs)."""
        cfg = row.get("config") or {}
        if not isinstance(cfg, dict):
            cfg = {}
        return cls(
            run_id=str(row["run_id"]),
            thread_id=str(row["thread_id"]),
            goal=row.get("goal") or "",
            facade=(row.get("facade") or "general"),
            subject=row.get("subject") or "",
            project_id=str(row.get("project_id") or ""),
            project_name=row.get("project_name") or row.get("project_id") or "",
            repo_url=row.get("repo_url"),
            default_branch=row.get("default_branch") or "main",
            is_engine=bool(row.get("is_engine")),
            autonomy=(row.get("autonomy") or "manual"),
            budget_usd=Decimal(str(row.get("budget_usd") if row.get("budget_usd") is not None else "5")),
            model=(row.get("model") or "sonnet"),
            timeout_min=int(row.get("timeout_min") or 30),
            config=cfg,
        )

    @property
    def run_short(self) -> str:
        return self.run_id.replace("-", "")[:8]
