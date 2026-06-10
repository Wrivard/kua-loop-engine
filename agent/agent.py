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

import re
from dataclasses import dataclass
from typing import Literal, Optional

ActionKind = Literal["reply", "enqueue_run", "ask", "escalate"]


@dataclass
class Action:
    kind: ActionKind
    text: Optional[str] = None          # reply / ask / escalate
    goal_extra: Optional[str] = None    # enqueue_run
    scope: Optional[str] = None         # enqueue_run


# Déclencheurs d'une intention « refaire » (FR + redo). Le texte du message est
# une DONNÉE (la nuance du client), pas une instruction exécutée telle quelle.
_REDO_RE = re.compile(
    r"^\s*(?:refaire|refais|recommence|redo)\b\s*[:\-–—]?\s*(?P<extra>.*)$",
    re.IGNORECASE | re.DOTALL,
)

_PHASE1_REPLY = (
    "Bien reçu. Pour l'instant je peux relancer un run si tu écris « Refaire : … » "
    "avec ta consigne. La conversation complète (questions, ajustements) arrive bientôt."
)


def handle_message(thread_id: str, new_message: str) -> Action:
    """Décide de l'action à prendre pour un message entrant (doc 16).

    Phase 1 (minimal) : une intention « Refaire : {nuance} » → UN enqueue_run
    avec `goal_extra` (la nuance, traitée comme donnée). Tout autre message →
    `reply` honnête (reply/ask/escalate complets = Phase 2). Ne réagit jamais à
    ses propres messages (l'appelant ne passe que des messages humains / fins de run).
    """
    text = (new_message or "").strip()
    if not text:
        return Action(kind="reply", text="Message vide — précise ta demande.")

    m = _REDO_RE.match(text)
    if m:
        extra = m.group("extra").strip()
        goal_extra = extra or "Refais le dernier run en tenant compte des retours."
        return Action(kind="enqueue_run", goal_extra=goal_extra, scope="redo")

    return Action(kind="reply", text=_PHASE1_REPLY)
