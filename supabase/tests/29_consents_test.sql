-- =====================================================================
-- 29_consents_test.sql — every consent leaves a dated, versioned row, and
-- nobody can write one for somebody else or rewrite one afterwards.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A row can be changed or deleted after the fact, so the log stops
--      being evidence of anything.
--   2. Somebody can read or write another person's consents.
--   3. A grant is not recorded, or is recorded without the text version.
--   4. The attendance history log disagrees with the gate in 0021.
--   5. Deleting an account with attendance history on fails (0029).
--   6. Repeating the same grant fills the log with duplicates.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Ana signs up with the rules version; Beto signs up without one; Caro
-- sends a malformed one. Dora turns attendance history on, then deletes
-- her account.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2900000-0000-0000-0000-000000000001', 'ana29@test.cr',
   '{"display_name":"Ana","rules_version":"2026-09-28"}'),
  ('a2900000-0000-0000-0000-000000000002', 'beto29@test.cr',
   '{"display_name":"Beto"}'),
  ('a2900000-0000-0000-0000-000000000003', 'caro29@test.cr',
   jsonb_build_object('display_name', 'Caro', 'rules_version', repeat('x', 41))),
  ('a2900000-0000-0000-0000-000000000004', 'dora29@test.cr',
   '{"display_name":"Dora","rules_version":"2026-09-28"}');

-- ------------------------------------------------------------ sign-up

do $$ begin
  if (select count(*) from public.consents
       where user_id = 'a2900000-0000-0000-0000-000000000001'
         and purpose = 'rules' and granted and version = '2026-09-28') <> 1 then
    raise exception 'FAIL: signing up with a rules version did not record it';
  end if;
  if exists (select 1 from public.consents
              where user_id in ('a2900000-0000-0000-0000-000000000002',
                                'a2900000-0000-0000-0000-000000000003')) then
    raise exception 'FAIL: a missing or malformed rules version recorded something';
  end if;
  if not exists (select 1 from public.profiles where id = 'a2900000-0000-0000-0000-000000000003') then
    raise exception 'FAIL: a malformed rules version broke the sign-up';
  end if;
end $$;

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('anon', 'public.record_consent(public.consent_purpose, text, boolean)', 'execute') then
    raise exception 'FAIL: anon can record a consent';
  end if;
  if has_function_privilege('authenticated', 'public.consent_in_force(uuid, public.consent_purpose, text)', 'execute') then
    raise exception 'FAIL: a client can ask about somebody else''s consents';
  end if;
  if has_table_privilege('authenticated', 'public.consents', 'insert')
     or has_table_privilege('authenticated', 'public.consents', 'update')
     or has_table_privilege('authenticated', 'public.consents', 'delete') then
    raise exception 'FAIL: a client can write the consent log directly';
  end if;
end $$;

-- ------------------------------------------------------ granting, Beto

select set_config('request.jwt.claim.sub', 'a2900000-0000-0000-0000-000000000002', true);
set local role authenticated;

select public.record_consent('location', '2026-10-08', true);
select public.record_consent('location', '2026-10-08', true);   -- same: nothing
select public.record_consent('location', null, false);          -- withdrawn
select public.record_consent('location', null, false);          -- again: nothing
select public.record_consent('push',     null, false);          -- never granted: nothing
select public.record_consent('location', '2026-10-08', true);   -- granted again
select public.record_consent('location', '2026-11-01', true);   -- new text

do $$
declare
  r record;
  v_sqlstate text;
begin
  if (select count(*) from public.consents where purpose = 'location') <> 4 then
    raise exception 'FAIL: expected 4 location rows, got %',
      (select count(*) from public.consents where purpose = 'location');
  end if;
  if exists (select 1 from public.consents where purpose = 'push') then
    raise exception 'FAIL: withdrawing what was never granted wrote a row';
  end if;
  if (select version from public.consents where purpose = 'location'
       order by recorded_at desc, id desc limit 1) is distinct from '2026-11-01' then
    raise exception 'FAIL: the latest location row is not the new version';
  end if;

  for r in select * from (values
    ('push',               null,         '22023', 'a grant with no version'),
    ('attendance_history', '2026-09-22', '42501', 'attendance history from the client')
  ) as t(purpose, version, expected, why) loop
    begin
      perform public.record_consent(r.purpose::public.consent_purpose, r.version, true);
      raise exception 'FAIL: accepted %', r.why;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> r.expected then
        raise exception 'FAIL: % refused with %, expected %', r.why, v_sqlstate, r.expected;
      end if;
    end;
  end loop;

  -- Only his own rows: Ana's sign-up row is invisible to him.
  if exists (select 1 from public.consents where user_id <> 'a2900000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: Beto can read somebody else''s consents';
  end if;
end $$;

-- The log cannot be rewritten from a client.
do $$
declare v_sqlstate text;
begin
  begin
    update public.consents set version = 'otra' where purpose = 'location';
    raise exception 'FAIL: a client rewrote a consent';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: rewriting refused with %, expected 42501', v_sqlstate;
    end if;
  end;
  begin
    delete from public.consents where purpose = 'location';
    raise exception 'FAIL: a client deleted a consent';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: deleting refused with %, expected 42501', v_sqlstate;
    end if;
  end;
end $$;

-- The export carries the log.
do $$ begin
  if jsonb_array_length(public.export_my_data() -> 'consents') <> 4 then
    raise exception 'FAIL: the export does not carry the consent log';
  end if;
end $$;

reset role;

-- ------------------------------------------- attendance history, Dora

select set_config('request.jwt.claim.sub', 'a2900000-0000-0000-0000-000000000004', true);
set local role authenticated;
select public.set_attendance_history(true, '2026-09-22');
select public.set_attendance_history(false, '2026-09-22');
select public.set_attendance_history(true, '2026-09-22');
reset role;

do $$ begin
  if (select string_agg(granted::text || ':' || coalesce(version, '-'), ',' order by recorded_at, id)
        from public.consents
       where user_id = 'a2900000-0000-0000-0000-000000000004'
         and purpose = 'attendance_history')
     is distinct from 'true:2026-09-22,false:-,true:2026-09-22' then
    raise exception 'FAIL: the attendance history log does not follow the gate: %',
      (select string_agg(granted::text || ':' || coalesce(version, '-'), ',' order by recorded_at, id)
         from public.consents
        where user_id = 'a2900000-0000-0000-0000-000000000004'
          and purpose = 'attendance_history');
  end if;
end $$;

-- With history on, the account can still be deleted, and the log goes too.
select set_config('request.jwt.claim.sub', 'a2900000-0000-0000-0000-000000000004', true);
set local role authenticated;
select public.delete_my_account();
reset role;

do $$ begin
  if exists (select 1 from auth.users where id = 'a2900000-0000-0000-0000-000000000004')
     or exists (select 1 from public.consents where user_id = 'a2900000-0000-0000-0000-000000000004') then
    raise exception 'FAIL: deleting the account left the account or its consents behind';
  end if;
end $$;

rollback;
