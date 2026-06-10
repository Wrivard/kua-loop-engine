"""Registre (en code) des TYPES de connecteurs — catalogue partagé.

Chaque type déclare : ses champs d'auth (secret ou non), son `kind` (api|mcp), et
s'il est `shareable` (1 credential sert plusieurs projets — ex. GitHub) ou
`per_project` (connexion propre par projet — ex. Sentry/Cloudflare/Supabase/Discord).

Le secret ne vit JAMAIS ici ni en DB : seuls les NOMS des champs secrets sont
déclarés ; les valeurs vont dans /srv/kua/secrets/ (chmod 600). Les `validate`
font un appel réel (read-only) pour fixer le statut d'une connexion (doc 13).
"""

from __future__ import annotations

import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Optional


@dataclass(frozen=True)
class AuthField:
    name: str          # clé (ex: token, account_id)
    label: str
    secret: bool        # True → /srv/kua/secrets/, jamais en DB ni dans config


# Un validateur reçoit (secrets: dict, config: dict) et retourne (ok, détail).
Validator = Callable[[dict, dict], "tuple[bool, str]"]


@dataclass(frozen=True)
class ConnectorType:
    type: str
    label: str
    kind: str           # "api" | "mcp"
    shareable: bool     # True = partageable (1 cred multi-projets) ; False = per_project
    auth_fields: tuple[AuthField, ...]
    validate: Optional[Validator] = None  # None = pas de test auto (statut untested)

    @property
    def secret_fields(self) -> list[str]:
        return [f.name for f in self.auth_fields if f.secret]

    @property
    def config_fields(self) -> list[str]:
        return [f.name for f in self.auth_fields if not f.secret]


def _http_ok(url: str, headers: dict[str, str], timeout: int = 12) -> "tuple[bool, str]":
    req = urllib.request.Request(url, headers={"User-Agent": "kua-loop-engine", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (URLs de types connus)
            ok = 200 <= resp.status < 300
            return ok, f"HTTP {resp.status}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except Exception as exc:  # noqa: BLE001
        return False, type(exc).__name__


def _validate_github(secrets: dict, config: dict) -> "tuple[bool, str]":
    token = secrets.get("token")
    if not token:
        return False, "token manquant"
    return _http_ok(
        "https://api.github.com/user",
        {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )


def _validate_cloudflare(secrets: dict, config: dict) -> "tuple[bool, str]":
    token = secrets.get("api_token")
    if not token:
        return False, "api_token manquant"
    return _http_ok(
        "https://api.cloudflare.com/client/v4/user/tokens/verify",
        {"Authorization": f"Bearer {token}"},
    )


def _validate_sentry(secrets: dict, config: dict) -> "tuple[bool, str]":
    token = secrets.get("auth_token")
    if not token:
        return False, "auth_token manquant"
    return _http_ok("https://sentry.io/api/0/", {"Authorization": f"Bearer {token}"})


def _validate_discord(secrets: dict, config: dict) -> "tuple[bool, str]":
    token = secrets.get("bot_token")
    if not token:
        return False, "bot_token manquant"
    return _http_ok("https://discord.com/api/v10/users/@me", {"Authorization": f"Bot {token}"})


CONNECTOR_TYPES: dict[str, ConnectorType] = {
    "github": ConnectorType(
        "github", "GitHub", "api", True,
        (AuthField("token", "Personal Access Token", True),),
        _validate_github,
    ),
    "sentry": ConnectorType(
        "sentry", "Sentry", "api", False,
        (
            AuthField("auth_token", "Auth token", True),
            AuthField("org", "Organisation", False),
            AuthField("project_slug", "Projet", False),
        ),
        _validate_sentry,
    ),
    "cloudflare": ConnectorType(
        "cloudflare", "Cloudflare", "api", False,
        (AuthField("api_token", "API token", True), AuthField("account_id", "Account ID", False)),
        _validate_cloudflare,
    ),
    "discord": ConnectorType(
        "discord", "Discord", "api", False,
        (AuthField("bot_token", "Bot token", True), AuthField("channel_id", "Channel ID", False)),
        _validate_discord,
    ),
    "supabase": ConnectorType(
        "supabase", "Supabase", "api", False,
        (
            AuthField("service_role_key", "service_role key", True),
            AuthField("url", "Project URL", False),
            AuthField("db_url", "Connection string", True),
        ),
        None,  # validation à brancher (note BUILD-NOTES)
    ),
    "mcp": ConnectorType(
        "mcp", "MCP générique", "mcp", False,
        (AuthField("url", "URL du serveur MCP", False), AuthField("token", "Token (optionnel)", True)),
        None,
    ),
}


def get_type(type_: str) -> Optional[ConnectorType]:
    return CONNECTOR_TYPES.get(type_)


def list_types() -> list[ConnectorType]:
    return list(CONNECTOR_TYPES.values())
