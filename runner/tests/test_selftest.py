"""Self-test end-to-end du Runner (bare local + vraie DB). Skip si DB injoignable."""

from __future__ import annotations

import pytest

from kua_core import db
from runner.selftest import run_selftest


def _db_reachable() -> bool:
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _db_reachable(), reason="SUPABASE_DB_URL injoignable — selftest intégration sauté")
def test_runner_end_to_end_bare_local():
    rep = run_selftest()
    assert rep["ok"] is True, rep
    assert rep["deliver"]["status"] == "awaiting_approval"
    assert rep["deliver"]["verify"] == "passed"
    assert rep["approval"] and rep["approval"][0]["status"] == "pushed"
