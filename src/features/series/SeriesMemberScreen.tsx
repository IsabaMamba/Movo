/**
 * A series seen by somebody who goes, or might (Perfiles v1 · 3–6, 0048).
 *
 * Before joining: every date with its own fill, past ones dimmed, the full one
 * saying «Llena · lista de espera» before anything is tapped. «Unirme a la
 * serie» opens a sheet that says which dates are a place and which a wait —
 * join_series() does exactly that, date by date. «Una fecha» opens the next
 * open date as an ordinary session.
 *
 * From inside: your state on each date (llegaste, vas, en espera) and three
 * numbers that are only yours — never compared with anybody. Tapping a date
 * you are on asks «¿No puedes ir?»: missing one date and leaving the series
 * are different things, and the default is the smaller one. The organizer
 * gets a notice either way; a reason is one of three words, or none.
 *
 * «¿Sigues en la serie?» (0057/0059; Series v2 · 10): when the organizer
 * added dates and this person was on the whole series, the page asks first.
 * Two answers of the same weight; no answer means the series ends for them
 * on the old last date, and nobody is put on a new date without a yes.
 */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';

import {
  dateList,
  explainMemberError,
  fetchMemberSeries,
  isFull,
  isInSeries,
  joinPreview,
  joinSeries,
  leaveSeries,
  LEAVE_REASONS,
  memberDay,
  memberDayLong,
  memberStats,
  seriesCadence,
  upcomingDates,
  type LeaveReason,
  type MemberSeries,
  type MemberSeriesDate,
} from '../../lib/seriesMember';
import { BOTH, fetchSeriesSignup, type SeriesSignup } from '../../lib/seriesSignup';
import {
  answeredNotice,
  answerSeriesRenewal,
  fetchRenewalQuestion,
  type RenewalQuestion,
} from '../../lib/seriesRenewal';
import { pricingLine } from '../../lib/pricing';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { isNotFound } from '../../lib/errors';
import { StatusPage } from '../web/StatusPage';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../nav/Icon';
import { RenewalQuestionCard } from './RenewalQuestionCard';
import { seriesStyles as s } from './styles';

const SKILL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

type Sheet = null | { kind: 'join' } | { kind: 'leave'; date: MemberSeriesDate | null };

export function SeriesMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;

  const [series, setSeries] = useState<MemberSeries | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [onlyOne, setOnlyOne] = useState(true);
  const [reason, setReason] = useState<LeaveReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState<SeriesSignup>(BOTH);
  const [question, setQuestion] = useState<RenewalQuestion | null>(null);
  // A series in its ninth week opened with eight rows of «Ya pasó» above the
  // one date somebody can still join. They fold into one row.
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [row, signup, asked] = await Promise.all([
      fetchMemberSeries(supabase, id, userId),
      // The server enforces the rule either way; unread, the screen offers both.
      fetchSeriesSignup(supabase, id).catch((): SeriesSignup => BOTH),
      // Unread, the question waits in the inbox; the page still works.
      userId === null
        ? Promise.resolve(null)
        : fetchRenewalQuestion(supabase, id).catch((): RenewalQuestion | null => null),
    ]);
    setSeries(row);
    setRule(signup);
    setQuestion(asked);
  }, [id, userId]);

  useEffect(() => {
    if (loading) return;
    load().catch((cause: unknown) => {
      // A mistyped address is the 404, not «Algo falló» (lib/errors.ts).
      setFailed(!isNotFound(cause));
      setSeries(null);
    });
  }, [load, loading]);

  if (loading || series === undefined) return <ActivityIndicator style={s.screen} />;
  if (series === null) {
    return failed ? (
      <StatusPage
        kind="error"
        onRetry={() => {
          setFailed(false);
          setSeries(undefined);
          load().catch(() => {
            setFailed(true);
            setSeries(null);
          });
        }}
      />
    ) : (
      <StatusPage kind="not_found" />
    );
  }
  if (userId !== null && series.organizer.id === userId) {
    return <Redirect href={{ pathname: '/organizar/serie/[id]', params: { id: series.id } }} />;
  }

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const share = () => {
    const url =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/serie/${series.id}`
        : `/serie/${series.id}`;
    const text = `${series.title} en Movo: ${url}`;
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) {
        void nav.share({ text }).catch(() => undefined);
        return;
      }
      void nav?.clipboard?.writeText(url).then(() => {
        setNotice('Copiamos el enlace de la serie.');
      });
      return;
    }
    void Share.share({ message: text });
  };

  const run = (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    work()
      .then(async (done) => {
        await load();
        setNotice(done);
        setSheet(null);
      })
      .catch((cause: unknown) => {
        setError(explainMemberError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const inside = isInSeries(series.dates);
  const upcoming = upcomingDates(series.dates);
  const open = upcoming.filter((d) => d.status === 'published' || d.status === 'full');
  const preview = joinPreview(series.dates);
  const stats = memberStats(series.dates);
  const organizer = series.organizer.displayName;
  const firstName = organizer.split(' ')[0] ?? organizer;
  const weekday = series.dates[0]
    ? memberDayLong(series.dates[0].starts_at).split(' ')[0]
    : 'semana';
  const myUpcoming = upcoming.filter((d) => d.mine === 'joined' || d.mine === 'waitlisted');

  const pastCount = series.dates.filter((d) => d.past).length;

  const openLeave = (date: MemberSeriesDate | null) => {
    setOnlyOne(date !== null);
    setReason(null);
    setError(null);
    setSheet({ kind: 'leave', date });
  };

  const rowRight = (d: MemberSeriesDate) => {
    if (d.past) {
      return d.mine === 'attended' ? (
        <Text style={s.arrived}>Llegaste</Text>
      ) : (
        <Text style={s.fillPast}>Ya pasó</Text>
      );
    }
    if (d.mine === 'joined') {
      return (
        <View style={s.pill}>
          <Icon color={color.semantic.success} name="check" size={12} />
          <Text style={s.pillText}>Vas</Text>
        </View>
      );
    }
    if (d.mine === 'waitlisted') {
      return (
        <View style={[s.pill, s.pillWait]}>
          <Text style={s.pillWaitText}>
            En espera{d.position !== null ? ` · ${d.position}.º` : ''}
          </Text>
        </View>
      );
    }
    if (isFull(d)) return <Text style={s.fillFull}>Llena · lista de espera</Text>;
    return (
      <Text style={s.fill}>
        {d.max_participants === null
          ? `${d.joined_count} van`
          : `${d.joined_count} de ${d.max_participants}`}
      </Text>
    );
  };

  const leaveDate = sheet?.kind === 'leave' ? sheet.date : null;
  const waitingDates = myUpcoming.filter((d) => d.mine === 'waitlisted');
  const placeDates = myUpcoming.filter((d) => d.mine === 'joined');

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.topBar}>
          <Pressable
            accessibilityLabel="Volver"
            accessibilityRole="button"
            hitSlop={hitSlopFor(size.controlSm)}
            onPress={back}
          >
            <Icon color={color.text.primary} name="back" size={22} />
          </Pressable>
          <Text style={s.topTitle}>Serie</Text>
          <Pressable
            accessibilityLabel="Compartir la serie"
            accessibilityRole="button"
            hitSlop={hitSlopFor(size.controlSm)}
            onPress={share}
          >
            <Icon color={color.text.primary} name="share" size={20} />
          </Pressable>
        </View>

        <View style={s.head}>
          <View style={s.cadenceRow}>
            {inside && (
              <View style={s.badge}>
                <Icon color={color.semantic.success} name="check" size={12} />
                <Text style={s.badgeText}>Vas a la serie</Text>
              </View>
            )}
            {!inside && <Icon color={color.accent.cool} name="repeat" size={14} />}
            <Text style={s.cadence}>{seriesCadence(series.dates)}</Text>
          </View>
          <Text accessibilityRole="header" style={s.title}>
            {series.title}
          </Text>
          <Text style={s.by}>
            Organiza{' '}
            <Text
              accessibilityRole="link"
              onPress={() => {
                if (series.organizer.id) {
                  router.push({ pathname: '/persona/[id]', params: { id: series.organizer.id } });
                }
              }}
              style={s.byName}
            >
              {organizer}
            </Text>
            {SKILL[series.skill] ? ` · ${SKILL[series.skill] ?? ''}` : ''} ·{' '}
            {pricingLine(series.pricing, { perDate: true })}
            {series.locationName ? ` · ${series.locationName}` : ''}
          </Text>
        </View>

        {inside && (
          <View style={s.stats}>
            <View style={s.stat}>
              <Text style={s.statValue}>
                {stats.arrived} de {stats.wasOn}
              </Text>
              <Text style={s.statLabel}>llegaste</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{stats.ahead}</Text>
              <Text style={s.statLabel}>por delante</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{stats.waiting}</Text>
              <Text style={s.statLabel}>en espera</Text>
            </View>
          </View>
        )}

        {question !== null && (
          <RenewalQuestionCard
            arrived={stats.arrived}
            busy={busy}
            onAnswer={(join, endDay) => {
              run(async () =>
                answeredNotice(join, await answerSeriesRenewal(supabase, series.id, join), endDay),
              );
            }}
            question={question}
            seriesTitle={series.title}
            wasOn={stats.wasOn}
          />
        )}

        {notice !== null && (
          <Text accessibilityRole="alert" style={s.notice}>
            {notice}
          </Text>
        )}
        {error !== null && sheet === null && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}

        <View>
          <View style={s.listHead}>
            <Text style={s.overline}>LAS FECHAS</Text>
            <Text style={s.note}>
              {open.length === 1 ? 'queda 1' : `quedan ${String(open.length)}`}
            </Text>
          </View>
          {pastCount > 1 && (
            <Pressable
              accessibilityRole="button"
              aria-expanded={showPast}
              onPress={() => {
                setShowPast((shown) => !shown);
              }}
              style={s.row}
            >
              <Text style={[s.day, s.dayPast]}>Ya pasaron {String(pastCount)} fechas</Text>
              <Text style={s.note}>{showPast ? 'Ocultar' : 'Ver'}</Text>
            </Pressable>
          )}
          {series.dates
            .filter((d) => !d.past || showPast || pastCount <= 1)
            .map((d) => {
              const mineNow = !d.past && (d.mine === 'joined' || d.mine === 'waitlisted');
              return (
                <Pressable
                  accessibilityHint={
                    mineNow ? 'Pregunta si no puedes ir a esta fecha' : 'Abre esta fecha'
                  }
                  accessibilityRole="button"
                  disabled={d.past}
                  key={d.id}
                  onPress={() => {
                    if (mineNow) openLeave(d);
                    else router.push({ pathname: '/sesion/[id]', params: { id: d.id } });
                  }}
                  style={s.row}
                >
                  <Text style={[s.day, d.past && s.dayPast]}>{memberDay(d.starts_at)}</Text>
                  {rowRight(d)}
                </Pressable>
              );
            })}
        </View>

        {inside ? (
          <>
            <Text style={s.note}>
              Puedes faltar a una fecha sin salir de la serie: toca la fecha. {firstName} ve tu
              asistencia de cada {weekday}.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                openLeave(null);
              }}
            >
              <Text style={s.leaveLink}>Salir de toda la serie</Text>
            </Pressable>
          </>
        ) : (
          <Text style={s.note}>
            {rule.allowWhole && rule.allowSingle
              ? 'Cada fecha tiene su propia lista. Puedes unirte a la serie entera o solo a una fecha.'
              : rule.allowWhole
                ? 'Esta serie se toma completa: al unirte, vas a todas las fechas. Si un día no puedes, avisas desde aquí.'
                : 'Esta serie es por fechas sueltas: únete a cada fecha que te sirva.'}
          </Text>
        )}
      </ScrollView>

      {!inside && open.length > 0 && sheet === null && (
        <View style={s.footer}>
          {rule.allowWhole && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (userId === null) {
                  router.push({ pathname: '/sign-in', params: { next: `/serie/${series.id}` } });
                  return;
                }
                setError(null);
                setSheet({ kind: 'join' });
              }}
              style={s.primary}
            >
              <Text style={s.primaryText}>
                {userId === null ? 'Inicia sesión para unirte' : 'Unirme a la serie'}
              </Text>
            </Pressable>
          )}
          {rule.allowSingle && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const next = open[0];
                if (next) router.push({ pathname: '/sesion/[id]', params: { id: next.id } });
              }}
              style={rule.allowWhole ? s.secondary : s.primary}
            >
              <Text style={rule.allowWhole ? s.secondaryText : s.primaryText}>
                {rule.allowWhole ? 'Una fecha' : 'Ver la próxima fecha'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {sheet !== null && (
        <Pressable
          accessibilityLabel="Cerrar"
          onPress={() => {
            setSheet(null);
          }}
          style={s.scrim}
        />
      )}

      {sheet?.kind === 'join' && (
        <View accessibilityViewIsModal style={s.sheet}>
          <Text accessibilityRole="header" style={s.sheetTitle}>
            {open.length === 1
              ? 'Unirte a la fecha que queda'
              : `Unirte a las ${String(open.length)} fechas que quedan`}
          </Text>
          <View style={s.sheetBox}>
            {preview.places.length > 0 && (
              <View style={s.sheetLine}>
                <Icon color={color.semantic.success} name="check" size={18} />
                <View style={s.sheetLineText}>
                  <Text style={s.strong}>
                    Quedas en{' '}
                    {preview.places.length === 1
                      ? '1 fecha'
                      : `${String(preview.places.length)} fechas`}
                  </Text>
                  <Text style={s.muted}>{dateList(preview.places.map((d) => d.starts_at))}</Text>
                </View>
              </View>
            )}
            {preview.waiting.length > 0 && (
              <View style={s.sheetLine}>
                <Icon color={color.semantic.warning} name="history" size={18} />
                <View style={s.sheetLineText}>
                  <Text style={s.strong}>
                    En lista de espera el {dateList(preview.waiting.map((d) => d.starts_at))}
                  </Text>
                  <Text style={s.muted}>
                    {preview.waiting.length === 1 ? 'Está llena' : 'Están llenas'}. Si se libera un
                    lugar, quedas y te avisamos.
                  </Text>
                </View>
              </View>
            )}
          </View>
          <Text style={s.note}>
            Puedes faltar a una fecha sin salir de la serie. {firstName} ve tu asistencia de cada{' '}
            {weekday}.
          </Text>
          {error !== null && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            aria-disabled={busy}
            disabled={busy}
            onPress={() => {
              run(async () => {
                const result = await joinSeries(supabase, series.id);
                const n = result.joined.length;
                const w = result.waitlisted.length;
                return w === 0
                  ? `Te uniste a la serie: vas a ${n === 1 ? '1 fecha' : `${String(n)} fechas`}.`
                  : `Te uniste a la serie: vas a ${String(n)} y esperas en ${String(w)}.`;
              });
            }}
            style={[s.primary, busy && s.off]}
          >
            <Text style={s.primaryText}>Unirme a la serie</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSheet(null);
            }}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>Volver</Text>
          </Pressable>
        </View>
      )}

      {sheet?.kind === 'leave' && (
        <View accessibilityViewIsModal style={s.sheet}>
          <Text accessibilityRole="header" style={s.sheetTitle}>
            ¿No puedes ir?
          </Text>
          {leaveDate !== null && (
            <Pressable
              accessibilityRole="radio"
              aria-checked={onlyOne}
              onPress={() => {
                setOnlyOne(true);
              }}
              style={[s.option, onlyOne && s.optionOn]}
            >
              <View style={[s.radio, onlyOne && s.radioOn]} />
              <View style={s.sheetLineText}>
                <Text style={s.strong}>Solo el {memberDayLong(leaveDate.starts_at)}</Text>
                <Text style={s.muted}>Sigues en las demás fechas</Text>
              </View>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="radio"
            aria-checked={!onlyOne}
            onPress={() => {
              setOnlyOne(false);
            }}
            style={[s.option, !onlyOne && s.optionOn]}
          >
            <View style={[s.radio, !onlyOne && s.radioOn]} />
            <View style={s.sheetLineText}>
              <Text style={s.strong}>Salir de toda la serie</Text>
              <Text style={s.muted}>
                {[
                  placeDates.length > 0
                    ? `Dejas ${placeDates.length === 1 ? '1 fecha' : `las ${String(placeDates.length)} fechas`}`
                    : null,
                  waitingDates.length > 0
                    ? `la lista de espera del ${dateList(waitingDates.map((d) => d.starts_at))}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' y ')}
              </Text>
            </View>
          </Pressable>
          <Text style={s.note}>
            Tu lugar pasa a quien esté en espera, y a {firstName} le llega un aviso sin motivo. Si
            quieres, dile por qué:
          </Text>
          <View style={s.chips}>
            {LEAVE_REASONS.map((r) => {
              const on = reason === r.value;
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  aria-checked={on}
                  key={r.value}
                  onPress={() => {
                    setReason(on ? null : r.value);
                  }}
                  style={[s.chip, on && s.chipOn]}
                >
                  <Text style={s.chipText}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {error !== null && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            aria-disabled={busy}
            disabled={busy}
            onPress={() => {
              const one = onlyOne && leaveDate !== null ? leaveDate : null;
              run(async () => {
                await leaveSeries(supabase, series.id, one?.id ?? null, reason);
                return one
                  ? `Liberaste tu lugar del ${memberDayLong(one.starts_at)}. Sigues en las demás fechas.`
                  : 'Saliste de la serie. Le avisamos a quien organiza.';
              });
            }}
            style={[s.primary, busy && s.off]}
          >
            <Text style={s.primaryText}>
              {onlyOne && leaveDate !== null
                ? leaveDate.mine === 'waitlisted'
                  ? `Salir de la espera del ${memberDayLong(leaveDate.starts_at)}`
                  : `Liberar mi lugar del ${memberDayLong(leaveDate.starts_at)}`
                : 'Salir de la serie'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSheet(null);
            }}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>Volver</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
