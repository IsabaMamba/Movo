-- =====================================================================
-- 0052_series_invitations.sql — «Invitarlas a la serie».
--
-- 16 October handoff, backend item 3: «a series-invitation table unique on
-- (series, person), so "Invitarlas a la serie" reaches each person once».
-- 0048 let a person join a series whole; this lets whoever organizes ask
-- the people who came to one date to come to all of them.
--
--   * Who can be invited: somebody who has been on a date of this series
--     (joined, on the waitlist, or attended) and is not on every upcoming
--     date already. Nobody else: the organizer saw these people on a roster
--     of their own, so an invitation tells nobody anything new, and Movo
--     does not become a way to message strangers.
--   * Each person is invited once per series, ever. Inviting again does
--     nothing and sends nothing, so a second tap cannot become spam.
--   * A block either way leaves the person out of the list and out of the
--     invitation, silently, as everywhere else.
--   * The invitation is a notice, type `series_invitation`, which 0049
--     already files under «Invitaciones»: switched off, the trigger drops
--     the notice, and the row still counts as the one invitation.
--   * Accepting is join_series() (0048); nothing here joins anybody.
--
-- Everything is an RPC; series_invitations takes no client access.
-- =====================================================================

create table public.series_invitations (
  series_id  uuid not null references public.activity_series (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (series_id, user_id)
);

comment on table public.series_invitations is
  'Who was invited to a whole series, once per person. RPC only. See 0052.';

alter table public.series_invitations enable row level security;
revoke all on public.series_invitations from public, anon, authenticated;

-- --------------------------------------------------------- the candidates

-- People who have been on a date of the series and are not on all of its
-- upcoming dates. For the organizer's screen; nothing for anyone else.
create or replace function public.series_invite_candidates(p_series_id uuid)
returns table (user_id uuid, display_name text, dates integer, invited boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.activity_series
     where id = p_series_id and organizer_id = v_user
  ) then
    raise exception 'Solo quien organiza la serie puede invitar.' using errcode = '42501';
  end if;

  return query
  with been as (
    select p.user_id, count(distinct a.id)::integer as dates
      from public.activity_participants p
      join public.activities a on a.id = p.activity_id
     where a.series_id = p_series_id
       and p.status in ('joined', 'waitlisted', 'attended')
       and p.user_id <> v_user
     group by p.user_id
  )
  select b.user_id, pr.display_name, b.dates,
         exists (select 1 from public.series_invitations i
                  where i.series_id = p_series_id and i.user_id = b.user_id)
    from been b
    join public.profiles pr on pr.id = b.user_id
   where not public.is_blocked(v_user, b.user_id)
     -- Somebody missing from at least one upcoming date is not in the series.
     and exists (
       select 1 from public.activities a
        where a.series_id = p_series_id
          and a.status in ('published', 'full')
          and a.starts_at > now()
          and not exists (
            select 1 from public.activity_participants p
             where p.activity_id = a.id and p.user_id = b.user_id
               and p.status in ('joined', 'waitlisted')
          )
     )
   order by b.dates desc, pr.display_name;
end;
$$;

comment on function public.series_invite_candidates(uuid) is
  'For the organizer: people who were on a date of the series and are not on all its upcoming dates, and whether they were invited. See 0052.';

-- ------------------------------------------------------------- the invite

-- Invites each listed person who is a candidate and was not invited before.
-- Returns how many were invited now; the rest are skipped without a word.
create or replace function public.invite_to_series(p_series_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_series public.activity_series;
  v_name   text;
  v_count  integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_series from public.activity_series where id = p_series_id;
  if not found or v_series.organizer_id <> v_user then
    raise exception 'Solo quien organiza la serie puede invitar.' using errcode = '42501';
  end if;
  if not v_series.is_active then
    raise exception 'series is not active' using errcode = '22023';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_user_ids) > 50 then
    raise exception 'at most 50 people at a time' using errcode = '22023';
  end if;

  select display_name into v_name from public.profiles where id = v_user;

  with fresh as (
    insert into public.series_invitations (series_id, user_id, invited_by)
    select p_series_id, c.user_id, v_user
      from public.series_invite_candidates(p_series_id) c
     where c.user_id = any (p_user_ids)
       and not c.invited
    on conflict do nothing
    returning user_id
  ), sent as (
    insert into public.notifications (user_id, type, payload)
    select f.user_id, 'series_invitation',
           jsonb_build_object(
             'series_id',        p_series_id,
             'title',            v_series.title,
             'weekday',          v_series.weekday,
             'local_start_time', to_char(v_series.local_start_time, 'HH24:MI'),
             'name',             v_name
           )
      from fresh f
    returning 1
  )
  select count(*)::integer into v_count from fresh;

  return v_count;
end;
$$;

comment on function public.invite_to_series(uuid, uuid[]) is
  'Invite people who were on a date of the series to all of it, once each; one series_invitation notice per person. See 0052.';

revoke all on function public.series_invite_candidates(uuid)  from public, anon;
revoke all on function public.invite_to_series(uuid, uuid[])  from public, anon;
grant execute on function public.series_invite_candidates(uuid) to authenticated;
grant execute on function public.invite_to_series(uuid, uuid[]) to authenticated;
