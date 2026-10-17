/**
 * The link fields in Crear and Editar (Organizar v2, phones 1 and 2).
 *
 * One field, and «Agregar otro enlace» for the second. Each field says, as
 * soon as something is pasted, either the domain it will show — «strava.com
 * · se abre fuera de Movo» — or what is wrong with it, using the same rules
 * the database applies (src/lib/links.ts). The organizer meets the rules
 * here, not in an error after saving.
 */

import { Pressable, Text, TextInput, View } from 'react-native';

import { checkLink, MAX_LINK_LENGTH, MAX_LINKS } from '../../lib/links';
import { color, hitSlopFor, size } from '../../theme';
import { createStyles as s } from '../create/styles';

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  /** People already going; when above zero, say that changing a link tells them. */
  goingCount?: number;
}

const LABELS = ['Enlace de la ruta', 'Otro enlace'];

export function LinkFields({ values, onChange, goingCount = 0 }: Props) {
  const shown = values.length === 0 ? [''] : values;

  const set = (index: number, value: string) => {
    const next = [...shown];
    next[index] = value;
    onChange(next);
  };

  return (
    <View style={s.section}>
      {shown.map((value, index) => {
        const trimmed = value.trim();
        const result = trimmed === '' ? null : checkLink(trimmed);
        const label = LABELS[index] ?? 'Enlace';
        return (
          <View key={index} style={s.field}>
            <View style={s.labelRow}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.optional}>opcional</Text>
            </View>
            <TextInput
              accessibilityLabel={`${label}, opcional`}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              maxLength={MAX_LINK_LENGTH + 20}
              onChangeText={(text) => {
                set(index, text);
              }}
              placeholder="https://"
              placeholderTextColor={color.text.tertiary}
              style={[s.input, result && !result.ok && s.inputError]}
              value={value}
            />
            {result && (
              <Text
                accessibilityLiveRegion="polite"
                style={result.ok ? [s.hint, { color: color.semantic.success }] : s.error}
              >
                {result.ok ? `✓ ${result.domain} · se abre fuera de Movo` : result.problem}
              </Text>
            )}
            {index === 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quitar este enlace"
                hitSlop={hitSlopFor(size.controlSm)}
                onPress={() => {
                  onChange(shown.slice(0, 1));
                }}
                style={s.link}
              >
                <Text style={s.linkText}>Quitar este enlace</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {shown.length < MAX_LINKS && shown[0]?.trim() !== '' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar otro enlace"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={() => {
            onChange([...shown, '']);
          }}
          style={s.link}
        >
          <Text style={s.linkText}>+ Agregar otro enlace</Text>
        </Pressable>
      )}

      <Text style={s.hint}>
        Hasta {MAX_LINKS} enlaces, solo https y sin acortadores. Siempre se muestra el dominio. Por
        ahora la ruta va como enlace a otra app; más adelante la vas a poder trazar dentro de Movo.
      </Text>
      {goingCount > 0 && (
        <Text style={s.hint}>
          {goingCount === 1
            ? 'Si cambias un enlace, le avisamos a la persona que va.'
            : `Si cambias un enlace, les avisamos a las ${goingCount} personas que van.`}
        </Text>
      )}
    </View>
  );
}
