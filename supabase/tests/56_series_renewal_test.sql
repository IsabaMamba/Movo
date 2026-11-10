-- =====================================================================
-- 56_series_renewal_test.sql — a series is offered more dates, never renews
-- by itself, and nobody is put on new dates without saying yes.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody lands on new dates without answering yes, or a person who
--      went date by date is asked as if they were on the whole series.
--   2. Somebody who is not the organizer adds dates.
--   3. A skipped date (a holiday) is created anyway, or the run is short.
--   4. The organizer is offered the renewal every night.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5600000-0000-0000-0000-000000000001', 'org@renew.test',  '{"display_name":"Andrea"}'),
  ('a5600000-0000-0000-0000-000000000002', 'ana@renew.test',  '{"display_name":"Ana"}'),
  ('a5600000-0000-0000-0000-000000000003', 'beto@renew.test', '{"display_name":"Beto"}'),
  ('a5600000-0000-0000-0000-000000000004', 'caro@renew.test', '{"display_name":"Caro"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5600000-0000-0000-0000-0000000000a1', 'Parque de Tibás', 'San Juan',
        extensions.st_setsrid(extensions.st_makepoint(-84.08, 9.96), 4326)::extensions.geography,
        true, true, 'a5600000-0000-0000-0000-000000000001');

-- Weekly, on tomorrow's weekday, so the first date is tomorrow.
insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes
) values
  ('a5600000-0000-0000-0000-0000000000b1', 'a5600000-0000-0000-0000-000000000001', 'running',
   'a5600000-0000-0000-0000-0000000000a1', '5K al parque', 'weekly',
   extract(dow from current_date + 1)::smallint, '06:00', 60,
   'any', 20, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000001', true);
select public.generate_series_occurrences('a5600000-0000-0000-0000-0000000000b1', current_date + 15);

-- Ana and Beto go to the whole series; Caro to one date.
select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000002', true);
select public.join_series('a5600000-0000-0000-0000-0000000000b1');
select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000003', true);
select public.join_series('a5600000-0000-0000-0000-0000000000b1');
select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000004', true);
select public.join_activity((select id from public.activities
                              where series_id = 'a5600000-0000-0000-0000-0000000000b1'
                              order by starts_at limit 1));

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('anon', 'public.renew_series(uuid, integer, date[])', 'execute')
     or has_function_privilege('anon', 'public.answer_series_renewal(uuid, boolean)', 'execute') then
    raise exception 'FAIL: anon can renew or answer';
  end if;
  if has_function_privilege('authenticated', 'public.offer_series_renewals()', 'execute') then
    raise exception 'FAIL: a client can run the nightly offer';
  end if;
  if has_table_privilege('authenticated', 'public.series_renewals', 'insert')
     or has_table_privilege('authenticated', 'public.series_renewal_answers', 'insert') then
    raise exception 'FAIL: a client can write renewals or answers';
  end if;
end $$;

-- ------------------------------------------------------------ the offer

do $$
declare
  v_first integer := public.offer_series_renewals();
  v_again integer := public.offer_series_renewals();
begin
  if (select count(*) from public.notifications
       where user_id = 'a5600000-0000-0000-0000-000000000001' and type = 'series_renewal_offer') <> 1
     or v_again <> 0 then
    raise exception 'FAIL: the organizer was offered % then % times', v_first, v_again;
  end if;
end $$;

-- ------------------------------------------------------------ renewing

select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$ begin
  begin
    perform public.renew_series('a5600000-0000-0000-0000-0000000000b1');
    raise exception 'FAIL: a participant added dates';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000001', true);
set local role authenticated;

create temporary table before56 on commit drop as
  select max(starts_at) as last_start from public.activities
   where series_id = 'a5600000-0000-0000-0000-0000000000b1';

do $$
declare
  v_last  timestamptz := (select last_start from before56);
  v_skip  date := ((v_last at time zone 'America/Costa_Rica')::date + 14);
  v       jsonb;
  v_new   date[];
begin
  begin
    perform public.renew_series('a5600000-0000-0000-0000-0000000000b1', 13);
    raise exception 'FAIL: 13 dates were added';
  exception when sqlstate '22023' then null;
  end;

  -- Three more, skipping the second one.
  v := public.renew_series('a5600000-0000-0000-0000-0000000000b1', 3, array[v_skip]);
  select array_agg((starts_at at time zone 'America/Costa_Rica')::date order by starts_at) into v_new
    from public.activities
   where series_id = 'a5600000-0000-0000-0000-0000000000b1' and starts_at > v_last;

  if cardinality(v_new) <> 3 or v_skip = any (v_new) then
    raise exception 'FAIL: the new dates were %, skipping %', v_new, v_skip;
  end if;
  if v_new[3] <> v_skip + 14 then
    raise exception 'FAIL: the run did not move a week for the skipped date: %', v_new;
  end if;
  if (v ->> 'asked')::int <> 2 then
    raise exception 'FAIL: % people were asked, expected Ana and Beto', v ->> 'asked';
  end if;
end $$;

reset role;

do $$ begin
  if exists (select 1 from public.activity_participants p
               join public.activities a on a.id = p.activity_id
              where a.series_id = 'a5600000-0000-0000-0000-0000000000b1'
                and a.starts_at > (select last_start from before56)) then
    raise exception 'FAIL: somebody is on a new date before answering';
  end if;
  if exists (select 1 from public.notifications
              where type = 'series_renewal'
                and user_id in ('a5600000-0000-0000-0000-000000000004',
                                'a5600000-0000-0000-0000-000000000001')) then
    raise exception 'FAIL: the date-by-date person or the organizer was asked';
  end if;
end $$;

-- ------------------------------------------------------------ answering

grant select on before56 to authenticated;

select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.answer_series_renewal('a5600000-0000-0000-0000-0000000000b1', true);

reset role;
select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000003', true);
set local role authenticated;
select public.answer_series_renewal('a5600000-0000-0000-0000-0000000000b1', false);

do $$ begin
  begin
    perform public.answer_series_renewal('a5600000-0000-0000-0000-0000000000b1', true);
    raise exception 'FAIL: Beto answered twice';
  exception when sqlstate '22023' then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'a5600000-0000-0000-0000-000000000004', true);
set local role authenticated;

do $$ begin
  begin
    perform public.answer_series_renewal('a5600000-0000-0000-0000-0000000000b1', true);
    raise exception 'FAIL: somebody who was not asked joined the new dates';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$
declare
  v_ana  integer;
  v_beto integer;
begin
  select count(*) filter (where p.user_id = 'a5600000-0000-0000-0000-000000000002'),
         count(*) filter (where p.user_id = 'a5600000-0000-0000-0000-000000000003')
    into v_ana, v_beto
    from public.activity_participants p
    join public.activities a on a.id = p.activity_id
   where a.series_id = 'a5600000-0000-0000-0000-0000000000b1'
     and a.starts_at > (select last_start from before56)
     and p.status in ('joined', 'waitlisted');
  if v_ana <> 3 or v_beto <> 0 then
    raise exception 'FAIL: after answering, Ana is on % new dates and Beto on %', v_ana, v_beto;
  end if;
end $$;

rollback;
