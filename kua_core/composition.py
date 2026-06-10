"""Composition du contexte d'un run, PAR PROJET (préparation — ne touche PAS au spawn).

Retourne ce qu'un `claude -p` de ce projet doit recevoir :
  - mcp        : le .mcp.json composé (serveurs MCP activés du projet).
  - skills     : skills activés (globaux ∪ projet).
  - secret_refs: fichiers de secrets à charger — PROJET UNIQUEMENT (project/<id>.env),
                 JAMAIS app.env (frontière de sécurité, doc 13).

FRONTIÈRE DE SÉCURITÉ. Un connecteur `shareable` en mode `inherit` (ex. GitHub) est
utilisé par le RUNNER hors du run (push de branche, PR) avec le credential APP —
il n'est JAMAIS injecté dans l'environnement du `claude -p`. La composition ne
renvoie donc QUE des secret_refs de scope projet. Le branchement réel dans le spawn
= prochaine loop (ce module est isolé + testé).
"""

from __future__ import annotations

from typing import Any

from kua_core import db, secrets


def compose_project_context(project_id: str) -> dict[str, Any]:
    mcp_servers: dict[str, Any] = {}
    project_refs: set[str] = set()

    # Serveurs MCP du projet (config non-secrète ; secret éventuel = ref projet).
    for m in db.get_project_mcp(project_id):
        mcp_servers[m["name"]] = m.get("config") or {}
        if m.get("secret_ref"):
            project_refs.add(m["secret_ref"])

    # Connecteurs : `own` → secret PROJET ; `inherit` (shareable) → utilisé par le
    # Runner hors du run, JAMAIS injecté ici (donc aucun secret_ref ajouté).
    for pc in db.get_project_connectors(project_id):
        if pc.get("mode") == "own":
            conn = db.get_connection("project", pc["type"], project_id)
            ref = (conn or {}).get("secret_ref") or secrets.secret_ref("project", project_id)
            project_refs.add(ref)

    # Skills : globaux activés ∪ activés sur le projet.
    global_skills = {k for k, v in (db.get_app_setting("skills") or {}).items() if v}
    project_skills = {s["skill"] for s in db.get_project_skills(project_id)}
    skills = sorted(global_skills | project_skills)

    # GARDE-FOU : on ne garde QUE des refs de scope projet. `app.env` (creds APP)
    # ne peut jamais sortir d'ici, quelle que soit la donnée en base.
    secret_refs = sorted(r for r in project_refs if r.startswith("project/"))

    return {
        "mcp": {"mcpServers": mcp_servers},
        "skills": skills,
        "secret_refs": secret_refs,
    }
