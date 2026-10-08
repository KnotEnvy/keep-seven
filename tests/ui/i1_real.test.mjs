// Pass i1 (UI), in the REAL game (all six systems, final assets), one browser, two short legs:
//   - the opening, standing still: "W A S D to walk" is never drawn over the narrator's lines and never stands longer
//     than its 8 s (it came up at 4.5 s over the first line and stayed until she walked);
//   - the title after an ending has the revolver in it, exactly as the first title has (the view-model was let down under
//     the end card and never came back: the simulation does not run on the title).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_DEVICE_ERROR, ROOT, openGame, startServer } from '../harness.mjs';

const OUT = path.join(ROOT, 'shots', 'i1-team-ui');
fs.mkdirSync(OUT, { recursive: true });

test('real game: the walk hint waits for the narrator and stands 8 s; the title after an ending shows the revolver as the first title does', async () => {
  const server = await startServer({});
  const game = await openGame(server, { piece: 'i1-team-ui', tier: 'low', viewport: { width: 1280, height: 720 }, start: false, stubs: null, ignoreConsole: AUDIO_DEVICE_ERROR });
  try {
    assert.deepEqual(await game.page.evaluate(() => window.__dbg.ext.core.stubs()), [], 'nothing stubbed');
    const settle = (state) => game.page.evaluate(async (want) => { const d = window.__dbg, core = d.ext.core; for (let i = 0; i < 400 && d.state().game !== want; i++) { await Promise.race([core.idle(), new Promise((r) => setTimeout(r, 50))]); await new Promise((r) => setTimeout(r, 20)); } return d.state().game; }, state);
    const gun = () => game.page.evaluate(() => { let p = null; window.__dbg.ext.core.ctx().scene.viewModel.traverse((o) => { if (p === null && o.name === 'weapon_revolver') p = [o.position.x, o.position.y, o.position.z].map((v) => Math.round(v * 1000) / 1000); }); return p; });
    // ---- the first title
    await game.page.evaluate(() => window.__dbg.step(0, true));
    const first = await gun();
    assert.ok(first !== null && Math.abs(first[1]) < 0.3, `the first title has the revolver in the hand (${first})`);
    await game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } } });
    await game.page.screenshot({ path: path.join(OUT, 'real_title_first.png') });
    // ---- Begin, and forty seconds of standing still
    await game.page.click('.k7 .scr.on [data-item="play"]');
    assert.equal(await settle('playing'), 'playing');
    const track = await game.page.evaluate(async () => {
      const d = window.__dbg, out = [];
      for (let i = 0; i < 160; i++) { await d.ext.core.stepAsync(15, false); const u = d.state().ui; out.push([u.hint, u.subtitle !== '']); }
      return out;
    });
    const WALK = 'W A S D to walk';
    const over = track.filter(([hint, spoken]) => hint === WALK && spoken).length;
    assert.equal(over, 0, 'the walk hint is never drawn while a line is on screen');
    let longest = 0, stretch = 0, shown = 0, firstAt = -1;
    track.forEach(([hint], i) => { if (hint === WALK) { stretch++; shown++; if (firstAt < 0) firstAt = i; } else stretch = 0; if (stretch > longest) longest = stretch; });
    assert.ok(shown > 0, 'she stood still: it was shown');
    assert.ok(longest * 0.25 <= 8.26, `and stood no longer than 8 s at a time (${(longest * 0.25).toFixed(2)} s)`);
    assert.ok(shown * 0.25 <= 16.5, `two stands at most in forty seconds (${(shown * 0.25).toFixed(2)} s in all; it stood the whole time)`);
    console.log(`real opening, standing still: walk hint first drawn at ${((firstAt + 1) * 0.25).toFixed(2)} s, ${(shown * 0.25).toFixed(2)} s on screen in 40 s, longest stand ${(longest * 0.25).toFixed(2)} s`);
    // not a flicker in the half second between the opening's two lines: once drawn it stays its stand, or until she moves
    let shortest = Infinity, runLen = 0;
    track.forEach(([hint], i) => { if (hint === WALK) runLen++; if ((hint !== WALK || i === track.length - 1) && runLen > 0) { shortest = Math.min(shortest, runLen); runLen = 0; } });
    assert.ok(shortest * 0.25 >= 7, `every showing is a whole stand (the shortest was ${(shortest * 0.25).toFixed(2)} s)`);
    // ---- the ending, as world calls it, from the rim; then Title
    await game.page.evaluate(async () => { const d = window.__dbg; await d.checkpoint('cp_rim'); await d.ext.core.stepAsync(90, false); });
    await game.page.evaluate(() => { const d = window.__dbg, ctx = d.ext.core.ctx(); ctx.state.request('ending', 'stage_end'); d.emit('ending/card', { stats: { ...ctx.world.stats } }); });
    await game.page.evaluate(() => window.__dbg.ext.core.stepAsync(60, true));
    const down = await gun();
    assert.ok(down[1] < first[1] - 0.5, `under the end card the revolver is let down (${down})`);
    await game.page.evaluate(() => window.__dbg.ext.core.stepAsync(360, false));     // past the reveal: the menu answers
    await game.page.click('.k7 .scr.on [data-item="menu"]');
    assert.equal(await settle('title'), 'title');
    await game.page.evaluate(() => window.__dbg.step(0, true));
    const after = await gun();
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(after[i] - first[i]) < 0.005, `the title after an ending holds the revolver where the first title does (${after} against ${first})`);
    // (no picture from here: the ending was forced from the rim's first step, so the frame behind the title is not the
    // one a finished run leaves; scratch/i1-team-ui/repro.mjs walks the real ending and takes it: after_title_after_end.png)
  } finally { await game.close(); await server.close(); }
});
