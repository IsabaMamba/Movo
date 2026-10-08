-- =====================================================================
-- 30_minimum_age_test.sql — nobody under 18 gets an account, and the date
-- of birth given at sign-up is the one that stays.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A declared under-18 date creates an account.
--   2. The database and the form disagree on a boundary date — the 18th
--      birthday itself, or a 29 February birthday.
--   3. A malformed or impossible date is stored instead of refused.
--   4. The date can be changed afterwards from a client.
--   5. Refusing breaks the sign-up of somebody who sent no date at all.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ------------------------------------------------------------ refusals

do $$
declare
  r          record;
  v_today    date := (now() at time zone 'America/Costa_Rica')::date;
  v_sqlstate text;
  v_n        integer := 0;
begin
  for r in select * from (values
    (to_char(v_today - interval '18 years' + interval '1 day', 'YYYY-MM-DD'), 'turning 18 tomorrow'),
    (to_char(v_today - interval '10 years', 'YYYY-MM-DD'),                    'ten years old'),
    (to_char(v_today + interval '1 day', 'YYYY-MM-DD'),                       'born tomorrow'),
    ('1899-12-31',                                                            'born before 1900'),
    ('1990-02-30',                                                            'a day that does not exist'),
    ('05/03/1990',                                                            'not ISO'),
    ('mañana',                                                                'not a date')
  ) as t(birth, why) loop
    v_n := v_n + 1;
    begin
      insert into auth.users (id, email, raw_user_meta_data)
      values (('a3000000-0000-0000-0000-0000000001' || lpad(v_n::text, 2, '0'))::uuid,
              'refused' || v_n || '30@test.cr',
              jsonb_build_object('display_name', 'Menor', 'birthdate', r.birth));
      raise exception 'FAIL: created an account %', r.why;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: % refused with %, expected 22023', r.why, v_sqlstate;
      end if;
    end;
  end loop;

  if exists (select 1 from auth.users where email like 'refused%30@test.cr')
     or exists (select 1 from public.profiles where display_name = 'Menor') then
    raise exception 'FAIL: a refused sign-up left something behind';
  end if;
end $$;

-- ------------------------------------------------------------ accepted

do $$
declare
  v_today   date := (now() at time zone 'America/Costa_Rica')::date;
  v_today18 date := (v_today - interval '18 years')::date;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    -- 18 today.
    ('a3000000-0000-0000-0000-000000000001', 'hoy30@test.cr',
     jsonb_build_object('display_name', 'Hoy', 'birthdate', to_char(v_today18, 'YYYY-MM-DD'))),
    -- An ordinary adult.
    ('a3000000-0000-0000-0000-000000000002', 'adulta30@test.cr',
     '{"display_name":"Adulta","birthdate":"1990-03-05"}'),
    -- No date at all: an older client or a fixture. Let through, stored as null.
    ('a3000000-0000-0000-0000-000000000003', 'sinfecha30@test.cr',
     '{"display_name":"Sin fecha"}');

  if (select birthdate from public.profile_private where id = 'a3000000-0000-0000-0000-000000000001')
       is distinct from v_today18 then
    raise exception 'FAIL: somebody turning 18 today was not stored with their date';
  end if;
  if (select birthdate from public.profile_private where id = 'a3000000-0000-0000-0000-000000000002')
       is distinct from date '1990-03-05' then
    raise exception 'FAIL: the adult''s date of birth was not stored';
  end if;
  if not exists (select 1 from public.profile_private
                  where id = 'a3000000-0000-0000-0000-000000000003' and birthdate is null) then
    raise exception 'FAIL: a sign-up with no date did not go through';
  end if;
end $$;

-- 29 February: the anniversary in a common year is 28 February, as the form says.
do $$ begin
  if (date '2008-02-29' + interval '18 years')::date <> date '2026-02-28' then
    raise exception 'FAIL: 29 February does not land on 28 February, so the form and the database disagree';
  end if;
end $$;

-- ------------------------------------------------- the date stays as given

do $$ begin
  if has_column_privilege('authenticated', 'public.profile_private', 'birthdate', 'update') then
    raise exception 'FAIL: a client can change its date of birth';
  end if;
  if not has_column_privilege('authenticated', 'public.profile_private', 'locale', 'update') then
    raise exception 'FAIL: the owner can no longer update the rest of profile_private';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare v_sqlstate text;
begin
  begin
    update public.profile_private set birthdate = '2015-01-01'
     where id = 'a3000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: the owner changed their date of birth';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: changing the date refused with %, expected 42501', v_sqlstate;
    end if;
  end;
end $$;

update public.profile_private set locale = 'es-CR'
 where id = 'a3000000-0000-0000-0000-000000000002';

reset role;

rollback;
