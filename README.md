# kua-loop-engine

Moteur d'automatisation par « loops » pour l'agence **Küa** (Montréal). Des loops déclenchées par
événements (webhook Sentry, message Discord, cron, calendrier) délèguent du travail de code à Claude
Code headless sur les repos clients, produisent des livrables reviewables (PR draft / preview) et
escaladent vers William via Discord selon le mode d'autonomie de chaque loop.

> Architecture, vocabulaire verrouillé et règles non-négociables : voir [`CLAUDE.md`](./CLAUDE.md)
> et [`docs/`](./docs/) (commencer par `docs/02-ARCHITECTURE.md` et `docs/14-ROADMAP-MVP.md`).

## Monorepo
```
gateway/    Trigger Gateway (FastAPI) — webhooks → normalisation → enqueue (doc 07)
runner/     Runner + CLI `kua` — spawn `claude -p`, isolation git (doc 06)
agent/      Agent de façade — couche conversationnelle (doc 16)
kua_core/   Paquet partagé : modèles, accès DB (psycopg), config, loops.yaml
db/         Migrations SQL (doc 03)
ui/         Next.js 14 + Tailwind (doc 12) — déployé sur Vercel
deploy/     systemd, Caddyfile, docker-compose (doc 05)
```

## UI (Vercel)
L'interface vit dans [`ui/`](./ui/) et se déploie sur Vercel — **Root Directory = `ui/`**,
variables `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Étapes complètes :
[`ui/README.md`](./ui/README.md). L'UI tourne en mode démo sans backend.

## Backend (VPS)
Python 3.11+. Secrets dans `/srv/kua/.env` (jamais commités, voir `.env.example` et
`docs/13-SECURITY-BUDGETS.md`). Tests : `.venv/bin/python -m pytest`.

## Sécurité (rappels)
- Jamais de push direct en prod client — tout livrable = PR draft / preview, approuvé selon l'autonomie.
- `service_role` Supabase et token GitHub = **backend uniquement**, jamais dans `ui/`.
- Voir [`docs/TODO-GITHUB-APP.md`](./docs/TODO-GITHUB-APP.md) pour l'auth GitHub long terme (GitHub App).
