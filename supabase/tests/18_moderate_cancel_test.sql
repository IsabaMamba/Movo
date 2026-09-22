-- =====================================================================
-- 18_moderate_cancel_test.sql — the team can cancel a reported session,
-- and nobody learns from it who reported.
--
-- The four ways this can be wrong:
--
--   1. Somebody who is not staff cancels another person's session. The
--      organizer is the case that matters: they are exactly the person who
--      would like a report about them to go away.
--   2. The session is cancelled but the report still reads `open`, or the
--      other way round. Both happen in one call so neither can be left
--      half-done.
--   3. The roster is not told. A cancelled session nobody hears about is a
--      group of people standing in a park.
--   4. Something that reaches the organizer or the roster names the report.
--      In a session of four, "there was a report" names the reporter.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1800000-0000-0000-0000-000000000001', 'org18@test.cr',   '{"display_name":"Organiza"}'),
  ('a1800000-0000-0000-0000-000000000002', 'ana18@test.cr',   '{"display_name":"Ana reporta"}'),
  ('a1800000-0000-0000-0000-000000000003', 'beto18@test.cr',  '{"display_name":"Beto"}'),
  ('a1800000-0000-0000-0000-000000000004', 'caro18@test.cr',  '{"display_name":"Caro espera"}'),
  ('a1800000-0000-0000-0000-000000000005', 'staff18@test.cr', '{"display_name":"Equipo"}');

insert into public.staff (user_id, note)
values ('a1800000-0000-0000-0000-000000000005', 'Test fixture');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b1800000-0000-0000-0000-000000000001', 'Cancha 18',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a1800000-0000-0000-0000-000000000001');

-- s1: reported, capped at 2 so Caro waits — the waitlist has to hear too.
-- s2: already happened, nothing left to cancel.
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at,
   max_participants, status, visibility)
values
  ('c1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000001', 'football',
   'b1800000-0000-0000-0000-000000000001', 'Mejenga reportada',
   now() + interval '1 day', now() + interval '1 day 1 hour', 2, 'published', 'public'),
  ('c1800000-0000-0000-0000-000000000002', 'a1800000-0000-0000-0000-000000000001', 'football',
   'b1800000-0000-0000-0000-000000000001', 'Mejenga pasada',
   now() - interval '2 days', now() - interval '2 days' + interval '1 hour', null, 'completed', 'public');

select set_config('request.jwt.claim.sub', 'a1800000-0000-0000-0000-000000000002', true);
select public.join_activity('c1800000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', 'a1800000-0000-0000-0000-000000000003', true);
select public.join_activity('c1800000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', 'a1800000-0000-0000-0000-000000000004', true);
select public.join_activity('c1800000-0000-0000-0000-000000000001');

insert into public.reports (id, reporter_id, subject_type, subject_id, reason, details) values
  -- r1: about s1, the one that gets acted on.
  ('d1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000002',
   'activity', 'c1800000-0000-0000-0000-000000000001', 'comportamiento', 'Nos incomodó'),
  -- r2: about a person, not a session — this power does not apply.
  ('d1800000-0000-0000-0000-000000000002', 'a1800000-0000-0000-0000-000000000002',
   'user', 'a1800000-0000-0000-0000-000000000001', 'comportamiento', null),
  -- r3: about a session that already happened.
  ('d1800000-0000-0000-0000-000000000003', 'a1800000-0000-0000-0000-000000000002',
   'activity', 'c1800000-0000-0000-0000-000000000002', 'comportamiento', null);

-- ------------------------------------------------------------- grants

do $$ begin
  if to_regprocedure('public.moderate_cancel_activity(uuid, text)') is null then
    raise exception 'FAIL: moderate_cancel_activity(uuid, text) does not exist';
  end if;
  if has_function_privilege('anon', 'public.moderate_cancel_activity(uuid, text)', 'execute') then
    raise exception 'FAIL: anon can execute moderate_cancel_activity()';
  end if;
end $$;

-- --------------------------------------------- the organizer cannot use it

select set_config('request.jwt.claim.sub', 'a1800000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare v_sqlstate text;
begin
  begin
    perform public.moderate_cancel_activity(
      'd1800000-0000-0000-0000-000000000001'::uuid, 'me cancelo solo');
    raise exception 'FAIL: a user without the staff role used moderate_cancel_activity()';
  exception
    when insufficient_privilege then null; -- expected
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: refused with %, expected 42501', v_sqlstate;
  end;
end $$;

reset role;

-- ------------------------------------------------------ refusals for staff

select set_config('request.jwt.claim.sub', 'a1800000-0000-0000-0000-000000000005', true);
set local role authenticated;

-- A helper would need a function; three short blocks read more plainly.
do $$
declare v_sqlstate text;
begin
  begin
    perform public.moderate_cancel_activity('d1800000-0000-0000-0000-000000000001'::uuid, '   ');
    raise exception 'FAIL: cancelled with a blank note';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: blank note refused with %, expected 22023', v_sqlstate;
    end if;
  end;
end $$;

do $$
declare v_sqlstate text;
begin
  begin
    perform public.moderate_cancel_activity('d1800000-0000-0000-0000-000000000002'::uuid, 'no aplica');
    raise exception 'FAIL: cancelled something for a report about a person';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: user-subject report refused with %, expected 22023', v_sqlstate;
    end if;
  end;
end $$;

do $$
declare v_sqlstate text;
begin
  begin
    perform public.moderate_cancel_activity('d1800000-0000-0000-0000-000000000003'::uuid, 'ya pasó');
    raise exception 'FAIL: cancelled a session that already happened';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: completed session refused with %, expected 22023', v_sqlstate;
    end if;
  end;
end $$;

-- ------------------------------------------------------------ it works

do $$
declare v_notified integer;
begin
  v_notified := public.moderate_cancel_activity(
    'd1800000-0000-0000-0000-000000000001'::uuid, '  Conducta agresiva en la sesión anterior  ');
  if v_notified <> 3 then
    raise exception 'FAIL: told % people on the roster, expected 3 (two joined, one waiting)', v_notified;
  end if;
end $$;

-- A second press, or a second reviewer, finds it done.
do $$
declare v_sqlstate text;
begin
  begin
    perform public.moderate_cancel_activity('d1800000-0000-0000-0000-000000000001'::uuid, 'otra vez');
    raise exception 'FAIL: acted twice on one report';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: second call refused with %, expected 22023', v_sqlstate;
    end if;
  end;
end $$;

reset role;

-- ---------------------------------------------------------- the effects

do $$
declare
  v_act public.activities%rowtype;
  v_rep public.reports%rowtype;
begin
  select * into v_act from public.activities where id = 'c1800000-0000-0000-0000-000000000001';
  if v_act.status <> 'cancelled' or v_act.cancelled_at is null then
    raise exception 'FAIL: session is %, expected cancelled with a timestamp', v_act.status;
  end if;
  if not v_act.cancelled_by_staff then
    raise exception 'FAIL: cancelled_by_staff is false; the app would say the organizer cancelled';
  end if;
  -- cancel_reason is shown as «Quien organiza escribió». The staff note must
  -- never land there: it is the team's words, and it describes the report.
  if v_act.cancel_reason is not null then
    raise exception 'FAIL: cancel_reason is %, expected null', v_act.cancel_reason;
  end if;

  select * into v_rep from public.reports where id = 'd1800000-0000-0000-0000-000000000001';
  if v_rep.status <> 'actioned' then
    raise exception 'FAIL: report is %, expected actioned', v_rep.status;
  end if;
  if v_rep.reviewed_by is distinct from 'a1800000-0000-0000-0000-000000000005'::uuid
     or v_rep.reviewed_at is null then
    raise exception 'FAIL: report not stamped with the reviewer and time';
  end if;
  if v_rep.action_taken is null
     or position('Conducta agresiva en la sesión anterior' in v_rep.action_taken) = 0
     or position('cancel' in lower(v_rep.action_taken)) = 0 then
    raise exception 'FAIL: action_taken is %, expected the cancellation plus the note', v_rep.action_taken;
  end if;
end $$;

-- Roster: one generic notice each, organizer excluded.
do $$
declare v_count integer;
begin
  select count(*) into v_count
    from public.notifications
   where type = 'activity_cancelled'
     and payload ->> 'activity_id' = 'c1800000-0000-0000-0000-000000000001'
     and payload ->> 'by' = 'movo'
     and user_id in ('a1800000-0000-0000-0000-000000000002',
                     'a1800000-0000-0000-0000-000000000003',
                     'a1800000-0000-0000-0000-000000000004');
  if v_count <> 3 then
    raise exception 'FAIL: % roster notices marked by movo, expected 3', v_count;
  end if;

  select count(*) into v_count
    from public.notifications
   where type = 'activity_cancelled_by_movo'
     and user_id = 'a1800000-0000-0000-0000-000000000001'
     and payload ->> 'activity_id' = 'c1800000-0000-0000-0000-000000000001';
  if v_count <> 1 then
    raise exception 'FAIL: organizer got % activity_cancelled_by_movo notices, expected 1', v_count;
  end if;

  select count(*) into v_count
    from public.notifications
   where type = 'report_resolved'
     and user_id = 'a1800000-0000-0000-0000-000000000002'
     and payload ->> 'report_id' = 'd1800000-0000-0000-0000-000000000001';
  if v_count <> 1 then
    raise exception 'FAIL: reporter got % report_resolved notices, expected 1', v_count;
  end if;
end $$;

-- Nothing the organizer or the roster receives names the report, the
-- reporter, the reason or the team's note.
do $$
declare v_leaks integer;
begin
  select count(*) into v_leaks
    from public.notifications n
   where n.payload ->> 'activity_id' = 'c1800000-0000-0000-0000-000000000001'
     and (n.payload ? 'report_id'
          or n.payload ? 'reason'
          or n.payload::text like '%d1800000-0000-0000-0000-000000000001%'
          or n.payload::text like '%a1800000-0000-0000-0000-000000000002%'
          or n.payload::text ilike '%comportamiento%'
          or n.payload::text ilike '%Conducta agresiva%');
  if v_leaks <> 0 then
    raise exception 'FAIL: % notifications about the session carry the report or its note', v_leaks;
  end if;
end $$;

-- The organizer still cannot read the report about them.
select set_config('request.jwt.claim.sub', 'a1800000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.reports
   where subject_id = 'c1800000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'FAIL: the organizer reads % reports about their own session', v_count;
  end if;
end $$;

reset role;

rollback;
