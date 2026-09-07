/** Presentation helpers for the discover list. */

/** Metres from the RPC, rendered the way a person would say it. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}
