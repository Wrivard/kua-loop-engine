# 05 — VPS & Hermes : setup

## Provisioning
- VPS Linux (Ubuntu 24), 2 vCPU / 4 Go RAM / 80 Go disque minimum (les checkouts git mangent du disque). ~10–20 $/mois (Hetzner/DigitalOcean/OVH).
- Utilisateurs séparés : `kua-engine` (gateway, runner, hermes) — principe du moindre privilège.
- Postgres local (ou Supabase managé si préféré — décision libre, le code parle SQL standard).
- Reverse proxy (Caddy) avec TLS pour exposer le Trigger Gateway (`https://hooks.kua.quebec`).

## Installation Hermes
```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes setup            # wizard
hermes gateway setup    # config Discord (bot token)
hermes gateway start    # daemon (systemd unit à créer)
```
Configuration clé (`~/.hermes/config.yaml`) :
- `terminal.backend: docker` par défaut (sandbox durci) ; `ssh` pour les loops qui touchent le repo du moteur (l'agent ne modifie pas son propre code).
- Modèle par défaut de Hermes : un modèle cheap (Haiku ou via OpenRouter) — Hermes fait du triage/résumé, pas du code.

## Rôles de Hermes dans le système
1. **Cron** : les loops planifiées (SEO mensuel) sont des cronjobs Hermes qui appellent le Runner (`kua run --project X --facade seo`).
2. **Gateway Discord** :
   - Channels clients → intake des demandes (Façade C) : Hermes classifie (clair+safe ? whitelist ?) puis appelle le Runner ou escalade.
   - Channel `kua-loops-alerts` → escalations du Runner (runs en `awaiting_approval`, échecs).
   - Chat-ops : William/partner peuvent demander « status », « approve <run> », « redo <run> avec … » depuis le cell.
3. **Mémoire** : contexte léger inter-sessions (préférences, historique des décisions par client).

## Validation à faire en Phase 0 (spikes — voir 14-ROADMAP)
- S1 : Hermes cronjob → exécute une commande shell → message Discord avec le résultat.
- S2 : Hermes reçoit un message Discord dans un channel → déclenche une commande locale (le Runner).
- S3 : `claude -p` headless sur le VPS avec l'auth choisie → sortie JSON parsée (coût, résultat).
- S4 : webhook signé de test → FastAPI → un `thread` + son premier `run` en DB.
- S5 : page Next.js qui liste les runs en realtime (squelette UI).
Ces spikes (liste canonique S1–S5 dans 14-ROADMAP) valident les hypothèses d'intégration. Aucun autre code avant qu'ils passent.

## systemd
Unités : `kua-gateway.service` (FastAPI, 8000), `kua-worker.service` (worker Runner), `kua-mcp-bridge.service` (bridge WS, 8001), `hermes-gateway.service`. Restart=always, démarrage au boot, durcissement (`NoNewPrivileges`, `ProtectSystem=full`), logs vers journald + fichiers JSON dans `/var/log/kua/`. Allumage : voir le runbook bring-live (`ui/BUILD-NOTES.md`).
