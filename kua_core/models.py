"""Modèles de données — miroir des 7 tables Postgres (doc 03-DATA-MODEL.md).

Dataclasses légères pour typer ce qui circule entre composants. La source de
vérité reste le schéma SQL (db/migrations/) ; ces classes le reflètent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

# --- Énumérations « verrouillées » (doc CLAUDE.md + doc 03) ---

FACADES = ("bugfix", "discord", "seo", "demo", "finish")
AUTONOMY = ("manual", "approve_final", "auto")
EVENT_SOURCES = ("sentry", "posthog", "discord", "cron", "calendar", "ui", "manual")
MESSAGE_ROLES = ("user", "agent", "run", "system")

# threads.status : open → working → awaiting_approval → resolved → archived
#                       ↘ rejected | failed
THREAD_STATUSES = (
    "open", "working", "awaiting_approval", "resolved",
    "rejected", "failed", "archived",
)
# runs.status : queued → preparing → running → verifying → awaiting_approval
#               → approved → pushed  ↘ failed | rejected | budget_exceeded | timed_out
RUN_STATUSES = (
    "queued", "preparing", "running", "verifying", "awaiting_approval",
    "approved", "pushed", "failed", "rejected", "budget_exceeded", "timed_out",
)
APPROVAL_DECISIONS = ("approved", "rejected", "redo")


@dataclass
class Project:
    id: str
    name: str
    repo_url: str
    default_branch: str = "main"
    plan: str = "base"
    discord_channel_id: Optional[str] = None
    sentry_project_slug: Optional[str] = None
    is_engine: bool = False
    created_at: Optional[datetime] = None


@dataclass
class Loop:
    id: str
    project_id: str
    facade: str
    enabled: bool = False
    autonomy: str = "manual"
    schedule_cron: Optional[str] = None
    model: str = "sonnet"
    max_iterations: int = 8
    budget_usd: Decimal = Decimal("5.00")
    timeout_min: int = 30
    config: dict[str, Any] = field(default_factory=dict)


@dataclass
class Event:
    id: str
    source: str
    payload: dict[str, Any]
    external_id: Optional[str] = None
    received_at: Optional[datetime] = None


@dataclass
class Thread:
    id: str
    project_id: str
    facade: str
    subject: str
    loop_id: Optional[str] = None
    status: str = "open"
    source_event_id: Optional[str] = None
    created_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None


@dataclass
class Message:
    id: str
    thread_id: str
    role: str
    content: Optional[str] = None
    author: Optional[str] = None
    run_id: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class Run:
    id: str
    thread_id: str
    goal: str
    status: str = "queued"
    branch: Optional[str] = None
    pr_url: Optional[str] = None
    preview_url: Optional[str] = None
    cost_usd: Decimal = Decimal("0")
    iterations: int = 0
    log_path: Optional[str] = None
    summary: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


@dataclass
class Approval:
    id: str
    run_id: str
    decision: str
    decided_by: str
    comment: Optional[str] = None
    decided_at: Optional[datetime] = None
