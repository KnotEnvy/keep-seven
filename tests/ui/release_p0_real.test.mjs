// Release pass p0 (UI), in the REAL game (all six systems, final assets): the end card is the last image, so the
// revolver is let down out of the frame while it is up (src/player/viewModel.ts `setLowered`, on `ui/screen` end) and is
// back in the hand when the run is walked again. One short leg from cp_rim in one browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_DEVICE_ERROR, ROOT, openGame, startServer } from '../harness.mjs';

const OUT = path.join(ROOT, 'shots', 'p0-team-ui');
fs.mkdirSync(OUT, { recursive: true });

test('real game: the end card lets the revolver down out of the last image and gives it back for the next run', async () => {
  const server = await startServer({});
  const game = await openGame(server, { piece: 'p0-team-ui', tier: 'low', viewport: { width: 1280, height: 720 }, checkpoint: 'cp_rim', stubs: null, ignoreConsole: AUDIO_DEVICE_ERROR });
  try {
    assert.deepEqual(await game.page.evaluate(() => window.__dbg.ext.core.stubs()), [], 'nothing stubbed');
    const gunY = () => game.page.evaluate(() => { let y = null; window.__dbg.ext.core.ctx().scene.viewModel.traverse((o) => { if (y === null && o.name === 'weapon_revolver') y = o.position.y; }); return y; });
    const step = (n) => game.page.evaluate((k) => window.__dbg.ext.core.stepAsync(k, true), n);
    await step(90);                                   // the draw clip is over: the gun is at rest
    const held = await gunY();
    assert.ok(held !== null && Math.abs(held) < 0.3, `the view-model is in the hand (${held})`);
    // the ending, as world calls it (the walk to the stone is the e2e playthrough's)
    await game.page.evaluate(() => { const d = window.__dbg, ctx = d.ext.core.ctx(); ctx.state.request('ending', 'stage_end'); d.emit('ending/card', { stats: { ...ctx.world.stats, deaths: 2 } }); });
    await step(27);
    const mid = await gunY();
    assert.ok(mid < held - 0.2 && mid > held - 0.6, `half way down after 0.45 s (${held} -> ${mid})`);
    await step(33);
    const down = await gunY();
    assert.ok(Math.abs(down - (held - 0.75)) < 0.02, `down by 0.75 m after 0.9 s of game time (${held} -> ${down})`);
    const ui = await game.page.evaluate(() => ({ screen: window.__dbg.state().systems.ui.screen, deaths: document.querySelector('.k7 .end [data-row="deaths"] .v').textContent }));
    assert.deepEqual(ui, { screen: 'end', deaths: '2' });
    await game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } } });
    await game.page.screenshot({ path: path.join(OUT, 'real_end_gun_down.png') });
    // "Walk it again": the gun is in the hand again in the new run
    await step(360);                                  // past the reveal: the menu answers
    await game.page.keyboard.press('Enter');
    await game.page.evaluate(async () => { const d = window.__dbg, core = d.ext.core; for (let i = 0; i < 400 && d.state().game !== 'playing'; i++) { await Promise.race([core.idle(), new Promise((r) => setTimeout(r, 50))]); await new Promise((r) => setTimeout(r, 20)); } });
    assert.equal((await game.state()).game, 'playing');
    await step(120);
    const again = await gunY();
    assert.ok(Math.abs(again - held) < 0.05, `in the hand again (${again}, was ${held})`);
  } finally { await game.close(); await server.close(); }
});
