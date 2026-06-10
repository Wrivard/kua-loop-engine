"""Livraison d'un run (doc 06, étape DELIVER) — pluggable.

- LocalBareDeliverer : pousse la branche de travail vers `origin` (un bare repo
  local pour le self-test). La « PR » = la branche sur le remote. Aucun merge.
- GitHubDeliverer : git push + PR DRAFT via l'API REST GitHub (jamais `gh`,
  jamais de push direct sur la base). Token = backend only (/srv/kua/.env).

Le choix se fait sur les données (URL GitHub + token présent) — pas par façade.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger("kua.runner")

from runner import gitops
from runner.context import RunCtx


@dataclass
class DeliverResult:
    pr_url: str
    pushed: bool
    via: str


class Deliverer(Protocol):
    def deliver(self, cwd, branch: str, base: str, ctx: RunCtx) -> DeliverResult: ...


class LocalBareDeliverer:
    def deliver(self, cwd, branch: str, base: str, ctx: RunCtx) -> DeliverResult:
        gitops.push(cwd, "origin", branch)
        origin = gitops.remote_url(cwd) or "origin"
        # Pas de système de PR : la « PR » = la branche poussée sur le bare.
        return DeliverResult(pr_url=f"local-bare:{origin}#{branch}", pushed=True, via="local-bare")


class GitHubDeliverer:
    def __init__(self, token: str):
        self.token = token

    def deliver(self, cwd, branch: str, base: str, ctx: RunCtx) -> DeliverResult:
        # 1) Push de la BRANCHE (jamais la base). Si ça échoue → exception (rien livré).
        gitops.push(cwd, "origin", branch)
        # 2) PR draft via l'API. Un échec APRÈS le push ne doit PAS faire échouer le run
        #    (la branche est livrée) : on dégrade en pr_url="" (« PR à créer manuellement »).
        owner, repo = _parse_github(ctx.repo_url or "")
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
        payload = json.dumps(
            {"title": ctx.subject or branch, "head": branch, "base": base, "draft": True, "body": ctx.goal}
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "kua-loop-engine",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (URL contrôlée)
                data = json.loads(resp.read())
            return DeliverResult(pr_url=data.get("html_url", ""), pushed=True, via="github")
        except urllib.error.URLError as exc:
            logger.warning("kua: branche %s poussée mais PR non créée (%s)", branch, exc)
            return DeliverResult(pr_url="", pushed=True, via="github")


def _parse_github(repo_url: str) -> tuple[str, str]:
    """github.com/owner/repo(.git) | git@github.com:owner/repo → (owner, repo)."""
    s = repo_url.rstrip("/")
    if s.endswith(".git"):
        s = s[:-4]
    s = s.replace("https://", "").replace("http://", "").replace("git@github.com:", "github.com/")
    tail = s.split("github.com/")[-1].split("/")
    return tail[-2], tail[-1]


def make_deliverer(ctx: RunCtx) -> Deliverer:
    token = os.environ.get("GITHUB_TOKEN")
    if ctx.repo_url and "github.com" in ctx.repo_url and token:
        return GitHubDeliverer(token)
    return LocalBareDeliverer()
