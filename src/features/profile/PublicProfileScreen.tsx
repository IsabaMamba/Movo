/**
 * «Ver perfil público» (Perfil v2, phone 4): what people who share a session
 * or a group with you see, said as a preview — and what they do not see,
 * said just as plainly.
 *
 * The zone is never on this card. That is not a styling choice: since 0034
 * no client can read anybody's zone, so the preview cannot show what others
 * could not get either.
 */

import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { createStyles as c } from '../create/styles';
import { ProfileCard } from './ProfileCard';
import { profileStyles as s } from './styles';
import { useMyProfile } from './useMyProfile';

export function PublicProfileScreen() {
  const { session, loading } = useAuth();
  const { profile, sportNames, error } = useMyProfile(session?.user.id);

  if (loading) return <ActivityIndicator style={c.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <ScrollView contentContainerStyle={c.content} style={c.screen}>
      <Link href="/cuenta" style={c.link}>
        <Text style={c.linkText}>← Perfil</Text>
      </Link>
      <Text accessibilityRole="header" style={c.title}>
        Tu perfil público
      </Text>

      <View style={s.notice}>
        <Text style={s.noticeText}>
          Vista previa. Esto es lo que ve quien comparte una sesión o un grupo contigo.
        </Text>
      </View>

      {profile === undefined ? (
        <ActivityIndicator />
      ) : profile === null ? (
        <Text style={c.error}>{error ?? 'No se pudo cargar tu perfil.'}</Text>
      ) : (
        <ProfileCard
          bio={profile.bio}
          name={profile.display_name}
          since={profile.created_at}
          sports={sportNames}
        />
      )}

      <View style={s.hidden}>
        <Text style={s.hiddenText}>
          <Text style={{ fontWeight: '700' }}>No aparece: </Text>
          tu zona, tu fecha de nacimiento, tu correo ni a qué sesiones vas.
        </Text>
      </View>

      <Link href="/perfil/editar" style={s.action}>
        <Text style={s.actionText}>Editar perfil</Text>
      </Link>
    </ScrollView>
  );
}
