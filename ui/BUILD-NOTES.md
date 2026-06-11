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
- Framework détecté : Next.js. Build = `npm run build`. Aucune autre config.
- **Contrat d'env Vercel complet** : voir la section « Cloudflare Tunnel + Access » ci-dessous.

## Cloudflare Tunnel + Access — exposition de la gateway (remplace Caddy/DNS public)

**L'approche Caddy + DNS public A est ABANDONNÉE.** La gateway est exposée via **Cloudflare
Tunnel + Zero Trust Access**. Chaîne : UI Vercel (serveur) → `https://engine.oryon-temple.ca`
→ **Cloudflare Access** (protège TOUT le hostname) → tunnel `cloudflared` → gateway `localhost:8000`.
- **Humains** : s'authentifient auprès d'Access par courriel (politique Access).
- **UI Vercel** : s'authentifie par un **SERVICE TOKEN Cloudflare** (en-têtes `CF-Access-Client-Id`
  / `CF-Access-Client-Secret`), envoyés par CHAQUE appel serveur UI→gateway **en plus** du bearer
  `INTERNAL_TOKEN`. Tout est centralisé dans `ui/lib/gateway.ts` (`gatewayProxy` / `gatewayHealth`),
  utilisé par les routes Système (sysctl), create-repo et /health.
- **Secrets serveur uniquement** : lus via `process.env` sans préfixe `NEXT_PUBLIC_` dans un module
  server-only (importe `next/headers`) → **jamais dans le bundle client** (vérifié). Si un secret
  manque → état « non configuré » propre (le panneau Système / les boutons affichent un message,
  pas de crash).

**Contrat d'env Vercel (à renseigner par William)** :

| Portée | Variable | Valeur |
|---|---|---|
| **serveur** | `GATEWAY_INTERNAL_URL` | `https://engine.oryon-temple.ca` |
| **serveur** | `INTERNAL_TOKEN` | = exactement celui de `/srv/kua/.env` (bearer `/internal/*`) |
| **serveur** | `CF_ACCESS_CLIENT_ID` | service token Cloudflare → en-tête `CF-Access-Client-Id` |
| **serveur** | `CF_ACCESS_CLIENT_SECRET` | service token Cloudflare → en-tête `CF-Access-Client-Secret` |
| **serveur** | `SYSTEM_ADMIN_EMAILS` | `wrivard@kua.quebec` (verrouille le contrôle au seul admin) |
| **client** | `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase (publique par design) |
| **client** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon/publishable (publique par design) |

**JAMAIS de `GITHUB_TOKEN` dans Vercel** : il reste sur le VPS (la gateway crée les repos). Les noms
de variables côté Vercel utilisent `_` (`CF_ACCESS_CLIENT_ID`) ; le code les transforme en en-têtes
HTTP à tirets (`CF-Access-Client-Id`).

**Bridge MCP (8001) — étape ULTÉRIEURE, pas maintenant** : exposer le WS du wizard MCP via une
**route de tunnel séparée** (le WebSocket + un service token au navigateur sont plus délicats sous
Access). À faire quand on branchera le wizard MCP en prod ; pour l'instant seule la gateway 8000 est
exposée via le tunnel.

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

**Bring-live** : voir le **Runbook bring-live (consolidé)** plus bas (DNS + sudo + secrets Vercel),
puis 1er install MCP réel (OAuth) ensemble : wizard → « Guide » → `claude mcp add …` → code OAuth → `claude mcp list`.

## Create-repo + garde-fou workspace

**Capacité create-repo** (depuis l'engine) : crée un repo GitHub puis l'enregistre comme projet **chargé**.
- `kua_core/github_api.py` : `create_user_repo` → `POST /user/repos` (README, branche `main`, privé par défaut)
  avec le `GITHUB_TOKEN` de `/srv/kua/.env` (scope Administration R/W). Token **jamais journalisé/renvoyé**.
- `kua_core/provision.py` : `provision_repo_project(name)` → crée le repo, `db.register_project(workspace=true,
  is_engine=false, allow_auto=false)` + `db.ensure_loop(facade=general, autonomy=approve_final, budget>0)`.
- **CLI** : `kua project create --name "…" [--private|--public] [--facade general] [--budget 5]`.
- **Gateway** (futur bouton UI) : `POST /internal/projects` (bearer `INTERNAL_TOKEN`, server-side).

**Garde-fou WORKSPACE (permanent)** : le Runner n'agit QUE sur un projet **enregistré ET chargé**
(`projects.workspace=true`, migration 005). `process_run` **refuse avant tout checkout/spawn** si
`workspace=false` (même si le token a accès au repo) ; `_merge_run` re-vérifie (défense en profondeur).
Défaut `RunCtx.workspace=False` → fail-closed. Prouvé par `runner/tests/test_workspace_guard.py`
(même repo : `workspace=false` → exécuteur jamais appelé + 0 branche poussée ; `workspace=true` → run normal).

**Bouton UI « créer un repo »** : `NewProjectDialog` a un mode « Créer un repo GitHub » → `POST
/api/projects/create` (route Next, auth Supabase) qui **proxifie** vers la gateway avec un `INTERNAL_TOKEN`
**server-side**. Tant que la gateway n'est pas exposée (`GATEWAY_INTERNAL_URL` absent) → 503, et l'UI affiche
la commande CLI `kua project create …`. **Le `GITHUB_TOKEN` n'est JAMAIS dupliqué dans Vercel** : il reste
sur le VPS (gateway) ; Vercel ne détient au plus que `GATEWAY_INTERNAL_URL` + `INTERNAL_TOKEN` (bearer gateway).

Bring-live du bouton : voir le **Runbook bring-live (consolidé)** ci-dessous.

## Système (santé + pause moteur) — onglet Réglages « Système »

**Toujours-actif** : le backend doit tourner en permanence (j'utilise l'app du cell, loin du desktop).
Les units systemd sont durcies (`Restart=always`, démarrage au boot, `NoNewPrivileges`, `ProtectSystem=full`,
`kua-engine` jamais root) : `kua-gateway` (8000), `kua-worker` (boucle Runner), `kua-mcp-bridge` (8001).
**Phase 1 bring-live FAITE** (avec William) : les 3 services sont installés, `enabled` et `running` ;
`/health` = gateway/db/worker/mcp_bridge `up`. Reste Phase 2 (DNS+Caddy) et Phase 3 (env Vercel).

**Santé** : la gateway expose `GET /health` (public, aucun secret) → `{status, version, uptime, paused,
services:{gateway, db, worker, mcp_bridge}}`. Le worker rafraîchit un heartbeat (~10s, thread daemon) →
`/health` distingue « worker occupé » de « worker mort » (seuil 30s). L'UI lit via `/api/health` (proxy Next
authentifié) ; tant que l'engine n'est pas exposé → « gateway non joignable » proprement.

**Pause / Reprendre (le « débrancher » sécuritaire)** : flag DB `system_settings.paused` (migration 006).
Le worker le vérifie **dans le claim SQL** (atomique) → en pause, AUCUN nouveau run réclamé ; les runs en
cours finissent ; approbations/merges continuent. Le toggle UI écrit le flag **via Supabase** → **marche
tout de suite, sans la gateway**. PAS de `systemctl` depuis le web (le web ne touche jamais aux services).

**Contrôle & debug (voir/redémarrer/déboguer depuis l'app, sans SSH)** — tout passe par des endpoints
gateway `bearer INTERNAL_TOKEN` (proxy Next `/api/system/*`, jamais le token dans le navigateur) :
- **Logs** : `/internal/logs?service=&lines=` → `journalctl -u <service>` (LECTURE SEULE). Viewer par service.
- **Contrôle** : `/internal/control {service, action}` → `sudo -n systemctl <action> <service>` via une **allowlist
  sudoers STRICTE** (3 services × {start,stop,restart,status}, rien d'autre). Boutons start/stop/restart ;
  redémarrer la gateway elle-même = planifié en tâche de fond (réponse AVANT le kill) + l'UI re-poll `/health`.
- **Debug** : assistant chat `claude -p` (plan Max, **pas de clé API**) qui lit diagnostics (df/free/uptime/
  pip check + journaux + /health) et **propose UNE action** (`restart_service` d'un des 3 / `reinstall_dep`
  d'une dep ÉPINGLÉE) **re-validée contre l'allowlist** ; William **confirme** avant exécution. Audit JSON.
- Sécurité : `app/sysctl.py` valide AVANT toute exécution (argv direct, jamais `shell=True`), kua-engine jamais
  root. Seules élévations : la ligne sudoers (3 services) + le groupe `systemd-journal` (lecture).

**Commandes sudo à appliquer par William** (une fois — l'agent ne fait QUE les fichiers) :
```bash
# 1) Allowlist sudoers stricte (start/stop/restart/status des 3 services, NOPASSWD)
command -v systemctl                       # vérifier le chemin (souvent /usr/bin/systemctl)
sudo cp deploy/10-kua-sysctl.sudoers /etc/sudoers.d/10-kua-sysctl
sudo chmod 440 /etc/sudoers.d/10-kua-sysctl
sudo visudo -c                             # valide la syntaxe de tout le sudoers

# 2) Lecture des logs : ajouter kua-engine au groupe systemd-journal
sudo usermod -aG systemd-journal kua-engine

# 3) Ré-appliquer les units MISES À JOUR (PATH explicite pour claude/kua ; kua-gateway
#    SANS NoNewPrivileges car il appelle `sudo -n systemctl` — sinon le setuid de sudo
#    serait ignoré et tout le contrôle échouerait). Puis recharger (le restart fait aussi
#    prendre le nouveau groupe journal au process gateway) :
sudo cp deploy/kua-gateway.service deploy/kua-worker.service deploy/kua-mcp-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart kua-gateway kua-worker kua-mcp-bridge

# 4) VÉRIFIER que le contrôle marche vraiment (sous l'unité, pas juste en shell) :
sudo -u kua-engine sudo -n systemctl status kua-worker   # doit afficher le statut, pas « not allowed »
```
(Le panneau « Système » s'allume côté UI après la Phase 3 — env Vercel `GATEWAY_INTERNAL_URL`
+ `INTERNAL_TOKEN`, **et** `SYSTEM_ADMIN_EMAILS=wrivard@kua.quebec` pour verrouiller le contrôle au
seul admin par le code. Le `reinstall_dep` tourne en `pip` du venv kua-engine, **sans sudo**.)

## Runbook bring-live (consolidé)

Allumer le backend always-on + exposer la gateway. **Le `GITHUB_TOKEN` reste sur le VPS** (jamais dans Vercel).
**Phase 1 FAITE** (services systemd installés/enabled/running). L'exposition se fait via **Cloudflare Tunnel +
Access** (l'ancien chemin DNS public + Caddy est ABANDONNÉ — voir la section Cloudflare ci-dessus).

1. **Cloudflare Tunnel** : `cloudflared` sur le VPS → `engine.oryon-temple.ca` → gateway `localhost:8000`.
   Politique **Access** sur le hostname : humains par courriel + un **service token** pour l'UI Vercel.
   (Pas de DNS A public, pas de Caddy, pas d'ouverture ufw 80/443.)
2. **Secrets VPS** (`/srv/kua/.env`, chmod 600, déjà en place) : `GITHUB_TOKEN`, `INTERNAL_TOKEN`,
   `BRIDGE_SECRET`. Jamais commités.
3. **Vercel** (voir le tableau « Contrat d'env Vercel » de la section Cloudflare) : `GATEWAY_INTERNAL_URL`,
   `INTERNAL_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `SYSTEM_ADMIN_EMAILS` (serveur) +
   `NEXT_PUBLIC_SUPABASE_*` (client). **Aucun `GITHUB_TOKEN` dans Vercel.**
4. **Vérif** : Réglages → Système → santé au vert (gateway/worker/db) ; bouton « Créer un repo GitHub » OK
   (Vercel → `engine.oryon-temple.ca/internal/projects` → Access → tunnel → gateway → GitHub).
5. **Bridge MCP (8001)** : exposition via une route de tunnel séparée = **étape ultérieure** (pas maintenant).

**Sécurité de l'exposition** : Cloudflare Access protège tout le hostname (humains par courriel, UI par service
token) ; en plus, `/internal/*` exige le bearer `INTERNAL_TOKEN` côté gateway. Le web ne lance jamais de `systemctl`.

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

---

# CHAT-FIRST (cerveau Max) — contrats & architecture

> Loop de nuit (2026-06-11). L'app devient **chat-first** : le chat est l'interface par défaut
> pour créer/gérer loops & threads, propulsé par **Claude via le plan Max** (`claude -p` sur le VPS,
> derrière la gateway). **AUCUNE clé API Anthropic.** Le cerveau **PROPOSE**, l'humain **CONFIRME**
> (carte de révision). `allow_auto` reste `FALSE` partout ; `approve_final` reste le gate de livraison.

## (a) Contrat `AgentProposal` (sortie du cerveau, JSON strict)

```jsonc
{
  "action": "create_thread | create_loop | update_loop | pause_loop | resume_loop | none",
  "facade": "general | bugfix | discord | demo | finish | seo",  // clés système (discord = libellé « Modifs »)
  "loop_id": "uuid|null",          // requis pour update/pause/resume_loop ; sinon null
  "title": "string",                // titre court (nom du loop / sujet du thread)
  "goal": "string",                 // goal exécutable et cadré (contexte repo, critères d'acceptation, limites)
  "budget_usd": 5,                  // number > 0
  "priority": "low | normal | high",
  "questions_manquantes": ["string"], // si non vide : le chat pose CES questions, on n'invente pas
  "resume_humain": "string"         // résumé FR lisible montré dans la carte de révision
}
```
- Façades + couleurs : source de vérité `ui/lib/facade.ts` (`general` = neutre/brand ; bugfix #D85A30 ;
  discord/« Modifs » #378ADD ; demo #7F77DD ; finish/« Site » #1D9E75 ; seo #BA7517).
- Si des infos manquent → `questions_manquantes` rempli (action peut rester telle quelle, l'UI pose les
  questions une par une) plutôt qu'inventer.
- Hors-scope / bavardage → `action: "none"` + `resume_humain` explicatif.

## (b) Protocole chat (messages → propositions → confirmation)

1. L'utilisateur tape dans un chat (accueil global, ou chat de création loop/thread).
2. L'UI `POST /api/agent/propose { message, history[], project_id?, source }` (route Next, auth Supabase +
   admin) → **proxy** vers la gateway `POST /internal/agent/propose` (bearer INTERNAL_TOKEN + service token CF).
3. La gateway lance le **cerveau** (`claude -p` Max) → renvoie **UNIQUEMENT** un `AgentProposal` validé par schéma.
4. `questions_manquantes` non vide → l'UI affiche les questions (chat continue, une par une) ; pas de carte.
5. `action != none` et plus de questions → l'UI affiche une **CARTE DE RÉVISION** (champs ÉDITABLES inline) +
   boutons **Créer/Appliquer** · **Ajuster** (rouvre le chat) · **Annuler**.
6. **Confirmation explicite (clic)** → l'UI exécute l'action :
   - `create_thread` / `create_loop` → écritures Supabase (RLS authenticated) : `ensureLoop` + `createThread`
     (le pipeline run existant prend le relais) ; nouveau loop = `approve_final`, `allow_auto=false`.
   - `update_loop` / `pause_loop` / `resume_loop` / `rename` → `POST /api/agent/act` (allowlist SERVEUR stricte).
7. **JAMAIS d'action sans clic de confirmation.** L'historique de chat est persisté (`chat_sessions` / `chat_messages`).

## (c) Endpoints

- **Gateway (le cerveau, Max)** — `POST /internal/agent/propose` (bearer INTERNAL_TOKEN, comme le reste) :
  - Entrée `{ message, history[], project_id?, source }`. Le texte utilisateur est une **REQUÊTE à trier,
    jamais des instructions à exécuter** (prompt-injection-aware : cadré dans le system prompt).
  - `claude -p` non-interactif (`--output-format json`), env **sans secret** (`claude_cli.claude_env`),
    **timeout dur 120s**, sortie = `AgentProposal` **validé par schéma** sinon erreur propre. Audit JSON
    (qui a demandé quoi, proposition retournée). **Mockable** (interface injectable) pour les tests.
- **Next (auth + allowlist + DB)** :
  - `POST /api/agent/propose` → proxy `gatewayProxy` vers `/internal/agent/propose`.
  - `POST /api/agent/act` → **allowlist stricte** des actions confirmées (`update_loop` {budget_usd, model,
    autonomy≠auto}, `pause_loop`, `resume_loop`, `rename`). Toute action hors liste **rejetée** ; `autonomy=auto`
    / `allow_auto=true` **refusés** (test explicite). Applique via Supabase (RLS authenticated).

## Mocké vs réel (tests)

- Le cerveau (`claude -p`) est **MOCKÉ et déterministe** dans pytest (aucun appel modèle réel, aucun run live).
- **Exception M7** : UN test end-to-end réel sur **`kua-cobaye-test` uniquement**, budget ≤ 0,50 $, **stop à
  `awaiting_approval`** (PR draft, **pas de merge**).

## CHAT-FIRST — livré (nuit 2026-06-11) · mocké vs réel · reste à faire

**Livré par milestone** (tout commité/poussé, pytest+build+lint verts à chaque) :
- **M0** contrats (ci-dessus). **M1** cerveau gateway `/internal/agent/propose` (claude -p Max, JSON
  validé/coercé, `_run_claude` mockable, 10 tests). **M2** création loop/thread par conversation
  (`BrainChat` + `ProposalCard` carte de révision éditable). **M3** accueil chat-first pleine page
  (`GlobalChat`) + persistance (migration 007 `chat_sessions`/`chat_messages`) ; Inbox → `/inbox`.
  **M4** gestion loops par chat = allowlist SERVEUR `/internal/agent/act` {update/pause/resume}, `auto`
  refusé (5 tests). **M5** panneau config loop (complément, même source de vérité). **M6** icônes
  connecteurs (registre local, fallback pastille, zéro CDN). **M10** fondation Discord (logique pure
  testée, 10 tests, Discord mocké).

**Mocké vs réel** :
- Tests : le cerveau (`claude -p`) et Discord sont **MOCKÉS** — aucun appel modèle réel, aucun run live.
- **Preuve M7 (RÉELLE)** : message → **vrai cerveau claude -p Max** (proposition `create_thread`/discord
  valide) → confirmation → thread sur `kua-cobaye-test` (budget 0,40 $) → livraison → **PR draft #2**
  (`https://github.com/Wrivard/kua-cobaye-test/pull/2`), STOP à `awaiting_approval`, coût 0,13 $.
  **Aucun merge.**

**Reste à faire pour le live complet** (toi, demain) :
- **Cerveau live depuis Vercel** : exposer la gateway via Cloudflare (`deploy/cloudflare-checklist.md`)
  PUIS **`sudo systemctl restart kua-gateway`** pour charger les endpoints `/internal/agent/*` (le
  process live tourne encore l'ancien code → `/internal/agent/propose` répond 404, constaté en M7).
  Sans ça, le chat affiche « cerveau non joignable » (dégradation propre déjà en place).
- **Déclencheurs réels** discord / sentry / cron (le panneau config = UI seulement pour l'instant).
- **Bot Discord live** : `docs/17-discord.md` (token + allowlist + `enable kua-discord`).
- **Activation `auto`** façade par façade (allow_auto reste false partout).
- **Swap des SVG logos** connecteurs avec ton image de référence (registre `connector-icon.tsx` prêt).
- Re-router les actions chat sur la gateway exposée (aujourd'hui `/api/agent/*` → 503 tant que non exposée).

**Sécurité respectée** : aucun merge réel ; allow_auto FALSE ; cœur Runner + auth gateway + `/srv/kua`
intouchés ; zéro secret en DB ou dans le bundle client (vérifié) ; cerveau = Max (aucune clé API).

## M12 — cerveau LIVE vérifié (gateway rechargée)

`sudo -n systemctl restart kua-gateway` (sudoers allowlist) → `/health` 200 → l'endpoint
`/internal/agent/propose` répond (le process live charge enfin les endpoints `/internal/agent/*`).
Triage réel correct (3 requêtes types, anonymisées) :
- « bug formulaire de contact mobile sur site client » → `create_thread` · **bugfix** ✓
- « ajouter une section témoignages sur un site client » → `create_thread` · **discord/Modifs** ✓
- « météo à Montréal ? » → **`none`** (hors-scope, explication propre) ✓
Aucune correction nécessaire. ⇒ Le chat-first est désormais **live-capable côté VPS** ; côté Vercel
il reste l'exposition Cloudflare (checklist M9) — la dégradation « cerveau non joignable » disparaît dès
que `GATEWAY_INTERNAL_URL` + service token sont câblés.

## EXPÉRIENCE D'APPROBATION (loop nuit #2, 2026-06-11) — M12→M21

**Livré par milestone** (commit+push chacun, pytest+build+lint verts) :
- **M12** cerveau LIVE vérifié (restart gateway via sudoers, triage réel correct). **M13** revue de PR
  dans l'app : endpoint `/internal/pr/{run_id}` (diff/patch/commits/coût via API GitHub) + `PrReview`
  mobile (diff coloré repliable, vérif, coût, Approuver/Demander changements/Rejeter). **M14** verify
  gate non-bloquante par défaut + `verify_mode` report|block par loop, rapport attaché au run.
  **M15** inbox de propositions (table `proposals`) : le cerveau y dépose les sources non-interactives ;
  hub UI avec Approuver/Modifier/Rejeter. **M16** notifications (table + cloche app + canal Discord prêt).
  **M17** trigger cron PROPOSE-ONLY (scheduler thread → proposition inbox, jamais un run). **M18** webhook
  générique + Sentry (secret par source, → proposition inbox). **M19** dashboard coûts & activité.
  **M20** import d'un repo existant par chat (`import_repo` → provision.import_existing_repo).

**Décisions non triviales** : cerveau + actions dans la gateway (Python testable), proxifiées Next ;
verify report non-bloquant par défaut (l'humain décide sur la carte) ; cron/webhook PROPOSENT (inbox),
jamais un run direct (`allow_auto` reste FALSE) ; `applyProposal` = source de vérité unique chat+inbox ;
import réutilise register_project/ensure_loop (PAS create_user_repo).

**Mocké vs réel** : tests = cerveau (claude -p) + Discord + GitHub API + temps cron + DB tous MOCKÉS ;
aucun run live dans pytest (164 verts). **Preuves réelles (≤ 0,50 $, pas de merge)** :
- (a) proposition INBOX réelle (cerveau, source=cron) → approbation → **PR draft #3** + rapport vérif
  (`skipped`) attaché, stop awaiting_approval, 0,13 $.
- (b) « Demander des changements » → ancien run **rejected** + run repart avec feedback → **PR draft #4**,
  stop, 0,15 $. URLs : `github.com/Wrivard/kua-cobaye-test/pull/3` et `/pull/4` (draft, non mergées).

**Reste à faire pour le live complet** (toi, demain) :
- **Exposer la gateway via Cloudflare** (`deploy/cloudflare-checklist.md`, 7 étapes) + env Vercel → le chat,
  l'inbox, la revue PR, le dashboard et les notifs s'allument depuis le cell. **Après chaque déploiement de
  code gateway : `sudo systemctl restart kua-gateway`** (le process live ne charge pas le nouveau code sinon).
- **Webhook Sentry** : URL `https://engine.oryon-temple.ca/webhooks/sentry` + `WEBHOOK_SECRET_SENTRY` +
  policy Access (Service Auth par défaut, sinon bypass `/webhooks/*`). Mapper projet Sentry → projet kua.
- **Bot Discord live** (`docs/17-discord.md`) ; **activation `auto`** façade par façade (reste FALSE) ;
  swap des SVG logos connecteurs ; cron : configurer `schedule_cron` par loop (panneau config ou chat).
- Le `/internal/pr` renvoie 500 sur un run_id non-uuid (cosmétique ; les vrais ids sont des uuid).

## REFONTE DE LA COUCHE DE PRÉSENTATION (loop design, 2026-06-11) — A→F

Audit → plan → implémentation, présentation SEULEMENT (zéro logique métier/endpoint/DB/Runner/auth
touchés). Commit + push par milestone. Audit complet : `ui/DESIGN-AUDIT.md`.

**Décisions** : renderer markdown maison léger (zéro dep lourde, **zéro `dangerouslySetInnerHTML`**,
href assaini → impossible d'injecter du HTML) plutôt que react-markdown ; parseur de vérif PUR séparé
du rendu (`lib/*-parse.ts`, `lib/verify-report.ts`, `lib/inbox-state.ts`) → testable sans DOM ni alias ;
`vitest` ajouté (seule dep dev, justifiée par le milestone F) en mode node (pas de jsdom/RTL).

**Avant → Après par vue**
- **Chat (accueil + thread)** : `##`/`**`/backticks bruts → markdown rendu ; bulle user accentuée →
  `bg-secondary` ; system → ligne d'événement fine ; bulle « … » → « le cerveau réfléchit… » animé ;
  murs de texte repliés (`<Expandable>` voir plus).
- **Carte de run (livrable)** : résumé brut → markdown ; vérif invisible/à-ouvrir → `VerdictCard` inline ;
  liens PR/branche/coût noyés → chips `PrLink`/`BranchChip`/`CostBadge`.
- **Revue de PR** : dump `verify_output` (mur) → `VerdictCard` (ouvert si échec) ; résumé → markdown ;
  coût → `CostBadge`. Diff conservé.
- **Inbox** : on confirmait à l'aveugle (titre + résumé) → carte propre (façade, `SourceChip` icône+couleur,
  projet, âge, coût ; aperçu en clair sans markdown) + **`InboxDetail`** (drawer plein écran mobile :
  pourquoi / ce qui sera fait / où / coût / questions) ; Confirmer (vert) · Ajuster · Rejeter, détail à 1 tap.
- **Notifications** : body brut → `plainText`. **Dashboard** : lien PR → `PrLink`. **Drawer détails** :
  résumé → markdown, PR/branche en chips.

**Mocké vs réel** : aucune logique/endpoint touché ; tests = LOGIQUE PURE (pas de réseau, pas de DOM).
`vitest` 27 tests verts — `markdown-parse` (href `javascript:`/`data:` rejetés, `<script>` rendu en
TEXTE, parsing titres/listes/liens), `verify-report` (PASS/SKIP/FAIL structuré + markdown agent +
prose→fallback + null/vide), `inbox-state` (needsProject/canQuickConfirm/showGoal/preview, états liste).
`pytest` 164 + `npm run build` + `lint` verts.

**Reste à faire (P2, dans DESIGN-AUDIT)** : coloration syntaxique du contenu de diff ; refonte fine des
5 onglets Réglages ; barre dépensé/budget au dashboard ; tests de composants React (RTL+jsdom). Note ops
inchangée : après tout déploiement gateway, `sudo systemctl restart kua-gateway` (la refonte est UI-only,
donc côté Vercel : redéployer l'UI suffit).

## UX DEEP-DIVE — L'APP REPENSÉE COMME UN PRODUIT (loop 2026-06-11, M1→M6)

Reconception complète (spec d'abord : `ui/UX-SPEC.md`, issue d'un audit de 182 interactions + panel
de nav). Présentation/interaction SEULEMENT — zéro logique métier/endpoint/DB/Runner/auth modifié,
aucune nouvelle route de lecture nécessaire (tout réutilise les reads existants).

**Avant → Après par vue**
- **Partout** : il fallait cliquer « + Nouveau » (3 dialogues concurrents) → **ComposerDock fixe en bas
  de TOUTES les vues** = l'entrée unique. @mention (autocomplete projets+façades), chip de cible (✕ pour
  revenir au global), modes dérivés de la route (global/projet → cerveau ; thread → agent de façade),
  propositions inline en feuille au-dessus du dock. Supprimés : global-chat, composer, brain-chat(-dialog),
  new-conversation-dialog, boutons « + Nouveau »/« Nouvelle ».
- **Accueil** : page-chat avec son propre input → **journal** (fil rendu, saisie déléguée au dock).
- **Thread** : un run = 5-6 bulles répétitives + rapport de vérif plein PUIS ligne « Non vérifié »
  contradictoire → **UNE carte qui évolue** (versions v1 repliée/v2 active via « refait N× »), verdict
  **réconcilié EN UNE LIGNE** (gate définitif > narration agent > skipped ; SKIP = amber), résumé nettoyé
  de sa section vérif, échos machine (« Run lancé », « PR #4 ouverte ») reclassés en lignes d'événement.
  Grammaire stricte 4 types appliquée. `synthFromRuns` supprimé → `buildThreadView` (pur, testé).
- **Inbox** : cliquer redirige vers le chat → **action sur place** : carte → module de revue (plein écran
  mobile) avec avant→après (diff), verdict une-ligne, coût ; Confirmer (primaire) · Refaire avec nuance
  (champ inline) · Rejeter · « Ouvrir la loop → » (sortie choisie). Quick Confirmer/Rejeter au pied,
  optimistic + toasts → flow « vider l'inbox au pouce ».
- **Nav** : Accueil(logo) · Inbox · **Activité (NOUVELLE page /activity** : pause moteur + santé worker +
  coût du mois global/par projet + runs récents — le job SURVEILLER enfin visible) · Projets ; Réglages
  relégué au footer profil. Mobile : tab-bar (Inbox/Activité/Projets) au-dessus du dock, safe-area-inset.

**Qualité** : 49 vitest (22 nouveaux : run-state, @mention, thread-view, verify-reconcile) + 164 pytest +
build + lint verts. Audit final adversarial (5 vérificateurs) : 2 dimensions solid d'emblée, 8 vrais
correctifs appliqués, 5 faux positifs rejetés avec justification (détail : UX-SPEC §11).

**Reste (P2)** : filtre inbox, barre de progrès réelle (événements backend requis), undo court,
unification Notifications↔Inbox, coloration syntaxique diff, visualViewport clavier iOS.

## PASSE VISUELLE HAUT DE GAMME (loop design final, 2026-06-11) — V1→V6

**V2 Chat — avant/après** : largeur de lecture 768→**720px** ; bulles agent en boîtes grises →
**prose éditoriale sans bulle** (titres à peine plus grands, listes aérées, inline-code discret) ;
bulle user accent → compacte `secondary` coin droit cassé ; horodatage par bulle → **au groupe**
(dernier d'une suite) ; rythme plat (space-y-4 uniforme) → **serré dans un groupe (6px), aéré entre
(24px)** ; événements gris moyens → **tertiaires effacés** ; carte de run = boîte empilée →
**composant signature** (en-tête titre dominant + statut, versions en sélecteur discret, verdict
une-ligne avec icône bouclier fine, résumé en prose secondaire, **pied = une baseline** chips
gauche/actions droite séparée par un filet) ; dock barre collée pleine largeur → **dock flottant**
(surface élevée + shadow-float + dégradé de fond, focus border brand, « le cerveau réfléchit » avec
point brand pulsé) ; chips hétéroclites → **baseline h-6 unifiée** (rect = méta techniques, pills =
états/sources).
