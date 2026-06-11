"""Cerveau Küa : parsing/validation de l'AgentProposal + endpoint. `_run_claude` (l'unique
point d'appel modèle) est MOCKÉ → aucun appel claude réel, déterministe."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import agent_brain, config
from app.main import app


def _mock_run(monkeypatch, returns):
    """Remplace l'appel modèle par une fonction qui renvoie `returns` (str) ou route par mot-clé (callable)."""
    fn = returns if callable(returns) else (lambda prompt, timeout=120: returns)
    monkeypatch.setattr(agent_brain, "_run_claude", fn)


# --- Parsing / validation -----------------------------------------------------

def test_parse_valid_bugfix(monkeypatch):
    _mock_run(monkeypatch, json.dumps({
        "action": "create_thread", "facade": "bugfix", "loop_id": None,
        "title": "Bug formulaire Alliance", "goal": "Corriger le formulaire de contact qui plante…",
        "budget_usd": 5, "priority": "high", "questions_manquantes": [], "resume_humain": "Bug à corriger.",
    }))
    p = agent_brain.propose("le formulaire d'Alliance plante")
    assert p["action"] == "create_thread"
    assert p["facade"] == "bugfix"
    assert p["budget_usd"] == 5.0
    assert p["priority"] == "high"


def test_triage_by_case_type(monkeypatch):
    # Mock « intelligent » : route par mot-clé pour exercer le câblage (le vrai triage = le modèle).
    def router(prompt, timeout=120):
        # Ne router que sur le MESSAGE (le system prompt contient déjà « bug », « démo »…).
        p = prompt.split("MESSAGE DE L'OPÉRATEUR")[-1].lower()
        if "bug" in p or "plante" in p:
            fac, act = "bugfix", "create_thread"
        elif "démo" in p or "demo" in p or "prospect" in p:
            fac, act = "demo", "create_loop"
        elif "ajoute" in p or "modif" in p:
            fac, act = "discord", "create_thread"
        else:
            fac, act = "general", "none"
        return json.dumps({"action": act, "facade": fac, "title": "x", "goal": "g", "budget_usd": 5,
                           "priority": "normal", "questions_manquantes": [], "resume_humain": "r"})

    _mock_run(monkeypatch, router)
    assert agent_brain.propose("un bug sur le site client")["facade"] == "bugfix"
    assert agent_brain.propose("fais une démo pour un prospect")["facade"] == "demo"
    assert agent_brain.propose("ajoute une section tarifs")["facade"] == "discord"
    assert agent_brain.propose("salut ça va")["action"] == "none"


def test_invalid_json_raises(monkeypatch):
    _mock_run(monkeypatch, "désolé je ne peux pas répondre en JSON {{{ pas valide")
    with pytest.raises(agent_brain.BrainError):
        agent_brain.propose("x")


def test_json_in_code_fence_extracted(monkeypatch):
    _mock_run(monkeypatch, '```json\n{"action":"none","resume_humain":"ok"}\n```')
    assert agent_brain.propose("x")["action"] == "none"


def test_out_of_allowlist_action_coerced_to_none(monkeypatch):
    _mock_run(monkeypatch, json.dumps({"action": "delete_everything", "facade": "bugfix"}))
    assert agent_brain.propose("x")["action"] == "none"  # jamais une action inventée hors liste


def test_unknown_facade_and_bad_budget_coerced(monkeypatch):
    _mock_run(monkeypatch, json.dumps({"action": "create_thread", "facade": "hacking", "budget_usd": -9}))
    p = agent_brain.propose("x")
    assert p["facade"] == "general"
    assert p["budget_usd"] == 5.0  # budget invalide/négatif → défaut sûr


def test_questions_manquantes_passthrough(monkeypatch):
    _mock_run(monkeypatch, json.dumps({
        "action": "create_loop", "facade": "demo",
        "questions_manquantes": ["Quel projet ?", "Quel budget par run ?"], "resume_humain": "infos manquantes",
    }))
    p = agent_brain.propose("nouveau loop")
    assert p["questions_manquantes"] == ["Quel projet ?", "Quel budget par run ?"]


# --- Endpoint -----------------------------------------------------------------

def _client(monkeypatch, *, token: str = "secret-internal") -> TestClient:
    monkeypatch.setenv("INTERNAL_TOKEN", token)
    monkeypatch.setenv("SUPABASE_URL", "http://localhost")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("SENTRY_WEBHOOK_SECRET", "s")
    config.get_settings.cache_clear()
    return TestClient(app)


_AUTH = {"Authorization": "Bearer secret-internal"}


def test_endpoint_requires_bearer(monkeypatch):
    client = _client(monkeypatch)
    assert client.post("/internal/agent/propose", json={"message": "x"}).status_code == 401
    config.get_settings.cache_clear()


def test_endpoint_missing_message(monkeypatch):
    client = _client(monkeypatch)
    assert client.post("/internal/agent/propose", json={}, headers=_AUTH).status_code == 400
    config.get_settings.cache_clear()


def test_endpoint_happy_path(monkeypatch):
    _mock_run(monkeypatch, json.dumps({"action": "create_thread", "facade": "bugfix", "title": "t",
                                       "goal": "g", "budget_usd": 5, "priority": "normal",
                                       "questions_manquantes": [], "resume_humain": "ok"}))
    client = _client(monkeypatch)
    r = client.post("/internal/agent/propose", json={"message": "un bug", "source": "ui"}, headers=_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["proposal"]["facade"] == "bugfix"
    config.get_settings.cache_clear()
