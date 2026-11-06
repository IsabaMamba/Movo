-- =====================================================================
-- 47_join_series_test.sql — a series joined whole, left whole or one date.
--
--   1. join_series() takes every upcoming date; a full date waitlists.
--   2. Past and cancelled dates are not touched.
--   3. Leaving one date keeps the others; leaving the series leaves all,
--      promotes whoever was waiting, and tells the organizer once.
--   4. A reason is one of three words; a date from another series is refused.
--   5. Anonymous callers cannot run either function.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4800000-0000-0000-0000-000000000001', 'org@serie.test',  '{"display_name":"Luis"}'),
  ('a4800000-0000-0000-0000-000000000002', 'ana@serie.test',  '{"display_name":"Ana"}'),
  ('a4800000-0000-0000-0000-000000000003', 'beto@serie.test', '{"display_name":"Beto"}'),
  ('a4800000-0000-0000-0000-000000000004', 'caro@serie.test', '{"display_name":"Caro"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a4800000-0000-0000-0000-0000000000a1', 'La Sabana', 'Mata Redonda',
        extensions.st_setsrid(extensions.st_makepoint(-84.10, 9.93), 4326)::extensions.geography,
        true, true, 'a4800000-0000-0000-0000-000000000001');

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes
) values
  ('a4800000-0000-0000-0000-0000000000b1', 'a4800000-0000-0000-0000-000000000001', 'running',
   'a4800000-0000-0000-0000-0000000000a1', 'Series en la pista', 'weekly', 6, '07:00', 60,
   'any', 2, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb),
  ('a4800000-0000-0000-0000-0000000000b2', 'a4800000-0000-0000-0000-000000000001', 'running',
   'a4800000-0000-0000-0000-0000000000a1', 'Otra serie', 'weekly', 2, '18:00', 60,
   'any', 10, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

-- c1 already happened, c2 and c3 are open,
-- c4 holds two places and Beto and Caro take them, c5 was cancelled; c9 belongs to the other series.
insert into public.activities (
  id, series_id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
)
select v.id::uuid, v.series::uuid, 'a4800000-0000-0000-0000-000000000001', 'running',
       'a4800000-0000-0000-0000-0000000000a1', 'Series en la pista',
       now() + v.offs, now() + v.offs + interval '1 hour', v.cap,
       v.status::public.activity_status, 'public',
       '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb
  from (values
    ('a4800000-0000-0000-0000-0000000000c1', 'a4800000-0000-0000-0000-0000000000b1', interval '-2 days', 2, 'completed'),
    ('a4800000-0000-0000-0000-0000000000c2', 'a4800000-0000-0000-0000-0000000000b1', interval '5 days',  2, 'published'),
    ('a4800000-0000-0000-0000-0000000000c3', 'a4800000-0000-0000-0000-0000000000b1', interval '12 days', 2, 'published'),
    ('a4800000-0000-0000-0000-0000000000c4', 'a4800000-0000-0000-0000-0000000000b1', interval '19 days', 2, 'published'),
    ('a4800000-0000-0000-0000-0000000000c5', 'a4800000-0000-0000-0000-0000000000b1', interval '26 days', 2, 'cancelled'),
    ('a4800000-0000-0000-0000-0000000000c9', 'a4800000-0000-0000-0000-0000000000b2', interval '3 days',  10, 'published')
  ) as v(id, series, offs, cap, status);

-- ------------------------------------------------- 5. not for anon

do $$ begin
  if has_function_privilege('anon', 'public.join_series(uuid)', 'execute')
     or has_function_privilege('anon', 'public.leave_series(uuid, uuid, text)', 'execute') then
    raise exception 'FAIL: anon can run the series functions';
  end if;
end $$;

-- Beto and Caro take both places on c4.
select set_config('request.jwt.claim.sub', 'a4800000-0000-0000-0000-000000000003', true);
set local role authenticated;
select public.join_activity('a4800000-0000-0000-0000-0000000000c4');
reset role;
select set_config('request.jwt.claim.sub', 'a4800000-0000-0000-0000-000000000004', true);
set local role authenticated;
select public.join_activity('a4800000-0000-0000-0000-0000000000c4');
reset role;

-- ------------------------------------------------- 1–2. Ana joins the series

select set_config('request.jwt.claim.sub', 'a4800000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$
declare v_res jsonb;
begin
  v_res := public.join_series('a4800000-0000-0000-0000-0000000000b1');
  if jsonb_array_length(v_res -> 'joined') <> 2 then
    raise exception 'FAIL: expected two dates joined, got %', v_res;
  end if;
  if jsonb_array_length(v_res -> 'waitlisted') <> 1
     or (v_res -> 'waitlisted' -> 0 ->> 'activity_id') <> 'a4800000-0000-0000-0000-0000000000c4'
     or (v_res -> 'waitlisted' -> 0 ->> 'position')::int <> 1 then
    raise exception 'FAIL: the full date should waitlist Ana first, got %', v_res;
  end if;
  -- Twice is the same as once.
  v_res := public.join_series('a4800000-0000-0000-0000-0000000000b1');
  if jsonb_array_length(v_res -> 'joined') <> 2 then
    raise exception 'FAIL: joining again changed the result: %', v_res;
  end if;
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.activity_participants
              where user_id = 'a4800000-0000-0000-0000-000000000002'
                and activity_id in ('a4800000-0000-0000-0000-0000000000c1',
                                    'a4800000-0000-0000-0000-0000000000c5',
                                    'a4800000-0000-0000-0000-0000000000c9')) then
    raise exception 'FAIL: a past, cancelled or foreign date was joined';
  end if;
end $$;

-- ------------------------------------------------- 4. bad input

select set_config('request.jwt.claim.sub', 'a4800000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform public.leave_series('a4800000-0000-0000-0000-0000000000b1', null, 'me caes mal');
    raise exception 'FAIL: a free-text reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.leave_series('a4800000-0000-0000-0000-0000000000b1',
                                'a4800000-0000-0000-0000-0000000000c9', null);
    raise exception 'FAIL: a date from another series was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ------------------------------------------------- 3. one date, then all

do $$ begin
  if public.leave_series('a4800000-0000-0000-0000-0000000000b1',
                         'a4800000-0000-0000-0000-0000000000c2', 'trabajo') <> 1 then
    raise exception 'FAIL: leaving one date should leave one';
  end if;
end $$;
reset role;

do $$ begin
  if (select status from public.activity_participants
       where user_id = 'a4800000-0000-0000-0000-000000000002'
         and activity_id = 'a4800000-0000-0000-0000-0000000000c3') <> 'joined' then
    raise exception 'FAIL: leaving one date left another';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a4800000-0000-0000-0000-000000000001'
                    and type = 'series_date_left'
                    and payload ->> 'reason' = 'trabajo') then
    raise exception 'FAIL: the organizer was not told about the date';
  end if;
end $$;

-- Beto leaves c4, so Ana moves up from the waitlist. Then she leaves all.
select set_config('request.jwt.claim.sub', 'a4800000-0000-0000-0000-000000000003', true);
set local role authenticated;
select public.leave_activity('a4800000-0000-0000-0000-0000000000c4');
reset role;

select set_config('request.jwt.claim.sub', 'a4800000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  if public.leave_series('a4800000-0000-0000-0000-0000000000b1') <> 2 then
    raise exception 'FAIL: leaving the series should leave the two remaining dates';
  end if;
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.activity_participants
              where user_id = 'a4800000-0000-0000-0000-000000000002'
                and status in ('joined', 'waitlisted')) then
    raise exception 'FAIL: Ana is still on a date';
  end if;
  if (select count(*) from public.notifications
       where user_id = 'a4800000-0000-0000-0000-000000000001'
         and type = 'series_left'
         and (payload ->> 'dates')::int = 2
         and payload ->> 'reason' is null) <> 1 then
    raise exception 'FAIL: the organizer should get one notice for the whole series';
  end if;
end $$;

-- With nothing left upcoming, joining a series that has no open dates fails.
update public.activities set status = 'cancelled'
 where series_id = 'a4800000-0000-0000-0000-0000000000b2';
select set_config('request.jwt.claim.sub', 'a4800000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform public.join_series('a4800000-0000-0000-0000-0000000000b2');
    raise exception 'FAIL: a series with no open dates was joined';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

rollback;
