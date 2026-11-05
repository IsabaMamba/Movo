/**
 * «Cancelar por alerta de la CNE», for the team (0041, Equipo v1).
 *
 * The third fixed rule of every water session: if the CNE declares an alert
 * for an area, its surf, kayak and rafting sessions are cancelled. An alert
 * covers a provincia, a cantón or a distrito, so the team picks any of the
 * three, says until when, and writes the alert as the CNE words it — that
 * text is what every person going reads. Only water sessions; nothing else
 * in the area is touched.
 */

import { Link, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { amIStaff } from '../../lib/venues';
import { cancelWaterSessionsInZone } from '../../lib/weather';
import { fetchZoneOptions, searchZones, type ZoneOption } from '../../lib/zones';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { staffStyles as s } from './styles';

const UNTIL_HOURS = [12, 24, 48, 72];
const ALERT_LIMIT = 200;

export function WeatherCancelScreen() {
  const { session, loading } = useAuth();
  const [staff, setStaff] = useState<boolean | null>(null);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState<ZoneOption | null>(null);
  const [hours, setHours] = useState(24);
  const [alert, setAlert] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ text: string; bad: boolean } | null>(null);

  useEffect(() => {
    if (!session) return;
    void amIStaff(supabase).then((yes) => {
      setStaff(yes);
      if (yes) {
        void fetchZoneOptions(supabase)
          .then(setZones)
          .catch(() => undefined);
      }
    });
  }, [session]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;
  if (staff === null) return <ActivityIndicator style={s.screen} />;
  if (!staff) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        <Text style={s.title}>Cancelar por alerta</Text>
        <Text style={s.subtitle}>Solo el equipo de Movo puede cancelar por zona.</Text>
      </ScrollView>
    );
  }

  const ready = zone !== null && alert.trim().length > 0;

  const run = () => {
    if (!zone || !ready || busy) return;
    setBusy(true);
    setBanner(null);
    const until = new Date(Date.now() + hours * 60 * 60_000);
    cancelWaterSessionsInZone(supabase, zone.code, until, alert)
      .then(({ sessionsCancelled, peopleNotified }) => {
        setConfirming(false);
        setAlert('');
        setBanner({
          text:
            sessionsCancelled === 0
              ? `No había sesiones de agua en ${zone.label} en las próximas ${hours} horas.`
              : `Se ${sessionsCancelled === 1 ? 'canceló 1 sesión' : `cancelaron ${sessionsCancelled} sesiones`} de agua en ${zone.label}. Avisamos a ${peopleNotified} ${peopleNotified === 1 ? 'persona' : 'personas'}.`,
          bad: false,
        });
      })
      .catch((cause: unknown) => {
        setBanner({
          text: cause instanceof Error ? cause.message : 'No se pudo cancelar.',
          bad: true,
        });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <ScrollView aria-busy={busy} contentContainerStyle={s.content} style={s.screen}>
      <Link href="/staff/reportes" style={s.back}>
        <Text style={s.backText}>← Reportes</Text>
      </Link>
      <View>
        <Text accessibilityRole="header" style={s.title}>
          Cancelar por alerta de la CNE
        </Text>
        <Text style={s.subtitle}>
          Cancela las sesiones de surf, kayak y rafting de una zona. Nada más se toca: otros
          deportes los decide quien organiza. A cada persona que iba le llega la alerta tal como la
          escribas.
        </Text>
      </View>

      {banner !== null && (
        <View style={[s.banner, banner.bad && s.bannerBad]}>
          <Text accessibilityRole="alert" style={[s.bannerText, banner.bad && s.bannerTextBad]}>
            {banner.text}
          </Text>
        </View>
      )}

      <Text style={s.sectionTitle}>Zona</Text>
      {zone ? (
        <View style={s.filterRow}>
          <View style={[s.chip, s.chipOn]}>
            <Text style={[s.chipText, s.chipTextOn]}>✓ {zone.label}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            hitSlop={hitSlopFor(size.controlSm)}
            onPress={() => {
              setZone(null);
              setConfirming(false);
            }}
            style={s.chip}
          >
            <Text style={s.chipText}>Cambiar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            accessibilityLabel="Buscar provincia, cantón o distrito"
            onChangeText={setQuery}
            placeholder="Provincia, cantón o distrito"
            placeholderTextColor={color.text.tertiary}
            style={s.input}
            value={query}
          />
          {searchZones(zones, query).map((option) => (
            <Pressable
              accessibilityRole="button"
              key={option.code}
              onPress={() => {
                setZone(option);
                setQuery('');
              }}
              style={s.chip}
            >
              <Text style={s.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={s.sectionTitle}>Hasta cuándo</Text>
      <View accessibilityRole="radiogroup" style={s.filterRow}>
        {UNTIL_HOURS.map((h) => {
          const on = hours === h;
          return (
            <Pressable
              accessibilityRole="radio"
              aria-checked={on}
              hitSlop={hitSlopFor(size.controlSm)}
              key={h}
              onPress={() => {
                setHours(h);
              }}
              style={[s.chip, on && s.chipOn]}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>Próximas {h} h</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.sectionTitle}>La alerta, como la dice la CNE</Text>
      <TextInput
        accessibilityLabel="La alerta de la CNE"
        maxLength={ALERT_LIMIT}
        multiline
        onChangeText={setAlert}
        placeholder="Alerta amarilla por lluvias en el Pacífico Central"
        placeholderTextColor={color.text.tertiary}
        style={s.input}
        value={alert}
      />
      <Text style={s.counter}>
        {alert.length}/{ALERT_LIMIT}
      </Text>

      {confirming && zone ? (
        <View style={s.confirm}>
          <Text style={s.confirmText}>
            Se cancelan todas las sesiones de agua en {zone.label} que empiezan en las próximas{' '}
            {hours} horas. No se puede deshacer.
          </Text>
          <View style={s.confirmRow}>
            <Pressable
              accessibilityRole="button"
              aria-disabled={busy}
              disabled={busy}
              onPress={run}
              style={s.confirmButton}
            >
              <Text style={s.confirmButtonText}>{busy ? '…' : 'Sí, cancelar'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setConfirming(false);
              }}
              style={s.backButton}
            >
              <Text style={s.actionText}>No</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          aria-disabled={!ready}
          disabled={!ready}
          onPress={() => {
            setConfirming(true);
          }}
          style={[s.action, s.actionGrave, !ready && s.actionDisabled]}
        >
          <Text style={[s.actionText, s.actionGraveText, !ready && s.actionDisabledText]}>
            Cancelar las sesiones de agua…
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
