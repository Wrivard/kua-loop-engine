"""Trigger Gateway (spike S4) — kua-loop-engine.

One responsibility: turn a signed Sentry webhook into events + threads +
runs(queued) rows in Supabase. No business logic, no LLM calls (doc 07).

SECURITY: the webhook payload is UNTRUSTED DATA. No field from it is ever
interpreted or executed. The raw payload is stored as-is in events.payload
(audit trail) and only the extracted scalar fields go into thread.subject
and run.goal — as plain text.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import select
import signal
import time
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import BackgroundTasks, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app import bridge_auth, db, mcp_bridge, sysctl
from app.config import get_settings

VERSION = "0.1.0-s4"
app = FastAPI(title="kua-loop-engine Trigger Gateway", version=VERSION)

SIGNATURE_HEADER = "sentry-hook-signature"

# Démarrage du process (uptime). monotonic = robuste aux sauts d'horloge.
_STARTED_MONO = time.monotonic()
# Au-delà de ce délai sans heartbeat, le worker est jugé mort (3× l'intervalle ~10s).
WORKER_STALE_SEC = 30.0
# Port du process bridge dédié (kua-mcp-bridge.service) — testé pour une vraie liveness.
BRIDGE_PORT = int(os.environ.get("KUA_BRIDGE_PORT", "8001"))


def _port_alive(port: int, timeout: float = 0.3) -> bool:
    """True si un process écoute sur 127.0.0.1:port. Refus de connexion = échec immédiat
    (pas d'attente du timeout) → /health reste rapide."""
    import socket  # noqa: PLC0415

    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


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
def health() -> dict[str, Any]:
    """État du moteur (panneau Réglages « Système »). Public (aucun secret) : up/down de
    chaque service, version, uptime, heartbeat worker. L'auth est exigée sur /internal/* et le WS."""
    # Un seul appel DB (kua_core via psycopg) sert de ping ET lit l'état système.
    db_up, db_detail, sys_status = False, None, {}
    try:
        from kua_core import db as core_db  # noqa: PLC0415

        sys_status = core_db.get_system_status()
        db_up = True
    except Exception as exc:  # noqa: BLE001
        db_detail = type(exc).__name__

    worker: dict[str, Any] = {"up": False}
    hb = sys_status.get("worker_heartbeat_at")
    if hb is not None:
        age = (datetime.now(timezone.utc) - hb).total_seconds()
        worker = {
            "up": age < WORKER_STALE_SEC,
            "last_heartbeat": hb.isoformat(),
            "age_seconds": round(age, 1),
            "pid": sys_status.get("worker_pid"),
        }

    bridge_on = bool(get_settings().bridge_secret)
    services = {
        "gateway": {"up": True},
        "db": {"up": db_up, **({"detail": db_detail} if db_detail else {})},
        "worker": worker,
        # up = process bridge dédié (8001) VIVANT et configuré ; configured = secret présent.
        # (Le WS /mcp-bridge est routé par Caddy vers 8001, d'où la vraie liveness du port.)
        "mcp_bridge": {"up": bridge_on and _port_alive(BRIDGE_PORT), "configured": bridge_on},
    }
    return {
        "status": "ok" if db_up else "degraded",
        "version": VERSION,
        "uptime_seconds": round(time.monotonic() - _STARTED_MONO, 1),
        "paused": bool(sys_status.get("paused")),
        "services": services,
    }


# ----------------------------------------------------- Bridge MCP (wizard) ---
# WS authentifié → PTY RESTREINT (allowlist `claude mcp …` + `kua connector …`).
# Secret long-terme côté serveur (BRIDGE_SECRET) ; le navigateur n'a qu'un token court.


def _read_pty(master_fd: int) -> Optional[str]:
    """Lecture non-bloquante d'un chunk du PTY. None = EOF/fermé ; "" = rien pour l'instant."""
    ready, _, _ = select.select([master_fd], [], [], 0.1)
    if not ready:
        return ""
    try:
        data = os.read(master_fd, 4096)
    except OSError:
        return None
    return data.decode(errors="replace") if data else None


async def _stream_pty(ws: WebSocket, argv: list[str]) -> None:
    loop = asyncio.get_event_loop()
    pid, master = mcp_bridge._spawn(argv)
    stop = asyncio.Event()

    async def pump_input() -> None:
        try:
            while not stop.is_set():
                m = await ws.receive_json()
                if m.get("type") == "input":
                    os.write(master, str(m.get("data", "")).encode())
                elif m.get("type") == "cancel":
                    break
        except Exception:
            pass

    input_task = asyncio.create_task(pump_input())
    exit_code: Optional[int] = None
    try:
        while True:
            chunk = await loop.run_in_executor(None, _read_pty, master)
            if chunk is None:
                break
            if chunk:
                await ws.send_json({"type": "output", "data": chunk})
            wpid, wstatus = os.waitpid(pid, os.WNOHANG)
            if wpid != 0:
                exit_code = os.waitstatus_to_exitcode(wstatus)
                final = await loop.run_in_executor(None, _read_pty, master)
                if final:
                    await ws.send_json({"type": "output", "data": final})
                break
    finally:
        stop.set()
        input_task.cancel()
        try:
            os.killpg(os.getpgid(pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            os.close(master)
        except OSError:
            pass
        if exit_code is None:
            try:
                _, status = os.waitpid(pid, 0)
                exit_code = os.waitstatus_to_exitcode(status)
            except ChildProcessError:
                exit_code = 0
    await ws.send_json({"type": "exit", "code": exit_code})


@app.websocket("/mcp-bridge")
async def mcp_bridge_ws(ws: WebSocket) -> None:
    await ws.accept()
    settings = get_settings()
    # 1) Auth OBLIGATOIRE : 1er message = { token }.
    try:
        hello = await ws.receive_json()
    except Exception:
        await ws.close(code=4401)
        return
    user = bridge_auth.verify(settings.bridge_secret, (hello or {}).get("token"))
    if not user:
        try:
            await ws.send_json({"type": "error", "message": "non authentifié"})
        finally:
            await ws.close(code=4401)
        return
    await ws.send_json({"type": "ready", "user": user})

    # 2) Boucle commandes — allowlist STRICTE avant toute exécution.
    while True:
        try:
            msg = await ws.receive_json()
        except Exception:
            break
        if msg.get("type") == "guide":
            from app import mcp_guide

            text = await asyncio.get_event_loop().run_in_executor(
                None, mcp_guide.suggest_mcp, str(msg.get("query", ""))
            )
            await ws.send_json({"type": "guidance", "text": text})
            continue
        if msg.get("type") != "run":
            continue
        try:
            argv = mcp_bridge.parse_and_check(str(msg.get("command", "")), user=user)
        except mcp_bridge.CommandRefused as exc:
            await ws.send_json({"type": "refused", "message": str(exc)})
            continue
        await _stream_pty(ws, argv)


# ----------------------------------------------- Routes internes (futur bouton UI) ---
# Auth = bearer INTERNAL_TOKEN (secret long-terme côté serveur, jamais dans Vercel/UI).
# Tant que la gateway n'est pas exposée, la capacité create-repo s'utilise via la CLI
# `kua project create`. Cette route la rendra accessible au bouton UI via un proxy
# serveur Next (qui détient le bearer) — voir ui/BUILD-NOTES.md.


def _check_internal_auth(request: Request) -> bool:
    token = get_settings().internal_token
    if not token:
        return False
    header = request.headers.get("authorization", "")
    provided = header[7:] if header.lower().startswith("bearer ") else ""
    return bool(provided) and hmac.compare_digest(provided.encode(), token.encode())


@app.post("/internal/projects")
async def internal_create_project(request: Request) -> JSONResponse:
    if not get_settings().internal_token:
        return JSONResponse(status_code=503, content={"status": "internal_routes_disabled"})
    if not _check_internal_auth(request):
        return JSONResponse(status_code=401, content={"status": "unauthorized"})
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"status": "invalid_json"})
    name = str((body or {}).get("name", "")).strip()
    if not name:
        return JSONResponse(status_code=400, content={"status": "missing_name"})
    private = bool(body.get("private", True))
    facade = str(body.get("facade", "general")) or "general"
    try:
        budget = float(body.get("budget_usd", 5.0))
    except (TypeError, ValueError):
        budget = 5.0
    try:
        from kua_core.provision import provision_repo_project  # noqa: PLC0415

        res = provision_repo_project(name, private=private, facade=facade, budget_usd=budget)
    except Exception as exc:  # noqa: BLE001
        log_json("internal_create_project_failed", phase="provision", error=str(exc))
        return JSONResponse(status_code=502, content={"status": "provision_failed", "error": str(exc)})
    log_json("internal_create_project", phase="created", slug=res["slug"])
    return JSONResponse(status_code=200, content={"status": "created", **res})


# ----------------------------------------- Panneau Système : logs / contrôle / debug ---
# TOUS bearer INTERNAL_TOKEN. Élévations limitées à : sudoers étroit (3 services × 4 actions)
# + groupe systemd-journal (lecture). Allowlist stricte dans app/sysctl.py. Aucun shell libre.


def _internal_guard(request: Request) -> Optional[JSONResponse]:
    """503 si INTERNAL_TOKEN non configuré, 401 si bearer absent/faux, sinon None."""
    if not get_settings().internal_token:
        return JSONResponse(status_code=503, content={"status": "internal_routes_disabled"})
    if not _check_internal_auth(request):
        return JSONResponse(status_code=401, content={"status": "unauthorized"})
    return None


def _audit_user(request: Request) -> str:
    """Identité pour l'audit (transmise par le proxy Next depuis la session Supabase)."""
    return request.headers.get("x-kua-user", "?")


def _perform_control(action: str, service: str, user: str, background: BackgroundTasks) -> dict[str, Any]:
    """Exécute une action systemctl. Si elle tue la gateway elle-même (stop/restart kua-gateway),
    on planifie en tâche de fond → la réponse HTTP part AVANT que le process ne redémarre."""
    if sysctl.self_affecting(service, action):
        background.add_task(sysctl.systemctl, action, service, user)
        return {
            "status": "scheduled", "service": service, "action": action,
            "note": "Redémarrage en cours — la santé revient au vert dans quelques secondes.",
        }
    res = sysctl.systemctl(action, service, user=user)
    return {"status": "done", "service": service, "action": action, **res}


@app.get("/internal/logs")
async def internal_logs(request: Request) -> JSONResponse:
    if (err := _internal_guard(request)) is not None:
        return err
    service = request.query_params.get("service", "")
    try:
        lines = int(request.query_params.get("lines", "200"))
    except (TypeError, ValueError):
        lines = 200
    try:
        res = sysctl.journal(service, lines, user=_audit_user(request))
    except sysctl.ControlRefused as exc:
        return JSONResponse(status_code=400, content={"status": "refused", "message": str(exc)})
    return JSONResponse(content={"status": "ok", "service": service, **res})


@app.post("/internal/control")
async def internal_control(request: Request, background: BackgroundTasks) -> JSONResponse:
    if (err := _internal_guard(request)) is not None:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"status": "invalid_json"})
    service = str((body or {}).get("service", ""))
    action = str((body or {}).get("action", ""))
    try:
        out = _perform_control(action, service, _audit_user(request), background)
    except sysctl.ControlRefused as exc:
        return JSONResponse(status_code=400, content={"status": "refused", "message": str(exc)})
    return JSONResponse(content=out)


def _gather_debug_context() -> str:
    """Contexte LECTURE SEULE pour l'assistant : /health + diagnostics + journaux courts."""
    parts = ["== /health ==\n" + json.dumps(health(), default=str, indent=2)]
    for d in sysctl.diagnostics():
        parts.append(f"== {d['name']} (exit {d['exit_code']}) ==\n{d['output']}")
    for svc in sysctl.ALLOWED_SERVICES:
        parts.append(f"== journalctl {svc} (40) ==\n{sysctl.journal(svc, 40)['output']}")
    return "\n\n".join(parts)


@app.get("/internal/diagnostics")
async def internal_diagnostics(request: Request) -> JSONResponse:
    if (err := _internal_guard(request)) is not None:
        return err
    return JSONResponse(content={"status": "ok", "health": health(), "diagnostics": sysctl.diagnostics(_audit_user(request))})


@app.post("/internal/debug/advise")
async def internal_debug_advise(request: Request) -> JSONResponse:
    if (err := _internal_guard(request)) is not None:
        return err
    try:
        body = await request.json()
    except Exception:
        body = {}
    question = str((body or {}).get("question", "")).strip()
    from app import debug_advisor  # noqa: PLC0415

    ctx = await asyncio.get_event_loop().run_in_executor(None, _gather_debug_context)
    res = await asyncio.get_event_loop().run_in_executor(None, debug_advisor.advise, question, ctx)
    log_json("debug_advise", user=_audit_user(request), has_action=bool(res.get("proposed_action")))
    return JSONResponse(content={"status": "ok", **res})


@app.post("/internal/debug/act")
async def internal_debug_act(request: Request, background: BackgroundTasks) -> JSONResponse:
    """Exécute une action CONFIRMÉE par William, re-validée contre l'allowlist (defense-in-depth)."""
    if (err := _internal_guard(request)) is not None:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"status": "invalid_json"})
    user = _audit_user(request)
    act_type = str((body or {}).get("type", ""))
    try:
        if act_type == "restart_service":
            out = _perform_control("restart", str(body.get("service", "")), user, background)
        elif act_type == "reinstall_dep":
            out = {"status": "done", **sysctl.reinstall_dep(str(body.get("key", "")), user=user)}
        else:
            return JSONResponse(status_code=400, content={"status": "refused", "message": f"type inconnu : {act_type!r}"})
    except sysctl.ControlRefused as exc:
        return JSONResponse(status_code=400, content={"status": "refused", "message": str(exc)})
    return JSONResponse(content=out)


# --------------------------------------------------- Cerveau Küa (chat-first) ---
# POST /internal/agent/propose : trie un message opérateur → AgentProposal (claude -p Max).
# Bearer INTERNAL_TOKEN. Le texte est une REQUÊTE à trier, jamais des instructions à exécuter.


@app.post("/internal/agent/propose")
async def internal_agent_propose(request: Request) -> JSONResponse:
    if (err := _internal_guard(request)) is not None:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"status": "invalid_json"})
    message = str((body or {}).get("message", "")).strip()
    if not message:
        return JSONResponse(status_code=400, content={"status": "missing_message"})
    history = body.get("history") if isinstance(body.get("history"), list) else []
    project_id = body.get("project_id") if isinstance(body.get("project_id"), str) else None
    source = str(body.get("source") or "ui")
    user = _audit_user(request)

    from app import agent_brain  # noqa: PLC0415

    try:
        proposal = await asyncio.get_event_loop().run_in_executor(
            None, lambda: agent_brain.propose(message, history, project_id, source)
        )
    except agent_brain.BrainError as exc:
        log_json("agent_propose_failed", user=user, source=source, error=str(exc))
        return JSONResponse(status_code=502, content={"status": "brain_error", "message": str(exc)})

    # Inbox : les sources NON-interactives (discord|sentry|cron|webhook) déposent leurs propositions
    # ACTIONNABLES dans la table proposals. Le chat (source=ui) confirme inline → pas d'écriture.
    proposal_id = None
    actionable = proposal["action"] in ("create_thread", "create_loop") and not proposal["questions_manquantes"]
    if source != "ui" and actionable:
        try:
            from kua_core import db as core_db  # noqa: PLC0415

            proposal_id = core_db.create_proposal(source, project_id, proposal)
        except Exception as exc:  # noqa: BLE001
            log_json("proposal_persist_failed", source=source, error=str(exc))

    log_json("agent_propose", user=user, source=source, action=proposal["action"], facade=proposal["facade"])
    return JSONResponse(content={"status": "ok", "proposal": proposal, "proposal_id": proposal_id})


# Actions de gestion de loop confirmées par l'humain (chat-first). ALLOWLIST STRICTE :
# tout ce qui n'est pas listé est REFUSÉ ; `autonomy=auto` (allow_auto) est impossible par ce chemin.
_ACT_ALLOWLIST = {"update_loop", "pause_loop", "resume_loop"}


def _slim_loop(loop: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not loop:
        return None
    return {
        "budget_usd": str(loop.get("budget_usd")),  # Decimal → str (JSON)
        "autonomy": loop.get("autonomy"),
        "enabled": loop.get("enabled"),
        "model": loop.get("model"),
    }


@app.post("/internal/agent/act")
async def internal_agent_act(request: Request) -> JSONResponse:
    if (err := _internal_guard(request)) is not None:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"status": "invalid_json"})
    action = str((body or {}).get("action", ""))
    loop_id = body.get("loop_id")
    user = _audit_user(request)

    if action not in _ACT_ALLOWLIST:
        log_json("agent_act_refused", user=user, action=action, reason="not_allowlisted")
        return JSONResponse(status_code=400, content={"status": "refused", "error": f"action non autorisée : {action!r}"})
    if not loop_id or not isinstance(loop_id, str):
        return JSONResponse(status_code=400, content={"status": "missing_loop_id"})

    from kua_core import db as core_db  # noqa: PLC0415

    before = core_db.get_loop_by_id(loop_id)
    if not before:
        return JSONResponse(status_code=404, content={"status": "loop_not_found"})

    patch = body.get("patch") if isinstance(body.get("patch"), dict) else {}
    if action == "update_loop":
        if patch.get("autonomy") == "auto":  # JAMAIS auto par le chat (allow_auto reste false)
            log_json("agent_act_refused", user=user, action=action, reason="auto_forbidden")
            return JSONResponse(status_code=400, content={"status": "refused", "error": "le mode auto n'est pas activable par le chat"})
        try:
            budget = float(patch.get("budget_usd")) if patch.get("budget_usd") is not None else None
        except (TypeError, ValueError):
            budget = None
        core_db.update_loop_fields(loop_id, budget_usd=budget, model=patch.get("model"), autonomy=patch.get("autonomy"))
    elif action == "pause_loop":
        core_db.set_loop_enabled(loop_id, False)
    elif action == "resume_loop":
        core_db.set_loop_enabled(loop_id, True)

    after = core_db.get_loop_by_id(loop_id)
    log_json("agent_act", user=user, action=action, loop_id=loop_id)
    return JSONResponse(content={"status": "ok", "action": action, "before": _slim_loop(before), "after": _slim_loop(after)})


# Détail d'une PR pour la revue dans l'app (M13) — diff/patch/commits via l'API GitHub (token VPS).
@app.get("/internal/pr/{run_id}")
async def internal_pr(run_id: str, request: Request) -> JSONResponse:
    if (err := _internal_guard(request)) is not None:
        return err
    from kua_core import db as core_db  # noqa: PLC0415

    ctx = core_db.get_run_context(run_id)
    if not ctx:
        return JSONResponse(status_code=404, content={"status": "run_not_found"})
    run_info = {
        "status": ctx.get("run_status"),
        "cost_usd": str(ctx.get("cost_usd")) if ctx.get("cost_usd") is not None else None,
        "iterations": ctx.get("iterations"),
        "summary": ctx.get("summary"),
        "verify_status": ctx.get("verify_status"),
        "verify_command": ctx.get("verify_command"),
        "verify_output": (ctx.get("verify_output") or "")[-6000:],
        "branch": ctx.get("branch"),
    }
    pr_url = ctx.get("pr_url")
    if not pr_url:
        return JSONResponse(content={"status": "ok", "run": run_info, "pr": None, "files": []})

    from app import pr_review  # noqa: PLC0415

    try:
        detail = await asyncio.get_event_loop().run_in_executor(None, pr_review.pr_detail, pr_url)
    except Exception as exc:  # noqa: BLE001
        log_json("pr_detail_failed", run_id=run_id, error=str(exc))
        return JSONResponse(status_code=502, content={"status": "pr_error", "error": str(exc), "run": run_info})
    return JSONResponse(content={"status": "ok", "run": run_info, **detail})


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
