import { describe, expect, it } from 'vitest';

import { NAME_MAX, NAME_MIN, nameProblem } from './account';

/**
 * The name is what an organizer reads on the roster and what a stranger sees
 * before meeting you. The bounds are the table's check constraint: a form that
 * lets through what the database refuses fails in the least helpful place.
 */
describe('nameProblem', () => {
  it('accepts an ordinary name', () => {
    expect(nameProblem('Vanesa')).toBeNull();
  });

  it('refuses a name shorter than the constraint, after trimming', () => {
    expect(nameProblem('  A  ')).toBe(`El nombre tiene que tener al menos ${NAME_MIN} letras.`);
  });

  it('refuses a name longer than the constraint', () => {
    expect(nameProblem('x'.repeat(NAME_MAX + 1))).toBe(
      `El nombre puede tener hasta ${NAME_MAX} caracteres.`,
    );
  });

  it('accepts exactly the bounds', () => {
    expect(nameProblem('Al')).toBeNull();
    expect(nameProblem('x'.repeat(NAME_MAX))).toBeNull();
  });
});
