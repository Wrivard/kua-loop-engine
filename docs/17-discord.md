# 17 — Bot Discord (intake conversationnel)

Un message dans un channel client devient une **requête au cerveau** (`source=discord`) : le bot
propose (façade + goal + budget), tu confirmes (« approve » / ✅), le thread part — **même chemin
allowlisté que le chat UI**. Le bot **PROPOSE seulement** ; confirmation humaine obligatoire ;
`allow_auto` reste `false` ; aucune action de gestion par Discord (hors allowlist M4).

Construit cette nuit : `agent/discord_bot.py` (logique pure testée, Discord mocké), service
`deploy/kua-discord.service`, allowlist DB (`app_settings['discord']`, migration 008). **Aucune
connexion live encore** — voici comment l'allumer.

## Créer le bot (Discord Developer Portal)
1. https://discord.com/developers/applications → **New Application** (« Küa »).
2. **Bot** → **Reset Token** → copie le **TOKEN** (montré une fois).
3. **Bot → Privileged Gateway Intents** → active **MESSAGE CONTENT INTENT** (le bot lit le texte).
4. **OAuth2 → URL Generator** → scopes : `bot` ; permissions : *View Channels*, *Send Messages*,
   *Read Message History* → ouvre l'URL générée → invite le bot sur ton serveur.

## Configurer le VPS (sudo = toi)
5. `/srv/kua/.env` : ajoute `DISCORD_BOT_TOKEN=<token>` (chmod 600 ; sans ça le bot refuse de démarrer).
6. **Allowlist** (DB `app_settings['discord']`) — active le *Mode développeur* Discord (Réglages →
   Avancé), clic droit sur un channel / sur ton user → **Copier l'identifiant** :
   ```sql
   UPDATE app_settings SET value = '{
     "channels": { "<CHANNEL_ID>": "kua-cobaye-test" },
     "user_ids": [ "<TON_USER_ID>" ]
   }'::jsonb WHERE key = 'discord';
   ```
   (channels = channels écoutés → projet cible ; user_ids = qui peut CONFIRMER.)
7. **Installer le service** :
   ```bash
   sudo cp deploy/kua-discord.service /etc/systemd/system/
   sudo systemctl enable --now kua-discord
   systemctl status kua-discord       # active (running)
   ```
   Le bot est aussi pilotable depuis Réglages → Système (start/stop/restart) une fois la ligne
   sudoers `deploy/10-kua-sysctl.sudoers` (qui inclut déjà `kua-discord`) ré-appliquée.

## Tester
8. Écris dans le channel configuré : « le formulaire d'Alliance plante » → le bot répond avec une
   proposition → réponds **approve** (ou ✅) → « thread créé ». Un user non listé qui répond
   « approve » est ignoré poliment.

## Sécurité (rappel)
- Token jamais commité (vit dans `/srv/kua/.env`). Bot en `kua-engine`, jamais root.
- Seuls les `user_ids` allowlistés confirment ; seuls les `channels` configurés sont écoutés.
- Le cerveau est appelé via la gateway locale (`/internal/agent/propose`, bearer INTERNAL_TOKEN) :
  le texte Discord est une **requête à trier**, jamais des instructions exécutées.
