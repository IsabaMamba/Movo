/**
 * Detalle de sesión — the screen that convinces someone to turn up.
 *
 * Following docs/design/detalle-sesion.html: what stops people is not the
 * exercise, it is the social risk. Who will be there, will I be the slowest,
 * what happens when I arrive. So the meeting point is lifted out of the fact
 * grid, and reporting lives here rather than in settings, because this is the
 * screen where somebody decides to meet strangers in a park.
 *
 * Nothing from profile_private is rendered. Phone, birthdate and emergency
 * contact never appear on anyone else's screen — only display name and avatar.
 */

import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  fetchActivityDetail,
  fetchMyParticipation,
  fetchRoster,
  formatSessionTime,
  joinActivity,
  leaveActivity,
  type ActivityDetail,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import {
  densityOf,
  difficultyBand,
  difficultyLabel,
  heatColor,
  occupancyLabel,
  priceLabel,
  UNCAPPED_REFERENCE,
} from '../../theme';
import type { ActivityParticipant, JsonSchemaProperty } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { detailStyles as s } from './styles';

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
      if (value.length > 0) tags.push(`${label}: ${value.join(', ')}`);
    } else tags.push(`${label}: ${String(value)}`);
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

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await fetchActivityDetail(supabase, id);
    setActivity(detail);
    if (!detail) return;

    if (userId) {
      // Both are permitted to fail quietly: the roster is organizer- and
      // participant-only by policy, so a stranger legitimately gets nothing.
      const [r, m] = await Promise.all([
        fetchRoster(supabase, id).catch((): Roster => []),
        fetchMyParticipation(supabase, id, userId).catch(() => null),
      ]);
      setRoster(r);
      setMine(m);
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

  if (activity === null) {
    return (
      <View style={[s.screen, { padding: 24, paddingTop: 64 }]}>
        <Text style={s.sectionTitle}>No encontramos esta sesión</Text>
        <Text style={s.privacyNote}>{error ?? 'Puede que ya no exista o que no sea pública.'}</Text>
        <Link href="/" style={s.back}>
          <Text style={s.backText}>Volver a Descubrir</Text>
        </Link>
      </View>
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

  const act = () => {
    if (!session) {
      router.push('/sign-in');
      return;
    }
    setBusy(true);
    setError(null);

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

  const actionLabel = !session
    ? 'Iniciá sesión para apuntarte'
    : busy
      ? 'Un momento…'
      : going
        ? 'Ya no voy'
        : waiting
          ? 'Salir de la lista'
          : activity.max_participants !== null && activity.joined_count >= activity.max_participants
            ? 'Entrar a la lista de espera'
            : 'Voy';

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/" style={s.back}>
        <Text style={s.backText}>← Descubrir</Text>
      </Link>

      <View>
        <View style={s.eyebrow}>
          <Text style={s.eyebrowText}>{activity.category.name_es}</Text>
          {activity.series_id && <Text style={s.seriesTag}>Se repite</Text>}
        </View>
        <Text style={s.title}>{activity.title}</Text>
      </View>

      {/* Occupancy: the bar and the number are the same variable. */}
      <View style={s.occupancy}>
        <View style={s.occupancyTop}>
          <Text style={s.occupancyCount}>
            {occupancyLabel(activity.joined_count, activity.max_participants)}
          </Text>
          {band && <Text style={s.occupancyWord}>· {difficultyLabel[band]}</Text>}
        </View>
        <View style={s.bar}>
          <View
            style={[
              s.barFill,
              { backgroundColor: heatColor(density), width: `${Math.max(density * 100, 4)}%` },
            ]}
          />
        </View>
        <View style={s.barScale}>
          <Text style={s.scaleLabel}>vacío</Text>
          <Text style={s.scaleLabel}>
            {activity.max_participants === null
              ? `referencia ${UNCAPPED_REFERENCE}`
              : `${activity.max_participants} máx.`}
          </Text>
        </View>
      </View>

      <View style={s.organizer}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials(activity.organizer.display_name)}</Text>
        </View>
        <View>
          <Text style={s.organizerName}>{activity.organizer.display_name}</Text>
          <Text style={s.organizerMeta}>Organiza esta sesión</Text>
        </View>
      </View>

      <View style={s.facts}>
        <View style={s.fact}>
          <Text style={s.factLabel}>Cuándo</Text>
          <Text style={s.factValue}>{formatSessionTime(activity.starts_at)}</Text>
        </View>
        <View style={s.fact}>
          <Text style={s.factLabel}>Dura</Text>
          <Text style={s.factValue}>
            {Math.round(
              (new Date(activity.ends_at).getTime() - new Date(activity.starts_at).getTime()) /
                60000,
            )}{' '}
            min
          </Text>
        </View>
        <View style={s.fact}>
          <Text style={s.factLabel}>Precio</Text>
          <Text style={s.factValue}>{priceLabel(activity.price_minor, activity.currency)}</Text>
        </View>
      </View>

      {/* The one field whose absence stops somebody turning up. */}
      <View style={s.meeting}>
        <Text style={s.meetingLabel}>Dónde nos vemos</Text>
        <Text style={s.meetingValue}>
          {activity.location.name}
          {activity.meeting_point ? ` · ${activity.meeting_point}` : ''}
        </Text>
        {activity.location.district && (
          <Text style={s.meetingNote}>{activity.location.district}</Text>
        )}
      </View>

      {tags.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Cómo es</Text>
          <View style={s.tagRow}>
            {tags.map((tag) => (
              <View key={tag} style={s.tag}>
                <Text style={s.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {activity.equipment.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Lleva</Text>
          <View style={s.tagRow}>
            {activity.equipment.map((item) => (
              <View key={item} style={s.tag}>
                <Text style={s.tagText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Quién va</Text>
        {roster.length > 0 ? (
          <View style={s.roster}>
            {roster.map((person) => (
              <View key={person.user_id} style={s.tag}>
                <Text style={s.rosterName}>{person.profile.display_name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.privacyNote}>
            {session
              ? 'La lista es visible para quienes ya van y para quien organiza.'
              : 'Iniciá sesión para ver quién va.'}
          </Text>
        )}
      </View>

      {mine && (going || waiting) && (
        <View style={[s.status, waiting && s.statusWait]}>
          <Text style={s.statusText}>
            {waiting
              ? `Estás en lista de espera${mine.waitlist_pos ? `, puesto ${mine.waitlist_pos}` : ''}. Si alguien cancela, entrás automáticamente.`
              : 'Vas a esta sesión.'}
          </Text>
        </View>
      )}

      {error && <Text style={s.error}>{error}</Text>}

      <Pressable
        disabled={busy}
        onPress={act}
        style={[s.action, (going || waiting) && s.actionSecondary, busy && s.actionDisabled]}
      >
        <Text style={[s.actionText, (going || waiting) && s.actionTextSecondary]}>
          {actionLabel}
        </Text>
      </Pressable>
      <Text style={s.actionNote}>Podés cancelar hasta la hora de salida.</Text>

      <Pressable style={s.report}>
        <Text style={s.reportText}>Reportar esta sesión</Text>
      </Pressable>
    </ScrollView>
  );
}
