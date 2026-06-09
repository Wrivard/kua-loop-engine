"""agent — l'agent de façade : la couche conversationnelle d'un thread (doc 16).

Modèle cheap/mid. NE code PAS, n'ouvre PAS de PR : il converse, compile un goal
et enqueue un run (le Runner fait le code lourd). Stateless : tout l'état vient
de la DB (messages du thread). Contexte borné : system prompt de la façade +
CLAUDE.md du projet + les messages DE CE thread uniquement.
"""

__version__ = "0.1.0"
