"""Tokens court-terme pour le bridge MCP.

Le secret LONG-TERME (`BRIDGE_SECRET`) reste côté serveur (gateway + route Next).
La route Next, authentifiée par le login Supabase, émet un token SIGNÉ à courte
durée de vie ; le navigateur ne voit jamais le secret long-terme. Le bridge vérifie
la signature + l'expiration avant d'ouvrir le PTY.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Optional


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def mint(secret: str, user: str, ttl_seconds: int = 300) -> str:
    """Émet un token court-terme `{body}.{sig}` (HMAC-SHA256)."""
    payload = {"user": user, "exp": int(time.time()) + ttl_seconds}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify(secret: str, token: Optional[str]) -> Optional[str]:
    """Retourne l'utilisateur si le token est valide + non expiré, sinon None."""
    if not secret or not token or "." not in token:
        return None
    body, sig = token.split(".", 1)
    expected = _b64(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload.get("user")
