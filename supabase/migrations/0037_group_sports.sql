-- =====================================================================
-- 0037_group_sports.sql — a group plays up to three sports.
--
-- 3 November handoff, backend item 1 (boards Deportes v2, Grupos v5 · 5).
-- A group used to have one sport. With nineteen, a club that runs and
-- trail-runs, or plays fútbol and voleibol, is the normal case, so a group
-- now picks up to three. A session still has exactly one.
--
--   * communities.category_ids holds them, in the order the group chose.
--     An array rather than a table: three ids at most, always read with the
--     group, and filtered with && (overlap) from Descubrir and Grupos.
--   * communities.category_id stays, as the first of them. Everything that
--     already reads it — the tile colour, the console, old clients — keeps
--     working, and it is never written on its own again: the trigger below
--     derives it.
--   * An array cannot carry a foreign key, so the same trigger refuses an
--     id that is not in categories, drops repeats and caps the list at
--     three. A sport removed later (on delete set null on category_id) is
--     dropped from the array by the next write; nothing reads a stale id
--     as a colour, it falls back to the cool accent.
-- =====================================================================

alter table public.communities
  add column category_ids text[] not null default '{}'
    check (cardinality(category_ids) <= 3);

comment on column public.communities.category_ids is
  'Up to three category ids, in the group''s order. category_id is always the '
  'first of them, kept by communities_sports(). See 0037.';

-- Existing groups keep the sport they had.
update public.communities
   set category_ids = array[category_id]
 where category_id is not null;

create index communities_category_ids_idx on public.communities using gin (category_ids);

create or replace function public.communities_sports()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ids     text[];
  v_unknown text;
begin
  -- A client that still writes only category_id (an old build) gets it as
  -- the whole list, instead of the trigger putting the old first sport back.
  if tg_op = 'INSERT' then
    if coalesce(cardinality(new.category_ids), 0) = 0 and new.category_id is not null then
      new.category_ids := array[new.category_id];
    end if;
  elsif new.category_id is distinct from old.category_id
        and new.category_ids is not distinct from old.category_ids then
    new.category_ids := case when new.category_id is null then '{}'::text[]
                             else array[new.category_id] end;
  end if;

  select coalesce(array_agg(id order by first_at), '{}')
    into v_ids
    from (
      select btrim(c) as id, min(ord) as first_at
        from unnest(coalesce(new.category_ids, '{}')) with ordinality as t(c, ord)
       where btrim(c) <> ''
       group by btrim(c)
    ) d;

  select d into v_unknown
    from unnest(v_ids) as d
   where not exists (select 1 from public.categories k where k.id = d)
   limit 1;
  if v_unknown is not null then
    raise exception 'unknown sport: %', v_unknown using errcode = '23503';
  end if;

  if cardinality(v_ids) > 3 then
    raise exception 'a group has at most three sports' using errcode = '23514';
  end if;

  new.category_ids := v_ids;
  new.category_id  := v_ids[1];
  return new;
end;
$$;

comment on function public.communities_sports() is
  'Validates communities.category_ids (known ids, no repeats, at most three) '
  'and keeps category_id equal to the first. See 0037.';

revoke all on function public.communities_sports() from public, anon, authenticated;

create trigger communities_sports
  before insert or update of category_ids, category_id on public.communities
  for each row execute function public.communities_sports();
