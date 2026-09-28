/**
 * The venues a person created, and correcting them.
 *
 * A venue's coordinate is pasted from a map link, and a wrong one does not
 * announce itself: the session disappears from Descubrir, or the heat map
 * lights the wrong district. On 19 September three live venues resolved to a
 * different district than the one typed for them. One was fixed by a
 * migration; the other two waited for a screen that did not exist.
 *
 * What can be corrected is what 0024 grants: name, address, typed district
 * and the point. Only while the venue is not verified (locations_update_own):
 * after that it is shared infrastructure. The resolved district is never
 * written by the client — the zone trigger recomputes it when the point moves.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Coordinates } from './activities';
import { toApiError } from './errors';

export interface MyVenue {
  id: string;
  name: string;
  district: string | null;
  address: string | null;
  is_verified: boolean;
  lat: number;
  lng: number;
  /** The distrito the point falls in, by the map. Null when outside every zone. */
  zoneName: string | null;
}

interface VenueRow {
  id: string;
  name: string;
  district: string | null;
  address: string | null;
  is_verified: boolean;
  geog: unknown;
  zone: { name: string } | null;
}

/**
 * A point out of whatever PostgREST sends for `geography`.
 *
 * On this project it is hex EWKB — checked against the live API on 28
 * September: `0101000020E6100000…`. Byte-order flag, a type word with the SRID
 * bit set, the SRID, then X (longitude) and Y (latitude) as float64. GeoJSON
 * ({ coordinates: [lng, lat] }) is accepted as well, in case a PostgREST or
 * PostGIS upgrade changes the default. Both put longitude first, unlike every
 * map app — the reason the screen reads the pair back at all.
 */
export function pointOf(geog: unknown): Coordinates | null {
  if (typeof geog === 'string') return pointFromEwkbHex(geog);
  if (typeof geog !== 'object' || geog === null) return null;
  const coords = (geog as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords as unknown[];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

const WKB_POINT = 1;
const EWKB_SRID_FLAG = 0x20000000;

function pointFromEwkbHex(hex: string): Coordinates | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer);
  if (bytes.length < 21) return null;

  const little = view.getUint8(0) === 1;
  const type = view.getUint32(1, little);
  if ((type & 0xff) !== WKB_POINT) return null;

  // Skip the SRID when the flag says one is there.
  const offset = type & EWKB_SRID_FLAG ? 9 : 5;
  if (bytes.length < offset + 16) return null;

  const lng = view.getFloat64(offset, little);
  const lat = view.getFloat64(offset + 8, little);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function fetchMyVenues(db: SupabaseClient, userId: string): Promise<MyVenue[]> {
  const { data, error } = await db
    .from('locations')
    .select('id, name, district, address, is_verified, geog, zone:zones(name)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw toApiError(error);

  return ((data ?? []) as unknown as VenueRow[]).flatMap((row) => {
    const point = pointOf(row.geog);
    if (!point) return [];
    return [
      {
        id: row.id,
        name: row.name,
        district: row.district,
        address: row.address,
        is_verified: row.is_verified,
        lat: point.lat,
        lng: point.lng,
        zoneName: row.zone?.name ?? null,
      },
    ];
  });
}

export interface VenueCorrection extends Coordinates {
  name: string;
  district: string;
  address: string;
}

export async function updateVenue(
  db: SupabaseClient,
  venueId: string,
  input: VenueCorrection,
): Promise<void> {
  const { error, count } = await db
    .from('locations')
    .update(
      {
        name: input.name.trim(),
        district: input.district.trim() || null,
        address: input.address.trim() || null,
        geog: `SRID=4326;POINT(${input.lng} ${input.lat})`,
      },
      { count: 'exact' },
    )
    .eq('id', venueId);
  if (error) throw toApiError(error);
  // RLS hides a verified venue from the update rather than refusing it, so
  // zero rows is the refusal. Saying "saved" here would be the lie.
  if (count === 0) {
    throw new Error('Este lugar ya está verificado o no lo creaste tú: no se puede cambiar.');
  }
}

/** Lower-case, no accents, no surrounding space: «San José » and «san jose» match. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/**
 * Whether what somebody typed as the district disagrees with where the point
 * actually is. Nothing typed, or no zone, is not a disagreement — there is
 * nothing to compare.
 */
export function districtMismatch(typed: string | null, zoneName: string | null): boolean {
  if (!typed?.trim() || !zoneName) return false;
  return fold(typed) !== fold(zoneName);
}

// ------------------------------------------------------------- staff (0027)

/** Whether the caller is on the Movo team. Answers only about the caller. */
export async function amIStaff(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc('is_staff');
  if (error) return false;
  return data === true;
}

export interface StaffVenue extends MyVenue {
  createdBy: string | null;
  creatorName: string | null;
  verifiedAt: string | null;
  verifiedNote: string | null;
}

interface StaffVenueRow extends VenueRow {
  created_by: string | null;
  verified_at: string | null;
  verified_note: string | null;
  creator: { display_name: string } | null;
}

/** Every venue, unverified first. Staff can read every creator's profile (0025). */
export async function fetchVenuesForReview(db: SupabaseClient): Promise<StaffVenue[]> {
  const { data, error } = await db
    .from('locations')
    .select(
      'id, name, district, address, is_verified, geog, created_by, verified_at, verified_note, ' +
        'zone:zones(name), creator:profiles!locations_created_by_fkey(display_name)',
    )
    .order('is_verified', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw toApiError(error);

  return ((data ?? []) as unknown as StaffVenueRow[]).flatMap((row) => {
    const point = pointOf(row.geog);
    if (!point) return [];
    return [
      {
        id: row.id,
        name: row.name,
        district: row.district,
        address: row.address,
        is_verified: row.is_verified,
        lat: point.lat,
        lng: point.lng,
        zoneName: row.zone?.name ?? null,
        createdBy: row.created_by,
        creatorName: row.creator?.display_name ?? null,
        verifiedAt: row.verified_at,
        verifiedNote: row.verified_note,
      },
    ];
  });
}

/** Staff only. Refused for a blank note, a private venue or a point in no district. */
export async function verifyVenue(
  db: SupabaseClient,
  venueId: string,
  note: string,
): Promise<void> {
  const { error } = await db.rpc('verify_location', {
    p_location_id: venueId,
    p_note: note.trim(),
  });
  if (error) throw toApiError(error);
}

/** Staff only. Hands the venue back to its creator. */
export async function unverifyVenue(
  db: SupabaseClient,
  venueId: string,
  note: string,
): Promise<void> {
  const { error } = await db.rpc('unverify_location', {
    p_location_id: venueId,
    p_note: note.trim(),
  });
  if (error) throw toApiError(error);
}

/** The functions' refusals, in the words the reviewer needs. */
export function explainVerifyError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('in no district')) {
    return 'El punto no cae en ningún distrito: está en el mar o fuera del país. Hay que corregirlo antes.';
  }
  if (message.includes('private place')) return 'Un lugar privado no se puede verificar.';
  if (message.includes('already verified')) return 'Ya estaba verificado.';
  if (message.includes('only the Movo team')) return 'Solo el equipo de Movo puede hacer esto.';
  if (message.includes('say what was checked') || message.includes('say why')) {
    return 'Escribe qué revisaste.';
  }
  return message || 'No se pudo completar.';
}
