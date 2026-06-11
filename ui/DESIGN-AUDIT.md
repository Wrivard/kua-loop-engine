# DESIGN-AUDIT — couche de présentation Küa

Audit de la couche **présentation** (zéro logique métier/endpoint/DB touchés). Style verrouillé :
dark premium, monochrome + un seul accent `#00e57a` (`--brand`) en highlight, contrastes doux,
Vercel/Linear-grade. Tokens shadcn déjà en place (`globals.css`). Audit fait sur le code réel des
composants (2026-06-11), priorisé **P0** (fait mal aux yeux / bloque la compréhension) → **P2** (polish).

## Constat racine (cause de la majorité des P0)
Le texte riche est rendu **verbatim** partout : `brain-chat.tsx::Bubble` et `message-bubble.tsx`
affichent `{text}` / `{content}` dans un `whitespace-pre-wrap`. Le cerveau (`claude -p`) et les
résumés de run produisent du markdown (`## Verification`, `**Verdict:**`, `` `code` ``, listes) →
**les marques markdown sont visibles à l'écran**. Idem `run.summary` (`run-card`, `pr-review`,
`run-details-drawer`), `resume_humain` (`proposal-card`, `proposal-inbox-card`), et les `body` de
notifications. **Il n'existe aucun composant de rendu markdown.** → c'est le fix #1 (Milestone B).

Second constat : le **rapport de vérif** est un mur de texte. `pr-review.tsx` dumpe `verify_output`
(jusqu'à 4000 car. de stdout brut `$ npm run lint …`) dans un `<pre>`. `run-card.tsx` ne montre PAS
du tout la vérif dans le fil. Il faut un **VerdictCard** compact (badge + claim + détails repliés).

---

## Par vue

### 1. Accueil chat — `global-chat.tsx` + `brain-chat.tsx`
- **P0** — markdown brut dans les bulles agent (`Bubble`, l.194-211). `##`, `**`, backticks visibles.
- **P0** — propositions = bulles texte ; aucune hiérarchie : un résumé agent, une question, une carte
  de proposition se ressemblent. L'« indicateur de réflexion » = une bulle `"…"` (l.162), pauvre.
- **P1** — pas de repli : une réponse longue du cerveau = mur de texte sans « voir plus ».
- **P1** — questions manquantes rendues en `• q\n• q` (l.100) au lieu d'une vraie liste.
- **P1** — bulle user `bg-brand/10` : l'accent marque devient un fond de bulle (devrait rester highlight).
- **P2** — composer correct (textarea auto-grow + Enter), mais pas d'erreur inline distincte du fil.

### 2. Vue thread/loop — `conversation-view.tsx` + `message-bubble.tsx` + `run-card.tsx`
- **P0** — `message-bubble` rend `{content}` brut → markdown agent visible.
- **P0** — `run-card` `run.summary` rendu en `<p>` brut (`Line "Fait"`, l.94). Aucune VerdictCard ;
  la vérif n'apparaît QUE si on ouvre la revue PR (drawer). Le coût/branche/PR sont des micro-liens
  noyés en bas (l.136-149).
- **P1** — pas de séparation « événement de statut » (Run lancé / PR ouverte) vs message : tout est
  bulle ou carte. `StatusNote` (l.156) approche l'idée mais est noyé dans la carte.
- **P1** — `synthFromRuns` met `runs[0].goal` comme 1er message agent (brut) — souvent un goal multi-ligne.
- **P2** — header thread soigné (liseré façade `inset box-shadow`). OK.

### 3. Inbox — `inbox-view.tsx` + `proposal-inbox-card.tsx` + `thread-row.tsx`
- **P0 (cœur du milestone D)** — **on confirme à l'aveugle.** `ProposalInboxCard` montre titre +
  `resume_humain` + budget, puis 3 boutons. Aucun détail, aucun avant→après, aucun diff, aucune vérif.
  « Approuver » crée un thread sans qu'on ait rien vu.
- **P1** — preview = `resume_humain` brut (markdown possible).
- **P1** — pastille source = `bg-accent` gris uniforme (l.84) : pas d'icône chat/discord/cron/sentry,
  pas de couleur. Pas d'« âge » (created_at) affiché.
- **P1** — deux sections (`Propositions` puis groupes de threads) au style différent → incohérence
  visuelle (cartes vs rangées).
- **P2** — compteur « N à confirmer » OK ; état vide OK (`Rien à confirmer 🎉`).

### 4. Revue de PR / diff — `pr-review.tsx`
- **P0** — `verify_output` dumpé brut en `<pre>` (l.177-181) = mur de texte. → VerdictCard.
- **P1** — `run.summary` rendu brut (l.159-161, markdown possible).
- **P1** — diff viewer correct (`DiffFile` repliable, `DiffLines` colorées +/-/@@) mais **tout est
  fermé par défaut** et il n'y a pas de coloration syntaxique du contenu (juste +/−). Acceptable MVP.
- **P1** — méta coût = `coût X $` texte plat (l.150) → CostBadge.
- **P2** — header diff (`+N −N · fichiers · commits · draft`) bien fait.

### 5. Dashboard coûts — `cost-dashboard.tsx`
- **P1** — globalement propre (Stat cards, pills statut, historique). Mais « Budget / run (Σ loops) »
  est un label cryptique. Pas de barre dépensé/budget (juste deux chiffres séparés).
- **P1** — historique : lignes denses à 6 colonnes → serré sur 380px (le `timeAgo` est `hidden sm:`).
- **P2** — PR = lien texte « PR » brand → remplacer par PrLink partagé.

### 6. Réglages (5+ onglets) — `settings/{appearance,connectors,models,skills,system,system-*}.tsx`
- **P1** — à uniformiser : titres de section, espacements, cartes. (Formulaires surtout → faible
  risque markdown.) `system-logs`/`system-debug` peuvent afficher des logs bruts → vérifier wrap/pre.
- **P2** — cohérence typo/cartes avec le reste (Milestone E, si le temps). Détail laissé en P2.

### 7. Drawer projet — `project-settings-drawer.tsx` + `project-view.tsx`
- **P1** — vérifier espacements et cohérence carte/badge avec les fondations B.
- **P2** — polish.

### 8. Wizard MCP — `mcp-wizard.tsx`
- **P1** — peut afficher la sortie d'un test de connexion (texte brut) → passer par Markdown/`<pre>` wrap.
- **P2** — cohérence visuelle des étapes.

### 9. Notifications — `notification-bell.tsx`
- **P1** — `n.body` en `truncate` simple ; emoji-only par type (pas de couleur sémantique). OK mais
  à aligner sur StatusBadge (couleur par kind). Items cliquables 100% — bon au pouce.
- **P2** — pas d'état « tout lu » distinct visuellement après action.

### 10. Cartes proposition/révision — `proposal-card.tsx`, `proposal-inbox-card.tsx`, `run-card.tsx`
- **P0** — `resume_humain` brut (markdown). 
- **P1** — `proposal-card` : `budget` confirmé via `Number(budget) || proposal.budget_usd` (string|number
  mélange — déjà connu) ; libellés d'action OK. Manque CostBadge/StatusBadge cohérents.

---

## Accessibilité / mobile (transversal)
- **P1** — contrastes : `text-muted-foreground` = `0 0% 62%` sur fond `0 0% 4%` → ~4.3:1, limite pour
  le petit texte `[10px]/[11px]` très utilisé. Éviter le muted sous 12px pour de l'info importante.
- **P1** — beaucoup de `text-[10px]`/`[11px]` (méta, pills) → dur à lire au cell. Plancher à 11-12px
  pour tout texte porteur de sens ; 10px réservé aux étiquettes décoratives.
- **P0 mobile** — champs déjà à 16px (anti-zoom iOS, `globals.css`). Bon. Vérifier qu'aucun `<pre>`
  (diff, verify, logs) ne déborde horizontalement le viewport 380px (wrap ou scroll interne borné).
- **P1** — cibles tap : les micro-liens « PR » / « détails » `text-xs` en bas de `run-card` sont petits
  (<44px). Les regrouper dans des chips/boutons.

---

## PLAN D'IMPLÉMENTATION

**B — Fondations (le fix racine).** `lib/markdown.tsx` : `parseMarkdown(src)` pur (headings #/##/###,
**gras**, *italique*, `code` inline, blocs ``` ```, listes - / 1., liens `[t](url)` href **assaini**
http(s)/relatif seulement, paragraphes, blockquote) → arbre ; `<Markdown>` rend l'arbre en éléments
React (React échappe le texte → **aucune injection HTML, jamais de `dangerouslySetInnerHTML`**).
`lib/verify-report.ts` : `parseVerifyReport(input)` accepte une string OU `{status,command,output}` →
`{verdict: PASS|SKIP|FAIL, claim, method, steps[], findings, raw}` (mal formé → `verdict:null` + `raw`).
`components/verdict-card.tsx` : badge coloré + claim 1 ligne + « détails » repliable (steps ✅/❌, findings).
`components/ui/chips.tsx` : `PrLink`, `CostBadge`, `BranchChip`, `StatusBadge` (réutilise `statusOf`,
étend pour `merged`/`approved`/proposition). Tokens sémantiques : emerald=ok, red=fail, amber=attente,
blue=en cours, muted=neutre (déjà la convention de `facade.ts`).

**C — Chat.** `message-bubble` + `brain-chat::Bubble` → `<Markdown>` pour l'agent ; user = bulle
`bg-secondary` (pas `bg-brand`) ; system/événement = **ligne fine centrée** (pas une bulle) ; indicateur
« le cerveau réfléchit… » animé ; `<Collapsible>` (useState, sans dep) repliant tout bloc > ~6 lignes ;
largeur de lecture confortable, rythme vertical aéré.

**D — Inbox.** `ProposalInboxCard` → carte propre (claim parsé, façade pastille, source **icône+couleur**,
âge, CostBadge). Nouveau `inbox-detail.tsx` (Dialog `side` plein écran mobile) : résumé clair (Markdown),
avant→après (réutilise `/api/pr/[runId]` si PR ; sinon goal + fichiers), VerdictCard, coût, BranchChip,
PrLink. Boutons Confirmer (vert) · Refaire avec nuance (champ) · Rejeter. Confirmer reste possible sans
ouvrir ; détail à 1 tap. États vides/chargement propres.

**E — Cohérence.** Brancher Markdown/VerdictCard/chips partout (notifications, dashboard, pr-review,
cartes de proposition, run-card, run-details-drawer, settings logs/mcp test). Uniformiser espacements,
typo (plancher 11-12px), cartes, badges. Audit mobile 380px de chaque vue.

**F — Qualité.** `vitest` (seule dep dev ajoutée, justifiée) — tests purs : `verify-report` (PASS/SKIP/
FAIL/malformé, string & structuré), `markdown` (href `javascript:` rejeté, `<script>` traité en texte,
parsing headings/gras/code/listes/liens), `inbox-detail` view-model (loading/empty/error/loaded).
`pytest` + `npm run build` + `lint` verts. BUILD-NOTES + cette section (fait vs reporté).

### Reporté (P2 — après cette loop)
- Coloration syntaxique réelle du contenu de diff (au-delà de +/−).
- Refonte fine des 5 onglets Réglages (formulaires).
- Tests de composants React complets (RTL+jsdom) — on teste la logique pure cette fois.
- Barre de progression dépensé/budget dans le dashboard.
