// Look team gun, pass i4 (ruling R17): one material in every room, held in the REAL game at 1280 x 720 (Low).
//   The reviewers measured the steel's body at R / B 0.89 in the street, 1.61 in the Tally House, 0.59 in the gallery and
//   0.95 on the rim, the hatch stair at twice the gallery's luminance, and the tan glove olive under teal light.
//   one steel     the body of the steel (what is under L* 40, left of the grip and the hand) has the street's hue in
//                 every room: its R / B and its G / B within HUE_BAND of the street's; where the room is not daylight
//                 its level is one level (L* 18.5 to 26), the stair's within 2 L* of the gallery's; nothing of it is
//                 near white at rest, and its highlights are a small share of it
//   one leather   the glove is a warm brown in every room: red over green over blue
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

let server, bot, page;
const lab = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const Y = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
const raw = async (b) => (await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data;
const cap = async () => raw(Buffer.from((await page.evaluate(() => { window.__dbg.step(0, true); return window.__dbg.capture(); })).split(',')[1], 'base64'));
const show = (which) => page.evaluate((which) => { const d = window.__dbg; d.ext.core.ctx().scene.viewModel.traverse((o) => { if (o.isMesh) o.visible = which === 'all' ? true : which === 'none' ? false : /arm|hand/i.test(o.name); }); d.step(0, true); }, which);
const go = (cp, pos, at, n = 45) => page.evaluate(async ([cp, pos, at, n]) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true);
  for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(n, true); } }, [cp, pos, at, n]);
const differ = (A, B, i) => Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 12;

// name, checkpoint, feet, look-at, daylight?
const SPOTS = [
  ['street', 'cp_street_clear', [-30, 0, 0], [-60, 1.5, 0], true],
  ['overhang', 'cp_lip_start', [16, 14, 107.5], [14, 15.3, 95], true],
  ['Tally House, the table', 'cp_tally_enter', [-86.6, 0, -23.2], [-89, 1.0, -24.5], false],
  ['hatch stair', 'cp_tally_hatch', [-87, -3.5, -33], [-86, -4.5, -30], false],
  ['gallery', 'cp_gallery_baffle', [-70, -12, -14], [-40, -10.6, -14], false],
  ['hall door', 'cp_hall_clear', [10, -15, -14], [20, -13.5, -14], false],
  ['antechamber, the plate door', 'cp_bore_ante', [14, -44, 71], [14, -42.5, 80], false],
  ['boss room', 'cp_boss_p1', [14, -44, 86], [14, -41.5, 96], false],
  ['rim at dusk', 'cp_rim', [6, 18, 105], [-20, 19, 90], false],
];
const HUE_BAND = 0.08, WOOD_X = 1010;

describe('look team gun, pass i4 (real game)', () => {
before(async () => { server = await startServer({}); bot = await openBot(server, { piece: 'i4-team-gun/test', tier: 'low', checkpoint: 'cp_lip_start', viewport: { width: 1280, height: 720 }, allowErrors: true }); page = bot.page; });
after(async () => { try { await bot.game.browser.close(); } catch {} await server.close(); });

test('R17: the steel has one hue and one level in every room, the stair and the rim included; the glove is brown in every room', async () => {
  const fails = [], rows = {};
  for (const [name, cp, pos, at, day] of SPOTS) {
    await go(cp, pos, at);
    const A = await cap(); await show('none'); const B = await cap(); await show('hands'); const H = await cap(); await show('all');
    let n = 0, l = 0, bn = 0, br = 0, bg = 0, bb = 0, hi = 0, white = 0, gn = 0, gr = 0, gg = 0, gb = 0;
    for (let p = 0, i = 0; p < 1280 * 720; p++, i += 3) {
      if (!differ(A, B, i)) continue;
      if (differ(H, B, i) && !differ(A, H, i)) { gn++; gr += A[i]; gg += A[i + 1]; gb += A[i + 2]; continue; }
      if (p % 1280 >= WOOD_X) continue;
      n++; const L = lab(A[i], A[i + 1], A[i + 2]); l += L;
      if (L < 40) { bn++; br += A[i]; bg += A[i + 1]; bb += A[i + 2]; }
      if (L > 60) hi++; if (L > 84) white++;
    }
    const row = { rb: br / bb, gbl: bg / bb, l: l / n, hi: hi / n, white: white / n, glove: [gr / gn, gg / gn, gb / gn], day };
    rows[name] = row;
    console.log(`${name}: steel body R / B ${row.rb.toFixed(2)}, G / B ${row.gbl.toFixed(2)}, mean L* ${row.l.toFixed(1)}, over L* 60 ${(100 * row.hi).toFixed(2)} %, over L* 84 ${(100 * row.white).toFixed(2)} %; glove ${row.glove.map((v) => v.toFixed(0)).join(', ')}`);
  }
  const ref = rows.street;
  for (const [name, r] of Object.entries(rows)) {
    if (!(Math.abs(r.rb - ref.rb) <= HUE_BAND)) fails.push(`${name}: the steel's R / B is ${r.rb.toFixed(2)}, the street's ${ref.rb.toFixed(2)} (within ${HUE_BAND})`);
    if (!(Math.abs(r.gbl - ref.gbl) <= HUE_BAND)) fails.push(`${name}: the steel's G / B is ${r.gbl.toFixed(2)}, the street's ${ref.gbl.toFixed(2)} (within ${HUE_BAND})`);
    if (!(r.rb < 0.9 && r.gbl < 0.95)) fails.push(`${name}: the steel is blue-black (R / B ${r.rb.toFixed(2)} under 0.9, G / B ${r.gbl.toFixed(2)} under 0.95)`);
    if (!(r.l <= ref.l + 1)) fails.push(`${name}: the steel (L* ${r.l.toFixed(1)}) is not lighter than in the street (${ref.l.toFixed(1)})`);
    if (!r.day && !(r.l >= 18.5 && r.l <= 27)) fails.push(`${name}: the steel's level is L* ${r.l.toFixed(1)} (18.5 to 27 in every room that is not daylight)`);
    if (!(r.hi >= 0.012 && r.hi <= 0.06)) fails.push(`${name}: ${(100 * r.hi).toFixed(2)} % of the steel is highlight (1.2 to 6)`);
    if (!(r.white < 0.003)) fails.push(`${name}: ${(100 * r.white).toFixed(2)} % of the steel is over L* 84 at rest`);
    const [gr, gg, gb] = r.glove;
    if (!(gr / gg >= 1.08 && gg / gb >= 1.05 && gr / gb <= 2.2)) fails.push(`${name}: the glove is ${gr.toFixed(0)}, ${gg.toFixed(0)}, ${gb.toFixed(0)} (a warm brown: red over green by 1.08, green over blue by 1.05, red under 2.2 x blue)`);
  }
  const stair = rows['hatch stair'], gallery = rows.gallery;
  if (!(Math.abs(stair.l - gallery.l) <= 2)) fails.push(`the hatch stair's steel (L* ${stair.l.toFixed(1)}) is at the gallery's level (${gallery.l.toFixed(1)}, within 2): the world's exposure ramp does not reach the rig`);
  assert.deepEqual(fails, []);
});
});
