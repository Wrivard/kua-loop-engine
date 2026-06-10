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

**Local branché sur le VRAI backend** : `ui/.env.local` est câblé (URL + clé *publishable*/anon récupérée
via le MCP Supabase — clé publique par design, fichier gitignoré). L'UI parle donc au vrai Supabase
en local (fini le mode démo). ⚠️ **Voir les données exige un compte connecté** : le middleware
redirige vers `/login` et la RLS bloque `anon` (vérifié : `/` → 307 `/login`). Crée ton compte
(Supabase → Auth → Users → Add user) puis connecte-toi. Sans `.env.local`, l'UI retombe en mode démo (seed).
Les écrans affichent désormais un **état d'erreur + Réessayer** si une requête backend échoue.

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
- **Armer une façade** : ~~différé~~ → fait. Le modal « + Nouvelle » offre les 5 presets + « Général /
  custom » (façade libre) ; choisir une façade non armée l'**arme à la volée** (`ensureLoop` :
  loop `approve_final` + budget par défaut). `AutonomyPopover` gère ensuite l'autonomie.
- **Créer un projet depuis l'UI** : `NewProjectDialog` (bouton « + » dans la sidebar) → `createProject`
  (slug + nom + repo_url + plan). **repo_url vide = « nouveau projet »** côté Runner (git init).
  ⚠️ Limite : la LIVRAISON d'un run « nouveau projet » (créer le repo distant + PR) n'est pas encore
  branchée (nécessite le token GitHub + API de création de repo) — repos EXISTANTS pleinement OK.

## Questions ouvertes (pour William)
- **Anon key Supabase** : à fournir avant le preview (Dashboard > Settings > API > clé `anon`/publishable).
- **Comptes** : doc 12 dit « 2 comptes en dur ». À créer dans Supabase **Authentication > Users > Add user** (William + partner, email/mot de passe). Je ne peux pas les provisionner (pas de service_role dans l'UI, règle sécu #3). Une fois créés + anon key câblée, le login fonctionne tel quel.
- **RLS** : ✅ **activé** (migration `db/migrations/002_rls_realtime.sql`) — voir « Sécurité & accès » ci-dessous.

## Sécurité & accès (verrouillage — « seulement moi »)
Trois couches, dont 2 déjà en place :

1. **Auth applicative** (✅ code) : `middleware.ts` exige une session Supabase sur **toutes** les
   routes hors `/login` dès que les variables sont configurées. Login = email/mot de passe.
2. **RLS au niveau données** (✅ DB, migration 002) : l'anon key est **publique** (dans le JS du
   client) → sans RLS, n'importe qui lirait/écrirait la DB via l'API REST **sans se connecter**.
   Désormais : seul le rôle `authenticated` (utilisateur connecté) accède ; `anon` = **0 accès**
   (vérifié). Le backend (service_role) bypasse. ⇒ Même en contournant l'UI, pas d'accès sans login.
3. **À FAIRE par toi (dashboard Supabase)** pour fermer complètement :
   - **Authentication → Sign In / Providers → Email → désactiver « Allow new users to sign up »**
     (sinon quelqu'un pourrait se créer un compte via l'anon key). Une fois off, seuls les comptes
     créés à la main existent.
   - **Authentication → Users → Add user** : crée **uniquement** ton compte (+ le partner). Pas d'autre.
   - *(Optionnel, ceinture+bretelles)* Vercel → Settings → **Deployment Protection** : exiger une auth
     Vercel/mot de passe au bord, avant même que l'app charge.

### Variables d'environnement à mettre sur Vercel (et UNIQUEMENT celles-ci)
| Variable | Valeur | Note |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://labzjtqkgbrdxjsqalno.supabase.co` | publique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé **anon/publishable** (Supabase → Settings → API) | publique, OK côté client |

❌ **Ne mets JAMAIS** sur Vercel : `service_role`, `SUPABASE_DB_URL`, `GITHUB_TOKEN`, `SENTRY_WEBHOOK_SECRET` —
ce sont des secrets **backend** (`/srv/kua/.env`). Les déclarer (Production + Preview), redeploy, et
l'app exige le login + la RLS protège les données.

## Connecteurs / Skills / Modèles (modèle global↔projet)
- **Catalogue** = registre en code `kua_core/connectors.py` (source de vérité ; l'UI le **mirroir**
  dans `ui/lib/connectors.ts` jusqu'à ce qu'une API l'expose). Chaque type : champs (secret|config),
  `kind` (api|mcp), `shareable` (github) vs `per_project` (sentry/cloudflare/supabase/discord), + mcp générique.
- **DB** (migration 004) : `connections` (scope app|project, config NON-secrète + `secret_ref`, statut),
  `project_connectors` (binding : enabled + mode inherit|own), `project_skills`, `project_mcp`, `app_settings`.
  RLS authenticated-only (comme 002). **Aucun secret en DB.**
- **Secrets** : `kua_core/secrets.py` → `/srv/kua/secrets/{app.env | project/<id>.env}` (chmod 600),
  clés préfixées par type. La DB ne garde que `secret_ref`.

### Réel vs simulé (aujourd'hui)
- ✅ **Réel** : migration + RLS appliquées ; registre + validateurs (github/cloudflare/sentry/discord) ;
  CLI `kua connector set/test/list` (écrit le secret + valide + fixe le statut) ; Settings (Apparence locale,
  Modèles ⇄ `loops.model`, Connecteurs catalogue + statut, Skills globaux) ; bindings par projet (drawer) ;
  composition `kua_core/composition.py` (+ tests).
- 🟡 **Simulé / via CLI pour l'instant** : **saisie des secrets dans l'UI** + bouton **« Tester »** depuis
  l'UI → exigent la **gateway exposée** (l'UI n'a pas accès aux secrets ni au validateur). En attendant :
  la CLI (commande affichée dans l'UI). Le test/statut se met à jour via `kua connector test`.

### Frontière de sécurité (vérifiée par test)
Un run `claude -p` d'un projet ne reçoit QUE ses creds : `compose_project_context(project_id)` renvoie
`mcp` + `skills` + `secret_refs` **de scope projet uniquement** (`project/<id>.env`), **jamais `app.env`**
(test `test_compose_never_includes_app_creds`). Un connecteur *shareable* en `inherit` (github) est utilisé
par le **Runner** hors du run (push/PR), jamais injecté dans l'env du `claude -p` (cohérent avec l'`clean_env`
de l'exécuteur qui retire déjà les secrets backend).

### Reste à faire
1. **Saisie des secrets + bouton « Tester » depuis l'UI** : via le **bridge MCP** (Partie C) / la gateway —
   le navigateur n'écrit jamais dans `/srv/kua/secrets/`.

### Fait depuis
- ✅ **Composition branchée dans le spawn `claude -p`** (Partie B) : le run d'un projet écrit le `.mcp.json`
  composé dans le checkout, ajoute ses skills au goal, et injecte ses **secrets projet** via `extra_env`
  (mergés APRÈS `clean_env`, qui retire déjà les secrets backend). Prouvé : `SENTRY_AUTH_TOKEN` projet présent,
  `GITHUB_TOKEN` app absent (`test_run_gets_project_secrets_not_app`). Cœur durci du Runner inchangé hormis
  cette greffe encadrée par tests.
- ✅ **Validateurs supabase + mcp** (joignabilité) ajoutés.

## Bridge MCP (wizard « + Ajouter MCP ») — Partie C
Installer un MCP comme dans le terminal claude : Claude guide, donne les URL d'auth, exécute —
le tout branché sur le VPS.

**Sécurité (non-négociable, testée)** :
- **Allowlist STRICTE** (`gateway/app/mcp_bridge.py`) : seulement `claude mcp {add,list,remove,get}`
  et `kua connector {set,test,list}`. Tout le reste REFUSÉ avant exécution (pas de shell libre, pas
  de `rm`/`curl`). `shlex` + argv exécuté direct (jamais `shell=True`).
- **kua-engine** (jamais root) — imposé par le systemd unit. Chaque commande **loggée** (audit JSON).
- **WS authentifié obligatoire** : 1er message = token court-terme (HMAC `BRIDGE_SECRET`, exp ~5 min)
  émis par la route Next `/api/mcp-bridge/token` (authentifiée par le login Supabase). Le **secret
  long-terme reste côté serveur** (jamais NEXT_PUBLIC, jamais dans le navigateur).
- Secrets jamais ré-affichés (le bridge ne lit pas les fichiers de secrets).

**Réel (vérifié en local, 92 tests)** : allowlist (`claude mcp list` s'exécute / hors-allowlist refusé),
tokens (round-trip/exp/tamper), WS (auth rejetée / commande refusée). Guidage `claude -p` advisory
(plan Max, **aucune clé API**). UI : terminal `McpWizard` (stream, URL cliquables, saisie OAuth) dans
Settings → Connecteurs (scope app) ET le drawer projet (scope projet).

**Bring-live (À FAIRE avec William — fichiers prêts, RIEN activé)** :
1. **DNS** : `A engine.kua.quebec → IP du VPS`.
2. **Caddy + systemd** (sudo) : `deploy/Caddyfile` (bloc `engine.kua.quebec` → `127.0.0.1:8001`) +
   `deploy/kua-mcp-bridge.service` → `sudo systemctl enable --now kua-mcp-bridge` ; recharger Caddy.
   (Ports 80/443 ouverts pour le TLS Let's Encrypt.)
3. **Secrets** : `BRIDGE_SECRET=<aléatoire long>` dans `/srv/kua/.env` (gateway + bridge) ; sur **Vercel** :
   `NEXT_PUBLIC_BRIDGE_URL=wss://engine.kua.quebec/mcp-bridge` + `BRIDGE_SECRET` (server-side, PAS public).
4. **1er install MCP réel** (OAuth) ensemble : ouvrir le wizard → « Guide » → lancer `claude mcp add …`
   → coller le code OAuth → vérifier `claude mcp list`.

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
