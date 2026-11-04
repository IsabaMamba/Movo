/**
 * Terms and privacy: which version is in force, and whether the person still
 * has to accept it (0044; Legal v1 · 1 and · 6).
 *
 * Acceptance is a consent like the rules: `recordConsent(db, 'terms', version,
 * true)` writes the version shown and the database stamps the time. Until the
 * team publishes the first version, `needsAcceptance` is false for both
 * documents and the app asks nobody for anything — the legal text is not
 * written yet, and asking people to accept a placeholder is the one thing
 * worse than not asking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { recordConsent } from './consents';
import { ApiError, toApiError } from './errors';

export type LegalDocument = 'terms' | 'privacy';

export interface LegalStatus {
  /** The version in force, or null before the first is published. */
  current: string | null;
  /** «Qué cambió», for the screen that asks to accept. */
  summary: string | null;
  publishedAt: string | null;
  /** The latest version this person accepted, if any. */
  accepted: string | null;
  needsAcceptance: boolean;
}

const NONE: LegalStatus = {
  current: null,
  summary: null,
  publishedAt: null,
  accepted: null,
  needsAcceptance: false,
};

export const LEGAL_TITLE: Record<LegalDocument, string> = {
  terms: 'Términos de uso',
  privacy: 'Aviso de privacidad',
};

export function toLegalStatus(raw: unknown): Record<LegalDocument, LegalStatus> {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const one = (value: unknown): LegalStatus => {
    if (typeof value !== 'object' || value === null) return NONE;
    const v = value as Record<string, unknown>;
    const str = (x: unknown) => (typeof x === 'string' ? x : null);
    return {
      current: str(v.current),
      summary: str(v.summary),
      publishedAt: str(v.published_at),
      accepted: str(v.accepted),
      needsAcceptance: v.needs_acceptance === true && str(v.current) !== null,
    };
  };
  return { terms: one(r.terms), privacy: one(r.privacy) };
}

export async function fetchLegalStatus(
  db: SupabaseClient,
): Promise<Record<LegalDocument, LegalStatus>> {
  const { data, error } = await db.rpc('my_legal_status');
  if (error) throw toApiError(error);
  return toLegalStatus(data);
}

/** The documents the «Cambiaron» screen has to ask about, terms first. */
export function pendingDocuments(status: Record<LegalDocument, LegalStatus>): LegalDocument[] {
  return (['terms', 'privacy'] as const).filter((doc) => status[doc].needsAcceptance);
}

/**
 * Accept the version shown. Unlike the other consents this one has to land:
 * the screen stays until it does, so a failure is reported, not swallowed.
 */
export async function acceptLegal(
  db: SupabaseClient,
  document: LegalDocument,
  version: string,
): Promise<void> {
  if (!(await recordConsent(db, document, version, true))) {
    throw new ApiError('unknown', 'No pudimos guardar que aceptaste. Intenta de nuevo.');
  }
}

/** Staff only. Returns how many accounts were told. */
export async function publishLegalVersion(
  db: SupabaseClient,
  document: LegalDocument,
  version: string,
  summary: string,
): Promise<number> {
  const { data, error } = await db.rpc('publish_legal_version', {
    p_document: document,
    p_version: version.trim(),
    p_summary: summary.trim(),
  });
  if (error) throw toApiError(error);
  return (data as number) ?? 0;
}
