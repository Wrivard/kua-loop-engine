"""Compilation du goal final (doc 06, étape COMPILE) — agnostique au type de loop.

Le goal de `runs.goal` est la DEMANDE libre faisant autorité (déjà composée par
qui a enqueué le run — CLI, agent de façade, gateway qui a rempli un gabarit de
preset). Le Runner ne re-template PAS par façade (ce serait de la logique par
façade). Il ajoute seulement : le CLAUDE.md du projet (contexte borné) et les
règles communes (verify-app, petit changement, branche seulement, etc.).
"""

from __future__ import annotations

from pathlib import Path

from runner.context import RunCtx
from runner.runner import COMMON_RULES


def compile_goal(ctx: RunCtx, checkout_dir: Path | str) -> str:
    parts: list[str] = []

    claude_md = Path(checkout_dir) / "CLAUDE.md"
    if claude_md.exists():
        parts.append("CONTEXTE PROJET (CLAUDE.md) :\n" + claude_md.read_text(encoding="utf-8").strip())

    parts.append("DEMANDE :\n" + (ctx.goal or "").strip())
    parts.append(COMMON_RULES.strip())
    return "\n\n".join(p for p in parts if p.strip())
