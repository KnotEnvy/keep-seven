// Release pass p0, the yard (issue "the yard is the stage's sharpest spike"): the layout has three Transits, and the real
// game stood four. This one needs the real enemies beside the real world (the stub hands out a new actor every time),
// so it opens the whole game through the e2e driver. One browser, about thirty seconds of game time, nothing drawn.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { LAYOUT, openBot } from '../e2e/lib/bot.mjs';

let srv;
before(async () => { srv = await startServer({}); });
after(async () => { await srv.close(); });

test('the yard, real enemies: three Transits in the whole fight, and one (the vignette\'s own) when the first wave is released', async () => {
  const yard = LAYOUT.encounters.find((e) => e.id === 'enc_yard');
  assert.equal(yard.composition.transit, 3, 'the layout\'s yard has three');
  const bot = await openBot(srv, { piece: 'code-world', tier: 'low', allowErrors: true });
  try {
    await bot.startFromTitle();
    await bot.jump('cp_street_clear');
    const out = await bot.page.evaluate(async () => {
      const dbg = window.__dbg, core = dbg.ext.core, ctx = core.ctx();
      dbg.god(true);
      const seen = new Set(); let atA = -1, started = false; const waves = [];
      ctx.events.on('encounter/started', (e) => { if (e.id === 'enc_yard') started = true; });
      ctx.events.on('encounter/wave', (e) => { if (e.id === 'enc_yard') waves.push(e.wave); });
      const transits = () => dbg.enemies().filter((e) => e.kind === 'transit' && e.alive);
      ctx.player.teleport(-75.9, 0, 0.95, 90, 0);
      await core.stepAsync(10, false);
      dbg.aimAtEntity('knot_yard_latch'); await core.stepAsync(2, false); dbg.tap('fire'); await core.stepAsync(3, false);
      for (let i = 0; i < 28 * 6; i++) {
        await core.stepAsync(10, false);
        for (const e of transits()) seen.add(e.id);
        // a second after wave A: how many stand; then the first is put down the way a bullet does it, so wave B comes
        if (atA < 0 && waves.includes('A')) { await core.stepAsync(60, false); atA = transits().length; for (const e of transits()) seen.add(e.id); await core.stepAsync(120, false); ctx.enemies.debug.killAll(false); }
      }
      return { started, waves, atA, transits: [...seen] };
    });
    assert.ok(out.started, 'the latch knot started the yard');
    assert.ok(['A', 'B'].every((w) => out.waves.includes(w)), `both waves that hold Transits came (${out.waves})`);
    assert.equal(out.atA, 1, 'one Transit a second after wave A (it was two: the vignette\'s and the wave\'s)');
    assert.equal(out.transits.length, 3, `three Transits in the whole fight (${out.transits.join(' ')})`);
  } finally { await bot.close(); }
});
