-- 010 — Inbox de propositions (le hub). Idempotent. Appliquée 2026-06-11.
-- Le cerveau écrit ses propositions ici (sources non-interactives : discord|sentry|cron|webhook) ;
-- le chat (source=ui) les confirme inline. Même objet (payload = AgentProposal).
CREATE TABLE IF NOT EXISTS proposals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,                          -- chat|discord|sentry|cron|webhook
  project_id  TEXT,                                   -- nullable (le cerveau peut ne pas savoir)
  payload     JSONB NOT NULL,                         -- AgentProposal
  status      TEXT NOT NULL DEFAULT 'pending',        -- pending|approved|dismissed|expired
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ,
  decided_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_proposals_pending ON proposals (status, created_at DESC);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kua_authenticated_all ON proposals;
CREATE POLICY kua_authenticated_all ON proposals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime (badge inbox live).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE proposals;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
