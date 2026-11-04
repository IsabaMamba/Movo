-- =====================================================================
-- 0043_return_venue.sql — the team hands a venue back to be corrected.
--
-- 3 November handoff, backend item 6 (board Equipo v1 · 4, Lugares v2,
-- Avisos v3 `venue_returned`). Until now a reviewer could verify a venue or
-- leave it unverified; «the pin is on the wrong side of the park» had
-- nowhere to go. Now:
--
--   * return_location(id, note) — staff only, note required. Stamps
--     returned_at / returned_note / returned_by from the caller, unverifies
--     the venue if it was verified (so its creator can edit it again under
--     locations_update_own), and tells the creator with the note.
--   * While a venue is returned, no new session or series can be created
--     there, and no session can be moved to it. Sessions already planned
--     there stay: cancelling somebody's Saturday over a misplaced pin is
--     worse than the pin.
--   * The creator correcting it (name, address, district or point) clears
--     the mark, and the venue is back in the review queue as unverified.
--     Verifying it clears the mark too.
--
-- The three columns have no client grants: 0024's column lists for INSERT
-- and UPDATE on locations name the columns a client may write, and these
-- are not among them.
-- =====================================================================

alter table public.locations
  add column returned_at   timestamptz,
  add column returned_note text check (returned_note is null or length(returned_note) <= 280),
  add column returned_by   uuid references public.profiles (id) on delete set null;

comment on column public.locations.returned_at is
  'Set by return_location(): the team asked the creator to correct the venue. Cleared when the '
  'creator edits it or the team verifies it. See 0043.';

do $$ begin
  if has_column_privilege('authenticated', 'public.locations', 'returned_at', 'update')
     or has_column_privilege('authenticated', 'public.locations', 'returned_note', 'update')
     or has_column_privilege('authenticated', 'public.locations', 'returned_by', 'insert') then
    raise exception 'a client can write the returned_* columns';
  end if;
end $$;

-- ----------------------------------------------------- return_location

create or replace function public.return_location(p_location_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_loc  public.locations%rowtype;
begin
  if not public.is_staff() then
    raise exception 'solo el equipo de Movo puede devolver un lugar' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'escribe qué hay que corregir: es lo que va a leer quien lo agregó'
      using errcode = '22023';
  end if;
  if length(v_note) > 280 then
    raise exception 'la nota tiene que caber en 280 caracteres' using errcode = '22023';
  end if;

  select * into v_loc from public.locations where id = p_location_id for update;
  if not found then
    raise exception 'lugar no encontrado' using errcode = 'P0002';
  end if;
  if v_loc.created_by is null then
    raise exception 'este lugar no tiene a quién devolverlo; corrígelo desde el panel' using errcode = '22023';
  end if;

  update public.locations
     set returned_at   = now(),
         returned_note = v_note,
         returned_by   = auth.uid(),
         is_verified   = false
   where id = p_location_id;

  insert into public.notifications (user_id, type, payload)
  values (v_loc.created_by, 'venue_returned',
          jsonb_build_object('location_id', v_loc.id, 'name', v_loc.name, 'note', v_note));
end;
$$;

comment on function public.return_location(uuid, text) is
  'Staff only. Hands a venue back to its creator with a note; no new sessions there until it is '
  'corrected or verified. See 0043.';

revoke all on function public.return_location(uuid, text) from public, anon;
grant execute on function public.return_location(uuid, text) to authenticated;

-- ------------------------------------------------------ clearing it

create or replace function public.locations_clear_returned()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.returned_at is null then
    return new;
  end if;
  -- Verified by the team: nothing left to correct.
  if new.is_verified and not old.is_verified then
    new.returned_at := null;
    new.returned_note := null;
    new.returned_by := null;
  -- Corrected by its creator: back in the queue, unverified.
  elsif auth.uid() = old.created_by
        and (new.name, new.address, new.district, new.geog)
            is distinct from (old.name, old.address, old.district, old.geog) then
    new.returned_at := null;
    new.returned_note := null;
    new.returned_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.locations_clear_returned() from public, anon, authenticated;

create trigger locations_clear_returned
  before update on public.locations
  for each row execute function public.locations_clear_returned();

-- ---------------------------------------------- no new sessions there

create or replace function public.refuse_returned_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.location_id is not distinct from old.location_id then
    return new;
  end if;
  -- A series already there keeps generating its dates: they are sessions
  -- already planned, and a refusal here would stop the generator for every
  -- series, not just this one.
  -- Nested, because plpgsql resolves new.series_id when the expression is
  -- planned, and activity_series rows have no such field.
  if tg_table_name = 'activities' and tg_op = 'INSERT' then
    if new.series_id is not null then
      return new;
    end if;
  end if;
  if exists (select 1 from public.locations l
              where l.id = new.location_id and l.returned_at is not null) then
    raise exception 'Ese lugar está en revisión: el equipo pidió corregirlo. Elige otro por ahora.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_returned_location() from public, anon, authenticated;

create trigger activities_refuse_returned_location
  before insert or update of location_id on public.activities
  for each row execute function public.refuse_returned_location();

create trigger activity_series_refuse_returned_location
  before insert or update of location_id on public.activity_series
  for each row execute function public.refuse_returned_location();
