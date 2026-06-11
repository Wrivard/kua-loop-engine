"""Bot Discord (fondation — AUCUNE connexion live cette nuit).

Flux : message d'un channel CONFIGURÉ → cerveau Küa (/internal/agent/propose, source=discord)
→ poste la proposition (façade + goal + budget) → confirmation « approve »/✅ par un user
ALLOWLISTÉ → crée le thread (MÊME chemin que le chat UI : ensure_loop + create_thread_with_run).
Le bot PROPOSE seulement ; la confirmation humaine est obligatoire ; allow_auto reste FALSE ;
il ne fait AUCUNE action de gestion (hors allowlist M4) — uniquement propose + create_thread.

SÉCURITÉ :
- DISCORD_BOT_TOKEN dans /srv/kua/.env (absent → refus de démarrer, message clair).
- Allowlist channels (→ projet) + user_ids en DB (app_settings['discord']).
- discord.py importé PARESSEUSEMENT (les tests n'ont pas besoin de la lib ni d'une connexion).
- La LOGIQUE est pure et testable (handle_message) ; le runtime discord.py n'est qu'une glu mince.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

_CONFIRM_RE = re.compile(r"^\s*(approve|go|oui|ok|confirme[rz]?|👍|✅)\s*$", re.IGNORECASE)


class DiscordConfigError(RuntimeError):
    """Démarrage refusé (token absent, etc.) — message clair, sans secret."""


@dataclass
class DiscordConfig:
    channels: dict[str, str] = field(default_factory=dict)  # channel_id → project_id
    user_ids: set[str] = field(default_factory=set)
    notif_channel: Optional[str] = None  # channel où poster les notifications (cloche → Discord)

    def allows_channel(self, channel_id: str) -> bool:
        return channel_id in self.channels

    def allows_user(self, user_id: str) -> bool:
        return user_id in self.user_ids


def load_config() -> DiscordConfig:
    """Charge l'allowlist depuis app_settings['discord'] (DB)."""
    from kua_core import db  # noqa: PLC0415

    raw = db.get_app_setting("discord") or {}
    channels = raw.get("channels") or {}
    if not isinstance(channels, dict):
        channels = {}
    return DiscordConfig(
        channels={str(k): str(v) for k, v in channels.items()},
        user_ids={str(u) for u in (raw.get("user_ids") or [])},
        notif_channel=str(raw["notif_channel"]) if raw.get("notif_channel") else None,
    )


_NOTIF_EMOJI = {"proposal": "💡", "awaiting": "⏳", "failed": "❌", "merged": "✅", "budget": "💸"}


def format_notification(notif: dict[str, Any]) -> str:
    """Rend une notification (cloche) pour le canal Discord (réutilisé quand le bot est live)."""
    emoji = _NOTIF_EMOJI.get(str(notif.get("kind")), "🔔")
    parts = [f"{emoji} **{notif.get('title', '')}**"]
    if notif.get("body"):
        parts.append(str(notif["body"]))
    return "\n".join(parts)


def require_token() -> str:
    """Retourne DISCORD_BOT_TOKEN ou lève DiscordConfigError (refus de démarrer)."""
    token = os.environ.get("DISCORD_BOT_TOKEN")
    if not token:
        raise DiscordConfigError(
            "DISCORD_BOT_TOKEN absent de /srv/kua/.env — le bot refuse de démarrer. "
            "Crée le bot (docs/17-discord.md), ajoute le token, puis relance kua-discord."
        )
    return token


def is_confirmation(text: str) -> bool:
    return bool(_CONFIRM_RE.match(text or ""))


def format_proposal(p: dict[str, Any]) -> str:
    """Rend une proposition pour Discord (markdown léger)."""
    action = p.get("action")
    if not action or action == "none":
        return p.get("resume_humain") or "Rien à faire pour l'instant."
    lines = [f"**{action}** · façade `{p.get('facade')}` · budget {p.get('budget_usd')} $"]
    if p.get("title"):
        lines.append(f"**{p['title']}**")
    if p.get("resume_humain"):
        lines.append(p["resume_humain"])
    questions = p.get("questions_manquantes") or []
    if questions:
        lines.append("Il me manque : " + " ; ".join(str(q) for q in questions))
    else:
        lines.append("Réponds **approve** (ou ✅) pour lancer.")
    return "\n".join(lines)


# --- Adaptateurs réels (injectables → mockés en test) ------------------------------

def propose_via_gateway(message: str, author: str, timeout: int = 120) -> dict[str, Any]:
    """POST localhost gateway /internal/agent/propose (bearer INTERNAL_TOKEN)."""
    token = os.environ.get("INTERNAL_TOKEN", "")
    req = urllib.request.Request(
        "http://127.0.0.1:8000/internal/agent/propose",
        data=json.dumps({"message": message, "source": "discord"}).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "X-Kua-User": author},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (URL fixe localhost)
        return json.loads(resp.read()).get("proposal") or {}


def create_thread_from_proposal(proposal: dict[str, Any], project_id: str) -> tuple[str, str]:
    """Crée le thread (MÊME chemin que le chat UI). Retourne (thread_id, run_id)."""
    from kua_core import db  # noqa: PLC0415

    facade = proposal.get("facade") or "general"
    loop = db.get_loop(project_id, facade)
    loop_id = str(loop["id"]) if loop and loop.get("id") else str(db.ensure_loop(project_id, facade))
    title = proposal.get("title") or "Demande Discord"
    goal = proposal.get("goal") or title
    return db.create_thread_with_run(project_id, loop_id, facade, title, None, goal)


# --- Logique PURE (testable, Discord mocké) ----------------------------------------

ProposeFn = Callable[[str, str], dict[str, Any]]
CreateFn = Callable[[dict[str, Any], str], tuple[str, str]]


def handle_message(
    text: str,
    channel_id: str,
    author_id: str,
    config: DiscordConfig,
    pending: dict[str, tuple[dict[str, Any], str]],
    *,
    propose_fn: ProposeFn,
    create_fn: CreateFn,
) -> tuple[Optional[str], str]:
    """Décide quoi faire d'un message. MUTE `pending` (état des propositions en attente).
    Retourne (réponse_à_poster | None, code_d_action). Pure → testable sans Discord."""
    if not config.allows_channel(channel_id):
        return (None, "ignored_channel")  # channel non configuré : silence

    # Confirmation d'une proposition en attente ?
    if is_confirmation(text):
        if not config.allows_user(author_id):
            return ("Désolé, seul un opérateur autorisé peut confirmer.", "ignored_user")
        entry = pending.get(channel_id)
        if not entry:
            return ("Rien à confirmer pour l'instant.", "nothing_pending")
        proposal, project_id = entry
        thread_id, _run_id = create_fn(proposal, project_id)
        pending.pop(channel_id, None)
        return (f"✅ C'est parti — thread créé ({thread_id}).", "created")

    # Sinon : nouveau message → on demande une proposition au cerveau.
    proposal = propose_fn(text, author_id)
    reply = format_proposal(proposal)
    action = proposal.get("action")
    if not action or action == "none" or proposal.get("questions_manquantes"):
        return (reply, "proposed_no_action")
    if action != "create_thread":
        # Le bot ne fait QUE proposer/créer des threads (pas de gestion de loop par Discord).
        return (reply + "\n_(gestion de loop : via l'app, pas Discord.)_", "proposed_non_create")
    pending[channel_id] = (proposal, config.channels[channel_id])
    return (reply, "proposed")


# --- Runtime discord.py (jamais importé en test) -----------------------------------

def run_bot() -> None:  # pragma: no cover (connexion live)
    """Démarre le bot. Refuse si DISCORD_BOT_TOKEN absent. Importe discord.py paresseusement."""
    token = require_token()
    import discord  # noqa: PLC0415

    config = load_config()
    pending: dict[str, tuple[dict[str, Any], str]] = {}
    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)

    @client.event
    async def on_message(message: Any) -> None:  # noqa: ANN401
        if message.author == client.user:
            return
        reply, _code = handle_message(
            str(message.content), str(message.channel.id), str(message.author.id),
            config, pending, propose_fn=propose_via_gateway, create_fn=create_thread_from_proposal,
        )
        if reply:
            await message.channel.send(reply)

    client.run(token)


if __name__ == "__main__":  # pragma: no cover
    run_bot()
