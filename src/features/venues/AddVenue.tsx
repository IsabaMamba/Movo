/**
 * Agregar lugar.
 *
 * Until this existed, every session in Movo had to be held at one of the
 * venues somebody had inserted into the database by hand — in practice, one
 * park. `locations` already granted INSERT to any authenticated user with the
 * policy pinning `created_by` and `is_public_venue`; what was missing was a
 * way to say where the place is.
 *
 * There is no map in the product yet, so the coordinate is pasted from Google
 * Maps or Waze, or taken from the device. Both paths end the same way: the
 * pair is read back as numbers with a link that opens it on a map, because a
 * wrong coordinate does not announce itself — it just removes the session
 * from Descubrir, or sends somebody to the wrong corner of the city.
 *
 * It renders inline rather than on its own route on purpose. The create form
 * holds a screenful of unsaved state by the time somebody discovers their
 * venue is missing, and navigating away to add it would throw that away.
 */

import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';

import { createVenue, parseCoordinates, type Coordinates } from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { color } from '../../theme';
import type { Location } from '../../types/database';
import { venueStyles as s } from './styles';

interface Props {
  userId: string;
  /** The saved venue, so the caller can add it to its list and select it. */
  onCreated: (venue: Location) => void;
}

/** Present on web and absent on native, where expo-location is not installed. */
function geolocation(): Geolocation | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.geolocation ?? null;
}

const PASTE_HINT = 'Pegá el enlace de Google Maps o Waze, o las coordenadas: 9.9358, -84.1050';

export function AddVenue({ userId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [raw, setRaw] = useState('');
  const [point, setPoint] = useState<Coordinates | null>(null);
  const [coordError, setCoordError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Location | null>(null);

  const readCoordinates = (text: string) => {
    setRaw(text);
    setSaved(null);

    if (!text.trim()) {
      setPoint(null);
      setCoordError(null);
      return;
    }

    const parsed = parseCoordinates(text);
    if (parsed.ok) {
      setPoint(parsed.value);
      setCoordError(null);
      return;
    }

    setPoint(null);
    switch (parsed.reason) {
      case 'short_link':
        setCoordError(
          'Ese enlace corto no trae las coordenadas. Abrilo en el mapa y copiá la dirección completa de la barra, o las coordenadas.',
        );
        break;
      case 'out_of_range':
        setCoordError(
          `Eso da ${parsed.value.lat}, ${parsed.value.lng}, que no queda en Costa Rica. Puede que el par esté al revés: primero la latitud (9 y algo), después la longitud (-84 y algo).`,
        );
        break;
      default:
        setCoordError('No encontramos coordenadas ahí.');
    }
  };

  const useMyLocation = () => {
    const geo = geolocation();
    if (!geo) {
      setCoordError('Este dispositivo no comparte ubicación desde el navegador. Pegá el enlace.');
      return;
    }

    setLocating(true);
    setCoordError(null);
    geo.getCurrentPosition(
      (position) => {
        setLocating(false);
        // Same validation as a pasted pair: a device can be wrong too, and a
        // desktop browser geolocating by IP lands wherever the ISP says.
        readCoordinates(`${position.coords.latitude},${position.coords.longitude}`);
      },
      () => {
        setLocating(false);
        setCoordError(
          'No pudimos leer tu ubicación. Puede que el navegador la tenga bloqueada — pegá el enlace.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const missing: string[] = [];
  if (name.trim().length < 2) missing.push('poné el nombre del lugar');
  if (point === null) missing.push('marcá dónde queda');
  const canSave = !busy && missing.length === 0;

  const save = () => {
    if (!canSave || !point) return;
    setBusy(true);
    setError(null);

    createVenue(supabase, userId, { name, district, address, lat: point.lat, lng: point.lng })
      .then((venue) => {
        setSaved(venue);
        onCreated(venue);
        // Cleared rather than kept: the next venue is a different place, and a
        // pre-filled coordinate is the easiest way to save two names onto one
        // point.
        setName('');
        setDistrict('');
        setAddress('');
        setRaw('');
        setPoint(null);
        setOpen(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar el lugar.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (!open) {
    return (
      <View>
        {saved && (
          <View style={s.banner}>
            {/* Same evidence rule as publishing a session: the confirmation
                quotes the row, so "se guardó" is checkable. */}
            <Text accessibilityRole="alert" style={s.bannerText}>
              {saved.name} quedó agregado y ya está seleccionado · id {saved.id.slice(0, 8)}
            </Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar un lugar"
          accessibilityHint="Abre el formulario para agregar un lugar público nuevo."
          onPress={() => {
            setOpen(true);
          }}
          style={s.toggle}
        >
          <Text style={s.toggleText}>¿No está el lugar? Agregalo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>Agregar un lugar</Text>

      <View style={s.shared}>
        <Text style={s.sharedText}>
          Los lugares son compartidos: apenas lo guardes, cualquier persona que organice lo va a ver
          en su lista. Por eso solo van lugares públicos — un parque, una cancha, una plaza. Nunca
          una casa.
        </Text>
      </View>

      <View style={s.field}>
        <Text style={s.label}>Nombre</Text>
        <TextInput
          accessibilityLabel="Nombre del lugar"
          autoCapitalize="words"
          onChangeText={setName}
          placeholder="Parque de La Paz"
          placeholderTextColor={color.text.tertiary}
          style={s.input}
          value={name}
        />
      </View>

      <View style={s.field}>
        <View style={s.labelRow}>
          <Text style={s.label}>Distrito</Text>
          <Text style={s.optional}>opcional</Text>
        </View>
        <TextInput
          accessibilityLabel="Distrito"
          autoCapitalize="words"
          onChangeText={setDistrict}
          placeholder="San Sebastián"
          placeholderTextColor={color.text.tertiary}
          style={s.input}
          value={district}
        />
      </View>

      <View style={s.field}>
        <View style={s.labelRow}>
          <Text style={s.label}>Señas</Text>
          <Text style={s.optional}>opcional</Text>
        </View>
        <TextInput
          accessibilityLabel="Señas del lugar"
          onChangeText={setAddress}
          placeholder="Entrada por el costado sur, frente a la parada."
          placeholderTextColor={color.text.tertiary}
          style={s.input}
          value={address}
        />
      </View>

      <View style={s.field}>
        <Text style={s.label}>¿Dónde queda?</Text>
        <View style={s.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={locating ? 'Buscando tu ubicación' : 'Usar mi ubicación'}
            accessibilityState={{ disabled: locating }}
            disabled={locating}
            onPress={useMyLocation}
            style={s.ghost}
          >
            <Text style={s.ghostText}>{locating ? 'Buscando…' : 'Usar mi ubicación'}</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Enlace o coordenadas del lugar"
          accessibilityHint={PASTE_HINT}
          autoCapitalize="none"
          onChangeText={readCoordinates}
          placeholder="https://maps.google.com/…  o  9.9358, -84.1050"
          placeholderTextColor={color.text.tertiary}
          style={[s.input, coordError !== null && s.inputError]}
          value={raw}
        />
        {coordError !== null ? (
          <Text accessibilityRole="alert" style={s.error}>
            {coordError}
          </Text>
        ) : (
          <Text style={s.hint}>{PASTE_HINT}</Text>
        )}
      </View>

      {point && (
        <View style={s.readback}>
          <Text style={s.readbackValue}>
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          </Text>
          <Text style={s.readbackLabel}>latitud, longitud</Text>
          {/* The only way to catch a coordinate that parsed fine and still
              points at the wrong block. */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Ver este punto en el mapa"
            accessibilityHint="Abre el punto en Google Maps, en otra pestaña."
            onPress={() => {
              void Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`,
              );
            }}
          >
            <Text style={s.verify}>Ver en el mapa antes de guardar</Text>
          </Pressable>
        </View>
      )}

      {error !== null && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      {missing.length > 0 && (
        <Text style={s.missing}>Para guardar falta: {missing.join(' · ')}</Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Guardando' : 'Guardar lugar'}
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={save}
        style={[s.save, !canSave && s.saveDisabled]}
      >
        <Text style={s.saveText}>{busy ? 'Guardando…' : 'Guardar lugar'}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancelar"
        onPress={() => {
          setOpen(false);
          setError(null);
        }}
        style={s.toggle}
      >
        <Text style={s.toggleText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}
