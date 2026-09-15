-- =====================================================================
-- 13_blocking_test.sql — blocking actually blocks, in both directions.
--
-- `docs/security.md` lists this as a control in place: "symmetric and
-- enforced in policy, not in the UI — is_blocked() filters discovery, chat,
-- and profile reads in both directions."
--
-- Until this file, nothing tested it. `is_blocked()` is called from eight
-- places — profiles_read, activities_read, messages_read,
-- nearby_activities(), the series-collapse query, and join_activity() — and
-- the predicate is the only thing standing between a person who blocked
-- somebody and that person's sessions appearing in their feed.
--
-- Symmetry is the part most likely to be quietly wrong, because it is the
-- part that looks redundant. The function ORs both orderings:
--
--     (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
--
-- If either half were dropped, blocking would still "work" when tested from
-- the blocker's side and do nothing from the other, which is the side that
-- matters — the person being blocked is the one you do not want turning up.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Ana blocks Beto. Cris is uninvolved and is the control: everything Ana and
-- Beto stop seeing, Cris must still see, or the test proves nothing except
-- that the rows are hard to read in general.

insert into auth.users (id, email, raw_user_meta_data) values
  ('11100000-0000-0000-0000-0000000000a1', 'ana@test.cr',  '{"display_name":"Ana"}'),
  ('11100000-0000-0000-0000-0000000000b1', 'beto@test.cr', '{"display_name":"Beto"}'),
  ('11100000-0000-0000-0000-0000000000c1', 'cris@test.cr', '{"display_name":"Cris"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values (
  '11100000-0000-0000-0000-00000000aa01', 'Parque del bloqueo', 'Mata Redonda',
  extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
  true, true, '11100000-0000-0000-0000-0000000000c1'
);

-- One session each, both public and published, both at the same venue, so the
-- only thing that can differ between them is who organises them.
insert into public.activities (
  id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, status, visibility, attributes
) values
  ('11100000-0000-0000-0000-00000000dd01',
   '11100000-0000-0000-0000-0000000000b1', 'running',
   '11100000-0000-0000-0000-00000000aa01', 'Corrida de Beto',
   now() + interval '2 days', now() + interval '2 days 1 hour',
   'published', 'public', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb),
  ('11100000-0000-0000-0000-00000000dd02',
   '11100000-0000-0000-0000-0000000000a1', 'running',
   '11100000-0000-0000-0000-00000000aa01', 'Corrida de Ana',
   now() + interval '2 days', now() + interval '2 days 1 hour',
   'published', 'public', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

-- --------------------------------------------- the predicate, before a block

do $$ begin
  if public.is_blocked('11100000-0000-0000-0000-0000000000a1',
                       '11100000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL: is_blocked() is true before anybody blocked anybody';
  end if;
end $$;

-- ----------------------------------------------------------- Ana blocks Beto

select set_config('request.jwt.claim.sub', '11100000-0000-0000-0000-0000000000a1', true);
set local role authenticated;

insert into public.blocks (blocker_id, blocked_id)
values ('11100000-0000-0000-0000-0000000000a1', '11100000-0000-0000-0000-0000000000b1');

-- ------------------------------------------------- the predicate is symmetric

reset role;

do $$ begin
  -- The direction that was recorded.
  if not public.is_blocked('11100000-0000-0000-0000-0000000000a1',
                           '11100000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL: is_blocked(blocker, blocked) is false after a block';
  end if;

  -- The direction that was not, and the one that matters.
  if not public.is_blocked('11100000-0000-0000-0000-0000000000b1',
                           '11100000-0000-0000-0000-0000000000a1') then
    raise exception
      'FAIL: is_blocked() is not symmetric — the blocked person is not filtered, which is the side that matters';
  end if;

  -- Cris is nobody's business.
  if public.is_blocked('11100000-0000-0000-0000-0000000000c1',
                       '11100000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL: is_blocked() is true for an uninvolved pair';
  end if;
end $$;

-- ----------------------------------------------------- as Ana, who blocked

select set_config('request.jwt.claim.sub', '11100000-0000-0000-0000-0000000000a1', true);
set local role authenticated;

do $$ begin
  if exists (
    select 1 from public.profiles where id = '11100000-0000-0000-0000-0000000000b1'
  ) then
    raise exception 'FAIL: Ana can still read the profile of somebody she blocked';
  end if;

  if exists (
    select 1 from public.activities where id = '11100000-0000-0000-0000-00000000dd01'
  ) then
    raise exception 'FAIL: Ana can still read a session organised by somebody she blocked';
  end if;

  -- The control. If this also disappeared, the policy is broken rather than
  -- selective, and every check above would pass for the wrong reason.
  if not exists (
    select 1 from public.profiles where id = '11100000-0000-0000-0000-0000000000c1'
  ) then
    raise exception 'FAIL: Ana cannot read an uninvolved profile — the policy is too broad';
  end if;
end $$;

-- Discovery is a function, not a policy, so it gets its own check: the block
-- filter lives inside nearby_activities() as well as in activities_read.
do $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.nearby_activities(9.9350, -84.1035, 15000);

  if '11100000-0000-0000-0000-00000000dd01' = any (coalesce(v_ids, '{}')) then
    raise exception 'FAIL: Descubrir shows Ana a session by somebody she blocked';
  end if;
  if not ('11100000-0000-0000-0000-00000000dd02' = any (coalesce(v_ids, '{}'))) then
    raise exception 'FAIL: Ana cannot see her own session in Descubrir';
  end if;
end $$;

-- ------------------------------------------- as Beto, who was blocked

reset role;
select set_config('request.jwt.claim.sub', '11100000-0000-0000-0000-0000000000b1', true);
set local role authenticated;

do $$ begin
  if exists (
    select 1 from public.profiles where id = '11100000-0000-0000-0000-0000000000a1'
  ) then
    raise exception
      'FAIL: Beto can read the profile of somebody who blocked him — blocking is one-directional';
  end if;

  if exists (
    select 1 from public.activities where id = '11100000-0000-0000-0000-00000000dd02'
  ) then
    raise exception
      'FAIL: Beto can read a session organised by somebody who blocked him — he could turn up to it';
  end if;
end $$;

do $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.nearby_activities(9.9350, -84.1035, 15000);

  if '11100000-0000-0000-0000-00000000dd02' = any (coalesce(v_ids, '{}')) then
    raise exception 'FAIL: Descubrir shows Beto a session by somebody who blocked him';
  end if;
end $$;

-- Reading is one thing; joining is the one that puts two people in a park.
do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.join_activity('11100000-0000-0000-0000-00000000dd02'::uuid);
    raise exception 'FAIL: Beto joined a session organised by somebody who blocked him';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      -- Any refusal is acceptable; silently succeeding is not.
      null;
  end;
end $$;

-- Beto cannot undo the block by deleting the row: blocks_own scopes to the
-- blocker, so the person being blocked has no say in it.
do $$
declare
  v_rows integer;
begin
  delete from public.blocks
   where blocker_id = '11100000-0000-0000-0000-0000000000a1'
     and blocked_id = '11100000-0000-0000-0000-0000000000b1';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: the blocked person deleted the block';
  end if;
end $$;

-- ----------------------------------------------------- as Cris, uninvolved

reset role;
select set_config('request.jwt.claim.sub', '11100000-0000-0000-0000-0000000000c1', true);
set local role authenticated;

do $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.nearby_activities(9.9350, -84.1035, 15000);

  if not ('11100000-0000-0000-0000-00000000dd01' = any (coalesce(v_ids, '{}')))
     or not ('11100000-0000-0000-0000-00000000dd02' = any (coalesce(v_ids, '{}'))) then
    raise exception
      'FAIL: a block between two other people removed sessions from an uninvolved person''s feed';
  end if;
end $$;

-- ------------------------------------------------------- unblocking works

reset role;
select set_config('request.jwt.claim.sub', '11100000-0000-0000-0000-0000000000a1', true);
set local role authenticated;

delete from public.blocks
 where blocker_id = '11100000-0000-0000-0000-0000000000a1'
   and blocked_id = '11100000-0000-0000-0000-0000000000b1';

do $$ begin
  if not exists (
    select 1 from public.activities where id = '11100000-0000-0000-0000-00000000dd01'
  ) then
    raise exception 'FAIL: unblocking did not restore the session — the block is permanent';
  end if;
end $$;

reset role;

rollback;
