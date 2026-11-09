-- =====================================================================
-- 55_series_people_test.sql — «Quiénes van» for a series (0056).
--
--   1. Whole series or date by date, arrivals out of the past dates, the
--      next date, and the invitation, per person.
--   2. A block leaves the person out; only the organizer can ask; not anon.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5500000-0000-0000-0000-000000000001', 'luis@people.test', '{"display_name":"Luis"}'),
  ('a5500000-0000-0000-0000-000000000002', 'ana@people.test',  '{"display_name":"Ana"}'),
  ('a5500000-0000-0000-0000-000000000003', 'beto@people.test', '{"display_name":"Beto"}'),
  ('a5500000-0000-0000-0000-000000000004', 'caro@people.test', '{"display_name":"Caro"}'),
  ('a5500000-0000-0000-0000-000000000005', 'dani@people.test', '{"display_name":"Dani"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5500000-0000-0000-0000-0000000000a1', 'Parque de Tibás', 'Tibás',
        extensions.st_setsrid(extensions.st_makepoint(-84.08, 9.96), 4326)::extensions.geography,
        true, true, 'a5500000-0000-0000-0000-000000000001');

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes
) values
  ('a5500000-0000-0000-0000-0000000000b1', 'a5500000-0000-0000-0000-000000000001', 'running',
   'a5500000-0000-0000-0000-0000000000a1', '5K al parque de Tibás', 'weekly', 2, '06:00', 60,
   'any', 12, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

insert into public.activities (
  id, series_id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
)
select v.id::uuid, 'a5500000-0000-0000-0000-0000000000b1', 'a5500000-0000-0000-0000-000000000001',
       'running', 'a5500000-0000-0000-0000-0000000000a1', '5K al parque de Tibás',
       now() + v.offs, now() + v.offs + interval '1 hour', 12,
       v.status::public.activity_status, 'public',
       '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb
  from (values
    ('a5500000-0000-0000-0000-0000000000c1', interval '-14 days', 'completed'),
    ('a5500000-0000-0000-0000-0000000000c2', interval '-7 days',  'completed'),
    ('a5500000-0000-0000-0000-0000000000c3', interval '1 day',    'published'),
    ('a5500000-0000-0000-0000-0000000000c4', interval '8 days',   'published')
  ) as v(id, offs, status);

insert into public.activity_participants (activity_id, user_id, status) values
  -- Ana: both past dates, both upcoming — the whole series.
  ('a5500000-0000-0000-0000-0000000000c1', 'a5500000-0000-0000-0000-000000000002', 'attended'),
  ('a5500000-0000-0000-0000-0000000000c2', 'a5500000-0000-0000-0000-000000000002', 'attended'),
  ('a5500000-0000-0000-0000-0000000000c3', 'a5500000-0000-0000-0000-000000000002', 'joined'),
  ('a5500000-0000-0000-0000-0000000000c4', 'a5500000-0000-0000-0000-000000000002', 'joined'),
  -- Beto: one past date, the next one only.
  ('a5500000-0000-0000-0000-0000000000c1', 'a5500000-0000-0000-0000-000000000003', 'attended'),
  ('a5500000-0000-0000-0000-0000000000c3', 'a5500000-0000-0000-0000-000000000003', 'joined'),
  -- Caro: did not come once, nothing ahead.
  ('a5500000-0000-0000-0000-0000000000c2', 'a5500000-0000-0000-0000-000000000004', 'no_show'),
  -- Dani: came once, and blocked Luis.
  ('a5500000-0000-0000-0000-0000000000c1', 'a5500000-0000-0000-0000-000000000005', 'attended');

insert into public.series_invitations (series_id, user_id, invited_by)
values ('a5500000-0000-0000-0000-0000000000b1', 'a5500000-0000-0000-0000-000000000004',
        'a5500000-0000-0000-0000-000000000001');

insert into public.blocks (blocker_id, blocked_id)
values ('a5500000-0000-0000-0000-000000000005', 'a5500000-0000-0000-0000-000000000001');

-- ------------------------------------------------- 2. who may ask

do $$ begin
  if has_function_privilege('anon', 'public.series_people(uuid)', 'execute') then
    raise exception 'FAIL: anon can read who goes to a series';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a5500000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform * from public.series_people('a5500000-0000-0000-0000-0000000000b1');
    raise exception 'FAIL: a participant read the series roster';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------- 1. the rows

select set_config('request.jwt.claim.sub', 'a5500000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
declare r record; n integer := 0;
begin
  for r in select * from public.series_people('a5500000-0000-0000-0000-0000000000b1') loop
    n := n + 1;
    if r.display_name = 'Ana' and not (r.whole and r.arrived = 2 and r.past_dates = 2
                                       and r.next_status = 'joined' and not r.invited) then
      raise exception 'FAIL: Ana is in the whole series and came twice: %', r;
    elsif r.display_name = 'Beto' and not (not r.whole and r.arrived = 1 and r.next_status = 'joined') then
      raise exception 'FAIL: Beto goes date by date and came once: %', r;
    elsif r.display_name = 'Caro' and not (not r.whole and r.arrived = 0 and r.next_status is null and r.invited) then
      raise exception 'FAIL: Caro came no time, is not on the next date, and was invited: %', r;
    elsif r.display_name = 'Dani' then
      raise exception 'FAIL: a block should leave Dani out';
    end if;
  end loop;
  if n <> 3 then
    raise exception 'FAIL: expected Ana, Beto and Caro, got % rows', n;
  end if;
end $$;
reset role;

rollback;
