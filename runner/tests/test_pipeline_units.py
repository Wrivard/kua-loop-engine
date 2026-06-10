"""Tests unitaires des modules du Runner — offline (git local, pas de DB/réseau)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from runner import deliver, gitops, verify
from runner.context import RunCtx
from runner.executor import FakeExecutor
from runner.goal import compile_goal
from runner.target import resolve_target


def _ctx(**kw) -> RunCtx:
    base = dict(
        run_id="11111111-2222-3333-4444-555555555555",
        thread_id="t-1",
        goal="Corrige le bug X",
        facade="bugfix",
        subject="Bug X",
        project_id="proj",
        project_name="Projet",
        repo_url="github.com/owner/repo",
        default_branch="main",
        is_engine=False,
        autonomy="manual",
        budget_usd=Decimal("5"),
        model="sonnet",
        timeout_min=30,
        config={},
    )
    base.update(kw)
    return RunCtx(**base)


# ----------------------------------------------------------------- target ---

def test_target_existing():
    t = resolve_target(_ctx())
    assert t.mode == "existing"
    assert t.repo_url == "github.com/owner/repo"
    assert t.base_branch == "main"
    assert t.work_branch.startswith("kua/bugfix/")


@pytest.mark.parametrize(
    "kw",
    [{"repo_url": ""}, {"repo_url": "new"}, {"facade": "new_project"}, {"config": {"new_project": True}}],
)
def test_target_new(kw):
    assert resolve_target(_ctx(**kw)).mode == "new"


def test_target_branch_slug_is_safe():
    t = resolve_target(_ctx(facade="Custom Loop!"))
    assert t.work_branch.startswith("kua/custom-loop/")


# ------------------------------------------------------------------ goal ---

def test_compile_goal_has_demande_and_rules(tmp_path):
    g = compile_goal(_ctx(goal="Corrige le crash au login"), tmp_path)
    assert "Corrige le crash au login" in g
    assert "RÈGLES" in g  # COMMON_RULES injecté


def test_compile_goal_includes_project_claude_md(tmp_path):
    (tmp_path / "CLAUDE.md").write_text("# Projet\nNext.js 14", encoding="utf-8")
    g = compile_goal(_ctx(), tmp_path)
    assert "CONTEXTE PROJET" in g and "Next.js 14" in g


# --------------------------------------------------------------- gitops ---

def test_git_init_branch_commit(tmp_path):
    repo = tmp_path / "repo"
    gitops.init_new(repo, "main")
    assert gitops.current_branch(repo) == "main"
    gitops.checkout_new_branch(repo, "kua/x/abc123")
    assert gitops.current_branch(repo) == "kua/x/abc123"
    assert gitops.has_changes(repo) is False
    (repo / "f.txt").write_text("hi", encoding="utf-8")
    assert gitops.has_changes(repo) is True
    assert gitops.commit_all(repo, "feat: f") is True
    assert gitops.commits_ahead(repo, "main") == 1
    assert gitops.commit_all(repo, "noop") is False  # rien à committer


def test_git_push_to_bare_then_clone(tmp_path):
    bare = tmp_path / "origin.git"
    gitops.create_bare(bare)
    repo = tmp_path / "repo"
    gitops.init_new(repo, "main")
    gitops.add_remote(repo, "origin", str(bare))
    gitops.push(repo, "origin", "main")
    clone = tmp_path / "clone"
    gitops.clone(str(bare), clone, "main")
    assert (clone / "README.md").exists()


# --------------------------------------------------------------- verify ---

def test_verify_script_pass(tmp_path):
    (tmp_path / ".kua").mkdir()
    (tmp_path / ".kua" / "verify.sh").write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    assert verify.run_verify_gate(tmp_path).status == "passed"


def test_verify_script_fail(tmp_path):
    (tmp_path / ".kua").mkdir()
    (tmp_path / ".kua" / "verify.sh").write_text("exit 3\n", encoding="utf-8")
    assert verify.run_verify_gate(tmp_path).status == "failed"


def test_verify_skipped_when_nothing(tmp_path):
    assert verify.run_verify_gate(tmp_path).status == "skipped"


# ------------------------------------------------------------- executor ---

def test_fake_executor_edits_checkout(tmp_path):
    r = FakeExecutor().run(tmp_path, "fais X", budget_usd=Decimal("0"), timeout_min=1)
    assert r.ok and r.status == "succeeded"
    assert (tmp_path / "KUA_RUN.md").exists()


# -------------------------------------------------------------- deliver ---

@pytest.mark.parametrize(
    "url,expected",
    [
        ("github.com/Wrivard/kua-loop-engine", ("Wrivard", "kua-loop-engine")),
        ("https://github.com/o/r.git", ("o", "r")),
        ("git@github.com:o/r.git", ("o", "r")),
    ],
)
def test_parse_github(url, expected):
    assert deliver._parse_github(url) == expected


def test_make_deliverer_local_without_token(monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    d = deliver.make_deliverer(_ctx(repo_url="github.com/o/r"))
    assert isinstance(d, deliver.LocalBareDeliverer)
