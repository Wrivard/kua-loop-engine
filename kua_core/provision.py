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


def _parse_repo(repo: str) -> str:
    """Normalise « owner/nom », « github.com/owner/nom », URL https/git → 'owner/nom'."""
    s = repo.strip().rstrip("/")
    if s.endswith(".git"):
        s = s[:-4]
    s = s.replace("https://", "").replace("http://", "").replace("git@github.com:", "github.com/")
    if "github.com/" in s:
        s = s.split("github.com/", 1)[1]
    parts = [p for p in s.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"repo invalide : {repo!r} (attendu owner/nom)")
    return f"{parts[0]}/{parts[1]}"


def import_existing_repo(repo: str, *, facade: str = "general", budget_usd: float = 5.0) -> dict[str, Any]:
    """Importe un repo GitHub EXISTANT : vérifie qu'il existe (et est accessible avec le token —
    donc qu'il m'appartient) puis l'enregistre comme projet CHARGÉ + une loop. Réutilise
    register_project/ensure_loop (PAS create_user_repo : le repo existe déjà)."""
    if budget_usd is None or budget_usd <= 0:
        raise ValueError("budget_usd doit être > 0.")
    full = _parse_repo(repo)
    info = github_api.get_repo(full)
    if not info:
        raise ValueError(f"repo introuvable ou inaccessible avec le token : {full}")
    name = info.get("name") or full.split("/")[-1]
    slug = slugify(name)
    repo_url = info.get("clone_url") or f"https://github.com/{full}.git"
    default_branch = info.get("default_branch") or "main"
    db.register_project(
        slug, name, repo_url, default_branch=default_branch, workspace=True, is_engine=False, allow_auto=False
    )
    loop_id = db.ensure_loop(slug, facade, autonomy="approve_final", budget_usd=budget_usd)
    return {
        "slug": slug,
        "name": name,
        "repo_url": repo_url,
        "html_url": info.get("html_url", ""),
        "default_branch": default_branch,
        "full_name": info.get("full_name", full),
        "facade": facade,
        "loop_id": loop_id,
        "workspace": True,
    }


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
