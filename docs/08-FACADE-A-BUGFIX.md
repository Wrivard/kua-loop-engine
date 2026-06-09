# 08 — Façade A : Bug-fix (Sentry / PostHog) (MVP)

## Pourquoi en premier
La plus mûre (pattern documenté par Sentry eux-mêmes), la moins ambiguë (une erreur = un goal clair), et elle force la construction de TOUTE la tuyauterie réutilisable (gateway → runs → runner → PR → approbation Discord).

## Flow complet
```
Erreur en prod → Sentry alert rule → webhook → Trigger Gateway
→ thread (conversation) + run(queued) → Runner : checkout + branche kua/bugfix/xxxx
→ claude -p avec le goal bugfix → fix minimal + test de régression → /verify-app
→ PR draft (gh pr create --draft) → awaiting_approval
→ Discord #kua-loops-alerts : "🐛 {projet} — {titre}. Fix prêt : {pr_url}. Coût {x}$. `approve`/`reject`/`redo …`"
→ William approuve (Discord ou CLI) → merge de la PR → status pushed
```

## Gabarit de goal (`runner/goals/bugfix.md`)
```
Une erreur de production a été capturée par Sentry sur ce projet.

ISSUE : {title}
LIEN  : {permalink}
NIVEAU: {level} | RELEASE: {release} | CULPRIT: {culprit}
DÉTAILS (stack trace / breadcrumbs extraits du payload) :
{details}

TÂCHE :
1. Si le MCP Sentry est configuré, récupère le contexte complet de l'issue {issue_id}
   (stack trace complète, breadcrumbs, suspect commits, analyse Seer si dispo).
2. Identifie la cause racine. Explique-la en 2 phrases dans ton résumé final.
3. Fais le PLUS PETIT fix sûr dans ce repo.
4. Ajoute un test de régression qui échoue sans le fix et passe avec.
5. Roule la suite de tests, puis /verify-app. Corrige jusqu'à vert.
{règles communes — voir 06}
```

## Configuration côté Sentry (par projet client)
1. Alert rule : "When a new issue is created [AND level ≥ error]" → action Webhook → `https://hooks.kua.quebec/hooks/sentry/{project_id}` avec le secret.
2. (Optionnel, recommandé) MCP Sentry configuré dans le repo client (`.mcp.json`) pour que Claude pull le contexte riche pendant le run — OAuth du serveur MCP hébergé de Sentry.

## Une issue = une conversation (thread)
Chaque issue Sentry/PostHog crée UNE conversation dans la façade Bugfix (dédup par `external_id`). Plusieurs bugs = plusieurs conversations en parallèle, chacune au contexte court. À la résolution (PR mergée), la conversation passe `resolved` puis s'archive (hors contexte). Si la même issue réapparaît, on rouvre la conversation existante au lieu d'en créer une nouvelle.

## Garde-fous spécifiques
- `max_iterations: 8`, `budget_usd: 5`, `timeout_min: 30` par défaut.
- `max_runs_per_day: 5` + regroupement (07) — un mauvais déploiement ne déclenche pas une tempête.
- Si Claude conclut que le fix exige une décision produit (ex. comportement ambigu), il doit s'ARRÊTER et résumer — le Runner met `awaiting_approval` avec le résumé sans PR. Jamais de fix spéculatif large.

## Critères d'acceptation (MVP done)
- [ ] Une erreur réelle provoquée volontairement sur l'app cobaye crée une conversation + run automatiquement (<60 s après l'alerte Sentry).
- [ ] La PR draft contient : fix minimal, test de régression, description avec lien Sentry + cause racine.
- [ ] /verify-app a passé (visible dans le log du run).
- [ ] Le message Discord permet d'approuver ; l'approbation merge la PR.
- [ ] `redo "précision…"` crée un nouveau run dans la MÊME conversation (contexte court conservé).
- [ ] Un run qui dépasse le budget est tué proprement + notifié.
- [ ] Le même issue Sentry renvoyé ne crée pas de doublon.

## Variante PostHog
Même pipeline, source `posthog` : alerte PostHog (error tracking ou seuil d'insight) → `POST /hooks/posthog/{project_id}` → même normalisation (`title`, `permalink`, `details` depuis le payload PostHog). Le gabarit de goal est identique ; seul le bloc DÉTAILS change de forme. Dédup par `external_id` PostHog. Pour le MVP, brancher la source que l'app cobaye possède déjà ; l'autre suit.
