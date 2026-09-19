import { describe, expect, it } from 'vitest';

import {
  blobRadius,
  heatLevel,
  heatSummary,
  kindForRadius,
  layoutBlobs,
  MIN_BLOB_PX,
  PEOPLE_AT_PEAK,
  pixelsPerKm,
  project,
  SESSION_FLOOR,
  type Viewport,
  type ZoneHeat,
} from './heatmap';

/**
 * The band is a picture of `zone_heat()`, so these tests are about the two
 * ways a picture lies: drawing something in the wrong place, and drawing
 * "quiet" the same as "nothing". The rows below are the live ones from 19
 * September 2026, which is why they are Ulloa and Colón.
 */
const GAM: Viewport = {
  centre: { lat: 9.9281, lng: -84.0907 },
  radiusKm: 15,
  width: 360,
  height: 132,
};

const ULLOA: ZoneHeat = {
  code: '40104',
  name: 'Ulloa',
  lat: 9.9751,
  lng: -84.1386,
  area_km2: 11.5,
  sessions: 4,
  joined: 0,
};

const COLON: ZoneHeat = {
  code: '10701',
  name: 'Colón',
  lat: 9.9098,
  lng: -84.2633,
  area_km2: 40.0,
  sessions: 1,
  joined: 3,
};

describe('kindForRadius', () => {
  it('draws distritos for the local radii and cantones for the regional one', () => {
    expect(kindForRadius(5)).toBe('distrito');
    expect(kindForRadius(15)).toBe('distrito');
    expect(kindForRadius(50)).toBe('canton');
  });
});

describe('heatLevel', () => {
  it('keeps a zone with sessions and nobody signed up visible, above the background stop', () => {
    expect(heatLevel({ sessions: 4, joined: 0 })).toBe(SESSION_FLOOR);
  });

  it('is zero only when there is nothing scheduled', () => {
    expect(heatLevel({ sessions: 0, joined: 0 })).toBe(0);
  });

  it('rises with people and saturates at the legend top', () => {
    expect(heatLevel({ sessions: 2, joined: 20 })).toBeCloseTo(0.5);
    expect(heatLevel({ sessions: 9, joined: PEOPLE_AT_PEAK })).toBe(1);
    expect(heatLevel({ sessions: 9, joined: PEOPLE_AT_PEAK * 3 })).toBe(1);
  });

  it('never returns NaN, which would take the colour function down with it', () => {
    expect(heatLevel({ sessions: 1, joined: Number.NaN })).toBe(SESSION_FLOOR);
    expect(heatLevel({ sessions: Number.NaN, joined: 5 })).toBe(0);
  });
});

describe('project', () => {
  it('puts the search centre in the middle of the band', () => {
    expect(project(GAM.centre, GAM)).toEqual({ x: 180, y: 66 });
  });

  it('fits the search radius into half the band height', () => {
    // 15 km north of the centre is the top edge.
    const north = project({ lat: GAM.centre.lat + 15 / 110.574, lng: GAM.centre.lng }, GAM);
    expect(north.y).toBeCloseTo(0, 5);
    expect(pixelsPerKm(GAM)).toBeCloseTo(132 / 30);
  });

  it('puts west on the left and north at the top', () => {
    const p = project(ULLOA, GAM); // north-west of San José
    expect(p.x).toBeLessThan(180);
    expect(p.y).toBeLessThan(66);
  });
});

describe('blobRadius', () => {
  it('grows with the zone, so a large zone reads wide', () => {
    expect(blobRadius(40, GAM)).toBeGreaterThan(blobRadius(11.5, GAM));
  });

  it('never shrinks to a dot that would read as a venue pin', () => {
    expect(blobRadius(0.5, GAM)).toBe(MIN_BLOB_PX);
    expect(blobRadius(-3, GAM)).toBe(MIN_BLOB_PX);
  });
});

describe('layoutBlobs', () => {
  it('keeps a zone whose glow reaches the band and drops one far outside it', () => {
    const far: ZoneHeat = { ...COLON, code: '70101', name: 'Limón', lat: 9.99, lng: -83.03 };
    const codes = layoutBlobs([ULLOA, COLON, far], GAM).map((b) => b.code);
    expect(codes).toContain('40104');
    expect(codes).not.toContain('70101');
  });

  it('paints the hottest zone last, so it sits on top', () => {
    const hot: ZoneHeat = { ...ULLOA, code: '10108', name: 'Mata Redonda', joined: 30 };
    const order = layoutBlobs([hot, ULLOA], GAM).map((b) => b.code);
    expect(order).toEqual(['40104', '10108']);
  });

  it('drops a row with no sessions instead of drawing a cold blob', () => {
    expect(layoutBlobs([{ ...ULLOA, sessions: 0 }], GAM)).toEqual([]);
  });

  it('carries no position but the zone anchor it was given', () => {
    const [blob] = layoutBlobs([ULLOA], GAM);
    expect(blob).toMatchObject(project(ULLOA, GAM));
  });
});

describe('heatSummary', () => {
  it('reads hottest zone first, in words', () => {
    const blobs = layoutBlobs([ULLOA, COLON], { ...GAM, radiusKm: 50 });
    expect(heatSummary(blobs, 50)).toBe(
      'Mapa de calor de los próximos 7 días a 50 kilómetros: ' +
        'Ulloa, 4 sesiones y 0 personas apuntadas; Colón, 1 sesión y 3 personas apuntadas.',
    );
  });

  it('says so when there is nothing, rather than describing an empty picture', () => {
    expect(heatSummary([], 5)).toBe(
      'Mapa de calor: nada programado a 5 kilómetros en los próximos 7 días.',
    );
  });
});
