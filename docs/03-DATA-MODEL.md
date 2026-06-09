# 03 — Modèle de données

## Hiérarchie
```
project (client/prospect)
  └─ loop (config d'une façade : autonomie, budget, schedule)     ← 5 max par projet
       └─ thread / conversation (UNE unité de travail : 1 bug, 1 modif, 1 démo, 1 lot, 1 run SEO)
            ├─ messages (la conversation : user / agent / run / system)
            └─ runs (exécutions claude -p ; un thread peut en avoir plusieurs : initial + redos)
```
Règle clé : **un thread = un contexte borné et jetable**. Réglé → archivé → sort du contexte actif. Un nouveau bug = un nouveau thread, frais. C'est ce qui garde la conso de tokens basse.

## Tables Postgres

```sql
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

CREATE TABLE approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES runs(id),
  decision      TEXT NOT NULL,               -- approved | rejected | redo
  decided_by    TEXT NOT NULL,
  comment       TEXT,
  decided_at    TIMESTAMPTZ DEFAULT now()
);
```

## Façade vs thread vs message (à ne pas confondre)
- **Façade** = catégorie + config (table `loops`). Un tag coloré. C'est là que vit l'autonomie/budget. ~5 par projet.
- **Thread / conversation** = une unité de travail (table `threads`). Un bug, une modif, une démo. C'est ce que l'UI liste et ce qu'on ouvre comme un chat.
- **Message** = un tour dans un thread. Type `run` = une carte de run (boutons Oui/Refaire) ; type `user`/`agent` = la conversation libre pour les nuances.

## Cycle de vie d'un thread (et archivage = contrôle de coût)
```
événement (bug Sentry / demande Discord / cron / composer UI)
  → CREATE thread (status open) + 1er run enqueué
  → working (run en cours) → awaiting_approval (carte + boutons)
  → approved → push → resolved → (après N jours) archived
```
- **Archivé = hors contexte actif.** Les messages restent pour l'historique, mais l'agent ne charge JAMAIS les threads archivés dans son contexte. Un nouveau thread repart frais : CLAUDE.md du projet + ses propres messages (+ éventuellement un court rappel de résolutions similaires via la mémoire Hermes, jamais les transcripts complets).
- Un thread `awaiting_approval` qu'on laisse traîner reste en haut de la liste du projet (rien ne se perd).
- Dédup : `events(source, external_id)` UNIQUE → un même issue Sentry ne crée pas deux threads. Si l'issue revient après résolution, on rouvre le thread (status open) plutôt qu'un doublon.

## `loops.yaml` (dans chaque repo, `.kua/loops.yaml`)
Déclare quelles façades sont armées + leur config. Les **threads sont du runtime** (pas dans le YAML). `kua sync` lit le YAML → upsert `projects`/`loops`.
```yaml
project: salon-booking-client-x
plan: premium
loops:
  bugfix:  { enabled: true, autonomy: approve_final, model: sonnet, max_iterations: 8,  budget_usd: 5 }
  seo:     { enabled: true, autonomy: approve_final, model: sonnet, schedule: "0 6 1 * *", budget_usd: 10 }
  discord: { enabled: true, autonomy: approve_final, model: sonnet, budget_usd: 3,
             config: { whitelist: [text_change, image_swap] } }
  demo:    { enabled: false }
escalation:
  discord_channel: "kua-loops-alerts"
```
