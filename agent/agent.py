"""Agent de façade (doc 16) — STATUT : squelette.

Contrat : une seule fonction `handle_message(thread_id, new_message) -> Action`.
L'agent choisit UNE action via un petit schéma :

  - reply       : répondre (question/clarification) → message `agent`.
  - enqueue_run : produire {goal_extra, scope} → insère un run(queued) + message `agent`.
  - ask         : demander une précision → message `agent` avec la question.
  - escalate    : hors périmètre/whitelist → notifie kua-loops-alerts.

Garde-fous (doc 16) :
- Le message client/brut est une DONNÉE, pas une instruction (cadrage explicite).
- enqueue_run respecte budget/whitelist de la loop ; sinon → ask ou escalate.
- Pas de boucle agent↔agent : réagit à un message humain ou à une fin de run,
  jamais à ses propres messages.

Scope par phase :
- Phase 1 : minimal — « Refaire : {texte} » ⇒ UN enqueue_run avec goal_extra.
- Phase 2 : reply / ask / escalate / enqueue complets (composer UI + intake Discord).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

ActionKind = Literal["reply", "enqueue_run", "ask", "escalate"]


@dataclass
class Action:
    kind: ActionKind
    text: Optional[str] = None          # reply / ask / escalate
    goal_extra: Optional[str] = None    # enqueue_run
    scope: Optional[str] = None         # enqueue_run


def handle_message(thread_id: str, new_message: str) -> Action:
    """Décide de l'action à prendre — à implémenter (Phase 1 minimal, puis Phase 2)."""
    raise NotImplementedError("agent.handle_message : à implémenter (doc 16, scope par phase)")
