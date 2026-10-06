// Polish round 4 (combat critic): "the star flash is drawn over the crosshair and covers a Bider at 8 m for three
// ticks". The flash sprite has a fixed size in the world and no depth test; at the muzzle (0.46 m from the eye) its
// white core was 2.1 % of a 1280 x 720 frame and reached the crosshair. The player now asks for it FLASH_PUSH times
// farther out on the eye-to-muzzle line: the same place on the screen, 1 / FLASH_PUSH the size. Measured in the real
// game with the real view-model pass, on the frames of the shot.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

let srv, bot;
before(async () => {
  srv = await startServer({});
  bot = await openBot(srv, { piece: 'code-player', tier: 'low', checkpoint: 'cp_street_clear', viewport: { width: 1280, height: 720 }, allowErrors: true });
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await srv.close(); });

const read = (file) => PNG.sync.read(fs.readFileSync(file));
/** the flash's white core: pixels the shot frame made much brighter and near white. Share of the frame, and the share of a box round the crosshair. */
function core(pre, shot) {
  const A = read(pre), B = read(shot), w = A.width, h = A.height;
  let n = 0, near = 0, nearAll = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const d = (B.data[i] + B.data[i + 1] + B.data[i + 2] - A.data[i] - A.data[i + 1] - A.data[i + 2]) / 3;
    const hot = d > 60 && B.data[i] > 235 && B.data[i + 1] > 215;
    const inBox = Math.abs(x - w / 2) <= 0.05 * h && Math.abs(y - h / 2) <= 0.10 * h;   // a Bider's body at 8 m: 72 x 144 px at 720p
    if (inBox) nearAll++;
    if (!hot) continue;
    n++; sx += x; sy += y;
    if (inBox) near++;
  }
  return { share: (n / (w * h)) * 100, atCrosshair: (near / nearAll) * 100, cx: n ? sx / n / w : 0, cy: n ? sy / n / h : 0 };
}

test('the muzzle flash stays clear of the crosshair: asked for 1.6 x farther out on the eye-to-muzzle line, its core is under 1.2 % of the frame', async () => {
  await bot.page.evaluate(async () => { const d = window.__dbg; d.god(true); d.aiEnabled(false); d.setAim(90, 35); await d.ext.core.stepAsync(60, true); });   // at the open sky: no impact at the crosshair, the flash alone
  const pre = await bot.game.shot('flash_pre');
  const info = await bot.page.evaluate(async () => {
    const d = window.__dbg;
    d.tap('fire');
    await d.ext.core.stepAsync(1, false);
    const f = d.ext.player.flash(), r = d.ext.render;
    return { f, at: r.viewModelProject(f.x, f.y, f.z), muzzle: r.viewModelProject(f.muzzle[0], f.muzzle[1], f.muzzle[2]), fired: d.events(0).filter((e) => e.name === 'weapon/fired').at(-1).payload };
  });
  const shot = await bot.game.shot('flash_t0');
  const { f } = info;
  const dm = [f.muzzle[0] - f.eye[0], f.muzzle[1] - f.eye[1], f.muzzle[2] - f.eye[2]], df = [f.x - f.eye[0], f.y - f.eye[1], f.z - f.eye[2]];
  const lm = Math.hypot(...dm), lf = Math.hypot(...df);
  assert.ok(f.push >= 1.5 && Math.abs(lf / lm - f.push) < 1e-6, `the flash is ${(lf / lm).toFixed(3)} x the muzzle's distance from the eye (muzzle ${lm.toFixed(3)} m)`);
  const cos = (dm[0] * df[0] + dm[1] * df[1] + dm[2] * df[2]) / (lm * lf);
  assert.ok(cos > 1 - 1e-9, 'on the line from the eye through the muzzle');
  assert.ok(Math.hypot(info.at.x - info.muzzle.x, info.at.y - info.muzzle.y) < 0.02, `at the muzzle's place on the screen (${JSON.stringify(info.at)} against ${JSON.stringify(info.muzzle)})`);
  // the tracer and the event keep the true muzzle
  assert.ok(Math.hypot(info.fired.mx - f.muzzle[0], info.fired.my - f.muzzle[1], info.fired.mz - f.muzzle[2]) < 1e-9, '`weapon/fired` carries the true muzzle');
  const c = core(pre, shot);
  const say = `core ${c.share.toFixed(2)} % of the frame at (${c.cx.toFixed(3)}, ${c.cy.toFixed(3)}), ${c.atCrosshair.toFixed(2)} % of the body box at the crosshair`;
  console.log(`# flash: ${say}`);
  assert.ok(c.share > 0.25, `the flash is seen (${say})`);
  assert.ok(c.share < 1.2, `and is small: it was 2.1 % (${say})`);
  assert.ok(c.atCrosshair < 3, `its core does not lie on a body at the crosshair (${say})`);
  // Polish round 5 (combat critic): render puts the sprite on the eye-to-muzzle line of the DRAWN frame, so it rides the
  // kick. On the shot's first frame the barrel has already risen: the core is right of the crosshair, at the muzzle as
  // this frame draws it (it used to be asserted "below the crosshair", where the muzzle had been on the shot's tick).
  const drawn = await bot.page.evaluate(() => window.__dbg.ext.render.muzzle());
  const off = Math.hypot((c.cx - drawn.muzzle.x) * 16 / 9, c.cy - (1 - drawn.muzzle.y));
  console.log(`# flash: drawn muzzle (${drawn.muzzle.x.toFixed(3)}, ${(1 - drawn.muzzle.y).toFixed(3)}), core ${(off * 100).toFixed(1)} % of the frame height from it`);
  assert.ok(c.cx > 0.5 && off < 0.04, `it is right of the crosshair, at the muzzle as drawn (${say}; ${(off * 100).toFixed(1)} % of the height away)`);
});
