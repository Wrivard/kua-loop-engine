"""Environnement subprocess expurgé des secrets backend.

Le Runner exécute du code ENTIÈREMENT contrôlé par le repo cible (verify.sh,
scripts npm, claude lui-même sur un goal influencé par le client). Ces process
ne doivent JAMAIS voir les secrets backend (DB, GitHub, Discord) — CLAUDE.md
règle #4 « secrets backend only ». La livraison (push/PR) garde le token, mais
côté worker, hors du checkout.
"""

from __future__ import annotations

import os

_BACKEND_SECRETS = (
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_KEY",
    "SUPABASE_DB_URL",
    "SENTRY_WEBHOOK_SECRET",
    "INTERNAL_TOKEN",
    "DISCORD_BOT_TOKEN",
    "GITHUB_TOKEN",
)


def clean_env(also_remove: tuple[str, ...] = ()) -> dict[str, str]:
    """Copie de l'environnement SANS les secrets backend. Garde PATH/HOME/LANG
    (et l'auth Claude par défaut). `also_remove` retire des clés en plus (ex.
    ANTHROPIC_API_KEY pour le code client, qui ne doit pas voir l'auth Claude)."""
    env = dict(os.environ)
    for key in _BACKEND_SECRETS:
        env.pop(key, None)
    for key in also_remove:
        env.pop(key, None)
    return env
