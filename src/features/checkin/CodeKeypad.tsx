/**
 * «Escribe el código de hoy» (walkthrough step 19, Asistencia v2 phone 2):
 * four boxes and a drawn keypad, as on the board. The fourth digit sends.
 *
 * Drawn rather than the phone's keyboard because that is the design. Each
 * key is a real button with a label, so a screen reader reads «4», «7»… and
 * «Borrar», and the boxes announce how many digits are in.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, space, stroke, type } from '../../theme';
import { Icon } from '../nav/Icon';

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export function CodeKeypad({ value, onChange, disabled }: Props) {
  const press = (key: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (key === 'del') onChange(value.slice(0, -1));
    else if (key !== '' && value.length < 4) onChange(value + key);
  };

  return (
    <View style={styles.wrap}>
      <View
        accessible
        accessibilityLabel={`Código: ${value.length} de 4 números escritos`}
        style={styles.boxes}
      >
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.box, i === value.length && styles.boxNext]}>
            <Text style={styles.boxText}>{value[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key, i) =>
          key === '' ? (
            <View key={`blank-${i}`} style={styles.key} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={key === 'del' ? 'Borrar' : key}
              disabled={disabled}
              key={key}
              onPress={() => {
                press(key);
              }}
              style={({ pressed }) => [styles.key, styles.keyFilled, pressed && styles.keyPressed]}
            >
              {key === 'del' ? (
                <Icon color={color.text.primary} name="backspace" size={22} />
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  boxes: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  box: {
    alignItems: 'center',
    backgroundColor: color.bg.raised,
    borderColor: color.border.default,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    height: 60,
    justifyContent: 'center',
    width: 52,
  },
  boxNext: { borderColor: color.accent.primary, borderWidth: 2 },
  boxText: { ...type.display, color: color.text.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  key: { alignItems: 'center', height: 52, justifyContent: 'center', width: '30%' },
  keyFilled: { backgroundColor: color.bg.raised, borderRadius: radius.md },
  keyPressed: { backgroundColor: color.accent.deep },
  keyText: { ...type.title, color: color.text.primary },
});
