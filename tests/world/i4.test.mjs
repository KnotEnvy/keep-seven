// Pass i4 (the eighteen issues the two story reviewers and the regression review gave the world team:
// scratch/lead/carryover-issues.json). The real world beside five core stubs; the legs that need the real game are in
// i4_real.test.mjs. Each test names what was measured before the fix.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, STORY, hintClock, mark, marker, open, server, shoot, status } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lines = async (game, since) => (await game.events(since, 'story/line')).map((e) => ({ key: e.payload.key, tick: e.tick, ticks: Math.round(e.payload.seconds * 60) }));
const keys = async (game, since) => (await lines(game, since)).map((l) => l.key);
const tp = (m, yaw = 0, pitch = 0) => ({ call: ['teleport', m.pos[0], m.pos[1], m.pos[2], yaw, pitch] });
const emit = (name, payload) => ({ call: ['emit', name, payload] });
const say = (game, key) => game.page.evaluate((k) => window.__dbg.ext.world.say(k), key);
const hintsOf = async (game, since, key) => (await game.events(since, 'ui/hint')).filter((e) => e.payload.key === key).map((e) => ({ show: e.payload.show, tick: e.tick }));
const flags = async (game) => (await game.state()).systems.world.flags;

// ---- the jug gate's worded hints (the regression review's major) ------------------------------------------------------------
test('the jug gate: a player who never looked at the Rule is told the worded hints (they were dropped for as long as the Rule\'s line waited for a look)', async () => {
  const G = marker('trg_glare'), stand = marker('trg_pz_jugs').params.standSpot;
  for (const six of [false, true]) {
    const game = await open(srv, { checkpoint: 'cp_lip_start' });
    try {
      // out of the overhang with her eyes on the ground (the Rule is never in her view), and down to the gate
      await game.run([{ steps: 30 }, tp(G, 0, -70), { steps: 3 }, { call: ['teleport', stand[0], stand[1], stand[2], 0, -70] }, { steps: 40 * 60 }]);
      let st = await status(game);
      assert.deepEqual(st.story.waiting, ['nar_rule'], 'the Rule\'s line is still waiting for a look north');
      assert.equal(st.story.current, '');
      if (six) for (let i = 1; i <= 6; i++) await game.run([{ aimAtEntity: ['ia_jug_' + i] }, { tap: 'fire', steps: 20 }]);
      if (six) await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 0, -70] }, { steps: 12 * 60 }]);
      assert.equal((await game.state()).puzzles.seven_jugs.step, six ? 6 : 0);
      const seq = await mark(game);
      await hintClock(game, 119.5);
      await game.run([{ steps: 60 }]);
      const t2 = six ? 'hint_jugs_2' : 'hint_jugs_2_few';
      assert.ok((await game.events(seq, 'puzzle/hint')).some((e) => e.payload.tier === 2), 'tier 2 is reached');
      assert.deepEqual(await keys(game, seq), [t2], `tier 2 is SAID: "${STORY.lines[t2].text}" (no line at all in 400 s: scratch/reg-playthrough/jugidle.mjs)`);
      await game.run([{ steps: 5 * 60 }]);
      await hintClock(game, 84.5);
      await game.run([{ steps: 6 * 60 }]);
      assert.deepEqual(await keys(game, seq), [t2, 'hint_jugs_3'], 'and tier 3: "The seventh hung high, on the dead pylon\'s arm."');
      st = await status(game);
      assert.ok(st.story.waiting.includes('nar_rule'), 'the Rule\'s line still waits for its look');
      // ... and is said when she does look
      const R = marker('vista_rule').params.target;
      await game.run([tp(G, 0, 0), { steps: 2 }, { aimAt: R, steps: 60 }]);
      assert.ok((await keys(game, seq)).includes('nar_rule'), 'a look north: the Rule\'s line');
    } finally { await game.close(); }
  }
});

// ---- the fire hint ----------------------------------------------------------------------------------------------------
test('"LEFT CLICK to fire" stands eight seconds, comes back once forty seconds on, and is gone for good; it goes when the gate is open (it stood 400 s, and on after the gate had opened by itself)', async () => {
  const stand = marker('trg_pz_jugs').params.standSpot;
  let game = await open(srv, { checkpoint: 'cp_lip_start' });
  try {
    await game.run([{ steps: 30 }, { call: ['teleport', stand[0], stand[1], stand[2], 0, 0] }, { steps: 2 }]);
    const seq = await mark(game);
    await game.run([{ steps: 130 * 60 }]);
    const h = await hintsOf(game, seq, 'ui_hint_fire');
    assert.deepEqual(h.map((x) => x.show), [true, false, true, false], `shown twice (${JSON.stringify(h)})`);
    assert.ok(Math.abs((h[1].tick - h[0].tick) / 60 - 8) <= 0.1, `eight seconds (${(h[1].tick - h[0].tick) / 60})`);
    assert.ok(Math.abs((h[2].tick - h[1].tick) / 60 - 40) <= 0.2, `again forty seconds on (${(h[2].tick - h[1].tick) / 60})`);
    assert.ok(Math.abs((h[3].tick - h[2].tick) / 60 - 8) <= 0.1, 'eight seconds again');
    assert.deepEqual((await status(game)).interact.hints.filter((k) => k === 'ui_hint_fire'), [], 'not on screen after that');
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_lip_start' });
  try {
    await game.run([{ steps: 30 }, { call: ['teleport', stand[0], stand[1], stand[2], 0, 0] }, { steps: 5 * 60 }]);
    assert.ok((await status(game)).interact.hints.includes('ui_hint_fire'), 'up at the gate');
    const seq = await mark(game);
    await game.dbg('solvePuzzle', 'seven_jugs');
    await game.run([{ steps: 3 }]);
    assert.deepEqual((await hintsOf(game, seq, 'ui_hint_fire')).map((x) => x.show), [false], 'the gate is open: the hint goes');
    await game.run([{ steps: 60 * 60 }]);
    assert.equal((await hintsOf(game, seq, 'ui_hint_fire')).filter((x) => x.show).length, 0, 'and does not come back at an open gate');
  } finally { await game.close(); }
});

// ---- paired lines -----------------------------------------------------------------------------------------------------
test('a pair is one unit: when "A chair at the head..." goes stale, "He had not turned them on her..." is not said without it, waiting or asked for later', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 25 * 60 }]);                          // the room's three lines
    const seq = await mark(game);
    // 26 s of talk in front of the chair's line (asked for a tick later: its own batch), its second half behind it
    for (const k of ['nar_marks', 'nar_jugs_sand', 'nar_jugs_open', 'nar_plenty', 'nar_open_1']) await say(game, k);
    await game.run([{ steps: 1 }]);
    await say(game, 'nar_tally_chair');
    await game.run([{ steps: 1 }]);
    await say(game, 'nar_tally_chair_2');
    await game.run([{ steps: 40 * 60 }]);
    const said = await keys(game, seq);
    assert.ok(!said.includes('nar_tally_chair'), `the first half went stale behind 26 s of talk (${said.join(' ')})`);
    assert.ok(!said.includes('nar_tally_chair_2'), 'and the second half is not said without it (it was, 78 s in: scratch/i4-story-b/H_tally.log)');
    const f = await flags(game);
    assert.ok(f.includes('nar_tally_chair') && f.includes('nar_tally_chair_2'), 'both count as told');
    // asked for again later (the fight's end, another marker): still not said
    await say(game, 'nar_tally_chair_2');
    await game.run([{ steps: 8 * 60 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_tally_chair_2'));
  } finally { await game.close(); }
  // a continuation the story stands on is never lost that way, and a pair that is heard is heard whole
  const g2 = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await g2.dbg('god', true);
    await g2.run([{ steps: 25 * 60 }]);
    const seq = await mark(g2);
    await say(g2, 'nar_tally_chair'); await say(g2, 'nar_tally_chair_2');
    await g2.run([{ steps: 14 * 60 }]);
    assert.deepEqual(await keys(g2, seq), ['nar_tally_chair', 'nar_tally_chair_2']);
  } finally { await g2.close(); }
});

// ---- the hearth's line ------------------------------------------------------------------------------------------------
test('the hearth cup\'s line waits for the cup to be in her view and is dropped, unheard, when she leaves the Tally House without it', async () => {
  const cup = marker('prop_cup_two'), ledger = marker('rd_ledger'), street = marker('cp_yard_clear');
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 25 * 60 }]);
    const seq = await mark(game);
    // at the ledger, the far end of the table, reading: 10.9 m from the hearth with her back to it
    await game.run([{ call: ['teleport', ledger.pos[0], 0, ledger.pos[2] + 1.2, 0, -30] }, { steps: 2 }]);
    await say(game, 'nar_tally_hearth');
    await game.run([{ steps: 30 * 60 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_tally_hearth'), 'not said over the ledger (it was: scratch/i4-story-a/brisk_tally.log, 43.3 s)');
    assert.ok((await status(game)).story.waiting.includes('nar_tally_hearth'), 'it waits (and is not stale after thirty seconds of waiting)');
    // a hint is not held back by it
    await say(game, 'hint_daylight_2');
    await game.run([{ steps: 5 }]);
    assert.ok((await keys(game, seq)).includes('hint_daylight_2'), 'a hint line passes a line that only waits');
    await game.run([{ steps: 6 * 60 }]);
    // out into the street without ever turning to the hearth: dropped, and counted as told
    await game.run([tp(street, 90), { steps: 30 }]);
    assert.equal((await game.state()).world.zone, 'plenty_street');
    const st = await status(game);
    assert.ok(!st.story.waiting.includes('nar_tally_hearth') && st.story.lastDropped === 'nar_tally_hearth', `dropped on leaving (${JSON.stringify(st.story)})`);
    assert.ok(!(await keys(game, seq)).includes('nar_tally_hearth'));
  } finally { await game.close(); }
});

// ---- the proving plate's lines and the file -----------------------------------------------------------------------------
test('the cast plate\'s three lines are one set: asked for inside the file fight they wait for its end; begun before it they are heard out before "Six, in a queue"', async () => {
  const plate = marker('rd_plate_proving').params.lines;
  assert.deepEqual(plate, ['nar_plate_1', 'nar_plate_2', 'nar_plate_3']);
  // (a) the fight is on before the first has begun
  let game = await open(srv, { checkpoint: 'cp_gallery_bay' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    await game.page.evaluate(() => window.__dbg.ext.world.forceDoor('ia_baffle', 'open'));
    await game.run([{ steps: 2 }]);
    assert.notEqual((await status(game)).director.enc_file.state, 'idle', 'the file is on');
    for (const k of plate) await say(game, k);
    await game.run([{ steps: 30 * 60 }]);
    assert.ok(!(await keys(game, seq)).some((k) => k.startsWith('nar_plate')), `none of the plate's lines is said inside the fight (two were, and the third after it: scratch/reg-playthrough sC.log) (${(await keys(game, seq)).join(' ')})`);
    const mid = await mark(game);
    await game.dbg('clearEncounter', 'enc_file');
    await game.run([{ steps: 20 * 60 }]);
    assert.deepEqual((await keys(game, mid)).filter((k) => k.startsWith('nar_plate')), plate, 'all three in the quiet after it, in order');
  } finally { await game.close(); }
  // (b) the first has begun when the baffle opens
  game = await open(srv, { checkpoint: 'cp_gallery_bay' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    for (const k of plate) await say(game, k);
    await game.run([{ steps: 60 }]);
    await game.page.evaluate(() => window.__dbg.ext.world.forceDoor('ia_baffle', 'open'));
    await game.run([{ steps: 25 * 60 }]);
    const said = await keys(game, seq);
    const i = (k) => said.indexOf(k);
    assert.ok(i('nar_plate_1') === 0 && i('nar_plate_2') === 1 && i('nar_plate_3') === 2, `the set is heard out (${said.join(' ')})`);
    assert.ok(i('nar_file') > i('nar_plate_3'), `"Six, in a queue, at the far door" follows it (${said.join(' ')})`);
  } finally { await game.close(); }
});

// ---- the sighting -----------------------------------------------------------------------------------------------------
test('the pursued man is never taken away inside her view: stared at, he stands; at forty seconds he goes down the far side under a line that says so', async () => {
  const DOWSER = marker('vista_dowser').params.target;
  assert.ok(STORY.lines.nar_dowser_down, 'the line exists (story.json, pass i4)');
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const dir = async () => (await status(game)).director;
    const ended = async (since) => (await game.events(since, 'vignette/state')).filter((e) => e.payload.id === 'vig_dowser' && e.payload.stage === 'ended');
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -88, 0, -10.5, 90, 0] }, { steps: 2 }, { aimAt: DOWSER, steps: 20 * 60 }]);
    assert.ok((await keys(game, seq)).includes('nar_dowser_seen'));
    assert.equal((await ended(seq)).length, 0, 'twenty seconds of looking at him: he stands (he was taken at 12 s, centred on screen: scratch/i4-story-a/H_dowser.log)');
    assert.ok(!(await keys(game, seq)).includes('nar_dowser_gone'), '"When she looked again" is not said to a player who never looked away');
    assert.notEqual((await game.state()).world.doors.door_tally, 'closed', 'the door has opened by its own clock');
    await game.run([{ steps: 19 * 60 }]);
    assert.equal((await ended(seq)).length, 0, 'thirty-nine seconds: still there');
    await game.run([{ steps: 100 }]);                                 // (pass i5: he comes up over the rim in the first 0.35 s, and the beat begins when he stands)
    const said = await lines(game, seq);
    const down = said.find((l) => l.key === 'nar_dowser_down');
    assert.ok(down, `at forty seconds: "He turned and went down the far side." (${said.map((l) => l.key).join(' ')})`);
    assert.ok((await dir()).sightDown >= 0 && (await ended(seq)).length === 0, 'he is going down, in view');
    await game.run([{ steps: 100 }]);
    const e = await ended(seq);
    assert.equal(e.length, 1, 'gone behind the skyline');
    assert.ok(Math.abs((e[0].tick - down.tick) / 60 - 1.5) <= 0.3, `a second and a half after the line began (${((e[0].tick - down.tick) / 60).toFixed(2)} s)`);
    assert.ok(!(await keys(game, seq)).includes('nar_dowser_gone'), 'and "When she looked again" is never said of it');
    await game.run([{ steps: 4 * 60 }]);
    assert.equal((await dir()).sight, 4, 'the sighting is over once the line has been heard');
  } finally { await game.close(); }
  // walked into the Tally House backwards, turned his way: the sighting is over, and (pass i6) nothing of him is left
  // standing. Pass i4 kept his card while it was in her frame; from inside the house her line to him is through its west
  // wall, never clean, and since pass i6 he is drawn nowhere her line to him is not clean (tests/world/i6.test.mjs)
  const g2 = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const door = marker('door_tally');
    const seq = await mark(g2);
    await g2.run([{ call: ['teleport', -88, 0, -10.5, 0, 0] }, { steps: 13 * 60 }]);
    assert.notEqual((await g2.state()).world.doors.door_tally, 'closed');
    await g2.run([{ call: ['teleport', door.pos[0], 0, door.pos[2] - 4, 90, 0] }, { steps: 2 }, { aimAt: DOWSER, steps: 30 }]);
    assert.equal((await g2.state()).world.zone, 'tally_house');
    const d = (await status(g2)).director;
    assert.equal(d.sight, 4, 'the sighting is over (the door is hers)');
    assert.deepEqual([d.sightGhost, d.sightUp, d.sightClean], [false, 0, false], 'behind the house wall: no card is left standing');
    assert.ok((await g2.events(seq, 'vignette/state')).some((e) => e.payload.id === 'vig_dowser' && e.payload.stage === 'ended'), 'taken away where she cannot see it go');
    await g2.run([{ aim: [0, 0], steps: 3 }]);
    assert.ok((await g2.events(seq, 'vignette/state')).some((e) => e.payload.id === 'vig_dowser' && e.payload.stage === 'ended'), 'out of her frame: taken away');
    assert.equal((await status(g2)).director.sightGhost, false);
  } finally { await g2.close(); }
});

// ---- the proving line on the end card -------------------------------------------------------------------------------------
test('the taught three-knot line is a "line of three or more" on the end card (it read 0: the assist bursts two of the knots, and the player\'s count saw one)', async () => {
  const game = await open(srv, { checkpoint: 'cp_gallery_bay' });
  try {
    const stepM = LAYOUT.solids.find((x) => x.id === 'gl_mark_step');
    assert.ok(stepM, 'the brass step');
    const top = stepM.pos[1] + stepM.size[1] / 2;
    await game.run([{ steps: 10 }, { call: ['teleport', stepM.pos[0], top + 0.01, stepM.pos[2], -90, 0] }, { steps: 5 }, { aimAtEntity: ['knot_a'] }, { steps: 2 }]);
    assert.equal((await status(game)).stats.linesOfThree, 0);
    const out = await shoot(game, 'line_round');
    await game.run([{ steps: 30 }]);
    const st = await game.state();
    assert.equal(st.puzzles.proving_line.solved, true, `the line round from the step solves it (${out.join(' ')})`);
    assert.equal((await status(game)).stats.linesOfThree, 1, 'counted, once');
  } finally { await game.close(); }
});

// ---- the kept round's hints under the Windlass's talk -----------------------------------------------------------------------
test('phase 3a: under a Windlass that says its refill lines every two seconds the kept round\'s worded hints are still said, and each refill line at most once in twenty seconds', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 600 }]);
    const seq = await mark(game);
    const t0 = (await game.state()).tick;
    await game.run([emit('boss/charge_required', {})]);
    // 44 s of the Windlass talking: a refill line every two seconds, the ask every eighteen
    for (let i = 0; i < 22; i++) {
      await game.run([emit('story/say', { key: i % 2 ? 'stn_boss_head_dry_refilling' : 'stn_boss_refilled' }), { steps: 120 }]);
      if (i % 9 === 4) await game.run([emit('story/say', { key: 'stn_boss_charge_required' })]);
    }
    const said = await lines(game, seq);
    const at = (k) => said.filter((l) => l.key === k).map((l) => (l.tick - t0) / 60);
    for (const k of ['stn_boss_refilled', 'stn_boss_head_dry_refilling']) {
      const t = at(k);
      assert.ok(t.length >= 1 && t.length <= 3, `${k}: ${t.length} times in 44 s (16 times in 80 s between the two: scratch/reg-playthrough/hints_kept.log)`);
      for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 19.9, `${k}: twenty seconds apart (${t.map((x) => x.toFixed(1)).join(', ')})`);
    }
    const h1 = at('hint_kept_1'), h2 = at('hint_kept_2');
    assert.ok(h1.length === 1 && h1[0] >= 15 && h1[0] <= 19, `tier 1's line within a line of its 15 s (${h1})`);
    assert.ok(h2.length === 1 && h2[0] >= 30 && h2[0] <= 34, `"The brass mark at the kerb. The seventh round. Down the bore." within a line of its 30 s (never said in 200 s) (${h2})`);
  } finally { await game.close(); }
});

// ---- the secrets' pointers --------------------------------------------------------------------------------------------
test('the secrets are pointed at so that they can be found: the bell rings under the loft with a glint on it; the cold bay\'s knot glints through its slot and the seam breathes', async () => {
  const rope = marker('sec_loft_bell_rope'), door = marker('door_cold_bay'), knot = marker('knot_cold_bay');
  let game = await open(srv, { checkpoint: 'cp_street_clear' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', rope.pos[0] + 8, 0, 0, 90, 0] }, { steps: 3 }]);
    const calls = (await game.state()).systems.render.calls;
    assert.ok((await game.events(seq, 'audio/cue')).some((e) => e.payload.cue === 'step_chime' && Math.abs(e.payload.x - rope.pos[0]) < 0.5), 'the bell rings');
    assert.ok(calls.some((c) => /halo/.test(JSON.stringify(c))), `a glint is acquired at the bell (${JSON.stringify(calls.slice(-4)).slice(0, 300)})`);
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 10 }, { call: ['teleport', door.pos[0], door.pos[1], door.pos[2] - 30, 0, 0] }, { steps: 10 * 60 }]);
    let seam = (await status(game)).interact.seams.find((s) => s[0] === 'sec_cold_bay');
    assert.ok(seam && seam[1] === true && seam[5] === 0, `thirty metres off: the seam glows, the knot does not glint (${JSON.stringify(seam)})`);
    await game.run([{ call: ['teleport', door.pos[0], door.pos[1], door.pos[2] - 6, 0, 0] }, { steps: 9 * 60 }]);
    seam = (await status(game)).interact.seams.find((s) => s[0] === 'sec_cold_bay');
    assert.ok(seam[5] >= 3 && seam[5] <= 4, `near it, a glint at the knot every four seconds (${seam[5]} in 9 s)`);
    // found: it stops
    await game.run([{ aimAtEntity: ['knot_cold_bay'] }, { steps: 1 }]);
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().world.debug.flags());
    await game.page.evaluate((k) => { const w = window.__dbg.ext.world; w.forceDoor('door_cold_bay', 'open'); return k; }, knot.id);
    await game.run([{ steps: 30 }]);
    const after = (await status(game)).interact.seams.find((s) => s[0] === 'sec_cold_bay');
    assert.ok((await game.state()).stats.secrets.includes('sec_cold_bay') ? after[1] === false : true, 'found: the pointer is gone');
  } finally { await game.close(); }
});

// ---- the last frame ---------------------------------------------------------------------------------------------------
test('the ending\'s eased view comes to rest level (within 1.5 degrees), so a true vertical is drawn vertical: the "dead plumb" thread leaned 7 degrees in a frame pitched up 8.8', async () => {
  const ARRIVE = marker('trg_rim_arrive'), STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), EXIT = marker('exit_rim');
  for (const branch of ['take', 'leave']) {
    const game = await open(srv, { checkpoint: 'cp_rim' });
    try {
      const seq = await mark(game);
      await game.run([tp(ARRIVE), { steps: 20 }, tp(STONE, 90), { steps: 2 }, { aimAt: ROUND.pos, steps: 2 }]);
      if (branch === 'take') await game.run([{ tap: 'interact', steps: 4 }]);
      else {
        await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 90 * 60);
        await game.run([{ call: ['teleport', EXIT.pos[0] - 6, EXIT.pos[1], EXIT.pos[2] + 0.2, 180, -40] }, { steps: 3 }]);
      }
      const card = await game.until({ event: 'ending/card' }, 200 * 60);
      assert.ok(card.met, `${branch}: the card`);
      const p = await game.dbg('player');
      assert.ok(Math.abs(p.pitchDeg) <= 1.5, `${branch}: the last frame is level (pitch ${p.pitchDeg.toFixed(2)} degrees; it was 8.8)`);
      const fire = (await game.events(seq, 'ending/fire'))[0];
      assert.ok(fire, 'the fire');
      const bearing = Math.atan2(-(fire.payload.x - p.x), -(fire.payload.z - p.z)) * 180 / Math.PI;
      const off = Math.abs((((p.yawDeg - bearing) % 360) + 540) % 360 - 180);
      assert.ok(off <= 1, `${branch}: and turned to the fire (${off.toFixed(2)} degrees off)`);
      if (branch === 'leave') {
        // the leave branch: the scenery lines she was owed come before its own two; nothing between "Six, then." and the fire
        const said = await keys(game, (await game.events(seq, 'ending/stone'))[0].seq);
        const leave = STORY.meta.rules.ending_branch.leave;
        assert.deepEqual(said.slice(-leave.length), leave, `the branch's lines and the fire's are the last, unbroken (${said.join(' ')})`);
        assert.ok(said.indexOf('nar_rim_3') >= 0 && said.indexOf('nar_rim_3') < said.indexOf('nar_leave'), 'the Rule\'s line comes before "She left it on the stone"');
      }
    } finally { await game.close(); }
  }
});

// ---- the asking's first line ------------------------------------------------------------------------------------------
test('the asking\'s first line takes a narrator\'s line about the room behind her down once it has had 60 % of its hold (GDD 23.18; it waited the line out: 2.1 s more of standing)', async () => {
  const game = await open(srv, { checkpoint: 'cp_bore_ante' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 20 * 60 }]);
    const seq = await mark(game);
    await say(game, 'nar_marks');                                   // a narrator's line the story does not stand on, 5.5 s
    await game.run([{ steps: 120 }, emit('story/say', { key: 'stn_parley_1' }), { steps: 7 * 60 }]);
    const said = await lines(game, seq);
    const e = said.find((l) => l.key === 'nar_marks'), p = said.find((l) => l.key === 'stn_parley_1');
    assert.ok(e && p, said.map((l) => l.key).join(' '));
    const after = (p.tick - e.tick) / 60;
    assert.ok(after >= 3.25 && after <= 3.4, `at 60 % of its 5.5 seconds (${after.toFixed(2)} s; it was 5.75)`);
    assert.equal(p.ticks, Math.round(3.5 * 60), 'held its own 3.5 s');
  } finally { await game.close(); }
});

// ---- the Tally House's rising ------------------------------------------------------------------------------------------
test('the Tally House: the two do not stand together: the one nearer her at once, the other 2.5 s on (the rising was over in 1.6 s: both shot as they stood up)', async () => {
  const KNOT = marker('knot_hatch_latch'), W = marker('sp_tally_riser_w'), E = marker('sp_tally_riser_e');
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await game.run([{ call: ['solvePuzzle', 'daylight'] }, { steps: 30 }, { call: ['teleport', KNOT.pos[0], 0, KNOT.pos[2] - 2, 180, 0] }, { steps: 2 }]);
    const seq = await mark(game);
    await game.run([{ aimAtEntity: ['knot_hatch_latch'] }, { tap: 'fire', steps: 1 }]);
    const enc = async () => (await status(game)).director.enc_tally;
    await game.run([{ steps: 70 }]);
    let e = await enc();
    assert.equal(e.state, 'active', JSON.stringify(e));
    assert.equal(e.alive, 1, 'one is up 1.2 s in');
    const p = await game.dbg('player');
    const d = (m) => Math.hypot(m.pos[0] - p.x, m.pos[2] - p.z);
    const up = (await game.dbg('enemies')).filter((x) => x.alive && x.state !== 'dormant');
    assert.ok(up.length >= 1);
    await game.run([{ steps: 100 }]);
    e = await enc();
    assert.equal(e.alive, 1, 'still one at 2.8 s');
    await game.run([{ steps: 50 }]);
    e = await enc();
    assert.equal(e.alive, 2, 'the second stands 2.5 s after the first (3.3 s after the knot)');
    const cues = (await game.events(seq, 'audio/cue')).filter((c) => c.payload.cue === 'chairs_scrape');
    assert.equal(cues.length, 2, 'a chair scrapes for each');
    const first = Math.abs(cues[0].payload.x - W.pos[0]) < 0.1 ? W : E, second = first === W ? E : W;
    assert.ok(Math.abs(cues[1].payload.x - second.pos[0]) < 0.1, 'the second scrape at the second riser');
    assert.ok(d(first) <= d(second), `the nearer one stood first (${d(first).toFixed(1)} m, ${d(second).toFixed(1)} m)`);
    // the fight is not over while the second is still to stand
    assert.equal((await game.events(seq, 'encounter/cleared')).length, 0);
  } finally { await game.close(); }
});
