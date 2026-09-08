/**
 * The block that the database writes.
 *
 * Everything rendered here comes from `categories.attribute_schema` — no field
 * is named in this file. That is the whole bet behind the jsonb column: the day
 * pádel exists, this block changes on its own.
 *
 * The design marks the boundary with an aqua rule for exactly that reason. It
 * is a signal to whoever reads the screen next that nothing inside is hand
 * written.
 */

import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { color, hitSlopFor, size } from '../../theme';
import type { JsonSchemaObject, JsonSchemaProperty } from '../../types/database';
import type { ValidationIssue } from '../../lib/activities';
import { createStyles as s } from './styles';

interface Props {
  schema: JsonSchemaObject;
  values: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  issues: ValidationIssue[];
}

/**
 * jsonb does not preserve key order — Postgres sorts object keys by length and
 * then bytewise — so the schema cannot be trusted to come back in a sensible
 * order. Required fields lead, in the order the schema declares them, and the
 * rest follow alphabetically so the form is at least stable between renders.
 */
function orderedFields(schema: JsonSchemaObject): [string, JsonSchemaProperty][] {
  const required = schema.required ?? [];
  const rest = Object.keys(schema.properties)
    .filter((key) => !required.includes(key))
    .sort((a, b) => a.localeCompare(b, 'es'));

  return [...required, ...rest]
    .map((key) => [key, schema.properties[key]] as [string, JsonSchemaProperty | undefined])
    .filter((entry): entry is [string, JsonSchemaProperty] => entry[1] !== undefined);
}

/** Chips render at `size.controlSm`; the target is padded back up to 44. */
const CHIP_HIT_SLOP = hitSlopFor(size.controlSm);

/**
 * The spoken name of a generated field.
 *
 * Same source as the visible label — `title` if the schema gives one, the key
 * otherwise — because a hard-coded name here would be wrong the day a category
 * is added. Required is spoken rather than shown: the design marks the optional
 * fields, and absence of a word is not something a screen reader can announce.
 */
function fieldA11yLabel(label: string, isRequired: boolean): string {
  return isRequired ? `${label}, obligatorio` : `${label}, opcional`;
}

/** "Distancia (km)" carries its own unit, so the range hint stays bare. */
function rangeHint(property: JsonSchemaProperty): string | null {
  const { minimum, maximum } = property;
  if (minimum !== undefined && maximum !== undefined) return `Entre ${minimum} y ${maximum}`;
  if (minimum !== undefined) return `Mínimo ${minimum}`;
  if (maximum !== undefined) return `Máximo ${maximum}`;
  return null;
}

export function SchemaFields({ schema, values, onChange, issues }: Props) {
  // Numbers are held as text while someone is typing: "6." and "" are both
  // states a controlled numeric input has to survive without snapping back.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const fields = orderedFields(schema);
  const required = new Set(schema.required ?? []);

  const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;

  return (
    <View style={s.schemaBlock}>
      {fields.map(([key, property]) => {
        const label = property.title ?? key;
        const isRequired = required.has(key);
        const error = issueFor(key);
        const a11yLabel = fieldA11yLabel(label, isRequired);

        return (
          <View key={key} style={s.field}>
            <View style={s.labelRow}>
              <Text style={s.label}>{label}</Text>
              {!isRequired && <Text style={s.optional}>opcional</Text>}
            </View>

            {property.type === 'boolean' ? (
              <Switch
                accessibilityLabel={a11yLabel}
                onValueChange={(next) => {
                  onChange(key, next);
                }}
                trackColor={{ false: color.border.default, true: color.accent.deep }}
                thumbColor={values[key] === true ? color.accent.cool : color.text.tertiary}
                value={values[key] === true}
              />
            ) : property.enum ? (
              <View accessibilityRole="tablist" accessibilityLabel={a11yLabel} style={s.chipRow}>
                {property.enum.map((option) => {
                  const on = values[key] === option;
                  return (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityLabel={option}
                      accessibilityState={{ selected: on }}
                      hitSlop={CHIP_HIT_SLOP}
                      key={option}
                      onPress={() => {
                        onChange(key, on ? undefined : option);
                      }}
                      style={[s.chip, on && s.chipOn]}
                    >
                      <Text style={[s.chipText, on && s.chipTextOn]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : property.type === 'array' && property.items?.enum ? (
              /* An array field takes any number of options, so each chip is its
                 own checkbox rather than one choice out of a set. There is no
                 grouping role for that in React Native, so each chip carries the
                 field name — still from the schema, never hard coded. */
              <View style={s.chipRow}>
                {property.items.enum.map((option) => {
                  const selected = Array.isArray(values[key]) ? (values[key] as string[]) : [];
                  const on = selected.includes(option);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${label}: ${option}`}
                      accessibilityState={{ checked: on }}
                      hitSlop={CHIP_HIT_SLOP}
                      key={option}
                      onPress={() => {
                        onChange(
                          key,
                          on ? selected.filter((v) => v !== option) : [...selected, option],
                        );
                      }}
                      style={[s.chip, on && s.chipOn]}
                    >
                      <Text style={[s.chipText, on && s.chipTextOn]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : property.type === 'number' || property.type === 'integer' ? (
              <TextInput
                accessibilityLabel={a11yLabel}
                // The range is the only constraint the schema states, and it is
                // shown as helper text, so it is the hint.
                accessibilityHint={rangeHint(property) ?? undefined}
                inputMode={property.type === 'integer' ? 'numeric' : 'decimal'}
                onChangeText={(text) => {
                  setDraft((d) => ({ ...d, [key]: text }));
                  const cleaned = text.replace(',', '.');
                  const parsed =
                    property.type === 'integer' ? parseInt(cleaned, 10) : Number(cleaned);
                  onChange(key, cleaned === '' || Number.isNaN(parsed) ? undefined : parsed);
                }}
                placeholder={rangeHint(property) ?? ''}
                placeholderTextColor={color.text.tertiary}
                style={[s.input, error && s.inputError]}
                value={draft[key] ?? (values[key] === undefined ? '' : String(values[key]))}
              />
            ) : (
              <TextInput
                accessibilityLabel={a11yLabel}
                onChangeText={(text) => {
                  onChange(key, text === '' ? undefined : text);
                }}
                placeholderTextColor={color.text.tertiary}
                style={[s.input, error && s.inputError]}
                value={typeof values[key] === 'string' ? (values[key] as string) : ''}
              />
            )}

            {error ? (
              /* These arrive from the server after a failed submit, so they are
                 new information at a moment the field is not focused. */
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : rangeHint(property) && property.type !== 'boolean' && !property.enum ? (
              <Text style={s.hint}>{rangeHint(property)}</Text>
            ) : null}
          </View>
        );
      })}

      {fields.length === 0 && (
        <Text style={s.emptyNote}>Esta categoría no pide detalles extra.</Text>
      )}
    </View>
  );
}
