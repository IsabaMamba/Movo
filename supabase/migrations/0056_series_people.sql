-- =====================================================================
-- 0056_series_people.sql — «Quiénes van» for a whole series.
--
-- Consola v3 · 2 (4 November): the organizer sees, for everybody who has
-- been on a date of the series, how they joined (the whole series or date
-- by date), how many of the series' past dates they arrived at, whether
-- they are on the next date, and — for those going date by date — whether
-- they were already invited to the whole series (0052).
--
-- Only the organizer, who sees every one of these rosters already, one date
-- at a time. No phone and no email: the board says so in the table's header.
-- A block either way leaves the person out, as everywhere else.
-- =====================================================================

create or replace function public.series_people(p_series_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  whole        boolean,
  arrived      integer,
  past_dates   integer,
  next_status  text,
  invited      boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_next uuid;
  v_past integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.activity_series where id = p_series_id and organizer_id = v_user
  ) then
    raise exception 'Solo quien organiza la serie ve quiénes van.' using errcode = '42501';
  end if;

  select id into v_next
    from public.activities
   where series_id = p_series_id and status in ('published', 'full') and starts_at > now()
   order by starts_at
   limit 1;

  select count(*)::integer into v_past
    from public.activities
   where series_id = p_series_id
     and status <> 'cancelled' and status <> 'draft'
     and starts_at <= now();

  return query
  with people as (
    select distinct p.user_id
      from public.activity_participants p
      join public.activities a on a.id = p.activity_id
     where a.series_id = p_series_id
       and p.status in ('joined', 'waitlisted', 'attended', 'no_show')
       and p.user_id <> v_user
  ), upcoming as (
    select a.id
      from public.activities a
     where a.series_id = p_series_id and a.status in ('published', 'full') and a.starts_at > now()
  )
  select pe.user_id,
         pr.display_name,
         -- On every upcoming date: in the series (0048 has no membership row).
         exists (select 1 from upcoming)
           and not exists (
             select 1 from upcoming u
              where not exists (
                select 1 from public.activity_participants x
                 where x.activity_id = u.id and x.user_id = pe.user_id
                   and x.status in ('joined', 'waitlisted')
              )
           ),
         (select count(*)::integer
            from public.activity_participants x
            join public.activities a on a.id = x.activity_id
           where a.series_id = p_series_id and x.user_id = pe.user_id
             and x.status = 'attended' and a.starts_at <= now()),
         v_past,
         (select x.status::text from public.activity_participants x
           where x.activity_id = v_next and x.user_id = pe.user_id
             and x.status in ('joined', 'waitlisted')),
         exists (select 1 from public.series_invitations i
                  where i.series_id = p_series_id and i.user_id = pe.user_id)
    from people pe
    join public.profiles pr on pr.id = pe.user_id
   where not public.is_blocked(v_user, pe.user_id)
   order by 4 desc, 2;
end;
$$;

comment on function public.series_people(uuid) is
  'For the organizer: everybody who was on a date of the series, how they joined, how often they arrived, the next date, and whether they were invited to all of it. See 0056.';

revoke all on function public.series_people(uuid) from public, anon;
grant execute on function public.series_people(uuid) to authenticated;
