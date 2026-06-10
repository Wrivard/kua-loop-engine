"""Tests des helpers d'invocation claude -p (constats vérifiés au spike S3)."""

from __future__ import annotations

import json
from decimal import Decimal

from runner.runner import (
    COMMON_RULES,
    ClaudeResult,
    build_claude_command,
    load_goal_template,
    parse_claude_result,
)

# Forme RÉELLE capturée le 2026-06-09 (Claude Code 2.1.170), tronquée.
_REAL_OUTPUT = json.dumps(
    {
        "type": "result",
        "subtype": "success",
        "is_error": False,
        "duration_ms": 1446,
        "num_turns": 1,
        "result": "OK",
        "stop_reason": "end_turn",
        "session_id": "86fe0f65-40ab-427d-aa97-9ba2c7c01bed",
        "total_cost_usd": 0.02848355,
        "usage": {},
        "modelUsage": {},
        "permission_denials": [],
    }
)


def test_build_command_uses_verified_flags():
    cmd = build_claude_command("fais X", model="sonnet", budget_usd=5, timeout_min=30)
    assert cmd[0] == "timeout"
    assert "--kill-after=30s" in cmd and "30m" in cmd  # SIGKILL de secours
    assert "claude" in cmd and "-p" in cmd
    # Flag de budget natif présent ; --max-turns ABSENT (n'existe plus).
    assert "--max-budget-usd" in cmd
    assert "--max-turns" not in cmd
    assert cmd[cmd.index("--output-format") + 1] == "json"
    assert cmd[cmd.index("--model") + 1] == "sonnet"


def test_load_goal_template_optional_for_free_facade():
    # Agnostique : une façade sans gabarit ne hard-fail PAS (chaîne vide).
    assert load_goal_template("general") == ""
    assert load_goal_template("nimporte_quoi") == ""


def test_parse_real_output():
    r = parse_claude_result(_REAL_OUTPUT)
    assert isinstance(r, ClaudeResult)
    assert r.succeeded is True
    assert r.result == "OK"
    assert r.cost_usd == Decimal("0.02848355")
    assert r.num_turns == 1
    assert r.session_id == "86fe0f65-40ab-427d-aa97-9ba2c7c01bed"


def test_parse_error_output():
    bad = json.dumps({"subtype": "error_max_budget", "is_error": True, "result": ""})
    r = parse_claude_result(bad)
    assert r.succeeded is False


def test_goal_template_has_common_rules_slot():
    # Chaque gabarit doit pouvoir recevoir le bloc de règles communes.
    for facade in ("bugfix", "discord", "seo", "demo", "finish"):
        tpl = load_goal_template(facade)
        assert "{common_rules}" in tpl
    assert "/verify-app" in COMMON_RULES
