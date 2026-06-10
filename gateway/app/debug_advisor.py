"""Assistant de débogage (advisory) — un appel `claude -p` (plan Max, AUCUNE clé API) qui
LIT les diagnostics (statut/health, journalctl, df/free, pip check) et explique le problème +
propose UNE action sûre et réversible, choisie dans une allowlist stricte.

L'action proposée est RE-VALIDÉE contre l'allowlist (sysctl) avant d'être renvoyée : quoi que
dise le modèle, seules `restart_service <des 3 services>` et `reinstall_dep <épinglée>` peuvent
sortir. L'exécution réelle exige une confirmation explicite de William (endpoint /internal/debug/act).
"""

from __future__ import annotations

import json
import re
import subprocess
from typing import Any, Optional

from app import claude_cli, sysctl

_PROMPT = """Tu es l'assistant de débogage du backend kua-loop-engine. Architecture : 3 services
systemd (kua-gateway = API/health, kua-worker = boucle Runner claude -p, kua-mcp-bridge = WS),
Postgres via Supabase, un venv Python. Tu tournes en lecture seule.

Question de l'opérateur : {question}

Diagnostics (lecture seule) :
{diagnostics}

Réponds en français, bref et concret : explique ce qui ne va pas et la cause la plus probable.
Si UNE action sûre et réversible peut aider, termine par UNE SEULE ligne, EXACTEMENT l'une de :
  ACTION: restart_service kua-gateway
  ACTION: restart_service kua-worker
  ACTION: restart_service kua-mcp-bridge
  ACTION: reinstall_dep psycopg
  ACTION: none
N'invente AUCUNE autre action ni service."""

# Ligne ACTION ANCRÉE (^…$ multilignes) + argument à charset restreint → un suffixe
# (« kua-gateway; rm -rf / ») ne matche pas. On prend la DERNIÈRE ligne ACTION valide.
_ACTION_RE = re.compile(
    r"^\s*ACTION:\s*(restart_service|reinstall_dep|none)(?:\s+([\w.\[\]\-]+))?\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def parse_action(text: str) -> Optional[dict[str, Any]]:
    """Extrait l'action proposée du texte du modèle et la RE-VALIDE contre l'allowlist.
    Retourne None si absente, 'none', ou hors allowlist (le modèle ne peut rien forcer)."""
    matches = list(_ACTION_RE.finditer(text or ""))
    if not matches:
        return None
    m = matches[-1]
    kind = m.group(1).lower()
    arg = (m.group(2) or "").strip()
    if kind == "restart_service" and arg in sysctl.ALLOWED_SERVICES:
        return {"type": "restart_service", "service": arg}
    if kind == "reinstall_dep" and arg in sysctl.REINSTALLABLE:
        return {"type": "reinstall_dep", "key": arg}
    return None


def advise(question: str, diagnostics_text: str, timeout: int = 90) -> dict[str, Any]:
    """Conseille à partir des diagnostics. Retourne {explanation, proposed_action|None}.
    Timeout 90s < fetch proxy 110s < maxDuration Vercel 120s (marge). env SANS secret."""
    cmd = [
        claude_cli.claude_bin(), "-p",
        _PROMPT.format(question=question or "Diagnostique l'état du backend.",
                       diagnostics=(diagnostics_text or "")[:8000]),
        "--output-format", "json",
        "--max-budget-usd", "0.15",
        "--model", "claude-haiku-4-5-20251001",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=claude_cli.claude_env())
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"explanation": "Assistant indisponible (claude introuvable ou délai dépassé).", "proposed_action": None}
    try:
        text = str(json.loads(proc.stdout).get("result") or "").strip()
    except Exception:
        text = (proc.stdout or proc.stderr or "")[-1000:]
    if not text:
        text = "Pas de diagnostic."
    return {"explanation": text, "proposed_action": parse_action(text)}
