// The body and the camera through the sandbox page and the real input path (code-player order 6: Movement, Ledges and
// jumps against the engine). GDD 5, GDD 21 test 1, game-feel 9, ARCHITECTURE 6. The same cases run against the bare
// controller in tests/player/movement.spec.ts; here they go through input, the loop and the page.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, FLOOR, ORIGIN, eventsSince, ext, lastSeq, me, room, sandbox, server } from './common.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });
const [OX, OY, OZ] = ORIGIN;
const speedOf = (p) => Math.hypot(p.vx, p.vz);
/** run a script and return per-tick samples of the player: [{ x, y, z, vx, vy, vz, grounded }] */
const trace = (game, actions, ticks, taps = {}) => game.page.evaluate(async ([a, n, t]) => {
  const dbg = window.__dbg, out = [];
  dbg.setActions(a);
  for (let i = 0; i < n; i++) {
    if (t[i]) dbg.tap(t[i]);
    await dbg.ext.core.stepAsync(1);
    const p = dbg.player();
    out.push({ x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, grounded: p.grounded, sprinting: p.sprinting });
  }
  dbg.setActions([]);
  return out;
}, [actions, ticks, taps]);

test('movement: 4.5 m/s within 0.13 s, stopped within 0.45 m, sprint 6.75 forward only, backward x0.9, footfalls every 1.9 / 2.3 m', async () => {
  const game = await sandbox(srv, 'room');
  try {
    await room(game, [FLOOR], [0, 0, 50], 0);
    let t = await trace(game, ['forward'], 8);
    assert.ok(speedOf(t[7]) >= 4.5, `after 0.133 s: ${speedOf(t[7]).toFixed(3)} m/s`);
    t = await trace(game, ['forward'], 40);
    assert.ok(Math.abs(speedOf(t.at(-1)) - 5.0) < 1e-3, 'run speed 5.0');
    const z0 = t.at(-1).z;
    t = await trace(game, [], 30);
    assert.equal(speedOf(t.at(-1)), 0);
    assert.ok(z0 - t.at(-1).z <= 0.45, `stopped within ${(z0 - t.at(-1).z).toFixed(3)} m`);
    // sprint: forward only
    t = await trace(game, ['forward', 'sprint'], 60);
    assert.ok(Math.abs(speedOf(t.at(-1)) - 6.75) < 1e-3 && t.at(-1).sprinting, 'sprint 6.75 m/s');
    await trace(game, [], 30);
    t = await trace(game, ['back', 'sprint'], 60);
    assert.ok(Math.abs(speedOf(t.at(-1)) - 4.5) < 1e-3 && !t.at(-1).sprinting, 'backward 4.5 m/s, never a sprint');
    await trace(game, [], 30);
    t = await trace(game, ['left', 'sprint'], 60);
    assert.ok(Math.abs(speedOf(t.at(-1)) - 5.0) < 1e-3 && !t.at(-1).sprinting, 'strafe 5.0 m/s, never a sprint');
    await trace(game, [], 30);
    // toggle mode: one press starts it, it ends when she stops going forward
    await game.dbg('setOption', 'sprintMode', 'toggle');
    t = await trace(game, ['forward'], 60, { 5: 'sprint' });
    assert.ok(t.at(-1).sprinting && Math.abs(speedOf(t.at(-1)) - 6.75) < 1e-3, 'toggle: sprinting after one press');
    await trace(game, [], 30);
    t = await trace(game, ['forward'], 40);
    assert.equal(t.at(-1).sprinting, false, 'toggle: off after stopping');
    await game.dbg('setOption', 'sprintMode', 'hold');
    await trace(game, [], 30);
    // footfalls: every 1.9 m at a run, 2.3 m at a sprint, with the ground's surface
    for (const [actions, stride, sprint] of [[['forward'], 1.9, false], [['forward', 'sprint'], 2.3, true]]) {
      await game.dbg('teleport', OX, OY, OZ + 50, 0, 0);
      await trace(game, actions, 40);
      const seq = await lastSeq(game);
      await trace(game, actions, 300);
      const steps = await eventsSince(game, seq, 'player/footstep');
      const gaps = steps.slice(1).map((e, i) => Math.hypot(e.payload.x - steps[i].payload.x, e.payload.z - steps[i].payload.z));
      assert.ok(gaps.length >= 8 && gaps.every((g) => Math.abs(g - stride) < 0.12), `footfalls ${stride} m apart: ${gaps.map((g) => g.toFixed(2))}`);
      assert.ok(steps.every((e) => e.payload.surface === 'stone' && e.payload.sprint === sprint));
      await trace(game, [], 30);
    }
  } finally { await game.close(); }
});

test('jump: apex 1.0 m, air time 0.58 s, events with the landing speed; coyote 0.10 s after a ledge; buffer 0.10 s before the ground', async () => {
  const game = await sandbox(srv, 'room');
  try {
    await room(game, [FLOOR, { shape: 'box', pos: [20, 1, 10], size: [4, 2, 20], rotY: 0, surface: 'wood', role: 'platform' }], [0, 0, 0], 0);
    const seq = await lastSeq(game);
    let t = await trace(game, [], 50, { 0: 'jump' });
    const apex = Math.max(...t.map((s) => s.y)) - OY;
    const air = t.findIndex((s, i) => i > 0 && s.grounded) + 1;
    assert.ok(Math.abs(apex - 1.0) <= 0.03, `apex ${apex.toFixed(3)} m`);
    assert.ok(Math.abs(air * DT - 0.58) <= 0.02, `air time ${(air * DT).toFixed(3)} s`);
    const jumped = await eventsSince(game, seq, 'player/jumped'), landed = await eventsSince(game, seq, 'player/landed');
    assert.equal(jumped.length, 1); assert.equal(landed.length, 1);
    assert.equal(landed[0].tick - jumped[0].tick, air - 1);
    assert.ok(landed[0].payload.speed > 6.5 && landed[0].payload.speed < 7.1 && landed[0].payload.surface === 'stone', `landed at ${landed[0].payload.speed} m/s`);
    // the buffer: a press 5 ticks before landing jumps on landing
    t = await trace(game, [], 80, { 0: 'jump', 29: 'jump' });
    assert.equal((await eventsSince(game, seq, 'player/jumped')).length, 3, 'the early press was kept and used on landing');
    // coyote: walk off the 2 m platform (its edge at z = 0), press jump 6 ticks (0.10 s) after leaving the ground
    for (const [late, ok] of [[6, true], [8, false]]) {
      await game.dbg('teleport', OX + 20, OY + 2, OZ + 1.5, 0, 0);
      await game.step(2);
      const s0 = await lastSeq(game);
      const left = await game.page.evaluate(async () => {
        const dbg = window.__dbg;
        dbg.setActions(['forward']);
        for (let i = 0; i < 120; i++) { await dbg.ext.core.stepAsync(1); if (!dbg.player().grounded) return i; }
        return -1;
      });
      assert.ok(left > 0, 'she walked off the ledge');
      await game.run([{ steps: late - 1 }, { tap: 'jump', steps: 1 }, { actions: [], steps: 60 }]);
      assert.equal((await eventsSince(game, s0, 'player/jumped')).length, ok ? 1 : 0, `a jump ${late} ticks after leaving the ledge is ${ok ? 'accepted' : 'refused'}`);
    }
  } finally { await game.close(); }
});

test('ledges against the engine: 0.35 m climbed and never more in one tick; 0.5 m not, at run and sprint speed; ramps of 45 degrees walked, 60 not', async () => {
  const game = await sandbox(srv, 'room');
  try {
    const step = (x, h) => ({ shape: 'box', pos: [x, h / 2, -24], size: [3, h, 40], rotY: 0, surface: 'metal', role: 'platform' });
    const rampAt = (x, deg) => { const rise = 3 * Math.tan(deg * Math.PI / 180); return [
      { shape: 'ramp', pos: [x, rise / 2, -5.5], size: [3, rise, 3], rotY: 0, surface: 'wood', role: 'stairs', rise: '-z', skirt: 0 },
      { shape: 'box', pos: [x, rise / 2, -27], size: [3, rise, 40], rotY: 0, surface: 'wood', role: 'platform' }]; };
    await room(game, [FLOOR, step(0, 0.35), step(5, 0.5), step(10, 0.2), ...rampAt(20, 45), ...rampAt(30, 60), ...rampAt(40, 30)], [0, 0, 0], 0);
    const climb = async (x, actions, taps = {}) => {
      await game.dbg('teleport', OX + x, OY, OZ, 0, 0);
      await game.step(2);
      const t = await trace(game, actions, 150, taps);
      let worst = 0;
      for (let i = 1; i < t.length; i++) worst = Math.max(worst, t[i].y - t[i - 1].y);
      return { y: t.at(-1).y - OY, z: t.at(-1).z - OZ, worst, grounded: t.at(-1).grounded, air: t.filter((s) => !s.grounded).length };
    };
    for (const actions of [['forward'], ['forward', 'sprint']]) {
      let r = await climb(0, actions);
      assert.ok(Math.abs(r.y - 0.35) < 0.01 && r.z < -6 && r.grounded, `${actions}: the 0.35 m step is climbed (${JSON.stringify(r)})`);
      assert.ok(r.worst <= 0.35 + 0.021, `${actions}: the height gained in one tick is ${r.worst.toFixed(3)} m`);
      r = await climb(10, actions);
      assert.ok(Math.abs(r.y - 0.2) < 0.01 && r.z < -6, `${actions}: the 0.2 m step is climbed`);
      r = await climb(5, actions);
      assert.ok(r.y < 0.02 && r.z > -4 + 0.35 - 0.02 && r.worst < 0.02, `${actions}: the 0.5 m step is not climbed (${JSON.stringify(r)})`);
    }
    let r = await climb(5, ['forward'], { 30: 'jump' });
    assert.ok(Math.abs(r.y - 0.5) < 0.01, 'with a jump the 0.5 m step is cleared');
    r = await climb(20, ['forward']);
    assert.ok(Math.abs(r.y - 3) < 0.05 && r.grounded, `the 45 degree ramp is walked (${JSON.stringify(r)})`);
    assert.equal(r.air, 0, 'on the ground all the way up');
    r = await climb(40, ['forward']);
    assert.ok(Math.abs(r.y - 3 * Math.tan(Math.PI / 6)) < 0.05 && r.air === 0, 'the 30 degree ramp is walked');
    r = await climb(30, ['forward', 'sprint']);
    assert.ok(r.y < 0.3 && r.z > -4.7, `the 60 degree ramp is a wall (${JSON.stringify(r)})`);
  } finally { await game.close(); }
});

test('jumps against the engine: a 1.2 m box and 1.3 m cover are not mountable, a 0.9 m box is; the hatch stair never lifts her onto the slab; no tunnelling at 60 m/s', async () => {
  const game = await sandbox(srv, 'room');
  try {
    const box = (x, h) => ({ shape: 'box', pos: [x, h / 2, -6], size: [3, h, 4], rotY: 0, surface: 'wood', role: 'cover', low: true });
    await room(game, [FLOOR, box(0, 1.2), box(6, 0.9), box(12, 1.3), { shape: 'box', pos: [30, 1.5, -3], size: [10, 3, 0.05], rotY: 0, surface: 'metal', role: 'wall' }], [0, 0, 0], 0);
    for (const [x, h, mount] of [[0, 1.2, false], [12, 1.3, false], [6, 0.9, true]]) {
      let best = 0, onTop = false;
      for (const sprint of [false, true]) {
        for (let jumpAt = 0; jumpAt <= 60; jumpAt += 4) {
          await game.dbg('teleport', OX + x, OY, OZ, 0, 0);
          await game.step(2);
          const t = await trace(game, sprint ? ['forward', 'sprint'] : ['forward'], 110, { [jumpAt]: 'jump', [jumpAt + 36]: 'jump', [jumpAt + 37]: 'jump' });
          best = Math.max(best, ...t.map((s) => s.y - OY));
          if (t.some((s) => s.grounded && s.y - OY > h - 0.02)) onTop = true;
        }
      }
      if (mount) assert.ok(onTop, `the ${h} m box is mounted by a jump`);
      else { assert.equal(onTop, false, `the ${h} m box is never mounted`); assert.ok(best <= 1.0 + 0.03, `the highest her feet got beside the ${h} m box: ${best.toFixed(3)} m`); }
    }
    // a forced 60 m/s into a 5 cm wall: she stops at it
    await game.dbg('teleport', OX + 30, OY, OZ, 0, 0);
    await game.step(2);
    await game.page.evaluate(async () => { const dbg = window.__dbg; for (let i = 0; i < 20; i++) { dbg.ext.player.setVelocity(0, 0, -60); await dbg.ext.core.stepAsync(1); } });
    let s = await game.state();
    assert.ok(s.player.z - OZ > -3 + 0.35 - 0.03, `60 m/s did not carry her through the wall (z ${(s.player.z - OZ).toFixed(3)})`);
    assert.ok(await ext(game, 'core', 'capsuleFree', s.player.x, s.player.y + 0.01, s.player.z, 0.35, 1.8), 'and she is not inside it');
    // the hatch stair: a 33.7 degree stair beside a 0.3 m floor slab, open underneath (tests/core/sandbox.test.mjs STEP_ROOM)
    await room(game, [FLOOR,
      { shape: 'ramp', pos: [-14, 2, -6], size: [2, 4, 6], rotY: 0, surface: 'wood', role: 'stairs', rise: '-z', skirt: 0 },
      { shape: 'box', pos: [-11, 1.85, -6], size: [4, 0.3, 6], rotY: 0, surface: 'wood', role: 'floor' }], [-14, 0, -2], 0);
    for (let stop = -3.5; stop >= -8.5; stop -= 0.5) {
      await game.dbg('teleport', OX - 14, OY, OZ - 2, 0, 0);
      await game.step(2);
      const res = await game.page.evaluate(async ([z, oy]) => {
        const dbg = window.__dbg;
        dbg.setActions(['forward']);
        for (let i = 0; i < 200 && dbg.player().z > z; i++) await dbg.ext.core.stepAsync(1);
        const y0 = dbg.player().y - oy;
        dbg.setAim(-90, 0);                                 // turn right, toward the slab
        let worst = 0, last = dbg.player().y;
        for (let i = 0; i < 90; i++) { await dbg.ext.core.stepAsync(1); const y = dbg.player().y; worst = Math.max(worst, y - last); last = y; }
        dbg.setActions([]);
        return { y0, y: dbg.player().y - oy, worst };
      }, [OZ + stop, OY]);
      assert.ok(res.worst <= 0.35 + 0.021, `from the stair at ${res.y0.toFixed(2)} m: the largest rise in a tick was ${res.worst.toFixed(3)} m`);
      if (res.y0 < 2 - 0.35 - 0.03) assert.ok(res.y < 1.8, `from ${res.y0.toFixed(2)} m on the stair she is not on the slab (${res.y.toFixed(2)})`);
    }
  } finally { await game.close(); }
});

test('look, teleport and control: 0.07 degrees per count times sensitivity, invert Y, the pitch clamp; teleport snaps; setControl gates movement and the gun', async () => {
  const game = await sandbox(srv, 'room');
  try {
    await room(game, [FLOOR], [0, 0, 0], 0);
    let s = await game.run([{ aim: [0, 0], look: [100, 50], steps: 1 }]);
    assert.ok(Math.abs(s.player.yawDeg + 7) < 1e-3 && Math.abs(s.player.pitchDeg + 3.5) < 1e-3, `100 counts right, 50 down: yaw ${s.player.yawDeg}, pitch ${s.player.pitchDeg}`);
    await game.dbg('setOption', 'sensitivity', 2);
    await game.dbg('setOption', 'invertY', true);
    s = await game.run([{ aim: [0, 0], look: [-100, 50], steps: 1 }]);
    assert.ok(Math.abs(s.player.yawDeg - 14) < 1e-3 && Math.abs(s.player.pitchDeg - 7) < 1e-3, 'sensitivity x2, inverted Y');
    s = await game.run([{ look: [0, 300], steps: 1 }, { look: [0, 300], steps: 1 }, { look: [0, 300], steps: 1 }, { look: [0, 300], steps: 1 }]);
    assert.equal(s.player.pitchDeg, 89, 'the pitch stops at 89 degrees');
    await game.dbg('setOption', 'sensitivity', 1);
    await game.dbg('setOption', 'invertY', false);
    // the camera is hers: at the eye, on the aim, with the FOV option
    await game.dbg('setOption', 'fov', 70);
    const cam = await game.page.evaluate(() => { const d = window.__dbg; d.setAim(30, -10); d.step(1, true); const c = d.ext.core.ctx().scene.camera; const p = d.player(); return { y: c.position.y - p.y, x: c.position.x - p.x, fov: c.fov, rx: c.rotation.x * 180 / Math.PI, ry: c.rotation.y * 180 / Math.PI }; });
    assert.ok(Math.abs(cam.y - 1.65) < 1e-6 && Math.abs(cam.x) < 1e-6 && cam.fov === 70 && Math.abs(cam.rx + 10) < 1e-6 && Math.abs(cam.ry - 30) < 1e-6, JSON.stringify(cam));
    await game.dbg('setOption', 'fov', 62);
    // teleport: the next frame is drawn AT the new place (the interpolator is snapped), velocity zero, the aim set
    await game.run([{ actions: ['forward'], steps: 30 }]);
    const snap = await game.page.evaluate(([x, y, z]) => { const d = window.__dbg; d.teleport(x, y, z, 45, -20); const c = d.ext.core.ctx(); d.step(0, true); const p = d.player(); return { cx: c.scene.camera.position.x, cz: c.scene.camera.position.z, eye: { ...c.player.eye }, p }; }, [OX + 10, OY, OZ + 10]);
    assert.ok(Math.abs(snap.cx - (OX + 10)) < 1e-6 && Math.abs(snap.cz - (OZ + 10)) < 1e-6, 'the camera is at the new place at once');
    assert.deepEqual([snap.p.vx, snap.p.vz, snap.p.yawDeg, snap.p.pitchDeg, snap.p.grounded], [0, 0, 45, -20, true]);
    await game.run([{ actions: [], steps: 20 }]);
    // setControl(false): no movement, no shot; look stays; with lockLook it does not
    const seq = await lastSeq(game);
    await ext(game, 'range', 'control', false, 'ride');
    assert.deepEqual(await ext(game, 'core', 'playerExtra').then((x) => [x.control, x.controlReason]), [false, 'ride']);
    s = await game.run([{ aim: [0, 0], actions: ['forward'], tap: 'fire', steps: 10 }, { look: [100, 0], steps: 1 }]);
    assert.ok(Math.hypot(s.player.x - (OX + 10), s.player.z - (OZ + 10)) < 1e-3, 'no movement without control');
    assert.equal((await eventsSince(game, seq, 'weapon/fired')).length, 0, 'no shot without control');
    assert.ok(Math.abs(s.player.yawDeg + 7) < 1e-3, 'look still works');
    await ext(game, 'range', 'control', false, 'ending', true);
    s = await game.run([{ look: [100, 0], steps: 1 }]);
    assert.ok(Math.abs(s.player.yawDeg + 7) < 1e-3, 'lockLook: the view does not turn');
    await ext(game, 'range', 'control', true, 'ride_over');
    s = await game.run([{ steps: 1 }]);
    assert.equal(s.player.phase, 'drawing', 'the draw clip plays when control comes back');
    assert.deepEqual((await eventsSince(game, seq, 'player/control')).map((e) => [e.payload.enabled, e.payload.reason]), [[false, 'ride'], [true, 'ride_over']]);
    s = await game.run([{ steps: 30 }, { tap: 'fire', steps: 10 }, { actions: [], steps: 1 }]);
    assert.equal((await eventsSince(game, seq, 'weapon/fired')).length, 1);
    assert.ok(Math.hypot(s.player.x - (OX + 10), s.player.z - (OZ + 10)) > 2, 'she walks again');
  } finally { await game.close(); }
});

test('camera motion: sprint FOV +4 in 0.2 s, FOV punch 1.2 for 80 ms, bob 0.028 m scaled by the option, strafe roll 1 degree, landing dip, all off under reduce motion', async () => {
  const game = await sandbox(srv, 'room');
  try {
    await room(game, [FLOOR], [0, 0, 50], 0);
    const kick = () => ext(game, 'player', 'kick');
    const camera = () => game.page.evaluate(() => { const d = window.__dbg; d.step(0, true); const c = d.ext.core.ctx().scene.camera; return { fov: c.fov, y: c.position.y - d.player().y, roll: c.rotation.z * 180 / Math.PI }; });
    // sprint FOV: it opens when she is really above a run (measured speed), then +4 degrees in 0.2 s
    const began = await game.page.evaluate(async () => { const d = window.__dbg; d.setActions(['forward', 'sprint']); let n = 0; while (!d.player().sprinting && n < 30) { await d.ext.core.stepAsync(1); n++; } return { n, speed: Math.hypot(d.player().vx, d.player().vz), fov: d.ext.player.kick().fovDeg }; });
    assert.ok(began.n >= 3 && began.n <= 8 && began.speed > 5.2, `sprinting once above a run: after ${began.n} ticks at ${began.speed.toFixed(2)} m/s`);
    await game.run([{ actions: ['forward', 'sprint'], steps: 5 }]);
    let k = await kick();
    assert.ok(k.fovDeg > 1.5 && k.fovDeg < 2.5, `half way after 0.1 s: +${k.fovDeg}`);
    await game.run([{ steps: 7 }]);
    assert.equal((await kick()).fovDeg, 4, '+4 degrees 0.2 s after the sprint began');
    assert.equal((await camera()).fov, 66);
    // bob: within 0.028 m below the eye line, and it moves
    const ys = [];
    for (let i = 0; i < 40; i++) { await game.step(1); ys.push((await kick()).offsetY); }
    assert.ok(Math.min(...ys) >= -0.028 - 1e-6 && Math.max(...ys) <= 1e-6 && Math.min(...ys) < -0.02, `bob range ${Math.min(...ys)} .. ${Math.max(...ys)}`);
    await game.dbg('setOption', 'headBob', 0);
    await game.run([{ steps: 3 }]);
    assert.equal((await kick()).offsetY, 0, 'head bob 0 % stills the camera');
    await game.dbg('setOption', 'headBob', 1);
    await game.run([{ actions: [], steps: 40 }]);
    assert.equal((await kick()).fovDeg, 0, 'the FOV is back after the sprint');
    // FOV punch: +1.2 on the shot, gone 80 ms later
    await game.run([{ aim: [0, 30], tap: 'fire', steps: 1 }]);
    k = await kick();
    assert.equal(k.fovDeg, 1.2, `the full punch is drawn on the click's tick: ${k.fovDeg}`);
    assert.equal((await camera()).fov, 63.2);
    await game.run([{ steps: 4 }]);
    k = await kick();
    assert.ok(k.fovDeg > 0 && k.fovDeg < 0.3, `still decaying at 67 ms: ${k.fovDeg}`);
    await game.run([{ steps: 1 }]);
    assert.equal((await kick()).fovDeg, 0, 'the punch is over 80 ms after the click (the tick at 83 ms)');
    // strafe roll: 1 degree toward the strafe at full strafe speed
    await game.run([{ aim: [0, 0], actions: ['right'], steps: 60 }]);
    k = await kick();
    assert.ok(Math.abs(k.rollDeg + 1) < 0.02, `strafing right rolls right: ${k.rollDeg}`);
    assert.ok(Math.abs((await camera()).roll + 1) < 0.02);
    await game.run([{ actions: [], steps: 60 }]);
    assert.equal((await kick()).rollDeg, 0);
    // landing dip: 0.012 m per m/s, here a 1.0 m jump (6.9 m/s): 0.083 m, gone 0.22 s later
    await game.run([{ tap: 'jump', steps: 34 }]);
    const dips = [];
    for (let i = 0; i < 16; i++) { await game.step(1); dips.push((await kick()).offsetY); }
    const deepest = Math.min(...dips);
    assert.ok(deepest < -0.06 && deepest > -0.09, `landing dip ${deepest} m`);
    assert.equal(dips.at(-1), 0, 'recovered within 0.22 s');
    // reduce motion: none of it
    await game.dbg('setOption', 'reduceMotion', true);
    await game.run([{ actions: ['forward', 'sprint', 'right'], steps: 40 }]);
    k = await kick();
    assert.deepEqual([k.fovDeg, k.offsetY, k.rollDeg], [0, 0, 0], 'reduce motion: no FOV kick, no bob, no roll');
    await game.run([{ actions: [], steps: 1 }]);
  } finally { await game.close(); }
});

test('sprinting is measured, not asked for: pressed against a wall or steering a standing jump there is no sprint FOV, no sprint flag, no sprint clip', async () => {
  const game = await sandbox(srv, 'room');
  try {
    const WALL = { shape: 'box', pos: [0, 1.5, -3], size: [20, 3, 1], rotY: 0, surface: 'stone', role: 'wall' };
    await room(game, [FLOOR, WALL], [0, 0, -2.1], 0);        // her front 5 cm from the wall
    let seq = await lastSeq(game);
    const t = await trace(game, ['forward', 'sprint'], 60);
    const k = await ext(game, 'player', 'kick');
    assert.ok(t.every((x) => !x.sprinting), 'never sprinting against the wall');
    assert.ok(speedOf(t.at(-1)) < 0.01, `standing: ${speedOf(t.at(-1))} m/s`);
    assert.equal(k.fovDeg, 0, 'no sprint FOV standing against a wall');
    const sprintSteps = (await eventsSince(game, seq, 'player/footstep')).filter((e) => e.payload.sprint);
    assert.equal(sprintSteps.length, 0);
    assert.notEqual((await ext(game, 'player', 'viewModel')).clip, 'sprint', 'the gun stays in its idle pose');
    // a standing jump steered forward with sprint held: 2.5 m/s in the air is not a sprint
    await room(game, [FLOOR], [0, 0, 30], 0);
    const j = await trace(game, ['forward', 'sprint'], 20, { 0: 'jump' });
    assert.ok(j.slice(0, 15).every((x) => !x.sprinting), 'not sprinting in a standing jump');
    // and a real sprint still is one, in the open and through a sprint jump
    await room(game, [FLOOR], [0, 0, 30], 0);
    const r = await trace(game, ['forward', 'sprint'], 70, { 40: 'jump' });
    assert.equal(r[39].sprinting, true);
    assert.ok(Math.abs(speedOf(r[39]) - 6.75) < 1e-3);
    assert.ok(r.slice(40, 70).every((x) => x.sprinting), 'a sprint jump keeps the sprint (no FOV pump in the air)');
    assert.equal((await ext(game, 'player', 'viewModel')).clip, 'sprint');
  } finally { await game.close(); }
});

test('look turns the view only while the game runs: counts that arrive during a pause are drained, not applied and not saved up', async () => {
  const game = await sandbox(srv, 'room');
  try {
    await room(game, [FLOOR], [0, 0, 0], 0);
    await game.run([{ aim: [10, -5], steps: 1 }]);
    await game.dbg('pause', true);
    assert.equal((await game.state()).game, 'paused');
    const paused = await game.page.evaluate(() => { const d = window.__dbg; d.look(200, 80); d.step(3, true); const c = d.ext.core.ctx().scene.camera; return { yaw: d.player().yawDeg, pitch: d.player().pitchDeg, ry: c.rotation.y * 180 / Math.PI }; });
    assert.deepEqual([paused.yaw, paused.pitch], [10, -5], 'the aim does not move behind a readable or the menu');
    assert.ok(Math.abs(paused.ry - 10) < 1e-6, 'nor does the camera');
    await game.dbg('pause', false);
    let s = await game.run([{ steps: 2 }]);
    assert.deepEqual([s.player.yawDeg, s.player.pitchDeg], [10, -5], 'the counts of the pause are gone: no jump when play resumes');
    s = await game.run([{ look: [100, 0], steps: 1 }]);
    assert.ok(Math.abs(s.player.yawDeg - 3) < 1e-3, 'look works again');
  } finally { await game.close(); }
});

test('walking down ramps of 37 and 45 degrees at a run and at a sprint she never leaves the ground: no flight over the crest, no landing', async () => {
  const game = await sandbox(srv, 'room');
  try {
    for (const deg of [36.9, 45]) {
      for (const sprint of [false, true]) {
        const rise = 3 * Math.tan((deg * Math.PI) / 180);
        const RAMP = { shape: 'ramp', pos: [0, rise / 2, -5.5], size: [4, rise, 3], rise: '-z', skirt: 0, rotY: 0, surface: 'stone', role: 'stairs' };
        const TOP = { shape: 'box', pos: [0, rise / 2, -17], size: [4, rise, 20], rotY: 0, surface: 'stone', role: 'platform' };
        await room(game, [FLOOR, RAMP, TOP], [0, rise, -10], 180);
        const seq = await lastSeq(game);
        const t = await trace(game, sprint ? ['forward', 'sprint'] : ['forward'], 110);
        const air = t.filter((x) => !x.grounded).length;
        assert.equal(air, 0, `${deg} degrees, ${sprint ? 'sprint' : 'run'}: ${air} airborne ticks`);
        assert.ok(t.at(-1).y - OY < 0.01 && t.at(-1).z - OZ > -3.5, `she is at the bottom (y ${t.at(-1).y - OY}, z ${t.at(-1).z - OZ})`);
        assert.equal((await eventsSince(game, seq, 'player/landed')).length, 0, 'no landing event');
        await game.run([{ actions: [], steps: 20 }]);
      }
    }
  } finally { await game.close(); }
});
