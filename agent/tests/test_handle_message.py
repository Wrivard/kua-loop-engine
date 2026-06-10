"""Tests de l'agent de façade — Phase 1 minimal (doc 16). Pur, sans DB."""

from __future__ import annotations

import pytest

from agent.agent import Action, handle_message

THREAD = "th-test"


@pytest.mark.parametrize(
    "message, expected_extra_contains",
    [
        ("Refaire : renomme e en err", "renomme e en err"),
        ("refaire: recadre la photo du hero", "recadre la photo du hero"),
        ("REFAIRE — mets un texte générique", "mets un texte générique"),
        ("Refais le fix mais sans toucher au CSS", "le fix mais sans toucher au CSS"),
        ("Recommence en gardant les tests", "en gardant les tests"),
        ("redo: tighten the copy", "tighten the copy"),
    ],
)
def test_redo_intent_enqueues_run(message: str, expected_extra_contains: str) -> None:
    action = handle_message(THREAD, message)
    assert action.kind == "enqueue_run"
    assert action.scope == "redo"
    assert expected_extra_contains in (action.goal_extra or "")
    assert action.text is None


def test_bare_redo_gets_default_goal_extra() -> None:
    action = handle_message(THREAD, "Refaire")
    assert action.kind == "enqueue_run"
    assert action.goal_extra  # non vide (défaut sensé)


def test_non_redo_message_replies() -> None:
    action = handle_message(THREAD, "Pourquoi t'as fait ça comme ça ?")
    assert action.kind == "reply"
    assert action.text
    assert action.goal_extra is None


def test_empty_message_replies() -> None:
    action = handle_message(THREAD, "   ")
    assert action.kind == "reply"


def test_redo_substring_not_at_start_is_not_a_redo() -> None:
    # « refaire » au milieu d'une phrase ≠ commande de redo.
    action = handle_message(THREAD, "On devra refaire la page d'accueil un jour")
    assert action.kind == "reply"


def test_action_is_dataclass() -> None:
    assert isinstance(handle_message(THREAD, "Refaire : x"), Action)
