#!/usr/bin/env node
/**
 * Renders the app icons from public/icon.svg into the PNGs the web manifest
 * and iOS need. Node only — no ImageMagick, no headless browser, no package
 * that a future `npm ci` might drop.
 *
 * It does not render SVG in general. It reads the three things this icon is
 * made of — the background fill, one polyline, its stroke colour and width —
 * and draws them: a thick polyline with round caps and joins is exactly the
 * set of points within half the stroke width of any of its segments. Each
 * pixel is sampled 4×4 for the edges. If the icon ever needs more than that,
 * replace this with a real rasterizer rather than growing it.
 *
 *   node scripts/render-icons.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SOURCE = 'public/icon.svg';
const OUTPUTS = [
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
  // iOS home screen. Square and opaque: iOS rounds the corners itself.
  { file: 'public/apple-touch-icon.png', size: 180 },
];

const svg = readFileSync(SOURCE, 'utf8');
const grab = (re, what) => {
  const match = re.exec(svg);
  if (!match) throw new Error(`${SOURCE}: could not find ${what}`);
  return match[1];
};

const viewBox = Number(grab(/viewBox="0 0 (\d+) \d+"/, 'a square viewBox'));
const background = grab(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/, 'the background rect');
const points = grab(/<polyline[^>]*points="([^"]+)"/, 'the polyline')
  .trim()
  .split(/\s+/)
  .map((pair) => pair.split(',').map(Number));
const stroke = grab(/<polyline[\s\S]*?stroke="(#[0-9A-Fa-f]{6})"/, 'the stroke colour');
const half = Number(grab(/stroke-width="(\d+(?:\.\d+)?)"/, 'the stroke width')) / 2;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const BG = rgb(background);
const FG = rgb(stroke);

/** Distance from (x, y) to the segment a–b. */
function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function inStroke(x, y) {
  for (let i = 0; i + 1 < points.length; i += 1) {
    if (distanceToSegment(x, y, points[i], points[i + 1]) <= half) return true;
  }
  return false;
}

const SAMPLES = 4;

function render(size) {
  const scale = viewBox / size;
  // One filter byte (0, none) per row, then RGB.
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let py = 0; py < size; py += 1) {
    const row = py * (1 + size * 3);
    raw[row] = 0;
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES) * scale;
          const y = (py + (sy + 0.5) / SAMPLES) * scale;
          if (inStroke(x, y)) hits += 1;
        }
      }
      const a = hits / (SAMPLES * SAMPLES);
      const at = row + 1 + px * 3;
      for (let c = 0; c < 3; c += 1) raw[at + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
    }
  }
  return png(size, size, raw);
}

// ------------------------------------------------------------ PNG encoding

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour RGB, no alpha — iOS wants opaque
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const { file, size } of OUTPUTS) {
  const data = render(size);
  writeFileSync(file, data);
  console.log(`${file}  ${size}×${size}  ${data.length} bytes`);
}
