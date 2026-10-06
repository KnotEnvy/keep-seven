// Shared helpers of the render tests: the sandbox page with the real render system, colour maths, pixel reads.
import { PNG } from 'pngjs';
import { openGame } from '../harness.mjs';

export const PIECE = 'code-render';

/** sandbox/render.html in test mode: the real render system beside five core stubs */
export function openSandbox(server, { scene = 'room', tier = 'low', query = {}, viewport, allowErrors = false } = {}) {
  return openGame(server, { page: 'sandbox/render', piece: PIECE, tier, start: false, query: { scene, ...query }, viewport, allowErrors });
}
/** the index page with the real render system (the harness keeps the other five slots on core stubs) */
export function openIndex(server, options = {}) {
  return openGame(server, { piece: PIECE, ...options });
}

export const hexRgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
export const srgbToLinear = (b) => { const c = b / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const linearToByte = (v) => { const c = Math.min(1, Math.max(0, v)); return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); };
export function lab([r, g, b]) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), fy = f(0.2126 * R + 0.7152 * G + 0.0722 * B), fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** CIE76 Delta E between two sRGB byte triples */
export function deltaE(a, b) { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }

/** One frame of the page as a decoded PNG: { width, height, data } (through __dbg.capture: canvas only). */
export async function frame(game) {
  const url = await game.page.evaluate(() => window.__dbg.capture());
  return PNG.sync.read(Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
export function px(png, x, y) {
  const i = (Math.min(png.height - 1, Math.max(0, Math.round(y))) * png.width + Math.min(png.width - 1, Math.max(0, Math.round(x)))) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}
/** mean of the (2r+1)^2 block round a pixel (grain averages out) */
export function mean(png, x, y, r = 3) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const p = px(png, x + dx, y + dy); sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++; }
  return sum.map((v) => v / n);
}
/** per-channel minimum of the block */
export function least(png, x, y, r = 3) {
  const m = [255, 255, 255];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const p = px(png, x + dx, y + dy); for (let k = 0; k < 3; k++) m[k] = Math.min(m[k], p[k]); }
  return m;
}
/** __dbg.ext.<name>.<method>(...args) in the page */
export function ext(game, name, method, ...args) {
  return game.page.evaluate(([n, m, a]) => window.__dbg.ext[n][m](...a), [name, method, args]);
}
/** n ticks, each followed by a drawn frame (the sandbox's per-frame loops run) */
export function frames(game, n) {
  return game.page.evaluate((count) => { for (let i = 0; i < count; i++) window.__dbg.step(1, true); }, n);
}
/**
 * The same, drawn into a 96 x 54 buffer: for long runs whose pictures nobody reads. Under SwiftShader every full-size
 * frame is queued rasteriser work, and a screenshot after a few hundred of them waits for the whole queue.
 */
export async function framesSmall(game, n) {
  const size = game.page.viewportSize() ?? { width: 960, height: 540 };
  await game.page.setViewportSize({ width: 96, height: 54 });
  await game.page.evaluate(() => window.__dbg.ext.core.ctx().render.resize(96, 54));
  await frames(game, n);
  await game.page.setViewportSize(size);
  await game.page.evaluate(([w, h]) => window.__dbg.ext.core.ctx().render.resize(w, h), [size.width, size.height]);
  await frames(game, 1);
}
export const TIERS = ['min', 'low', 'high'];
