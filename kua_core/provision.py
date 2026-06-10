"""Provisioning d'un projet depuis l'engine : créer un repo GitHub + l'enregistrer
comme projet CHARGÉ (workspace) avec une loop armée (doc 06).

Cette capacité est la SEULE façon « propre » d'ajouter un repo au workspace du
Runner. Le projet créé est marqué `workspace=true` ⇒ le Runner accepte d'agir
dessus (garde-fou workspace). `allow_auto=false` reste imposé (règle #1).
"""

from __future__ import annotations

import re
from typing import Any

from kua_core import db, github_api


def slugify(name: str) -> str:
    """`name` → slug repo/projet : minuscules, [a-z0-9-], sans tirets aux bords."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "projet"


def provision_repo_project(
    name: str,
    *,
    private: bool = True,
    facade: str = "general",
    budget_usd: float = 5.0,
    autonomy: str = "approve_final",
) -> dict[str, Any]:
    """Crée le repo GitHub (README, branche main) puis enregistre le projet (chargé)
    + une loop (budget > 0, jamais `auto`). Retourne slug + URLs (jamais le token)."""
    if budget_usd is None or budget_usd <= 0:
        raise ValueError("budget_usd doit être > 0 (un run sans budget ne démarre pas — règle #2).")
    if autonomy == "auto":
        raise ValueError("autonomy='auto' interdit à la création (fail-closed — règle #1).")

    slug = slugify(name)
    repo = github_api.create_user_repo(slug, private=private, description=f"kua-loop-engine — {name}")

    db.register_project(
        slug,
        name=name,
        repo_url=repo["repo_url"],
        default_branch=repo.get("default_branch") or "main",
        workspace=True,        # ← projet CHARGÉ : le Runner peut agir dessus
        is_engine=False,
        allow_auto=False,      # ← jamais auto par défaut
    )
    loop_id = db.ensure_loop(
        slug, facade, autonomy=autonomy, budget_usd=budget_usd, model="sonnet", timeout_min=30, enabled=True
    )
    return {
        "slug": slug,
        "name": name,
        "repo_url": repo["repo_url"],
        "html_url": repo["html_url"],
        "full_name": repo["full_name"],
        "private": repo["private"],
        "default_branch": repo.get("default_branch") or "main",
        "facade": facade,
        "autonomy": autonomy,
        "budget_usd": budget_usd,
        "loop_id": loop_id,
        "workspace": True,
    }
