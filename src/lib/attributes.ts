/**
 * A session's sport-specific facts, as the detail shows them.
 *
 * The category's JSON Schema titles carry the unit in brackets, because that
 * is what the form needs next to the field: «Distancia (km)», «Ritmo objetivo
 * (min/km)». Read back as a fact that came out as «Distancia (km): 10». Here
 * the unit moves next to the number: «Distancia: 10 km».
 *
 * Booleans only show when true — «Nadie se queda atrás: no» is noise, its
 * absence says the same thing.
 */

import type { JsonSchemaProperty } from '../types/database';

import { enumLabel } from './activities';

const WITH_UNIT = /^(.*\S)\s*\(([^()]+)\)$/u;

/** «Distancia (km)» and 10 → «Distancia: 10 km». Not a number: the title as it is. */
export function attributeFact(title: string, value: string | number): string {
  const unit = WITH_UNIT.exec(title);
  if (unit !== null && typeof value === 'number') {
    return `${unit[1] ?? title}: ${String(value)} ${unit[2] ?? ''}`.trim();
  }
  return `${title}: ${String(value)}`;
}

export function attributeTags(
  properties: Record<string, JsonSchemaProperty>,
  attributes: Record<string, unknown>,
): string[] {
  const tags: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    const property = properties[key];
    const label = property?.title ?? key;
    if (value === true) tags.push(label);
    else if (value === false || value === null || value === undefined) continue;
    else if (Array.isArray(value)) {
      if (value.length > 0) {
        tags.push(`${label}: ${value.map((v) => enumLabel(property, String(v))).join(', ')}`);
      }
    } else if (typeof value === 'number') tags.push(attributeFact(label, value));
    else if (typeof value === 'string') tags.push(`${label}: ${enumLabel(property, value)}`);
    else tags.push(`${label}: ${JSON.stringify(value)}`);
  }
  return tags;
}
