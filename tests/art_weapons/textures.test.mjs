// art-weapons 5: tx_gun (1024 x 512 RGBA: albedo + gloss in alpha) and tx_matcap_steel (256 x 256), as shipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { M, ROOT, SHOTS } from './lib.mjs';

const POINTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'blender/weapons/tx_gun_points.json'), 'utf8'));
const PALETTE = JSON.parse(fs.readFileSync(path.join(ROOT, 'blender/lib/palette.json'), 'utf8')).cells;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const raw = async (file) => { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

test('tx_gun: 1024 x 512 with a gloss channel; blue 0.75, worn 0.9, walnut 0.35, brass 0.6 at the four named UV points', async () => {
  const t = await raw(M.textures.tx_gun._pub);
  assert.deepEqual([t.w, t.h], [1024, 512]);
  let lo = 255, hi = 0;
  for (let i = 3; i < t.data.length; i += 4) { lo = Math.min(lo, t.data[i]); hi = Math.max(hi, t.data[i]); }
  assert.ok(hi - lo > 100, `alpha is not a gloss mask (range ${lo}..${hi})`);
  const want = { blue: 0.75, worn: 0.9, walnut: 0.35, brass: 0.6 }, rows = [];
  for (const [name, g] of Object.entries(want)) {
    const p = POINTS.points[name];
    const x = Math.min(t.w - 1, Math.floor(p.uv[0] * t.w)), y = Math.min(t.h - 1, Math.floor((1 - p.uv[1]) * t.h));   // UV origin bottom-left (Blender); glTF flips V
    let s = 0, n = 0, rgb = [0, 0, 0];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = ((y + dy) * t.w + x + dx) * 4; s += t.data[i + 3] / 255; for (let k = 0; k < 3; k++) rgb[k] += t.data[i + k]; n++; }
    rows.push(`${name} ${(s / n).toFixed(3)} (rgb ${rgb.map((v) => Math.round(v / n)).join(',')})`);
    assert.ok(Math.abs(s / n - g) <= 0.05, `${name}: gloss ${s / n}, wanted ${g} +- 0.05 at px ${x},${y}`);
  }
  console.log('tx_gun gloss: ' + rows.join('; ') + `; density ${POINTS.density_px_per_m} px/m at weight 1`);
  assert.ok(POINTS.density_px_per_m >= 2000 / 1.3, 'the parts nearest the camera (weight 1.25-1.5) fall under 2000 px/m');
  // evidence: the gloss channel alone
  const a = Buffer.alloc(t.w * t.h); for (let i = 0; i < a.length; i++) a[i] = t.data[i * 4 + 3];
  await sharp(a, { raw: { width: t.w, height: t.h, channels: 1 } }).png().toFile(path.join(SHOTS, 'tx_gun_gloss.png'));
  const rgb = Buffer.alloc(t.w * t.h * 3); for (let i = 0; i < t.w * t.h; i++) { rgb[i * 3] = t.data[i * 4]; rgb[i * 3 + 1] = t.data[i * 4 + 1]; rgb[i * 3 + 2] = t.data[i * 4 + 2]; }
  await sharp(rgb, { raw: { width: t.w, height: t.h, channels: 3 } }).png().toFile(path.join(SHOTS, 'tx_gun.png'));
});

test('tx_gun: the blue is darker than every palette colour except lens (and the unlit bases of the emissive cells)', async () => {
  const t = await raw(M.textures.tx_gun._pub);
  // the blue as shipped: every texel whose gloss is 0.75 +- 0.03 (plain blued steel, no wear, no cavity)
  let s = 0, n = 0;
  for (let i = 0; i < t.data.length; i += 4) if (Math.abs(t.data[i + 3] / 255 - 0.75) < 0.03) { s += lum(t.data[i], t.data[i + 1], t.data[i + 2]); n++; }
  const blue = s / n;
  const others = Object.entries(PALETTE).filter(([k, c]) => k !== 'lens' && !c.emis && k !== 'gun_blue' && !k.startsWith('ui_'))        // ui_* are the HUD's inks, not surfaces of the world
    .map(([k, c]) => [k, lum(parseInt(c.hex.slice(1, 3), 16), parseInt(c.hex.slice(3, 5), 16), parseInt(c.hex.slice(5, 7), 16))]).sort((a, b) => a[1] - b[1]);
  console.log(`tx_gun blue: mean luminance ${blue.toFixed(1)} over ${(100 * n / (t.w * t.h)).toFixed(0)} % of the sheet; the darkest palette colours: ${others.slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
  assert.ok(n > t.w * t.h * 0.2);
  for (const [k, v] of others) assert.ok(blue < v, `the blue (${blue.toFixed(1)}) is not darker than ${k} (${v.toFixed(1)})`);
});

test('tx_matcap_steel: 256 x 256, a dark body, one warm highlight upper left, one thin cool rim lower right', async () => {
  const t = await raw(M.textures.tx_matcap_steel._pub);
  assert.deepEqual([t.w, t.h], [256, 256]);
  const at = (nx, ny) => { const x = Math.round(128 + nx * 127), y = Math.round(128 - ny * 127), i = (y * 256 + x) * 4; return [t.data[i], t.data[i + 1], t.data[i + 2]]; };
  const centre = at(0, 0), key = at(-0.55, 0.55), rim = at(0.69, -0.69), lowerLeft = at(-0.5, -0.5), upperRight = at(0.5, 0.5);
  console.log(`matcap: centre ${centre}, key (upper left) ${key}, rim (lower right) ${rim}, lower left ${lowerLeft}, upper right ${upperRight}`);
  assert.ok(lum(...centre) < 30 && lum(...lowerLeft) < 30 && lum(...upperRight) < 40, 'the body is not dark');
  assert.ok(lum(...key) > 200 && key[0] > key[2], 'no warm highlight upper left');
  assert.ok(rim[2] > rim[0] + 20 && lum(...rim) > 60, 'no cool rim lower right');
  // one highlight: the bright texels (> 128) form one blob covering less than 3 % of the disc
  // one highlight: inside the disc (the rim and the corners apart) the texels brighter than mid grey are one small blob
  let bright = 0, disc = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    if (Math.hypot(x - 127.5, y - 127.5) > 0.9 * 127.5) continue;
    disc++; const i = (y * 256 + x) * 4; if (lum(t.data[i], t.data[i + 1], t.data[i + 2]) > 128) bright++;
  }
  console.log(`matcap: ${(100 * bright / disc).toFixed(2)} % of the disc (r < 0.9) is brighter than mid grey`);
  assert.ok(bright / disc < 0.05 && bright / disc > 0.005);
  fs.copyFileSync(M.textures.tx_matcap_steel._raw, path.join(SHOTS, 'tx_matcap_steel.png'));
});
