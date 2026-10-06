// Shared helpers of the art-enemies-transit tests (transit_*.test.mjs, stake_check.test.mjs) and of
// tests/art_enemies/transit_evidence.mjs. Not a test file.
//
// The viewer's fallback material draws m_prop as tx_palette x COLOR_0 only: an EMISSIVE cell (the lens core, the hot
// stake tips) shows as its unlit albedo (husk grey, ash). `glow(game)` adds tx_palette_emis on top of every m_prop mesh
// of the viewed asset, in the page, the way code-render's m_prop will (albedo x light + emissive), so the weak point
// can be judged before code-render lands. It changes nothing in the file or in core. (Requested for the viewer itself:
// docs/requests/art-enemies-transit.md.)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, startServer, openGame } from '../harness.mjs';

export const PIECE = 'art-enemies-transit';
export const SHOTS = path.join(ROOT, 'shots', PIECE);
export const manifest = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'design/assets.json'), 'utf8'));

/** Run a node tool of the repository; -> { status, out }. */
export function tool(script, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', script), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** The asset viewer on one asset, as a deterministic shot page. query: yaw, pitch, dist, mood, ground, clip, t. */
export async function openViewer(server, asset, query = {}, viewport = { width: 960, height: 540 }) {
  return openGame(server, { page: 'sandbox/viewer', piece: PIECE, query: { asset, shot: 1, ...query }, viewport });
}

/** Add the emissive palette to the m_prop meshes of the viewed asset (see the header). `scale` 0 = the glow switched off. */
export async function glow(game, scale = 1) {
  return game.page.evaluate((k) => {
    const ctx = window.__dbg.ext.core.ctx();
    const holder = ctx.scene.dynamic.getObjectByName('viewer_holder');
    const emis = ctx.assets.texture('tx_palette_emis');
    let n = 0;
    holder.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.name !== 'm_prop') return;
      if (!o.userData.glowMaterial) {
        const m = o.material.clone();
        m.name = 'm_prop';
        m.userData.glow = { value: k };
        m.onBeforeCompile = (shader) => {
          shader.uniforms.ksEmis = { value: emis };
          shader.uniforms.ksGlow = m.userData.glow;
          shader.fragmentShader = 'uniform sampler2D ksEmis;\nuniform float ksGlow;\n'
            + shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += texture2D( ksEmis, vMapUv ).rgb * ksGlow;\n#include <opaque_fragment>');
        };
        m.customProgramCacheKey = () => 'ks_glow';
        o.userData.glowMaterial = m;
        o.material = m;
      }
      o.userData.glowMaterial.userData.glow.value = k;
      n++;
    });
    return n;
  }, scale);
}

/** One rendered frame of the page as a PNG buffer (canvas only). */
export async function frame(game) {
  const url = await game.page.evaluate(() => { window.__dbg.step(0, true); return window.__dbg.capture(); });   // the step runs the viewer's camera
  return Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64');
}

/** Hold `clip` at fraction t (0..1) of its length ('' = the rest pose). */
export function setClip(game, clip, t) {
  return game.page.evaluate(([c, x]) => window.__dbg.ext.viewer.setClip(c, x), [clip, t]);
}

/** Tile PNG buffers into one image (cols per row, optional crop of each tile: { left, top, width, height }). */
export async function sheet(buffers, file, { cols = buffers.length, crop = null, scale = 1 } = {}) {
  const tiles = [];
  for (const b of buffers) {
    let s = sharp(b);
    if (crop) s = s.extract(crop);
    if (scale !== 1) { const m = await sharp(b).metadata(); s = s.resize(Math.round((crop ? crop.width : m.width) * scale)); }
    tiles.push(await s.png().toBuffer());
  }
  const m = await sharp(tiles[0]).metadata();
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: m.width * cols, height: m.height * rows, channels: 3, background: '#000' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * m.width, top: Math.floor(i / cols) * m.height })))
    .png().toFile(file);
  return file;
}

/** sRGB 0..255 -> CIE L* (0..100). */
export function lstar(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

export { fs, path, sharp, ROOT, startServer };

/** Is the asset shown on this viewer page a placeholder file? */
export function isPlaceholder(game, asset) {
  return game.page.evaluate((id) => window.__dbg.ext.core.ctx().assets.get(id).isPlaceholder === true, asset);
}

/** The asset's own pixels as a mask { width, height, data: Uint8Array (1 = asset) }: a frame with it minus a frame without. */
export async function mask(game) {
  const a = await sharp(await frame(game)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  await game.page.evaluate(() => { window.__dbg.ext.core.ctx().scene.dynamic.getObjectByName('viewer_holder').visible = false; });
  const b = await sharp(await frame(game)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  await game.page.evaluate(() => { window.__dbg.ext.core.ctx().scene.dynamic.getObjectByName('viewer_holder').visible = true; });
  const { width, height } = a.info, data = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const d = Math.abs(a.data[i * 3] - b.data[i * 3]) + Math.abs(a.data[i * 3 + 1] - b.data[i * 3 + 1]) + Math.abs(a.data[i * 3 + 2] - b.data[i * 3 + 2]);
    data[i] = d > 6 ? 1 : 0;
  }
  return { width, height, data };
}

/** Crop a mask to its bounding box and resample it to `tall` pixels high (nearest) -> { width, height, data }. */
export function fitMask(m, tall = 48) {
  let x0 = m.width, x1 = -1, y0 = m.height, y1 = -1;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.data[y * m.width + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('fitMask: the mask is empty');
  const k = tall / (y1 - y0 + 1), width = Math.max(1, Math.round((x1 - x0 + 1) * k)), data = new Uint8Array(width * tall);
  for (let y = 0; y < tall; y++) for (let x = 0; x < width; x++) {
    // area sample: a thin leg must not vanish between samples
    const sx0 = Math.floor(x0 + x / k), sx1 = Math.max(sx0 + 1, Math.floor(x0 + (x + 1) / k)), sy0 = Math.floor(y0 + y / k), sy1 = Math.max(sy0 + 1, Math.floor(y0 + (y + 1) / k));
    let n = 0, t = 0;
    for (let yy = sy0; yy < sy1 && yy <= y1; yy++) for (let xx = sx0; xx < sx1 && xx <= x1; xx++) { t++; n += m.data[yy * m.width + xx]; }
    data[y * width + x] = t && n / t >= 0.5 ? 1 : 0;
  }
  return { width, height: tall, data };
}

/** Pixel IoU of two fitted masks of equal height, aligned on their bottom centres. */
export function iou(a, b) {
  const w = Math.max(a.width, b.width), oa = Math.floor((w - a.width) / 2), ob = Math.floor((w - b.width) / 2);
  let inter = 0, uni = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < w; x++) {
    const pa = x >= oa && x < oa + a.width ? a.data[y * a.width + x - oa] : 0, pb = x >= ob && x < ob + b.width ? b.data[y * b.width + x - ob] : 0;
    if (pa || pb) uni++;
    if (pa && pb) inter++;
  }
  return inter / uni;
}

/** A mask as a black-on-white PNG buffer, padded to `width` and scaled up `zoom` times (nearest). */
export async function maskPng(m, width, zoom = 4) {
  const off = Math.floor((width - m.width) / 2), raw = Buffer.alloc(width * m.height * 3, 255);
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.data[y * m.width + x]) raw.fill(0, (y * width + x + off) * 3, (y * width + x + off) * 3 + 3);
  return sharp(raw, { raw: { width, height: m.height, channels: 3 } }).resize(width * zoom, m.height * zoom, { kernel: 'nearest' }).png().toBuffer();
}
