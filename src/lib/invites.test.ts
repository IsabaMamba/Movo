import { describe, expect, it } from 'vitest';

import { inviteStatus, inviteUrl, toInvite, toPreview } from './invites';

describe('invites', () => {
  it('builds the link from the origin, or a path without one', () => {
    expect(inviteUrl('K7Q2M9XP', 'https://movo.app/')).toBe('https://movo.app/g/K7Q2M9XP');
    expect(inviteUrl('K7Q2M9XP', null)).toBe('/g/K7Q2M9XP');
  });

  it('says until when and how many used it', () => {
    const invite = toInvite({
      code: 'K7Q2M9XP',
      expires_at: '2026-11-09T18:00:00Z',
      max_uses: 10,
      uses: 3,
    });
    expect(invite).not.toBeNull();
    expect(inviteStatus(invite!)).toBe('Vence el lun 9 nov · la usaron 3 de 10');
    expect(inviteStatus({ ...invite!, uses: 1 })).toMatch(/la usó 1 de 10/u);
  });

  it('reads a preview, and nothing for a bad one', () => {
    expect(
      toPreview({ community_id: 'g', name: 'Club', category_ids: ['running', 3] })?.categoryIds,
    ).toEqual(['running']);
    expect(toPreview(null)).toBeNull();
    expect(toInvite({ code: 'X' })).toBeNull();
  });
});
