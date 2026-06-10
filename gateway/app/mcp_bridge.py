"""Bridge MCP — exécution RESTREINTE de commandes pour le wizard d'install MCP.

SÉCURITÉ NON-NÉGOCIABLE :
- Allowlist STRICTE : seulement `claude mcp {add,list,remove,get}` et
  `kua connector {set,test,list}`. RIEN d'autre (aucun shell libre, pas de
  rm/curl/…). Tout le reste est REFUSÉ.
- `shlex.split` + exécution de l'argv DIRECTEMENT (jamais shell=True) → pas
  d'injection par `;`/`|`/`$()` (ce seraient des arguments littéraux, et de toute
  façon l'exécutable + sous-commandes sont validés).
- Tourne en kua-engine (le service systemd l'impose), jamais root.
- Chaque commande est loggée (audit JSON stdout → journald).
- Le secret n'est jamais ré-affiché (le bridge ne lit pas les fichiers de secrets).
"""

from __future__ import annotations

import json
import os
import pty
import select
import shlex
import signal
import subprocess
import time
from typing import Any

# Allowlist : exécutable → sous-commande → set de sous-sous-commandes autorisées.
ALLOWLIST: dict[str, dict[str, set[str]]] = {
    "claude": {"mcp": {"add", "list", "remove", "get"}},
    "kua": {"connector": {"set", "test", "list"}},
}


class CommandRefused(ValueError):
    """Commande hors allowlist (refusée AVANT toute exécution)."""


def _audit(command: str, allowed: bool, reason: str = "", user: str = "?") -> None:
    print(
        json.dumps(
            {"event": "mcp_bridge_command", "user": user, "command": command,
             "allowed": allowed, "reason": reason},
            default=str,
        ),
        flush=True,
    )


def parse_and_check(command: str, user: str = "?") -> list[str]:
    """Valide `command` contre l'allowlist. Retourne l'argv si autorisé, sinon lève
    CommandRefused. Logge la décision (audit)."""
    try:
        argv = shlex.split(command)
    except ValueError as exc:
        _audit(command, False, f"unparseable: {exc}", user)
        raise CommandRefused(f"commande illisible : {exc}")
    if not argv:
        _audit(command, False, "empty", user)
        raise CommandRefused("commande vide")

    exe = argv[0]
    subcmds = ALLOWLIST.get(exe)
    if subcmds is None:
        _audit(command, False, f"exe not allowed: {exe}", user)
        raise CommandRefused(f"exécutable non autorisé : {exe!r}")
    if len(argv) < 2 or argv[1] not in subcmds:
        _audit(command, False, f"group not allowed: {argv[:2]}", user)
        raise CommandRefused(f"sous-commande non autorisée pour {exe}")
    allowed_actions = subcmds[argv[1]]
    if len(argv) < 3 or argv[2] not in allowed_actions:
        _audit(command, False, f"action not allowed: {argv[:3]}", user)
        raise CommandRefused(f"action non autorisée : {' '.join(argv[:3])}")

    _audit(command, True, "ok", user)
    return argv


def _spawn(argv: list[str]) -> tuple[int, int]:
    """Lance l'argv dans un PTY (pour streamer les invites OAuth). Retourne (pid, master_fd)."""
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        argv,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        start_new_session=True,
        close_fds=True,
        env=os.environ.copy(),  # claude mcp a besoin de HOME/auth ; jamais shell=True
    )
    os.close(slave)
    return proc.pid, master


def run_command_capture(command: str, timeout: int = 90, user: str = "?") -> dict[str, Any]:
    """Valide PUIS exécute une commande de l'allowlist dans un PTY, capture la sortie.
    Usage : tests + exécution simple (le WS utilise un stream live). Lève CommandRefused
    si hors allowlist (avant toute exécution)."""
    argv = parse_and_check(command, user)
    pid, master = _spawn(argv)
    chunks: list[str] = []
    deadline = time.time() + timeout
    try:
        while True:
            ready, _, _ = select.select([master], [], [], 0.5)
            if ready:
                try:
                    data = os.read(master, 4096)
                except OSError:
                    break
                if not data:
                    break
                chunks.append(data.decode(errors="replace"))
            done = os.waitpid(pid, os.WNOHANG)[0] != 0
            if done and not select.select([master], [], [], 0)[0]:
                break
            if time.time() > deadline:
                try:
                    os.killpg(os.getpgid(pid), signal.SIGKILL)
                except ProcessLookupError:
                    pass
                break
    finally:
        try:
            os.close(master)
        except OSError:
            pass
    try:
        _, status = os.waitpid(pid, 0)
        exit_code = os.waitstatus_to_exitcode(status)
    except ChildProcessError:
        exit_code = 0
    return {"argv": argv, "exit_code": exit_code, "output": "".join(chunks)}
