# 14 — Roadmap & critères de sortie

> Règle : on ne passe pas à la phase suivante tant que les critères de sortie ne sont pas TOUS verts. Le MVP inclut l'UI ET une tranche mince de chaque façade prioritaire.

## Phase 0 — Spikes & plomberie (1 repo cobaye)
But : tuer les risques d'intégration AVANT d'écrire le système.
- **S1** : cronjob Hermes → commande shell → résultat posté sur Discord.
- **S2** : message Discord dans un channel → Hermes déclenche une commande locale.
- **S3** : `claude -p … --output-format json` sur le VPS avec l'auth choisie → JSON parsé (résultat + coût). Vérifier les flags réels (`claude --help`).
- **S4** : webhook test signé → FastAPI → ligne `runs(queued)` en DB.
- **S5** : page Next.js qui liste la table `runs` en realtime (le squelette UI existe dès le départ).
- Plomberie : schéma DB migré, systemd (gateway, runner, hermes), repo cobaye agent-ready, `kua sync` OK.
**Sortie** : `kua run --project cobaye --facade bugfix --goal-extra "tâche bidon"` → PR draft + message Discord + la carte du run visible dans l'UI squelette.

## Phase 1 — MVP cœur : UI + Façade A
- **UI** (doc 12, étapes 1→3) : inbox groupée par projet + actions rapides Oui/Refaire + **fil de façade comme conversation** (messages-run + messages texte + composer relié à l'agent de façade). Mobile OK.
- **Façade A bugfix** (doc 08) au complet : webhooks Sentry (PostHog si dispo sur le cobaye), dédup, anti-bruit, gate exigée, budgets appliqués (kill testé).
- Approbation fonctionne depuis l'UI **et** Discord, indifféremment (même table `approvals`).
**Sortie** : les critères de 08 verts sur une vraie erreur de prod, approuvée depuis le cell dans l'UI.

## Phase 2 — MVP des façades restantes (tranches minces)
Ordre : C → B → E. (D SEO sort du MVP — voir plus bas.)
- **C Discord/modifs** (doc 09) : whitelist `text_change` + `image_swap`, classification Hermes, intake aussi via le composer UI.
- **B Démos calendrier** (doc 11) : polling calendrier → démo 2 pages sur gabarit → preview → lien Discord + carte UI.
- **E Finir le site** (doc 15) : bouton « Client a accepté » → brief → plan approuvable → 1 lot de pages de bout en bout.
- **UI** : barre d'onglets de façades + bouton `+ Façade` + popover d'autonomie (étape 4) + drawer détail (étape 5).
**Sortie** : critères d'acceptation de 09, 11 et 15 verts ; les 4 façades visibles et pilotables dans l'UI ; 3–5 vrais clients onboardés sur A et C.

## Phase 3 — SEO + coûts + échelle
- **D SEO mensuel** (doc 10) sur les clients premium.
- Ligne de coût mensuel par projet dans l'UI ; comparaison à la calculatrice ; ajustement du routing de modèles.
- Onboarding du reste des ~30 clients (commande `kua onboard` industrialisée).
**Sortie** : un mois complet de cron SEO sans incident ; coût réel mesuré.

## Phase 4 — Dogfooding & promotion d'autonomie
- Le repo du moteur devient un projet (règles 13 §3 : SSH, jamais auto).
- Promotion sélective de loops éprouvées vers `auto` (ex. démos).
**Sortie** : une amélioration du moteur livrée par une de ses propres loops ; ≥1 loop en `auto` stable depuis 2 semaines.

## Hors-scope explicite
Automatisation des emails clients ; multi-tenant/SaaS ; auto-merge prod par défaut ; backlinks automatisés ; remplacement de Hermes ; graphiques de coûts élaborés ; gestion d'équipe dans l'UI.
