-- =====================================================================
-- 0051_zone_summary.sql — the zone sheet in Descubrir (Deportes v2 · 2).
--
-- Tapping a zone on the heat map opens «Tibás y alrededores · esta semana»:
-- how many sessions of your sports, how many people are going, and one bar
-- per sport. Asked for in the 16 October handoff (item 5) and in
-- docs/design/descubrir-transicion.md as `zone_summary(zona, categoría, días)`.
--
-- Same boundary as zone_heat() (0014, 0015): public sessions that are
-- published or full, inside the window, never one by somebody the caller
-- blocked or was blocked by. SECURITY DEFINER because the aggregate is the
-- privacy boundary, and granted to authenticated only, like the heat.
--
-- What it adds beyond the heat is a people count, and a count of people in
-- a small district is an answer about a person. So below five it is null and
-- the sheet says «menos de 5», as docs/security.md asks before attendance is
-- aggregated. Per sport there is only a session count, never people.
--
-- The ids of the sessions come back too, so «Ver las sesiones» can filter
-- the list to the zone. They are public sessions the list would show anyway.
-- =====================================================================

create or replace function public.zone_summary(
  p_code       text,
  p_categories text[]  default null,
  p_days       integer default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zone   public.zones%rowtype;
  v_result jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 31 then
    raise exception 'days must be between 1 and 31' using errcode = '22023';
  end if;

  select * into v_zone from public.zones where code = p_code;
  if not found then
    raise exception 'zone not found' using errcode = 'P0002';
  end if;

  with picked as (
    select a.id, a.category_id, a.joined_count
      from public.activities a
      join public.locations  l on l.id = a.location_id
     where l.district_code like p_code || '%'
       and a.status in ('published', 'full')
       and a.visibility = 'public'
       and a.starts_at >= now()
       and a.starts_at <  now() + make_interval(days => p_days)
       and (p_categories is null or a.category_id = any (p_categories))
       and not public.is_blocked(auth.uid(), a.organizer_id)
  ),
  per_sport as (
    select category_id, count(*)::integer as sessions
      from picked
     group by category_id
  )
  select jsonb_build_object(
           'code',     v_zone.code,
           'name',     v_zone.name,
           'kind',     v_zone.kind,
           'sessions', (select count(*) from picked),
           'people',   (select case when coalesce(sum(joined_count), 0) >= 5
                                    then sum(joined_count)::integer end
                          from picked),
           'sports',   coalesce((select jsonb_agg(jsonb_build_object(
                                          'category_id', category_id,
                                          'sessions',    sessions)
                                        order by sessions desc, category_id)
                                   from per_sport), '[]'::jsonb),
           'activity_ids', coalesce((select jsonb_agg(id) from picked), '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;

comment on function public.zone_summary(text, text[], integer) is
  'Descubrir zone sheet: sessions per sport in a zone for the next p_days, and people going only when 5 or more. Same exclusions as zone_heat(). See 0051.';

revoke all on function public.zone_summary(text, text[], integer) from public, anon;
grant execute on function public.zone_summary(text, text[], integer) to authenticated;
