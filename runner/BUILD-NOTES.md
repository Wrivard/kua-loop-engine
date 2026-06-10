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
