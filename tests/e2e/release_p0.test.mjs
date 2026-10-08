// RELEASE PASS p0 (the cross-cutting fixer). Three things the final reviewers left open, on the real game:
//   1. the bot's title start knows the "Begin?" confirmation (a second run in one page, over a save);
//   2. scripted drawing is paced by the debug hook itself (a High leg cannot queue frames faster than they are
//      rasterised), and pacing moves no tick: the same ticks drawn and not drawn give the same hash;
//   3. Hard is not Normal with more damage: the Windlass's glow before a discharge and the Tamper's stand over a slam
//      are 15 % shorter on Hard only.
//
//   node --test tests/e2e/release_p0.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { openBot } from './lib/bot.mjs';

let server;
before(async () => { server = await startServer({}); });
after(async () => { await server.close(); });
const SMALL = { width: 480, height: 270 };

test('the bot begins a second run in one page: over a save the title asks "Begin?" and startFromTitle answers it', async () => {
  const bot = await openBot(server, { piece: 'p0-fixer', tier: 'low', viewport: SMALL });
  try {
    const first = await bot.startFromTitle();
    assert.equal(first.asked, false, 'a fresh page has no save: Begin does not ask');
    await bot.jump('cp_street_clear');
    await bot.eval(async (b, dbg) => { dbg.tap('pause'); await dbg.ext.core.stepAsync(2, true); });
    assert.equal((await bot.state()).game, 'paused');
    await bot.page.click('[data-item="quit"]');
    await bot.page.evaluate(async () => { await window.__dbg.ext.core.idle(); });
    await bot.game.step(20, true);
    assert.equal((await bot.state()).game, 'title');
    const second = await bot.startFromTitle();
    assert.equal(second.asked, true, 'with a save the title asked first');
    const s = await bot.state();
    assert.equal(s.game, 'playing');
    await bot.game.step(30, false);
    assert.deepEqual(bot.game.consoleErrors, []);
  } finally { await bot.close(); }
});

test('High: drawn frames are paced by the hook (one turn of the event loop every 8), and drawing moves no tick', async () => {
  const run = (bot, render) => bot.page.evaluate(async (render) => {
    const d = window.__dbg, core = d.ext.core;
    const before = core.paced();
    d.setActions(['forward']);
    if (render) { for (let i = 0; i < 120; i++) { await core.stepAsync(1, false); d.step(0, true); } for (let i = 0; i < 120; i++) await core.stepAsync(1, true); }
    else await core.stepAsync(240, false);
    d.setActions([]);
    const after = core.paced();
    return { hash: d.hash(), tick: d.state().tick, frames: after.frames - before.frames, yields: after.yields - before.yields, every: after.every };
  }, render);
  let drawn;
  let bot = await openBot(server, { piece: 'p0-fixer', tier: 'high', viewport: SMALL, checkpoint: 'cp_lip_start' });
  try {
    assert.deepEqual(bot.game.consoleErrors, []);
    drawn = await run(bot, true);
  } finally { await bot.close(); }
  // the same ticks with nothing drawn, in a fresh page (a debug jump does not rewind the tick counter)
  bot = await openBot(server, { piece: 'p0-fixer', tier: 'high', viewport: SMALL, checkpoint: 'cp_lip_start' });
  try {
    const blind = await run(bot, false);
    assert.equal(drawn.every, 8);
    assert.equal(drawn.frames, 240, 'both the synchronous step(0, true) and stepAsync(1, true) frames are counted');
    assert.ok(drawn.yields >= 29 && drawn.yields <= 31, `240 drawn frames gave the event loop ${drawn.yields} turns`);
    assert.equal(blind.frames, 0);
    assert.equal(blind.yields, 0, 'no frame drawn, no turn given: undrawn stepping is as fast as before');
    assert.equal(drawn.tick, blind.tick);
    assert.equal(drawn.hash, blind.hash, 'the simulation cannot see the pacing');
    assert.deepEqual(bot.game.consoleErrors, []);
  } finally { await bot.close(); }
});

test('Hard only: the Windlass glows 15 % shorter before a discharge and the Tamper stands 15 % shorter over a slam', async () => {
  const bot = await openBot(server, { piece: 'p0-fixer', tier: 'low', viewport: SMALL, checkpoint: 'cp_hall_gantry' });
  try {
    const tamper = await bot.page.evaluate(async () => {
      const d = window.__dbg, core = d.ext.core, e = d.ext.enemies;
      const out = {};
      for (const difficulty of ['normal', 'hard', 'easy']) {
        await d.checkpoint('cp_hall_gantry');
        d.setOption('difficulty', difficulty);
        d.god(true);
        await core.stepAsync(2);
        const id = e.actors().find((a) => a.kind === 'tamper').id;
        e.wake(id);                                             // out of its pounding vignette
        // she stands 3.5 m in front of it (inside the slam's 4.5 m), looking at it, until the arm has come down
        const pl = core.ctx().player.position;
        for (let n = 0; n < 1200; n++) {
          const a = e.actor(id);
          if (a.state === 'slam_recover') break;
          if (a.state === 'advance' && Math.hypot(pl.x - a.x, pl.z - a.z) > 4) {
            const yaw = a.yawDeg * Math.PI / 180;
            d.teleport(a.x + Math.sin(yaw) * 3.5, a.y, a.z + Math.cos(yaw) * 3.5);
            d.aimAt(a.x, a.y + 1.5, a.z);
          }
          await core.stepAsync(1);
        }
        let ticks = 0;
        while (e.actor(id).state === 'slam_recover' && ticks < 300) { await core.stepAsync(1); ticks++; }
        out[difficulty] = ticks;
      }
      d.setOption('difficulty', 'normal');
      return out;
    });
    console.log(`Tamper slam_recover ticks: ${JSON.stringify(tamper)}`);
    assert.ok(Math.abs(tamper.normal - 90) <= 1, `Normal stands 1.5 s (${tamper.normal} ticks)`);
    assert.ok(Math.abs(tamper.easy - 90) <= 1, `Easy stands 1.5 s (${tamper.easy} ticks)`);
    assert.ok(Math.abs(tamper.hard - 77) <= 1, `Hard stands 1.275 s (${tamper.hard} ticks)`);

    const boss = {};
    for (const difficulty of ['normal', 'hard']) {
      boss[difficulty] = await bot.page.evaluate(async (difficulty) => {
        const d = window.__dbg, core = d.ext.core;
        d.setOption('difficulty', difficulty);
        await d.checkpoint('cp_boss_p1');
        d.setOption('difficulty', difficulty);
        d.god(true);
        const seq = d.events().at(-1)?.seq ?? 0;
        const got = [];
        for (let i = 0; i < 1500 && got.length < 3; i += 10) {
          await core.stepAsync(10);
          got.length = 0;
          for (const ev of d.events(seq, 'boss/discharge')) if (ev.payload.kind === 'stake' || ev.payload.kind === 'canister') got.push({ tick: ev.tick, kind: ev.payload.kind, glow: ev.payload.glowSeconds });
        }
        return got;
      }, difficulty);
    }
    await bot.page.evaluate(() => window.__dbg.setOption('difficulty', 'normal'));
    console.log(`Windlass phase 1 discharges: ${JSON.stringify(boss)}`);
    assert.ok(boss.normal.length >= 2 && boss.hard.length >= 2, 'both difficulties discharged');
    for (const x of boss.normal) assert.ok(Math.abs(x.glow - 0.9) < 1e-6, `Normal glows 0.9 s (${x.glow})`);
    for (const x of boss.hard) assert.ok(Math.abs(x.glow - 0.765) < 1e-6, `Hard glows 0.765 s (${x.glow})`);
    const gap = (r) => r[1].tick - r[0].tick;
    assert.ok(Math.abs(gap(boss.normal) - 114) <= 2, `Normal: 1.9 s from one discharge to the next (${gap(boss.normal)} ticks)`);
    assert.ok(Math.abs(gap(boss.hard) - 82) <= 2, `Hard: 0.765 + 0.2 + 0.4 s = 1.365 s (${gap(boss.hard)} ticks)`);
    assert.deepEqual(bot.game.consoleErrors, []);
  } finally { await bot.close(); }
});
