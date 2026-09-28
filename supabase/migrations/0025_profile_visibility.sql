-- =====================================================================
-- 0025_profile_visibility.sql — a profile is readable by the people who
-- have a reason to see it, not by anybody with the public key.
--
-- docs/security.md lists "App Check / attestation" as a launch blocker,
-- because "without it the backend is an open API and the user table is
-- enumerable". Checked on the live project on 28 September with nothing but
-- the anon key, which ships in the app and is public by design:
--
--   GET /rest/v1/profiles?select=id,display_name,home_district,created_at
--   → 200, Content-Range 0-6/7 — every profile.
--
-- App Check would not have fixed that. The key is public; on the web,
-- attestation is a captcha a script can solve or skip, and nothing in
-- Supabase checks it on PostgREST. status.md says it plainly: RLS, not
-- secrecy, is the control. So the fix is the policy. 0003's profiles_read
-- was `using (not is_blocked(auth.uid(), id))` — everybody, minus blocks —
-- which is threat #2 in security.md, "someone enumerating the user base",
-- served as a list.
--
-- A profile is now readable when the reader has a reason the app already
-- depends on:
--
--   * it is their own;
--   * the person organizes a public session that is published, full or
--     completed — the same sessions activities_read shows anybody. An
--     organizer is a public face by choosing to publish; the app shows their
--     name on the session to people who are not signed in;
--   * they share a session: both on its roster (any status — the organizer's
--     roster keeps no_show and cancelled rows visible), or one organizes it
--     and the other is on it;
--   * they share a group;
--   * the reader is Movo staff (the report queue and suspensions).
--
-- Blocking (0003) and suspension (0020) still apply on top: the first is in
-- the policy, the second is its own restrictive policy.
--
-- What becomes unreadable: a participant who organizes nothing, to anybody
-- who shares no session or group with them. That is most users, and they are
-- the people the threat model is about.
-- =====================================================================

create or replace function public.profile_visible(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Their own.
    p_profile_id = auth.uid()

    -- An organizer of a session anybody can see.
    or exists (
      select 1 from public.activities a
       where a.organizer_id = p_profile_id
         and a.visibility = 'public'
         and a.status in ('published', 'full', 'completed')
    )

    -- Everything below needs a signed-in reader.
    or (
      auth.uid() is not null
      and (
        -- Both on the same roster.
        exists (
          select 1
            from public.activity_participants mine
            join public.activity_participants theirs
              on theirs.activity_id = mine.activity_id
           where mine.user_id = auth.uid()
             and theirs.user_id = p_profile_id
        )
        -- The reader organizes a session they are on.
        or exists (
          select 1
            from public.activities a
            join public.activity_participants p on p.activity_id = a.id
           where a.organizer_id = auth.uid()
             and p.user_id = p_profile_id
        )
        -- They organize a session the reader is on, or a group session the
        -- reader can see.
        or exists (
          select 1
            from public.activities a
           where a.organizer_id = p_profile_id
             and (
               exists (select 1 from public.activity_participants p
                        where p.activity_id = a.id and p.user_id = auth.uid())
               or (a.community_id is not null
                   and public.is_community_member(a.community_id, auth.uid()))
             )
        )
        -- The same group.
        or exists (
          select 1
            from public.community_members mine
            join public.community_members theirs
              on theirs.community_id = mine.community_id
           where mine.user_id = auth.uid()
             and theirs.user_id = p_profile_id
        )
        -- Staff read the people in reports and suspensions.
        or public.is_staff()
      )
    );
$$;

comment on function public.profile_visible(uuid) is
  'Whether the caller has a reason to read this profile: their own, a public '
  'organizer, a shared session or group, or staff. Used by profiles_read. It '
  'answers only about the caller, which a select on profiles already does.';

-- The policy calls it for anon and authenticated alike.
revoke all on function public.profile_visible(uuid) from public;
grant execute on function public.profile_visible(uuid) to anon, authenticated;

drop policy profiles_read on public.profiles;

create policy profiles_read on public.profiles
  for select to anon, authenticated
  using (
    not public.is_blocked(auth.uid(), id)
    and public.profile_visible(id)
  );
