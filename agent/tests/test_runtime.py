"""Runtime de l'agent outillé : config MCP scopée, tools du profil énumérés, fallback
Phase-1 du worker quand le LLM échoue. Aucun appel réseau/DB (tout mocké)."""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path

import pytest

from agent import runtime
from kua_core import ops


def test_build_mcp_config_scope_et_session(monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    cfg = runtime.build_mcp_config("thread_agent", project_id="proj-x", thread_id="th-1", actor="t")
    srv = cfg["mcpServers"]["kua-ops"]
    env = srv["env"]
    assert env["KUA_OPS_PROFILE"] == "thread_agent"
    assert env["KUA_OPS_PROJECT"] == "proj-x"
    assert env["KUA_OPS_THREAD"] == "th-1"
    assert env["KUA_OPS_ACTOR"] == "t"
    assert len(env["KUA_OPS_SESSION"]) == 32  # token éphémère
    assert Path(srv["args"][0]).name == "kua_ops_mcp.py"
    # deux sessions ≠
    cfg2 = runtime.build_mcp_config("brain")
    assert cfg2["mcpServers"]["kua-ops"]["env"]["KUA_OPS_SESSION"] != env["KUA_OPS_SESSION"]
    assert "KUA_OPS_PROJECT" not in cfg2["mcpServers"]["kua-ops"]["env"]


def test_profile_tools_matrice():
    tools = runtime.profile_tools("thread_agent")
    assert "mcp__kua-ops__redo_run" in tools
    assert "mcp__kua-ops__restart_service" not in tools
    assert all(t.startswith("mcp__kua-ops__") for t in tools)
    assert "mcp__kua-ops__mcp_add" in runtime.profile_tools("mcp_wizard")


def test_llm_enabled_flag(monkeypatch):
    monkeypatch.delenv("KUA_AGENT_LLM", raising=False)
    assert runtime.llm_enabled() is False  # opt-in
    monkeypatch.setenv("KUA_AGENT_LLM", "1")
    assert runtime.llm_enabled() is True


@pytest.fixture()
def fake_ctx(monkeypatch):
    monkeypatch.setattr(ops, "get_thread_context", lambda tid, message_limit=8: {
        "thread": {"project_id": "proj-x", "subject": "Readme", "facade": "discord", "status": "awaiting_approval"},
        "messages": [],
        "runs": [{"id": "run-1", "status": "awaiting_approval", "pr_url": "https://github.com/x/y/pull/9"}],
    })


def _fake_claude(tmp_path: Path, payload: str, rc: int = 0) -> str:
    script = tmp_path / "claude"
    script.write_text(f"#!/bin/sh\necho '{payload}'\nexit {rc}\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return str(script)


def test_run_thread_agent_ok(monkeypatch, tmp_path, fake_ctx):
    payload = json.dumps({"result": "Compris — je relance avec ta nuance."})
    monkeypatch.setenv("KUA_CLAUDE_BIN", _fake_claude(tmp_path, payload))
    res = runtime.run_thread_agent("th-1", "remplace par X")
    assert "relance" in res["reply"]


def test_run_thread_agent_echec_leve(monkeypatch, tmp_path, fake_ctx):
    monkeypatch.setenv("KUA_CLAUDE_BIN", _fake_claude(tmp_path, "boom", rc=3))
    with pytest.raises(RuntimeError):
        runtime.run_thread_agent("th-1", "x")


def test_worker_fallback_phase1_quand_llm_echoue(monkeypatch):
    from runner import worker

    posted: list[tuple] = []
    monkeypatch.setattr(runtime, "llm_enabled", lambda: True)
    monkeypatch.setattr(runtime, "run_thread_agent", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("kaput")))
    monkeypatch.setattr(worker.db, "post_message", lambda tid, role, text, **k: posted.append((role, text)))
    res = worker.handle_thread_message("th-1", "salut, où en est-on ?")
    # LLM kaput → Phase-1 répond honnêtement (reply), pas de crash.
    assert res["action"] == "reply"
    assert posted and posted[0][0] == "agent"


def test_worker_llm_reply_quand_ok(monkeypatch):
    from runner import worker

    posted: list[tuple] = []
    monkeypatch.setattr(runtime, "llm_enabled", lambda: True)
    monkeypatch.setattr(runtime, "run_thread_agent", lambda tid, msg: {"reply": "Fait : j'ai relancé v2."})
    monkeypatch.setattr(worker.db, "post_message", lambda tid, role, text, **k: posted.append((role, text)))
    res = worker.handle_thread_message("th-1", "remplace par X")
    assert res["action"] == "llm_reply"
    assert posted == [("agent", "Fait : j'ai relancé v2.")]


def test_pas_de_secret_dans_env_claude(monkeypatch):
    from kua_core.claude_cli import claude_env

    monkeypatch.setenv("GITHUB_TOKEN", "ghp_secret")
    monkeypatch.setenv("INTERNAL_TOKEN", "secret2")
    env = claude_env()
    assert "GITHUB_TOKEN" not in env and "INTERNAL_TOKEN" not in env
    assert "ANTHROPIC_API_KEY" not in env
    assert os.environ["HOME"] == env["HOME"]