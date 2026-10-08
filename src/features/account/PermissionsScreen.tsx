/**
 * Tus permisos — every consent in one place (audit of 7 October, item 11).
 *
 * Until now the four lived on four screens: the rules at sign-up, location
 * behind «Cerca de mí», push on /avisos, attendance history on /historial.
 * Nobody could see at a glance what they had agreed to. This screen shows
 * each one with its state and the one control that changes it, and when the
 * log (0030) has a date, the date and the version of the text.
 *
 * Each control is the real one, not a copy: push is the same switch as on
 * /avisos, history links to the screen that holds its confirmations, and
 * location points at the device setting, because a browser or a phone
 * permission can only be taken back where it was given.
 *
 * Deliberately not a cookie banner (audit item 11): Movo sets no
 * non-essential cookies, so there is nothing of that kind to consent to.
 */

import * as Location from 'expo-location';
import { Link, Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { fetchAttendanceConsent } from '../../lib/attendanceHistory';
import {
  consentDateLabel,
  fetchMyConsents,
  inForce,
  recordConsent,
  rulesStatus,
  type ConsentPurpose,
  type ConsentRow,
} from '../../lib/consents';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';
import { PushSwitch } from '../notifications/PushSwitch';
import { RULES_VERSION } from '../rules/rules';

type DeviceLocation = 'granted' | 'denied' | 'undetermined' | 'unknown';

interface Loaded {
  current: Partial<Record<ConsentPurpose, ConsentRow>>;
  historyOn: boolean;
  device: DeviceLocation;
}

async function deviceLocation(): Promise<DeviceLocation> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === Location.PermissionStatus.GRANTED) return 'granted';
    if (status === Location.PermissionStatus.DENIED) return 'denied';
    return 'undetermined';
  } catch {
    return 'unknown';
  }
}

function since(row: ConsentRow | undefined): string {
  return row ? ` Desde el ${consentDateLabel(row.recorded_at)}.` : '';
}

const DEVICE_TEXT: Record<DeviceLocation, string> = {
  granted: 'En este dispositivo está permitida.',
  denied: 'En este dispositivo está bloqueada.',
  undetermined: 'En este dispositivo todavía no se ha pedido.',
  unknown: 'No se pudo saber si este dispositivo la permite.',
};

export function PermissionsScreen() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [rows, history, device] = await Promise.all([
      fetchMyConsents(supabase),
      fetchAttendanceConsent(supabase),
      deviceLocation(),
    ]);
    setState({ current: inForce(rows), historyOn: history !== null, device });
  }, []);

  useEffect(() => {
    if (!userId) return;
    load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus permisos.');
    });
  }, [userId, load]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const rules = state ? rulesStatus(state.current.rules, RULES_VERSION) : null;

  const acceptRules = () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    void recordConsent(supabase, 'rules', RULES_VERSION, true)
      .then(async (ok) => {
        if (!ok) {
          setError('No se pudo guardar. Intenta de nuevo.');
          return;
        }
        await load();
        setNotice('Listo: quedó guardado que aceptas la versión actual de las normas.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <ScrollView
      aria-busy={state === null || busy}
      contentContainerStyle={s.content}
      style={s.screen}
    >
      <Link href="/cuenta" style={s.link}>
        <Text style={s.linkText}>← Mi cuenta</Text>
      </Link>

      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>
          Tus permisos
        </Text>
        <Text style={s.subtitle}>
          Lo que le permites a Movo, desde cuándo y cómo cambiarlo. Movo no usa cookies de
          publicidad ni de medición, así que no hay nada de eso que aceptar.
        </Text>
      </View>

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

      {state === null ? (
        error === null && <ActivityIndicator />
      ) : (
        <>
          <View style={s.section}>
            <Text accessibilityRole="header" style={s.label}>
              Normas de la comunidad
            </Text>
            <Text style={s.hint}>
              {rules === 'current'
                ? `Aceptaste la versión actual.${since(state.current.rules)}`
                : rules === 'outdated'
                  ? `Aceptaste una versión anterior el ${consentDateLabel(state.current.rules?.recorded_at ?? '')}. Las normas cambiaron desde entonces.`
                  : 'No tenemos guardado qué versión aceptaste: tu cuenta es de antes de que Movo lo guardara.'}
            </Text>
            <Text style={s.hint}>
              Son la condición para usar Movo. Para dejar de aceptarlas, puedes borrar tu cuenta
              desde Mi cuenta.
            </Text>
            <View style={s.chipRow}>
              <Link href="/normas" style={s.chip}>
                <Text style={s.chipText}>Leer las normas</Text>
              </Link>
              {rules !== 'current' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Acepto la versión actual de las normas"
                  aria-disabled={busy}
                  disabled={busy}
                  onPress={acceptRules}
                  style={s.chip}
                >
                  <Text style={s.chipText}>{busy ? 'Guardando…' : 'Acepto la versión actual'}</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={s.section}>
            <Text accessibilityRole="header" style={s.label}>
              Ubicación
            </Text>
            <Text style={s.hint}>
              Solo se usa cuando tocas «Cerca de mí» en Descubrir, redondeada a un kilómetro, y no
              se guarda.{' '}
              {state.current.location
                ? `La permitiste el ${consentDateLabel(state.current.location.recorded_at)}.`
                : 'No tenemos registro de que la hayas permitido.'}{' '}
              {DEVICE_TEXT[state.device]}
            </Text>
            {Platform.OS === 'web' ? (
              <Text style={s.hint}>
                Para quitarla, cámbiala en la configuración del sitio de tu navegador (el candado
                junto a la dirección). Si no la quitas, igual solo se usa cuando tocas «Cerca de
                mí».
              </Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Abrir la configuración del teléfono para cambiar la ubicación"
                onPress={() => {
                  void Linking.openSettings();
                }}
                style={s.chip}
              >
                <Text style={s.chipText}>Cambiar en la configuración</Text>
              </Pressable>
            )}
          </View>

          <View style={s.section}>
            <Text accessibilityRole="header" style={s.label}>
              Avisos fuera de la app
            </Text>
            <Text style={s.hint}>
              {state.current.push
                ? `Los activaste el ${consentDateLabel(state.current.push.recorded_at)}. Se activan y se apagan por dispositivo.`
                : 'Se activan y se apagan por dispositivo.'}
            </Text>
            <PushSwitch />
          </View>

          <View style={s.section}>
            <Text accessibilityRole="header" style={s.label}>
              Historial de asistencia
            </Text>
            <Text style={s.hint}>
              {state.historyOn
                ? `Activado.${since(state.current.attendance_history)} Guarda el deporte, el distrito y la franja del día de las sesiones a las que llegas, y se borra solo a los 90 días.`
                : 'Apagado. Movo no guarda a dónde vas.'}
            </Text>
            <Link href="/historial" style={s.chip}>
              <Text style={s.chipText}>
                {state.historyOn ? 'Ver, borrar o apagar' : 'Ver qué guarda y activarlo'}
              </Text>
            </Link>
          </View>
        </>
      )}
    </ScrollView>
  );
}
