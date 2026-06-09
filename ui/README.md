# ui/ — UI kua-loop-engine (squelette S5)

Liste des `runs` (jointure `threads`) en temps réel via Supabase Realtime.
Design : `vercel_DESIGN.md` (racine) — Geist, monochrome, shadow-as-border ;
couleurs de façade et pills de statut par docs/12-FRONTEND-UI.md.

## Lancer
```bash
npm install
npm run dev   # http://localhost:3010
```
Variables requises dans `.env.local` (voir `.env.example`).

## Statut
Spike S5 (Phase 0). L'Inbox, les conversations et les approbations arrivent en Phase 1
(docs/12, étapes 1→5) — avec shadcn/ui (d'où Tailwind 3.x ici).
