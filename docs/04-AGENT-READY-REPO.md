# 04 — Repo « agent-ready » (fondation par client)

Chaque repo client doit avoir cette structure avant d'être onboardé dans le moteur. C'est la fondation partagée entre le travail actif de William et les loops.

```
projet-client/
├── CLAUDE.md                  # conventions + contexte client (OBLIGATOIRE)
├── .claude/
│   ├── settings.json          # permissions pré-autorisées (OBLIGATOIRE)
│   ├── commands/              # slash commands réutilisables
│   │   ├── commit-push-pr.md
│   │   ├── verify-app.md      # comment vérifier que l'app marche (gate)
│   │   └── seo-audit.md       # si plan premium
│   └── agents/                # subagents optionnels (code-simplifier…)
├── .kua/
│   └── loops.yaml             # façades armées + autonomie (voir 03)
└── ...
```

## CLAUDE.md du client — gabarit minimal
```markdown
# CLAUDE.md — {Nom du client}

## Le projet
{Une phrase : quoi, pour qui. Ex: App de booking pour le salon X, Next.js 14 + Supabase.}

## Comment vérifier que ça marche (GATE — critique pour les loops)
- `npm run build` doit passer sans erreur
- `npm run test` doit passer
- {Vérification navigateur si applicable : pages clés à charger}

## Conventions du projet
- {stack, patterns, structure des dossiers}

## Ce que le client veut / ne veut pas
- {ton, marque, contraintes — ex: jamais toucher la page tarifs sans approbation}

## Leçons apprises (compound engineering — ajouter ici à chaque erreur de loop)
- ...
```

## .claude/settings.json — point de départ
Permissions fail-closed : seulement les commandes que la gate de vérif exige.
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run build:*)", "Bash(npm run test:*)", "Bash(npm run lint:*)",
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(git add:*)",
      "Bash(git commit:*)", "Bash(git push:*)", "Bash(gh pr create:*)"
    ]
  }
}
```
Ajuster par projet (ex. `bun` au lieu de `npm`). Jamais de wildcard global.

## /verify-app — la gate, en slash command
La commande la plus importante du repo : elle dit à Claude COMMENT prouver que son travail marche. Build + tests + (si web) ouvrir les pages clés. Le Runner exige que le run termine par une exécution de cette gate réussie avant `awaiting_approval`.

## Checklist d'onboarding d'un client (commande `kua onboard <repo>`)
1. Cloner le repo, vérifier la présence de CLAUDE.md / settings.json / loops.yaml — sinon les générer depuis les gabarits et ouvrir une PR « agent-ready ».
2. Sync `loops.yaml` → DB.
3. Créer le channel Discord client si absent ; mapper `discord_channel_id`.
4. Brancher le webhook Sentry du projet vers le Trigger Gateway (si façade bugfix).
5. Run de fumée : un run manuel trivial (« ajoute un commentaire dans le README ») de bout en bout.
