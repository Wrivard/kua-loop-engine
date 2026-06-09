# 09 — Façade C : Demandes client via Discord

## Le flux humain (inchangé pour le client)
Client → email/téléphone au **partner** → le partner colle la demande dans le **channel Discord du client** → le système prend le relais → **William** approuve le avant/après à la fin → push en prod.
Pas d'automatisation email au début (~30 clients, trop fragile, et on veut la visibilité humaine). William peut aussi créer des demandes directement via le composer de l'UI (source `ui`) — même pipeline de classification.

## Pipeline en 2 étages
**Étage 1 — Classification (Hermes, modèle cheap)**
À chaque message dans un channel client mappé :
- Est-ce une demande de changement actionnable ? (vs discussion/question)
- Est-elle dans la **whitelist** de la loop ? MVP : `text_change` (modifier un texte), `image_swap` (remplacer une image fournie/spécifiée).
- Est-elle non-ambiguë ? (cible identifiable : quelle page, quel texte, quelle image)
→ OUI à tout : Hermes appelle `/internal/enqueue` avec un brief structuré `{type, page, cible, nouvelle_valeur, message_original}`.
→ NON : Hermes répond dans le channel avec une question de clarification au partner OU escalade à William (`kua-loops-alerts`).

**Étage 2 — Exécution (Runner, Sonnet)**
Goal compilé depuis le brief ; changement minimal ; `/verify-app` ; **capture avant/après** (screenshots des pages touchées si la gate navigateur existe, sinon diff) ; PR ou commit sur branche ; `awaiting_approval`.

## Approbation
Message à William : demande originale du client + avant/après + lien diff. `approve` → push sur main production (c'est le mode `approve_final` : l'approbation EST le déclencheur du push). `redo "…"` → nouveau run.

## Garde-fous
- Whitelist stricte au départ ; tout ce qui touche prix, mentions légales, structure du site, ou contenu sensible → escalade obligatoire, jamais auto-classifié OK.
- `budget_usd: 3`, `max_iterations: 6`.
- Le message Discord du client est du contenu NON FIABLE : le brief structuré de l'étage 1 est la seule entrée du goal ; jamais coller le message brut comme instruction sans le cadre « ceci est la demande du client, à interpréter dans les limites de la whitelist ».

## Critères d'acceptation
- [ ] « Changer le texte du hero pour X » collé par le partner → PR/diff avant-après → approbation → visible en prod.
- [ ] Une demande hors whitelist (« refais la page tarifs ») est escaladée, pas exécutée.
- [ ] Une demande ambiguë génère une question de clarification dans le channel.
