-- =====================================================================
-- 0034_profile_v2.sql — Perfil v2 (16 October): your zone stays yours,
-- your sports are on your profile, and both are edited in one place.
--
-- 1. home_district is closed, not hidden. The public-profile preview
--    promises «No aparece: tu zona», and since 0025 the column could be read
--    through the API by anybody who shares a session or a group with you
--    (handoff, «Still open»). Hiding it on a screen would not keep that
--    promise. Clients lose SELECT on that one column — every other column
--    keeps it, and every client query names its columns, so nothing else
--    changes. The owner reads their own zone through my_profile().
--
--    It also becomes a zone: a 5-digit distrito code with a foreign key to
--    `zones`, so «Tibás · San José» is a choice from the map Movo already
--    has, never a typed address. On 16 October no profile had one.
--
-- 2. Sports. user_interests (0001) was owner-only and unused. The public
--    profile shows them, so somebody who can see a profile (0025's
--    profile_visible()) can now read its sports too. Written through
--    set_my_interests(), which replaces the set in one statement.
--
-- 3. my_profile() returns what the Perfil and Editar screens need about the
--    caller in one call: name, bio, zone with its distrito and cantón names,
--    sports, and since when they are on Movo.
-- =====================================================================

-- ---------------------------------------------- 1. the zone is private

revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url, bio, is_verified, created_at, updated_at)
  on public.profiles to anon, authenticated;

alter table public.profiles
  add constraint profiles_home_district_is_distrito
    check (home_district is null or home_district ~ '^[0-9]{5}$'),
  add constraint profiles_home_district_fkey
    foreign key (home_district) references public.zones (code);

comment on column public.profiles.home_district is
  'The person''s distrito, as a 5-digit zone code. Never readable by clients '
  '(0034): the owner reads it through my_profile().';

-- --------------------------------------------------------- 2. sports

create policy user_interests_read_visible on public.user_interests
  for select to authenticated
  using (public.profile_visible(user_id));

create or replace function public.set_my_interests(p_categories text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_list text[] := array(
    select distinct btrim(c) from unnest(coalesce(p_categories, '{}'::text[])) as t(c)
     where btrim(coalesce(c, '')) <> ''
  );
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if cardinality(v_list) > 10 then
    raise exception 'Puedes elegir hasta 10 deportes.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_list) as t(c)
     where not exists (select 1 from public.categories k where k.id = t.c)
  ) then
    raise exception 'Ese deporte no existe en Movo.' using errcode = '22023';
  end if;

  delete from public.user_interests where user_id = v_user and not (category_id = any (v_list));
  insert into public.user_interests (user_id, category_id)
  select v_user, c from unnest(v_list) as t(c)
  on conflict do nothing;
end;
$$;

revoke all on function public.set_my_interests(text[]) from public, anon;
grant execute on function public.set_my_interests(text[]) to authenticated;

-- ------------------------------------------------------ 3. my profile

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
    'district_name', d.name,
    'canton_name',   c.name,
    'interests', coalesce((
      select jsonb_agg(i.category_id order by i.category_id)
        from public.user_interests i where i.user_id = p.id
    ), '[]'::jsonb)
  )
    from public.profiles p
    left join public.zones d on d.code = p.home_district
    left join public.zones c on c.code = d.parent_code
   where p.id = auth.uid();
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

comment on function public.my_profile() is
  'The caller''s own profile, including the zone no client can select. See 0034.';
