// i6.test.mjs (pass i6, look team "exterior-look"): what the two visual reviewers named, held.
//   R16           (the REAL game) High is plainly not Low under the overhang at the start and in the last view on the rim:
//                 a tenth of the frame or more differs by more than 24 of 255 (it was a twentieth); the mist lies on the
//                 plain, not on the ledge, and the last view keeps its dark third
//   the sighting  the rimrock under the pursued man is a mesa's rim (a level caprock many of his heights long), not a knob
//   the pylon     the gate mast carries bands and a cable bundle up its height (it was a bare tapered prism over 4 m)
//   the last image's foreground  a bed's lit lip is a band a pace wide, not a hand's breadth (a drawn line)
// Frames: shots/i6-team-exterior-look/test/.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';
import { loadAsset } from './geo.mjs';

const SHOTS = path.join(ROOT, 'shots/i6-team-exterior-look/test');
const W = 1280, H = 720;

test('the gate pylon is a built mast: steel bands, dark bands and the cable bundle stand proud of the cladding from 2 m to its head', async () => {
  const a = await loadAsset('env_the_lip');
  // triangles inside the mast's box at (4, 6.5), by height (over 4 m the mast is drawn with the landmark chunk, chunk_lip_rock)
  let low = 0, mid = 0, high = 0;
  const T = a.tris;
  for (let k = 0; k < a.mats.length; k++) {
    const i = k * 9, cx = (T[i] + T[i + 3] + T[i + 6]) / 3, cy = (T[i + 1] + T[i + 4] + T[i + 7]) / 3, cz = (T[i + 2] + T[i + 5] + T[i + 8]) / 3;
    if (Math.abs(cx - 4) > 1.4 || Math.abs(cz - 6.5) > 1.6) continue;
    if (cy > 2.2 && cy <= 6.4) low++; else if (cy > 6.4 && cy <= 10.4) mid++; else if (cy > 10.4 && cy < 15.4) high++;
  }
  console.log(`pylon: ${low} triangles from 2.2 to 6.4 m, ${mid} to 10.4 m, ${high} to 15.4 m (a bare eight-sided mast has 16 a module)`);
  assert.ok(low >= 320, `${low} triangles on the mast between 2.2 and 6.4 m (bands, cables, clamps, lost panels, weeps)`);
  assert.ok(mid >= 255, `${mid} triangles between 6.4 and 10.4 m (the white half is broken by bands, a lost panel and the cables)`);
  assert.ok(high >= 300, `${high} triangles between 10.4 and 15.4 m`);
});

test('the last image\'s foreground: the lit lips of the rimrock are bands a pace wide (not drawn lines)', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'blender/env_exterior/env_backdrop_dusk.py'), 'utf8');
  const m = /LIP_W = \(([\d.]+), ([\d.]+)\); LIP_PEAK = ([\d.]+)/.exec(src);
  assert.ok(m, 'env_backdrop_dusk.py states LIP_W and LIP_PEAK');
  assert.ok(+m[1] >= 0.7, `a lip is ${m[1]} m wide or more (it was 0.26)`);
  assert.ok(+m[3] <= 0.7, `its peak is ${m[3]} of pass i5's (a soft rim light)`);
  const a = await loadAsset('env_backdrop_dusk');
  assert.ok(a.mats.length <= 3200, `${a.mats.length} triangles of 3 200`);
});

let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'i6-team-exterior-look', tier: 'low', checkpoint: 'cp_rim', viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await server.close(); });

async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
const dir = (p, yawDeg, pitDeg = 0) => { const y = yawDeg * Math.PI / 180, pt = pitDeg * Math.PI / 180; return [p[0] - 100 * Math.sin(y), p[1] + 1.65 + 100 * Math.tan(pt), p[2] - 100 * Math.cos(y)]; };
const hideGun = () => page.evaluate(() => { const d = window.__dbg; for (const c of d.ext.core.ctx().scene.viewModel.children) c.visible = false; d.step(0, true); });
const jump = (cp) => page.evaluate(async (cp) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true); }, cp);
const place = async (pos, at, steps = 20) => { await page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } }, { pos, at, steps }); };
const tier = async (t) => { await page.evaluate(async (t) => { const d = window.__dbg; d.setTier(t); await d.ext.core.stepAsync(90, true); }, t); };
const lum = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
/** mean absolute difference of 255 and the share of pixels more than 24 apart, in a window of the frame */
function differ(a, b, x0 = 0, y0 = 0, x1 = W, y1 = H) {
  let s = 0, big = 0, n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * W + x) * 4, d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
    s += d; n++; if (d > 24) big++;
  }
  return { mean: s / n, big: 100 * big / n };
}

test('R16: in the last view on the rim High is not Low: mist on the plain, none on the ledge, and the frame keeps its dark', async () => {
  await jump('cp_rim');
  const pos = [2.956, 18, 102.971];
  const f = {};
  for (const t of ['low', 'high']) {
    await tier(t);
    await place(pos, dir(pos, -4.05, 1.25)); await hideGun();
    f[t] = await grab(`last_${t}`);
  }
  const all = differ(f.low, f.high), plain = differ(f.low, f.high, 0, 400, W, 560);
  console.log(`last view, Low against High: ${all.mean.toFixed(1)} of 255, ${all.big.toFixed(1)} % of the frame more than 24 apart; the plain's band (rows 400 to 560) ${plain.mean.toFixed(1)}, ${plain.big.toFixed(1)} %`);
  assert.ok(all.mean >= 9, `the frame differs by ${all.mean.toFixed(1)} of 255 (it was 7.9)`);
  assert.ok(all.big >= 8, `${all.big.toFixed(1)} % of the frame is plainly different (it was 5.1 %)`);
  assert.ok(plain.mean >= 12, `the plain under the ledge carries the mist (${plain.mean.toFixed(1)} of 255 in its band)`);
  // the dark third: the darkest twentieth of High's frame is still the land's black (the mist is not milk over everything)
  const L = []; for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) L.push(lum(f.high, (y * W + x) * 4));
  L.sort((a, b) => a - b);
  console.log(`High: the darkest twentieth is at ${L[Math.floor(L.length * 0.05)].toFixed(0)} of 255, the darkest quarter at ${L[Math.floor(L.length * 0.25)].toFixed(0)}`);
  assert.ok(L[Math.floor(L.length * 0.05)] < 40, 'High keeps a dark anchor in the last view');
  // looking back at the cliff from the ledge there is no plain in the frame: the mist adds nothing there
  const p2 = [10, 18, 102.5];
  const g = {};
  for (const t of ['high', 'low']) { await tier(t); await place(p2, dir(p2, 160, 6)); await hideGun(); g[t] = await grab(`back_${t}`); }
  const back = differ(g.low, g.high);
  console.log(`looking back at the cliff: ${back.mean.toFixed(1)} of 255, ${back.big.toFixed(1)} %`);
  assert.ok(back.mean < 9, `no veil over the ledge and the cliff (${back.mean.toFixed(1)} of 255)`);
});

test('R16: under the overhang at the start High is not Low (the air beyond the mouth), and the rock frame stays dark', async () => {
  await tier('low');
  await jump('cp_lip_start');
  const pos = [16, 14, 107.5];
  const f = {};
  for (const t of ['low', 'high']) {
    await tier(t);
    await place(pos, dir(pos, 0, -2)); await hideGun();
    f[t] = await grab(`start_${t}`);
  }
  const all = differ(f.low, f.high);
  console.log(`the start, Low against High: ${all.mean.toFixed(1)} of 255, ${all.big.toFixed(1)} % more than 24 apart`);
  assert.ok(all.mean >= 9, `the first frame differs by ${all.mean.toFixed(1)} of 255 (it was 6.0)`);
  assert.ok(all.big >= 9, `${all.big.toFixed(1)} % of it is plainly different (it was 5.3 %)`);
  // the roof (the frame's top eighth) is the dark anchor on both tiers
  let s = 0, n = 0; for (let y = 0; y < 90; y += 3) for (let x = 0; x < W; x += 3) { s += lum(f.high, (y * W + x) * 4); n++; }
  console.log(`High: the roof band averages ${(s / n).toFixed(0)} of 255`);
  assert.ok(s / n < 75, `the roof stays dark on High (${(s / n).toFixed(0)} of 255)`);
});

test('R18: the pursued man stands on a mesa\'s rim: level rock runs three of his heights to either side of his feet', async () => {
  await tier('low');
  await jump('cp_yard_clear');
  const v = [-88, 0, -10.5], t = [-332.537, 53.628, -10.5];
  await place(v, t, 120);
  const f = await grab('sighting');
  // the figure: near-black pixels in the gap between the tank and the house
  let x0 = W, x1 = -1, y1 = -1, y0 = H;
  for (let y = 250; y < 420; y++) for (let x = 560; x < 720; x++) { const i = (y * W + x) * 4; if (f.data[i] < 70 && f.data[i + 1] < 70 && f.data[i + 2] < 90) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; if (y < y0) y0 = y; } }
  const tall = y1 - y0 + 1, cx = Math.round((x0 + x1) / 2);
  assert.ok(tall > 40, `the figure is on screen (${tall} px tall)`);
  // the rim's line: in each column, the first row from the sky down that is rock (far darker than the sky over it)
  const sky = lum(f, ((y0 + 10) * W + x1 + 24) * 4);
  const rim = (x) => { for (let y = y0 - 10; y < y1 + tall * 2; y++) if (lum(f, (y * W + x) * 4) < sky - 45) return y; return -1; };
  const rows = [];
  for (const k of [-2.6, -2.0, -1.4, 1.2, 1.6]) { const x = Math.round(cx + k * tall); rows.push([k, rim(x)]); }
  console.log(`the Dowser: ${tall} px tall, feet on row ${y1}; the rim's row at ${rows.map(([k, r]) => `${k}h: ${r}`).join(', ')}`);
  for (const [k, r] of rows) {
    assert.ok(r > 0, `rock ${k} heights from his feet (it was sky beyond one and a half)`);
    assert.ok(Math.abs(r - y1) <= tall * 0.42, `the rim ${k} heights from him is within 0.42 of his height of his feet's level (row ${r} against ${y1}): a level caprock, not a knob`);
  }
});
