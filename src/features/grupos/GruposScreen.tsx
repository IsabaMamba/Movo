/**
 * Grupos — the list, and creating one.
 *
 * People name themselves before they organise anything: Mejengueros, Real
 * Madrid Ticos. The schema has modelled that since the foundation and nothing
 * has ever written a row.
 *
 * Public groups are readable by anyone, including signed-out visitors, because
 * the read policy allows it — a stranger should be able to see that a club
 * exists before deciding to join.
 */

import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  createCommunity,
  fetchCommunities,
  slugify,
  type CommunityWithCount,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { gruposStyles as s } from './styles';

/**
 * The visibility chips render at `size.controlSm` (36px), so the target is
 * padded back up to 44 without changing how big the chips look.
 */
const CHIP_HIT_SLOP = hitSlopFor(size.controlSm);

export function GruposScreen() {
  const { session } = useAuth();
  const router = useRouter();

  const [communities, setCommunities] = useState<CommunityWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetchCommunities(supabase)
      .then(setCommunities)
      .catch((cause: unknown) => {
        setCommunities([]);
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los grupos.');
      });
  };

  useEffect(load, []);

  const slug = slugify(name);
  const canCreate = !busy && name.trim().length >= 2 && slug.length >= 2;

  const submit = () => {
    if (!canCreate || !session) return;
    setBusy(true);
    setError(null);
    createCommunity(supabase, session.user.id, { name, slug, description, isPublic })
      .then((community) => {
        setCreating(false);
        setName('');
        setDescription('');
        router.push({ pathname: '/grupos/[slug]', params: { slug: community.slug } });
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? // The slug is unique; the constraint message is not a sentence.
              /duplicate|unique/i.test(cause.message)
              ? 'Ya existe un grupo con ese nombre. Probá otro.'
              : cause.message
            : 'No se pudo crear el grupo.',
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/" style={s.back}>
        <Text style={s.backText}>← Descubrir</Text>
      </Link>

      <View>
        <Text style={s.title}>Grupos</Text>
        <Text style={s.subtitle}>Clubes y mejengas con nombre propio.</Text>
      </View>

      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      {session ? (
        creating ? (
          <View style={{ gap: 12 }}>
            <View style={s.field}>
              <Text style={s.label}>Nombre</Text>
              <TextInput
                accessibilityLabel="Nombre del grupo"
                maxLength={80}
                onChangeText={setName}
                placeholder="Mejengueros"
                placeholderTextColor={color.text.tertiary}
                style={s.input}
                value={name}
              />
              {slug.length > 0 && <Text style={s.hint}>movo.cr/grupos/{slug}</Text>}
            </View>

            <View style={s.field}>
              <Text style={s.label}>De qué se trata</Text>
              <TextInput
                accessibilityLabel="De qué se trata el grupo"
                multiline
                onChangeText={setDescription}
                placeholder="Mejenga los jueves en La Sabana, 7v7, todos los niveles."
                placeholderTextColor={color.text.tertiary}
                style={[s.input, { minHeight: 88 }]}
                value={description}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Quién puede entrar</Text>
              <View
                accessibilityRole="tablist"
                accessibilityLabel="Quién puede entrar"
                style={s.chipRow}
              >
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel="Cualquiera puede entrar"
                  accessibilityState={{ selected: isPublic }}
                  hitSlop={CHIP_HIT_SLOP}
                  onPress={() => {
                    setIsPublic(true);
                  }}
                  style={[s.chip, isPublic && s.chipOn]}
                >
                  <Text style={[s.chipText, isPublic && s.chipTextOn]}>Cualquiera</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel="Solo invitados"
                  accessibilityState={{ selected: !isPublic }}
                  hitSlop={CHIP_HIT_SLOP}
                  onPress={() => {
                    setIsPublic(false);
                  }}
                  style={[s.chip, !isPublic && s.chipOn]}
                >
                  <Text style={[s.chipText, !isPublic && s.chipTextOn]}>Solo invitados</Text>
                </Pressable>
              </View>
              <Text style={s.hint}>
                {isPublic
                  ? 'Aparece acá y cualquiera se puede unir.'
                  : 'No aparece en la lista. Solo quien ya es parte lo ve.'}
              </Text>
            </View>

            {/* Disabled, the button gives no reason on screen either; the hint
                is the only place the requirement is stated. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={busy ? 'Creando…' : 'Crear grupo'}
              accessibilityHint={
                canCreate ? undefined : 'Escribe un nombre de al menos dos letras para continuar.'
              }
              accessibilityState={{ disabled: !canCreate }}
              disabled={!canCreate}
              onPress={submit}
              style={[s.primary, !canCreate && s.primaryDisabled]}
            >
              <Text style={s.primaryText}>{busy ? 'Creando…' : 'Crear grupo'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              accessibilityHint="Cierra el formulario sin crear el grupo."
              onPress={() => {
                setCreating(false);
              }}
              style={s.secondary}
            >
              <Text style={s.secondaryText}>Cancelar</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Crear un grupo"
            accessibilityHint="Abre el formulario para crear un grupo en esta misma pantalla."
            onPress={() => {
              setCreating(true);
            }}
            style={s.primary}
          >
            <Text style={s.primaryText}>Crear un grupo</Text>
          </Pressable>
        )
      ) : (
        <Link href="/sign-in" style={s.back}>
          <Text style={s.linkText}>Iniciá sesión para crear un grupo</Text>
        </Link>
      )}

      {communities === null ? (
        <ActivityIndicator />
      ) : communities.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.sectionTitle}>Todavía no hay grupos</Text>
          <Text style={s.emptyBody}>
            El primero puede ser el tuyo. Un grupo es un nombre, unas reglas y la gente que aparece.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={s.sectionTitle}>
            {communities.length} {communities.length === 1 ? 'grupo' : 'grupos'}
          </Text>
          {communities.map((community) => (
            <Pressable
              /* One card, one sentence. The slug stays out of it: it is a URL
                 fragment, and spelled out letter by letter it buries the two
                 facts someone actually chooses on — size and who may enter. */
              accessible
              accessibilityRole="button"
              accessibilityLabel={[
                community.name,
                `${community.member_count} ${community.member_count === 1 ? 'miembro' : 'miembros'}`,
                community.is_public ? 'Abierto a cualquiera' : 'Solo invitados',
                community.description,
              ]
                .filter(Boolean)
                .join('. ')}
              accessibilityHint="Abre el detalle del grupo"
              key={community.id}
              onPress={() => {
                router.push({ pathname: '/grupos/[slug]', params: { slug: community.slug } });
              }}
              style={s.card}
            >
              <Text style={s.cardTitle}>{community.name}</Text>
              <Text style={s.cardSlug}>
                /{community.slug} · {community.member_count}{' '}
                {community.member_count === 1 ? 'miembro' : 'miembros'}
                {community.is_public ? '' : ' · solo invitados'}
              </Text>
              {community.description && (
                <Text numberOfLines={2} style={s.cardBody}>
                  {community.description}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
