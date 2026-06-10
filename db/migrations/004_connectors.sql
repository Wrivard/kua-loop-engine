-- 004 — Connecteurs / Skills / MCP (modèle global↔projet) — appliquée le 2026-06-10.
-- Idempotente.
--
-- SÉCURITÉ : AUCUN secret ici. Seulement métadonnées + config NON-secrète + un
-- `secret_ref` (pointeur vers /srv/kua/secrets/, chmod 600). Le secret ne vit
-- jamais en DB ni dans ui/. RLS authenticated-only (cohérent migration 002),
-- service_role (backend) bypasse.

-- Connexions (instances) : app (1 cred partageable) ou project (cred propre).
CREATE TABLE IF NOT EXISTS connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        TEXT NOT NULL,                    -- app | project
  project_id   TEXT REFERENCES projects(id),     -- NULL si scope=app
  type         TEXT NOT NULL,                    -- github | sentry | cloudflare | discord | supabase | mcp | …
  label        TEXT,
  config       JSONB NOT NULL DEFAULT '{}',      -- NON-secret (org, url, account_id, channel_id…)
  secret_ref   TEXT,                             -- pointeur /srv/kua/secrets/ (JAMAIS le secret)
  status       TEXT NOT NULL DEFAULT 'untested', -- untested | ok | error
  last_checked TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connections_scope_type_idx ON connections(scope, type);

-- Binding par projet × type : activer + mode (inherit la connexion app | own).
CREATE TABLE IF NOT EXISTS project_connectors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES projects(id),
  type          TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  mode          TEXT NOT NULL DEFAULT 'inherit',  -- inherit (connexion app) | own
  connection_id UUID REFERENCES connections(id),  -- la connexion 'own' (NULL si inherit)
  config        JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, type)
);

CREATE TABLE IF NOT EXISTS project_skills (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id),
  skill      TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (project_id, skill)
);

CREATE TABLE IF NOT EXISTS project_mcp (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id),
  name       TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  config     JSONB NOT NULL DEFAULT '{}',  -- type/url/command (NON-secret)
  secret_ref TEXT,
  UNIQUE (project_id, name)
);

-- Réglages app (défauts de modèles, toggles globaux de skills…). KV souple.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,            -- ex: agent_model | coder_model | skills
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS authenticated-only (cohérent migration 002). service_role bypasse.
do $$
declare t text;
begin
  foreach t in array array['connections','project_connectors','project_skills','project_mcp','app_settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists kua_authenticated_all on public.%I', t);
    execute format(
      'create policy kua_authenticated_all on public.%I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;

-- Realtime (l'UI Settings / vue projet s'abonne).
do $$
declare t text;
begin
  foreach t in array array['connections','project_connectors','project_skills','project_mcp','app_settings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
