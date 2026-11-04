import { describe, expect, it } from 'vitest';

import {
  lastLine,
  looksLikePhoneNumber,
  toChatMessage,
  toChatPage,
  toChatSummaries,
  totalUnread,
  whyNotText,
} from './chat';

describe('looksLikePhoneNumber', () => {
  it.each([
    'Si se atrasan escríbanme al 8812-3456',
    'mi número 88123456',
    '+506 8812 3456',
    '506-8812-3456',
    'fijo: 2234.5678',
    '(506) 7012 3456',
  ])('catches «%s»', (body) => {
    expect(looksLikePhoneNumber(body)).toBe(true);
  });

  it.each([
    'Nos vemos a las 18:30 frente al lago',
    'Son ₡1.200 por persona',
    'Referencia SINPE 202611041234567',
    'Corrimos 12 km a 6:30 el km',
    '1234-5678',
    'Hola',
  ])('leaves «%s» alone', (body) => {
    expect(looksLikePhoneNumber(body)).toBe(false);
  });
});

describe('toChatMessage', () => {
  it('reads a message with its author and what it answers', () => {
    expect(
      toChatMessage({
        id: 'm1',
        created_at: '2026-11-04T22:00:00Z',
        removed: false,
        body: 'Hola',
        is_me: false,
        is_organizer: true,
        pinned_at: '2026-11-04T22:05:00Z',
        author: { id: 'u1', display_name: 'Luis', avatar_url: null },
        reply_to: { id: 'm0', excerpt: '¿Dónde?', author_name: 'Andrea' },
      }),
    ).toEqual({
      id: 'm1',
      createdAt: '2026-11-04T22:00:00Z',
      removed: false,
      body: 'Hola',
      isMe: false,
      isOrganizer: true,
      pinned: true,
      author: { id: 'u1', displayName: 'Luis', avatarUrl: null },
      replyTo: { id: 'm0', excerpt: '¿Dónde?', authorName: 'Andrea' },
    });
  });

  it('keeps a removed message as a marker with nothing in it', () => {
    expect(toChatMessage({ id: 'm2', created_at: 'x', removed: true, body: 'secreto' })).toEqual({
      id: 'm2',
      createdAt: 'x',
      removed: true,
    });
  });

  it('drops what it cannot place', () => {
    expect(toChatMessage({ body: 'sin id' })).toBeNull();
    expect(toChatMessage({ id: 'm3', created_at: 'x' })).toBeNull();
    expect(toChatMessage(null)).toBeNull();
  });
});

describe('toChatPage', () => {
  it('defaults to a closed composer and «replies» when the payload says nothing', () => {
    const page = toChatPage({});
    expect(page.canWrite).toBe(false);
    expect(page.notify).toBe('replies');
    expect(page.messages).toEqual([]);
    expect(page.whyNot).toBeNull();
  });

  it('reads why the composer is closed', () => {
    expect(toChatPage({ can_write: false, why_not: 'organizers_only' }).whyNot).toBe(
      'organizers_only',
    );
    expect(toChatPage({ why_not: 'nonsense' }).whyNot).toBeNull();
  });
});

describe('toChatSummaries', () => {
  const rows = [
    {
      kind: 'session',
      activity_id: 'a1',
      community_id: null,
      title: 'Trote',
      unread: 3,
      notify: 'replies',
      last: { excerpt: 'Nos vemos', author_name: 'Luis', is_me: false, created_at: 't' },
    },
    {
      kind: 'group',
      activity_id: null,
      community_id: 'g1',
      title: 'Grupo',
      unread: 5,
      notify: 'muted',
    },
    { kind: 'group', title: 'Sin id' },
  ];

  it('builds the scope from whichever id is there and drops rows with neither', () => {
    const chats = toChatSummaries(rows);
    expect(chats.map((c) => c.scope)).toEqual([{ activityId: 'a1' }, { communityId: 'g1' }]);
    expect(chats[1]?.last).toBeNull();
  });

  it('does not count silenced chats on the icon', () => {
    expect(totalUnread(toChatSummaries(rows))).toBe(3);
  });

  it('writes the second line of «Tus chats»', () => {
    const [session, group] = toChatSummaries(rows);
    expect(lastLine(session?.last ?? null)).toBe('Luis: Nos vemos');
    expect(lastLine(group?.last ?? null)).toBe('Todavía no hay mensajes.');
    expect(
      lastLine({ excerpt: 'Ahí estaré', authorName: 'Andrea', isMe: true, createdAt: 't' }),
    ).toBe('Tú: Ahí estaré');
  });
});

describe('whyNotText', () => {
  it('has a sentence for every reason', () => {
    expect(whyNotText('closed')).toMatch(/24 horas/);
    expect(whyNotText('organizers_only')).toMatch(/quienes organizan/);
    expect(whyNotText('suspended')).toMatch(/suspendida/);
  });
});
