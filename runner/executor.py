"""Exécuteurs d'un goal (doc 06, étape RUN). Le seul endroit qui spawn `claude -p`.

`ClaudeExecutor` (réel) et `FakeExecutor` (déterministe, sans coût) partagent le
même Protocol → le pipeline et le self-test sont identiques, seul l'exécuteur change.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Optional, Protocol

from runner.env import clean_env
from runner.runner import build_claude_command, parse_claude_result


@dataclass
class ExecResult:
    status: str            # succeeded | failed | budget_exceeded | timed_out
    cost_usd: Decimal
    iterations: int
    summary: str
    session_id: Optional[str]
    raw: str

    @property
    def ok(self) -> bool:
        return self.status == "succeeded"


class Executor(Protocol):
    def run(
        self, cwd, goal: str, *, budget_usd, timeout_min: int, model: str,
        extra_env: Optional[dict[str, str]] = None,
    ) -> ExecResult: ...


class ClaudeExecutor:
    """Spawn réel de `claude -p` (flags vérifiés S3). `timeout {min}m` borne le temps
    (exit 124), `--max-budget-usd` borne le coût."""

    def run(
        self, cwd, goal: str, *, budget_usd, timeout_min: int = 30, model: str = "sonnet",
        extra_env: Optional[dict[str, str]] = None,
    ) -> ExecResult:
        cmd = build_claude_command(goal, model=model, budget_usd=budget_usd, timeout_min=timeout_min)
        # Env du run : base sans secrets backend (clean_env) PUIS secrets PROJET ajoutés
        # par-dessus (extra_env). Les creds app ne peuvent pas entrer : clean_env les a
        # retirés et extra_env ne contient QUE des secrets de scope projet (composition).
        env = clean_env()
        if extra_env:
            env.update(extra_env)
        # Filet Python = backstop du `timeout` shell (marge > timeout + kill-after).
        py_timeout = timeout_min * 60 + 90
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(cwd),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,   # propre groupe → on peut tuer tout l'arbre
                env=env,
            )
        except FileNotFoundError:
            return ExecResult("failed", Decimal("0"), 0, "Binaire claude/timeout introuvable.", None, "")
        try:
            stdout, stderr = proc.communicate(timeout=py_timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)  # tue claude + enfants
            except (ProcessLookupError, PermissionError):
                pass
            proc.communicate()  # reap
            return ExecResult("timed_out", Decimal("0"), 0, "Temps écoulé (garde Python).", None, "")

        if proc.returncode == 124:  # le `timeout` shell (SIGTERM) a coupé
            return ExecResult("timed_out", Decimal("0"), 0, "Temps écoulé (timeout).", None, (stdout or "")[-2000:])
        try:
            r = parse_claude_result(stdout)
        except Exception:
            blob = (stdout or stderr or "")[-2000:]
            return ExecResult("failed", Decimal("0"), 0, f"Sortie claude illisible (exit {proc.returncode}).", None, blob)
        if r.succeeded:
            return ExecResult("succeeded", r.cost_usd, r.num_turns, r.result, r.session_id, stdout[-4000:])
        # Classification d'échec sur les CHAMPS STRUCTURÉS uniquement (jamais le texte
        # libre `result`, ni le coût qui rate les coupures sous-seuil / faux positifs).
        signals = " ".join(s for s in (r.subtype, r.stop_reason, r.terminal_reason) if s).lower()
        status = "budget_exceeded" if "budget" in signals else "failed"
        return ExecResult(status, r.cost_usd, r.num_turns, r.result or r.subtype, r.session_id, stdout[-4000:])


class FakeExecutor:
    """Déterministe : fait une vraie modif de fichier dans le checkout (aucun appel
    claude, coût 0). Sert aux tests et au self-test bare local."""

    def __init__(self, filename: str = "KUA_RUN.md", content: Optional[str] = None, status: str = "succeeded"):
        self.filename = filename
        self.content = content
        self.status = status  # forcer un échec (failed/budget_exceeded/timed_out) pour les tests
        self.received_env: dict[str, str] = {}  # env reçu (vérif de la frontière de sécurité)
        self.received_goal: str = ""
        self.received_mcp: Optional[dict] = None  # .mcp.json composé vu dans le checkout

    def run(
        self, cwd, goal: str, *, budget_usd=Decimal("0"), timeout_min: int = 30, model: str = "fake",
        extra_env: Optional[dict[str, str]] = None,
    ) -> ExecResult:
        self.received_env = dict(extra_env or {})
        self.received_goal = goal
        mcp_path = Path(cwd) / ".mcp.json"
        self.received_mcp = json.loads(mcp_path.read_text(encoding="utf-8")) if mcp_path.exists() else None
        if self.status != "succeeded":
            return ExecResult(self.status, Decimal("0"), 0, f"(fake) {self.status}", "fake-session", "{}")
        p = Path(cwd) / self.filename
        body = self.content if self.content is not None else f"# Run kua\n\nGoal traité :\n\n{goal}\n"
        prev = p.read_text(encoding="utf-8") if p.exists() else ""
        p.write_text(prev + body + "\n", encoding="utf-8")
        return ExecResult("succeeded", Decimal("0"), 1, f"(fake) modifié {self.filename}", "fake-session", "{}")
