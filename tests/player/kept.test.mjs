// The kept round through the sandbox page (code-player order 6, "Kept round"; GDD 6.6, GDD 21 test 8, player half):
// it cannot be fired anywhere but down the bore, and it can never be lost.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, ORIGIN, angleDeg, eventsSince, ext, lastSeq, sandbox, server } from './common.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });
const [, OY] = ORIGIN;
const extra = (game) => ext(game, 'core', 'playerExtra');
/** stand on a mark with its context set (what the world does), facing the bore axis */
const stand = async (game, m) => {
  const yaw = Math.atan2(-(m.boreX - m.markX), -(m.boreZ - m.markZ)) * 180 / Math.PI;
  await game.dbg('teleport', m.markX, m.markY, m.markZ, yaw, 0);
  await ext(game, 'range', 'setKeptContext', m);
  await game.step(2);
  return yaw;
};

test('F without a context is denied and changes nothing; with one it loads in 1.8 s of sim time, and nothing but look is heard meanwhile', async () => {
  const game = await sandbox(srv, 'kept');
  try {
    const marks = await ext(game, 'range', 'marks');
    assert.equal(marks.length, 6);
    assert.deepEqual([marks[0].boreRadius, +(marks[0].boreTopY - OY).toFixed(3), +(marks[0].boreBottomY - OY).toFixed(3), marks[0].leaveRadius], [3, 1.2, -6, 2.5], 'the bore volume of the layout: r 3.0, kerb top down to 6 m below the floor');
    let s = await game.state();
    assert.equal(s.player.seventh, 'sealed', 'sealed from the first frame');
    const before = JSON.stringify([s.player.cylinder, s.player.reserve, s.player.seventh, s.player.phase]);
    let seq = await lastSeq(game);
    s = await game.run([{ tap: 'kept', steps: 2 }]);
    assert.deepEqual((await eventsSince(game, seq)).map((e) => [e.name, e.payload.stage, e.payload.mark]), [['weapon/kept', 'denied', '']]);
    assert.equal(JSON.stringify([s.player.cylinder, s.player.reserve, s.player.seventh, s.player.phase]), before, 'no state change');
    // with a context, on the tick of the press
    await stand(game, marks[0]);
    seq = await lastSeq(game);
    s = await game.run([{ tap: 'kept', steps: 1 }]);
    const t0 = s.tick;
    let ev = await eventsSince(game, seq);
    assert.deepEqual(ev.map((e) => [e.name, e.payload.stage, e.payload.mark, e.tick]), [['weapon/kept', 'loading', marks[0].mark, t0]]);
    assert.equal(s.player.phase, 'loading_kept');
    // every input but look is ignored during the load
    const at = [s.player.x, s.player.z];
    s = await game.run([{ actions: ['forward', 'left'], tap: 'fire', steps: 40 }, { tap: 'reload', look: [50, 0], steps: 40 }, { tap: 'jump', steps: 20 }]);
    assert.deepEqual([s.player.x, s.player.z], at, 'she does not move during the load');
    assert.equal(s.player.phase, 'loading_kept');
    assert.ok(Math.abs((((s.player.yawDeg - (stand0Yaw(marks[0]) - 3.5)) % 360) + 540) % 360 - 180) < 1e-3, 'look still turns the view');
    const done = await game.until({ event: 'weapon/kept', where: { stage: 'chambered' } }, 200);
    assert.equal(done.tick - t0, 108, 'chambered 1.8 s after the press');
    s = await game.run([{ actions: [], steps: 1 }]);
    assert.deepEqual([s.player.seventh, s.player.cylinder[0], s.player.reserve, s.player.phase], ['chambered', 'kept', 25, 'ready']);
    assert.equal((await eventsSince(game, seq, 'weapon/fired')).length, 0);
    assert.deepEqual((await eventsSince(game, seq, 'weapon/seventh')).map((e) => e.payload.state), ['chambered']);
    // at half time scale the load takes twice the ticks (sim time, not wall time): unload first by leaving
    await game.dbg('teleport', marks[0].markX + 2.6, marks[0].markY, marks[0].markZ, 0, 0);
    await game.step(20);
    assert.equal((await game.state()).player.seventh, 'band_broken');
    await stand(game, marks[0]);
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().clock.slowMotion(0.5, 30, 'hush'));
    s = await game.run([{ tap: 'kept', steps: 1 }]);
    const slow = await game.until({ event: 'weapon/kept', where: { stage: 'chambered' } }, 400);
    assert.equal(slow.tick - s.tick, 216, 'at time scale 0.5 the load is 216 ticks: 1.8 s of sim time');
  } finally { await game.close(); }
});
const stand0Yaw = (m) => Math.atan2(-(m.boreX - m.markX), -(m.boreZ - m.markZ)) * 180 / Math.PI;

test('from each of the six marks every aim 5 to 60 degrees below the horizon within 25 degrees of the axis is legal; a level aim is not; an illegal pull consumes nothing; leaving by 2.6 m unloads it', async () => {
  const game = await sandbox(srv, 'kept');
  try {
    const marks = await ext(game, 'range', 'marks');
    for (const [i, m] of marks.entries()) {
      const yaw = await stand(game, m);
      await game.run([{ tap: 'kept', steps: 109 }]);
      let s = await game.state();
      assert.equal(s.player.seventh, 'chambered', `${m.mark}: chambered`);
      const sweep = await game.page.evaluate(async ([bearing]) => {
        const dbg = window.__dbg, legal = [], illegal = [];
        const test = async (y, p) => { dbg.setAim(y, p); await dbg.ext.core.stepAsync(1); return dbg.ext.core.playerExtra().keptAimLegal; };
        let count = 0;
        for (let off = -25; off <= 25; off += 5) for (let down = 5; down <= 60; down += 5) { count++; if (!(await test(bearing + off, -down))) illegal.push([off, down]); }
        for (const [off, pitch] of [[0, 0], [0, -1], [0, 15], [180, -30], [70, -20], [-70, -20], [0, -89]]) if (await test(bearing + off, pitch)) legal.push([off, pitch]);
        return { count, illegal, legal };
      }, [yaw]);
      assert.equal(sweep.count, 132);
      assert.deepEqual(sweep.illegal, [], `${m.mark}: aims into the bore that were refused`);
      assert.deepEqual(sweep.legal, [], `${m.mark}: aims outside the bore that were accepted`);
      // a pull with a level aim at the far wall: the hammer does not move, nothing is consumed
      const seq = await lastSeq(game);
      const before = JSON.stringify([s.player.cylinder, s.player.reserve, s.player.lineRounds]);
      s = await game.run([{ aim: [yaw, 0], tap: 'fire', steps: 2 }]);
      assert.deepEqual((await eventsSince(game, seq)).map((e) => [e.name, e.payload.reason]), [['weapon/dry_fire', 'kept_not_in_bore']]);
      assert.equal(JSON.stringify([s.player.cylinder, s.player.reserve, s.player.lineRounds]), before);
      assert.deepEqual([s.player.seventh, s.player.phase, (await extra(game)).shotsFired], ['chambered', 'ready', 0]);
      // R and Q are refused while it is chambered
      s = await game.run([{ tap: 'reload', steps: 2 }, { tap: 'line', steps: 2 }]);
      assert.equal(s.player.phase, 'ready');
      // leave the mark by 2.6 m: unloaded, band broken; back on the mark it loads again
      await game.dbg('teleport', m.markX + 2.6 * Math.sign(m.markX - m.boreX || 1), m.markY, m.markZ, yaw, 0);
      const un = await game.until({ event: 'weapon/kept', where: { stage: 'unloaded' } }, 60);
      assert.ok(un.met && un.steps === 19, `unload_kept is 0.3 s after the tick she is seen off the mark (${un.steps})`);
      s = await game.state();
      // (each load thumbs the round under the hammer out to the reserve: one chambered round fewer per visit, none lost)
      assert.deepEqual([s.player.seventh, s.player.cylinder.includes('kept'), s.player.chambered, s.player.chambered + s.player.reserve], ['band_broken', false, Math.max(0, 5 - i), 30]);
    }
    // within the leave radius it stays under the hammer
    const m = marks[2];
    await stand(game, m);
    await game.run([{ tap: 'kept', steps: 109 }]);
    await game.dbg('teleport', m.markX, m.markY, m.markZ + 2.4, 0, 0);
    await ext(game, 'range', 'setKeptContext', null);       // the world drops the context off the mark's disc: the round stays
    const s = await game.run([{ steps: 30 }]);
    assert.equal(s.player.seventh, 'chambered', '2.4 m from the mark it is still chambered');
  } finally { await game.close(); }
});

test('a legal pull fires it: kept fired, then weapon/fired down the bore, the heavier kick, the seventh spent; F is denied ever after; the legal-aim tick sounds once per turn', async () => {
  const game = await sandbox(srv, 'kept');
  try {
    const marks = await ext(game, 'range', 'marks');
    const m = marks[4];
    const yaw = await stand(game, m);
    await game.run([{ aim: [yaw, 0], tap: 'kept', steps: 109 }]);
    let seq = await lastSeq(game);
    // the aim turns legal, illegal, legal: two ticks of the cue, one per turn
    await game.run([{ aim: [yaw, -30], steps: 5 }, { aim: [yaw, 0], steps: 3 }, { aim: [yaw, -30], steps: 4 }]);
    const cues = await eventsSince(game, seq, 'audio/cue');
    assert.deepEqual(cues.map((e) => [e.payload.cue, e.payload.positional, e.payload.gain, e.payload.pitch]), [['listen_tick', false, 0.5, 1], ['listen_tick', false, 0.5, 1]]);
    assert.equal((await extra(game)).keptAimLegal, true);
    seq = await lastSeq(game);
    let s = await game.run([{ tap: 'fire', steps: 1 }]);
    const ev = await eventsSince(game, seq);
    assert.deepEqual(ev.map((e) => e.name), ['weapon/kept', 'weapon/fired', 'combat/hit', 'weapon/seventh', 'weapon/ammo']);
    assert.ok(ev.every((e) => e.tick === s.tick));
    assert.deepEqual([ev[0].payload.stage, ev[0].payload.mark], ['fired', m.mark]);
    const fired = ev[1].payload;
    assert.equal(fired.ammo, 'kept_round');
    // the end is where the ray meets the cylinder: inside its radius, between its top and bottom
    const r = Math.hypot(fired.endX - m.boreX, fired.endZ - m.boreZ);
    assert.ok(r <= 3 + 1e-6 && fired.endY <= m.boreTopY + 1e-6 && fired.endY >= m.boreBottomY - 1e-6, `the end is on the bore volume (r ${r.toFixed(3)}, y ${(fired.endY - OY).toFixed(3)})`);
    assert.ok(r > 2.99 || Math.abs(fired.endY - m.boreTopY) < 1e-6, 'on its side or its top disc');
    assert.deepEqual([ev[2].payload.entityKind, ev[2].payload.outcome, ev[2].payload.ammo], ['bore', 'impact', 'kept_round']);
    assert.equal(ev[3].payload.state, 'spent');
    assert.deepEqual([s.player.seventh, s.player.phase, s.player.cylinder[0]], ['spent', 'firing_kept', 'empty']);
    const calls = await ext(game, 'range', 'renderCalls');
    assert.deepEqual(calls.slice(-2), ['vfx.muzzleFlash:kept', 'addTrauma:0.15']);
    assert.equal((await extra(game)).shotsFired, 1);
    // the kick: +3.5 degrees, peak at 80 ms, recovered by 600 ms, no FOV punch
    const curve = [await ext(game, 'player', 'kick')];
    for (let t = 1; t <= 37; t++) { await game.step(1); curve.push(await ext(game, 'player', 'kick')); }
    const peakAt = curve.findIndex((k) => k.pitchDeg === Math.max(...curve.map((c) => c.pitchDeg)));
    assert.ok(curve[peakAt].pitchDeg > 3.4 && curve[peakAt].pitchDeg <= 3.5 && peakAt >= 3 && peakAt <= 4, `kept kick peak ${curve[peakAt].pitchDeg} at tick ${peakAt}`);
    assert.ok(curve.every((k) => k.yawDeg === 0 && k.fovDeg === 0), 'no yaw kick, no FOV punch');
    assert.ok(curve[30].pitchDeg > 0 && curve[35].pitchDeg === 0, 'recovered by 0.6 s');
    // fire_kept is 1.2 s; then the gun is ready with the five rounds that were beside it
    const ready = await game.until({ path: 'player.phase', op: '==', value: 'ready' }, 80);
    assert.equal(ready.tick - s.tick, 72);
    s = await game.state();
    assert.deepEqual(s.player.cylinder, ['lead', 'lead', 'lead', 'lead', 'lead', 'empty']);
    // spent: F does nothing but the denied shiver, on the mark or off it; setKeptContext changes nothing
    seq = await lastSeq(game);
    s = await game.run([{ tap: 'kept', steps: 3 }]);
    assert.deepEqual((await eventsSince(game, seq)).map((e) => [e.name, e.payload.stage]), [['weapon/kept', 'denied']]);
    assert.equal(s.player.seventh, 'spent');
    // the stone (the coda): take_round, 1.0 s, violet
    await ext(game, 'range', 'give', 'stone');
    s = await game.run([{ steps: 1 }]);
    assert.deepEqual([s.player.seventh, s.player.phase], ['violet', 'taking_round']);
    s = await game.run([{ steps: 60 }]);
    assert.equal(s.player.phase, 'ready');
    assert.equal((await ext(game, 'player', 'viewModel')).keptLoop, 1, 'the cuff loop holds a round again');
  } finally { await game.close(); }
});

test('boss/charge_required makes the sealed round pulse; a save with it chambered restores it band-broken; 60 seeded input sequences never lose it', async () => {
  const game = await sandbox(srv, 'kept');
  try {
    const marks = await ext(game, 'range', 'marks');
    let seq = await lastSeq(game);
    await game.dbg('emit', 'boss/charge_required', {});
    assert.equal((await game.state()).player.seventh, 'pulse');
    assert.deepEqual((await eventsSince(game, seq, 'weapon/seventh')).map((e) => e.payload.state), ['pulse']);
    await stand(game, marks[1]);
    await game.run([{ tap: 'kept', steps: 109 }]);
    const save = (await ext(game, 'range', 'save')).captured;
    assert.equal(save.seventh, 'chambered');
    assert.equal(save.cylinder[0], 'kept');
    await game.dbg('setHealth', 0);                         // she dies with it under the hammer
    await game.page.evaluate((data) => window.__dbg.ext.range.applySave(JSON.parse(JSON.stringify(data))), save);
    let s = await game.state();
    assert.deepEqual([s.player.alive, s.player.seventh, s.player.cylinder, s.player.phase], [true, 'band_broken', ['lead', 'lead', 'lead', 'lead', 'lead', 'lead'], 'ready']);
    assert.equal((await ext(game, 'player', 'extra')).keptContext, false, 'the kept context is a per-run field: reset');
    // fuzz through the real input path: marks, contexts, aims, every key
    const result = await game.page.evaluate(async ([list]) => {
      const dbg = window.__dbg, core = dbg.ext.core, problems = [];
      let seed = 4242;
      const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      let fired = 0;
      for (let run = 0; run < 60; run++) {
        dbg.ext.core.setSeventh(run % 3 === 0 ? 'band_broken' : 'sealed');
        dbg.setAmmo(Math.floor(rnd() * 7), Math.floor(rnd() * 30), Math.floor(rnd() * 3));
        let legalFire = false;
        const before = dbg.events(0, 'weapon/kept').filter((e) => e.payload.stage === 'fired').length;
        for (let i = 0; i < 400; i++) {
          const a = rnd();
          const m = list[Math.floor(rnd() * list.length)];
          if (a < 0.04) { dbg.teleport(m.markX + (rnd() < 0.3 ? 2.7 : 0), m.markY, m.markZ, 0, 0); dbg.ext.range.setKeptContext(rnd() < 0.8 ? m : null); }
          if (a > 0.9) dbg.setAim(Math.atan2(-(m.boreX - dbg.player().x), -(m.boreZ - dbg.player().z)) * 180 / Math.PI + (rnd() - 0.5) * 80, -70 * rnd() + 10);
          for (const key of ['fire', 'reload', 'line', 'kept', 'jump']) if (rnd() < 0.07) dbg.tap(key);
          dbg.setActions(rnd() < 0.2 ? ['forward'] : []);
          await core.stepAsync(1);
          const p = dbg.player();
          const has = p.cylinder.includes('kept');
          if (has !== (p.seventh === 'chambered')) problems.push(`run ${run} tick ${i}: seventh ${p.seventh} with cylinder ${p.cylinder}`);
          if (p.cylinder.indexOf('kept') > 0) problems.push(`run ${run} tick ${i}: the kept round is not under the hammer`);
          const now = dbg.events(0, 'weapon/kept').filter((e) => e.payload.stage === 'fired').length;
          if (now > before) legalFire = true;
          if (legalFire && p.seventh !== 'spent') problems.push(`run ${run} tick ${i}: fired but ${p.seventh}`);
          if (!legalFire && !['sealed', 'pulse', 'band_broken', 'chambered'].includes(p.seventh)) problems.push(`run ${run} tick ${i}: ${p.seventh} without a legal fire`);
          if (problems.length > 5) return { problems, fired };
        }
        if (legalFire) fired++;
        dbg.clearEvents();
      }
      dbg.setActions([]);
      return { problems, fired };
    }, [marks]);
    assert.deepEqual(result.problems, []);
    assert.ok(result.fired >= 5, `${result.fired} of the 60 sequences fired it legally`);
  } finally { await game.close(); }
});

test('the fire buffer holds for the load: a click in the last 0.15 s of load_kept fires down the bore on the first ready tick; with an illegal aim it is a dead trigger', async () => {
  const game = await sandbox(srv, 'kept');
  try {
    const marks = await ext(game, 'range', 'marks');
    const m = marks[2];
    const yaw = await stand(game, m);
    // legal aim, the click 100 ticks into the 108-tick load
    let seq = await lastSeq(game);
    let s = await game.run([{ aim: [yaw, -30], tap: 'kept', steps: 1 }]);
    const t0 = s.tick;
    s = await game.run([{ steps: 99 }, { tap: 'fire', steps: 1 }, { steps: 20 }]);
    const fired = await eventsSince(game, seq, 'weapon/fired');
    assert.deepEqual(fired.map((e) => [e.payload.ammo, e.tick - t0]), [['kept_round', 108]], 'fired on the tick the load ended');
    assert.deepEqual((await eventsSince(game, seq, 'weapon/kept')).map((e) => e.payload.stage), ['loading', 'chambered', 'fired']);
    assert.equal(s.player.seventh, 'spent');
    // illegal aim (level): the buffered pull is the kept_not_in_bore click and consumes nothing
    await ext(game, 'core', 'setSeventh', 'band_broken');
    await stand(game, m);
    await game.until({ path: 'player.phase', op: '==', value: 'ready' }, 200);
    seq = await lastSeq(game);
    await game.run([{ aim: [yaw, 0], tap: 'kept', steps: 1 }, { steps: 101 }, { tap: 'fire', steps: 1 }, { steps: 20 }]);
    s = await game.state();
    assert.deepEqual((await eventsSince(game, seq, 'weapon/dry_fire')).map((e) => e.payload.reason), ['kept_not_in_bore']);
    assert.equal((await eventsSince(game, seq, 'weapon/fired')).length, 0);
    assert.deepEqual([s.player.seventh, s.player.cylinder[0]], ['chambered', 'kept'], 'nothing consumed');
  } finally { await game.close(); }
});
