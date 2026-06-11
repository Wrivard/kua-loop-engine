-- 008 — Discord : allowlist en DB (app_settings['discord']). Idempotent. Appliquée 2026-06-11.
-- channels = { "<channel_id>": "<project_id>" } (le bot n'écoute QUE ces channels) ;
-- user_ids = [ "<discord_user_id>" ] (seuls ces users peuvent CONFIRMER). À éditer par William.
INSERT INTO app_settings (key, value)
VALUES ('discord', '{"channels": {}, "user_ids": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;
