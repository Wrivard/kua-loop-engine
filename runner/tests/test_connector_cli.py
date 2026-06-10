"""M3 — `kua connector set` : le secret va sur le VPS, la DB ne stocke QUE la config
non-secrète + le secret_ref. Skip si DB injoignable. Type 'mcp' = pas de réseau."""

from __future__ import annotations

import pytest

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


@requires_db
def test_connector_set_keeps_secret_out_of_db(tmp_path, monkeypatch):
    monkeypatch.setenv("KUA_SECRETS_DIR", str(tmp_path))
    from kua_core import secrets
    from runner.cli import main

    rc = main(
        ["connector", "set", "--scope", "app", "--type", "mcp",
         "--set", "url=https://mcp.example", "--set", "token=supersecret"]
    )
    assert rc == 0
    conn = db.get_connection("app", "mcp", None)
    assert conn is not None
    try:
        cfg = conn.get("config") or {}
        assert cfg.get("url") == "https://mcp.example"   # config non-secrète en DB
        assert "token" not in cfg                         # SECRET jamais en DB
        # le secret est bien sur le « VPS » (dossier temp ici)
        assert secrets.read_secret("app", "mcp", None, ["token"]) == {"token": "supersecret"}
        assert conn.get("secret_ref") == "app.env"
    finally:
        with db.connect() as c:
            with c.cursor() as cur:
                cur.execute("DELETE FROM connections WHERE id=%s", (conn["id"],))
