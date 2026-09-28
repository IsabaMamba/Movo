-- =====================================================================
-- 24_profile_visibility_test.sql — a profile is readable with a reason,
-- and not otherwise. Nobody can list the user base.
--
-- The cast:
--   Olga  organizes a public, published session (S1).
--   Pia   is on S1, and owns group G.
--   Quim  was on S1 and left (status cancelled).
--   Sofi  is in group G, on no session.
--   Raul  is signed in and shares nothing with anybody.
--   Ursu  organizes only a draft.
--   Tomas is staff.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2400000-0000-0000-0000-000000000001', 'olga24@test.cr',  '{"display_name":"Olga"}'),
  ('a2400000-0000-0000-0000-000000000002', 'pia24@test.cr',   '{"display_name":"Pia"}'),
  ('a2400000-0000-0000-0000-000000000003', 'quim24@test.cr',  '{"display_name":"Quim"}'),
  ('a2400000-0000-0000-0000-000000000004', 'sofi24@test.cr',  '{"display_name":"Sofi"}'),
  ('a2400000-0000-0000-0000-000000000005', 'raul24@test.cr',  '{"display_name":"Raul"}'),
  ('a2400000-0000-0000-0000-000000000006', 'ursu24@test.cr',  '{"display_name":"Ursu"}'),
  ('a2400000-0000-0000-0000-000000000009', 'tomas24@test.cr', '{"display_name":"Tomas"}');

insert into public.staff (user_id, note)
values ('a2400000-0000-0000-0000-000000000009', 'Test fixture');

insert into public.locations (id, name, geog, is_public_venue, is_verified) values
  ('b2400000-0000-0000-0000-000000000001', 'Cancha 24',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true);

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('c2400000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-000000000001', 'running',
   'b2400000-0000-0000-0000-000000000001', 'Corrida de Olga',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'published', 'public'),
  ('c2400000-0000-0000-0000-000000000002', 'a2400000-0000-0000-0000-000000000006', 'running',
   'b2400000-0000-0000-0000-000000000001', 'Borrador de Ursu',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'draft', 'public');

insert into public.activity_participants (activity_id, user_id, status) values
  ('c2400000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-000000000002', 'joined'),
  ('c2400000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-000000000003', 'cancelled');

insert into public.communities (id, slug, name, is_public, created_by)
values ('d2400000-0000-0000-0000-000000000001', 'grupo-24', 'Grupo 24', true,
        'a2400000-0000-0000-0000-000000000002');
insert into public.community_members (community_id, user_id, role)
values ('d2400000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-000000000004', 'member');

-- The helper: `sees(reader, target)` is whether a select finds the row.
create temporary table t24_expect (reader text, target text, visible boolean) on commit drop;
insert into t24_expect values
  -- anon: public organizers only.
  ('anon', 'Olga', true),  ('anon', 'Pia', false), ('anon', 'Ursu', false), ('anon', 'Raul', false),
  -- A stranger: public organizers and themself.
  ('Raul', 'Olga', true),  ('Raul', 'Raul', true), ('Raul', 'Pia', false), ('Raul', 'Sofi', false),
  -- On the same roster, whatever the status; the organizer; the group.
  ('Pia', 'Quim', true),   ('Pia', 'Olga', true),  ('Pia', 'Sofi', true),  ('Pia', 'Raul', false),
  ('Quim', 'Pia', true),
  -- The organizer sees the whole roster, cancelled rows included.
  ('Olga', 'Pia', true),   ('Olga', 'Quim', true), ('Olga', 'Sofi', false),
  -- A group shares the group and nothing else.
  ('Sofi', 'Pia', true),   ('Sofi', 'Quim', false),
  -- Staff read everybody.
  ('Tomas', 'Raul', true), ('Tomas', 'Sofi', true), ('Tomas', 'Ursu', true);
grant select on t24_expect to anon, authenticated;

create temporary table t24_names (name text, id uuid) on commit drop;
insert into t24_names values
  ('Olga',  'a2400000-0000-0000-0000-000000000001'), ('Pia',   'a2400000-0000-0000-0000-000000000002'),
  ('Quim',  'a2400000-0000-0000-0000-000000000003'), ('Sofi',  'a2400000-0000-0000-0000-000000000004'),
  ('Raul',  'a2400000-0000-0000-0000-000000000005'), ('Ursu',  'a2400000-0000-0000-0000-000000000006'),
  ('Tomas', 'a2400000-0000-0000-0000-000000000009');
grant select on t24_names to anon, authenticated;

create temporary table t24_seen (reader text, target text, visible boolean) on commit drop;
grant insert, select on t24_seen to anon, authenticated;

-- ---------------------------------------------------------------- anon

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
insert into t24_seen
select 'anon', n.name, exists (select 1 from public.profiles p where p.id = n.id)
  from t24_names n;
reset role;

-- --------------------------------------------------- each signed-in reader

do $$
declare r record;
begin
  for r in select name, id from t24_names where name <> 'anon' loop
    perform set_config('request.jwt.claim.sub', r.id::text, true);
    execute 'set local role authenticated';
    insert into t24_seen
    select r.name, n.name, exists (select 1 from public.profiles p where p.id = n.id)
      from t24_names n;
    execute 'reset role';
  end loop;
end $$;

-- ------------------------------------------------------------- verdicts

do $$
declare r record;
begin
  for r in
    select e.reader, e.target, e.visible as expected, s.visible as actual
      from t24_expect e
      left join t24_seen s on s.reader = e.reader and s.target = e.target
  loop
    if r.actual is null then
      raise exception 'FIXTURE: no reading recorded for % → %', r.reader, r.target;
    end if;
    if r.actual <> r.expected then
      raise exception 'FAIL: % % read %''s profile', r.reader,
        case when r.actual then 'can' else 'cannot' end, r.target;
    end if;
  end loop;
end $$;

-- The headline, stated as the live check was: anon lists the table and gets
-- the public organizers of this fixture, not everybody.
do $$
declare v_n integer;
begin
  select count(*) into v_n from t24_seen
   where reader = 'anon' and visible;
  if v_n <> 1 then
    raise exception 'FAIL: anon can read % of the seven profiles, expected 1 (Olga)', v_n;
  end if;
end $$;

rollback;
