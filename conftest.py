"""Pause le moteur LIVE pendant la session de tests.

Depuis le bring-live Phase 1, le service `kua-worker` tourne en continu sur le VPS et
POLL la MÊME DB Supabase que les tests. Sans pause, il réclame les runs de test
(queued → preparing) selon le timing de son poll (~5 s) → assertions flaky
(« expected queued, got preparing », double-traitement d'un run).

On met le moteur en pause au DÉBUT de la session et on le REPREND à la fin — toujours,
même si un test plante. Les tests appellent `process_run` directement (sans claim), donc
la pause ne les gêne pas ; elle empêche seulement le worker live de voler leurs fixtures.

⚠️ Si pytest est tué brutalement (SIGKILL) en cours, le moteur peut rester en pause :
le rétablir avec `kua resume` (ou le toggle UI Réglages → Système).
"""

from __future__ import annotations

import pytest


@pytest.fixture(scope="session", autouse=True)
def _pause_live_engine_during_tests():
    paused = False
    try:
        from kua_core import db

        db.set_paused(True)
        paused = True
    except Exception:
        pass  # DB injoignable → les tests qui en dépendent se skippent de toute façon
    try:
        yield
    finally:
        if paused:
            try:
                from kua_core import db

                db.set_paused(False)
            except Exception:
                pass
