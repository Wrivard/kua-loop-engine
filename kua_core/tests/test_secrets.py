"""Tests des secrets de connecteurs (/srv/kua/secrets/). Pur — dossier temp via env."""

from __future__ import annotations

import stat


def test_roundtrip_perms_and_merge(tmp_path, monkeypatch):
    monkeypatch.setenv("KUA_SECRETS_DIR", str(tmp_path))
    from kua_core import secrets

    ref = secrets.set_secret("app", "github", None, {"token": "ghp_x"})
    assert ref == "app.env"
    assert secrets.read_secret("app", "github", None, ["token"]) == {"token": "ghp_x"}

    # chmod 600 sur le fichier de secrets
    mode = stat.S_IMODE((tmp_path / "app.env").stat().st_mode)
    assert mode == 0o600

    # un autre type dans le même fichier ne clobbe pas le premier
    secrets.set_secret("app", "cloudflare", None, {"api_token": "cf_y"})
    assert secrets.read_secret("app", "github", None, ["token"]) == {"token": "ghp_x"}
    assert secrets.read_secret("app", "cloudflare", None, ["api_token"]) == {"api_token": "cf_y"}


def test_project_scope_separate_file(tmp_path, monkeypatch):
    monkeypatch.setenv("KUA_SECRETS_DIR", str(tmp_path))
    from kua_core import secrets

    ref = secrets.set_secret("project", "sentry", "salon", {"auth_token": "st"})
    assert ref == "project/salon.env"
    assert (tmp_path / "project" / "salon.env").exists()
    assert secrets.read_secret("project", "sentry", "salon", ["auth_token"]) == {"auth_token": "st"}
    # le secret projet n'est PAS dans app.env
    assert secrets.read_secret("app", "sentry", None, ["auth_token"]) == {}
