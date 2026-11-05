-- =====================================================================
-- 0047_help_feedback.sql — «¿Te sirvió?» under each help answer.
--
-- 3 November handoff, backend item 9 (board Ayuda v1 · 3–4). The answers
-- themselves are a file in the app, one per language, so they ship with a
-- release and are read offline. What comes back is the one thing that says
-- which answers fail: per question, yes or no, and when it is no, which of
-- three reasons. Nothing else — no account, no free text, no device — so it
-- is not a channel to ask for help and cannot become one by accident; the
-- screen says so, and points to «Reportar» for anything that needs a person.
--
-- Anybody can send it, signed in or not: /ayuda is public. The table takes
-- no client reads; the team reads the counts.
-- =====================================================================

create table public.help_feedback (
  id          bigint generated always as identity primary key,
  question_id text        not null check (question_id ~ '^[a-z0-9-]{2,60}$'),
  helpful     boolean     not null,
  reason      text check (
    reason is null or reason in ('no_responde', 'no_se_entiende', 'desactualizado')
  ),
  created_at  timestamptz not null default now(),
  -- A reason only explains a «no».
  check (not helpful or reason is null)
);

comment on table public.help_feedback is
  '«¿Te sirvió?» on /ayuda: question, yes/no, and a reason when no. No account or free text. See 0047.';

create index help_feedback_question_idx on public.help_feedback (question_id, created_at);

alter table public.help_feedback enable row level security;
revoke all on public.help_feedback from public, anon, authenticated;

create or replace function public.record_help_feedback(
  p_question_id text,
  p_helpful     boolean,
  p_reason      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_helpful is null then
    raise exception 'Falta la respuesta.' using errcode = '22023';
  end if;
  insert into public.help_feedback (question_id, helpful, reason)
  values (p_question_id, p_helpful, case when p_helpful then null else p_reason end);
end;
$$;

comment on function public.record_help_feedback(text, boolean, text) is
  'Stores one «¿Te sirvió?»: question id, yes/no, and the reason when no. See 0047.';

revoke all on function public.record_help_feedback(text, boolean, text) from public;
grant execute on function public.record_help_feedback(text, boolean, text) to anon, authenticated;
