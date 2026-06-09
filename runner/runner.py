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

from pathlib import Path

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
    """Charge le gabarit de goal d'une façade depuis runner/goals/{facade}.md."""
    path = GOALS_DIR / f"{facade}.md"
    if not path.exists():
        raise FileNotFoundError(f"Gabarit de goal introuvable pour la façade : {facade}")
    return path.read_text(encoding="utf-8")


def run_worker() -> None:
    """Boucle principale du worker — à implémenter (Phase 0/1)."""
    raise NotImplementedError("runner.run_worker : à implémenter (spikes S3 puis Phase 1)")


if __name__ == "__main__":
    run_worker()
