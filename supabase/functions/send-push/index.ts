/**
 * send-push — delivers one notice to every browser its recipient registered.
 *
 * Called by push_on_notification() (0026) through pg_net, with the notice's
 * id and a shared secret. Deployed with `--no-verify-jwt` because pg_net has
 * no user JWT to send; the secret is what authenticates the caller instead.
 *
 * What it sends is deliberately nothing: "Tienes un aviso nuevo en Movo" and
 * a link to /avisos. The payload is encrypted end to end, but a notification
 * is shown on a lock screen anybody near the phone can read, and "you are the
 * only person going to X" is not something to put there. ADR 0007.
 *
 * Secrets (supabase secrets set …):
 *   PUSH_FUNCTION_SECRET  the same value as Vault's push_function_secret
 *   VAPID_PUBLIC_KEY      the same value as EXPO_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY     never anywhere else
 *   VAPID_SUBJECT         mailto: address the push services can write to
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const PAYLOAD = JSON.stringify({
  title: 'Movo',
  body: 'Tienes un aviso nuevo en Movo.',
  url: '/avisos',
});

/** Mirrors is_push_endpoint() in 0026. Checked again here: the row is data. */
const PUSH_HOST =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

/** After this many failures in a row a subscription is dropped. */
const MAX_FAILURES = 5;

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing secret ${name}`);
  return value;
}

/** Constant-time, so the secret cannot be guessed a character at a time. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!sameSecret(request.headers.get('x-push-secret') ?? '', env('PUSH_FUNCTION_SECRET'))) {
    return new Response('forbidden', { status: 403 });
  }

  let notificationId: unknown;
  try {
    ({ notification_id: notificationId } = await request.json());
  } catch {
    return new Response('bad request', { status: 400 });
  }
  if (typeof notificationId !== 'string') return new Response('bad request', { status: 400 });

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  // Read the notice ourselves: the caller only names it, so a forged call
  // could at most re-send a real notice to its real recipient.
  const { data: notice, error: noticeError } = await db
    .from('notifications')
    .select('user_id, read_at')
    .eq('id', notificationId)
    .maybeSingle();
  if (noticeError) return new Response(noticeError.message, { status: 500 });
  if (!notice || notice.read_at !== null) return new Response('nothing to send', { status: 200 });

  const { data: subs, error: subsError } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, failures')
    .eq('user_id', notice.user_id);
  if (subsError) return new Response(subsError.message, { status: 500 });

  let sent = 0;
  for (const sub of subs ?? []) {
    if (!PUSH_HOST.test(sub.endpoint)) {
      await db.from('push_subscriptions').delete().eq('id', sub.id);
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        PAYLOAD,
        // A day: a notice about a session is stale after that, and the push
        // service should not deliver it to a phone switched on next week.
        { TTL: 86_400, urgency: 'normal' },
      );
      sent += 1;
      await db
        .from('push_subscriptions')
        .update({ last_sent_at: new Date().toISOString(), failures: 0 })
        .eq('id', sub.id);
    } catch (cause) {
      const status = (cause as { statusCode?: number }).statusCode;
      // 404 and 410: the browser unsubscribed or the subscription expired.
      if (status === 404 || status === 410 || sub.failures + 1 >= MAX_FAILURES) {
        await db.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        await db
          .from('push_subscriptions')
          .update({ failures: sub.failures + 1 })
          .eq('id', sub.id);
      }
    }
  }

  return new Response(JSON.stringify({ sent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
