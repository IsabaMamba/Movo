/**
 * Mi historial — attendance history, shown to the one person it is about.
 *
 * `docs/security.md` sets four conditions and this screen carries two of
 * them: off until the person reads what it is and says yes, and a delete
 * that is one tap away and actually deletes. The other two — coarse rows and
 * the ninety-day job — live in 0021, where a screen cannot undo them.
 *
 * The notice says what is stored in the words the rows use. If a row ever
 * holds more than this text describes, the text is wrong and so is the
 * consent; change `ATTENDANCE_NOTICE_VERSION` with it.
 */

import { Link, Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  clearAttendanceHistory,
  disableAttendanceHistory,
  enableAttendanceHistory,
  fetchAttendanceConsent,
  fetchAttendanceHistory,
  summarizeAttendance,
  timesLabel,
  weekLabel,
  type AttendanceConsent,
  type AttendanceLine,
} from '../../lib/attendanceHistory';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { historyStyles as s } from './styles';

type Loaded = { consent: AttendanceConsent | null; lines: AttendanceLine[] };
type Confirming = 'clear' | 'disable' | null;

export function AttendanceHistoryScreen() {
  const { session, loading } = useAuth();
  const [state, setState] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  const load = useCallback(async () => {
    const consent = await fetchAttendanceConsent(supabase);
    const rows = consent === null ? [] : await fetchAttendanceHistory(supabase);
    setState({ consent, lines: summarizeAttendance(rows) });
  }, []);

  useEffect(() => {
    if (!userId) return;
    load().catch((cause: unknown) => {
      setState({ consent: null, lines: [] });
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar tu historial.');
    });
  }, [userId, load]);

  /** Every change is re-read from the server: the screen shows what is stored, not what was asked. */
  const run = (action: () => Promise<string>) => {
    setBusy(true);
    setConfirming(null);
    setError(null);
    setStatus(null);
    action()
      .then(async (message) => {
        await load();
        setStatus(message);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo completar. No cambió nada.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const on = state?.consent != null;

  return (
    <ScrollView
      aria-busy={state === null || busy}
      contentContainerStyle={s.content}
      style={s.screen}
    >
      <Link href="/mis-sesiones" style={s.back}>
        <Text style={s.backText}>← Mis sesiones</Text>
      </Link>

      <View>
        <Text accessibilityRole="header" style={s.title}>
          Mi historial
        </Text>
        <Text style={s.subtitle}>
          {state === null
            ? ' '
            : on
              ? 'Está activado.'
              : 'Está apagado. Movo no guarda a dónde vas.'}
        </Text>
      </View>

      {status !== null && (
        <Text accessibilityRole="alert" aria-live="polite" style={s.status}>
          {status}
        </Text>
      )}
      {error !== null && (
        <Text accessibilityRole="alert" aria-live="assertive" style={s.error}>
          {error}
        </Text>
      )}

      {state === null ? (
        <ActivityIndicator />
      ) : (
        <>
          <View style={s.notice}>
            <Text style={s.sectionTitle}>Qué guarda</Text>
            <Text style={s.noticeText}>
              Cuando quien organiza marca que llegaste a una sesión, guardamos tres cosas: el
              deporte, el distrito y la franja del día — por ejemplo, «Running · Mata Redonda ·
              entre semana, noche» — con la semana en que fue.
            </Text>
            <Text style={s.noticeText}>
              Nunca el lugar exacto, ni la hora, ni cuál sesión fue. Si no llegaste, no se guarda
              nada. Tampoco se guarda nada de antes de activarlo.
            </Text>
            <Text style={s.noticeText}>
              Solo tú lo ves. No hay ninguna pantalla — ni para quien organiza ni para el equipo de
              Movo — que lo muestre.
            </Text>
            <Text style={s.noticeText}>
              Cada registro se borra solo a los 90 días. Puedes borrarlo todo cuando quieras, y
              apagarlo también lo borra.
            </Text>
            <Text style={s.noticeText}>
              Para qué sirve: para recomendarte sesiones donde y cuando ya sueles ir. Esas
              recomendaciones todavía no existen; por ahora, esto es solo tu registro.
            </Text>
            {on && state.consent !== null && (
              <Text style={s.noticeMeta}>
                Lo activaste con la versión {state.consent.noticeVersion} de este texto.
              </Text>
            )}
          </View>

          {!on ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Activar mi historial"
              accessibilityHint="Desde ahora se guarda el deporte, el distrito y la franja de cada sesión a la que llegues"
              disabled={busy}
              onPress={() => {
                run(async () => {
                  await enableAttendanceHistory(supabase);
                  return 'Historial activado. Se empieza a llenar con tu próxima llegada.';
                });
              }}
              style={s.primary}
            >
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text style={s.primaryText}>Activar mi historial</Text>
              )}
            </Pressable>
          ) : (
            <>
              <View style={s.group}>
                <Text style={s.sectionTitle}>Últimos 90 días</Text>
                {state.lines.length === 0 ? (
                  <Text style={s.empty}>
                    Todavía no hay nada. Aparece aquí cuando alguien marque que llegaste.
                  </Text>
                ) : (
                  state.lines.map((line) => (
                    <View
                      accessible
                      accessibilityLabel={`${line.text}. ${timesLabel(line.times)}, la última en la ${weekLabel(line.lastWeekOf)}.`}
                      key={line.key}
                      style={s.card}
                    >
                      <Text style={s.cardText}>{line.text}</Text>
                      <Text style={s.cardMeta}>
                        {timesLabel(line.times)} · la última, {weekLabel(line.lastWeekOf)}
                      </Text>
                    </View>
                  ))
                )}
              </View>

              {confirming !== null ? (
                <View style={s.confirm}>
                  <Text style={s.noticeText}>
                    {confirming === 'clear'
                      ? 'Se borra todo tu historial. Queda activado y vuelve a empezar desde cero.'
                      : 'Se borra todo tu historial y deja de guardarse. Para volver a tenerlo tendrás que activarlo de nuevo.'}
                  </Text>
                  <View style={s.confirmRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        confirming === 'clear' ? 'Sí, borrar todo' : 'Sí, apagar y borrar'
                      }
                      disabled={busy}
                      onPress={() => {
                        if (confirming === 'clear') {
                          run(async () => {
                            const n = await clearAttendanceHistory(supabase);
                            return n === 1
                              ? 'Se borró 1 registro. Tu historial está vacío.'
                              : `Se borraron ${n} registros. Tu historial está vacío.`;
                          });
                        } else {
                          run(async () => {
                            await disableAttendanceHistory(supabase);
                            return 'Historial apagado y borrado. Movo ya no guarda a dónde vas.';
                          });
                        }
                      }}
                      style={s.grave}
                    >
                      <Text style={s.graveText}>
                        {confirming === 'clear' ? 'Sí, borrar todo' : 'Sí, apagar y borrar'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="No, dejarlo como está"
                      onPress={() => {
                        setConfirming(null);
                      }}
                      style={s.plain}
                    >
                      <Text style={s.plainText}>No, dejarlo como está</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={s.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Borrar todo mi historial"
                    disabled={busy}
                    onPress={() => {
                      setConfirming('clear');
                    }}
                    style={s.grave}
                  >
                    <Text style={s.graveText}>Borrar todo</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Apagar y borrar mi historial"
                    disabled={busy}
                    onPress={() => {
                      setConfirming('disable');
                    }}
                    style={s.grave}
                  >
                    <Text style={s.graveText}>Apagar y borrar</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
