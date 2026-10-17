-- =====================================================================
-- 32_self_check_in_test.sql — «Llegué» with the session's code, only for
-- somebody going, only around the start, and never by guessing.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody marks attendance without being there: no code, a guessed
--      code, a session they are not on, or hours before or after.
--   2. Somebody other than the organizer reads or changes the code, or
--      undoes a check-in.
--   3. A wrong guess is not counted (a raise rolls it back), so five is
--      never reached.
--   4. Undoing a check-in leaves its attendance-history row behind.
--   5. The organizer path (check_in, close) stops working.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Olga organizes: «Ahora 32» starts in 10 minutes, «Luego 32» in 2 hours,
-- «Antes 32» started an hour ago. Ana and Beto go to «Ahora»; Dani goes to
-- nothing. Ana keeps attendance history.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3200000-0000-0000-0000-000000000001', 'olga32@test.cr', '{"display_name":"Olga"}'),
  ('a3200000-0000-0000-0000-000000000002', 'ana32@test.cr',  '{"display_name":"Ana"}'),
  ('a3200000-0000-0000-0000-000000000003', 'beto32@test.cr', '{"display_name":"Beto"}'),
  ('a3200000-0000-0000-0000-000000000004', 'dani32@test.cr', '{"display_name":"Dani"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b3200000-0000-0000-0000-000000000001', 'Cancha 32',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a3200000-0000-0000-0000-000000000001');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
select v.id::uuid, 'a3200000-0000-0000-0000-000000000001', 'running',
       'b3200000-0000-0000-0000-000000000001', v.title,
       now() + v.offset_, now() + v.offset_ + interval '1 hour', 'published', 'public'
  from (values
    ('c3200000-0000-0000-0000-000000000001', 'Ahora 32', interval '10 minutes'),
    ('c3200000-0000-0000-0000-000000000002', 'Luego 32', interval '2 hours'),
    ('c3200000-0000-0000-0000-000000000003', 'Antes 32', interval '-1 hour')
  ) as v(id, title, offset_);

select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000002', true);
select public.set_attendance_history(true, '2026-09-22');
select public.join_activity('c3200000-0000-0000-0000-000000000001');
select public.join_activity('c3200000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000003', true);
select public.join_activity('c3200000-0000-0000-0000-000000000001');

-- join_activity() refuses a started session, so these are placed directly.
insert into public.activity_participants (activity_id, user_id, status) values
  ('c3200000-0000-0000-0000-000000000003', 'a3200000-0000-0000-0000-000000000002', 'joined'),
  ('c3200000-0000-0000-0000-000000000003', 'a3200000-0000-0000-0000-000000000003', 'joined');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('anon', 'public.self_check_in(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.check_in_code(uuid)', 'execute') then
    raise exception 'FAIL: anon can reach check-in';
  end if;
  if has_table_privilege('authenticated', 'public.check_in_codes', 'select')
     or has_table_privilege('authenticated', 'public.check_in_attempts', 'select')
     or has_table_privilege('authenticated', 'public.check_in_attempts', 'update') then
    raise exception 'FAIL: a client can read the codes or the attempts';
  end if;
  if has_function_privilege('authenticated', 'public.random_check_in_code()', 'execute') then
    raise exception 'FAIL: a client can draw codes';
  end if;
end $$;

-- A helper: expect a SQLSTATE from a statement run as the current claim.
create or replace function pg_temp.expect(p_sql text, p_state text, p_why text)
returns void language plpgsql as $$
declare v_state text;
begin
  begin
    execute p_sql;
    raise exception 'FAIL: % went through', p_why;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = 'P0001' then raise; end if;
    if v_state <> p_state then
      raise exception 'FAIL: % refused with %, expected %', p_why, v_state, p_state;
    end if;
  end;
end $$;

-- --------------------------------------------------- before any code

select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.expect(
  $q$select public.self_check_in('c3200000-0000-0000-0000-000000000001', '1234')$q$,
  '22023', 'a check-in before the organizer opened the code');
reset role;

do $$ begin
  if exists (select 1 from public.check_in_attempts) then
    raise exception 'FAIL: trying before there was a code counted as a wrong guess';
  end if;
end $$;

-- ------------------------------------------------------ the code itself

select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000003', true);
set local role authenticated;
select pg_temp.expect(
  $q$select public.check_in_code('c3200000-0000-0000-0000-000000000001')$q$,
  '42501', 'a participant reading the code');
reset role;

select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare v_a text; v_b text; v_old text; v_new text;
begin
  v_a := public.check_in_code('c3200000-0000-0000-0000-000000000001');
  v_b := public.check_in_code('c3200000-0000-0000-0000-000000000001');
  if v_a !~ '^[0-9]{4}$' or v_a <> v_b then
    raise exception 'FAIL: the code is not four digits, or changed on a second read (% then %)', v_a, v_b;
  end if;
  -- Codes for the other two sessions, so the windows can be tested.
  v_old := public.check_in_code('c3200000-0000-0000-0000-000000000002');
  perform public.check_in_code('c3200000-0000-0000-0000-000000000003');

  v_new := public.new_check_in_code('c3200000-0000-0000-0000-000000000002');
  if v_new = v_old or v_new !~ '^[0-9]{4}$' then
    raise exception 'FAIL: a new code is not a different four-digit code (% then %)', v_old, v_new;
  end if;
end $$;

reset role;

do $$
declare v_code text;
begin
  select code into v_code from public.check_in_codes
   where activity_id = 'c3200000-0000-0000-0000-000000000001';
  perform set_config('test.code', v_code, true);
  perform set_config('test.wrong', lpad(((v_code::integer + 1) % 10000)::text, 4, '0'), true);
end $$;

-- ------------------------------------------------------------ Ana: yes

select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare v text;
begin
  v := public.self_check_in('c3200000-0000-0000-0000-000000000001', current_setting('test.wrong'));
  if v <> 'wrong_code' then raise exception 'FAIL: a wrong code answered %', v; end if;
  v := public.self_check_in('c3200000-0000-0000-0000-000000000001', current_setting('test.code'));
  if v <> 'checked_in' then raise exception 'FAIL: the right code answered %', v; end if;
  v := public.self_check_in('c3200000-0000-0000-0000-000000000001', current_setting('test.code'));
  if v <> 'already' then raise exception 'FAIL: checking in twice answered %', v; end if;
end $$;

-- Too early and too late, even with a code.
select pg_temp.expect(
  $q$select public.self_check_in('c3200000-0000-0000-0000-000000000002', '0000')$q$,
  '22023', 'a check-in two hours early');
select pg_temp.expect(
  $q$select public.self_check_in('c3200000-0000-0000-0000-000000000003', '0000')$q$,
  '22023', 'a check-in an hour after the start');

reset role;

do $$ begin
  if not exists (
    select 1 from public.activity_participants
     where activity_id = 'c3200000-0000-0000-0000-000000000001'
       and user_id = 'a3200000-0000-0000-0000-000000000002'
       and status = 'attended'
       and checked_in_by = 'a3200000-0000-0000-0000-000000000002'
       and checked_in_at is not null
  ) then
    raise exception 'FAIL: Ana is not attended, or the row does not say she did it herself';
  end if;
  if (select count(*) from public.attendance_history
       where user_id = 'a3200000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'FAIL: the self check-in did not write Ana''s history row';
  end if;
end $$;

-- ------------------------------------------------- Dani: not going

select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000004', true);
set local role authenticated;
select pg_temp.expect(
  format($q$select public.self_check_in('c3200000-0000-0000-0000-000000000001', %L)$q$,
         current_setting('test.code')),
  '42501', 'somebody not on the session checking in');
reset role;

-- ----------------------------------------------------- Beto: guessing

select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
declare
  v text;
  i integer;
begin
  for i in 1..4 loop
    v := public.self_check_in('c3200000-0000-0000-0000-000000000001', current_setting('test.wrong'));
    if v <> 'wrong_code' then raise exception 'FAIL: wrong guess % answered %', i, v; end if;
  end loop;
  v := public.self_check_in('c3200000-0000-0000-0000-000000000001', current_setting('test.wrong'));
  if v <> 'locked' then raise exception 'FAIL: the fifth wrong guess answered %', v; end if;
  v := public.self_check_in('c3200000-0000-0000-0000-000000000001', current_setting('test.code'));
  if v <> 'locked' then raise exception 'FAIL: the right code after five wrong ones answered %', v; end if;
end $$;

reset role;

do $$ begin
  if (select status from public.activity_participants
       where activity_id = 'c3200000-0000-0000-0000-000000000001'
         and user_id = 'a3200000-0000-0000-0000-000000000003') <> 'joined' then
    raise exception 'FAIL: Beto got in after being locked out';
  end if;
end $$;

-- The organizer can still mark him: nothing else is lost.
select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.check_in('c3200000-0000-0000-0000-000000000001', 'a3200000-0000-0000-0000-000000000003');

-- ------------------------------------------------------------- undo

select pg_temp.expect(
  $q$select public.undo_check_in('c3200000-0000-0000-0000-000000000001', 'a3200000-0000-0000-0000-000000000004')$q$,
  'P0002', 'undoing somebody who was never checked in');
select public.undo_check_in('c3200000-0000-0000-0000-000000000001', 'a3200000-0000-0000-0000-000000000002');
reset role;

do $$ begin
  if not exists (
    select 1 from public.activity_participants
     where activity_id = 'c3200000-0000-0000-0000-000000000001'
       and user_id = 'a3200000-0000-0000-0000-000000000002'
       and status = 'joined' and checked_in_at is null and checked_in_by is null
  ) then
    raise exception 'FAIL: undo did not return Ana to joined with no stamp';
  end if;
  if exists (select 1 from public.attendance_history
              where user_id = 'a3200000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: undo left Ana''s attendance-history row behind';
  end if;
end $$;

-- A participant cannot undo, and nobody can once the session is closed.
select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000003', true);
set local role authenticated;
select pg_temp.expect(
  $q$select public.undo_check_in('c3200000-0000-0000-0000-000000000001', 'a3200000-0000-0000-0000-000000000003')$q$,
  '42501', 'a participant undoing a check-in');
reset role;

select set_config('request.jwt.claim.sub', 'a3200000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.check_in('c3200000-0000-0000-0000-000000000003', 'a3200000-0000-0000-0000-000000000002');
select public.close_activity('c3200000-0000-0000-0000-000000000003');
select pg_temp.expect(
  $q$select public.undo_check_in('c3200000-0000-0000-0000-000000000003', 'a3200000-0000-0000-0000-000000000002')$q$,
  '22023', 'undoing after the session was closed');
select pg_temp.expect(
  $q$select public.check_in_code('c3200000-0000-0000-0000-000000000003')$q$,
  '22023', 'reading the code of a closed session');
reset role;

-- Closing still works as before: the one not marked is a no_show.
do $$ begin
  if (select status from public.activity_participants
       where activity_id = 'c3200000-0000-0000-0000-000000000003'
         and user_id = 'a3200000-0000-0000-0000-000000000003') <> 'no_show' then
    raise exception 'FAIL: close_activity() no longer marks the unmarked as no_show';
  end if;
end $$;

rollback;
