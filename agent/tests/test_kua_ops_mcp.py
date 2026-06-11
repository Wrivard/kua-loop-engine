"""Serveur MCP kua-ops : un profil ne peut JAMAIS appeler un tool hors scope (test par
profil), le scope projet est étanche, l'audit JSONL est écrit, le protocole stdio répond.
Les fences sont testées PURES (ops monkeypatché) ; le stdio en subprocess (DB-free)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from agent import kua_ops_mcp as srv
from kua_core import ops

ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture(autouse=True)
def _reset(monkeypatch, tmp_path):
    monkeypatch.setattr(srv, "PROFILE", "brain")
    monkeypatch.setattr(srv, "PROJECT", None)
    monkeypatch.setattr(srv, "THREAD", None)
    monkeypatch.setattr(srv, "SESSION", "test-session")
    monkeypatch.setattr(srv, "AUDIT_PATH", tmp_path / "audit.jsonl")


# ------------------------------------------------- scoping par profil (fail-closed)


ALL_TOOLS = set(srv.TOOLS)


@pytest.mark.parametrize("profile", sorted(srv.PROFILES))
def test_un_profil_ne_peut_jamais_sortir_de_son_scope(profile, monkeypatch):
    monkeypatch.setattr(srv, "PROFILE", profile)
    allowed = srv.PROFILES[profile]
    for tool in sorted(ALL_TOOLS - allowed):
        with pytest.raises(srv.ScopeRefused, match="hors profil"):
            srv.call_tool(tool, {})


def test_matrice_doc18_invariants():
    # Personne n'a de mutation de loop/repo ; seul debug a restart ; seul wizard a mcp_*.
    for profile, tools in srv.PROFILES.items():
        assert not tools & {"create_loop", "update_loop", "pause_loop", "resume_loop",
                            "import_repo", "create_repo"}
        if profile != "debug":
            assert "restart_service" not in tools
        if profile != "mcp_wizard":
            assert not tools & {"mcp_add", "mcp_remove", "mcp_list"}
    # Seuls thread_agent (redo/reject) et thread_agent+discord (create_thread) mutent.
    assert srv.PROFILES["brain"] & {"redo_run", "reject_run", "create_thread"} == set()


# ------------------------------------------------------------- scope projet/thread


def test_fence_project_etanche(monkeypatch):
    monkeypatch.setattr(srv, "PROFILE", "thread_agent")
    monkeypatch.setattr(srv, "PROJECT", "projet-a")
    monkeypatch.setattr(
        ops, "get_run_status",
        lambda run_id: {"run_id": run_id, "project_id": "projet-b", "thread_id": "t1"},
    )
    with pytest.raises(srv.ScopeRefused, match="hors scope projet"):
        srv.call_tool("get_run_status", {"run_id": "r1"})
    # list_projects filtré à SON projet
    monkeypatch.setattr(ops, "list_projects", lambda: [{"id": "projet-a"}, {"id": "projet-b"}])
    monkeypatch.setattr(srv, "PROFILE", "brain")
    assert srv.call_tool("list_projects", {}) == [{"id": "projet-a"}]


def test_fence_thread_sur_mutations(monkeypatch):
    monkeypatch.setattr(srv, "PROFILE", "thread_agent")
    monkeypatch.setattr(srv, "THREAD", "thread-1")
    monkeypatch.setattr(
        ops, "get_run_status", lambda run_id: {"run_id": run_id, "thread_id": "thread-2"}
    )
    with pytest.raises(srv.ScopeRefused, match="pas à ce thread|n'appartient pas"):
        srv.call_tool("redo_run", {"run_id": "r1", "nuance": "x"})


def test_redo_refuse_nuance_vide_via_tool(monkeypatch):
    monkeypatch.setattr(srv, "PROFILE", "thread_agent")
    with pytest.raises(ops.OpsError, match="nuance"):
        srv.call_tool("redo_run", {"run_id": "00000000-0000-0000-0000-000000000000", "nuance": ""})


def test_get_costs_force_le_projet_du_scope(monkeypatch):
    monkeypatch.setattr(srv, "PROFILE", "thread_agent")
    monkeypatch.setattr(srv, "PROJECT", "projet-a")
    seen: dict = {}

    def fake_costs(project_id=None, month=None):
        seen["project_id"] = project_id
        return {"total_usd": 0}

    monkeypatch.setattr(ops, "get_costs", fake_costs)
    srv.call_tool("get_costs", {})  # sans argument → forcé au scope
    assert seen["project_id"] == "projet-a"
    with pytest.raises(srv.ScopeRefused):
        srv.call_tool("get_costs", {"project_id": "projet-b"})


# ----------------------------------------------------------------------- audit JSONL


def test_audit_ecrit_succes_et_refus(monkeypatch, tmp_path):
    audit = tmp_path / "audit.jsonl"
    monkeypatch.setattr(srv, "AUDIT_PATH", audit)
    monkeypatch.setattr(ops, "get_health", lambda: {"paused": False})
    srv.call_tool("get_health", {})
    with pytest.raises(srv.ScopeRefused):
        srv.call_tool("restart_service", {"service": "kua-gateway"})  # hors profil brain
    lines = [json.loads(line) for line in audit.read_text().splitlines()]
    assert len(lines) == 2
    assert lines[0]["tool"] == "get_health" and lines[0]["ok"] is True
    assert lines[1]["tool"] == "restart_service" and lines[1]["ok"] is False
    assert "hors profil" in lines[1]["error"]
    assert lines[0]["profile"] == "brain" and lines[0]["session"] == "test-session"


# ------------------------------------------------------------------- protocole stdio


def _spawn(env_extra: dict[str, str], messages: list[dict]) -> tuple[int, list[dict]]:
    env = {**os.environ, "KUA_OPS_SESSION": "stdio-test", **env_extra}
    stdin = "".join(json.dumps(m) + "\n" for m in messages)
    proc = subprocess.run(
        [sys.executable, "-m", "agent.kua_ops_mcp"],
        input=stdin, capture_output=True, text=True, timeout=30, cwd=str(ROOT), env=env,
    )
    out = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
    return proc.returncode, out


def test_stdio_initialize_et_tools_list_par_profil():
    rc, out = _spawn(
        {"KUA_OPS_PROFILE": "mcp_wizard"},
        [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        ],
    )
    assert rc == 0
    assert out[0]["result"]["serverInfo"]["name"] == "kua-ops"
    names = {t["name"] for t in out[1]["result"]["tools"]}
    assert names == {"mcp_list", "mcp_add", "mcp_remove"}  # exactement le profil


def test_stdio_tool_hors_profil_est_une_erreur():
    rc, out = _spawn(
        {"KUA_OPS_PROFILE": "brain"},
        [{"jsonrpc": "2.0", "id": 1, "method": "tools/call",
          "params": {"name": "restart_service", "arguments": {"service": "kua-gateway"}}}],
    )
    assert rc == 0
    assert out[0]["result"]["isError"] is True
    assert "hors profil" in out[0]["result"]["content"][0]["text"]


def test_stdio_refuse_sans_session_ou_profil_invalide():
    env = {**os.environ, "KUA_OPS_PROFILE": "brain"}
    env.pop("KUA_OPS_SESSION", None)
    proc = subprocess.run([sys.executable, "-m", "agent.kua_ops_mcp"], input="",
                          capture_output=True, text=True, timeout=30, cwd=str(ROOT), env=env)
    assert proc.returncode == 2 and "KUA_OPS_SESSION" in proc.stderr

    rc, _ = 0, None
    proc2 = subprocess.run([sys.executable, "-m", "agent.kua_ops_mcp"], input="",
                           capture_output=True, text=True, timeout=30, cwd=str(ROOT),
                           env={**os.environ, "KUA_OPS_PROFILE": "pirate", "KUA_OPS_SESSION": "x"})
    assert proc2.returncode == 2 and "invalide" in proc2.stderr