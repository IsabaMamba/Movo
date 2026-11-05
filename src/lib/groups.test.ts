import { describe, expect, it } from 'vitest';

import {
  confirmsGroupName,
  groupAgenda,
  groupEditProblem,
  groupInitials,
  groupSports,
  roleWord,
  toggleSport,
  toHandover,
} from './groups';

const NOW = new Date('2026-11-02T16:00:00Z');

describe('groupAgenda', () => {
  it('finds each group’s next session and counts the coming week', () => {
    const agenda = groupAgenda(
      [
        { id: 'b', title: 'Fondo', starts_at: '2026-11-08T13:00:00Z', community_id: 'g1' },
        { id: 'a', title: '5K', starts_at: '2026-11-03T12:00:00Z', community_id: 'g1' },
        { id: 'c', title: 'Lejos', starts_at: '2026-11-20T12:00:00Z', community_id: 'g1' },
        { id: 'd', title: 'Pasada', starts_at: '2026-11-01T12:00:00Z', community_id: 'g2' },
      ],
      NOW,
    );
    expect(agenda.get('g1')).toEqual({
      next: { id: 'a', title: '5K', starts_at: '2026-11-03T12:00:00Z' },
      thisWeek: 2,
    });
    expect(agenda.has('g2')).toBe(false);
  });
});

describe('roleWord', () => {
  it('says «organizas» for whoever runs the group', () => {
    expect(roleWord('owner')).toBe('organizas');
    expect(roleWord('organizer')).toBe('organizas');
    expect(roleWord('member')).toBeNull();
    expect(roleWord(undefined)).toBeNull();
  });
});

describe('groupInitials', () => {
  it('takes the first and last real word', () => {
    expect(groupInitials('Corredores de Tibás')).toBe('CT');
    expect(groupInitials('Fútbol 5 La Sabana')).toBe('FS');
    expect(groupInitials('Mejengueros')).toBe('M');
  });
});

describe('group sports', () => {
  it('reads the list, or the single sport of an older row', () => {
    expect(
      groupSports({ category_id: 'running', category_ids: ['running', 'trail_running'] }),
    ).toEqual(['running', 'trail_running']);
    expect(groupSports({ category_id: 'football' })).toEqual(['football']);
    expect(groupSports({ category_id: null, category_ids: [] })).toEqual([]);
  });

  it('toggles a chip and stops at three', () => {
    expect(toggleSport([], 'yoga')).toEqual(['yoga']);
    expect(toggleSport(['yoga', 'surf'], 'yoga')).toEqual(['surf']);
    expect(toggleSport(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
  });
});

describe('groupEditProblem', () => {
  it('asks for a name and at most three sports', () => {
    expect(groupEditProblem({ name: ' A ', categoryIds: [] })).toMatch(/2 letras/u);
    expect(groupEditProblem({ name: 'Club', categoryIds: ['a', 'b', 'c', 'd'] })).toMatch(/3/u);
    expect(groupEditProblem({ name: 'Club', categoryIds: ['running'] })).toBeNull();
  });
});

describe('hand over and delete', () => {
  it('confirms the name in any case, never an empty one', () => {
    expect(confirmsGroupName(' corredores de tibás ', 'Corredores de Tibás')).toBe(true);
    expect(confirmsGroupName('Corredores', 'Corredores de Tibás')).toBe(false);
    expect(confirmsGroupName('', '')).toBe(false);
  });

  it('reads the pending offer, or nothing', () => {
    expect(
      toHandover({
        to_user: 'u2',
        to_name: 'Luis',
        from_name: 'Ana',
        expires_at: 'x',
        for_me: true,
      }),
    ).toEqual({ toUser: 'u2', toName: 'Luis', fromName: 'Ana', expiresAt: 'x', forMe: true });
    expect(toHandover(null)).toBeNull();
    expect(toHandover({ to_name: 'Luis' })).toBeNull();
  });
});
