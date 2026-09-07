-- =====================================================================
-- 0007_community_owner.sql — the creator of a group is its owner
--
-- 0003 grants membership INSERT only for `role = 'member'`, and promotion to
-- organizer is itself organizer-only. Nothing ever wrote the first organizer
-- row, so:
--
--   * creating a group left you not a member of it,
--   * is_community_organizer() was false for its creator,
--   * communities_update_organizer therefore refused the creator's own edits,
--   * and no client path could ever produce an owner.
--
-- Every group in existence was unownable. Same shape as handle_new_user():
-- the row is written by a trigger precisely because no policy should allow a
-- client to write it.
-- =====================================================================

create or replace function public.handle_new_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_members (community_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (community_id, user_id) do nothing;
  return new;
end;
$$;

-- created_by is nullable and set null on profile deletion, so a group can
-- outlive its creator. Only seed the membership when there is somebody to seed.
create trigger on_community_created
  after insert on public.communities
  for each row
  when (new.created_by is not null)
  execute function public.handle_new_community();

comment on function public.handle_new_community() is
  'Seeds the creator as owner. Without it a group has no organizer and cannot '
  'be edited by anyone, because promotion to organizer is organizer-only.';
