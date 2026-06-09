"""Lecture + validation de `.kua/loops.yaml` (format figé, doc 03).

Pur : ne touche PAS la DB. Utilisé par `kua sync` (upsert projects/loops) et
`kua onboard`. Valide contre les énumérations verrouillées (models.FACADES /
AUTONOMY) pour échouer tôt sur une config invalide.

Exemple (doc 03) :
    project: salon-booking-client-x
    plan: premium
    loops:
      bugfix:  { enabled: true, autonomy: approve_final, model: sonnet, budget_usd: 5 }
      demo:    { enabled: false }
    escalation:
      discord_channel: "kua-loops-alerts"

NOTE (à trancher avec William) : loops.yaml ne porte ni `repo_url` ni `name` de
projet. `kua sync` devra les résoudre (remote git du repo + slug) — décision de
design en attente. Ce module ne fait que parser/valider la config des loops.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any

from kua_core.models import AUTONOMY, FACADES

_LOOP_DEFAULTS = {
    "enabled": False,
    "autonomy": "manual",
    "model": "sonnet",
    "max_iterations": 8,
    "budget_usd": Decimal("5.00"),
    "timeout_min": 30,
    "schedule_cron": None,
    "config": {},
}


@dataclass
class ParsedLoop:
    facade: str
    enabled: bool
    autonomy: str
    model: str
    max_iterations: int
    budget_usd: Decimal
    timeout_min: int
    schedule_cron: str | None
    config: dict[str, Any]


@dataclass
class ParsedLoopsFile:
    project: str
    plan: str
    loops: list[ParsedLoop]
    escalation: dict[str, Any] = field(default_factory=dict)


def parse_loops_yaml(path: str | Path) -> ParsedLoopsFile:
    """Parse + valide un `.kua/loops.yaml`. Lève ValueError si invalide."""
    import yaml  # noqa: PLC0415 — import paresseux (dépendance runner)

    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError("loops.yaml : racine attendue = mapping")

    project = raw.get("project")
    if not project or not isinstance(project, str):
        raise ValueError("loops.yaml : champ `project` (slug) requis")

    plan = raw.get("plan", "base")
    if plan not in ("base", "premium"):
        raise ValueError(f"loops.yaml : plan invalide '{plan}' (base|premium)")

    loops_raw = raw.get("loops") or {}
    if not isinstance(loops_raw, dict):
        raise ValueError("loops.yaml : `loops` attendu = mapping facade -> config")

    loops: list[ParsedLoop] = []
    for facade, cfg in loops_raw.items():
        if facade not in FACADES:
            raise ValueError(f"loops.yaml : façade inconnue '{facade}' (attendu: {FACADES})")
        cfg = cfg or {}
        if not isinstance(cfg, dict):
            raise ValueError(f"loops.yaml : config de '{facade}' attendue = mapping")
        merged = {**_LOOP_DEFAULTS, **cfg}
        autonomy = merged["autonomy"]
        if autonomy not in AUTONOMY:
            raise ValueError(
                f"loops.yaml : autonomy invalide '{autonomy}' pour '{facade}' (attendu: {AUTONOMY})"
            )
        # `schedule` est l'alias YAML court de schedule_cron (doc 03).
        schedule = cfg.get("schedule", merged.get("schedule_cron"))
        loops.append(
            ParsedLoop(
                facade=facade,
                enabled=bool(merged["enabled"]),
                autonomy=autonomy,
                model=str(merged["model"]),
                max_iterations=int(merged["max_iterations"]),
                budget_usd=Decimal(str(merged["budget_usd"])),
                timeout_min=int(merged["timeout_min"]),
                schedule_cron=schedule,
                config=merged["config"] or {},
            )
        )

    return ParsedLoopsFile(
        project=project,
        plan=plan,
        loops=loops,
        escalation=raw.get("escalation") or {},
    )
