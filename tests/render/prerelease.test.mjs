// Pre-release pass (render-tech), the REAL game at 960 x 540 on Low.
//   Final reviewer, 4 of 4: "dying at cp_tally_enter and coming back leaves the Tally House's shutters bright yellow with
//   blue stripes and a green cord, the wall poster solid blue, blue / red / green patches on the seated figures".
//   No material, uniform or texture reference differed in JS. The fault was on the GL side: quietBones (quiet.ts) wrote a
//   skeleton's matrices with the bone texture bound on whatever unit was active, which was the unit of the last sampler
//   of the draw before (uEmisMap of a skinned m_prop, unit 2). Three sets a material's samplers only when the material or
//   the program changes: the next skinned meshes of the same material (the second Bider, the three shutters, the hatch,
//   the share cloth) read the bone matrices as their emissive map. It writes through three's scratch unit now.
// The test dies and comes back at cp_tally_enter and holds, on every draw call of every drawn frame, that each sampler's
// unit holds the texture three believes it bound there (samplers.mjs), and that the frame after the retry is the frame
// before the death (the canvas as drawn, no HUD). On the old code: 66 mismatched draws, 3 375 garish pixels (39 before).
// Frames: shots/prerelease-render/test/. One browser; about 500 ticks.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';
import { differing, frameStats, installSamplerWatch } from './samplers.mjs';

const SHOTS = path.join(ROOT, 'shots/prerelease-render/test');
fs.mkdirSync(SHOTS, { recursive: true });
let server = null, bot = null;
after(async () => { if (bot) { try { await bot.game.browser.close(); } catch { /* closed */ } } if (server) await server.close(); });

test('Low, cp_tally_enter: after a death and the retry every sampler reads its own texture, and the room is the room it was', async () => {
  server = await startServer({});
  bot = await openBot(server, { piece: 'prerelease-render', tier: 'low', checkpoint: 'cp_tally_enter', viewport: { width: 960, height: 540 }, allowErrors: true });
  const page = bot.page;
  await page.evaluate(installSamplerWatch);
  await page.evaluate(() => { window.__dbg.aiEnabled(false); });
  /** n ticks with a watched drawn frame every `every` */
  const watched = (n, every) => page.evaluate(async ([n, every]) => { const W = window.__samplers, c = window.__dbg.ext.core; W.on = true; for (let i = 0; i < n; i += every) await c.stepAsync(Math.min(every, n - i), true); W.on = false; }, [n, every]);
  /** one tick, drawn and watched: the canvas as that frame left it (a capture() would draw another frame, one in which no bone moved) */
  const frame = async (name) => {
    const url = await page.evaluate(async () => { const W = window.__samplers, d = window.__dbg; W.on = true; await d.ext.core.stepAsync(1, true); const u = d.ext.core.ctx().render.renderer.domElement.toDataURL('image/png'); W.on = false; return u; });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    return frameStats(url);
  };
  await watched(120, 12);
  const before = await frame('tally_low_before_death');
  const state = () => page.evaluate(() => window.__dbg.state().game);
  let died = false;
  for (let i = 0; i < 12 && !died; i++) { await page.evaluate(() => window.__dbg.ext.core.damage(34, 'lunge', 'bider')); await watched(30, 10); died = (await state()) !== 'playing'; }
  assert.ok(died, 'she died');
  for (let i = 0; i < 300 && (await state()) !== 'playing'; i++) await watched(6, 6);
  assert.equal(await state(), 'playing', 'the retry gave her back the room');
  await page.evaluate(() => { window.__dbg.aiEnabled(false); });
  await watched(120, 12);
  const back = await frame('tally_low_after_retry');
  const seen = await page.evaluate(() => ({ draws: window.__samplers.draws, checked: window.__samplers.checked, bad: [...new Set(window.__samplers.bad)], bones: window.__dbg.ext.render.bonesWritten() }));
  // the watch really looked, and the path under test really ran (bone textures written without three's upload path)
  assert.ok(seen.draws > 500 && seen.checked > 1000, `the watch saw ${seen.draws} draws and checked ${seen.checked} samplers`);
  assert.ok(seen.bones > 50, `quietBones wrote ${seen.bones} bone textures`);
  assert.deepEqual(seen.bad, [], 'a sampler read a texture that is not its own');
  // the picture: no data texture read as colour (pure yellow, blue and green), and the frame is the one before the death
  // (what rightly differs: the dust motes and the lamp's flicker, a few hundred pixels; it was 5 871 pixels and 3 375 garish)
  assert.ok(back.garish <= before.garish + 150, `garish pixels: ${before.garish} before the death, ${back.garish} after the retry`);
  const moved = differing(before.png, back.png);
  assert.ok(moved < 2000, `${moved} pixels differ between the frame before the death and the frame after the retry`);
});
