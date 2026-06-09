# 02 — Architecture

## Vue d'ensemble

```
                         ┌────────────────────────── VPS Linux (always-on) ──────────────────────────┐
  Sentry webhook ──────► │  ┌──────────────────┐                                                      │
  GitHub webhook ──────► │  │ TRIGGER GATEWAY  │── enqueue ──► ┌────────┐                              │
  Calendar (poll/push) ► │  │ (FastAPI, mince) │               │Postgres│◄ projets·loops·threads·runs·msgs   │
                         │  └──────────────────┘               └───┬────┘                              │
                         │                                          │                                   │
  Discord msgs ────────► │  ┌──────────────────┐    consomme la    │     ┌─────────────────────────┐  │
  (clients + contrôle)   │  │  HERMES AGENT    │◄──── queue ───────┴────►│  RUNNER                  │  │
  Cron loops ──────────► │  │  - cron natif    │    (ou direct)          │  spawn claude -p         │  │
                         │  │  - gateway Discord│                        │  1 git checkout / run     │  │
                         │  │  - chat-ops      │── escalations ──┐       │  parse JSON, statuts      │  │
                         │  │  - mémoire/MCP   │                 │       └───────────┬──────────────┘  │
                         │  └──────────────────┘                 │                   │ PR draft         │
                         └───────────────────────────────────────┼───────────────────┼─────────────────┘
                                                                 ▼                   ▼
                                                          Discord (William      GitHub (repos
                                                          + partner, cell)      clients)
                              UI (MVP) ──── lit le même Postgres (Supabase Realtime)
```

## Composants et responsabilités

| Composant | Rôle | Ce qu'il ne fait PAS |
|---|---|---|
| **Trigger Gateway** | Reçoit webhooks (Sentry/GitHub/Calendar), vérifie signatures, normalise en `event`, crée un `thread` + son 1er `run` | Pas de logique métier, pas d'appel LLM |
| **Hermes Agent** | Cron des loops planifiées, gateway Discord (intake clients + escalations + commandes chat-ops), classification légère (modèle cheap), mémoire | Pas le travail de code lourd |
| **Agent de façade** | Couche conversationnelle d'un fil (modèle cheap/mid) : comprend l'intention, répond/clarifie, compile le goal et enqueue un run. Garde le contexte du fil. | Pas le travail de code lourd (délègue au Runner) |
| **Runner** | Consomme les runs en attente, prépare le checkout, spawn `claude -p`, applique budgets/timeout, parse la sortie, met à jour les statuts, demande l'approbation | Pas de scheduling, pas de réception webhook |
| **Postgres** | Source de vérité : projets, loops, runs, événements, approbations | — |
| **UI (MVP)** | Inbox groupée par projet, liste de conversations, chat, approbation rapide (doc 12) | Pas d'exécution de code ni de scheduling |

## Pourquoi un Trigger Gateway séparé (décision)
Hermes a le cron et Discord nativement, mais la réception de webhooks entrants n'est pas une feature documentée de Hermes. Plutôt que de tordre Hermes, on met un service FastAPI minuscule (~200 lignes) devant. Si un spike démontre qu'Hermes ingère bien des webhooks, on pourra consolider plus tard — l'interface entre les deux est la table `runs`, donc le swap est indolore.

## Pourquoi le Runner est à nous (décision)
Le chemin Hermes→Claude Code via terminal PTY fonctionne (documenté), mais pour les runs déclenchés par webhook on veut un contrôle direct : budgets stricts, parsing JSON, retries, isolation par checkout. Hermes reste le déclencheur pour les loops cron (il peut appeler le Runner via une commande) et le canal d'escalation. Règle simple : **tout chemin d'exécution converge vers le Runner** — un seul endroit où `claude -p` est invoqué.

## Journal de décisions (ADR courts)
1. **Hermes plutôt qu'orchestrateur maison** — réutilise cron/Discord/mémoire/MCP ; on bâtit mince.
2. **Trigger Gateway FastAPI** — webhooks hors-scope de Hermes ; pièce jetable et remplaçable.
3. **Runner unique** — un seul point d'invocation de `claude -p`, budgets appliqués uniformément.
4. **Postgres comme contrat** — tous les composants communiquent par la DB ; couplage faible.
5. **UI dans le MVP, Discord en parallèle** — inbox + fils de projets chat-based dès la Phase 1 ; Discord reste le canal mobile/partner. Les deux écrivent dans `approvals`.
6. **Auth Claude** — démarrer sur le crédit Agent SDK du plan Max 20x (~200 $/mois, dépassement activé) ; basculer sur clé API dédiée si la conso le justifie. Le Runner lit l'auth depuis l'environnement, donc le swap est une variable d'env.
7. **Conversation = chat à agent** — une unité de travail (`thread`) est un chat avec un agent de façade ; les runs sont des cartes dans le flux. La **façade** reste la catégorie + config (`loop`), PAS le chat. Permet la nuance (pas juste oui/non). L'agent enqueue des runs, ne code pas lui-même (voir doc 16).
8. **Conversations (threads) jetables** — une unité de travail = un thread au contexte borné, archivé à la résolution. Plusieurs threads par façade en parallèle. C'est le principal levier anti-coût (pas d'historique cumulé dans le contexte).
9. **Routing de modèles** — Sonnet par défaut pour le code, Opus sur demande explicite par loop, Haiku/cheap (via Hermes) pour classification, résumés et agent de façade.
10. **Une seule DB : Supabase (Postgres managé)** — le VPS (gateway/runner/hermes) ET l'UI Next.js parlent au même Postgres Supabase. L'UI obtient Realtime + auth sans serveur custom à écrire. (Postgres self-hosté reste un fallback, mais on perd Realtime/auth gratuits — défaut = Supabase.)
