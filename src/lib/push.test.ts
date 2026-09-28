import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPushState, keysOf, urlBase64ToUint8Array, vapidPublicKey } from './push';

/**
 * The browser half of push fails quietly when it fails: a wrong key encoding
 * is an opaque DOMException, and a half-registered device looks switched on
 * and receives nothing. These are the parts that can be checked off-browser.
 */

describe('urlBase64ToUint8Array', () => {
  it('decodes unpadded base64url, the shape VAPID keys come in', () => {
    // "hello?" in base64 is "aGVsbG8/" — the "/" becomes "_" in base64url.
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8_'))).toEqual([104, 101, 108, 108, 111, 63]);
  });

  it('restores the padding base64url drops', () => {
    // "hi" is "aGk=" in base64; base64url drops the "=".
    expect(Array.from(urlBase64ToUint8Array('aGk'))).toEqual([104, 105]);
  });

  it('turns "-" back into "+"', () => {
    // 0xfb 0xff is "+/8=" in base64 and "-_8" in base64url.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
  });

  it('gives 65 bytes for a real-length P-256 public key', () => {
    const key = 'B' + 'A'.repeat(86);
    expect(urlBase64ToUint8Array(key)).toHaveLength(65);
  });
});

describe('keysOf', () => {
  it('takes the endpoint and both keys', () => {
    expect(
      keysOf({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } }),
    ).toEqual({ endpoint: 'https://fcm.googleapis.com/x', p256dh: 'p', auth: 'a' });
  });

  it('refuses a subscription missing any of the three', () => {
    expect(keysOf({ keys: { p256dh: 'p', auth: 'a' } })).toBeNull();
    expect(keysOf({ endpoint: 'https://x', keys: { auth: 'a' } })).toBeNull();
    expect(keysOf({ endpoint: 'https://x' })).toBeNull();
  });
});

describe('the switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is hidden when the deployment has no VAPID key', async () => {
    vi.stubEnv('EXPO_PUBLIC_VAPID_PUBLIC_KEY', '');
    expect(vapidPublicKey()).toBeNull();
    await expect(getPushState()).resolves.toBe('unconfigured');
  });

  it('says unsupported where there is no Push API, as in this test runner', async () => {
    vi.stubEnv('EXPO_PUBLIC_VAPID_PUBLIC_KEY', 'BAAA');
    await expect(getPushState()).resolves.toBe('unsupported');
  });
});
