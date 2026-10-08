// Look team gun, pass i2: two things the reviewers measured, held in the REAL game at 1280 x 720 (Low).
//   the Tally House   the revolver was "flat pale pewter" in the lamp-orange room (mean L* 30.4 over 24.1, no orange in
//                     it): it sits at the room's level now and it is warm
//   the asking dial   at 2 m the gun at rest covered numeral 4 and port 4 (the first answer): both are clear
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

let server, bot, page;
const lab = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const Y = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
const raw = async (b) => (await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data;
const cap = async () => raw(Buffer.from((await page.evaluate(() => { window.__dbg.step(0, true); return window.__dbg.capture(); })).split(',')[1], 'base64'));
const show = (on) => page.evaluate((on) => { const d = window.__dbg; d.ext.core.ctx().scene.viewModel.traverse((o) => { if (o.isMesh) o.visible = on; }); d.step(0, true); }, on);
const go = (cp, pos, at, n = 30) => page.evaluate(async ([cp, pos, at, n]) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true);
  for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(n, true); } }, [cp, pos, at, n]);

describe('look team gun, pass i2 (real game)', () => {
before(async () => { server = await startServer({}); bot = await openBot(server, { piece: 'i2-team-gun/test', tier: 'low', checkpoint: 'cp_lip_start', viewport: { width: 1280, height: 720 }, allowErrors: true }); page = bot.page; });
after(async () => { try { await bot.game.browser.close(); } catch {} await server.close(); });

test('in the Tally House the view-model is warm and sits at the level of what it covers', async () => {
  await go('cp_tally_enter', [-89, 0, -18], [-89, 1.2, -28]);
  const A = await cap(); await show(false); const B = await cap(); await show(true);
  let n = 0, l = 0, bg = 0, r = 0, b = 0, hi = 0, lo = 0;
  for (let i = 0; i < A.length; i += 3) { if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) <= 12) continue; n++; const L = lab(A[i], A[i + 1], A[i + 2]); l += L; bg += lab(B[i], B[i + 1], B[i + 2]); r += A[i]; b += A[i + 2]; if (L > 60) hi++; if (L < 12) lo++; }
  l /= n; bg /= n;
  console.log(`Tally House: view-model mean L* ${l.toFixed(1)} over ${bg.toFixed(1)}, mean R / B ${(r / b).toFixed(2)}, over L* 60 ${(100 * hi / n).toFixed(1)} %, under L* 12 ${(100 * lo / n).toFixed(1)} % (pass i1: 30.4 over 24.1)`);
  assert.ok(l <= bg + 4, `mean L* ${l.toFixed(1)} is no more than 4 over the room behind it (${bg.toFixed(1)})`);
  assert.ok(l >= 20, `and it is lit (mean L* ${l.toFixed(1)} >= 20)`);
  assert.ok(r / b > 1.5, `its mean red is over 1.5 x its blue (${(r / b).toFixed(2)}): the lamp room's light is in it`);
  assert.ok(hi / n >= 0.01 && lo / n < 0.04, 'highlights at least 1 %, under L* 12 less than 4 %');
});

test('2 m from the asking dial the gun at rest clears numeral 4 and port 4', async () => {
  await go('cp_bore_ante', [14, -44, 78], [14, -42.35, 80], 50);
  const A = await cap(); await show(false); const B = await cap(); await show(true);
  // port 4 is at (13.293, -43.207, 79.98); numeral 4 lies between it and the hub. Their pixels: project through the camera.
  const pts = await page.evaluate(() => { const c = window.__dbg.ext.core.ctx().scene.camera; c.updateMatrixWorld(true); const out = [];
    for (const p of [[13.293, -43.207, 79.98], [13.56, -42.94, 79.98]]) { const v = c.position.clone().set(p[0], p[1], p[2]).project(c); out.push([Math.round((v.x * 0.5 + 0.5) * 1280), Math.round((0.5 - v.y * 0.5) * 720)]); } return out; });
  for (const [k, [x, y]] of pts.entries()) {
    const R = k === 0 ? 34 : 26; let n = 0, cov = 0;
    for (let yy = y - R; yy <= y + R; yy++) for (let xx = x - R; xx <= x + R; xx++) { if (yy < 0 || yy >= 720 || xx < 0 || xx >= 1280 || (xx - x) ** 2 + (yy - y) ** 2 > R * R) continue; n++; const i = (yy * 1280 + xx) * 3; if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 12) cov++; }
    console.log(`${k === 0 ? 'port 4' : 'numeral 4'} at ${x}, ${y}: ${(100 * cov / Math.max(n, 1)).toFixed(1)} % of a ${R} px disc is behind the view-model`);
    assert.ok(n > 0 && cov / n < 0.05, `${k === 0 ? 'port 4' : 'numeral 4'} is clear of the gun`);
  }
});
});
