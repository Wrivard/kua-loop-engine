# Prompts pour Claude Code CLI — kua-loop-engine

Comment t'en servir : dézippe les docs à la racine du repo, ouvre Claude Code, pars **toujours en Plan mode** (Shift+Tab ×2) avec le prompt de la phase courante. Tu valides le plan, puis tu laisses exécuter. Un prompt = une phase. Ne saute pas de phase.

Règle d'or à rappeler à Claude si jamais il dérape : « Relis CLAUDE.md. Respecte les règles non-négociables et le vocabulaire verrouillé. Ne dépasse pas le scope de la phase courante. En cas de doute, arrête-toi et demande. »

---

## 0. Prompt d'orientation (à faire UNE fois, avant tout code)

```
Tu vas m'aider à construire kua-loop-engine. AVANT d'écrire la moindre ligne de code :

1. Lis dans l'ordre : CLAUDE.md, puis docs/01 à docs/16.
2. Fais-moi un résumé en 10 lignes de ce que tu as compris : le but, les composants, le vocabulaire (façade / loop / thread / message / run / agent de façade), et la règle "contexte borné".
3. Liste les 5 risques ou ambiguïtés les plus importants que tu vois pour le build, et propose comment les lever.
4. Ne propose PAS encore de plan d'implémentation. On valide d'abord ta compréhension.

Reste en Plan mode. N'écris aucun fichier.
```

---

## 1. Phase 0 — Spikes & plomberie

```
On attaque la Phase 0 décrite dans docs/14-ROADMAP-MVP.md. Objectif : tuer les risques d'intégration AVANT de bâtir le système. Lis docs/05, docs/06, docs/07, docs/03.

Fais-moi un plan détaillé pour exécuter, dans cet ordre strict, les spikes S1 à S5 :
- S1 : cronjob Hermes → commande shell → message Discord.
- S2 : message Discord → Hermes déclenche une commande locale.
- S3 : `claude -p ... --output-format json` sur le VPS → JSON parsé (résultat + coût). Commence par `claude --help` pour confirmer les VRAIS noms de flags/champs (ne devine pas).
- S4 : webhook signé de test → FastAPI → un `thread` + son 1er `run` en DB.
- S5 : page Next.js qui liste les runs en realtime (squelette UI, Supabase).

Pour chaque spike : ce que tu fais, le critère de réussite observable, et le risque que ça lève. Ensuite seulement, monte la plomberie : migrations SQL (docs/03), squelette des dossiers (voir "Layout du repo" dans CLAUDE.md), units systemd (docs/05), et la commande `kua sync`.

Critère de sortie (docs/14) : `kua run --project cobaye --facade bugfix --goal-extra "tâche bidon"` produit une PR draft + un message Discord + la carte du run visible dans l'UI squelette.

Contraintes : un seul endroit invoque `claude -p` (le Runner). DB = Supabase. Aucun secret commité. Arrête-toi après le plan pour validation.
```

Sous-prompt si un spike échoue :
```
Le spike S{n} échoue : {colle l'erreur}. Ne contourne pas en changeant l'architecture. Diagnostique la cause, propose 2 options de correction avec leurs trade-offs, et attends mon choix. Si c'est un détail de syntaxe Claude Code / Hermes, relis sa doc plutôt que de deviner.
```

---

## 2. Phase 1 — MVP cœur : UI + Façade A (bug-fix)

```
Phase 0 est verte. On attaque la Phase 1 (docs/14). Lis docs/08 (façade A), docs/06 (runner), docs/07 (gateway), docs/12 (UI), docs/16 (agent de façade — SCOPE PHASE 1 seulement), docs/03 (data model).

Construis, dans cet ordre :
A) Le pipeline bug-fix complet : webhook Sentry → thread + run → Runner (checkout, goal depuis runner/goals/bugfix.md, claude -p, gate /verify-app obligatoire, budgets + kill testé) → PR draft → awaiting_approval → notification Discord.
B) L'UI cœur (docs/12 étapes 1→3) : Inbox groupée par projet, liste de conversations, conversation ouverte avec cartes-run + boutons Oui/Refaire. "Refaire" = champ d'une ligne → relance un run dans le MÊME thread (scope Phase 1 de l'agent de façade, docs/16).
C) Approbation depuis l'UI ET Discord, toutes deux écrivant dans `approvals`.

Respecte ABSOLUMENT : jamais de push prod sans approbation ; chaque run a un budget ; contexte borné (un thread ne charge pas les autres threads) ; permissions fail-closed.

Critères de sortie : les cases à cocher de docs/08 + dans le fil Bugfix, "Refaire : {précision}" relance bien un run lié. Donne-moi le plan d'abord, par sous-tâches testables.
```

---

## 3. Phase 2 — Façades C, B, E + contrôles UI

```
Phase 1 est verte. Phase 2 (docs/14), dans l'ordre C → B → E.

1) Façade C (docs/09) : intake Discord + composer UI → agent de façade COMPLET (docs/16, scope Phase 2 : reply / ask / enqueue_run / escalate) → whitelist text_change + image_swap → avant/après → approbation → push.
2) Façade B (docs/11) : polling calendrier (titre "DEMO — {commerce} — {ville}") → démo 2 pages sur le gabarit Küa → preview noindex → lien Discord + carte UI.
3) Façade E (docs/15) : action "Client a accepté" → brief → plan de pages approuvable → 1 lot de 3 pages de bout en bout (TODO-CLIENT pour les contenus manquants).
4) UI (docs/12 étapes 4→5) : chips de façade + "+ Nouvelle" + popover d'autonomie (niveau façade) + drawer détail.

Chaque façade réutilise la plomberie de la Phase 1 (thread + run + Runner) ; ce qui change = le trigger, le gabarit de goal, et la gate. N'introduis pas de nouveau mécanisme d'exécution. Plan d'abord, façade par façade.
```

---

## 4. Phase 3 & 4 (référence)

```
Phase 3 (docs/10 SEO + vue coûts + onboarding des ~30 clients) et Phase 4 (dogfooding : le repo du moteur devient un projet, règles docs/13 §3 ; promotion sélective de loops vers `auto`). Ne les commence QUE si les phases précédentes sont vertes. Lis le doc concerné et propose un plan.
```

---

## Prompts utilitaires (réutilisables à tout moment)

Revue avant merge :
```
Avant que je merge : vérifie que ce changement respecte les règles non-négociables de CLAUDE.md, qu'aucun secret n'est commité, que /verify-app passe, et que le doc docs/ correspondant est à jour. Liste ce qui manque, sinon dis "prêt".
```

Anti-scope-creep :
```
Tu sors du scope de la phase. Reviens à {phase}. Note l'idée dans docs/14 sous "Hors-scope" ou un backlog, mais ne l'implémente pas maintenant.
```

Mise à jour de doc (compound engineering) :
```
Ce comportement a changé / cette erreur s'est produite. Mets à jour le doc docs/ concerné (et le CLAUDE.md du repo client si applicable) pour qu'une prochaine session ne refasse pas l'erreur.
```
