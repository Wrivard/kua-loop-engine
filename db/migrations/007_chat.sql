-- 007 — Chat-first : sessions + messages de chat (accueil conversationnel). Idempotent.
-- Appliquée le 2026-06-11. Historique de conversation persisté (le cerveau PROPOSE, l'humain
-- CONFIRME ; les propositions sont stockées en JSONB pour rejouer la carte au reload).
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'brain', 'system')),
  content     TEXT NOT NULL DEFAULT '',
  proposal    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at);

-- RLS authenticated-only (cohérent migrations 002/004/006). service_role bypasse.
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kua_authenticated_all ON chat_sessions;
CREATE POLICY kua_authenticated_all ON chat_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS kua_authenticated_all ON chat_messages;
CREATE POLICY kua_authenticated_all ON chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
