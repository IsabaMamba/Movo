-- =====================================================================
-- 0026_web_push.sql — a notice reaches somebody who has not opened Movo.
--
-- Everything the database writes to `notifications` — a cancellation, a
-- waitlist promotion, the solo-session warning (0022), the close reminder
-- (0023) — has only ever been readable inside /avisos. status.md P0 #2.
--
-- ADR 0007 has the reasoning; the shape here:
--
--   * push_subscriptions — one row per browser that asked for notices. The
--     row is written only through register_push_subscription(), which
--     accepts endpoints on the known push services and nothing else. The
--     sender POSTs to whatever endpoint is stored, so an arbitrary one would
--     make the server a request cannon aimed wherever a user pleases.
--   * A device belongs to whoever registered it last. The same browser under
--     a second account moves the row rather than duplicating it, so the first
--     account stops receiving notices on a device somebody else is using.
--   * push_on_notification() — after a notification is inserted, ask the
--     send-push Edge Function to deliver it. Through pg_net, with the
--     function's URL and a shared secret read from Supabase Vault, so neither
--     is in this public repository. If pg_net, Vault or either secret is
--     missing, or the call fails, it does nothing: a notice that cannot be
--     pushed is still a notice, and it must never fail the insert that wrote
--     it — which is inside cancel_activity(), suspend_account() and the rest.
--
-- What the push carries is decided in the Edge Function: nothing but "you
-- have a notice". The text stays in /avisos.
-- =====================================================================

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique check (length(endpoint) <= 1000),
  p256dh        text not null check (length(p256dh) between 40 and 200),
  auth          text not null check (length(auth) between 10 and 100),
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz,
  -- Consecutive failures. The sender drops a subscription the push service
  -- says is gone (404/410) at once, and any other after five in a row.
  failures      integer not null default 0 check (failures >= 0)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

revoke all on public.push_subscriptions from anon, authenticated;
-- Enough for the settings screen to know whether this device is on. The keys
-- are never read back by a client; they are the sender's business.
grant select (id, endpoint, created_at) on public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_read_own on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------ registering

-- The hosts browsers actually use. Chrome and Edge-on-Chromium: FCM. Firefox:
-- Mozilla autopush. Safari, including iOS home-screen apps: Apple. Legacy
-- Edge: WNS. Anything else is refused rather than stored.
create or replace function public.is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- One literal: `~` and `||` share a precedence, so a concatenated pattern
  -- would be matched piecewise.
  select coalesce(p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/', false);
$$;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_endpoint is null or not public.is_push_endpoint(p_endpoint) then
    raise exception 'not a push service endpoint' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_caller, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        created_at = now(),
        failures   = 0;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

-- Removes this device, if it is the caller's. Asking about somebody else's
-- endpoint deletes nothing and says nothing.
create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- ------------------------------------------------------- delivering

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net';
  else
    raise notice 'pg_net is not available here; notices will not be pushed';
  end if;
end
$$;

create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Nobody to push to: the common case, and the cheapest one.
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    return new;
  end if;

  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    return new;
  end if;

  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
      into v_url using 'push_function_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
      into v_secret using 'push_function_secret';

    if v_url is null or v_secret is null then
      return new;
    end if;

    -- Only the id travels. The function reads the row itself, with the
    -- service role, so nothing here can be spoofed into a different notice.
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using v_url,
            jsonb_build_object('notification_id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret);
  exception when others then
    raise warning 'push not queued for notification %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.push_on_notification() from public, anon, authenticated;

create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.push_on_notification();
