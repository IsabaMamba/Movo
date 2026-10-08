/**
 * Notices on this device, through Web Push (ADR 0007).
 *
 * Asked for only when the person taps the switch in /avisos — never on
 * opening the app, because a permission prompt with no context is one most
 * people refuse, and a refusal is permanent until they find the browser
 * setting. Off again from the same place, and on sign-out: a device should
 * not keep receiving somebody's notices after they leave it.
 *
 * Nothing here decides what a push says. The Edge Function sends a fixed
 * sentence; this module only registers the device.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

const SW_PATH = '/sw.js';

/**
 * Which text the person saw when they switched push on (0030): the
 * explanation in PushSwitch. Bump this when it changes in substance.
 */
export const PUSH_NOTICE_VERSION = '2026-10-08';

/** Set per deployment; absent means push is not configured and the switch hides. */
export function vapidPublicKey(): string | null {
  const key = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  return key && key.trim() ? key.trim() : null;
}

export type PushState =
  /** The deployment has no VAPID key: say nothing about push at all. */
  | 'unconfigured'
  /** This browser has no Push API (older Safari, an in-app browser, native). */
  | 'unsupported'
  /** The person blocked notifications for this site in the browser. */
  | 'denied'
  | 'off'
  | 'on';

function browserSupportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * VAPID keys travel as unpadded base64url; PushManager wants the raw bytes.
 * Exported for its test: getting this wrong fails subscribe() with an error
 * that names neither the key nor the encoding.
 */
export function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (vapidPublicKey() === null) return 'unconfigured';
  if (!browserSupportsPush()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return (await currentSubscription()) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The three strings register_push_subscription() takes, or null if incomplete. */
export function keysOf(json: PushSubscriptionJSON): SubscriptionKeys | null {
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

/** Must run from a tap: browsers only show the permission prompt for a gesture. */
export async function enablePush(db: SupabaseClient): Promise<PushState> {
  const key = vapidPublicKey();
  if (key === null) return 'unconfigured';
  if (!browserSupportsPush()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  await navigator.serviceWorker.register(SW_PATH);
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    }));

  const keys = keysOf(subscription.toJSON());
  if (keys === null) throw new Error('El navegador no devolvió una suscripción completa.');

  const { error } = await db.rpc('register_push_subscription', {
    p_endpoint: keys.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  if (error) {
    // Registered in the browser but not with Movo is the worst state: it
    // looks on and receives nothing. Undo it so the switch tells the truth.
    await subscription.unsubscribe().catch(() => undefined);
    throw toApiError(error);
  }
  return 'on';
}

/**
 * Turn this device off: forget it server-side, then in the browser. Never
 * throws — it runs on sign-out, where a failure must not keep somebody in.
 */
export async function disablePush(db: SupabaseClient): Promise<void> {
  if (!browserSupportsPush()) return;
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await db.rpc('unregister_push_subscription', { p_endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  } catch {
    // Best effort. The sender drops a subscription the push service reports
    // gone, and register_push_subscription() moves a device to whoever
    // registers it next.
  }
}
