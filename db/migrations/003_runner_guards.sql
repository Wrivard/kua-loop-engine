-- 003 — Garde-fous Runner (revue adversariale) — appliquée le 2026-06-10.
-- Idempotente.
--
-- 1) `auto` exige un flag PAR PROJET en plus du flag par loop (CLAUDE.md règle 1 :
--    « derrière un flag explicite par loop ET par projet »). Défaut FALSE = fail-closed.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS allow_auto BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) SHA livré/reviewé d'un run (anti-TOCTOU « approve A / merge B » + audit).
ALTER TABLE runs ADD COLUMN IF NOT EXISTS delivered_sha TEXT;

-- 3) Budget strictement positif (règle non-négociable #2, défense en profondeur).
ALTER TABLE loops DROP CONSTRAINT IF EXISTS loops_budget_positive;
ALTER TABLE loops ADD CONSTRAINT loops_budget_positive CHECK (budget_usd > 0);
