// "GO ON" KEEPS THE SAVE (polish round 4, robustness major). The real game with a real localStorage: at every checkpoint
// the page is reloaded, "Go on" is clicked on the title, 150 ticks are played, and the save in memory and the save in
// localStorage must still be the one that was stored. Before the fix the four Windlass checkpoints failed with 74
// differences each: enemies.applySave set the boss phase, the world's listener reached cp_boss_p*, and the flow
// committed a save between enemies.applySave and world.applySave (a fresh world and a fresh player beside the restored
// boss). The next death then restored that hybrid.
//
//   node --test tests/e2e/goon.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { launchBrowser } from '../../tools/browser.mjs';
import { CHECKPOINTS } from './lib/bot.mjs';

let server;
before(async () => { server = await startServer({}); });
after(async () => { await server.close(); });

function diff(a, b, p = '', out = []) {
  if (typeof a !== typeof b || (a === null) !== (b === null)) { out.push(`${p}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`); return out; }
  if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + '.' + k, out); return out; }
  if (a !== b) out.push(`${p}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return out;
}
const strip = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.tick; return c; };

test('reload + "Go on" at every checkpoint: the stored save is still the save 150 ticks later, and a death there restores it', async () => {
  const browser = await launchBrowser({});
  const context = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/audio|AudioContext/i.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e && e.stack ? e.stack : e).slice(0, 600)));
  const ready = () => page.waitForFunction(() => !!(window.__dbg && (window.__dbg.ready || window.__dbg.error)), null, { polling: 100 });
  const settle = () => page.evaluate(async () => {
    const d = window.__dbg, core = d.ext.core;
    for (let i = 0; i < 400 && d.state().game !== 'playing'; i++) { await Promise.race([core.idle(), new Promise((r) => setTimeout(r, 50))]); await new Promise((r) => setTimeout(r, 10)); }
    return d.state().game;
  });
  try {
    await page.goto(server.url + '?test=1&persist=1&tier=low&seed=1');
    await ready();
    await page.evaluate(() => localStorage.clear());
    const bad = [];
    for (const cp of CHECKPOINTS.slice(1)) {
      await page.click('.scr.on [data-item="play"]');
      assert.equal(await settle(), 'playing', `${cp}: a new run`);
      await page.evaluate(async (id) => { await window.__dbg.checkpoint(id); await window.__dbg.ext.core.stepAsync(5, false); }, cp);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('keepseven.save.v1')));
      assert.equal(stored && stored.checkpoint, cp, `${cp}: stored`);
      await page.reload();
      await ready();
      await page.evaluate(() => { window.__saved = []; window.__dbg.ext.core.ctx().events.on('checkpoint/saved', (e) => window.__saved.push(e.id)); });
      await page.click('.scr.on [data-item="continue"]');
      assert.equal(await settle(), 'playing', `${cp}: Go on`);
      const got = await page.evaluate(async () => {
        const d = window.__dbg, ctx = d.ext.core.ctx();
        await d.ext.core.stepAsync(150, false);
        return { mem: ctx.save.current, ls: JSON.parse(localStorage.getItem('keepseven.save.v1')), saved: window.__saved, objective: d.state().world.objective, enemies: d.enemies().length };
      });
      const d1 = diff(strip(stored), strip(got.mem)), d2 = diff(strip(stored), strip(got.ls));
      if (d1.length || d2.length || got.saved.length) bad.push(`${cp}: ${d1.length} differences in memory, ${d2.length} in localStorage, commits after Go on [${got.saved.join(', ')}]\n   ${d1.slice(0, 6).join('\n   ')}`);
      // a death now: what comes back is what "Go on" gave (objective and the number of enemies), not a half-fresh world
      const back = await page.evaluate(async () => {
        const d = window.__dbg, core = d.ext.core;
        const ctx = core.ctx();
        for (let i = 0; i < 12 && ctx.player.alive; i++) { core.damage(1000, 'bullet', 'world'); await core.stepAsync(20, false); }
        for (let i = 0; i < 600 && d.state().game !== 'playing'; i++) { await core.stepAsync(2, false); await core.idle(); }
        await core.stepAsync(150, false);
        return { game: d.state().game, objective: d.state().world.objective, enemies: d.enemies().length };
      });
      // (the count of enemies is compared at the Windlass, where the hybrid brought six Biders back; elsewhere a one-time
      // vignette that has played, like the Tamper's at the gantry, rightly does not play again)
      if (back.game !== 'playing' || back.objective !== got.objective || (cp.startsWith('cp_boss') && back.enemies !== got.enemies)) bad.push(`${cp}: after a death ${JSON.stringify(back)}, after Go on ${JSON.stringify({ objective: got.objective, enemies: got.enemies })}`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await ready();
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
