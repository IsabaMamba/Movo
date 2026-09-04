-- =====================================================================
-- 00_local_shim.sql — TEST HARNESS ONLY. Never run against Supabase.
--
-- Recreates the bits of a Supabase project the migrations depend on
-- (the auth schema, auth.uid(), the anon/authenticated/service_role
-- roles, the extensions schema) so the migrations can be applied to a
-- plain Postgres for CI or local verification.
--
--   createdb app_test
--   psql app_test -v ON_ERROR_STOP=1 \
--     -f supabase/tests/00_local_shim.sql \
--     -f supabase/migrations/0001_schema.sql \
--     -f supabase/migrations/0002_functions.sql \
--     -f supabase/migrations/0003_rls.sql \
--     -f supabase/migrations/0004_seed_categories.sql
--
-- Set the acting user in a test with:
--   select set_config('request.jwt.claim.sub', '<uuid>', true);
-- =====================================================================

create schema if not exists extensions;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public, extensions to anon, authenticated, service_role;

-- Minimal stand-in for auth.users.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase applies these defaults itself; reproduced here so that the
-- REVOKE at the top of 0003_rls.sql is exercised the same way in CI.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
