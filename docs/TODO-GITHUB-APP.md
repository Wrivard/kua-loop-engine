# TODO — Migrer l'auth GitHub vers une GitHub App (long terme)

> ⚠️ **À NE PAS OUBLIER.** Note volontairement dans le repo (survit à un reset de session/mémoire).
> Statut au 2026-06-10 : on utilise un **PAT fine-grained** comme solution provisoire. La cible
> long terme pour la prod multi-clients est une **GitHub App**.

## Pourquoi un PAT ne suffit pas à terme
Le moteur agit sur **plusieurs repos de clients** (clone, branche, **PR draft** — règle #1 : jamais
de push direct en prod). Or :
- un **fine-grained PAT est lié à UN seul owner** → il ne peut pas couvrir des repos appartenant aux
  comptes/orgs des clients ;
- un PAT classic `repo` donne accès à **tout** ce que le porteur voit (trop large) et porte une
  identité personnelle.

## Cible : GitHub App « Küa Loop Engine »
- Le client **installe l'app** sur son repo → pas besoin d'ajouter une personne en collaborateur.
- **Tokens d'installation courts (~1 h)** au lieu d'un secret permanent.
- Permissions granulaires par installation, révocables par repo, meilleure limite d'API, identité bot,
  audit propre.
- Alternative intermédiaire : un **compte bot dédié** (cohérent avec l'identité machine `kua-engine`).

## Permissions à donner (mêmes besoins que le PAT actuel)
Repository permissions :
- **Contents : Read & write** — clone, branches, push, commit (noyau)
- **Pull requests : Read & write** — ouvrir/mettre à jour les PR draft (livrable #1)
- **Metadata : Read-only** — obligatoire
- **Commit statuses : Read & write** — statut de run sur commits/PR
- *Issues : R/W* — si triggers/commentaires d'issues (Sentry/Discord)
- *Workflows : R/W* — seulement si une PR touche `.github/workflows/`
- *Actions : Read* — si lecture des résultats CI avant approbation
- *Webhooks : R/W* — seulement si configuration des webhooks par API

## Où vit le secret (non-négociable)
Backend uniquement (`gateway`/`runner`), `/srv/kua/.env`, jamais commité. **Jamais dans `ui/`**
(le front n'utilise que l'anon key Supabase `NEXT_PUBLIC_*`). Voir `docs/13-SECURITY-BUDGETS.md`.

## Quand le faire
Avant d'onboarder de vrais repos clients à grande échelle (Phase 2/3 de `docs/14-ROADMAP-MVP.md`).
Pour le dogfooding du repo moteur + le client cobaye, le PAT suffit.
