// The two lift rides (code-world 4.9; LEVEL.md 6): rigid teleports inside a dark ride that keep her offset in the cage
// to the centimetre and her facing; only the cage drawn in the dark; the coda set resident on arrival; memory inside
// the Low budget at every tick.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, MANIFEST, MiB, mark, marker, open, server } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const wrap = (a) => ((a % 360) + 540) % 360 - 180;

/** in the page: every tick of the ride rendered; the worst memory, what was drawn in the dark, a frame mid-ride */
async function pageRide({ seconds, yieldEach }) {
  const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
  const out = { worst: 0, darkCalls: 1e9, ended: false, ticks: 0, shot: null, zones: [] };
  for (let i = 0; i < seconds * 60 + 600 && !out.ended; i++) {
    const seq = dbg.events(0).at(-1)?.seq ?? 0;
    dbg.step(1, true);
    out.ticks++;
    const f = dbg.perf();
    out.worst = Math.max(out.worst, f.textureBytes + f.renderTargetBytes);
    if (i > 90 && i < seconds * 60 - 90) out.darkCalls = Math.min(out.darkCalls, f.drawCalls);
    if (i === Math.floor(seconds * 30)) out.shot = dbg.capture();
    const z = ctx.world.zone;
    if (out.zones[out.zones.length - 1] !== z) out.zones.push(z);
    if (dbg.events(seq, 'ride/state').some((e) => e.payload.stage === 'ended')) out.ended = true;
    // (a build spread over ticks waits on promises: let them settle between two ticks, as frames do in real time)
    if (yieldEach) { await null; await null; await null; }
  }
  return out;
}

/** ticks stepped between the lever and the page-side ride loop: the turn to the gate (54 ticks) is over, the dark (60) has not begun */
const TURNED = 56;

for (const [id, cp, seconds, spread] of [['ride_lift_hall', 'cp_hall_clear', 25, false], ['ride_proving_lift', 'cp_rim', 12, false], ['ride_proving_lift', 'cp_rim', 12, true]]) {
  test(`${id}${spread ? ' (the build spread over ticks, as in real time)' : ''}: she is turned to the gate; the teleport keeps her offset in the cage and her facing; the dark draws only the cage; memory in budget`, async () => {
    const portal = LAYOUT.nav.portals.find((p) => p.id === id);
    const via = marker(portal.via);
    // the proving lift is boarded at the bore's end of the run: warp to the last boss checkpoint and finish the boss
    const game = await open(srv, { checkpoint: cp === 'cp_rim' ? 'cp_boss_proven' : cp });
    try {
      await game.dbg('god', true);
      if (cp === 'cp_rim') await game.dbg('clearEncounter', 'enc_windlass');
      await game.run([{ steps: 70 }]);
      const to = await game.followPath(portal.from, { maxTicks: 3000 });
      assert.ok(to.reason === 'arrived' || to.reason === 'portal', `to the cage: ${to.reason}`);
      await game.walkTo(via.pos[0], via.pos[2], { stopRadius: 1.6, maxTicks: 900 });
      await game.run([{ aimAt: via.pos, steps: 1 }]);
      if (spread) await game.page.evaluate(() => window.__dbg.ext.world.spread(true));
      const atLever = (await game.state()).player;
      const seq = await mark(game);
      await game.run([{ tap: 'interact', steps: 1 }]);
      assert.ok((await game.events(seq, 'ride/state')).some((e) => e.payload.stage === 'started'), 'the ride started');
      // polish round 2: she threw the lever facing the back wall and rode the whole dark with a mesh in her face. As the
      // gate shuts she is turned to it (the open side, where the shaft's lamps pass), level, without being moved
      await game.run([{ steps: TURNED - 1 }]);
      const before = (await game.state()).player;
      const depart = marker(portal.cages[0]);
      const side = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[depart.params.gateSide], half = portal.cageInterior[2] / 2;
      const gate = [depart.pos[0] + side[0] * half, depart.pos[2] + side[1] * half];
      const gateYaw = (Math.atan2(-(gate[0] - before.x), -(gate[1] - before.z)) * 180) / Math.PI;
      assert.ok(Math.abs(wrap(before.yawDeg - gateYaw)) < 12, `she faces the gate (yaw ${before.yawDeg.toFixed(1)}, the gate at ${gateYaw.toFixed(1)}; she faced ${atLever.yawDeg.toFixed(1)} at the lever)`);
      assert.ok(Math.abs(wrap(atLever.yawDeg - gateYaw)) > 60, 'and did not before');
      assert.ok(Math.abs(before.pitchDeg) < 0.5, 'looking level');
      assert.ok(Math.hypot(before.x - atLever.x, before.z - atLever.z) < 0.01, 'turned, not moved');
      const r = await game.page.evaluate(async ({ fn, args }) => (new Function('return (' + fn + ')')())(args), { fn: pageRide.toString(), args: { seconds, yieldEach: spread } });
      assert.ok(r.ended, 'the ride ended');
      assert.ok(r.ticks + TURNED >= seconds * 60 - 2, `it lasted ${seconds} s (${r.ticks + TURNED} ticks)`);
      const after = (await game.state()).player;
      const t = portal.transform, a = (t.yawDeg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      const dx = before.x - t.from[0], dy = before.y - t.from[1], dz = before.z - t.from[2];
      const want = [t.to[0] + dx * c + dz * sn, t.to[1] + dy, t.to[2] - dx * sn + dz * c];
      assert.ok(Math.hypot(after.x - want[0], after.y - want[1], after.z - want[2]) <= 0.01, `offset kept to 1 cm: ${JSON.stringify([after.x, after.y, after.z])} vs ${JSON.stringify(want)}`);
      assert.ok(Math.abs(wrap(after.yawDeg - before.yawDeg - t.yawDeg)) < 0.01, 'facing turned with the cage');
      if (spread) {
        const st = (await game.events(seq)).filter((e) => e.name === 'load/set' || e.name === 'world/built' || e.name === 'player/teleported').map((e) => `${e.name}:${e.payload.stage ?? e.payload.set ?? ''}@${e.tick}`);
        const released = (await game.events(seq, 'load/set')).find((e) => e.payload.stage === 'released');
        const built = (await game.events(seq, 'world/built')).at(-1);
        assert.ok(released && built && built.tick - released.tick >= 2, `the swap took more than one tick (${st.join(' ')})`);
        assert.equal(await game.page.evaluate(() => window.__dbg.ext.world.buildBusy()), false, 'and is over');
      }
      console.log(`${id}: worst textures + render targets in the ride ${(r.worst / MiB).toFixed(1)} MiB (cap ${MANIFEST.tiers.low.textureBudgetMB}); ${r.darkCalls} draw calls in the dark`);
      assert.ok(r.worst <= MANIFEST.tiers.low.textureBudgetMB * MiB, `memory peaked at ${(r.worst / MiB).toFixed(1)} MiB`);
      const cage = MANIFEST.assets[MANIFEST.bindings.prop[marker(portal.cages[0]).params.prop].asset].drawCalls;
      // + the gun, and the stub renderer's instanced sets (it hides an instance by scaling it to nothing: still a call;
      // two more of them lie in the frustum now that she faces the gate and not the back wall)
      const bound = cage + MANIFEST.assets.env_lift_shaft.drawCalls + 6;
      assert.ok(r.darkCalls <= bound, `only the cage and the shaft drawn in the dark (${r.darkCalls} draw calls, bound ${bound})`);
      const fs = await import('node:fs'); const path = await import('node:path');
      fs.writeFileSync(path.join(game.shotDir(), `${id}${spread ? '_spread' : ''}_mid_ride.png`), Buffer.from(r.shot.replace(/^data:image\/png;base64,/, ''), 'base64'));
      const s = await game.state();
      if (cp === 'cp_rim') {
        assert.equal(s.world.set, 'coda', 'the coda set is resident on arrival');
        assert.equal(s.world.checkpoint, 'cp_rim', 'the gate opens on the rim: cp_rim');
      }
      const ev = await game.events(seq);
      const lines = ev.filter((e) => e.name === 'story/line').map((e) => e.payload.key);
      for (const key of via.params.ride.lines) assert.ok(lines.includes(key), `${key} in the dark`);
      const control = ev.filter((e) => e.name === 'player/control').map((e) => `${e.payload.enabled}:${e.payload.reason}`);
      assert.deepEqual(control, ['false:ride', 'true:ride']);
    } finally { await game.close(); }
  });
}
