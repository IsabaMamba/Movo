/** Presentation helpers for the discover list. */

/** Metres from the RPC, rendered the way a person would say it. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** Free sessions say so; the schema stores colones as an integer. */
export function formatPrice(colones: number): string {
  if (colones <= 0) return 'Gratis';
  return `₡${colones.toLocaleString('es-CR')}`;
}

/**
 * Capacity as a person reads it. `max_participants` is nullable — an
 * uncapped session shows attendance rather than a fraction.
 */
export function formatSpots(joined: number, max: number | null): string {
  if (max === null) return `${joined} van`;
  const left = Math.max(max - joined, 0);
  if (left === 0) return 'Lleno · lista de espera';
  return `${left} de ${max} libres`;
}
