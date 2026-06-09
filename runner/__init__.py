"""runner — le seul endroit du système où `claude -p` est invoqué (doc 06).

Worker qui poll la table runs (status=queued), prépare un checkout git isolé,
spawn `claude -p`, applique budgets/timeout, parse la sortie JSON, met à jour
les statuts du run et du thread, et demande l'approbation selon l'autonomie de
la loop. Expose aussi la CLI `kua` (cli.py).
"""

__version__ = "0.1.0"
