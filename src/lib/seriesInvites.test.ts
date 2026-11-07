import { describe, expect, it, vi } from 'vitest';

import {
  candidateLine,
  explainInviteError,
  fetchInviteCandidates,
  invitedNotice,
  inviteToSeries,
} from './seriesInvites';

function fakeDb(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { db: { rpc } as never, rpc };
}

describe('fetchInviteCandidates', () => {
  it('maps the rows and names the nameless', async () => {
    const { db, rpc } = fakeDb({
      data: [
        { user_id: 'u1', display_name: 'Ana', dates: 2, invited: false },
        { user_id: 'u2', display_name: null, dates: 1, invited: true },
      ],
      error: null,
    });
    const rows = await fetchInviteCandidates(db, 's1');
    expect(rpc).toHaveBeenCalledWith('series_invite_candidates', { p_series_id: 's1' });
    expect(rows).toEqual([
      { userId: 'u1', name: 'Ana', dates: 2, invited: false },
      { userId: 'u2', name: 'Alguien', dates: 1, invited: true },
    ]);
  });
});

describe('inviteToSeries', () => {
  it('sends at most 50 ids and returns the count', async () => {
    const { db, rpc } = fakeDb({ data: 3, error: null });
    const ids = Array.from({ length: 60 }, (_, i) => `u${String(i)}`);
    expect(await inviteToSeries(db, 's1', ids)).toBe(3);
    const args = rpc.mock.calls[0]?.[1] as { p_user_ids: string[] };
    expect(args.p_user_ids).toHaveLength(50);
  });
});

describe('the words', () => {
  it('says how many dates, and whether invited', () => {
    expect(candidateLine({ dates: 1, invited: false })).toBe('Estuvo en 1 fecha');
    expect(candidateLine({ dates: 3, invited: true })).toBe(
      'Estuvo en 3 fechas · invitación enviada',
    );
  });

  it('counts the invited', () => {
    expect(invitedNotice(0)).toBe('No había nadie nuevo a quien invitar.');
    expect(invitedNotice(1)).toContain('1 persona');
    expect(invitedNotice(4)).toContain('4 personas');
  });

  it('explains a cancelled series', () => {
    expect(explainInviteError(new Error('series is not active'))).toBe(
      'Esta serie ya está cancelada.',
    );
  });
});
