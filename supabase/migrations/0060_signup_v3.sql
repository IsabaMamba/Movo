-- =====================================================================
-- 0060_signup_v3.sql — the account first, then four steps (Registro v3).
--
-- Registro v3 (4 November) creates the account with Apple, Google or an
-- email and a password, and only then asks: about you (name and date of
-- birth), your gender, your sports, where you move. Apple and Google send
-- no date of birth, so the steps cannot ride on the sign-up metadata the
-- way 0031/0035 do; they are calls made with a session.
--
--   * profile_private.signup_completed_at: null while the steps are not
--     done. The app shows the steps until it is set. Accounts that already
--     have a date of birth were made with the old form, which asked
--     everything at once: they are marked done here.
--   * set_about_me(name, birthdate): the name, and the date of birth once.
--     Under 18 the account is deleted right there and 'under_age' comes
--     back — «no se crea la cuenta y no se guarda nada» (Registro v1 · 5).
--   * set_my_district_from_point(lat, lng): the device's approximate point
--     becomes a distrito code. The point is rounded to about a kilometre,
--     used once and stored nowhere; only the code is kept. Outside Costa
--     Rica it returns null and keeps nothing.
--   * set_my_district(code): the same, typed («Dinos tu zona»).
--   * profile_private.search_radius_km and set_my_search_radius(): «¿Hasta
--     dónde buscamos?», 5, 15, 25 or 50 km. Descubrir starts from it.
--   * finish_signup(): marks the steps done; needs the date of birth and
--     the gender. The rules go through record_consent('rules', …) (0030),
--     as before.
--   * my_signup(): where the person is in the steps.
--
-- handle_new_user() is unchanged: an older client that still sends the
-- date of birth and gender with the sign-up keeps working.
-- =====================================================================

alter table public.profile_private
  add column signup_completed_at timestamptz,
  add column search_radius_km smallint not null default 15
    check (search_radius_km in (5, 15, 25, 50));

comment on column public.profile_private.signup_completed_at is
  'When the Registro v3 steps were finished; null while they are not. See 0060.';
comment on column public.profile_private.search_radius_km is
  'How far Descubrir searches by default, in km. Owner-only. See 0060.';

-- Accounts from the old form answered everything before the account existed.
update public.profile_private
   set signup_completed_at = coalesce(updated_at, now())
 where birthdate is not null and signup_completed_at is null;

revoke update (signup_completed_at, search_radius_km) on public.profile_private from authenticated;

-- ------------------------------------------------------------ status

create or replace function public.my_signup()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'display_name',   p.display_name,
    'has_birthdate',  pp.birthdate is not null,
    'gender',         pp.gender,
    'sports',         (select count(*) from public.user_interests i where i.user_id = p.id),
    'home_district',  p.home_district,
    'district_name',  d.name,
    'canton_name',    c.name,
    'radius_km',      coalesce(pp.search_radius_km, 15),
    'completed',      pp.signup_completed_at is not null
  )
    from public.profiles p
    left join public.profile_private pp on pp.id = p.id
    left join public.zones d on d.code = p.home_district
    left join public.zones c on c.code = d.parent_code
   where p.id = auth.uid();
$$;

comment on function public.my_signup() is
  'Where the caller is in the Registro v3 steps. Owner-only by construction. See 0060.';

revoke all on function public.my_signup() from public, anon;
grant execute on function public.my_signup() to authenticated;

-- ------------------------------------------------------- about you

create or replace function public.set_about_me(p_display_name text, p_birthdate date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_name  text := btrim(coalesce(p_display_name, ''));
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
  v_had   date;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_birthdate is null or p_birthdate < date '1900-01-01' or p_birthdate > v_today then
    raise exception 'Revisa tu fecha de nacimiento.' using errcode = '22023';
  end if;

  select birthdate into v_had from public.profile_private where id = v_user for update;
  if v_had is not null and v_had <> p_birthdate then
    raise exception 'La fecha de nacimiento no se puede cambiar.' using errcode = '22023';
  end if;

  if (p_birthdate + interval '18 years')::date > v_today then
    -- Nothing of this person stays: not the date, not the account.
    perform public.delete_my_account();
    return 'under_age';
  end if;

  -- The name only matters for an account that stays.
  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'El nombre va de 2 a 60 caracteres.' using errcode = '22023';
  end if;

  update public.profiles set display_name = v_name where id = v_user;
  insert into public.profile_private (id, birthdate) values (v_user, p_birthdate)
  on conflict (id) do update set birthdate = excluded.birthdate;
  return 'ok';
end;
$$;

comment on function public.set_about_me(text, date) is
  'Registro v3 step 1: the name, and the date of birth once. Under 18 deletes the account and '
  'returns under_age. See 0060.';

revoke all on function public.set_about_me(text, date) from public, anon;
grant execute on function public.set_about_me(text, date) to authenticated;

-- ---------------------------------------------------- where you move

create or replace function public.district_json(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('code', d.code, 'name', d.name, 'canton', c.name)
    from public.zones d
    left join public.zones c on c.code = d.parent_code
   where d.code = p_code and d.kind = 'distrito';
$$;

revoke all on function public.district_json(text) from public, anon, authenticated;

create or replace function public.set_my_district_from_point(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid point' using errcode = '22023';
  end if;

  -- Rounded here too, whatever the client sent: about a kilometre.
  v_code := public.resolve_zone(
    extensions.st_setsrid(
      extensions.st_makepoint(round(p_lng::numeric, 2)::double precision,
                              round(p_lat::numeric, 2)::double precision),
      4326)::extensions.geography);
  if v_code is null then
    return null;
  end if;

  update public.profiles set home_district = v_code where id = v_user;
  return public.district_json(v_code);
end;
$$;

comment on function public.set_my_district_from_point(double precision, double precision) is
  'The distrito the approximate point falls in becomes the caller''s zone. The point is not '
  'stored. Null outside Costa Rica. See 0060.';

revoke all on function public.set_my_district_from_point(double precision, double precision) from public, anon;
grant execute on function public.set_my_district_from_point(double precision, double precision) to authenticated;

create or replace function public.set_my_district(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_zone jsonb;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  v_zone := public.district_json(p_code);
  if v_zone is null then
    raise exception 'Elige un distrito de la lista.' using errcode = '22023';
  end if;
  update public.profiles set home_district = p_code where id = v_user;
  return v_zone;
end;
$$;

revoke all on function public.set_my_district(text) from public, anon;
grant execute on function public.set_my_district(text) to authenticated;

create or replace function public.set_my_search_radius(p_km integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_km is null or p_km not in (5, 15, 25, 50) then
    raise exception 'La distancia es 5, 15, 25 o 50 km.' using errcode = '22023';
  end if;
  insert into public.profile_private (id, search_radius_km) values (v_user, p_km)
  on conflict (id) do update set search_radius_km = excluded.search_radius_km;
end;
$$;

revoke all on function public.set_my_search_radius(integer) from public, anon;
grant execute on function public.set_my_search_radius(integer) to authenticated;

-- ------------------------------------------------------------ done

create or replace function public.finish_signup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pp   public.profile_private%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_pp from public.profile_private where id = v_user for update;
  if not found or v_pp.birthdate is null then
    raise exception 'Falta tu fecha de nacimiento.' using errcode = '22023';
  end if;
  if v_pp.gender is null then
    raise exception 'Falta tu género.' using errcode = '22023';
  end if;
  if v_pp.signup_completed_at is null then
    update public.profile_private set signup_completed_at = now() where id = v_user;
  end if;
end;
$$;

comment on function public.finish_signup() is
  'Marks the Registro v3 steps done. Needs the date of birth and the gender. See 0060.';

revoke all on function public.finish_signup() from public, anon;
grant execute on function public.finish_signup() to authenticated;
