// Voices and cost (work order section 6): the worst fight on the game's index page, src/audio in its slot beside the
// five core stubs. Once with the context locked (the logic alone) and once running (every sound really built).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, measureAlloc } from '../harness.mjs';
import { fight } from './fight.mjs';
import { PIECE, audioServer, openIndex } from './lib.mjs';

let server;
before(async () => { server = await audioServer(); });
after(async () => { await server.close(); });
const LIMIT = 6 * 1024;
const report = {};
const save = () => { fs.mkdirSync(path.join(ROOT, 'shots', PIECE), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'cost.json'), JSON.stringify(report, null, 1)); };

test('60 s of the worst fight never exceeds 32 voices; no AudioNode is constructed outside a sound start', async () => {
  const game = await openIndex(server, { checkpoint: 'cp_hall_gantry' });
  try {
    await game.dbg('god', true);
    const out = await game.page.evaluate(async (src) => {
      // eslint-disable-next-line no-new-func
      const run = new Function('return (' + src + ')')();
      const dbg = window.__dbg, a = dbg.ext.audio;
      a.unlock();
      for (let i = 0; i < 100 && !a.status().active; i++) await new Promise((r) => setTimeout(r, 10));
      const before = a.status();
      let idleTicks = 0, idleNodes = 0, startTicks = 0;
      for (let k = 0; k < 3600; k++) {
        const s0 = a.status();
        run(dbg, 1);
        const s1 = a.status();
        if (s1.starts === s0.starts) { idleTicks++; idleNodes += s1.nodes - s0.nodes; } else startTicks++;
      }
      const end = a.status();
      return { active: before.active, voiceMax: window.__fight.voices, idleTicks, idleNodes, startTicks, starts: end.starts - before.starts, nodes: end.nodes - before.nodes, voicePeak: end.voicePeak, dropped: end.dropped, zone: dbg.state().systems.audio.zone, music: dbg.state().systems.audio.music };
    }, fight.toString());
    assert.equal(out.active, true, 'the context is running: the sounds are really built');
    assert.ok(out.voiceMax <= 32 && out.voicePeak <= 32, `voices ${out.voiceMax} (peak inside a tick ${out.voicePeak})`);
    assert.ok(out.starts > 1500, `a real fight: ${out.starts} sounds in 60 s`);
    assert.equal(out.idleNodes, 0, `nodes constructed on the ${out.idleTicks} ticks without a sound start`);
    assert.ok(out.idleTicks > 1000, 'most ticks start nothing');
    Object.assign(report, { fight: out });
    save();
    console.log(`cost: 60 s of the worst fight in ${out.zone} (${out.music}): ${out.starts} sounds, ${out.nodes} nodes (${(out.nodes / out.starts).toFixed(1)} per sound), voices at most ${out.voiceMax} at a tick end (${out.voicePeak} inside a tick), ${out.dropped} starts refused; ${out.idleTicks} ticks without a start constructed ${out.idleNodes} nodes`);
  } finally { await game.close(); }
});

test('fixedUpdate + update + lateUpdate take at most 0.3 ms (median); the handlers of the worst fight are measured too', async () => {
  const game = await openIndex(server, { checkpoint: 'cp_hall_gantry', viewport: { width: 192, height: 108 } });
  try {
    await game.dbg('god', true);
    const out = await game.page.evaluate(async (src) => {
      // eslint-disable-next-line no-new-func
      const run = new Function('return (' + src + ')')();
      const dbg = window.__dbg, a = dbg.ext.audio, ctx = dbg.ext.core.ctx();
      a.unlock();
      for (let i = 0; i < 100 && !a.status().active; i++) await new Promise((r) => setTimeout(r, 10));
      run(dbg, 600);                                         // warm
      // (a) the loop's own per-system timer, a rendered frame per tick: audio is index 4 of SYSTEM_ORDER
      const samples = [];
      for (let k = 0; k < 600; k++) { run(dbg, 0); window.__fight.k++; dbg.step(1, true); samples.push(ctx.perf.systemMs[4]); }
      samples.sort((x, y) => x - y);
      // (b) everything audio does in a tick of the fight, handlers included: the same ticks with and without the
      // audio handlers cannot be separated on a bus, so the handlers are called directly, 60 s of them, and timed whole
      const eng = a.engine(), f = window.__fight;
      const on = (name) => eng.handlers.get(name);
      const fired = on('weapon/fired'), hit = on('combat/hit'), step = on('player/footstep'), tell = on('enemy/telegraph'), discharge = on('boss/discharge'), knot = on('knot/burst'), cue = on('audio/cue');
      const t0 = performance.now();
      const ticks = 3600;
      for (let k = 0; k < ticks; k++) {
        if (k % 29 === 0) { fired(f.fired); hit(f.hit); }
        if (k % 20 === 0) step(f.step);
        if (k % 30 === 10) tell(f.tell[((k / 30) | 0) % 6]);
        if (k % 66 === 0) discharge(f.discharge);
        if (k % 45 === 7) knot(f.knot);
        if (k % 77 === 3) cue(f.cue);
        eng.fixedUpdate();
      }
      const whole = (performance.now() - t0) / ticks;
      return { median: samples[300], p95: samples[570], max: samples[599], whole, active: a.status().active };
    }, fight.toString());
    assert.equal(out.active, true);
    assert.ok(out.median <= 0.3, `median ${out.median} ms`);
    assert.ok(out.whole <= 0.3, `handlers + fixedUpdate, mean over 3600 ticks: ${out.whole} ms`);
    Object.assign(report, { ms: out });
    save();
    console.log(`cost: audio fixedUpdate + update + lateUpdate median ${out.median.toFixed(3)} ms (p95 ${out.p95.toFixed(3)}, max ${out.max.toFixed(3)}; the loop's timer, 600 rendered ticks of the fight, context running); with its event handlers ${out.whole.toFixed(4)} ms per tick (mean of 3600 ticks); share 0.3 ms`);
  } finally { await game.close(); }
});

test('allocation: at most 6 KB per tick in the worst fight, context locked and context running (measureAlloc, 3000 ticks of warm-up)', async () => {
  for (const running of [false, true]) {
    const game = await openIndex(server, { checkpoint: 'cp_hall_gantry' });
    try {
      await game.dbg('god', true);
      if (running) {
        await game.page.evaluate(async () => { const a = window.__dbg.ext.audio; a.unlock(); for (let i = 0; i < 100 && !a.status().active; i++) await new Promise((r) => setTimeout(r, 10)); });
        assert.equal(await game.page.evaluate(() => window.__dbg.ext.audio.status().active), true);
      }
      const fightAlloc = await measureAlloc(game, fight);
      const idle = await measureAlloc(game, (dbg, n) => { dbg.step(n, false); }, { warm: 600 });
      const key = running ? 'running' : 'locked';
      report['alloc_' + key] = { fight: fightAlloc.perTick, idle: idle.perTick, samples: fightAlloc.samples };
      save();
      console.log(`cost: allocation, context ${key}: ${fightAlloc.perTick.toFixed(0)} B per tick in the worst fight, ${idle.perTick.toFixed(0)} B per tick walking afterwards (limit ${LIMIT}; core + stubs alone measure about 400 B)`);
      assert.ok(fightAlloc.perTick <= LIMIT, `${key}: ${fightAlloc.perTick} B per tick`);
      assert.ok(idle.perTick <= LIMIT);
    } finally { await game.close(); }
  }
});
