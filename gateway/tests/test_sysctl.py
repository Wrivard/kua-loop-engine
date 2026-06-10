"""Contrôle système : allowlist STRICTE (services/actions/deps), construction d'argv
(jamais shell=True), auth des endpoints, parsing d'action de l'assistant. subprocess est
MOCKÉ → aucun vrai systemctl/journalctl/pip n'est lancé."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import config, debug_advisor, sysctl
from app.main import app


class _FakeProc:
    def __init__(self, returncode=0, stdout="ok", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


@pytest.fixture
def captured(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(argv, **kw):
        calls.append(list(argv))
        return _FakeProc()

    monkeypatch.setattr(sysctl.subprocess, "run", fake_run)
    return calls


# --- Allowlist + argv -------------------------------------------------------------

def test_systemctl_builds_exact_argv(captured):
    res = sysctl.systemctl("restart", "kua-worker")
    assert captured[0] == ["sudo", "-n", "systemctl", "restart", "kua-worker"]
    assert res["exit_code"] == 0


def test_systemctl_refuses_bad_action(captured):
    with pytest.raises(sysctl.ControlRefused):
        sysctl.systemctl("rm", "kua-worker")
    assert captured == []  # rien exécuté


def test_systemctl_refuses_bad_service(captured):
    with pytest.raises(sysctl.ControlRefused):
        sysctl.systemctl("restart", "sshd")
    assert captured == []


def test_journal_clamps_lines_and_validates(captured):
    sysctl.journal("kua-gateway", 99999)
    assert captured[0] == ["journalctl", "-u", "kua-gateway", "-n", "1000", "--no-pager", "-o", "short-iso"]
    captured.clear()
    sysctl.journal("kua-gateway", -5)
    assert captured[0][4] == "1"  # borné à >= 1
    with pytest.raises(sysctl.ControlRefused):
        sysctl.journal("evil-service", 10)


def test_reinstall_only_pinned(captured):
    sysctl.reinstall_dep("psycopg")
    assert captured[0] == [sysctl._VENV_PIP, "install", "--force-reinstall", "psycopg[binary]==3.3.4"]
    with pytest.raises(sysctl.ControlRefused):
        sysctl.reinstall_dep("requests")


def test_self_affecting():
    assert sysctl.self_affecting("kua-gateway", "restart") is True
    assert sysctl.self_affecting("kua-gateway", "stop") is True
    assert sysctl.self_affecting("kua-gateway", "status") is False
    assert sysctl.self_affecting("kua-worker", "restart") is False


# --- Parsing d'action (le modèle ne peut rien forcer hors allowlist) ---------------

def test_parse_action_allowlist():
    assert debug_advisor.parse_action("…\nACTION: restart_service kua-worker") == {
        "type": "restart_service", "service": "kua-worker"
    }
    assert debug_advisor.parse_action("ACTION: reinstall_dep psycopg") == {
        "type": "reinstall_dep", "key": "psycopg"
    }
    assert debug_advisor.parse_action("ACTION: restart_service sshd") is None
    assert debug_advisor.parse_action("ACTION: reinstall_dep requests") is None
    assert debug_advisor.parse_action("ACTION: none") is None
    assert debug_advisor.parse_action("rien d'actionnable") is None


# --- Endpoints (auth + dispatch + refus) -------------------------------------------

def _client(monkeypatch, *, token: str = "secret-internal") -> TestClient:
    monkeypatch.setenv("INTERNAL_TOKEN", token)
    monkeypatch.setenv("SUPABASE_URL", "http://localhost")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("SENTRY_WEBHOOK_SECRET", "s")
    config.get_settings.cache_clear()
    return TestClient(app)


_AUTH = {"Authorization": "Bearer secret-internal"}


def test_control_requires_auth(monkeypatch, captured):
    client = _client(monkeypatch)
    assert client.post("/internal/control", json={"service": "kua-worker", "action": "restart"}).status_code == 401
    assert client.post("/internal/control", json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401
    config.get_settings.cache_clear()


def test_control_disabled_without_token(monkeypatch, captured):
    client = _client(monkeypatch, token="")
    assert client.post("/internal/control", json={}, headers=_AUTH).status_code == 503
    config.get_settings.cache_clear()


def test_control_dispatch_and_refuse(monkeypatch, captured):
    client = _client(monkeypatch)
    ok = client.post("/internal/control", json={"service": "kua-worker", "action": "restart"}, headers=_AUTH)
    assert ok.status_code == 200 and ok.json()["status"] == "done"
    assert captured[-1] == ["sudo", "-n", "systemctl", "restart", "kua-worker"]
    # service hors allowlist → 400 refused, rien exécuté de plus
    before = len(captured)
    bad = client.post("/internal/control", json={"service": "sshd", "action": "restart"}, headers=_AUTH)
    assert bad.status_code == 400 and bad.json()["status"] == "refused"
    assert len(captured) == before
    config.get_settings.cache_clear()


def test_gateway_self_restart_is_scheduled(monkeypatch, captured):
    client = _client(monkeypatch)
    r = client.post("/internal/control", json={"service": "kua-gateway", "action": "restart"}, headers=_AUTH)
    assert r.status_code == 200 and r.json()["status"] == "scheduled"
    config.get_settings.cache_clear()


def test_logs_validates_service(monkeypatch, captured):
    client = _client(monkeypatch)
    ok = client.get("/internal/logs?service=kua-worker&lines=50", headers=_AUTH)
    assert ok.status_code == 200 and ok.json()["status"] == "ok"
    bad = client.get("/internal/logs?service=evil", headers=_AUTH)
    assert bad.status_code == 400
    config.get_settings.cache_clear()
