"""Détail d'une PR pour la revue dans l'app (M13). Lit l'API GitHub via le token VPS
(kua_core.github_api). Tronque proprement les gros diffs. Testable : github_api._request
est l'unique point d'appel réseau (mockable)."""

from __future__ import annotations

import re
from typing import Any, Optional

from kua_core import github_api

_PR_RE = re.compile(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)")

FILE_PATCH_CAP = 12000  # taille max du patch par fichier
TOTAL_PATCH_CAP = 60000  # taille max cumulée des patchs
MAX_FILES = 300


def parse_pr_url(url: str) -> Optional[tuple[str, str, int]]:
    m = _PR_RE.search(url or "")
    if not m:
        return None
    return m.group(1), m.group(2), int(m.group(3))


def pr_detail(pr_url: str) -> dict[str, Any]:
    """Retourne {pr, files[], truncated} pour une URL de PR GitHub. {pr:None,...} si URL invalide."""
    parsed = parse_pr_url(pr_url)
    if not parsed:
        return {"pr": None, "files": [], "truncated": False, "error": "url_pr_invalide"}
    owner, repo, number = parsed
    full = f"{owner}/{repo}"
    _s, pr = github_api._request("GET", f"/repos/{full}/pulls/{number}")
    _s2, files = github_api._request("GET", f"/repos/{full}/pulls/{number}/files?per_page=300")
    files = files if isinstance(files, list) else []

    out_files: list[dict[str, Any]] = []
    total = 0
    truncated = len(files) > MAX_FILES
    for f in files[:MAX_FILES]:
        patch = f.get("patch") or ""
        if len(patch) > FILE_PATCH_CAP:
            patch = patch[:FILE_PATCH_CAP] + "\n… (patch tronqué)"
            truncated = True
        if total + len(patch) > TOTAL_PATCH_CAP:
            patch = "… (diff trop volumineux — tronqué)"
            truncated = True
        total += len(patch)
        out_files.append(
            {
                "filename": f.get("filename"),
                "status": f.get("status"),
                "additions": f.get("additions"),
                "deletions": f.get("deletions"),
                "patch": patch,
            }
        )
    return {
        "pr": {
            "title": pr.get("title"),
            "html_url": pr.get("html_url"),
            "state": pr.get("state"),
            "draft": pr.get("draft"),
            "merged": pr.get("merged"),
            "additions": pr.get("additions"),
            "deletions": pr.get("deletions"),
            "changed_files": pr.get("changed_files"),
            "commits": pr.get("commits"),
        },
        "files": out_files,
        "truncated": truncated,
    }
