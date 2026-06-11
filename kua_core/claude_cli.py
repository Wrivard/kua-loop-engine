"""Helpers PARTAGÉS pour invoquer la CLI `claude` (plan Max) — source unique (kua_core),
réutilisée par la gateway (re-export) ET l'agent runtime. Garanties non-négociables :

1. `claude_env()` : env MINIMAL par ALLOWLIST → AUCUN secret backend (INTERNAL_TOKEN,
   GITHUB_TOKEN, SUPABASE_*, BRIDGE_SECRET, …) ni `ANTHROPIC_API_KEY` ne fuit dans le
   process enfant. HOME conservé (auth Max dans ~/.claude) ; pas de clé API → plan Max.
2. `claude_bin()` : chemin robuste du binaire (le PATH d'un service systemd n'inclut pas
   ~/.local/bin où vit `claude`).
"""

from __future__ import annotations

import os
import shutil

# Variables SÛRES transmises au process claude/kua. Tout le reste (secrets) est exclu.
_ENV_ALLOW = (
    "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "SHELL",
    "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "TMPDIR",
)
# Répertoires où vivent claude (npm global) et kua (venv) — ajoutés au PATH minimal.
_BIN_DIRS = ("/home/kua-engine/.local/bin", "/home/kua-engine/kua-loop-engine/.venv/bin")
_CLAUDE_FALLBACK = "/home/kua-engine/.local/bin/claude"


def claude_env() -> dict[str, str]:
    """Env minimal (allowlist) pour un subprocess claude/kua : aucun secret, PATH complété."""
    env = {k: os.environ[k] for k in _ENV_ALLOW if k in os.environ}
    parts = list(_BIN_DIRS)
    for p in (os.environ.get("PATH") or "/usr/local/bin:/usr/bin:/bin").split(":"):
        if p and p not in parts:
            parts.append(p)
    env["PATH"] = ":".join(parts)
    return env


def claude_bin() -> str:
    """Chemin du binaire `claude` : KUA_CLAUDE_BIN > which > fallback ~/.local/bin > 'claude'."""
    override = os.environ.get("KUA_CLAUDE_BIN")
    if override:
        return override
    found = shutil.which("claude") or shutil.which("claude", path=":".join(_BIN_DIRS))
    if found:
        return found
    return _CLAUDE_FALLBACK if os.path.exists(_CLAUDE_FALLBACK) else "claude"
