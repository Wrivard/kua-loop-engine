"""Opérations git du Runner (isolation par checkout, doc 06). subprocess `git`.

Jamais de push sur la branche de base ici : le Runner ne pousse QUE la branche de
travail (la livraison/merge passe par une décision d'approbation, doc 06/§gate).
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Optional

# Identité machine pour les commits (jamais une personne).
GIT_USER_NAME = "kua-engine"
GIT_USER_EMAIL = "kua-engine@srv1744916.hstgr.cloud"


class GitError(RuntimeError):
    pass


def _git_env() -> dict[str, str]:
    # Jamais d'invite interactive : sur un repo privé sans creds, échoue VITE au
    # lieu de bloquer le worker indéfiniment.
    return {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "echo"}


def _auth_args() -> list[str]:
    """Injecte l'auth GitHub via un en-tête éphémère (pas dans l'URL/les logs).
    Backend only : GITHUB_TOKEN vit dans /srv/kua/.env."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return []
    return ["-c", f"http.https://github.com/.extraheader=AUTHORIZATION: bearer {token}"]


def _mask(text: str) -> str:
    token = os.environ.get("GITHUB_TOKEN")
    return text.replace(token, "***") if token else text


def _run(args: list[str], cwd: Optional[Path | str] = None, timeout: int = 300) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=_git_env(),
    )
    if proc.returncode != 0:
        # Masque le token au cas où il apparaîtrait dans les args (extraheader).
        raise GitError(_mask(f"git {' '.join(args)} (cwd={cwd}) -> {proc.returncode}: {proc.stderr.strip()}"))
    return proc.stdout


def configure_identity(cwd: Path | str) -> None:
    _run(["config", "user.name", GIT_USER_NAME], cwd=cwd)
    _run(["config", "user.email", GIT_USER_EMAIL], cwd=cwd)


def clone(repo_url: str, dest: Path | str, branch: Optional[str] = None) -> None:
    args = [*_auth_args(), "clone"]
    if branch:
        args += ["--branch", branch]
    args += [repo_url, str(dest)]
    _run(args, timeout=600)
    configure_identity(dest)


def init_new(dest: Path | str, default_branch: str = "main") -> None:
    """Crée un repo frais (nouveau projet) avec un 1er commit sur `default_branch`."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    _run(["init"], cwd=dest)
    # Nomme la branche initiale sans dépendre de la version de git.
    _run(["symbolic-ref", "HEAD", f"refs/heads/{default_branch}"], cwd=dest)
    configure_identity(dest)
    (dest / "README.md").write_text("# Nouveau projet (kua)\n", encoding="utf-8")
    _run(["add", "-A"], cwd=dest)
    _run(["commit", "-m", "chore: init (kua)"], cwd=dest)


def create_bare(path: Path | str) -> None:
    """Crée un repo bare (sert d'« origin » simulé pour le self-test)."""
    _run(["init", "--bare", str(path)])


def add_remote(cwd: Path | str, name: str, url: str) -> None:
    _run(["remote", "add", name, url], cwd=cwd)


def remote_url(cwd: Path | str, name: str = "origin") -> Optional[str]:
    try:
        return _run(["remote", "get-url", name], cwd=cwd).strip()
    except GitError:
        return None


def checkout_new_branch(cwd: Path | str, branch: str) -> None:
    _run(["checkout", "-b", branch], cwd=cwd)


def current_branch(cwd: Path | str) -> str:
    return _run(["rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd).strip()


def head_sha(cwd: Path | str) -> str:
    return _run(["rev-parse", "HEAD"], cwd=cwd).strip()


def fetch(cwd: Path | str, remote: str, ref: str) -> None:
    _run([*_auth_args(), "fetch", remote, ref], cwd=cwd, timeout=600)


def has_changes(cwd: Path | str) -> bool:
    return bool(_run(["status", "--porcelain"], cwd=cwd).strip())


def commit_all(cwd: Path | str, message: str) -> bool:
    """Commit toutes les modifs en attente. Retourne False s'il n'y a rien."""
    if not has_changes(cwd):
        return False
    _run(["add", "-A"], cwd=cwd)
    _run(["commit", "-m", message], cwd=cwd)
    return True


def commits_ahead(cwd: Path | str, base: str) -> int:
    out = _run(["rev-list", "--count", f"{base}..HEAD"], cwd=cwd).strip()
    return int(out or "0")


def diff_stat(cwd: Path | str, base: str) -> str:
    return _run(["diff", "--stat", f"{base}...HEAD"], cwd=cwd)


def push(cwd: Path | str, remote: str, branch: str) -> None:
    _run([*_auth_args(), "push", remote, branch], cwd=cwd, timeout=600)
