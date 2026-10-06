// measure.mjs (not a test): the measured numbers of the order's definition of done, item 4.
//   node tests/art_env_exterior/measure.mjs squint <png> [...]            32 x 18 box blur -> three L* clusters, their shares and gaps
//   node tests/art_env_exterior/measure.mjs sample <samples.json>          [{ file, name, target: "#RRGGBB", box: [x, y, w, h] }] -> mean colour, dE76 to the target
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../harness.mjs';

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function lab([r, g, b]) {
  const R = s2l(r / 255), G = s2l(g / 255), B = s2l(b / 255);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const abs = (f) => (path.isAbsolute(f) ? f : path.join(ROOT, f));

export async function squint(file) {
  const { data, info } = await sharp(abs(file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = 32, H = 18, cells = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x0 = Math.floor(i * info.width / W), x1 = Math.floor((i + 1) * info.width / W), y0 = Math.floor(j * info.height / H), y1 = Math.floor((j + 1) * info.height / H);
    const s = [0, 0, 0]; let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * info.width + x) * 3; s[0] += s2l(data[k] / 255); s[1] += s2l(data[k + 1] / 255); s[2] += s2l(data[k + 2] / 255); n++; }
    const Y = (0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]) / n;
    cells.push(Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y);
  }
  const sorted = [...cells].sort((a, b) => a - b);
  let c = [sorted[Math.floor(cells.length * 0.1)], sorted[Math.floor(cells.length * 0.5)], sorted[Math.floor(cells.length * 0.9)]];
  let cnt = [0, 0, 0];
  for (let it = 0; it < 40; it++) {
    const sum = [0, 0, 0]; cnt = [0, 0, 0];
    for (const v of cells) { let b = 0; for (let k = 1; k < 3; k++) if (Math.abs(v - c[k]) < Math.abs(v - c[b])) b = k; sum[b] += v; cnt[b]++; }
    c = c.map((v, k) => (cnt[k] ? sum[k] / cnt[k] : v));
  }
  const share = cnt.map((n) => Math.round(100 * n / cells.length));
  return { file, dark: +c[0].toFixed(1), mid: +c[1].toFixed(1), light: +c[2].toFixed(1), gaps: [+(c[1] - c[0]).toFixed(1), +(c[2] - c[1]).toFixed(1)], 'light:mid:dark': `${share[2]} : ${share[1]} : ${share[0]}` };
}

export async function sample(list) {
  const out = [];
  for (const s of list) {
    const { data, info } = await sharp(abs(s.file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const [bx, by, bw, bh] = s.box; const m = [0, 0, 0]; let n = 0;
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) { const k = (y * info.width + x) * 3; m[0] += data[k]; m[1] += data[k + 1]; m[2] += data[k + 2]; n++; }
    const rgb = m.map((v) => Math.round(v / n));
    out.push({ name: s.name, file: s.file, box: s.box.join(','), measured: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(), target: s.target, dE76: +dE(lab(rgb), lab(hex(s.target))).toFixed(1) });
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'squint') for (const f of rest) console.log(JSON.stringify(await squint(f)));
  else if (mode === 'sample') console.table(await sample(JSON.parse(fs.readFileSync(abs(rest[0]), 'utf8'))));
  else console.log('usage: measure.mjs squint <png>... | sample <samples.json>');
}
