import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { color } from './colors';

/**
 * The manifest is what lets somebody on an iPhone add Movo to the home screen,
 * and only then does Safari deliver Web Push (ADR 0007). A broken manifest
 * fails silently: the browser just does not offer to install. So the things
 * browsers check are checked here.
 */

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  lang: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
};

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path);
  expect(data.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe('the web manifest', () => {
  it('is installable: a name, a start URL inside its scope, standalone display', () => {
    expect(manifest.name).toBe('Movo');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('es');
  });

  it('uses the app ground, so the splash does not flash white', () => {
    expect(manifest.background_color.toLowerCase()).toBe(color.bg.base.toLowerCase());
    expect(manifest.theme_color.toLowerCase()).toBe(color.bg.base.toLowerCase());
  });

  it('has the 192 and 512 icons browsers require, plus a maskable one', () => {
    const pngs = manifest.icons.filter((icon) => icon.type === 'image/png');
    expect(pngs.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('points only at files that exist, at the size it claims', () => {
    for (const icon of manifest.icons) {
      const path = `public${icon.src}`;
      expect(existsSync(path), path).toBe(true);
      if (icon.type !== 'image/png') continue;
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(path)).toEqual({ width: w, height: h });
    }
  });

  it('ships the 180px touch icon iOS asks for', () => {
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
  });
});
