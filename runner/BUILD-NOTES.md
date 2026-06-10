# Runner — notes de build

> Le Runner rend l'UI réelle : un run = une exécution `claude -p` sur un repo,
> livrée en PR draft reviewable, approuvable depuis l'UI/CLI. **Agnostique au type
> de loop** : un thread porte un GOAL libre + une `facade` qui n'est qu'une CLÉ DE
> PRESET ouverte (bugfix/discord/seo/demo/finish, mais aussi `general`, `new_project`,
> ou tout autre texte). Aucune logique hard-codée par façade.

## Ce qui marche (vérifié)
- **S3** : `claude -p --output-format json` confirmé en live sur le VPS (2.1.170 ;
  `--max-budget-usd` + `timeout`, pas de `--max-turns`). Coût/résultat parsés.
- **kua_core.db** (psycopg) : contexte run, claim (FOR UPDATE SKIP LOCKED), update,
  messages, statuts, watcher d'approbations. SQL validé par EXPLAIN contre le schéma réel.
- **Modules agnostiques** : `context`, `target` (existant/nouveau projet), `gitops`
  (isolation par checkout, jamais de push sur la base), `verify` (gate auto-détectée :
  `.kua/verify.sh`, npm, pytest, make), `executor` (Claude réel + Fake déterministe,
  même Protocol), `deliver` (bare local + GitHub git+REST API), `goal` (CLAUDE.md + goal
  libre + règles communes, **pas** de re-template par façade).
- **worker** : pipeline 8 étapes + watcher (approved→merge, rejected→ferme, redo→nouveau run).
  Budget/timeout → échec PROPRE sans PR. Filet anti-blocage (toute exception → run failed).
- **Self-test end-to-end** sur repo bare LOCAL : `kua selftest` → run → branche poussée →
  awaiting_approval (verify passed) → approved → merge dans `main` → `pushed`. **48 tests verts.**
- **Déclencheur UI** : créer une conversation (« + Nouvelle ») insère un run(queued).

## Revue adversariale (appliquée)
Workflow `runner-review` (6 dimensions × vérification indépendante) : **32 trouvailles brutes →
28 confirmées → 28 corrigées**. Durcissements clés :
- **`auto` à double verrou** : exige `loops.autonomy=auto` **ET** `projects.allow_auto` **ET** non-moteur
  **ET** vérif passée (migration 003 + règle #1). `allow_auto` défaut FALSE (fail-closed).
- **Budget fail-closed** : un run sans budget explicite et positif est REFUSÉ avant tout spawn (règle #2) ;
  `loops.yaml` et la table `loops` rejettent budget ≤ 0.
- **Anti-double-merge / anti-race** : claim atomique `awaiting_approval→merging` ; advisory lock par
  (project,facade) sur le claim des runs queued ; redo/rejected sous claim atomique.
- **Merge fail-closed** : `_merge_run` re-vérifie is_engine + approbation, fusionne le **SHA reviewé**
  (`delivered_sha`, anti-TOCTOU « approve A / merge B »), gère conflit/échec (abort + run failed).
- **Résilience daemon** : process_approvals et la boucle survivent à toute exception ; **reaper** des runs
  orphelins (worker mort) ; `_fail` best-effort (jamais de run bloqué).
- **Secrets** : `claude -p` et la gate de vérif tournent avec un env SANS secrets backend
  (`runner/env.py`) ; git n'invite jamais (GIT_TERMINAL_PROMPT=0) et s'authentifie par en-tête éphémère
  (token masqué dans les logs).
- **Agnostique renforcé** : `loops.yaml` accepte une façade libre (slug) ; `load_goal_template` et
  `resolve_target` ne hard-codent plus aucun nom de façade.
- **Timeout dur** : `--kill-after=30s` + garde Python (kill du groupe de process).
- **Ménage** : checkout supprimé en `finally` (plus d'accumulation disque).

## Comment déclencher un run de test
```bash
cd /home/kua-engine/kua-loop-engine
# 1) Self-test end-to-end (bare local, FakeExecutor, sans GitHub) — recommandé :
.venv/bin/python -m runner.cli selftest

# 2) Run manuel sur un projet existant en DB (ex. kua-cobaye) :
.venv/bin/python -m runner.cli run --project kua-cobaye --facade general --goal "Ajoute un commentaire au README"
.venv/bin/python -m runner.cli worker --once     # exécute le run queued
.venv/bin/python -m runner.cli status            # voir l'état

# 3) Décisions (équivalent des boutons Oui/Refaire de l'UI) :
.venv/bin/python -m runner.cli approve <run_id>
.venv/bin/python -m runner.cli reject  <run_id> --redo "renomme e en err"

# 4) Daemon (poll continu) :
.venv/bin/python -m runner.cli worker
```
Depuis l'**UI** (déployée, Supabase configuré) : « + Nouvelle » → la conversation crée un
run(queued) → un `kua worker` en marche le ramasse, exécute, et la carte passe en « à confirmer ».

## End-to-end LOCAL — ce qui marche (vérifié, 57 tests verts)
- **UI ↔ Supabase** : `ui/.env.local` câblé sur le vrai projet (clé publishable) ; l'UI lit/écrit
  les vraies tables en Realtime ; auth réelle active (`/` → 307 `/login`). Données = login requis (RLS).
- **Créer une conversation** (UI ou `kua run`) → thread + run(queued) ; le worker le pogne (claim
  prouvé), exécute, livre une branche/PR (bare-local), passe `awaiting_approval`, poste la carte.
- **Approbation** Oui → merge dans la base (bare) → `pushed` ; Refaire → nouveau run ; le composer
  (« écrire à l'agent ») relance un run avec la nuance (watcher d'agent, doc 16).
- **Types généralisés** : 5 presets + Général/custom (façade libre, armée à la volée) ; création de
  projet depuis l'UI (repo existant ou nouveau).
- **Garde-fous prouvés** : budget/timeout/verif en échec → AUCUNE branche/PR ; approve_final partout.

## Pour aller LIVE (ce qu'il reste)
1. **GitHub PAT** dans `/srv/kua/.env` (`GITHUB_TOKEN`) → livraison réelle (push branche + PR draft
   via API REST ; le code est prêt, `make_deliverer` bascule sur GitHub si URL github + token).
2. **Un repo de test** (jetable d'abord, sur ton compte) → ajouter en DB comme projet + arme une loop ;
   `kua run` → vrai `claude -p` → vraie PR draft. (Le smoke test attend ton GO.)
3. **Worker en service** : `kua worker` en boucle (systemd `deploy/kua-worker.service`). ⚠️ exécute de
   vrais `claude -p` → ne le lancer que supervisé / avec des loops budgétées.
4. **Vercel** : `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans le projet Vercel
   (Root Directory = `ui/`) + créer le(s) compte(s) Supabase + désactiver les signups (cf. ui/BUILD-NOTES).
5. **Livraison « nouveau projet »** (créer le repo distant) : non branchée (nécessite l'API GitHub).

## ⏳ Ce que j'attends de toi (STOP loggés)
1. **PAT GitHub** frais dans `/srv/kua/.env` (`GITHUB_TOKEN`) — pour la livraison RÉELLE
   (push branche + PR draft via API REST GitHub). Permissions : Contents R/W + Pull requests
   R/W + Metadata (voir `docs/TODO-GITHUB-APP.md`). Sans lui, le Runner utilise le bare local.
2. **Un repo client à faible risque**, agent-ready (doc 04 : CLAUDE.md + `.kua/verify.sh`),
   pour le 1er vrai run `claude -p`. Dis-moi lequel + son `repo_url` ; je l'ajoute en DB et
   je lance un run de fumée (« ajoute un commentaire au README »).

## Décisions (prises en autonomie)
- **Agnostique** : `runs.goal` (libre) fait autorité ; le re-templating par preset se fait
  EN AMONT (gateway/agent remplissent le gabarit dans `runs.goal`), pas dans le Runner.
- **DELIVER** = git push + PR draft via **API REST GitHub** (jamais `gh` → pas de sudo).
  Self-test = push vers un **bare local** (« PR » = branche sur le remote).
- **Executor pluggable** (Claude/Fake) → pipeline et self-test identiques, sans coût en test.
- **Verify gate auto-détectée** ; si rien → `skipped` (ne bloque pas un nouveau projet).
- **merge** = clone frais → merge branche → push base (marche sur le bare ET un vrai remote).
  Pour GitHub avec branch protection, fusionner via l'API PR sera un raffinement.
- **Budget/sécurité** : `--max-budget-usd` + `timeout {min}m` ; dépassement → `budget_exceeded`/
  `timed_out`, **aucune PR**. JAMAIS de merge/push sur la base sans une ligne `approvals`
  (sauf `autonomy=auto`, jamais sur le moteur). Commits sous l'identité machine `kua-engine`.

## Reste / TODO
- Job de ménage des checkouts (suppression après N jours).
- Auto-merge via l'API PR GitHub (vs push direct de la base) pour les repos protégés.
- Notifications Discord (Hermes) sur `awaiting_approval` / fin de run.
- 1er vrai run `claude -p` sur un repo client (bloqué sur PAT + repo — voir ci-dessus).
- RLS : déjà activée (migration 002) ; le Runner (service_role/postgres) bypasse, normal.
