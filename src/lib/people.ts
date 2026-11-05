/**
 * Somebody else's profile (Perfiles v1 · 1), as the reader may see it.
 *
 * Every read goes through the policies: profiles_read (0025) shows a
 * profile only to whoever has a reason — a public session they organize, a
 * roster or a group in common — and user_interests_read_visible (0034) the
 * sports the same way. So «not found» covers both «does not exist» and «you
 * have no reason to see it», and the screen says the same for both.
 *
 * What is shown is the public part only: name, sports with level, what they
 * wrote, since when, the public sessions they organize, the public groups
 * they created. Never zone, gender, age, history or email.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';
import type { SportLevel } from './profile';

export interface Person {
  id: string;
  displayName: string;
  bio: string | null;
  createdAt: string;
  sports: { category: string; level: SportLevel }[];
  organizes: {
    id: string;
    title: string;
    startsAt: string;
    seriesId: string | null;
    categoryId: string;
  }[];
  groups: { id: string; slug: string; name: string }[];
}

export async function fetchPerson(db: SupabaseClient, id: string): Promise<Person | null> {
  const profile = await db
    .from('profiles')
    .select('id, display_name, bio, created_at')
    .eq('id', id)
    .maybeSingle();
  if (profile.error) throw toApiError(profile.error);
  if (!profile.data) return null;
  const p = profile.data as {
    id: string;
    display_name: string;
    bio: string | null;
    created_at: string;
  };

  const [sports, sessions, groups] = await Promise.all([
    db.from('user_interests').select('category_id, skill').eq('user_id', id),
    db
      .from('activities')
      .select('id, title, starts_at, series_id, category_id')
      .eq('organizer_id', id)
      .eq('visibility', 'public')
      .in('status', ['published', 'full'])
      .gt('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(6),
    db
      .from('communities')
      .select('id, slug, name')
      .eq('created_by', id)
      .eq('is_public', true)
      .order('name')
      .limit(6),
  ]);

  return {
    id: p.id,
    displayName: p.display_name,
    bio: p.bio,
    createdAt: p.created_at,
    sports: ((sports.data ?? []) as { category_id: string; skill: string }[])
      .filter((s) => s.skill !== 'any')
      .map((s) => ({ category: s.category_id, level: s.skill as SportLevel })),
    organizes: (
      (sessions.data ?? []) as {
        id: string;
        title: string;
        starts_at: string;
        series_id: string | null;
        category_id: string;
      }[]
    ).map((a) => ({
      id: a.id,
      title: a.title,
      startsAt: a.starts_at,
      seriesId: a.series_id,
      categoryId: a.category_id,
    })),
    groups: (groups.data ?? []) as { id: string; slug: string; name: string }[],
  };
}

/** «En Movo desde septiembre de 2026»: the month, never the day. */
export function memberSince(iso: string): string {
  const month = new Intl.DateTimeFormat('es-CR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Costa_Rica',
  }).format(new Date(iso));
  return `En Movo desde ${month}`;
}
