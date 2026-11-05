/**
 * One chat: a session's or a group's (Chat v1 · 1–7, Chat v2).
 *
 * Everything it shows comes from chat_messages() (0040), which already drops
 * people blocked in either direction and suspended authors, and marks where
 * an organizer removed something. Realtime only rings the bell: when the
 * chat changes, the first page is asked for again; the row Realtime carries
 * is never rendered.
 *
 * Before a message with a phone number goes out, the composer asks (Chat v1
 * · 2). Nothing is stored about it: the point is that sharing a number is a
 * decision. Organizers can pin (three at most) and remove a message citing
 * the rule it broke, which is what its author is told — never who did it.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  fetchChat,
  looksLikePhoneNumber,
  markChatRead,
  pinMessage,
  removeMessage,
  sendMessage,
  setChatNotifications,
  subscribeToChat,
  whyNotText,
  type ChatMessage,
  type ChatNotify,
  type ChatPage,
  type ChatScope,
} from '../../lib/chat';
import { createReport, reportReasonsFor, type ReportReason } from '../../lib/activities';
import { blockPerson } from '../../lib/blocks';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../nav/Icon';
import { authorInitials, chatTime, REMOVAL_REASONS } from './format';
import { chatStyles as s } from './styles';

const HIT_SLOP = hitSlopFor(size.controlSm);
const BODY_MAX = 2000;

const NOTIFY_OPTIONS: { id: ChatNotify; label: string; hint?: string }[] = [
  { id: 'all', label: 'Todos los mensajes' },
  { id: 'replies', label: 'Solo si me responden o escribe quien organiza' },
  { id: 'muted', label: 'Silenciado', hint: 'Igual ves el número de nuevos al abrir Movo' },
];

type Shown = Extract<ChatMessage, { removed: false }>;

export function ChatScreen({ kind }: { kind: 'session' | 'group' }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const scope: ChatScope | null = id
    ? kind === 'session'
      ? { activityId: id }
      : { communityId: id }
    : null;
  const scopeKey = id ? `${kind}:${id}` : '';

  const [page, setPage] = useState<ChatPage | null>(null);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [noMore, setNoMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [phoneCheck, setPhoneCheck] = useState(false);
  const [menuFor, setMenuFor] = useState<Shown | null>(null);
  /** The message being answered, shown above the composer (Chat v1). */
  const [replyTo, setReplyTo] = useState<Shown | null>(null);
  /** Chat v1 · 3: reporting the message in the sheet, with an optional block. */
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const loadingOlder = useRef(false);

  const load = useCallback(async () => {
    if (!scope) return;
    const next = await fetchChat(supabase, scope);
    setPage(next);
  }, [scopeKey]);

  useEffect(() => {
    if (!scope || !session) return;
    load()
      .then(() => markChatRead(supabase, scope))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo abrir el chat.');
      });
    const off = subscribeToChat(supabase, scope, () => {
      void load()
        .then(() => markChatRead(supabase, scope))
        .catch(() => undefined);
    });
    return off;
  }, [scopeKey, session, load]);

  if (!session) {
    return (
      <View style={s.screen}>
        <Text style={s.empty}>Inicia sesión para ver el chat.</Text>
      </View>
    );
  }
  if (!scope) return null;

  const messages = page ? [...page.messages, ...older] : [];

  const loadOlder = () => {
    if (!page || noMore || loadingOlder.current || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    if (!oldest) return;
    loadingOlder.current = true;
    fetchChat(supabase, scope, oldest.createdAt)
      .then((more) => {
        if (more.messages.length === 0) setNoMore(true);
        setOlder((prev) => [...prev, ...more.messages]);
      })
      .catch(() => undefined)
      .finally(() => {
        loadingOlder.current = false;
      });
  };

  const send = (force = false) => {
    const body = draft.trim();
    if (body === '' || sending) return;
    if (!force && looksLikePhoneNumber(body)) {
      setPhoneCheck(true);
      return;
    }
    setPhoneCheck(false);
    setSending(true);
    setError(null);
    sendMessage(supabase, scope, body, replyTo?.id)
      .then(() => {
        setDraft('');
        setReplyTo(null);
        return load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo enviar el mensaje.');
      })
      .finally(() => {
        setSending(false);
      });
  };

  const act = (run: () => Promise<unknown>) => {
    setMenuFor(null);
    setRemoving(false);
    setReporting(false);
    setError(null);
    run()
      .then(() => load())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo hacer eso.');
      });
  };

  const chooseNotify = (level: ChatNotify) => {
    setSettings(false);
    setPage((p) => (p ? { ...p, notify: level } : p));
    setChatNotifications(supabase, scope, level).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el aviso.');
      void load().catch(() => undefined);
    });
  };

  const subtitle = page
    ? page.closesAt === null
      ? 'Solo quienes son del grupo lo leen'
      : page.whyNot === 'closed'
        ? 'Chat cerrado · se puede leer'
        : 'Solo quienes van lo leen'
    : ' ';

  const bubble = ({ item }: { item: ChatMessage }) => {
    if (item.removed) {
      return (
        <View style={s.removedRow}>
          <Text style={s.removedText}>Mensaje quitado por quien organiza</Text>
        </View>
      );
    }
    const label = [
      item.isMe ? 'Tú' : (item.author?.displayName ?? 'Alguien'),
      item.isOrganizer && !item.isMe ? 'organiza' : null,
      item.body,
      chatTime(item.createdAt),
    ]
      .filter(Boolean)
      .join('. ');
    return (
      <Pressable
        accessibilityHint="Mantén presionado para ver qué puedes hacer con este mensaje"
        accessibilityLabel={label}
        onLongPress={() => {
          setMenuFor(item);
        }}
        style={[s.messageRow, item.isMe && s.messageRowMine]}
      >
        {!item.isMe && (
          <View aria-hidden style={s.avatar}>
            <Text style={s.avatarText}>{authorInitials(item.author?.displayName)}</Text>
          </View>
        )}
        <View style={[s.messageCol, item.isMe && s.messageColMine]}>
          {!item.isMe && (
            <Text style={s.author}>
              {item.author?.displayName ?? 'Cuenta borrada'}
              {item.isOrganizer ? <Text style={s.authorRole}> · organiza</Text> : null}
            </Text>
          )}
          {item.replyTo && (
            <View style={s.reply}>
              <Text numberOfLines={1} style={s.replyText}>
                {item.replyTo.authorName ? `${item.replyTo.authorName}: ` : ''}
                {item.replyTo.excerpt}
              </Text>
            </View>
          )}
          <View style={[s.bubble, item.isMe && s.bubbleMine]}>
            <Text style={[s.body, item.isMe && s.bodyMine]}>{item.body}</Text>
          </View>
          <Text style={[s.time, item.isMe && s.timeMine]}>
            {item.pinned ? 'Fijado · ' : ''}
            {chatTime(item.createdAt)}
          </Text>
        </View>
      </Pressable>
    );
  };

  const pinned = (page?.pinned ?? []).filter((m): m is Shown => !m.removed);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.screen}>
      <View style={s.topBar}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/chats');
          }}
          style={s.topButton}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <View style={s.topText}>
          <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
            {page?.title ?? 'Chat'}
          </Text>
          <Text numberOfLines={1} style={s.subtitle}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Avisos de este chat"
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          onPress={() => {
            setSettings(true);
          }}
          style={s.topButton}
        >
          <Icon color={color.text.primary} name="more" size={22} />
        </Pressable>
      </View>

      {pinned.length > 0 && (
        <View style={s.pinned}>
          {pinned.map((m) => (
            <View key={m.id} style={s.pinnedRow}>
              <Icon color={color.accent.primary} name="pinned" size={14} />
              <Text numberOfLines={1} style={s.pinnedText}>
                {m.author?.displayName ? `${m.author.displayName}: ` : ''}
                {m.body}
              </Text>
            </View>
          ))}
        </View>
      )}

      {notice !== null && (
        <Text accessibilityRole="alert" style={s.notice}>
          {notice}
        </Text>
      )}
      {error !== null && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      {page === null && error === null ? (
        <ActivityIndicator style={s.loading} />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={messages}
          inverted
          keyExtractor={(m) => m.id}
          ListEmptyComponent={
            <Text style={s.empty}>Todavía no hay mensajes. Saluda: así se sabe quién va.</Text>
          }
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          renderItem={bubble}
        />
      )}

      {phoneCheck && (
        <View accessibilityRole="alert" style={s.phoneBox}>
          <Text style={s.phoneTitle}>Vas a compartir un número de teléfono</Text>
          <Text style={s.phoneBody}>
            Lo van a ver las personas de este chat. Movo existe para que no haga falta. Tú decides.
          </Text>
          <View style={s.phoneActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPhoneCheck(false);
              }}
              style={s.phonePrimary}
            >
              <Text style={s.phonePrimaryText}>Quitar el número</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                send(true);
              }}
              style={s.phoneSecondary}
            >
              <Text style={s.phoneSecondaryText}>Enviar igual</Text>
            </Pressable>
          </View>
        </View>
      )}

      {page && !page.canWrite ? (
        <View style={s.closed}>
          <Text style={s.closedText}>
            {page.whyNot ? whyNotText(page.whyNot) : 'No puedes escribir aquí.'}
          </Text>
        </View>
      ) : (
        <View>
          {replyTo && (
            <View style={s.replyBar}>
              <View style={s.replyBarText}>
                <Text style={s.replyBarLabel}>
                  Respondiendo a {replyTo.isMe ? 'ti' : (replyTo.author?.displayName ?? 'alguien')}
                </Text>
                <Text numberOfLines={1} style={s.replyText}>
                  {replyTo.body}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="No responder a este mensaje"
                accessibilityRole="button"
                hitSlop={HIT_SLOP}
                onPress={() => {
                  setReplyTo(null);
                }}
              >
                <Icon color={color.text.tertiary} name="close" size={16} />
              </Pressable>
            </View>
          )}
          <View style={s.composer}>
            <TextInput
              accessibilityLabel="Escribe un mensaje"
              maxLength={BODY_MAX}
              multiline
              onChangeText={(text) => {
                setDraft(text);
                if (phoneCheck) setPhoneCheck(false);
              }}
              placeholder="Escribe un mensaje"
              placeholderTextColor={color.text.tertiary}
              style={s.input}
              value={draft}
            />
            <Pressable
              accessibilityLabel={sending ? 'Enviando' : 'Enviar'}
              accessibilityRole="button"
              aria-disabled={draft.trim() === '' || sending}
              disabled={draft.trim() === '' || sending}
              onPress={() => {
                send();
              }}
              style={[s.send, draft.trim() !== '' && s.sendOn]}
            >
              <Icon
                color={draft.trim() !== '' ? color.text.inverse : color.text.tertiary}
                name="send"
                size={18}
              />
            </Pressable>
          </View>
        </View>
      )}

      {menuFor && (
        <View style={s.sheet}>
          <View style={s.sheetQuote}>
            <Text numberOfLines={2} style={s.sheetQuoteText}>
              {menuFor.isMe ? 'Tú' : menuFor.author?.displayName}: {menuFor.body}
            </Text>
          </View>
          {reporting && menuFor.author ? (
            <>
              <Text style={s.sheetTitle}>
                ¿Qué pasa con este mensaje? Lo lee el equipo de Movo; {menuFor.author.displayName}{' '}
                no sabe quién lo reportó.
              </Text>
              {reportReasonsFor({ womenOnly: false }).map((option) => {
                const on = reportReason === option.value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    aria-checked={on}
                    key={option.value}
                    onPress={() => {
                      setReportReason(option.value);
                    }}
                    style={[s.option, on && s.optionOn]}
                  >
                    <View style={[s.radio, on && s.radioOn]} />
                    <View style={s.optionText}>
                      <Text style={s.sheetRowText}>{option.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="checkbox"
                aria-checked={alsoBlock}
                onPress={() => {
                  setAlsoBlock(!alsoBlock);
                }}
                style={[s.option, alsoBlock && s.optionOn]}
              >
                <View style={[s.radio, alsoBlock && s.radioOn]} />
                <View style={s.optionText}>
                  <Text style={s.sheetRowText}>
                    Bloquear también a {menuFor.author.displayName}
                  </Text>
                  <Text style={s.sheetRowHint}>Dejas de ver sus mensajes. No le avisamos.</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                aria-disabled={reportReason === null}
                disabled={reportReason === null}
                onPress={() => {
                  const who = menuFor.author;
                  const reason = reportReason;
                  if (!who || !reason || !session) return;
                  act(async () => {
                    await createReport(
                      supabase,
                      session.user.id,
                      'message',
                      menuFor.id,
                      reason,
                      undefined,
                      'activityId' in scope ? scope.activityId : undefined,
                    );
                    if (alsoBlock) await blockPerson(supabase, who.id);
                    setNotice(
                      alsoBlock
                        ? `Reportaste el mensaje y bloqueaste a ${who.displayName}. Te avisamos cuando el equipo lo revise.`
                        : 'Reportaste el mensaje. Te avisamos cuando el equipo lo revise.',
                    );
                  });
                }}
                style={[s.reportSend, reportReason === null && s.reportSendOff]}
              >
                <Text style={s.reportSendText}>Enviar el reporte</Text>
              </Pressable>
            </>
          ) : removing ? (
            <>
              <Text style={s.sheetTitle}>
                ¿Qué regla no cumple? Es lo que le decimos a quien lo escribió.
              </Text>
              {REMOVAL_REASONS.map((reason) => (
                <Pressable
                  accessibilityRole="button"
                  key={reason}
                  onPress={() => {
                    act(() => removeMessage(supabase, menuFor.id, reason));
                  }}
                  style={s.sheetRow}
                >
                  <Text style={s.sheetRowText}>{reason}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              {page?.canWrite && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setReplyTo(menuFor);
                    setMenuFor(null);
                  }}
                  style={s.sheetRow}
                >
                  <Text style={s.sheetRowText}>Responder</Text>
                </Pressable>
              )}
              {menuFor.isMe && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    act(() => removeMessage(supabase, menuFor.id));
                  }}
                  style={s.sheetRow}
                >
                  <Text style={s.sheetRowDanger}>Borrar mi mensaje</Text>
                </Pressable>
              )}
              {page?.isOrganizer && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    act(() => pinMessage(supabase, menuFor.id, !menuFor.pinned));
                  }}
                  style={s.sheetRow}
                >
                  <Text style={s.sheetRowText}>
                    {menuFor.pinned ? 'Dejar de fijar' : 'Fijar arriba (hasta 3)'}
                  </Text>
                </Pressable>
              )}
              {page?.isOrganizer && !menuFor.isMe && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setRemoving(true);
                  }}
                  style={s.sheetRow}
                >
                  <Text style={s.sheetRowDanger}>Quitar este mensaje</Text>
                  <Text style={s.sheetRowHint}>Le decimos la regla, nunca quién lo quitó</Text>
                </Pressable>
              )}
              {!menuFor.isMe && menuFor.author && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setReporting(true);
                    setReportReason(null);
                    setAlsoBlock(false);
                  }}
                  style={s.sheetRow}
                >
                  <Text style={s.sheetRowDanger}>Reportar este mensaje</Text>
                  <Text style={s.sheetRowHint}>
                    Lo lee el equipo: {menuFor.author.displayName} no sabe quién fue
                  </Text>
                </Pressable>
              )}
              {!menuFor.isMe && menuFor.author && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const who = menuFor.author;
                    if (!who) return;
                    act(() =>
                      blockPerson(supabase, who.id).then(() => {
                        setNotice(`Bloqueaste a ${who.displayName}. No le avisamos.`);
                      }),
                    );
                  }}
                  style={s.sheetRow}
                >
                  <Text style={s.sheetRowDanger}>Bloquear a {menuFor.author.displayName}</Text>
                  <Text style={s.sheetRowHint}>Dejas de ver sus mensajes. No le avisamos.</Text>
                </Pressable>
              )}
            </>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMenuFor(null);
              setRemoving(false);
              setReporting(false);
            }}
            style={s.sheetCancel}
          >
            <Text style={s.sheetCancelText}>Cancelar</Text>
          </Pressable>
        </View>
      )}

      {settings && page && (
        <View style={s.sheet}>
          <Text style={s.sheetHeading}>Avisos de este chat</Text>
          <View accessibilityRole="radiogroup">
            {NOTIFY_OPTIONS.map((option) => {
              const on = page.notify === option.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  aria-checked={on}
                  key={option.id}
                  onPress={() => {
                    chooseNotify(option.id);
                  }}
                  style={[s.option, on && s.optionOn]}
                >
                  <View style={[s.radio, on && s.radioOn]} />
                  <View style={s.optionText}>
                    <Text style={s.sheetRowText}>{option.label}</Text>
                    {option.hint ? <Text style={s.sheetRowHint}>{option.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.sheetRowHint}>
            El aviso al teléfono dice siempre «Tienes un aviso nuevo en Movo», nunca el mensaje.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSettings(false);
            }}
            style={s.sheetCancel}
          >
            <Text style={s.sheetCancelText}>Listo</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
