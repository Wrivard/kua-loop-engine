"""Résolution de la cible d'un run (doc 06, étape PREPARE) — agnostique.

Distingue uniquement « repo existant » vs « nouveau projet » à partir des
DONNÉES (repo_url, config, facade='new_project'), jamais d'une logique par façade.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from runner.context import RunCtx

# Valeurs de repo_url qui signifient « pas de repo → nouveau projet ».
_NEW_MARKERS = {"", "-", "new", "none", "tbd", "n/a"}


@dataclass
class TargetSpec:
    mode: str            # "existing" | "new"
    repo_url: str | None
    base_branch: str
    work_branch: str     # kua/{slug}/{run_short} — jamais la branche de base


def resolve_target(ctx: RunCtx) -> TargetSpec:
    # 100% data-driven : on ne regarde QUE repo_url + config, jamais le NOM de façade
    # (la commodité « facade=new_project » est traduite en amont en config.new_project).
    repo = (ctx.repo_url or "").strip()
    is_new = bool(ctx.config.get("new_project")) or repo.lower() in _NEW_MARKERS
    base = ctx.default_branch or "main"
    slug = re.sub(r"[^a-z0-9]+", "-", (ctx.facade or "run").lower()).strip("-") or "run"
    work_branch = f"kua/{slug}/{ctx.run_short}"
    return TargetSpec(
        mode="new" if is_new else "existing",
        repo_url=None if is_new else repo,
        base_branch=base,
        work_branch=work_branch,
    )
