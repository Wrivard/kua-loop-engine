-- 002 — Sécurité : RLS « authenticated-only » + Realtime complet (docs 12/13)
-- Appliquée le 2026-06-10 sur le projet Supabase kua-loop-engine (labzjtqkgbrdxjsqalno).
--
-- POURQUOI : l'anon key est PUBLIQUE (embarquée dans le JS du client). Sans RLS,
-- n'importe qui peut lire/écrire les tables via l'API REST Supabase, sans session.
-- Ici : seul le rôle `authenticated` (utilisateur connecté ; 2 comptes, mêmes
-- droits — doc 12) accède. Le rôle `anon` (sans session) n'a AUCUN accès. Le
-- backend (gateway/runner) utilise la clé service_role, qui BYPASSE la RLS.
-- Idempotent (rejouable sans erreur).

-- 1) RLS ON sur les 7 tables
alter table projects   enable row level security;
alter table loops      enable row level security;
alter table events     enable row level security;
alter table threads    enable row level security;
alter table runs       enable row level security;
alter table messages   enable row level security;
alter table approvals  enable row level security;

-- 2) Politique unique par table : tout permis aux authentifiés, rien à anon
do $$
declare t text;
begin
  foreach t in array array['projects','loops','events','threads','runs','messages','approvals']
  loop
    execute format('drop policy if exists kua_authenticated_all on public.%I', t);
    execute format(
      'create policy kua_authenticated_all on public.%I '
      'for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;

-- 3) Realtime : l'UI s'abonne aussi à messages/approvals/loops/projects
--    (runs/threads déjà publiés en 001). Garde anti-doublon.
do $$
declare t text;
begin
  foreach t in array array['messages','approvals','loops','projects']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
