// The trigger pull through the real input path, in the sandbox range (code-player order 6: Fire, Reload, Line round,
// Each HitOutcome). GDD 6.2, 6.3, 6.4, 6.7, 6.8; game-feel 9.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, FLOOR, ORIGIN, angleDeg, dirOf, eventsSince, ext, lastSeq, me, room, sandbox, server } from './common.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const OUTCOMES = ['impact', 'hit', 'weak', 'kill', 'freed', 'deflected', 'broke', 'parried', 'passed'];
const [OX, OY, OZ] = ORIGIN;

test('fire: the round is gone, weapon/fired, combat/hit and the muzzle flash are all on the tick of the click', async () => {
  const game = await sandbox(srv, 'range');
  try {
    const seq = await lastSeq(game);
    const before = await game.state();
    assert.equal(before.player.chambered, 6);
    const s = await game.run([{ aimAtEntity: 'dummy_kill', tap: 'fire', steps: 1 }]);   // ONE tick: the click's
    const ev = await eventsSince(game, seq);
    const names = ev.map((e) => e.name);
    assert.deepEqual(names, ['weapon/fired', 'combat/hit', 'weapon/ammo'], `events of the click's tick: ${names}`);
    assert.ok(ev.every((e) => e.tick === s.tick), 'every event carries the tick of the click');
    assert.equal(s.player.chambered, 5, 'the round is removed on that tick');
    assert.deepEqual(s.player.cylinder, ['lead', 'lead', 'lead', 'lead', 'lead', 'empty'], 'chamber 0 emptied, the ring turned one notch');
    assert.equal(s.player.phase, 'firing');
    const fired = ev[0].payload, hit = ev[1].payload;
    assert.equal(fired.ammo, 'lead_round'); assert.equal(fired.chambersLeft, 5); assert.equal(fired.shotId, 1);
    assert.deepEqual([hit.outcome, hit.entityId, hit.entityKind, hit.part, hit.order, hit.damage, hit.shotId], ['kill', 'dummy_kill', 'bider', 'body', 0, 100, 1]);
    // the origin is the eye, the end is the hit, the muzzle is in front of her, right of and below the eye
    assert.ok(Math.abs(fired.oy - (before.player.y + 1.65)) < 1e-3, 'the ray starts at the eye');
    assert.ok(Math.hypot(fired.endX - hit.x, fired.endY - hit.y, fired.endZ - hit.z) < 1e-3, 'weapon/fired ends where combat/hit is');
    const m = [fired.mx - fired.ox, fired.my - fired.oy, fired.mz - fired.oz];
    const along = m[0] * fired.dx + m[1] * fired.dy + m[2] * fired.dz;
    assert.ok(along > 0.3 && along < 0.9, `the muzzle is ${along.toFixed(2)} m ahead of the eye`);
    assert.ok(m[1] < -0.02 && Math.hypot(...m) < 1, 'below the eye, within arm\'s reach');
    // the stub renderer recorded the flash and the trauma request
    const calls = await ext(game, 'range', 'renderCalls');
    assert.deepEqual(calls.slice(-2), ['vfx.muzzleFlash:lead', 'addTrauma:0.25'], `render calls: ${calls.slice(-4)}`);
    assert.deepEqual((await ext(game, 'range', 'report')).dummy_kill, { hits: 1, amount: 100, ammo: 'lead_round' });
    assert.equal((await ext(game, 'core', 'playerExtra')).shotsFired, 1);
  } finally { await game.close(); }
});

test('fire: refused at 0.47 s, accepted at 0.48 s; a click at 0.40 s fires at 0.48 s; an early click is dropped', async () => {
  const game = await sandbox(srv, 'range');
  try {
    const shots = async () => (await game.events(0, 'weapon/fired')).map((e) => e.tick);
    await game.run([{ aim: [0, 0], tap: 'fire', steps: 1 }]);
    const t0 = (await shots())[0];
    // the click of tick t0 + 28 (0.467 s) falls in the buffer and can only fire at t0 + 29: nothing has fired at 0.47 s
    await game.run([{ steps: 27 }, { tap: 'fire', steps: 1 }]);
    assert.deepEqual(await shots(), [t0], 'no second shot at 0.467 s');
    await game.run([{ steps: 1 }]);
    assert.deepEqual(await shots(), [t0, t0 + 29], 'the buffered click fires on the first legal tick, 0.483 s');
    // a click exactly on the first legal tick is accepted on that tick
    await game.run([{ steps: 28 }, { tap: 'fire', steps: 1 }]);
    assert.deepEqual(await shots(), [t0, t0 + 29, t0 + 58], 'accepted at 0.48 s');
    // a click at 0.40 s (tick 24 of the cycle) fires at 0.48 s
    await game.run([{ steps: 23 }, { tap: 'fire', steps: 1 }, { steps: 10 }]);
    assert.deepEqual(await shots(), [t0, t0 + 29, t0 + 58, t0 + 87]);
    // a click at 0.17 s is outside the 0.15 s buffer: dropped
    await game.run([{ steps: 28 }, { tap: 'fire', steps: 1 }, { steps: 9 }, { tap: 'fire', steps: 1 }, { steps: 40 }]);
    assert.deepEqual((await shots()).slice(4), [t0 + 121], 'the click 10 ticks into the cycle was dropped');
  } finally { await game.close(); }
});

test('fire: the camera kicks 2.5 degrees, peaks near 55 ms and is back on the aim point by 0.33 s; six shots at the cadence all land on the aim', async () => {
  const game = await sandbox(srv, 'range');
  try {
    const aim = [12.5, -3.25];
    const want = dirOf(...aim);
    /** the direction the CAMERA looks, after drawing the frame of this tick */
    const cameraDir = () => game.page.evaluate(() => {
      window.__dbg.step(0, true);
      const e = window.__dbg.ext.core.ctx().scene.camera.matrixWorld.elements;
      return [-e[8], -e[9], -e[10]];
    });
    await game.run([{ aim, steps: 1 }]);
    assert.ok(angleDeg(await cameraDir(), want) < 1e-3, 'before the shot the camera is on the aim');
    await game.dbg('tap', 'fire');
    const curve = [];
    for (let t = 0; t <= 20; t++) {
      await game.step(1);
      const k = await ext(game, 'player', 'kick');
      curve.push({ t, pitch: k.pitchDeg, yaw: k.yawDeg, off: angleDeg(await cameraDir(), want) });
    }
    const peak = curve.reduce((a, b) => (b.pitch > a.pitch ? b : a));
    assert.ok(curve[0].pitch > 1, `the kick starts on the click's tick (${curve[0].pitch})`);
    assert.ok(peak.pitch > 2.4 && peak.pitch <= 2.5, `peak ${peak.pitch} degrees`);
    assert.ok(peak.t >= 2 && peak.t <= 3, `peak at tick ${peak.t} (55 ms is between ticks 2 and 3 after the click)`);
    assert.ok(Math.abs(peak.yaw) <= 0.4 + 1e-6, `yaw kick ${peak.yaw} within 0.4 degrees`);
    assert.ok(Math.abs(curve[2].off - Math.hypot(curve[2].pitch, curve[2].yaw * Math.cos(aim[1] * Math.PI / 180))) < 0.02, 'the camera really shows the kick');
    // tick 19 after the click's tick is 0.333 s after the click
    assert.ok(curve[19].off < 0.05, `0.33 s after the click the camera is ${curve[19].off} degrees off the aim`);
    assert.equal(curve[19].pitch, 0);
    assert.equal(curve[20].off < 1e-3, true, 'and exactly on it after');
    const st = await game.state();
    assert.deepEqual([st.player.yawDeg, st.player.pitchDeg], aim, 'the stored aim never moved');
    // six shots at the cadence (the first is already fired): every one leaves along the aim
    await game.dbg('setAmmo', 6, 24, 0);
    const seq = await lastSeq(game);
    for (let i = 0; i < 6; i++) await game.run([{ tap: 'fire', steps: 29 }]);
    const fired = await eventsSince(game, seq, 'weapon/fired');
    assert.equal(fired.length, 6);
    for (const f of fired) assert.ok(angleDeg([f.payload.dx, f.payload.dy, f.payload.dz], want) < 0.01, 'within 0.01 degrees of the aim');
    assert.deepEqual(fired.map((f) => f.tick - fired[0].tick), [0, 29, 58, 87, 116, 145]);
    assert.equal(await ext(game, 'player', 'spreadDeg') < 1.5 + 1e-6, true);
    // reduce motion: the recoil stays (it is the gun), the FOV punch and the trauma request do not
    await game.dbg('setOption', 'reduceMotion', true);
    await game.dbg('setAmmo', 6, 24, 0);
    const callsBefore = (await ext(game, 'range', 'renderCalls')).filter((c) => c.startsWith('addTrauma')).length;
    await game.run([{ tap: 'fire', steps: 2 }]);
    const k = await ext(game, 'player', 'kick');
    assert.ok(k.pitchDeg > 1 && k.fovDeg === 0, `reduce motion: kick ${k.pitchDeg}, fov ${k.fovDeg}`);
    assert.equal((await ext(game, 'range', 'renderCalls')).filter((c) => c.startsWith('addTrauma')).length, callsBefore, 'no trauma request under reduce motion');
  } finally { await game.close(); }
});

test('each HitOutcome of the range reaches combat/hit unchanged; a grille deflects with a ricochet; the sky is a miss with a far end', async () => {
  const game = await sandbox(srv, 'range');
  try {
    // (setAmmo makes the gun ready at once; the 25 ticks between shots let the bloom of the last one decay: a shot
    // 2 ticks after another is 1.5 degrees wide, which this test met before it waited)
    for (const outcome of OUTCOMES) {
      await game.dbg('setAmmo', 6, 24, 0);
      const seq = await lastSeq(game);
      await game.run([{ aimAtEntity: 'dummy_' + outcome, tap: 'fire', steps: 25 }]);
      const hits = (await eventsSince(game, seq, 'combat/hit')).map((e) => e.payload);
      assert.equal(hits[0].outcome, outcome, `dummy_${outcome}`);
      assert.equal(hits[0].entityId, 'dummy_' + outcome);
      if (outcome === 'passed') {
        // no body to hit: the round goes on and strikes the world behind (GDD 6.7)
        assert.equal(hits.length, 2);
        assert.deepEqual([hits[1].outcome, hits[1].entityKind, hits[1].order], ['impact', 'world', 1]);
        const fired = (await eventsSince(game, seq, 'weapon/fired'))[0].payload;
        assert.ok(Math.abs(fired.endZ - hits[1].z) < 1e-3, 'weapon/fired ends at the wall behind');
      } else assert.equal(hits.length, 1, `one combat/hit for ${outcome}`);
    }
    // the grille: static geometry with ColFlag.GRILLE, no receiver
    await game.dbg('setAmmo', 6, 24, 0);
    let seq = await lastSeq(game);
    await game.run([{ aimAt: [OX - 12, OY + 1.2, OZ - 8], tap: 'fire', steps: 25 }]);
    let hit = (await eventsSince(game, seq, 'combat/hit'))[0].payload;
    const fired = (await eventsSince(game, seq, 'weapon/fired'))[0].payload;
    assert.deepEqual([hit.outcome, hit.surface, hit.entityKind], ['deflected', 'metal', 'world']);
    assert.ok(Math.abs(hit.nz - 1) < 1e-6, 'its face looks at her (+Z)');
    assert.ok(Math.abs(hit.ricochetX - fired.dx) < 1e-6 && Math.abs(hit.ricochetY - fired.dy) < 1e-6 && Math.abs(hit.ricochetZ + fired.dz) < 1e-6, 'the ricochet is the direction mirrored in the face');
    // every surface patch is an impact on that surface
    for (const [i, surface] of ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth'].entries()) {
      await game.dbg('setAmmo', 6, 24, 0);
      seq = await lastSeq(game);
      await game.run([{ aimAt: [OX - 6 + i * 2, OY + 1.7, OZ - 16], tap: 'fire', steps: 25 }]);
      hit = (await eventsSince(game, seq, 'combat/hit'))[0].payload;
      assert.deepEqual([hit.outcome, hit.surface], ['impact', surface]);
    }
    // the sky: weapon/fired with the end at range, no combat/hit
    await game.dbg('setAmmo', 6, 24, 0);
    seq = await lastSeq(game);
    await game.run([{ aim: [0, 60], tap: 'fire', steps: 2 }]);
    const sky = (await eventsSince(game, seq, 'weapon/fired'))[0].payload;
    assert.equal((await eventsSince(game, seq, 'combat/hit')).length, 0);
    assert.ok(Math.abs(Math.hypot(sky.endX - sky.ox, sky.endY - sky.oy, sky.endZ - sky.oz) - 200) < 1e-3, 'a miss ends 200 m out');
    // bloom: a shot forced 2 ticks after another leaves up to 1.5 degrees off the aim (seeded), never more
    await game.run([{ steps: 30 }, { call: ['setAmmo', 6, 24, 0] }, { aim: [0, 60], tap: 'fire', steps: 2 }, { call: ['setAmmo', 6, 24, 0] }]);
    assert.ok(Math.abs(await ext(game, 'player', 'spreadDeg') - (1.5 - 1.5 / 0.35 / 60)) < 1e-3, 'bloom 1.5 degrees per shot, decaying over 0.35 s');
    seq = await lastSeq(game);
    await game.run([{ tap: 'fire', steps: 1 }]);
    const wide = (await eventsSince(game, seq, 'weapon/fired'))[0].payload;
    const off = angleDeg([wide.dx, wide.dy, wide.dz], dirOf(0, 60));
    assert.ok(off > 0 && off <= 1.5, `a bloomed shot is ${off.toFixed(3)} degrees off the aim`);
  } finally { await game.close(); }
});

test('reload through the input path: a dry click on empty has its beat of 7 ticks, then the reload opens; 2.45 s from there, fire interrupts within 0.50 s, sprinting is allowed', async () => {
  const game = await sandbox(srv, 'range');
  try {
    await game.dbg('setAmmo', 0, 24, 0);
    let seq = await lastSeq(game);
    let s = await game.run([{ tap: 'fire', steps: 1 }]);
    // polish round 4 (combat critic): the click is alone on its tick, the hammer stays down for 7 ticks (`dry_fire` clip,
    // weapon ready), then the reload opens by itself
    assert.deepEqual((await eventsSince(game, seq)).map((e) => e.name), ['weapon/dry_fire']);
    assert.equal(s.player.phase, 'ready');
    assert.equal((await ext(game, 'player', 'viewModel')).clip, 'dry_fire');
    const click = s.tick;
    s = await game.run([{ steps: 6 }]);
    assert.equal(s.player.phase, 'ready', 'six ticks after the click the gun has not opened');
    assert.equal((await ext(game, 'player', 'viewModel')).clip, 'dry_fire');
    s = await game.run([{ steps: 1 }]);
    assert.equal(s.player.phase, 'reload_open');
    assert.deepEqual((await eventsSince(game, seq)).filter((e) => /^weapon\/(dry_fire|reload)$/.test(e.name)).map((e) => [e.name, e.tick - click]), [['weapon/dry_fire', 0], ['weapon/reload', 7]]);
    const t0 = s.tick;
    const done = await game.until({ path: 'player.phase', op: '==', value: 'ready' }, 400);
    assert.ok(done.met);
    const seconds = (done.tick - t0) * DT;
    assert.ok(Math.abs(seconds - 2.45) <= 0.05, `full reload from empty took ${seconds.toFixed(3)} s`);
    s = await game.state();
    assert.deepEqual([s.player.chambered, s.player.reserve], [6, 18]);
    const stages = (await eventsSince(game, seq, 'weapon/reload')).map((e) => e.payload.stage);
    assert.deepEqual(stages, ['open', 'round', 'round', 'round', 'round', 'round', 'round', 'close']);
    // R with a partial cylinder, then fire in the middle of it: a shot within 0.50 s
    await game.dbg('setAmmo', 2, 24, 0);
    seq = await lastSeq(game);
    await game.run([{ tap: 'reload', steps: 1 }, { steps: 21 }]);       // tick 21 after R: the first round begins
    s = await game.run([{ tap: 'fire', steps: 1 }]);
    const pressed = s.tick;
    const shot = await game.until({ event: 'weapon/fired' }, 40);
    assert.ok(shot.met, 'a shot came');
    assert.ok((shot.tick - pressed) * DT <= 0.5 + 1e-9, `fire during reload: a shot ${((shot.tick - pressed) * DT).toFixed(3)} s after the press`);
    assert.ok((await eventsSince(game, seq, 'weapon/reload')).some((e) => e.payload.stage === 'fast_close'));
    // reload while sprinting keeps the sprint; firing cancels it
    await game.dbg('setAmmo', 3, 24, 0);
    await room(game, [FLOOR], [0, 0, 40], 0);
    await game.run([{ actions: ['forward', 'sprint'], steps: 40 }, { tap: 'reload', steps: 20 }]);
    s = await game.state();
    assert.equal(s.player.sprinting, true, 'still sprinting while reloading');
    assert.ok(Math.abs(Math.hypot(s.player.vx, s.player.vz) - 6.75) < 1e-3, 'at 6.75 m/s');
    assert.ok(s.player.phase.startsWith('reload'));
    await game.run([{ call: ['setAmmo', 6, 24, 0] }, { steps: 10 }, { tap: 'fire', steps: 8 }]);
    s = await game.state();
    assert.equal(s.player.sprinting, false, 'firing cancels the sprint');
    assert.ok(Math.hypot(s.player.vx, s.player.vz) < 6.0, `slowing to a run (${Math.hypot(s.player.vx, s.player.vz).toFixed(2)} m/s)`);
    await game.run([{ steps: 40 }]);
    s = await game.state();
    assert.equal(s.player.sprinting, true, 'the held sprint comes back when the cycle is over');
    await game.run([{ actions: [], steps: 1 }]);
  } finally { await game.close(); }
});

test('line round: Q loads it under the hammer in 0.55 s; through five PIERCE plates and a body it gives six hits 40 ms apart, then line_resolved', async () => {
  const game = await sandbox(srv, 'range');
  try {
    assert.equal(await ext(game, 'range', 'give', 'line', 2), 2);
    let seq = await lastSeq(game);
    let s = await game.run([{ tap: 'line', steps: 1 }]);
    const q = s.tick;
    assert.equal(s.player.phase, 'loading_line');
    const loaded = await game.until({ event: 'weapon/line', where: { stage: 'loaded' } }, 60);
    assert.equal(loaded.tick - q, 33, 'load_line is 0.55 s');
    s = await game.state();
    assert.deepEqual(s.player.cylinder, ['line', 'lead', 'lead', 'lead', 'lead', 'lead']);
    assert.deepEqual([s.player.reserve, s.player.lineRounds], [25, 1], 'the displaced lead round went to the reserve');
    // unload again: 0.35 s, back to the carry
    s = await game.run([{ tap: 'line', steps: 1 }]);
    const u = await game.until({ event: 'weapon/line', where: { stage: 'unloaded' } }, 60);
    assert.equal(u.tick - s.tick, 21, 'unload_line is 0.35 s');
    assert.equal((await game.state()).player.lineRounds, 2);
    // load and fire down the plate lane (x = 12): plates at z -6 .. -10, the body at -11.5 (it stops the line here)
    await game.run([{ tap: 'line', steps: 34 }]);
    seq = await lastSeq(game);
    await game.run([{ call: ['teleport', OX + 12, OY, OZ + 2, 0, 0] }, { aimAtEntity: 'body_behind_plates', tap: 'fire', steps: 1 }]);
    const fired = (await eventsSince(game, seq, 'weapon/fired'))[0];
    assert.equal(fired.payload.ammo, 'line_round');
    await game.step(20);
    const hits = await eventsSince(game, seq, 'combat/hit');
    assert.deepEqual(hits.map((h) => h.payload.order), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(hits.map((h) => h.tick - fired.tick), [0, 2, 5, 7, 10, 12], 'entry i at tick offset round(i x 2.4)');
    assert.deepEqual(hits.map((h) => h.payload.outcome), ['impact', 'impact', 'impact', 'impact', 'impact', 'freed']);
    assert.deepEqual(hits.slice(0, 5).map((h) => h.payload.surface), ['ceramic', 'ceramic', 'ceramic', 'ceramic', 'ceramic']);
    assert.deepEqual([hits[5].payload.entityId, hits[5].payload.damage, hits[5].payload.ammo], ['body_behind_plates', 300, 'line_round']);
    const resolved = await eventsSince(game, seq, 'combat/line_resolved');
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].tick - fired.tick, 12, 'resolved with the last hit');
    assert.deepEqual([resolved[0].payload.bodies, resolved[0].payload.freed, resolved[0].payload.knots, resolved[0].payload.shotId], [1, 1, 0, fired.payload.shotId]);
    assert.ok(Math.abs(resolved[0].payload.endZ - hits[5].payload.z) < 1e-3);
    assert.deepEqual((await ext(game, 'range', 'report')).body_behind_plates, { hits: 1, amount: 300, ammo: 'line_round' });
    assert.ok((await ext(game, 'range', 'renderCalls')).includes('vfx.muzzleFlash:line'));
  } finally { await game.close(); }
});

test('line round: it passes bodies and stops at an untagged wall; it ends at 60 m; a body gone before its turn is skipped', async () => {
  const game = await sandbox(srv, 'room');
  try {
    // a lane of three bodies 2 m apart, then a wall 12 m away; no ceiling
    await room(game, [FLOOR, { shape: 'box', pos: [0, 2, -12.25], size: [10, 5, 0.5], rotY: 0, surface: 'adobe', role: 'wall' }], [0, 0, 0], 0);
    for (const [i, outcome] of ['freed', 'kill', 'broke'].entries()) await ext(game, 'range', 'dummy', 'lane_' + i, outcome, 0, 1.65, -3 - 2 * i);
    await ext(game, 'range', 'give', 'line', 2);
    await game.run([{ steps: 31 }, { aim: [0, 0], tap: 'line', steps: 34 }]);
    let seq = await lastSeq(game);
    await game.run([{ tap: 'fire', steps: 1 }]);
    await ext(game, 'range', 'disable', 'lane_1');          // the second body is gone before its turn (2 ticks later)
    await game.step(12);
    let hits = (await eventsSince(game, seq, 'combat/hit')).map((h) => [h.payload.order, h.payload.entityId, h.payload.outcome]);
    assert.deepEqual(hits, [[0, 'lane_0', 'freed'], [2, 'lane_2', 'broke'], [3, '', 'impact']]);
    let resolved = (await eventsSince(game, seq, 'combat/line_resolved'))[0].payload;
    assert.deepEqual([resolved.bodies, resolved.freed, resolved.knots], [1, 1, 1]);
    assert.ok(Math.abs(resolved.endZ - (ORIGIN[2] - 12)) < 1e-3, 'the line ends on the wall');
    const fired = (await eventsSince(game, seq, 'weapon/fired'))[0].payload;
    assert.ok(Math.abs(fired.endZ - (ORIGIN[2] - 12)) < 1e-3, 'and weapon/fired carried that end on the tick of the click');
    assert.deepEqual((await ext(game, 'range', 'report')).lane_1, { hits: 0, amount: 0, ammo: '' });
    // into the sky: nothing on the line, the end 60 m out, resolved at once
    await game.run([{ steps: 30 }, { tap: 'line', steps: 34 }]);
    seq = await lastSeq(game);
    await game.run([{ aim: [0, 50], tap: 'fire', steps: 1 }]);
    const sky = (await eventsSince(game, seq, 'weapon/fired'))[0].payload;
    assert.ok(Math.abs(Math.hypot(sky.endX - sky.ox, sky.endY - sky.oy, sky.endZ - sky.oz) - 60) < 1e-3, 'the line ends at 60 m');
    assert.equal((await eventsSince(game, seq, 'combat/hit')).length, 0);
    resolved = (await eventsSince(game, seq, 'combat/line_resolved'))[0].payload;
    assert.deepEqual([resolved.bodies, resolved.freed, resolved.knots], [0, 0, 0]);
    assert.equal((await game.state()).player.lineRounds, 0);
  } finally { await game.close(); }
});

test('hold to fire through the input path: the held trigger gives one dry click on the empty cylinder, the reload runs to full, firing resumes', async () => {
  const game = await sandbox(srv, 'range');
  try {
    await game.dbg('setOption', 'fireMode', 'hold');
    await game.dbg('setAmmo', 6, 12, 0);
    const seq = await lastSeq(game);
    const s0 = await game.run([{ aim: [0, 0], steps: 1 }]);
    await game.run([{ actions: ['fire'], steps: 520 }]);
    const t0 = s0.tick + 1;
    const fired = (await eventsSince(game, seq, 'weapon/fired')).map((e) => e.tick - t0);
    const dry = (await eventsSince(game, seq, 'weapon/dry_fire')).map((e) => [e.tick - t0, e.payload.reason]);
    assert.deepEqual(fired.slice(0, 6), [0, 29, 58, 87, 116, 145], 'six shots at the cadence');
    assert.deepEqual(dry[0], [174, 'empty'], 'one dry click on the first tick the empty gun is ready');
    assert.equal(fired[6], 174 + 7 + 147, 'the reload opened a beat (7 ticks) after that click and ran its 2.45 s; the held trigger fires again');
    assert.equal(dry.filter((d) => d[0] < 174 + 7 + 147).length, 1, 'exactly one dry click per empty cylinder');
    const stages = (await eventsSince(game, seq, 'weapon/reload')).filter((e) => e.tick - t0 < 174 + 7 + 147).map((e) => e.payload.stage);
    assert.deepEqual(stages, ['open', 'round', 'round', 'round', 'round', 'round', 'round', 'close'], 'the held trigger did not interrupt the reload');
    await game.run([{ actions: [], steps: 1 }]);
    await game.dbg('setOption', 'fireMode', 'click');
  } finally { await game.close(); }
});

test('the trigger is live when control comes back: a click at any moment of the 0.5 s draw fires on the first ready tick', async () => {
  const game = await sandbox(srv, 'range');
  try {
    for (const click of [1, 10, 25]) {
      await game.dbg('setAmmo', 6, 24, 0);
      await ext(game, 'range', 'control', false, 'ride');
      await game.run([{ aim: [0, 0], steps: 5 }]);
      await ext(game, 'range', 'control', true, 'ride_over');
      const seq = await lastSeq(game);
      const s0 = await game.run([{ steps: 1 }]);
      assert.equal(s0.player.phase, 'drawing');
      await game.run([{ steps: click - 1 }, { tap: 'fire', steps: 1 }, { steps: 40 }]);
      const fired = (await eventsSince(game, seq, 'weapon/fired')).map((e) => e.tick - s0.tick);
      assert.deepEqual(fired, [29], `a click ${click + 1} ticks into the draw: one shot, on the tick the draw ends`);
    }
  } finally { await game.close(); }
});

test('round bookkeeping: Q, Q is a no-op; Q on every tick never drains the cylinder; with the reserve at 36 nothing is discarded', async () => {
  const game = await sandbox(srv, 'range');
  try {
    const counts = async () => { const s = await game.state(); const x = await ext(game, 'player', 'extra'); return { cyl: s.player.cylinder.join(','), reserve: s.player.reserve, line: s.player.lineRounds, spare: x.spare, discarded: x.discarded, phase: s.player.phase }; };
    const SIX = 'lead,lead,lead,lead,lead,lead';
    await game.dbg('setAmmo', 6, 24, 1);
    await game.run([{ tap: 'line', steps: 34 }]);
    assert.deepEqual(await counts(), { cyl: 'line,lead,lead,lead,lead,lead', reserve: 25, line: 0, spare: 0, discarded: 0, phase: 'ready' });
    await game.run([{ tap: 'line', steps: 22 }]);
    assert.deepEqual(await counts(), { cyl: SIX, reserve: 24, line: 1, spare: 0, discarded: 0, phase: 'ready' }, 'load then unload: exactly as before');
    // Q held down like a nervous thumb: 300 presses
    await game.page.evaluate(async () => { const d = window.__dbg; for (let i = 0; i < 300; i++) { d.tap('line'); await d.ext.core.stepAsync(1); } });
    await game.until({ path: 'player.phase', op: '==', value: 'ready' }, 60);
    let c = await counts();
    if (c.cyl.startsWith('line')) { await game.run([{ tap: 'line', steps: 22 }]); c = await counts(); }
    assert.deepEqual([c.cyl, c.reserve, c.line], [SIX, 24, 1], 'no round moved by toggling');
    // the reserve at its cap: the displaced round is kept in hand, and comes back
    await game.dbg('setAmmo', 6, 36, 1);
    await game.run([{ tap: 'line', steps: 34 }]);
    assert.deepEqual(await counts(), { cyl: 'line,lead,lead,lead,lead,lead', reserve: 36, line: 0, spare: 1, discarded: 0, phase: 'ready' });
    await game.run([{ aim: [0, 30], tap: 'fire', steps: 30 }, { tap: 'reload', steps: 60 }]);
    assert.deepEqual(await counts(), { cyl: SIX, reserve: 36, line: 0, spare: 0, discarded: 0, phase: 'ready' }, 'the line round fired, one lead seated from 36, the round in hand back in the reserve');
  } finally { await game.close(); }
});
