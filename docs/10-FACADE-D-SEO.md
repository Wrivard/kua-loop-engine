# 10 — Façade D : SEO mensuel

## Trigger
Cronjob Hermes mensuel par client premium (`schedule` de la loop, ex. 1er du mois 6h) → `kua run --project X --facade seo`.

## Goal (3 volets, un run)
1. **Audit technique** : meta/titles, vitesse (Lighthouse si dispo), liens cassés, sitemap, données structurées, mobile.
2. **Contenu pSEO** : selon `config.pseo` de la loop (vertical × villes, gabarit du client), générer/mettre à jour des pages dans le template existant. Périmètre borné : `config.max_pages_per_run` (défaut 5).
3. **Opportunités backlinks** : IDENTIFICATION seulement — annuaires légitimes du créneau, partenaires locaux, mentions non liées. JAMAIS de soumission automatique (risque de pénalité Google = risque business pour le client).

## Livrables
- Rapport markdown (audit + actions prises + opportunités) → posté dans le channel client + `kua-loops-alerts`.
- PRs draft des pages générées. AUCUNE publication automatique : la marque du client est en jeu ; William (ou le client selon le forfait) approuve.

## Garde-fous
- `budget_usd: 10`, `timeout_min: 45`. Le coût du run doit être intégré au prix du forfait premium.
- Contenu en français québécois correct ; ton du client respecté (depuis son CLAUDE.md).
- Pas d'invention de faits sur le client (services, zones desservies) — uniquement depuis `config.business_facts` versionné dans le repo.

## Critères d'acceptation
- [ ] Le cron du client cobaye produit rapport + ≤5 PRs de pages, dans le budget.
- [ ] Le rapport distingue clairement « fait » vs « recommandé » vs « opportunités backlinks (action humaine) ».
