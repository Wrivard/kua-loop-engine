# 07 — Trigger Gateway

Service FastAPI minuscule. Une responsabilité : transformer un événement externe en `events` + un `thread` (conversation) + son premier `runs(queued)`. Aucune logique métier, aucun appel LLM.

## Endpoints
```
POST /hooks/sentry/{project_id}     # webhook Sentry (issue alert)
POST /hooks/posthog/{project_id}    # webhook PostHog (error tracking / alerte) — même normalisation
POST /hooks/github/{project_id}     # réservé (CI, review) — post-MVP
POST /hooks/calendar                # réservé Façade B — post-MVP (sinon polling côté Hermes)
POST /internal/enqueue              # utilisé par Hermes (cron, discord) et la CLI — auth par token interne
GET  /health
```

## Flot Sentry (MVP)
1. Vérifier la signature du webhook (secret partagé Sentry).
2. Extraire : issue_id, title, culprit, permalink, level, release.
3. Upsert `events(source='sentry', external_id=issue_id)` — si conflit (déjà vu), répondre 200 et STOP (dédup).
4. Charger la loop `(project_id, 'bugfix')` ; si `enabled=false` → log + STOP.
5. Créer le `thread` (conversation, `subject` = titre de l'issue) + insérer son premier `runs(status='queued')`. Si l'issue a déjà un thread ouvert (dédup), rouvrir/attacher au lieu d'un doublon. Le Runner fera la compilation complète du goal.
6. Répondre 200 vite (<2 s) ; tout le travail est asynchrone.

## Filtres anti-bruit (config par loop, `config` JSONB)
- `min_level: error` (ignorer warnings), `ignore_patterns: [...]` (regex sur le titre),
- `max_runs_per_day: 5` par projet (un déploiement cassé ne déclenche pas 40 runs),
- regroupement : si une conversation bugfix est déjà ouverte pour CETTE issue, rouvrir/attacher au lieu d'un doublon.

## Sécurité
- Signatures vérifiées sur tous les hooks publics ; `/internal/*` derrière un bearer token réseau-local.
- Rate limit basique par IP. Payloads bruts conservés dans `events.payload` (audit).
