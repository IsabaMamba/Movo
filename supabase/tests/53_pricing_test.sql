-- =====================================================================
-- 53_pricing_test.sql — per person or split, and the entry fee (0054).
--
--   1. A split computes price_minor from the total, rounded up to a whole
--      unit; what the client sent for price_minor is ignored.
--   2. The shapes hold: a split needs both numbers, per person needs none,
--      an entry fee amount only with «amount».
--   3. A series' dates copy its pricing.
--   4. Existing rows read as per person with no entry fee.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5300000-0000-0000-0000-000000000001', 'luis@precio.test', '{"display_name":"Luis"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5300000-0000-0000-0000-0000000000a1', 'Canchas de Fonseca', 'San Juan',
        extensions.st_setsrid(extensions.st_makepoint(-84.08, 9.96), 4326)::extensions.geography,
        true, true, 'a5300000-0000-0000-0000-000000000001');

-- ------------------------------------------------- 1. the split

insert into public.activities (
  id, organizer_id, category_id, location_id, title, starts_at, ends_at,
  max_participants, status, visibility, attributes,
  price_minor, price_unit, split_total_minor, split_divisor
) values
  ('a5300000-0000-0000-0000-0000000000c1', 'a5300000-0000-0000-0000-000000000001', 'running',
   'a5300000-0000-0000-0000-0000000000a1', 'Diez entre diez', now() + interval '2 days',
   now() + interval '2 days 1 hour', 10, 'published', 'public',
   '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb,
   999, 'split', 1200000, 10),
  ('a5300000-0000-0000-0000-0000000000c2', 'a5300000-0000-0000-0000-000000000001', 'running',
   'a5300000-0000-0000-0000-0000000000a1', 'Diez mil entre tres', now() + interval '3 days',
   now() + interval '3 days 1 hour', 10, 'published', 'public',
   '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb,
   0, 'split', 1000000, 3);

do $$ begin
  if (select price_minor from public.activities where id = 'a5300000-0000-0000-0000-0000000000c1') <> 120000 then
    raise exception 'FAIL: ₡12,000 between 10 should be ₡1,200';
  end if;
  if (select price_minor from public.activities where id = 'a5300000-0000-0000-0000-0000000000c2') <> 333400 then
    raise exception 'FAIL: ₡10,000 between 3 should round up to ₡3,334';
  end if;
end $$;

-- ------------------------------------------------- 2. the shapes

do $$ begin
  begin
    insert into public.activities (organizer_id, category_id, location_id, title, starts_at, ends_at,
                                   status, visibility, attributes, price_unit, split_total_minor)
    values ('a5300000-0000-0000-0000-000000000001', 'running', 'a5300000-0000-0000-0000-0000000000a1',
            'Sin divisor', now() + interval '4 days', now() + interval '4 days 1 hour',
            'published', 'public', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb, 'split', 500000);
    raise exception 'FAIL: a split without a divisor was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.activities (organizer_id, category_id, location_id, title, starts_at, ends_at,
                                   status, visibility, attributes, split_divisor)
    values ('a5300000-0000-0000-0000-000000000001', 'running', 'a5300000-0000-0000-0000-0000000000a1',
            'Por persona con divisor', now() + interval '4 days', now() + interval '4 days 1 hour',
            'published', 'public', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb, 4);
    raise exception 'FAIL: per person with a divisor was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.activities (organizer_id, category_id, location_id, title, starts_at, ends_at,
                                   status, visibility, attributes, venue_fee)
    values ('a5300000-0000-0000-0000-000000000001', 'running', 'a5300000-0000-0000-0000-0000000000a1',
            'Entrada sin monto', now() + interval '4 days', now() + interval '4 days 1 hour',
            'published', 'public', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb, 'amount');
    raise exception 'FAIL: an entry fee without an amount was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.activities (organizer_id, category_id, location_id, title, starts_at, ends_at,
                                   status, visibility, attributes, venue_fee, venue_fee_minor)
    values ('a5300000-0000-0000-0000-000000000001', 'running', 'a5300000-0000-0000-0000-0000000000a1',
            'No sé con monto', now() + interval '4 days', now() + interval '4 days 1 hour',
            'published', 'public', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb, 'unknown', 100000);
    raise exception 'FAIL: «unknown» with an amount was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ------------------------------------------------- 3. a series' dates

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes,
  price_unit, split_total_minor, split_divisor, venue_fee, venue_fee_minor
) values
  ('a5300000-0000-0000-0000-0000000000b1', 'a5300000-0000-0000-0000-000000000001', 'running',
   'a5300000-0000-0000-0000-0000000000a1', 'Fútbol de los jueves', 'weekly', 4, '19:00', 60,
   'any', 10, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb,
   'split', 1200000, 10, 'amount', 50000);

do $$ begin
  if (select price_minor from public.activity_series where id = 'a5300000-0000-0000-0000-0000000000b1') <> 120000 then
    raise exception 'FAIL: the series split was not computed';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a5300000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.generate_series_occurrences('a5300000-0000-0000-0000-0000000000b1', current_date + 15);
reset role;

do $$ begin
  if not exists (select 1 from public.activities
                  where series_id = 'a5300000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL: no dates were generated';
  end if;
  if exists (select 1 from public.activities
              where series_id = 'a5300000-0000-0000-0000-0000000000b1'
                and not (price_unit = 'split' and split_total_minor = 1200000 and split_divisor = 10
                         and price_minor = 120000 and venue_fee = 'amount' and venue_fee_minor = 50000)) then
    raise exception 'FAIL: a date did not copy its series pricing';
  end if;
end $$;

-- ------------------------------------------------- 4. the default

insert into public.activities (id, organizer_id, category_id, location_id, title, starts_at, ends_at,
                               status, visibility, attributes, price_minor)
values ('a5300000-0000-0000-0000-0000000000c9', 'a5300000-0000-0000-0000-000000000001', 'running',
        'a5300000-0000-0000-0000-0000000000a1', 'Como antes', now() + interval '5 days',
        now() + interval '5 days 1 hour', 'published', 'public',
        '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb, 200000);

do $$ begin
  if not exists (select 1 from public.activities
                  where id = 'a5300000-0000-0000-0000-0000000000c9'
                    and price_unit = 'per_person' and price_minor = 200000 and venue_fee = 'none') then
    raise exception 'FAIL: a plain session should stay per person at its price';
  end if;
end $$;

rollback;
