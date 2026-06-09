# Phase 0 — Journal d'exécution des spikes & setup VPS

> Vivant. Mis à jour au fil de l'exécution sur le VPS (`kua-engine@srv1744916`).
> Réfère à `docs/14-ROADMAP-MVP.md` (liste canonique S1–S5) et `docs/05`.

## Setup VPS (7 étapes) — ✅ TERMINÉ (2026-06-09)
1. **Scaffold** : `runner/`, `agent/`, `kua_core/`, `deploy/`, `.env.example`, `pyproject.toml` (commit `ee1c578`).
2. **Paquets** : build-essential (gcc 13.3), python3-venv, python3-pip (24.0), ripgrep (14.1). Venv `.venv` + `pip install -e .` OK ; CLI `kua` fonctionne.
3. **Docker** : 29.1.3 + compose v2, daemon actif/enabled ; `kua-engine` ∈ groupe `docker` (effectif à la reconnexion).
4. **Caddy** : v2.11.4 (dépôt officiel). `deploy/Caddyfile` validé. **Site `hooks.kua.quebec` NON activé** (attend DNS + ufw 80/443 — action humaine, firewall gelé).
5. **Hermes** : v0.16.0 installé (`~/.local/bin/hermes`), wizard **sauté**. ⏳ `hermes setup` + `hermes gateway install` = interactif (OAuth + Discord) → **à faire par William**.
6. **Supabase** : `/srv/kua/.env` (chmod 600) câblé ; service_role + URL OK ; connexion testée par le code du gateway ; 7 tables confirmées (verify-only, rien rejoué). ⏳ `SUPABASE_DB_URL` à compléter (mot de passe DB manquant). RLS désactivé — SQL d'activation fourni, **non appliqué** (décision : plus tard).
7. **systemd** : 3 units templates dans `/etc/systemd/system/` (`loaded`/`inactive`/`disabled`) — non activées.

## Spikes S1–S5

### S1 — cron Hermes → shell → Discord · ⏳ BLOQUÉ
Dépend de `hermes setup` (OAuth) + `hermes gateway setup` (bot Discord), interactifs.
**Quand Hermes configuré** : créer un cronjob Hermes qui exécute `echo`/`date` et poste
le résultat dans `#kua-loops-alerts`. Critère : message reçu sur Discord.

### S2 — message Discord → commande locale · ⏳ BLOQUÉ
Même dépendance. Critère : un message dans un channel mappé déclenche une commande
locale (à terme `kua run …`).

### S3 — `claude -p --output-format json` → JSON parsé · ✅ RÉUSSI (2026-06-09)
- **Run réel** : `result="OK"`, `total_cost_usd=0.0285`, `num_turns=1`, `is_error=false`, exit 0.
- **Flags vérifiés (Claude Code 2.1.170)** :
  - ❌ `--max-turns` **n'existe plus**.
  - ✅ `--max-budget-usd <amount>` natif → impose `loops.budget_usd` directement.
  - ✅ `--output-format json`, `--model {alias}`, `--permission-mode {acceptEdits|...}`.
  - Bonus dispo : `--effort`, `--fallback-model`, `-w/--worktree`, `--json-schema`, `--session-id`, `--allowedTools`.
- **JSON (clés)** : `type`, `subtype`, `is_error`, `result`, `total_cost_usd`, `num_turns`,
  `stop_reason`, `terminal_reason`, `session_id`, `duration_ms`, `usage`, `modelUsage`, `permission_denials`.
- **Matérialisé** : `runner/runner.py::build_claude_command()` + `parse_claude_result()` + tests
  (`runner/tests/test_claude_invocation.py`, 4 passants). Doc 06 corrigé.
- ⚠️ Reste à tester en Phase 1 : le **kill au dépassement** de `--max-budget-usd` / timeout.

### S4 — webhook signé → FastAPI → thread + run en DB · ✅ VERT sur le VPS (2026-06-09)
- `gateway/tests/test_sentry_hook.py` : 4/4 contre la **vraie** DB Supabase (auto-cleanup `s4test-*`).
- Couvre : payload signé → event+thread+run(queued) ; **dédup** (external_id) ; signature absente/invalide → 403 sans écriture ; **titre malicieux stocké comme donnée inerte** (pas d'injection).
- DB vérifiée propre après run (seed `kua-cobaye` intact).
- Dette connue (doc dans `gateway/app/db.py`) : `create_thread_with_run` = 2 inserts PostgREST séquentiels (pas transactionnel) → à réécrire sur psycopg dans `kua_core.db`.

### S5 — page Next.js realtime des runs · ⏳ BLOQUÉ sur ce VPS
L'UI tourne sur **Vercel**, pas le VPS (Node absent ici, par design). Le squelette existe
(`ui/`, spike S5 déjà commité). Vérification realtime = via déploiement Vercel + creds
(NEXT_PUBLIC_SUPABASE_URL/ANON_KEY). À faire côté Vercel, hors VPS.

## Plomberie additionnelle (autonome, 2026-06-09)
- **`kua sync` (dry-run)** : parseur pur `kua_core/loops_yaml.py` (valide contre les enums
  verrouillés) + `runner/cli.py::cmd_sync`. 5 tests. Upsert DB **différé** (voir bloqueurs).
- Total tests verts : **13** (4 S3 + 4 S4 + 5 loops.yaml).

## ⏳ En attente de William (bloqueurs identifiés)
1. **Hermes** : `hermes setup` + `hermes gateway install` (OAuth + Discord) → débloque S1, S2.
2. **Mot de passe DB** : compléter `SUPABASE_DB_URL` dans `/srv/kua/.env` → débloque la couche
   `kua_core.db` (psycopg, transactions) et son test.
3. **Décision design `kua sync`** : `loops.yaml` ne porte ni `repo_url` ni `name`. Les prendre
   du remote git (`git remote get-url origin`) + slug ? ou ajouter des champs au YAML ? →
   débloque l'upsert projects/loops.
4. **GitHub PAT** (fine-grained, scope minimal) → débloque le push/PR draft du Runner (Phase 1).
5. **DNS `hooks.kua.quebec` + ufw 80/443** → active le TLS Caddy (firewall gelé, action humaine).
6. **RLS** : appliquer (avec policies) avant que l'UI Vercel dépende de la clé anon.

## Critère de sortie Phase 0 (doc 14) — état
`kua run --project cobaye --facade bugfix --goal-extra "tâche bidon"` → PR draft + Discord + carte UI.
**Pas encore atteint** : nécessite le Runner implémenté (Phase 1) + Hermes (S1/S2) + push GitHub (PAT).
Les briques de plus haut risque — **S3** (invocation/coût `claude -p`) et **S4** (ingestion webhook→DB)
— sont **levées et testées**. La suite est de la construction (Phase 1), pas du dé-risquage.
