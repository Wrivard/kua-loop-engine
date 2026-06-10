# ui/ — UI du moteur kua-loop-engine

Next.js 14 (App Router) + TypeScript + Tailwind + composants shadcn-style.
Esthétique Vercel/Geist (monochrome, flat). Trois surfaces (doc 12) : **Inbox** `/`,
**Projet** `/p/[slug]`, **Conversation** `/c/[id]`. Données via Supabase
(anon key + Realtime). Détails de build : [`BUILD-NOTES.md`](./BUILD-NOTES.md).

## Lancer en local
```bash
cd ui
cp .env.example .env.local   # puis renseigner les 2 variables (voir ci-dessous)
npm install
npm run dev                  # http://localhost:3010
```
Sans variables, l'UI tourne en **mode preview** (données de démo `lib/seed.ts`, sans auth) —
pratique pour explorer l'interface sans backend.

## Variables d'environnement (publiques uniquement)
| Variable | Où la prendre |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Settings > API > clé **anon / publishable** |

⚠️ **Jamais** de `service_role` ni de secret backend côté client : tout `NEXT_PUBLIC_*` est exposé
au navigateur. Le token GitHub, etc. vivent dans le backend (`/srv/kua/.env`), pas ici.

## Déployer sur Vercel
1. Importer le repo GitHub dans Vercel.
2. **Root Directory = `ui/`** (réglage Vercel obligatoire — le repo est un monorepo ; le backend
   Python est ignoré par Vercel grâce à ce réglage). Framework détecté : **Next.js**.
3. Build = `npm run build` (auto). Node ≥ 20 (épinglé via `engines` dans `package.json`).
4. **Environment Variables** (Production + Preview) : `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Deploy. Sans les variables, le déploiement reste fonctionnel en mode preview (démo).

## Auth & comptes
Middleware `@supabase/ssr` : protège toutes les routes hors `/login` **quand** Supabase est configuré
(sinon bypass = preview). Les 2 comptes (William + partner) se créent dans
Supabase > Authentication > Users > Add user.
