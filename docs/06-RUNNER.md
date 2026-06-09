# 06 — Le Runner

Le seul endroit du système où `claude -p` est invoqué. Worker Python qui poll la table `runs` (status=queued), exécute, met à jour. Chaque run appartient à un `thread` (conversation) : le Runner met aussi à jour le statut du thread (`working` → `awaiting_approval` → `resolved`).

## Cycle d'un run
```
1. CLAIM      : SELECT ... FOR UPDATE SKIP LOCKED ; status → preparing
2. PREPARE    : git clone/fetch dans /srv/kua/checkouts/{project}/{run_id}/ ; branche kua/{facade}/{run_id_court}
3. COMPILE    : assembler le goal final = gabarit de la façade + contexte de l'événement + rappels de garde-fous
4. RUN        : spawn claude -p (voir invocation) ; status → running ; streamer le log vers log_path
5. VERIFY     : exiger que la gate (/verify-app) ait passé ; status → verifying puis :
6. DELIVER    : créer PR draft (gh pr create --draft) ; capturer pr_url, cost, summary
7. GATE D'AUTONOMIE (lue sur la `loop` du thread) :
   - approve_final → run+thread `awaiting_approval` + message `agent` dans le thread + notification Discord (résumé, lien PR, avant/après)
   - auto          → merge/push selon la façade ; run `pushed`, thread `resolved`
8. CLEANUP    : checkout supprimé après N jours (job de ménage)
```

## Invocation `claude -p` (VÉRIFIÉE au spike S3 — Claude Code 2.1.170, 2026-06-09)
```bash
cd {checkout} && timeout {timeout_min}m claude -p "{goal}" \
  --output-format json \
  --max-budget-usd {budget_usd} \
  --model {model} \
  --permission-mode acceptEdits
```
- Les permissions bash viennent du `.claude/settings.json` du repo (fail-closed).
- **`--max-turns` N'EXISTE PLUS** en 2.1.170. Le budget s'impose nativement via
  **`--max-budget-usd`** (Claude s'arrête quand le prochain tour dépasserait le
  montant) ; le timeout reste géré par `timeout {timeout_min}m`. La colonne
  `loops.max_iterations` n'a plus d'équivalent CLI direct — la garder comme repère
  produit/coût, mais les vrais garde-fous d'exécution sont `--max-budget-usd` + timeout.
- Flags utiles confirmés : `--effort {low|medium|high|xhigh|max}`, `--fallback-model`,
  `-w/--worktree`, `--json-schema`, `--session-id` (pour les redos dans un thread),
  `--allowedTools`/`--disallowedTools`, `--add-dir`, `--settings`.
- Sortie JSON (`--output-format json`, clés vérifiées) :
  - `type` = "result", `subtype` = "success" | (erreur), `is_error` (bool).
  - `result` (str, sortie finale), `total_cost_usd` (float), `num_turns` (int).
  - `stop_reason`, `terminal_reason`, `session_id`, `duration_ms`, `usage`,
    `modelUsage`, `permission_denials` (list).
  → mapper `result`→summary, `total_cost_usd`→cost_usd, `num_turns`→iterations,
    `session_id`→pour reprise/redo. `is_error=true` ou `subtype≠success` → run `failed`.
- Si le coût dépasse `budget_usd` (Claude coupe via `--max-budget-usd`) ou le timeout
  sonne → status `budget_exceeded`/`timed_out`, notification. Le test du kill est un
  critère d'acceptation de la Phase 1.

## Compilation du goal (par façade)
Chaque façade a un gabarit dans `runner/goals/{facade}.md` avec des slots `{...}`. Règles communes injectées en fin de goal :
```
RÈGLES :
- Fais le plus petit changement sûr qui atteint le goal.
- Ajoute/ajuste les tests qui prouvent le changement.
- Termine OBLIGATOIREMENT par /verify-app et corrige jusqu'à ce que ça passe.
- Ne touche à rien hors du périmètre du goal. En cas de doute, arrête et résume le blocage.
- Commit en messages conventionnels ; n'ouvre PAS la PR toi-même (le Runner s'en charge).
```

## Concurrence & isolation
- `MAX_CONCURRENT_RUNS` (env, défaut 2 sur le petit VPS).
- Un checkout par run = pas de conflit entre runs (façon Boris : checkouts, pas worktrees partagés).
- Un run par (project, facade) actif à la fois — les autres restent queued (évite deux fixes simultanés sur le même repo).

## CLI du Runner (aussi appelée par Hermes)
```
kua run --project X --facade seo [--goal-extra "..."]   # enqueue manuel/cron
kua sync <repo_path|all>                                # loops.yaml → DB
kua status [run_id]                                     # état lisible
kua approve <run_id> / kua reject <run_id> [--redo "…"] # décisions (aussi via Discord)
kua onboard <repo_url>                                  # checklist 04
```
