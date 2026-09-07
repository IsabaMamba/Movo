-- =====================================================================
-- 02_currency_test.sql — the currency split, and that the series
-- generator survived the column rename.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'org@cur.test', '{"display_name":"Organizador"}');

insert into public.locations (id, name, geog, currency, created_by)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'Cancha Zapote',
        extensions.st_setsrid(extensions.st_makepoint(-84.07, 9.92), 4326)::extensions.geography,
        'CRC', '11111111-1111-1111-1111-111111111111');

-- A venue in another market implies its own currency.
insert into public.locations (id, name, geog, currency, created_by)
values ('aaaaaaaa-0000-0000-0000-0000000000c2', 'Parque Omar',
        extensions.st_setsrid(extensions.st_makepoint(-79.52, 8.99), 4326)::extensions.geography,
        'PAB', '11111111-1111-1111-1111-111111111111');

do $$ begin
  if (select currency from public.locations
       where id = 'aaaaaaaa-0000-0000-0000-0000000000c2') <> 'PAB' then
    raise exception 'FAIL: venue currency not stored';
  end if;
end $$;

-- A bad code must be rejected by the domain, not stored and rendered wrong.
do $$ begin
  begin
    insert into public.locations (name, geog, currency, created_by)
    values ('Malo', extensions.st_setsrid(extensions.st_makepoint(-84, 9), 4326)::extensions.geography,
            'crc', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: lowercase currency code was accepted';
  exception when check_violation then
    null; -- expected
  end;
end $$;

-- Price is minor units now.
insert into public.activities (
  id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, price_minor, currency, status
) values (
  'bbbbbbbb-0000-0000-0000-0000000000c1',
  '11111111-1111-1111-1111-111111111111', 'football',
  'aaaaaaaa-0000-0000-0000-0000000000c1', 'Partido 7v7',
  now() + interval '2 days', now() + interval '2 days 1 hour',
  1800000, 'CRC', 'published'
);

do $$ begin
  if (select price_minor from public.activities
       where id = 'bbbbbbbb-0000-0000-0000-0000000000c1') <> 1800000 then
    raise exception 'FAIL: price_minor not stored';
  end if;
end $$;

-- The series generator inserts price_minor + currency by name. A rename that
-- did not update the function body would fail here, not at review time.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  weekday, local_start_time, duration_minutes, price_minor, currency
) values (
  'cccccccc-0000-0000-0000-0000000000c1',
  '11111111-1111-1111-1111-111111111111', 'running',
  'aaaaaaaa-0000-0000-0000-0000000000c1', 'Corrida semanal',
  2, '18:00', 45, 250000, 'CRC'
);

do $$
declare v_made integer;
begin
  v_made := public.generate_series_occurrences(
    'cccccccc-0000-0000-0000-0000000000c1', current_date + 21);
  if v_made < 1 then
    raise exception 'FAIL: generator produced no occurrences';
  end if;
  if (select count(*) from public.activities
       where series_id = 'cccccccc-0000-0000-0000-0000000000c1'
         and price_minor = 250000 and currency = 'CRC') <> v_made then
    raise exception 'FAIL: generated occurrences lost price or currency';
  end if;
end $$;

-- Discovery returns both columns.
do $$
declare r record;
begin
  select * into r from public.nearby_activities(9.92, -84.07, 5000) limit 1;
  if r.price_minor is null or r.currency is null then
    raise exception 'FAIL: nearby_activities did not return price_minor/currency';
  end if;
end $$;

rollback;
