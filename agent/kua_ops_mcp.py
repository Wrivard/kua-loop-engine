"""Serveur MCP « kua-ops » (stdio, zéro dépendance) — expose kua_core/ops.py aux agents
`claude -p` avec SCOPING PAR PROFIL (doc 18, matrice profils×tools).

Lancement (par l'agent runner, jamais à la main) :
    KUA_OPS_PROFILE=thread_agent KUA_OPS_PROJECT=<slug> KUA_OPS_THREAD=<uuid> \
    KUA_OPS_SESSION=<token-éphémère> python -m agent.kua_ops_mcp

Sécurité (fail-closed) :
- profil inconnu ou KUA_OPS_SESSION absent → le serveur REFUSE de démarrer ;
- tool hors profil → refus AVANT exécution (« hors profil ») ;
- scope PROJET étanche : un thread_agent ne lit/n'agit QUE sur son projet (KUA_OPS_PROJECT),
  et ses mutations de run QUE sur son thread (KUA_OPS_THREAD) ;
- ADMIN composé sur les allowlists EXISTANTES : sysctl (sudoers) et mcp_bridge (claude mcp …) ;
- audit JSONL de chaque appel (qui/quoi/ok/durée — jamais le contenu complet) ;
- timeout par appel (KUA_OPS_TIMEOUT, défaut 30 s).

Protocole : MCP minimal sur stdio (JSON-RPC 2.0, une ligne par message) —
initialize / tools/list / tools/call / ping. Suffisant pour `claude --mcp-config`.
"""

from __future__ import annotations

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from pathlib import Path
from typing import Any, Callable, Optional

_ROOT = Path(__file__).resolve().parent.parent
for p in (str(_ROOT), str(_ROOT / "gateway")):
    if p not in sys.path:
        sys.path.insert(0, p)

from kua_core import ops  # noqa: E402

PROTOCOL_VERSION = "2024-11-05"
AUDIT_PATH = Path(os.environ.get("KUA_OPS_AUDIT", str(Path.home() / ".kua" / "ops-audit.jsonl")))
CALL_TIMEOUT = float(os.environ.get("KUA_OPS_TIMEOUT", "30"))

PROFILE = os.environ.get("KUA_OPS_PROFILE", "")
PROJECT = os.environ.get("KUA_OPS_PROJECT") or None
THREAD = os.environ.get("KUA_OPS_THREAD") or None
SESSION = os.environ.get("KUA_OPS_SESSION", "")
ACTOR = os.environ.get("KUA_OPS_ACTOR", f"agent:{PROFILE}")


class ScopeRefused(ValueError):
    """Appel hors profil / hors scope (refusé AVANT exécution)."""


def _audit(tool: str, *, ok: bool, ms: int, error: str = "") -> None:
    try:
        AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with AUDIT_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "session": SESSION[:12], "profile": PROFILE, "project": PROJECT,
                "thread": THREAD, "actor": ACTOR, "tool": tool, "ok": ok,
                "ms": ms, "error": error[:300],
            }, default=str) + "\n")
    except Exception:  # l'audit ne doit jamais tuer le serveur
        pass


# ------------------------------------------------------------- garde-fous de scope


def _fence_project(project_id: Optional[str]) -> str:
    """Force/valide le projet selon le scope. Sans scope → projet requis explicite."""
    if PROJECT:
        if project_id and project_id != PROJECT:
            raise ScopeRefused(f"hors scope projet ({PROJECT})")
        return PROJECT
    if not project_id:
        raise ScopeRefused("project_id requis")
    return project_id


def _fence_thread_of_run(run_id: str) -> None:
    """Mutations de run d'un thread_agent : seulement les runs de SON thread."""
    if not THREAD:
        return
    st = ops.get_run_status(run_id)
    if str(st.get("thread_id")) != THREAD:
        raise ScopeRefused("hors scope : ce run n'appartient pas à ce thread")


def _fence_thread(thread_id: str) -> None:
    if THREAD and thread_id != THREAD:
        # lecture limitée au projet : autorisée si le thread est du même projet
        ctx = ops.get_thread_context(thread_id, message_limit=1)
        if PROJECT and ctx["thread"]["project_id"] != PROJECT:
            raise ScopeRefused(f"hors scope projet ({PROJECT})")


# ----------------------------------------------------------------- handlers de tools


def _h_get_thread_context(a: dict) -> Any:
    tid = a.get("thread_id") or THREAD
    if not tid:
        raise ScopeRefused("thread_id requis")
    _fence_thread(tid)
    return ops.get_thread_context(tid)


def _h_get_run_status(a: dict) -> Any:
    st = ops.get_run_status(a["run_id"])
    if PROJECT and st.get("project_id") != PROJECT:
        raise ScopeRefused(f"hors scope projet ({PROJECT})")
    return st


def _h_get_run_diff(a: dict) -> Any:
    if PROJECT:  # vérifie l'appartenance avant d'appeler GitHub
        st = ops.get_run_status(a["run_id"])
        if st.get("project_id") != PROJECT:
            raise ScopeRefused(f"hors scope projet ({PROJECT})")
    return ops.get_run_diff(a["run_id"])


def _h_list_projects(a: dict) -> Any:
    if PROJECT:
        return [p for p in ops.list_projects() if p["id"] == PROJECT]
    return ops.list_projects()


def _h_list_loops(a: dict) -> Any:
    return ops.list_loops(_fence_project(a.get("project_id")) if PROJECT else a.get("project_id"))


def _h_get_loop_config(a: dict) -> Any:
    loop = ops.get_loop_config(a["loop_id"])
    if PROJECT and loop.get("project_id") != PROJECT:
        raise ScopeRefused(f"hors scope projet ({PROJECT})")
    return loop


def _h_get_costs(a: dict) -> Any:
    pid = _fence_project(a.get("project_id")) if PROJECT else a.get("project_id")
    return ops.get_costs(project_id=pid, month=a.get("month"))


def _h_redo_run(a: dict) -> Any:
    _fence_thread_of_run(a["run_id"])
    return ops.redo_run(a["run_id"], a.get("nuance", ""), actor=ACTOR)


def _h_reject_run(a: dict) -> Any:
    _fence_thread_of_run(a["run_id"])
    return ops.reject_run(a["run_id"], actor=ACTOR)


def _h_create_thread(a: dict) -> Any:
    pid = _fence_project(a.get("project_id"))
    return ops.create_thread(pid, a.get("facade", "general"), a["subject"], a["goal"], actor=ACTOR)


def _h_get_health(a: dict) -> Any:
    return ops.get_health()


def _h_list_proposals(a: dict) -> Any:
    return ops.list_proposals(a.get("status", "pending"))


def _h_restart_service(a: dict) -> Any:
    from app import sysctl  # noqa: PLC0415 — allowlist sudoers EXISTANTE

    return sysctl.systemctl("restart", a["service"], user=ACTOR)


def _h_mcp_list(a: dict) -> Any:
    from app import mcp_bridge  # noqa: PLC0415 — allowlist bridge EXISTANTE

    return mcp_bridge.run_command_capture("claude mcp list", user=ACTOR)


def _h_mcp_add(a: dict) -> Any:
    from app import mcp_bridge  # noqa: PLC0415

    cmd = (a.get("command") or "").strip()
    if not cmd.startswith("claude mcp add"):
        raise ScopeRefused("seul « claude mcp add … » est permis ici")
    return mcp_bridge.run_command_capture(cmd, user=ACTOR)


def _h_mcp_remove(a: dict) -> Any:
    from app import mcp_bridge  # noqa: PLC0415

    name = (a.get("name") or "").strip()
    if not name or any(c in name for c in " ;|&$`\n"):
        raise ScopeRefused("nom de serveur MCP invalide")
    return mcp_bridge.run_command_capture(f"claude mcp remove {name}", user=ACTOR)


def _obj(props: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required, "additionalProperties": False}


_RUN_ID = {"run_id": {"type": "string", "description": "UUID du run"}}

# name → (description, inputSchema, handler)
TOOLS: dict[str, tuple[str, dict[str, Any], Callable[[dict], Any]]] = {
    "get_thread_context": ("Le thread (sujet, statut), ses derniers messages et ses runs (versions).",
                           _obj({"thread_id": {"type": "string"}}, []), _h_get_thread_context),
    "get_run_status": ("Statut riche d'un run : état, coût, PR, branche, vérif, résumé.",
                       _obj(_RUN_ID, ["run_id"]), _h_get_run_status),
    "get_run_diff": ("Diff de la PR d'un run (fichiers, +/-, patchs tronqués).",
                     _obj(_RUN_ID, ["run_id"]), _h_get_run_diff),
    "list_projects": ("Projets enregistrés (id, nom, workspace).", _obj({}, []), _h_list_projects),
    "list_loops": ("Loops (façades armées) d'un projet : enabled, autonomy, budget, modèle, cron.",
                   _obj({"project_id": {"type": "string"}}, []), _h_list_loops),
    "get_loop_config": ("Config complète d'une loop.", _obj({"loop_id": {"type": "string"}}, ["loop_id"]),
                        _h_get_loop_config),
    "get_costs": ("Coûts agrégés du mois (total, par façade, runs par statut). month=YYYY-MM optionnel.",
                  _obj({"project_id": {"type": "string"}, "month": {"type": "string"}}, []), _h_get_costs),
    "get_health": ("Santé du moteur : pause, heartbeat du worker.", _obj({}, []), _h_get_health),
    "list_proposals": ("Propositions en attente dans l'inbox.",
                       _obj({"status": {"type": "string"}}, []), _h_list_proposals),
    "redo_run": ("REFAIRE un run À CONFIRMER avec une nuance (rejette v1, relance v2 avec la précision). "
                 "À n'utiliser QUE si l'utilisateur vient de demander explicitement ce changement.",
                 _obj(_RUN_ID | {"nuance": {"type": "string", "description": "ce qui doit changer"}},
                      ["run_id", "nuance"]), _h_redo_run),
    "reject_run": ("REJETER un run à confirmer (ferme la livraison). Seulement sur demande explicite.",
                   _obj(_RUN_ID, ["run_id"]), _h_reject_run),
    "create_thread": ("Créer une nouvelle unité de travail (thread + run queued, approve_final).",
                      _obj({"project_id": {"type": "string"}, "facade": {"type": "string"},
                            "subject": {"type": "string"}, "goal": {"type": "string"}},
                           ["subject", "goal"]), _h_create_thread),
    "restart_service": ("Redémarrer un service kua (allowlist sudoers existante).",
                        _obj({"service": {"type": "string"}}, ["service"]), _h_restart_service),
    "mcp_list": ("Lister les serveurs MCP configurés (via l'allowlist bridge).", _obj({}, []), _h_mcp_list),
    "mcp_add": ("Ajouter un serveur MCP : commande complète « claude mcp add … » (validée par l'allowlist bridge).",
                _obj({"command": {"type": "string"}}, ["command"]), _h_mcp_add),
    "mcp_remove": ("Retirer un serveur MCP par nom (via l'allowlist bridge).",
                   _obj({"name": {"type": "string"}}, ["name"]), _h_mcp_remove),
}

# Matrice profils×tools (doc 18) — fail-closed : tout ce qui n'est pas listé est refusé.
PROFILES: dict[str, frozenset[str]] = {
    "brain": frozenset({
        "get_thread_context", "get_run_status", "get_run_diff", "list_projects", "list_loops",
        "get_loop_config", "get_costs", "get_health", "list_proposals",
    }),
    "thread_agent": frozenset({
        "get_thread_context", "get_run_status", "get_run_diff", "list_loops", "get_loop_config",
        "get_costs", "redo_run", "reject_run", "create_thread",
    }),
    "mcp_wizard": frozenset({"mcp_list", "mcp_add", "mcp_remove"}),
    "debug": frozenset({
        "get_health", "get_run_status", "list_projects", "list_loops", "get_loop_config",
        "get_costs", "list_proposals", "restart_service",
    }),
    "discord": frozenset({
        "get_thread_context", "get_run_status", "list_projects", "list_loops", "get_loop_config",
        "get_costs", "get_health", "list_proposals", "create_thread",
    }),
}


def allowed_tools() -> list[str]:
    return sorted(PROFILES[PROFILE])


def call_tool(name: str, arguments: dict[str, Any]) -> Any:
    """Validation profil/scope AVANT exécution + timeout + audit. API testable sans stdio."""
    t0 = time.monotonic()
    try:
        if name not in PROFILES[PROFILE]:
            raise ScopeRefused(f"tool hors profil « {PROFILE} » : {name}")
        _, _, handler = TOOLS[name]
        with ThreadPoolExecutor(max_workers=1) as pool:
            fut = pool.submit(handler, arguments or {})
            try:
                result = fut.result(timeout=CALL_TIMEOUT)
            except FutureTimeout as exc:
                raise TimeoutError(f"timeout après {CALL_TIMEOUT:.0f}s") from exc
        _audit(name, ok=True, ms=int((time.monotonic() - t0) * 1000))
        return result
    except Exception as exc:
        _audit(name, ok=False, ms=int((time.monotonic() - t0) * 1000), error=f"{type(exc).__name__}: {exc}")
        raise


# ------------------------------------------------------------------- protocole stdio


def _tools_payload() -> list[dict[str, Any]]:
    out = []
    for name in allowed_tools():
        desc, schema, _ = TOOLS[name]
        out.append({"name": name, "description": desc, "inputSchema": schema})
    return out


def _handle(msg: dict[str, Any]) -> Optional[dict[str, Any]]:
    method = msg.get("method")
    mid = msg.get("id")
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": mid, "result": {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "kua-ops", "version": "1.0.0"},
        }}
    if method in ("notifications/initialized", "notifications/cancelled"):
        return None
    if method == "ping":
        return {"jsonrpc": "2.0", "id": mid, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": mid, "result": {"tools": _tools_payload()}}
    if method == "tools/call":
        params = msg.get("params") or {}
        name = params.get("name", "")
        try:
            result = call_tool(name, params.get("arguments") or {})
            text = json.dumps(result, ensure_ascii=False, default=str)
            return {"jsonrpc": "2.0", "id": mid,
                    "result": {"content": [{"type": "text", "text": text}], "isError": False}}
        except Exception as exc:
            return {"jsonrpc": "2.0", "id": mid,
                    "result": {"content": [{"type": "text", "text": f"REFUSÉ/ÉCHEC : {exc}"}],
                               "isError": True}}
    if mid is not None:
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"méthode inconnue : {method}"}}
    return None


def main() -> int:
    if PROFILE not in PROFILES:
        print(json.dumps({"error": f"KUA_OPS_PROFILE invalide : {PROFILE!r}"}), file=sys.stderr)
        return 2
    if not SESSION:
        print(json.dumps({"error": "KUA_OPS_SESSION requis (token de session)"}), file=sys.stderr)
        return 2
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        resp = _handle(msg)
        if resp is not None:
            sys.stdout.write(json.dumps(resp, ensure_ascii=False, default=str) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
