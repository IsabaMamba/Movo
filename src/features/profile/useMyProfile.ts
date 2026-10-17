import { useCallback, useEffect, useState } from 'react';

import { fetchCategories } from '../../lib/activities';
import { fetchMyProfile, type MyProfile } from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import type { Category } from '../../types/database';

/** The caller's profile and the category list, for the three Perfil screens. */
export function useMyProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<MyProfile | null | undefined>(undefined);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    const [mine, cats] = await Promise.all([
      fetchMyProfile(supabase),
      fetchCategories(supabase).catch((): Category[] => []),
    ]);
    setProfile(mine);
    setCategories(cats);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    reload().catch((cause: unknown) => {
      if (cancelled) return;
      setProfile(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar tu perfil.');
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const sportNames = (profile?.interests ?? []).map(
    (id) => categories.find((c) => c.id === id)?.name_es ?? id,
  );
  const zone =
    profile?.district_name && profile.canton_name
      ? `${profile.district_name} · ${profile.canton_name}`
      : (profile?.district_name ?? null);

  return { profile, categories, sportNames, zone, error, reload };
}
