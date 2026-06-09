"""Trigger Gateway (spike S4) — kua-loop-engine.

One responsibility: turn a signed Sentry webhook into events + threads +
runs(queued) rows in Supabase. No business logic, no LLM calls (doc 07).

SECURITY: the webhook payload is UNTRUSTED DATA. No field from it is ever
interpreted or executed. The raw payload is stored as-is in events.payload
(audit trail) and only the extracted scalar fields go into thread.subject
and run.goal — as plain text.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import db
from app.config import get_settings

app = FastAPI(title="kua-loop-engine Trigger Gateway", version="0.1.0-s4")

SIGNATURE_HEADER = "sentry-hook-signature"


def log_json(event: str, **fields: Any) -> None:
    """Structured JSON log line on stdout."""
    print(json.dumps({"event": event, **fields}, default=str), flush=True)


def verify_signature(raw_body: bytes, provided: Optional[str], secret: str) -> bool:
    """Constant-time check of the HMAC-SHA256 hex signature of the raw body."""
    if not provided:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("utf-8"), provided.encode("utf-8"))


def _first(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def extract_sentry_fields(payload: Any) -> dict[str, Optional[str]]:
    """Tolerant extraction from a Sentry payload.

    Looks into the alert-webhook shapes (data.event / data.issue) first,
    then falls back to root-level fields (manual posts / tests).
    Returns only plain strings (or None) — never payload sub-objects.
    """
    root: dict[str, Any] = payload if isinstance(payload, dict) else {}
    data: dict[str, Any] = root.get("data") if isinstance(root.get("data"), dict) else {}
    event: dict[str, Any] = data.get("event") if isinstance(data.get("event"), dict) else {}
    issue: dict[str, Any] = data.get("issue") if isinstance(data.get("issue"), dict) else {}

    def as_str(value: Any) -> Optional[str]:
        return None if value is None else str(value)

    issue_id = _first(
        event.get("issue_id"),  # alert webhook: data.event.issue_id
        issue.get("id"),  # issue webhook: data.issue.id
        root.get("issue_id"),  # root fallback (manual posts / tests)
        root.get("id"),
    )
    return {
        "issue_id": as_str(issue_id),
        "title": as_str(_first(event.get("title"), issue.get("title"), root.get("title"))),
        "culprit": as_str(
            _first(event.get("culprit"), issue.get("culprit"), root.get("culprit"))
        ),
        "permalink": as_str(
            _first(event.get("web_url"), issue.get("permalink"), root.get("permalink"))
        ),
        "level": as_str(_first(event.get("level"), issue.get("level"), root.get("level"))),
        "release": as_str(
            _first(event.get("release"), issue.get("release"), root.get("release"))
        ),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/hooks/sentry/{project_id}")
async def sentry_hook(project_id: str, request: Request) -> JSONResponse:
    raw_body = await request.body()
    settings = get_settings()

    # (a) Signature first — anything unsigned is dropped before parsing.
    signature = request.headers.get(SIGNATURE_HEADER)
    if not verify_signature(raw_body, signature, settings.sentry_webhook_secret):
        log_json(
            "sentry_hook_rejected", project_id=project_id, phase="signature_check"
        )
        return JSONResponse(status_code=403, content={"status": "invalid_signature"})

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        log_json(
            "sentry_hook_rejected",
            project_id=project_id,
            phase="parse",
            reason="invalid_json",
        )
        return JSONResponse(status_code=400, content={"status": "invalid_payload"})

    # (b) Tolerant field extraction — payload stays untrusted data.
    fields = extract_sentry_fields(payload)
    issue_id = fields["issue_id"]
    if not issue_id:
        log_json(
            "sentry_hook_rejected",
            project_id=project_id,
            phase="extract",
            reason="missing_issue_id",
        )
        return JSONResponse(status_code=400, content={"status": "missing_issue_id"})

    # (c) Audit + dedup: raw payload stored as-is, ON CONFLICT DO NOTHING.
    event_id = db.insert_event(source="sentry", external_id=issue_id, payload=payload)
    if event_id is None:
        log_json(
            "sentry_hook_duplicate",
            project_id=project_id,
            phase="dedup",
            external_id=issue_id,
        )
        return JSONResponse(status_code=200, content={"status": "duplicate"})

    # (d) Loop gate: (project_id, 'bugfix') must exist and be enabled.
    loop = db.get_loop(project_id=project_id, facade="bugfix")
    if loop is None or not loop.get("enabled"):
        log_json(
            "sentry_hook_loop_disabled",
            project_id=project_id,
            phase="loop_check",
            external_id=issue_id,
        )
        return JSONResponse(status_code=200, content={"status": "loop_disabled"})

    # (e) Thread + first queued run. The goal here is only a short
    # normalized summary — full goal compilation is the Runner's job.
    title = fields["title"] or f"Sentry issue {issue_id}"
    goal = f"Sentry issue ({fields['level'] or 'unknown'}): {title}"
    if fields["permalink"]:
        goal += f" | {fields['permalink']}"

    thread_id, run_id = db.create_thread_with_run(
        project_id=project_id,
        loop_id=loop["id"],
        facade="bugfix",
        subject=title,
        source_event_id=event_id,
        goal=goal,
    )
    log_json(
        "sentry_hook_created",
        project_id=project_id,
        phase="created",
        external_id=issue_id,
        thread_id=thread_id,
        run_id=run_id,
    )
    return JSONResponse(
        status_code=200,
        content={"status": "created", "thread_id": thread_id, "run_id": run_id},
    )
