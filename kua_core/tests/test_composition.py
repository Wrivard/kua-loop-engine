"""M5 — composition du contexte d'un run par projet.
PREUVE DE SÉCURITÉ : les creds APP (app.env) ne sont JAMAIS dans secret_refs."""

from __future__ import annotations

import uuid

import pytest

from kua_core import composition, db


# --------------------------------------------- unitaire (déterministe, sans DB) ---

def test_compose_never_includes_app_creds(monkeypatch):
    # Scénario piège : le projet HÉRITE github (shareable, app.env existe) ET a un
    # sentry 'own' (secret projet). app.env ne doit JAMAIS apparaître.
    monkeypatch.setattr(
        db, "get_project_mcp",
        lambda pid: [{"name": "sentry", "config": {"url": "https://x"}, "secret_ref": "project/p.env"}],
    )
    monkeypatch.setattr(
        db, "get_project_connectors",
        lambda pid: [
            {"type": "github", "mode": "inherit", "enabled": True},  # shareable → runner-level
            {"type": "sentry", "mode": "own", "enabled": True},
        ],
    )

    def fake_get_connection(scope, type_, project_id=None):
        if scope == "project" and type_ == "sentry":
            return {"secret_ref": "project/p.env"}
        if scope == "app" and type_ == "github":
            return {"secret_ref": "app.env"}  # existe mais NE DOIT PAS sortir
        return None

    monkeypatch.setattr(db, "get_connection", fake_get_connection)
    monkeypatch.setattr(db, "get_project_skills", lambda pid: [{"skill": "frontend-design"}])
    monkeypatch.setattr(db, "get_app_setting", lambda key: {"code-review": True})

    ctx = composition.compose_project_context("p")

    assert "app.env" not in ctx["secret_refs"]                       # ★ creds APP jamais inclus
    assert all(r.startswith("project/") for r in ctx["secret_refs"])  # ★ scope projet uniquement
    assert "project/p.env" in ctx["secret_refs"]
    assert "sentry" in ctx["mcp"]["mcpServers"]
    assert set(ctx["skills"]) == {"frontend-design", "code-review"}


def test_compose_empty_project(monkeypatch):
    monkeypatch.setattr(db, "get_project_mcp", lambda pid: [])
    monkeypatch.setattr(db, "get_project_connectors", lambda pid: [])
    monkeypatch.setattr(db, "get_project_skills", lambda pid: [])
    monkeypatch.setattr(db, "get_app_setting", lambda key: {})
    ctx = composition.compose_project_context("p")
    assert ctx == {"mcp": {"mcpServers": {}}, "skills": [], "secret_refs": []}


# ----------------------------------------------- intégration (vraie DB, skip-gated) ---

def _db_reachable() -> bool:
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _db_reachable(), reason="DB injoignable — intégration sautée")
def test_compose_roundtrip_excludes_app(monkeypatch, tmp_path):
    monkeypatch.setenv("KUA_SECRETS_DIR", str(tmp_path))
    pid = f"kua-comptest-{uuid.uuid4().hex[:8]}"
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO projects (id, name, repo_url) VALUES (%s, 'Comp test', '-')", (pid,))
        # connexion PROJET sentry (project/<id>.env) — DOIT sortir.
        # (On ne crée AUCUNE connexion app : l'inherit github n'ajoute aucun secret_ref,
        #  et on évite de toucher une éventuelle vraie connexion app github.)
        db.upsert_connection("project", "sentry", pid, "Sentry", {"org": "acme"}, f"project/{pid}.env", "ok")
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO project_connectors (project_id, type, enabled, mode) VALUES "
                    "(%s,'github',true,'inherit'), (%s,'sentry',true,'own')",
                    (pid, pid),
                )
                cur.execute(
                    "INSERT INTO project_mcp (project_id, name, enabled, config) VALUES (%s,'sentry',true,%s)",
                    (pid, '{"url":"https://mcp.sentry"}'),
                )
                cur.execute(
                    "INSERT INTO project_skills (project_id, skill, enabled) VALUES (%s,'code-review',true)",
                    (pid,),
                )

        ctx = composition.compose_project_context(pid)
        assert "app.env" not in ctx["secret_refs"]
        assert f"project/{pid}.env" in ctx["secret_refs"]
        assert "sentry" in ctx["mcp"]["mcpServers"]
        assert "code-review" in ctx["skills"]
    finally:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM project_connectors WHERE project_id=%s", (pid,))
                cur.execute("DELETE FROM project_mcp WHERE project_id=%s", (pid,))
                cur.execute("DELETE FROM project_skills WHERE project_id=%s", (pid,))
                cur.execute("DELETE FROM connections WHERE project_id=%s", (pid,))
                cur.execute("DELETE FROM projects WHERE id=%s", (pid,))
