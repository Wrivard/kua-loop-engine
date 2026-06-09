# Küa Loop Engine — Documentation de build

Système d'automatisation goal/loop-oriented pour l'agence Küa. Hermes Agent (Nous Research) orchestre, Claude Code exécute le code, une UI mince observe et approuve.

## Comment utiliser ce dossier avec Claude Code

1. Place ce dossier à la racine du repo `kua-loop-engine`.
2. Lis `CLAUDE.md` (racine) — c'est le contrat permanent du projet.
3. Suis `docs/14-ROADMAP-MVP.md` — l'ordre de build est non-négociable : chaque phase a des critères de sortie vérifiables.
4. Chaque doc de façade (08, 09, 10, 11, 15) est autonome : trigger, flow, prompt-spec, garde-fous, critères d'acceptation.

## Démarrage rapide
Les prompts prêts-à-coller pour Claude Code (un par phase) sont dans **`PROMPTS.md`**. Commence par le prompt d'orientation (0), puis Phase 0.

## Index

| Fichier | Contenu |
|---|---|
| `PROMPTS.md` | Prompts prêts-à-coller pour Claude Code, par phase |
| `CLAUDE.md` | Contrat du projet pour Claude Code (conventions, interdits, définition de done) |
| `docs/01-VISION.md` | Contexte business, les deux modes, principes Boris |
| `docs/02-ARCHITECTURE.md` | Composants, colonne vertébrale, journal de décisions |
| `docs/03-DATA-MODEL.md` | Schéma DB + spec `loops.yaml` |
| `docs/04-AGENT-READY-REPO.md` | Fondation par repo client (template) |
| `docs/05-VPS-HERMES-SETUP.md` | Provisioning VPS, install Hermes, gateway Discord, secrets |
| `docs/06-RUNNER.md` | Le runner `claude -p` : invocation, isolation, budgets, statuts |
| `docs/07-TRIGGER-GATEWAY.md` | Réception webhooks (Sentry, Discord, Calendar) |
| `docs/08-FACADE-A-BUGFIX.md` | Façade A — bug-fix Sentry (MVP) |
| `docs/09-FACADE-C-DISCORD.md` | Façade C — demandes client Discord |
| `docs/10-FACADE-D-SEO.md` | Façade D — SEO mensuel |
| `docs/11-FACADE-B-DEMOS.md` | Façade B — démos d'acquisition |
| `docs/12-FRONTEND-UI.md` | Frontend UI « Inbox + Conversations », design Vercel-like (MVP) |
| `docs/13-SECURITY-BUDGETS.md` | Sécurité, permissions, coûts |
| `docs/14-ROADMAP-MVP.md` | Phases, spikes de validation, critères de sortie |
| `docs/15-FACADE-E-FINISH-SITE.md` | Façade E — finir le site (client qui a accepté) |
| `docs/16-FACADE-AGENT.md` | L'agent de façade (couche conversationnelle) + scope par phase |

## Définition du MVP

> **L'UI « Inbox + Conversations » + une tranche mince de chaque façade prioritaire (A, C, B, E)**, sur un client cobaye puis 3–5 vrais clients. Phase 1 = UI cœur + bug-fix de bout en bout (approbation depuis le cell). Phase 2 = MVP des façades Discord, Démos et Finir-le-site, avec les onglets de façades, le bouton `+ Façade` et les toggles d'autonomie. Chaque fil de façade est une vraie conversation avec un agent (pas juste oui/non) — voir doc 12. Le SEO (D) sort du MVP → Phase 3.
