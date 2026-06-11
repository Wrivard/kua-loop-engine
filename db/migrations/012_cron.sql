-- 012 — Trigger cron (propose-only). Utilise la colonne EXISTANTE loops.schedule_cron (migration 001).
-- Nettoyage : retire une colonne `schedule` redondante (créée par erreur). Idempotent.
ALTER TABLE loops DROP COLUMN IF EXISTS schedule;
