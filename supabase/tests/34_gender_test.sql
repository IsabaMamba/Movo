-- =====================================================================
-- 34_gender_test.sql — gender is stored once, read only by its owner, and
-- every change leaves a row the team can read.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody else can read a person's gender.
--   2. It can be changed without leaving a trace (a direct UPDATE).
--   3. A value outside the three is stored.
--   4. Sign-up with a bad or missing value fails instead of being dropped.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3400000-0000-0000-0000-000000000001', 'ana34@test.cr',  '{"display_name":"Ana","gender":"mujer"}'),
  ('a3400000-0000-0000-0000-000000000002', 'beto34@test.cr', '{"display_name":"Beto","gender":"otro"}'),
  ('a3400000-0000-0000-0000-000000000003', 'caro34@test.cr', '{"display_name":"Caro"}');

-- ------------------------------------------------------------ sign-up

do $$ begin
  if (select gender from public.profile_private where id = 'a3400000-0000-0000-0000-000000000001')
       is distinct from 'mujer' then
    raise exception 'FAIL: the gender sent at sign-up was not stored';
  end if;
  if (select count(*) from public.gender_changes
       where user_id = 'a3400000-0000-0000-0000-000000000001'
         and from_gender is null and to_gender = 'mujer') <> 1 then
    raise exception 'FAIL: the sign-up answer was not logged';
  end if;
  if (select gender from public.profile_private where id = 'a3400000-0000-0000-0000-000000000002') is not null
     or (select gender from public.profile_private where id = 'a3400000-0000-0000-0000-000000000003') is not null then
    raise exception 'FAIL: a bad or missing value was stored instead of dropped';
  end if;
end $$;

-- ------------------------------------------------------------- grants

do $$ begin
  if has_column_privilege('authenticated', 'public.profile_private', 'gender', 'update') then
    raise exception 'FAIL: a client can write gender without the log';
  end if;
  if has_table_privilege('authenticated', 'public.gender_changes', 'select')
     or has_table_privilege('anon', 'public.gender_changes', 'select') then
    raise exception 'FAIL: a client can read the gender log';
  end if;
  if has_function_privilege('anon', 'public.set_my_gender(text)', 'execute') then
    raise exception 'FAIL: anon can set a gender';
  end if;
end $$;

-- ---------------------------------------------------- Caro answers late

select set_config('request.jwt.claim.sub', 'a3400000-0000-0000-0000-000000000003', true);
set local role authenticated;

select public.set_my_gender('no_dice');
select public.set_my_gender('no_dice');   -- same answer: nothing logged
select public.set_my_gender('mujer');

do $$
declare v_state text;
begin
  if public.my_profile() ->> 'gender' is distinct from 'mujer' then
    raise exception 'FAIL: my_profile() does not return the owner''s gender';
  end if;
  begin
    perform public.set_my_gender('otro');
    raise exception 'FAIL: a fourth value was accepted';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = 'P0001' then raise; end if;
    if v_state <> '22023' then raise exception 'FAIL: a fourth value refused with %', v_state; end if;
  end;
  begin
    update public.profile_private set gender = 'hombre'
     where id = 'a3400000-0000-0000-0000-000000000003';
    raise exception 'FAIL: a direct update of gender went through';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = 'P0001' then raise; end if;
    if v_state <> '42501' then raise exception 'FAIL: a direct update refused with %', v_state; end if;
  end;
  -- Owner-only: Ana's row is invisible to Caro.
  if exists (select 1 from public.profile_private where id = 'a3400000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Caro can read Ana''s private profile';
  end if;
end $$;

reset role;

do $$ begin
  if (select string_agg(coalesce(from_gender, '-') || '>' || to_gender, ',' order by changed_at)
        from public.gender_changes where user_id = 'a3400000-0000-0000-0000-000000000003')
     is distinct from '->no_dice,no_dice>mujer' then
    raise exception 'FAIL: the log is not one row per real change: %',
      (select string_agg(coalesce(from_gender, '-') || '>' || to_gender, ',' order by changed_at)
         from public.gender_changes where user_id = 'a3400000-0000-0000-0000-000000000003');
  end if;
end $$;

rollback;
