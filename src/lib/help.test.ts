import { describe, expect, it } from 'vitest';

import { HELP_POPULAR, HELP_QUESTIONS, HELP_TOPICS } from '../content/help.es';
import { searchHelp } from './help';

describe('the help file', () => {
  it('has the 31 questions of Ayuda v1, each in a topic, with a stable unique id', () => {
    expect(HELP_QUESTIONS).toHaveLength(31);
    const ids = HELP_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of HELP_QUESTIONS) {
      expect(q.id).toMatch(/^[a-z0-9-]{2,60}$/u);
      expect(HELP_TOPICS.some((t) => t.id === q.topic)).toBe(true);
      expect(q.answer.length).toBeGreaterThan(0);
    }
    for (const id of HELP_POPULAR) expect(ids).toContain(id);
  });
});

describe('searchHelp', () => {
  it('folds accents and puts title matches first', () => {
    const results = searchHelp(HELP_QUESTIONS, 'contrasena');
    expect(results[0]?.id).toBe('contrasena');
    expect(searchHelp(HELP_QUESTIONS, 'pago').map((q) => q.topic)).toContain('pagos');
    expect(searchHelp(HELP_QUESTIONS, ' ')).toEqual([]);
    expect(searchHelp(HELP_QUESTIONS, 'zzzz')).toEqual([]);
  });
});
