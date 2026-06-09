-- 001 — Schéma initial (docs/03-DATA-MODEL.md)
-- Appliquée le 2026-06-09 sur le projet Supabase kua-loop-engine (labzjtqkgbrdxjsqalno).
-- Seule divergence vs doc 03 : runs est créée AVANT messages,
-- car messages.run_id référence runs(id) (l'ordre du doc échouerait).

CREATE TABLE projects (
  id            TEXT PRIMARY KEY,            -- slug: "salon-client-x"
  name          TEXT NOT NULL,
  repo_url      TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  plan          TEXT NOT NULL DEFAULT 'base',-- base | premium
  discord_channel_id TEXT,
  sentry_project_slug TEXT,
  is_engine     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Une loop = la CONFIG d'une façade pour un projet (pas une conversation)
CREATE TABLE loops (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT REFERENCES projects(id),
  facade        TEXT NOT NULL,               -- bugfix | discord | seo | demo | finish
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  autonomy      TEXT NOT NULL DEFAULT 'manual', -- manual | approve_final | auto
  schedule_cron TEXT,
  model         TEXT NOT NULL DEFAULT 'sonnet',
  max_iterations INT NOT NULL DEFAULT 8,
  budget_usd    NUMERIC(8,2) NOT NULL DEFAULT 5.00,
  timeout_min   INT NOT NULL DEFAULT 30,
  config        JSONB NOT NULL DEFAULT '{}',
  UNIQUE (project_id, facade)
);

-- Événement brut entrant (audit + dédup)
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL,               -- sentry | posthog | discord | cron | calendar | ui | manual
  external_id   TEXT,                        -- ex: sentry issue id (dédup)
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, external_id)
);

-- Un thread = UNE conversation = UNE unité de travail. Le cœur de l'UI.
CREATE TABLE threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT REFERENCES projects(id),
  loop_id       UUID REFERENCES loops(id),   -- la façade dont il dépend
  facade        TEXT NOT NULL,               -- dénormalisé (filtre/couleur rapide)
  subject       TEXT NOT NULL,               -- "Formulaire contact — TypeError"
  status        TEXT NOT NULL DEFAULT 'open',
  -- open → working → awaiting_approval → resolved → archived
  --      ↘ rejected | failed  (puis archived)
  source_event_id UUID REFERENCES events(id),-- l'événement déclencheur (NULL si créé à la main/UI)
  created_at    TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  archived_at   TIMESTAMPTZ
);
CREATE INDEX ON threads(project_id, status, last_activity_at DESC);

-- Une exécution claude -p (un thread peut en avoir plusieurs : initial + redos)
CREATE TABLE runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     UUID REFERENCES threads(id),
  status        TEXT NOT NULL DEFAULT 'queued',
  -- queued → preparing → running → verifying → awaiting_approval → approved → pushed
  --        ↘ failed | rejected | budget_exceeded | timed_out
  goal          TEXT NOT NULL,
  branch        TEXT, pr_url TEXT, preview_url TEXT,
  cost_usd      NUMERIC(8,4) DEFAULT 0,
  iterations    INT DEFAULT 0,
  log_path      TEXT,
  summary       TEXT,
  started_at    TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Les tours d'une conversation (texte + cartes-run)
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     UUID REFERENCES threads(id),
  role          TEXT NOT NULL,               -- user | agent | run | system
  author        TEXT,                        -- discord/ui user id si role=user
  content       TEXT,                        -- texte (user/agent/system)
  run_id        UUID REFERENCES runs(id),    -- rempli si role=run
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON messages(thread_id, created_at);

CREATE TABLE approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES runs(id),
  decision      TEXT NOT NULL,               -- approved | rejected | redo
  decided_by    TEXT NOT NULL,
  comment       TEXT,
  decided_at    TIMESTAMPTZ DEFAULT now()
);

-- Realtime : l'UI s'abonne aux changements de runs et threads (S5)
ALTER PUBLICATION supabase_realtime ADD TABLE runs;
ALTER PUBLICATION supabase_realtime ADD TABLE threads;
