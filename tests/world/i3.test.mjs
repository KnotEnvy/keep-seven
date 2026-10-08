// Pass i3 (the two story reviewers' issues for the world team): lines said while their subject is on screen (PRESENT
// lines, look gates, the kneeler's held start, the Rule's lines), the interact reach, the run hint, the kept key off the
// mark, the Windlass's defence taught at the first hit and the first retry. The real world beside five core stubs; the
// legs that need the real Windlass, the real player or the HUD are in i3_real.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY, mark, marker, open, server, shootScript, status, takeRound } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lines = async (game, since) => (await game.events(since, 'story/line')).map((e) => ({ key: e.payload.key, tick: e.tick, ticks: Math.round(e.payload.seconds * 60) }));
const keys = async (game, since) => (await lines(game, since)).map((l) => l.key);
const tp = (m, yaw = 0) => ({ call: ['teleport', m.pos[0], m.pos[1], m.pos[2], yaw, 0] });
const emit = (name, payload) => ({ call: ['emit', name, payload] });
const say = (game, key) => game.page.evaluate((k) => window.__dbg.ext.world.say(k), key);
const pos = (game) => game.page.evaluate(() => { const p = window.__dbg.player(); return [p.x, p.y, p.z]; });
const hintsOf = async (game, since, key) => (await game.events(since, 'ui/hint')).filter((e) => e.payload.key === key).map((e) => ({ show: e.payload.show, tick: e.tick }));

// ---- the peg stair ------------------------------------------------------------------------------------------------------
test('the peg stair: the peg lines begin on flight 1 (not on the floor above it); the second is dropped when its turn comes with her off the foot of the stair', async () => {
  const CP = marker('cp_tally_hatch'), W = marker('prop_watcher'), T = marker('trg_watcher'), BAY = marker('cp_gallery_bay');
  let game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.run([{ call: ['teleport', CP.pos[0], CP.pos[1], CP.pos[2], 90, 0] }, { steps: 30 * 60 }]);
    // (the checkpoint is the fight's end: the hatch stands open. Shut, as it is during the fight:)
    await game.page.evaluate(() => window.__dbg.ext.world.forceDoor('ia_hatch', 'closed'));
    const seq = await mark(game);
    // on the lid, over the stair's first steps: nothing (the fight is there)
    await game.run([{ call: ['teleport', CP.pos[0] + 2.6, CP.pos[1], CP.pos[2], -90, 0] }, { steps: 60 }]);
    assert.deepEqual(await keys(game, seq), [], 'on the Tally House floor the stair says nothing');
    assert.equal((await game.events(seq, 'story/card')).length, 0, 'and shows no card');
    // looking at where the first flight's coats hang, through a hatch that is shut: nothing
    await game.run([{ call: ['teleport', CP.pos[0], CP.pos[1], CP.pos[2], -90, 0] }, { steps: 2 }, { aimAt: [-90.5, -1.2, -33], steps: 60 }]);
    assert.deepEqual(await keys(game, seq), [], 'the shut hatch hides the stair: nothing is said of it');
    await game.page.evaluate(() => window.__dbg.ext.world.forceDoor('ia_hatch', 'open'));
    await game.run([{ call: ['teleport', CP.pos[0], CP.pos[1], CP.pos[2], 90, 0] }, { steps: 2 }]);
    // two metres down flight 1 (the coats begin at the hatch: shots/i3-story-a/G_s0.png)
    await game.run([{ call: ['teleport', -91, -1.33, -33, -90, 0] }, { steps: 3 }]);
    assert.deepEqual(await keys(game, seq), ['nar_pegs_1'], '"Coats on pegs" from the first flight');
    assert.deepEqual((await game.events(seq, 'story/card')).map((e) => e.payload.key), ['card_iv']);
    // a continuous walk: four metres into the bay before the first line is over; the second line is about the stair
    await game.run([{ call: ['teleport', BAY.pos[0], BAY.pos[1], BAY.pos[2] + 4, 180, 0] }, { steps: 12 * 60 }]);
    const all = await keys(game, seq);
    assert.ok(!all.includes('nar_pegs_2'), `"The low pegs were bare" is not said in the bay (${all.join(' ')})`);
    assert.ok(all.includes('nar_ask'), `the question she means to ask is never lost (${all.join(' ')})`);
  } finally { await game.close(); }
  // the hatch open: a look down it from the Tally House floor starts the lines before she is on the stair
  game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.run([{ call: ['teleport', CP.pos[0], CP.pos[1], CP.pos[2], 90, 0] }, { steps: 30 * 60 }]);
    const seq = await mark(game);
    assert.deepEqual(await keys(game, seq), [], 'with her back to the hatch: nothing');
    await game.run([{ aimAt: [-90.5, -1.2, -33], steps: 40 }]);
    assert.deepEqual(await keys(game, seq), ['nar_pegs_1'], 'looking down the open hatch at the coats: "Coats on pegs, all the way down"');
    assert.ok((await pos(game))[1] > -0.1, 'from the floor above');
    // down at the foot of the stair, two strides into the bay, as the first line ends: the second is still said there
    await game.run([{ steps: 3 * 60 }, { call: ['teleport', BAY.pos[0], BAY.pos[1], BAY.pos[2] + 0.5, 180, 0] }, { steps: 8 * 60 }]);
    assert.deepEqual((await keys(game, seq)).slice(0, 2), ['nar_pegs_1', 'nar_pegs_2'], 'at the foot of the stair the pair is whole');
  } finally { await game.close(); }
  // she is still on the stair when the first line ends: both are said, and the watcher goes between them only on a look
  game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.run([{ call: ['teleport', CP.pos[0], CP.pos[1], CP.pos[2], 90, 0] }, { steps: 30 * 60 }]);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -91, -1.33, -33, -90, 0] }, { steps: 2 * 60 }, tp(T, 180), { steps: 4 * 60 }]);
    assert.deepEqual((await keys(game, seq)).slice(0, 2), ['nar_pegs_1', 'nar_pegs_2'], 'no look at the niche: the pair, back to back');
    // a look at the watcher under the second peg line: named next (ahead of the third line), and its second line with it
    await game.run([{ aimAt: [W.pos[0], W.pos[1] + 0.95, W.pos[2]], steps: 16 * 60 }]);
    const said = await lines(game, seq);
    const k = said.map((l) => l.key);
    assert.deepEqual(k.slice(0, 5), ['nar_pegs_1', 'nar_pegs_2', 'nar_watcher_1', 'nar_watcher_2', 'nar_ask'], k.join(' '));
    assert.ok(said[2].tick - (said[1].tick + said[1].ticks) <= 20, 'a breath after the line that was on screen');
  } finally { await game.close(); }
});

// ---- the Tally House's cloth --------------------------------------------------------------------------------------------
test('the share-cloth: its line is the next line when the north shutter opens, and is dropped (not kept for ever) once the cord is shot', async () => {
  const stand = marker('trg_pz_daylight').params.standSpot;
  assert.ok(STORY.meta.rules.never_stale.includes('nar_tally_cloth'), 'story.json still lists it (frozen): the world carries UNKEPT');
  // (a) the north shutter first, with two room lines waiting: the cloth's line is next
  let game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    await game.run([{ steps: 30 }, { call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 30 }, ...shootScript('ia_latch_n'), { steps: 20 * 60 }]);
    const said = await lines(game, seq);
    const k = said.map((l) => l.key);
    assert.deepEqual(k.slice(0, 3), ['nar_tally_1', 'nar_tally_2', 'nar_tally_cloth'], `behind the continuation of the line on screen, ahead of the rest (${k.join(' ')})`);
    assert.ok(k.includes('nar_tally_3'), 'the room line it went in front of is not made stale by it');
  } finally { await game.close(); }
  // (b) the shutter and the cord within two seconds, under a line: nothing is said about a cloth that is down
  game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    await game.run([{ steps: 30 }, { call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 30 }, ...shootScript('ia_latch_n'), { steps: 60 }, ...shootScript('ia_cloth_cord'), { steps: 60 * 60 }]);
    const k = await keys(game, seq);
    assert.ok(!k.includes('nar_tally_cloth'), `not said after the cloth has fallen (${k.join(' ')})`);
    assert.equal((await status(game)).story.lastDropped, 'nar_tally_cloth');
  } finally { await game.close(); }
});

// ---- the kneeler --------------------------------------------------------------------------------------------------------
test('the kneeler: the gate posts show the card and name the town; the fight and "Somebody knelt at the trough" begin when she is near it and turned to it, or within 20 m', async () => {
  const K = marker('sp_street_kneeler');
  let game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 20 * 60 }]);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -3, 0, 0, 90, 0] }, { steps: 6 * 60 }]);
    assert.deepEqual(await keys(game, seq), ['nar_plenty'], 'at the gate: the town is named, the kneeler (41 m off) is not');
    assert.deepEqual((await game.events(seq, 'story/card')).map((e) => e.payload.key), ['card_ii']);
    assert.equal((await game.state()).encounters.enc_street.state, 'idle', 'it kneels on');
    // 23 m off with her back to it: not yet; turned to it: the line and the fight
    await game.run([{ call: ['teleport', K.pos[0] + 23, 0, K.pos[2], -90, 0] }, { steps: 60 }]);
    assert.equal((await game.state()).encounters.enc_street.state, 'idle', 'inside 24 m, looking away: not yet');
    await game.run([{ call: ['teleport', K.pos[0] + 23, 0, K.pos[2], 90, 0] }, { steps: 2 }]);
    const started = (await game.events(seq, 'encounter/started')).find((e) => e.payload.id === 'enc_street');
    assert.ok(started, 'turned to it: the fight starts');
    await game.run([{ steps: 8 * 60 }]);
    const said = await lines(game, seq);
    const line = said.find((l) => l.key === 'nar_kneeler');
    assert.ok(line, `the kneeler's line (${said.map((l) => l.key).join(' ')})`);
    const wave = (await game.events(seq, 'encounter/wave')).find((e) => e.payload.id === 'enc_street' && e.payload.wave === 'A');
    assert.ok(line.tick - started.tick <= 20 && wave.tick - line.tick >= 150, `the line begins while it kneels: ${((wave.tick - line.tick) / 60).toFixed(2)} s before it stands (wave A)`);
  } finally { await game.close(); }
  // never turned to it: the fight begins at 20 m anyway (no dead end), and a round from the gate starts it as before
  game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -3, 0, 0, 90, 0] }, { steps: 30 }, { call: ['teleport', K.pos[0] + 20.5, 0, K.pos[2], -90, 0] }, { steps: 30 }]);
    assert.equal((await game.state()).encounters.enc_street.state, 'idle');
    await game.run([{ call: ['teleport', K.pos[0] + 19.5, 0, K.pos[2], -90, 0] }, { steps: 3 }]);
    assert.ok((await game.events(seq, 'encounter/started')).some((e) => e.payload.id === 'enc_street'), 'within 20 m whatever she faces');
  } finally { await game.close(); }
});

// ---- the gantry and the antechamber -----------------------------------------------------------------------------------
test('the Windlass line: said on a look through the gantry\'s grille; crossed without one, a ratchet turns on that side and the line waits for the look or the far end', async () => {
  const T = marker('trg_windlass_seen'), V = marker('vista_windlass');
  let game = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    await game.dbg('god', true);
    // (the bore is of the same resident set as the hall: she is put on the gantry without the ride)
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    // on the trigger, walking east along the gantry (the Windlass is 90 degrees to her right)
    await game.run([{ call: ['teleport', T.pos[0], T.pos[1], T.pos[2], -90, 0] }, { steps: 4 * 60 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_windlass_seen'), 'looking along the gantry: nothing is said of what hangs beside it');
    const cue = (await game.events(seq, 'audio/cue')).find((e) => e.payload.cue === 'ratchet');
    assert.ok(cue && Math.abs(cue.payload.z - V.params.target[2]) < 0.5, 'a ratchet turns over the bore: the ear is drawn that way');
    // she turns to it
    await game.run([{ aimAt: V.params.target, steps: 40 }]);
    const said = await lines(game, seq);
    assert.equal(said.at(-1)?.key, 'nar_windlass_seen', `on the look (${said.map((l) => l.key).join(' ')})`);
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    // never looks: said at the far end of the gantry, so it is never lost
    await game.run([{ call: ['teleport', T.pos[0], T.pos[1], T.pos[2], -90, 0] }, { steps: 30 }, { call: ['teleport', T.pos[0] + 6, T.pos[1], T.pos[2], -90, 0] }, { steps: 30 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_windlass_seen'), 'six metres on, still on the gantry: not yet');
    await game.run([{ call: ['teleport', T.pos[0] + 9.5, T.pos[1], T.pos[2], -90, 0] }, { steps: 30 }]);
    assert.ok((await keys(game, seq)).includes('nar_windlass_seen'), 'at the east landing it is said anyway');
  } finally { await game.close(); }
});

test('the embers: said when she turns to the camp; facing the door, nothing for six seconds, then only with the camp in frame, and at twenty seconds anyway', async () => {
  const T = marker('trg_ante_enter'), C = marker('prop_camp_three');
  const at = [C.pos[0], C.pos[1] + 0.3, C.pos[2]];
  for (const [name, turn] of [['turns to the camp 2 s in', 2], ['never turns', 0]]) {
    const game = await open(srv, { checkpoint: 'cp_hall_clear' });
    try {
      await game.dbg('god', true);
      await game.dbg('checkpoint', 'cp_bore_ante');
      const seq = await mark(game);
      const t0 = (await game.state()).tick;
      // in at the antechamber's door, facing the bore door (the camp is behind her and to the left)
      await game.run([{ call: ['teleport', T.pos[0], T.pos[1], T.pos[2], 180, 0] }, { steps: turn ? turn * 60 : 12 * 60 }]);
      assert.ok(!(await keys(game, seq)).includes('nar_embers_1'), `${name}: facing the door, the embers are not named`);
      if (turn) await game.run([{ aimAt: at, steps: 60 }]); else await game.run([{ steps: 10 * 60 }]);
      const said = await lines(game, seq);
      const e1 = said.find((l) => l.key === 'nar_embers_1');
      assert.ok(e1, `${name}: the embers' line (${said.map((l) => l.key).join(' ')})`);
      const s = (e1.tick - t0) / 60;
      if (turn) assert.ok(s <= turn + 4.5, `${name}: named ${s.toFixed(1)} s in, within a line of the look`);
      else assert.ok(s >= 19.5 && s <= 26, `${name}: at twenty seconds (${s.toFixed(1)} s)`);
    } finally { await game.close(); }
  }
});

// ---- the Rule -----------------------------------------------------------------------------------------------------------
test('"The Rule stood on the far edge of everything" waits for a look at the Rule, and is dropped when she leaves the gully without one', async () => {
  const G = marker('trg_glare'), R = marker('vista_rule').params.target;
  let game = await open(srv, { checkpoint: 'cp_lip_start' });
  try {
    await game.run([{ steps: 12 * 60 }]);                          // the camp's two lines
    const seq = await mark(game);
    // out from under the overhang with her back to the gully (looking at the camp): the seven are told, the Rule waits
    await game.run([{ call: ['teleport', G.pos[0], G.pos[1], G.pos[2], 180, 0] }, { steps: 14 * 60 }]);
    assert.deepEqual(await keys(game, seq), ['nar_seven'], 'facing away, the Rule is not described');
    await game.run([{ aimAt: R, steps: 60 }]);
    assert.deepEqual(await keys(game, seq), ['nar_seven', 'nar_rule'], 'she turns north: the Rule, in her view');
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_lip_start' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 12 * 60 }]);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', G.pos[0], G.pos[1], G.pos[2], 180, 0] }, { steps: 8 * 60 }]);
    await game.dbg('solvePuzzle', 'seven_jugs');
    await game.run([{ call: ['teleport', -30, 0, 0, 0, 0] }, { steps: 10 * 60 }]);
    const k = await keys(game, seq);
    assert.ok(!k.includes('nar_rule'), `not said on Front Street (${k.join(' ')})`);
  } finally { await game.close(); }
});

test('the rim: "Further than from the gully" is said on a look at the Rule against the thread, ahead of what waits; a player bent over the stone is not told it there', async () => {
  const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), ARRIVE = marker('trg_rim_arrive');
  const R = marker('vista_rim_rule').params.target, TOWN = marker('vista_plenty').params.target;
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    // off the lift and straight to the stone, eyes on it (the reviewer's brisk leg: the line went stale there)
    await game.run([tp(ARRIVE), { steps: 20 }, tp(STONE, 90), { steps: 2 }, { aimAt: ROUND.pos, steps: 2 }]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 90 * 60);
    await game.run([{ steps: 8 * 60 }]);
    let k = await keys(game, seq);
    assert.ok(!k.includes('nar_rim_3') && !k.includes('nar_rim_2'), `bent over the stone, the plain is not described (${k.join(' ')})`);
    // she looks up, between the town's thread and the Rule
    const mid = [(R[0] + TOWN[0] * 4) / 5, 30, (R[2] + TOWN[2] * 4) / 5];
    const p = await pos(game);
    const dirR = [R[0] - p[0], R[2] - p[2]], dirT = [TOWN[0] - p[0], TOWN[2] - p[2]];
    const yaw = (Math.atan2(-dirR[0], -dirR[1]) + Math.atan2(-dirT[0], -dirT[1])) / 2;
    await game.run([{ aimAt: [p[0] - Math.sin(yaw) * 100, p[1] + 1.65, p[2] - Math.cos(yaw) * 100], steps: 14 * 60 }]);
    void mid;
    const said = await lines(game, seq);
    k = said.map((l) => l.key);
    assert.deepEqual(k.slice(-2), ['nar_rim_2', 'nar_rim_3'], `the thread, then the Rule against it (${k.join(' ')})`);
    assert.equal((await game.events(seq, 'ending/stone')).length, 0, 'the choice is still hers');
  } finally { await game.close(); }
});

// ---- the reach ----------------------------------------------------------------------------------------------------------
test('the prompt never says more than the key: wherever a thing is offered (out to 3 m) the interact key uses it', async () => {
  const L = marker('ia_line_locker_bay');
  const game = await open(srv, { checkpoint: 'cp_gallery_bay' });
  try {
    await game.run([{ steps: 60 }]);
    const inst = (await status(game)).interact;
    assert.ok(inst.lockers.includes('ia_line_locker_bay'), 'the bay locker offers a round');
    for (const d of [2.9, 2.5]) {
      const seq = await mark(game);
      // straight out from the locker's face, at eye height to it
      await game.run([{ call: ['teleport', L.pos[0], L.pos[1], L.pos[2] - d, 180, 0] }, { steps: 2 }, { aimAtEntity: ['ia_line_locker_bay'], steps: 3 }]);
      const focus = (await game.state()).systems.world.interact.focus;
      if (focus !== 'ia_line_locker_bay') { assert.ok(d > 2.6, `no prompt at ${d} m is honest too (focus '${focus}')`); continue; }
      await game.run([{ tap: 'interact', steps: 3 }]);
      const used = (await game.events(seq, 'interact/used')).find((e) => e.payload.id === 'ia_line_locker_bay');
      assert.ok(used, `prompt up at ${d} m: E takes the round (it did nothing between 2.2 and 3.0 m)`);
      return;
    }
    assert.fail('the locker was never offered');
  } finally { await game.close(); }
});

// ---- the run hint -------------------------------------------------------------------------------------------------------
test('the run hint: fifteen metres down the gully it is shown beside the narrator\'s line (never under a card); a showing cut short by a puzzle does not count', async () => {
  const G = marker('trg_glare'), J = marker('trg_pz_jugs');
  const game = await open(srv, { checkpoint: 'cp_lip_start' });
  try {
    await game.run([{ steps: 30 }]);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', G.pos[0], G.pos[1], G.pos[2], 0, 0] }, { steps: 2 }]);
    // she walks on down the gully, lines on screen the whole way
    const t0 = (await game.state()).tick;
    await game.run([{ followPath: 'cp_lip_gate', maxTicks: 14 * 60 }]);
    const shown = (await hintsOf(game, seq, 'ui_hint_sprint')).filter((h) => h.show);
    assert.equal(shown.length, 1, 'shown on the walk');
    const at = (shown[0].tick - t0) / 60;
    assert.ok(at <= 13, `within the gully (${at.toFixed(1)} s after the overhang; it came 31 s in, at the gate)`);
    const said = await lines(game, seq);
    assert.ok(said.some((l) => l.tick <= shown[0].tick && l.tick + l.ticks > shown[0].tick), 'a line is on screen beside it');
    const cards = await game.events(seq, 'story/card');
    for (const c of cards) assert.ok(shown[0].tick >= c.tick + Math.round(c.payload.seconds * 60) || shown[0].tick < c.tick, 'not under a movement card');
    // into the jug puzzle a second after it comes back: that showing is not one of the two
    await game.until({ event: 'ui/hint', where: { key: 'ui_hint_sprint', show: false } }, 12 * 60);      // its eight seconds are over
    await game.run([{ steps: 30 * 60 }]);                          // and it is due again forty seconds on (SPRINT_AGAIN)
    const seq2 = await mark(game);
    for (let i = 0; i < 40 && !(await hintsOf(game, seq2, 'ui_hint_sprint')).some((h) => h.show); i++) await game.run([{ steps: 30 }]);
    assert.ok((await hintsOf(game, seq2, 'ui_hint_sprint')).some((h) => h.show), 'the second showing');
    await game.run([{ steps: 30 }, { call: ['teleport', J.pos[0], J.pos[1], J.pos[2] + 2, 0, 0] }, { steps: 30 }]);
    assert.ok((await hintsOf(game, seq2, 'ui_hint_sprint')).some((h) => !h.show), 'taken down in the puzzle');
    await game.run([{ call: ['teleport', G.pos[0], G.pos[1], G.pos[2] - 30, 0, 0] }, { steps: 6 * 60 }]);
    assert.equal((await hintsOf(game, seq2, 'ui_hint_sprint')).filter((h) => h.show).length, 2, 'a half-second showing did not use it up: it comes back');
  } finally { await game.close(); }
});

// ---- the kept key off the mark ------------------------------------------------------------------------------------------
test('phase 3a: the kept key pressed off the mark is answered at once with "The brass mark at the kerb..." (not again within 12 s); the key prompt comes with the ladder\'s second tier', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 900 }]);
    await game.run([emit('boss/phase', { phase: 'p3a', from: 'p2' }), { steps: 8 * 60 }]);      // the station's ask and the narrator's line are over
    await game.run([{ steps: 6 * 60 }]);
    const seq = await mark(game);
    await game.run([emit('weapon/kept', { stage: 'denied', mark: '' }), { steps: 3 }]);
    let said = await lines(game, seq);
    assert.equal(said[0]?.key, 'hint_kept_2', `said on the press (${said.map((l) => l.key).join(' ')})`);
    assert.ok(said[0].tick - (await game.events(seq, 'weapon/kept'))[0].tick <= 1, 'on its tick');
    await game.run([{ steps: 6 * 60 }, emit('weapon/kept', { stage: 'denied', mark: '' }), { steps: 60 }]);
    said = await lines(game, seq);
    assert.equal(said.filter((l) => l.key === 'hint_kept_2').length, 1, 'six seconds later: not said again');
    await game.run([{ steps: 7 * 60 }, emit('weapon/kept', { stage: 'denied', mark: '' }), { steps: 60 }]);
    assert.equal((await lines(game, seq)).filter((l) => l.key === 'hint_kept_2').length, 2, 'after twelve: again');
    // the ladder: the Windlass asks, and at the second tier (30 s) the key's prompt is up
    const seq2 = await mark(game);
    await game.run([emit('boss/charge_required', {}), { steps: 31 * 60 }]);
    const prompt = (await hintsOf(game, seq2, 'ui_prompt_kept')).find((h) => h.show);
    assert.ok(prompt, 'the key prompt is shown at the second tier (it was the third, 45 s)');
  } finally { await game.close(); }
});

// ---- the Windlass's defence, taught when it is needed --------------------------------------------------------------------
test('R2: the first stake that lands says "Standing still was the one thing it could hit" at once; the first retry is told what the ribs are for, and the Windlass\'s own repeat of it is not shown twice', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p1' });
  try {
    await game.run([{ steps: 60 }]);
    await game.dbg('setBossPhase', 'p1');
    await game.run([{ steps: 30 }]);
    const seq = await mark(game);
    await game.run([emit('player/damaged', { amount: 25, health: 75, kind: 'stake', source: 'windlass', fromX: 14, fromY: -40, fromZ: 96, graceUsed: false }), { steps: 3 }]);
    let said = await lines(game, seq);
    assert.equal(said.at(-1)?.key, 'hint_boss_move', `on the first hit (${said.map((l) => l.key).join(' ')})`);
    await game.run([{ steps: 60 }, emit('player/damaged', { amount: 25, health: 50, kind: 'stake', source: 'windlass', fromX: 14, fromY: -40, fromZ: 96, graceUsed: false }), { steps: 7 * 60 }]);
    assert.equal((await lines(game, seq)).filter((l) => l.key === 'hint_boss_move').length, 1, 'once: the second hit does not repeat it');
    // she dies; the first retry
    await game.page.evaluate(async () => { const d = window.__dbg; d.god(false); d.ext.core.damage(500, 'stake', 'windlass'); await d.ext.core.stepAsync(8 * 60, false); });
    assert.equal((await game.state()).game, 'playing', 'back in control');
    const seq2 = await mark(game);
    void seq2;
    said = await lines(game, seq);
    const haul = said.filter((l) => l.key === 'hint_boss_haul');
    assert.equal(haul.length, 1, `the ribs' line on the first retry (${said.map((l) => l.key).join(' ')})`);
    const restored = (await game.events(seq, 'game/state')).filter((e) => e.payload.to === 'playing').at(-1);
    assert.ok(haul[0].tick - restored.tick <= 90, `within a second and a half of control (${((haul[0].tick - restored.tick) / 60).toFixed(2)} s)`);
    // the Windlass says the same line at its first haul of the try: within the echo window it is not shown again
    await game.page.evaluate(() => window.__dbg.emit('story/say', { key: 'hint_boss_haul' }));
    await game.run([{ steps: 8 * 60 }]);
    assert.equal((await lines(game, seq)).filter((l) => l.key === 'hint_boss_haul').length, 1, 'not twice within forty seconds');
  } finally { await game.close(); }
});

// ---- the take, answered ------------------------------------------------------------------------------------------------
test('the take is answered on its tick whatever is on screen; the lamps\' count still follows, no narrator line is said twice, and nothing describes the stone she has emptied', async () => {
  const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), ARRIVE = marker('trg_rim_arrive'), LAMPS = marker('trg_lamps');
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    // off the lift, into the lamps' corner until "Lamps, down in Plenty. She counted them." is on screen, then the round
    await game.run([tp(ARRIVE), { steps: 20 }, { call: ['teleport', LAMPS.pos[0] + 3, LAMPS.pos[1], LAMPS.pos[2] + 2, 0, 0] }, { steps: 2 }]);
    await game.until({ event: 'story/line', where: { key: 'nar_lamps' } }, 60 * 60);
    await game.run([{ steps: 60 }, tp(STONE, 90), { steps: 3 }, ...takeRound(ROUND)]);
    const took = (await game.events(seq, 'ending/stone'))[0];
    assert.ok(took && took.payload.taken, 'taken a second into the lamps\' first line');
    await game.until({ event: 'ending/card' }, 180 * 60);
    const said = await lines(game, seq);
    const after = said.filter((l) => l.tick >= took.tick).map((l) => l.key);
    assert.deepEqual(after.slice(0, 3), ['nar_take_1', 'nar_take_2', 'nar_lamps_count'], after.join(' '));
    const all = said.map((l) => l.key);
    assert.equal(new Set(all).size, all.length, `no line twice (${all.join(' ')})`);
    assert.ok(said.find((l) => l.key === 'nar_take_1').tick - took.tick <= 1, 'on the tick (it was 13 s late: scratch/i3-story-b/end2_16x9.log)');
    assert.ok(after.every((k) => !/^nar_stone/.test(k)), `no line about the stone after the take (${after.join(' ')})`);
    assert.deepEqual(after.slice(-2), ['nar_fire', 'nar_last']);
  } finally { await game.close(); }
});
