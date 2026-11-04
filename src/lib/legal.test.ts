import { describe, expect, it } from 'vitest';

import { pendingDocuments, toLegalStatus } from './legal';

describe('toLegalStatus', () => {
  it('asks nothing before a version is published', () => {
    const status = toLegalStatus({
      terms: { current: null, accepted: null, needs_acceptance: false },
      privacy: { current: null, accepted: null, needs_acceptance: false },
    });
    expect(pendingDocuments(status)).toEqual([]);
  });

  it('asks for what changed and not for what was accepted', () => {
    const status = toLegalStatus({
      terms: {
        current: '2026-11-04',
        summary: 'Primera versión',
        published_at: '2026-11-04T18:00:00Z',
        accepted: null,
        needs_acceptance: true,
      },
      privacy: { current: '2026-11-04', accepted: '2026-11-04', needs_acceptance: false },
    });
    expect(pendingDocuments(status)).toEqual(['terms']);
    expect(status.terms.summary).toBe('Primera versión');
    expect(status.privacy.accepted).toBe('2026-11-04');
  });

  it('never asks to accept a version that does not exist, whatever the flag says', () => {
    expect(pendingDocuments(toLegalStatus({ terms: { needs_acceptance: true } }))).toEqual([]);
    expect(pendingDocuments(toLegalStatus(null))).toEqual([]);
  });
});
