-- 005 — Workspace : un projet « chargé ». Le Runner n'agit QUE sur des projets
-- enregistrés ET chargés (workspace=true) — garde-fou permanent (refuse tout repo
-- hors-liste, même si le token y a accès). Appliquée le 2026-06-10. Idempotente.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace BOOLEAN NOT NULL DEFAULT FALSE;
