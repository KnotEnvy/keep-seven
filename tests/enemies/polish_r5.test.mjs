// Polish round 5 (critic panel): one test per change in src/enemies.
//   - the Tamper's slam tell is 1.15 s on Normal and Easy (x telegraphScale), 1.0 s on Hard; the vent's window is the same
//   - a restore into a fighting phase of the Windlass holds its first attack 4 s and gives full health on Easy and Normal
//   - phase 3b says HAULING only into a free line box, and never once the kill has begun
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('polish round 5: the slam wind-up is 1.15 s on Normal, 1.38 s on Easy and 1.0 s on Hard; the chest vent is open for the same last part of it', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      for (const difficulty of ['normal', 'easy', 'hard']) {
        dbg.god(true);
        ctx.enemies.clearAll();
        await core.stepAsync(2);
        dbg.setOption('difficulty', difficulty);
        dbg.teleport(-6, -15, -14, -90, 0);
        const t = dbg.spawnEnemy('tamper', -2, -15, -14, 90);     // 4 m in front of her
        const seq = H.seq();
        await H.until(() => e.actor(t).state === 'slam_windup', 600);
        let vent = 0;
        const ticks = await H.until(() => { if (e.actor(t).state === 'slam_windup' && e.actor(t).ventChest) vent++; return e.actor(t).state === 'slam'; }, 200);
        out[difficulty] = { tell: H.events(seq, /enemy\/telegraph/).filter((x) => x.payload.attack === 'slam').map((x) => x.payload.seconds), ticks, vent };
      }
      dbg.setOption('difficulty', 'normal');
      return out;
    });
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    assert.ok(r.normal.tell.length === 1 && near(r.normal.tell[0], 1.15), `Normal ${r.normal.tell}`);
    assert.ok(r.easy.tell.length === 1 && near(r.easy.tell[0], 1.15 * 1.2), `Easy ${r.easy.tell}`);
    assert.ok(r.hard.tell.length === 1 && near(r.hard.tell[0], 1.0 * 0.9), `Hard ${r.hard.tell} (GDD 7.3's 1.0 x 0.9)`);
    assert.ok(Math.abs(r.normal.ticks - 69) <= 1, `Normal: the arm comes down 1.15 s after the tell (${r.normal.ticks} ticks)`);
    assert.ok(Math.abs(r.easy.ticks - 83) <= 1, `Easy: 1.38 s (${r.easy.ticks} ticks)`);
    assert.ok(Math.abs(r.hard.ticks - 54) <= 1, `Hard: 0.9 s (${r.hard.ticks} ticks)`);
    assert.ok(Math.abs(r.normal.vent - 36) <= 1, `Normal: the vent is open for the last 0.6 s as before (${r.normal.vent} ticks)`);
    assert.ok(Math.abs(r.easy.vent - 60) <= 1, `Easy: for the last 1.0 s as before (${r.easy.vent} ticks)`);
    assert.ok(Math.abs(r.hard.vent - 36) <= 1, `Hard: 0.6 s (${r.hard.vent} ticks)`);
  } finally { await game.close(); }
});

test('polish round 5: a restore into phase 2 holds every attack for 4 s and gives full health on Normal and Easy (not on Hard, not outside a fighting phase)', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      dbg.god(false);
      dbg.teleport(14, -44, 84.5, 180, 0);
      dbg.setBossPhase('p2');
      await core.stepAsync(10);
      const save = ctx.enemies.captureSave();
      for (const difficulty of ['normal', 'easy', 'hard']) {
        dbg.setOption('difficulty', difficulty);
        ctx.enemies.clearAll();
        dbg.setHealth(67);
        const seq = H.seq(), t0 = ctx.clock.tick;
        ctx.enemies.applySave(save);
        const before = dbg.player().health;
        dbg.emit('player/respawned', { checkpoint: 'cp_boss_p2' });
        const after = dbg.player().health;
        dbg.emit('player/respawned', { checkpoint: 'cp_boss_p2' });          // a second one gives nothing more (and nothing at all on Hard)
        await H.until(() => H.events(seq, /boss\/discharge|projectile\/spawned|enemy\/spawned/).length > 0, 900);
        const first = H.events(seq, /boss\/discharge|projectile\/spawned|enemy\/spawned/)[0];
        out[difficulty] = {
          before, after, phase: e.boss().phase,
          firstAttack: first ? first.tick - t0 : -1,
          hurtBefore4: H.events(seq, /player\/damaged/).filter((x) => x.tick - t0 < 240).length,
          tells: H.events(seq, /boss\/mouth|boss\/indexing/).filter((x) => x.tick - t0 < 235).length,
        };
      }
      // ---- a restore that does not land in a fighting phase gives nothing
      dbg.setOption('difficulty', 'normal');
      ctx.enemies.clearAll();
      dbg.setHealth(67);
      ctx.enemies.applySave({ bossPhase: 'idle', parleyHeard: false, deathsInBossPhase: 0, statics: [] });
      dbg.emit('player/respawned', { checkpoint: 'cp_hall_gantry' });
      out.idle = dbg.player().health;
      return out;
    });
    for (const d of ['normal', 'easy', 'hard']) {
      assert.equal(r[d].phase, 'p2');
      assert.equal(r[d].before, 67);
      assert.ok(r[d].firstAttack >= 240, `${d}: nothing is thrown and nobody rises for 4 s after the restore (first at ${r[d].firstAttack} ticks)`);
      assert.ok(r[d].firstAttack <= 480, `${d}: and the fight does resume (${r[d].firstAttack} ticks)`);
      assert.equal(r[d].hurtBefore4, 0);
      assert.equal(r[d].tells, 0, `${d}: no mouth opens and the arm does not index before the lead-in is over`);
    }
    assert.equal(r.normal.after, 100, 'Normal: full health');
    assert.equal(r.easy.after, 100, 'Easy: full health');
    assert.equal(r.hard.after, 67, 'Hard: what the checkpoint gave');
    assert.equal(r.idle, 67, 'no gift outside the Windlass');
  } finally { await game.close(); }
});

test('polish round 5: phase 3b says HAULING only into a free line box; a line on screen holds it back, and after the kill it is never said', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      const said = (seq) => H.events(seq, /story\/say/).filter((x) => /hauling/.test(x.payload.key)).map((x) => [x.payload.key, x.tick]);
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      // ---- (a) the box is free: the clock alone, as before (4 s, 8 s, then the narrator)
      dbg.setBossPhase('p3b');
      let seq = H.seq(), t0 = ctx.clock.tick;
      await core.stepAsync(12 * 60);
      out.free = said(seq).map((x) => [x[0], x[1] - t0]);
      // ---- (b) the narrator holds the box from 1 s to 9 s of the dry phase (the proof's two lines in the real game)
      dbg.setBossPhase('p3a'); await core.stepAsync(5);
      dbg.setBossPhase('p3b');
      seq = H.seq(); t0 = ctx.clock.tick;
      await core.stepAsync(60);
      dbg.emit('story/line', { key: 'nar_kept', speaker: 'narrator', text: '', seconds: 8 });
      await core.stepAsync(8 * 60);
      out.heldBack = said(seq).length;
      dbg.emit('story/line_end', { key: 'nar_kept' });
      const end = ctx.clock.tick;
      await H.until(() => said(seq).length > 0, 200);
      out.afterEnd = said(seq).map((x) => [x[0], x[1] - end]);
      // ---- (c) the same, but she kills it while the narrator is still speaking: nothing about hauling is ever said
      dbg.setBossPhase('p3a'); await core.stepAsync(5);
      dbg.setBossPhase('p3b');
      seq = H.seq();
      await core.stepAsync(60);
      dbg.emit('story/line', { key: 'nar_kept', speaker: 'narrator', text: '', seconds: 8 });
      await core.stepAsync(5 * 60);
      for (let k = 0; k < 6; k++) { const c = e.bossPoint('knot', k); dbg.aimAt(c[0], c[1], c[2]); dbg.tap('fire'); await core.stepAsync(30); }
      out.sub = e.boss().sub;
      await core.stepAsync(60);
      dbg.emit('story/line_end', { key: 'nar_kept' });
      await H.until(() => e.boss().phase === 'dead', 900);
      await core.stepAsync(10 * 60);
      out.phase = e.boss().phase;
      out.afterKill = said(seq);
      return out;
    });
    assert.deepEqual(r.free.map((x) => x[0]), ['stn_boss_hauling', 'stn_boss_hauling', 'nar_hauling'], 'a free box: all three');
    assert.ok(Math.abs(r.free[0][1] - 240) <= 2 && Math.abs(r.free[1][1] - 480) <= 2 && Math.abs(r.free[2][1] - 600) <= 2, `at 4, 8 and 10 s (${r.free.map((x) => x[1])})`);
    assert.equal(r.heldBack, 0, 'nothing is queued behind a line on screen');
    assert.deepEqual(r.afterEnd.map((x) => x[0]), ['stn_boss_hauling']);
    assert.ok(r.afterEnd[0][1] >= 29 && r.afterEnd[0][1] <= 33, `said 0.5 s after the box came free (${r.afterEnd[0][1]} ticks)`);
    assert.notEqual(r.sub, 'dry', 'the sixth hit began the kill');
    assert.equal(r.phase, 'dead');
    assert.deepEqual(r.afterKill, [], 'no HAULING after the Windlass is dead');
  } finally { await game.close(); }
});
