-- =====================================================================
-- 46_help_feedback_test.sql — «¿Te sirvió?» stores a vote and nothing else.
--
--   1. Anybody can vote, signed in or not; nobody can read the votes.
--   2. A reason only goes with a «no», and only one of the three.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

do $$ begin
  if has_table_privilege('anon', 'public.help_feedback', 'select')
     or has_table_privilege('authenticated', 'public.help_feedback', 'select')
     or not has_function_privilege('anon', 'public.record_help_feedback(text, boolean, text)', 'execute') then
    raise exception 'FAIL: wrong access to help feedback';
  end if;
end $$;

set local role anon;
select public.record_help_feedback('que-pasa-reporte', true, 'no_responde');
select public.record_help_feedback('que-pasa-reporte', false, 'desactualizado');
do $$ begin
  begin
    perform public.record_help_feedback('que-pasa-reporte', false, 'texto libre');
    raise exception 'FAIL: a free-text reason was stored';
  exception when check_violation then null;
  end;
  begin
    perform public.record_help_feedback('../etc', true, null);
    raise exception 'FAIL: a malformed question id was stored';
  exception when check_violation then null;
  end;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.help_feedback where question_id = 'que-pasa-reporte') <> 2 then
    raise exception 'FAIL: expected two votes';
  end if;
  if exists (select 1 from public.help_feedback where helpful and reason is not null) then
    raise exception 'FAIL: a «yes» kept a reason';
  end if;
end $$;

rollback;
