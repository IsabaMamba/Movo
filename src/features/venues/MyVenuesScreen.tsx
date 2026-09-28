/**
 * Mis lugares — the venues this person created, and correcting them.
 *
 * Each card puts the district somebody typed next to the district the map
 * resolves the point into. When they disagree the card says so, because that
 * disagreement is how the three wrong venues of 19 September were found — by
 * hand, in SQL — and it is the one thing an organizer can check in a glance.
 *
 * A verified venue is shared infrastructure and cannot be changed from here
 * (locations_update_own). An unverified one can have its name, address, typed
 * district and point corrected; moving the point re-resolves the district.
 */

import { Link, Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { parseCoordinates, type Coordinates } from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { districtMismatch, fetchMyVenues, updateVenue, type MyVenue } from '../../lib/venues';
import { color } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';

function mapUrl(point: Coordinates): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
}

function VenueEditor({
  venue,
  onSaved,
  onCancel,
}: {
  venue: MyVenue;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(venue.name);
  const [district, setDistrict] = useState(venue.district ?? '');
  const [address, setAddress] = useState(venue.address ?? '');
  const [raw, setRaw] = useState(`${venue.lat}, ${venue.lng}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseCoordinates(raw);
  const point = parsed.ok ? parsed.value : null;
  const moved = point !== null && (point.lat !== venue.lat || point.lng !== venue.lng);

  const missing: string[] = [];
  if (name.trim().length < 2) missing.push('pon el nombre del lugar');
  if (point === null) missing.push('revisa las coordenadas');
  const canSave = !busy && missing.length === 0;

  const save = () => {
    if (!canSave || point === null) return;
    setBusy(true);
    setError(null);
    updateVenue(supabase, venue.id, { name, district, address, lat: point.lat, lng: point.lng })
      .then(() => {
        onSaved(
          moved
            ? `Guardado. Movimos el punto de «${name.trim()}»; el distrito según el mapa se recalculó.`
            : `Guardado: «${name.trim()}».`,
        );
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar el lugar.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <View style={s.section}>
      <View style={s.field}>
        <Text style={s.label}>Nombre</Text>
        <TextInput
          accessibilityLabel="Nombre del lugar"
          maxLength={120}
          onChangeText={setName}
          style={s.input}
          value={name}
        />
      </View>
      <View style={s.field}>
        <View style={s.labelRow}>
          <Text style={s.label}>Distrito</Text>
          <Text style={s.optional}>como lo dice la gente</Text>
        </View>
        <TextInput
          accessibilityLabel="Distrito"
          maxLength={120}
          onChangeText={setDistrict}
          style={s.input}
          value={district}
        />
      </View>
      <View style={s.field}>
        <View style={s.labelRow}>
          <Text style={s.label}>Dirección</Text>
          <Text style={s.optional}>opcional</Text>
        </View>
        <TextInput
          accessibilityLabel="Dirección, opcional"
          maxLength={300}
          onChangeText={setAddress}
          style={s.input}
          value={address}
        />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Dónde queda</Text>
        <TextInput
          accessibilityLabel="Coordenadas o enlace del mapa"
          accessibilityHint="Pega el enlace de Google Maps o Waze, o las coordenadas: 9.9358, -84.1050"
          autoCapitalize="none"
          onChangeText={setRaw}
          placeholderTextColor={color.text.tertiary}
          style={[s.input, point === null && s.inputError]}
          value={raw}
        />
        {point !== null ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Ver ${point.lat}, ${point.lng} en el mapa`}
            onPress={() => {
              void Linking.openURL(mapUrl(point));
            }}
            style={s.link}
          >
            <Text style={s.linkText}>
              {point.lat}, {point.lng} · ver en el mapa
            </Text>
          </Pressable>
        ) : (
          <Text style={s.hint}>
            No encontramos coordenadas ahí. Pega el enlace completo de Google Maps o Waze.
          </Text>
        )}
      </View>

      {error !== null && (
        <View style={s.banner}>
          <Text accessibilityRole="alert" style={s.bannerText}>
            {error}
          </Text>
        </View>
      )}
      {missing.length > 0 && (
        <Text style={s.missing}>Para guardar falta: {missing.join(' · ')}</Text>
      )}

      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Guardando' : 'Guardar el lugar'}
          aria-disabled={!canSave}
          disabled={!canSave}
          onPress={save}
          style={[s.publish, s.rowItem, !canSave && s.publishDisabled]}
        >
          <Text style={s.publishText}>{busy ? 'Guardando…' : 'Guardar'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar la corrección"
          onPress={onCancel}
          style={[s.chip, s.rowItem]}
        >
          <Text style={s.chipText}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function MyVenuesScreen() {
  const { session, loading } = useAuth();
  const [venues, setVenues] = useState<MyVenue[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setVenues(await fetchMyVenues(supabase, userId));
  }, [userId]);

  useEffect(() => {
    load().catch((cause: unknown) => {
      setVenues([]);
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus lugares.');
    });
  }, [load]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/organizar" style={s.link}>
        <Text style={s.linkText}>← Organizar</Text>
      </Link>

      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>
          Mis lugares
        </Text>
        <Text style={s.subtitle}>
          Los lugares que agregaste. Si un punto quedó mal, las sesiones de ahí no salen donde
          deberían en Descubrir.
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

      {venues === null ? (
        <ActivityIndicator />
      ) : venues.length === 0 ? (
        <Text style={s.hint}>
          Todavía no agregaste ningún lugar. Se agregan desde Crear sesión.
        </Text>
      ) : (
        venues.map((venue) => {
          const mismatch = districtMismatch(venue.district, venue.zoneName);
          return (
            <View key={venue.id} style={[s.venue, mismatch && s.inputError]}>
              <Text style={s.venueName}>{venue.name}</Text>
              <Text style={s.venueMeta}>
                Escrito: {venue.district?.trim() || 'sin distrito'} · Según el mapa:{' '}
                {venue.zoneName ?? 'fuera de Costa Rica'}
              </Text>
              {mismatch && (
                <Text style={s.missing}>
                  No coinciden: puede que el punto esté mal, o el distrito que escribiste. Ábrelo en
                  el mapa y corrige lo que esté mal.
                </Text>
              )}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Ver ${venue.name} en el mapa`}
                onPress={() => {
                  void Linking.openURL(mapUrl(venue));
                }}
                style={s.link}
              >
                <Text style={s.linkText}>
                  {venue.lat}, {venue.lng} · ver en el mapa
                </Text>
              </Pressable>

              {venue.is_verified ? (
                <Text style={s.hint}>Verificado: ya no se puede cambiar desde la app.</Text>
              ) : editing === venue.id ? (
                <VenueEditor
                  onCancel={() => {
                    setEditing(null);
                  }}
                  onSaved={(message) => {
                    setEditing(null);
                    setNotice(message);
                    load().catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : 'No se pudo recargar.');
                    });
                  }}
                  venue={venue}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Corregir ${venue.name}`}
                  onPress={() => {
                    setNotice(null);
                    setEditing(venue.id);
                  }}
                  style={s.chip}
                >
                  <Text style={s.chipText}>Corregir</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
