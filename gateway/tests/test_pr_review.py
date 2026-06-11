"""Revue de PR (M13) — assemblage du détail + troncature + endpoint. L'API GitHub est MOCKÉE
(github_api._request) et get_run_context est mocké → aucun appel réseau/DB réel."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import config, pr_review
from app.main import app


def _fake_github(pr_overrides=None, files=None):
    pr = {
        "title": "Test PR", "html_url": "https://github.com/Wrivard/kua-cobaye-test/pull/2",
        "state": "open", "draft": True, "merged": False, "additions": 2, "deletions": 0,
        "changed_files": 1, "commits": 1,
    }
    pr.update(pr_overrides or {})
    flist = files if files is not None else [
        {"filename": "README.md", "status": "modified", "additions": 2, "deletions": 0, "patch": "@@ -1 +1,2 @@\n+test"},
    ]

    def fake(method, path):
        if "/files" in path:
            return (200, flist)
        return (200, pr)

    return fake


# --- Unitaire -------------------------------------------------------------------

def test_parse_pr_url():
    assert pr_review.parse_pr_url("https://github.com/Wrivard/kua-cobaye-test/pull/2") == (
        "Wrivard", "kua-cobaye-test", 2
    )
    assert pr_review.parse_pr_url("local-bare:origin#kua/x") is None
    assert pr_review.parse_pr_url("") is None


def test_pr_detail_assemble(monkeypatch):
    monkeypatch.setattr(pr_review.github_api, "_request", _fake_github())
    d = pr_review.pr_detail("https://github.com/Wrivard/kua-cobaye-test/pull/2")
    assert d["pr"]["title"] == "Test PR" and d["pr"]["draft"] is True
    assert len(d["files"]) == 1 and d["files"][0]["filename"] == "README.md"
    assert d["truncated"] is False


def test_pr_detail_url_invalide(monkeypatch):
    monkeypatch.setattr(pr_review.github_api, "_request", _fake_github())
    d = pr_review.pr_detail("local-bare:origin#x")
    assert d["pr"] is None and d["files"] == []


def test_pr_detail_gros_diff_tronque(monkeypatch):
    huge = [{"filename": "big.txt", "status": "added", "additions": 9999, "deletions": 0, "patch": "x" * 13000}]
    monkeypatch.setattr(pr_review.github_api, "_request", _fake_github(files=huge))
    d = pr_review.pr_detail("https://github.com/Wrivard/kua-cobaye-test/pull/2")
    assert d["truncated"] is True
    assert len(d["files"][0]["patch"]) <= pr_review.FILE_PATCH_CAP + 40  # cap + marqueur


# --- Endpoint -------------------------------------------------------------------

def _client(monkeypatch, *, token: str = "secret-internal") -> TestClient:
    monkeypatch.setenv("INTERNAL_TOKEN", token)
    monkeypatch.setenv("SUPABASE_URL", "http://localhost")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("SENTRY_WEBHOOK_SECRET", "s")
    config.get_settings.cache_clear()
    return TestClient(app)


_AUTH = {"Authorization": "Bearer secret-internal"}


def test_endpoint_requires_bearer(monkeypatch):
    client = _client(monkeypatch)
    assert client.get("/internal/pr/run-1").status_code == 401
    config.get_settings.cache_clear()


def test_endpoint_run_not_found(monkeypatch):
    import kua_core.db as kdb

    monkeypatch.setattr(kdb, "get_run_context", lambda rid: None)
    client = _client(monkeypatch)
    assert client.get("/internal/pr/nope", headers=_AUTH).status_code == 404
    config.get_settings.cache_clear()


def test_endpoint_run_without_pr(monkeypatch):
    import kua_core.db as kdb

    monkeypatch.setattr(kdb, "get_run_context", lambda rid: {"run_status": "running", "pr_url": None, "cost_usd": None})
    client = _client(monkeypatch)
    r = client.get("/internal/pr/run-1", headers=_AUTH)
    assert r.status_code == 200 and r.json()["pr"] is None
    config.get_settings.cache_clear()


def test_endpoint_with_pr(monkeypatch):
    import kua_core.db as kdb

    monkeypatch.setattr(kdb, "get_run_context", lambda rid: {
        "run_status": "awaiting_approval", "pr_url": "https://github.com/Wrivard/kua-cobaye-test/pull/2",
        "cost_usd": "0.13", "summary": "ok", "verify_status": "skipped", "branch": "kua/x",
    })
    monkeypatch.setattr(pr_review.github_api, "_request", _fake_github())
    client = _client(monkeypatch)
    r = client.get("/internal/pr/run-1", headers=_AUTH)
    body = r.json()
    assert r.status_code == 200 and body["status"] == "ok"
    assert body["run"]["cost_usd"] == "0.13" and body["run"]["verify_status"] == "skipped"
    assert body["pr"]["draft"] is True and len(body["files"]) == 1
    config.get_settings.cache_clear()
