"""Guidage MCP (advisory) — un appel `claude -p` (plan Max, AUCUNE clé API) qui,
à partir de « quel serveur MCP veux-tu ? », propose la commande `claude mcp add …`,
les champs requis et où prendre le token. Branché en amont du terminal du wizard.
Le résultat est un CONSEIL ; l'exécution réelle passe par l'allowlist du bridge.
"""

from __future__ import annotations

import json
import os
import subprocess

_PROMPT = """Tu aides à installer un serveur MCP via la CLI Claude Code (`claude mcp add`).
Demande de l'utilisateur : {query}

Réponds en français, TRÈS bref, en 3 points :
1. La commande EXACTE `claude mcp add …` à lancer (choisis le transport http/sse/stdio adéquat).
2. Les champs requis (URL, header d'auth, variables…).
3. Où prendre le token / faire l'OAuth.
Pas d'introduction, pas de conclusion."""


def suggest_mcp(query: str, timeout: int = 60) -> str:
    cmd = [
        "claude", "-p", _PROMPT.format(query=query),
        "--output-format", "json",
        "--max-budget-usd", "0.10",
        "--model", "claude-haiku-4-5-20251001",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=os.environ.copy())
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return "Guidage indisponible (claude introuvable ou délai dépassé)."
    try:
        data = json.loads(proc.stdout)
        return str(data.get("result") or "").strip() or "Pas de suggestion."
    except Exception:
        return (proc.stdout or proc.stderr or "")[-500:] or "Pas de suggestion."
