# 15 — Façade E : Finir le site web (client qui a accepté la démo)

## Le chaînon manquant
C'est la suite directe de la Façade B : démo montrée au meeting → le client signe → il faut maintenant produire le **site complet**. Aujourd'hui c'est le gros bloc de travail manuel de William. La façade transforme ça en un run long, structuré, par lots de pages.

## Trigger
**Manuel et explicite** : sur la carte du run démo (UI) ou via Discord, action « ✅ Client a accepté ». Ça ouvre un mini-formulaire de brief (les seuls champs nécessaires) :
- Forfait vendu (pages incluses), contenus fournis par le client (logo, photos, textes ?), domaine, échéance.
Le brief est commité dans le repo (issu du repo démo, promu en repo client) : `.kua/site-brief.yaml`.

## Pipeline (run long, par lots)
1. **Promotion du repo** : le repo démo devient le repo client officiel ; onboarding agent-ready complet (doc 04) ; loops bugfix/discord armées d'office en `approbation`.
2. **Plan de pages** : Claude lit le brief + le gabarit Küa du vertical → propose la liste des pages restantes (services, à propos, contact, soumission complète, pages villes si SEO inclus) → **William approuve le plan** (c'est un run `awaiting_approval` dont le livrable est le plan, pas du code).
3. **Génération par lots** : un run par lot de `config.pages_per_batch` (défaut 3) pages → `/verify-app` + screenshots → preview → approbation par lot. Les contenus manquants (photos pas fournies) = placeholders marqués `TODO-CLIENT` listés dans le résumé.
4. **Finition** : run final — SEO on-page de base, sitemap, formulaires branchés, responsive vérifié → checklist de mise en ligne livrée à William (DNS et go-live restent humains).

## Garde-fous
- Identité Küa + gabarit du vertical = la base ; pas de génération free-style.
- Aucun fait inventé sur le client : tout vient du brief. Manque d'info → placeholder + question dans le fil, jamais d'invention.
- `budget_usd: 15` par lot ; le total doit rester sous la marge du forfait vendu.
- Mode `approve_final` obligatoire (jamais `auto`) — c'est le produit livré au client.

## Critères d'acceptation (MVP)
- [ ] « Client a accepté » sur une démo → brief → plan de pages proposé et approuvable dans le fil.
- [ ] Un lot de 3 pages généré, preview, approuvé, mergé.
- [ ] Les TODO-CLIENT sont listés et visibles dans le fil du projet.
- [ ] Le repo sort de la façade complètement agent-ready (bugfix/discord armés).
