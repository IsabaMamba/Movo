-- =====================================================================
-- 40_weather_cancel_test.sql — water sessions are cancelled for a CNE
-- alert, by the right people, in the right area, and everybody is told.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody who is neither the organizer nor the team cancels.
--   2. A zone cancellation reaches outside the zone, or a session that is
--      not in the water, or one after the alert ends.
--   3. People going are not told, or not told the alert.
--   4. A non-water session is cancelled «for weather».
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Olga organizes surf in Jacó (Puntarenas, 6…), kayak in Paquera
-- (Puntarenas), kayak at La Sabana (San José, 1…) and a run in Jacó.
-- Ana goes to all of them. Equipo is staff. Beto is nobody.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4000000-0000-0000-0000-000000000001', 'olga40@test.cr',   '{"display_name":"Olga"}'),
  ('a4000000-0000-0000-0000-000000000002', 'ana40@test.cr',    '{"display_name":"Ana"}'),
  ('a4000000-0000-0000-0000-000000000003', 'beto40@test.cr',   '{"display_name":"Beto"}'),
  ('a4000000-0000-0000-0000-000000000004', 'equipo40@test.cr', '{"display_name":"Equipo"}');

insert into public.staff (user_id, note) values ('a4000000-0000-0000-0000-000000000004', 'test 40');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b4000000-0000-0000-0000-000000000001', 'Playa Jacó',
   extensions.st_setsrid(extensions.st_makepoint(-84.628, 9.62), 4326)::extensions.geography,
   true, true, 'a4000000-0000-0000-0000-000000000001'),
  ('b4000000-0000-0000-0000-000000000002', 'Paquera',
   extensions.st_setsrid(extensions.st_makepoint(-84.93, 9.82), 4326)::extensions.geography,
   true, true, 'a4000000-0000-0000-0000-000000000001'),
  ('b4000000-0000-0000-0000-000000000003', 'Lago de La Sabana',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.935), 4326)::extensions.geography,
   true, true, 'a4000000-0000-0000-0000-000000000001');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
select v.id::uuid, 'a4000000-0000-0000-0000-000000000001', v.cat, v.loc::uuid, v.title,
       now() + v.offset_, now() + v.offset_ + interval '2 hours', 'published', 'public'
  from (values
    ('c4000000-0000-0000-0000-000000000001', 'surf',    'b4000000-0000-0000-0000-000000000001', 'Surf en Jacó',       interval '1 day'),
    ('c4000000-0000-0000-0000-000000000002', 'kayak',   'b4000000-0000-0000-0000-000000000002', 'Kayak en Paquera',   interval '2 days'),
    ('c4000000-0000-0000-0000-000000000003', 'kayak',   'b4000000-0000-0000-0000-000000000003', 'Kayak en La Sabana', interval '1 day'),
    ('c4000000-0000-0000-0000-000000000004', 'running', 'b4000000-0000-0000-0000-000000000001', 'Trote en Jacó',      interval '1 day'),
    ('c4000000-0000-0000-0000-000000000005', 'surf',    'b4000000-0000-0000-0000-000000000001', 'Surf en diciembre',  interval '30 days')
  ) as v(id, cat, loc, title, offset_);

insert into public.activity_participants (activity_id, user_id, status)
select id, 'a4000000-0000-0000-0000-000000000002', 'joined'
  from public.activities where id::text like 'c4000000-%';

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('anon', 'public.cancel_for_weather(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.cancel_water_sessions_in_zone(text, timestamptz, text)', 'execute') then
    raise exception 'FAIL: anon can cancel for weather';
  end if;
  if has_function_privilege('authenticated', 'public.weather_cancel_one(public.activities, text, boolean)', 'execute') then
    raise exception 'FAIL: a client can call the inner cancellation';
  end if;
end $$;

-- ------------------------------------------------------- not allowed

select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$ begin
  begin
    perform public.cancel_for_weather('c4000000-0000-0000-0000-000000000003', 'alerta verde');
    raise exception 'FAIL: a stranger cancelled a session for weather';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cancel_water_sessions_in_zone('6', now() + interval '3 days', 'alerta amarilla');
    raise exception 'FAIL: a non-staff account cancelled a whole zone';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------- the organizer cancels

reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$ begin
  begin
    perform public.cancel_for_weather('c4000000-0000-0000-0000-000000000004', 'alerta amarilla');
    raise exception 'FAIL: a run was cancelled «for weather»';
  exception when sqlstate '22023' then null;
  end;
  if public.cancel_for_weather('c4000000-0000-0000-0000-000000000003', 'alerta verde en el Valle Central') <> 1 then
    raise exception 'FAIL: the organizer''s cancellation did not reach Ana';
  end if;
  -- Twice is nothing.
  if public.cancel_for_weather('c4000000-0000-0000-0000-000000000003', 'otra') <> 0 then
    raise exception 'FAIL: cancelling twice notified twice';
  end if;
end $$;

-- ------------------------------------------------ the team cancels a zone

reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000004', true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  begin
    perform public.cancel_water_sessions_in_zone('6', now() + interval '3 days', '  ');
    raise exception 'FAIL: a zone was cancelled without the alert';
  exception when sqlstate '22023' then null;
  end;
  v := public.cancel_water_sessions_in_zone('6', now() + interval '3 days',
                                            'alerta amarilla en el Pacífico Central');
  if (v ->> 'sessions_cancelled')::int <> 2 then
    raise exception 'FAIL: the zone cancelled % sessions, not the 2 water ones in Puntarenas: %',
      v ->> 'sessions_cancelled', v;
  end if;
end $$;

reset role;

do $$
declare
  v_status text[];
begin
  -- collate "C": CI's database sorts by en_US rules, which put «diciembre»
  -- before «Jacó»; byte order is the same everywhere.
  select array_agg(title || ':' || status order by title collate "C") into v_status
    from public.activities where id::text like 'c4000000-%';
  if v_status <> array['Kayak en La Sabana:cancelled', 'Kayak en Paquera:cancelled',
                       'Surf en Jacó:cancelled', 'Surf en diciembre:published',
                       'Trote en Jacó:published'] then
    raise exception 'FAIL: statuses were %', v_status;
  end if;

  if (select cancelled_by_staff from public.activities where id = 'c4000000-0000-0000-0000-000000000003')
     or not (select cancelled_by_staff from public.activities where id = 'c4000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: cancelled_by_staff does not say who cancelled';
  end if;

  if (select count(*) from public.notifications
       where user_id = 'a4000000-0000-0000-0000-000000000002'
         and type = 'activity_cancelled_weather') <> 3 then
    raise exception 'FAIL: Ana was not told about each of her three water sessions';
  end if;
  if (select payload ->> 'alert' from public.notifications
       where user_id = 'a4000000-0000-0000-0000-000000000002'
         and payload ->> 'activity_id' = 'c4000000-0000-0000-0000-000000000002')
     <> 'alerta amarilla en el Pacífico Central' then
    raise exception 'FAIL: the notice does not carry the alert';
  end if;
  if (select count(*) from public.notifications
       where user_id = 'a4000000-0000-0000-0000-000000000001'
         and type = 'activity_cancelled_weather') <> 2 then
    raise exception 'FAIL: the organizer was not told about the team''s two cancellations';
  end if;
end $$;

rollback;
