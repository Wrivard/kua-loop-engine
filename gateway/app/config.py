"""Environment configuration for the Trigger Gateway (spike S4).

Loads gateway/.env via python-dotenv. Required variables:
SUPABASE_URL, SUPABASE_KEY, SENTRY_WEBHOOK_SECRET.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
_REQUIRED_VARS = ("SUPABASE_URL", "SUPABASE_KEY", "SENTRY_WEBHOOK_SECRET")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    sentry_webhook_secret: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    load_dotenv(_ENV_PATH)
    missing = [name for name in _REQUIRED_VARS if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )
    return Settings(
        supabase_url=os.environ["SUPABASE_URL"],
        supabase_key=os.environ["SUPABASE_KEY"],
        sentry_webhook_secret=os.environ["SENTRY_WEBHOOK_SECRET"],
    )
