-- =====================================================================
-- 0028_drop_device_tokens.sql — remove a table nothing uses.
--
-- `device_tokens` was created in 0001 for Expo push, and 0003 granted
-- `authenticated` select, insert, update and delete on it. ADR 0007 replaced
-- Expo push with Web Push, and `push_subscriptions` (0026) took over. No
-- line of application code, Edge Function or SQL function reads or writes it.
--
-- That left a table any signed-in person could fill with device identifiers,
-- for a feature that no longer exists. The 7 October audit (item 5) asked for
-- it to go.
--
-- Native builds, when they exist, get a table designed for them then. They
-- do not inherit this one.
-- =====================================================================

drop table if exists public.device_tokens;
