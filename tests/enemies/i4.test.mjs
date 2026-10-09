// Pass i4 (the four issues the reviewers left with this module): one test per change in src/enemies.
//   - the Tamper says each of its two lines once per run of its fight; what grows with her deaths is help: a slower
//     slam with the vent open longer, a longer stun, and from the second death an outline ring on an open vent
//   - the Tamper squares up to her by the end of its charge wind-up, and charges only down a clear lane
//   - a late retry at the Windlass says the direct hint once per phase, then (after a canister) the lob line once,
//     then nothing; the station's phase-3 line repeats 30 s apart and not while she stands at a mark
//   - the guard has a fallback teaching: after two hauls with no answer the pawls line and a ring on each pawl; after
//     four, a ring on the line locker too; the first answer ends it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('pass i4: the Tamper\'s ring line is said once per run of the fight; the respawn after the next death says hint_tamper_back once; later deaths say nothing', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const says = (seq) => H.events(seq, /story\/say/).filter((x) => /hint_tamper/.test(x.payload.key)).map((x) => x.payload.key);
      const out = {};
      dbg.god(false);
      ctx.enemies.clearAll();
      await core.stepAsync(2);
      dbg.setOption('difficulty', 'normal');
      // ---- a try: she stands in front of it and is hit by two slams (the ring line), then "dies" to the third
      const attempt = async () => {
        dbg.teleport(-6, -15, -14, -90, 0);
        const t = dbg.spawnEnemy('tamper', -2, -15, -14, 90);
        const seq = H.seq();
        let hurts = 0, seen = seq;
        for (let i = 0; i < 60 * 40 && hurts < 2; i++) {
          dbg.setHealth(100);
          await core.stepAsync(1);
          for (const x of dbg.events(seen)) { seen = x.seq; if (x.name === 'player/damaged' && x.payload.kind === 'slam') hurts++; }
        }
        const inFight = says(seq);
        // the death and the respawn as the real game sends them: died, the encounter reset (its bodies released with no
        // death of their own), respawned
        const seq2 = H.seq();
        dbg.emit('player/died', { kind: 'slam', source: 'tamper' });
        await core.stepAsync(20);
        ctx.enemies.clearEncounter('');
        dbg.emit('player/respawned', { checkpoint: 'cp_hall_gantry' });
        await core.stepAsync(150);
        return { hurts, inFight, respawn: says(seq2), after: e.tamperHelp() };
      };
      out.tries = [];
      for (let i = 0; i < 4; i++) out.tries.push(await attempt());
      // ---- the Tamper dies: the count is over
      dbg.spawnEnemy('tamper', -2, -15, -14, 90);
      await core.stepAsync(2);
      ctx.enemies.killAll(false);
      await core.stepAsync(2);
      out.afterKill = e.tamperHelp();
      // ---- a new run forgets it all
      dbg.emit('game/new_run', { difficulty: 'normal' });
      await core.stepAsync(2);
      out.newRun = e.tamperHelp();
      return out;
    });
    const [a, b, c, d] = r.tries;
    assert.deepEqual(a.inFight, ['hint_tamper_ring'], 'first try: the second slam that hurts her says the ring line');
    assert.deepEqual(a.respawn, ['hint_tamper_back'], 'her first respawn says the other half of the rule, not the ring line again');
    assert.deepEqual(r.tries.map((x) => [x.hurts, x.after.deaths, x.after.help]), [[2, 1, 1], [2, 2, 2], [2, 3, 3], [2, 4, 3]], 'each death with the Tamper up is a step of help, three at most');
    assert.deepEqual([b.inFight, b.respawn], [[], []], 'second try: neither line again, in the fight or on the respawn');
    assert.deepEqual([c.inFight, c.respawn, d.inFight, d.respawn], [[], [], [], []], 'nor on any later try');
    assert.deepEqual([r.afterKill.deaths, r.afterKill.help], [0, 0], 'the Tamper\'s death ends the count');
    assert.deepEqual([r.newRun.ringSaid, r.newRun.backSaid, r.newRun.deaths, r.newRun.help], [false, false, 0, 0], 'a new run owes both lines again');
  } finally { await game.close(); }
});

test('pass i4: each death to the Tamper makes its slam 0.25 s slower with the vent open for all of it and its stun 0.5 s longer (three steps; not on Hard); from the second death an outline ring pulses on an open vent', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = { slam: {}, stun: {} };
      dbg.god(true);
      const slam = async (difficulty, deaths) => {
        ctx.enemies.clearAll();
        await core.stepAsync(2);
        dbg.setOption('difficulty', difficulty);
        e.tamperDeaths(deaths);
        dbg.teleport(-6, -15, -14, -90, 0);
        const t = dbg.spawnEnemy('tamper', -2, -15, -14, 90);
        await H.until(() => e.actor(t).state === 'slam_windup', 300);
        let ticks = 0, ventAt = -1, ringAt = -1, ringBefore = e.tamperHelp().rings;
        while (e.actor(t).state === 'slam_windup' && ticks < 400) {
          await core.stepAsync(1); ticks++;
          if (ventAt < 0 && e.actor(t).ventChest) ventAt = ticks;
          if (ringAt < 0 && (e.tamperHelp().rings & 1) !== 0) ringAt = ticks;
        }
        // the ring goes with the vent: through the slam and the first 0.5 s of the recover, then off
        await H.until(() => e.actor(t).state === 'slam_recover' && !e.actor(t).ventChest, 300);
        await core.stepAsync(2);
        return { ticks, ventAt, ringAt, ringBefore, ringAfter: e.tamperHelp().rings };
      };
      for (const d of [0, 1, 2, 3, 6]) out.slam['n' + d] = await slam('normal', d);
      out.slam.h3 = await slam('hard', 3);
      out.slam.e3 = await slam('easy', 3);
      // ---- the stun: a charge baited into rib n2 (tamper.test.mjs has the geometry)
      const stun = async (difficulty, deaths) => {
        ctx.enemies.clearAll();
        await core.stepAsync(2);
        dbg.setOption('difficulty', difficulty);
        e.tamperDeaths(deaths);
        dbg.teleport(-7.6, -15, -14.2, -90, 0);
        const t = dbg.spawnEnemy('tamper', 1.2, -15, -15.0, 90);
        await H.until(() => e.actor(t).state === 'charge_windup', 400);
        dbg.teleport(-7.6, -15, -18.5, -90, 0);
        await H.until(() => e.actor(t).state === 'charge_stun', 500);
        await core.stepAsync(2);
        const ring = e.tamperHelp().rings;
        const ticks = 2 + await H.until(() => e.actor(t).state !== 'charge_stun', 500);
        await core.stepAsync(2);
        return { ticks, ring, ringAfter: e.tamperHelp().rings };
      };
      for (const d of [0, 1, 3]) out.stun['n' + d] = await stun('normal', d);
      out.stun.h3 = await stun('hard', 3);
      out.calls = H.calls().filter((c) => /^setOutline/.test(c)).slice(-2);
      dbg.setOption('difficulty', 'normal');
      ctx.enemies.clearAll();
      return out;
    });
    const s = r.slam;
    assert.deepEqual([s.n0.ticks, s.n1.ticks, s.n2.ticks, s.n3.ticks, s.n6.ticks], [69, 84, 99, 114, 114], 'Normal: 1.15 s, +0.25 s per death, three steps at most');
    assert.deepEqual([s.n0.ventAt, s.n1.ventAt, s.n2.ventAt, s.n3.ventAt].map((v) => Math.abs(v - 34) <= 1), [true, true, true, true], `the vent opens as far into the wind-up as ever, so all the added time is open vent (${[s.n0.ventAt, s.n1.ventAt, s.n2.ventAt, s.n3.ventAt]})`);
    assert.equal(s.h3.ticks, 54, 'Hard: the slam stays 0.9 s whatever she has died');
    assert.equal(s.e3.ticks, Math.round((1.15 * 1.2 + 0.75) * 60), 'Easy: its 1.38 s and the same help');
    assert.deepEqual([s.n0.ringAt, s.n1.ringAt], [-1, -1], 'no ring before the second death');
    for (const k of ['n2', 'n3', 'h3']) {
      assert.equal(s[k].ringBefore, 0, `${k}: no ring on a shut vent`);
      assert.ok(Math.abs(s[k].ringAt - (s[k].ventAt + 1)) <= 1, `${k}: the ring comes on with the vent (${s[k].ringAt} against ${s[k].ventAt})`);
      assert.equal(s[k].ringAfter, 0, `${k}: and goes when it shuts`);
    }
    const u = r.stun;
    assert.deepEqual([u.n0.ticks, u.n1.ticks, u.n3.ticks, u.h3.ticks].map((t) => Math.round(t / 2) * 2), [120, 150, 210, 120], `the stun: 2.0 s, +0.5 s per death on Normal, unchanged on Hard (${[u.n0.ticks, u.n1.ticks, u.n3.ticks, u.h3.ticks]})`);
    assert.deepEqual([u.n0.ring, u.n1.ring, u.n3.ring, u.h3.ring], [0, 0, 2, 2], 'a ring on the open back vent from the second death, on Hard too');
    assert.equal(u.n3.ringAfter, 0);
    assert.deepEqual(r.calls, ['setOutline:enemies_hint_rings', 'setOutline:null'], 'the rings are the renderer\'s hint outline, given back when the last one goes');
  } finally { await game.close(); }
});

test('pass i4: by the end of its charge wind-up the Tamper faces her squarely wherever it stood when it began, and a player who does not move is hit (35)', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const runs = [];
      for (const yaw of [90, 0, -90, 180, 45]) {
        dbg.god(false);
        ctx.enemies.clearAll();
        await core.stepAsync(2);
        dbg.setOption('difficulty', 'normal');
        dbg.setHealth(100);
        dbg.teleport(-6, -15, -14, -90, 0);
        // 12 m down the open nave; `yaw` is where it faces when it is put down (90: at her)
        const t = dbg.spawnEnemy('tamper', 6, -15, -14, yaw);
        const w = await H.until(() => e.actor(t).state === 'charge_windup', 600);
        const off0 = e.actor(t).yawDeg;
        await H.until(() => e.actor(t).state === 'charge', 200);
        const a = e.actor(t), p = dbg.player();
        const want = Math.atan2(-(p.x - a.x), -(p.z - a.z)) * 180 / Math.PI;
        let off = ((a.yawDeg - want) % 360 + 540) % 360 - 180;
        await H.until(() => e.actor(t).state !== 'charge', 300);
        runs.push({ yaw, w, off0, off: Math.round(off * 100) / 100, hp: dbg.player().health, after: e.actor(t).state });
      }
      dbg.god(true);
      ctx.enemies.clearAll();
      return runs;
    });
    for (const x of r) {
      assert.ok(x.w >= 0, `put down facing ${x.yaw}: it winds up a charge`);
      assert.ok(Math.abs(x.off) < 1, `put down facing ${x.yaw}: square on her as the charge begins (${x.off} degrees off)`);
      assert.equal(x.hp, 65, `put down facing ${x.yaw}: she did not move and is hit for 35`);
      assert.equal(x.after, 'advance');
    }
  } finally { await game.close(); }
});

test('pass i4: at the Windlass a late retry says hint_boss_move once per phase, then hint_boss_lob once after a death to a canister, then nothing; a direct hint the world has shown counts', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      ctx.enemies.clearAll();
      dbg.setBossPhase('p1');
      await core.stepAsync(10);
      const save = ctx.enemies.captureSave();
      const HINTS = /^hint_boss_/;
      // a death and the respawn as the real game sends them (release_p0.test.mjs); a line said is shown at once
      const retry = async (phase, deaths, kind, show = true) => {
        const seq = H.seq(), t0 = ctx.clock.tick;
        // (not `player/died` itself: the sandbox answers it with a respawn of its own 1.8 s later. The real game's
        // wiring of the kind is covered by the leg in scratch/i4-team-enemies/NOTES.md)
        e.bossDeaths(e.boss().deaths, kind);
        ctx.enemies.applySave({ ...save, bossPhase: phase, deathsInBossPhase: deaths });
        dbg.emit('encounter/reset', { id: 'enc_windlass' }); e.startBoss(phase, true);
        dbg.emit('player/respawned', { checkpoint: 'cp_boss_' + phase });
        let seen = seq, first = -1;
        for (let i = 0; i < 60 * 9; i++) {
          await core.stepAsync(1);
          for (const x of dbg.events(seen)) {
            seen = x.seq;
            if (first < 0 && /boss\/mouth|boss\/indexing|boss\/discharge/.test(x.name)) first = x.tick - t0;
            if (show && x.name === 'story/say' && HINTS.test(x.payload.key)) { dbg.emit('story/line', { key: x.payload.key, speaker: 'narrator', text: '', seconds: 5 }); dbg.emit('story/line_end', { key: x.payload.key }); }
          }
        }
        return { says: H.events(seq, /story\/say/).filter((x) => HINTS.test(x.payload.key)).map((x) => x.payload.key), at: H.events(seq, /story\/say/).filter((x) => HINTS.test(x.payload.key)).map((x) => x.tick - t0), lead: e.boss().lead, first };
      };
      // ---- phase 1: deaths 2..6, canister, stake, canister ...
      out.p1 = [];
      out.p1.push(await retry('p1', 2, 'stake'));
      out.p1.push(await retry('p1', 3, 'stake'));
      out.p1.push(await retry('p1', 4, 'canister'));
      out.p1.push(await retry('p1', 5, 'canister'));
      out.p1.push(await retry('p1', 6, 'stake'));
      // ---- phase 2 of the same run: each once more, at most
      out.p2 = [];
      out.p2.push(await retry('p2', 2, 'canister'));
      out.p2.push(await retry('p2', 3, 'canister'));
      out.p2.push(await retry('p2', 4, 'lance'));
      // ---- a new run in which the world has already shown the direct hint in phase 1 (the first hit of a run)
      ctx.enemies.clearAll();
      dbg.setBossPhase('p1');
      await core.stepAsync(10);
      dbg.emit('story/line', { key: 'hint_boss_move', speaker: 'narrator', text: '', seconds: 5.5 }); dbg.emit('story/line_end', { key: 'hint_boss_move' });
      out.world = [await retry('p1', 2, 'stake'), await retry('p1', 3, 'canister')];
      return out;
    });
    assert.deepEqual(r.p1.map((x) => x.says), [['hint_boss_move'], [], ['hint_boss_lob'], [], []], 'phase 1: the direct hint on the second death, nothing on the third (a stake), the lob line after a canister, then nothing');
    assert.deepEqual(r.p2.map((x) => x.says), [['hint_boss_move'], ['hint_boss_lob'], []], `phase 2 of the same run: each once more ${JSON.stringify(r.p2)}`);
    for (const x of [...r.p1, ...r.p2]) assert.equal(x.lead >= 6.5, true, `a late retry keeps its longer lead-in with or without a line (${x.lead})`);
    assert.ok(r.p1[1].first >= 6.5 * 60 - 95 && r.p1[1].first <= 6.5 * 60 + 5, `with nothing to read the first attack is 6.5 s after the restore (${r.p1[1].first} ticks)`);
    assert.deepEqual(r.world.map((x) => x.says), [[], ['hint_boss_lob']], 'the world\'s direct hint (the first hit of a run) counts: the retry does not say it a second time in that phase');
  } finally { await game.close(); }
});

test('pass i4: in phase 3 BORE UNPROVEN is repeated 30 s apart (it was 20), and its clock stands while she is at a proving mark', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      dbg.god(true);
      ctx.enemies.clearAll();
      const mark = ctx.data.layout.markers.find((m) => m.id === 'ia_proving_mark_1');
      const asks = (seq, t0) => H.events(seq, /story\/say/).filter((x) => x.payload.key === 'stn_boss_charge_required').map((x) => Math.round((x.tick - t0) / 6) / 10);
      // ---- she keeps away from the marks
      dbg.teleport(14, -44, 84.5, 180, 0);
      let seq = H.seq(), t0 = ctx.clock.tick;
      dbg.setBossPhase('p3a');
      await core.stepAsync(60 * 75);
      out.away = asks(seq, t0);
      out.awayOnMark = e.boss().onMark;
      // ---- she walks onto a mark 20 s in and stands there
      ctx.enemies.clearAll();
      dbg.teleport(14, -44, 84.5, 180, 0);
      seq = H.seq(); t0 = ctx.clock.tick;
      dbg.setBossPhase('p3a');
      await core.stepAsync(60 * 20);
      dbg.teleport(mark.pos[0], mark.pos[1], mark.pos[2], 180, 0);
      await core.stepAsync(60 * 40);
      out.onMark = e.boss().onMark;
      out.stood = asks(seq, t0);
      // ---- and off it again: the clock goes on from where it stood (8 s gone, 22 to go)
      dbg.teleport(14, -44, 84.5, 180, 0);
      await core.stepAsync(60 * 24);
      out.left = asks(seq, t0);
      ctx.enemies.clearAll();
      return out;
    });
    assert.deepEqual(r.away, [12, 42, 72], 'at 12 s, then every 30 s');
    assert.equal(r.awayOnMark, false);
    assert.equal(r.onMark, true);
    assert.deepEqual(r.stood, [12], 'standing at a mark she is not asked again');
    assert.deepEqual(r.left, [12, 82], 'off the mark the clock goes on: 22 s more');
  } finally { await game.close(); }
});

test('pass i4: the guard\'s fallback teaching: the third haul of phase 2 without an answer says hint_boss_pawls once and rings both pawls; the fifth rings the line locker too; a pawl burst or a line round through the guard ends it; the count survives a retry', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      dbg.god(true);
      ctx.enemies.clearAll();
      dbg.teleport(14, -44, 84.5, 180, 0);
      const haul = async () => { await H.until(() => !e.boss().hauling, 1200); await H.until(() => e.boss().hauling, 1500); await core.stepAsync(3); };
      const snap = (seq) => ({ hauls: e.boss().guardIdleHauls, rings: e.tamperHelp().rings, said: H.events(seq, /story\/say/).filter((x) => x.payload.key === 'hint_boss_pawls').length });
      let seq = H.seq();
      dbg.setBossPhase('p2');
      out.idle = [];
      for (let i = 0; i < 2; i++) { await haul(); out.idle.push(snap(seq)); }
      // ---- a death and a retry between the second and the third haul: the count is kept
      const save = ctx.enemies.captureSave();
      ctx.enemies.applySave({ ...save, bossPhase: 'p2', deathsInBossPhase: 1 });
      dbg.emit('encounter/reset', { id: 'enc_windlass' }); e.startBoss('p2', true);
      dbg.emit('player/respawned', { checkpoint: 'cp_boss_p2' });
      await core.stepAsync(30);
      out.leadIn = snap(seq);
      for (let i = 0; i < 3; i++) { await haul(); out.idle.push(snap(seq)); }
      // through the pattern after the fifth haul the rings stay
      await H.until(() => !e.boss().hauling, 1200); await core.stepAsync(120);
      out.pattern = snap(seq);
      out.calls = H.calls().filter((c) => /^setOutline/.test(c)).slice(-1);
      // ---- one pawl burst: answered. The rings go and the line is not said again
      await haul();
      out.pawl = e.shootBoss('pawl', 0).outcome;
      await core.stepAsync(2);
      out.answered = snap(seq);
      await haul(); await haul();
      out.later = snap(seq);
      // ---- another run: a line round through the guard at the first haul is an answer too
      ctx.enemies.clearAll();
      dbg.teleport(14, -44, 84.5, 180, 0);
      seq = H.seq();
      dbg.setBossPhase('p2');
      await haul();
      await core.stepAsync(15);                                  // (the six lids take 0.2 s to open)
      out.line = e.shootBoss('guard', 0, 'line_round').map((x) => x.outcome).includes('weak') ? 'weak' : 'none';
      for (let i = 0; i < 3; i++) await haul();
      out.lineRun = { ...snap(seq), answered: e.boss().guardAnswered };
      ctx.enemies.clearAll();
      return out;
    });
    assert.deepEqual(r.idle.map((x) => x.hauls), [1, 2, 3, 4, 5], 'the hauls without an answer are counted across the retry');
    assert.deepEqual(r.idle.map((x) => x.said), [0, 0, 1, 1, 1], 'the pawls line once, at the third haul');
    assert.deepEqual(r.idle.map((x) => x.rings), [0, 0, 3, 3, 7], 'a ring on each pawl from the third haul; the line locker\'s from the fifth');
    assert.equal(r.leadIn.rings, 0, 'nothing is ringed in the lead-in of a retry');
    assert.equal(r.pattern.rings, 7, 'the rings stay through the pattern (a pawl can be burst at any time in phase 2)');
    assert.deepEqual(r.calls, ['setOutline:enemies_hint_rings']);
    assert.equal(r.pawl, 'broke');
    assert.deepEqual([r.answered.rings, r.later.rings, r.later.said], [0, 0, 1], 'a pawl burst ends the teaching');
    assert.equal(r.line, 'weak', 'a line round through the guard');
    assert.deepEqual([r.lineRun.answered, r.lineRun.said, r.lineRun.rings], [true, 0, 0], 'is an answer: nothing is said or ringed after it');
  } finally { await game.close(); }
});
