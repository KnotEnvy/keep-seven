// The allocation ceiling (ARCHITECTURE 8.6): 600 ticks, at most 6 KB per tick, and the same for a tick plus a rendered
// frame. Measured with `measureAlloc` of tests/harness.mjs, the one method every piece uses: 3000 ticks of warm-up
// (for the path with a frame per tick: at a tenth of the size, see below),
// then gc(), read usedJSHeapSize, run a batch small enough that no scavenge happens, read again; the median batch.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, measureAlloc, openGame, startServer } from '../harness.mjs';
import { PIECES, STUBS, median } from './route.mjs';

const PIECE = 'foundation-core';
const LIMIT = 6 * 1024;
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

// The bodies run in the page (see measureAlloc): each runs exactly n ticks of its path.
const walkTicks = (dbg, n) => { dbg.step(n, false); };
const walkFrames = (dbg, n) => { for (let i = 0; i < n; i++) dbg.step(1, true); };
/** she strafes, turns and fires (one ray, two events) every 20 ticks */
const fightTicks = (dbg, n) => {
  for (let left = n; left > 0; left -= 20) {
    const k = (window.__allocShot = (window.__allocShot ?? 0) + 1);
    // the real weapon runs dry (6 + 24) and reloads; the stub's never does: keep the cylinder full so the path measured
    // is "a shot every cycle" on both
    dbg.setAmmo(6, 24, 0);
    dbg.tap('fire'); dbg.setAim(90 + (k % 30) * 2.4, -2); dbg.step(Math.min(20, left), false);
  }
};

test('600 ticks of walking and shooting beside six enemies allocate at most 6 KB per tick', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier: 'low', checkpoint: 'cp_street_clear' });
  try {
    await game.run([
      { call: ['god', true] },
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ call: ['spawnEnemy', i % 2 ? 'transit' : 'bider', -74 - i * 1.5, 0, -3 + i, 90] })),
      { aim: [90, 0], steps: 30 },
    ]);
    await game.dbg('setActions', ['forward', 'left']);
    // Every figure is taken after 3000 ticks of its own path (measureAlloc's default warm-up): before that the number
    // is JIT and inline-cache warm-up (a tick plus a frame: 6.8 KB after 300, 1.8 KB after 3000, 1.5 KB after 12000).
    // The debug event ring clones every payload, a cost a production build does not have: every piece's allocation
    // test measures WITH THE RING OFF (measureAlloc's default); this one also reports the ring's share.
    const t0 = Date.now(), lap = []; const mark = (name) => { lap.push(`${name} ${((Date.now() - t0) / 1000).toFixed(1)}`); };
    const fight = await measureAlloc(game, fightTicks); mark('fight');
    const fightRing = await measureAlloc(game, fightTicks, { warm: 600, ring: true }); mark('ring');
    const walking = await measureAlloc(game, walkTicks); mark('walk');
    // A tick plus a frame needs its 3000 warm-up frames too, and under SwiftShader a 960 x 540 frame is all rasteriser
    // time (this one path took 40 to 60 s of a shared machine). The JS it warms does not depend on the picture's size,
    // so the 3000 warm-up frames are drawn into a 96 x 54 buffer and only the ten measured batches (300 frames) at 960 x 540
    // (the software rasteriser works its queue off when the browser closes: every full-size frame costs there too).
    await game.page.setViewportSize({ width: 96, height: 54 });
    await measureAlloc(game, walkFrames, { warm: 2970, batches: 1, perBatch: 30 }); mark('small frames');
    await game.page.setViewportSize({ width: 960, height: 540 });
    await game.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));   // the resize event has been handled
    assert.equal((await game.dbg('perfRun', 1)).width, 960, 'measured at 960 x 540');
    const framed = await measureAlloc(game, walkFrames, { warm: 0, perBatch: 30 }); mark('frames');
    const ticks = fight.samples, ticksRing = fightRing.samples, idle = walking.samples, frames = framed.samples;
    const report = { perTickFight: median(ticks), perTickFightWithRing: median(ticksRing), perTickWalk: median(idle), perTickPlusFrame: median(frames), samples: { ticks, ticksRing, idle, frames }, limit: LIMIT };
    fs.mkdirSync(path.join(ROOT, 'shots', PIECE), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'alloc.json'), JSON.stringify(report, null, 1));
    console.log(`alloc: ${report.perTickFight.toFixed(0)} B per tick with shots (event ring off; ${report.perTickFightWithRing.toFixed(0)} B with the debug ring recording), ${report.perTickWalk.toFixed(0)} B per tick walking, ${report.perTickPlusFrame.toFixed(0)} B per tick + rendered frame; limit ${LIMIT} (seconds, cumulative: ${lap.join(', ')})`);
    assert.ok(report.perTickWalk <= LIMIT, `walking: ${report.perTickWalk.toFixed(0)} B per tick`);
    assert.ok(report.perTickFight <= LIMIT, `fight: ${report.perTickFight.toFixed(0)} B per tick`);
    assert.ok(report.perTickFightWithRing <= LIMIT, `fight with the debug ring: ${report.perTickFightWithRing.toFixed(0)} B per tick`);
    assert.ok(report.perTickPlusFrame <= LIMIT, `a tick plus a rendered frame: ${report.perTickPlusFrame.toFixed(0)} B`);
    const s = await game.state();
    assert.ok(s.stats.roundsFired >= 90, 'the shots were fired');
    const recorded = (await game.events(0, 'weapon/fired')).length;
    assert.ok(recorded >= 60 && recorded < s.stats.roundsFired, `the ring recorded one run and not the other (${recorded} of ${s.stats.roundsFired})`);
  } finally { await game.close(); }
});
