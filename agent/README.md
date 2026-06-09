# agent — l'agent de façade (doc 16)

Couche conversationnelle d'un thread. Modèle cheap/mid. **Ne code pas, n'ouvre
pas de PR** : il converse, compile un goal et enqueue un run.

Appelé par : (a) le gateway Discord de Hermes (message dans un channel client),
(b) l'API de l'UI (composer), (c) le Runner (résumé en fin de run). Une seule
fonction publique : `handle_message(thread_id, new_message) -> Action`.

**STATUT : squelette.** Phase 1 = version minimale (« Refaire : … » → un
`enqueue_run`). Phase 2 = agent conversationnel complet.
