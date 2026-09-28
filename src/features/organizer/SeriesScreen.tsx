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
 */

import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { fetchPublicVenues, formatSessionTime } from '../../lib/activities';
import {
  cadenceLabel,
  cancelSeries,
  capacityFloor,
  explainSeriesError,
  fetchOrganizerSeries,
  peopleOnUpcoming,
  shortTime,
  updateSeries,
  WEEKDAYS,
  type OrganizerSeries,
} from '../../lib/series';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import type { Location } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';

const CHIP_HIT_SLOP = hitSlopFor(size.controlSm);
const TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();

  const [series, setSeries] = useState<OrganizerSeries | null | undefined>(undefined);
  const [venues, setVenues] = useState<Location[]>([]);

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
    const [row, locs] = await Promise.all([
      fetchOrganizerSeries(supabase, id),
      fetchPublicVenues(supabase),
    ]);
    setSeries(row);
    setVenues(locs);
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
    <Link href="/organizar" style={s.link}>
      <Text style={s.linkText}>← Volver a Organizar</Text>
    </Link>
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
      <Text accessibilityRole="header" style={s.title}>
        {series.title}
      </Text>
      <Text style={s.subtitle}>
        {cadenceLabel(series.weekday, series.local_start_time)} · {series.location.name}
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
            : `Serie cancelada: ${n === 1 ? 'se canceló 1 fecha' : `se cancelaron ${n} fechas`}. Cada persona apuntada recibió un aviso.`,
        );
      })
      .catch((cause: unknown) => {
        setError(explainSeriesError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const venuesShown = locked ? venues.filter((v) => v.id === series.location_id) : venues;

  return (
    <ScrollView aria-busy={busy} contentContainerStyle={s.content} style={s.screen}>
      {back}
      {header}

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
        <Text style={s.sectionTitle}>Próximas fechas</Text>
        {series.upcoming.length === 0 ? (
          <Text style={s.hint}>No hay fechas por delante todavía.</Text>
        ) : (
          series.upcoming.map((d) => (
            <Link
              href={{ pathname: '/organizar/[id]', params: { id: d.id } }}
              key={d.id}
              style={s.venue}
            >
              <View>
                <Text style={s.venueName}>{formatSessionTime(d.starts_at)}</Text>
                <Text style={s.venueMeta}>
                  {d.max_participants === null
                    ? `${d.joined_count} van`
                    : `${d.joined_count} de ${d.max_participants}`}
                  {d.waitlist_count > 0 ? ` · ${d.waitlist_count} en espera` : ''}
                  {d.status === 'draft' ? ' · borrador' : ''}
                </Text>
              </View>
            </Link>
          ))
        )}
        <Text style={s.hint}>
          Cada fecha tiene su propia lista. Para cambiar una sola, ábrela y edítala.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Editar la serie</Text>
        <Text style={s.hint}>
          Hora de Costa Rica. El precio y la categoría no se editan. Las fechas en las que nadie se
          apuntó siguen los cambios; las que ya tienen gente conservan lo que tenían.
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
              {onUpcoming === 1 ? 'Hay 1 persona apuntada' : `Hay ${onUpcoming} personas apuntadas`}{' '}
              en las próximas fechas. El día, la hora, la duración y el lugar quedan fijos: los
              avisos de Movo solo se ven dentro de la app, así que alguien podría llegar al lugar o
              a la hora equivocada. Si tienen que cambiar, cancela la serie (cada persona recibe un
              aviso) y publica una nueva.
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
        {venuesShown.map((v) => {
          const on = venueId === v.id;
          return (
            <Pressable
              accessible
              accessibilityRole="radio"
              accessibilityLabel={[v.name, v.district ?? 'Sin distrito', locked ? 'fijo' : null]
                .filter((part): part is string => part !== null)
                .join('. ')}
              aria-checked={on}
              aria-disabled={locked}
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
          Se cancelan todas las fechas que vienen y cada persona apuntada recibe un aviso con el
          motivo. Las fechas que ya pasaron se quedan como fueron.
        </Text>
        {confirmingCancel ? (
          <View style={s.field}>
            <View style={s.labelRow}>
              <Text style={s.label}>Motivo</Text>
              <Text style={s.optional}>opcional, lo ve cada persona apuntada</Text>
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
    </ScrollView>
  );
}
