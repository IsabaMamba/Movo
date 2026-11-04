-- =====================================================================
-- 43_legal_versions_test.sql — published versions of the terms and the
-- privacy notice, who accepted which, and the notice when they change.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody who is not staff publishes a version, or a client writes
--      legal_versions.
--   2. Somebody is told they accepted a version they did not, or is not
--      asked to accept a new one.
--   3. A suspended account is notified, or somebody twice.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4300000-0000-0000-0000-000000000001', 'ana43@test.cr',    '{"display_name":"Ana"}'),
  ('a4300000-0000-0000-0000-000000000002', 'equipo43@test.cr', '{"display_name":"Equipo"}');

insert into public.staff (user_id, note) values ('a4300000-0000-0000-0000-000000000002', 'test 43');

do $$ begin
  if has_table_privilege('authenticated', 'public.legal_versions', 'insert')
     or has_table_privilege('anon', 'public.legal_versions', 'insert') then
    raise exception 'FAIL: a client can write legal_versions';
  end if;
  if not has_table_privilege('anon', 'public.legal_versions', 'select') then
    raise exception 'FAIL: the versions cannot be read before signing up';
  end if;
  if has_function_privilege('anon', 'public.publish_legal_version(text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.my_legal_status()', 'execute') then
    raise exception 'FAIL: anon can publish or read a status';
  end if;
end $$;

-- Nothing published: nothing to accept.
select set_config('request.jwt.claim.sub', 'a4300000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$ begin
  if (public.my_legal_status() -> 'terms' ->> 'needs_acceptance')::boolean then
    raise exception 'FAIL: Ana is asked to accept terms that do not exist';
  end if;
  begin
    perform public.publish_legal_version('terms', '2026-11-04', 'Primera versión');
    raise exception 'FAIL: a non-staff account published terms';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The team publishes.
reset role;
select set_config('request.jwt.claim.sub', 'a4300000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare
  v integer;
begin
  begin
    perform public.publish_legal_version('terms', '2026-11-04', '  ');
    raise exception 'FAIL: a version was published without saying what changed';
  exception when sqlstate '22023' then null;
  end;
  v := public.publish_legal_version('terms', '2026-11-04', 'La primera versión de los términos.');
  if v < 2 then
    raise exception 'FAIL: % accounts were told, expected at least the two here', v;
  end if;
  begin
    perform public.publish_legal_version('terms', '2026-11-04', 'Otra vez');
    raise exception 'FAIL: the same version was published twice';
  exception when sqlstate '22023' then null;
  end;
end $$;

reset role;

do $$ begin
  if (select count(*) from public.notifications
       where user_id = 'a4300000-0000-0000-0000-000000000001' and type = 'terms_updated') <> 1 then
    raise exception 'FAIL: Ana was not told once';
  end if;
end $$;

-- Ana is asked, accepts through record_consent(), and is not asked again.
select set_config('request.jwt.claim.sub', 'a4300000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$ begin
  if not (public.my_legal_status() -> 'terms' ->> 'needs_acceptance')::boolean then
    raise exception 'FAIL: Ana is not asked to accept the new terms';
  end if;
  if (public.my_legal_status() -> 'privacy' ->> 'needs_acceptance')::boolean then
    raise exception 'FAIL: Ana is asked about a privacy notice that was not published';
  end if;
end $$;

select public.record_consent('terms', '2026-11-04', true);

do $$
declare
  v jsonb := public.my_legal_status() -> 'terms';
begin
  if (v ->> 'needs_acceptance')::boolean or v ->> 'accepted' <> '2026-11-04' then
    raise exception 'FAIL: after accepting, the status was %', v;
  end if;
end $$;

reset role;

rollback;
