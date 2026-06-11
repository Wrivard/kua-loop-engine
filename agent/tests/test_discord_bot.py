"""Bot Discord — logique PURE (handle_message) avec Discord et cerveau MOCKÉS. Aucune
connexion réelle, aucun appel modèle, aucune création de run live (create_fn mocké)."""

from __future__ import annotations

import pytest

from agent import discord_bot as bot


def _config():
    return bot.DiscordConfig(channels={"chan1": "kua-cobaye-test"}, user_ids={"willID"})


def _proposal(action="create_thread", questions=None):
    return {
        "action": action, "facade": "discord", "loop_id": None, "title": "Test", "goal": "fais X",
        "budget_usd": 0.4, "priority": "normal", "questions_manquantes": questions or [],
        "resume_humain": "résumé",
    }


# --- Sécurité démarrage --------------------------------------------------------

def test_token_absent_refuse_demarrage(monkeypatch):
    monkeypatch.delenv("DISCORD_BOT_TOKEN", raising=False)
    with pytest.raises(bot.DiscordConfigError):
        bot.require_token()


def test_token_present_ok(monkeypatch):
    monkeypatch.setenv("DISCORD_BOT_TOKEN", "x")
    assert bot.require_token() == "x"


def test_format_notification():
    txt = bot.format_notification({"kind": "merged", "title": "Fusionné", "body": "dans main"})
    assert "✅" in txt and "Fusionné" in txt and "dans main" in txt
    assert bot.format_notification({"kind": "x", "title": "T"}) == "🔔 **T**"


def test_is_confirmation():
    for ok in ("approve", "GO", "oui", "✅", "  ok  "):
        assert bot.is_confirmation(ok)
    for no in ("approuve ce truc en plus", "non", "blabla", ""):
        assert not bot.is_confirmation(no)


# --- Logique handle_message ----------------------------------------------------

def test_channel_non_configure_ignore():
    pending: dict = {}
    reply, code = bot.handle_message(
        "salut", "AUTRE", "willID", _config(), pending,
        propose_fn=lambda *a: _proposal(), create_fn=lambda *a: ("t", "r"),
    )
    assert code == "ignored_channel" and reply is None


def test_message_declenche_proposition_et_pending():
    calls = []
    pending: dict = {}
    reply, code = bot.handle_message(
        "le formulaire plante", "chan1", "willID", _config(), pending,
        propose_fn=lambda msg, auth: (calls.append((msg, auth)) or _proposal()),
        create_fn=lambda *a: ("t", "r"),
    )
    assert code == "proposed"
    assert "approve" in reply.lower()
    assert pending["chan1"][1] == "kua-cobaye-test"  # projet résolu via le channel
    assert calls == [("le formulaire plante", "willID")]


def test_confirmation_par_user_allowliste_cree():
    created = []
    pending = {"chan1": (_proposal(), "kua-cobaye-test")}
    reply, code = bot.handle_message(
        "approve", "chan1", "willID", _config(), pending,
        propose_fn=lambda *a: _proposal(),
        create_fn=lambda p, pid: (created.append((p["title"], pid)) or ("thr-1", "run-1")),
    )
    assert code == "created"
    assert "thr-1" in reply
    assert created == [("Test", "kua-cobaye-test")]
    assert "chan1" not in pending  # pending vidé après création


def test_confirmation_par_user_non_allowliste_ignore():
    created = []
    pending = {"chan1": (_proposal(), "kua-cobaye-test")}
    reply, code = bot.handle_message(
        "approve", "chan1", "INTRUS", _config(), pending,
        propose_fn=lambda *a: _proposal(),
        create_fn=lambda p, pid: created.append(1),
    )
    assert code == "ignored_user"
    assert created == []  # ★ aucune création par un user non autorisé
    assert "chan1" in pending  # proposition toujours en attente


def test_confirmation_sans_pending():
    reply, code = bot.handle_message(
        "approve", "chan1", "willID", _config(), {},
        propose_fn=lambda *a: _proposal(), create_fn=lambda *a: ("t", "r"),
    )
    assert code == "nothing_pending"


def test_proposition_avec_questions_pas_de_pending():
    pending: dict = {}
    reply, code = bot.handle_message(
        "fais un truc", "chan1", "willID", _config(), pending,
        propose_fn=lambda *a: _proposal(questions=["Quel projet ?"]),
        create_fn=lambda *a: ("t", "r"),
    )
    assert code == "proposed_no_action"
    assert "chan1" not in pending  # pas de carte exécutable tant qu'il manque des infos


def test_action_none_pas_de_pending():
    pending: dict = {}
    _reply, code = bot.handle_message(
        "ça va ?", "chan1", "willID", _config(), pending,
        propose_fn=lambda *a: _proposal(action="none"),
        create_fn=lambda *a: ("t", "r"),
    )
    assert code == "proposed_no_action"
    assert "chan1" not in pending
