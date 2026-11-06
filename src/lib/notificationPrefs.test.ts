import { describe, expect, it } from 'vitest';

import { DEFAULT_PREFS, PREF_ROWS, prefsSummary } from './notificationPrefs';

describe('notification preferences', () => {
  it('starts with everything on except the daily joins, as the board shows', () => {
    expect(DEFAULT_PREFS).toEqual({ reminders: true, invitations: true, chat: true, joins: false });
    expect(PREF_ROWS.map((r) => r.key)).toEqual(['reminders', 'invitations', 'chat', 'joins']);
  });

  it('summarises what is off, ignoring the joins that start off', () => {
    expect(prefsSummary(DEFAULT_PREFS)).toBe('Todo encendido');
    expect(prefsSummary({ ...DEFAULT_PREFS, chat: false })).toBe('Chat apagado');
    expect(prefsSummary({ ...DEFAULT_PREFS, chat: false, reminders: false })).toBe('2 apagados');
  });
});
