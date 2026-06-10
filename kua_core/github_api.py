"""Appels GitHub REST minimalistes (création de repo) — backend only.

Le token (`GITHUB_TOKEN`, scope Administration R/W) vit dans /srv/kua/.env et
n'est JAMAIS journalisé ni renvoyé. stdlib uniquement (urllib) — pas de dépendance.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Optional

_API = "https://api.github.com"


class GithubError(RuntimeError):
    """Erreur d'appel GitHub (message sans secret)."""


def _token() -> str:
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        # Charge /srv/kua/.env dans os.environ (idempotent, mis en cache).
        try:
            from kua_core.config import get_settings  # noqa: PLC0415

            get_settings()
        except Exception:
            pass
        token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise GithubError("GITHUB_TOKEN absent de l'environnement (/srv/kua/.env).")
    return token


def _request(method: str, path: str, body: Optional[dict[str, Any]] = None) -> tuple[int, dict[str, Any]]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{_API}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {_token()}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "kua-loop-engine")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read().decode("utf-8")
            return resp.status, (json.loads(payload) if payload else {})
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("message", "")
        except Exception:
            pass
        # Message d'erreur SANS jamais inclure le token.
        raise GithubError(f"GitHub {method} {path} → HTTP {exc.code} : {detail or exc.reason}") from None
    except urllib.error.URLError as exc:
        raise GithubError(f"GitHub injoignable ({exc.reason}).") from None


def create_user_repo(name: str, *, private: bool = True, description: str = "") -> dict[str, Any]:
    """POST /user/repos — crée le repo sur le compte du token, initialisé avec un README
    (branche par défaut `main`). Retourne les champs utiles (jamais le token)."""
    _status, repo = _request(
        "POST",
        "/user/repos",
        {
            "name": name,
            "private": private,
            "auto_init": True,  # crée un README + le 1er commit sur main
            "description": description or f"kua-loop-engine — {name}",
        },
    )
    return {
        "slug": repo.get("name", name),
        "full_name": repo.get("full_name", ""),
        "repo_url": repo.get("clone_url", ""),   # https://github.com/<owner>/<slug>.git
        "html_url": repo.get("html_url", ""),
        "default_branch": repo.get("default_branch", "main"),
        "private": bool(repo.get("private", private)),
        "owner": (repo.get("owner") or {}).get("login", ""),
    }


def get_repo(full_name: str) -> Optional[dict[str, Any]]:
    """GET /repos/{owner}/{repo} — None si 404 (utile pour vérifier l'existence)."""
    try:
        _status, repo = _request("GET", f"/repos/{full_name}")
        return repo
    except GithubError:
        return None
