# 18 — kua-ops : des mains pour les agents (audit des capacités + couche d'outils)

## Pourquoi (cas vécu, 2026-06-11)
Dans un thread avec un run **à confirmer**, l'opérateur écrit « ajoute la ligne FAIT AU QUEBEC dans
le readme » → l'agent répond « écris “Refaire : …” toi-même ». Cause racine : **les agents
conversationnels n'ont aucun outil** pour opérer l'app. `agent/agent.py` est un squelette Phase-1
(regex « Refaire : … ») ; le cerveau ne peut rien LIRE (coûts, statuts) ; chaque agent réinvente ses
accès. Réponse : une couche d'actions unique (`kua_core/ops.py`) exposée en **MCP** aux `claude -p`,
scopée **par profil d'agent**.

## Classes d'actions (règle transverse)
| Classe | Règle |
|---|---|
| **LECTURE** | Exécution directe, toujours permise dans le scope du profil. |
| **MUTATION** | Si l'utilisateur vient de demander **explicitement** l'action dans son message (« refais-le avec X ») → l'agent exécute et **confirme dans le fil** — pas de double validation (le merge reste gaté par `approve_final` de toute façon). Si l'action est à l'initiative de l'agent ou ambiguë → **carte de proposition**. |
| **ADMIN** | Réservé aux surfaces SYSTEM_ADMIN (panneau Système, debug) ; passe par les allowlists EXISTANTES (sudoers sysctl, bridge MCP). |

Invariants : `allow_auto` reste FALSE ; **aucun tool ne merge** (`_merge_run` = exclusivité du
watcher d'approbations) ; `update_loop` refuse `autonomy='auto'` (déjà dans `db.update_loop_fields`) ;
aucun secret ne transite par un tool.

## Audit par agent (état réel relevé dans le code)

### (a) Cerveau / composer global — `gateway/app/agent_brain.py`
- **Job** : trier un message opérateur → `AgentProposal` (10 champs) ; l'humain confirme (UI).
- **Lancement** : `POST /internal/agent/propose` → subprocess `claude -p --output-format json
  --model haiku` (plan Max, env minimal `claude_cli.claude_env`, timeout 120 s). Stateless.
- **A aujourd'hui** : proposer (create_thread/loop, update/pause/resume via allowlist
  `/internal/agent/act`, import_repo). **Aucune lecture** : « où en est X ? » / « combien ce
  mois ? » → il invente des `questions_manquantes` au lieu de répondre.
- **Gap → profil `brain`** : toutes les LECTURES. Ses mutations restent le flux
  proposition→confirmation existant (pas de tool de mutation : défense en profondeur).

### (b) Agent de thread — `agent/agent.py` + `runner/worker.py:handle_thread_message`
- **Job** : la conversation d'une unité de travail — répondre, ajuster, relancer.
- **Lancement** : watcher `process_agent_messages()` (worker) quand le dernier message d'un thread
  est `user` et qu'aucun run n'est queued/preparing/running/verifying → **se déclenche donc bien
  pendant `awaiting_approval`** (le cas vécu).
- **A aujourd'hui** : regex « Refaire : … » → `add_run` direct (⚠ contourne le chemin redo atomique :
  v1 reste `awaiting_approval` pendant que v2 part) ; sinon réponse passe-partout.
- **Gap → profil `thread_agent`** : `get_thread_context`, `get_run_status`, `get_run_diff`,
  `get_costs` (SON projet), `get_loop_config` ; mutations `redo_run` (= INSERT
  `approvals(decision='redo', comment=nuance)` → le watcher rejette v1 + crée v2 **atomiquement**),
  `reject_run`, `create_thread` (son projet). **Scope projet étanche** (frontière type
  `compose_project_context`).

### (c) Wizard MCP — `gateway/app/{mcp_guide,mcp_bridge,bridge_auth}.py`
- **A aujourd'hui** : guide advisory (`claude -p` 0,10 $) + exécution restreinte `claude mcp …` via
  l'allowlist bridge (WS + token HMAC TTL 5 min) + table `project_mcp`.
- **Gap → profil `mcp_wizard`** : `mcp_list` / `mcp_add` / `mcp_remove` **seulement** (scope
  app|projet), au-dessus de l'allowlist bridge existante + DB (`remove` manque aujourd'hui).

### (d) Assistant de débogage Système — `gateway/app/debug_advisor.py`
- **A aujourd'hui** : le plus proche d'un agent outillé — advise (`claude -p` + diagnostics
  lecture seule) → UNE action re-validée contre l'allowlist sysctl ({kua-gateway, kua-worker,
  kua-mcp-bridge, kua-discord} × {start, stop, restart, status}, sudoers 12 commandes) → confirmation
  humaine → act. Audit JSON local.
- **Gap → profil `debug`** : `get_health` + LECTURES + `restart_service` (même allowlist), pour
  **unifier l'audit** dans kua-ops (aujourd'hui : 4 formats d'audit dispersés).

### (e) Bot Discord — `agent/discord_bot.py`
- **A aujourd'hui** : allowlist d'utilisateurs (DB `app_settings['discord']`), propose via gateway,
  crée le thread après confirmation par réaction. `pending` en RAM (perdu au restart — connu).
  Mocké tant que `DISCORD_BOT_TOKEN` absent.
- **Gap → profil `discord`** : LECTURES (« où en est…/combien… » depuis Discord) + `create_thread`
  (après confirmation explicite — règle MUTATION satisfaite par la réaction).

### (f) Façades auto (futur) — référence Runner
- Le **Runner n'est pas un agent conversationnel** (il code) : il ne reçoit **pas** kua-ops.
- Futur profil `auto_facade` (derrière le double flag `allow_auto`, jamais cette phase) :
  LECTURES + `create_thread` + `redo_run` — **jamais** approve/merge. Esquissé seulement.

## Matrice profils × tools

| Tool | Classe | brain | thread_agent | mcp_wizard | debug | discord |
|---|---|:-:|:-:|:-:|:-:|:-:|
| get_thread_context | LECTURE | ✓ | ✓ (son thread) | — | — | ✓ |
| get_run_status | LECTURE | ✓ | ✓ | — | ✓ | ✓ |
| get_run_diff | LECTURE | ✓ | ✓ | — | — | — |
| list_projects / list_loops | LECTURE | ✓ | ✓ (son projet) | — | ✓ | ✓ |
| get_loop_config | LECTURE | ✓ | ✓ (son projet) | — | ✓ | ✓ |
| get_costs | LECTURE | ✓ | ✓ (son projet) | — | ✓ | ✓ |
| get_health | LECTURE | ✓ | — | — | ✓ | ✓ |
| list_proposals | LECTURE | ✓ | — | — | ✓ | ✓ |
| redo_run(run, nuance) | MUTATION | — | ✓ (son thread) | — | — | — |
| reject_run | MUTATION | — | ✓ (son thread) | — | — | — |
| create_thread | MUTATION | — | ✓ (son projet) | — | — | ✓ (confirmé) |
| create_loop / update_loop / pause_loop / resume_loop | MUTATION | — | — | — | — | — |
| import_repo / create_repo | MUTATION | — | — | — | — | — |
| restart_service | ADMIN | — | — | — | ✓ (sysctl) | — |
| mcp_list / mcp_add / mcp_remove | ADMIN | — | — | ✓ (son scope) | — | — |

> Les mutations de loops/repos restent au flux proposition→confirmation UI (cerveau) — pas de tool
> direct cette phase : le cerveau n'exécute pas, il propose. `create_loop`…`create_repo` vivent dans
> ops.py (réutilisés par l'UI/gateway plus tard) mais **aucun profil ne les expose** pour l'instant.

## Architecture (M2–M4)
1. **`kua_core/ops.py`** : la source de vérité. Lectures = requêtes existantes (`db.get_run_context`,
   `get_system_status`…) + agrégat coûts (SUM `runs.cost_usd` par projet/mois — manquait partout).
   Mutations = wrappers des chemins existants (approvals redo/reject, `create_thread_with_run`,
   `ensure_loop`, `update_loop_fields`, `set_loop_enabled`, `provision.*`). **Rien de dupliqué.**
2. **Serveur MCP `kua-ops`** (stdio, `agent/kua_ops_mcp.py`, zéro dépendance) : tools à schémas
   stricts ; profil + scope via env (`KUA_OPS_PROFILE`, `KUA_OPS_PROJECT`, `KUA_OPS_THREAD`,
   `KUA_OPS_SESSION`) ; hors-profil/hors-scope → refus **avant** exécution ; audit JSONL
   (qui/quoi/résultat) ; timeouts.
3. **Câblage** : l'agent de thread devient `claude -p --mcp-config … --allowedTools mcp__kua-ops__…`
   (profil `thread_agent`, modèle cheap) avec fallback Phase-1 si CLI indisponible ; le cerveau reçoit
   le profil `brain` (lectures) ; debug/wizard/discord = profils respectifs (Discord reste mocké).
   UI : aucune nouvelle surface — carte de run mutée (v2), propositions, toasts existants.

## Preuve réelle (2026-06-11, kua-cobaye-test — LE cas vécu)
1. Run v1 livré → **PR draft #5**, `awaiting_approval` (0,23 $).
2. Message utilisateur « remplace plutôt par CHANGELOG: kua-ops OK » pendant le run à confirmer →
   **l'agent de thread outillé appelle `redo_run` LUI-MÊME** (audit kua-ops :
   `tool=redo_run ok=true actor=thread-agent`, approval `redo` avec la nuance exacte) et répond
   « Redo queued… » dans le fil.
3. Le watcher (worker **live**) rejette v1 + crée v2 avec la nuance → **PR draft #6**,
   `awaiting_approval`. **Aucun merge.** Chaque run ≤ 0,50 $.

**Leçon encodée** : haiku « confirmait » sans appeler le tool (1re tentative) → modèle de l'agent
de thread = **sonnet (mid, doc 16)** + clause ANTI-FABRICATION dans le prompt (« pas de tool
appelé = pas d'action annoncée »). Le cerveau (tri/lectures) reste haiku.

## Activation live
- Agent de thread outillé : **opt-in `KUA_AGENT_LLM=1`** dans l'env du worker (à ajouter par
  William dans `/srv/kua/.env` — hors de portée de l'agent). Sans flag : fallback Phase-1.
- Cerveau outillé (lectures) : **actif par défaut** (`KUA_BRAIN_TOOLS=0` pour désactiver) ;
  idem advisor debug (`KUA_DEBUG_TOOLS=0`).
- Après tout déploiement : `sudo -n systemctl restart kua-gateway` puis `… kua-worker`
  (une commande PAR service — le sudoers n'autorise que les commandes exactes).
- Audit des tools : `~/.kua/ops-audit.jsonl` (JSONL : session/profil/projet/tool/ok/durée).

## Reste-à-faire (hors phase)
Profil `auto_facade` (double flag) ; persistance du `pending` Discord (table proposals) ;
`adjust_run` (modifier budget/modèle d'un run à confirmer) ; reads par rôle côté RLS si on expose
au-delà du VPS ; migration complète du debug advisor vers kua-ops (cette phase : profil + audit) ;
brancher le profil `discord` quand le bot passe live.
