// Look team gun, pass i5: three reviewer issues, pinned.
//   the walnut     in the REAL game at 1280 x 720 (Low) the grip is red wood in every room: the reviewer measured it
//                  54,36,29 in the Tally House and 48,43,45 (a neutral grey) in the gallery. The gun's pixels in a box on the
//                  left grip panel (the gloves and the blue straps left out) are red over green and well over blue in
//                  every room
//   the off hand   in the shipped glb the left hand's COLOR_0 is a shade under the gun hand's (they merged into one
//                  mass in the loading pose)
// (the frame's new outline, the first issue, is judged by eye: shots/i5-team-gun/after/cmp_idle_low.png)
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';
import { M } from './lib.mjs';
import { gltfIO } from '../../tools/pipeline-lib.mjs';

let server, bot, page;
const raw = async (b) => (await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data;
const cap = async () => raw(Buffer.from((await page.evaluate(() => { window.__dbg.step(0, true); return window.__dbg.capture(); })).split(',')[1], 'base64'));
const show = (which) => page.evaluate((which) => { const d = window.__dbg; d.ext.core.ctx().scene.viewModel.traverse((o) => { if (o.isMesh) o.visible = which === 'all' ? true : which === 'none' ? false : /arm|hand/i.test(o.name); }); d.step(0, true); }, which);
const go = (cp, pos, at, n = 45) => page.evaluate(async ([cp, pos, at, n]) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true);
  for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(n, true); } }, [cp, pos, at, n]);
const differ = (A, B, i) => Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 12;

const SPOTS = [
  ['street', 'cp_street_clear', [-30, 0, 0], [-60, 1.5, 0]],
  ['Tally House, the table', 'cp_tally_enter', [-86.6, 0, -23.2], [-89, 1.0, -24.5]],
  ['gallery', 'cp_gallery_baffle', [-70, -12, -14], [-40, -10.6, -14]],
  ['hall door', 'cp_hall_clear', [10, -15, -14], [20, -13.5, -14]],
  ['boss room', 'cp_boss_p1', [14, -44, 86], [14, -41.5, 96]],
  ['rim at dusk', 'cp_rim', [6, 18, 105], [-20, 19, 90]],
];
const BOX = [1085, 580, 1150, 690];      // the left grip panel under the fingers, at rest (x0, y0, x1, y1)

describe('look team gun, pass i5 (real game)', () => {
before(async () => { server = await startServer({}); bot = await openBot(server, { piece: 'i5-team-gun/test', tier: 'low', checkpoint: 'cp_lip_start', viewport: { width: 1280, height: 720 }, allowErrors: true }); page = bot.page; });
after(async () => { try { await bot.game.browser.close(); } catch {} await server.close(); });

test('the grip is red wood in every room, underground included', async () => {
  const fails = [], rows = {};
  for (const [name, cp, pos, at] of SPOTS) {
    await go(cp, pos, at);
    const A = await cap(); await show('none'); const B = await cap(); await show('hands'); const H = await cap(); await show('all');
    let n = 0, r = 0, g = 0, b = 0;
    for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
      const i = (y * 1280 + x) * 3;
      if (!differ(A, B, i)) continue;
      if (differ(H, B, i) && !differ(A, H, i)) continue;                 // a glove pixel
      if (A[i + 2] > A[i] * 1.05) continue;                              // blue over red: the straps' steel
      n++; r += A[i]; g += A[i + 1]; b += A[i + 2];
    }
    rows[name] = { n, rgb: [r / Math.max(n, 1), g / Math.max(n, 1), b / Math.max(n, 1)] };
    console.log(`${name}: ${n} px of the left grip panel, mean ${rows[name].rgb.map((v) => v.toFixed(0)).join(', ')}`);
  }
  const ref = rows.street;
  if (!(ref.n >= 1500)) fails.push(`street: ${ref.n} px of the grip panel are in the box (1500 or more)`);
  for (const [name, w] of Object.entries(rows)) {
    if (!(w.n >= 0.6 * ref.n)) fails.push(`${name}: ${w.n} px of the box are not blue, ${ref.n} in the street (six tenths or more: the wood has not gone grey-blue)`);
    const [r, g, b] = w.rgb;
    // (the box holds the back strap's shaded edge too; before this pass the gallery's box measured red over green by 1.12)
    if (!(r / g >= 1.3 && r / b >= 1.3)) fails.push(`${name}: the wood is ${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)} (red over green and over blue by 1.3)`);
    if (!(r >= 60 && r <= 215)) fails.push(`${name}: the wood's red is ${r.toFixed(0)} (60 to 215: a warm accent, not a lit orange)`);
  }
  assert.deepEqual(fails, []);
});
});

test('the shipped glb: the off hand is a shade under the gun hand', async () => {
  const io = await gltfIO();
  const doc = await io.read(M.assets.weapon_revolver._pub);
  const node = (name) => doc.getRoot().listNodes().find((n) => n.getName() === name);
  const arms = node('arms_mesh'), names = arms.getSkin().listJoints().map((j) => j.getName());
  const sum = { hand_l: [0, 0], hand_r: [0, 0] };
  for (const p of arms.getMesh().listPrimitives()) {
    if (p.getMaterial().getName() !== 'm_hands') continue;
    const C = p.getAttribute('COLOR_0'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0');
    const c = [0, 0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let i = 0; i < C.getCount(); i++) {
      J.getElement(i, j); W.getElement(i, w); let k = 0; for (let q = 1; q < 4; q++) if (w[q] > w[k]) k = q;
      const s = sum[names[j[k]]]; if (!s) continue;
      C.getElement(i, c); s[0] += c[0]; s[1]++;
    }
  }
  const l = sum.hand_l[0] / sum.hand_l[1], r = sum.hand_r[0] / sum.hand_r[1];
  console.log(`COLOR_0 of the hands: left ${l.toFixed(3)} (${sum.hand_l[1]} vertices), right ${r.toFixed(3)} (${sum.hand_r[1]})`);
  assert.ok(sum.hand_l[1] > 500 && sum.hand_r[1] > 500, 'both hands have vertices of their own');
  assert.ok(l / r >= 0.66 && l / r <= 0.90, `the off hand's shade is ${(l / r).toFixed(2)} of the gun hand's (0.66 to 0.90: apart, not another glove)`);
});
