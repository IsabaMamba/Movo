/**
 * Detalle de sesión — the screen that convinces someone to turn up.
 *
 * Following docs/design/detalle-sesion.html: what stops people is not the
 * exercise, it is the social risk. Who will be there, will I be the slowest,
 * what happens when I arrive. So the meeting point is lifted out of the fact
 * grid, and reporting lives here rather than in settings, because this is the
 * screen where somebody decides to meet strangers in a park.
 *
 * Layout from the 2 November walkthrough (step 5): back and share on top,
 * sport and level in Sun, the title, who organizes, the series in a cool
 * box, then one row per fact with its icon — when, where with «Cómo llegar»,
 * the price, what it is like — then who is going, and the two actions fixed
 * at the bottom. The series box opens /serie/[id], where join_series() lives.
 *
 * Nothing from profile_private is rendered. Phone, birthdate and emergency
 * contact never appear on anyone else's screen — only display name and avatar.
 */

import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  enumLabel,
  fetchActivityDetail,
  fetchMyParticipation,
  fetchRoster,
  fetchSeriesOccurrences,
  formatSessionTime,
  joinActivity,
  leaveActivity,
  createReport,
  reportReasonsFor,
  type ActivityDetail,
  type SeriesOccurrence,
  type ReportReason,
} from '../../lib/activities';
import { directionsUrl, inviteText } from '../../lib/agenda';
import { fetchActivityLinks, type ActivityLink } from '../../lib/links';
import { pointOf } from '../../lib/venues';
import { blockedPersonGoing } from '../../lib/blocks';
import { pricingParts, withPricingDefaults } from '../../lib/pricing';
import { fetchSessionLink, sessionLinkUrl, siteOrigin } from '../../lib/sessionLinks';
import { BOTH, fetchSeriesSignup, seriesBoxLine, type SeriesSignup } from '../../lib/seriesSignup';
import { supabase } from '../../lib/supabase';
import {
  color,
  densityOf,
  difficultyBand,
  difficultyLabel,
  heatColor,
  hitSlopFor,
  occupancyA11yLabel,
  occupancyLabel,
  UNCAPPED_REFERENCE,
} from '../../theme';
import type { ActivityParticipant, JsonSchemaProperty } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { StatusPage } from '../web/StatusPage';
import { SessionLinks } from '../links/SessionLinks';
import { Icon, type IconName } from '../nav/Icon';
import { detailStyles as s } from './styles';

const TZ = 'America/Costa_Rica';
const DAY = new Intl.DateTimeFormat('es-CR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: TZ,
});
const CLOCK = new Intl.DateTimeFormat('es-CR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TZ,
});
const SKILL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};
const AVATAR_TINTS = ['#FFC56B', '#FF9F45', '#F3E6D2', '#F0644F'];

/** «Dom 11 oct». */
function dayLabel(iso: string): string {
  const text = DAY.format(new Date(iso)).replace(/[.,]/g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One fact with its icon, as the walkthrough draws them. */
function InfoRow({
  icon,
  title,
  sub,
  children,
}: {
  icon: IconName;
  title: string;
  sub?: string | null;
  children?: ReactNode;
}) {
  return (
    <View style={s.infoRow}>
      <Icon color={color.text.secondary} name={icon} size={20} />
      <View style={s.infoBody}>
        <Text style={s.infoTitle}>{title}</Text>
        {sub ? <Text style={s.infoSub}>{sub}</Text> : null}
        {children}
      </View>
    </View>
  );
}

/** Initials stand in until avatars are uploaded; there is no storage bucket yet. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * Attributes as sentences rather than a key/value dump. Booleans only show when
 * true — "Nadie se queda atrás: no" is noise, its absence says the same thing.
 */
function attributeTags(
  properties: Record<string, JsonSchemaProperty>,
  attributes: Record<string, unknown>,
): string[] {
  const tags: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    const property = properties[key];
    const label = property?.title ?? key;
    if (value === true) tags.push(label);
    else if (value === false || value === null || value === undefined) continue;
    else if (Array.isArray(value)) {
      if (value.length > 0) {
        tags.push(`${label}: ${value.map((v) => enumLabel(property, String(v))).join(', ')}`);
      }
    } else
      tags.push(
        `${label}: ${typeof value === 'string' ? enumLabel(property, value) : String(value)}`,
      );
  }
  return tags;
}

type Roster = Awaited<ReturnType<typeof fetchRoster>>;

export function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [activity, setActivity] = useState<ActivityDetail | null | undefined>(undefined);
  const [roster, setRoster] = useState<Roster>([]);
  const [mine, setMine] = useState<ActivityParticipant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [otherDates, setOtherDates] = useState<SeriesOccurrence[]>([]);
  const [links, setLinks] = useState<ActivityLink[]>([]);
  const [blockedGoing, setBlockedGoing] = useState(false);
  const [signup, setSignup] = useState<SeriesSignup>(BOTH);
  // 0055: the caller's link, fetched ahead so the share sheet opens on the tap.
  const [link, setLink] = useState<string | null>(null);

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await fetchActivityDetail(supabase, id);
    setActivity(detail);
    if (!detail) return;

    // Descubrir shows a series as one card; this is where the other dates
    // become reachable. Allowed to fail quietly — the session itself is still
    // the one somebody asked for.
    const dates = detail.series_id
      ? await fetchSeriesOccurrences(supabase, detail.series_id).catch((): SeriesOccurrence[] => [])
      : [];
    setOtherDates(dates.filter((date) => date.id !== detail.id));
    // 0053: whole series, single dates, or both. Unread, both — the server
    // still refuses a single date the series does not take.
    setSignup(
      detail.series_id
        ? await fetchSeriesSignup(supabase, detail.series_id).catch((): SeriesSignup => BOTH)
        : BOTH,
    );

    // Readable wherever the session is (0032). A failure hides the links
    // rather than the session.
    setLinks(await fetchActivityLinks(supabase, detail.id).catch((): ActivityLink[] => []));

    if (userId) {
      // Both are permitted to fail quietly: the roster is organizer- and
      // participant-only by policy, so a stranger legitimately gets nothing.
      const [r, m, blocked] = await Promise.all([
        fetchRoster(supabase, id).catch((): Roster => []),
        fetchMyParticipation(supabase, id, userId).catch(() => null),
        // 0039: a yes or no, never who. Fails as «no».
        blockedPersonGoing(supabase, id),
      ]);
      setRoster(r);
      setMine(m);
      setBlockedGoing(blocked);
      // Only for somebody who goes or organizes: a code is a row, and a
      // stranger reading a public session should not leave one behind.
      const sharer =
        detail.organizer_id === userId || m?.status === 'joined' || m?.status === 'waitlisted';
      if (detail.status !== 'draft' && sharer) {
        setLink(
          await fetchSessionLink(supabase, detail.id)
            .then((code) => sessionLinkUrl(code, siteOrigin()))
            .catch(() => null),
        );
      }
    }
  }, [id, userId]);

  useEffect(() => {
    let cancelled = false;
    load().catch((cause: unknown) => {
      if (cancelled) return;
      setActivity(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la sesión.');
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (activity === undefined) return <ActivityIndicator style={s.screen} />;

  // Páginas web v1: a session link that no longer works falls into the
  // 404, which never says why — passed, cancelled or only for a group.
  // A load that failed for another reason is «Algo falló», with a retry.
  if (activity === null) {
    return error === null ? (
      <StatusPage kind="not_found" />
    ) : (
      <StatusPage
        kind="error"
        onRetry={() => {
          setError(null);
          setActivity(undefined);
          load().catch((cause: unknown) => {
            setActivity(null);
            setError(cause instanceof Error ? cause.message : 'No se pudo cargar la sesión.');
          });
        }}
      />
    );
  }

  const density = densityOf(activity.joined_count, activity.max_participants);
  const band = difficultyBand(activity.difficulty);
  // ActivityAttributes is a union of per-category shapes with no index
  // signature; the renderer is deliberately generic over all of them.
  const tags = attributeTags(
    activity.category.attribute_schema.properties,
    activity.attributes as unknown as Record<string, unknown>,
  );
  const going = mine?.status === 'joined' || mine?.status === 'attended';
  const waiting = mine?.status === 'waitlisted';
  const wholeOnly = activity.series_id !== null && !signup.allowSingle;
  // 0054: per person or split, and the entry fee; per date in a series.
  const pricing = pricingParts(withPricingDefaults(activity), {
    perDate: activity.series_id !== null,
  });
  const full =
    activity.max_participants !== null && activity.joined_count >= activity.max_participants;
  // Only people on the roster and the organizer can still read a cancelled
  // session (activities_read), so this state is shown to exactly the people
  // it concerns.
  const cancelled = activity.status === 'cancelled';

  const act = () => {
    if (!session) {
      router.push('/sign-in');
      return;
    }
    setBusy(true);
    setError(null);

    // A series taken whole only (0053) is joined from its page, where the
    // sheet says which dates are full before anything is tapped.
    if (wholeOnly && !going && !waiting) {
      setBusy(false);
      router.push({ pathname: '/serie/[id]', params: { id: activity.series_id ?? '' } });
      return;
    }

    const run =
      going || waiting ? leaveActivity(supabase, activity.id) : joinActivity(supabase, activity.id);

    Promise.resolve(run)
      .then(() => load())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const sendReport = () => {
    if (!session || !reason) return;
    setReportBusy(true);
    setError(null);
    createReport(supabase, session.user.id, 'activity', activity.id, reason, reportDetails)
      .then((id) => {
        // The id is what makes "enviado" checkable. A safety report that only
        // says it was sent is the one confirmation nobody should have to take
        // on trust.
        setReportId(id);
        setReporting(false);
        setReason(null);
        setReportDetails('');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo enviar el reporte.');
      })
      .finally(() => {
        setReportBusy(false);
      });
  };

  const actionLabel = !session
    ? 'Inicia sesión para unirte'
    : busy
      ? 'Un momento…'
      : going
        ? 'Ya no voy'
        : waiting
          ? 'Salir de la lista'
          : wholeOnly
            ? 'Unirme a toda la serie'
            : full
              ? 'Entrar a la lista de espera'
              : 'Unirme';

  /**
   * The label names the button; the hint names what it costs. Leaving frees a
   * place somebody else can take, and a full session hands you a waitlist
   * position rather than a spot — neither consequence is in the label, and the
   * confirmation for both only arrives after the tap.
   */
  const actionHint =
    wholeOnly && !going && !waiting
      ? 'Esta serie se toma completa. Abre la serie para unirte a todas las fechas.'
      : going
        ? 'Dejas la sesión y tu lugar queda libre para otra persona.'
        : waiting
          ? 'Sales de la lista de espera y pierdes tu puesto.'
          : full
            ? 'La sesión está llena. Entras a la lista de espera y ocupas el lugar automáticamente si alguien cancela.'
            : undefined;

  const point = pointOf(activity.location.geog);
  const minutes = Math.round(
    (new Date(activity.ends_at).getTime() - new Date(activity.starts_at).getTime()) / 60000,
  );
  const level = band
    ? difficultyLabel[band]
    : activity.skill !== 'any'
      ? SKILL[activity.skill]
      : 'Todos los niveles';
  const left =
    activity.max_participants === null
      ? null
      : Math.max(0, activity.max_participants - activity.joined_count);
  const goingPeople = roster.filter((p) => p.status === 'joined' || p.status === 'attended');

  const share = () => {
    const text = inviteText(activity.title, activity.starts_at, new Date(), link);
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) void nav.share({ text }).catch(() => undefined);
      else void nav?.clipboard?.writeText(text).catch(() => undefined);
      return;
    }
    void Share.share({ message: text });
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={[s.content, s.contentWithBar]} style={s.scroll}>
        <View style={s.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={hitSlopFor(32)}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/');
            }}
            style={s.backButton}
          >
            <Icon color={color.text.primary} name="back" size={20} />
            <Text style={s.backButtonText}>Volver</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartir esta sesión"
            hitSlop={hitSlopFor(32)}
            onPress={share}
            style={s.shareButton}
          >
            <Icon color={color.text.primary} name="share" size={18} />
          </Pressable>
        </View>

        <View style={s.heading}>
          <Text style={s.eyebrowSun}>
            {`${activity.category.name_es} · ${level}`.toUpperCase()}
          </Text>
          <Text accessibilityRole="header" style={s.title}>
            {activity.title}
          </Text>
          {/* Perfiles v1: who organizes is one tap from their profile. */}
          <Pressable
            accessibilityHint="Abre su perfil"
            accessibilityRole="link"
            onPress={() => {
              router.push({ pathname: '/persona/[id]', params: { id: activity.organizer.id } });
            }}
            style={s.organizerRow}
          >
            <View aria-hidden style={s.organizerAvatar}>
              <Text style={s.organizerAvatarText}>{initials(activity.organizer.display_name)}</Text>
            </View>
            <Text style={s.organizerLine}>
              Organiza <Text style={s.organizerStrong}>{activity.organizer.display_name}</Text>
            </Text>
          </Pressable>
        </View>

        {cancelled && (
          <View style={s.cancelled}>
            {/* First thing under the title: everything below still describes a
                session that is not happening. */}
            <Text accessibilityRole="alert" style={s.cancelledTitle}>
              Cancelada — no vayas
            </Text>
            <Text style={s.cancelledBody}>
              {activity.cancelled_by_staff
                ? 'La canceló el equipo de Movo.'
                : activity.cancel_reason
                  ? `Quien organiza escribió: «${activity.cancel_reason}»`
                  : 'Quien organiza la canceló sin escribir un motivo.'}
            </Text>
          </View>
        )}

        {activity.series_id && (
          <Pressable
            accessibilityHint="Abre todas las fechas de la serie"
            accessibilityRole="link"
            onPress={() => {
              if (activity.series_id) {
                router.push({ pathname: '/serie/[id]', params: { id: activity.series_id } });
              }
            }}
            style={s.seriesBox}
          >
            <Icon color={color.accent.cool} name="repeat" size={18} />
            <Text style={s.seriesText}>
              Se repite cada semana
              {otherDates.length > 0 ? ` · ${otherDates.length + 1} fechas` : ''}.{' '}
              {seriesBoxLine(signup)} <Text style={s.seriesLink}>Ver la serie</Text>
            </Text>
            <Icon color={color.text.tertiary} name="chevronRight" size={16} />
          </Pressable>
        )}

        <View style={s.info}>
          <InfoRow
            icon="calendar"
            sub={`Dura ${minutes} min.`}
            title={`${dayLabel(activity.starts_at)} · ${CLOCK.format(new Date(activity.starts_at))} a ${CLOCK.format(new Date(activity.ends_at))}`}
          />
          <InfoRow
            icon="pin"
            sub={[
              activity.meeting_point ? `Punto de encuentro: ${activity.meeting_point}` : null,
              activity.location.district,
            ]
              .filter(Boolean)
              .join(' · ')}
            title={activity.location.name}
          >
            {point && (
              <Pressable
                accessibilityRole="link"
                accessibilityHint="Abre tu app de mapas con el lugar"
                onPress={() => {
                  void Linking.openURL(directionsUrl(point.lat, point.lng));
                }}
              >
                <Text style={s.infoLink}>Cómo llegar</Text>
              </Pressable>
            )}
          </InfoRow>
          <InfoRow
            icon="money"
            sub={pricing.details.length > 0 ? pricing.details.join(' · ') : null}
            title={pricing.main}
          />
          {tags.length > 0 && <InfoRow icon="route" title={tags.join(' · ')} />}
          {activity.equipment.length > 0 && (
            <InfoRow icon="check" sub={activity.equipment.join(' · ')} title="Lleva" />
          )}
        </View>

        {blockedGoing && (
          <View accessibilityRole="alert" style={s.blockedNotice}>
            <Icon color={color.text.secondary} name="hand" size={18} />
            <Text style={s.blockedNoticeText}>
              Alguien que bloqueaste va a esta sesión. No se ven en la lista ni en el chat, pero sí
              en persona.
            </Text>
          </View>
        )}

        {/* Chat v1 · 1 and Sesión v2 · 9–10: only whoever goes or organizes
            reads the session chat, so only they see the way in. */}
        {(going || activity.organizer.id === userId) && (
          <Pressable
            accessibilityHint="Abre el chat de la sesión"
            accessibilityRole="link"
            onPress={() => {
              router.push({ pathname: '/chat/sesion/[id]', params: { id: activity.id } });
            }}
            style={s.chatRow}
          >
            <Icon color={color.accent.cool} name="chat" size={20} />
            <View style={s.infoBody}>
              <Text style={s.infoTitle}>Chat de la sesión</Text>
              <Text style={s.infoSub}>Solo quienes van lo leen. Nadie ve tu número.</Text>
            </View>
            <Icon color={color.text.tertiary} name="chevronRight" size={16} />
          </Pressable>
        )}

        <View style={s.goingBlock}>
          <View style={s.goingTop}>
            {goingPeople.length > 0 ? (
              <View
                accessible
                accessibilityLabel={`Van ${goingPeople.map((p) => p.profile.display_name).join(', ')}`}
                style={s.avatars}
              >
                {goingPeople.slice(0, 4).map((p, i) => (
                  <View
                    key={p.user_id}
                    style={[
                      s.smallAvatar,
                      {
                        backgroundColor: AVATAR_TINTS[i % AVATAR_TINTS.length],
                        marginLeft: i === 0 ? 0 : -8,
                      },
                    ]}
                  >
                    <Text style={s.smallAvatarText}>{initials(p.profile.display_name)}</Text>
                  </View>
                ))}
                {goingPeople.length > 4 && (
                  <Text style={s.moreText}>+{goingPeople.length - 4}</Text>
                )}
              </View>
            ) : (
              <Text style={s.privacyNote}>
                {session
                  ? 'Quién va lo ven quienes ya van y quien organiza.'
                  : 'Inicia sesión para ver quién va.'}
              </Text>
            )}
            <Text
              accessibilityLabel={occupancyA11yLabel(
                activity.joined_count,
                activity.max_participants,
                density,
              )}
              style={s.goingCount}
            >
              {occupancyLabel(activity.joined_count, activity.max_participants)}
            </Text>
          </View>
          <View aria-hidden style={s.bar}>
            <View
              style={[
                s.barFill,
                { backgroundColor: heatColor(density), width: `${Math.max(density * 100, 4)}%` },
              ]}
            />
          </View>
          <Text style={s.scaleLabel}>
            {activity.max_participants === null
              ? `Sin cupo · la barra se llena a las ${UNCAPPED_REFERENCE} personas`
              : `Cupo de ${activity.max_participants}`}
          </Text>
        </View>

        <SessionLinks
          links={links}
          onReport={(link) => {
            if (!session) {
              router.push('/sign-in');
              return;
            }
            // The session's own report form, with the reason chosen and the
            // domain written in, so the reviewer knows which link.
            setReportId(null);
            setReason('enlace');
            setReportDetails(`Enlace: ${link.domain} (${link.url})`);
            setReporting(true);
          }}
        />

        {otherDates.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Otras fechas</Text>
            <View style={s.tagRow}>
              {otherDates.map((date) => {
                const dateFull =
                  date.max_participants !== null && date.joined_count >= date.max_participants;
                return (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`${formatSessionTime(date.starts_at)}${dateFull ? ', llena' : ''}`}
                    accessibilityHint="Abre esa fecha de la sesión"
                    hitSlop={hitSlopFor(32)}
                    key={date.id}
                    onPress={() => {
                      router.push({ pathname: '/sesion/[id]', params: { id: date.id } });
                    }}
                    style={s.tag}
                  >
                    <Text style={s.tagText}>
                      {formatSessionTime(date.starts_at)}
                      {dateFull ? ' · llena' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {!cancelled && mine && (going || waiting) && (
          <View style={[s.status, waiting && s.statusWait]}>
            {/* Appears only after the join or leave resolves, so it has to
              announce itself rather than wait to be found. */}
            <Text accessibilityRole="alert" style={s.statusText}>
              {waiting
                ? `Estás en lista de espera${mine.waitlist_pos ? `, puesto ${mine.waitlist_pos}` : ''}. Si alguien cancela, entras automáticamente.`
                : 'Vas a esta sesión.'}
            </Text>
            {/* Descubrir stops showing a session once it starts, so without this
              the page you just joined has no route back to it. */}
            <Link href="/mis-sesiones">
              <Text style={s.statusLink}>Verla después en Mis sesiones</Text>
            </Link>
          </View>
        )}

        {error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}

        {/* Reporting works since #29: a closed reason list, one insert, and a
          confirmation quoting the report id so "enviado" is checkable. The
          comment that used to sit here said the control had no onPress, which
          stopped being true and kept being read. */}
        {reportId ? (
          <View style={s.status}>
            <Text style={s.statusText}>
              Reporte enviado · {reportId.slice(0, 8)}. Lo revisa una persona del equipo; si hace
              falta te escribimos. Quien organiza no recibe aviso.
            </Text>
          </View>
        ) : reporting ? (
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Reportar esta sesión</Text>
            <Text style={s.sheetBody}>
              Cuéntanos qué pasa. Lo lee una persona, no se avisa a quien organiza.
            </Text>
            <Link href="/normas" style={s.back}>
              <Text style={s.sheetBody}>Ver las normas de la comunidad</Text>
            </Link>

            {/* One reason from a closed list: a radiogroup. The group carries the
              label because the options are bare words that mean nothing
              announced on their own. */}
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Motivo del reporte"
              style={s.reasonRow}
            >
              {reportReasonsFor({ womenOnly: false }).map((option) => {
                const on = reason === option.value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    aria-checked={on}
                    key={option.value}
                    onPress={() => {
                      setReason(option.value);
                    }}
                    style={[s.reason, on && s.reasonOn]}
                  >
                    <Text style={[s.reasonText, on && s.reasonTextOn]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              accessibilityLabel="Detalles del reporte, opcional"
              maxLength={2000}
              multiline
              onChangeText={setReportDetails}
              placeholder="Si quieres, agrega lo que viste."
              placeholderTextColor={color.text.tertiary}
              style={s.detailsInput}
              value={reportDetails}
            />

            <View style={s.sheetActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enviar reporte"
                aria-disabled={!reason || reportBusy}
                disabled={!reason || reportBusy}
                onPress={sendReport}
                style={[s.send, (!reason || reportBusy) && s.sendDisabled]}
              >
                <Text style={s.sendText}>{reportBusy ? 'Enviando…' : 'Enviar reporte'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancelar el reporte"
                onPress={() => {
                  setReporting(false);
                  setReason(null);
                }}
                style={s.cancel}
              >
                <Text style={s.cancelText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reportar esta sesión"
            accessibilityHint={
              session
                ? 'Abre el formulario para contar qué pasa.'
                : 'Necesitas iniciar sesión para reportar.'
            }
            onPress={() => {
              if (!session) {
                router.push('/sign-in');
                return;
              }
              setReporting(true);
            }}
            style={s.report}
          >
            <Text style={s.reportText}>Reportar esta sesión</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Joining is refused by the database and leaving means nothing, so a
          cancelled session offers neither. */}
      {!cancelled && (
        <View style={s.bottomBar}>
          <View style={s.bottomRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              accessibilityHint={actionHint}
              aria-disabled={busy}
              disabled={busy}
              onPress={act}
              style={[
                s.action,
                s.bottomAction,
                (going || waiting) && s.actionSecondary,
                busy && s.actionDisabled,
              ]}
            >
              <Text style={[s.actionText, (going || waiting) && s.actionTextSecondary]}>
                {actionLabel}
              </Text>
            </Pressable>
            {point && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Cómo llegar"
                accessibilityHint="Abre tu app de mapas con el lugar"
                onPress={() => {
                  void Linking.openURL(directionsUrl(point.lat, point.lng));
                }}
                style={[s.action, s.actionSecondary, s.bottomSecondary]}
              >
                <Text style={[s.actionText, s.actionTextSecondary]}>Cómo llegar</Text>
              </Pressable>
            )}
          </View>
          <Text style={s.actionNote}>
            {going || waiting
              ? 'Puedes cancelar hasta la hora de salida.'
              : full
                ? 'Está llena: entras a la lista de espera.'
                : left !== null
                  ? `Quedan ${left} ${left === 1 ? 'lugar' : 'lugares'}.`
                  : 'Sin cupo: puede ir quien quiera.'}
          </Text>
        </View>
      )}
    </View>
  );
}
