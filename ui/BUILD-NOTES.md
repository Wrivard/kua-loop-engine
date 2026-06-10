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
- **Seed de démo** (`lib/seed.ts`) : tant que Supabase n'est pas configuré, les écrans rendent un
  dataset réaliste (« journée type » de doc 12). Bascule auto sur le live dès l'anon key câblée.
  Les écritures (approval/message/loop/thread) sont des **no-ops** en preview (l'UI met à jour en optimiste).
- **Routes** : Inbox `/`, Projet `/p/[slug]`, Conversation `/c/[id]`. ⚠️ `projects` n'a pas de colonne
  `slug` (doc 03) → le param `[slug]` = l'**id du projet** (`getProjectBySlug` filtre sur `id`). Le seed
  utilise des ids lisibles ; recommandé d'ajouter une colonne `slug` plus tard pour de jolies URLs.
- **Orchestration (ultracode)** : construction des écrans **inline** (cohérence/ADN visuel, compilation
  incrémentale), puis **revue adversariale multi-agents** (workflow `ui-review`, 7 dimensions :
  design/doc12, vocabulaire, a11y, TS-Next, sécurité, responsive, données-realtime ; chaque trouvaille
  vérifiée indépendamment avant correction).
- **Avant/après** : la maquette prévoit des captures côte à côte via le gate navigateur ; le schéma
  `runs` (doc 03) n'a pas de champ screenshot. La carte de run rend donc un cadre « Avant (prod) / Après
  (aperçu) » avec lien vers `preview_url` ; les vraies captures viendront du gate navigateur (hors scope UI).
- **Armer une façade** : créer une nouvelle ligne `loops` (façade non encore armée) est différé — l'UI
  gère l'**autonomie** des façades déjà armées (`AutonomyPopover` → `enabled`/`autonomy`). L'armement
  initial passe par le cycle de vie / `loops.yaml` (backend). Voir Questions.

## Questions ouvertes (pour William)
- **Anon key Supabase** : à fournir avant le preview (Dashboard > Settings > API > clé `anon`/publishable).
- **Comptes** : doc 12 dit « 2 comptes en dur ». À créer dans Supabase **Authentication > Users > Add user** (William + partner, email/mot de passe). Je ne peux pas les provisionner (pas de service_role dans l'UI, règle sécu #3). Une fois créés + anon key câblée, le login fonctionne tel quel.
- **RLS** : désactivé côté DB. Tant qu'il l'est, l'anon key lit/écrit tout. À durcir avant prod (hors scope UI).

## État par écran
Légende : ✅ FAIT · 🟡 PARTIEL · ⬜ À FAIRE

| Bloc | État | Détail |
|------|------|--------|
| **Setup** (M1) | ✅ FAIT | Next 14 App Router + TS strict + Tailwind tokens (CSS vars) + shadcn manuel (button/card/badge/skeleton/input/textarea/dialog/popover) + Geist + dark mode + client Supabase résilient. `build` + `lint` OK. |
| **Couche données** (M2) | ✅ FAIT | `lib/types.ts` (miroir des 7 tables), `lib/facade.ts` (couleurs/labels/icônes + pills statut), `lib/queries.ts` (projets, inbox, threads, messages+run, coût mois, sidebar, écritures approval/message/loop/thread), `lib/use-live-query.ts` (refetch Realtime, canal par instance, filtres par table). Branché sur tous les écrans. |
| **Auth** (M3) | ✅ FAIT | `middleware.ts` (gate `@supabase/ssr`, protège toutes les routes hors `/login`), `app/login` (email/password), `lib/auth.ts` (`useCurrentUser`, `currentIdentity` pour `decided_by`, `signOut`). **Résilient** : sans Supabase, bypass → mode preview. Les 2 comptes restent à créer côté Supabase (voir Questions). |
| **App shell + composants** | ✅ FAIT | Sidebar (Inbox + projets : compte « à confirmer » + points de façades) + drawer nav mobile + footer user/déconnexion. Kit partagé : FacadeDot/Icon/Tag, StatusPill, ThreadRow, RunCard, RunDetailsDrawer, ApprovalActions, MessageBubble, Composer, AutonomyPopover, NewConversationDialog, EmptyState. |
| **Inbox** `/` (M4) | ✅ FAIT | Conversations à confirmer groupées par projet, Oui/Refaire inline → retrait optimiste (inbox zéro), skeletons, état vide « Rien à confirmer 🎉 ». Mobile-first. |
| **Projet** `/p/[slug]` (M5) | ✅ FAIT | Header (plan · coût du mois · moteur), chips-filtres (Tout + façade couleur+compte) + « Nouvelle », panneau d'autonomie contextuel, liste actives + « Archivées · N » repliable. |
| **Conversation** `/c/[id]` (M6) | ✅ FAIT | Header (retour projet, liseré façade, sujet, pill statut), fil chronologique (texte → bulle, run → carte Demandé/Fait + avant-après + Oui/Refaire), composer collant → agent, messages optimistes, auto-scroll. |
| **Actions** (M7) | ✅ FAIT | Oui/Refaire (`ApprovalActions`) → `approvals` avec `decided_by` = utilisateur courant ; Realtime via `useLiveQuery` (abonnements postgres_changes + refetch) sur tous les écrans ; mises à jour optimistes. |
| **Polish** (M8) | ✅ FAIT | Revue adversariale multi-dimensions (workflow `ui-review`) → 28/29 correctifs appliqués (voir ci-dessous). États vides/chargement/erreur en place. `build` + `lint` clean ; smoke-test : toutes les routes en 200. |

> Artefacts hors-UI repérés au checkpoint : `ui/install.cmd` (bootstrap Claude Code Windows, tombé là par erreur — **non commité**, à supprimer) ; `tsconfig.tsbuildinfo` ajouté au `.gitignore`.

## Revue adversariale (M8)
Workflow `ui-review` : 7 dimensions en parallèle (design/doc12, vocabulaire, a11y, TS-Next, sécurité,
responsive, données-realtime), chaque trouvaille **vérifiée indépendamment** avant correction.
**33 trouvailles brutes → 29 confirmées → 28 corrigées** (commit `fix(ui): M8 correctifs…`).
Faits marquants corrigés : autonomie sortie du canal couleur (monochrome strict) ; vocabulaire run vs
agent de façade ; canal Realtime unique par instance (collision desktop/drawer) ; statut de run qui suit
le Realtime ; réconciliation des messages optimistes ; fallback conversation sur les runs (parité live↔seed) ;
anti-zoom iOS ; coupe des URLs longues ; open-redirect du login ; aria-pressed/expanded/labels.

## Limites connues (suivi)
- **`last_message_preview`** affiche le résumé du dernier *run*, pas le dernier *message* (nit de revue,
  cohérent seed↔live). Pour coller à la maquette : calculer le vrai dernier message (embarquer
  `messages` dans les requêtes de liste ou exposer une vue Postgres). Différé (faible valeur / coût payload).
- **Création de conversation** (`+ Nouvelle`) et **réponses d'agent** : sans backend (preview), non
  persistées / pas de réponse. Fonctionnels dès Supabase + Runner câblés.
- **Armement d'une façade neuve** (créer une ligne `loops`) : différé (cycle de vie / `loops.yaml` backend).
- **RLS désactivé** : à durcir avant prod (hors scope UI).
