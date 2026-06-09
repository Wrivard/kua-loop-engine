"""CLI `kua` (doc 06) — STATUT : squelette (sous-commandes non implémentées).

    kua run --project X --facade seo [--goal-extra "..."]   # enqueue manuel/cron
    kua sync <repo_path|all>                                # loops.yaml → DB
    kua status [run_id]                                     # état lisible
    kua approve <run_id>                                    # décision
    kua reject <run_id> [--redo "…"]                        # décision (+ relance)
    kua onboard <repo_url>                                  # checklist doc 04

Aussi appelée par Hermes (cron, chat-ops). Tout l'état vit en DB.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _not_yet(name: str) -> int:
    print(f"kua {name} : pas encore implémenté (scaffold, étape 1 du setup).", file=sys.stderr)
    return 2


def cmd_sync(target: str) -> int:
    """Parse + valide .kua/loops.yaml (dry-run). L'upsert DB reste TODO (design).

    Résout le chemin : un repo (cherche .kua/loops.yaml) ou un fichier loops.yaml
    direct. 'all' n'est pas encore supporté.
    """
    from kua_core.loops_yaml import parse_loops_yaml

    if target == "all":
        print("kua sync all : pas encore supporté (itération multi-repos = TODO).", file=sys.stderr)
        return 2

    p = Path(target)
    candidate = p / ".kua" / "loops.yaml" if p.is_dir() else p
    if not candidate.exists():
        print(f"kua sync : introuvable {candidate}", file=sys.stderr)
        return 1

    try:
        parsed = parse_loops_yaml(candidate)
    except (ValueError, OSError) as exc:
        print(f"kua sync : config invalide — {exc}", file=sys.stderr)
        return 1

    print(f"projet : {parsed.project} (plan={parsed.plan})")
    for lp in parsed.loops:
        flag = "on " if lp.enabled else "off"
        sched = f" cron='{lp.schedule_cron}'" if lp.schedule_cron else ""
        print(
            f"  [{flag}] {lp.facade:8s} autonomy={lp.autonomy} model={lp.model} "
            f"budget=${lp.budget_usd}{sched}"
        )
    if parsed.escalation:
        print(f"escalation : {parsed.escalation}")
    print("\n(dry-run : upsert projects/loops en DB = TODO, dépend d'une décision "
          "design sur la source de repo_url/name — voir kua_core/loops_yaml.py)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="kua", description="CLI du Runner kua-loop-engine")
    sub = parser.add_subparsers(dest="command", required=True)

    p_run = sub.add_parser("run", help="enqueue un run manuel/cron")
    p_run.add_argument("--project", required=True)
    p_run.add_argument("--facade", required=True, choices=["bugfix", "discord", "seo", "demo", "finish"])
    p_run.add_argument("--goal-extra", default=None)

    p_sync = sub.add_parser("sync", help="loops.yaml → DB (upsert projects/loops)")
    p_sync.add_argument("target", help="chemin d'un repo ou 'all'")

    p_status = sub.add_parser("status", help="état lisible d'un run (ou global)")
    p_status.add_argument("run_id", nargs="?", default=None)

    p_approve = sub.add_parser("approve", help="approuve un run")
    p_approve.add_argument("run_id")

    p_reject = sub.add_parser("reject", help="rejette un run")
    p_reject.add_argument("run_id")
    p_reject.add_argument("--redo", default=None, help="relance un run avec cette précision")

    p_onboard = sub.add_parser("onboard", help="checklist agent-ready (doc 04)")
    p_onboard.add_argument("repo_url")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "sync":
        return cmd_sync(args.target)
    return _not_yet(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
