# CLAUDE.md — kua-loop-engine

## C'est quoi ce projet
Moteur d'automatisation pour l'agence Küa (Montréal). Des « loops » déclenchées par événements (webhook Sentry, message Discord, cron, événement calendrier) délèguent du travail de code à Claude Code headless sur les repos des clients, produisent des livrables reviewables (PR draft, preview), et escaladent vers William via Discord selon le mode d'autonomie de chaque loop.

## Vocabulaire (à respecter partout — termes verrouillés)
- **Façade** : une des 5 catégories de travail (bugfix, discord, seo, demo, finish). C'est une **config** (table `loops`) avec autonomie/budget. PAS une conversation.
- **Loop** : la ligne de config d'une façade pour un projet (table `loops`). « Armer une façade » = activer une loop.
- **Thread / conversation** : UNE unité de travail (un bug, une modif, une démo, un lot, un run SEO). Table `threads`. C'est ce que l'UI liste et ouvre comme un chat. Contexte court, archivé à la résolution.
- **Message** : un tour dans un thread (`user` | `agent` | `run` | `system`).
- **Run** : une exécution `claude -p` (table `runs`). Un thread peut en avoir plusieurs (initial + redos).
- **Agent de façade** : couche conversationnelle d'un thread (modèle cheap/mid) qui répond et enqueue des runs. NE code PAS (voir doc 16). ≠ le Runner.

## Stack
- **Orchestration** : Hermes Agent (Nous Research) sur VPS Linux — cron, gateway Discord, mémoire. On NE réimplémente PAS ce que Hermes fait déjà.
- **Exécution code** : Claude Code headless (`claude -p --output-format json`).
- **Trigger Gateway** : FastAPI (Python 3.11), minuscule — réception webhooks + normalisation + enqueue.
- **Runner** : Python, spawn `claude -p` par run, isolation par git checkout.
- **DB** : Postgres via **Supabase** (managé) — partagé par le VPS et l'UI. Tables : projects, loops, threads, messages, runs, events, approvals (voir doc 03).
- **UI (MVP)** : Next.js 14 + Tailwind + shadcn/ui, design Vercel-like (Geist, monochrome) — voir docs/12-FRONTEND-UI.md.

## Règles non-négociables
1. **Jamais de push direct en prod client.** Tout livrable = PR draft / preview / message, approuvé selon `autonomy` de la loop. Le mode `auto` n'existe en code que derrière un flag explicite par loop ET par projet.
2. **Chaque run a un budget** (`max_iterations`, `budget_usd`, timeout). Un run sans budget ne démarre pas.
3. **Permissions fail-closed** : `claude -p` roule avec `--allowedTools` minimal défini dans le `.claude/settings.json` du repo cible. Jamais `--dangerously-skip-permissions` hors sandbox jetable.
4. **État hors-contexte** : le progrès vit dans git + la DB, jamais dans la mémoire de session d'un agent.
5. **Le repo du moteur est un projet comme les autres** (dogfooding), MAIS ses loops sont toujours en review humaine, jamais `auto`, et roulent via backend SSH (l'agent ne modifie pas le code qui le fait tourner).
6. **Contexte borné** : un thread ne charge JAMAIS l'historique des autres threads. CLAUDE.md du projet + ses propres messages seulement. Réglé → archivé → hors contexte. C'est le levier anti-coût #1.
7. **Compound engineering** : quand un loop fait une erreur, la correction va dans le CLAUDE.md du repo concerné, pas juste dans le fix.

## Conventions
- Python : ruff + type hints. TS : strict mode. Commits conventionnels (`feat:`, `fix:`, `docs:`).
- Tout service expose `/health`. Tout run loggue en JSON structuré (run_id, project, loop, phase).
- Secrets via `.env` (jamais commités) — voir `docs/13-SECURITY-BUDGETS.md`.
- Langue : code/identifiants en anglais, messages utilisateur (Discord, UI) en français.

## Définition de « done » pour toute feature
1. Les tests passent. 2. Un run de bout en bout fonctionne sur le client cobaye. 3. L'échec est observable (statut DB + message Discord). 4. Le doc correspondant dans `docs/` est mis à jour si le comportement a changé.

## Layout du repo (monorepo)
```
kua-loop-engine/
├── CLAUDE.md
├── docs/
├── gateway/        # Trigger Gateway (FastAPI) — doc 07
├── runner/         # Runner + CLI `kua` (Python) — doc 06 ; runner/goals/{facade}.md
├── agent/          # Agent de façade (couche conversationnelle) — doc 16
├── db/             # migrations SQL — doc 03
├── ui/             # Next.js 14 + Tailwind + shadcn/ui — doc 12
├── deploy/         # systemd units, Caddyfile, docker-compose — doc 05
└── .env.example
```
Le `gateway`, le `runner` et l'`agent` peuvent partager un package Python commun (`kua_core/`: modèles DB, accès Supabase, helpers). L'UI est séparée.
