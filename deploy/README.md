# deploy — units systemd, reverse proxy, sandbox (doc 05)

Tous ces fichiers sont des **templates**. Les units systemd sont copiées dans
`/etc/systemd/system/` mais **ni `enable` ni `start`** tant que les spikes
S1–S5 ne sont pas verts.

## Contenu
- `kua-gateway.service` — Trigger Gateway (uvicorn, 127.0.0.1:8000) : /health, /internal/*, WS.
- `kua-worker.service` — Worker du Runner (boucle `claude -p`, `runner.cli worker`).
- `kua-mcp-bridge.service` — Bridge MCP (uvicorn, 127.0.0.1:8001) : WS /mcp-bridge isolé.
- `hermes-gateway.service` — Hermes (Discord + cron). Ajuster `ExecStart` au
  chemin réel du binaire après installation.
- `Caddyfile` — reverse proxy TLS `hooks.kua.quebec` + `engine.kua.quebec` → gateway/bridge.
- `10-kua-sysctl.sudoers` — allowlist sudoers STRICTE (panneau Système) : kua-engine peut
  start/stop/restart/status UNIQUEMENT les 3 services kua. → `/etc/sudoers.d/10-kua-sysctl` (William).
- `docker-compose.yml` — placeholder sandbox d'exécution durci (doc 13).

Toutes les units : `Restart=always`, démarrage au boot (`WantedBy=multi-user.target`),
durcissement (`NoNewPrivileges`, `ProtectSystem=full`, …), `kua-engine` jamais root.
Runbook d'allumage (DNS + sudo + Vercel) : `ui/BUILD-NOTES.md` § « Runbook bring-live ».

## Secrets
Les units lisent `/srv/kua/.env` via `EnvironmentFile` (chmod 600, doc 13).
Jamais de secret dans ces templates ni dans git.

## Prérequis Caddy / TLS (action humaine)
1. DNS `hooks.kua.quebec` → IP du VPS.
2. Ouvrir ufw 80/443 (l'agent ne touche pas au firewall).
