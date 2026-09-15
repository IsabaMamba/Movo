-- =====================================================================
-- 12_series_mutations_test.sql — a series cannot be moved under people,
-- and cannot be repriced at all.
--
-- The hole this closes: `activity_series` carried a `FOR ALL` policy over a
-- full write grant, so everything 0008 forbids on a session — a post-hoc
-- price change, moving the time and venue once people have joined — was
-- available one level up, on the template that generates them.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup

insert into auth.users (id, email, raw_user_meta_data) values
  ('ff000000-0000-0000-0000-0000000000f1', 'orga@test.cr',  '{"display_name":"Organiza"}'),
  ('ff000000-0000-0000-0000-0000000000f2', 'viene@test.cr', '{"display_name":"Viene"}'),
  ('ff000000-0000-0000-0000-0000000000f3', 'ajena@test.cr', '{"display_name":"Ajena"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values
  ('ff000000-0000-0000-0000-00000000aa01', 'Parque uno', 'Mata Redonda',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'ff000000-0000-0000-0000-0000000000f1'),
  ('ff000000-0000-0000-0000-00000000aa02', 'Parque dos', 'Escazu',
   extensions.st_setsrid(extensions.st_makepoint(-84.1400, 9.9200), 4326)::extensions.geography,
   true, true, 'ff000000-0000-0000-0000-0000000000f1');

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes
) values (
  'ff000000-0000-0000-0000-00000000bb01',
  'ff000000-0000-0000-0000-0000000000f1', 'running',
  'ff000000-0000-0000-0000-00000000aa01', 'Corrida de los martes',
  'weekly', 2, '18:00', 60,
  'any', 10, 0, 'CRC',
  '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb
);

-- Two future occurrences: one nobody has joined, one with a participant.
insert into public.activities (
  id, series_id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
) values
  ('ff000000-0000-0000-0000-00000000cc01',
   'ff000000-0000-0000-0000-00000000bb01', 'ff000000-0000-0000-0000-0000000000f1',
   'running', 'ff000000-0000-0000-0000-00000000aa01', 'Corrida de los martes',
   now() + interval '3 days', now() + interval '3 days 1 hour', 10,
   'published', 'public', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb),
  ('ff000000-0000-0000-0000-00000000cc02',
   'ff000000-0000-0000-0000-00000000bb01', 'ff000000-0000-0000-0000-0000000000f1',
   'running', 'ff000000-0000-0000-0000-00000000aa01', 'Corrida de los martes',
   now() + interval '10 days', now() + interval '10 days 1 hour', 10,
   'published', 'public', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

-- ----------------------------------------------- the grant itself is gone

select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-0000000000f1', true);
set local role authenticated;

-- The whole point of 0013. Before it, this succeeded.
do $$
declare
  v_sqlstate text;
begin
  begin
    update public.activity_series
       set price_minor = 500000
     where id = 'ff000000-0000-0000-0000-00000000bb01';
    raise exception 'FAIL: the organizer repriced a series through a direct UPDATE';
  exception
    when insufficient_privilege then
      null; -- expected: the grant is revoked
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: direct series UPDATE refused with %, expected 42501', v_sqlstate;
  end;
end $$;

-- Creating one is still allowed. A migration that locked the door on the way
-- in would pass every check above and break createSeries().
insert into public.activity_series (
  organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes, skill, attributes
) values (
  'ff000000-0000-0000-0000-0000000000f1', 'running',
  'ff000000-0000-0000-0000-00000000aa01', 'Serie nueva',
  'weekly', 3, '07:00', 45, 'any', '{"distance_km": 4, "pace_min_per_km": 6.5}'::jsonb
);

-- ------------------------------------------- editing with nobody on board

-- No participants yet, so time and venue move freely — and the empty future
-- occurrences follow the template rather than drifting from it.
select public.update_series(
  'ff000000-0000-0000-0000-00000000bb01'::uuid,
  'Corrida de los martes',
  null,
  '19:00'::time,
  2::smallint,
  90,
  'ff000000-0000-0000-0000-00000000aa02'::uuid,
  12
);

do $$
declare
  v_moved integer;
begin
  select count(*) into v_moved
    from public.activities
   where series_id = 'ff000000-0000-0000-0000-00000000bb01'
     and location_id = 'ff000000-0000-0000-0000-00000000aa02'
     and max_participants = 12;

  if v_moved <> 2 then
    raise exception
      'FAIL: % of 2 empty occurrences followed the template — the series and its sessions are drifting',
      v_moved;
  end if;
end $$;

-- ------------------------------------------------- once somebody has joined

reset role;
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-0000000000f2', true);
set local role authenticated;

select public.join_activity('ff000000-0000-0000-0000-00000000cc01'::uuid);

reset role;
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-0000000000f1', true);
set local role authenticated;

-- Moving the time now would send that person to the wrong place at the wrong
-- hour, and Movo still delivers no notifications.
do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.update_series(
      'ff000000-0000-0000-0000-00000000bb01'::uuid, 'Corrida de los martes', null,
      '06:00'::time, 2::smallint, 90, 'ff000000-0000-0000-0000-00000000aa02'::uuid, 12);
    raise exception 'FAIL: the series time moved with somebody already on a session';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: moving a joined series refused with %, expected 22023', v_sqlstate;
      end if;
  end;
end $$;

-- The title is not the time. Renaming stays possible, or the lock would make
-- a typo permanent.
select public.update_series(
  'ff000000-0000-0000-0000-00000000bb01'::uuid, 'Corrida de los martes por la tarde', null,
  '19:00'::time, 2::smallint, 90, 'ff000000-0000-0000-0000-00000000aa02'::uuid, 12);

-- Capacity cannot drop below the fullest upcoming session.
do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.update_series(
      'ff000000-0000-0000-0000-00000000bb01'::uuid, 'Corrida de los martes por la tarde', null,
      '19:00'::time, 2::smallint, 90, 'ff000000-0000-0000-0000-00000000aa02'::uuid, 0);
    raise exception 'FAIL: capacity was set below the people already on a session';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: capacity floor refused with %, expected 22023', v_sqlstate;
      end if;
  end;
end $$;

-- ------------------------------------------------- somebody else's series

reset role;
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-0000000000f3', true);
set local role authenticated;

do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.update_series(
      'ff000000-0000-0000-0000-00000000bb01'::uuid, 'Secuestrada', null,
      '19:00'::time, 2::smallint, 90, 'ff000000-0000-0000-0000-00000000aa02'::uuid, 12);
    raise exception 'FAIL: a stranger edited somebody else''s series';
  exception
    when insufficient_privilege then
      null; -- expected
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: stranger edit refused with %, expected 42501', v_sqlstate;
  end;
end $$;

-- -------------------------------------------------------- cancel_series

reset role;
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-0000000000f1', true);
set local role authenticated;

do $$
declare
  v_cancelled integer;
  v_open      integer;
  v_told      integer;
begin
  select public.cancel_series(
    'ff000000-0000-0000-0000-00000000bb01'::uuid, 'Se acabo la temporada') into v_cancelled;

  if v_cancelled <> 2 then
    raise exception 'FAIL: cancel_series cancelled % future sessions, expected 2', v_cancelled;
  end if;

  select count(*) into v_open
    from public.activities
   where series_id = 'ff000000-0000-0000-0000-00000000bb01'
     and status in ('published', 'full');
  if v_open <> 0 then
    raise exception 'FAIL: % sessions of a cancelled series are still open', v_open;
  end if;

  if not exists (
    select 1 from public.activity_series
     where id = 'ff000000-0000-0000-0000-00000000bb01' and is_active = false
  ) then
    raise exception 'FAIL: the series itself is still active after cancel_series';
  end if;

end $$;

-- Checked with the role reset, not as the organizer: notifications_read_own
-- restricts reads to the recipient, so an organizer cannot see what their
-- participants were sent. Correct behaviour, and it means this assertion has
-- to step outside the session that triggered it.
reset role;

do $$
declare
  v_told integer;
begin
  -- Each occurrence goes through cancel_activity(), so the person on cc01 is
  -- told. A bulk UPDATE would have left them cancelled and uninformed.
  select count(*) into v_told
    from public.notifications
   where user_id = 'ff000000-0000-0000-0000-0000000000f2'
     and type = 'activity_cancelled';
  if v_told < 1 then
    raise exception 'FAIL: the participant was never told the series was cancelled';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-0000000000f1', true);
set local role authenticated;

-- A cancelled series generates nothing. Without this guard cancel_series()
-- would be undone by the next generate call.
do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.generate_series_occurrences('ff000000-0000-0000-0000-00000000bb01'::uuid);
    raise exception 'FAIL: a cancelled series generated new occurrences';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: generating from a cancelled series refused with %, expected 22023',
          v_sqlstate;
      end if;
  end;
end $$;

reset role;

rollback;
