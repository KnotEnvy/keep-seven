// node tools/gen_fx_atlas.mjs [--out <dir>]
//
// Draws the two textures the render owner authors (ART_BIBLE 9.1, ARCHITECTURE 7.6), deterministically, with sharp:
//   tx_fx.png     1024 x 512 RGBA, PREMULTIPLIED alpha. Row A: four 256 px cells flash_a..d (a six-pointed star with
//                 unequal arms, white-hot core to flame edge, four rotations with different arm lengths). Rows B and C:
//                 sixteen 128 px cells: smoke_a smoke_b dust_a dust_b spark soft_dot star4 shard / splinter sand_pour
//                 mote_cluster dec_wood dec_adobe dec_metal dec_ceramic dec_stone.
//   tx_noise.png  128 x 128, ONE channel, tiling soft cloud noise (cloud shadows, the bore's ripple).
// The build driver runs it as `node tools/gen_fx_atlas.mjs --out <dir>` (node tools/build-assets.mjs --only render).
//
// Storage: a texel holds sRGB-encoded (linear colour x alpha) and alpha. The runtime samples it as an sRGB texture, so
// it reads linear premultiplied colour. The cell table is the one in src/render/vfx/atlas.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const outAt = argv.indexOf('--out');
const OUT = outAt >= 0 ? path.resolve(argv[outAt + 1]) : path.join(ROOT, 'blender/export/tex');

const W = 1024, H = 512;
export const CELLS = [
  'flash_a', 'flash_b', 'flash_c', 'flash_d',
  'smoke_a', 'smoke_b', 'dust_a', 'dust_b', 'spark', 'soft_dot', 'star4', 'shard',
  'splinter', 'sand_pour', 'mote_cluster', 'dec_wood', 'dec_adobe', 'dec_metal', 'dec_ceramic', 'dec_stone',
];
export function cellPixels(index) {
  if (index < 4) return [index * 256, 0, 256, 256];
  const i = index - 4;
  return [(i % 8) * 128, 256 + Math.floor(i / 8) * 128, 128, 128];
}

// ---- deterministic helpers ------------------------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex = (h) => [srgbToLinear(((h >> 16) & 255) / 255), srgbToLinear(((h >> 8) & 255) / 255), srgbToLinear((h & 255) / 255)];
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** value noise, periodic with `period` lattice cells */
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = (n) => ((n % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed), c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return mix(mix(a, b, u), mix(c, d, u), v);
}
function fbm(x, y, period, seed, octaves = 4) {
  let sum = 0, amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * vnoise(x, y, period, seed + o * 17); total += amp; x *= 2; y *= 2; period *= 2; amp *= 0.5; }
  return sum / total;
}
/** signed distance to a convex polygon (points counter-clockwise): negative inside */
function polyDist(px, py, pts) {
  let d = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey);
    d = Math.max(d, ((px - ax) * ey - (py - ay) * ex) / l);
  }
  return d;
}

const FLAME = hex(0xff9433), FLAME_CORE = hex(0xffe9b8), WHITE = [1, 1, 1];

// ---- the cells: each returns linear [r, g, b, a] (straight, not premultiplied) for u, v in -1..1 --------------------
function flash(variant) {
  // six arms of unequal length; the four variants turn the star and shuffle the lengths
  const rng = mulberry32(1000 + variant * 31);
  const turn = variant * 0.41 + 0.2;
  const arms = [];
  for (let k = 0; k < 6; k++) arms.push({ a: turn + k * Math.PI / 3 + (rng() - 0.5) * 0.25, len: 0.5 + rng() * 0.48, w: 0.045 + rng() * 0.035 });
  return (u, v) => {
    const r = Math.hypot(u, v), th = Math.atan2(v, u);
    let i = Math.exp(-r * r * 60) * 1.6 + Math.exp(-r * r * 14) * 0.35;
    for (const arm of arms) {
      let d = th - arm.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 1.2) continue;
      const across = Math.abs(Math.sin(d)) * r, along = Math.cos(d) * r;
      if (along < 0) continue;
      const taper = clamp01(1 - along / arm.len);
      i += taper * Math.sqrt(taper) * Math.exp(-(across * across) / (arm.w * arm.w * (0.15 + taper)));
    }
    i *= smooth(1.0, 0.82, r);
    const a = clamp01(i);
    // white-hot core, flame at the edge
    const t = smooth(0.25, 0.9, a);
    const c = [mix(FLAME[0], mix(FLAME_CORE[0], 1, t), t), mix(FLAME[1], mix(FLAME_CORE[1], 1, t), t), mix(FLAME[2], mix(FLAME_CORE[2], 1, t), t)];
    return [c[0], c[1], c[2], a];
  };
}
function puff(seed, grain, strength) {
  return (u, v) => {
    const r = Math.hypot(u, v);
    const n = fbm((u + 1) * 2.2, (v + 1) * 2.2, 64, seed, 4);
    const fine = fbm((u + 1) * 9, (v + 1) * 9, 64, seed + 99, 2);
    const edge = smooth(1.0, 0.25 + 0.35 * n, r);
    const a = clamp01(edge * (0.55 + 0.75 * n) * mix(1, 0.6 + 0.8 * fine, grain) * strength);
    const shade = 0.82 + 0.18 * n;
    return [shade, shade, shade, a];
  };
}
const spark = (u, v) => {
  // a short streak along +v, hot in the middle
  const a = Math.exp(-(u * u) / 0.02) * smooth(1.0, 0.1, Math.abs(v)) * (0.6 + 0.4 * smooth(-1, 0.4, v));
  return [1, 1, 1, clamp01(a * 1.3)];
};
const softDot = (u, v) => { const r2 = u * u + v * v; const a = Math.exp(-r2 * 4.2) * smooth(1.0, 0.7, Math.sqrt(r2)); return [1, 1, 1, clamp01(a)]; };
const star4 = (u, v) => {
  const r = Math.hypot(u, v);
  const arm = (p, q) => Math.exp(-(q * q) / (0.0016 + 0.02 * Math.max(0, 0.25 - Math.abs(p)) ** 2)) * smooth(1.0, 0.0, Math.abs(p));
  const a = Math.max(arm(u, v), arm(v, u) * 0.85) + Math.exp(-r * r * 30) + Math.exp(-r * r * 7) * 0.25;
  return [1, 1, 1, clamp01(a)];
};
const SHARD = [[-0.55, -0.6], [0.7, -0.25], [0.35, 0.65], [-0.3, 0.45]];
const shard = (u, v) => {
  const d = polyDist(u, v, SHARD);
  const a = smooth(0.03, -0.03, d);
  const facet = u * 0.5 - v * 0.3 > 0 ? 1.0 : 0.72;
  const rim = smooth(-0.14, -0.02, d) * 0.25;
  return [facet + rim, facet + rim, facet + rim, a];
};
const SPLINTER = [[-0.12, -0.92], [0.1, -0.7], [0.16, 0.55], [0.02, 0.95], [-0.14, 0.4]];
const splinter = (u, v) => {
  const d = polyDist(u, v, SPLINTER);
  const a = smooth(0.03, -0.03, d);
  const grain = 0.8 + 0.2 * Math.sin(u * 60 + v * 3);
  return [grain, grain, grain, a];
};
const sandPour = (u, v) => {
  const n = fbm((u + 1) * 14, (v + 1) * 5, 64, 77, 3);
  const a = Math.exp(-(u * u) / 0.07) * smooth(1.0, 0.6, Math.abs(v)) * (0.45 + 0.75 * n);
  return [1, 0.96, 0.9, clamp01(a)];
};
const MOTES = (() => { const rng = mulberry32(4242); const m = []; for (let i = 0; i < 7; i++) m.push([(rng() - 0.5) * 1.3, (rng() - 0.5) * 1.3, 0.06 + rng() * 0.09]); return m; })();
const moteCluster = (u, v) => {
  let a = 0;
  for (const [x, y, s] of MOTES) { const d2 = (u - x) * (u - x) + (v - y) * (v - y); a += Math.exp(-d2 / (s * s)); }
  return [1, 1, 1, clamp01(a)];
};
/** a decal: alpha is 1 inside an irregular outline (the material alpha-tests at 0.5) */
function decal(seed, radius, paint) {
  return (u, v) => {
    const r = Math.hypot(u, v), th = Math.atan2(v, u);
    const wob = 1 + 0.22 * (vnoise((th + Math.PI) * 1.9, 0.5, 12, seed) - 0.5) * 2 + 0.08 * (vnoise((th + Math.PI) * 5.1, 3.5, 32, seed + 7) - 0.5) * 2;
    const edge = radius * wob;
    const a = smooth(edge + 0.05, edge - 0.05, r);
    const c = paint(r / edge, th, u, v);
    return [c[0], c[1], c[2], a];
  };
}
const WOOD_DARK = hex(0x1b130f), WOOD_PALE = hex(0xa98c72), ADOBE_PALE = hex(0xd9bf9e), ADOBE_DEEP = hex(0x7a563e), STEEL_BRIGHT = hex(0xc9d2d4), STEEL_DARK = hex(0x1e2f36);
const ENAMEL = hex(0xe9eee6), CRACK = hex(0x232a2c), STONE = hex(0x6a625c), STONE_DUST = hex(0xa69c90);
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const decWood = decal(11, 0.62, (k, th) => lerp3(WOOD_DARK, WOOD_PALE, smooth(0.42, 0.75, k) * (0.75 + 0.25 * Math.sin(th * 9))));
const decAdobe = decal(23, 0.78, (k) => lerp3(ADOBE_DEEP, ADOBE_PALE, smooth(0.15, 0.6, k)));
const decMetal = decal(37, 0.5, (k, th, u, v) => lerp3(STEEL_DARK, STEEL_BRIGHT, clamp01(smooth(0.2, 0.5, k) * (0.7 + 0.3 * Math.sin((u + v) * 14)))));
const decCeramic = decal(51, 0.66, (k, th) => {
  // a white chip with a dark star crack
  const spoke = Math.abs(Math.sin(th * 2.5 + 0.4));
  const crack = (1 - smooth(0.0, 0.10 + 0.05 * k, spoke)) * smooth(1.0, 0.25, k) + (1 - smooth(0.1, 0.22, k));
  return lerp3(ENAMEL, CRACK, clamp01(crack));
});
const decStone = decal(67, 0.6, (k, th, u, v) => lerp3(STONE, STONE_DUST, smooth(0.3, 0.9, k) * (0.6 + 0.4 * fbm((u + 1) * 6, (v + 1) * 6, 32, 5, 2))));

const DRAW = {
  flash_a: flash(0), flash_b: flash(1), flash_c: flash(2), flash_d: flash(3),
  smoke_a: puff(301, 0.15, 0.9), smoke_b: puff(302, 0.15, 0.8), dust_a: puff(401, 0.8, 0.75), dust_b: puff(402, 0.8, 0.7),
  spark, soft_dot: softDot, star4, shard, splinter, sand_pour: sandPour, mote_cluster: moteCluster,
  dec_wood: decWood, dec_adobe: decAdobe, dec_metal: decMetal, dec_ceramic: decCeramic, dec_stone: decStone,
};

function drawAtlas() {
  const out = Buffer.alloc(W * H * 4);
  const SS = 2;                                    // 2 x 2 supersampling
  CELLS.forEach((name, index) => {
    const fn = DRAW[name];
    if (!fn) throw new Error(`gen_fx_atlas: no drawing for cell '${name}'`);
    const [x0, y0, w, h] = cellPixels(index);
    const guard = 4;                               // texels kept empty at the edge of a cell (mips)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        if (x >= guard && y >= guard && x < w - guard && y < h - guard) {
          for (let sy = 0; sy < SS; sy++) {
            for (let sx = 0; sx < SS; sx++) {
              const u = ((x - guard + (sx + 0.5) / SS) / (w - 2 * guard)) * 2 - 1;
              const v = 1 - ((y - guard + (sy + 0.5) / SS) / (h - 2 * guard)) * 2;        // +v is up in the cell
              const c = fn(u, v);
              const al = clamp01(c[3]);
              r += clamp01(c[0]) * al; g += clamp01(c[1]) * al; b += clamp01(c[2]) * al; a += al;
            }
          }
          const n = SS * SS;
          r /= n; g /= n; b /= n; a /= n;
        }
        const o = ((y0 + y) * W + x0 + x) * 4;
        out[o] = Math.round(linearToSrgb(r) * 255); out[o + 1] = Math.round(linearToSrgb(g) * 255); out[o + 2] = Math.round(linearToSrgb(b) * 255); out[o + 3] = Math.round(a * 255);
      }
    }
  });
  return out;
}

function drawNoise() {
  const N = 128;
  const out = Buffer.alloc(N * N);
  let lo = 1, hi = 0;
  const f = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = fbm((x / N) * 4, (y / N) * 4, 4, 9001, 4);
      f[y * N + x] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
  }
  // stretched to the full range, with a soft shoulder: large pale areas and softer, darker cloud bodies
  for (let i = 0; i < N * N; i++) out[i] = Math.round(smooth(0.1, 0.9, (f[i] - lo) / (hi - lo)) * 255);
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await sharp(drawAtlas(), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'tx_fx.png'));
  // one channel: sharp writes a 1-channel raw buffer as three channels unless told the colourspace
  await sharp(drawNoise(), { raw: { width: 128, height: 128, channels: 1 } }).toColourspace('b-w').png({ compressionLevel: 9 }).toFile(path.join(OUT, 'tx_noise.png'));
  console.log(`gen_fx_atlas: wrote tx_fx.png (${W} x ${H}, ${CELLS.length} cells) and tx_noise.png (128 x 128) to ${path.relative(ROOT, OUT) || '.'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
