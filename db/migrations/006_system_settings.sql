-- 006 — Système : flag pause moteur + heartbeat worker (panneau Réglages « Système »).
-- Appliquée le 2026-06-10. Idempotente.
--
-- Singleton (une seule ligne, id=1) : `paused` est le « débrancher » sécuritaire —
-- le worker le VÉRIFIE avant de claim un run (en pause = aucun NOUVEAU run ; les runs
-- en cours finissent). Le toggle UI écrit ce flag via Supabase (marche sans la gateway).
-- `worker_heartbeat_at` : le worker le rafraîchit (~10s) → /health sait s'il est vivant.
-- PAS publié en Realtime (le heartbeat émettrait un événement toutes les 10s).
CREATE TABLE IF NOT EXISTS system_settings (
  id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  paused              BOOLEAN NOT NULL DEFAULT false,
  worker_heartbeat_at TIMESTAMPTZ,
  worker_pid          INT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS authenticated-only (cohérent migrations 002/004). service_role bypasse ;
-- le worker écrit via psycopg (connexion directe), hors RLS.
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kua_authenticated_all ON system_settings;
CREATE POLICY kua_authenticated_all ON system_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
