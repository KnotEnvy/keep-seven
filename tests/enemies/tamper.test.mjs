// The Tamper (GDD 7.3, 6.7; acceptance test 5): plate, vents, the line round, the bulkhead vignette, the charge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('Tamper reactions: plate 25 and a clank; a shut vent is plate; a line round is a flat 300 of its 900; an open vent takes 200 and staggers', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.aiEnabled(false);
      dbg.teleport(-6, -15, -14, -90, 0);                    // the nave, looking east
      const t = dbg.spawnEnemy('tamper', 6, -15, -14, 90);   // 12 m east, facing her
      await core.stepAsync(2);
      const x0 = e.actor(t).x;
      // ---- lead on the plate
      let seq = H.seq();
      out.plate = e.shootAt(t, 'plate', 'lead_round', null, [0.5, -0.6, 0]);
      out.afterPlate = [e.actor(t).state, e.actor(t).hp];
      out.pushed = e.actor(t).x - x0;
      out.plateEvents = H.events(seq, /enemy\/damaged/).map((x) => [x.payload.part, x.payload.amount, x.payload.hp]);
      // ---- lead on the chest vent while it is shut: the plate
      out.shut = e.shootAt(t, 'vent_chest');
      out.afterShut = [e.actor(t).state, e.actor(t).hp];
      // ---- a line round through the plate away from the knots: 300, no stagger
      out.linePlate = e.shootAt(t, 'plate', 'line_round', null, [0.55, -0.7, 0]);
      out.afterLinePlate = [e.actor(t).state, e.actor(t).hp, e.actor(t).ventChest];
      return out;
    });
    assert.deepEqual([r.plate.outcome, r.plate.damage, r.plate.healthLeft, r.plate.part, r.plate.stops], ['deflected', 25, 875, 'plate', true]);
    assert.deepEqual(r.afterPlate, ['advance', 875], 'a plate hit does not interrupt');
    assert.ok(Math.abs(r.pushed - 0.2) < 0.02, `0.2 m pushback along the shot (${r.pushed})`);
    assert.deepEqual(r.plateEvents, [['plate', 25, 875]]);
    assert.deepEqual([r.shut.outcome, r.shut.damage, r.shut.healthLeft], ['deflected', 25, 850], 'for lead the knot sphere does not exist while the vent is shut');
    assert.deepEqual(r.afterShut, ['advance', 850]);
    assert.deepEqual([r.linePlate[0].outcome, r.linePlate[0].damage, r.linePlate[0].healthLeft, r.linePlate[0].stopsLine], ['hit', 300, 550, false]);
    assert.deepEqual(r.afterLinePlate, ['advance', 550, false], 'through plate away from the knots: 300 and no stagger');
  } finally { await game.close(); }
});

test('Tamper (test 5): one line round through the chest knot leaves 600 of 900 in line_stagger with both vents open for 1.8 s; two more line rounds, or three vent shots, then kill (polish round 4: 900 HP)', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.aiEnabled(false);
      dbg.teleport(-6, -15, -14, -90, 0);
      const fresh = async () => { dbg.ext.enemies.clearEncounter(''); for (const a of e.actors()) if (a.kind === 'tamper') return null; const id = dbg.spawnEnemy('tamper', 6, -15, -14, 90); await core.stepAsync(2); return id; };
      // ---- the line round through the chest knot, from the front, at full health
      let t = dbg.spawnEnemy('tamper', 6, -15, -14, 90);
      await core.stepAsync(2);
      let seq = H.seq();
      out.line1 = e.shootAt(t, 'vent_chest', 'line_round')[0];
      out.after1 = [e.actor(t).state, e.actor(t).hp, e.actor(t).ventChest, e.actor(t).ventBack, e.actor(t).alive];
      dbg.aiEnabled(true);
      // both vents stay open for the whole 1.8 s (polish round 4: was 3.0)
      let open = 0, ticks = 0;
      while (e.actor(t).state === 'line_stagger' && ticks < 400) { if (e.actor(t).ventChest && e.actor(t).ventBack) open++; await core.stepAsync(1); ticks++; }
      out.staggerTicks = ticks; out.openTicks = open; out.afterStagger = e.actor(t).state;
      dbg.aiEnabled(false);
      // ---- a line round is a third of it (polish round 4: 900 HP; round 3: 1 200): the third kills
      out.line2 = e.shootAt(t, 'plate', 'line_round', null, [0.55, -0.7, 0])[0];
      out.afterLine2 = [e.actor(t).alive, e.actor(t).hp];
      out.line3 = e.shootAt(t, 'plate', 'line_round', null, [0.55, -0.7, 0])[0];
      out.after2 = [e.actor(t).state, e.actor(t).alive];
      out.died = H.events(seq, /enemy\/died/).length;
      await core.stepAsync(200);
      out.stays = e.actor(t) !== null;
      // ---- one line round and two lead rounds into a vent
      dbg.ext.enemies.clearEncounter('');
      dbg.killAll();
      dbg.ext.core.ctx().enemies.clearAll();
      t = dbg.spawnEnemy('tamper', 6, -15, -14, 90);
      await core.stepAsync(2);
      e.shootAt(t, 'vent_chest', 'line_round');
      dbg.aiEnabled(true);
      await core.stepAsync(30);
      out.vent1 = e.shootAt(t, 'vent_chest');
      out.afterVent1 = [e.actor(t).state, e.actor(t).hp, Math.round(e.actor(t).t * 60)];
      await core.stepAsync(30);
      out.vent2 = e.shootAt(t, 'vent_chest');
      // (the vents held where they are: the state does not tick with the AI off)
      dbg.aiEnabled(false);
      out.afterVent2b = [e.actor(t).state, e.actor(t).alive, e.actor(t).hp];
      out.vent3 = e.shootAt(t, 'vent_chest');
      out.afterVent2 = [e.actor(t).state, e.actor(t).alive];
      // ---- a second line round during line_stagger does 300 and restarts it
      dbg.ext.core.ctx().enemies.clearAll();
      return out;
    });
    assert.deepEqual([r.line1.outcome, r.line1.damage, r.line1.healthLeft, r.line1.stopsLine], ['weak', 300, 600, false], 'one line round: 300, never more');
    assert.deepEqual(r.after1, ['line_stagger', 600, true, true, true], 'line_stagger with both vents open; one line round never kills');
    assert.ok(Math.abs(r.staggerTicks - 108) <= 1, `line_stagger lasts 1.8 s (${r.staggerTicks} ticks)`);
    assert.equal(r.openTicks, r.staggerTicks, 'both vents open for the whole state');
    assert.equal(r.afterStagger, 'advance');
    assert.deepEqual([r.line2.outcome, r.line2.damage, r.line2.healthLeft], ['hit', 300, 300], 'a second line round: a third more');
    assert.deepEqual(r.afterLine2, [true, 300]);
    assert.deepEqual([r.line3.outcome, r.line3.healthLeft], ['kill', 0], 'the third line round kills');
    assert.deepEqual(r.after2, ['die', false]);
    assert.equal(r.died, 1);
    assert.equal(r.stays, true, 'the dead Tamper stays');
    assert.deepEqual([r.vent1.outcome, r.vent1.damage, r.vent1.healthLeft], ['weak', 200, 400], 'a lead round into a vent held open by line_stagger: 200');
    assert.equal(r.afterVent1[0], 'line_stagger', 'it does not restart or shorten the state');
    assert.equal(r.afterVent1[2], 30);
    assert.deepEqual([r.vent2.outcome, r.vent2.healthLeft], ['weak', 200]);
    assert.deepEqual(r.afterVent2b, ['line_stagger', true, 200], 'one line round and two vent shots leave it up');
    assert.deepEqual([r.vent3.outcome, r.vent3.healthLeft], ['kill', 0], 'one line round and three vent shots kill');
    assert.deepEqual(r.afterVent2, ['die', false]);
  } finally { await game.close(); }
});

test('Tamper: the chest vent opens for the last 0.6 s of the slam wind-up; a lead round in it then does 200, staggers 1.5 s and cancels the slam; before that it is plate; the slam hits for 38 inside its ring', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(false);
      dbg.teleport(-6, -15, -14, -90, 0);
      const t = dbg.spawnEnemy('tamper', -2, -15, -14, 90);     // 4 m in front of her
      let seq = H.seq();
      out.windupAfter = await H.until(() => e.actor(t).state === 'slam_windup', 600);
      out.tele = H.events(seq, /enemy\/telegraph/).map((x) => [x.payload.attack, x.payload.seconds]);
      out.ring = H.calls().filter((n) => n === 'vfx.ring:slam').length;
      out.windupVent = e.actor(t).ventChest;
      out.token = dbg.ext.core.tokens().heavy.length;
      // polish round 3 (R3): 0.33 s into the wind-up the vent is still shut and a round at it is a plate hit that stops nothing
      await core.stepAsync(20);
      out.early = e.shootAt(t, 'vent_chest');
      out.afterEarly = [e.actor(t).state, e.actor(t).hp, e.actor(t).ventChest];
      await core.stepAsync(20);
      out.lateVent = e.actor(t).ventChest;
      out.vent = e.shootAt(t, 'vent_chest');
      out.after = [e.actor(t).state, e.actor(t).hp, e.actor(t).token, e.actor(t).ventChest];
      out.staggerTicks = await H.until(() => e.actor(t).state !== 'stagger', 200);
      out.hpAfterStagger = dbg.player().health;
      // ---- left alone it slams: 38 within 3.5 m of the impact point
      seq = H.seq();
      await H.until(() => e.actor(t).state === 'slam_windup', 600);
      let windupVentTicks = 0;
      out.windupTicks = await H.until(() => { if (e.actor(t).state === 'slam_windup' && e.actor(t).ventChest) windupVentTicks++; return e.actor(t).state === 'slam'; }, 200);
      out.windupVentTicks = windupVentTicks;
      await core.stepAsync(3);
      out.hpAfterSlam = dbg.player().health;
      out.attack = H.events(seq, /enemy\/attack/).map((x) => x.payload.attack);
      out.slamTicks = await H.until(() => e.actor(t).state === 'slam_recover', 200) + 3;
      let ventTicks = 0;
      const rec = await H.until(() => { if (e.actor(t).ventChest) ventTicks++; return e.actor(t).state !== 'slam_recover'; }, 300);
      out.recoverTicks = rec; out.recoverVentTicks = ventTicks;
      out.max = e.stats().maxHit;
      return out;
    });
    assert.ok(r.windupAfter >= 0);
    assert.deepEqual(r.tele, [['slam', 1.15]], 'polish round 5: 1.15 s of tell on Normal (TAMPER.slamWindupBy)');
    assert.equal(r.ring, 1, 'the slam ring is painted');
    assert.equal(r.windupVent, false, 'the chest vent is shut when the wind-up starts');
    assert.deepEqual([r.early.outcome, r.early.damage, r.early.healthLeft], ['deflected', 25, 875], 'a round at the shut vent 0.33 s in: plate');
    assert.deepEqual(r.afterEarly, ['slam_windup', 875, false], 'and the wind-up goes on');
    assert.equal(r.lateVent, true, 'the vent is open 0.67 s in');
    assert.ok(Math.abs(r.windupVentTicks - 36) <= 1, `the vent is open for the last 0.6 s of an undisturbed wind-up (${r.windupVentTicks} ticks)`);
    assert.equal(r.token, 1, 'it holds the heavy token');
    assert.deepEqual([r.vent.outcome, r.vent.damage, r.vent.healthLeft], ['weak', 200, 675]);
    assert.deepEqual(r.after, ['stagger', 675, '', false], 'stagger: the attack is cancelled, the token given back');
    assert.ok(Math.abs(r.staggerTicks - 90) <= 1, `stagger lasts 1.5 s (${r.staggerTicks})`);
    assert.equal(r.hpAfterStagger, 100, 'the cancelled slam did no damage');
    assert.ok(Math.abs(r.windupTicks - 69) <= 1, `the wind-up is 1.15 s on Normal (${r.windupTicks})`);
    assert.equal(r.hpAfterSlam, 62, '38 damage');
    assert.deepEqual(r.attack, ['slam']);
    assert.ok(Math.abs(r.slamTicks - 18) <= 1, `the slam is 0.3 s (${r.slamTicks})`);
    assert.ok(Math.abs(r.recoverTicks - 90) <= 1, `the recover is 1.5 s (${r.recoverTicks})`);
    assert.ok(Math.abs(r.recoverVentTicks - 30) <= 1, `the chest vent stays open the first 0.5 s of the recover (${r.recoverVentTicks})`);
    assert.equal(r.max, 38);
  } finally { await game.close(); }
});

test('Tamper in the bulkhead vignette: plate hits do 0; a round into the vent on a wind-up, or a line round, does its damage and emits enemy/damaged', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      const gantry = [-14, -10.35, -14];
      const spawn = () => e.spawn({ kind: 'tamper', spawn: 'sp_hall_tamper', encounter: 'enc_matador', wave: 'A', dormantClip: 'pound_bulkhead', counted: true });
      let t = spawn();
      await core.stepAsync(100);                              // the vent is shut between wind-ups (1.1 s to 2.6 s of each loop)
      out.state = [e.actor(t).state, e.actor(t).awake, e.actor(t).ventChest, e.actor(t).yawDeg];
      let seq = H.seq();
      out.plate = e.shootAt(t, 'plate', 'lead_round', gantry, [0.5, -0.6, 0]);
      out.shutVent = e.shootAt(t, 'vent_chest', 'lead_round', gantry);
      out.afterPlate = [e.actor(t).state, e.actor(t).hp];
      out.plateEvents = H.names(seq, /enemy\/damaged/);
      // on a wind-up the chest vent stands open
      out.openAfter = await H.until(() => e.actor(t).ventChest, 200);
      seq = H.seq();
      out.vent = e.shootAt(t, 'vent_chest', 'lead_round', gantry);
      out.afterVent = [e.actor(t).state, e.actor(t).hp, e.actor(t).awake];
      out.ventEvents = H.events(seq, /enemy\/damaged/).map((x) => [x.payload.id === t, x.payload.amount]);
      await core.stepAsync(120);
      out.later = e.actor(t).state;
      // ---- a line round from the gantry
      dbg.ext.core.ctx().enemies.clearAll();
      t = spawn();
      await core.stepAsync(100);
      seq = H.seq();
      out.line = e.shootAt(t, 'plate', 'line_round', gantry, [0.5, -0.6, 0])[0];
      out.afterLine = [e.actor(t).state, e.actor(t).hp, e.actor(t).awake];
      out.lineEvents = H.events(seq, /enemy\/damaged/).length;
      return out;
    });
    assert.deepEqual(r.state.slice(0, 3), ['vignette', false, false]);
    assert.ok(Math.abs(r.state[3]) < 1, 'it faces the bulkhead (north)');
    assert.deepEqual([r.plate.outcome, r.plate.damage, r.plate.healthLeft], ['deflected', 0, 900], 'plate hits clank and do no damage');
    assert.deepEqual([r.shutVent.outcome, r.shutVent.damage], ['deflected', 0]);
    assert.deepEqual(r.afterPlate, ['vignette', 900]);
    assert.deepEqual(r.plateEvents, [], 'no enemy/damaged: the encounter does not start');
    assert.ok(r.openAfter >= 0);
    assert.deepEqual([r.vent.outcome, r.vent.damage, r.vent.healthLeft], ['weak', 200, 700]);
    assert.deepEqual(r.afterVent, ['stagger', 700, true], 'it leaves the vignette');
    assert.deepEqual(r.ventEvents, [[true, 200]], 'enemy/damaged: the director starts enc_matador on that tick');
    assert.equal(r.later, 'advance');
    assert.deepEqual([r.line.outcome, r.line.damage, r.line.healthLeft], ['hit', 300, 600]);
    assert.deepEqual(r.afterLine, ['advance', 600, true]);
    assert.equal(r.lineEvents, 1);
  } finally { await game.close(); }
});

test('Tamper (test 5): a charge into a rib ends in charge_stun with the back vent open for 2.0 s, 20 of 20 runs; a charge that meets her does 35', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      const ctx = dbg.ext.core.ctx();
      let s = 12345;
      const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
      const runs = [];
      for (let i = 0; i < 20; i++) {
        ctx.enemies.clearAll();
        // Pass i4: it charges only down a lane its body fits through (GDD 7.3 "with a clear lane"), so the bait is
        // footwork: she stands in the open nave, and as it winds up she steps to where the corner of rib n2 lies
        // 0.3 to 0.5 m inside the lane (until this pass she could stand there from the start and it obliged).
        const bx = -7.6 + rnd() * 0.3, bz = -18.5 + rnd() * 0.3;
        dbg.teleport(-7.6, -15, -14.2, -90, 0);
        const t = dbg.spawnEnemy('tamper', 1.2 + rnd() * 0.3, -15, -15.0 + rnd() * 0.3, 90);
        const seq = H.seq();
        const windup = await H.until(() => e.actor(t).state === 'charge_windup', 400);
        dbg.teleport(bx, -15, bz, -90, 0);
        const w = await H.until(() => e.actor(t).state === 'charge', 200);
        const c = await H.until(() => e.actor(t).state !== 'charge', 300);
        const end = e.actor(t).state;
        const vent = e.actor(t).ventBack;
        const stun = end === 'charge_stun' ? await H.until(() => e.actor(t).state !== 'charge_stun', 300) : -1;
        runs.push({ windup, w, c, end, vent, stun, after: e.actor(t).state, tele: H.events(seq, /enemy\/telegraph/).map((x) => x.payload.attack).join() });
      }
      // ---- pass i4: standing where the rib's corner is in the lane no longer draws a charge at all: it walks round to her
      ctx.enemies.clearAll();
      dbg.teleport(-7.6, -15, -18.5, -90, 0);
      const tb = dbg.spawnEnemy('tamper', 1.2, -15, -15.0, 90);
      const sb = H.seq();
      let nearest = 99;
      for (let i = 0; i < 60 * 6 && e.actor(tb).state !== 'slam_windup'; i++) { await core.stepAsync(1); const a = e.actor(tb), p = dbg.player(); nearest = Math.min(nearest, Math.hypot(a.x - p.x, a.z - p.z)); }
      const blocked = { tele: H.events(sb, /enemy\/telegraph/).map((x) => x.payload.attack).join(), state: e.actor(tb).state, nearest };
      // ---- a charge down the open nave meets her: 35 once
      ctx.enemies.clearAll();
      dbg.god(false);
      dbg.teleport(-6, -15, -14, -90, 0);
      const t = dbg.spawnEnemy('tamper', 6, -15, -14, 90);
      await H.until(() => e.actor(t).state === 'charge', 600);
      const x0 = e.actor(t).x;
      let ticks = 0;
      while (e.actor(t).state === 'charge' && ticks < 300) { await core.stepAsync(1); ticks++; }
      const speed = (x0 - e.actor(t).x) / (ticks / 60);
      return { runs, blocked, hp: dbg.player().health, after: e.actor(t).state, speed, max: e.stats().maxHit };
    });
    const stunned = r.runs.filter((x) => x.end === 'charge_stun' && x.vent === true).length;
    assert.equal(stunned, 20, `charge_stun in ${stunned} of 20 runs: ${JSON.stringify(r.runs.filter((x) => x.end !== 'charge_stun'))}`);
    for (const x of r.runs) {
      assert.equal(x.tele, 'charge');
      assert.ok(Math.abs(x.w - 48) <= 1, `the charge wind-up is 0.8 s (${x.w} ticks)`);
      assert.ok(Math.abs(x.stun - 120) <= 1, `charge_stun lasts 2.0 s (${x.stun} ticks)`);
      assert.equal(x.after, 'advance');
    }
    assert.equal(r.blocked.tele, 'slam', `with the rib's corner in the lane it does not charge: it walks to her and slams (${JSON.stringify(r.blocked)})`);
    assert.equal(r.hp, 65, 'a charge that meets her does 35');
    assert.equal(r.after, 'advance');
    assert.ok(Math.abs(r.speed - 9) < 0.5, `it charges at 9 m/s (${r.speed})`);
    assert.equal(r.max, 35);
  } finally { await game.close(); }
});
