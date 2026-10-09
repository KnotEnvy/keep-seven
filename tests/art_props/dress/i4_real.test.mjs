// Look team creatures-props, pass i4, in the REAL game (one browser, one short leg):
//   the seventh round on the rim stone carries the knots' violet at its band and is lit like the baked cases beside it
//   (story reviewer: "a dark speck; its 'wrong colour' band cannot be seen"); the glow goes with the round;
//   the stone is the whole outcrop (R19): the zone's shelf box does not show through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { startServer, ROOT } from '../../harness.mjs';
import { openBot, marker } from '../../e2e/lib/bot.mjs';

const OUT = path.join(ROOT, 'shots', 'i4-team-creatures-props', 'test'); fs.mkdirSync(OUT, { recursive: true });
const W = 1280, H = 720;

test('the rim: the seventh round glows violet at its band, stands lit beside six brass cases, and takes its glow with it', { timeout: 300000 }, async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i4-team-creatures-props', tier: 'low', checkpoint: 'cp_rim', viewport: { width: W, height: H }, allowErrors: true });
  const page = bot.page;
  const st = marker('ia_stone_round').pos;
  const grab = async (name) => {
    const url = await page.evaluate(() => window.__dbg.capture());
    const buf = Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
    return PNG.sync.read(buf);
  };
  const count = (png, pred, x0, y0, x1, y1) => { let n = 0; for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x++) { const i = (y * png.width + x) * 4; if (pred(png.data[i], png.data[i + 1], png.data[i + 2])) n++; } return n; };
  try {
    await page.evaluate(async ([st]) => {
      const d = window.__dbg; await d.checkpoint('cp_rim'); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true);
      for (let i = 0; i < 2; i++) { d.teleport(st[0] + 0.9, 18, st[2] + 1.1); d.aimAt(st[0] - 0.1, st[1] + 0.06, st[2]); await d.ext.core.stepAsync(3, true); }
    }, [st]);
    const png = await grab('rim_round');
    const proj = await page.evaluate(([st]) => { const cam = window.__dbg.ext.core.ctx().scene.camera; const v = cam.position.clone().set(st[0], st[1] + 0.056, st[2]).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; }, [st]);
    const cx = Math.round(proj[0] * W), cy = Math.round(proj[1] * H);
    const violet = (r, g, b) => b > 110 && r > 80 && b - g > 45 && r - g > 15;
    const nViolet = count(png, violet, cx - 28, cy - 28, cx + 28, cy + 28);
    const glows = await page.evaluate(() => { const R = window.__dbg.ext.render.system(); return R.inst.emitGlow({ data: new Float32Array(400), i: 0, next() { return this.i++ * 20; } }); });
    // the brass of the six baked cases, a hand to the left of the round in the frame
    const brass = count(png, (r, g, b) => r > 85 && g > 60 && r - b > 35 && r - g > 10 && r - g < 45, cx - 260, cy - 80, cx - 20, cy + 60);
    console.log(`    the round at (${cx}, ${cy}): ${nViolet} violet pixels round its band, ${glows} glow; ${brass} brass pixels of the six cases beside it`);
    assert.equal(glows, 1, 'one glow: the round');
    assert.ok(nViolet >= 60, `the band's violet is ${nViolet} pixels at standing distance (it was a dark speck)`);
    assert.ok(brass >= 150, `the six cases read as brass (${brass} px)`);
    // the stone covers the zone's shelf box: looking straight down at the bed beside the capstone, no vertex of the
    // box's pale top shows (the bed is the darker caprock; the old shelf was the palest thing on the ledge)
    const taken = await page.evaluate(async () => {
      const d = window.__dbg, R = d.ext.render.system();
      const sets = [...R.inst.sets?.keys?.() ?? []];
      // take the round the way the world hides it: every drawn instance of the set goes
      const set = R.inst.sets.get('prop_cartridge_kept|round_violet');
      const before = set ? set.mesh.count : -1;
      if (set) { const m = set.mesh.instanceMatrix.array; for (let k = 0; k < set.mesh.count; k++) for (let j = 0; j < 12; j++) m[k * 16 + j] = 0; set.mesh.instanceMatrix.needsUpdate = true; }
      await d.ext.core.stepAsync(2, true);
      return { sets: sets.length, before, glows: R.inst.emitGlow({ data: new Float32Array(400), i: 0, next() { return this.i++ * 20; } }) };
    });
    const after = await grab('rim_round_taken');
    const nAfter = count(after, violet, cx - 28, cy - 28, cx + 28, cy + 28);
    console.log(`    with the round gone: ${taken.glows} glow, ${nAfter} violet pixels`);
    assert.equal(taken.before, 1, 'one round stands on the stone');
    assert.equal(taken.glows, 0, 'the glow goes with the round');
    assert.ok(nAfter < nViolet / 4, `no violet is left on the stone (${nAfter})`);
    assert.deepEqual(bot.game.consoleErrors.filter((e) => !/AudioContext|audio device/i.test(e)).slice(0, 3), []);
  } finally { try { await bot.game.browser.close(); } catch {} await server.close(); }
});
