/**
 * Editar sesión.
 *
 * Deliberately smaller than Crear. What is editable is decided by what the
 * people already on the roster are relying on:
 *
 *   * Title, meeting point, duration and capacity can change — somebody who
 *     joined still finds the session where and when they expected it.
 *   * Time and venue lock as soon as anybody joins. Movo sends no push
 *     notifications yet, so moving the session would send them to the wrong
 *     place with no way to find out. The screen says that, and points at
 *     cancelling instead.
 *   * Price and category are never editable here: a price change after people
 *     joined is a bait-and-switch, and a category change reshapes the
 *     attributes the session was published with.
 *
 * update_activity() enforces all of it. The form shows the same rules so the
 * organizer meets them before pressing save, not in an error afterwards.
 */

import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  fetchActivityDetail,
  fetchPublicVenues,
  updateActivity,
  type ActivityDetail,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size, timeZone } from '../../theme';
import type { Location } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';

/** Costa Rica is UTC-6 year round, the same assumption Crear makes. */
const CR_OFFSET = '-06:00';

const CHIP_HIT_SLOP = hitSlopFor(size.controlSm);

/** The instant as Costa Rican wall-clock parts, whatever the device is set to. */
function localParts(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  // en-CA formats dates as YYYY-MM-DD, which is the shape the field takes.
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  return { date, time };
}

/**
 * The function's English errors, in the words the organizer needs. Anything
 * unrecognised is shown as it came, because hiding an unexpected error is
 * how the create form stayed broken for four days.
 */
function explain(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('locked once people have joined')) {
    return 'Ya hay gente apuntada: la hora y el lugar no se pueden mover.';
  }
  if (message.includes('capacity cannot drop')) {
    return 'El cupo no puede quedar por debajo de la gente que ya va.';
  }
  if (message.includes('already started')) {
    return 'La sesión ya empezó y no se puede editar.';
  }
  if (message.includes('different currency')) {
    return 'Ese lugar cobra en otra moneda. Cancelá y publicá la sesión de nuevo.';
  }
  return message || 'No se pudieron guardar los cambios.';
}

export function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();

  const [activity, setActivity] = useState<ActivityDetail | null | undefined>(undefined);
  const [venues, setVenues] = useState<Location[]>([]);

  const [title, setTitle] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('60');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [capacity, setCapacity] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    Promise.all([fetchActivityDetail(supabase, id), fetchPublicVenues(supabase)])
      .then(([detail, locs]) => {
        if (cancelled) return;
        setActivity(detail);
        setVenues(locs);
        if (!detail) return;

        // Prefilled from the row, so saving without touching anything is a
        // no-op rather than a reset.
        const { date: d, time: t } = localParts(detail.starts_at);
        const minutes = Math.round(
          (new Date(detail.ends_at).getTime() - new Date(detail.starts_at).getTime()) / 60_000,
        );
        setTitle(detail.title);
        setMeetingPoint(detail.meeting_point ?? '');
        setDate(d);
        setTime(t);
        setDuration(String(minutes));
        setVenueId(detail.location_id);
        setCapped(detail.max_participants !== null);
        setCapacity(detail.max_participants === null ? '' : String(detail.max_participants));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setActivity(null);
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar la sesión.');
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading || activity === undefined) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  if (activity === null) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        <Text style={s.sectionTitle}>No encontramos esta sesión</Text>
        <Text style={s.hint}>{error ?? 'Puede que ya no exista.'}</Text>
        <Link href="/organizar" style={s.link}>
          <Text style={s.linkText}>Volver a Organizar</Text>
        </Link>
      </ScrollView>
    );
  }

  const back = (
    <Link href={{ pathname: '/organizar/[id]', params: { id: activity.id } }} style={s.link}>
      <Text style={s.linkText}>← Volver a la sesión</Text>
    </Link>
  );

  // The function refuses all of these; the screen explains instead of
  // offering a form that can only fail.
  const refusal =
    activity.organizer_id !== session.user.id
      ? 'Solo quien organiza puede editar esta sesión.'
      : activity.status === 'cancelled'
        ? 'Esta sesión está cancelada.'
        : activity.status === 'completed'
          ? 'Esta sesión ya se cerró.'
          : new Date(activity.starts_at).getTime() <= Date.now()
            ? 'Esta sesión ya empezó. Lo que queda es marcar quién llegó y cerrarla.'
            : null;

  if (refusal) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        {back}
        <Text style={s.title}>No se puede editar</Text>
        <Text style={s.subtitle}>{refusal}</Text>
      </ScrollView>
    );
  }

  const onRoster = activity.joined_count + activity.waitlist_count;
  const locked = onRoster > 0;

  const startsAt = date && time ? new Date(`${date}T${time}:00${CR_OFFSET}`) : null;
  const startsValid = startsAt !== null && !Number.isNaN(startsAt.getTime());
  const startsInPast = startsValid && startsAt !== null && startsAt.getTime() <= Date.now();
  const durationMinutes = Number(duration);
  const capacityValue = capped ? Number(capacity) : null;
  // Two is the table's floor; the people already going can raise it.
  const capacityFloor = Math.max(2, activity.joined_count);

  const missing: string[] = [];
  if (title.trim().length < 3) missing.push('poné un título de al menos 3 letras');
  if (!startsValid) missing.push('revisá el día y la hora');
  else if (startsInPast) missing.push('la sesión no puede empezar en el pasado');
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
    missing.push('la duración tiene que ser de 15 minutos o más');
  }
  if (capped && (!Number.isFinite(capacityValue) || (capacityValue ?? 0) < capacityFloor)) {
    missing.push(
      activity.joined_count > 2
        ? `el cupo no puede ser menor a las ${activity.joined_count} personas que ya van`
        : 'el cupo tiene que ser de 2 personas o más',
    );
  }
  if (venueId === null) missing.push('elegí un lugar');

  const canSave = !busy && missing.length === 0;

  // Raising the cap lets people off the waitlist, which is worth saying
  // before the save rather than discovering it in the roster afterwards.
  const freed =
    activity.waitlist_count > 0 &&
    (capacityValue === null ||
      (Number.isFinite(capacityValue) && capacityValue > activity.joined_count))
      ? capacityValue === null
        ? activity.waitlist_count
        : Math.min(activity.waitlist_count, capacityValue - activity.joined_count)
      : 0;

  const save = () => {
    if (!canSave || !startsAt || venueId === null) return;
    setBusy(true);
    setError(null);
    setSaved(null);

    updateActivity(supabase, {
      activityId: activity.id,
      title,
      meetingPoint,
      startsAt,
      durationMinutes,
      locationId: venueId,
      maxParticipants: capacityValue,
    })
      .then((row) => {
        setActivity({ ...activity, ...row });
        setSaved(
          `Cambios guardados · id ${row.id.slice(0, 8)}` +
            (freed > 0
              ? ` · ${freed} ${freed === 1 ? 'persona pasó' : 'personas pasaron'} de la lista de espera a ir`
              : ''),
        );
      })
      .catch((cause: unknown) => {
        setError(explain(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const venuesShown = locked ? venues.filter((v) => v.id === activity.location_id) : venues;

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      {back}

      <View style={s.header}>
        <Text style={s.title}>Editar sesión</Text>
        <Text style={s.subtitle}>Hora de Costa Rica. El precio y la categoría no se editan.</Text>
      </View>

      <View style={s.section}>
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
            <Text style={s.label}>Punto de encuentro</Text>
            <Text style={s.optional}>opcional</Text>
          </View>
          <TextInput
            accessibilityLabel="Punto de encuentro, opcional"
            maxLength={200}
            onChangeText={setMeetingPoint}
            placeholder="portón norte, junto a la fuente"
            placeholderTextColor={color.text.tertiary}
            style={s.input}
            value={meetingPoint}
          />
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>¿Dónde y cuándo?</Text>

        {locked && (
          <View style={s.banner}>
            {/* The one rule on this screen that is not obvious, and the one
                that decides whether the organizer edits or cancels. */}
            <Text style={s.bannerText}>
              Ya {onRoster === 1 ? 'hay 1 persona apuntada' : `hay ${onRoster} personas apuntadas`}.
              La hora y el lugar quedan fijos: Movo todavía no manda avisos, así que moverlos las
              mandaría al lugar o a la hora equivocada sin enterarse. Si tiene que cambiar, cancelá
              esta sesión y publicá otra.
            </Text>
          </View>
        )}

        {venuesShown.map((v) => {
          const on = venueId === v.id;
          return (
            <Pressable
              accessible
              accessibilityRole="tab"
              accessibilityLabel={[v.name, v.district ?? 'Sin distrito', locked ? 'fijo' : null]
                .filter((part): part is string => part !== null)
                .join('. ')}
              accessibilityState={{ selected: on, disabled: locked }}
              disabled={locked}
              key={v.id}
              onPress={() => {
                setVenueId(v.id);
              }}
              style={[s.venue, on && s.venueOn]}
            >
              <Text style={s.venueName}>{v.name}</Text>
              <Text style={s.venueMeta}>
                {v.district ?? 'Sin distrito'} · {v.currency}
              </Text>
            </Pressable>
          );
        })}

        <View style={s.row}>
          <View style={s.rowItem}>
            <Text style={s.label}>Día</Text>
            <TextInput
              accessibilityLabel="Día"
              accessibilityHint="Formato año-mes-día, por ejemplo 2026-09-08"
              accessibilityState={{ disabled: locked }}
              editable={!locked}
              /* Not `numeric`: a numeric keypad has no hyphen. */
              inputMode="text"
              onChangeText={setDate}
              style={[s.input, locked && s.publishDisabled]}
              value={date}
            />
          </View>
          <View style={s.rowItem}>
            <Text style={s.label}>Hora</Text>
            <TextInput
              accessibilityLabel="Hora"
              accessibilityHint="Formato de 24 horas, por ejemplo 18:00"
              accessibilityState={{ disabled: locked }}
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
              inputMode="numeric"
              onChangeText={setDuration}
              style={s.input}
              value={duration}
            />
          </View>
        </View>
      </View>

      <View style={s.section}>
        <View style={s.field}>
          <Text style={s.label}>Cupo</Text>
          <View accessibilityRole="tablist" accessibilityLabel="Cupo" style={s.chipRow}>
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel="Sin límite"
              accessibilityState={{ selected: !capped }}
              hitSlop={CHIP_HIT_SLOP}
              onPress={() => {
                setCapped(false);
              }}
              style={[s.chip, !capped && s.chipOn]}
            >
              <Text style={[s.chipText, !capped && s.chipTextOn]}>Sin límite</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel="Con cupo"
              accessibilityState={{ selected: capped }}
              hitSlop={CHIP_HIT_SLOP}
              onPress={() => {
                setCapped(true);
                if (capacity === '') setCapacity(String(capacityFloor));
              }}
              style={[s.chip, capped && s.chipOn]}
            >
              <Text style={[s.chipText, capped && s.chipTextOn]}>Con cupo</Text>
            </Pressable>
          </View>
          {capped && (
            <TextInput
              accessibilityLabel="Cupo"
              accessibilityHint={`Número de personas. Mínimo ${capacityFloor}.`}
              inputMode="numeric"
              onChangeText={setCapacity}
              style={s.input}
              value={capacity}
            />
          )}
          <Text style={s.hint}>
            {activity.joined_count > 0
              ? `Ya van ${activity.joined_count}. El cupo puede subir, pero no bajar de ahí.`
              : 'Todavía no se apuntó nadie.'}
            {activity.waitlist_count > 0 ? ` ${activity.waitlist_count} en espera.` : ''}
          </Text>
          {freed > 0 && (
            <Text style={s.hint}>
              Al guardar,{' '}
              {freed === 1
                ? 'la primera persona de la lista de espera pasa a ir.'
                : `las primeras ${freed} personas de la lista de espera pasan a ir.`}
            </Text>
          )}
        </View>
      </View>

      {error !== null && (
        <View style={s.banner}>
          <Text accessibilityRole="alert" style={s.bannerText}>
            {error}
          </Text>
        </View>
      )}
      {saved !== null && (
        <View style={[s.banner, s.bannerOk]}>
          {/* Same rule as publishing: the confirmation quotes the row. */}
          <Text accessibilityRole="alert" style={s.bannerText}>
            {saved}
          </Text>
        </View>
      )}

      {missing.length > 0 && (
        <Text style={s.missing}>Para guardar falta: {missing.join(' · ')}</Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Guardando' : 'Guardar cambios'}
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={save}
        style={[s.publish, !canSave && s.publishDisabled]}
      >
        <Text style={s.publishText}>{busy ? 'Guardando…' : 'Guardar cambios'}</Text>
      </Pressable>
    </ScrollView>
  );
}
