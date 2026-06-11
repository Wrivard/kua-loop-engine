"""kua-ops (doc 18) : lectures directes, mutations via les chemins atomiques existants
(approvals redo/reject), invariants (workspace requis, jamais auto, nuance requise).
Pattern test_provision : skip si DB injoignable ; fixtures nettoyées."""

from __future__ import annotations

import uuid

import pytest

from kua_core import db, ops


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


# ----------------------------------------------------------------- refus PURS (sans DB)


def test_redo_run_refuse_nuance_vide():
    with pytest.raises(ops.OpsError, match="nuance"):
        ops.redo_run("00000000-0000-0000-0000-000000000000", "   ")


def test_get_costs_refuse_mois_invalide():
    with pytest.raises(ops.OpsError, match="YYYY-MM"):
        ops.get_costs(month="juin-2026")


def test_create_thread_refuse_champs_vides():
    with pytest.raises(ops.OpsError, match="requis"):
        ops.create_thread("x", "general", "  ", "goal")


# --------------------------------------------------------------------- avec DB (seedée)


@pytest.fixture()
def seeded_project():
    """Projet chargé + loop + thread + run awaiting_approval. Nettoyé à la fin."""
    slug = f"kua-ops-{uuid.uuid4().hex[:8]}"
    db.register_project(slug, name=slug, repo_url=f"https://github.com/Wrivard/{slug}.git",
                        workspace=True)
    loop_id = db.ensure_loop(slug, "general", autonomy="approve_final", budget_usd=1.0)
    thread_id, run_id = db.create_thread_with_run(slug, str(loop_id), "general", "Test ops", None, "faire X")
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE runs SET status='awaiting_approval', cost_usd=0.25 WHERE id=%s", (run_id,))
    try:
        yield {"slug": slug, "loop_id": str(loop_id), "thread_id": thread_id, "run_id": run_id}
    finally:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM approvals WHERE run_id IN (SELECT id FROM runs WHERE thread_id=%s)",
                    (thread_id,),
                )
                cur.execute("DELETE FROM messages WHERE thread_id=%s", (thread_id,))
                cur.execute("DELETE FROM runs WHERE thread_id=%s", (thread_id,))
                cur.execute("DELETE FROM threads WHERE id=%s", (thread_id,))
                cur.execute("DELETE FROM loops WHERE project_id=%s", (slug,))
                cur.execute("DELETE FROM projects WHERE id=%s", (slug,))


@requires_db
def test_lectures_shape(seeded_project):
    s = seeded_project
    ctx = ops.get_thread_context(s["thread_id"])
    assert ctx["thread"]["subject"] == "Test ops"
    assert [r["id"] for r in ctx["runs"]] == [s["run_id"]]

    st = ops.get_run_status(s["run_id"])
    assert st["run_status"] == "awaiting_approval"
    assert st["project_id"] == s["slug"]
    # aucun secret dans la réponse
    assert not any("token" in k.lower() or "secret" in k.lower() for k in st)

    loops = ops.list_loops(s["slug"])
    assert len(loops) == 1 and loops[0]["facade"] == "general"
    assert ops.get_loop_config(s["loop_id"])["autonomy"] == "approve_final"
    assert any(p["id"] == s["slug"] for p in ops.list_projects())
    assert "paused" in ops.get_health()


@requires_db
def test_get_costs_agrege_le_mois(seeded_project):
    s = seeded_project
    costs = ops.get_costs(project_id=s["slug"])
    assert costs["total_usd"] == pytest.approx(0.25)
    assert costs["by_facade"] == {"general": pytest.approx(0.25)}
    assert costs["runs_by_status"] == {"awaiting_approval": 1}


@requires_db
def test_redo_run_insere_approval_redo(seeded_project):
    s = seeded_project
    res = ops.redo_run(s["run_id"], "remplace par CHANGELOG v2", actor="test-agent")
    assert res["status"] == "redo_queued"
    ap = db.latest_approval(s["run_id"])
    assert ap is not None and ap["decision"] == "redo"
    assert ap["decided_by"] == "test-agent"
    assert "CHANGELOG v2" in (ap["comment"] or "")


@requires_db
def test_redo_et_reject_refusent_hors_awaiting(seeded_project):
    s = seeded_project
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE runs SET status='running' WHERE id=%s", (s["run_id"],))
    with pytest.raises(ops.OpsError, match="pas à confirmer"):
        ops.redo_run(s["run_id"], "nuance")
    with pytest.raises(ops.OpsError, match="pas à confirmer"):
        ops.reject_run(s["run_id"])


@requires_db
def test_create_thread_exige_workspace(seeded_project):
    s = seeded_project
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE projects SET workspace=false WHERE id=%s", (s["slug"],))
    with pytest.raises(ops.OpsError, match="workspace"):
        ops.create_thread(s["slug"], "general", "Sujet", "Goal")


@requires_db
def test_create_thread_ok_et_loop_approve_final(seeded_project):
    s = seeded_project
    res = ops.create_thread(s["slug"], "bugfix", "Nouveau bug", "corrige Y", actor="t")
    assert res["thread_id"] and res["run_id"]
    assert db.get_loop(s["slug"], "bugfix")["autonomy"] == "approve_final"
    # nettoyage du thread supplémentaire
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM runs WHERE thread_id=%s", (res["thread_id"],))
            cur.execute("DELETE FROM threads WHERE id=%s", (res["thread_id"],))


@requires_db
def test_update_loop_ignore_auto_et_pause_resume(seeded_project):
    s = seeded_project
    ops.update_loop(s["loop_id"], autonomy="auto", budget_usd=3.5)
    loop = ops.get_loop_config(s["loop_id"])
    assert loop["autonomy"] == "approve_final"  # 'auto' silencieusement exclu (db layer)
    assert float(loop["budget_usd"]) == pytest.approx(3.5)

    assert ops.pause_loop(s["loop_id"])["enabled"] is False
    assert ops.get_loop_config(s["loop_id"])["enabled"] is False
    assert ops.resume_loop(s["loop_id"])["enabled"] is True


@requires_db
def test_cibles_inexistantes(seeded_project):
    missing = str(uuid.uuid4())
    with pytest.raises(ops.OpsError, match="introuvable"):
        ops.get_thread_context(missing)
    with pytest.raises(ops.OpsError, match="introuvable"):
        ops.get_run_status(missing)
    with pytest.raises(ops.OpsError, match="introuvable"):
        ops.get_loop_config(missing)
    with pytest.raises(ops.OpsError, match="introuvable"):
        ops.pause_loop(missing)