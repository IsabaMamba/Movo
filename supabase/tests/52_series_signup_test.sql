-- =====================================================================
-- 52_series_signup_test.sql — whole series, single dates, or both (0053).
--
--   1. Only the organizer sets the rule, and never both off.
--   2. Whole series only: a date cannot be joined alone; join_series()
--      still works, missing one date still works, rejoining that date
--      alone does not.
--   3. Single dates only: join_series() and invite_to_series() say no;
--      join_activity() works.
--   4. series_signup() is readable by anon; set_series_signup() is not.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5200000-0000-0000-0000-000000000001', 'luis@signup.test', '{"display_name":"Luis"}'),
  ('a5200000-0000-0000-0000-000000000002', 'ana@signup.test',  '{"display_name":"Ana"}'),
  ('a5200000-0000-0000-0000-000000000003', 'beto@signup.test', '{"display_name":"Beto"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5200000-0000-0000-0000-0000000000a1', 'La Sabana', 'Mata Redonda',
        extensions.st_setsrid(extensions.st_makepoint(-84.10, 9.93), 4326)::extensions.geography,
        true, true, 'a5200000-0000-0000-0000-000000000001');

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes
) values
  ('a5200000-0000-0000-0000-0000000000b1', 'a5200000-0000-0000-0000-000000000001', 'running',
   'a5200000-0000-0000-0000-0000000000a1', 'Curso de trote', 'weekly', 6, '07:00', 60,
   'any', 10, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

insert into public.activities (
  id, series_id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
)
select v.id::uuid, 'a5200000-0000-0000-0000-0000000000b1', 'a5200000-0000-0000-0000-000000000001',
       'running', 'a5200000-0000-0000-0000-0000000000a1', 'Curso de trote',
       now() + v.offs, now() + v.offs + interval '1 hour', 10, 'published', 'public',
       '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb
  from (values
    ('a5200000-0000-0000-0000-0000000000c1', interval '2 days'),
    ('a5200000-0000-0000-0000-0000000000c2', interval '9 days')
  ) as v(id, offs);

-- ------------------------------------------------- 4. grants

do $$
declare v_rule jsonb;
begin
  if not has_function_privilege('anon', 'public.series_signup(uuid)', 'execute') then
    raise exception 'FAIL: anon cannot read the sign-up rule';
  end if;
  if has_function_privilege('anon', 'public.set_series_signup(uuid, boolean, boolean)', 'execute') then
    raise exception 'FAIL: anon can set the sign-up rule';
  end if;
  v_rule := public.series_signup('a5200000-0000-0000-0000-0000000000b1');
  if v_rule <> '{"allow_whole": true, "allow_single": true}'::jsonb then
    raise exception 'FAIL: a series should start with both ways on, got %', v_rule;
  end if;
end $$;

-- ------------------------------------------------- 1. who sets it

select set_config('request.jwt.claim.sub', 'a5200000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform public.set_series_signup('a5200000-0000-0000-0000-0000000000b1', true, false);
    raise exception 'FAIL: a participant changed the rule';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'a5200000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$ begin
  begin
    perform public.set_series_signup('a5200000-0000-0000-0000-0000000000b1', false, false);
    raise exception 'FAIL: both ways off was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.set_series_signup('a5200000-0000-0000-0000-0000000000b1', true, false);
end $$;
reset role;

-- ------------------------------------------------- 2. whole series only

select set_config('request.jwt.claim.sub', 'a5200000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$
declare v_res jsonb;
begin
  begin
    perform public.join_activity('a5200000-0000-0000-0000-0000000000c1');
    raise exception 'FAIL: a single date was joined in a whole-only series';
  exception when invalid_parameter_value then null;
  end;

  v_res := public.join_series('a5200000-0000-0000-0000-0000000000b1');
  if jsonb_array_length(v_res -> 'joined') <> 2 then
    raise exception 'FAIL: join_series should take both dates, got %', v_res;
  end if;

  -- Missing one date is allowed.
  if public.leave_series('a5200000-0000-0000-0000-0000000000b1',
                         'a5200000-0000-0000-0000-0000000000c1', null) <> 1 then
    raise exception 'FAIL: missing one date was refused';
  end if;

  -- Taking it back alone is not.
  begin
    perform public.join_activity('a5200000-0000-0000-0000-0000000000c1');
    raise exception 'FAIL: a single date was rejoined in a whole-only series';
  exception when invalid_parameter_value then null;
  end;

  -- join_series() again fills the gap.
  v_res := public.join_series('a5200000-0000-0000-0000-0000000000b1');
  if jsonb_array_length(v_res -> 'joined') <> 2 then
    raise exception 'FAIL: join_series should take the date back, got %', v_res;
  end if;
end $$;
reset role;

-- ------------------------------------------------- 3. single dates only

select set_config('request.jwt.claim.sub', 'a5200000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.set_series_signup('a5200000-0000-0000-0000-0000000000b1', false, true);
do $$ begin
  begin
    perform public.invite_to_series('a5200000-0000-0000-0000-0000000000b1',
                                    array['a5200000-0000-0000-0000-000000000002']::uuid[]);
    raise exception 'FAIL: a single-dates series sent an invitation to all of it';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'a5200000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $$ begin
  begin
    perform public.join_series('a5200000-0000-0000-0000-0000000000b1');
    raise exception 'FAIL: join_series worked on a single-dates series';
  exception when invalid_parameter_value then null;
  end;
  if public.join_activity('a5200000-0000-0000-0000-0000000000c2') <> 'joined' then
    raise exception 'FAIL: a single date should be open';
  end if;
end $$;
reset role;

rollback;
