"""Tests de kua_core.db.

- Unitaires (fake connexion) : garantie de la transaction unique + sémantique
  de dédup. Toujours exécutés (pas de DB).
- Intégration (EXPLAIN) : valide les SQL contre le schéma RÉEL sans rien muter.
  Sautés si SUPABASE_DB_URL est injoignable (placeholder) — passeront dès que le
  vrai mot de passe DB sera dans /srv/kua/.env.
"""

from __future__ import annotations

import types

import pytest

from kua_core import db


# --------------------------------------------------------------- fake conn ---

class FakeCursor:
    def __init__(self, results, fail_at=None):
        self._results = list(results)  # valeurs successives de fetchone()
        self.executed: list[tuple] = []
        self._fail_at = fail_at

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        idx = len(self.executed)
        self.executed.append((sql, params))
        if self._fail_at is not None and idx == self._fail_at:
            raise RuntimeError("échec SQL simulé")

    def fetchone(self):
        return self._results.pop(0) if self._results else None


class FakeConn:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor
        self.committed = 0
        self.rolledback = 0
        self.closed = 0

    def cursor(self, row_factory=None):
        return self._cursor

    def commit(self):
        self.committed += 1

    def rollback(self):
        self.rolledback += 1

    def close(self):
        self.closed += 1


def _patch(monkeypatch, conn: FakeConn) -> None:
    monkeypatch.setattr("psycopg.connect", lambda *a, **k: conn)
    monkeypatch.setattr(db, "get_settings", lambda: types.SimpleNamespace(supabase_db_url="fake"))


# ------------------------------------------------------------- unit: events ---

def test_insert_event_returns_id(monkeypatch):
    conn = FakeConn(FakeCursor(results=[("evt-1",)]))
    _patch(monkeypatch, conn)
    assert db.insert_event("sentry", "issue-42", {"a": 1}) == "evt-1"
    assert conn.committed == 1


def test_insert_event_dedup_returns_none(monkeypatch):
    # ON CONFLICT DO NOTHING → aucune ligne retournée → None.
    conn = FakeConn(FakeCursor(results=[]))
    _patch(monkeypatch, conn)
    assert db.insert_event("sentry", "issue-42", {"a": 1}) is None


# ---------------------------------------------- unit: transaction unique ---

def test_create_thread_with_run_is_one_transaction(monkeypatch):
    cur = FakeCursor(results=[("thread-1",), ("run-1",)])
    conn = FakeConn(cur)
    _patch(monkeypatch, conn)

    tid, rid = db.create_thread_with_run("proj", "loop", "bugfix", "Sujet", "evt", "goal")

    assert (tid, rid) == ("thread-1", "run-1")
    assert len(cur.executed) == 2          # thread + run sur la MÊME connexion
    assert conn.committed == 1             # un seul commit en sortie
    assert conn.rolledback == 0


def test_create_thread_with_run_rolls_back_on_failure(monkeypatch):
    # Le 2e INSERT (run) échoue → pas de commit, rollback, exception propagée.
    cur = FakeCursor(results=[("thread-1",)], fail_at=1)
    conn = FakeConn(cur)
    _patch(monkeypatch, conn)

    with pytest.raises(RuntimeError):
        db.create_thread_with_run("proj", "loop", "bugfix", "Sujet", "evt", "goal")

    assert conn.committed == 0
    assert conn.rolledback == 1


# ---------------------------------------------------- intégration (EXPLAIN) ---

def _db_reachable() -> bool:
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


DB_OK = _db_reachable()
requires_db = pytest.mark.skipif(
    not DB_OK, reason="SUPABASE_DB_URL injoignable (placeholder) — intégration sautée"
)

_ZERO_UUID = "00000000-0000-0000-0000-000000000000"


@requires_db
def test_sql_constants_are_valid_against_real_schema():
    """EXPLAIN (sans ANALYZE) planifie sans exécuter → valide colonnes/tables/types,
    aucune écriture. Détecte toute dérive entre le SQL et la migration 001."""
    from psycopg.types.json import Json

    plans = [
        (db.INSERT_EVENT_SQL, ("manual", "explain-probe", Json({}))),
        (db.GET_LOOP_SQL, ("proj", "bugfix")),
        (db.INSERT_THREAD_SQL, ("proj", _ZERO_UUID, "bugfix", "sujet", None)),
        (db.INSERT_RUN_SQL, (_ZERO_UUID, "goal")),
        (db.CLAIM_RUN_SQL, (list(db._ACTIVE_RUN_STATUSES),)),
        (db.GET_RUN_CONTEXT_SQL, (_ZERO_UUID,)),
        (db.POST_MESSAGE_SQL, (_ZERO_UUID, "system", None, "x", None)),
        (db.SET_THREAD_STATUS_SQL, ("open", "open", "open", _ZERO_UUID)),
        (db.RUNS_AWAITING_DECISION_SQL, None),
    ]
    with db.connect() as conn:
        for sql, params in plans:
            with conn.cursor() as cur:
                cur.execute("EXPLAIN " + sql, params)
                assert cur.fetchone() is not None
