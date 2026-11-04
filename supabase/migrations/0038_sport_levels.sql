-- =====================================================================
-- 0038_sport_levels.sql — a level for each sport in the profile.
--
-- 3 November handoff, backend item 1 («profiles store (category, level)
-- per sport»); board Deportes v2 · 3–4. With nineteen sports one general
-- level says little: somebody can be advanced at running and starting at
-- yoga. user_interests has had a skill column since 0001 that nothing
-- wrote, so this is only the way to write and read it:
--
--   * set_my_sports(jsonb) replaces the caller's sports and their levels in
--     one call — [{"category": "running", "level": "intermediate"}, …] —
--     with the same limits as set_my_interests (0034): known sports, at
--     most ten. The level is beginner, intermediate or advanced; «any» is
--     what a session says about who may come, not what a person says
--     about themselves.
--   * my_profile() also returns «sports», the same list with levels, in the
--     catalog's order. «interests» stays for older clients.
--   * The level is public where the sports already are: the
--     user_interests_read_visible policy (0034) covers the whole row. The
--     board says so: «Se ve en tu perfil público».
--
-- set_my_interests() stays as it was. It keeps the level of a sport that
-- stays chosen and adds new ones as beginner, the column default.
-- =====================================================================

create or replace function public.set_my_sports(p_sports jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid  := auth.uid();
  v_rows   jsonb := coalesce(p_sports, '[]'::jsonb);
  v_ids    text[];
  v_levels text[];
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(v_rows) <> 'array' then
    raise exception 'Se esperaba una lista de deportes.' using errcode = '22023';
  end if;

  -- One row per sport; if a sport comes twice, its first level wins.
  select coalesce(array_agg(cat order by ord), '{}'), coalesce(array_agg(lvl order by ord), '{}')
    into v_ids, v_levels
    from (
      select distinct on (cat) cat, lvl, ord
        from (
          select btrim(coalesce(e ->> 'category', '')) as cat,
                 coalesce(nullif(e ->> 'level', ''), 'beginner') as lvl,
                 ord
            from jsonb_array_elements(v_rows) with ordinality as t(e, ord)
        ) raw
       where cat <> ''
       order by cat, ord
    ) d;

  if exists (select 1 from unnest(v_levels) as l
              where l not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'Ese nivel no existe.' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 10 then
    raise exception 'Puedes elegir hasta 10 deportes.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_ids) as c
              where not exists (select 1 from public.categories k where k.id = c)) then
    raise exception 'Ese deporte no existe en Movo.' using errcode = '22023';
  end if;

  delete from public.user_interests
   where user_id = v_user and not (category_id = any (v_ids));

  insert into public.user_interests (user_id, category_id, skill)
  select v_user, c, l::public.skill_level
    from unnest(v_ids, v_levels) as t(c, l)
  on conflict (user_id, category_id) do update set skill = excluded.skill;
end;
$$;

comment on function public.set_my_sports(jsonb) is
  'Replaces the caller''s sports and the level in each: '
  '[{"category": id, "level": beginner|intermediate|advanced}], at most ten. See 0038.';

revoke all on function public.set_my_sports(jsonb) from public, anon;
grant execute on function public.set_my_sports(jsonb) to authenticated;

-- ------------------------------------------------------ my_profile()

create or replace function public.my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',            p.id,
    'display_name',  p.display_name,
    'bio',           p.bio,
    'avatar_url',    p.avatar_url,
    'created_at',    p.created_at,
    'home_district', p.home_district,
    'gender',        pp.gender,
    'district_name', d.name,
    'canton_name',   c.name,
    'interests', coalesce((
      select jsonb_agg(i.category_id order by i.category_id)
        from public.user_interests i where i.user_id = p.id
    ), '[]'::jsonb),
    'sports', coalesce((
      select jsonb_agg(jsonb_build_object('category', i.category_id, 'level', i.skill)
                       order by k.sort_order, i.category_id)
        from public.user_interests i
        join public.categories k on k.id = i.category_id
       where i.user_id = p.id
    ), '[]'::jsonb)
  )
    from public.profiles p
    left join public.profile_private pp on pp.id = p.id
    left join public.zones d on d.code = p.home_district
    left join public.zones c on c.code = d.parent_code
   where p.id = auth.uid();
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
