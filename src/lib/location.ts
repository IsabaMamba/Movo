/**
 * Where Descubrir searches from.
 *
 * `docs/security.md`: no column anywhere holds where a user is now, because
 * the only reliable way not to leak a position is not to have one. Device
 * location does not change that. It is asked for only when the person taps
 * «Cerca de mí», it is rounded to about a kilometre before it leaves the
 * device, it is sent as the origin of one search and stored nowhere — not in
 * a table, not in browser storage.
 *
 * A kilometre is enough to sort sessions by distance, which is all the search
 * does with it, and too coarse to put anybody on a particular street.
 */

import * as Location from 'expo-location';

export interface Point {
  lat: number;
  lng: number;
}

/** Centre of the Greater Metropolitan Area: the origin whenever there is no other. */
export const GAM_CENTRE: Point = { lat: 9.9281, lng: -84.0907 };

/**
 * Two decimal places: about 1.1 km of latitude, and of longitude this close
 * to the equator. Rounded, not truncated, so the error is at most half that.
 */
export function coarsen(point: Point): Point {
  const round = (value: number) => Math.round(value * 100) / 100;
  return { lat: round(point.lat), lng: round(point.lng) };
}

export type OriginFailure = 'denied' | 'unavailable';

export type OriginResult = { ok: true; point: Point } | { ok: false; reason: OriginFailure };

/**
 * Ask once, coarsely, and hand back a rounded point. Never throws: a refused
 * or failed lookup is a normal answer, and the screen falls back to the GAM.
 */
export async function requestCoarseOrigin(): Promise<OriginResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return { ok: false, reason: 'denied' };
    }
    const position = await Location.getCurrentPositionAsync({
      // The lowest accuracy that still answers: the point is rounded to a
      // kilometre anyway, and asking for less is asking the device for less.
      accuracy: Location.Accuracy.Low,
    });
    return {
      ok: true,
      point: coarsen({ lat: position.coords.latitude, lng: position.coords.longitude }),
    };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** What the screen says when it had to fall back. */
export function originFailureText(reason: OriginFailure): string {
  return reason === 'denied'
    ? 'Sin permiso de ubicación. Buscamos desde el centro de la GAM.'
    : 'No pudimos saber dónde estás. Buscamos desde el centro de la GAM.';
}
