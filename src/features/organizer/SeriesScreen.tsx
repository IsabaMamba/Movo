/**
 * Una serie — the template a club meets on, and its upcoming dates.
 *
 * Before this screen a series could only be changed one date at a time, and
 * ending a weekly club meant cancelling every Tuesday by hand. It calls the
 * two functions 0013 wrote for exactly this and nothing had called:
 *
 *   * Editar la serie → `update_series()`. Future dates nobody joined follow
 *     the template; dates with people on them keep what they had. Day, hour,
 *     duration and venue lock as soon as anybody is on an upcoming date, for
 *     the reason Editar sesión gives: notices only reach the in-app inbox.
 *   * Cancelar la serie → `cancel_series()`. Every future date is cancelled
 *     through `cancel_activity()`, so each roster gets its own notice. Past
 *     dates stay as they happened.
 *
 * Price and category are not editable here, the same as for a session.
 *
 * Step 27 of the 2 November walkthrough puts the series itself first: how
 * many arrive on average, how many dates are left, how many weeks in a row
 * it has met, a bar per recent date, who is going, the dates ahead. The form
 * and the cancel opened behind «Editar la serie».
 *
 * «Invítalas a toda la serie» (0052) lists the people who came to a date and
 * are not on all of them, and invites each once — a notice that opens the
 * series page, where joining it whole is one tap. Sharing the series outside
 * Movo is the «Compartir» button, as before.
 *
 * «Cómo se unen» (0053): the whole series, single dates, or both. It saves
 * on the tap; people already on dates keep them.
 *
 * «¿Agregas 8 fechas más?» (0057; Series v2 · 9) appears once the last date
 * is a month away or less — the same moment the `series_renewal_offer`
 * notice arrives. The dates are chips; tapping one takes it out (a holiday)
 * and the run moves a week. Nothing renews by itself, and the people on the
 * whole series are asked before they are on any new date.
 */

import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';

import { fetchPublicVenues } from '../../lib/activities';
import {
  cadenceLabel,
  cancelSeries,
  capacityFloor,
  explainSeriesError,
  fetchOrganizerSeries,
  fetchSeriesHistory,
  peopleOnUpcoming,
  seriesDateFill,
  seriesDay,
  seriesShortDate,
  seriesStats,
  shortTime,
  updateSeries,
  weekdayLabel,
  WEEKDAYS,
  type OrganizerSeries,
  type SeriesPastDate,
} from '../../lib/series';
import {
  explainInviteError,
  fetchSeriesPeople,
  invitable,
  invitedNotice,
  inviteToSeries,
  personLine,
  type SeriesPerson,
} from '../../lib/seriesInvites';
import {
  setSeriesSignup,
  signupFromKey,
  signupKey,
  SIGNUP_OPTIONS,
  type SignupKey,
} from '../../lib/seriesSignup';
import { pricingLine } from '../../lib/pricing';
import {
  chipDay,
  DEFAULT_RENEWAL,
  explainRenewalError,
  localDate,
  renewalChips,
  renewalDay,
  renewSeries,
  stepDaysFor,
  toggleSkip,
} from '../../lib/seriesRenewal';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import type { Location } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';
import { Icon } from '../nav/Icon';
import { SERIES_BAR_MAX, seriesStyles as v } from './styles';

const CHIP_HIT_SLOP = hitSlopFor(size.controlSm);
const TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** The renewal is offered this close to the last date (offer_series_renewals()). */
const RENEW_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

export function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();

  const [series, setSeries] = useState<OrganizerSeries | null | undefined>(undefined);
  const [venues, setVenues] = useState<Location[]>([]);
  const [past, setPast] = useState<SeriesPastDate[]>([]);
  const [people, setPeople] = useState<SeriesPerson[]>([]);
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [weekday, setWeekday] = useState(0);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('60');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [capacity, setCapacity] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [skip, setSkip] = useState<string[]>([]);
  const [renewHidden, setRenewHidden] = useState(false);

  const fill = useCallback((row: OrganizerSeries) => {
    // Prefilled from the row, so saving without touching anything is a no-op.
    setTitle(row.title);
    setDescription(row.description ?? '');
    setWeekday(row.weekday);
    setTime(shortTime(row.local_start_time));
    setDuration(String(row.duration_minutes));
    setVenueId(row.location_id);
    setCapped(row.max_participants !== null);
    setCapacity(row.max_participants === null ? '' : String(row.max_participants));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const [row, locs, history, who] = await Promise.all([
      fetchOrganizerSeries(supabase, id),
      fetchPublicVenues(supabase),
      // The stats are a view on the series, not the series: a failed read
      // leaves them empty rather than the screen.
      fetchSeriesHistory(supabase, id).catch((): SeriesPastDate[] => []),
      // The same for the invitation list: without it the button is just gone.
      fetchSeriesPeople(supabase, id).catch((): SeriesPerson[] => []),
    ]);
    setSeries(row);
    setVenues(locs);
    setPast(history);
    setPeople(who);
    if (row) fill(row);
  }, [id, fill]);

  useEffect(() => {
    load().catch((cause: unknown) => {
      setSeries(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la serie.');
    });
  }, [load]);

  if (loading || series === undefined) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const back = (
    <View style={v.topBar}>
      <Link href="/organizar" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Volver a Organizar"
          style={v.topBack}
        >
          <Icon color={color.text.primary} name="back" size={20} />
          <Text style={v.topBackText}>Organizar</Text>
        </Pressable>
      </Link>
      <Text style={v.topTitle}>Serie</Text>
      <View style={v.topSpacer} />
    </View>
  );

  if (series === null || series.organizer_id !== session.user.id) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        {back}
        <Text style={s.sectionTitle}>No encontramos esta serie</Text>
        <Text style={s.hint}>{error ?? 'Puede que no exista o que no la organices tú.'}</Text>
      </ScrollView>
    );
  }

  const header = (
    <View style={s.header}>
      <View
        accessibilityLabel={cadenceLabel(series.weekday, series.local_start_time)}
        style={v.eyebrowRow}
      >
        <Icon color={color.accent.cool} name="repeat" size={14} />
        <Text style={v.eyebrow}>
          CADA {weekdayLabel(series.weekday).toUpperCase()} · {shortTime(series.local_start_time)}
        </Text>
      </View>
      <Text accessibilityRole="header" style={v.title}>
        {series.title}
      </Text>
      <Text style={s.subtitle}>
        {[
          series.location.name,
          `${series.duration_minutes} min`,
          pricingLine(series, { perDate: true }),
          series.max_participants === null ? null : `cupo ${series.max_participants}`,
        ]
          .filter((part): part is string => part !== null)
          .join(' · ')}
      </Text>
    </View>
  );

  if (!series.is_active) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        {back}
        {header}
        {notice !== null && (
          <View style={[s.banner, s.bannerOk]}>
            <Text accessibilityRole="alert" style={s.bannerText}>
              {notice}
            </Text>
          </View>
        )}
        <Text style={s.hint}>
          Esta serie está cancelada. Las fechas que ya pasaron siguen en Organizar con su
          asistencia.
        </Text>
      </ScrollView>
    );
  }

  const onUpcoming = peopleOnUpcoming(series.upcoming);
  const locked = onUpcoming > 0;
  const floor = capacityFloor(series.upcoming);

  const durationMinutes = Number(duration);
  const capacityValue = capped ? Number(capacity) : null;

  const missing: string[] = [];
  if (title.trim().length < 3) missing.push('pon un título de al menos 3 letras');
  if (!TIME_SHAPE.test(time)) missing.push('escribe la hora como 18:00');
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
    missing.push('la duración tiene que ser de 15 minutos o más');
  }
  if (capped && (!Number.isFinite(capacityValue) || (capacityValue ?? 0) < floor)) {
    missing.push(
      floor > 2
        ? `el cupo no puede ser menor a ${floor}, la fecha más llena que viene`
        : 'el cupo tiene que ser de 2 personas o más',
    );
  }
  if (venueId === null) missing.push('elige un lugar');
  const canSave = !busy && missing.length === 0;

  const save = () => {
    if (!canSave || venueId === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    updateSeries(supabase, {
      seriesId: series.id,
      title,
      description,
      weekday,
      localStartTime: time,
      durationMinutes,
      locationId: venueId,
      maxParticipants: capacityValue,
    })
      .then(async () => {
        await load();
        setNotice(
          locked
            ? 'Serie guardada. Las fechas que ya tienen gente conservan lo que tenían.'
            : 'Serie guardada. Las próximas fechas ya siguen los cambios.',
        );
      })
      .catch((cause: unknown) => {
        setError(explainSeriesError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const cancel = () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmingCancel(false);
    cancelSeries(supabase, series.id, reason)
      .then(async (n) => {
        await load();
        setNotice(
          n === 0
            ? 'Serie cancelada. No quedaba ninguna fecha por delante.'
            : `Serie cancelada: ${n === 1 ? 'se canceló 1 fecha' : `se cancelaron ${n} fechas`}. Cada persona que iba recibió un aviso.`,
        );
      })
      .catch((cause: unknown) => {
        setError(explainSeriesError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const venuesShown = locked ? venues.filter((loc) => loc.id === series.location_id) : venues;

  const stats = seriesStats(past, series.upcoming);
  const barTop = Math.max(1, series.max_participants ?? 0, ...past.map((d) => d.expected));
  const next = series.upcoming[0] ?? null;

  const pending = series.allow_whole_signup ? invitable(people) : [];
  const currentSignup = signupKey({
    allowWhole: series.allow_whole_signup,
    allowSingle: series.allow_single_dates,
  });

  const changeSignup = (key: SignupKey) => {
    if (key === currentSignup) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSeriesSignup(supabase, series.id, signupFromKey(key))
      .then(async () => {
        await load();
        setNotice('Listo. Quienes ya van a alguna fecha la conservan.');
      })
      .catch((cause: unknown) => {
        setError(explainSeriesError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const inviteSome = (ids: readonly string[]) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    inviteToSeries(supabase, series.id, ids)
      .then(async (n) => {
        setPeople(await fetchSeriesPeople(supabase, series.id));
        setNotice(invitedNotice(n));
      })
      .catch((cause: unknown) => {
        setError(explainInviteError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  // The last date that is not cancelled, past or upcoming: what renew_series()
  // counts from.
  const lastIso = series.upcoming.at(-1)?.starts_at ?? past.at(-1)?.starts_at ?? null;
  const renewDue =
    !renewHidden && lastIso !== null && Date.parse(lastIso) - Date.now() <= RENEW_WINDOW_MS;
  const lastDay = lastIso === null ? null : localDate(lastIso, series.timezone);
  const chips =
    lastDay === null
      ? []
      : renewalChips(
          lastDay,
          DEFAULT_RENEWAL,
          skip,
          stepDaysFor(series.frequency),
          localDate(new Date().toISOString(), series.timezone),
        );
  const wholeCount = people.filter((p) => p.whole).length;

  const renew = () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    renewSeries(supabase, series.id, DEFAULT_RENEWAL, skip)
      .then(async (r) => {
        await load();
        setSkip([]);
        const until = r.dates.at(-1);
        setNotice(
          [
            `Agregamos ${String(r.dates.length)} fechas${until ? `, hasta el ${renewalDay(until)}` : ''}.`,
            r.asked === 0
              ? null
              : r.asked === 1
                ? 'Le preguntamos a 1 persona si sigue.'
                : `Les preguntamos a ${String(r.asked)} personas si siguen.`,
          ]
            .filter((part): part is string => part !== null)
            .join(' '),
        );
      })
      .catch((cause: unknown) => {
        setError(explainRenewalError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const invite = () => {
    const text = `${series.title}: ${cadenceLabel(series.weekday, series.local_start_time).toLowerCase()} en ${series.location.name}. ¿Te animas? Búscala en Movo.`;
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) {
        void nav.share({ text }).catch(() => undefined);
        return;
      }
      void nav?.clipboard
        ?.writeText(text)
        .then(() => {
          setNotice('Copiamos la invitación. Pégala donde quieras.');
        })
        .catch(() => undefined);
      return;
    }
    void Share.share({ message: text });
  };

  return (
    <ScrollView aria-busy={busy} contentContainerStyle={s.content} style={s.screen}>
      {back}
      {header}

      <View style={v.stats}>
        <View accessible style={v.stat}>
          <Text style={[v.statValue, stats.rate !== null && v.statGood]}>
            {stats.rate === null ? '—' : `${stats.rate}%`}
          </Text>
          <Text style={v.statLabel}>llega, en promedio</Text>
        </View>
        <View accessible style={v.stat}>
          <Text style={v.statValue}>{stats.upcoming}</Text>
          <Text style={v.statLabel}>
            {stats.lastDate
              ? `${stats.upcoming === 1 ? 'fecha' : 'fechas'}, hasta el ${seriesShortDate(stats.lastDate)}`
              : 'fechas por delante'}
          </Text>
        </View>
        <View accessible style={v.stat}>
          <Text style={v.statValue}>{stats.streak}</Text>
          <Text style={v.statLabel}>
            {stats.streak === 1 ? 'semana seguida' : 'semanas seguidas'}
          </Text>
        </View>
      </View>

      {renewDue && lastIso !== null && (
        <View style={[v.card, v.renewCard]}>
          <View style={v.renewEyebrow}>
            <Icon color={color.accent.primary} name="repeat" size={14} />
            <Text style={v.renewEyebrowText}>
              {series.upcoming.length === 0
                ? `La última fecha fue el ${seriesDay(lastIso).toLowerCase()}`
                : `Le ${series.upcoming.length === 1 ? 'queda 1 fecha' : `quedan ${String(series.upcoming.length)} fechas`}, hasta el ${seriesDay(lastIso).toLowerCase()}`}
            </Text>
          </View>
          <Text accessibilityRole="header" style={v.renewTitle}>
            ¿Agregas {DEFAULT_RENEWAL} fechas más a la serie?
          </Text>
          <View style={v.renewChips}>
            {chips.map((c) => (
              <Pressable
                accessibilityHint={
                  c.on ? 'Toca para quitar esta fecha' : 'Toca para volver a agregarla'
                }
                accessibilityLabel={renewalDay(c.date)}
                accessibilityRole="checkbox"
                aria-checked={c.on}
                disabled={busy}
                hitSlop={CHIP_HIT_SLOP}
                key={c.date}
                onPress={() => {
                  setSkip((prev) => toggleSkip(prev, c.date));
                }}
                style={[v.renewChip, !c.on && v.renewChipOff]}
              >
                {c.on && <Icon color={color.accent.primary} name="check" size={12} />}
                <Text style={[v.renewChipText, !c.on && v.renewChipTextOff]}>
                  {chipDay(c.date)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.hint}>
            Toca una fecha para quitarla, por ejemplo si cae en un feriado. Siempre son{' '}
            {DEFAULT_RENEWAL}: la última se corre una semana.
          </Text>
          <View style={v.renewAsk}>
            <Icon color={color.accent.cool} name="people" size={14} />
            <Text style={v.renewAskText}>
              {wholeCount === 0
                ? 'Nadie va a toda la serie todavía: las fechas nuevas quedan abiertas para quien quiera.'
                : `${wholeCount === 1 ? 'A la persona que va' : `A las ${String(wholeCount)} personas que van`} a toda la serie les preguntamos si siguen. Nadie queda en las fechas nuevas sin decir que sí.`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={renew}
            style={[s.publish, busy && s.publishDisabled]}
          >
            <Text style={s.publishText}>Agregar {DEFAULT_RENEWAL} fechas</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setRenewHidden(true);
            }}
            style={v.action}
          >
            <Text style={v.actionText}>
              {series.upcoming.length === 0
                ? 'Ahora no'
                : `No, termina el ${seriesShortDate(lastIso)}`}
            </Text>
          </Pressable>
        </View>
      )}

      {past.length > 0 && (
        <View style={v.card}>
          <View style={v.cardHead}>
            <Text style={v.overline}>CÓMO VA</Text>
            <Text style={v.cardHint}>
              {series.max_participants === null
                ? 'llegaron'
                : `llegaron, de ${series.max_participants}`}
            </Text>
          </View>
          <View
            accessible
            accessibilityLabel={`Llegaron: ${past
              .map((d) => `${seriesShortDate(d.starts_at)}, ${d.arrived} de ${d.expected}`)
              .join('; ')}`}
            style={v.bars}
          >
            {past.map((d, i) => (
              <View key={d.id} style={v.barCol}>
                <Text style={v.barValue}>{d.arrived}</Text>
                <View style={v.barArea}>
                  <View
                    style={[
                      v.bar,
                      { height: Math.max(4, (d.arrived / barTop) * SERIES_BAR_MAX) },
                      i === past.length - 1 && v.barLast,
                    ]}
                  />
                </View>
                <Text style={v.barDate}>{seriesShortDate(d.starts_at)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {next && (
        <Link href={{ pathname: '/organizar/[id]', params: { id: next.id } }} asChild>
          <Pressable accessibilityRole="link" style={v.linkRow}>
            <Icon color={color.text.secondary} name="people" size={20} />
            <View style={v.linkText}>
              <Text style={v.linkTitle}>Quiénes van</Text>
              <Text style={v.linkSub}>
                {next.joined_count === 1 ? '1 va' : `${next.joined_count} van`} a la próxima fecha
                {next.waitlist_count > 0 ? ` · ${next.waitlist_count} en espera` : ''}
              </Text>
            </View>
            <Icon color={color.text.tertiary} name="chevronRight" size={16} />
          </Pressable>
        </Link>
      )}

      {notice !== null && (
        <View style={[s.banner, s.bannerOk]}>
          <Text accessibilityRole="alert" style={s.bannerText}>
            {notice}
          </Text>
        </View>
      )}
      {error !== null && (
        <View style={s.banner}>
          <Text accessibilityRole="alert" style={s.bannerText}>
            {error}
          </Text>
        </View>
      )}

      <View style={s.section}>
        <Text style={v.overline}>PRÓXIMAS FECHAS</Text>
        {series.upcoming.length === 0 ? (
          <Text style={s.hint}>No hay fechas por delante todavía.</Text>
        ) : (
          <View style={v.dates}>
            {series.upcoming.map((d) => {
              const fill = seriesDateFill(d);
              const cut = fill.indexOf(' ');
              const extra = [
                d.waitlist_count > 0 ? `${d.waitlist_count} en espera` : null,
                d.status === 'draft' ? 'borrador' : null,
              ].filter((part): part is string => part !== null);
              return (
                <Link
                  asChild
                  href={{ pathname: '/organizar/[id]', params: { id: d.id } }}
                  key={d.id}
                >
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={[seriesDay(d.starts_at), fill, ...extra].join(', ')}
                    style={v.dateRow}
                  >
                    <Text style={v.dateDay}>{seriesDay(d.starts_at)}</Text>
                    <Text style={v.dateFill}>
                      <Text style={v.dateFillStrong}>{fill.slice(0, cut)}</Text>
                      {fill.slice(cut)}
                      {extra.length > 0 ? ` · ${extra.join(' · ')}` : ''}
                    </Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        )}
        <Text style={s.hint}>
          Cada fecha tiene su propia lista. Para cambiar una sola, ábrela y edítala.
        </Text>
      </View>

      <View style={v.card}>
        <View style={v.cardHead}>
          <Text style={v.overline}>CÓMO SE UNEN</Text>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Cómo se unen">
          {SIGNUP_OPTIONS.map((option) => {
            const on = option.key === currentSignup;
            return (
              <Pressable
                accessibilityLabel={`${option.title}. ${option.sub}`}
                accessibilityRole="radio"
                aria-checked={on}
                disabled={busy}
                key={option.key}
                onPress={() => {
                  changeSignup(option.key);
                }}
                style={[s.venue, on && s.venueOn]}
              >
                <Text style={s.venueName}>{option.title}</Text>
                <Text style={s.venueMeta}>{option.sub}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {people.length > 0 && (
        <View style={v.card}>
          <View style={v.cardHead}>
            <Text style={v.overline}>QUIÉNES VAN · {people.length}</Text>
            <Text style={v.cardHint}>sin teléfonos ni correos</Text>
          </View>
          {pending.length > 0 && (
            <Text style={s.hint}>
              Quien va fecha por fecha puede recibir una invitación a toda la serie, una sola vez.
            </Text>
          )}
          {people.map((c) => (
            <View key={c.userId} style={v.inviteRow}>
              <View style={v.linkText}>
                <Text style={v.linkTitle}>{c.name}</Text>
                <Text style={v.linkSub}>
                  {personLine(c)}
                  {c.invited && !c.whole ? ' · invitación enviada' : ''}
                </Text>
              </View>
              {c.whole || c.invited || !series.allow_whole_signup ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Invitar a ${c.name} a toda la serie`}
                  disabled={busy}
                  hitSlop={CHIP_HIT_SLOP}
                  onPress={() => {
                    inviteSome([c.userId]);
                  }}
                  style={s.chip}
                >
                  <Text style={s.chipText}>Invitar a la serie</Text>
                </Pressable>
              )}
            </View>
          ))}
          {pending.length > 1 && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                inviteSome(pending.map((c) => c.userId));
              }}
              style={[s.publish, busy && s.publishDisabled]}
            >
              <Text style={s.publishText}>Invitar a las {pending.length}</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={v.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartir la serie fuera de Movo"
          onPress={invite}
          style={v.action}
        >
          <Icon color={color.text.primary} name="share" size={16} />
          <Text style={v.actionText}>Compartir</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Editar la serie"
          aria-expanded={editing}
          onPress={() => {
            setEditing(!editing);
          }}
          style={[v.action, editing && v.actionOn]}
        >
          <Icon color={color.text.primary} name="pencil" size={16} />
          <Text style={v.actionText}>Editar la serie</Text>
        </Pressable>
      </View>

      {editing && (
        <>
          <View style={s.section}>
            <Text style={s.sectionTitle}>Editar la serie</Text>
            <Text style={s.hint}>
              Hora de Costa Rica. El precio y la categoría no se editan. Las fechas a las que nadie
              se unió siguen los cambios; las que ya tienen gente conservan lo que tenían.
            </Text>

            <View style={s.field}>
              <Text style={s.label}>Título</Text>
              <TextInput
                accessibilityLabel="Título"
                maxLength={120}
                onChangeText={setTitle}
                style={s.input}
                value={title}
              />
            </View>

            <View style={s.field}>
              <View style={s.labelRow}>
                <Text style={s.label}>Descripción</Text>
                <Text style={s.optional}>opcional</Text>
              </View>
              <TextInput
                accessibilityLabel="Descripción, opcional"
                maxLength={4000}
                multiline
                onChangeText={setDescription}
                style={s.input}
                value={description}
              />
            </View>

            {locked && (
              <View style={s.banner}>
                <Text style={s.bannerText}>
                  {onUpcoming === 1 ? 'Va 1 persona' : `Van ${onUpcoming} personas`} a las próximas
                  fechas. El día, la hora, la duración y el lugar quedan fijos: los avisos de Movo
                  solo se ven dentro de la app, así que alguien podría llegar al lugar o a la hora
                  equivocada. Si tienen que cambiar, cancela la serie (cada persona recibe un aviso)
                  y publica una nueva.
                </Text>
              </View>
            )}

            <View style={s.field}>
              <Text style={s.label}>Día</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="Día" style={s.chipRow}>
                {WEEKDAYS.map((day, index) => {
                  const on = weekday === index;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityLabel={day}
                      aria-checked={on}
                      aria-disabled={locked}
                      disabled={locked}
                      hitSlop={CHIP_HIT_SLOP}
                      key={day}
                      onPress={() => {
                        setWeekday(index);
                      }}
                      style={[s.chip, on && s.chipOn, locked && !on && s.publishDisabled]}
                    >
                      <Text style={[s.chipText, on && s.chipTextOn]}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={s.row}>
              <View style={s.rowItem}>
                <Text style={s.label}>Hora</Text>
                <TextInput
                  accessibilityLabel="Hora"
                  accessibilityHint="Formato de 24 horas, por ejemplo 18:00"
                  aria-disabled={locked}
                  editable={!locked}
                  inputMode="text"
                  onChangeText={setTime}
                  style={[s.input, locked && s.publishDisabled]}
                  value={time}
                />
              </View>
              <View style={s.rowItem}>
                <Text style={s.label}>Duración</Text>
                <TextInput
                  accessibilityLabel="Duración"
                  accessibilityHint="En minutos. Mínimo 15."
                  aria-disabled={locked}
                  editable={!locked}
                  inputMode="numeric"
                  onChangeText={setDuration}
                  style={[s.input, locked && s.publishDisabled]}
                  value={duration}
                />
              </View>
            </View>

            <Text style={s.label}>Lugar</Text>
            {venuesShown.map((loc) => {
              const on = venueId === loc.id;
              return (
                <Pressable
                  accessible
                  accessibilityRole="radio"
                  accessibilityLabel={[
                    loc.name,
                    loc.district ?? 'Sin distrito',
                    locked ? 'fijo' : null,
                  ]
                    .filter((part): part is string => part !== null)
                    .join('. ')}
                  aria-checked={on}
                  aria-disabled={locked}
                  disabled={locked}
                  key={loc.id}
                  onPress={() => {
                    setVenueId(loc.id);
                  }}
                  style={[s.venue, on && s.venueOn]}
                >
                  <Text style={s.venueName}>{loc.name}</Text>
                  <Text style={s.venueMeta}>
                    {loc.district ?? 'Sin distrito'} · {loc.currency}
                  </Text>
                </Pressable>
              );
            })}

            <View style={s.field}>
              <Text style={s.label}>Cupo</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="Cupo" style={s.chipRow}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel="Sin límite"
                  aria-checked={!capped}
                  hitSlop={CHIP_HIT_SLOP}
                  onPress={() => {
                    setCapped(false);
                  }}
                  style={[s.chip, !capped && s.chipOn]}
                >
                  <Text style={[s.chipText, !capped && s.chipTextOn]}>Sin límite</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel="Con cupo"
                  aria-checked={capped}
                  hitSlop={CHIP_HIT_SLOP}
                  onPress={() => {
                    setCapped(true);
                    if (capacity === '') setCapacity(String(floor));
                  }}
                  style={[s.chip, capped && s.chipOn]}
                >
                  <Text style={[s.chipText, capped && s.chipTextOn]}>Con cupo</Text>
                </Pressable>
              </View>
              {capped && (
                <TextInput
                  accessibilityLabel="Cupo"
                  accessibilityHint={`Número de personas. Mínimo ${floor}.`}
                  inputMode="numeric"
                  onChangeText={setCapacity}
                  placeholderTextColor={color.text.tertiary}
                  style={s.input}
                  value={capacity}
                />
              )}
              <Text style={s.hint}>
                {floor > 2
                  ? `La fecha más llena que viene tiene ${floor}. El cupo puede subir, pero no bajar de ahí.`
                  : 'El cupo aplica a cada fecha por separado.'}
              </Text>
            </View>

            {missing.length > 0 && (
              <Text style={s.missing}>Para guardar falta: {missing.join(' · ')}</Text>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={busy ? 'Guardando' : 'Guardar la serie'}
              aria-disabled={!canSave}
              disabled={!canSave}
              onPress={save}
              style={[s.publish, !canSave && s.publishDisabled]}
            >
              <Text style={s.publishText}>{busy ? 'Guardando…' : 'Guardar la serie'}</Text>
            </Pressable>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Cancelar la serie</Text>
            <Text style={s.hint}>
              Se cancelan todas las fechas que vienen y cada persona que va recibe un aviso con el
              motivo. Las fechas que ya pasaron se quedan como fueron.
            </Text>
            {confirmingCancel ? (
              <View style={s.field}>
                <View style={s.labelRow}>
                  <Text style={s.label}>Motivo</Text>
                  <Text style={s.optional}>opcional, lo ve cada persona que va</Text>
                </View>
                <TextInput
                  accessibilityLabel="Motivo, opcional"
                  maxLength={500}
                  onChangeText={setReason}
                  placeholder="El club se toma un descanso hasta enero"
                  placeholderTextColor={color.text.tertiary}
                  style={s.input}
                  value={reason}
                />
                <View style={s.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Sí, cancelar ${series.upcoming.length} fechas`}
                    disabled={busy}
                    onPress={cancel}
                    style={[s.publish, s.rowItem]}
                  >
                    <Text style={s.publishText}>
                      {series.upcoming.length === 1
                        ? 'Sí, cancelar 1 fecha'
                        : `Sí, cancelar ${series.upcoming.length} fechas`}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="No, dejarla como está"
                    onPress={() => {
                      setConfirmingCancel(false);
                    }}
                    style={[s.chip, s.rowItem]}
                  >
                    <Text style={s.chipText}>No, dejarla</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancelar la serie"
                disabled={busy}
                onPress={() => {
                  setConfirmingCancel(true);
                }}
                style={s.chip}
              >
                <Text style={s.chipText}>Cancelar la serie…</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}
