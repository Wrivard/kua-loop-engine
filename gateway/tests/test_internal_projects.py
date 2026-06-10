"""Route interne POST /internal/projects (futur bouton UI create-repo).
Auth = bearer INTERNAL_TOKEN. La provision elle-même est mockée (aucun repo réel)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app


def _client(monkeypatch, *, token: str | None) -> TestClient:
    # "" présent dans os.environ → load_dotenv(override=False) ne le réécrit pas (= désactivé).
    monkeypatch.setenv("INTERNAL_TOKEN", token if token is not None else "")
    # Les vars requises par get_settings doivent exister pour construire Settings.
    monkeypatch.setenv("SUPABASE_URL", "http://localhost")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("SENTRY_WEBHOOK_SECRET", "s")
    config.get_settings.cache_clear()
    return TestClient(app)


def test_disabled_without_token(monkeypatch):
    client = _client(monkeypatch, token=None)
    r = client.post("/internal/projects", json={"name": "x"})
    assert r.status_code == 503
    config.get_settings.cache_clear()


def test_unauthorized_with_wrong_bearer(monkeypatch):
    client = _client(monkeypatch, token="secret-internal")
    r = client.post("/internal/projects", json={"name": "x"}, headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401
    config.get_settings.cache_clear()


def test_authorized_calls_provision(monkeypatch):
    client = _client(monkeypatch, token="secret-internal")
    import kua_core.provision as provision

    monkeypatch.setattr(
        provision,
        "provision_repo_project",
        lambda name, **k: {
            "slug": "demo", "name": name, "repo_url": "https://github.com/Wrivard/demo.git",
            "html_url": "https://github.com/Wrivard/demo", "full_name": "Wrivard/demo",
            "private": True, "default_branch": "main", "facade": "general",
            "autonomy": "approve_final", "budget_usd": 5.0, "loop_id": "lid", "workspace": True,
        },
    )
    r = client.post(
        "/internal/projects",
        json={"name": "Demo", "private": True},
        headers={"Authorization": "Bearer secret-internal"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "created"
    assert body["slug"] == "demo"
    assert body["workspace"] is True
    config.get_settings.cache_clear()
