-- =====================================================================
-- 0003_rls.sql — deny by default, then grant back deliberately
--
-- Supabase ships broad default grants to anon/authenticated. We revoke
-- everything first and hand privileges back table by table, so a table
-- added later without a policy is unreachable rather than public.
--
-- Two things worth noticing:
--   * activity_participants gets SELECT only. Joining goes through
--     join_activity(), which is where capacity is enforced under a lock.
--   * anon can read categories and public activities so the app can show
--     something before signup. Everything else requires a session.
-- =====================================================================

revoke all on all tables in schema public from anon, authenticated;

alter table public.profiles              enable row level security;
alter table public.profile_private       enable row level security;
alter table public.categories            enable row level security;
alter table public.user_interests        enable row level security;
alter table public.locations             enable row level security;
alter table public.communities           enable row level security;
alter table public.community_members     enable row level security;
alter table public.activity_series       enable row level security;
alter table public.activities            enable row level security;
alter table public.activity_participants enable row level security;
alter table public.saved_activities      enable row level security;
alter table public.messages              enable row level security;
alter table public.blocks                enable row level security;
alter table public.reports               enable row level security;
alter table public.notifications         enable row level security;
alter table public.device_tokens         enable row level security;

-- ------------------------------------------------------------ profiles

grant select         on public.profiles to anon, authenticated;
grant update         on public.profiles to authenticated;

create policy profiles_read on public.profiles
  for select to anon, authenticated
  using (not public.is_blocked(auth.uid(), id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Rows are created by the on_auth_user_created trigger, so no INSERT policy.

-- ----------------------------------------------------- profile_private

grant select, update on public.profile_private to authenticated;

create policy profile_private_own on public.profile_private
  for select to authenticated
  using (id = auth.uid());

create policy profile_private_update_own on public.profile_private
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------- categories

grant select on public.categories to anon, authenticated;

create policy categories_read on public.categories
  for select to anon, authenticated
  using (is_active);

-- ------------------------------------------------------ user_interests

grant select, insert, update, delete on public.user_interests to authenticated;

create policy user_interests_own on public.user_interests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------- locations

grant select         on public.locations to anon, authenticated;
grant insert, update on public.locations to authenticated;

create policy locations_read on public.locations
  for select to anon, authenticated
  using (true);

create policy locations_insert on public.locations
  for insert to authenticated
  with check (created_by = auth.uid() and is_public_venue);

-- A venue you created stays yours until it is verified; after that it is
-- shared infrastructure and only an admin should touch it.
create policy locations_update_own on public.locations
  for update to authenticated
  using (created_by = auth.uid() and not is_verified)
  with check (created_by = auth.uid());

-- --------------------------------------------------------- communities

grant select                 on public.communities to anon, authenticated;
grant insert, update         on public.communities to authenticated;

create policy communities_read on public.communities
  for select to anon, authenticated
  using (is_public or public.is_community_member(id, auth.uid()));

create policy communities_insert on public.communities
  for insert to authenticated
  with check (created_by = auth.uid());

create policy communities_update_organizer on public.communities
  for update to authenticated
  using (public.is_community_organizer(id, auth.uid()))
  with check (public.is_community_organizer(id, auth.uid()));

-- ---------------------------------------------------- community_members

grant select, insert, delete on public.community_members to authenticated;
grant update                 on public.community_members to authenticated;

create policy community_members_read on public.community_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_community_member(community_id, auth.uid()));

-- You may add yourself to a public community, and only as a plain member.
create policy community_members_join on public.community_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (select 1 from public.communities c where c.id = community_id and c.is_public)
  );

create policy community_members_leave on public.community_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_community_organizer(community_id, auth.uid()));

-- Role promotion is organizer-only.
create policy community_members_manage on public.community_members
  for update to authenticated
  using (public.is_community_organizer(community_id, auth.uid()))
  with check (public.is_community_organizer(community_id, auth.uid()));

-- ------------------------------------------------------ activity_series

grant select, insert, update, delete on public.activity_series to authenticated;

create policy activity_series_read on public.activity_series
  for select to authenticated
  using (
    organizer_id = auth.uid()
    or (community_id is not null and public.is_community_member(community_id, auth.uid()))
  );

create policy activity_series_write on public.activity_series
  for all to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

-- ---------------------------------------------------------- activities

grant select                 on public.activities to anon, authenticated;
grant insert, update, delete on public.activities to authenticated;

create policy activities_read on public.activities
  for select to anon, authenticated
  using (
    (
      visibility = 'public'
      and status in ('published', 'full', 'completed')
      and not public.is_blocked(auth.uid(), organizer_id)
    )
    or organizer_id = auth.uid()
    or (
      visibility = 'community'
      and community_id is not null
      and public.is_community_member(community_id, auth.uid())
    )
    or public.is_activity_participant(id, auth.uid())
  );

create policy activities_insert on public.activities
  for insert to authenticated
  with check (organizer_id = auth.uid());

create policy activities_update_own on public.activities
  for update to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

create policy activities_delete_own on public.activities
  for delete to authenticated
  using (organizer_id = auth.uid() and status = 'draft');

-- ----------------------------------------------- activity_participants
--
-- SELECT only. No INSERT/UPDATE/DELETE grant at all: every write path is
-- join_activity / leave_activity / check_in / close_activity, which is the
-- only way capacity and waitlist ordering stay correct under concurrency.

grant select on public.activity_participants to authenticated;

create policy activity_participants_read on public.activity_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_activity_organizer(activity_id, auth.uid())
    or public.is_activity_participant(activity_id, auth.uid())
  );

-- ----------------------------------------------------- saved_activities

grant select, insert, delete on public.saved_activities to authenticated;

create policy saved_activities_own on public.saved_activities
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------ messages

grant select, insert, update on public.messages to authenticated;

create policy messages_read on public.messages
  for select to authenticated
  using (
    deleted_at is null
    and not public.is_blocked(auth.uid(), author_id)
    and (
      (activity_id is not null and (
        public.is_activity_participant(activity_id, auth.uid())
        or public.is_activity_organizer(activity_id, auth.uid())
      ))
      or (community_id is not null and public.is_community_member(community_id, auth.uid()))
    )
  );

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      (activity_id is not null and (
        public.is_activity_participant(activity_id, auth.uid())
        or public.is_activity_organizer(activity_id, auth.uid())
      ))
      or (community_id is not null and public.is_community_member(community_id, auth.uid()))
    )
  );

-- Soft delete only; there is no DELETE grant.
create policy messages_update_own on public.messages
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- -------------------------------------------------------------- blocks

grant select, insert, delete on public.blocks to authenticated;

create policy blocks_own on public.blocks
  for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- ------------------------------------------------------------- reports

grant select, insert on public.reports to authenticated;

create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- You can see what you reported and how it was resolved. You cannot see
-- anyone else's reports, and you cannot change status.
create policy reports_read_own on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

-- ------------------------------------------------------- notifications

grant select, update on public.notifications to authenticated;

create policy notifications_read_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------- device_tokens

grant select, insert, update, delete on public.device_tokens to authenticated;

create policy device_tokens_own on public.device_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
