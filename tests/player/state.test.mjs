// Health, save, timers under pause, determinism, allocation and JS cost of src/player, through the sandbox page
// (code-player order 6 and 7).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, measureAlloc } from '../harness.mjs';
import { DT, FLOOR, ORIGIN, PIECE, eventsSince, ext, lastSeq, me, room, sandbox, server } from './common.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });
const [OX, OY, OZ] = ORIGIN;
const damage = (game, ...args) => ext(game, 'core', 'damage', ...args);
const hp = async (game) => (await game.state()).player.health;

test('health: regeneration of the current segment after 4 s at 12 HP/s, the last-20 absorb, the grace, difficulty, canteens, god mode', async () => {
  const game = await sandbox(srv, 'room');
  try {
    let seq = await lastSeq(game);
    assert.equal(await damage(game, 30, 'lunge', 'bider', OX + 3, OY + 1, OZ), 30);
    assert.equal(await damage(game, 15, 'stake', 'transit'), 15);        // 55: the second segment
    const hurt = await eventsSince(game, seq, 'player/damaged');
    assert.deepEqual(hurt.map((e) => [e.payload.amount, e.payload.health, e.payload.kind, e.payload.source, e.payload.graceUsed]), [[30, 70, 'lunge', 'bider', false], [15, 55, 'stake', 'transit', false]]);
    assert.deepEqual([hurt[0].payload.fromX, hurt[0].payload.fromY, hurt[0].payload.fromZ], [OX + 3, OY + 1, OZ], 'the source position for the HUD arc');
    const calls = await ext(game, 'range', 'renderCalls');
    assert.ok(calls.includes('addTrauma:0.8') && calls.includes('addTrauma:0.6125'), `damage trauma 0.55 .. 0.9 by damage (30 HP: 0.8, 15 HP: 0.6125): ${calls.filter((c) => c.startsWith('addTrauma'))}`);
    await game.step(239);
    assert.equal(await hp(game), 55, 'nothing for 4 s');
    await game.step(31);                                    // tick 240 starts it; 30 more ticks = 0.5 s
    assert.ok(Math.abs(await hp(game) - (55 + 12 * 31 * DT)) < 1e-3, `12 HP/s: ${await hp(game)}`);
    await game.step(120);
    assert.equal(await hp(game), 67, 'the current segment fills, the next does not');
    assert.deepEqual((await eventsSince(game, seq, 'player/health_segment')).map((e) => [e.payload.segment, e.payload.regenerating]), [[1, true], [1, false]]);
    const healed = await eventsSince(game, seq, 'player/healed');
    assert.ok(healed.length === 1 && Math.abs(healed[0].payload.amount - 12) < 1e-3 && healed[0].payload.health === 67);
    // canteens
    assert.equal(await ext(game, 'range', 'give', 'pickup', 'pk_canteen'), true);
    assert.equal(await hp(game), 100, 'a full segment: the canteen fills the next one');
    assert.equal(await ext(game, 'range', 'give', 'pickup', 'pk_canteen'), false, 'ignored at 100 HP');
    // difficulty, read live
    await game.dbg('setOption', 'difficulty', 'easy');
    assert.ok(Math.abs(await damage(game, 30) - 18) < 1e-9);
    await game.dbg('setOption', 'difficulty', 'hard');
    assert.ok(Math.abs(await damage(game, 30) - 42) < 1e-9);
    await game.dbg('setOption', 'difficulty', 'normal');
    // the last 20 HP absorb x0.75
    await game.dbg('setHealth', 30);
    assert.ok(Math.abs(await damage(game, 20) - 17.5) < 1e-9, '10 above the line, 10 into it at x0.75');
    // grace: a fatal hit from above 25 HP leaves 1 HP and 0.75 s of immunity
    await game.dbg('setHealth', 26);
    await game.dbg('setOption', 'difficulty', 'hard');
    seq = await lastSeq(game);
    assert.equal(await damage(game, 38, 'slam', 'tamper'), 25);
    let s = await game.state();
    assert.deepEqual([s.player.health, s.player.alive], [1, true]);
    assert.equal((await eventsSince(game, seq, 'player/damaged'))[0].payload.graceUsed, true);
    assert.equal(await damage(game, 38), 0, 'immune');
    await game.step(44);
    assert.equal(await damage(game, 38), 0, 'still immune at 0.73 s');
    await game.step(1);
    assert.equal((await me(game)).immunity, 0, 'the window is 0.75 s');
    // god mode
    await game.dbg('god', true);
    assert.equal(await damage(game, 38), 0);
    await game.dbg('god', false);
    assert.equal(await damage(game, 38), 1, 'from 1 HP the next hit kills');
    s = await game.state();
    assert.deepEqual([s.player.alive, s.player.health], [false, 0]);
    assert.deepEqual((await eventsSince(game, seq, 'player/died')).map((e) => [e.payload.kind, e.payload.source]), [['bullet', 'world']]);
    await game.dbg('setOption', 'difficulty', 'normal');
    await game.until({ state: 'playing' }, 300);            // the sandbox's flow respawns her
    s = await game.state();
    assert.ok(s.player.alive && s.player.health >= 60, 'respawned with the floor of 60 HP');
  } finally { await game.close(); }
});

test('save: captureSave is the fresh run state after start, round-trips through JSON, applies the floors, and leaves her alive with every per-run field reset', async () => {
  const game = await sandbox(srv, 'room');
  try {
    const fresh = (await ext(game, 'range', 'save')).captured;
    assert.deepEqual(fresh, { health: 100, cylinder: ['lead', 'lead', 'lead', 'lead', 'lead', 'lead'], reserve: 24, lineRounds: 0, seventh: 'sealed' });
    // spend, hurt, queue things, die mid-reload with a grace window open
    await ext(game, 'range', 'give', 'line', 2);
    await game.run([{ tap: 'fire', steps: 29 }, { tap: 'fire', steps: 29 }, { tap: 'line', steps: 34 }]);
    await game.dbg('setHealth', 26);
    await ext(game, 'core', 'damage', 38, 'slam', 'tamper');
    const save = JSON.parse(JSON.stringify((await ext(game, 'range', 'save')).captured));
    assert.deepEqual(save, { health: 1, cylinder: ['line', 'lead', 'lead', 'lead', 'empty', 'empty'], reserve: 25, lineRounds: 2, seventh: 'sealed' });
    await game.run([{ tap: 'reload', steps: 5 }]);
    await game.page.evaluate((data) => window.__dbg.ext.range.applySave(data), save);
    let s = await game.state();
    assert.deepEqual([s.player.health, s.player.cylinder, s.player.reserve, s.player.lineRounds, s.player.phase, s.player.alive],
      [60, ['lead', 'lead', 'lead', 'lead', 'lead', 'lead'], 25, 2, 'ready', true], 'max(saved, 60) HP, a full cylinder of lead, the saved reserve and line rounds, ready');
    assert.equal((await me(game)).immunity, 0, 'the grace window is cleared');
    assert.deepEqual([s.player.vx, s.player.vy, s.player.vz], [0, 0, 0]);
    // the reserve floor
    await game.dbg('setAmmo', 1, 3, 0);
    await game.page.evaluate(() => { const r = window.__dbg.ext.range; r.applySave(JSON.parse(JSON.stringify(r.save().captured))); });
    assert.equal((await game.state()).player.reserve, 18, 'max(saved, 18) reserve');
    // applied while she is dead (a new run from the title or the ending): alive again
    await game.dbg('setHealth', 0);
    await game.page.evaluate((data) => window.__dbg.ext.range.applySave(data), fresh);
    s = await game.state();
    assert.deepEqual([s.player.alive, s.player.health, s.player.chambered, s.player.reserve, s.player.lineRounds, s.player.seventh], [true, 100, 6, 24, 0, 'sealed'], 'the fresh state is left as it is by the floors');
  } finally { await game.close(); }
});

test('timers stop with the game: the cadence, a reload, the grace window and the regeneration do not advance while paused', async () => {
  const game = await sandbox(srv, 'room');
  try {
    const snap = async () => { const p = await me(game); return [p.phase, p.phaseTime, p.immunity, p.health, p.simTicks]; };
    await game.dbg('setHealth', 26);
    await ext(game, 'core', 'damage', 38, 'slam', 'tamper');           // grace: 0.75 s of immunity
    await game.run([{ tap: 'fire', steps: 5 }]);
    const a = await snap();
    assert.equal(a[0], 'firing');
    const tick0 = (await game.state()).tick;
    await game.dbg('pause', true);
    assert.equal((await game.state()).game, 'paused');
    await game.page.evaluate(() => window.__dbg.step(60, false));       // a readable held open for a second
    assert.equal((await game.state()).tick, tick0 + 60, 'clock.tick went on');
    assert.deepEqual(await snap(), a, 'cadence, grace and health did not move');
    await game.dbg('pause', false);
    await game.step(24);                                    // the shot was 4 ticks before the pause: 28 ticks of play so far
    assert.equal((await me(game)).phase, 'firing', 'not yet ready after 0.467 s of play');
    await game.step(1);
    assert.equal((await me(game)).phase, 'ready', 'the cycle ends 0.483 s of PLAY after the shot');
    const left = (await me(game)).immunity;
    assert.ok(Math.abs(left - (0.75 - 30 * DT)) < 1e-3, `the grace window counted the 30 ticks of play only (${left} s left)`);
    // a reload across a pause
    await game.dbg('setAmmo', 0, 24, 0);
    await game.run([{ tap: 'fire', steps: 30 }]);
    await game.dbg('pause', true);
    await game.page.evaluate(() => window.__dbg.step(200, false));
    await game.dbg('pause', false);
    const done = await game.until({ path: 'player.phase', op: '==', value: 'ready' }, 300);
    assert.equal(done.steps, 7 + 147 - 29, 'the dry beat (7 ticks) and the reload (2.45 s) took 154 ticks of play in all (29 before the pause, 125 after)');
  } finally { await game.close(); }
});

/** 600 ticks of everything: walking, jumping, turning, shots, a reload, a line round, damage */
const SCRIPT = [
  { call: ['seed', 7] },
  { keys: ['KeyW'], look: [120, -20], steps: 60 },
  { keys: ['KeyW', 'ShiftLeft', 'KeyD'], tap: 'jump', steps: 45 },
  { keys: ['KeyA'], aimAtEntity: 'dummy_kill', tap: 'fire', steps: 29 },
  { aimAtEntity: 'dummy_weak', tap: 'fire', steps: 12 }, { tap: 'reload', steps: 60 },
  { keys: ['KeyS'], look: [-300, 40], tap: 'fire', steps: 40 },
  { keys: [], tap: 'line', steps: 40 }, { aimAtEntity: 'body_behind_plates', tap: 'fire', steps: 30 },
  { keys: ['KeyW', 'KeyA'], tap: ['fire', 90], steps: 100 },
  { keys: ['KeyD'], look: [200, 10], tap: 'jump', steps: 84 },
  { keys: [], steps: 100 },
];
test('determinism: two loads of one 600-tick script give the same hash; the same script in other step sizes too', async () => {
  const once = async (chunk) => {
    const game = await sandbox(srv, 'range');
    try {
      await ext(game, 'range', 'give', 'line', 1);
      await ext(game, 'core', 'damage', 20);
      const t0 = (await game.state()).tick;
      if (!chunk) await game.run(SCRIPT);
      else for (const step of SCRIPT) {
        if (!step.steps || step.steps <= chunk) { await game.run([step]); continue; }
        const { steps, ...first } = step;
        await game.run([{ ...first, steps: chunk }]);
        for (let left = steps - chunk; left > 0; left -= chunk) await game.run([{ steps: Math.min(chunk, left) }]);
      }
      const s = await game.state();
      return { hash: await game.dbg('hash'), ticks: s.tick - t0, shots: s.systems.player.shotsFired, x: s.player.x, z: s.player.z };
    } finally { await game.close(); }
  };
  const a = await once(0), b = await once(0), c = await once(7);
  assert.equal(a.ticks, 600);
  assert.ok(a.shots >= 5, `the script fired ${a.shots} rounds`);
  assert.equal(a.hash, b.hash, 'two loads, one hash');
  assert.equal(a.hash, c.hash, 'cut into 7-tick calls: the same hash');
  assert.deepEqual([a.x, a.z], [b.x, b.z]);
});

// the bodies run in the page: exactly n ticks each
const fightTicks = (dbg, n) => {
  for (let left = n; left > 0; left -= 20) {
    const k = (window.__k = (window.__k ?? 0) + 1);
    if (k % 9 === 0) dbg.setAmmo(6, 24, 1);
    if (k % 9 === 4) dbg.tap('line');
    dbg.tap(k % 5 === 0 ? 'reload' : 'fire');
    if (k % 7 === 0) dbg.tap('jump');
    dbg.setAim(-40 + (k % 40) * 2, -3 + (k % 3));
    dbg.setActions(k % 4 === 0 ? ['forward', 'sprint'] : k % 4 === 1 ? ['left'] : k % 4 === 2 ? ['back'] : ['right', 'forward']);
    dbg.step(Math.min(20, left), false);
  }
};
/** a frame per tick while she walks about the room (a turn every 2 s keeps her off the walls most of the time) */
const frameTicks = (dbg, n) => { for (let i = 0; i < n; i++) { const k = (window.__f = (window.__f ?? 0) + 1); if (k % 120 === 0) dbg.setAim((k / 120) * 97, 0); dbg.step(1, true); } };

test('allocation: moving, jumping and firing in the range is at most 6 KB per tick (measureAlloc: 3000 ticks of warm-up, median of ten 60-tick batches)', async () => {
  const game = await sandbox(srv, 'range');
  try {
    await game.dbg('god', true);
    const fight = await measureAlloc(game, fightTicks);
    const s = await game.state();
    assert.ok(s.systems.player.shotsFired > 60, `the path fired ${s.systems.player.shotsFired} rounds`);
    // a tick plus a frame (update, lateUpdate, the view-model's procedural layers): warmed on a small buffer.
    // The sandbox's own readout builds a string per frame: off, so the figure is the player beside the stubs.
    await ext(game, 'range', 'readout', false);
    await game.dbg('setActions', ['forward', 'left']);     // the path being measured is warmed as it is measured: walking, a frame per tick
    await game.page.setViewportSize({ width: 96, height: 54 });
    await measureAlloc(game, frameTicks, { warm: 2970, batches: 1, perBatch: 30 });
    await game.page.setViewportSize({ width: 960, height: 540 });
    await game.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    const framed = await measureAlloc(game, frameTicks, { warm: 0, perBatch: 30 });
    await game.dbg('setActions', []);
    await game.dbg('setAim', 0, 0);
    const walking = await measureAlloc(game, (dbg, n) => { const k = (window.__f = (window.__f ?? 0) + 1); if (k % 3 === 0) dbg.setAim(k * 31, 0); dbg.step(n, false); });
    await game.dbg('setActions', []);
    const idle = await measureAlloc(game, (dbg, n) => { dbg.step(n, false); }, { warm: 600 });
    const report = { perTickFight: fight.perTick, perTickWalk: walking.perTick, perTickIdle: idle.perTick, perTickPlusFrame: framed.perTick, samples: { fight: fight.samples, walk: walking.samples, idle: idle.samples, framed: framed.samples }, limit: 6144 };
    fs.mkdirSync(path.join(ROOT, 'shots', PIECE), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'alloc.json'), JSON.stringify(report, null, 1));
    console.log(`player alloc: ${fight.perTick.toFixed(0)} B per tick moving and firing; ${walking.perTick.toFixed(0)} walking; ${idle.perTick.toFixed(0)} standing; ${framed.perTick.toFixed(0)} B per tick + rendered frame (limit 6144)`);
    assert.ok(fight.perTick <= 6144, `moving and firing: ${fight.perTick.toFixed(0)} B per tick`);
    assert.ok(framed.perTick <= 6144, `a tick plus a frame: ${framed.perTick.toFixed(0)} B`);
  } finally { await game.close(); }
});

test('JS cost: fixedUpdate + update + lateUpdate of the player over the range script (reported; the median is held to 0.4 ms)', async () => {
  const game = await sandbox(srv, 'range');
  try {
    await game.dbg('god', true);
    // perf.systemMs[0] is the player's share of the last drawn frame (one tick + update + lateUpdate)
    const samples = await game.page.evaluate((fn) => {
      const dbg = window.__dbg, perf = dbg.ext.core.ctx().perf, out = [];
      // eslint-disable-next-line no-new-func
      const fight = new Function('return (' + fn + ')')();
      fight(dbg, 1200);                                     // warm up the same path
      for (let i = 0; i < 900; i++) {
        if (i % 20 === 0) fight(dbg, 0);
        const k = Math.floor(i / 20);
        if (i % 20 === 0) { dbg.tap(k % 5 === 0 ? 'reload' : 'fire'); dbg.setAim(-40 + (k % 40) * 2, -3); dbg.setActions(k % 2 ? ['forward', 'sprint'] : ['left']); if (k % 9 === 0) dbg.setAmmo(6, 24, 0); }
        dbg.step(1, true);
        out.push(perf.systemMs[0]);
      }
      dbg.setActions([]);
      return out;
    }, fightTicks.toString());
    // the same path timed around the three calls themselves, summed over 6000 ticks (the browser's clock ticks in 0.1 ms steps)
    const mean = await game.page.evaluate((fn) => {
      const dbg = window.__dbg, pl = dbg.ext.core.ctx().player;
      // eslint-disable-next-line no-new-func
      const fight = new Function('return (' + fn + ')')();
      let total = 0, calls = 0;
      for (const name of ['fixedUpdate', 'update', 'lateUpdate']) {
        const original = pl[name].bind(pl);
        pl[name] = (a, b) => { const t = performance.now(); original(a, b); total += performance.now() - t; if (name === 'fixedUpdate') calls++; };
      }
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) { fight(dbg, 59); dbg.step(1, true); }
      const wall = performance.now() - t0;
      for (const name of ['fixedUpdate', 'update', 'lateUpdate']) delete pl[name];
      return { perTickMs: total / calls, ticks: calls, wallPerTickMs: wall / calls };
    }, fightTicks.toString());
    const sorted = samples.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1], p99 = sorted[Math.floor(sorted.length * 0.99)], worst = sorted.at(-1);
    fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'perf.json'), JSON.stringify({ medianMs: median, p99Ms: p99, worstMs: worst, over1ms: samples.filter((v) => v > 1).length, samples: samples.length, meanPerTickMs: mean.perTickMs, meanTicks: mean.ticks, wholeGamePerTickMs: mean.wallPerTickMs, budget: { medianMs: 0.4, worstMs: 1.0 } }, null, 1));
    console.log(`player JS: perf.systemMs median ${median.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms, worst ${worst.toFixed(4)} ms (${samples.filter((v) => v > 1).length} of ${samples.length} frames over 1.0 ms) per tick + frame; mean ${(mean.perTickMs * 1000).toFixed(1)} microseconds per tick over ${mean.ticks} ticks (budget 0.4 ms median, 1.0 ms worst)`);
    assert.ok(median <= 0.4, `median ${median} ms`);
    assert.ok(mean.perTickMs <= 0.4, `mean ${mean.perTickMs} ms per tick`);
  } finally { await game.close(); }
});
