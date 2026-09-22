/**
 * Suspensions in force.
 *
 * The other half of «Suspender cuenta» in the report queue: who is
 * suspended, since when, until when, the team's note, and a way to lift it.
 * Staff only by policy (`suspensions_read_staff`); anybody else sees an empty
 * list, for the same reason the queue does — `staff` has no client grants,
 * so the app cannot tell a non-staff reader from an empty table.
 *
 * Lifting restores the account, not its calendar: the sessions the
 * suspension cancelled stay cancelled. The confirmation says so.
 */

import { Link, Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatSessionTime } from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import {
  fetchActiveSuspensions,
  liftSuspension,
  suspensionUntilLabel,
  type ActiveSuspension,
} from '../../lib/suspensions';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { staffStyles as s } from './styles';

const CONTROL_HIT_SLOP = hitSlopFor(size.controlSm);
const NOTE_LIMIT = 280;

interface Banner {
  text: string;
  bad: boolean;
}

export function SuspensionsScreen() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;

  const [rows, setRows] = useState<ActiveSuspension[] | null>(null);
  const [lifting, setLifting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setRows(await fetchActiveSuspensions(supabase));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    load().catch((cause: unknown) => {
      if (cancelled) return;
      setRows([]);
      setBanner({
        text: cause instanceof Error ? cause.message : 'No se pudieron cargar las suspensiones.',
        bad: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const lift = (id: string) => {
    setPending(true);
    setBanner(null);
    liftSuspension(supabase, id, note)
      .then(() => {
        setLifting(null);
        setNote('');
        setBanner({
          text: 'Se levantó la suspensión. A esa persona le llegó un aviso de que ya puede volver a usar Movo.',
          bad: false,
        });
        return load();
      })
      .catch((cause: unknown) => {
        setBanner({
          text: cause instanceof Error ? cause.message : 'No se pudo levantar la suspensión.',
          bad: true,
        });
      })
      .finally(() => {
        setPending(false);
      });
  };

  const list = rows ?? [];

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/staff/reportes" style={s.back}>
        <Text style={s.backText}>← Reportes</Text>
      </Link>

      <View>
        <Text style={s.title}>Suspensiones</Text>
        <Text style={s.subtitle}>
          Las que están vigentes. Una suspensión con fecha de fin termina sola; las demás duran
          hasta que alguien del equipo las levante.
        </Text>
      </View>

      {banner && (
        <View style={[s.banner, banner.bad && s.bannerBad]}>
          <Text
            accessibilityRole="alert"
            aria-live="assertive"
            style={[s.bannerText, banner.bad && s.bannerTextBad]}
          >
            {banner.text}
          </Text>
        </View>
      )}

      {rows === null ? (
        <ActivityIndicator aria-busy aria-label="Cargando suspensiones" />
      ) : list.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.sectionTitle}>No hay suspensiones vigentes</Text>
          <Text style={s.emptyBody}>
            Si no estás en el equipo de Movo tampoco vas a ver ninguna acá: es el permiso, no una
            pantalla rota.
          </Text>
        </View>
      ) : (
        <View style={s.list}>
          {list.map((row) => {
            const open = lifting === row.id;
            const ready = note.trim().length > 0;
            const name = row.person?.display_name ?? 'Perfil no visible';
            return (
              <View key={row.id} style={s.card}>
                <Text style={s.reason}>{name}</Text>
                <Text style={s.meta}>
                  Desde {formatSessionTime(row.starts_at)} · {suspensionUntilLabel(row.ends_at)}
                </Text>
                <Text style={s.details}>«{row.note}»</Text>

                {!open ? (
                  <View style={s.actions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Levantar la suspensión de ${name}`}
                      accessibilityHint="Pide una nota obligatoria y confirmación"
                      disabled={pending}
                      hitSlop={CONTROL_HIT_SLOP}
                      onPress={() => {
                        setLifting(row.id);
                        setNote('');
                      }}
                      style={s.action}
                    >
                      <Text style={s.actionText}>Levantar</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={s.confirm}>
                    <Text accessibilityRole="alert" aria-live="polite" style={s.confirmText}>
                      Levantar la suspensión le devuelve la cuenta a {name} y le avisa. Las sesiones
                      que se cancelaron no vuelven. Escribe por qué: la nota solo la ve el equipo.
                    </Text>
                    <TextInput
                      accessibilityLabel="Por qué se levanta"
                      maxLength={NOTE_LIMIT}
                      multiline
                      onChangeText={setNote}
                      placeholder="Por qué el equipo levanta esta suspensión"
                      placeholderTextColor={color.text.tertiary}
                      style={s.input}
                      value={note}
                    />
                    <Text style={s.counter}>
                      {note.length}/{NOTE_LIMIT}
                    </Text>
                    <View style={s.confirmRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Levantar la suspensión"
                        aria-busy={pending}
                        aria-disabled={!ready || pending}
                        disabled={!ready || pending}
                        onPress={() => {
                          lift(row.id);
                        }}
                        style={[s.confirmButton, (!ready || pending) && s.actionDisabled]}
                      >
                        <Text
                          style={[s.confirmButtonText, (!ready || pending) && s.actionDisabledText]}
                        >
                          {pending ? 'Guardando…' : 'Levantar la suspensión'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Volver"
                        accessibilityHint="Deja la suspensión como está"
                        hitSlop={CONTROL_HIT_SLOP}
                        onPress={() => {
                          setLifting(null);
                          setNote('');
                        }}
                        style={s.backButton}
                      >
                        <Text style={s.actionText}>Volver</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
