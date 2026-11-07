-- =====================================================================
-- 51_series_invitations_test.sql — «Invitarlas a la serie» (0052).
--
--   1. The candidates are people who were on a date and are not on every
--      upcoming date: not the organizer, not somebody already in the
--      series, not somebody never on a date, not a block either way.
--   2. invite_to_series() invites each candidate once and sends one notice;
--      a second call, or a person who is not a candidate, sends nothing.
--   3. With «Invitaciones» switched off (0049) the invitation is recorded
--      and the notice is dropped.
--   4. Only the organizer, and never anon.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5100000-0000-0000-0000-000000000001', 'luis@inv.test', '{"display_name":"Luis"}'),
  ('a5100000-0000-0000-0000-000000000002', 'ana@inv.test',  '{"display_name":"Ana"}'),
  ('a5100000-0000-0000-0000-000000000003', 'beto@inv.test', '{"display_name":"Beto"}'),
  ('a5100000-0000-0000-0000-000000000004', 'caro@inv.test', '{"display_name":"Caro"}'),
  ('a5100000-0000-0000-0000-000000000005', 'dani@inv.test', '{"display_name":"Dani"}'),
  ('a5100000-0000-0000-0000-000000000006', 'eva@inv.test',  '{"display_name":"Eva"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5100000-0000-0000-0000-0000000000a1', 'La Sabana', 'Mata Redonda',
        extensions.st_setsrid(extensions.st_makepoint(-84.10, 9.93), 4326)::extensions.geography,
        true, true, 'a5100000-0000-0000-0000-000000000001');

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes
) values
  ('a5100000-0000-0000-0000-0000000000b1', 'a5100000-0000-0000-0000-000000000001', 'running',
   'a5100000-0000-0000-0000-0000000000a1', 'Trote del sábado', 'weekly', 6, '07:00', 60,
   'any', 10, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

-- c1 already happened; c2 and c3 are ahead.
insert into public.activities (
  id, series_id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
)
select v.id::uuid, 'a5100000-0000-0000-0000-0000000000b1', 'a5100000-0000-0000-0000-000000000001',
       'running', 'a5100000-0000-0000-0000-0000000000a1', 'Trote del sábado',
       now() + v.offs, now() + v.offs + interval '1 hour', 10,
       v.status::public.activity_status, 'public',
       '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb
  from (values
    ('a5100000-0000-0000-0000-0000000000c1', interval '-5 days', 'completed'),
    ('a5100000-0000-0000-0000-0000000000c2', interval '2 days',  'published'),
    ('a5100000-0000-0000-0000-0000000000c3', interval '9 days',  'published')
  ) as v(id, offs, status);

-- Ana is on c2 only. Beto is on both upcoming dates: he is in the series.
-- Caro came to c1 and blocked Luis. Eva came to c1. Dani was never on a date.
insert into public.activity_participants (activity_id, user_id, status) values
  ('a5100000-0000-0000-0000-0000000000c2', 'a5100000-0000-0000-0000-000000000002', 'joined'),
  ('a5100000-0000-0000-0000-0000000000c2', 'a5100000-0000-0000-0000-000000000003', 'joined'),
  ('a5100000-0000-0000-0000-0000000000c3', 'a5100000-0000-0000-0000-000000000003', 'joined'),
  ('a5100000-0000-0000-0000-0000000000c1', 'a5100000-0000-0000-0000-000000000004', 'attended'),
  ('a5100000-0000-0000-0000-0000000000c1', 'a5100000-0000-0000-0000-000000000006', 'attended');

insert into public.blocks (blocker_id, blocked_id)
values ('a5100000-0000-0000-0000-000000000004', 'a5100000-0000-0000-0000-000000000001');

-- Eva switched invitations off.
insert into public.notification_preferences (user_id, invitations)
values ('a5100000-0000-0000-0000-000000000006', false);

-- ------------------------------------------------- 4. not for anon

do $$ begin
  if has_function_privilege('anon', 'public.series_invite_candidates(uuid)', 'execute')
     or has_function_privilege('anon', 'public.invite_to_series(uuid, uuid[])', 'execute') then
    raise exception 'FAIL: anon can run the invitation functions';
  end if;
end $$;

-- ------------------------------------------------- 4. not for a participant

select set_config('request.jwt.claim.sub', 'a5100000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform * from public.series_invite_candidates('a5100000-0000-0000-0000-0000000000b1');
    raise exception 'FAIL: a participant read the candidates';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.invite_to_series('a5100000-0000-0000-0000-0000000000b1',
                                    array['a5100000-0000-0000-0000-000000000005']::uuid[]);
    raise exception 'FAIL: a participant invited somebody';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------- 1. the candidates

select set_config('request.jwt.claim.sub', 'a5100000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
declare v_ids uuid[];
begin
  select array_agg(user_id order by display_name) into v_ids
    from public.series_invite_candidates('a5100000-0000-0000-0000-0000000000b1');
  if v_ids is distinct from array['a5100000-0000-0000-0000-000000000002',
                                  'a5100000-0000-0000-0000-000000000006']::uuid[] then
    raise exception 'FAIL: the candidates should be Ana and Eva, got %', v_ids;
  end if;
end $$;

-- ------------------------------------------------- 2–3. the invitation

do $$ begin
  -- Dani and Beto are not candidates and are skipped.
  if public.invite_to_series('a5100000-0000-0000-0000-0000000000b1', array[
       'a5100000-0000-0000-0000-000000000002',
       'a5100000-0000-0000-0000-000000000003',
       'a5100000-0000-0000-0000-000000000005',
       'a5100000-0000-0000-0000-000000000006']::uuid[]) <> 2 then
    raise exception 'FAIL: two people should be invited';
  end if;
  -- Again: nobody.
  if public.invite_to_series('a5100000-0000-0000-0000-0000000000b1',
       array['a5100000-0000-0000-0000-000000000002']::uuid[]) <> 0 then
    raise exception 'FAIL: Ana was invited twice';
  end if;
  if exists (select 1 from public.series_invite_candidates('a5100000-0000-0000-0000-0000000000b1')
              where not invited) then
    raise exception 'FAIL: a candidate should show as invited';
  end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.notifications
       where user_id = 'a5100000-0000-0000-0000-000000000002'
         and type = 'series_invitation'
         and payload ->> 'series_id' = 'a5100000-0000-0000-0000-0000000000b1'
         and payload ->> 'name' = 'Luis'
         and payload ->> 'local_start_time' = '07:00') <> 1 then
    raise exception 'FAIL: Ana should have one invitation notice';
  end if;
  if exists (select 1 from public.notifications
              where type = 'series_invitation'
                and user_id in ('a5100000-0000-0000-0000-000000000003',
                                'a5100000-0000-0000-0000-000000000004',
                                'a5100000-0000-0000-0000-000000000005',
                                'a5100000-0000-0000-0000-000000000006')) then
    raise exception 'FAIL: somebody else got an invitation notice';
  end if;
  if (select count(*) from public.series_invitations
       where series_id = 'a5100000-0000-0000-0000-0000000000b1') <> 2 then
    raise exception 'FAIL: Eva''s invitation should be recorded even with the notice off';
  end if;
end $$;

-- A cancelled series invites nobody.
update public.activity_series set is_active = false
 where id = 'a5100000-0000-0000-0000-0000000000b1';
select set_config('request.jwt.claim.sub', 'a5100000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$ begin
  begin
    perform public.invite_to_series('a5100000-0000-0000-0000-0000000000b1',
                                    array['a5100000-0000-0000-0000-000000000002']::uuid[]);
    raise exception 'FAIL: a cancelled series sent an invitation';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

rollback;
