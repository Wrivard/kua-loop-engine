# UX-SPEC — Küa, repensé comme un produit

Spec d'interaction (présentation seulement — zéro logique métier/endpoint/DB/Runner/auth modifié ;
exception : routes de LECTURE légères réutilisant des reads existants, documentées). Issue d'un
audit de **182 interactions** (5 zones) + un panel de design de navigation. Style : dark premium Küa,
monochrome + accent `#00e57a` (`--brand`) **réservé aux actions primaires et à l'état actif**, densité
maîtrisée, beaucoup d'air, une seule famille typo (Geist), chiffres tabulaires pour les coûts.

## Le produit (on raisonne à partir de ça)
Un gars d'agence, **souvent sur son cell**, qui délègue du code à des agents. 3 jobs par fréquence :
1. **DISPATCHER** — taper une tâche en 5 s, n'importe où.
2. **APPROUVER** — comprendre une livraison en **<10 s**, confirmer/refaire en **1 tap**.
3. **SURVEILLER** — santé, coûts, ce qui roule, d'un coup d'œil.
Le chat n'est pas social : c'est une **surface de commande + un journal d'exécution**.

---

## 1. ARCHITECTURE DE NAVIGATION (décidée + justifiée)

> Départage fait sur le **3e job (surveiller)** : aujourd'hui il est invisible (coût = sous-titre,
> CostDashboard = Dialog caché, pause/health enfouis dans Réglages). La nav choisie le rend visible.

**Le composer N'EST PAS un item de nav** : c'est un **dock fixe en bas, sur TOUTES les vues** (décision A).
La nav primaire = **3 destinations** + un retour Accueil + le profil :

| Destination | Job | Route | Rôle |
|---|---|---|---|
| **Accueil** (logo, pas un onglet) | dispatch | `/` | Composer en grand + **journal** (fil récent : threads/propositions avec leur carte). Atterrissage par défaut. |
| **Inbox** | approuver | `/inbox` | À confirmer (badge = propositions + runs `awaiting_approval`). Action sur place. |
| **Activité** *(NOUVELLE)* | surveiller | `/activity` | Santé moteur + pause, coût du mois (global + par projet), runs en cours/échoués. Absorbe `CostDashboard` (Dialog caché) + pause/health (sortis de Réglages). |
| **Projets** | dispatch+surveiller | rail desktop / feuille mobile → `/p/[slug]` | Commutateur de contexte du composer ; `/p/[slug]` = threads + chips façade (les loops **restent des chips intra-projet**, PAS des enfants de nav). |
| Réglages | config froide | `/settings` | Menu profil (avatar). Apparence/Modèles/Connecteurs/Skills + Système(logs/debug). Hors hot-path. |

**Pourquoi pas « Inbox = home »** (proposé par le juge) : risque de cul-de-sac quand l'inbox est vide.
L'Accueil-journal sert dispatch (composer) ET surveiller (fil), et évite de changer le routage par défaut.

**Pattern mobile (380px)** — empilement bas→haut, jamais >4 zones tap :
```
┌────────────────────────────┐
│ header mince (logo · cloche)│  ← logo = Accueil
│ contenu (scroll)            │
│ …                           │
│ [tab-bar: Inbox·Activité·Projets] │ ← se masque à l'ouverture du clavier
│ [COMPOSER dock — fixe]      │ ← safe-area-inset-bottom, prime sur tout
└────────────────────────────┘
```
**Desktop** : rail gauche (logo, 3 destinations, liste projets, profil en bas) + composer-dock fixe bas du panneau central.

**Garde-fous d'implémentation** (issus des risques relevés) :
- **safe-area-inset** : le dock utilise `env(safe-area-inset-bottom)` ; layout `flex-col` + dock `sticky bottom-0` (plus robuste que `fixed` face au clavier iOS). *Net-new transversal — vérifié absent aujourd'hui.*
- **Mode du composer dérivé de `usePathname`** (pas d'URL param caché) → testable, pas de mauvais routage.
- **Vocabulaire verrouillé** (CLAUDE.md) : sur `/c/[id]` on parle à l'**agent de façade** (`insertMessage`) ; ailleurs au **cerveau** (`/api/agent/propose`). Jamais confondre cerveau / agent de façade / Runner → chip de scope + placeholder distinct obligatoires.
- **Découvrabilité @mention** : greeting explicite + autocomplete au caractère `@`.
- **Scission Système** : pause+health+coût montent vers `/activity` ; **logs/debug RESTENT** dans Réglages>Système (froid).

---

## 2. COMPOSER GLOBAL — modèle d'états (décision A)

Un **seul** composant `<Composer>` (fusionne `BrainChat` + `Composer` thread), rendu dans `AppShell`,
dock fixe en bas. Trois **modes dérivés de la route** (jamais mélangés) :

| Mode | Route | Cible | Endpoint | Chip de scope | Placeholder |
|---|---|---|---|---|---|
| **global** | `/`, `/inbox`, `/activity` | le cerveau | `/api/agent/propose` | — (ou « @projet » tapé) | « Décris une tâche, ou @projet… » |
| **scopé-projet** | `/p/[slug]` | cerveau + `project_id` fixé | `/api/agent/propose` | `◧ NomProjet ✕` | « Sur NomProjet : décris… » |
| **thread** | `/c/[id]` | **agent de façade** | `insertMessage` | `◧ Sujet · façade ✕` | « Réponds à l'agent… » |

- **@mention** : taper `@` ouvre un autocomplete (projets via `getProjects`, déjà chargé ; + 6 façades).
  Sélection → pose la cible (chip). `parseMention(input)` (pur, testé) extrait `{ mention, rest }`.
- **Proposition inline** : en mode global/projet, la réponse du cerveau (carte de révision = `ProposalCard`
  réutilisée) apparaît dans une **feuille au-dessus du dock** ; Confirmer → navigue vers le thread créé +
  toast. En mode thread, la réponse de l'agent s'insère dans le fil (grammaire type 2).
- **États visuels** : repos / focus (ring brand) / `thinking` (« le cerveau réfléchit… ») / erreur inline.
- **✕ sur le chip** = revient au mode global sans quitter la page.

**Disparaissent** (consolidés dans le dock) : `GlobalChat` bouton « Nouvelle » + `fresh()`,
`NewConversationDialog`, `BrainChatDialog` (comme créateur), boutons `+ Nouveau`/`Nouvelle` de ProjectView,
`+ Projet` sidebar (création projet = « nouveau projet … » au composer ; CLI reste pour l'ops).

---

## 3. GRAMMAIRE VISUELLE STRICTE (décision C — 4 types, jamais mélangés)

| # | Type | Forme | Règle d'usage |
|---|---|---|---|
| 1 | **Message utilisateur** | bulle alignée **droite**, `bg-secondary`, sobre | jamais l'accent en fond |
| 2 | **Réponse agent** (texte/questions) | bulle **gauche**, **markdown rendu**, repli `>6 lignes` | aucun statut/chip dedans |
| 3 | **Événement** | **UNE ligne fine centrée**, méta (« Run lancé · 14h02 », « PR #4 ouverte ») | jamais une bulle, jamais d'action |
| 4 | **Carte de run/livrable** | **LE SEUL élément riche** (§4) | rien d'autre n'a le droit d'être une carte |

Règle dure : **rien d'autre n'est une carte**. Les bulles 1-2 n'ont ni bordure-carte ni statut ni chips.

---

## 4. CARTE DE RUN — cycle d'états (décision B : une carte qui ÉVOLUE)

Un **thread = une unité de travail** ; ses runs (initial + redos) sont des **versions du même livrable**
→ **UNE carte par thread**, qui mute. Pas 5-6 bulles. États **dérivés de `run.status`** (le backend
n'émet pas d'événements granulaires → on dérive des données ; limites notées §7) :

```
            confirm (approve)        ┌─────────────┐
ProposalCard ───────────────▶ run créé│  EN COURS   │ queued/preparing/running/verifying
(pas encore un run)                   │ (progrès…)  │
                                      └──────┬──────┘
                                             ▼
                                   ┌────────────────────┐   Confirmer   ┌──────────────┐
                                   │ LIVRÉ · À CONFIRMER │──────────────▶│ CONFIRMÉ/MERGÉ│
                                   │ verdict + diff + PR │   Rejeter     └──────────────┘
                                   │ Revue·Confirmer·Refaire│────────────▶ REFUSÉ
                                   └──────────┬─────────┘
                                              │ Refaire avec nuance → NOUVELLE version (v2) DANS la carte
                                              ▼                          (v1 repliée, accessible)
                                       échec → ÉCHOUÉ (raison)   failed/budget_exceeded/timed_out
```

- **Refaire** crée un nouveau run (même thread) → **v2 active, v1 repliée** dans un sélecteur de version.
- **Contenu de la carte** (grammaire) : titre humain · `StatusBadge` (un seul, en tête) · **verdict EN UNE
  LIGNE** (§5) · chips `PrLink`/`BranchChip`/`CostBadge` alignés · actions en pied (Revue · Confirmer · Refaire).
- **Supprime les 3 couches d'état redondantes** : on garde `StatusBadge` (tête) ; `StatusNote` bas =
  fusionné/supprimé ; le « détails » (RunDetailsDrawer) ne **duplique plus** PR/branche/coût (déjà en chips).
- `synthFromRuns` : remplacé par le builder de fil (§7) — plus de double source.

---

## 5. VERDICT DE VÉRIF — une ligne, jamais contradictoire

Bug constaté : la carte montrait le **rapport plein** (Verification/Verdict/Claim/Method/Steps, venu du
`summary` markdown de l'agent) **PUIS** une ligne « Non vérifié — aucune gate détectée » (venue du gate
`skipped`) → contradiction.

**Règle** : **UN seul verdict**, réconcilié. `reconcileVerify({ gate:{status,command,output}, summary })` (pur, testé) :
1. **Extrait** la section de vérif du `summary` (si présente) → `body` nettoyé + `vSummary`.
2. Verdict unique : gate **définitif** (passed/failed) prioritaire ; sinon `vSummary` reconnu ; sinon gate (skipped).
3. Le `body` nettoyé alimente « Fait » (markdown) ; le verdict alimente **un seul** `VerdictCard`.
- **Badge couleur** : PASS=emerald, FAIL=red, **SKIP=amber (caution)** — plus « muted » : approuver sans
  vérif est un signal, pas un détail. Claim courte sur la ligne ; **détails = repli unique** (méthode, steps ✅/❌, findings).

---

## 6. INBOX — action rapide sur place (décision D)

- **Liste** : carte propre (façade pastille, `SourceChip`, projet, âge, `CostBadge`, aperçu `plainText`).
  Le **lien projet qui quittait l'inbox est supprimé** (violait D). Quick-approve garde un retour visuel
  (plus de clic silencieux : tooltip « choisis un projet » si bloqué).
- **Détail** (`InboxDetail`, dialog desktop / **plein écran mobile**) : résumé clair (quoi/pourquoi/où) ·
  **AVANT→APRÈS** (diff via l'endpoint PR existant `/api/pr/[runId]` si un run/PR existe ; sinon goal +
  fichiers touchés) · **verdict une-ligne dépliable** · coût · branche/PR.
- **Actions** : **CONFIRMER (primaire, brand)** · **Refaire avec nuance (champ inline)** · Rejeter ·
  **« Ouvrir la loop → » (secondaire)**. On ne quitte l'inbox **que si on choisit**.
- **Anti-confusion boutons** : fini les 6 boutons (footer + ProposalCard). « Refaire » = champ inline
  (pas un swap vers un autre formulaire à 3 boutons). « Ajuster » devient « Refaire avec nuance ».
- **Après action** : item retiré avec feedback (optimistic + toast), le suivant est prêt (vider au pouce).
- *(P2 noté)* : filtre/recherche par façade/projet quand >~20 items.

---

## 7. DÉRIVATION D'ÉTATS — ce qu'on peut faire sans toucher au backend

- **Fil du thread** : `buildThreadView(messages, runs)` (pur, testé) produit la liste ordonnée
  `{message|event|runcard}` : groupe **tous les runs du thread sous UNE carte** (versions), convertit les
  messages d'annonce/résultat redondants (« Run lancé », « Fait. PR: », « Refaire: ») en **événements
  (type 3)** ou les **absorbe** dans la carte. Plus de `synthFromRuns`.
- **États de run** : `deriveRunState(run)` (pur, testé) → `proposed|running|awaiting|done|rejected|failed`
  + props d'affichage. Dérivé de `run.status` uniquement.
- **LIMITES documentées** : pas d'événements granulaires de progrès (on affiche le label de statut +
  pulse, pas une vraie barre) ; `thread.status` est maintenu par le backend (non dérivé) ; matching
  optimiste par contenu (collision rare → on ajoute un `local_id` transient côté client) ; abonnement
  `approvals` non filtré par thread (refetch large — toléré MVP, noté).

---

## 8. ÉTATS VIDES / CHARGEMENT / ERREUR (partout)

Chaque vue : **vide** (dit **quoi faire** : « Tape en bas pour démarrer », « Rien à confirmer 🎉 » + invite),
**chargement** (skeletons, **pas de layout shift**), **erreur** (message + Réessayer). Optimistic UI sur
Confirmer/Rejeter ; **toasts sobres** (succès/erreur, auto-dismiss) ; transitions douces.

---

## 9. INVENTAIRE — garder / fusionner / supprimer (extrait actionnable)

Sur 182 interactions auditées, l'écrasante majorité = **garder**. Consolidations :

**Entrées (supprimer la friction « 3 façons de créer ») :**
- ✂ `GlobalChat` bouton « Nouvelle » + `fresh()` → action du composer.
- ✂ `NewConversationDialog` (3e façon de créer) → `@façade` au composer.
- ✂ ProjectView `+ Nouveau` (BrainChatDialog) **et** `Nouvelle` (preset) → composer scopé projet.
- ✂ Sidebar `+ Projet` (NewProjectDialog) → « nouveau projet… » au composer (CLI pour l'ops).
- ⛀ `BrainChat` + `Composer` (thread) → **un seul** `<Composer>` paramétré par route.
- ⛀ `BrainChatDialog` → conservé pour usages modaux futurs, plus comme créateur.

**Fil & run :**
- ⟳ `VerdictCard` SKIP → amber (caution), réconcilié, une ligne (§5).
- ⛀ `StatusNote` (bas) → fusionné dans `StatusBadge` (tête).
- ⛀ chips PR/branche/coût → restent en résumé ; `RunDetailsDrawer` ne **duplique plus**.
- ✂ `synthFromRuns` → `buildThreadView` (§7).

**Inbox :**
- ✂ lien projet qui quitte l'inbox.
- ⟳ footer 3 boutons + swap edit → Confirmer/Refaire(inline)/Rejeter/Ouvrir-loop ; « Ajuster »→« Refaire avec nuance ».

**Nav/secondaire :**
- ⛀ CostDashboard (Dialog) + pause/health (Réglages) → page **`/activity`**.
- Réglages relégué au menu profil.

---

## 10. PLAN PAR MILESTONE
- **M2** : `<Composer>` dock omniprésent (AppShell, modes via `usePathname`) + `parseMention` + autocomplete
  + propositions inline (feuille) + suppression/démotion des entrées doublons + safe-area-inset.
- **M3** : `buildThreadView` + `deriveRunState` + `reconcileVerify` ; carte de run unifiée (versions) ;
  grammaire 4 types appliquée au fil ; nettoyage des bulles redondantes.
- **M4** : `InboxDetail` avant→après (diff) + actions sur place + « Ouvrir la loop » ; flow vider-au-pouce + toasts.
- **M5** : page `/activity` ; nav (tab-bar mobile / rail desktop) ; états vides/chargement/erreur partout ;
  optimistic + toasts ; cohérence grammaire (dashboard/notifs/réglages/drawer).
- **M6** : audit des 3 jobs (380px + desktop, job 2 <10 s) ; tests (carte de run, module inbox, @mention) ;
  pytest+vitest+build+lint verts ; UX-SPEC + BUILD-NOTES (avant/après + P2).

### Reporté (P2)
Filtre/recherche inbox ; vraie barre de progrès de run (besoin d'événements backend) ; undo court sur
approbation ; unification Notifications↔Inbox (autorité) ; coloration syntaxique du diff ; refonte fine des
formulaires Réglages ; cache du coût mensuel.
