-- =====================================================================
-- 20_attendance_history_test.sql — attendance history exists only for
-- people who asked for it, says no more than a district and a time band,
-- is seen by nobody else, and does not outlive ninety days.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody else reads it — another user, or anon.
--   2. It is written for somebody who never turned it on.
--   3. It keeps rows past ninety days, or shows them.
--   4. Turning it off leaves the rows behind.
--   5. It records more than it should: a no_show, a venue with no district.
--   6. A client writes or deletes rows directly, or runs the purge.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Olga organizes. Ana turned history on; Beto never did; Caro turns it on
-- and misses the session. Every session is in the past so check-in is open.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2000000-0000-0000-0000-000000000001', 'olga20@test.cr', '{"display_name":"Olga"}'),
  ('a2000000-0000-0000-0000-000000000002', 'ana20@test.cr',  '{"display_name":"Ana"}'),
  ('a2000000-0000-0000-0000-000000000003', 'beto20@test.cr', '{"display_name":"Beto"}'),
  ('a2000000-0000-0000-0000-000000000004', 'caro20@test.cr', '{"display_name":"Caro"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  -- La Sabana: inside a distrito.
  ('b2000000-0000-0000-0000-000000000001', 'Cancha 20',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a2000000-0000-0000-0000-000000000001'),
  -- The Pacific: inside no distrito at all.
  ('b2000000-0000-0000-0000-000000000002', 'Mar 20',
   extensions.st_setsrid(extensions.st_makepoint(-86.5000, 8.0000), 4326)::extensions.geography,
   true, true, 'a2000000-0000-0000-0000-000000000001');

do $$ begin
  if (select district_code from public.locations where id = 'b2000000-0000-0000-0000-000000000001') is null then
    raise exception 'FIXTURE: Cancha 20 resolved to no district; the test would prove nothing';
  end if;
  if (select district_code from public.locations where id = 'b2000000-0000-0000-0000-000000000002') is not null then
    raise exception 'FIXTURE: Mar 20 resolved to a district';
  end if;
end $$;

-- 18:30 in Costa Rica a week ago: an evening, whatever day that was.
create temporary table t20 on commit drop as
select ((date_trunc('day', now() at time zone 'America/Costa_Rica') - interval '7 days'
         + interval '18 hours 30 minutes') at time zone 'America/Costa_Rica') as starts_at;
grant select on t20 to authenticated;

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
select v.id::uuid, 'a2000000-0000-0000-0000-000000000001', 'running', v.loc::uuid, v.title,
       t.starts_at, t.starts_at + interval '1 hour', 'published', 'public'
  from t20 t,
       (values
         ('c2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'Corrida 20'),
         ('c2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'Corrida en el mar'),
         ('c2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 'Segunda corrida')
       ) as v(id, loc, title);

-- Past sessions refuse joins, so the roster is written directly.
insert into public.activity_participants (activity_id, user_id, status) values
  ('c2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'joined'),
  ('c2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 'joined'),
  ('c2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000004', 'joined'),
  ('c2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'joined'),
  ('c2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 'joined');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_table_privilege('anon', 'public.attendance_history', 'select')
     or has_table_privilege('anon', 'public.attendance_history_consent', 'select') then
    raise exception 'FAIL: anon can read attendance history';
  end if;
  if has_table_privilege('authenticated', 'public.attendance_history', 'insert')
     or has_table_privilege('authenticated', 'public.attendance_history', 'update')
     or has_table_privilege('authenticated', 'public.attendance_history', 'delete')
     or has_table_privilege('authenticated', 'public.attendance_history_consent', 'insert')
     or has_table_privilege('authenticated', 'public.attendance_history_consent', 'update')
     or has_table_privilege('authenticated', 'public.attendance_history_consent', 'delete') then
    raise exception 'FAIL: a client can write attendance history or consent directly';
  end if;
  if has_function_privilege('authenticated', 'public.purge_attendance_history()', 'execute')
     or has_function_privilege('anon', 'public.purge_attendance_history()', 'execute') then
    raise exception 'FAIL: a client can run the purge';
  end if;
  if has_function_privilege('anon', 'public.set_attendance_history(boolean, text)', 'execute')
     or has_function_privilege('anon', 'public.clear_attendance_history()', 'execute') then
    raise exception 'FAIL: anon can execute a history control';
  end if;
end $$;

-- ------------------------------------------------------------- consent

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare v_sqlstate text;
begin
  begin
    perform public.set_attendance_history(true, '  ');
    raise exception 'FAIL: consent recorded without the version of the notice';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: blank notice refused with %, expected 22023', v_sqlstate;
    end if;
  end;
end $$;

select public.set_attendance_history(true, '2026-09-22');

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000004', true);
select public.set_attendance_history(true, '2026-09-22');

reset role;

-- ------------------------------------------------------ check-in writes

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select public.check_in('c2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002');
select public.check_in('c2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003');
select public.check_in('c2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002');
-- Caro was never checked in; closing makes her a no_show.
select public.close_activity('c2000000-0000-0000-0000-000000000001');

reset role;

do $$
declare
  r     public.attendance_history%rowtype;
  v_at  timestamp;
  v_n   integer;
begin
  select count(*) into v_n from public.attendance_history
   where user_id = 'a2000000-0000-0000-0000-000000000003';
  if v_n <> 0 then
    raise exception 'FAIL: wrote % rows for Beto, who never turned history on', v_n;
  end if;

  select count(*) into v_n from public.attendance_history
   where user_id = 'a2000000-0000-0000-0000-000000000004';
  if v_n <> 0 then
    raise exception 'FAIL: a no_show wrote history';
  end if;

  select count(*) into v_n from public.attendance_history
   where user_id = 'a2000000-0000-0000-0000-000000000002';
  if v_n <> 1 then
    raise exception 'FAIL: Ana has % rows, expected 1 (the venue at sea has no district)', v_n;
  end if;

  select * into r from public.attendance_history
   where user_id = 'a2000000-0000-0000-0000-000000000002';
  select starts_at at time zone 'America/Costa_Rica' into v_at from t20;

  if r.district_code is distinct from
     (select district_code from public.locations where id = 'b2000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: recorded district %, not the venue''s', r.district_code;
  end if;
  if r.category_id <> 'running' then
    raise exception 'FAIL: recorded category %', r.category_id;
  end if;
  if r.band <> 'evening' then
    raise exception 'FAIL: 18:30 recorded as %, expected evening', r.band;
  end if;
  if r.week_of <> date_trunc('week', v_at)::date then
    raise exception 'FAIL: week_of % is not the Monday of %', r.week_of, v_at;
  end if;
  if r.is_weekend <> (extract(isodow from v_at) in (6, 7)) then
    raise exception 'FAIL: is_weekend wrong for %', v_at;
  end if;
end $$;

-- ------------------------------------------------------- nobody else reads

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000004', true);
set local role authenticated;

do $$ begin
  if exists (select 1 from public.attendance_history) then
    raise exception 'FAIL: Caro can read somebody else''s history';
  end if;
  if (select count(*) from public.attendance_history_consent) <> 1 then
    raise exception 'FAIL: Caro sees a consent row that is not hers';
  end if;
end $$;

reset role;

-- --------------------------------------------------------- ninety days

insert into public.attendance_history (user_id, district_code, category_id, week_of, is_weekend, band)
select 'a2000000-0000-0000-0000-000000000002', district_code, 'running',
       date_trunc('week', (now() at time zone 'America/Costa_Rica') - interval '100 days')::date,
       false, 'morning'
  from public.locations where id = 'b2000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$ begin
  if (select count(*) from public.attendance_history) <> 1 then
    raise exception 'FAIL: the owner can read a row older than ninety days';
  end if;
end $$;

reset role;

do $$
declare v_deleted integer;
begin
  v_deleted := public.purge_attendance_history();
  if v_deleted <> 1 then
    raise exception 'FAIL: purge deleted % rows, expected the one old row', v_deleted;
  end if;
  if (select count(*) from public.attendance_history
       where user_id = 'a2000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'FAIL: purge touched a row inside the window';
  end if;
end $$;

-- ------------------------------------------------------- one-tap delete

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$ begin
  if public.clear_attendance_history() <> 1 then
    raise exception 'FAIL: clear did not report the one row it deleted';
  end if;
  if exists (select 1 from public.attendance_history) then
    raise exception 'FAIL: rows survived clear_attendance_history()';
  end if;
  if not exists (select 1 from public.attendance_history_consent) then
    raise exception 'FAIL: clearing the history also turned it off';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.check_in('c2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002');
reset role;

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$ begin
  if (select count(*) from public.attendance_history) <> 1 then
    raise exception 'FAIL: history stopped recording after a clear';
  end if;
  perform public.set_attendance_history(false);
  if exists (select 1 from public.attendance_history)
     or exists (select 1 from public.attendance_history_consent) then
    raise exception 'FAIL: turning history off left rows or consent behind';
  end if;
end $$;

reset role;

do $$ begin
  if exists (select 1 from public.attendance_history
              where user_id = 'a2000000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: rows for Ana exist after she turned history off';
  end if;
end $$;

rollback;
