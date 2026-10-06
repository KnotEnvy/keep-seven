// Shared helpers of the art-enemies-bider tests (bider_*.test.mjs) and of tests/art_enemies/bider_evidence.mjs.
// Not a test file. (The transit half keeps its own helpers: the two halves share no file.)
//
// The viewer's fallback material draws m_prop as tx_palette x COLOR_0 only: an EMISSIVE cell (the knot's lobes, the
// pinpricks in the slits) shows as its unlit albedo, husk grey. `glow(game)` adds tx_palette_emis on top of every m_prop
// mesh in the page, the way code-render's m_prop will (albedo x light + emissive), so the weak point can be judged now.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, startServer, openGame } from '../harness.mjs';

export const PIECE = 'art-enemies-bider';
export const SHOTS = path.join(ROOT, 'shots', PIECE);
export const IDS = ['enemy_bider', 'bider_seated_static', 'bider_felled_static', 'bider_table_static'];
export const manifest = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'design/assets.json'), 'utf8'));
export const frames = (clip) => {
  const c = manifest().assets.enemy_bider.animations.find((a) => a.name === clip);
  return Math.max(1, Math.round(c.seconds * 30));
};

export function tool(script, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', script), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

export async function openViewer(server, asset, query = {}, viewport = { width: 960, height: 540 }) {
  return openGame(server, { page: 'sandbox/viewer', piece: PIECE, query: { asset, shot: 1, ...query }, viewport });
}

export function setClip(game, clip, t) {
  return game.page.evaluate(([c, x]) => window.__dbg.ext.viewer.setClip(c, x), [clip, t]);
}

export function pose(game, names) {
  return game.page.evaluate((n) => window.__dbg.ext.viewer.pose(n), names);
}

/** Add the emissive palette to every m_prop mesh under the viewer (see the header). scale 0 = the glow off. */
export async function glow(game, scale = 1) {
  return game.page.evaluate((k) => {
    const ctx = window.__dbg.ext.core.ctx();
    const emis = ctx.assets.texture('tx_palette_emis');
    let n = 0;
    ctx.scene.dynamic.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.name !== 'm_prop') return;
      if (!o.userData.ksGlow) {
        const m = o.material.clone(); m.name = 'm_prop'; m.userData.glow = { value: k };
        m.onBeforeCompile = (shader) => {
          shader.uniforms.ksEmis = { value: emis }; shader.uniforms.ksGlow = m.userData.glow;
          shader.fragmentShader = 'uniform sampler2D ksEmis;\nuniform float ksGlow;\n'
            + shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += texture2D( ksEmis, vMapUv ).rgb * ksGlow;\n#include <opaque_fragment>');
        };
        m.customProgramCacheKey = () => 'ks_bider_glow';
        o.userData.ksGlow = m; o.material = m;
      }
      o.userData.ksGlow.userData.glow.value = k; n++;
    });
    return n;
  }, scale);
}

/** One rendered frame as a PNG buffer (the canvas). */
export async function frame(game) {
  const url = await game.page.evaluate(() => { window.__dbg.step(0, true); return window.__dbg.capture(); });
  return Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64');
}

/** Bounding box of the drawn asset (skinned vertices where they are drawn) in ASSET space (game metres, +Y up). */
export function assetBox(game) {
  return game.page.evaluate(() => {
    const ctx = window.__dbg.ext.core.ctx();
    const holder = ctx.scene.dynamic.getObjectByName('viewer_holder');
    holder.updateMatrixWorld(true);
    let root = null; holder.traverse((o) => { if (!root && o.userData && o.userData.asset) root = o; });
    root = root || holder.children[0];
    const inv = root.matrixWorld.clone().invert();
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) o.skeleton.update();
      const pos = o.geometry.getAttribute('position'); const v = new root.position.constructor();
      for (let i = 0; i < pos.count; i++) {
        o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        mn[0] = Math.min(mn[0], v.x); mn[1] = Math.min(mn[1], v.y); mn[2] = Math.min(mn[2], v.z);
        mx[0] = Math.max(mx[0], v.x); mx[1] = Math.max(mx[1], v.y); mx[2] = Math.max(mx[2], v.z);
      }
    });
    return { min: mn, max: mx };
  });
}

/** Tile PNG buffers into one image. */
export async function sheet(buffers, file, { cols = buffers.length, crop = null } = {}) {
  const tiles = [];
  for (const b of buffers) tiles.push(await (crop ? sharp(b).extract(crop) : sharp(b)).png().toBuffer());
  const m = await sharp(tiles[0]).metadata();
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: m.width * cols, height: m.height * rows, channels: 3, background: '#000' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * m.width, top: Math.floor(i / cols) * m.height })))
    .png().toFile(file);
  return file;
}

export function lstar(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

export function isPlaceholder(game, asset) {
  return game.page.evaluate((id) => window.__dbg.ext.core.ctx().assets.get(id).isPlaceholder === true, asset);
}

/** The asset's own pixels: a frame with it minus a frame without. */
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

/** Crop a mask to its box and resample it to `tall` px high (area sampling). */
export function fitMask(m, tall = 48) {
  let x0 = m.width, x1 = -1, y0 = m.height, y1 = -1;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.data[y * m.width + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) throw new Error('fitMask: empty mask');
  const k = tall / (y1 - y0 + 1), width = Math.max(1, Math.round((x1 - x0 + 1) * k)), data = new Uint8Array(width * tall);
  for (let y = 0; y < tall; y++) for (let x = 0; x < width; x++) {
    const sx0 = Math.floor(x0 + x / k), sx1 = Math.max(sx0 + 1, Math.floor(x0 + (x + 1) / k)), sy0 = Math.floor(y0 + y / k), sy1 = Math.max(sy0 + 1, Math.floor(y0 + (y + 1) / k));
    let n = 0, t = 0;
    for (let yy = sy0; yy < sy1 && yy <= y1; yy++) for (let xx = sx0; xx < sx1 && xx <= x1; xx++) { t++; n += m.data[yy * m.width + xx]; }
    data[y * width + x] = t && n / t >= 0.5 ? 1 : 0;
  }
  return { width, height: tall, data };
}

/** IoU of two fitted masks of equal height, aligned on their bottom centres. */
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

export async function maskPng(m, width, zoom = 4) {
  const off = Math.floor((width - m.width) / 2), raw = Buffer.alloc(width * m.height * 3, 255);
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.data[y * m.width + x]) raw.fill(0, (y * width + x + off) * 3, (y * width + x + off) * 3 + 3);
  return sharp(raw, { raw: { width, height: m.height, channels: 3 } }).resize(width * zoom, m.height * zoom, { kernel: 'nearest' }).png().toBuffer();
}

export { fs, path, sharp, ROOT, startServer };
