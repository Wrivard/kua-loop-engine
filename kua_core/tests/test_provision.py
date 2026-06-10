"""Provision : create-repo enregistre un projet CHARGÉ (workspace=true) + une loop
armée (budget > 0, jamais auto). L'appel GitHub est mocké (aucun repo réel créé).
Skip si DB injoignable."""

from __future__ import annotations

import uuid

import pytest

from kua_core import db, provision


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


def test_slugify():
    assert provision.slugify("Kua Cobaye Test") == "kua-cobaye-test"
    assert provision.slugify("  Éàü !! Mix__42 ") == "mix-42"
    assert provision.slugify("---") == "projet"


def test_budget_and_autonomy_guards(monkeypatch):
    monkeypatch.setattr(provision.github_api, "create_user_repo", lambda *a, **k: {})
    with pytest.raises(ValueError):
        provision.provision_repo_project("x", budget_usd=0)
    with pytest.raises(ValueError):
        provision.provision_repo_project("x", autonomy="auto")


@requires_db
def test_provision_registers_loaded_project_and_loop(monkeypatch):
    slug = f"kua-prov-{uuid.uuid4().hex[:8]}"
    fake_repo = {
        "slug": slug,
        "full_name": f"Wrivard/{slug}",
        "repo_url": f"https://github.com/Wrivard/{slug}.git",
        "html_url": f"https://github.com/Wrivard/{slug}",
        "default_branch": "main",
        "private": True,
        "owner": "Wrivard",
    }
    monkeypatch.setattr(provision.github_api, "create_user_repo", lambda *a, **k: fake_repo)
    try:
        res = provision.provision_repo_project(slug, private=True, facade="general", budget_usd=5)
        assert res["slug"] == slug
        assert res["repo_url"] == fake_repo["repo_url"]
        assert res["workspace"] is True

        # ★ Projet enregistré ET chargé.
        proj = db.get_project(slug)
        assert proj is not None
        assert proj["workspace"] is True
        assert proj["is_engine"] is False
        assert proj["allow_auto"] is False
        assert proj["repo_url"] == fake_repo["repo_url"]

        # ★ Loop armée : facade general, approve_final, budget > 0.
        loop = db.get_loop(slug, "general")
        assert loop is not None
        assert loop["autonomy"] == "approve_final"
        assert float(loop["budget_usd"]) > 0
    finally:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM loops WHERE project_id=%s", (slug,))
                cur.execute("DELETE FROM projects WHERE id=%s", (slug,))
