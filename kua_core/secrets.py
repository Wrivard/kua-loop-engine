"""Secrets des connecteurs sur le VPS — /srv/kua/secrets/ (chmod 600).

JAMAIS en DB, jamais dans ui/ (CLAUDE.md règle secrets, doc 13). Un fichier .env
par périmètre : `app.env` (scope app) et `project/<id>.env` (scope project). Les
clés sont préfixées par type (`GITHUB_TOKEN`, `SENTRY_AUTH_TOKEN`…) → plusieurs
types cohabitent sans collision. La DB ne stocke qu'un `secret_ref` (ce chemin).

Frontière de sécurité : un run d'un projet ne charge QUE `project/<id>.env`,
jamais `app.env` (sauf si le binding hérite explicitement — voir composition M5).
"""

from __future__ import annotations

import os
from pathlib import Path


def secrets_dir() -> Path:
    return Path(os.environ.get("KUA_SECRETS_DIR", "/srv/kua/secrets"))


def secret_ref(scope: str, project_id: str | None) -> str:
    """Pointeur relatif stocké en DB (jamais le secret)."""
    return "app.env" if scope == "app" else f"project/{project_id}.env"


def _env_path(scope: str, project_id: str | None) -> Path:
    return secrets_dir() / secret_ref(scope, project_id)


def _key(type_: str, field: str) -> str:
    return f"{type_.upper()}_{field.upper()}"


def _read_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v
    return out


def _write_file(path: Path, data: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(secrets_dir(), 0o700)
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    body = "".join(f"{k}={v}\n" for k, v in sorted(data.items()))
    path.write_text(body, encoding="utf-8")
    os.chmod(path, 0o600)


def set_secret(scope: str, type_: str, project_id: str | None, fields: dict[str, str]) -> str:
    """Écrit les champs SECRETS d'un connecteur (merge — ne clobbe pas les autres
    types/champs du fichier). Retourne le secret_ref."""
    path = _env_path(scope, project_id)
    data = _read_file(path)
    for field, value in fields.items():
        data[_key(type_, field)] = value
    _write_file(path, data)
    return secret_ref(scope, project_id)


def read_secret(scope: str, type_: str, project_id: str | None, fields: list[str]) -> dict[str, str]:
    """Relit les champs secrets d'un type (pour validation / composition)."""
    data = _read_file(_env_path(scope, project_id))
    return {f: data[_key(type_, f)] for f in fields if _key(type_, f) in data}
