"""Gestion de loop par chat — allowlist STRICTE de /internal/agent/act. DB réelle (loop de
test seedée + nettoyée). Le moteur live est en pause via conftest. Skip si DB injoignable."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from kua_core import db


def _db_reachable() -> bool:
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(not _db_reachable(), reason="DB injoignable — test sauté")


def _client(monkeypatch, *, token: str = "secret-internal") -> TestClient:
    monkeypatch.setenv("INTERNAL_TOKEN", token)
    monkeypatch.setenv("SUPABASE_URL", "http://localhost")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("SENTRY_WEBHOOK_SECRET", "s")
    config.get_settings.cache_clear()
    return TestClient(app)


_AUTH = {"Authorization": "Bearer secret-internal"}


@pytest.fixture
def loop():
    pid = f"kua-act-{uuid.uuid4().hex[:8]}"
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO projects (id, name, repo_url, workspace) VALUES (%s,'Act','-',true)", (pid,))
            cur.execute(
                "INSERT INTO loops (project_id, facade, enabled, autonomy, budget_usd) "
                "VALUES (%s,'general',true,'approve_final',5) RETURNING id",
                (pid,),
            )
            loop_id = str(cur.fetchone()[0])
    yield pid, loop_id
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM loops WHERE project_id=%s", (pid,))
            cur.execute("DELETE FROM projects WHERE id=%s", (pid,))
    config.get_settings.cache_clear()


@requires_db
def test_requires_bearer(monkeypatch, loop):
    client = _client(monkeypatch)
    _pid, lid = loop
    assert client.post("/internal/agent/act", json={"action": "pause_loop", "loop_id": lid}).status_code == 401


@requires_db
def test_action_hors_allowlist_refusee(monkeypatch, loop):
    client = _client(monkeypatch)
    _pid, lid = loop
    r = client.post("/internal/agent/act", json={"action": "delete_loop", "loop_id": lid}, headers=_AUTH)
    assert r.status_code == 400 and r.json()["status"] == "refused"
    # le loop n'a pas changé
    assert db.get_loop_by_id(lid)["enabled"] is True


@requires_db
def test_update_budget_applique(monkeypatch, loop):
    client = _client(monkeypatch)
    _pid, lid = loop
    r = client.post(
        "/internal/agent/act",
        json={"action": "update_loop", "loop_id": lid, "patch": {"budget_usd": 12}},
        headers=_AUTH,
    )
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert float(db.get_loop_by_id(lid)["budget_usd"]) == 12.0


@requires_db
def test_autonomy_auto_refusee(monkeypatch, loop):
    client = _client(monkeypatch)
    _pid, lid = loop
    r = client.post(
        "/internal/agent/act",
        json={"action": "update_loop", "loop_id": lid, "patch": {"autonomy": "auto"}},
        headers=_AUTH,
    )
    assert r.status_code == 400 and r.json()["status"] == "refused"
    # ★ allow_auto impossible par le chat : l'autonomie reste approve_final.
    assert db.get_loop_by_id(lid)["autonomy"] == "approve_final"


@requires_db
def test_pause_then_resume(monkeypatch, loop):
    client = _client(monkeypatch)
    _pid, lid = loop
    assert client.post("/internal/agent/act", json={"action": "pause_loop", "loop_id": lid}, headers=_AUTH).status_code == 200
    assert db.get_loop_by_id(lid)["enabled"] is False
    assert client.post("/internal/agent/act", json={"action": "resume_loop", "loop_id": lid}, headers=_AUTH).status_code == 200
    assert db.get_loop_by_id(lid)["enabled"] is True
