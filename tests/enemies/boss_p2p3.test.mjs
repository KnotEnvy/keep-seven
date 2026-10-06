// The Windlass, phases 2, 3a, the hush, the proof, 3b and the kill sequence (GDD 8.2, 8.3; 21 test 8 "the arm at the
// opposite index within 1.8 s"): the guard and its pawls, the lance, the adds, the fan, relights, the charge line,
// head-dry, the kept round, the dry phase that cannot hurt her, setBossPhase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('phase 2: guard set; stake canister lance stake canister in 7.7 s; a 6.5 s haul with two adds; both pawls drop the guard for at least 4.5 s and stay burst for the phase (the guard drops by itself at every later haul); a line round through the guard is exactly 3 hits', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      let seq = H.seq();
      dbg.setBossPhase('p2');
      out.guard0 = e.boss().guard;
      await H.until(() => e.boss().guard === 'set', 200);
      out.guardEvents = H.events(seq, /boss\/guard/).map((x) => x.payload.state);
      // the pattern
      await H.until(() => e.boss().sub === 'pattern', 400);
      const p0 = core.ctx().clock.tick;
      await H.until(() => e.boss().hauling, 800);
      out.patternTicks = core.ctx().clock.tick - p0;
      await core.stepAsync(15);                                 // the lids take 0.2 s to open
      out.kinds = H.events(seq, /boss\/discharge/).map((x) => x.payload.kind);
      out.lanceFx = H.calls().filter((n) => n === 'vfx.acquireLine:lance_thread' || n === 'vfx.acquireCard:lance');
      // lead clanks off the guard while it is set
      out.leadGuard = e.shootBoss('knot', 0);
      // both pawls: the guard drops
      seq = H.seq();
      const h0 = e.boss().t;
      out.pawl1 = e.shootBoss('pawl', 0);
      out.pawl2 = e.shootBoss('pawl', 1);
      out.released = [e.boss().guard, H.events(seq, /boss\/pawl/).map((x) => [x.payload.side, x.payload.burst]), H.names(seq, /story\/say/).length];
      out.knot = e.shootBoss('knot', 1);
      const haulStart = core.ctx().clock.tick - Math.round(h0 * 60);
      await H.until(() => !e.boss().hauling, 600);
      out.haulTicks = core.ctx().clock.tick - haulStart;
      out.reset = [e.boss().guard, e.boss().pawls.join('')];
      // the adds of the haul
      out.adds = H.events(0, /enemy\/spawned/).map((x) => [x.payload.encounter, x.payload.entrance]);
      // ---- polish round 3 (R2): the pawls stay burst, so at the next haul the guard drops by itself; through the pattern it is set and lead clanks
      await H.until(() => e.boss().sub === 'pattern', 400);
      await core.stepAsync(30);
      out.patternGuard = [e.boss().guard, e.shootBoss('knot', e.boss().step).outcome, e.shootBoss('knot', e.boss().step).part];
      seq = H.seq();
      await H.until(() => e.boss().hauling, 900);
      await core.stepAsync(15);
      out.secondHaul = [e.boss().guard, e.boss().pawls.join(''), H.events(seq, /story\/say/).map((x) => x.payload.key).includes('stn_boss_guard_released'), e.shootBoss('knot', 2).outcome];
      // ---- a haul with the pawls whole (a fresh try): a line round through the guard counts exactly three
      dbg.setBossPhase('p2');
      seq = H.seq();
      await H.until(() => e.boss().hauling, 1200);
      await core.stepAsync(15);
      out.teach = H.events(seq, /story\/say/).map((x) => x.payload.key).filter((k) => k === 'hint_boss_haul').length;
      const before = e.boss().pips;
      out.line = e.shootBoss('guard', 0, 'line_round');
      out.lineHits = before - e.boss().pips;
      out.dark = e.boss().dark.reduce((a, b) => a + b, 0);
      return out;
    });
    assert.equal(r.guard0, 'parked');
    assert.deepEqual(r.guardEvents, ['set']);
    assert.deepEqual(r.kinds.slice(0, 5), ['stake', 'canister', 'lance', 'stake', 'canister']);
    assert.ok(Math.abs(r.patternTicks - 462) <= 2, `five discharges in 7.7 s (${r.patternTicks} ticks)`);
    assert.deepEqual(r.lanceFx, ['vfx.acquireLine:lance_thread', 'vfx.acquireCard:lance']);
    assert.equal(r.leadGuard.outcome, 'deflected', 'lead clanks off the guard');
    assert.deepEqual([r.pawl1.outcome, r.pawl2.outcome], ['broke', 'broke']);
    assert.deepEqual(r.released[0], 'released');
    assert.deepEqual(r.released[1], [['l', true], ['r', true]]);
    assert.equal(r.knot.outcome, 'weak', 'with the guard down a lead round takes a knot');
    assert.ok(r.haulTicks >= 390 && r.haulTicks <= 392 + 1, `the haul is 6.5 s, at least 4.5 s after the release (${r.haulTicks})`);   // polish round 3 (integration, R2): 4.0 and 3.0
    assert.deepEqual(r.reset, ['set', '11'], 'the guard is raised again over the pattern; the pawls stay burst');
    assert.deepEqual(r.patternGuard, ['set', 'deflected', 'guard'], 'in the pattern the plate is what a round meets, not a knot behind it');
    assert.deepEqual(r.secondHaul, ['released', '11', true, 'weak'], 'at the next haul the guard drops by itself and the knots take lead');
    assert.equal(r.teach, 1, 'hint_boss_haul at the first haul of a try of phase 2, no death needed');
    assert.ok(r.adds.length >= 2 && r.adds.every((a) => a[0] === 'enc_windlass' && a[1] === 'climb_out'), JSON.stringify(r.adds));
    assert.equal(r.line[0].outcome, 'weak');
    assert.equal(r.lineHits, 3, 'a line round through the guard counts as exactly 3 hits');
    assert.equal(r.dark, 3);
  } finally { await game.close(); }
});

test('phase 2: the lance sweeps the 70 degree arc at 28 degrees a second for 30, once; a rib blocks it; pawls released late still give 3.0 s', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const pos = (bearing, radius) => [14 + Math.sin(bearing * Math.PI / 180) * radius, -44, 96 - Math.cos(bearing * Math.PI / 180) * radius];
      dbg.god(false);
      // in the open, 15 degrees off the door bay: inside the arc
      let p = pos(15, 11.5);
      dbg.teleport(p[0], p[1], p[2], 0, 0);
      let seq = H.seq();
      dbg.setBossPhase('p2');
      await H.until(() => H.events(seq, /boss\/haul/).length > 0, 1200);
      out.open = H.events(seq, /player\/damaged/).filter((x) => x.payload.kind === 'lance').map((x) => x.payload.amount);
      out.sweepFrames = H.events(seq, /boss\/discharge/).filter((x) => x.payload.kind === 'lance').length;
      // behind the rib at bearing 30 (r 7.5 to 10.5): sheltered
      core.ctx().enemies.clearAll();
      dbg.setHealth(100);
      p = pos(30, 12);
      dbg.teleport(p[0], p[1], p[2], 0, 0);
      seq = H.seq();
      dbg.setBossPhase('p2');
      await H.until(() => H.events(seq, /boss\/haul/).length > 0, 1200);
      out.behind = H.events(seq, /player\/damaged/).filter((x) => x.payload.kind === 'lance').map((x) => x.payload.amount);
      out.behindAny = H.events(seq, /player\/damaged/).map((x) => x.payload.kind);
      // the pawls burst 3.5 s into the 4.0 s haul: the haul runs on to give 3.0 s of open face
      await H.until(() => e.boss().t >= 3.5, 300);
      const t0 = core.ctx().clock.tick;
      // in front of the arm, wherever it faces
      p = pos(e.boss().heading, 11.5);
      dbg.teleport(p[0], p[1], p[2], 0, 0);
      e.shootBoss('pawl', 0); e.shootBoss('pawl', 1);
      out.lateGuard = e.boss().guard;
      await H.until(() => !e.boss().hauling, 400);
      out.lateOpen = core.ctx().clock.tick - t0;
      return out;
    });
    assert.ok(r.sweepFrames >= 1);
    assert.deepEqual(r.open, [30], 'the blade meets her once, for 30');
    assert.deepEqual(r.behind, [], 'a rib blocks the lance');
    assert.equal(r.lateGuard, 'released');
    assert.ok(r.lateOpen >= 270 && r.lateOpen <= 272, `at least 4.5 s of open face is guaranteed (${r.lateOpen} ticks)`);
  } finally { await game.close(); }
});

test('adds: two at each phase-2 haul, at most 3 alive and 6 in the phase, from the grate farthest from her and never one within 7 m', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.aiEnabled(true);
      // she stands beside grate 1 (east): it must never be used
      dbg.teleport(20, -44, 96, 90, 0);
      const seq = H.seq();
      dbg.setBossPhase('p2');
      let peak = 0;
      for (let i = 0; i < 60 * 70; i++) {
        dbg.step(1, false);
        const alive = e.actors().filter((a) => a.alive && a.encounter === 'enc_windlass').length;
        peak = Math.max(peak, alive);
        // keep them from crowding her: freeze the adds where they stand
        if (alive >= 3 && i % 600 === 0) dbg.killAll();
      }
      const spawned = H.events(seq, /enemy\/spawned/).map((x) => [Math.round(x.payload.x * 10) / 10, Math.round(x.payload.z * 10) / 10]);
      return { spawned, peak, total: spawned.length, phase: e.boss().phase };
    });
    assert.ok(r.total >= 4, `${r.total} adds`);
    assert.ok(r.total <= 6, 'at most 6 in phase 2');
    assert.ok(r.peak <= 3, 'at most 3 alive');
    for (const [x, z] of r.spawned) assert.ok(Math.hypot(x - 20, z - 96) >= 7, `an add came out ${Math.hypot(x - 20, z - 96).toFixed(1)} m from her`);
  } finally { await game.close(); }
});

test('phase 3a: marks lit from the first tick; the drum spins; the fan (1.2 s spin-up, six stakes in 1.2 s, at most two hurt); a hit knot relights after 4.0 s; charge_required at 12 s; head-dry after a clean six', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const ctx = core.ctx();
      dbg.god(false);
      dbg.teleport(14, -44, 89, 180, 0);                     // 7 m out: the fan's spread covers her
      let seq = H.seq();
      dbg.setBossPhase('p3a');
      out.first = [e.boss().phase, ctx.enemies.boss.marksLit, ctx.enemies.boss.pips];
      // the fan
      await H.until(() => e.boss().fan !== 'none', 400);
      const f0 = ctx.clock.tick;
      await H.until(() => e.boss().fan === 'none', 200);
      out.fanTicks = ctx.clock.tick - f0;
      const fan = H.events(seq, /projectile\/spawned/).map((x) => x.tick - f0);
      out.fanSpawns = fan;
      await core.stepAsync(40);
      out.fanDamage = H.events(seq, /player\/damaged/).filter((x) => x.payload.kind === 'fan').map((x) => x.payload.amount);
      out.flashes = H.calls().filter((n) => n.startsWith('lamps.setMask:boss_lamps')).length;
      // a hit knot relights 4.0 s later from the bore
      dbg.god(true);
      dbg.setHealth(100);
      await H.until(() => e.boss().sub === 'haul', 400);
      seq = H.seq();
      const k0 = ctx.clock.tick;
      out.hit = e.shootBoss('knot', 2);
      out.pipsDark = ctx.enemies.boss.pips;
      await H.until(() => H.events(seq, /boss\/mouth/).some((x) => x.payload.state === 'relit'), 400);
      out.relitTicks = ctx.clock.tick - k0;
      await core.stepAsync(1);
      out.relit = H.events(seq, /boss\/mouth|story\/say/).map((x) => x.payload.state ?? x.payload.key);
      out.thread = H.calls().filter((n) => n === 'vfx.acquireLine:relight_thread').length;
      out.charge = H.events(0, /boss\/charge_required/).map((x) => x.tick);
      out.chargeLines = H.events(0, /story\/say/).map((x) => x.payload.key).filter((k) => k === 'stn_boss_charge_required' || k === 'nar_one_left');
      // ---- head dry: six knots dark at once
      seq = H.seq();
      await H.until(() => e.boss().dark.every((d) => d === 0) && e.boss().sub === 'haul', 900);
      for (let k = 0; k < 6; k++) e.shootBoss('knot', k);
      out.dry = [e.boss().sub, H.events(seq, /boss\/head_dry/).map((x) => x.payload.seconds), H.names(seq, /story\/say/).length];
      const d0 = ctx.clock.tick;
      await H.until(() => e.boss().sub !== 'headdry', 600);
      out.dryTicks = ctx.clock.tick - d0;
      out.dryShots = H.events(seq, /projectile\/spawned/).filter((x) => x.tick >= d0 && x.tick < d0 + out.dryTicks).length;
      return out;
    });
    assert.deepEqual(r.first, ['p3a', true, 6], 'the marks are lit from the first tick; six pips');
    assert.ok(Math.abs(r.fanTicks - 144) <= 2, `spin-up 1.2 s + six stakes in 1.2 s (${r.fanTicks})`);
    assert.equal(r.fanSpawns.length, 6);
    assert.ok(r.fanSpawns.at(-1) - r.fanSpawns[0] <= 72, 'six stakes in 1.2 s');
    assert.ok(r.fanDamage.length <= 2, `at most two stakes of a fan hurt her (${r.fanDamage})`);
    assert.ok(r.fanDamage.length >= 1 && r.fanDamage.every((d) => d === 18), `18 each (${r.fanDamage})`);
    assert.equal(r.hit.outcome, 'weak');
    assert.equal(r.pipsDark, 5, 'its pip goes out');
    assert.ok(Math.abs(r.relitTicks - 240) <= 1, `4.0 s later it relights (${r.relitTicks})`);
    assert.deepEqual(r.relit.filter((x) => x === 'dark' || x === 'relit' || x === 'stn_boss_refilled'), ['dark', 'relit', 'stn_boss_refilled']);
    assert.equal(r.thread, 1, 'a violet thread climbs from the bore');
    assert.equal(r.charge.length, 1, 'boss/charge_required once');
    assert.deepEqual(r.chargeLines, ['stn_boss_charge_required', 'nar_one_left']);
    assert.equal(r.dry[0], 'headdry');
    assert.deepEqual(r.dry[1], [6]);
    assert.ok(Math.abs(r.dryTicks - 360) <= 1, `no attacks for 6.0 s (${r.dryTicks})`);
    assert.equal(r.dryShots, 0);
  } finally { await game.close(); }
});

test('phase 3a: charge_required waits for 12 s or the first relight and never comes after a kept load; hint T4 makes the fan 9 a stake and the haul 6 s; T3 stops the adds', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const ctx = core.ctx();
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      let seq = H.seq();
      const t0 = ctx.clock.tick;
      dbg.setBossPhase('p3a');
      await H.until(() => H.events(seq, /boss\/charge_required/).length > 0, 900);
      out.at = (H.events(seq, /boss\/charge_required/)[0].tick - t0) / 60;
      // a kept load first: never
      ctx.enemies.clearAll();
      seq = H.seq();
      dbg.setBossPhase('p3a');
      await core.stepAsync(30);
      dbg.emit('weapon/kept', { stage: 'loading', mark: '' });
      await core.stepAsync(10);
      dbg.emit('weapon/kept', { stage: 'unloaded', mark: '' });
      await core.stepAsync(1200);
      out.afterLoad = H.events(seq, /boss\/charge_required/).length;
      // T4 and T3
      ctx.enemies.clearAll();
      dbg.god(false);
      dbg.teleport(14, -44, 89, 180, 0);
      seq = H.seq();
      dbg.setBossPhase('p3a');
      dbg.emit('puzzle/hint', { puzzle: 'kept', tier: 3 });
      dbg.emit('puzzle/hint', { puzzle: 'kept', tier: 4 });
      await H.until(() => H.events(seq, /boss\/haul/).length >= 2, 1200);
      out.fan = H.events(seq, /player\/damaged/).filter((x) => x.payload.kind === 'fan').map((x) => x.payload.amount);
      out.haul = H.events(seq, /boss\/haul/).map((x) => [x.payload.on, x.payload.seconds]);
      await core.stepAsync(60 * 20);
      out.adds = H.events(seq, /enemy\/spawned/).length;
      return out;
    });
    assert.ok(Math.abs(r.at - 12) < 0.05, `charge_required at phase start + 12 s (${r.at})`);
    assert.equal(r.afterLoad, 0, 'never after a kept load');
    assert.ok(r.fan.length >= 1 && r.fan.every((d) => d === 9), `T4: 9 a stake (${r.fan})`);
    assert.deepEqual(r.haul[0], [true, 6], 'T4: the haul is 6 s');
    assert.equal(r.adds, 0, 'none after hint T3');
  } finally { await game.close(); }
});

test('the hush: projectiles burst, mouths shut, no attack, x0.5 for 1.8 s, Biders in a wind-up falter, the arm at the index opposite the mark within 1.8 s of game time; unloaded: back to her bay', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const ctx = core.ctx();
      dbg.god(true);
      const m = ctx.data.layout.markers.find((x) => x.id === 'ia_proving_mark_2');
      dbg.teleport(m.pos[0], m.pos[1], m.pos[2], 0, 0);
      dbg.setBossPhase('p3a');
      await H.until(() => e.boss().armBay === 2 && e.boss().fan === 'firing', 900);
      await core.stepAsync(20);
      // a Bider in its wind-up beside her
      const b = dbg.spawnEnemy('bider', m.pos[0] + 2, m.pos[1], m.pos[2], 0);
      await H.until(() => e.actor(b).state === 'windup', 300);
      const flying = e.stats().flying;
      let seq = H.seq();
      const sim0 = ctx.clock.simTime;
      dbg.emit('weapon/kept', { stage: 'loading', mark: 'ia_proving_mark_2' });
      out.immediate = [e.boss().phase, ctx.enemies.boss.hush, e.stats().flying, e.actor(b).state, flying];
      out.bursts = H.events(seq, /projectile\/burst/).map((x) => x.payload.reason);
      out.scale = H.events(seq, /time\/scale/).map((x) => [x.payload.scale, x.payload.realSeconds, x.payload.reason]);
      let at = -1, simAt = -1;
      for (let i = 0; i < 240; i++) { await core.stepAsync(1); if (at < 0 && e.boss().armBay === 5 && !e.boss().moving) { at = i + 1; simAt = ctx.clock.simTime - sim0; } }
      out.armAt = [at, simAt];
      out.mouths = e.boss().mouths.join('');
      await core.stepAsync(400);
      out.attacks = H.events(seq, /projectile\/spawned|boss\/discharge/).length;
      out.hushEvents = H.events(seq, /boss\/(hush|phase|indexing)/).map((x) => [x.name, x.payload.on ?? x.payload.phase ?? x.payload.toBay]);
      // she steps off: the hush ends and it indexes back to her bay
      seq = H.seq();
      dbg.emit('weapon/kept', { stage: 'unloaded', mark: '' });
      await H.until(() => e.boss().armBay === 2 && !e.boss().moving, 600);
      out.unloaded = [e.boss().phase, H.events(seq, /boss\/(hush|indexing)/).map((x) => [x.name, x.payload.on ?? x.payload.toBay])];
      return out;
    });
    assert.deepEqual(r.immediate.slice(0, 2), ['hush', true]);
    assert.equal(r.immediate[2], 0, 'every stake in flight burst');
    assert.ok(r.bursts.length >= 1 && r.bursts.every((x) => x === 'hush'), JSON.stringify(r.bursts));
    assert.equal(r.immediate[3], 'falter', 'a Bider in its wind-up falters');
    assert.deepEqual(r.scale, [[0.5, 1.8, 'hush']]);
    assert.ok(r.armAt[0] > 0 && r.armAt[1] <= 1.8 + 1e-6, `the arm settles on bay 5 (opposite mark 2) after ${r.armAt[1].toFixed(3)} s of game time`);
    assert.equal(r.mouths, '000000', 'the mouths shut');
    assert.equal(r.attacks, 0, 'no attack while hushed');
    assert.deepEqual(r.hushEvents.filter((x) => x[0] !== 'boss/indexing'), [['boss/phase', 'hush'], ['boss/hush', true]]);
    assert.deepEqual(r.unloaded[0], 'p3a');
    assert.deepEqual(r.unloaded[1], [['boss/hush', false], ['boss/indexing', 2]]);
  } finally { await game.close(); }
});

test('the proof frees every Bider (kept, counted) and freezes the Windlass 4 s; 3b cannot hurt her in 120 s; six hits in one cylinder: the kill sequence and boss/defeated { cleanSix: true }', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const ctx = core.ctx();
      dbg.god(false);
      dbg.teleport(14, -44, 84.5, 180, 0);
      dbg.setBossPhase('p3a');
      await core.stepAsync(60);
      const adds = [e.spawn({ kind: 'bider', spawn: 'sp_bore_grate_2', encounter: 'enc_windlass', wave: 'adds', entrance: 'climb_out' }), e.spawn({ kind: 'bider', spawn: 'sp_bore_grate_3', encounter: 'enc_windlass', wave: 'adds', entrance: 'climb_out' })];
      await core.stepAsync(30);
      let seq = H.seq();
      dbg.emit('weapon/kept', { stage: 'loading', mark: 'ia_proving_mark_1' });
      await core.stepAsync(60);
      dbg.emit('weapon/kept', { stage: 'fired', mark: 'ia_proving_mark_1' });
      out.proven = H.events(seq, /boss\/proven/).map((x) => [x.payload.x, x.payload.y, x.payload.z]);
      out.freed = H.events(seq, /enemy\/freed/).map((x) => [x.payload.cause, x.payload.counted, x.payload.encounter]);
      out.addsState = adds.map((id) => e.actor(id)?.state);
      const p0 = ctx.clock.simTime;
      await H.until(() => e.boss().phase === 'p3b', 400);
      out.frozen = ctx.clock.simTime - p0;
      out.phases = H.events(seq, /boss\/phase/).map((x) => x.payload.phase);
      // 3b for 120 s: dry clicks, the hauling lines, and nothing can hurt her
      seq = H.seq();
      const hp = dbg.player().health;
      await core.stepAsync(120 * 60);
      out.hp = [hp, dbg.player().health];
      out.dry = H.events(seq, /boss\/discharge/).map((x) => x.payload.kind);
      out.dryGap = (() => { const t = H.events(seq, /boss\/discharge/).map((x) => x.tick); return t[1] - t[0]; })();
      out.lines = H.events(seq, /story\/say/).map((x) => [x.tick - H.events(seq, /story\/say/)[0].tick, x.payload.key]).slice(0, 3);
      out.projectiles = H.events(seq, /projectile\/spawned/).length;
      // six lead rounds, one cylinder, no miss
      seq = H.seq();
      for (let k = 0; k < 6; k++) {
        const c = e.bossPoint('knot', k);
        dbg.aimAt(c[0], c[1], c[2]);
        dbg.tap('fire');
        await core.stepAsync(30);
      }
      out.hits = H.events(seq, /combat\/hit/).map((x) => x.payload.outcome);
      out.scale = H.events(seq, /time\/scale/).map((x) => [x.payload.scale, x.payload.realSeconds, x.payload.reason]);
      const k0 = ctx.clock.tick;
      await H.until(() => e.boss().phase === 'dead', 900);
      out.killTicks = ctx.clock.tick - k0;
      out.defeated = H.events(seq, /boss\/defeated/).map((x) => x.payload.cleanSix);
      out.end = [e.boss().phase, ctx.enemies.boss.pips, ctx.enemies.aliveCount('enc_windlass')];
      return out;
    });
    assert.deepEqual(r.proven, [[14, -42.8, 96]], 'boss/proven at the bore axis, kerb top');
    assert.deepEqual(r.freed, [['kept', true, 'enc_windlass'], ['kept', true, 'enc_windlass']], 'every Bider alive sits, counted');
    assert.ok(Math.abs(r.frozen - 4) < 0.02, `frozen 4 s of game time (${r.frozen})`);
    assert.deepEqual(r.phases.filter((p) => p !== 'hush'), ['proven', 'p3b']);
    assert.equal(r.hp[1], r.hp[0], '3b does zero damage in 120 s');
    assert.equal(r.projectiles, 0);
    assert.ok(r.dry.length >= 100 && r.dry.every((k) => k === 'dry'), `${r.dry.length} dry discharges`);
    assert.equal(r.dryGap, 66, 'one every 1.1 s');
    assert.deepEqual(r.lines.map((x) => x[1]), ['stn_boss_hauling', 'stn_boss_hauling', 'nar_hauling']);
    assert.deepEqual(r.hits, ['weak', 'weak', 'weak', 'weak', 'weak', 'weak']);
    assert.deepEqual(r.scale, [[0.2, 0.6, 'kill_sequence']]);
    assert.ok(r.killTicks > 8 * 60 && r.killTicks < 9.5 * 60, `run-down, sag 3 s, three seconds of nothing (${r.killTicks} ticks)`);
    assert.deepEqual(r.defeated, [true], 'cleanSix: six hits in one cylinder with no miss');
    assert.deepEqual(r.end, ['dead', 0, 0]);
  } finally { await game.close(); }
});

test('setBossPhase puts each phase in the state it starts in', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      const out = {};
      for (const ph of ['idle', 'p1', 'p2', 'p3a', 'hush', 'proven', 'p3b', 'dead']) {
        core.ctx().enemies.clearAll();
        const seq = H.seq();
        dbg.setBossPhase(ph);
        await core.stepAsync(2);
        const b = core.ctx().enemies.boss;
        out[ph] = { phase: b.phase, pips: b.pips, guard: b.guard, marksLit: b.marksLit, hush: b.hush, events: H.names(seq, /boss\/(phase|proven|defeated)/) };
      }
      return out;
    });
    assert.deepEqual(r.idle, { phase: 'idle', pips: 26, guard: 'parked', marksLit: false, hush: false, events: [] });
    assert.deepEqual(r.p1, { phase: 'p1', pips: 26, guard: 'parked', marksLit: false, hush: false, events: ['boss/phase'] });
    // a jump has a 1.5 s lead-in, and the guard slides on 1.5 s before the first index: it is set from the first tick
    assert.deepEqual(r.p2, { phase: 'p2', pips: 16, guard: 'set', marksLit: false, hush: false, events: ['boss/phase'] });
    assert.deepEqual(r.p3a, { phase: 'p3a', pips: 6, guard: 'shattered', marksLit: true, hush: false, events: ['boss/phase'] });
    assert.deepEqual(r.hush, { phase: 'hush', pips: 6, guard: 'shattered', marksLit: true, hush: true, events: ['boss/phase', 'boss/phase'] });
    assert.deepEqual(r.proven, { phase: 'proven', pips: 6, guard: 'shattered', marksLit: false, hush: false, events: ['boss/phase', 'boss/proven'] });
    assert.deepEqual(r.p3b, { phase: 'p3b', pips: 6, guard: 'shattered', marksLit: false, hush: false, events: ['boss/phase'] });
    assert.deepEqual(r.dead, { phase: 'dead', pips: 0, guard: 'shattered', marksLit: false, hush: false, events: ['boss/phase', 'boss/defeated'] });
  } finally { await game.close(); }
});

test('fix round 1: the two adds of a haul rise from different grates; a restore of a dead Windlass is silent; a toggled load never restarts the hush slow motion', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const ctx = core.ctx();
      dbg.god(true); dbg.aiEnabled(true);
      // ---- adds: she stands at the door (every grate at least 7 m away); the second add must not rise through the first
      dbg.teleport(14, -44, 84.5, 180, 0);
      let seq = H.seq();
      dbg.setBossPhase('p2');
      let minPair = Infinity;
      for (let i = 0; i < 60 * 16; i++) {
        await core.stepAsync(1);
        const adds = e.actors().filter((a) => a.alive && a.encounter === 'enc_windlass');
        for (let a = 0; a < adds.length; a++) for (let b = a + 1; b < adds.length; b++) {
          if (adds[a].state !== 'rise' && adds[b].state !== 'rise') continue;
          minPair = Math.min(minPair, Math.hypot(adds[a].x - adds[b].x, adds[a].z - adds[b].z));
        }
      }
      const sp = H.events(seq, /enemy\/spawned/);
      out.adds = sp.map((x) => [x.tick - sp[0].tick, Math.round(x.payload.x * 10) / 10, Math.round(x.payload.z * 10) / 10]);
      out.minPair = minPair;
      out.fromHer = sp.map((x) => Math.hypot(x.payload.x - 14, x.payload.z - 84.5));
      // ---- the hush under a toggled load: 20 load / unload pairs in 40 ticks
      ctx.enemies.clearAll();
      const m = ctx.data.layout.markers.find((x) => x.id === 'ia_proving_mark_2');
      dbg.teleport(m.pos[0], m.pos[1], m.pos[2], 0, 0);
      dbg.setBossPhase('p3a');
      await H.until(() => e.boss().sub === 'fan' || e.boss().fan === 'firing', 900);
      seq = H.seq();
      for (let k = 0; k < 20; k++) {
        dbg.emit('weapon/kept', { stage: 'loading', mark: 'ia_proving_mark_2' });
        await core.stepAsync(1);
        dbg.emit('weapon/kept', { stage: 'unloaded', mark: '' });
        await core.stepAsync(1);
      }
      out.slow = H.events(seq, /time\/scale/).filter((x) => x.payload.reason === 'hush').length;
      // the one run ends 1.8 s after it began, whatever she did since
      await core.stepAsync(108 - 40 + 2);
      out.scaleAfter = core.timeScale();
      // a load well after the first is a new hush with its own slow motion
      await core.stepAsync(120);
      dbg.emit('weapon/kept', { stage: 'loading', mark: 'ia_proving_mark_2' });
      out.slowLater = H.events(seq, /time\/scale/).filter((x) => x.payload.reason === 'hush').length;
      out.hushed = [e.boss().phase, e.stats().flying];
      dbg.emit('weapon/kept', { stage: 'unloaded', mark: '' });
      // it fights on afterwards
      await core.stepAsync(200);
      seq = H.seq();
      await core.stepAsync(600);
      out.projectilesAfter = H.events(seq, /projectile\/spawned/).length;
      // ---- a restore after the fight: no defeat told twice
      dbg.setBossPhase('dead');
      const save = ctx.enemies.captureSave();
      out.save = save.bossPhase;
      seq = H.seq();
      ctx.enemies.applySave(save);
      ctx.enemies.applySave(save);
      await core.stepAsync(30);
      out.restoreEvents = H.names(seq, /boss\/|story\/say|audio\/cue/);
      out.dead = [e.boss().phase, ctx.enemies.boss.pips, ctx.enemies.aliveCount('enc_windlass'), ctx.enemies.threat, e.boss().body];
      out.shot = e.shootBoss('knot', 0).outcome;
      // the debug jump still tells it (the sandbox button and tests of the ending use it)
      ctx.enemies.clearAll();
      seq = H.seq();
      dbg.setBossPhase('dead');
      out.debugEvents = H.names(seq, /boss\/(defeated|phase)/);
      return out;
    });
    assert.ok(r.adds.length >= 2, JSON.stringify(r.adds));
    assert.ok(Math.hypot(r.adds[0][1] - r.adds[1][1], r.adds[0][2] - r.adds[1][2]) > 3, `the first two adds rise from different grates (${JSON.stringify(r.adds.slice(0, 2))})`);
    assert.ok(r.minPair >= 1.0, `no add rises within 1 m of another body (${r.minPair.toFixed(2)} m)`);
    for (const d of r.fromHer) assert.ok(d >= 7, `never a grate within 7 m (${d.toFixed(1)})`);
    assert.equal(r.slow, 1, '20 loads in 40 ticks: one slow-motion run');
    assert.equal(r.scaleAfter, 1, 'and it is over 1.8 s after it began');
    assert.equal(r.slowLater, 2, 'a later load is a new hush');
    assert.deepEqual(r.hushed, ['hush', 0]);
    assert.ok(r.projectilesAfter >= 6, `it fights on (${r.projectilesAfter} projectiles in 10 s)`);
    assert.equal(r.save, 'dead');
    assert.deepEqual(r.restoreEvents, [], 'applySave with a dead Windlass emits nothing');
    assert.deepEqual(r.dead, ['dead', 0, 0, 0, true]);
    assert.equal(r.shot, 'deflected');
    assert.deepEqual(r.debugEvents, ['boss/phase', 'boss/defeated']);
  } finally { await game.close(); }
});
