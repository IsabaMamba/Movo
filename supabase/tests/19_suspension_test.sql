-- =====================================================================
-- 19_suspension_test.sql — a suspended account can do nothing to anybody,
-- is seen by nobody, and nobody learns from it who reported.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A suspended person still reaches people: creates a session, joins
--      one, writes in a chat, opens a group or a venue. Every write path is
--      checked here, each against a control user doing the same thing, so a
--      refusal proves the suspension and not a broken fixture.
--   2. A suspended person is still visible: their profile, their messages.
--   3. People who planned around them are left waiting: their sessions not
--      cancelled, their place in somebody else's session not freed, the
--      waitlist not promoted.
--   4. Something sent to anybody names the report, its reason, or the note.
--   5. It never ends: lifting does not restore, expiry does not expire.
--   6. Somebody who is not staff suspends somebody.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Sus is the person who gets suspended. Ana reports. Beto is on Sus's
-- session. Caro organizes a session Sus joined; Dani waits behind Sus. Eve
-- is suspended separately to test expiry and the message-report path.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1900000-0000-0000-0000-000000000001', 'sus19@test.cr',   '{"display_name":"Sus"}'),
  ('a1900000-0000-0000-0000-000000000002', 'ana19@test.cr',   '{"display_name":"Ana"}'),
  ('a1900000-0000-0000-0000-000000000003', 'beto19@test.cr',  '{"display_name":"Beto"}'),
  ('a1900000-0000-0000-0000-000000000004', 'caro19@test.cr',  '{"display_name":"Caro"}'),
  ('a1900000-0000-0000-0000-000000000005', 'dani19@test.cr',  '{"display_name":"Dani"}'),
  ('a1900000-0000-0000-0000-000000000006', 'eve19@test.cr',   '{"display_name":"Eve"}'),
  ('a1900000-0000-0000-0000-000000000009', 'staff19@test.cr', '{"display_name":"Equipo"}');

insert into public.staff (user_id, note)
values ('a1900000-0000-0000-0000-000000000009', 'Test fixture');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b1900000-0000-0000-0000-000000000001', 'Cancha 19',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a1900000-0000-0000-0000-000000000004');

-- S1 Sus, future, Beto on it.   S2 Sus, future draft.   S3 Sus, past.
-- C1 Caro, capacity 2: Beto and Sus joined, Dani waiting.   C2 Caro, open.
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at,
   max_participants, status, visibility)
values
  ('c1900000-0000-0000-0000-000000000001', 'a1900000-0000-0000-0000-000000000001', 'football',
   'b1900000-0000-0000-0000-000000000001', 'Mejenga de Sus',
   now() + interval '2 days', now() + interval '2 days 1 hour', null, 'published', 'public'),
  ('c1900000-0000-0000-0000-000000000002', 'a1900000-0000-0000-0000-000000000001', 'football',
   'b1900000-0000-0000-0000-000000000001', 'Borrador de Sus',
   now() + interval '5 days', now() + interval '5 days 1 hour', null, 'draft', 'public'),
  ('c1900000-0000-0000-0000-000000000003', 'a1900000-0000-0000-0000-000000000001', 'football',
   'b1900000-0000-0000-0000-000000000001', 'Mejenga pasada de Sus',
   now() - interval '3 days', now() - interval '3 days' + interval '1 hour', null, 'completed', 'public'),
  ('c1900000-0000-0000-0000-000000000011', 'a1900000-0000-0000-0000-000000000004', 'football',
   'b1900000-0000-0000-0000-000000000001', 'Mejenga de Caro',
   now() + interval '3 days', now() + interval '3 days 1 hour', 2, 'published', 'public'),
  ('c1900000-0000-0000-0000-000000000012', 'a1900000-0000-0000-0000-000000000004', 'football',
   'b1900000-0000-0000-0000-000000000001', 'Otra de Caro',
   now() + interval '4 days', now() + interval '4 days 1 hour', null, 'published', 'public');

insert into public.activity_series
  (id, organizer_id, category_id, location_id, title, weekday, local_start_time, duration_minutes)
values
  ('e1900000-0000-0000-0000-000000000001', 'a1900000-0000-0000-0000-000000000001', 'football',
   'b1900000-0000-0000-0000-000000000001', 'Serie de Sus', 2, '18:00', 60);

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000003', true);
select public.join_activity('c1900000-0000-0000-0000-000000000001');
select public.join_activity('c1900000-0000-0000-0000-000000000011');
select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000001', true);
select public.join_activity('c1900000-0000-0000-0000-000000000011');
select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000005', true);
select public.join_activity('c1900000-0000-0000-0000-000000000011');

insert into public.messages (id, activity_id, author_id, body) values
  ('f1900000-0000-0000-0000-000000000001', 'c1900000-0000-0000-0000-000000000011',
   'a1900000-0000-0000-0000-000000000001', 'Mensaje de Sus'),
  ('f1900000-0000-0000-0000-000000000002', 'c1900000-0000-0000-0000-000000000011',
   'a1900000-0000-0000-0000-000000000006', 'Mensaje de Eve');

insert into public.reports (id, reporter_id, subject_type, subject_id, reason, details) values
  -- r1: about Sus's session — suspends the organizer.
  ('d1900000-0000-0000-0000-000000000001', 'a1900000-0000-0000-0000-000000000002',
   'activity', 'c1900000-0000-0000-0000-000000000001', 'comportamiento', 'Nos amenazó'),
  -- r2: about Sus directly, used after the first suspension is lifted.
  ('d1900000-0000-0000-0000-000000000002', 'a1900000-0000-0000-0000-000000000002',
   'user', 'a1900000-0000-0000-0000-000000000001', 'comportamiento', null),
  -- r3: about Eve's message — suspends the author.
  ('d1900000-0000-0000-0000-000000000003', 'a1900000-0000-0000-0000-000000000002',
   'message', 'f1900000-0000-0000-0000-000000000002', 'acoso', null),
  -- r4: about a group — there is nobody to suspend.
  ('d1900000-0000-0000-0000-000000000004', 'a1900000-0000-0000-0000-000000000002',
   'community', '00000000-0000-0000-0000-000000000abc', 'spam', null),
  -- r5: about the staff account itself.
  ('d1900000-0000-0000-0000-000000000005', 'a1900000-0000-0000-0000-000000000002',
   'user', 'a1900000-0000-0000-0000-000000000009', 'spam', null);

-- ------------------------------------------------------------- grants

do $$ begin
  if to_regprocedure('public.suspend_account(uuid, text, timestamptz)') is null then
    raise exception 'FAIL: suspend_account(uuid, text, timestamptz) does not exist';
  end if;
  if has_function_privilege('anon', 'public.suspend_account(uuid, text, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.lift_suspension(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.my_suspension()', 'execute') then
    raise exception 'FAIL: anon can execute a suspension function';
  end if;
  -- The raw predicate answers "is this id suspended" for any id. Only
  -- SECURITY DEFINER code may ask it.
  if has_function_privilege('authenticated', 'public.is_suspended_id(uuid)', 'execute') then
    raise exception 'FAIL: a client can ask is_suspended_id() about anybody';
  end if;
  if has_table_privilege('anon', 'public.suspensions', 'select')
     or has_table_privilege('authenticated', 'public.suspensions', 'insert')
     or has_table_privilege('authenticated', 'public.suspensions', 'update')
     or has_table_privilege('authenticated', 'public.suspensions', 'delete') then
    raise exception 'FAIL: suspensions is writable by a client or readable by anon';
  end if;
end $$;

-- ------------------------------------------------- nobody but staff does it

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000004', true);
set local role authenticated;

do $$
declare v_sqlstate text;
begin
  begin
    perform public.suspend_account('d1900000-0000-0000-0000-000000000001'::uuid, 'fuera', null);
    raise exception 'FAIL: a user without the staff role suspended an account';
  exception
    when insufficient_privilege then null;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: refused with %, expected 42501', v_sqlstate;
  end;
end $$;

reset role;

-- ------------------------------------------------------ refusals for staff

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000009', true);
set local role authenticated;

do $$
declare
  r record;
  v_sqlstate text;
begin
  for r in select * from (values
  ('d1900000-0000-0000-0000-000000000001'::uuid, '  ',     null,                     'a blank note'),
  ('d1900000-0000-0000-0000-000000000001'::uuid, 'fuera',  now() - interval '1 day', 'an end in the past'),
  ('d1900000-0000-0000-0000-000000000004'::uuid, 'fuera',  null,                     'a report about a group'),
  ('d1900000-0000-0000-0000-000000000005'::uuid, 'fuera',  null,                     'a member of staff')
  ) as t(report_id, note, ends_at, why) loop
    begin
      perform public.suspend_account(r.report_id, r.note, r.ends_at);
      raise exception 'FAIL: suspended with %', r.why;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: % refused with %, expected 22023', r.why, v_sqlstate;
      end if;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------ it works

do $$
declare v_result jsonb;
begin
  v_result := public.suspend_account(
    'd1900000-0000-0000-0000-000000000001'::uuid, 'Amenazas a dos personas', null);
  if (v_result ->> 'sessions_cancelled')::int <> 2 then
    raise exception 'FAIL: cancelled % of Sus''s sessions, expected 2 (published + draft)',
      v_result ->> 'sessions_cancelled';
  end if;
  if (v_result ->> 'sessions_left')::int <> 1 then
    raise exception 'FAIL: took Sus off % sessions, expected 1', v_result ->> 'sessions_left';
  end if;
end $$;

-- Already suspended: the second report about the same person finds it done.
do $$
declare v_sqlstate text;
begin
  begin
    perform public.suspend_account('d1900000-0000-0000-0000-000000000002'::uuid, 'otra vez', null);
    raise exception 'FAIL: suspended an account that is already suspended';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: double suspension refused with %, expected 22023', v_sqlstate;
    end if;
  end;
end $$;

-- Staff still sees the suspended profile; the queue has to name who it is.
do $$ begin
  if not exists (select 1 from public.profiles where id = 'a1900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: staff cannot see a suspended profile';
  end if;
  if (select count(*) from public.suspensions) <> 1 then
    raise exception 'FAIL: staff reads % suspensions, expected 1', (select count(*) from public.suspensions);
  end if;
end $$;

reset role;

-- ---------------------------------------------------------- the effects

do $$
declare
  v_status   public.activity_status;
  v_by_staff boolean;
begin
  select status, cancelled_by_staff into v_status, v_by_staff
    from public.activities where id = 'c1900000-0000-0000-0000-000000000001';
  if v_status <> 'cancelled' or not v_by_staff then
    raise exception 'FAIL: Sus''s session is % (by staff: %), expected cancelled by staff', v_status, v_by_staff;
  end if;
  if (select status from public.activities where id = 'c1900000-0000-0000-0000-000000000002') <> 'cancelled' then
    raise exception 'FAIL: Sus''s draft was not cancelled';
  end if;
  if (select status from public.activities where id = 'c1900000-0000-0000-0000-000000000003') <> 'completed' then
    raise exception 'FAIL: a session that already happened was rewritten';
  end if;
  if (select is_active from public.activity_series where id = 'e1900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Sus''s series is still active and would generate new sessions';
  end if;

  if (select status from public.activity_participants
       where activity_id = 'c1900000-0000-0000-0000-000000000011'
         and user_id = 'a1900000-0000-0000-0000-000000000001') <> 'cancelled' then
    raise exception 'FAIL: Sus is still on Caro''s session';
  end if;
  if (select status from public.activity_participants
       where activity_id = 'c1900000-0000-0000-0000-000000000011'
         and user_id = 'a1900000-0000-0000-0000-000000000005') <> 'joined' then
    raise exception 'FAIL: Dani was not promoted into the place Sus left';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a1900000-0000-0000-0000-000000000005'
                    and type = 'waitlist_promoted'
                    and payload ->> 'activity_id' = 'c1900000-0000-0000-0000-000000000011') then
    raise exception 'FAIL: Dani was promoted but not told';
  end if;

  if not exists (select 1 from public.notifications
                  where user_id = 'a1900000-0000-0000-0000-000000000003'
                    and type = 'activity_cancelled'
                    and payload ->> 'by' = 'movo'
                    and payload ->> 'activity_id' = 'c1900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Beto was not told Sus''s session is off';
  end if;

  if not exists (select 1 from public.notifications
                  where user_id = 'a1900000-0000-0000-0000-000000000001'
                    and type = 'account_suspended') then
    raise exception 'FAIL: Sus was not told the account is suspended';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a1900000-0000-0000-0000-000000000002'
                    and type = 'report_resolved'
                    and payload ->> 'report_id' = 'd1900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Ana was not told her report was reviewed';
  end if;

  if (select status from public.reports where id = 'd1900000-0000-0000-0000-000000000001') <> 'actioned'
     or (select reviewed_by from public.reports where id = 'd1900000-0000-0000-0000-000000000001')
          is distinct from 'a1900000-0000-0000-0000-000000000009'::uuid
     or position('Amenazas a dos personas' in
          (select action_taken from public.reports where id = 'd1900000-0000-0000-0000-000000000001')) = 0
     or position('suspend' in lower(
          (select action_taken from public.reports where id = 'd1900000-0000-0000-0000-000000000001'))) = 0 then
    raise exception 'FAIL: report not recorded as actioned with the suspension and the note';
  end if;
end $$;

-- Nothing anybody other than the reporter received carries the report.
do $$
declare v_leaks integer;
begin
  select count(*) into v_leaks
    from public.notifications n
   where n.user_id <> 'a1900000-0000-0000-0000-000000000002'
     and (n.payload ? 'report_id'
          or n.payload ? 'reason'
          or n.payload::text like '%d1900000-0000-0000-0000-000000000001%'
          or n.payload::text like '%a1900000-0000-0000-0000-000000000002%'
          or n.payload::text ilike '%Amenazas%'
          or n.payload::text ilike '%comportamiento%');
  if v_leaks <> 0 then
    raise exception 'FAIL: % notifications to people other than the reporter carry the report', v_leaks;
  end if;
end $$;

-- ------------------------------------------ what the suspended person can do

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.my_suspension() where ends_at is null;
  if v_rows <> 1 then
    raise exception 'FAIL: my_suspension() returned % indefinite rows for Sus, expected 1', v_rows;
  end if;
  if (select count(*) from public.suspensions) <> 0 then
    raise exception 'FAIL: Sus can read the suspensions table, and with it the team''s note';
  end if;
  if not exists (select 1 from public.profiles where id = 'a1900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Sus cannot read their own profile';
  end if;
end $$;

-- Each write path, refused.
do $$
declare
  w record;
  v_sqlstate text;
begin
  for w in select * from (values
  ('join a session', $s$select public.join_activity('c1900000-0000-0000-0000-000000000012')$s$),
  ('create a session', $s$insert into public.activities
      (organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
      values ('a1900000-0000-0000-0000-000000000001', 'football', 'b1900000-0000-0000-0000-000000000001',
              'Nueva de Sus', now() + interval '6 days', now() + interval '6 days 1 hour', 'published', 'public')$s$),
  ('create a series', $s$insert into public.activity_series
      (organizer_id, category_id, location_id, title, weekday, local_start_time, duration_minutes)
      values ('a1900000-0000-0000-0000-000000000001', 'football', 'b1900000-0000-0000-0000-000000000001',
              'Otra serie', 3, '18:00', 60)$s$),
  ('write a message', $s$insert into public.messages (activity_id, author_id, body)
      values ('c1900000-0000-0000-0000-000000000003', 'a1900000-0000-0000-0000-000000000001', 'hola')$s$),
  ('create a venue', $s$insert into public.locations (name, geog, is_public_venue, created_by)
      values ('Lugar de Sus',
              extensions.st_setsrid(extensions.st_makepoint(-84.10, 9.93), 4326)::extensions.geography,
              true, 'a1900000-0000-0000-0000-000000000001')$s$),
  ('create a group', $s$insert into public.communities (slug, name, created_by)
      values ('grupo-de-sus', 'Grupo de Sus', 'a1900000-0000-0000-0000-000000000001')$s$)
  ) as t(what, stmt) loop
    begin
      execute w.stmt;
      raise exception 'FAIL: a suspended account could %', w.what;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '42501' then
        raise exception 'FAIL: "%" refused with %, expected 42501', w.what, v_sqlstate;
      end if;
    end;
  end loop;
end $$;

-- Reporting stays open. A suspended person can still be the one in danger.
insert into public.reports (reporter_id, subject_type, subject_id, reason)
values ('a1900000-0000-0000-0000-000000000001', 'user',
        'a1900000-0000-0000-0000-000000000003', 'comportamiento');

reset role;

-- The same writes succeed for Beto, so the refusals above prove the
-- suspension and not a fixture that nobody could have written.
select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$ begin
  perform public.join_activity('c1900000-0000-0000-0000-000000000012');
  insert into public.activities
    (organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
  values ('a1900000-0000-0000-0000-000000000003', 'football', 'b1900000-0000-0000-0000-000000000001',
          'Nueva de Beto', now() + interval '6 days', now() + interval '6 days 1 hour', 'published', 'public');
  insert into public.activity_series
    (organizer_id, category_id, location_id, title, weekday, local_start_time, duration_minutes)
  values ('a1900000-0000-0000-0000-000000000003', 'football', 'b1900000-0000-0000-0000-000000000001',
          'Serie de Beto', 3, '18:00', 60);
  insert into public.messages (activity_id, author_id, body)
  values ('c1900000-0000-0000-0000-000000000011', 'a1900000-0000-0000-0000-000000000003', 'hola');
  insert into public.locations (name, geog, is_public_venue, created_by)
  values ('Lugar de Beto',
          extensions.st_setsrid(extensions.st_makepoint(-84.10, 9.93), 4326)::extensions.geography,
          true, 'a1900000-0000-0000-0000-000000000003');
  insert into public.communities (slug, name, created_by)
  values ('grupo-de-beto', 'Grupo de Beto', 'a1900000-0000-0000-0000-000000000003');
end $$;

-- And Beto no longer sees Sus, or what Sus wrote.
do $$ begin
  if exists (select 1 from public.profiles where id = 'a1900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: another user can read a suspended profile';
  end if;
  if exists (select 1 from public.messages where id = 'f1900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: another user can read a suspended person''s message';
  end if;
  if not exists (select 1 from public.profiles where id = 'a1900000-0000-0000-0000-000000000004') then
    raise exception 'FAIL: control — Beto cannot read Caro either; the test proves nothing';
  end if;
  if (select count(*) from public.suspensions) <> 0 then
    raise exception 'FAIL: a user can read who is suspended';
  end if;
end $$;

reset role;

-- --------------------------------------------------------------- lifting

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000004', true);
set local role authenticated;

do $$
declare v_sqlstate text;
begin
  begin
    perform public.lift_suspension(
      (select id from public.suspensions limit 1), 'ya');  -- Caro reads none, so null
    raise exception 'FAIL: a user without the staff role lifted a suspension';
  exception
    when insufficient_privilege then null;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: lift refused with %, expected 42501', v_sqlstate;
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000009', true);
set local role authenticated;

do $$
declare
  v_id uuid;
  v_sqlstate text;
begin
  select id into v_id from public.suspensions
   where user_id = 'a1900000-0000-0000-0000-000000000001';

  begin
    perform public.lift_suspension(v_id, '');
    raise exception 'FAIL: lifted with a blank note';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: blank lift note refused with %, expected 22023', v_sqlstate;
    end if;
  end;

  perform public.lift_suspension(v_id, 'Revisado con la persona');

  begin
    perform public.lift_suspension(v_id, 'otra vez');
    raise exception 'FAIL: lifted the same suspension twice';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: second lift refused with %, expected 22023', v_sqlstate;
    end if;
  end;
end $$;

reset role;

do $$ begin
  if not exists (select 1 from public.notifications
                  where user_id = 'a1900000-0000-0000-0000-000000000001'
                    and type = 'account_restored') then
    raise exception 'FAIL: Sus was not told the suspension was lifted';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$ begin
  if exists (select 1 from public.my_suspension()) then
    raise exception 'FAIL: my_suspension() still reports a lifted suspension';
  end if;
  perform public.join_activity('c1900000-0000-0000-0000-000000000012');
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$ begin
  if not exists (select 1 from public.profiles where id = 'a1900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: a lifted suspension still hides the profile';
  end if;
end $$;

reset role;

-- ------------------------------------------------ a message report, with an end

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000009', true);
set local role authenticated;

do $$ begin
  perform public.suspend_account(
    'd1900000-0000-0000-0000-000000000003'::uuid, 'Acoso en el chat', now() + interval '7 days');
  if not exists (select 1 from public.suspensions
                  where user_id = 'a1900000-0000-0000-0000-000000000006'
                    and ends_at > now() + interval '6 days') then
    raise exception 'FAIL: a report about a message did not suspend its author until the date given';
  end if;
end $$;

reset role;

-- --------------------------------------------------------------- expiry
-- Move Eve's end into the past, as time would. Nobody lifts it; it ends.

update public.suspensions set starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute'
 where user_id = 'a1900000-0000-0000-0000-000000000006';

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000006', true);
set local role authenticated;

do $$ begin
  if exists (select 1 from public.my_suspension()) then
    raise exception 'FAIL: my_suspension() reports a suspension whose end has passed';
  end if;
  perform public.join_activity('c1900000-0000-0000-0000-000000000012');
end $$;

reset role;

rollback;
