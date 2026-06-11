# DESIGN-SYSTEM — Küa

Le système visuel de l'app. **Toute nouvelle feature doit rester dedans** : zéro valeur magique dans
les composants — si un besoin sort du système, on étend le système (tokens), pas le composant.
Référence d'ambition : Linear / Vercel / Raycast. Dark premium ; le squelette d'interaction vient de
`UX-SPEC.md` (grammaire 4 types, carte de run évolutive, dock, inbox action-rapide) et ne bouge pas.

## 1. Principes
1. **Un seul élément dominant par surface.** Tout ne peut pas être important ; hiérarchie avant densité.
2. **L'air est un matériau.** Espacement généreux ENTRE les groupes, serré DANS un groupe.
3. **L'accent est rare.** `brand #00e57a` = action primaire, état actif, focus — c'est tout.
   Jamais en fond de texte courant, jamais décoratif.
4. **L'élévation vient des couches + bordures**, pas des ombres. Une seule ombre (`shadow-float`)
   pour ce qui flotte réellement (dock, dialogs, popovers).
5. **La couleur porte du sens ou rien** : sémantiques sourdes (fond teinté ~10 % + texte saturé),
   façades = canal identité séparé, le reste est monochrome.

## 2. Couleur — couches, texte, sémantiques (tokens `globals.css`)
**Fonds (3 couches max, dark)**
| Token | Valeur | Usage |
|---|---|---|
| `background` | `#0d0d0d` | canevas de page |
| `card` (surface) | `#141414` | cartes, bulles agent, listes |
| `popover` (surface-élevée) | `#1c1c1c` | dock, dialogs, popovers, menus |

`secondary` `#212121` = bulle utilisateur ; `muted` `#1f1f1f` = fonds code/skeleton ;
`accent` = couche de survol (gris quasi-noir, utilisable partout).

**Bordures (alpha — tiennent sur toutes les couches)** : `border` = blanc 8 % ; `border-strong` =
blanc 16 % (hover de carte interactive, séparation appuyée) ; `input` = blanc 12 %.

**Texte (3 niveaux)** : `foreground` 95 % (primaire) · `muted-foreground` 64 % (secondaire) ·
`faint` 45 % (tertiaire : événements, horodatages, étiquettes). Tous AA sur les 3 couches.

**Sémantiques (sourdes)** : `success` (vert sourd ≠ brand), `warn` (ambre), `danger` (rouge),
`info` (bleu). Chacune : `text-{x}` saturé + `bg-{x}-soft` (10–12 %). **Plus jamais** de
`emerald-500/red-500/...` en dur — passer par ces tokens (statuts runs : `lib/facade.ts`).

## 3. Typographie (Geist — une seule famille)
**5 tailles, point final** (échelle encodée dans `tailwind.config`, les défauts au-delà sont retirés) :
| Classe | px / lh | Usage |
|---|---|---|
| `text-xs` | 12 / 18 | méta, chips, événements, étiquettes uppercase |
| `text-sm` | 13 / 20 | UI secondaire, boutons, labels, nav |
| `text-base` | 14 / 22 | **corps** (prose du chat, formulaires) |
| `text-lg` | 16 / 26 | titres de carte / section |
| `text-xl` | 19 / 28 (−0.01em) | titre de page (1 par vue) |

Graisses : 400 / 500 / 600 seulement. Chiffres **tabulaires** (`tabular-nums`) pour coûts, temps,
compteurs. `font-mono` UNIQUEMENT pour code, branches, SHA, chemins. Interdits : `text-[Npx]`.

## 4. Espacement & rayon
Base **4 px** (échelle Tailwind). Rythme du chat : ~24 px entre groupes, 8 px dans un groupe ;
largeur de lecture **~720 px** (`max-w-[45rem]`) centrée. Padding de carte : 16 px (12 px compact).

Rayons (3) : `rounded-sm` 6 px (chips, badges via `full`) · `rounded-md` 10 px (boutons, inputs,
petites cartes) · `rounded-lg` 14 px (cartes, dialogs, dock). `rounded-xl` = alias de 14 px ;
`2xl+` n'existe plus.

## 5. États interactifs (obligatoires, partout)
- **hover** : `bg-accent` (couche) ou `border-strong` — 100–150 ms `ease-out`.
- **active** : `scale-[0.99]` sur boutons ; fond un cran plus marqué.
- **focus-visible** : ring 2 px `brand` + offset fond (`ring-offset-background`) — clavier complet.
- **disabled** : `opacity-50` + `pointer-events-none`.
- Motion : 120–150 ms ; entrées discrètes (`animate-fade-in`, `animate-slide-in`) ; tout est coupé
  par `prefers-reduced-motion`.

## 6. Composants signatures
- **Carte de run** (le héros du chat) : en-tête (titre humain `text-base font-medium` + StatusBadge),
  corps (verdict une-ligne, résumé prose), pied = **une baseline** : chips PR/branche/coût à gauche,
  actions à droite. Un seul élément dominant.
- **ComposerDock** : surface-élevée flottante (`shadow-float`), focus-ring brand, placeholder utile,
  état « réfléchit » typographique (pas de spinner).
- **Bulles** : user = compacte, droite, `secondary` ; agent = prose sur `card`, markdown éditorial
  (titres à peine plus grands, listes aérées, inline-code discret).
- **Événements** : `text-xs text-faint`, ligne fine — visuellement en retrait du contenu.

## 7. Règles pour le futur
1. Une couleur qui n'est pas un token n'existe pas. 2. Une taille de texte hors échelle n'existe pas.
3. Avant d'ajouter un style local, chercher le composant/utilitaire existant (`chips`, `StatusBadge`,
`VerdictCard`, `EmptyState`, `Expandable`, `Markdown`). 4. Toute nouvelle vue : états vide/chargement/
erreur + focus clavier + 380 px dès le premier commit. 5. L'accent ne se « rajoute » pas pour faire
joli — si tout est accentué, rien ne l'est.
