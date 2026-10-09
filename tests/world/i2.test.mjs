// Pass i2 (iteration toward release): one test for each issue the two story reviewers left with the world. The real
// world beside the core stubs, driven by the step hook; the Windlass's asking needs the real enemies and is in
// i2_real.test.mjs. The queue's own rules (a pair is not parted, a polite line never cuts the narrator) are unit tests
// in story.spec.ts; the tests of earlier passes that held the old behaviour were rewritten in place.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, STORY, mark, marker, open, server, shootScript, status, takeRound } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lines = async (game, since) => (await game.events(since, 'story/line')).map((e) => ({ key: e.payload.key, tick: e.tick, ticks: Math.round(e.payload.seconds * 60) }));
const keys = async (game, since) => (await lines(game, since)).map((l) => l.key);
const tp = (m, yaw = 0) => ({ call: ['teleport', m.pos[0], m.pos[1], m.pos[2], yaw, 0] });
const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), EXIT = marker('exit_rim'), ARRIVE = marker('trg_rim_arrive'), LAMPS = marker('trg_lamps');
const freed = (game, n) => game.page.evaluate((k) => { for (let i = 0; i < k; i++) window.__dbg.emit('enemy/freed', { x: 0, y: 0, z: 0, id: 'i2#' + i, encounter: '', cause: 'crown', counted: true }); }, n);

// ---- the rim (major: a brisk take heard the Rule and the lamp count after the take's lines) ----------------------------
test('the rim, a round taken within 15 s of the lift: the take is answered on its tick (pass i3), then the lamps, unbroken, then the Rule\'s line, then the fire', async () => {
  for (const [name, hers, wait] of [['nobody freed, taken 7 s in', 0, 5], ['three freed, taken 12 s in', 3, 10], ['three freed, taken 2 s in', 3, 0.3]]) {
    const game = await open(srv, { checkpoint: 'cp_rim' });
    try {
      if (hers) await freed(game, hers);
      const seq = await mark(game);
      const t0 = (await game.state()).tick;
      // off the lift (the rim's three scenery lines are asked for), a look about, then straight to the stone and the round
      await game.run([tp(ARRIVE), { steps: Math.round(wait * 60) }, tp(STONE, 90), { steps: 60 }, ...takeRound(ROUND)]);
      const took = (await game.events(seq, 'ending/stone'))[0];
      assert.ok(took && took.payload.taken === true, `${name}: taken`);
      assert.ok(took.tick - t0 <= 15 * 60, `${name}: within 15 s of cp_rim (${((took.tick - t0) / 60).toFixed(1)} s)`);
      const end = await game.until({ event: 'ending/card' }, 150 * 60);
      assert.ok(end.met, `${name}: the end card`);
      const said = await lines(game, seq);
      const all = said.map((l) => l.key);
      const lamps = hers ? ['nar_lamps', 'nar_lamps_count', 'nar_lamps_hers'] : ['nar_lamps', 'nar_lamps_count'];
      // pass i3 (story reviewer b: this take was answered 13 s late, after the count and a line about the stone she had
      // emptied): the take's two lines on its tick; then the lamps' lines, one unbroken run in their order; then what
      // the rim still owes her of the thread and the Rule; then the fire's two. The one line the take does not cut is
      // the Rule's own, if it is on screen at that moment: it is heard out and the take's first line is the very next
      const ti = all.indexOf('nar_take_1');
      const ruleUp = ti > 0 && all[ti - 1] === 'nar_rim_3' && said[ti - 1].tick <= took.tick && said[ti - 1].tick + said[ti - 1].ticks > took.tick;
      if (ruleUp) assert.ok(said[ti].tick - (said[ti - 1].tick + said[ti - 1].ticks) <= 20, `${name}: the Rule's line is heard out, the take's first is next`);
      else assert.ok(said[ti].tick - took.tick <= 1, `${name}: nar_take_1 on the tick of the take (${said[ti].tick - took.tick})`);
      const after = all.slice(ti);
      const owed = after.filter((k) => /^nar_rim_/.test(k));
      // (a lamps line that was on screen at the take was cut by it, and counts as said: the rest of the run follows the take)
      const told = lamps.filter((k) => all.indexOf(k) > ti);
      for (const k of lamps) assert.ok(all.includes(k), `${name}: ${k} (${all.join(' ')})`);
      assert.deepEqual(told, lamps.slice(lamps.length - told.length), `${name}: the lamps in their order`);
      assert.deepEqual(after, ['nar_take_1', 'nar_take_2', ...told, ...owed, 'nar_fire', 'nar_last'], `${name}: take, lamps, the Rule, fire (${all.join(' ')})`);
      assert.equal(all.filter((k) => k === 'nar_rim_3').length, 1, `${name}: "Further than from the gully" is told, once (${all.join(' ')})`);
      assert.ok(ruleUp ? owed.length === 0 : owed.at(-1) === 'nar_rim_3', `${name}: never lost (${all.join(' ')})`);
      assert.equal(new Set(all).size, all.length, `${name}: no narrator line twice (${all.join(' ')})`);
      assert.ok(owed.length <= 1 || owed[0] === 'nar_rim_2', `${name}: the thread before the Rule seen against it (${owed.join(' ')})`);
      assert.ok(!all.includes('nar_stone_short'), `${name}: nothing describes the stone she has emptied`);
      if (!hers) assert.ok(!all.includes('nar_lamps_hers'), 'nobody freed: the third lamps line would be false and is not said');
      // each line of the ending follows the one before it by a breath
      for (let i = ti + 1; i < all.length - 2; i++) assert.ok(said[i].tick - (said[i - 1].tick + said[i - 1].ticks) <= 20, `${name}: ${all[i]} straight after ${all[i - 1]}`);
    } finally { await game.close(); }
  }
});

test('the rim, the leave branch: the lamps, its own lines, the Rule\'s line (pass i3: never lost), the fire\'s', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    await freed(game, 2);
    const seq = await mark(game);
    await game.run([tp(ARRIVE), { steps: 20 }, tp(STONE, 90), { steps: 2 }, { aimAt: ROUND.pos, steps: 2 }]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 90 * 60);
    await game.run([{ call: ['teleport', EXIT.pos[0] - 6, EXIT.pos[1], EXIT.pos[2] + 0.2, 0, 0] }, { steps: 3 }]);
    const card = await game.until({ event: 'ending/card' }, 180 * 60);
    assert.ok(card.met);
    const said = await lines(game, seq);
    const all = said.map((l) => l.key);
    const left = (await game.events(seq, 'ending/stone'))[0];
    assert.equal(left.payload.taken, false);
    // (pass i3: the Rule's line, never told while she was bent over the stone, is told last before the fire, behind the thread's)
    const leave = STORY.meta.rules.ending_branch.leave;
    // (pass i4: ... and ahead of the branch's own lines, so nothing stands between the choice's last line and the fire)
    assert.deepEqual(said.filter((l) => l.tick >= left.tick).map((l) => l.key), ['nar_rim_2', 'nar_rim_3', ...leave], all.join(' '));
    const li = all.indexOf('nar_lamps');
    assert.deepEqual(all.slice(li, li + 3), ['nar_lamps', 'nar_lamps_count', 'nar_lamps_hers'], `"She counted them", the count, whose they were (${all.join(' ')})`);
    assert.ok(!all.includes('nar_take_2'));
  } finally { await game.close(); }
});

// ---- the bore door ------------------------------------------------------------------------------------------------------
test('the bore door: IDENTIFY STATION is asked again no sooner than 50 quiet seconds on, never between the cradle\'s two lines, and the first hint line comes 45 s in', async () => {
  const stand = marker('trg_pz_asking').params.standSpot, cradle = marker('ia_cradle');
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await game.dbg('checkpoint', 'cp_bore_ante');
    const seq = await mark(game);
    const t0 = (await game.state()).tick;
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 180, 4] }, { steps: 14 * 60 }]);
    // to the cradle, and a long look at it (its two lines), as the reviewer did 16 s in
    await game.run([{ call: ['teleport', cradle.pos[0] + 0.5, -44, cradle.pos[2] - 3, 0, 0] }, { steps: 1 }, { aimAt: cradle.pos, steps: 16 * 60 }]);
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 180, 4] }, { steps: 100 * 60 }]);
    const said = await lines(game, seq);
    const all = said.map((l) => l.key);
    const asks = said.filter((l) => l.key === 'stn_ask_1');
    assert.ok(asks.length >= 2 && asks.length <= 3, `asked ${asks.length} times in 130 s (it was seven)`);
    for (let i = 1; i < asks.length; i++) assert.ok(asks[i].tick - (asks[i - 1].tick + asks[i - 1].ticks) >= 50 * 60 - 2, `at least 50 s between two askings (${((asks[i].tick - asks[i - 1].tick) / 60).toFixed(1)} s)`);
    const c1 = all.indexOf('nar_cradle');
    assert.ok(c1 >= 0 && all[c1 + 1] === 'nar_cradle_2', `the cradle's two lines are one after the other (${all.join(' ')})`);
    assert.ok(said[c1 + 1].tick - (said[c1].tick + said[c1].ticks) <= 20, 'a breath apart');
    // no asking starts while a narrator line is on screen or within a second of one
    for (const a of asks.slice(1)) for (const l of said) if (l.key.startsWith('nar_')) assert.ok(a.tick >= l.tick + l.ticks + 60 || a.tick + a.ticks <= l.tick, `the repeat at ${(a.tick / 60).toFixed(1)} s keeps clear of ${l.key}`);
    const hint = said.find((l) => l.key === 'hint_ask_2');
    assert.ok(hint, `the first hint line was said (${all.join(' ')})`);
    // 45 s of the antechamber's clock (it runs inside the volume: all of this leg), give or take a line that was on screen
    assert.ok(hint.tick - t0 >= 44 * 60 && hint.tick - t0 <= 56 * 60, `"It asked for numbers" ${((hint.tick - t0) / 60).toFixed(1)} s in (it was 120 s)`);
  } finally { await game.close(); }
});

// ---- the peg stair and the watcher --------------------------------------------------------------------------------------
test('the peg stair: "Coats on pegs" and "The low pegs were bare" back to back; the watcher, looked at under the first, is named next (pass i3); the second peg line follows on the stair', async () => {
  const W = marker('prop_watcher'), T = marker('trg_watcher'), P = marker('trg_peg_stair');
  const head = [W.pos[0], W.pos[1] + 0.95, W.pos[2]];
  const game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    // onto the stair trigger (the peg lines), three seconds down the flight to the watcher's trigger, looking down the stair
    await game.run([{ call: ['teleport', P.pos[0], P.pos[1], P.pos[2], 180, 0] }, { steps: 3 * 60 }, { call: ['teleport', T.pos[0], T.pos[1], T.pos[2], 180, 0] }, { steps: 60 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_watcher_1'), 'on the trigger, the niche out of frame: nothing about it');
    // she turns to the niche with "Coats on pegs" still on screen
    await game.run([{ aimAt: head, steps: 30 }]);
    assert.ok((await game.state()).world.flags.includes('trg:trg_watcher'), 'the look starts the moment');
    await game.run([{ steps: 30 * 60 }]);
    const said = await lines(game, seq);
    // pass i3 (story reviewer a, a major: the watcher was looked at 5.2 s in and named 13.9 s in, in the proving bay,
    // behind "The low pegs were bare"): the watcher's lines are PRESENT lines: next, ahead of the peg pair's second
    // line, which is still said on the stair behind them
    assert.deepEqual(said.map((l) => l.key).filter((k) => /pegs|watcher|nar_ask/.test(k)), ['nar_pegs_1', 'nar_watcher_1', 'nar_watcher_2', 'nar_pegs_2', 'nar_ask'], said.map((l) => l.key).join(' '));
    const at = (k) => said.find((l) => l.key === k);
    assert.ok(at('nar_watcher_1').tick - (at('nar_pegs_1').tick + at('nar_pegs_1').ticks) <= 20, 'the watcher is named a breath after the line that was on screen when she looked');
    assert.ok(at('nar_pegs_1').tick + at('nar_pegs_1').ticks - 1 <= at('nar_watcher_1').tick, '"Coats on pegs" was not cut');
    assert.ok(at('nar_watcher_2').tick - (at('nar_watcher_1').tick + at('nar_watcher_1').ticks) <= 20, 'its two lines a breath apart');
  } finally { await game.close(); }
});

// ---- the hearth ---------------------------------------------------------------------------------------------------------
test('the hearth cup: "His cup on their hearthstone" is said at the hearth (turned to it within 3 m, or on opening his note there), and not again when the fight clears', async () => {
  const cup = marker('prop_cup_two'), note = marker('rd_note_hearth');
  assert.ok(cup.params.line.startsWith('nar_tally_hearth'), 'the cup names its line (layout)');
  assert.ok(Math.hypot(cup.pos[0] - note.pos[0], cup.pos[2] - note.pos[2]) <= 1.5, 'his note lies at the cup');
  // (a) she walks up to the hearth
  let game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 20 * 60 }]);                       // the room's three lines
    const seq = await mark(game);
    // five metres off, looking at it: not yet
    await game.run([{ call: ['teleport', cup.pos[0] - 5, 0, cup.pos[2], -90, 0] }, { steps: 2 }, { aimAt: [cup.pos[0], cup.pos[1] + 0.5, cup.pos[2]], steps: 60 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_tally_hearth'), 'from five metres: not yet');
    // within three metres with her back to it: not yet
    await game.run([{ call: ['teleport', cup.pos[0] - 2.2, 0, cup.pos[2], 90, 0] }, { steps: 60 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_tally_hearth'), 'her back to it: not yet');
    const t0 = (await game.state()).tick;
    await game.run([{ aimAt: [cup.pos[0], cup.pos[1] + 0.5, cup.pos[2]], steps: 60 }]);
    const l = (await lines(game, seq)).find((x) => x.key === 'nar_tally_hearth');
    assert.ok(l && l.tick - t0 <= 45, `said as she turns to the hearth (${l ? (l.tick - t0) / 60 : 'never'} s)`);
    // the fight clears: the line is not said a second time, and "Nine kept their seats" still is
    await game.run([{ steps: 8 * 60 }]);
    const seq2 = await mark(game);
    await game.dbg('clearEncounter', 'enc_tally');
    await game.run([{ steps: 15 * 60 }]);
    const after = await keys(game, seq2);
    assert.ok(!after.includes('nar_tally_hearth'), `once per run (${after.join(' ')})`);
  } finally { await game.close(); }
  // (b) she reads his note without the cup ever having been in the middle of her view: the line follows the note
  game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 20 * 60 }]);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', note.pos[0] - 0.2, 0, note.pos[2] + 3.4, 0, 0] }, { steps: 1 }, { aimAt: note.pos, steps: 1 }]);
    await game.run([{ call: ['teleport', note.pos[0] - 0.2, 0, note.pos[2] + 1.4, 0, 0] }, { aimAt: note.pos, steps: 1 }, { tap: 'interact', steps: 2 }, { steps: 8 * 60 }]);
    const ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'readable/opened' && e.payload.key === 'rd_note_hearth'), 'the note was opened');
    assert.ok((await keys(game, seq)).includes('nar_tally_hearth'), 'the cup\'s line is told with the note');
  } finally { await game.close(); }
  // (c) she never goes near: the fight's end still says it (the fallback)
  game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    const stand = marker('trg_pz_daylight').params.standSpot;
    await game.run([{ steps: 60 }, { call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 20 * 60 }]);
    const seq = await mark(game);
    await game.dbg('clearEncounter', 'enc_tally');
    assert.deepEqual(LAYOUT.encounters.find((e) => e.id === 'enc_tally').onClear.lines, ['nar_nine', 'nar_tally_hearth']);
    // (a debug clear says no lines: the same call the director makes on a real clear)
    await game.page.evaluate(() => { for (const k of ['nar_nine', 'nar_tally_hearth']) window.__dbg.ext.world.say(k); });
    await game.run([{ steps: 15 * 60 }]);
    // (pass i4: the fallback no longer says it to her back: it was heard at the far end of the table, over the ledger.
    // It keeps its place in line until the cup is in her view within eight metres)
    assert.ok((await keys(game, seq)).includes('nar_nine') && !(await keys(game, seq)).includes('nar_tally_hearth'), 'with her back to the hearth the cup\'s line waits');
    assert.ok((await status(game)).story.waiting.includes('nar_tally_hearth'), 'still in line');
    await game.run([{ aimAt: [cup.pos[0], cup.pos[1], cup.pos[2]], steps: 30 }]);
    assert.ok((await keys(game, seq)).includes('nar_tally_hearth'), 'never near the hearth: the line is still hers to hear');
  } finally { await game.close(); }
});

// ---- the Tally House at five seconds a shutter --------------------------------------------------------------------------
test('the Tally House at five seconds a shutter: no narrator line is cut by the station, the chair\'s two lines are adjacent, the share-cloth line is never said after the cloth is down (pass i3)', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    const stand = marker('trg_pz_daylight').params.standSpot;
    const seq = await mark(game);
    await game.run([{ steps: 60 }, { call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 4 * 60 }]);
    for (const id of ['ia_latch_s', 'ia_latch_m', 'ia_latch_n', 'ia_cloth_cord']) await game.run([...shootScript(id), { steps: 5 * 60 }]);
    await game.run([{ steps: 45 * 60 }]);
    const said = await lines(game, seq);
    const ends = await game.events(seq, 'story/line_end');
    const all = said.map((l) => l.key);
    for (const k of ['nar_tally_1', 'nar_tally_2', 'nar_tally_3', 'nar_tally_wall', 'nar_tally_chair', 'nar_tally_chair_2', 'stn_tally_wake_1', 'stn_tally_wake_2']) assert.ok(all.includes(k), `${k} is said (${all.join(' ')})`);
    // pass i3 (both story reviewers: at this pace the cloth's line was said 24 to 34 s after the cloth had fallen): it is
    // said while the light lies on the cloth or not at all. Here the cord is shot five seconds after the shutter, under
    // another line: the cloth's line is dropped
    const cord = (await game.events(seq, 'shootable/hit')).find((e) => e.payload.kind === 'cord');
    const cloth = said.find((l) => l.key === 'nar_tally_cloth');
    assert.ok(cord && (!cloth || cloth.tick <= cord.tick), `"The share-cloth hung in the light's way" never starts after the cloth is down (${cloth ? ((cloth.tick - cord.tick) / 60).toFixed(1) : 'not said'})`);
    assert.equal(all.indexOf('nar_tally_chair_2'), all.indexOf('nar_tally_chair') + 1, `the chair's lines are adjacent (${all.join(' ')})`);
    assert.equal(all.indexOf('stn_tally_wake_2'), all.indexOf('stn_tally_wake_1') + 1, 'the station\'s two too');
    // every narrator line holds its full time
    for (const l of said.filter((x) => x.key.startsWith('nar_'))) {
      const end = ends.find((e) => e.payload.key === l.key && e.tick >= l.tick);
      assert.ok(end && end.tick - l.tick >= l.ticks - 1, `${l.key} was on screen ${end ? ((end.tick - l.tick) / 60).toFixed(1) : '?'} of ${(l.ticks / 60).toFixed(1)} s`);
    }
    const story = (await game.page.evaluate(() => window.__dbg.ext.world.status().story));
    assert.ok(story.stale <= 1 && (story.stale === 0 || story.lastDropped === 'nar_tally_cloth'), `no line dropped but the cloth's (last dropped: ${story.lastDropped}, ${story.stale})`);
  } finally { await game.close(); }
});

// ---- the lift head's drawing --------------------------------------------------------------------------------------------
test('the drawing: standing on the floor before the ring with her back to it says nothing; turned to it, the three lines; never turned, they are told at the cage and the ride waits for its own', async () => {
  const D = marker('prop_hall_diagram'), T = marker('trg_hall_diagram'), CP = marker('cp_hall_clear'), LEVER = marker('ia_lift_lever'), CAGE = marker('lift_depart_hall');
  const centre = [D.pos[0], D.pos[1] + D.params.height / 2, D.pos[2]];
  // (a) on the trigger's floor when the Tamper falls (the reviewer's leg: the lines began on that tick)
  let game = await open(srv, { checkpoint: 'cp_hall_gantry' });
  try {
    await game.dbg('god', true);
    await game.run([{ call: ['teleport', T.pos[0] - 2, T.pos[1], T.pos[2] + 3, 90, 0] }, { steps: 5 }]);      // inside the volume, facing west
    await game.dbg('clearEncounter', 'enc_matador');
    const seq = await mark(game);
    await game.run([{ steps: 12 * 60 }]);
    assert.ok(!(await keys(game, seq)).some((k) => k.startsWith('nar_mark')), 'twelve seconds on that floor, the drawing behind her: not a word about it');
    const t0 = (await game.state()).tick;
    await game.run([{ aimAt: centre, steps: 20 * 60 }]);
    const said = (await lines(game, seq)).filter((l) => l.key.startsWith('nar_mark'));
    assert.deepEqual(said.map((l) => l.key), ['nar_mark_1', 'nar_mark_2', 'nar_mark_3']);
    assert.ok(said[0].tick - t0 >= 20 && said[0].tick - t0 <= 45, `0.4 s after she turned to it (${(said[0].tick - t0) / 60} s)`);
  } finally { await game.close(); }
  // (b) she never looks at it: the cage tells her, and the ride's own three lines are still said in the dark
  game = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', CP.pos[0] - 6, CP.pos[1], CP.pos[2], -90, 0] }, { steps: 6 * 60 }]);
    assert.ok(!(await keys(game, seq)).some((k) => k.startsWith('nar_mark')), 'walking east down the hall\'s middle, the drawing 40 degrees and more to her left: nothing yet');
    await game.run([{ call: ['teleport', CAGE.pos[0] - 1, CAGE.pos[1], CAGE.pos[2], -90, 0] }, { steps: 30 }]);
    assert.ok((await keys(game, seq)).includes('nar_mark_1'), 'in the cage: the drawing\'s lines begin');
    await game.walkTo(LEVER.pos[0], LEVER.pos[2], { stopRadius: 1.6, maxTicks: 900 });
    await game.run([{ aimAt: LEVER.pos, steps: 1 }, { tap: 'interact', steps: 1 }]);
    assert.ok((await game.events(seq, 'ride/state')).some((e) => e.payload.stage === 'started'), 'the ride started');
    const ride = await game.until({ event: 'ride/state', where: { stage: 'ended' } }, 60 * 60);
    assert.ok(ride.met, 'the ride ended');
    const ended = (await game.events(seq, 'ride/state')).find((e) => e.payload.stage === 'ended');
    const said = await lines(game, seq);
    const all = said.map((l) => l.key);
    assert.deepEqual(all.filter((k) => /nar_mark|stn_lift/.test(k)), ['nar_mark_1', 'nar_mark_2', 'nar_mark_3', 'stn_lift_1', 'stn_lift_2', 'stn_lift_3'], all.join(' '));
    assert.ok(said.find((l) => l.key === 'stn_lift_3').tick <= ended.tick, 'the last of the station\'s reading has begun before the gate opens');
    assert.ok(ended.payload.seconds <= LEVER.params.ride.seconds + 8.1, `the ride is held 8 s at most for it (${ended.payload.seconds.toFixed(1)} s)`);
  } finally { await game.close(); }
});
