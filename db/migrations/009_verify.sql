-- 009 — Verify gate : rapport attaché au run + mode par loop. Idempotent. Appliquée 2026-06-11.
-- verify_mode : 'report' (défaut, NON bloquant — rapport seulement) | 'block' (échec vérif → run failed avant PR).
ALTER TABLE loops ADD COLUMN IF NOT EXISTS verify_mode TEXT NOT NULL DEFAULT 'report';
ALTER TABLE runs  ADD COLUMN IF NOT EXISTS verify_status  TEXT;  -- passed | failed | skipped
ALTER TABLE runs  ADD COLUMN IF NOT EXISTS verify_command TEXT;
ALTER TABLE runs  ADD COLUMN IF NOT EXISTS verify_output  TEXT;
