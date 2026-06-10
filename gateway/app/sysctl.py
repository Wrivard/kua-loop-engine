"""Contrôle système RESTREINT pour le panneau Réglages « Système » (voir/redémarrer/
déboguer le backend depuis l'app, sans SSH). Même esprit d'allowlist que `mcp_bridge`.

SÉCURITÉ NON-NÉGOCIABLE :
- ALLOWLIST STRICTE : services = {kua-gateway, kua-worker, kua-mcp-bridge} ; actions =
  {start, stop, restart, status}. RIEN d'autre. argv direct (jamais shell=True) → aucune
  injection par `;`/`|`/`$()`.
- systemctl via `sudo -n` (non-interactif) → exige une ligne sudoers ÉTROITE (les 12 commandes
  exactes seulement), appliquée par William (deploy/10-kua-sysctl.sudoers). kua-engine n'a AUCUN
  autre droit sudo.
- journalctl + diagnostics = LECTURE SEULE, SANS sudo (kua-engine dans le groupe systemd-journal).
- réinstall = uniquement des specs ÉPINGLÉES d'une allowlist (réversible).
- Chaque action est loggée (audit JSON → journald).
"""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any

ALLOWED_SERVICES: tuple[str, ...] = ("kua-gateway", "kua-worker", "kua-mcp-bridge")
CONTROL_ACTIONS: tuple[str, ...] = ("start", "stop", "restart", "status")

# Dépendances réinstallables : specs ÉPINGLÉES (réversibles). À étendre au besoin.
# psycopg : l'incident « cannot import name Row » s'est réglé en réinstallant psycopg[binary]==3.3.4.
REINSTALLABLE: dict[str, str] = {
    "psycopg": "psycopg[binary]==3.3.4",
}

_VENV_PIP = "/home/kua-engine/kua-loop-engine/.venv/bin/pip"
JOURNAL_MAX_LINES = 1000
_OUTPUT_CAP = 20000  # tronque la sortie renvoyée à l'UI

# Diagnostics LECTURE SEULE (aucune élévation). Nom affiché → argv.
DIAGNOSTICS: list[tuple[str, list[str]]] = [
    ("disque (df -h)", ["df", "-h"]),
    ("mémoire (free -h)", ["free", "-h"]),
    ("charge (uptime)", ["uptime"]),
    ("dépendances (pip check)", [_VENV_PIP, "check"]),
]


class ControlRefused(ValueError):
    """Action/service/dépendance hors allowlist (refusé AVANT toute exécution)."""


def _audit(event: str, *, allowed: bool, user: str = "?", **fields: Any) -> None:
    print(
        json.dumps({"event": event, "user": user, "allowed": allowed, **fields}, default=str),
        flush=True,
    )


def _run(argv: list[str], timeout: int = 60) -> dict[str, Any]:
    """Exécute un argv (jamais shell=True). Retourne {argv, exit_code, output}."""
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, env=os.environ.copy())
    except FileNotFoundError:
        return {"argv": argv, "exit_code": 127, "output": f"introuvable : {argv[0]}"}
    except subprocess.TimeoutExpired:
        return {"argv": argv, "exit_code": 124, "output": "délai dépassé"}
    out = (proc.stdout or "") + (proc.stderr or "")
    return {"argv": argv, "exit_code": proc.returncode, "output": out[-_OUTPUT_CAP:]}


def check_service(service: str, user: str = "?") -> str:
    if service not in ALLOWED_SERVICES:
        _audit("sysctl_refused", allowed=False, user=user, service=service, reason="service not allowed")
        raise ControlRefused(f"service non autorisé : {service!r}")
    return service


def self_affecting(service: str, action: str) -> bool:
    """True si l'action tue/redémarre le process qui sert cette requête (la gateway elle-même)."""
    return service == "kua-gateway" and action in ("stop", "restart")


def systemctl(action: str, service: str, user: str = "?") -> dict[str, Any]:
    """`sudo -n systemctl <action> <service>` après validation stricte de l'allowlist."""
    if action not in CONTROL_ACTIONS:
        _audit("sysctl_refused", allowed=False, user=user, action=action, reason="action not allowed")
        raise ControlRefused(f"action non autorisée : {action!r}")
    check_service(service, user)
    argv = ["sudo", "-n", "systemctl", action, service]
    _audit("sysctl_exec", allowed=True, user=user, action=action, service=service)
    return _run(argv, timeout=30)


def journal(service: str, lines: int = 200, user: str = "?") -> dict[str, Any]:
    """`journalctl -u <service> -n N` (LECTURE SEULE, sans sudo). Service validé, N borné."""
    check_service(service, user)
    n = max(1, min(int(lines), JOURNAL_MAX_LINES))
    argv = ["journalctl", "-u", service, "-n", str(n), "--no-pager", "-o", "short-iso"]
    _audit("sysctl_journal", allowed=True, user=user, service=service, lines=n)
    return _run(argv, timeout=30)


def diagnostics(user: str = "?") -> list[dict[str, Any]]:
    """Bloc de diagnostics LECTURE SEULE (df/free/uptime/pip check)."""
    _audit("sysctl_diagnostics", allowed=True, user=user)
    results: list[dict[str, Any]] = []
    for name, argv in DIAGNOSTICS:
        r = _run(argv, timeout=12)  # borné : budget diagnostics + claude(90s) < fetch(110s)
        results.append({"name": name, "exit_code": r["exit_code"], "output": r["output"]})
    return results


def reinstall_dep(key: str, user: str = "?") -> dict[str, Any]:
    """Réinstalle une dépendance de l'allowlist ÉPINGLÉE (réversible). Refuse tout le reste."""
    spec = REINSTALLABLE.get(key)
    if not spec:
        _audit("sysctl_refused", allowed=False, user=user, package=key, reason="not reinstallable")
        raise ControlRefused(f"dépendance non réinstallable : {key!r}")
    argv = [_VENV_PIP, "install", "--force-reinstall", spec]
    _audit("sysctl_reinstall", allowed=True, user=user, package=key, spec=spec)
    return _run(argv, timeout=300)
