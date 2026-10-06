// Polish round 4 (critic panel): one test per bug fixed in src/enemies.
//   - the lift-hall gantry is not a perch: the Tamper and its Biders take the ramp to a player who stays up there
//   - (the Tamper's line stagger and first charge: tamper.test.mjs; the blind Transit in the yard door: below)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('polish round 4: a player who stays on the hall gantry (door_gallery_far shut) is reached up the ramp: hurt within 20 s by the Tamper alone, within 10 s by Biders from the grates', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      dbg.ext.world.setDoor('door_gallery_far', 'closed');                 // what trg_enc_matador does (the stub world leaves it open)
      await core.stepAsync(1);
      const out = { door: ctx.world.doorState('door_gallery_far') };
      dbg.setOption('difficulty', 'normal');
      // her nearest node up there is the gallery's last, behind the shut door: the route ends at the nearest node that can be reached
      out.route = e.navPath(-12.7, -15, -14, -17.6, -12, -13.5);
      const run = async (label, at, spawn, ticks) => {
        dbg.god(true);
        ctx.enemies.clearAll();
        await core.stepAsync(2);
        dbg.teleport(at[0], at[1], at[2], -90, 0);
        const ids = spawn();
        dbg.god(false);
        const seq = H.seq();
        let first = -1, down = false, minDist = Infinity;
        for (let t = 0; t < ticks && first < 0; t++) {
          await core.stepAsync(1);
          if (H.events(seq, /^player\/damaged$/).length > 0) first = t + 1;
          const p = dbg.player();
          if (p.y < at[1] - 1) down = true;
          for (const a of e.actors()) if (a.alive) minDist = Math.min(minDist, Math.hypot(a.x - p.x, a.z - p.z, a.y - p.y));
        }
        const hurt = H.events(seq, /^player\/damaged$/)[0];
        out[label] = { first, down, minDist, by: hurt ? hurt.payload.source + ':' + hurt.payload.kind : '', actors: e.actors().filter((a) => a.alive).map((a) => `${a.id} ${a.state} ${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)}`) };
        dbg.god(true);
        return ids;
      };
      // where the critics stood (scratch/r4-combat/perch.mjs, scratch/r4-playthrough/gantry.mjs), and the far corner by the pickups
      await run('tamperA', [-17.6, -12, -13.5], () => [dbg.spawnEnemy('tamper', -6, -15, -25.3, 0)], 1200);
      await run('tamperB', [-13.8, -12, -18.2], () => [dbg.spawnEnemy('tamper', -6, -15, -25.3, 0)], 1500);
      await run('biders', [-17.6, -12, -13.5], () => [dbg.spawnEnemy('bider', 12, -15, -24.5, 90), dbg.spawnEnemy('bider', 12, -15, -3.5, 90)], 600);
      return out;
    });
    console.log('gantry perch r4:', JSON.stringify(r));
    assert.notEqual(r.door, 'open', 'the test stands for the fight: door_gallery_far is shut');
    assert.ok(r.route.length >= 6 && r.route.includes('n_lh_005') && r.route.at(-1).startsWith('n_lh_'), `a route up the ramp: ${r.route}`);
    assert.ok(r.tamperA.first > 0 && r.tamperA.first <= 1200, `the Tamper alone hurts her on the gantry within 20 s (tick ${r.tamperA.first}; before: never)`);
    assert.ok(r.tamperB.first > 0 && r.tamperB.first <= 1500, `and in the far corner of it within 25 s (tick ${r.tamperB.first})`);
    assert.ok(r.biders.first > 0 && r.biders.first <= 600, `Biders from the grates reach and hit her within 10 s (tick ${r.biders.first}; before: never)`);
    assert.equal(r.biders.by, 'bider:lunge');
  } finally { await game.close(); }
});

test('polish round 4: of two Transits that come through the yard door after a player who waits beside it, the second does not stay blind in the doorway: both see her and fire, 2 m apart', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.setOption('difficulty', 'normal');
      core.ctx().enemies.clearAll();
      dbg.teleport(-78.5, 0, 4.6, 90, 0);
      const ids = [
        e.spawn({ kind: 'transit', spawn: 'sp_yard_t2', encounter: 'enc_yard', entrance: 'emerge' }),
        e.spawn({ kind: 'transit', spawn: 'sp_yard_t3', encounter: 'enc_yard', entrance: 'emerge' }),
      ];
      const seq = H.seq();
      const first = {}, blindLate = {}, moved = {}, last = {};
      let apart = Infinity;
      for (let t = 0; t < 60 * 70; t++) {
        dbg.step(1, false);
        const list = e.actors().filter((a) => a.kind === 'transit' && a.alive);
        for (const a of list) {
          if (a.sees && first[a.id] === undefined) first[a.id] = t;
          if (t >= 60 * 40 && !a.sees) blindLate[a.id] = (blindLate[a.id] || 0) + 1;
          if (last[a.id]) moved[a.id] = (moved[a.id] || 0) + Math.hypot(a.x - last[a.id].x, a.z - last[a.id].z);
          last[a.id] = { x: a.x, z: a.z };
        }
        const two = list.filter((a) => a.state !== 'emerge' && a.state !== 'seek' && a.state !== 'relocate' && a.state !== 'sidestep');
        if (two.length === 2) apart = Math.min(apart, Math.hypot(two[0].x - two[1].x, two[0].z - two[1].z));
      }
      const fired = {};
      for (const x of H.events(seq, /^enemy\/attack$/)) fired[x.payload.id] = (fired[x.payload.id] || 0) + 1;
      return { ids, first, blindLate, moved, apart, fired, end: e.actors().filter((a) => a.kind === 'transit' && a.alive).map((a) => `${a.id} ${a.state}@${a.x.toFixed(1)},${a.z.toFixed(1)} sees=${a.sees}`) };
    });
    console.log('yard door r4:', JSON.stringify(r));
    for (const id of r.ids) {
      assert.ok(r.first[id] !== undefined && r.first[id] <= 60 * 40, `${id} has a sight of her inside 40 s (tick ${r.first[id]}; before: the second one never in 70 s)`);
      assert.ok((r.blindLate[id] || 0) <= 60 * 3, `${id} is not blind after 40 s (${r.blindLate[id] || 0} ticks)`);
      assert.ok((r.fired[id] || 0) >= 3, `${id} fires at her (${r.fired[id] || 0} stakes in 70 s)`);
      assert.ok(r.moved[id] <= 60, `${id} does not pace (${r.moved[id].toFixed(1)} m)`);
    }
    assert.ok(r.apart >= 1.5, `the two never stand inside one another (${r.apart.toFixed(2)} m)`);
  } finally { await game.close(); }
});

test('polish round 4: an open vent takes lead only from its own side (the back vent of a stunned Tamper is plate from in front), and a corner grazed by a charge does not stun it', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      dbg.god(true);
      dbg.setOption('difficulty', 'normal');
      // ---- a charge at a player at the ramp foot from where the critics' proxies met it: the lane clips 0.13 m of the
      // corner of rib n1. It used to end there in charge_stun (17 m from her, five times running); now it slides past
      // and is stopped where the level means it to be, by the cabinet beside the ramp.
      ctx.enemies.clearAll();
      dbg.teleport(-16.8, -15, -2.2, -45, 0);
      const t = dbg.spawnEnemy('tamper', -5.9, -15, -19.1, 90);
      await H.until(() => e.actor(t).state === 'charge', 600);
      await H.until(() => e.actor(t).state !== 'charge', 300);
      const a = e.actor(t);
      out.graze = { state: a.state, x: a.x, z: a.z, vent: a.ventBack, fromHer: Math.hypot(a.x + 16.8, a.z + 2.2) };
      // ---- stunned, its back vent open, facing her: lead from in front is plate; from behind it is the vent
      const eye = (p) => [p[0], -15 + 1.65, p[1]];
      const front = [a.x - Math.sin(a.yawDeg * Math.PI / 180) * 5, a.z - Math.cos(a.yawDeg * Math.PI / 180) * 5];
      const back = [a.x + Math.sin(a.yawDeg * Math.PI / 180) * 5, a.z + Math.cos(a.yawDeg * Math.PI / 180) * 5];
      const hp0 = a.hp;
      const f = e.shootAt(t, 'vent_back', 'lead_round', eye(front));
      out.front = [f.outcome, f.damage, e.actor(t).state];
      const b = e.shootAt(t, 'vent_back', 'lead_round', eye(back));
      out.back = [b.outcome, b.damage, e.actor(t).state];
      out.hp = [hp0, e.actor(t).hp];
      // ---- and out of that corner (the cabinet, the ramp's side, the plinth) it comes round to her: it used to walk
      // into the cabinet for as long as she stood at the ramp foot, 4.8 m off, out of its slam's reach
      dbg.god(false);
      const seq = H.seq();
      out.reached = await H.until(() => H.events(seq, /^player\/damaged$/).length > 0, 900);
      const hurt = H.events(seq, /^player\/damaged$/)[0];
      out.by = hurt ? hurt.payload.source + ':' + hurt.payload.kind : '';
      dbg.god(true);
      return out;
    });
    console.log('tamper r4:', JSON.stringify(r));
    assert.ok(r.reached > 0 && r.reached <= 900, `out of the cabinet corner it reaches a player who stands at the ramp foot and hurts her within 15 s (tick ${r.reached}; before: never)`);
    assert.equal(r.by, 'tamper:slam');
    assert.equal(r.graze.state, 'charge_stun');
    assert.ok(r.graze.x < -12.5 && r.graze.fromHer < 6, `the charge passed the corner of rib n1 and ended at the cabinet, ${r.graze.fromHer.toFixed(1)} m from her (before: at the rib, 17 m off): ${r.graze.x.toFixed(1)}, ${r.graze.z.toFixed(1)}`);
    assert.equal(r.graze.vent, true);
    assert.deepEqual(r.front, ['deflected', 25, 'charge_stun'], 'the back vent from in front: plate');
    assert.deepEqual(r.back, ['weak', 200, 'stagger'], 'from behind: the vent');
  } finally { await game.close(); }
});
