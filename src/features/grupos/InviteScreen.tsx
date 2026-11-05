/**
 * «Te invita a…» (Grupos v1 · 7): what somebody sees when they open a
 * group's invitation link.
 *
 * Readable signed out, because a person should be able to read a group's
 * rules before making an account to join it (invite_preview, 0046). A code
 * that does not work says so in one sentence and shows nothing of the group.
 */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { fetchCategories } from '../../lib/activities';
import { groupInitials } from '../../lib/groups';
import { fetchInvitePreview, joinGroupWithCode, type InvitePreview } from '../../lib/invites';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { sportColor } from '../../theme/sport';
import type { Category } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../nav/Icon';
import { gruposStyles as s } from './styles';

export function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    fetchInvitePreview(supabase, code)
      .then(setPreview)
      .catch(() => {
        setPreview(null);
      });
    void fetchCategories(supabase)
      .then(setCategories)
      .catch(() => undefined);
  }, [code, session]);

  if (joined) return <Redirect href={{ pathname: '/grupos/[slug]', params: { slug: joined } }} />;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/grupos');
  };

  const join = () => {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    joinGroupWithCode(supabase, code)
      .then(({ slug }) => {
        setJoined(slug);
      })
      .catch((cause: unknown) => {
        setBusy(false);
        setError(cause instanceof Error ? cause.message : 'No se pudo entrar al grupo.');
      });
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <View style={s.settingsTop}>
        <Pressable
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={close}
        >
          <Icon color={color.text.primary} name="close" size={22} />
        </Pressable>
        <Text style={s.settingsTitle}>Invitación</Text>
      </View>

      {preview === undefined ? (
        <ActivityIndicator />
      ) : preview === null ? (
        <View style={s.empty}>
          <Text style={s.sectionTitle}>Este enlace ya no sirve</Text>
          <Text style={s.emptyBody}>
            Venció, ya lo usaron todas las veces que se podía o lo desactivaron. Pídele uno nuevo a
            quien te lo mandó.
          </Text>
        </View>
      ) : (
        <View style={s.inviteBody}>
          <View
            aria-hidden
            style={[
              s.tileBig,
              { backgroundColor: sportColor(preview.categoryIds[0] ?? '', color.accent.primary) },
            ]}
          >
            <Text style={s.tileTextBig}>{groupInitials(preview.name)}</Text>
          </View>
          {preview.invitedBy && (
            <Text style={s.cardFacts}>
              <Text style={s.inviteStrong}>{preview.invitedBy}</Text> te invita a
            </Text>
          )}
          <Text accessibilityRole="header" style={s.inviteName}>
            {preview.name}
          </Text>
          <View style={[s.chipRow, s.inviteChips]}>
            <View style={s.filterChip}>
              <Text style={s.filterChipText}>
                {preview.isPublic ? 'Grupo abierto' : 'Con invitación'}
              </Text>
            </View>
            {preview.categoryIds.map((id) => (
              <View key={id} style={s.filterChip}>
                <View style={[s.dot, { backgroundColor: sportColor(id) }]} />
                <Text style={s.filterChipText}>
                  {categories.find((c) => c.id === id)?.name_es ?? id}
                </Text>
              </View>
            ))}
            <View style={s.filterChip}>
              <Text style={s.filterChipText}>
                {preview.members} {preview.members === 1 ? 'persona' : 'personas'}
              </Text>
            </View>
          </View>
          {preview.description ? <Text style={s.cardBody}>{preview.description}</Text> : null}

          <View style={s.rules}>
            <Text style={s.rulesLabel}>Reglas del grupo</Text>
            <Text style={s.rulesText}>
              {preview.rules ?? 'Este grupo no tiene reglas propias.'}
            </Text>
          </View>

          {error !== null && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}

          {preview.already ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                router.replace({ pathname: '/grupos/[slug]', params: { slug: preview.slug } });
              }}
              style={s.primary}
            >
              <Text style={s.primaryText}>Ya estás en el grupo · Abrirlo</Text>
            </Pressable>
          ) : session ? (
            <Pressable
              accessibilityRole="button"
              aria-disabled={busy}
              disabled={busy}
              onPress={join}
              style={[s.primary, busy && s.primaryDisabled]}
            >
              <Text style={s.primaryText}>{busy ? 'Un momento…' : 'Unirme al grupo'}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                router.push({ pathname: '/sign-in', params: { next: `/g/${code ?? ''}` } });
              }}
              style={s.primary}
            >
              <Text style={s.primaryText}>Inicia sesión para unirte</Text>
            </Pressable>
          )}
          <Text style={s.hint}>
            Al unirte aceptas las reglas del grupo y las normas de Movo. Puedes salir cuando
            quieras.
          </Text>
          {!session && <Text style={s.hint}>Al iniciar sesión vuelves aquí para unirte.</Text>}
        </View>
      )}
    </ScrollView>
  );
}
