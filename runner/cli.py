"""CLI `kua` (doc 06). Tout l'état vit en DB. Aussi appelée par Hermes.

    kua run --project X --facade Y --goal "..."   # enqueue thread + run(queued)
    kua worker [--once]                            # boucle du worker (claim → exécute)
    kua status [run_id]                            # état lisible
    kua approve <run_id>                           # décision → merge selon autonomie
    kua reject  <run_id> [--redo "…"]              # rejette (ou relance avec nuance)
    kua selftest [--keep]                          # pipeline end-to-end sur bare local
    kua sync <repo_path|all>                       # loops.yaml → DB (dry-run)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def cmd_sync(target: str) -> int:
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
        print(f"  [{flag}] {lp.facade:8s} autonomy={lp.autonomy} model={lp.model} budget=${lp.budget_usd}{sched}")
    print("\n(dry-run : upsert DB = TODO — voir kua_core/loops_yaml.py)")
    return 0


def cmd_run(project: str, facade: str, goal: str, goal_extra: str | None) -> int:
    from kua_core import db

    full_goal = goal if not goal_extra else f"{goal}\n\n{goal_extra}"
    loop = db.get_loop(project, facade)
    loop_id = str(loop["id"]) if loop else None
    subject = (goal.strip().splitlines()[0] if goal.strip() else facade)[:60]
    try:
        thread_id, run_id = db.create_thread_with_run(project, loop_id, facade, subject, None, full_goal)
    except Exception as exc:  # noqa: BLE001
        print(f"kua run : échec (projet '{project}' existe ? façade armée ?) — {exc}", file=sys.stderr)
        return 1
    note = "" if loop_id else "  (aucune loop pour cette façade → défauts : manual, budget 5$)"
    print(f"run enqueued: {run_id}\n  thread={thread_id} projet={project} facade={facade}{note}")
    print("  → lance `kua worker --once` (ou le service) pour l'exécuter.")
    return 0


def cmd_worker(once: bool) -> int:
    from runner import worker

    worker.run_worker(once=once)
    return 0


def cmd_status(run_id: str | None) -> int:
    from kua_core import db

    if run_id:
        ctx = db.get_run_context(run_id)
        if not ctx:
            print(f"kua status : run introuvable {run_id}", file=sys.stderr)
            return 1
        print(f"run {run_id}")
        for k in ("run_status", "facade", "branch", "pr_url", "cost_usd", "summary"):
            print(f"  {k:11s}: {ctx.get(k)}")
        return 0
    # global : derniers runs
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.status, t.facade, t.project_id, r.cost_usd "
                "FROM runs r JOIN threads t ON t.id = r.thread_id "
                "ORDER BY r.created_at DESC LIMIT 12"
            )
            rows = cur.fetchall()
    for rid, status, facade, proj, cost in rows:
        print(f"  {str(rid)[:8]}  {status:18s} {facade:10s} {proj:20s} ${cost}")
    if not rows:
        print("  (aucun run)")
    return 0


def cmd_decide(run_id: str, decision: str, comment: str | None) -> int:
    from kua_core import db
    from runner import worker

    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO approvals (run_id, decision, decided_by, comment) VALUES (%s, %s, 'cli', %s)",
                (run_id, decision, comment),
            )
    acted = [r for r in worker.process_approvals() if r["run_id"] == run_id]
    print(f"décision '{decision}' enregistrée pour {run_id} → {acted or 'en file'}")
    return 0


def cmd_selftest(keep: bool) -> int:
    from runner.selftest import run_selftest

    rep = run_selftest(keep=keep)
    print(json.dumps(rep, indent=2, default=str))
    print("\nRESULT:", "✅ OK" if rep.get("ok") else f"❌ FAIL — {rep.get('error')}")
    return 0 if rep.get("ok") else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="kua", description="CLI du Runner kua-loop-engine")
    sub = parser.add_subparsers(dest="command", required=True)

    p_run = sub.add_parser("run", help="enqueue un thread + run(queued)")
    p_run.add_argument("--project", required=True)
    p_run.add_argument("--facade", required=True, help="clé de preset (ouverte) : bugfix/discord/seo/demo/finish/general/new_project/…")
    p_run.add_argument("--goal", required=True, help="la demande libre (le cœur du run)")
    p_run.add_argument("--goal-extra", default=None, help="précision additionnelle (optionnel)")

    p_worker = sub.add_parser("worker", help="boucle du worker")
    p_worker.add_argument("--once", action="store_true", help="traite un seul cycle puis sort")

    p_status = sub.add_parser("status", help="état lisible d'un run (ou des derniers)")
    p_status.add_argument("run_id", nargs="?", default=None)

    p_approve = sub.add_parser("approve", help="approuve un run (→ merge selon autonomie)")
    p_approve.add_argument("run_id")

    p_reject = sub.add_parser("reject", help="rejette un run (ou relance avec --redo)")
    p_reject.add_argument("run_id")
    p_reject.add_argument("--redo", default=None, help="relance un run avec cette nuance")

    sub.add_parser("selftest", help="pipeline end-to-end sur un bare local").add_argument(
        "--keep", action="store_true", help="conserve les dossiers temp + rows"
    )

    p_sync = sub.add_parser("sync", help="loops.yaml → DB (dry-run)")
    p_sync.add_argument("target", help="chemin d'un repo ou 'all'")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "run":
        return cmd_run(args.project, args.facade, args.goal, args.goal_extra)
    if args.command == "worker":
        return cmd_worker(args.once)
    if args.command == "status":
        return cmd_status(args.run_id)
    if args.command == "approve":
        return cmd_decide(args.run_id, "approved", None)
    if args.command == "reject":
        return cmd_decide(args.run_id, "redo" if args.redo else "rejected", args.redo)
    if args.command == "selftest":
        return cmd_selftest(args.keep)
    if args.command == "sync":
        return cmd_sync(args.target)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
