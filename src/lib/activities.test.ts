import { describe, expect, it } from 'vitest';

import {
  enumLabel,
  fixedRules,
  formatSessionTime,
  validateAttributes,
  withFixedAttributes,
} from './activities';
import type { JsonSchemaObject } from '../types/database';

/**
 * The session time is the one piece of text somebody acts on at a gate at
 * 5 a.m. It must read the same on every screen: 24-hour, Costa Rica time.
 */
describe('formatSessionTime', () => {
  it('uses the 24-hour clock', () => {
    // 2026-09-30 00:00 UTC is Tuesday 29 September, 18:00 in Costa Rica.
    const label = formatSessionTime('2026-09-30T00:00:00.000Z');
    expect(label).toContain('18:00');
    expect(label).not.toMatch(/[ap]\.\s?m\./);
  });

  it('pads the early hours, so 5 a.m. is 05:00', () => {
    // 11:30 UTC is 05:30 in Costa Rica.
    expect(formatSessionTime('2026-09-29T11:30:00.000Z')).toContain('05:30');
  });

  it('says midnight as 00, never 24', () => {
    // 06:00 UTC is 00:00 in Costa Rica.
    expect(formatSessionTime('2026-09-29T06:00:00.000Z')).toContain('00:00');
  });

  it('keeps the day in Costa Rica time whatever the device says', () => {
    // As an instant this is the 30th; in Costa Rica it is still the 29th.
    expect(formatSessionTime('2026-09-30T00:00:00.000Z')).toMatch(/29/);
  });
});

/**
 * A kayak session's life jacket is not the organizer's to leave out (0036).
 * The database writes it anyway; these keep the client from showing a form
 * that disagrees with what will be stored.
 */
describe('fixed rules and option labels', () => {
  const kayak: JsonSchemaObject = {
    type: 'object',
    additionalProperties: false,
    required: ['water', 'life_jackets'],
    properties: {
      water: { type: 'string', enum: ['lago', 'rio'], enumNames: ['Lago', 'Río'] },
      life_jackets: { type: 'boolean', const: true, readOnly: true, title: 'Chaleco' },
    },
  };

  it('finds the fixed rules and writes them in', () => {
    expect(fixedRules(kayak).map(([key]) => key)).toEqual(['life_jackets']);
    expect(withFixedAttributes(kayak, { water: 'rio', life_jackets: false })).toEqual({
      water: 'rio',
      life_jackets: true,
    });
  });

  it('passes once the rules are in, and refuses a rule turned off', () => {
    expect(validateAttributes(kayak, withFixedAttributes(kayak, { water: 'lago' }))).toEqual([]);
    expect(validateAttributes(kayak, { water: 'lago', life_jackets: false })).toContainEqual({
      field: 'life_jackets',
      message: 'Es una regla fija de este deporte',
    });
  });

  it('reads an option by its name, and falls back to the value', () => {
    expect(enumLabel(kayak.properties.water, 'rio')).toBe('Río');
    expect(enumLabel(kayak.properties.water, 'mar')).toBe('mar');
    expect(enumLabel(undefined, 'x')).toBe('x');
  });
});
