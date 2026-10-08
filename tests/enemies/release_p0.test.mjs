// Release pass p0 (the final reviewers' open issues): one test per change in src/enemies.
//   - the pause after a slam that hurt her holds through a stagger; the second slam in a row says the ring hint and is
//     followed by a longer pause; a death to a slam says the hint again on the respawn
//   - a circling Bider with a token free runs at a player who walks on; the file's rear pair hurry while far and unwatched
//   - the asking follows its lines as they are shown: the six mouths open on the tick stn_parley_4 comes on screen
//   - from the second death in a cylinder phase the Windlass waits longer and says the direct hint
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('release p0: a slam that hurt her is followed by 3 s without an attack even when a vent shot staggers it mid-slam; the second in a row says hint_tamper_ring and buys 6 s; Hard keeps 3 s', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      const run = async (difficulty, staggerFirst) => {
        dbg.god(false);
        ctx.enemies.clearAll();
        await core.stepAsync(2);
        dbg.setOption('difficulty', difficulty);
        dbg.teleport(-6, -15, -14, -90, 0);
        const t = dbg.spawnEnemy('tamper', -2, -15, -14, 90);     // 4 m in front of her: she never moves
        const seq = H.seq();
        const hurts = [], tells = [], says = [];
        let staggered = -1;
        for (let i = 0; i < 60 * 22; i++) {
          dbg.setHealth(100);                                     // she is hurt (the event is what is read) and never dies of it
          await core.stepAsync(1);
          const a = e.actor(t);
          if (!a) break;
          // the right answer, on the tick after the arm came down: a round into the open chest vent (a stagger)
          if (staggerFirst && staggered < 0 && a.state === 'slam' && a.slamsLanded === 1) { const s = e.shootAt(t, 'vent_chest'); if (s && s.outcome === 'weak') staggered = ctx.clock.tick; }
        }
        for (const x of H.events(seq, /player\/damaged|enemy\/telegraph|story\/say|enemy\/state/)) {
          if (x.name === 'player/damaged' && x.payload.kind === 'slam') hurts.push(x.tick);
          if (x.name === 'enemy/telegraph' && x.payload.attack === 'slam') tells.push(x.tick);
          if (x.name === 'story/say' && x.payload.key === 'hint_tamper_ring') says.push(x.tick);
        }
        return { hurts, tells, says, staggered, states: H.events(seq, /enemy\/state/).map((x) => x.payload.to).filter((s) => s === 'stagger').length };
      };
      out.plain = await run('normal', false);
      out.stagger = await run('normal', true);
      out.hard = await run('hard', false);
      dbg.setOption('difficulty', 'normal');
      return out;
    });
    // ---- Normal, nothing done about it: hit, 3 s, tell; hit again (the hint), 6 s, tell
    const p = r.plain;
    assert.ok(p.hurts.length >= 3, `a player who never moves is hit again and again (${p.hurts})`);
    const tellAfter = (run, hurt) => run.tells.find((t) => t > hurt) - hurt;
    assert.ok(Math.abs(tellAfter(p, p.hurts[0]) - (18 + 90 + 90)) <= 8, `first slam: the next ring 0.3 + 1.5 + 1.5 s after the hit (${tellAfter(p, p.hurts[0])} ticks)`);
    assert.deepEqual(p.says, [p.hurts[1]], 'the ring hint is said once, on the tick of the second slam that hurt her');
    assert.ok(Math.abs(tellAfter(p, p.hurts[1]) - (18 + 90 + 270)) <= 8, `second in a row: the next ring 0.3 + 1.5 + 4.5 s after the hit, as the 6 s hint ends (${tellAfter(p, p.hurts[1])} ticks)`);
    assert.ok(p.hurts[2] - p.hurts[1] >= 420, `so the third hit is at least 7 s after the second (${p.hurts[2] - p.hurts[1]} ticks; it was 4.5 s)`);
    // ---- a vent shot during the 0.3 s of the slam: the stagger (1.5 s) must not replace the pause (it used to: the next ring 1.8 s after the hit)
    const s = r.stagger;
    assert.ok(s.staggered > 0 && s.states >= 1, 'the vent shot staggered it during the slam');
    assert.ok(tellAfter(s, s.hurts[0]) >= 18 + 90 + 90 - 8, `after a stagger the next ring is still no sooner than 3.3 s after the hit (${tellAfter(s, s.hurts[0])} ticks; 110 before this pass)`);
    // ---- Hard: the row does not lengthen the pause (slamRecoverBy 1.275 s)
    const h = r.hard;
    assert.ok(h.hurts.length >= 3);
    assert.ok(tellAfter(h, h.hurts[1]) <= 18 + 77 + 90 + 8, `Hard: 0.3 + 1.275 + 1.5 s after every hit (${tellAfter(h, h.hurts[1])} ticks)`);
  } finally { await game.close(); }
});

test('release p0: a death to the slam says hint_tamper_ring one second after the respawn; a death to anything else does not', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const said = (seq) => H.events(seq, /story\/say/).filter((x) => x.payload.key === 'hint_tamper_ring').map((x) => x.tick);
      const out = {};
      dbg.god(true);
      await core.stepAsync(2);
      let seq = H.seq();
      dbg.emit('player/died', { kind: 'slam', source: 'tamper' });
      await core.stepAsync(30);
      out.beforeRespawn = said(seq).length;
      const t0 = core.ctx().clock.tick;
      dbg.emit('player/respawned', { checkpoint: 'cp_hall_gantry' });
      await core.stepAsync(180);
      out.after = said(seq).map((t) => t - t0);
      seq = H.seq();
      dbg.emit('player/respawned', { checkpoint: 'cp_hall_gantry' });           // a second respawn owes nothing
      dbg.emit('player/died', { kind: 'lunge', source: 'bider' });
      dbg.emit('player/respawned', { checkpoint: 'cp_hall_gantry' });
      await core.stepAsync(180);
      out.other = said(seq).length;
      return out;
    });
    assert.equal(r.beforeRespawn, 0);
    assert.equal(r.after.length, 1, 'once');
    assert.ok(Math.abs(r.after[0] - 60) <= 2, `one second after she has control (${r.after[0]} ticks)`);
    assert.equal(r.other, 0, 'not after a death to a Bider');
  } finally { await game.close(); }
});

test('release p0: a circling Bider with a token free runs at a player who walks on (it used to trail her at 4.5 m for as long as she walked)', async () => {
  const game = await openScene('file');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      dbg.god(true);
      ctx.enemies.clearAll();
      await core.stepAsync(2);
      dbg.setOption('difficulty', 'easy');                     // one attack token: the second Bider has to circle
      // the walkway of the gallery: she stands at x -50 looking toward the far door (+x), two Biders come at her
      dbg.teleport(-50, -12, -14, -90, 0);
      const a = dbg.spawnEnemy('bider', -42, -12, -14.4, 90);
      const b = dbg.spawnEnemy('bider', -41, -12, -13.6, 90);
      // wait until one of them is circling (the other holds the token or the start gap)
      let circ = '';
      await H.until(() => { for (const id of [a, b]) { const v = e.actor(id); if (v && v.state === 'circle') circ = id; } return circ !== ''; }, 600);
      const other = circ === a ? b : a;
      // the other one is taken out of the picture; she walks away from the circling one at her run (4.5 m/s backward)
      // (she is already walking when the token comes free: the ring's radial term has settled 4.5 m behind her)
      dbg.setActions(['back']);
      await core.stepAsync(40);
      e.shootAt(other, 'body');
      const seq = H.seq();
      const keep = e.actor(circ);
      const startState = keep ? keep.state : '';
      let trail = 0, maxDist = 0, attacked = -1;
      for (let i = 0; i < 360; i++) {
        await core.stepAsync(1);
        const v = e.actor(circ), p = dbg.player();
        if (!v) break;
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (v.state === 'circle' && d > 3.8) trail++;
        if (d > maxDist) maxDist = d;
        if (attacked < 0 && (v.state === 'windup' || v.state === 'lunge')) attacked = i;
      }
      dbg.setActions([]);
      dbg.setOption('difficulty', 'normal');
      return { circ, other, had: keep !== null, startState, trail, maxDist, attacked, alive: e.actors().filter((x) => x.alive).length,
        toApproach: H.events(seq, /enemy\/state/).filter((x) => x.payload.id === circ && x.payload.from === 'circle' && x.payload.to === 'approach').length };
    });
    assert.ok(r.circ !== '' && r.had, 'one of the two was circling');
    assert.equal(r.startState, 'circle', 'and still is, 4 to 5 m behind her, when the other goes down and the token comes free');
    assert.ok(r.toApproach >= 1, 'it left the ring to run at her');
    assert.ok(r.trail <= 30, `it does not trail her on the ring beyond its reach (${r.trail} ticks in circle farther than 3.8 m; it was every tick she walked)`);
    assert.ok(r.attacked >= 0, `and it winds up within the six seconds she walks (${r.attacked})`);
  } finally { await game.close(); }
});

test('release p0: the rear pair of the file hurry (x1.3) while more than 18 m off and outside her view, and run at 5.8 m/s when she looks at them or they are near', async () => {
  const game = await openScene('file');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      dbg.god(true);
      const speedOf = async (id, ticks) => { const a0 = e.actor(id); await core.stepAsync(ticks); const a1 = e.actor(id); return Math.hypot(a1.x - a0.x, a1.z - a0.z) / (ticks / 60); };
      const fresh = async (wave, yawDeg) => {
        ctx.enemies.clearAll();
        await core.stepAsync(2);
        dbg.teleport(-25, -12, -14, yawDeg, 0);
        // on the walkway 35 m behind her (the stair itself is the graph's business: the speed is what is measured)
        const id = e.spawn({ kind: 'bider', spawn: 'sp_file_10', encounter: 'enc_file', wave });
        e.place(id, -60, -12, -14, -90);
        await core.stepAsync(20);
        return id;
      };
      // yaw -90 looks toward +x (the far door): the walkway behind her is out of view
      let id = await fresh('R', -90);
      out.hurryFlag = e.actor(id).hurry;
      out.unwatched = await speedOf(id, 60);
      // she turns round and looks at it: 5.8 m/s
      dbg.teleport(-25, -12, -14, 90, 0);
      await core.stepAsync(10);
      out.watched = await speedOf(id, 60);
      // unwatched again, but inside 18 m: 5.8 m/s
      dbg.teleport(-25, -12, -14, -90, 0);
      e.place(id, -40, -12, -14, -90);
      await core.stepAsync(10);
      out.near = await speedOf(id, 40);
      // a Bider of the door's wave does not hurry
      id = await fresh('B', -90);
      out.otherFlag = e.actor(id).hurry;
      out.other = await speedOf(id, 60);
      return out;
    });
    assert.equal(r.hurryFlag, true);
    assert.equal(r.otherFlag, false);
    assert.ok(Math.abs(r.unwatched - 5.8 * 1.3) < 0.25, `far and unwatched: 7.5 m/s (${r.unwatched.toFixed(2)})`);
    assert.ok(Math.abs(r.watched - 5.8) < 0.25, `watched: 5.8 m/s (${r.watched.toFixed(2)})`);
    assert.ok(Math.abs(r.near - 5.8) < 0.25, `inside 18 m: 5.8 m/s (${r.near.toFixed(2)})`);
    assert.ok(Math.abs(r.other - 5.8) < 0.25, `the door's wave: 5.8 m/s (${r.other.toFixed(2)})`);
  } finally { await game.close(); }
});

test('release p0: the asking follows its lines as shown: a line that waits 9 s behind the narrator shifts every stage, the six mouths open on the tick stn_parley_4 appears, phase 1 five seconds after; a line never shown holds 14 s and no longer; with nothing showing lines the written clock runs', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      // (closing of pass i3: the roll-call is ONE line of 4.5 s, the first line 3.5 s, the two spoken ones 4 s: design/story.json)
      const LINES = { stn_parley_1: 3.5, nar_parley: 4, rv_ask: 4, stn_parley_2: 4.5, stn_parley_4: 5, nar_parley_kept: 4.5 };
      // a stand-in for the world's line box: one line at a time, 15 ticks between two, `busyUntil` = the narrator still has it
      const play = async (busyTicks, drop) => {
        dbg.god(true);
        ctx.enemies.clearAll();
        await core.stepAsync(2);
        dbg.teleport(14, -44, 84.5, 180, 0);
        const seq = H.seq(), t0 = ctx.clock.tick;
        dbg.setBossPhase('parley');
        const queue = [], shown = {}, said = {};
        let freeAt = t0 + busyTicks, seen = seq, mouthsAt = -1, inspection = -1, p1 = -1, firstTell = -1;
        for (let i = 0; i < 60 * 80 && firstTell < 0; i++) {
          await core.stepAsync(1);
          const now = ctx.clock.tick;
          for (const x of dbg.events(seen)) {
            seen = x.seq;
            if (x.name === 'story/say' && LINES[x.payload.key] !== undefined) { said[x.payload.key] = x.tick - t0; if (x.payload.key !== drop) queue.push(x.payload.key); }
            if (x.name === 'boss/parley' && x.payload.stage === 'inspection') inspection = x.tick - t0;
            if (x.name === 'boss/phase' && x.payload.phase === 'p1') p1 = x.tick - t0;
            if (p1 >= 0 && firstTell < 0 && x.name === 'boss/mouth' && x.payload.state === 'open') firstTell = x.tick - t0;
          }
          if (queue.length > 0 && now >= freeAt) {
            const key = queue.shift();
            shown[key] = now - t0;
            freeAt = now + Math.round(LINES[key] * 60) + 15;
            dbg.emit('story/line', { key, speaker: 'station', text: '', seconds: LINES[key] });
          }
          if (mouthsAt < 0 && e.boss().mouths.every((m) => m === 1)) mouthsAt = now - t0;
        }
        return { said, shown, inspection, mouthsAt, p1, firstTell, shift: e.boss().parleyShift };
      };
      // ---- (a) nothing shows lines (this page before its first story/line): the written clock
      {
        dbg.god(true);
        dbg.teleport(14, -44, 84.5, 180, 0);
        const seq = H.seq(), t0 = ctx.clock.tick;
        dbg.setBossPhase('parley');
        await H.until(() => e.boss().phase === 'p1', 60 * 40);
        const ev = H.events(seq, /story\/say|boss\/parley|boss\/phase/);
        out.clock = {
          live: e.boss().storyLive,
          said: ev.filter((x) => x.name === 'story/say' && /parley|rv_ask/.test(x.payload.key)).map((x) => [x.payload.key, x.tick - t0]),
          inspection: ev.filter((x) => x.name === 'boss/parley' && x.payload.stage === 'inspection').map((x) => x.tick - t0),
          p1: ev.filter((x) => x.name === 'boss/phase' && x.payload.phase === 'p1').map((x) => x.tick - t0),
        };
      }
      // ---- (b) a free line box: shown as said, a quarter second a line for the breath between two
      out.free = await play(0, '');
      // ---- (c) the critic's case: the narrator holds the box for 9 s after the door seals
      out.late = await play(9 * 60, '');
      // ---- (d) the queue drops stn_parley_2 (the roll-call): its stage waits 14 s, then the asking goes on and the inspection still opens
      out.dropped = await play(0, 'stn_parley_2');
      // ---- (e) a shot while the last line still waits its turn is a refusal (the inspection has not begun); a shot in the inspection is not
      {
        ctx.enemies.clearAll(); e.bossAsked(false);   // (a first hearing: pass i3)
        await core.stepAsync(2);
        dbg.god(true);
        dbg.teleport(14, -44, 84.5, 180, 0);
        dbg.setBossPhase('parley');
        const seq = H.seq();
        await core.stepAsync(60);
        dbg.emit('weapon/fired', { ammo: 'lead_round', chamber: 0, shotId: 1, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 });
        await core.stepAsync(2);
        out.refused = { phase: e.boss().phase, events: H.events(seq, /boss\/parley/).map((x) => x.payload.stage) };
      }
      return out;
    });
    // (a)
    assert.equal(r.clock.live, false, 'no story/line had been heard in this page');
    assert.deepEqual(r.clock.said.map((x) => x[0]), ['stn_parley_1', 'nar_parley', 'rv_ask', 'stn_parley_2', 'stn_parley_4', 'nar_parley_kept']);
    const want = [0, 210, 450, 690, 960, 1200];
    r.clock.said.forEach((x, i) => assert.ok(Math.abs(x[1] - want[i]) <= 2, `${x[0]} at ${want[i]} ticks by the written clock (${x[1]})`));
    assert.ok(Math.abs(r.clock.inspection[0] - 960) <= 2 && Math.abs(r.clock.p1[0] - 1260) <= 2, `inspection at 16 s, phase 1 at 21 s (${r.clock.inspection}, ${r.clock.p1})`);
    // (b), (c), (d): the picture and the text agree
    for (const [name, run] of [['free', r.free], ['late', r.late], ['dropped', r.dropped]]) {
      assert.ok(run.shown.stn_parley_4 >= 0, `${name}: stn_parley_4 was shown`);
      assert.ok(Math.abs(run.inspection - run.shown.stn_parley_4) <= 1, `${name}: the inspection begins on the tick stn_parley_4 comes on screen (${run.inspection} against ${run.shown.stn_parley_4})`);
      assert.ok(run.mouthsAt >= run.shown.stn_parley_4 - 1 && run.mouthsAt <= run.shown.stn_parley_4 + 2, `${name}: all six mouths are told to open on that tick, not before (${run.mouthsAt})`);
      assert.ok(Math.abs(run.p1 - (run.shown.stn_parley_4 + 300)) <= 2, `${name}: phase 1 begins 5 s after the line appeared, so it is read before the first tell (${run.p1})`);
      assert.ok(run.said.nar_parley_kept !== undefined && Math.abs(run.said.nar_parley_kept - (run.shown.stn_parley_4 + 240)) <= 2, `${name}: the six shut and nar_parley_kept is said 4 s after it`);
      assert.ok(run.firstTell - run.p1 >= 270 && run.firstTell >= run.shown.nar_parley_kept + 4 * 60, `${name}: the first chamber glows 4.5 s into phase 1, when nar_parley_kept has been read (${run.firstTell} against p1 ${run.p1}, the line at ${run.shown.nar_parley_kept})`);
      const keys = Object.keys(run.shown);
      for (let i = 1; i < keys.length; i++) assert.ok(run.said[keys[i]] >= run.shown[keys[i - 1]], `${name}: ${keys[i]} is not asked for before ${keys[i - 1]} has come on screen (never more than one line of the asking waiting)`);
    }
    assert.ok(r.free.p1 <= 1260 + 5 * 20, `a free line box costs at most the breaths between five lines (${r.free.p1} ticks against 1 260)`);
    assert.ok(Math.abs(r.late.shown.stn_parley_1 - 540) <= 1 && r.late.p1 >= 1260 + 540 && r.late.p1 <= 1260 + 540 + 5 * 20, `9 s late: every stage 9 s later (phase 1 at ${r.late.p1})`);
    assert.ok(r.late.shift >= 9 && r.late.shift < 11.5, `shift ${r.late.shift}`);
    assert.equal(r.dropped.shown.stn_parley_2, undefined);
    assert.ok(r.dropped.said.stn_parley_4 - r.dropped.said.stn_parley_2 >= 14 * 60 - 2 && r.dropped.said.stn_parley_4 - r.dropped.said.stn_parley_2 <= 14 * 60 + 2, `a line that never shows holds its stage 14 s (${r.dropped.said.stn_parley_4 - r.dropped.said.stn_parley_2} ticks)`);
    // (e)
    assert.equal(r.refused.phase, 'p1');
    assert.ok(r.refused.events.includes('refused'));
  } finally { await game.close(); }
});

test('release p0: from the second death in phase 2 the retry holds its first attack 6.5 s, says hint_boss_move half a second in (again at 3 s if the line box did not take it) and does not repeat hint_boss_haul; a first death keeps 4 s and the haul line', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const out = {};
      dbg.god(true);
      dbg.teleport(14, -44, 84.5, 180, 0);
      dbg.setBossPhase('p2');
      await core.stepAsync(10);
      const save = ctx.enemies.captureSave();
      const retry = async (deaths, showIt, worldReset = true, sameRun = false) => {
        if (sameRun) ctx.enemies.clearEncounter('enc_windlass'); else ctx.enemies.clearAll();
        e.bossDeaths(0);
        const seq = H.seq(), t0 = ctx.clock.tick;
        ctx.enemies.applySave({ ...save, deathsInBossPhase: deaths });
        // the real game's respawn (seen in scratch/p0-team-enemies/stand_p2.log): the save is applied, THEN the world
        // resets the encounter and begins the boss again, all in one tick, and then she has control
        if (worldReset) { dbg.emit('encounter/reset', { id: 'enc_windlass' }); e.startBoss('p2', true); }
        dbg.emit('player/respawned', { checkpoint: 'cp_boss_p2' });
        let first = -1, haul = -1, seen = seq;
        for (let i = 0; i < 60 * 30 && haul < 0; i++) {
          await core.stepAsync(1);
          for (const x of dbg.events(seen)) {
            seen = x.seq;
            if (first < 0 && /boss\/mouth|boss\/indexing|boss\/discharge|enemy\/spawned/.test(x.name)) first = x.tick - t0;
            if (x.name === 'boss/haul' && x.payload.on) haul = x.tick - t0;
            if (showIt && x.name === 'story/say' && x.payload.key === 'hint_boss_move') dbg.emit('story/line', { key: 'hint_boss_move', speaker: 'narrator', text: '', seconds: 5.5 });
          }
        }
        await core.stepAsync(5);
        const says = H.events(seq, /story\/say/).map((x) => [x.payload.key, x.tick - t0]);
        return { lead: e.boss().lead, first, haul, move: says.filter((x) => x[0] === 'hint_boss_move').map((x) => x[1]), haulHint: says.filter((x) => x[0] === 'hint_boss_haul').length };
      };
      out.one = await retry(1, true);
      out.two = await retry(2, true);
      out.twoUnshown = await retry(2, false);
      out.five = await retry(5, true);
      out.oneNoReset = await retry(1, true, false);
      out.oneAgain = await retry(1, true, true, true);      // the same run: phase 2 has said the haul line once already
      return out;
    });
    assert.equal(r.one.lead, 4, 'a first death: the 4 s of polish round 5 (which the world\'s encounter reset used to cut to 1.5)');
    assert.equal(r.oneNoReset.first, r.one.first, 'the same with and without the encounter reset');
    assert.equal(r.oneAgain.haulHint, 0, 'the haul line is said once per phase of a run, not on every try (the line box replays a hint a death cut off)');
    assert.deepEqual(r.one.move, [], 'and no direct hint yet');
    assert.equal(r.one.haulHint, 1, 'the haul line teaches the rule at the first haul of the first retry (phase 2 had not said it)');
    assert.ok(r.one.first >= 240 - 92 && r.one.first <= 245, `the guard slides on inside the 4 s, nothing else (${r.one.first})`);
    for (const [name, run] of [['two', r.two], ['five', r.five]]) {
      assert.equal(run.lead, 6.5, `${name}: 6.5 s`);
      assert.equal(run.move.length, 1, `${name}: the direct hint once (it was shown)`);
      assert.ok(Math.abs(run.move[0] - 30) <= 2, `${name}: half a second after the restore (${run.move[0]} ticks)`);
      assert.equal(run.haulHint, 0, `${name}: the haul line is not repeated on this try`);
      assert.ok(run.haul > r.one.haul + 140, `${name}: the first pattern starts 2.5 s later than after one death (${run.haul} against ${r.one.haul})`);
    }
    assert.deepEqual(r.twoUnshown.move.map((t) => Math.round(t / 10) * 10), [30, 180], 'not shown the first time: said once more at 3 s, and no third time');
    assert.ok(r.twoUnshown.haul - r.two.haul >= 260 && r.twoUnshown.haul - r.two.haul <= 280, `while the line box has not shown it the lead-in holds, 11 s at most (the haul ${r.twoUnshown.haul - r.two.haul} ticks later than when it was shown at once)`);
  } finally { await game.close(); }
});
