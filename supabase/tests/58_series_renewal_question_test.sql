-- =====================================================================
-- 58_series_renewal_question_test.sql — the series page knows whether a
-- «¿Sigues en la serie?» is waiting, and for whom.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody who was not asked sees the question (and taps «Sí»).
--   2. The question stays after it was answered.
--   3. The skipped date (a holiday) is missing from what the page says.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5800000-0000-0000-0000-000000000001', 'org@ask.test',  '{"display_name":"Andrea"}'),
  ('a5800000-0000-0000-0000-000000000002', 'ana@ask.test',  '{"display_name":"Ana"}'),
  ('a5800000-0000-0000-0000-000000000004', 'caro@ask.test', '{"display_name":"Caro"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5800000-0000-0000-0000-0000000000a1', 'Parque 58', 'San Juan',
        extensions.st_setsrid(extensions.st_makepoint(-84.08, 9.96), 4326)::extensions.geography,
        true, true, 'a5800000-0000-0000-0000-000000000001');

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes
) values
  ('a5800000-0000-0000-0000-0000000000b1', 'a5800000-0000-0000-0000-000000000001', 'running',
   'a5800000-0000-0000-0000-0000000000a1', '5K 58', 'weekly',
   extract(dow from current_date + 1)::smallint, '06:00', 60,
   'any', 20, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

select set_config('request.jwt.claim.sub', 'a5800000-0000-0000-0000-000000000001', true);
select public.generate_series_occurrences('a5800000-0000-0000-0000-0000000000b1', current_date + 15);

-- Ana goes to the whole series; Caro to one date.
select set_config('request.jwt.claim.sub', 'a5800000-0000-0000-0000-000000000002', true);
select public.join_series('a5800000-0000-0000-0000-0000000000b1');
select set_config('request.jwt.claim.sub', 'a5800000-0000-0000-0000-000000000004', true);
select public.join_activity((select id from public.activities
                              where series_id = 'a5800000-0000-0000-0000-0000000000b1'
                              order by starts_at limit 1));

do $$ begin
  if has_function_privilege('anon', 'public.my_series_renewal(uuid)', 'execute') then
    raise exception 'FAIL: anon can read a renewal question';
  end if;
end $$;

-- Before any renewal: nothing to ask.
select set_config('request.jwt.claim.sub', 'a5800000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  if public.my_series_renewal('a5800000-0000-0000-0000-0000000000b1') is not null then
    raise exception 'FAIL: a question with no renewal';
  end if;
end $$;
reset role;

-- Andrea adds three, skipping the second.
create temporary table before58 on commit drop as
  select max(starts_at) as last_start,
         (max(starts_at) at time zone 'America/Costa_Rica')::date + 14 as skip
    from public.activities where series_id = 'a5800000-0000-0000-0000-0000000000b1';
grant select on before58 to authenticated;

select set_config('request.jwt.claim.sub', 'a5800000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.renew_series('a5800000-0000-0000-0000-0000000000b1', 3, array[(select skip from before58)]);
do $$ begin
  if public.my_series_renewal('a5800000-0000-0000-0000-0000000000b1') is not null then
    raise exception 'FAIL: the organizer is asked about their own dates';
  end if;
end $$;
reset role;

-- Ana is asked, with the skipped date.
select set_config('request.jwt.claim.sub', 'a5800000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$
declare
  v    jsonb := public.my_series_renewal('a5800000-0000-0000-0000-0000000000b1');
  b    record;
begin
  select * into b from before58;
  if v is null then
    raise exception 'FAIL: Ana was asked and the page does not know';
  end if;
  if v ->> 'name' <> 'Andrea' or (v ->> 'added')::int <> 3 then
    raise exception 'FAIL: who and how many: %', v;
  end if;
  if (v ->> 'first')::date <> b.skip - 7 or (v ->> 'last')::date <> b.skip + 14 then
    raise exception 'FAIL: first and last: %', v;
  end if;
  if v -> 'skipped' <> jsonb_build_array(b.skip) then
    raise exception 'FAIL: the skipped date is %, expected %', v -> 'skipped', b.skip;
  end if;
  if (v ->> 'last_start')::timestamptz <> b.last_start then
    raise exception 'FAIL: the end without an answer is %', v ->> 'last_start';
  end if;
end $$;
reset role;

-- Caro went to one date: never asked.
select set_config('request.jwt.claim.sub', 'a5800000-0000-0000-0000-000000000004', true);
set local role authenticated;
do $$ begin
  if public.my_series_renewal('a5800000-0000-0000-0000-0000000000b1') is not null then
    raise exception 'FAIL: the date-by-date person sees the question';
  end if;
end $$;
reset role;

-- Ana answers; the question is gone.
select set_config('request.jwt.claim.sub', 'a5800000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.answer_series_renewal('a5800000-0000-0000-0000-0000000000b1', false);
do $$ begin
  if public.my_series_renewal('a5800000-0000-0000-0000-0000000000b1') is not null then
    raise exception 'FAIL: the question stayed after answering';
  end if;
end $$;
reset role;

rollback;
