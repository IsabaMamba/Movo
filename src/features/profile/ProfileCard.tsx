/**
 * The person as a card: initials (until photos land), name, sports, and —
 * on the owner's own Perfil only — their zone. The public preview passes no
 * zone, because the zone is not public (0034).
 *
 * Step 22 of the 2 November walkthrough: the avatar in a Sun ring with a
 * camera badge on the owner's copy, and each sport chip with its colour dot.
 */

import { Pressable, Text, View } from 'react-native';

import { initials, sinceLabel } from '../../lib/profile';
import { color } from '../../theme';
import { sportColor } from '../../theme/sport';
import { Icon } from '../nav/Icon';
import { profileStyles as s } from './styles';

interface Props {
  name: string;
  sports: string[];
  /** Category ids in the same order as `sports`, for the chip dots. */
  sportIds?: string[];
  /** «Intermedio» per sport, same order (0038). The level is public. */
  levels?: string[];
  bio?: string | null;
  /** «Tibás · San José». Only the owner's own Perfil passes it. */
  zone?: string | null;
  /** Shown on the public preview: «En Movo desde…». */
  since?: string | null;
  /** The owner's camera badge. Absent on the public preview. */
  onPhoto?: () => void;
}

export function ProfileCard({ name, sports, sportIds, levels, bio, zone, since, onPhoto }: Props) {
  return (
    <View style={s.card}>
      <View style={s.avatarWrap}>
        <View aria-hidden style={s.avatar}>
          <Text style={s.avatarText}>{initials(name)}</Text>
        </View>
        {onPhoto && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tu foto o tu avatar"
            onPress={onPhoto}
            style={s.cameraBadge}
          >
            <Icon color={color.text.inverse} name="camera" size={16} />
          </Pressable>
        )}
      </View>
      <Text accessibilityRole="header" style={s.name}>
        {name}
      </Text>
      {zone ? <Text style={s.zone}>{zone}</Text> : null}
      {sports.length > 0 && (
        <View
          accessibilityLabel={`Deportes: ${sports
            .map((sport, i) => (levels?.[i] ? `${sport}, ${levels[i]}` : sport))
            .join('; ')}`}
          style={s.chips}
        >
          {sports.map((sport, i) => {
            const id = sportIds?.[i];
            return (
              <View key={sport} style={s.chip}>
                {id && <View style={[s.chipDot, { backgroundColor: sportColor(id) }]} />}
                <Text style={s.chipText}>
                  {sport}
                  {levels?.[i] ? <Text style={s.chipLevel}> · {levels[i]}</Text> : null}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {bio ? <Text style={s.bio}>{bio}</Text> : null}
      {since ? <Text style={s.since}>{sinceLabel(since)}</Text> : null}
    </View>
  );
}
