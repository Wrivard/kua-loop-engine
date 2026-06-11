"""Scheduler cron (M17) — PROPOSE-ONLY. Temps et DB MOCKÉS : aucune création de run/thread,
seulement des propositions dans l'inbox. Le FakeDB n'a PAS de create_thread → impossible de
faire un run direct par construction."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from runner import scheduler


def _now() -> datetime:
    return datetime(2026, 6, 11, 10, 0, tzinfo=timezone.utc)


class FakeDB:
    def __init__(self, loops):
        self._loops = loops
        self.proposals: list = []
        self.notifs: list = []
        self.fired: list = []

    def loops_with_schedule(self):
        return self._loops

    def create_proposal(self, source, project_id, payload):
        self.proposals.append((source, project_id, payload))
        return "prop-1"

    def create_notification(self, kind, title, body=None, link=None):
        self.notifs.append(kind)
        return "notif-1"

    def set_loop_cron_fired(self, loop_id, iso):
        self.fired.append((loop_id, iso))


def test_is_due():
    now = _now()
    assert scheduler.is_due("0 9 * * *", now - timedelta(days=1), now) is True   # 9h d'aujourd'hui passé
    assert scheduler.is_due("0 9 * * *", now.replace(hour=9, minute=30), now) is False  # déjà tiré après 9h
    assert scheduler.is_due("cron invalide", now - timedelta(days=1), now) is False


def test_tick_cree_proposition_jamais_de_run():
    loop = {
        "id": "L1", "project_id": "proj", "facade": "seo", "budget_usd": 3,
        "schedule_cron": "0 9 * * *", "config": {"last_cron_fired": (_now() - timedelta(days=1)).isoformat()},
    }
    fdb = FakeDB([loop])
    fired = scheduler.tick(_now(), db_module=fdb)
    assert fired == ["L1"]
    assert len(fdb.proposals) == 1
    source, pid, payload = fdb.proposals[0]
    assert source == "cron" and pid == "proj"
    assert payload["action"] == "create_thread" and payload["facade"] == "seo"  # PROPOSITION, pas un run
    assert fdb.notifs == ["proposal"]
    assert fdb.fired[-1][0] == "L1"  # last_cron_fired mis à jour


def test_tick_initialise_sans_tirer():
    loop = {"id": "L2", "project_id": "p", "facade": "seo", "budget_usd": 3, "schedule_cron": "0 9 * * *", "config": {}}
    fdb = FakeDB([loop])
    fired = scheduler.tick(_now(), db_module=fdb)
    assert fired == [] and fdb.proposals == []
    assert fdb.fired == [("L2", _now().isoformat())]  # juste initialisé


def test_tick_pas_due_ne_tire_pas():
    loop = {
        "id": "L3", "project_id": "p", "facade": "seo", "budget_usd": 3,
        "schedule_cron": "0 9 * * *", "config": {"last_cron_fired": _now().replace(hour=9, minute=30).isoformat()},
    }
    fdb = FakeDB([loop])
    assert scheduler.tick(_now(), db_module=fdb) == []
    assert fdb.proposals == []
