"""Tests du registre de connecteurs (pur, sans réseau)."""

from __future__ import annotations

from kua_core import connectors


def test_defaults_shareable():
    # Défauts verrouillés : github partageable, le reste per_project.
    assert connectors.get_type("github").shareable is True
    for t in ("sentry", "cloudflare", "supabase", "discord"):
        assert connectors.get_type(t).shareable is False


def test_kinds():
    assert connectors.get_type("github").kind == "api"
    assert connectors.get_type("mcp").kind == "mcp"


def test_secret_vs_config_fields():
    gh = connectors.get_type("github")
    assert gh.secret_fields == ["token"]
    sb = connectors.get_type("supabase")
    assert "service_role_key" in sb.secret_fields and "db_url" in sb.secret_fields
    assert "url" in sb.config_fields and "url" not in sb.secret_fields


def test_all_types_listed():
    types = {t.type for t in connectors.list_types()}
    assert {"github", "sentry", "cloudflare", "discord", "supabase", "mcp"} <= types


def test_unknown_type():
    assert connectors.get_type("nope") is None


def test_github_validator_rejects_missing_token():
    # Pas de réseau quand le secret manque.
    ok, detail = connectors.get_type("github").validate({}, {})
    assert ok is False and "token" in detail
