// The Windlass, the asking and phase 1 (GDD 8.1, 8.2, 8.3, 21 test 9): the parley timeline and the refusal, the six
// discharges and the haul, the lamps that count its cylinder, ten hits, the glowing chamber that takes its hit, indexing,
// restores, mercy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('phase 1: stake stake canister stake stake canister, one every 1.9 s (0.9 s glow, 0.2 s notch, 0.8 s rest: 11.4 s), then a 3.0 s haul; the lamp beside each mouth goes out as it fires', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      const seq = H.seq();
      dbg.setBossPhase('p1');
      const lampsAt = [];
      let was = -1;
      for (let i = 0; i < 1400; i++) {
        await core.stepAsync(1);
        const n = H.events(seq, /boss\/discharge/).length;
        if (n !== was) { lampsAt.push(e.boss().lamps.join('')); was = n; }
        if (H.events(seq, /boss\/haul/).length >= 4) break;
      }
      const ev = H.events(seq, /boss\/(discharge|haul|phase|indexing)|projectile\/spawned|story\/say/);
      return {
        ev: ev.map((x) => [x.tick, x.name, x.payload.kind ?? x.payload.on ?? x.payload.phase ?? x.payload.key ?? '', x.payload.mouth ?? x.payload.seconds ?? '']),
        lampsAt, masks: H.calls().filter((n) => n.startsWith('lamps.setMask:boss_lamps')).slice(0, 12), gauge: H.calls().filter((n) => n.startsWith('lamps.setCount:gauge')),
      };
    });
    const dis = r.ev.filter((x) => x[1] === 'boss/discharge');
    assert.deepEqual(dis.slice(0, 6).map((x) => x[2]), ['stake', 'stake', 'canister', 'stake', 'stake', 'canister']);
    assert.deepEqual(dis.slice(0, 6).map((x) => x[3]), [1, 2, 3, 4, 5, 6], 'the drum indexes one notch per discharge');
    for (let i = 1; i < 6; i++) assert.equal(dis[i][0] - dis[i - 1][0], 114, '1.9 s between discharges (polish round 3: p1Rest 0.8)');
    const hauls = r.ev.filter((x) => x[1] === 'boss/haul');
    const firstGlow = dis[0][0] - 54;
    assert.equal(hauls[0][0] - firstGlow, 684, 'six discharges in 11.4 s, then the haul');
    // polish round 3: 3.0 s (3.5, then 5.0 for a while in the round: with glow hits counting and the head following her, phase 1 was 22 to 34 s at 5.0)
    assert.deepEqual([hauls[0][2], hauls[0][3], hauls[1][2]], [true, 3.0, false]);
    assert.equal(hauls[1][0] - hauls[0][0], 180, 'the haul is 3.0 s');
    // polish round 3 (R2): the teaching line at the first haul of a first try, once
    assert.deepEqual(r.ev.filter((x) => x[1] === 'story/say' && x[2] === 'hint_boss_haul').map((x) => x[0]), [hauls[0][0]], 'hint_boss_haul at the first haul, no death needed, and not again at the second');
    assert.ok(r.ev.some((x) => x[1] === 'story/say' && x[2] === 'stn_boss_hauling'));
    // stakes and canisters left the drum
    assert.deepEqual(r.ev.filter((x) => x[1] === 'projectile/spawned').slice(0, 6).map((x) => x[2]), ['stake', 'stake', 'canister', 'stake', 'stake', 'canister']);
    // the lamps: one goes out per discharge
    assert.deepEqual(r.lampsAt.slice(0, 7), ['111111', '011111', '001111', '000111', '000011', '000001', '000000']);
    assert.ok(r.masks.length >= 7, 'boss_lamps masks are written');
    assert.deepEqual(r.gauge.slice(0, 1), ['lamps.setCount:gauge:26']);
  } finally { await game.close(); }
});

test('phase 1: only a knot in an open mouth takes a hit; each goes dark until the haul ends; ten hits break the phase (3 s, slow motion, the guard set)', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      dbg.setBossPhase('p1');
      // a shut lid during the pattern clanks
      await H.until(() => e.boss().sub === 'pattern', 300);
      await core.stepAsync(10);
      out.shut = e.shootBoss('knot', 3);
      out.hub = e.shootBoss('hub', 0);
      const hits = [];
      let seq = H.seq();
      for (let haul = 0; haul < 2; haul++) {
        await H.until(() => e.boss().hauling, 900);
        await core.stepAsync(15);
        for (let k = 0; k < 6 && hits.length < 10; k++) {
          const res = e.shootBoss('knot', k);
          hits.push([res.outcome, res.healthLeft]);
          if (haul === 0 && k === 0) { out.again = e.shootBoss('knot', 0); out.dark = e.boss().dark.join(''); }
        }
        if (haul === 0) { await H.until(() => !e.boss().hauling, 400); out.relit = e.boss().dark.join(''); }
      }
      out.hits = hits;
      out.phase = [e.boss().phase, e.boss().sub, e.boss().pips];
      out.ev = H.events(seq, /boss\/(phase|pips|mouth|guard)|time\/scale|story\/say/).map((x) => [x.name, x.payload.phase ?? x.payload.remaining ?? x.payload.state ?? x.payload.reason ?? x.payload.key, x.payload.scale ?? x.payload.mouth ?? '']);
      // invulnerable through the transition
      out.during = e.shootBoss('knot', 0);
      seq = H.seq();
      const sim0 = core.ctx().clock.simTime - e.boss().t;
      out.guardAt = await H.until(() => e.boss().guard === 'set', 200);
      await H.until(() => e.boss().sub !== 'transition', 300);
      out.transition = core.ctx().clock.simTime - sim0;
      out.after = H.names(seq, /boss\/guard|story\/say/);
      return out;
    });
    assert.deepEqual([r.shut.outcome, r.shut.damage], ['deflected', 0], 'a shut lid clanks');
    assert.equal(r.hub.outcome, 'deflected');
    assert.deepEqual(r.hits.map((h) => h[0]), Array(10).fill('weak'));
    assert.deepEqual(r.hits.map((h) => h[1]), [25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
    assert.deepEqual([r.again.outcome, r.again.damage], ['deflected', 0], 'each takes one hit and goes dark');
    assert.equal(r.dark, '100000');
    assert.equal(r.relit, '000000', 'dark until the haul ends');
    assert.deepEqual(r.phase, ['p2', 'transition', 16]);
    const names = r.ev.map((x) => x[0] + ':' + x[1]);
    assert.ok(names.includes('story/say:stn_boss_p1_break'));
    assert.ok(r.ev.some((x) => x[0] === 'time/scale' && x[1] === 'boss_break' && x[2] === 0.3), 'slow motion x0.3 on the breaking hit');
    assert.deepEqual(r.ev.filter((x) => x[0] === 'boss/phase').map((x) => x[1]), ['p2']);
    assert.equal(r.ev.filter((x) => x[0] === 'boss/pips').length, 10 + 1, 'boss/pips on every change');
    assert.equal(r.during.outcome, 'deflected', 'invulnerable through the 3 s transition');
    assert.ok(Math.abs(r.transition - 3) <= 0.02, `the transition is 3 s of game time (${r.transition.toFixed(3)})`);
    assert.deepEqual(r.after, ['story/say', 'boss/guard'], 'stn_boss_guard_set, the guard slides on');
  } finally { await game.close(); }
});

test('shoot what glows (polish round 3, R2): a lit knot in an open mouth takes its hit in its glow; a stake chamber struck then misfires, a canister still lobs; a knot hit in the glow stays dark through the haul (six a cycle)', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      dbg.setBossPhase('p1');
      const seq = H.seq();
      const outcomes = [];
      const out = {};
      let lastStep = -1;
      for (let i = 0; i < 2400; i++) {
        await core.stepAsync(1);
        const b = e.boss();
        if (b.hauling) break;
        // halfway through each glow, a round into the glowing chamber
        if (b.sub === 'pattern' && b.step !== lastStep && b.t >= 0) {
          const kinds = ['stake', 'stake', 'canister', 'stake', 'stake', 'canister'];
          await core.stepAsync(30);
          const k = e.boss().step;
          // the probe a crosshair or a proxy asks: can a round reach this knot, and the shut one beside it?
          dbg.aimAt(...dbg.ext.enemies.bossPoint('knot', k)); const open = dbg.probe();
          dbg.aimAt(...dbg.ext.enemies.bossPoint('knot', (k + 3) % 6)); const shut = dbg.probe();
          const res = e.shootBoss('knot', k);
          outcomes.push([kinds[k], res.outcome, res.damage, open.part, shut.part, res.healthLeft]);
          lastStep = k;
        }
      }
      // ---- the haul: the six struck in their glow are dark, and stay dark until it ends
      await core.stepAsync(20);
      out.haulDark = e.boss().dark.join('');
      out.haulShot = e.shootBoss('knot', 0).outcome;
      out.pipsInHaul = e.boss().pips;
      await H.until(() => !e.boss().hauling, 400);
      out.relit = e.boss().dark.join('');
      // ---- four more glow hits break the phase
      lastStep = -1;
      for (let i = 0; i < 1200 && e.boss().phase === 'p1'; i++) {
        await core.stepAsync(1);
        const b = e.boss();
        if (b.sub === 'pattern' && b.step !== lastStep) { await core.stepAsync(30); const k = e.boss().step; e.shootBoss('knot', k); lastStep = k; }
      }
      out.phase = [e.boss().phase, e.boss().pips];
      return {
        ...out, outcomes,
        spawned: H.events(seq, /projectile\/spawned/).map((x) => x.payload.kind),
        bursts: H.events(seq, /projectile\/burst/).filter((x) => x.payload.reason === 'parry').length,
        discharges: H.events(seq, /boss\/discharge/).map((x) => x.payload.kind),
      };
    });
    const stakes = r.outcomes.filter((o) => o[0] === 'stake');
    const cans = r.outcomes.filter((o) => o[0] === 'canister');
    assert.deepEqual([stakes.length, cans.length], [4, 2], JSON.stringify(r.outcomes));
    assert.ok(r.outcomes.every((o) => o[1] === 'weak' && o[2] === 1), `every glowing chamber takes its hit: ${JSON.stringify(r.outcomes)}`);
    assert.deepEqual(r.outcomes.map((o) => o[5]), [25, 24, 23, 22, 21, 20], 'a pip each');
    assert.ok(r.outcomes.every((o) => o[3] === 'mouth'), 'the probe meets the knot of the open mouth');
    assert.ok(r.outcomes.every((o) => o[4] !== 'mouth'), `the probe at a shut mouth meets the lid, not a knot: ${JSON.stringify(r.outcomes.map((o) => o[4]))}`);
    assert.equal(r.haulDark, '111111', 'struck in the glow: dark through the haul');
    assert.equal(r.haulShot, 'deflected', 'a dark knot takes nothing more this cycle');
    assert.equal(r.pipsInHaul, 20, 'six a cycle at most');
    assert.equal(r.relit, '000000', 'they relight when the haul ends');
    assert.deepEqual(r.phase, ['p2', 16], 'four more in the next glows break the phase');
    assert.equal(r.bursts, 4 + 3, 'each stake chamber struck in its glow misfires (projectile/burst, reason parry): four in the first cycle, three of the four hits of the second');
    assert.ok(!r.spawned.includes('stake'), 'no parried stake leaves the drum');
    assert.ok(!r.discharges.includes('stake'), 'a misfire is not a discharge');
    assert.deepEqual(r.spawned.filter((k) => k === 'canister').length, 2 + 1, 'a canister cannot be stopped: it is lobbed all the same');
  } finally { await game.close(); }
});

test('the asking (GDD 8.1): the 28 s timeline, the mouths open at 23 s for 4.0 s or until the second free hit (the gift is two), nar_parley_kept; a shot before stn_parley_4 is a refusal and phase 1 begins at once', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      const ctx = core.ctx();
      let seq = H.seq();
      const t0 = ctx.clock.tick;
      ctx.enemies.startBoss('idle', false);
      out.start = [e.boss().phase, e.boss().armBay];
      let open = 0, hits = [];
      for (let i = 0; i < 1720; i++) {
        await core.stepAsync(1);
        const b = e.boss();
        if (b.mouths.join('') === '111111' && b.phase === 'parley') open++;
        // one early in the window, the second 0.15 s before it ends (polish round 3: the gift is two, and the lids shut on the second)
        if (b.phase === 'parley' && b.mouths.join('') === '111111' && hits.length < 6 && ctx.clock.tick - t0 > (hits.length < 1 ? 1395 : 1610)) {
          hits.push(e.shootBoss('knot', hits.length).outcome);
          if (hits.length === 2) { out.shutOnFourth = e.boss().mouths.join(''); out.fifth = e.shootBoss('knot', 4).outcome; }
        }
      }
      out.open = open;
      out.hits = hits;
      out.after = [e.boss().phase, e.boss().pips];
      out.lines = H.events(seq, /story\/say/).map((x) => [x.tick - t0, x.payload.key]);
      out.stages = H.events(seq, /boss\/parley/).map((x) => [x.tick - t0, x.payload.stage]);
      out.phase = H.events(seq, /boss\/phase/).map((x) => [x.tick - t0, x.payload.phase]);
      // ---- the refusal
      ctx.enemies.clearAll();
      seq = H.seq();
      const t1 = ctx.clock.tick;
      ctx.enemies.startBoss('parley', false);
      await core.stepAsync(300);
      dbg.aimAt(14, -40, 96);
      dbg.tap('fire');
      await core.stepAsync(2);
      out.refused = { lines: H.events(seq, /story\/say/).map((x) => x.payload.key), stages: H.events(seq, /boss\/parley/).map((x) => x.payload.stage), phase: H.events(seq, /boss\/phase/).map((x) => [x.tick - t1, x.payload.phase]), heard: e.boss().parleyHeard };
      return out;
    });
    assert.deepEqual(r.start, ['parley', 1]);
    assert.deepEqual(r.lines.slice(0, 7).map((x) => x[1]), ['stn_parley_1', 'nar_parley', 'rv_ask', 'stn_parley_2', 'stn_parley_3', 'stn_parley_4', 'nar_parley_kept']);
    const at = r.lines.slice(0, 7).map((x) => x[0] / 60);
    for (const [i, want] of [0, 5.5, 10, 14.5, 19, 23, 27].entries()) assert.ok(Math.abs(at[i] - want) <= 1 / 30, `line ${i} at ${at[i].toFixed(3)} s (want ${want})`);
    assert.deepEqual(r.stages.map((x) => x[1]), ['start', 'inspection', 'kept', 'end']);
    assert.ok(Math.abs(r.stages[1][0] / 60 - 23) < 0.05);
    assert.ok(r.open >= 228 && r.open <= 234, `all six mouths open from 23 s until the second hit 3.85 s later (${r.open} ticks)`);
    assert.deepEqual(r.hits, ['weak', 'weak'], 'two free hits');
    assert.equal(r.shutOnFourth, '000000', 'the lids shut on the second');
    assert.equal(r.fifth, 'deflected');
    assert.deepEqual(r.phase.map((x) => x[1]), ['parley', 'p1']);
    assert.ok(Math.abs(r.phase[1][0] / 60 - 28) < 0.05, `phase 1 at 28 s (${r.phase[1][0] / 60})`);
    assert.deepEqual(r.after, ['p1', 24], 'two of phase 1\'s ten hits taken in the asking');
    assert.ok(r.refused.lines.includes('stn_parley_refused'));
    assert.deepEqual(r.refused.stages, ['start', 'refused']);
    assert.equal(r.refused.phase.at(-1)[1], 'p1');
    assert.ok(r.refused.phase.at(-1)[0] <= 303, 'phase 1 at once');
    assert.equal(r.refused.heard, true);
  } finally { await game.close(); }
});

test('indexing: before each pattern it turns to her bay, the shorter way, 1.5 s per step, mouths shut while it moves; while it hauls it follows her with its mouths open, 0.5 s a step (polish round 3)', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      const at = (deg) => dbg.teleport(14 + Math.sin(deg * Math.PI / 180) * 12, -44, 96 - Math.cos(deg * Math.PI / 180) * 12, 0, 0);
      // she stands in bay 3 (bearing 120) when the phase starts
      at(120);
      let seq = H.seq();
      dbg.setBossPhase('p1');
      const t = await H.until(() => e.boss().sub === 'index' && e.boss().moving, 900);
      let moving = 0, openWhileMoving = 0;
      while (e.boss().moving && moving < 400) { if (e.boss().mouths.some((m) => m === 1)) openWhileMoving++; await core.stepAsync(1); moving++; }
      const out = {
        t, moving, openWhileMoving, bay: e.boss().armBay, heading: e.boss().heading,
        indexing: H.events(seq, /boss\/indexing/).map((x) => [x.payload.fromBay, x.payload.toBay, x.payload.seconds]),
        ratchets: H.events(seq, /audio\/cue/).filter((x) => x.payload.cue === 'ratchet').length,
      };
      // ---- she walks on to bay 5 (bearing 240) during the pattern: it does not turn until it hauls, then it follows
      await H.until(() => e.boss().sub === 'pattern' && e.boss().step === 1, 600);
      at(240);
      seq = H.seq();
      let patternMoves = 0;
      while (e.boss().sub === 'pattern') { if (e.boss().moving) patternMoves++; await core.stepAsync(1); }
      out.patternMoves = patternMoves;
      out.haulStart = [e.boss().sub, e.boss().armBay];
      await H.until(() => e.boss().moving, 30);
      let follow = 0, shutWhileFollowing = 0;
      while (e.boss().moving && follow < 400) { if (e.boss().mouths.join('') !== '111111' || e.boss().sub !== 'haul') shutWhileFollowing++; await core.stepAsync(1); follow++; }
      out.follow = follow; out.shutWhileFollowing = shutWhileFollowing;
      out.after = [e.boss().sub, e.boss().armBay, e.boss().heading];
      out.followed = H.events(seq, /boss\/indexing/).map((x) => [x.payload.fromBay, x.payload.toBay, x.payload.seconds]);
      // a round from where she now stands reaches a knot
      await core.stepAsync(5);
      out.hit = e.shootBoss('knot', 0).outcome;
      // ---- a step taken too late in the haul to settle is not started
      await H.until(() => e.boss().sub === 'haul' && e.boss().t > 3.0 - 0.4, 400);
      at(60);
      let late = 0;
      while (e.boss().sub === 'haul') { if (e.boss().moving) late++; await core.stepAsync(1); }
      out.late = late;
      return out;
    });
    assert.ok(r.t >= 0);
    assert.deepEqual(r.indexing, [[1, 3, 3]], 'two steps clockwise: 3.0 s');
    assert.ok(Math.abs(r.moving - 180) <= 2, `${r.moving} ticks of movement`);
    assert.equal(r.openWhileMoving, 0, 'mouths shut while moving');
    assert.deepEqual([r.bay, r.heading], [3, 120]);
    assert.ok(r.ratchets >= 3, 'a ratchet click per step');
    assert.equal(r.patternMoves, 0, 'out of its arc until the pattern ends: moving is defence');
    assert.deepEqual(r.haulStart, ['haul', 3]);
    assert.deepEqual(r.followed, [[3, 5, 1]], 'it follows her in the haul: two steps in 1.0 s');
    assert.ok(Math.abs(r.follow - 60) <= 2, `${r.follow} ticks of following`);
    assert.equal(r.shutWhileFollowing, 0, 'the six mouths stand open while it follows');
    assert.deepEqual(r.after, ['haul', 5, 240]);
    assert.equal(r.hit, 'weak', 'she has its face again');
    assert.equal(r.late, 0, 'no run is started that could not settle before the haul ends');
  } finally { await game.close(); }
});

test('restores and mercy: applySave restarts at the saved phase with the parley skipped; after two deaths in a phase its damage is x0.85', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const ctx = core.ctx();
      dbg.god(false);
      dbg.teleport(14, -44, 84.5, 180, 0);
      dbg.setBossPhase('p2');
      await core.stepAsync(10);
      const save = ctx.enemies.captureSave();
      out.save = [save.bossPhase, save.parleyHeard, save.deathsInBossPhase];
      ctx.enemies.clearAll();
      out.cleared = [e.boss().phase, ctx.enemies.aliveCount('')];
      let seq = H.seq();
      ctx.enemies.applySave(save);
      out.restored = [e.boss().phase, e.boss().guard];
      out.toPattern = await H.until(() => e.boss().sub === 'pattern', 400);
      out.restoredEvents = H.names(seq, /boss\/parley/);
      // ---- mercy: die twice in phase 2 (the stub world restores cp_boss_p2, committed when phase 2 began)
      for (let d = 0; d < 2; d++) {
        dbg.setHealth(0);
        await H.until(() => dbg.state().game === 'playing' && dbg.player().alive, 400);
        await core.stepAsync(2);
      }
      out.deaths = e.boss().deaths;
      out.phaseAfter = e.boss().phase;
      dbg.teleport(14, -44, 84.5, 180, 0);
      seq = H.seq();
      await H.until(() => H.events(seq, /player\/damaged/).some((x) => x.payload.kind === 'stake'), 1500);
      out.stakeDamage = H.events(seq, /player\/damaged/).filter((x) => x.payload.kind === 'stake').map((x) => x.payload.amount);
      return out;
    });
    assert.deepEqual(r.save, ['p2', true, 0]);
    assert.deepEqual(r.cleared, ['idle', 0]);
    assert.deepEqual(r.restored, ['p2', 'parked']);
    // polish round 5: a restore into a fighting phase holds the first attack BOSS.retryLead (4 s; it was 1.5)
    assert.ok(r.toPattern >= 235 && r.toPattern <= 300, `the fight resumes 4 to 5 s after the restore (${r.toPattern} ticks to the pattern)`);
    assert.deepEqual(r.restoredEvents, [], 'no parley');
    assert.equal(r.deaths, 2);
    assert.equal(r.phaseAfter, 'p2');
    assert.ok(r.stakeDamage.length >= 1 && Math.abs(r.stakeDamage[0] - 25 * 0.85) < 1e-6, `boss damage x0.85 (${r.stakeDamage})`);
  } finally { await game.close(); }
});
