-- =====================================================================
-- 27_drop_device_tokens_test.sql — the dead table is gone and stays gone.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

do $$ begin
  if to_regclass('public.device_tokens') is not null then
    raise exception 'FAIL: public.device_tokens still exists';
  end if;
  -- What replaced it must still be there.
  if to_regclass('public.push_subscriptions') is null then
    raise exception 'FAIL: public.push_subscriptions is missing';
  end if;
end $$;
