# 01 — Vision & contexte

## Le business
Küa est une agence montréalaise : sites web + micro-SaaS pour PME québécoises (~30 clients). Produits récurrents : apps de booking (salons de coiffure, restaurants), sites vitrines avec forfaits SEO. Acquisition : cold-call → démo de site faite dans la semaine → meeting.

Deux personnes :
- **William** : build, code, approuve. Travaille activement le jour avec Claude Code (workflow Boris).
- **Partner** : relation client + cold-call. Fait l'intake (Discord surtout) et peut **approuver les runs comme William** (mêmes droits dans l'UI). Quand un client demande un changement, le partner colle la demande dans le channel Discord du client.

## Le problème
Chaque app a des bugs à fixer, chaque site premium a du SEO mensuel à faire, chaque demande client est du travail manuel, chaque démo de prospection prend des heures. William ne scale pas.

## La solution — deux modes, une fondation
1. **Mode actif (le jour)** : William travaille avec Claude Code direct, à la Boris Cherny — sessions parallèles, Plan mode, slash commands. Rien à bâtir ici.
2. **Mode loops (always-on)** : un VPS fait rouler Hermes + le moteur. Des événements déclenchent des runs Claude Code sur les repos clients. Les livrables sont reviewables ; William approuve depuis Discord ou l'UI.
3. **Fondation commune** : chaque repo client est « agent-ready » (CLAUDE.md, permissions, commands, loops.yaml). Les deux modes utilisent exactement les mêmes primitives.

## Principes hérités du workflow Boris Cherny
- **Vanilla d'abord** : Claude Code out-of-the-box + primitives dans git. Pas de customisation exotique.
- **Vérification = qualité** : chaque run a une gate (tests, build, navigateur). Sans gate, pas de loop fiable (2–3× la qualité selon Cherny).
- **Compound engineering** : chaque erreur corrigée enrichit le CLAUDE.md du repo. Les sessions futures (humaines ou loops) en profitent.
- **Permissions, pas YOLO** : pré-autoriser les commandes sûres, jamais skip global.
- **L'humain steer, l'agent exécute** : les modes d'autonomie encodent le niveau de confiance, promu loop par loop.

## La divergence assumée avec Boris
Boris surveille activement 10–15 sessions toute la journée. William veut l'inverse pour les loops : que ça roule **sans** surveillance, avec une couche d'observation asynchrone (Discord + UI) qui remplace l'attention humaine. C'est la seule pièce que Boris n'a pas et qu'on construit.

## Les 5 façades (familles de loops)
| Façade | Trigger | Livrable | Priorité |
|---|---|---|---|
| A — Bug-fix | Webhook Sentry / PostHog | PR draft + test régression | **MVP (Phase 1)** |
| C — Demandes client | Message Discord (intake partner) ou composer UI | Diff avant/après + push après approbation | MVP (Phase 2) |
| B — Démos | Événement calendrier | Preview deployée + lien Discord | MVP (Phase 2) |
| E — Finir le site | « Client a accepté » (manuel, depuis la démo) | Plan de pages approuvable + lots de pages en preview | MVP (Phase 2) |
| D — SEO mensuel | Cron (clients premium) | Rapport + PRs draft de pages | Phase 3 |

L'enchaînement naturel du cycle de vie client : **B (démo) → E (site complet) → A + C + D (vie du site)**. L'UI chat-based (doc 12) est le poste de pilotage de tout ça dès le MVP.
