// Pass i3 (story reviewer a: "Thirty seconds of standing through the parley": 29.9 s from the seal to phase 1, and the
// same wait on a second play). What src/enemies changed, one test each:
//   - the asking is exactly as long as its lines are HELD (the seconds `story/line` reports), and a line the story data
//     does not carry is not asked for. The closer of pass i3 made the reviewer's text change (one roll-call line, a
//     shorter first line): the inspection opens 17 s after the seal with a free line box (it was 22.75)
//   - the roll-call is shown: the six mouth lamps are dark from the seal and come on one by one as they are named
//   - on a second hearing in one page a shot does not refuse the inspection, it skips to it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('pass i3: the asking follows the holds its lines are shown with; the lamps of the six chambers come on in turn under the one roll-call line; 17 s to the inspection; with no roll-call in the data the lamps stand lit', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      // a stand-in for the world's line box: one line at a time, each held `holds[key]`, 15 ticks between two
      const play = async (holds) => {
        dbg.god(true);
        ctx.enemies.clearAll(); e.bossAsked(false);
        await core.stepAsync(2);
        dbg.teleport(14, -44, 84.5, 180, 0);
        const seq = H.seq(), t0 = ctx.clock.tick;
        dbg.setBossPhase('parley');
        const lampsAtStart = e.boss().lamps.join('');
        const queue = [], shown = {}, lampOn = [], ticks = [];
        let freeAt = t0, seen = seq, inspection = -1, p1 = -1, lit = 0;
        for (let i = 0; i < 60 * 60 && p1 < 0; i++) {
          await core.stepAsync(1);
          const now = ctx.clock.tick;
          for (const x of dbg.events(seen)) {
            seen = x.seq;
            if (x.name === 'story/say' && holds[x.payload.key] !== undefined) queue.push(x.payload.key);
            if (x.name === 'boss/parley' && x.payload.stage === 'inspection') inspection = now - t0;
            if (x.name === 'boss/phase' && x.payload.phase === 'p1') p1 = now - t0;
            if (x.name === 'audio/cue' && x.payload.cue === 'listen_tick') ticks.push(now - t0);
          }
          if (queue.length > 0 && now >= freeAt) {
            const key = queue.shift();
            shown[key] = now - t0;
            freeAt = now + Math.round(holds[key] * 60) + 15;
            dbg.emit('story/line', { key, speaker: 'station', text: '', seconds: holds[key] });
          }
          const b = e.boss();
          const n = b.lamps.filter((v) => v === 1).length;
          // (they come on in order: lamp k is never lit before lamp k - 1)
          while (lit < n && inspection < 0) { lampOn.push([now - t0, b.lamps.join('')]); lit++; }
        }
        return { lampsAtStart, shown, lampOn, ticks, inspection, p1, keys: e.boss().parleyKeys, lampsAfter: e.boss().lamps.join('') };
      };
      const out = {};
      // ---- today's text as the world holds it (design/story.json: one roll-call line)
      out.today = await play({ stn_parley_1: 3.5, nar_parley: 4, rv_ask: 4, stn_parley_2: 4.5, stn_parley_4: 5, nar_parley_kept: 4.5 });
      // ---- the same keys, every hold changed by the world alone (no data change): the stages follow what is SHOWN
      out.held = await play({ stn_parley_1: 3, nar_parley: 3.5, rv_ask: 3.5, stn_parley_2: 4, stn_parley_4: 5, nar_parley_kept: 4.5 });
      // ---- a text without a roll-call (the story data is the page's own copy): the line is not asked for
      const lines = ctx.data.story.lines, was = lines.stn_parley_2;
      try {
        delete lines.stn_parley_2;
        out.bare = await play({ stn_parley_1: 3.5, nar_parley: 4, rv_ask: 4, stn_parley_2: 4.5, stn_parley_4: 5, nar_parley_kept: 4.5 });
      } finally { lines.stn_parley_2 = was; }
      return out;
    });
    const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 3, `${what}: ${got} ticks (want ${want})`);
    // today (pass i4: four lines, the narrator's has left the asking): 3.5 + 4 + 4.5 s of text and three breaths: the
    // inspection 12.75 s after the seal, phase 1 at 17.75 (17 and 22 in pass i3)
    assert.deepEqual(r.today.keys, ['stn_parley_1', 'rv_ask', 'stn_parley_2', 'stn_parley_4']);
    assert.equal(r.today.shown.stn_parley_3, undefined, 'the second roll-call line is gone');
    near(r.today.inspection, 12.75 * 60, 'today, the inspection');
    near(r.today.p1, 17.75 * 60, 'today, phase 1');
    assert.ok(Math.abs(r.today.shown.stn_parley_4 - r.today.inspection) <= 1, 'the six open on the tick the line appears');
    // the roll-call lamps: all dark from the seal, chamber k at the middle of its sixth of the line, all six lit before the inspection
    assert.equal(r.today.lampsAtStart, '000000', 'the six lamps are dark until they are named');
    assert.deepEqual(r.today.lampOn.map((x) => x[1]), ['100000', '110000', '111000', '111100', '111110', '111111'], 'in order, one at a time');
    const one = r.today.shown.stn_parley_2;
    [0, 1, 2, 3, 4, 5].forEach((k) => near(r.today.lampOn[k][0], one + Math.round((k + 0.5) / 6 * 270), `today, lamp ${k + 1}`));
    assert.equal(r.today.ticks.length, 6, `a tick for each lamp (${r.today.ticks})`);
    assert.ok(r.today.lampOn[5][0] < r.today.inspection, 'the sixth is lit before the six open');
    assert.equal(r.today.lampsAfter, '111111');
    // held shorter by the world alone: 3 + 3.5 + 4 = 10.5 s and three breaths
    near(r.held.inspection, 11.25 * 60, 'shorter holds, the inspection');
    near(r.held.p1, 16.25 * 60, 'shorter holds, phase 1');
    near(r.held.lampOn[3][0], r.held.shown.stn_parley_2 + Math.round(3.5 / 6 * 240), 'shorter holds, lamp 4');
    // no roll-call in the data: 3.5 + 4 and two breaths; the lamps are not put out
    assert.deepEqual(r.bare.keys, ['stn_parley_1', 'rv_ask', 'stn_parley_4']);
    assert.equal(r.bare.shown.stn_parley_2, undefined, 'a line the data does not carry is not asked for');
    near(r.bare.inspection, 8 * 60, 'no roll-call, the inspection');
    near(r.bare.p1, 13 * 60, 'no roll-call, phase 1');
    assert.equal(r.bare.lampsAtStart, '111111', 'with no roll-call the lamps stand lit, as at rest');
  } finally { await game.close(); }
});

test('pass i3: a second hearing can be cut short: once an asking has been heard out in this page, a shot before the inspection skips to stn_parley_4 and the open mouths (the gift is still hers); a first hearing still refuses', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      const HOLD = { stn_parley_1: 3.5, nar_parley: 4, rv_ask: 4, stn_parley_2: 4.5, stn_parley_4: 5, nar_parley_kept: 4.5 };
      const fire = () => dbg.emit('weapon/fired', { ammo: 'lead_round', chamber: 0, shotId: 1, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 });
      // `shots`: ticks after the seal at which she fires; `live`: a line box shows the lines
      const play = async (shots, live, takeGift) => {
        dbg.god(true);
        await core.stepAsync(2);
        dbg.teleport(14, -44, 84.5, 180, 0);
        const seq = H.seq(), t0 = ctx.clock.tick;
        dbg.setBossPhase('parley');
        const queue = [], shown = {}, said = [];
        let freeAt = t0, seen = seq, inspection = -1, p1 = -1, hits = [];
        for (let i = 0; i < 60 * 45 && p1 < 0; i++) {
          await core.stepAsync(1);
          const now = ctx.clock.tick;
          if (shots.includes(now - t0)) fire();
          for (const x of dbg.events(seen)) {
            seen = x.seq;
            if (x.name === 'story/say') { said.push(x.payload.key); if (live && HOLD[x.payload.key] !== undefined) queue.push(x.payload.key); }
            if (x.name === 'boss/parley' && x.payload.stage === 'inspection') inspection = now - t0;
            if (x.name === 'boss/phase' && x.payload.phase === 'p1') p1 = now - t0;
          }
          if (live && queue.length > 0 && now >= freeAt) {
            const key = queue.shift();
            shown[key] = now - t0;
            freeAt = now + Math.round(HOLD[key] * 60) + 15;
            dbg.emit('story/line', { key, speaker: 'station', text: '', seconds: HOLD[key] });
          }
          if (takeGift && inspection >= 0 && hits.length < 2 && now - t0 > inspection + 30 + hits.length * 30 && e.boss().phase === 'parley') hits.push(e.shootBoss('knot', hits.length).outcome);
        }
        const b = e.boss();
        return { said, shown, inspection, p1, hits, pips: b.pips, phase: b.phase, stages: H.events(seq, /boss\/parley/).map((x) => x.payload.stage), lamps: b.lamps.join('') };
      };
      const out = {};
      // ---- where nothing shows lines (this page before its first story/line: the written clock) the six open at once
      ctx.enemies.clearAll(); e.bossAsked(true);
      out.skipClock = await play([120], false, false);
      ctx.enemies.clearAll(); e.bossAsked(false);
      // ---- a fresh page: nothing heard yet. A shot is a refusal, as it was.
      ctx.enemies.clearAll();
      out.fresh = e.boss().askedBefore;
      out.first = await play([300], true, false);
      out.askedAfterRefusal = e.boss().askedBefore;
      // ---- a new run in the same page (clearAll is what a new run does): she has heard it. The shot skips.
      ctx.enemies.clearAll();
      out.keptOverNewRun = e.boss().askedBefore;
      // 2 s in, with "LIFT HEAD PRESENTING" on screen for 1.5 s more; a second impatient shot half a second later
      out.skip = await play([120, 150], true, true);
      // ---- no shot: a second hearing left alone runs its whole length
      ctx.enemies.clearAll();
      out.patient = await play([], true, false);
      // ---- a save from past the asking, restored into a fresh memory: the fight is past it, so she has heard one
      ctx.enemies.clearAll(); e.bossAsked(false);
      ctx.enemies.applySave({ bossPhase: 'p2', parleyHeard: true, deathsInBossPhase: 0, statics: [] });
      out.afterRestore = e.boss().askedBefore;
      ctx.enemies.clearAll(); e.bossAsked(false);
      return out;
    });
    assert.equal(r.fresh, false);
    assert.deepEqual(r.first.stages, ['start', 'refused'], 'a first hearing: a shot refuses the inspection');
    assert.ok(r.first.said.includes('stn_parley_refused') && r.first.p1 <= 303 && r.first.pips === 26, `phase 1 at once, no gift (${r.first.p1}, ${r.first.pips})`);
    assert.equal(r.askedAfterRefusal, true);
    assert.equal(r.keptOverNewRun, true, 'a new run in the same page does not forget it');
    // the skip
    assert.deepEqual(r.skip.stages, ['start', 'inspection', 'kept', 'end'], `a shot on a second hearing is not a refusal (${r.skip.stages})`);
    assert.ok(!r.skip.said.includes('stn_parley_refused'));
    assert.deepEqual(r.skip.said.filter((k) => /parley|rv_ask/.test(k)), ['stn_parley_1', 'stn_parley_4', 'nar_parley_kept'], `the lines between are passed over (${r.skip.said})`);
    assert.ok(Math.abs(r.skip.shown.stn_parley_4 - r.skip.inspection) <= 1, 'the six open on the tick stn_parley_4 appears');
    assert.ok(Math.abs(r.skip.inspection - (3.5 * 60 + 15)) <= 3, `behind the line that was up and no later: ${r.skip.inspection} ticks (3.75 s; unskipped 17 s)`);
    assert.deepEqual(r.skip.hits, ['weak', 'weak'], 'the gift of two is still hers');
    assert.equal(r.skip.pips, 24);
    assert.ok(Math.abs(r.skip.p1 - (r.skip.inspection + 300)) <= 2, `phase 1 five seconds after the six opened (${r.skip.p1})`);
    assert.equal(r.skip.lamps, '111111');
    assert.ok(r.skipClock.inspection >= 120 && r.skipClock.inspection <= 123, `with no line box the six open at once (${r.skipClock.inspection})`);
    assert.deepEqual(r.skipClock.stages, ['start', 'inspection', 'kept', 'end']);
    // left alone it is whole
    assert.deepEqual(r.patient.said.filter((k) => /parley|rv_ask/.test(k)), ['stn_parley_1', 'rv_ask', 'stn_parley_2', 'stn_parley_4', 'nar_parley_kept']);
    assert.ok(Math.abs(r.patient.inspection - 12.75 * 60) <= 3, `${r.patient.inspection}`);
    assert.equal(r.afterRestore, true, 'a restore past the asking counts as having heard one');
  } finally { await game.close(); }
});
