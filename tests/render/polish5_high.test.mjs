// Polish round 5, lead ruling R9 and the visual critic's major "High is barely distinguishable from Low, and its one
// strong difference (bloom) wipes out the boss gauge": on the REAL game at 960 x 540. Frames: shots/r5-team-underground-look/test/.
//
//   the gauge          the Windlass's 26 segments stay separate on High (a dense lamp set is held just over the bloom's
//                      threshold: MaterialFactory.denseHold); Low draws it as before (denseHold 1)
//   the sheen          the station's glaze mirrors its baked light on High only (SharedUniforms.uSheen: 0 on Low)
//   High against Low   the lift hall from the gantry differs by more than it did (1.4 of 255 before)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/r5-team-underground-look/test');
const W = 960, H = 540;
let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'r5-team-underground-look', tier: 'low', checkpoint: 'cp_lip_start', viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await server.close(); });

async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
const jump = (cp) => page.evaluate(async (cp) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true); }, cp);
const place = (pos, at, steps = 20) => page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } }, { pos, at, steps });
// the sheen eases over 0.6 s: 90 drawn ticks settle it
const tier = (t) => page.evaluate(async (t) => { const d = window.__dbg; d.setTier(t); await d.ext.core.stepAsync(90, true); }, t);
const state = () => page.evaluate(() => { const R = window.__dbg.ext.render.system(); return { tier: window.__dbg.ext.core.ctx().quality.tier, hold: R.materials.denseHold, sheen: R.shared.uSheen.value, mood: R.moodKey }; });
function diff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) sum += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  return sum / (a.data.length / 4);
}
/** the most light / dark alternations down any pixel column of a box (a column of separate lit segments alternates twice a segment) */
function alternations(img, x0, x1, y0, y1) {
  let best = 0;
  for (let x = x0; x < x1; x++) {
    let lo = 255, hi = 0;
    const col = [];
    for (let y = y0; y < y1; y++) { const i = (y * W + x) * 4, l = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]; col.push(l); if (l < lo) lo = l; if (l > hi) hi = l; }
    if (hi - lo < 80) continue;
    const up = lo + (hi - lo) * 0.6, down = lo + (hi - lo) * 0.4;
    let n = 0, lit = col[0] > up;
    for (const l of col) { if (lit && l < down) { lit = false; n++; } else if (!lit && l > up) { lit = true; n++; } }
    if (n > best) best = n;
  }
  return best;
}

test('the boss room: the gauge keeps its segments on High, and the plate has a sheen only there', async () => {
  await jump('cp_boss_p1');
  await place([14, -44, 83.5], [14, -42.3, 93.5]);
  const low = await grab('boss_low');
  const sl = await state();
  assert.equal(sl.hold, 1, 'Low draws a dense lamp set at its full lamp value');
  assert.equal(sl.sheen, 0, 'Low has no sheen');
  const box = [Math.floor(W * 0.62), Math.floor(W * 0.70), Math.floor(H * 0.02), Math.floor(H * 0.46)];
  const altLow = alternations(low, ...box);
  await tier('high');
  const sh = await state();
  const high = await grab('boss_high');
  const altHigh = alternations(high, ...box);
  console.log(`the gauge: ${altLow} light/dark alternations down its column on Low, ${altHigh} on High (a solid bar has 0 to 2); denseHold ${sh.hold.toFixed(3)}, sheen ${sh.sheen.toFixed(2)} under ${sh.mood}`);
  assert.equal(sh.tier, 'high');
  assert.ok(sh.hold > 0.1 && sh.hold < 0.8, `High holds a dense lamp set under the bloom (${sh.hold})`);
  assert.ok(sh.sheen > 0.5, `the chamber's plate has its sheen on High (${sh.sheen})`);
  assert.ok(altLow >= 16, `Low shows separate segments (${altLow})`);
  assert.ok(altHigh >= 16, `High shows separate segments too, not one white bar (${altHigh})`);
  await tier('low');
  assert.equal((await state()).sheen, 0, 'back on Low the sheen is gone');
});

test('the lift hall from the gantry: High is not Low', async () => {
  await jump('cp_hall_gantry');
  await place([-16.5, -12, -14], [-6.5, -12.3, -14]);
  // the world alone: the view-model sways between the two frames and would be counted as a difference of the tiers
  const vm = (on) => page.evaluate((on) => { const d = window.__dbg; for (const c of d.ext.core.ctx().scene.viewModel.children) c.visible = on; d.step(0, true); }, on);
  await tier('low');          // the same 90 settled ticks before each frame: the eye is at rest in both
  await vm(false);
  const low = await grab('gantry_low');
  await tier('high');
  await vm(false);
  const high = await grab('gantry_high');
  await vm(true);
  const d = diff(low, high);
  console.log(`the lift hall from the gantry, Low against High: ${d.toFixed(2)} of 255 (round 5 critic's frames: 1.4)`);
  assert.ok(d > 2.0, `mean absolute difference ${d.toFixed(2)} (over 2.0)`);
  await tier('low');
});
