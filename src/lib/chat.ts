/**
 * The chat inside Movo, from the client's side of 0040.
 *
 * One chat per session and one per group, and nothing else: there are no
 * private messages, by decision (Chat v1). Every write is an RPC, because the
 * rules that matter are not ones a policy can state — a session chat closes 24
 * hours after the session ends, a group can be set so only its organizers
 * write, a removed message tells its author the rule and never who. Reads are
 * RPCs too, `chat_messages()` and `my_chats()`, because both have to drop
 * people blocked in either direction and suspended authors, and the feed has
 * to show a marker where an organizer removed something.
 *
 * Realtime is only a doorbell. `subscribeToChat` says «something changed in
 * this chat» and the screen asks `fetchChat` again; the row Realtime delivers
 * is never rendered, so nothing it carries can skip the filtering above.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

// ------------------------------------------------------------------ scope

/** Which chat: a session's or a group's. Exactly one. */
export type ChatScope = { activityId: string } | { communityId: string };

function scopeParams(scope: ChatScope): {
  p_activity_id: string | null;
  p_community_id: string | null;
} {
  return 'activityId' in scope
    ? { p_activity_id: scope.activityId, p_community_id: null }
    : { p_activity_id: null, p_community_id: scope.communityId };
}

// ------------------------------------------------------------------ shapes

export type ChatNotify = 'all' | 'replies' | 'muted';
export type ChatMode = 'everyone' | 'organizers';
/** Why the composer is closed, when it is. */
export type ChatWhyNot = 'closed' | 'organizers_only' | 'suspended';

export interface ChatAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export type ChatMessage =
  | {
      id: string;
      createdAt: string;
      removed: false;
      body: string;
      isMe: boolean;
      isOrganizer: boolean;
      pinned: boolean;
      /** Null when the author's account no longer exists. */
      author: ChatAuthor | null;
      replyTo: { id: string; excerpt: string; authorName: string | null } | null;
    }
  /** «Mensaje quitado por quien organiza»: where it was, and nothing else. */
  | { id: string; createdAt: string; removed: true };

export interface ChatPage {
  title: string;
  /** ISO instant a session chat stops taking messages; null for a group. */
  closesAt: string | null;
  canWrite: boolean;
  whyNot: ChatWhyNot | null;
  isOrganizer: boolean;
  notify: ChatNotify;
  /** Newest first, as the RPC returns them. */
  messages: ChatMessage[];
  /** Oldest pin first; at most three. */
  pinned: ChatMessage[];
}

export interface ChatSummary {
  kind: 'session' | 'group';
  scope: ChatScope;
  title: string;
  categoryId: string | null;
  startsAt: string | null;
  closed: boolean;
  notify: ChatNotify;
  last: { excerpt: string; authorName: string | null; isMe: boolean; createdAt: string } | null;
  unread: number;
}

// ------------------------------------------------------------------ writes

/** Send a message. Returns its id. */
export async function sendMessage(
  db: SupabaseClient,
  scope: ChatScope,
  body: string,
  replyTo?: string,
): Promise<string> {
  const { data, error } = await db.rpc('send_message', {
    ...scopeParams(scope),
    p_body: body,
    p_reply_to: replyTo ?? null,
  });
  if (error) throw toApiError(error);
  return (data as { id: string }).id;
}

/**
 * Take back your own message (no reason), or, as the chat's organizer, remove
 * somebody else's with the rule it breaks — which is what its author is told.
 */
export async function removeMessage(
  db: SupabaseClient,
  messageId: string,
  reason?: string,
): Promise<void> {
  const { error } = await db.rpc('remove_message', {
    p_message_id: messageId,
    p_reason: reason ?? null,
  });
  if (error) throw toApiError(error);
}

/** Organizers only; at most three pinned per chat. */
export async function pinMessage(
  db: SupabaseClient,
  messageId: string,
  pinned: boolean,
): Promise<void> {
  const { error } = await db.rpc('pin_message', { p_message_id: messageId, p_pinned: pinned });
  if (error) throw toApiError(error);
}

/** «Todo el grupo» or «Solo quienes organizan». Group organizers only. */
export async function setChatMode(
  db: SupabaseClient,
  communityId: string,
  mode: ChatMode,
): Promise<void> {
  const { error } = await db.rpc('set_chat_mode', { p_community_id: communityId, p_mode: mode });
  if (error) throw toApiError(error);
}

export async function setChatNotifications(
  db: SupabaseClient,
  scope: ChatScope,
  level: ChatNotify,
): Promise<void> {
  const { error } = await db.rpc('set_chat_notifications', {
    ...scopeParams(scope),
    p_level: level,
  });
  if (error) throw toApiError(error);
}

/**
 * Mark a chat read, and its chat notices with it. Called when the chat is
 * opened; a failure is not worth an error on top of the conversation.
 */
export async function markChatRead(db: SupabaseClient, scope: ChatScope): Promise<void> {
  await db.rpc('mark_chat_read', scopeParams(scope));
}

// ------------------------------------------------------------------- reads

/** One page of a chat, newest first. `before` is the oldest `createdAt` shown. */
export async function fetchChat(
  db: SupabaseClient,
  scope: ChatScope,
  before?: string,
): Promise<ChatPage> {
  const { data, error } = await db.rpc('chat_messages', {
    ...scopeParams(scope),
    p_before: before ?? null,
    p_limit: 50,
  });
  if (error) throw toApiError(error);
  return toChatPage(data);
}

/** «Tus chats». */
export async function fetchMyChats(db: SupabaseClient): Promise<ChatSummary[]> {
  const { data, error } = await db.rpc('my_chats');
  if (error) throw toApiError(error);
  return toChatSummaries(data);
}

/**
 * Call `onChange` when a message is written to, or changes in, one chat.
 * Returns the unsubscribe. See the top of the file for why the payload is
 * ignored.
 */
export function subscribeToChat(
  db: SupabaseClient,
  scope: ChatScope,
  onChange: () => void,
): () => void {
  const filter =
    'activityId' in scope
      ? `activity_id=eq.${scope.activityId}`
      : `community_id=eq.${scope.communityId}`;
  const channel = db
    .channel(`chat:${filter}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, () =>
      onChange(),
    )
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}

// ---------------------------------------------------------------- narrowing
//
// Both reads return jsonb, which arrives as `unknown`. Narrowed once, here.

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Raw)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function notifyOf(value: unknown): ChatNotify {
  return value === 'all' || value === 'muted' ? value : 'replies';
}

export function toChatMessage(raw: unknown): ChatMessage | null {
  const r = obj(raw);
  const id = str(r?.id);
  const createdAt = str(r?.created_at);
  if (r === null || id === null || createdAt === null) return null;
  if (r.removed === true) return { id, createdAt, removed: true };

  const body = str(r.body);
  if (body === null) return null;
  const author = obj(r.author);
  const reply = obj(r.reply_to);
  return {
    id,
    createdAt,
    removed: false,
    body,
    isMe: r.is_me === true,
    isOrganizer: r.is_organizer === true,
    pinned: typeof r.pinned_at === 'string',
    author:
      author && str(author.id) && str(author.display_name)
        ? {
            id: author.id as string,
            displayName: author.display_name as string,
            avatarUrl: str(author.avatar_url),
          }
        : null,
    replyTo:
      reply && str(reply.id)
        ? {
            id: reply.id as string,
            excerpt: str(reply.excerpt) ?? '',
            authorName: str(reply.author_name),
          }
        : null,
  };
}

function messages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toChatMessage).filter((m): m is ChatMessage => m !== null);
}

export function toChatPage(raw: unknown): ChatPage {
  const r = obj(raw) ?? {};
  const why = r.why_not;
  return {
    title: str(r.title) ?? 'Chat',
    closesAt: str(r.closes_at),
    canWrite: r.can_write === true,
    whyNot: why === 'closed' || why === 'organizers_only' || why === 'suspended' ? why : null,
    isOrganizer: r.is_organizer === true,
    notify: notifyOf(r.notify),
    messages: messages(r.messages),
    pinned: messages(r.pinned),
  };
}

export function toChatSummaries(raw: unknown): ChatSummary[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatSummary[] = [];
  for (const item of raw) {
    const r = obj(item);
    if (r === null) continue;
    const activityId = str(r.activity_id);
    const communityId = str(r.community_id);
    const scope: ChatScope | null = activityId
      ? { activityId }
      : communityId
        ? { communityId }
        : null;
    if (scope === null) continue;
    const last = obj(r.last);
    out.push({
      kind: activityId ? 'session' : 'group',
      scope,
      title: str(r.title) ?? 'Chat',
      categoryId: str(r.category_id),
      startsAt: str(r.starts_at),
      closed: r.closed === true,
      notify: notifyOf(r.notify),
      last:
        last && str(last.created_at)
          ? {
              excerpt: str(last.excerpt) ?? '',
              authorName: str(last.author_name),
              isMe: last.is_me === true,
              createdAt: last.created_at as string,
            }
          : null,
      unread: typeof r.unread === 'number' && r.unread > 0 ? r.unread : 0,
    });
  }
  return out;
}

// --------------------------------------------------------------- presentation

/** The number on the chat icon in Mis sesiones (Chat v2 · 1). Silenced chats don't count. */
export function totalUnread(chats: ChatSummary[]): number {
  return chats.reduce((sum, chat) => sum + (chat.notify === 'muted' ? 0 : chat.unread), 0);
}

/** What the closed composer says instead. */
export function whyNotText(why: ChatWhyNot): string {
  switch (why) {
    case 'closed':
      return 'El chat se cerró 24 horas después de la sesión. Se puede leer hasta que se borre, 30 días después.';
    case 'organizers_only':
      return 'En este grupo solo escriben quienes organizan.';
    case 'suspended':
      return 'Tu cuenta está suspendida: puedes leer, pero no escribir.';
  }
}

/** «Tus chats» second line: «Luis: Nos vemos…», «Tú: Ahí estaré». */
export function lastLine(last: ChatSummary['last']): string {
  if (last === null) return 'Todavía no hay mensajes.';
  const who = last.isMe ? 'Tú' : (last.authorName ?? 'Alguien');
  return `${who}: ${last.excerpt}`;
}

/**
 * Whether a message carries a Costa Rican phone number, so the composer can
 * ask before sending it (Chat v1 · 2). Checked on the phone and nowhere else:
 * the point is to make sharing a number a decision, not to store that
 * somebody tried.
 *
 * Eight digits starting 2 (landline) or 4–8 (mobile and services), with an
 * optional +506 or 506 in front and spaces, dots or dashes anywhere between
 * digits. Longer runs of digits — an amount in colones, a SINPE reference —
 * are not a phone number.
 */
export function looksLikePhoneNumber(body: string): boolean {
  const runs = body.match(/\+?\d[\d\s.\-()]{6,}\d/g) ?? [];
  return runs.some((run) => {
    let digits = run.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('506')) digits = digits.slice(3);
    return digits.length === 8 && /^[245678]/.test(digits);
  });
}
