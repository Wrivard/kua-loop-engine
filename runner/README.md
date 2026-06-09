# runner — le seul invocateur de `claude -p` (doc 06)

Worker Python qui consomme `runs(queued)`, prépare un checkout git isolé, spawn
`claude -p`, applique budgets/timeout, parse la sortie JSON, met à jour les
statuts, et demande l'approbation selon l'autonomie de la loop.

**STATUT : squelette (étape 1 du setup).** Les implémentations arrivent avec les
spikes S3 (invocation `claude -p`) puis la Phase 1 (pipeline bugfix complet).

## Contenu
- `runner.py` — boucle du worker + chargement des gabarits de goal.
- `cli.py` — CLI `kua` (run / sync / status / approve / reject / onboard).
- `goals/{facade}.md` — gabarits de goal, un par façade (slots `{...}`).

## Invocation `claude -p` (doc 06, à confirmer au spike S3 via `claude --help`)
```bash
cd {checkout} && timeout {timeout_min}m claude -p "{goal}" \
  --output-format json --max-turns {max_iterations} \
  --model {model} --permission-mode acceptEdits
```
Permissions bash = `.claude/settings.json` du repo cible (fail-closed). Jamais
`--dangerously-skip-permissions` hors sandbox jetable.
