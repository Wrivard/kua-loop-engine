"""Bridge MCP — allowlist STRICTE + auth + WS. Sécurité non-négociable (Partie C)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import bridge_auth, config, mcp_bridge
from app.main import app


# ----------------------------------------------------------- allowlist core ---

def test_claude_mcp_list_runs():
    # (a) une commande de l'allowlist s'exécute (claude présent sur le VPS).
    res = mcp_bridge.run_command_capture("claude mcp list", timeout=60)
    assert res["argv"][:3] == ["claude", "mcp", "list"]
    assert res["exit_code"] == 0


@pytest.mark.parametrize("cmd", ["claude mcp add foo", "claude mcp get x", "kua connector list", "kua connector test --type github"])
def test_allowed_commands(cmd):
    argv = mcp_bridge.parse_and_check(cmd)
    assert argv[0] in ("claude", "kua")


@pytest.mark.parametrize(
    "cmd",
    ["rm -rf /", "curl http://evil", "claude --version", "claude chat", "kua run --project x",
     "claude mcp nuke", "", "git push", "bash -c 'x'"],
)
def test_refused_commands(cmd):
    # (b) tout ce qui est hors allowlist est REFUSÉ avant exécution.
    with pytest.raises(mcp_bridge.CommandRefused):
        mcp_bridge.parse_and_check(cmd)


# --------------------------------------------------------------- token auth ---

def test_token_roundtrip():
    t = bridge_auth.mint("s3cret", "alice", 300)
    assert bridge_auth.verify("s3cret", t) == "alice"


def test_token_bad_secret_or_tampered():
    t = bridge_auth.mint("s3cret", "alice", 300)
    assert bridge_auth.verify("autre", t) is None
    assert bridge_auth.verify("s3cret", t[:-2] + "xx") is None


def test_token_expired():
    t = bridge_auth.mint("s3cret", "alice", -1)
    assert bridge_auth.verify("s3cret", t) is None


# --------------------------------------------------------------- guidage ---

def test_suggest_mcp_parses_advisory(monkeypatch):
    from app import mcp_guide

    class FakeProc:
        stdout = '{"result":"1. claude mcp add linear --transport http https://mcp.linear.app/sse"}'
        stderr = ""

    monkeypatch.setattr(mcp_guide.subprocess, "run", lambda *a, **k: FakeProc())
    out = mcp_guide.suggest_mcp("je veux installer Linear")
    assert "claude mcp add" in out


# ------------------------------------------------------------------ WS auth ---

def _client(monkeypatch) -> TestClient:
    monkeypatch.setenv("BRIDGE_SECRET", "test-bridge-secret")
    config.get_settings.cache_clear()
    return TestClient(app)


def test_ws_rejects_unauthenticated(monkeypatch):
    client = _client(monkeypatch)
    with client.websocket_connect("/mcp-bridge") as ws:
        ws.send_json({"token": "nope"})
        assert ws.receive_json()["type"] == "error"


def test_ws_refuses_disallowed_after_auth(monkeypatch):
    client = _client(monkeypatch)
    token = bridge_auth.mint("test-bridge-secret", "tester")
    with client.websocket_connect("/mcp-bridge") as ws:
        ws.send_json({"token": token})
        assert ws.receive_json()["type"] == "ready"
        ws.send_json({"type": "run", "command": "rm -rf /"})
        assert ws.receive_json()["type"] == "refused"
