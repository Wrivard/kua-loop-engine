"""/health enrichi : forme JSON (status, version, uptime, paused, services). Le détail
up/down de db/worker dépend de l'environnement ; on vérifie la FORME + gateway up."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import config
from app.main import app


def _client(monkeypatch) -> TestClient:
    monkeypatch.setenv("SUPABASE_URL", "http://localhost")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("SENTRY_WEBHOOK_SECRET", "s")
    config.get_settings.cache_clear()
    return TestClient(app)


def test_health_shape(monkeypatch):
    client = _client(monkeypatch)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == "0.1.0-s4"
    assert isinstance(body["uptime_seconds"], (int, float))
    assert "paused" in body
    assert body["status"] in ("ok", "degraded")
    svc = body["services"]
    for key in ("gateway", "db", "worker", "mcp_bridge"):
        assert key in svc and "up" in svc[key]
    assert svc["gateway"]["up"] is True
    config.get_settings.cache_clear()
