/**
 * Lugares por verificar — the team's side of 0027.
 *
 * Venues are public, so anybody could open this list; what they cannot do is
 * act on it. The screen asks is_staff() about the caller first and shows the
 * controls only to staff, rather than offering buttons that fail with 42501.
 *
 * Each card carries what a reviewer needs to decide without leaving it: the
 * district somebody typed against the one the map resolves, a link that opens
 * the point, and who created it. Verifying needs a note saying what was
 * checked, and the function stamps who verified it.
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

import { formatSessionTime } from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import {
  amIStaff,
  districtMismatch,
  explainVerifyError,
  fetchVenuesForReview,
  unverifyVenue,
  verifyVenue,
  type StaffVenue,
} from '../../lib/venues';
import { color } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { staffStyles as s } from './styles';

const NOTE_LIMIT = 280;

type Acting = { id: string; kind: 'verify' | 'unverify' } | null;

export function VenueReviewScreen() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;

  const [staff, setStaff] = useState<boolean | null>(null);
  const [venues, setVenues] = useState<StaffVenue[] | null>(null);
  const [acting, setActing] = useState<Acting>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<{ text: string; bad: boolean } | null>(null);

  const load = useCallback(async () => {
    setVenues(await fetchVenuesForReview(supabase));
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void amIStaff(supabase).then((yes) => {
      if (cancelled) return;
      setStaff(yes);
      if (yes) {
        load().catch((cause: unknown) => {
          setVenues([]);
          setBanner({
            text: cause instanceof Error ? cause.message : 'No se pudieron cargar los lugares.',
            bad: true,
          });
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;
  if (staff === null) return <ActivityIndicator style={s.screen} />;

  if (!staff) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        <Link href="/" style={s.back}>
          <Text style={s.backText}>← Descubrir</Text>
        </Link>
        <Text style={s.title}>Lugares por verificar</Text>
        <Text style={s.subtitle}>Solo el equipo de Movo puede verificar lugares.</Text>
      </ScrollView>
    );
  }

  const act = () => {
    if (acting === null || note.trim().length === 0) return;
    setPending(true);
    setBanner(null);
    const call = acting.kind === 'verify' ? verifyVenue : unverifyVenue;
    call(supabase, acting.id, note)
      .then(async () => {
        const name = venues?.find((v) => v.id === acting.id)?.name ?? 'El lugar';
        setActing(null);
        setNote('');
        await load();
        setBanner({
          text:
            acting.kind === 'verify'
              ? `«${name}» quedó verificado. Quien lo creó ya no puede moverlo.`
              : `«${name}» ya no está verificado. Quien lo creó puede volver a corregirlo.`,
          bad: false,
        });
      })
      .catch((cause: unknown) => {
        setBanner({ text: explainVerifyError(cause), bad: true });
      })
      .finally(() => {
        setPending(false);
      });
  };

  const pendingCount = (venues ?? []).filter((v) => !v.is_verified).length;

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/staff/reportes" style={s.back}>
        <Text style={s.backText}>← Reportes</Text>
      </Link>

      <View>
        <Text accessibilityRole="header" style={s.title}>
          Lugares por verificar
        </Text>
        <Text style={s.subtitle}>
          Verificar dice que alguien del equipo revisó que el lugar es real, público y con nombre, y
          que el punto está sobre él. Desde ese momento quien lo creó ya no puede moverlo.
        </Text>
      </View>

      {banner !== null && (
        <View style={[s.banner, banner.bad && s.bannerBad]}>
          <Text accessibilityRole="alert" style={[s.bannerText, banner.bad && s.bannerTextBad]}>
            {banner.text}
          </Text>
        </View>
      )}

      {venues === null ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={s.hint}>
            {pendingCount === 0
              ? 'No queda ningún lugar por verificar.'
              : pendingCount === 1
                ? '1 lugar sin verificar.'
                : `${pendingCount} lugares sin verificar.`}
          </Text>
          <View style={s.list}>
            {venues.map((venue) => {
              const mismatch = districtMismatch(venue.district, venue.zoneName);
              const open = acting?.id === venue.id;
              return (
                <View key={venue.id} style={s.card}>
                  <View style={s.cardTop}>
                    <View style={[s.badge, venue.is_verified ? s.badgeDone : s.badgeOpen]}>
                      <Text
                        style={[s.badgeText, venue.is_verified ? s.badgeDoneText : s.badgeOpenText]}
                      >
                        {venue.is_verified ? 'Verificado' : 'Sin verificar'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.subjectTitle}>{venue.name}</Text>
                  <Text style={s.meta}>
                    Escrito: {venue.district?.trim() || 'sin distrito'} · Según el mapa:{' '}
                    {venue.zoneName ?? 'ningún distrito'}
                  </Text>
                  {mismatch && (
                    <Text style={s.reason}>No coinciden: revisa el punto antes de verificar.</Text>
                  )}
                  {venue.zoneName === null && (
                    <Text style={s.reason}>
                      El punto no cae en ningún distrito: no se puede verificar así.
                    </Text>
                  )}
                  <Text style={s.meta}>
                    {venue.creatorName !== null
                      ? `Lo agregó ${venue.creatorName}.`
                      : venue.createdBy === null
                        ? 'Lo cargó el equipo.'
                        : 'Quien lo agregó ya no está visible.'}
                    {venue.verifiedAt !== null
                      ? ` Última revisión: ${formatSessionTime(venue.verifiedAt)}${venue.verifiedNote ? ` — «${venue.verifiedNote}»` : ''}.`
                      : ''}
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Ver ${venue.name} en el mapa`}
                    onPress={() => {
                      void Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`,
                      );
                    }}
                    style={s.back}
                  >
                    <Text style={s.linkText}>
                      {venue.lat}, {venue.lng} · ver en el mapa
                    </Text>
                  </Pressable>

                  {open ? (
                    <View style={s.confirm}>
                      <Text style={s.confirmText}>
                        {acting.kind === 'verify'
                          ? '¿Qué revisaste? Queda guardado con tu nombre.'
                          : '¿Por qué quitas la verificación? Queda guardado con tu nombre.'}
                      </Text>
                      <TextInput
                        accessibilityLabel="Nota de la revisión"
                        maxLength={NOTE_LIMIT}
                        multiline
                        onChangeText={setNote}
                        placeholder={
                          acting.kind === 'verify'
                            ? 'Cancha pública, el punto está en la entrada'
                            : 'Lo verifiqué por error'
                        }
                        placeholderTextColor={color.text.tertiary}
                        style={s.input}
                        value={note}
                      />
                      <View style={s.confirmRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            acting.kind === 'verify'
                              ? 'Sí, verificar'
                              : 'Sí, quitar la verificación'
                          }
                          aria-disabled={pending || note.trim().length === 0}
                          disabled={pending || note.trim().length === 0}
                          onPress={act}
                          style={s.confirmButton}
                        >
                          <Text style={s.confirmButtonText}>
                            {pending
                              ? '…'
                              : acting.kind === 'verify'
                                ? 'Sí, verificar'
                                : 'Sí, quitar'}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Cancelar"
                          onPress={() => {
                            setActing(null);
                            setNote('');
                          }}
                          style={s.backButton}
                        >
                          <Text style={s.actionText}>Cancelar</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={s.actions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          venue.is_verified
                            ? `Quitar la verificación de ${venue.name}`
                            : `Verificar ${venue.name}`
                        }
                        onPress={() => {
                          setBanner(null);
                          setNote('');
                          setActing({
                            id: venue.id,
                            kind: venue.is_verified ? 'unverify' : 'verify',
                          });
                        }}
                        style={[s.action, s.actionGrave]}
                      >
                        <Text style={[s.actionText, s.actionGraveText]}>
                          {venue.is_verified ? 'Quitar verificación' : 'Verificar'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}
