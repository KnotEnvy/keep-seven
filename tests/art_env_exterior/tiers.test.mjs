// tiers.test.mjs (pass i2): the exterior in the REAL game at 1280 x 720, one browser.
//   R9   at each exterior stop a player would compare (the forecourt, the street, the yard's door, the yard's vista,
//        the rim's last view) High differs from Low by a mean of several levels of 255 (the reviewers measured 2.7 to
//        4.0 and asked for about 6), the view-model hidden on both.
//   the Rule leans at least 4.5 degrees on screen from the gully (both story reviewers measured 1.8 to 2.4 while the
//        narrator said "It leaned"), and further from the rim.
// Frames: shots/i2-team-exterior-look/test/.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/i2-team-exterior-look/test');
const W = 1280, H = 720;
let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'i2-team-exterior-look', tier: 'low', checkpoint: 'cp_lip_gate', viewport: { width: W, height: H }, allowErrors: true });
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
const jump = (cp) => page.evaluate(async (cp) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true); }, cp);
const place = (pos, at, steps = 20) => page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } for (const c of d.ext.core.ctx().scene.viewModel.children) c.visible = false; d.step(0, true); }, { pos, at, steps });
// a tier switch starts High's shadow pass one drawn frame later and its air light eases in (INTEGRATION_REPORT M.0)
const tier = (t) => page.evaluate(async (t) => { const d = window.__dbg; d.setTier(t); await d.ext.core.stepAsync(90, true); for (const c of d.ext.core.ctx().scene.viewModel.children) c.visible = false; d.step(0, true); }, t);
function diff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) sum += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  return sum / (a.data.length / 4);
}
/** the Rule's lean on screen in degrees: the middle of its near-white violet core on two rows */
function lean(png, y0, y1) {
  const mid = (y) => { let s = 0, n = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]; if (b > 215 && r > 170 && b - g > 28 && r - g > 8) { s += x; n++; } } return n ? s / n : NaN; };
  // the first and the last row between y0 and y1 that show it (a cloud or the mouth's glare may cover a row)
  while (y0 < y1 - 60 && Number.isNaN(mid(y0))) y0 += 4;
  while (y1 > y0 + 60 && Number.isNaN(mid(y1))) y1 -= 4;
  const a = mid(y0), b = mid(y1);
  return { deg: Math.atan2(a - b, y1 - y0) * 180 / Math.PI, a, b };
}

const STOPS = [
  ['cp_lip_gate', 'gate', [5, 0, 0], 90, -1.7, 6.0],
  ['cp_street_clear', 'street', [-50, 0, -1.8], 90, 0, 7.0],
  ['cp_yard_clear', 'yard_door', [-82.1, 0, 0], 90, 2, 7.0],
  ['cp_yard_clear', 'yard_vista', [-88, 0, -10.5], 90, 12, 5.5],
  ['cp_rim', 'rim_last', [2.96, 18, 102.97], -4.05, 3.76, 5.5],
];
test('R9: High is not Low at the exterior stops (the forecourt, the street, the yard, the rim)', async () => {
  const out = [];
  for (const [cp, name, pos, yaw, pit, floor] of STOPS) {
    await tier('low');
    await jump(cp);
    await place(pos, dir(pos, yaw, pit), 60);
    const low = await grab(`${name}_low`);
    await tier('high');
    await place(pos, dir(pos, yaw, pit), 60);
    const high = await grab(`${name}_high`);
    const perf = await page.evaluate(() => { const q = window.__dbg.perf(); return { dc: q.drawCalls, tris: q.triangles, mib: (q.textureBytes + q.renderTargetBytes) / 1048576 }; });
    const d = diff(low, high);
    out.push(`${name} ${d.toFixed(1)}`);
    assert.ok(d >= floor, `${name}: Low against High ${d.toFixed(2)} of 255 (at least ${floor})`);
    assert.ok(perf.dc <= 220 && perf.tris <= 400000 && perf.mib <= 128, `${name}: High's budget (${JSON.stringify(perf)})`);
  }
  console.log('Low against High, mean absolute difference of 255, view-model hidden: ' + out.join(', '));
  await tier('low');
});

test('the Rule leans plainly from the gully (4.5 degrees or more on screen) and further from the rim', async () => {
  await tier('low');
  await jump('cp_lip_start');
  // out from under the overhang (the glare's trigger), then down the first reach
  await place([14, 14, 97], [14, 15, 0], 10);
  const p = [17, 10.4, 71.5];
  await place(p, dir(p, 0, 8), 30);
  const g = lean(await grab('rule_gully'), 40, 300);
  await jump('cp_rim');
  const q = [10, 18, 102];
  await place(q, dir(q, 0, 14), 60);
  const r = lean(await grab('rule_rim'), 40, 300);
  console.log(`the Rule on screen: ${g.deg.toFixed(1)} degrees from the gully (x ${g.a.toFixed(0)} -> ${g.b.toFixed(0)}), ${r.deg.toFixed(1)} from the rim (x ${r.a.toFixed(0)} -> ${r.b.toFixed(0)})`);
  assert.ok(g.deg >= 4.5 && g.deg < 9, `from the gully the Rule leans ${g.deg.toFixed(1)} degrees on screen`);
  assert.ok(r.deg > g.deg + 1.5, `from the rim it leans further (${r.deg.toFixed(1)} against ${g.deg.toFixed(1)})`);
});
