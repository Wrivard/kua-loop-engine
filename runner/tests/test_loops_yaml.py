"""Tests du parseur loops.yaml (kua_core.loops_yaml) + `kua sync` (dry-run)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from kua_core.loops_yaml import parse_loops_yaml
from runner.cli import main

_VALID = """\
project: salon-booking-client-x
plan: premium
loops:
  bugfix:  { enabled: true, autonomy: approve_final, model: sonnet, budget_usd: 5 }
  seo:     { enabled: true, autonomy: approve_final, model: sonnet, schedule: "0 6 1 * *", budget_usd: 10 }
  discord: { enabled: true, autonomy: approve_final, budget_usd: 3, config: { whitelist: [text_change, image_swap] } }
  demo:    { enabled: false }
escalation:
  discord_channel: "kua-loops-alerts"
"""


def _write(tmp_path, text):
    f = tmp_path / "loops.yaml"
    f.write_text(text, encoding="utf-8")
    return f


def test_parse_valid(tmp_path):
    parsed = parse_loops_yaml(_write(tmp_path, _VALID))
    assert parsed.project == "salon-booking-client-x"
    assert parsed.plan == "premium"
    by = {lp.facade: lp for lp in parsed.loops}
    assert by["bugfix"].enabled is True
    assert by["bugfix"].budget_usd == Decimal("5")
    assert by["seo"].schedule_cron == "0 6 1 * *"
    assert by["discord"].config["whitelist"] == ["text_change", "image_swap"]
    assert by["demo"].enabled is False
    # défauts appliqués
    assert by["demo"].autonomy == "manual"
    assert parsed.escalation["discord_channel"] == "kua-loops-alerts"


def test_invalid_facade_slug_rejected(tmp_path):
    # La façade est une clé de preset OUVERTE, mais doit rester un slug.
    bad = "project: x\nloops:\n  'Bad Facade!': { enabled: true }\n"
    with pytest.raises(ValueError, match="clé de façade invalide"):
        parse_loops_yaml(_write(tmp_path, bad))


def test_free_facade_slug_accepted(tmp_path):
    # Agnostique : general / new_project / slug libre sont valides.
    ok = "project: x\nloops:\n  general: { enabled: true, budget_usd: 2 }\n  new_project: { enabled: true, budget_usd: 2 }\n"
    parsed = parse_loops_yaml(_write(tmp_path, ok))
    facades = {lp.facade for lp in parsed.loops}
    assert "general" in facades and "new_project" in facades


def test_zero_budget_rejected(tmp_path):
    bad = "project: x\nloops:\n  bugfix: { enabled: true, budget_usd: 0 }\n"
    with pytest.raises(ValueError, match="budget_usd"):
        parse_loops_yaml(_write(tmp_path, bad))


def test_invalid_autonomy_rejected(tmp_path):
    bad = "project: x\nloops:\n  bugfix: { enabled: true, autonomy: yolo }\n"
    with pytest.raises(ValueError, match="autonomy invalide"):
        parse_loops_yaml(_write(tmp_path, bad))


def test_missing_project_rejected(tmp_path):
    with pytest.raises(ValueError, match="project"):
        parse_loops_yaml(_write(tmp_path, "loops:\n  bugfix: { enabled: true }\n"))


def test_cli_sync_dry_run(tmp_path, capsys):
    _write(tmp_path, _VALID)
    rc = main(["sync", str(tmp_path)])  # dossier → cherche .kua/loops.yaml… ou loops.yaml direct
    # le dossier n'a pas de .kua/, mais a loops.yaml direct : on pointe le fichier
    assert rc == 1  # .kua/loops.yaml absent dans le dossier
    rc = main(["sync", str(tmp_path / "loops.yaml")])
    assert rc == 0
    out = capsys.readouterr().out
    assert "salon-booking-client-x" in out
    assert "bugfix" in out and "dry-run" in out
