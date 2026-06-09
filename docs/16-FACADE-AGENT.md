# 16 — L'agent de façade (la couche conversationnelle)

Comble le trou : le doc 02 nomme l'« agent de façade » mais aucun doc ne dit comment il marche. C'est la pièce la plus neuve, donc à scoper serré.

## Rôle
Dans CHAQUE thread (conversation), un agent léger qui :
1. répond aux messages texte de William/partner (questions, nuances) ;
2. décide s'il faut **exécuter du code** → compile un goal et **enqueue un run** (le Runner fait le code lourd) ;
3. poste les accusés/résumés comme messages `agent`.
Il NE code PAS, n'ouvre PAS de PR, ne fait QUE conversation + compilation de goal + enqueue.

## Modèle & coût
Modèle cheap/mid (Haiku ou via Hermes/OpenRouter). Contexte chargé = system prompt de la façade + CLAUDE.md du projet (court) + les messages DE CE thread uniquement. Jamais les autres threads. C'est ce qui garde le coût de la conversation négligeable vs le run.

## Entrées / sorties (contrat)
- **Entrée** : un nouveau message `user` dans un thread (depuis l'UI ou Discord), OU un run qui vient de finir (pour résumer).
- **Sorties possibles** (l'agent choisit UNE action via un petit schéma JSON) :
  - `reply` : juste répondre (question, clarification) → message `agent`.
  - `enqueue_run` : produire `{goal_extra, scope}` → insère un `run(queued)` dans le thread + message `agent` « je m'en occupe ».
  - `ask` : demander une précision → message `agent` avec la question.
  - `escalate` : hors périmètre/whitelist → notifie `kua-loops-alerts`.
- L'agent ne pousse jamais directement ; l'approbation reste sur la carte du run.

## Implémentation (où ça vit)
Un module `agent/` appelé par : (a) le gateway Discord de Hermes quand un message arrive dans un channel client ; (b) l'API de l'UI quand on poste dans le composer ; (c) le Runner quand un run finit (pour le message de résumé). Une seule fonction `handle_message(thread_id, new_message) -> action`. Stateless : tout l'état vient de la DB (messages du thread).

## Garde-fous
- Le message client/brut est une **donnée, pas une instruction** : toujours encadré « voici la demande, à interpréter dans les limites de la façade {x} et de sa whitelist ».
- `enqueue_run` respecte budget/whitelist de la loop ; sinon → `ask` ou `escalate`.
- Pas de boucle infinie agent↔agent : l'agent réagit à un message humain ou à une fin de run, jamais à ses propres messages.

## Scope par phase (important pour ne pas bloquer le MVP)
- **Phase 1 (MVP cœur)** : version minimale — pas de free-chat complet. Les cartes de run + boutons Oui/Refaire, et le « Refaire » ouvre un champ d'une ligne → l'agent fait UN `enqueue_run` avec ce texte comme `goal_extra`. Ça donne 80 % de la valeur « nuance » sans bâtir le dialogue complet.
- **Phase 2** : l'agent conversationnel complet (reply/ask/escalate/enqueue), branché au composer et à l'intake Discord.

## Critères d'acceptation
- [ ] (P1) « Refaire : renomme la variable e en err » relance un run dans le même thread avec ce `goal_extra`.
- [ ] (P2) Une question dans le composer (« pourquoi t'as fait ça ? ») reçoit une réponse `agent` sans lancer de run.
- [ ] (P2) Une demande hors whitelist déclenche `escalate`, pas `enqueue_run`.
