/**
 * Domains a person said not to be asked about again before leaving Movo
 * (Organizar v2, phone 4: «No volver a preguntar para strava.com»).
 *
 * A per-device convenience, kept in AsyncStorage (localStorage on the web).
 * Nothing about it reaches the server: which apps somebody opens is not
 * Movo's to know. Every read and write is allowed to fail — then the person
 * is simply asked again, which is the safe direction.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'movo.trustedLinkDomains';
const MAX = 50;

export async function loadTrustedDomains(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((d) => typeof d === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function trustDomain(domain: string): Promise<Set<string>> {
  const current = await loadTrustedDomains();
  current.add(domain);
  const kept = [...current].slice(-MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Asked again next time; nothing else depends on it.
  }
  return new Set(kept);
}
