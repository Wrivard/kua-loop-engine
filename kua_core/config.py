"""Configuration partagée — lit les secrets depuis l'environnement.

En prod, les variables viennent de /srv/kua/.env (chargé par systemd via
EnvironmentFile, ou par python-dotenv en dev local). Voir doc 13.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# Emplacement canonique des secrets en prod (doc 13). En dev, un .env local
# à la racine du repo est aussi chargé s'il existe (sans écraser l'environnement).
_PROD_ENV = Path("/srv/kua/.env")
_REPO_ENV = Path(__file__).resolve().parent.parent / ".env"


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    supabase_db_url: str
    max_concurrent_runs: int
    checkouts_dir: str
    log_dir: str


def _load_env() -> None:
    for path in (_PROD_ENV, _REPO_ENV):
        if path.exists():
            load_dotenv(path, override=False)


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variable d'environnement requise manquante : {name}")
    return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    _load_env()
    return Settings(
        supabase_url=_require("SUPABASE_URL"),
        supabase_service_role_key=_require("SUPABASE_SERVICE_ROLE_KEY"),
        supabase_db_url=_require("SUPABASE_DB_URL"),
        max_concurrent_runs=int(os.environ.get("MAX_CONCURRENT_RUNS", "2")),
        checkouts_dir=os.environ.get("KUA_CHECKOUTS_DIR", "/srv/kua/checkouts"),
        log_dir=os.environ.get("KUA_LOG_DIR", "/var/log/kua"),
    )
