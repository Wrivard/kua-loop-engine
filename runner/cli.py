"""CLI `kua` (doc 06). Tout l'état vit en DB. Aussi appelée par Hermes.

    kua run --project X --facade Y --goal "..."   # enqueue thread + run(queued)
    kua worker [--once]                            # boucle du worker (claim → exécute)
    kua pause | kua resume                         # pause/reprise du moteur (flag DB)
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
    import logging

    from runner import worker

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
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


def cmd_pause(paused: bool) -> int:
    from kua_core import db

    try:
        db.set_paused(paused)
    except Exception as exc:  # noqa: BLE001
        print(f"kua {'pause' if paused else 'resume'} : échec — {exc}", file=sys.stderr)
        return 1
    print("moteur EN PAUSE — aucun nouveau run (les runs en cours finissent)." if paused else "moteur REPRIS.")
    return 0


def cmd_decide(run_id: str, decision: str, comment: str | None) -> int:
    from kua_core import db
    from runner import worker

    ctx = db.get_run_context(run_id)
    if not ctx:
        print(f"kua {decision} : run introuvable {run_id}", file=sys.stderr)
        return 1
    if ctx.get("run_status") != "awaiting_approval":
        print(
            f"kua {decision} : le run n'est pas en attente de décision (statut={ctx.get('run_status')})",
            file=sys.stderr,
        )
        return 1
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO approvals (run_id, decision, decided_by, comment) VALUES (%s, %s, 'cli', %s)",
                    (run_id, decision, comment),
                )
    except Exception as exc:  # noqa: BLE001
        print(f"kua {decision} : échec de l'enregistrement — {exc}", file=sys.stderr)
        return 1
    acted = [r for r in worker.process_approvals() if r["run_id"] == run_id]
    if not acted:
        print(f"kua {decision} : décision enregistrée mais non appliquée", file=sys.stderr)
        return 1
    print(f"décision '{decision}' appliquée pour {run_id} → {acted[0].get('status')}")
    return 0


def cmd_selftest(keep: bool) -> int:
    from runner.selftest import run_selftest

    rep = run_selftest(keep=keep)
    print(json.dumps(rep, indent=2, default=str))
    print("\nRESULT:", "✅ OK" if rep.get("ok") else f"❌ FAIL — {rep.get('error')}")
    return 0 if rep.get("ok") else 1


def cmd_project_create(name: str, private: bool, facade: str, budget_usd: float) -> int:
    from kua_core.provision import provision_repo_project

    try:
        res = provision_repo_project(name, private=private, facade=facade, budget_usd=budget_usd)
    except Exception as exc:  # noqa: BLE001
        print(f"kua project create : échec — {exc}", file=sys.stderr)
        return 1
    print(f"repo créé : {res['html_url']}  ({'privé' if res['private'] else 'public'})")
    print(f"projet enregistré : slug={res['slug']} · chargé=oui · repo_url={res['repo_url']}")
    print(f"loop armée : facade={res['facade']} autonomy={res['autonomy']} budget=${res['budget_usd']}")
    print(f"  → `kua run --project {res['slug']} --facade {res['facade']} --goal \"…\"` pour lancer un thread.")
    return 0


def cmd_connector_set(scope: str, project: str | None, type_: str, sets: list[str]) -> int:
    from kua_core import connectors, db, secrets

    ct = connectors.get_type(type_)
    if not ct:
        print(f"kua connector : type inconnu '{type_}'", file=sys.stderr)
        return 1
    if scope == "project" and not project:
        print("kua connector : --project requis pour --scope project", file=sys.stderr)
        return 1
    pid = project if scope == "project" else None
    fields: dict[str, str] = {}
    for item in sets:
        if "=" not in item:
            print(f"kua connector : --set attend key=value (reçu '{item}')", file=sys.stderr)
            return 1
        k, v = item.split("=", 1)
        fields[k.strip()] = v
    known = set(ct.secret_fields) | set(ct.config_fields)
    unknown = set(fields) - known
    if unknown:
        print(f"kua connector : champs inconnus {sorted(unknown)} (attendus: {sorted(known)})", file=sys.stderr)
        return 1
    secret_vals = {k: v for k, v in fields.items() if k in ct.secret_fields}
    config_vals = {k: v for k, v in fields.items() if k in ct.config_fields}
    ref = secrets.set_secret(scope, type_, pid, secret_vals) if secret_vals else secrets.secret_ref(scope, pid)
    status, detail = "untested", "pas de validateur"
    if ct.validate:
        ok, detail = ct.validate(secrets.read_secret(scope, type_, pid, ct.secret_fields), config_vals)
        status = "ok" if ok else "error"
    conn_id = db.upsert_connection(scope, type_, pid, f"{ct.label} ({scope})", config_vals, ref, status)
    print(f"connexion {type_} [{scope}] enregistrée (id {conn_id[:8]}) → statut: {status} ({detail})")
    print(f"  secret → /srv/kua/secrets/{ref} (chmod 600) ; config en DB : {config_vals or '∅'}")
    return 0


def cmd_connector_test(scope: str, project: str | None, type_: str) -> int:
    from kua_core import connectors, db, secrets

    ct = connectors.get_type(type_)
    if not ct:
        print(f"kua connector : type inconnu '{type_}'", file=sys.stderr)
        return 1
    pid = project if scope == "project" else None
    conn = db.get_connection(scope, type_, pid)
    if not conn:
        print(f"kua connector : aucune connexion {type_} [{scope}]", file=sys.stderr)
        return 1
    if not ct.validate:
        db.set_connection_status(str(conn["id"]), "untested")
        print(f"{type_} [{scope}] : pas de validateur (untested)")
        return 0
    sv = secrets.read_secret(scope, type_, pid, ct.secret_fields)
    ok, detail = ct.validate(sv, conn.get("config") or {})
    db.set_connection_status(str(conn["id"]), "ok" if ok else "error")
    print(f"{type_} [{scope}] : {'ok' if ok else 'error'} ({detail})")
    return 0 if ok else 1


def cmd_connector_list(scope: str | None) -> int:
    from kua_core import db

    rows = db.list_connections(scope)
    for c in rows:
        print(
            f"  {c['scope']:7s} {c['type']:11s} {str(c.get('status')):9s} "
            f"{c.get('project_id') or '-':16s} {c.get('secret_ref') or '-'}"
        )
    if not rows:
        print("  (aucune connexion)")
    return 0


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

    sub.add_parser("pause", help="met le moteur en pause (aucun nouveau run ; les runs en cours finissent)")
    sub.add_parser("resume", help="reprend le moteur (après une pause)")

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

    p_proj = sub.add_parser("project", help="projets : create (crée un repo + enregistre le projet chargé)")
    psub = p_proj.add_subparsers(dest="proj_cmd", required=True)
    pcreate = psub.add_parser("create", help="crée un repo GitHub + enregistre le projet (chargé) + une loop")
    pcreate.add_argument("--name", required=True, help="nom du projet (→ slug du repo)")
    pcreate.add_argument("--private", dest="private", action="store_true", default=True, help="repo privé (défaut)")
    pcreate.add_argument("--public", dest="private", action="store_false", help="repo public")
    pcreate.add_argument("--facade", default="general", help="façade de la loop (défaut: general)")
    pcreate.add_argument("--budget", type=float, default=5.0, help="budget_usd de la loop (> 0, défaut: 5)")

    p_conn = sub.add_parser("connector", help="connecteurs : set / test / list")
    csub = p_conn.add_subparsers(dest="conn_cmd", required=True)
    cset = csub.add_parser("set", help="enregistre une connexion (+ secret sur le VPS)")
    cset.add_argument("--scope", required=True, choices=["app", "project"])
    cset.add_argument("--project", default=None)
    cset.add_argument("--type", required=True)
    cset.add_argument("--set", action="append", default=[], dest="sets", metavar="key=value")
    ctest = csub.add_parser("test", help="re-valide une connexion + maj le statut")
    ctest.add_argument("--scope", required=True, choices=["app", "project"])
    ctest.add_argument("--project", default=None)
    ctest.add_argument("--type", required=True)
    clist = csub.add_parser("list", help="liste les connexions")
    clist.add_argument("--scope", choices=["app", "project"], default=None)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "run":
        return cmd_run(args.project, args.facade, args.goal, args.goal_extra)
    if args.command == "worker":
        return cmd_worker(args.once)
    if args.command == "pause":
        return cmd_pause(True)
    if args.command == "resume":
        return cmd_pause(False)
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
    if args.command == "project":
        if args.proj_cmd == "create":
            return cmd_project_create(args.name, args.private, args.facade, args.budget)
    if args.command == "connector":
        if args.conn_cmd == "set":
            return cmd_connector_set(args.scope, args.project, args.type, args.sets)
        if args.conn_cmd == "test":
            return cmd_connector_test(args.scope, args.project, args.type)
        if args.conn_cmd == "list":
            return cmd_connector_list(args.scope)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
