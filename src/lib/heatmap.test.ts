import { describe, expect, it } from 'vitest';

import {
  blobRadius,
  heatLevel,
  heatSummary,
  kindForRadius,
  layoutBlobs,
  MIN_BLOB_PX,
  PEOPLE_AT_PEAK,
  boundsFor,
  MIN_SPAN_KM,
  pathFor,
  pixelsPerKm,
  project,
  SESSION_FLOOR,
  viewportFor,
  type Viewport,
  type ZoneHeat,
} from './heatmap';

/**
 * The band is a picture of `zone_heat()`, so these tests are about the two
 * ways a picture lies: drawing something in the wrong place, and drawing
 * "quiet" the same as "nothing". The rows below are the live ones from 19
 * September 2026, which is why they are Ulloa and Colón.
 */
const CENTRE = { lat: 9.9281, lng: -84.0907 };
const GAM: Viewport = { centre: CENTRE, spanKm: 15, width: 360, height: 132 };

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

describe('viewportFor', () => {
  it('never looks closer than the minimum span, so a 5 km list still has surroundings', () => {
    expect(viewportFor(5, 360, 132, CENTRE).spanKm).toBe(MIN_SPAN_KM);
    expect(viewportFor(50, 360, 132, CENTRE).spanKm).toBe(50);
  });

  it('shows Ulloa at a 5 km radius, where the list has a session 4.9 km away', () => {
    // The band filtered to 5 km used to say "nothing scheduled" over a list
    // with one session: the zone anchor is 7.4 km out, the venue is not.
    const codes = layoutBlobs([ULLOA], viewportFor(5, 360, 132, CENTRE)).map((b) => b.code);
    expect(codes).toEqual(['40104']);
  });
});

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

  it('fits the span into half the band height', () => {
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
    const codes = layoutBlobs([ULLOA, far], GAM).map((b) => b.code);
    expect(codes).toContain('40104');
    expect(codes).not.toContain('70101');
  });

  it('keeps a zone the list excludes, because the band is the surroundings', () => {
    // Colón's anchor is ~19 km west: outside a 5 km list, on the band anyway,
    // and the component draws the ring that says which it is.
    expect(layoutBlobs([COLON], viewportFor(5, 360, 132, CENTRE)).map((b) => b.code)).toEqual([
      '10701',
    ]);
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
    const blobs = layoutBlobs([ULLOA, COLON], { ...GAM, spanKm: 50 });
    expect(heatSummary(blobs)).toBe(
      'Mapa de calor de los próximos 7 días alrededor del centro de búsqueda: ' +
        'Ulloa, 4 sesiones y 0 personas apuntadas; Colón, 1 sesión y 3 personas apuntadas.',
    );
  });

  it('says so when there is nothing, rather than describing an empty picture', () => {
    expect(heatSummary([])).toBe(
      'Mapa de calor: nada programado alrededor del centro de búsqueda en los próximos 7 días.',
    );
  });
});

describe('boundsFor', () => {
  it('covers the band and a margin, wider than tall because the band is', () => {
    const b = boundsFor(GAM);
    expect(b.west).toBeLessThan(GAM.centre.lng);
    expect(b.east).toBeGreaterThan(GAM.centre.lng);
    expect(b.south).toBeLessThan(GAM.centre.lat);
    expect(b.north).toBeGreaterThan(GAM.centre.lat);
    expect(b.east - b.west).toBeGreaterThan(b.north - b.south);
  });

  it('asks for more than the band shows, so a shape entering the frame is there', () => {
    const tight = boundsFor(GAM, 0);
    const padded = boundsFor(GAM, 40);
    expect(padded.north).toBeGreaterThan(tight.north);
    expect(padded.west).toBeLessThan(tight.west);
  });
});

describe('pathFor', () => {
  const square = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [-84.0907, 9.9281],
        [-84.0807, 9.9281],
        [-84.0807, 9.9381],
        [-84.0907, 9.9381],
        [-84.0907, 9.9281],
      ],
    ],
  };

  it('closes every ring, starting at the projected first point', () => {
    const d = pathFor(square, GAM);
    expect(d.startsWith('M180,66')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/M/g)).toHaveLength(1);
  });

  it('keeps an island as its own subpath rather than joining it to the mainland', () => {
    const withIsland = {
      type: 'MultiPolygon' as const,
      coordinates: [square.coordinates, square.coordinates],
    };
    expect(pathFor(withIsland, GAM).match(/M/g)).toHaveLength(2);
  });

  it('drops a ring that is not an area instead of drawing a line', () => {
    const degenerate = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-84.09, 9.92],
          [-84.08, 9.93],
        ],
      ],
    };
    expect(pathFor(degenerate, GAM)).toBe('');
  });
});
