-- =====================================================================
-- 0011_notification_read_grant.sql — narrow the notifications UPDATE
--
-- 0003 granted `update` on the whole `notifications` row so a person could
-- mark their own notification read. The policy checks *which* rows, never
-- *which columns*, so the grant also let somebody rewrite the `type` and
-- `payload` of their own notifications.
--
-- That was harmless while nothing read those columns. It stops being
-- harmless the moment delivery exists: an Edge Function triggered on insert
-- will read `type` and `payload` to decide what to send, and a person who
-- can edit their own payload can hand that function whatever it will render
-- — into an email, into a push body, into whatever renders it next.
--
-- Column-level grants are the fix. Postgres applies the narrower of the two:
-- the policy still decides the row, the grant now decides the column.
-- =====================================================================

revoke update on public.notifications from authenticated;
grant  update (read_at) on public.notifications to authenticated;

comment on column public.notifications.read_at is
  'Set by the owner through the inbox. The only column a client may write; '
  'see 0011. type and payload are written by the RPCs in 0008 and read by '
  'delivery, so they are not the client''s to change.';

-- The policy is unchanged and still restricts the row. Restated here only so
-- that reading this file tells you the whole rule rather than half of it.
--
--   create policy notifications_mark_read on public.notifications
--     for update to authenticated
--     using (user_id = auth.uid())
--     with check (user_id = auth.uid());
