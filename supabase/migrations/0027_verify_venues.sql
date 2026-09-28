-- =====================================================================
-- 0027_verify_venues.sql — the Movo team can verify a venue, and say
-- who did and when.
--
-- `locations.is_verified` has existed since 0001, Crear shows «Verificado»
-- next to a venue, and 0024 made sure no client can set it. Which left it
-- settable by nobody: on 28 September six of seven live venues were
-- unverified, and the seventh was verified by the migration that seeded it.
--
-- What verifying means, so it means the same thing every time: somebody on
-- the team checked that the place is real, public and named, and that the
-- point is on it. It is also what ends the creator's control:
-- locations_update_own admits only unverified rows, so a verified venue is
-- shared infrastructure that its creator can no longer move.
--
--   * verify_location(id, note) — staff only; refuses a venue the map puts in
--     no district (a point at sea or abroad is wrong by definition) and a
--     venue that is not public. Stamps verified_by and verified_at from the
--     caller, never from an argument, as resolve_report() does.
--   * unverify_location(id, note) — staff only, for a mistake. Hands the
--     venue back to its creator.
--
-- Both notes are required and kept on the row: "who decided this place is
-- fine, and why" is the question somebody will ask after something happens
-- there.
-- =====================================================================

alter table public.locations
  add column verified_by   uuid references public.profiles (id) on delete set null,
  add column verified_at   timestamptz,
  add column verified_note text check (verified_note is null or length(verified_note) <= 280);

comment on column public.locations.verified_by is
  'The staff member who last verified or unverified the venue. Written only by '
  'verify_location() and unverify_location(); no client grant.';

-- 0024's column grants already leave these three out of INSERT and UPDATE.
-- Stated again because a column added later is exactly what a grant list
-- forgets: this is the check that it did not.
do $$ begin
  if has_column_privilege('authenticated', 'public.locations', 'verified_by', 'update')
     or has_column_privilege('authenticated', 'public.locations', 'verified_by', 'insert') then
    raise exception 'locations.verified_by is writable by clients; review 0024''s grants';
  end if;
end $$;

create or replace function public.verify_location(p_location_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc public.locations%rowtype;
begin
  if not public.is_staff() then
    raise exception 'only the Movo team can verify a venue' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'say what was checked' using errcode = '22023';
  end if;

  select * into v_loc from public.locations where id = p_location_id for update;
  if not found then
    raise exception 'venue not found' using errcode = 'P0002';
  end if;
  if v_loc.is_verified then
    raise exception 'venue is already verified' using errcode = '22023';
  end if;
  if not v_loc.is_public_venue then
    raise exception 'a private place cannot be verified' using errcode = '22023';
  end if;
  if v_loc.district_code is null then
    raise exception 'the point is in no district; fix it before verifying' using errcode = '22023';
  end if;

  update public.locations
     set is_verified   = true,
         verified_by   = auth.uid(),
         verified_at   = now(),
         verified_note = left(btrim(p_note), 280)
   where id = p_location_id;
end;
$$;

create or replace function public.unverify_location(p_location_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'only the Movo team can unverify a venue' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'say why' using errcode = '22023';
  end if;

  update public.locations
     set is_verified   = false,
         verified_by   = auth.uid(),
         verified_at   = now(),
         verified_note = left(btrim(p_note), 280)
   where id = p_location_id and is_verified;

  if not found then
    raise exception 'venue not found or not verified' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.verify_location(uuid, text)   from public, anon;
revoke all on function public.unverify_location(uuid, text) from public, anon;
grant execute on function public.verify_location(uuid, text)   to authenticated;
grant execute on function public.unverify_location(uuid, text) to authenticated;
