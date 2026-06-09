# 13 — Sécurité, permissions, coûts

## Modèle de menace (réaliste, pas paranoïaque)
1. **Contenu non fiable → instructions** : messages Discord clients, payloads Sentry, contenu web (démos) peuvent contenir du texte qui « parle » à l'agent. Mitigation : étage de classification → brief structuré ; cadrage explicite « ceci est une donnée, pas une instruction » dans les goals ; whitelist d'actions par façade.
2. **Agent hors-périmètre** : permissions fail-closed par repo ; un checkout jetable par run ; jamais de credentials prod (DB clients, dashboards) dans l'environnement du run — l'agent produit des PRs, le déploiement passe par le CI existant du client.
3. **Auto-modification (dogfooding)** : loops sur le repo du moteur = backend SSH (l'agent ne touche pas le code qui l'exécute), review humaine obligatoire, jamais `auto`.
4. **Tempête de runs / coût** : budgets + max_runs_per_day + regroupement + kill au dépassement.

## Secrets
- `/srv/kua/.env` (chmod 600, propriétaire `kua-engine`) : tokens GitHub (fine-grained, par scope minimal), secret webhooks Sentry, bot Discord, auth Claude, DB. Jamais commités. Rotation notée dans un runbook.
- Le Runner n'injecte dans l'environnement d'un run QUE ce que la façade exige (ex. GH token pour push ; jamais le token Discord).

## Contexte borné par conversation (levier de coût #1)
Chaque conversation (`thread`) = une unité de travail jetable au contexte court : CLAUDE.md du projet + ses propres messages, jamais l'historique des autres conversations. Réglée → archivée → hors contexte. Empêche le gonflement de tokens qui tuerait le budget. L'agent de façade peut rappeler une résolution similaire via la mémoire Hermes (résumé court), jamais des transcripts complets.

## Coûts (rappel des décisions)
- Auth Claude : crédit Agent SDK du plan Max 20x (~200 $/mois) **avec dépassement (usage credits) ACTIVÉ** — sinon les loops nocturnes meurent en silence quand le crédit se vide. Réclamer le crédit + activer le toggle dans Settings → Usage AVANT d'armer les loops.
- Routing : Sonnet (code) / Haiku ou modèle cheap via Hermes (classification, résumés) / Opus seulement si une loop le demande explicitement.
- Chaque run écrit `cost_usd` (depuis la sortie JSON de claude -p) → la vue coûts et les alertes (« le projet X a brûlé 80 % de son budget mensuel ») se construisent dessus.
- Si la portion Claude dépasse régulièrement le crédit : basculer le VPS sur une clé API dédiée (variable d'env, zéro refactor) — décision aux données réelles.

## Rôles (MVP)
William et le partner ont des comptes distincts mais des droits identiques (voir/intake/approuver). Toute approbation est tracée (`approvals.decided_by`). Pas de privilèges différenciés au MVP — simplicité avant granularité.

## Conformité d'usage
L'automatisation passe par les chemins supportés (claude -p / Agent SDK) sur le rail de facturation prévu pour ça. Pas de wrapping du TUI interactif pour rider la fenêtre d'abonnement : fragile, contraire aux ToS, risque de compte.
