# 11 — Façade B : Démos d'acquisition (MVP — Phase 2)

## Le flux humain
Cold-caller obtient un meeting → crée l'événement dans le calendrier (convention de titre : `DEMO — {Nom du commerce} — {ville}`) → le système génère la démo → le lien preview est envoyé au partner sur Discord avant le meeting.

## Trigger
MVP : **polling** du calendrier par un cronjob Hermes (toutes les 30 min, via MCP Google Calendar ou API) — plus simple et plus fiable qu'un webhook push au départ. Dédup par event_id.

## Pipeline
1. **Brief** : extraire nom/ville du titre ; recherche web cadrée (site existant ?, Google Business, services, photos publiques) → brief structuré JSON (mêmes principes que le « context MCP » exploré pour LeadBase QC : le brief est la seule entrée de la génération).
2. **Génération** : instancier le **template démo Küa** (repo gabarit : accueil + page soumission, slots de marque/couleurs/services). PAS de génération libre : on paramètre un gabarit éprouvé → fiabilité + vitesse + identité Küa.
3. **Deploy preview** : Vercel/Cloudflare Pages → URL `demo-{slug}.kua.quebec`.
4. **Livraison** : message Discord au partner : lien + 3 points de pitch extraits du brief. `awaiting_approval` est optionnel ici (le livrable est une preview interne, pas la prod d'un client) — autonomy `auto` acceptable une fois la façade éprouvée.

## Garde-fous
- Aucune mise en ligne publique indexable (noindex sur les previews) ; données du prospect = publiques seulement.
- `budget_usd: 8` ; si la recherche ne trouve pas assez d'infos fiables, livrer la démo générique du vertical + le signaler.

## Critères d'acceptation
- [ ] Événement calendrier créé → ≤45 min plus tard, lien preview dans Discord.
- [ ] La démo charge, est sur le gabarit Küa, contient le nom/ville/vertical du prospect, noindex.

## Handoff vers la Façade E
Quand le client accepte au meeting : action « ✅ Client a accepté » sur la carte du run démo (UI ou Discord) → déclenche la Façade E (doc 15) : promotion du repo démo en repo client + brief + plan de pages. La démo n'est jamais une fin en soi — c'est l'amorce du repo final.
