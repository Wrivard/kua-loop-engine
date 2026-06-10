# 12 — Frontend UI (MVP) — « Inbox + conversations par façade »

## Philosophie
Une boîte de réception et des conversations. Critère de réussite : le partner comprend l'app en 2 minutes, sans tutoriel. 90 % de l'usage = lire une carte et taper *oui* ou *refaire*. Le reste = parler à un agent quand il y a une nuance. Rien d'autre.

Modèle mental : une app de chat (Claude.ai / iMessage). Mais les « conversations » sont des **façades à l'intérieur de projets**, et chaque conversation a un **agent** dédié.

## Les 3 surfaces (il n'y en a pas plus)
1. **Inbox** (`/`) — l'écran de tous les jours. Toutes les conversations qui attendent une décision, **groupées par projet**. Inbox zero matin et soir, depuis le cell.
2. **Projet** (`/p/[slug]`) — un client OU un prospect. Une **liste de conversations** (comme une boîte de réception), taguées par couleur de façade, filtrables, actives en haut / archivées repliées.
3. **Conversation** — une vraie **conversation avec un agent** pour UNE unité de travail (un bug, une modif, une démo…). Les runs y apparaissent comme des cartes ; on peut aussi écrire à l'agent.

> Important : la **façade** (Bugfix, Modifs…) est une **catégorie / un tag coloré**, PAS une conversation unique. Plusieurs conversations d'une même façade vivent en parallèle (3 bugs = 3 conversations). C'est le changement clé vs une version antérieure de ce doc.

## Le cycle de vie d'un projet (pourquoi « démo » et « site complet » sont des choses différentes)
Un projet **évolue** ; ses fils apparaissent quand ils deviennent pertinents :
1. **Prospect** : le cold-caller book un meeting → projet créé avec **un seul fil : Démo** (violet). C'est un prospect, pas un client.
2. **Client signe** : action « ✅ Accepté » sur la démo → le fil **Site** (turquoise) apparaît — finir le site par lots (façade E).
3. **Client actif** : site live → les fils **Bugfix** (rouge) et **Modifs** (bleu) s'arment d'office, + **SEO** (ambre) si premium.

Donc les fils d'un projet racontent son stade : un point violet seul dans la sidebar = prospect en attente de démo ; quatre points colorés = client mature.

## Couleurs des façades (canal séparé du statut)
La couleur = **identité de la façade** : un liseré à gauche du fil + l'icône teintée + un point dans la sidebar.
- Bugfix `#D85A30` (coral) · Modifs `#378ADD` (bleu) · Démo `#7F77DD` (violet, marque Küa) · Site `#1D9E75` (turquoise) · SEO `#BA7517` (ambre).
Le **statut d'un run** (en cours / à confirmer / publié / échoué) est un **autre canal** : un point d'état ou une pill sémantique, jamais la couleur de façade. Les deux infos ne se mélangent jamais.

## La conversation = une unité de travail, avec un agent (cœur du MVP)
Chaque conversation traite UNE chose (un bug, une demande de modif, une démo, un lot de site). Elle a un **agent** (couche conversationnelle, modèle cheap/mid) qui comprend l'intention, répond, et **déclenche des runs** (le Runner fait le code lourd avec Sonnet). Dans la conversation, en ordre chronologique :
- **Messages-run** (cartes) : Demandé / Fait, avant-après, boutons rapides **✓ Oui, confirmer** / **↻ Non, refaire**.
- **Messages texte** : tu parles à l'agent pour les nuances (« le fix est bon mais renomme `e` en `err` », « recadre la photo », « pourquoi t'as fait ça? »). Il répond, pose une question, ou relance un run lié.

Deux chemins coexistent : **rapide** (les boutons, 90 % des cas) et **nuancé** (le composer). C'est ce qui évite le tout-binaire.

### Contexte borné = coût maîtrisé (raison d'être de ce découpage)
L'agent d'une conversation ne charge QUE : le CLAUDE.md du projet + les messages de CETTE conversation (court) + éventuellement un rappel mémoire de résolutions similaires (via Hermes). **Jamais** l'historique des autres conversations. Réglée → archivée → hors contexte. Un nouveau bug = une conversation neuve, contexte minimal. C'est le mécanisme anti-explosion-de-tokens.

## Le toggle d'autonomie (le seul réglage de l'UI)
Au niveau de la **façade** (sur sa chip-filtre, ou dans un petit panneau de la façade), une pill : `off` / `manuel` / `approbation` / `auto`. Elle s'applique à toutes les conversations de cette façade. Clic → popover à 4 choix + le budget mensuel en petit. Passer en `auto` demande une confirmation. Sous le capot : écrit en DB ET commit sur le `loops.yaml` du repo (intention versionnée) — invisible pour l'utilisateur.

## Armer une façade & créer une conversation
Deux gestes distincts :
- **Armer une façade** (rare, config) : dans les filtres du projet, activer une façade pas encore armée → choisir son autonomie de départ. Techniquement = activer la ligne `loops`. Certaines s'arment seules via le cycle de vie (accepter une démo → arme la façade Site).
- **Créer une conversation** (fréquent) : bouton **`+ Nouvelle`** → choisir la façade → taper la demande. Ou automatiquement : un bug Sentry, une demande Discord, un cron créent une conversation tout seuls. Techniquement = insérer une ligne `threads` + 1er run.

## Les surfaces, en détail

### 1. Inbox (`/`)
Groupée par projet : chaque client ayant des conversations en attente = une section (nom + compte), avec les conversations à confirmer dessous (même ligne que dans la vue projet : couleur de façade + sujet + statut). Actions rapides inline (Oui / Refaire). Clic → ouvre la conversation. Sidebar = projets avec pastille de compte + points de façades. Inbox vide = « Rien à confirmer 🎉 ».

### 2. Projet (`/p/[slug]`)
Header : nom + meta (plan, coût du mois). Rangée de **chips-filtres** : `Tout` + une chip par façade (couleur + compte) + `+ Nouvelle`. Dessous : la **liste des conversations** — actives en haut, triées par dernière activité ; chaque ligne = liseré de couleur (façade) + icône + sujet + dernier message + pill de statut (à confirmer / en cours / …) + temps. Section repliable **« Archivées · N »** en bas. Clic sur une ligne → ouvre la conversation.

### 3. Carte de run (dans un fil)
Anatomie : point de statut + titre · ligne « Demandé » · ligne « Fait » · avant/après côte à côte (screenshots si gate navigateur, sinon diff) · boutons Oui/Refaire · méta (coût · `détails`). « détails » ouvre un drawer (timeline + log brut) — jamais nécessaire pour approuver.

## Ce que l'UI ne fait PAS (anti-scope-creep)
Pas de page settings globale ; pas d'éditeur de loops.yaml ; pas de graphiques de coûts (juste « X $ ce mois » dans le header projet) ; pas de gestion d'utilisateurs (2 comptes en dur) ; pas de thèmes au-delà de light/dark.

## Accès & rôles (MVP)
William ET le partner ont les **mêmes droits** : voir, intake (composer + Discord), parler aux agents, et **approuver**. `approvals.decided_by` trace qui a tranché (audit), aucune restriction entre les deux.

## Design — inspiration Vercel
- Typo Geist Sans + Geist Mono. Monochrome : blanc `#fff` / noir `#0a0a0a`, dark mode obligatoire, bordures 1px. La couleur n'existe que pour (a) l'identité des façades — liserés/points — ; (b) le statut des runs (pills sémantiques) ; et (c) **un accent de marque** unique — vert Küa `#00e57a`, token `--brand`/`--brand-foreground` dans `ui/app/globals.css` (**source de vérité**) — utilisé en *highlight seulement* (onglet/segment actif, bouton primaire, toggle ON, focus-ring, item de nav actif, point du wordmark). DISTINCT des 5 couleurs de façade. Pas d'aplats massifs. L'accent est surchargeable par device (Réglages → Apparence → Accent : vert/violet), 100 % local.
- Flat : pas d'ombres ni gradients. Radius 8–12px. Densité faible, beaucoup de blanc.
- Bouton primaire = noir plein (texte inversé), look Vercel ; secondaire = contour.
- Stack : Next.js 14 + Tailwind + shadcn/ui. Realtime via Supabase Realtime (ou SSE depuis l'API du VPS).
- Micro-interactions sobres : point qui pulse pendant `running`, transition douce du drawer.
- Mobile-first pour l'Inbox (approuver depuis le cell = cas #1).

## Une journée type (référence d'UX)
- 8h, cell : Inbox → 3 clients ont du stock. Salon Élégance : un bug fixé cette nuit → avant/après → *Oui*. Resto : photo du hero changée → *Oui*. Garage : un lot de pages du nouveau site, une page a un TODO-CLIENT → tu écris à l'agent « mets un texte générique en attendant » → relance. Inbox vide en 3 min.
- 14h : meeting booké → event calendrier → 20 min plus tard, démo prête (ping Discord), tu l'envoies au partner.
- Soir : tu entres dans Salon Élégance, lis le rapport SEO du mois, passes Bugfix en `auto` (3 semaines de fixes parfaits), tu sors.

## Implémentation (ordre)
1. Shell + Inbox (lecture de `threads`/`messages`, groupée par projet).
2. Actions rapides Oui/Refaire (écrivent `approvals`, le Runner réagit) — realtime.
3. Vue projet : liste de conversations (filtres par façade + section archivées).
4. Conversation ouverte : rendu des messages-run + messages texte + composer relié à l'agent.
5. Chips de façade + `+ Nouvelle` + popover d'autonomie (niveau façade) + drawer détail (log).
