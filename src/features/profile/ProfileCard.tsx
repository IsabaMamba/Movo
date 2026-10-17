/**
 * The person as a card: initials (until photos land), name, sports, and —
 * on the owner's own Perfil only — their zone. The public preview passes no
 * zone, because the zone is not public (0034).
 */

import { Text, View } from 'react-native';

import { initials, sinceLabel } from '../../lib/profile';
import { profileStyles as s } from './styles';

interface Props {
  name: string;
  sports: string[];
  bio?: string | null;
  /** «Tibás · San José». Only the owner's own Perfil passes it. */
  zone?: string | null;
  /** Shown on the public preview: «En Movo desde…». */
  since?: string | null;
}

export function ProfileCard({ name, sports, bio, zone, since }: Props) {
  return (
    <View style={s.card}>
      <View aria-hidden style={s.avatar}>
        <Text style={s.avatarText}>{initials(name)}</Text>
      </View>
      <Text accessibilityRole="header" style={s.name}>
        {name}
      </Text>
      {zone ? <Text style={s.zone}>{zone}</Text> : null}
      {sports.length > 0 && (
        <View accessibilityLabel={`Deportes: ${sports.join(', ')}`} style={s.chips}>
          {sports.map((sport) => (
            <View key={sport} style={s.chip}>
              <Text style={s.chipText}>{sport}</Text>
            </View>
          ))}
        </View>
      )}
      {bio ? <Text style={s.bio}>{bio}</Text> : null}
      {since ? <Text style={s.since}>{sinceLabel(since)}</Text> : null}
    </View>
  );
}
