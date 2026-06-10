# kua-loop-engine UI — notes de build

> Construit en autonomie (William absent). Mis à jour au fil des milestones.
> Spec : `docs/12-FRONTEND-UI.md`. Données : `docs/03-DATA-MODEL.md`.

## Comment prévisualiser
```bash
cd ui
# 1) renseigner les 2 variables publiques (anon key, JAMAIS service_role) :
cat > .env.local <<'ENV'
NEXT_PUBLIC_SUPABASE_URL=https://labzjtqkgbrdxjsqalno.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ta clé anon / publishable>
ENV
npm install
npm run dev      # http://localhost:3010
```
L'URL Supabase est connue ; l'**anon key** doit être fournie par William (cf. Questions).

## Déploiement Vercel
- Connecter le repo GitHub à Vercel, **Root Directory = `ui/`**.
- Variables d'env du projet Vercel : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Framework détecté : Next.js. Build = `npm run build`. Aucune autre config.

## Décisions (alignées doc 12, prises en autonomie)
- **Node 22.22.3** (déjà présent, user-space) au lieu de nvm+Node 20 LTS : compatible Next 14,
  évite tout blocage pendant l'absence. (Node 22 = ligne LTS.)
- **shadcn/ui « manuel »** : pas la CLI interactive (risque de prompt/réseau). On installe ses
  dépendances (Radix, class-variance-authority, clsx, tailwind-merge, lucide-react) et on crée
  les composants `components/ui/*` à la main, à l'identique du registre shadcn.
- **Auth** : `@supabase/ssr` (sessions cookie, middleware App Router) — recommandé pour Next 14.
- **Client Supabase résilient** : si les env publiques manquent, l'app ne crashe pas au build ni
  au démarrage ; elle affiche un état « configuration manquante » (le build doit passer sans secret).
- **Esthétique** : minimalisme raffiné Vercel/Geist (monochrome, flat, 1px). Couleur = identité
  façade (liseré/point) + statut run (pills sémantiques), jamais mélangés (doc 12).
- **ESLint** : `next/core-web-vitals` avec `react/no-unescaped-entities` **désactivé** (UI 100 %
  française → apostrophes partout, la règle est du bruit). Dark mode par défaut (`<html class="dark">`).

## Questions ouvertes (pour William)
- **Anon key Supabase** : à fournir avant le preview (Dashboard > Settings > API > clé `anon`/publishable).
- **Comptes** : doc 12 dit « 2 comptes en dur ». À créer dans Supabase **Authentication > Users > Add user** (William + partner, email/mot de passe). Je ne peux pas les provisionner (pas de service_role dans l'UI, règle sécu #3). Une fois créés + anon key câblée, le login fonctionne tel quel.
- **RLS** : désactivé côté DB. Tant qu'il l'est, l'anon key lit/écrit tout. À durcir avant prod (hors scope UI).

## État par écran
Légende : ✅ FAIT · 🟡 PARTIEL · ⬜ À FAIRE

| Bloc | État | Détail |
|------|------|--------|
| **Setup** (M1) | ✅ FAIT | Next 14 App Router + TS strict + Tailwind tokens (CSS vars) + shadcn manuel (button/card/badge/skeleton/input/textarea/dialog/popover) + Geist + dark mode + client Supabase résilient. `build` + `lint` OK. |
| **Couche données** (M2) | ✅ FAIT | `lib/types.ts` (miroir des 7 tables), `lib/facade.ts` (couleurs/labels/icônes + pills statut), `lib/queries.ts` (projets, inbox, threads, messages+run, coût mois, écritures approval/message), `lib/use-live-query.ts` (refetch sur Realtime). Pas encore branché sur un écran. |
| **Auth** (M3) | ✅ FAIT | `middleware.ts` (gate `@supabase/ssr`, protège toutes les routes hors `/login`), `app/login` (email/password), `lib/auth.ts` (`useCurrentUser`, `currentIdentity` pour `decided_by`, `signOut`). **Résilient** : sans Supabase, bypass → mode preview. Les 2 comptes restent à créer côté Supabase (voir Questions). |
| **Inbox** `/` (M4) | ⬜ À FAIRE | Conversations à confirmer, groupées par projet, action inline Oui/Refaire, mobile-first, état vide « Rien à confirmer ». |
| **Projet** `/p/[slug]` (M5) | ⬜ À FAIRE | Liste des conversations, filtres façade (couleur+compte) + « Nouvelle », Archivées repliables, header coût du mois. |
| **Conversation** (M6) | ⬜ À FAIRE | Chat user/agent + cartes run (Demandé/Fait, avant-après, Oui/Refaire), composer → agent, liseré façade, pill statut. |
| **Actions** (M7) | ⬜ À FAIRE | Oui/Refaire → `approvals` (decided_by = user courant), mises à jour live Realtime. |
| **Polish** (M8) | ⬜ À FAIRE | États vides/chargement/erreur, responsive, accessibilité, BUILD-NOTES final. |

> Artefacts hors-UI repérés au checkpoint : `ui/install.cmd` (bootstrap Claude Code Windows, tombé là par erreur — **non commité**, à supprimer) ; `tsconfig.tsbuildinfo` ajouté au `.gitignore`.
