import { describe, expect, it } from 'vitest';

import { SUSPENSION_LENGTHS } from '../../lib/suspensions';
import { consequenceItems, RULE_SECTIONS, RULES_VERSION, suspensionLengthsSentence } from './rules';

/**
 * The rules are what a moderation decision is measured against, so the one
 * thing they must not do is promise something the queue cannot do.
 */

describe('suspensionLengthsSentence', () => {
  it('lists exactly the lengths the queue offers', () => {
    expect(suspensionLengthsSentence()).toBe('7 días, 30 días o sin fecha de fin');
    for (const option of SUSPENSION_LENGTHS) {
      expect(suspensionLengthsSentence().toLowerCase()).toContain(option.label.toLowerCase());
    }
  });
});

describe('the rules', () => {
  it('carry a date version', () => {
    expect(RULES_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('say how long a suspension can last, from the same list', () => {
    const suspension = consequenceItems().find((item) => item.rule.includes('suspender'));
    expect(suspension?.detail).toContain(suspensionLengthsSentence());
  });

  it('have no duplicate headlines, which the screen uses as keys', () => {
    const headlines = [
      ...RULE_SECTIONS.flatMap((section) => section.items.map((item) => item.rule)),
      ...consequenceItems().map((item) => item.rule),
    ];
    expect(new Set(headlines).size).toBe(headlines.length);
  });
});
