import { describe, expect, it, vi } from 'vitest';

import {
  candidateLine,
  explainInviteError,
  fetchInviteCandidates,
  fetchSeriesPeople,
  invitable,
  invitedNotice,
  personLine,
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

describe('«Quiénes van» (0056)', () => {
  const base = {
    userId: 'u1',
    name: 'Ana',
    whole: true,
    arrived: 5,
    pastDates: 6,
    next: 'joined' as const,
    invited: false,
  };

  it('says how they joined, how often they came, and the next date', () => {
    expect(personLine(base)).toBe('Toda la serie · llegó 5 de 6 · va a la próxima');
    expect(personLine({ ...base, whole: false, arrived: 1, next: null })).toBe(
      'Fecha por fecha · llegó 1 de 6 · no va a la próxima',
    );
    expect(personLine({ ...base, pastDates: 0, next: 'waitlisted' })).toBe(
      'Toda la serie · en espera',
    );
  });

  it('invites only who goes date by date and was not invited', () => {
    const people = [
      base,
      { ...base, userId: 'u2', whole: false },
      { ...base, userId: 'u3', whole: false, invited: true },
    ];
    expect(invitable(people).map((p) => p.userId)).toEqual(['u2']);
  });

  it('reads the rows', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: 'u1',
          display_name: 'Ana',
          whole: false,
          arrived: 1,
          past_dates: 2,
          next_status: 'joined',
          invited: false,
        },
      ],
      error: null,
    });
    const rows = await fetchSeriesPeople({ rpc } as never, 's1');
    expect(rpc).toHaveBeenCalledWith('series_people', { p_series_id: 's1' });
    expect(rows[0]).toMatchObject({ name: 'Ana', pastDates: 2, next: 'joined' });
  });
});
