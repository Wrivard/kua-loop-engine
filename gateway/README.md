# Trigger Gateway — spike S4

Statut : **spike S4**. Un seul flot couvert : webhook Sentry signé →
`events` + `threads` + `runs(queued)` dans Supabase (voir `docs/07-TRIGGER-GATEWAY.md`).
La couche DB (`app/db.py`) est un adaptateur temporaire supabase-py/PostgREST,
à réécrire sur psycopg dans `kua_core` (interface stable).

## Setup

```powershell
cd gateway
py -3.10 -m venv .venv          # python3.11 -m venv .venv sur le VPS
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env           # puis remplir SUPABASE_URL / SUPABASE_KEY / SENTRY_WEBHOOK_SECRET
```

## Lancer

```powershell
.venv\Scripts\uvicorn app.main:app --port 8000
```

- `GET /health` → `{"status": "ok"}`
- `POST /hooks/sentry/{project_id}` — corps brut signé HMAC-SHA256 (hex) avec
  `SENTRY_WEBHOOK_SECRET`, header `sentry-hook-signature`. Réponses :
  `created` | `duplicate` | `loop_disabled` | 403 si signature absente/invalide.

## Tester

Les tests tournent contre la **vraie** DB Supabase (projet seedé `kua-cobaye`,
loop `bugfix` enabled) et nettoient leurs lignes en fin de session.

```powershell
.venv\Scripts\python -m pytest tests/ -v
.venv\Scripts\ruff check app tests
```
