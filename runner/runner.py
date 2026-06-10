"""Worker du Runner (doc 06) — STATUT : squelette (Phase 0/1).

Cycle d'un run (doc 06) :
  1. CLAIM    : SELECT ... FOR UPDATE SKIP LOCKED ; status → preparing
  2. PREPARE  : git clone/fetch dans {checkouts}/{project}/{run_id}/ ; branche kua/{facade}/{court}
  3. COMPILE  : goal final = gabarit runner/goals/{facade}.md + contexte event + garde-fous
  4. RUN      : spawn `claude -p` (voir invocation doc 06) ; status → running ; stream log
  5. VERIFY   : exiger que /verify-app ait passé ; status → verifying
  6. DELIVER  : gh pr create --draft ; capturer pr_url, cost, summary
  7. GATE     : selon loop.autonomy → awaiting_approval (+ Discord) ou auto (push)
  8. CLEANUP  : checkout supprimé après N jours

Garde-fous non-négociables (CLAUDE.md) : budget par run (kill au dépassement),
permissions fail-closed (.claude/settings.json du repo cible), jamais de
--dangerously-skip-permissions hors sandbox, contexte borné.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Optional

GOALS_DIR = Path(__file__).resolve().parent / "goals"

# Bloc de règles communes injecté en fin de chaque goal (doc 06).
COMMON_RULES = """\
RÈGLES :
- Fais le plus petit changement sûr qui atteint le goal.
- Ajoute/ajuste les tests qui prouvent le changement.
- Termine OBLIGATOIREMENT par /verify-app et corrige jusqu'à ce que ça passe.
- Ne touche à rien hors du périmètre du goal. En cas de doute, arrête et résume le blocage.
- Commit en messages conventionnels ; n'ouvre PAS la PR toi-même (le Runner s'en charge).
"""


def load_goal_template(facade: str) -> str:
    """Gabarit de preset OPTIONNEL pour une façade (runner/goals/{facade}.md).

    Chaîne vide si absent (façade libre / general / new_project) — le Runner reste
    AGNOSTIQUE : aucun hard-fail par façade. Le goal arrive déjà composé en amont
    (cf. runner/goal.compile_goal)."""
    path = GOALS_DIR / f"{facade}.md"
    return path.read_text(encoding="utf-8") if path.exists() else ""


def build_claude_command(
    goal: str,
    model: str = "sonnet",
    budget_usd: float | Decimal = 5.0,
    timeout_min: int = 30,
    permission_mode: str = "acceptEdits",
) -> list[str]:
    """Construit l'argv de l'invocation `claude -p` (flags VÉRIFIÉS au spike S3).

    Enveloppé dans `timeout {timeout_min}m` pour le plafond temps ; budget via
    `--max-budget-usd` (natif). PAS de `--max-turns` (n'existe plus en 2.1.170).
    """
    return [
        # --kill-after : escalade en SIGKILL 30s après le SIGTERM si claude/enfants
        # ignorent le signal → garantit le respect du plafond temps.
        "timeout", "--kill-after=30s", f"{timeout_min}m",
        "claude", "-p", goal,
        "--output-format", "json",
        "--max-budget-usd", str(budget_usd),
        "--model", model,
        "--permission-mode", permission_mode,
    ]


@dataclass
class ClaudeResult:
    """Sortie parsée d'un `claude -p --output-format json` (clés vérifiées S3)."""
    is_error: bool
    subtype: str
    result: str
    cost_usd: Decimal
    num_turns: int
    session_id: Optional[str]
    stop_reason: Optional[str]
    terminal_reason: Optional[str] = None  # signal structuré (ex. coupe budget)

    @property
    def succeeded(self) -> bool:
        return not self.is_error and self.subtype == "success"


def parse_claude_result(stdout: str) -> ClaudeResult:
    """Parse le JSON `result` de `claude -p`. Mappe vers les colonnes du run (doc 06)."""
    d = json.loads(stdout)
    return ClaudeResult(
        is_error=bool(d.get("is_error", False)),
        subtype=str(d.get("subtype", "")),
        result=str(d.get("result", "")),
        cost_usd=Decimal(str(d.get("total_cost_usd", 0))),
        num_turns=int(d.get("num_turns", 0)),
        session_id=d.get("session_id"),
        stop_reason=d.get("stop_reason"),
        terminal_reason=d.get("terminal_reason"),
    )


def run_worker(*, once: bool = False, poll_interval: float = 5.0) -> None:
    """Boucle principale du worker (implémentée dans runner.worker).

    Cycle : claim → prepare (checkout) → compile goal → claude -p → verify →
    deliver (PR draft) → gate d'autonomie + watcher d'approbations.
    """
    from runner.worker import run_worker as _run_worker  # import paresseux (évite le cycle)

    _run_worker(once=once, poll_interval=poll_interval)


if __name__ == "__main__":
    run_worker()
