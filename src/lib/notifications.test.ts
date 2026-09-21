import { describe, expect, it } from 'vitest';

import { toInboxItem, unreadA11yLabel } from './notifications';
import type { Notification } from '../types/database';

/**
 * The inbox is the only place the app tells somebody that a plan they made has
 * changed — a spot opened, or the session is off. Until it existed, cancelling
 * meant the organiser messaging people by hand, so these sentences are the
 * delivery mechanism for a decision somebody else already took. Getting the
 * copy wrong is not a polish issue: "se canceló" with the wrong title sends a
 * person to the wrong park, and a row that renders blank means they never find
 * out at all.
 *
 * The payload is jsonb written by a database function this client does not run,
 * so every key is a maybe, and every one of these tests is really about what
 * happens when a key is missing.
 */

function row(over: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    user_id: 'u1',
    type: 'waitlist_promoted',
    payload: {},
    read_at: null,
    created_at: '2026-09-15T18:00:00.000Z',
    ...over,
  };
}

describe('toInboxItem', () => {
  describe('the fields every item carries', () => {
    it('passes the id and the instant through untouched', () => {
      // The screen sorts on `createdAt` and marks read by `id`; a reformatted
      // instant here would reorder the list against the server's own ordering.
      const item = toInboxItem(row({ id: 'abc', created_at: '2026-09-15T18:00:00.000Z' }));
      expect(item.id).toBe('abc');
      expect(item.createdAt).toBe('2026-09-15T18:00:00.000Z');
    });

    it('reads unread as the absence of a read timestamp', () => {
      expect(toInboxItem(row({ read_at: null })).read).toBe(false);
      expect(toInboxItem(row({ read_at: '2026-09-15T19:00:00.000Z' })).read).toBe(true);
    });
  });

  describe('a spot opened up', () => {
    it('names the session and says the person is in', () => {
      const item = toInboxItem(
        row({
          type: 'waitlist_promoted',
          payload: { title: 'Fútbol en Sabana', activity_id: 'a1' },
        }),
      );
      expect(item.text).toBe('Se liberó un lugar: ya vas a Fútbol en Sabana.');
    });

    it('opens the session, because the next thing to do is check the time', () => {
      const item = toInboxItem(
        row({
          type: 'waitlist_promoted',
          payload: { title: 'Fútbol en Sabana', activity_id: 'a1' },
        }),
      );
      expect(item.activityId).toBe('a1');
    });

    it('still forms a sentence when the payload has no title', () => {
      // Both RPCs write the title, so this should never show. It exists so that
      // the day one of them stops, the row says "ya vas a la sesión" and not
      // "ya vas a undefined".
      const item = toInboxItem(row({ type: 'waitlist_promoted', payload: { activity_id: 'a1' } }));
      expect(item.text).toBe('Se liberó un lugar: ya vas a la sesión.');
      expect(item.text).not.toContain('undefined');
    });
  });

  describe('a session was cancelled', () => {
    it('quotes the reason the organiser wrote', () => {
      const item = toInboxItem(
        row({
          type: 'activity_cancelled',
          payload: { title: 'Cerro Chirripó', activity_id: 'a2', reason: 'Lluvia fuerte' },
        }),
      );
      expect(item.text).toBe(
        'Cerro Chirripó se canceló. Quien organiza escribió: «Lluvia fuerte».',
      );
    });

    it('says plainly that no reason was given rather than quoting nothing', () => {
      // `reason` is nullable and cancelling without one is allowed. An empty
      // «» would read as the organiser having typed something unprintable.
      const item = toInboxItem(
        row({
          type: 'activity_cancelled',
          payload: { title: 'Cerro Chirripó', activity_id: 'a2' },
        }),
      );
      expect(item.text).toBe('Cerro Chirripó se canceló. Sin motivo escrito.');
    });

    it('treats a reason of only whitespace as no reason', () => {
      // `reason` comes from a free-text field somebody typed into, and three
      // spaces inside quotation marks is worse than admitting there is nothing.
      const item = toInboxItem(
        row({
          type: 'activity_cancelled',
          payload: { title: 'Cerro Chirripó', activity_id: 'a2', reason: '   ' },
        }),
      );
      expect(item.text).toBe('Cerro Chirripó se canceló. Sin motivo escrito.');
    });

    it('trims a reason before quoting it', () => {
      const item = toInboxItem(
        row({
          type: 'activity_cancelled',
          payload: { title: 'Cerro Chirripó', activity_id: 'a2', reason: '  Lluvia fuerte  ' },
        }),
      );
      expect(item.text).toContain('«Lluvia fuerte»');
    });

    it('stays openable, because the roster and the reason live on the session', () => {
      const item = toInboxItem(
        row({
          type: 'activity_cancelled',
          payload: { title: 'Cerro Chirripó', activity_id: 'a2' },
        }),
      );
      expect(item.activityId).toBe('a2');
    });
  });

  describe('the Movo team cancelled a session', () => {
    it('tells the roster who cancelled, and nothing about why', () => {
      // In a session of four, any hint of a report names the reporter.
      const item = toInboxItem(
        row({
          type: 'activity_cancelled',
          payload: { title: 'Mejenga', activity_id: 'a5', by: 'movo', reason: 'no debería estar' },
        }),
      );
      expect(item.text).toBe('El equipo de Movo canceló Mejenga.');
      expect(item.text).not.toContain('no debería estar');
      expect(item.activityId).toBe('a5');
    });

    it('treats any other `by` as the organiser cancelling', () => {
      const item = toInboxItem(
        row({ type: 'activity_cancelled', payload: { title: 'Mejenga', by: 'alguien' } }),
      );
      expect(item.text).toBe('Mejenga se canceló. Sin motivo escrito.');
    });

    it('tells the organiser it broke the rules, without the report', () => {
      const item = toInboxItem(
        row({
          type: 'activity_cancelled_by_movo',
          payload: { title: 'Mejenga', activity_id: 'a5' },
        }),
      );
      expect(item.text).toBe(
        'El equipo de Movo canceló Mejenga por no cumplir las normas de la comunidad.',
      );
      expect(item.text).not.toMatch(/report/i);
      expect(item.activityId).toBe('a5');
    });
  });

  describe('a report was resolved', () => {
    it('confirms it was read and says nothing about the outcome', () => {
      // What was decided about another person is not the reporter's to receive.
      const item = toInboxItem(row({ type: 'report_resolved', payload: { report_id: 'r1' } }));
      expect(item.text).toBe('Revisamos tu reporte. Gracias por avisar.');
    });

    it('leads nowhere, because there is nowhere to send them', () => {
      const item = toInboxItem(
        row({ type: 'report_resolved', payload: { activity_id: 'a3', title: 'Fútbol en Sabana' } }),
      );
      // Even with an activity in the payload: opening the reported session is
      // not the response to "we reviewed your report".
      expect(item.activityId).toBeNull();
    });
  });

  /**
   * A build older than the server is the normal state of a mobile app — people
   * do not update. The unread badge is a head count over every unread row, so
   * an unrecognised type that rendered as nothing would leave a badge saying 2
   * above a list showing one item, which is the sort of thing that makes people
   * stop trusting the badge entirely.
   */
  describe('a type this build does not know', () => {
    it('says something arrived and what to do about it', () => {
      const item = toInboxItem(row({ type: 'friend_request', payload: { activity_id: 'a4' } }));
      expect(item.text).toBe(
        'Te llegó un aviso que esta versión de Movo todavía no sabe mostrar. Actualiza la app.',
      );
    });

    it('never puts the raw payload on screen', () => {
      const item = toInboxItem(
        row({ type: 'friend_request', payload: { actor_id: 'u9', debug: 'internal' } }),
      );
      expect(item.text).not.toContain('friend_request');
      expect(item.text).not.toContain('u9');
      expect(item.text).not.toContain('internal');
    });

    it('leads nowhere, because the key that would carry a destination is part of what it cannot read', () => {
      const item = toInboxItem(row({ type: 'friend_request', payload: { activity_id: 'a4' } }));
      expect(item.activityId).toBeNull();
    });

    it('still counts as a row, with an id and a timestamp', () => {
      const item = toInboxItem(row({ type: 'friend_request', id: 'n9', read_at: null }));
      expect(item.id).toBe('n9');
      expect(item.read).toBe(false);
    });
  });

  /**
   * jsonb is not a schema. These are the shapes a hand-written row, a botched
   * migration or an older function can produce, and none of them may throw —
   * a throw inside the list renderer takes out the whole inbox, including the
   * cancellation notice the person actually needed to see.
   */
  describe('payloads that are not what the type says', () => {
    it('survives a payload that is missing entirely', () => {
      const missing = { ...row({ type: 'activity_cancelled' }), payload: undefined };
      const item = toInboxItem(missing as unknown as Notification);
      expect(item.text).toBe('la sesión se canceló. Sin motivo escrito.');
    });

    it('survives a null payload', () => {
      const nulled = { ...row(), payload: null };
      expect(() => toInboxItem(nulled as unknown as Notification)).not.toThrow();
    });

    it('ignores a title that is not a string', () => {
      const item = toInboxItem(row({ type: 'waitlist_promoted', payload: { title: 42 } }));
      expect(item.text).toBe('Se liberó un lugar: ya vas a la sesión.');
    });

    it('ignores an activity_id that is not a string, rather than routing to it', () => {
      // A route built from an object gives "/sesion/[object Object]", which is a
      // dead end the person cannot get back from.
      const item = toInboxItem(
        row({ type: 'waitlist_promoted', payload: { activity_id: { id: 'a1' } } }),
      );
      expect(item.activityId).toBeNull();
    });

    it('ignores an empty-string title and activity_id', () => {
      const item = toInboxItem(
        row({ type: 'waitlist_promoted', payload: { title: '', activity_id: '' } }),
      );
      expect(item.text).toBe('Se liberó un lugar: ya vas a la sesión.');
      expect(item.activityId).toBeNull();
    });
  });
});

describe('unreadA11yLabel', () => {
  /**
   * The badge itself is hidden from assistive technology, so this string is the
   * only thing a screen-reader user hears about the inbox. Without it the tab
   * reads as "Avisos" then, unrelated, "2" — a number with no noun attached.
   */
  it('says there is nothing when there is nothing', () => {
    expect(unreadA11yLabel(0)).toBe('Avisos. No tienes avisos sin leer.');
  });

  it('uses the singular for one', () => {
    expect(unreadA11yLabel(1)).toBe('Avisos. 1 aviso sin leer.');
  });

  it('uses the plural for more than one', () => {
    expect(unreadA11yLabel(2)).toBe('Avisos. 2 avisos sin leer.');
    expect(unreadA11yLabel(17)).toBe('Avisos. 17 avisos sin leer.');
  });

  it('treats a negative count as nothing rather than announcing it', () => {
    // The count comes from a head query that can return null and is coalesced
    // to 0; a negative would only arrive from arithmetic, and "-1 avisos sin
    // leer" is not a sentence.
    expect(unreadA11yLabel(-1)).toBe('Avisos. No tienes avisos sin leer.');
  });

  it('always names the destination first, so the label works as a tab name', () => {
    for (const n of [0, 1, 5]) {
      expect(unreadA11yLabel(n).startsWith('Avisos.')).toBe(true);
    }
  });
});
