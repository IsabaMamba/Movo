import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { fetchSessionLink, goingLine, sessionLinkUrl, toLinkPreview } from './sessionLinks';

describe('toLinkPreview', () => {
  it('reads an open session', () => {
    const p = toLinkPreview({
      state: 'open',
      activity_id: 'a1',
      title: 'Vuelta al Parque del Este',
      starts_at: '2026-11-07T13:00:00Z',
      joined_count: 1,
      max_participants: 10,
      invited_by: 'Andrea',
      venue: 'Parque del Este',
    });
    expect(p.state).toBe('open');
    expect(p.invitedBy).toBe('Andrea');
    expect(p.maxParticipants).toBe(10);
    expect(p.next).toBeNull();
  });

  it('reads the next date of a past one', () => {
    const p = toLinkPreview({
      state: 'past',
      next: { activity_id: 'a2', starts_at: '2026-11-14T13:00:00Z' },
    });
    expect(p.next).toEqual({ activityId: 'a2', startsAt: '2026-11-14T13:00:00Z' });
  });

  it('treats anything unknown as missing', () => {
    expect(toLinkPreview(null).state).toBe('missing');
    expect(toLinkPreview({ state: 'weird' }).state).toBe('missing');
  });
});

describe('fetchSessionLink', () => {
  it('returns the code', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: '7Q2K9M', error: null });
    expect(await fetchSessionLink({ rpc } as never, 'a1')).toBe('7Q2K9M');
    expect(rpc).toHaveBeenCalledWith('session_link', { p_activity_id: 'a1' });
  });
});

describe('the words', () => {
  it('builds the URL', () => {
    expect(sessionLinkUrl('7Q2K9M', 'https://movo.app/')).toBe('https://movo.app/s/7Q2K9M');
    expect(sessionLinkUrl('7Q2K9M', null)).toBe('/s/7Q2K9M');
  });

  it('counts, never names', () => {
    expect(goingLine({ joinedCount: 1, maxParticipants: 10 })).toBe('1 de 10 van');
    expect(goingLine({ joinedCount: 4, maxParticipants: null })).toBe('4 van');
  });
});
