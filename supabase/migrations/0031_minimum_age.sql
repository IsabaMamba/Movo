-- =====================================================================
-- 0031_minimum_age.sql — Movo is for people of 18 or older, and now
-- something checks it.
--
-- /normas and the sign-up form both said 18 and nothing enforced it. The
-- form now asks for the date of birth and refuses under 18 before sending;
-- this checks the same rule again in handle_new_user(), because the sign-up
-- endpoint is public and the form is only one way to call it. Audit of
-- 7 October, item 9.
--
-- The rule, identical to src/lib/age.ts: somebody is 18 on the day their
-- 18th anniversary falls, in Costa Rica's calendar. `date + interval '18
-- years'` puts a 29 February birthday's anniversary on 28 February in a
-- common year; the form does the same.
--
-- What the database refuses, and what it does not:
--
--   * a declared date of birth under 18, in the future, or before 1900, and
--     one that is not a date: the sign-up fails and no account exists.
--   * a missing date is let through and stored as null. Accounts created
--     before this migration have none, and neither do the test fixtures.
--     Requiring it would not make anybody's age true — a date of birth is a
--     declaration either way — and the form never sends an empty one.
--
-- profile_private.birthdate has existed since 0001 with nothing writing it.
-- It gets its job here and loses its client update grant: the date given at
-- sign-up is the one the age check was made against. The other columns stay
-- updatable by their owner.
-- =====================================================================

-- --------------------------------------------- the date stays as given

revoke update on public.profile_private from authenticated;
grant update (phone, emergency_contact, locale) on public.profile_private to authenticated;

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

  insert into public.profile_private (id, birthdate)
  values (new.id, v_birth)
  on conflict (id) do nothing;

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
