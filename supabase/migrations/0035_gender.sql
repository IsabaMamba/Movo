-- =====================================================================
-- 0035_gender.sql — gender, asked once and seen only by its owner.
--
-- 2 November handoff (docs/design/handoff-2026-11-02.md, backend item 1;
-- board Mujeres v1). Movo will have women-only sessions and groups, and
-- the only way to decide who sees them is to ask. So gender is asked at
-- sign-up — Mujer, Hombre or Prefiero no decir — and used for that one
-- thing. «Mujer» includes trans women.
--
--   * It lives in profile_private, which only its owner can read (0003),
--     so it is never in a public profile, a roster or the organizer's
--     console. my_profile() returns it to its owner.
--   * Clients cannot write the column. set_my_gender() is the only way to
--     change it, and every change is logged in gender_changes — who, when,
--     from and to — so the team can see, if a report says someone lied to
--     reach a women-only session, whether the answer changed and when.
--     Nobody reads the log through the API; it is for the team.
--   * Accounts created before this migration have none. Nothing is
--     invented for them; they are asked the first time they edit their
--     profile, or when women-only content needs an answer (backend item 2).
--
-- What this does not do yet: hide anything. The audience columns and the
-- filtering are backend item 2. Gender is also personal data a lawyer
-- should read the purpose of before women-only content is announced; the
-- handoff already lists that review.
-- =====================================================================

alter table public.profile_private
  add column gender text check (gender is null or gender in ('mujer', 'hombre', 'no_dice'));

comment on column public.profile_private.gender is
  'mujer | hombre | no_dice. Owner-only; written by set_my_gender() and at sign-up. '
  'Used only to decide who sees women-only content. See 0035.';

-- 0031 granted UPDATE on three named columns; gender is not one of them, so
-- the client cannot write it. Restated here so the intent is in this file.
revoke update (gender) on public.profile_private from authenticated;

create table public.gender_changes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  from_gender text check (from_gender is null or from_gender in ('mujer', 'hombre', 'no_dice')),
  to_gender   text not null check (to_gender in ('mujer', 'hombre', 'no_dice')),
  changed_at  timestamptz not null default clock_timestamp()
);

create index gender_changes_user_idx on public.gender_changes (user_id, changed_at);

revoke all on public.gender_changes from anon, authenticated;
alter table public.gender_changes enable row level security;

comment on table public.gender_changes is
  'Every change of profile_private.gender: who, when, from, to. No client '
  'grants; for the team reviewing a report. See 0035.';

-- ------------------------------------------------------------ writing

create or replace function public.set_my_gender(p_gender text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_new  text := nullif(btrim(coalesce(p_gender, '')), '');
  v_old  text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_new is null or v_new not in ('mujer', 'hombre', 'no_dice') then
    raise exception 'Elige Mujer, Hombre o Prefiero no decir.' using errcode = '22023';
  end if;

  select gender into v_old from public.profile_private where id = v_user for update;
  if v_old is not distinct from v_new then
    return;
  end if;

  update public.profile_private set gender = v_new where id = v_user;
  insert into public.gender_changes (user_id, from_gender, to_gender)
  values (v_user, v_old, v_new);
end;
$$;

revoke all on function public.set_my_gender(text) from public, anon;
grant execute on function public.set_my_gender(text) to authenticated;

-- ------------------------------------------------------------ sign-up

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name      text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_rules     text := btrim(coalesce(new.raw_user_meta_data ->> 'rules_version', ''));
  v_birth_raw text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'birthdate', '')), '');
  v_birth     date;
  v_today     date := (now() at time zone 'America/Costa_Rica')::date;
  v_gender    text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'gender', '')), '');
begin
  -- 0031. Checked first, so a refused sign-up writes nothing at all.
  if v_birth_raw is not null then
    if v_birth_raw !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'fecha de nacimiento inválida' using errcode = '22023';
    end if;
    begin
      v_birth := v_birth_raw::date;
    exception when others then
      raise exception 'fecha de nacimiento inválida' using errcode = '22023';
    end;
    if v_birth < date '1900-01-01' or v_birth > v_today then
      raise exception 'fecha de nacimiento inválida' using errcode = '22023';
    end if;
    if (v_birth + interval '18 years')::date > v_today then
      raise exception 'Movo es solo para personas de 18 años o más.' using errcode = '22023';
    end if;
  end if;

  -- Sanitize rather than trust: a name that fails the profiles check
  -- constraint would raise here and abort the entire signup transaction.
  if length(v_name) < 2 or length(v_name) > 60 then
    v_name := 'Nuevo usuario';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;

  -- 0035. Anything but the three values is dropped rather than refused:
  -- an older client or a fixture sends none, and nobody is kept out of Movo
  -- over this field. The form always sends one.
  if v_gender is not null and v_gender not in ('mujer', 'hombre', 'no_dice') then
    v_gender := null;
  end if;

  insert into public.profile_private (id, birthdate, gender)
  values (new.id, v_birth, v_gender)
  on conflict (id) do nothing;

  if v_gender is not null then
    insert into public.gender_changes (user_id, from_gender, to_gender)
    values (new.id, null, v_gender);
  end if;

  -- 0030. The sign-up form says which version of /normas it showed. A
  -- missing or malformed one records nothing rather than failing the
  -- sign-up: an account with no rules row is visibly one that never agreed.
  if length(v_rules) between 1 and 40 then
    insert into public.consents (user_id, purpose, version, granted)
    values (new.id, 'rules', v_rules, true);
  end if;

  return new;
end;
$$;

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
