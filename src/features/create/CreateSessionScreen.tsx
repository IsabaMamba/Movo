/**
 * Crear sesión — the screen that turns an empty Descubrir into a populated one.
 *
 * Follows docs/design/crear-sesion.html. Two decisions from that design are
 * load-bearing rather than cosmetic:
 *
 *   * The category comes first, because it is the only field that changes the
 *     shape of the form. Asking it last would rearrange the screen under the
 *     finger of somebody already typing.
 *   * "Sin límite" is the default, because max_participants is nullable and
 *     uncapped is the common case — so capacity is a choice of two, not an
 *     empty number field.
 */

import { Link, Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AttributeValidationError,
  createActivity,
  createSeries,
  fetchCategories,
  fetchPublicVenues,
  type ValidationIssue,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import {
  color,
  difficultyLabel,
  difficultyValue,
  hitSlopFor,
  size,
  type DifficultyBand,
} from '../../theme';
import type { Category, Location, SkillLevel } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { SchemaFields } from './SchemaFields';
import { createStyles as s } from './styles';

/**
 * Skill describes the PERSON, difficulty describes the ROUTE. The two label
 * sets deliberately share no words — see ADR 0004 and the design notes.
 */
const SKILLS: { value: SkillLevel; label: string }[] = [
  { value: 'any', label: 'Cualquiera' },
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
];

const BANDS: DifficultyBand[] = ['suave', 'moderada', 'exigente'];

/** Costa Rica is UTC-6 year round — no daylight saving to reason about. */
const CR_OFFSET = '-06:00';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Chips are `size.controlSm`; the target is padded back up to 44 without resizing them. */
const CHIP_HIT_SLOP = hitSlopFor(size.controlSm);

/** `s.link` is 20px of line plus 8px of padding either side — 36 tall, same shortfall. */
const LINK_HIT_SLOP = hitSlopFor(36);

interface Result {
  ok: boolean;
  message: string;
}

export function CreateSessionScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [venues, setVenues] = useState<Location[] | null>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [meetingPoint, setMeetingPoint] = useState('');
  // Defaults to today rather than empty. An empty required field disables the
  // publish button while rendering nothing, which is indistinguishable from the
  // button being broken — which is exactly how it was read.
  const [date, setDate] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
      t.getDate(),
    ).padStart(2, '0')}`;
  });
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('60');
  const [repeats, setRepeats] = useState(false);
  const [skill, setSkill] = useState<SkillLevel>('any');
  const [band, setBand] = useState<DifficultyBand | null>(null);
  const [capped, setCapped] = useState(false);
  const [capacity, setCapacity] = useState('12');
  const [price, setPrice] = useState('');
  const [unlisted, setUnlisted] = useState(false);
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCategories(supabase), fetchPublicVenues(supabase)])
      .then(([cats, locs]) => {
        if (cancelled) return;
        setCategories(cats);
        setVenues(locs);
        if (locs.length === 1 && locs[0]) setVenueId(locs[0].id);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setVenues([]);
        setResult({
          ok: false,
          message: cause instanceof Error ? cause.message : 'No se pudo cargar el formulario.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!session) return <Redirect href="/sign-in" />;

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const venue = venues?.find((v) => v.id === venueId) ?? null;

  // Entered as Costa Rican wall-clock time and stored as an instant, so the
  // schedule survives the day a second country is added.
  const startsAt = date && time ? new Date(`${date}T${time}:00${CR_OFFSET}`) : null;
  const startsValid = startsAt !== null && !Number.isNaN(startsAt.getTime());
  const durationMinutes = Number(duration);
  const capacityValue = capped ? Number(capacity) : null;

  /**
   * What is still missing, in the order the form asks for it.
   *
   * A disabled button looks identical to a working one whose request failed,
   * and `submit()` returns early when the guard is unmet — so pressing it
   * produced no row, no error and no network request at all. Naming the gap is
   * the difference between a form somebody can finish and one that appears
   * broken.
   */
  const missing: string[] = [];
  if (category === null) missing.push('elegí una categoría');
  if (venue === null) missing.push('elegí un lugar');
  if (title.trim().length < 3) missing.push('poné un título de al menos 3 letras');
  if (!startsValid) missing.push('revisá el día y la hora');
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
    missing.push('la duración tiene que ser de 15 minutos o más');
  }
  if (capped && (!Number.isFinite(capacityValue) || (capacityValue ?? 0) < 2)) {
    missing.push('el cupo tiene que ser de 2 personas o más');
  }

  const canSubmit = !busy && missing.length === 0;

  const submit = () => {
    if (!canSubmit || !category || !venue || !startsAt) return;
    setBusy(true);
    setIssues([]);
    setResult(null);

    // Colones are entered whole; the column stores minor units.
    const priceMinor = price.trim() === '' ? 0 : Math.round(Number(price) * 100);

    const base = {
      categoryId: category.id,
      locationId: venue.id,
      title,
      durationMinutes,
      skill,
      difficulty: band ? difficultyValue[band] : null,
      maxParticipants: capacityValue,
      priceMinor: Number.isFinite(priceMinor) ? priceMinor : 0,
      currency: venue.currency,
      attributes,
    };

    const run = repeats
      ? createSeries(
          supabase,
          session.user.id,
          { ...base, weekday: startsAt.getDay(), localStartTime: time },
          category.attribute_schema,
        ).then(({ generated }) => ({
          ok: true,
          message: `Serie creada. Se generaron ${generated} sesiones, todos los ${WEEKDAYS[startsAt.getDay()] ?? ''} a las ${time}.`,
        }))
      : createActivity(
          supabase,
          session.user.id,
          {
            ...base,
            startsAt,
            meetingPoint,
            visibility: unlisted ? 'unlisted' : 'public',
            publish: true,
          },
          category.attribute_schema,
        ).then(() => ({
          ok: true,
          message: 'Sesión publicada. Ya aparece en Descubrir.',
        }));

    run
      .then((r) => {
        setResult(r);
      })
      .catch((cause: unknown) => {
        if (cause instanceof AttributeValidationError) {
          setIssues(cause.issues);
          setResult({ ok: false, message: 'Faltan datos en los detalles de la categoría.' });
          return;
        }
        setResult({
          ok: false,
          message: cause instanceof Error ? cause.message : 'No se pudo crear la sesión.',
        });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Crear sesión</Text>
        <Text style={s.subtitle}>Solo lugares públicos. Hora de Costa Rica.</Text>
      </View>

      {result && (
        <View style={[s.banner, result.ok && s.bannerOk]}>
          {/* The banner is the only report of whether the submit worked, and it
              appears far from the button that caused it. Alert on the text, not
              on the wrapper, so the link below stays its own focus stop. */}
          <Text accessibilityRole="alert" style={s.bannerText}>
            {result.message}
          </Text>
          {result.ok && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver en Descubrir"
              hitSlop={LINK_HIT_SLOP}
              onPress={() => {
                router.replace('/');
              }}
              style={s.link}
            >
              <Text style={s.linkText}>Ver en Descubrir</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* 01 — category first: it is the only field that reshapes the form. */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionNumber}>01</Text>
          <Text style={s.sectionTitle}>¿Qué vas a hacer?</Text>
        </View>
        <View accessibilityRole="tablist" accessibilityLabel="Categoría" style={s.chipRow}>
          {categories.map((c) => {
            const on = categoryId === c.id;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={c.name_es}
                accessibilityState={{ selected: on }}
                /* Changing category clears section 04 and any errors in it, which
                   nothing on the chip says. */
                accessibilityHint="Cambia los detalles que pide el formulario"
                hitSlop={CHIP_HIT_SLOP}
                key={c.id}
                onPress={() => {
                  setCategoryId(c.id);
                  setAttributes({});
                  setIssues([]);
                }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{c.name_es}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.field}>
          <Text style={s.label}>Título</Text>
          <TextInput
            accessibilityLabel="Título"
            accessibilityHint="Obligatorio. Mínimo tres caracteres."
            maxLength={120}
            onChangeText={setTitle}
            placeholder="Corrida martes 6K"
            placeholderTextColor={color.text.tertiary}
            style={s.input}
            value={title}
          />
        </View>
      </View>

      {/* 02 */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionNumber}>02</Text>
          <Text style={s.sectionTitle}>¿Dónde y cuándo?</Text>
        </View>

        {venues === null ? (
          <ActivityIndicator />
        ) : venues.length === 0 ? (
          <View style={s.banner}>
            <Text style={s.bannerText}>
              No hay lugares públicos todavía. Agregá uno a la base antes de publicar — crear
              lugares desde la app está pendiente.
            </Text>
          </View>
        ) : (
          venues.map((v) => {
            const on = venueId === v.id;
            return (
              <Pressable
                /* Name and meta are one choice, so they are one label — read
                   apart, "Verificado · CRC" belongs to no venue in particular. */
                accessible
                accessibilityRole="tab"
                accessibilityLabel={[
                  v.name,
                  v.district ?? 'Sin distrito',
                  v.is_verified ? 'Verificado' : 'Sin verificar',
                  v.currency,
                ].join('. ')}
                accessibilityState={{ selected: on }}
                key={v.id}
                onPress={() => {
                  setVenueId(v.id);
                }}
                style={[s.venue, on && s.venueOn]}
              >
                <Text style={s.venueName}>{v.name}</Text>
                <Text style={s.venueMeta}>
                  {v.district ?? 'Sin distrito'} · {v.is_verified ? 'Verificado' : 'Sin verificar'}{' '}
                  · {v.currency}
                </Text>
              </Pressable>
            );
          })
        )}
        <Text style={s.hint}>
          Solo lugares públicos. No se puede publicar una sesión en una dirección privada.
        </Text>

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

        <View style={s.row}>
          <View style={s.rowItem}>
            <Text style={s.label}>Día</Text>
            <TextInput
              accessibilityLabel="Día"
              accessibilityHint="Formato año-mes-día, por ejemplo 2026-09-08"
              inputMode="numeric"
              onChangeText={setDate}
              placeholder="2026-09-08"
              placeholderTextColor={color.text.tertiary}
              style={s.input}
              value={date}
            />
          </View>
          <View style={s.rowItem}>
            <Text style={s.label}>Hora</Text>
            <TextInput
              accessibilityLabel="Hora"
              accessibilityHint="Formato de 24 horas, por ejemplo 18:00. Hora de Costa Rica."
              inputMode="numeric"
              onChangeText={setTime}
              placeholder="18:00"
              placeholderTextColor={color.text.tertiary}
              style={s.input}
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
              placeholder="60"
              placeholderTextColor={color.text.tertiary}
              style={s.input}
              value={duration}
            />
          </View>
        </View>
        {date !== '' && !startsValid && (
          <Text accessibilityRole="alert" style={s.error}>
            Usá el formato 2026-09-08 y 18:00.
          </Text>
        )}

        <View style={s.switchRow}>
          <Text style={s.switchLabel}>Se repite cada semana</Text>
          <Switch
            accessibilityLabel="Se repite cada semana"
            onValueChange={setRepeats}
            trackColor={{ false: color.border.default, true: color.accent.deep }}
            thumbColor={repeats ? color.accent.cool : color.text.tertiary}
            value={repeats}
          />
        </View>
        {repeats && startsValid && (
          <Text style={s.hint}>
            Se crean las sesiones de los próximos 60 días, todos los{' '}
            {WEEKDAYS[startsAt.getDay()] ?? ''} a las {time}. Podés cancelar una sin cancelar el
            resto.
          </Text>
        )}
      </View>

      {/* 03 */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionNumber}>03</Text>
          <Text style={s.sectionTitle}>¿Quién puede venir?</Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Nivel de quien viene</Text>
          {/* The chip labels are bare words — "Cualquiera" only means anything
              once the group says what is being chosen. */}
          <View
            accessibilityRole="tablist"
            accessibilityLabel="Nivel de quien viene"
            style={s.chipRow}
          >
            {SKILLS.map((option) => {
              const on = skill === option.value;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: on }}
                  hitSlop={CHIP_HIT_SLOP}
                  key={option.value}
                  onPress={() => {
                    setSkill(option.value);
                  }}
                  style={[s.chip, on && s.chipOn]}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={s.field}>
          <View style={s.labelRow}>
            <Text style={s.label}>Qué tan dura es</Text>
            <Text style={s.optional}>opcional</Text>
          </View>
          <View
            accessibilityRole="tablist"
            accessibilityLabel="Qué tan dura es, opcional"
            style={s.chipRow}
          >
            {BANDS.map((option) => {
              const on = band === option;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={difficultyLabel[option]}
                  accessibilityState={{ selected: on }}
                  hitSlop={CHIP_HIT_SLOP}
                  key={option}
                  onPress={() => {
                    setBand(on ? null : option);
                  }}
                  style={[s.chip, on && s.chipOn]}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>{difficultyLabel[option]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
              /* Choosing this replaces the helper line with a number field. */
              accessibilityHint="Agrega un campo para el número de personas"
              hitSlop={CHIP_HIT_SLOP}
              onPress={() => {
                setCapped(true);
              }}
              style={[s.chip, capped && s.chipOn]}
            >
              <Text style={[s.chipText, capped && s.chipTextOn]}>Con cupo</Text>
            </Pressable>
          </View>
          {capped ? (
            <TextInput
              accessibilityLabel="Cupo"
              accessibilityHint="Número de personas. Mínimo 2."
              inputMode="numeric"
              onChangeText={setCapacity}
              placeholder="12"
              placeholderTextColor={color.text.tertiary}
              style={s.input}
              value={capacity}
            />
          ) : (
            <Text style={s.hint}>La tarjeta va a decir «14 van» en vez de «14 de 20».</Text>
          )}
        </View>

        <View style={s.field}>
          <View style={s.labelRow}>
            <Text style={s.label}>Precio</Text>
            <Text style={s.optional}>opcional</Text>
          </View>
          <TextInput
            accessibilityLabel="Precio, opcional"
            accessibilityHint={`En ${venue?.currency ?? 'CRC'}, unidades enteras. Vacío es gratis.`}
            inputMode="numeric"
            onChangeText={setPrice}
            placeholder="Gratis"
            placeholderTextColor={color.text.tertiary}
            style={s.input}
            value={price}
          />
          <Text style={s.hint}>
            En {venue?.currency ?? 'CRC'}, unidades enteras. Vacío es gratis.
          </Text>
        </View>
      </View>

      {/* 04 — written by the database, not by this file. */}
      {category && (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionNumber}>04</Text>
            <Text style={s.sectionTitle}>Detalles de {category.name_es.toLowerCase()}</Text>
          </View>
          <SchemaFields
            issues={issues}
            onChange={(field, value) => {
              setAttributes((prev) => {
                const next = { ...prev };
                if (value === undefined) delete next[field];
                else next[field] = value;
                return next;
              });
            }}
            schema={category.attribute_schema}
            values={attributes}
          />
        </View>
      )}

      {/* 05 */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionNumber}>05</Text>
          <Text style={s.sectionTitle}>¿Quién la ve?</Text>
        </View>
        <View accessibilityRole="tablist" accessibilityLabel="¿Quién la ve?" style={s.chipRow}>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Pública"
            accessibilityState={{ selected: !unlisted }}
            accessibilityHint="Aparece en Descubrir para cualquiera dentro del radio"
            hitSlop={CHIP_HIT_SLOP}
            onPress={() => {
              setUnlisted(false);
            }}
            style={[s.chip, !unlisted && s.chipOn]}
          >
            <Text style={[s.chipText, !unlisted && s.chipTextOn]}>Pública</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Con enlace"
            accessibilityState={{ selected: unlisted }}
            accessibilityHint="No se lista en Descubrir; solo llega quien tenga el enlace"
            hitSlop={CHIP_HIT_SLOP}
            onPress={() => {
              setUnlisted(true);
            }}
            style={[s.chip, unlisted && s.chipOn]}
          >
            <Text style={[s.chipText, unlisted && s.chipTextOn]}>Con enlace</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>
          Pública aparece en Descubrir para cualquiera dentro del radio. Con enlace no se lista.
        </Text>
        {repeats && <Text style={s.hint}>Las series se crean siempre públicas.</Text>}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Publicando…' : repeats ? 'Crear serie' : 'Publicar sesión'}
        /* A series writes 60 days of sessions in one press, which the two-word
           label does not say. The single-session case needs no hint. */
        accessibilityHint={
          repeats ? 'Crea las sesiones de los próximos 60 días, una por semana' : undefined
        }
        accessibilityState={{ disabled: !canSubmit, busy }}
        disabled={!canSubmit}
        onPress={submit}
        style={[s.publish, !canSubmit && s.publishDisabled]}
      >
        <Text style={s.publishText}>
          {busy ? 'Publicando…' : repeats ? 'Crear serie' : 'Publicar sesión'}
        </Text>
      </Pressable>

      {missing.length > 0 && (
        <Text accessibilityLiveRegion="polite" style={s.missing}>
          Para publicar falta: {missing.join(' · ')}.
        </Text>
      )}

      <Link href="/" style={s.link}>
        <Text style={s.linkText}>Volver a Descubrir</Text>
      </Link>
    </ScrollView>
  );
}
