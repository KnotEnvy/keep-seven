// The Transit (GDD 7.2) and its stakes (GDD 7.2, 8.3): the 0.9 s tell with the thread frozen for the last 0.25 s and the
// head still for the last 0.4 s, the first shot that always misses, relocation after two shots, the pools of 8 and 18.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('Transit: emerge 1.2 s, plant 0.3 s, a 0.9 s tell whose thread stops tracking for the last 0.25 s, one stake at 18 m/s, cooldown 1.5 s on Normal (polish round 4; 1.2 on Hard)', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.teleport(-83, 0, 0, 90, 0);
      let seq = H.seq();
      const id = e.spawn({ kind: 'transit', spawn: 'sp_yard_t2', encounter: 'enc_yard', wave: 'B', entrance: 'emerge' });
      out.emergeTicks = await H.until(() => e.actor(id).state !== 'emerge', 200);
      out.afterEmerge = e.actor(id).state;
      await H.until(() => e.actor(id).state === 'plant', 1500);
      const a0 = e.actor(id);
      out.movedFromDoor = Math.hypot(a0.x + 96.2, a0.z + 3.6);
      out.pointDistance = Math.hypot(a0.x + 83, a0.z);
      // wait for the aim; it needs sight of her
      out.toAim = await H.until(() => e.actor(id).state === 'aim', 1500);
      const startSeq = H.seq();
      const p0 = dbg.player();
      // 0.3 s into the tell she steps 2 m aside: the thread follows
      await core.stepAsync(18);
      dbg.teleport(p0.x, p0.y, p0.z + 2, 90, 0);
      await core.stepAsync(6);
      out.tracked = e.actor(id).aim;
      const yawTracking = e.actor(id).yawDeg;
      // 0.55 s in (0.35 s left: inside the head-still window, before the thread freeze) she steps again
      await core.stepAsync(9);
      dbg.teleport(p0.x, p0.y, p0.z - 2, 90, 0);
      await core.stepAsync(3);
      out.yawStill = [yawTracking, e.actor(id).yawDeg];
      out.trackedLate = e.actor(id).aim;
      // 0.7 s in (0.2 s left: the thread is frozen): she steps back; the aim point stays where it froze
      await core.stepAsync(6);
      const frozen = e.actor(id).aim;
      dbg.teleport(p0.x, p0.y, p0.z + 2, 90, 0);
      await core.stepAsync(6);
      out.frozen = [frozen, e.actor(id).aim];
      out.aimTicks = 48 + await H.until(() => e.actor(id).state !== 'aim', 60);
      out.afterAim = e.actor(id).state;
      out.tele = H.events(seq, /enemy\/telegraph/).map((x) => [x.payload.attack, x.payload.seconds]);
      out.fx = H.calls().filter((n) => n === 'vfx.acquireLine:sighting_thread' || n === 'vfx.acquireCard:aim_star');
      out.spawned = H.events(startSeq, /projectile\/spawned/).map((x) => [x.payload.kind, x.payload.source]);
      out.token = [core.tokens().ranged.length];
      out.fireTicks = await H.until(() => e.actor(id).state !== 'fire', 60);
      out.cooldownTicks = await H.until(() => e.actor(id).state !== 'cooldown', 200);
      out.token.push(core.tokens().ranged.length);
      return out;
    });
    assert.ok(Math.abs(r.emergeTicks - 72) <= 1, `emerge is 1.2 s (${r.emergeTicks})`);
    // fix round 1: with a sight of her from the door it stepped out of, 8 to 25 m away, it plants there (line of sight first)
    assert.equal(r.afterEmerge, 'plant');
    assert.ok(r.movedFromDoor < 0.1 && r.pointDistance >= 8 && r.pointDistance <= 25, `it plants where it stands, ${r.pointDistance.toFixed(1)} m from her`);
    assert.ok(r.toAim >= 0);
    assert.deepEqual(r.tele, [['aim', 0.9]]);
    assert.deepEqual(r.fx, ['vfx.acquireLine:sighting_thread', 'vfx.acquireCard:aim_star']);
    assert.ok(Math.abs(r.tracked[2] - 2) < 0.01, `the thread tracks her (aim z ${r.tracked[2]})`);
    assert.ok(Math.abs(r.trackedLate[2] + 2) < 0.01, 'still tracking 0.35 s before the shot');
    assert.equal(r.yawStill[0], r.yawStill[1], 'the head is still for the last 0.4 s');
    assert.deepEqual(r.frozen[0], r.frozen[1], 'the thread stops tracking for the last 0.25 s');
    assert.ok(Math.abs(r.aimTicks - 54) <= 1, `the tell is 0.9 s (${r.aimTicks} ticks)`);
    assert.equal(r.afterAim, 'fire');
    assert.deepEqual(r.spawned, [['stake', 'transit']]);
    assert.ok(Math.abs(r.fireTicks - 15) <= 1, `fire is 0.25 s (${r.fireTicks})`);
    assert.ok(Math.abs(r.cooldownTicks - 90) <= 1, `cooldown is 1.5 s on Normal (${r.cooldownTicks})`);
    assert.deepEqual(r.token, [1, 0], 'the ranged token is held from the tell through the shot');
  } finally { await game.close(); }
});

test('Transit: its first stake at a fresh target misses, the second hits for 22; after two shots it relocates to a firing point 12 to 25 m from her', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(false);
      dbg.teleport(-83, 0, 0, 90, 0);                        // at the yard door: the far wall, the south-west and the south points see her
      const id = e.spawn({ kind: 'transit', spawn: 'sp_yard_t3', encounter: 'enc_yard', wave: 'B', entrance: 'emerge' });
      const seq = H.seq();
      const shots = [];
      let relocated = -1, firstPoint = -1, was = '';
      for (let tick = 0; tick < 3600 && relocated < 0; tick++) {
        await core.stepAsync(1);
        const a = e.actor(id);
        const entered = a.state !== was;
        was = a.state;
        if (a.state === 'fire' && entered) { shots.push({ miss: a.miss, point: a.point, d: Math.hypot(a.x - dbg.player().x, a.z - dbg.player().z) }); if (firstPoint < 0) firstPoint = a.point; }
        if (shots.length >= 2 && a.state === 'relocate') relocated = tick;
      }
      out.shots = shots;
      await core.stepAsync(90);                                 // the second stake is still in the air when it starts to move
      out.landed = H.events(seq, /projectile\/(landed|burst)/).map((x) => x.name.endsWith('burst') ? 'burst' : x.payload.hitPlayer);
      out.landedAt = H.events(seq, /projectile\/(landed|burst)/).map((x) => [x.tick, Math.round(x.payload.x * 10) / 10, Math.round(x.payload.y * 10) / 10, Math.round(x.payload.z * 10) / 10, x.payload.surface]);
      out.hp = dbg.player().health;
      out.damaged = H.events(seq, /player\/damaged/).map((x) => [x.payload.amount, x.payload.kind, x.payload.source]);
      out.relocated = relocated;
      await H.until(() => e.actor(id).state === 'plant', 1500);
      const a = e.actor(id), p = dbg.player();
      out.newPoint = [a.point, firstPoint, e.nav().firing.includes(dbg.ext.core.ctx().data.layout.nav.nodes.find((n) => Math.hypot(n.pos[0] - a.x, n.pos[2] - a.z) < 0.6 && n.tags && n.tags.includes('firing_point'))?.id ?? '')];
      out.newDistance = Math.hypot(a.x - p.x, a.z - p.z);
      // fix round 1: points are scored on sight first, then the band. What the yard offers from where she stands:
      const ctx = core.ctx();
      const sees = (x, y, z) => ctx.collision.lineOfSight(x, y + 1.62, z, p.x, p.y + 1.2, p.z, 0);
      out.newSees = sees(a.x, a.y, a.z);
      out.inBandWithSight = ctx.data.layout.nav.nodes.filter((n) => n.zone === 'plenty_street' && n.tags && n.tags.includes('firing_point'))
        .filter((n) => { const d = Math.hypot(n.pos[0] - p.x, n.pos[2] - p.z); return d >= 12 && d <= 25 && sees(n.pos[0], n.pos[1], n.pos[2]); }).length;
      out.max = e.stats().maxHit;
      return out;
    });
    assert.ok(r.shots.length >= 2, 'two shots from its first point');
    assert.equal(r.shots[0].miss, true, 'the first shot at a fresh target is a deliberate miss');
    assert.equal(r.shots[1].miss, false, JSON.stringify(r.shots));
    assert.notEqual(r.landed[0], true, 'and it did miss her ' + JSON.stringify(r.landedAt));
    assert.ok(r.landed.includes(true), 'the second hit ' + JSON.stringify(r.landedAt) + JSON.stringify(r.shots));
    assert.deepEqual(r.damaged, [[22, 'stake', 'transit']]);
    assert.equal(r.hp, 78);
    assert.ok(r.relocated > 0, 'it relocates after two shots from one point');
    assert.notEqual(r.newPoint[0], r.newPoint[1], 'to another point');
    assert.equal(r.newPoint[2], true, 'an authored firing_point');
    assert.equal(r.newSees, true, 'to a point with a sight of her');
    // from the yard door only the point it just left is both in the band and in sight: the next best sees her from just outside it
    if (r.inBandWithSight > 1) assert.ok(r.newDistance >= 12 && r.newDistance <= 25, `12 to 25 m from her (${r.newDistance.toFixed(1)})`);
    else assert.ok(r.newDistance >= 12 && r.newDistance <= 28, `no other point in the band sees her (${r.inBandWithSight}): the nearest one to the band that does (${r.newDistance.toFixed(1)} m)`);
    for (const s of r.shots) assert.ok(s.d >= 12 && s.d <= 25, `its shots come from inside the band (${s.d.toFixed(1)} m)`);
    assert.equal(r.max, 22);
  } finally { await game.close(); }
});

test('stakes: eight in flight at most; stuck stakes never exceed 18, the oldest is recycled; they cool over 6 s', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.teleport(-83, 0, 0, 90, 0);
      // nine at once: the ninth has no slot
      const fired = [];
      for (let i = 0; i < 9; i++) fired.push(e.fireStake(-95, 1.5 + i * 0.1, -10 + i * 0.5, -1, 0, 0, 18, false));
      out.fired = fired;
      out.flying = e.stats().flying;
      let peak = 0;
      const seq = H.seq();
      for (let round = 0; round < 6; round++) {
        await core.stepAsync(70);                               // they stick in the west wall
        peak = Math.max(peak, e.stats().stuck);
        for (let i = 0; i < 8; i++) e.fireStake(-95, 1.2 + i * 0.15, -10 + round + i * 0.3, -1, 0, 0, 18, false);
      }
      await core.stepAsync(70);
      out.peak = Math.max(peak, e.stats().stuck);
      out.landed = H.events(seq, /projectile\/landed/).length;
      out.surfaces = [...new Set(H.events(seq, /projectile\/landed/).map((x) => x.payload.surface))];
      out.cooledSoon = e.stats().cooled;
      await core.stepAsync(380);
      out.cooledLater = e.stats().cooled;
      out.stuck = e.stats().stuck;
      core.ctx().enemies.clearAll();
      out.afterClear = [e.stats().stuck, e.stats().flying];
      return out;
    });
    assert.deepEqual(r.fired, [true, true, true, true, true, true, true, true, false]);
    assert.equal(r.flying, 8);
    assert.ok(r.landed >= 40, `${r.landed} stakes landed`);
    assert.equal(r.peak, 18, 'stuck stakes never exceed 18');
    assert.equal(r.stuck, 18);
    assert.ok(r.cooledSoon < 18, 'fresh ones are still hot');
    assert.equal(r.cooledLater, 18, 'after 6 s every stuck stake is the cool mesh');
    assert.deepEqual(r.afterClear, [0, 0]);
  } finally { await game.close(); }
});

test('Transit: against a target moving faster than 3 m/s its accuracy drops (some aims are thrown wide), and it sidesteps under a resting crosshair beyond 10 m', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.teleport(-84, 0, 0, 90, 0);
      const id = dbg.spawnEnemy('transit', -104, 0, -9, -90);
      // she strafes back and forth at 5 m/s across the door
      let misses = 0, aims = 0, was = '';
      for (let tick = 0; tick < 7200 && aims < 16; tick++) {
        dbg.setKeys([(Math.floor(tick / 45) % 2) ? 'KeyA' : 'KeyD']);
        dbg.step(1, false);
        const a = e.actor(id);
        if (a.state === 'fire' && was !== 'fire') { aims++; if (a.miss) misses++; }
        was = a.state;
      }
      dbg.setKeys([]);
      out.aims = aims; out.misses = misses;
      // ---- the sidestep
      core.ctx().enemies.clearAll();
      dbg.teleport(-83, 0, -8, 90, 0);
      const t = dbg.spawnEnemy('transit', -98, 0, -8, -90);
      dbg.aiEnabled(true);
      const seq = H.seq();
      let stepped = -1, during = '';
      for (let tick = 0; tick < 1200 && stepped < 0; tick++) {
        dbg.aimAtEntity(t, 'lens');
        dbg.step(1, false);
        const a = e.actor(t);
        if (a.state === 'sidestep') { stepped = tick; during = a.prev; }
      }
      out.stepped = stepped; out.during = during;
      const a0 = e.actor(t);
      await H.until(() => e.actor(t).state !== 'sidestep', 60);
      const a1 = e.actor(t);
      out.moved = Math.hypot(a1.x - a0.x, a1.z - a0.z);
      return out;
    });
    assert.ok(r.aims >= 12, `${r.aims} aims`);
    // the first is the fresh-target miss; of the rest about one in five is thrown wide (seeded: x0.8)
    assert.ok(r.misses >= 2 && r.misses <= Math.ceil(r.aims * 0.5), `${r.misses} of ${r.aims} aims were deliberate misses`);
    assert.ok(r.stepped >= 36, `it sidesteps after the crosshair has rested on it 0.6 s (tick ${r.stepped})`);
    assert.notEqual(r.during, 'aim', 'never during an aim');
    assert.ok(Math.abs(r.moved - 1.5) < 0.2, `1.5 m aside (${r.moved})`);
    console.log(`transit: ${r.misses} of ${r.aims} aims at a 5 m/s target thrown wide`);
  } finally { await game.close(); }
});

test('fix round 1: firing points are scored on line of sight: from either yard door the first tell comes within 6 s of the spawn, and it never plants blind first', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = [];
      const ctx = core.ctx();
      dbg.god(true);
      for (const sp of ['sp_yard_t2', 'sp_yard_t3']) for (const p of [[-84, 0, 0], [-90, 0, 8], [-100, 0, 4]]) {
        ctx.enemies.clearAll();
        dbg.teleport(p[0], p[1], p[2], 90, 0); dbg.setAim(90, -80);       // she looks at the floor: no crosshair on anything
        await core.stepAsync(2);
        const id = e.spawn({ kind: 'transit', spawn: sp, encounter: 'enc_yard', wave: 'B', entrance: 'emerge' });
        const seq = H.seq();
        let first = -1, blindPlants = 0, prev = '';
        for (let i = 0; i < 600 && first < 0; i++) {
          await core.stepAsync(1);
          const a = e.actor(id);
          if (a.state === 'plant' && prev !== 'plant' && !ctx.collision.lineOfSight(a.x, a.y + 1.62, a.z, p[0], p[1] + 1.2, p[2], 0)) blindPlants++;
          prev = a.state;
          if (H.events(seq, /enemy\/telegraph/).length > 0) first = i;
        }
        const a = e.actor(id);
        out.push({ sp, p: p.join(), first, blindPlants, dist: Math.hypot(a.x - p[0], a.z - p[2]) });
      }
      ctx.enemies.clearAll();
      return out;
    });
    for (const x of r) {
      assert.ok(x.first >= 0 && x.first <= 360, `${x.sp} against her at ${x.p}: first tell ${x.first} ticks after the spawn`);
      assert.equal(x.blindPlants, 0, `${x.sp} / ${x.p}: it did not plant on a blind point`);
      assert.ok(x.dist >= 8 && x.dist <= 25.5, `${x.sp} / ${x.p}: it aims from ${x.dist.toFixed(1)} m`);
    }
    console.log('transit first tell (ticks after spawn): ' + r.map((x) => `${x.sp.slice(-2)}@${x.p}=${x.first}`).join('  '));
  } finally { await game.close(); }
});

test('fix round 1: a crosshair resting on the drum or the legs beyond 10 m provokes the sidestep, not only one on the lens', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      dbg.god(true);
      const run = async (dy) => {
        ctx.enemies.clearAll();
        dbg.teleport(-84, 0, 0, 90, 0);
        const id = dbg.spawnEnemy('transit', -100, 0, 0, -90);
        let steps = 0, prev = '';
        for (let i = 0; i < 900; i++) {
          const a = e.actor(id);
          if (dy === null) dbg.setAim(90, -80); else dbg.aimAt(a.x, a.y + dy, a.z);
          await core.stepAsync(1);
          const b = e.actor(id);
          if (b.state === 'sidestep' && prev !== 'sidestep') steps++;
          prev = b.state;
        }
        return steps;
      };
      return { drum: await run(1.1), legs: await run(0.45), lens: await run(1.62), none: await run(null), over: await run(2.6) };
    });
    assert.ok(r.drum >= 1, `aiming at the drum: ${r.drum} sidesteps in 15 s`);
    assert.ok(r.legs >= 1, `aiming at the legs: ${r.legs}`);
    assert.ok(r.lens >= 1, `aiming at the lens: ${r.lens}`);
    assert.equal(r.none, 0, 'no crosshair on it: no sidestep');
    assert.equal(r.over, 0, 'a crosshair a metre over its head is not on it');
    for (const k of ['drum', 'legs', 'lens']) assert.ok(r[k] <= 5, `at most once per 3 s (${k}: ${r[k]} in 15 s)`);
    console.log(`transit sidesteps in 15 s under a resting crosshair: drum ${r.drum}, legs ${r.legs}, lens ${r.lens}`);
  } finally { await game.close(); }
});
