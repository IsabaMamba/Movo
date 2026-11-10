-- =====================================================================
-- 0059_series_renewal_question.sql — what «¿Sigues en la serie?» shows.
--
-- Series v2 · 10. The `series_renewal` notice opens the series page, which
-- has to know whether there is a question waiting for this person. 0057
-- keeps the renewals readable by the organizer alone, and an answer only
-- names its renewal, so the page cannot tell by itself.
--
--   * my_series_renewal(series): null unless the caller was asked about the
--     latest renewal of this series and has not answered. Otherwise who
--     added the dates, how many, the first and last new date, the date the
--     series ends for them without an answer, and the dates the organizer
--     left out (a holiday) — the board says «Sin el 29 dic».
--
-- Nothing here writes. answer_series_renewal() (0057) is still the only
-- way to answer.
-- =====================================================================

create or replace function public.my_series_renewal(p_series_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_renewal public.series_renewals%rowtype;
  v_s       public.activity_series%rowtype;
  v_notice  jsonb;
  v_step    integer;
  v_first   date;
  v_last    date;
  v_skipped date[];
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_renewal from public.series_renewals
   where series_id = p_series_id order by created_at desc limit 1;
  if not found then
    return null;
  end if;

  select n.payload into v_notice from public.notifications n
   where n.user_id = v_user and n.type = 'series_renewal'
     and n.payload ->> 'series_id' = p_series_id::text
     and (n.payload ->> 'last_start')::timestamptz = v_renewal.after_start
   order by n.created_at desc limit 1;
  if v_notice is null then
    return null;
  end if;

  if exists (select 1 from public.series_renewal_answers
              where renewal_id = v_renewal.id and user_id = v_user) then
    return null;
  end if;

  select * into v_s from public.activity_series where id = p_series_id;
  if not found or not v_s.is_active then
    return null;
  end if;

  v_step  := case v_s.frequency when 'weekly' then 7 when 'biweekly' then 14 when 'monthly' then 28 end;
  v_first := (v_notice ->> 'first')::date;
  v_last  := (v_notice ->> 'last')::date;

  -- Every step between the first and the last new date that has no session:
  -- the dates renew_series() was told to skip.
  select coalesce(array_agg(d::date order by d), '{}') into v_skipped
    from generate_series(v_first, v_last, make_interval(days => v_step)) as d
   where not exists (select 1 from public.activities a
                      where a.series_id = p_series_id
                        and a.starts_at > v_renewal.after_start
                        and (a.starts_at at time zone v_s.timezone)::date = d::date);

  return jsonb_build_object(
    'name',       v_notice ->> 'name',
    'added',      v_renewal.added,
    'first',      v_first,
    'last',       v_last,
    'last_start', v_renewal.after_start,
    'skipped',    to_jsonb(v_skipped)
  );
end;
$$;

comment on function public.my_series_renewal(uuid) is
  'The «¿Sigues en la serie?» question waiting for the caller on this series, or null. Read only. '
  'See 0059.';

revoke all on function public.my_series_renewal(uuid) from public, anon;
grant execute on function public.my_series_renewal(uuid) to authenticated;
