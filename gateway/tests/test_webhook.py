"""Webhook générique + Sentry (M18) — secret par source, parsing, proposition dans l'inbox.
Cerveau (_run_claude) et DB (create_proposal) MOCKÉS : aucun appel modèle/DB réel, aucun run."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app import agent_brain, config
from app.main import app


def _client(monkeypatch) -> TestClient:
    monkeypatch.setenv("SUPABASE_URL", "http://localhost")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("SENTRY_WEBHOOK_SECRET", "s")
    config.get_settings.cache_clear()
    return TestClient(app)


def _mock_brain(monkeypatch, action="create_thread"):
    monkeypatch.setattr(agent_brain, "_run_claude", lambda prompt, timeout=120: json.dumps({
        "action": action, "facade": "bugfix", "title": "t", "goal": "g", "budget_usd": 5,
        "priority": "normal", "questions_manquantes": [], "resume_humain": "ok",
    }))


def test_webhook_not_configured(monkeypatch):
    monkeypatch.delenv("WEBHOOK_SECRET_SENTRY", raising=False)
    client = _client(monkeypatch)
    r = client.post("/webhooks/sentry", json={})
    assert r.status_code == 503 and r.json()["status"] == "webhook_not_configured"
    config.get_settings.cache_clear()


def test_webhook_wrong_secret(monkeypatch):
    monkeypatch.setenv("WEBHOOK_SECRET_SENTRY", "wsec")
    client = _client(monkeypatch)
    assert client.post("/webhooks/sentry", json={}, headers={"X-Webhook-Secret": "bad"}).status_code == 401
    config.get_settings.cache_clear()


def test_webhook_sentry_creates_proposal(monkeypatch):
    monkeypatch.setenv("WEBHOOK_SECRET_SENTRY", "wsec")
    _mock_brain(monkeypatch)
    import kua_core.db as kdb
    calls = []
    monkeypatch.setattr(kdb, "create_proposal", lambda src, pid, payload: (calls.append((src, payload["facade"])) or "prop-1"))
    monkeypatch.setattr(kdb, "create_notification", lambda *a, **k: "n")
    client = _client(monkeypatch)
    r = client.post(
        "/webhooks/sentry",
        json={"data": {"event": {"title": "NullError", "level": "error", "culprit": "app.js"}}},
        headers={"X-Webhook-Secret": "wsec"},
    )
    assert r.status_code == 200 and r.json()["proposal_id"] == "prop-1"
    assert calls == [("sentry", "bugfix")]  # source=sentry, proposition bugfix
    config.get_settings.cache_clear()


def test_webhook_secret_via_query_token(monkeypatch):
    monkeypatch.setenv("WEBHOOK_SECRET_GENERIC", "gsec")
    _mock_brain(monkeypatch, action="none")
    client = _client(monkeypatch)
    r = client.post("/webhooks/generic?token=gsec", json={"hello": "world"})
    assert r.status_code == 200 and r.json()["proposal_id"] is None  # action none → pas d'inbox
    config.get_settings.cache_clear()
