// Pass i1 (iteration toward release): one test for each issue the story and visual reviewers left with the world
// (the task's list, team "world"). The real world beside the core stubs, driven by the step hook.
// The reload hint's own test is in polish_r2.test.mjs (rewritten in this pass); the real game's is tests/world/i1_real.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY, mark, marker, open, renderCalls, server, shootScript, status, takeRound } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lines = async (game, since) => (await game.events(since, 'story/line')).map((e) => ({ key: e.payload.key, tick: e.tick, ticks: Math.round(e.payload.seconds * 60) }));
const keys = async (game, since) => (await lines(game, since)).map((l) => l.key);
const say = (game, key) => game.page.evaluate((k) => window.__dbg.ext.world.say(k), key);
const tp = (m, yaw = 0) => ({ call: ['teleport', m.pos[0], m.pos[1], m.pos[2], yaw, 0] });
const hintsOf = async (game, since, key) => (await game.events(since, 'ui/hint')).filter((e) => e.payload.key === key).map((e) => ({ show: e.payload.show, tick: e.tick }));
const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), EXIT = marker('exit_rim'), ARRIVE = marker('trg_rim_arrive'), LAMPS = marker('trg_lamps');

// ---- the run hint -------------------------------------------------------------------------------------------------------
test('"Hold SHIFT to run": not on the tick of the movement card or under a line; after three quiet seconds; it stands eight; never in a puzzle; twice at most', async () => {
  const game = await open(srv);
  try {
    // she has walked (the move hint is done with) and comes out into the glare
    await game.run([{ steps: 20 }, { actions: ['forward'], steps: 30 }, { actions: [], steps: 2 }]);
    const seq = await mark(game);
    const G = marker('trg_glare');
    await game.run([tp(G), { steps: 3 }]);
    const crossed = (await game.state()).tick;
    assert.ok((await game.state()).world.flags.includes('trg:trg_glare'), 'the glare trigger has fired');
    assert.deepEqual(await hintsOf(game, seq, 'ui_hint_sprint'), [], 'nothing on the tick of the card (it was shown with the card and a line: three texts)');
    await game.until({ event: 'ui/hint', where: { key: 'ui_hint_sprint', show: true } }, 60 * 60);
    const shown = (await hintsOf(game, seq, 'ui_hint_sprint'))[0];
    assert.ok(shown && shown.show, 'it does come up on the walk down the gully');
    // what was on screen before it: every line and card that started after the trigger was over three seconds earlier
    const ev = await game.events(seq);
    let lastEnd = crossed;
    for (const e of ev) {
      if (e.tick > shown.tick) continue;
      if (e.name === 'story/line' || e.name === 'story/card') lastEnd = Math.max(lastEnd, e.tick + Math.round(e.payload.seconds * 60));
    }
    assert.ok(ev.some((e) => e.name === 'story/card' && e.payload.key === 'card_i') && ev.some((e) => e.name === 'story/line' && e.payload.key === 'nar_rule'), 'the cards and the gully lines were said first');
    assert.ok(shown.tick - lastEnd >= 3 * 60 - 2 && shown.tick - lastEnd <= 3 * 60 + 30, `three quiet seconds after the last line or card (${(shown.tick - lastEnd) / 60} s)`);
    const st = await status(game);
    assert.equal(st.story.current, '', 'no line under it');
    // it stands eight seconds and goes by itself (it stood until she ran: up to a minute)
    await game.run([{ steps: 9 * 60 }]);
    let h = await hintsOf(game, seq, 'ui_hint_sprint');
    assert.equal(h.length, 2);
    assert.ok(!h[1].show && Math.abs(h[1].tick - h[0].tick - 8 * 60) <= 2, `eight seconds (${(h[1].tick - h[0].tick) / 60})`);
    // forty quiet seconds on it would come back: she stands in the jug puzzle, where it never shows
    const stand = marker('trg_pz_jugs').params.standSpot;
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 70 * 60 }]);
    assert.equal((await hintsOf(game, seq, 'ui_hint_sprint')).length, 2, 'not while she stands in a puzzle volume');
    // out on open ground again (the puzzle's hint lines run out first)
    await game.run([{ call: ['teleport', G.pos[0], G.pos[1], G.pos[2] - 12, 0, 0] }, { steps: 70 * 60 }]);
    h = await hintsOf(game, seq, 'ui_hint_sprint');
    assert.equal(h.length, 4, `once more after forty quiet seconds, eight seconds again (${h.length})`);
    assert.ok(h[2].show && !h[3].show && Math.abs(h[3].tick - h[2].tick - 8 * 60) <= 2);
    await game.run([{ steps: 120 * 60 }]);
    assert.equal((await hintsOf(game, seq, 'ui_hint_sprint')).length, 4, 'twice at most');
  } finally { await game.close(); }
  // shown, it is taken down as she walks into a puzzle; and running takes it away for good
  const g2 = await open(srv);
  try {
    await g2.run([{ steps: 20 }, { actions: ['forward'], steps: 30 }, { actions: [], steps: 2 }]);
    const seq = await mark(g2);
    await g2.run([tp(marker('trg_glare')), { steps: 3 }]);
    await g2.until({ event: 'ui/hint', where: { key: 'ui_hint_sprint', show: true } }, 60 * 60);
    const stand = marker('trg_pz_jugs').params.standSpot;
    await g2.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 3 }]);
    const h = await hintsOf(g2, seq, 'ui_hint_sprint');
    assert.deepEqual(h.map((x) => x.show), [true, false], 'down as she walks into the jugs');
  } finally { await g2.close(); }
});

// ---- the first note -----------------------------------------------------------------------------------------------------
test('the spent case over the first note glints from the line that names it until the note is read', async () => {
  const NOTE = marker('rd_note_lip');
  const game = await open(srv);
  try {
    // the render stub's ring of look calls: the star card is taken once, and let go when the note has been read
    const calls = async (name) => (await renderCalls(game)).filter((c) => c === name).length;
    await game.run([{ steps: 30 }]);
    assert.equal(await calls('vfx.acquireCard:aim_star'), 0, 'not before the line that names the case');
    await game.until({ event: 'story/line', where: { key: 'nar_open_2' } }, 20 * 60);
    await game.run([{ steps: 6 * 60 }]);
    assert.equal(await calls('vfx.acquireCard:aim_star'), 1, 'the brass star of the last stone, from the line on');
    assert.equal((await status(game)).interact.caseGlint, true);
    // she reads the note: no more
    await game.run([{ call: ['teleport', NOTE.pos[0] + 1.0, 14, NOTE.pos[2] + 0.5, 0, 0] }, { steps: 2 }, { aimAt: NOTE.pos, steps: 3 }, { tap: 'interact', steps: 3 }]);
    assert.ok((await game.state()).world.flags.includes('read:rd_note_lip'), 'the note is open');
    await game.page.evaluate(async () => { const d = window.__dbg; d.emit('ui/action', { action: 'resume' }); d.step(4, false); });
    assert.equal((await status(game)).interact.caseGlint, false, 'read: the case no longer glints');
  } finally { await game.close(); }
  // unread, it stops when she has walked on down the gully
  const g2 = await open(srv);
  try {
    await g2.until({ event: 'story/line', where: { key: 'nar_open_2' } }, 20 * 60);
    await g2.run([{ steps: 30 }]);
    assert.equal((await status(g2)).interact.caseGlint, true);
    await g2.run([tp(marker('trg_glare')), { call: ['teleport', NOTE.pos[0], 14, NOTE.pos[2] - 16, 0, 0] }, { steps: 5 }]);
    assert.equal((await status(g2)).interact.caseGlint, false, 'fourteen metres on: no more');
  } finally { await g2.close(); }
});

// ---- the watcher --------------------------------------------------------------------------------------------------------
test('the watcher: its lines start when she LOOKS at the niche from the stair; crossing the trigger without a look draws the eye and says nothing until she turns (pass i2)', async () => {
  const W = marker('prop_watcher'), T = marker('trg_watcher'), P = marker('trg_peg_stair');
  const head = [W.pos[0], W.pos[1] + 0.95, W.pos[2]];
  // (a) coming down the stair she looks at the niche four metres before she is abreast of it
  let game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.run([{ steps: 30 * 60 }]);                                    // the hall's own lines run out
    const seq = await mark(game);
    // six metres up the stair the niche is a recess in the wall ahead: the figure cannot be seen, a glint stands in its mouth
    const watch = async () => (await game.state()).systems.world.director.watch;
    assert.equal((await watch()).glint, false);
    await game.run([{ call: ['teleport', P.pos[0], P.pos[1] + 3, T.pos[2] - 6, 180, -10] }, { steps: 40 }]);
    let lit = 0;
    for (let i = 0; i < 12; i++) { await game.run([{ steps: 15 }]); const w = await watch(); assert.equal(w.glint, true, 'a star stands in the mouth of the niche while she comes down'); if (w.level > 0) lit++; }
    assert.ok(lit >= 3 && lit <= 5, `lit a third of the time: half a second in every second and a half (${lit} of 12 looks)`);
    // a metre and a half before she is abreast of it, looking down the stair (the niche is 50 degrees to her side)
    await game.run([{ call: ['teleport', P.pos[0], P.pos[1] + 3, T.pos[2] - 1.5, 180, -10] }, { steps: 40 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_watcher_1'), 'not before she looks at it or reaches it');
    assert.ok(!(await game.state()).world.flags.includes('trg:trg_watcher'));
    const lookAt = (await game.state()).tick;
    const onScreen = (await lines(game, seq)).filter((l) => l.tick <= lookAt && l.tick + l.ticks > lookAt).at(-1);
    await game.run([{ aimAt: head, steps: 3 }]);
    assert.ok(!(await game.state()).world.flags.includes('trg:trg_watcher'), 'a glance of a twentieth of a second is not a look (pass i2: 0.4 s)');
    await game.run([{ aimAt: head, steps: 26 }]);
    assert.ok((await game.state()).world.flags.includes('trg:trg_watcher'), 'looking at the figure starts the moment');
    await game.run([{ steps: 12 * 60 }]);
    const after = await lines(game, seq);
    const w1 = after.find((l) => l.key === 'nar_watcher_1');
    assert.ok(w1, `the line is said (${after.map((l) => l.key).join(' ')})`);
    // at once, or (pass i2: a narrator's line on screen) as that line ends: it is never cut for it
    // (and behind that line's continuation: "Coats on pegs" and "The low pegs were bare" are not parted)
    const prev = after.filter((l) => l.tick < w1.tick).at(-1);
    const end = prev ? prev.tick + prev.ticks : 0;
    const due = !onScreen ? lookAt + 26 : Math.max(lookAt + 26, end + 15);
    assert.ok(w1.tick - due <= 20 && (!prev || w1.tick >= end), `on the look (${(w1.tick - lookAt) / 60} s after it; the line on screen was ${onScreen ? onScreen.key : 'none'}, the line before it ${prev ? prev.key : 'none'})`);
    if (onScreen && prev && prev.key !== onScreen.key) assert.equal(prev.key.replace(/_\d+$/, ''), onScreen.key.replace(/_\d+$/, ''), 'only its continuation stood between');
    await game.run([{ steps: 12 * 60 }]);
    const all = await keys(game, seq);
    assert.ok(all.indexOf('nar_watcher_2') === all.indexOf('nar_watcher_1') + 1, `its second line follows it (${all.join(' ')})`);
  } finally { await game.close(); }
  // (b) she walks onto the trigger looking down the stair: the figure's hood turns, a glint draws the eye, and nothing is
  // said for as long as she does not look (pass i2: it was said after 1.5 s with the niche off the edge of the frame)
  game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', T.pos[0], T.pos[1], T.pos[2] - 3, 180, 0] }, { steps: 20 }, { call: ['teleport', T.pos[0], T.pos[1], T.pos[2], 180, 0] }, { steps: 6 * 60 }]);
    assert.ok(!(await game.state()).world.flags.includes('trg:trg_watcher'), 'the moment has not been told');
    assert.ok((await game.events(seq, 'vignette/play')).length >= 0);
    const w = (await game.state()).systems.world.director.watch;
    assert.ok(w.glint, `the star still stands in the niche (${JSON.stringify(w)})`);
    assert.ok(!(await keys(game, seq)).includes('nar_watcher_1'), 'six seconds on the trigger without a look: not a word');
    await game.run([{ aimAt: head, steps: 30 }]);
    assert.ok((await keys(game, seq)).includes('nar_watcher_1'), 'she turns: the line');
    assert.equal((await game.state()).systems.world.director.watch.glint, false, 'and the star is let go');
  } finally { await game.close(); }
  // (c) she never turns and walks on: it is never said
  game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    const BAY = marker('cp_gallery_bay');
    await game.run([{ call: ['teleport', T.pos[0], T.pos[1], T.pos[2], 180, 0] }, { steps: 3 * 60 }, tp(BAY, 180), { steps: 20 * 60 }]);
    const said = await keys(game, seq);
    assert.ok(!said.includes('nar_watcher_1') && !said.includes('nar_watcher_2'), `a figure she never looked at is not described (${said.join(' ')})`);
    assert.ok((await game.state()).world.flags.includes('trg:trg_watcher'), 'she went by: the moment is over');
    assert.equal((await game.state()).systems.world.director.watch.glint, false, 'and no star is left blinking in the niche');
  } finally { await game.close(); }
});

// ---- the lift head's diagram --------------------------------------------------------------------------------------------
test('the diagram: looked at from across the hall once the Tamper is down, its three lines start with the drawing in the middle of her view', async () => {
  const D = marker('prop_hall_diagram'), T = marker('trg_hall_diagram');
  const centre = [D.pos[0], D.pos[1] + D.params.height / 2, D.pos[2]];
  const game = await open(srv, { checkpoint: 'cp_hall_gantry' });
  try {
    await game.dbg('god', true);
    // (a pier of the ring hides the drawing from the hall's centre line: she stands north of it, west of the trigger)
    await game.run([{ call: ['teleport', T.pos[0] - T.size[0] / 2 - 3, T.pos[1], -20, -90, 0] }, { steps: 5 }]);
    await game.run([{ aimAt: centre, steps: 60 }, { aim: [90, 0], steps: 5 }]);
    assert.ok(!(await game.state()).world.flags.includes('trg:trg_hall_diagram'), 'the Tamper still stands: looking at the drawing says nothing');
    await game.dbg('clearEncounter', 'enc_matador');
    await game.run([{ steps: 30 * 60 }]);
    assert.ok(!(await game.state()).world.flags.includes('trg:trg_hall_diagram'), 'her back to it, west of the floor before the ring: not yet');
    const seq = await mark(game);
    const t0 = (await game.state()).tick;
    await game.run([{ aimAt: centre, steps: 4 }, { steps: 20 * 60 }]);
    assert.ok((await game.state()).world.flags.includes('trg:trg_hall_diagram'), 'the look starts it');
    const said = (await lines(game, seq)).filter((l) => l.key.startsWith('nar_mark'));
    assert.deepEqual(said.map((l) => l.key), ['nar_mark_1', 'nar_mark_2', 'nar_mark_3']);
    assert.ok(said[0].tick - t0 <= 45, `on the look (${(said[0].tick - t0) / 60} s; pass i2: after 0.4 s of it)`);
  } finally { await game.close(); }
});

// ---- the Tally House ----------------------------------------------------------------------------------------------------
test('the station answers the light as the room line on screen ends: next in line, and (pass i2) never over a narrator\'s line', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    const stand = marker('trg_pz_daylight').params.standSpot;
    await game.run([{ steps: 60 }, { call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 30 * 60 }]);
    const seq = await mark(game);
    await game.run([...shootScript('ia_latch_n'), { steps: 5 }, ...shootScript('ia_cloth_cord'), { steps: 5 }]);
    // room lines are being said when the cell wakes
    for (const k of ['nar_marks', 'nar_rule', 'nar_plenty']) await say(game, k);
    await game.until({ event: 'world/hatch_powered' }, 30 * 60);
    const powered = (await game.events(seq, 'world/hatch_powered'))[0].tick;
    await game.run([{ steps: 60 * 12 }]);
    const said = await lines(game, seq);
    const w1 = said.find((l) => l.key === 'stn_tally_wake_1'), w2 = said.find((l) => l.key === 'stn_tally_wake_2');
    assert.ok(w1 && w2, `both wake lines (${said.map((l) => l.key).join(' ')})`);
    const before = said.filter((l) => l.tick < w1.tick).at(-1);
    assert.ok(before, 'a room line was on screen');
    assert.ok(w1.tick - powered <= before.ticks + 20, `the first within one line of the light (${(w1.tick - powered) / 60} s): the very next line`);
    assert.ok(w1.tick >= before.tick + before.ticks, `the room line had all of its time (${(w1.tick - before.tick) / 60} of ${before.ticks / 60} s; pass i1 cut it at two thirds)`);
    const between = said.filter((l) => l.tick > before.tick && l.tick < w1.tick);
    assert.deepEqual(between.map((l) => l.key), [], 'no other line between them');
    assert.ok(w2.tick - w1.tick <= w1.ticks + 20, 'the second straight after');
  } finally { await game.close(); }
});

// ---- the street's quiet line ---------------------------------------------------------------------------------------------
test('"Every door wore the well mark" is on screen before the latch knot is described: walking west it starts at the trigger, the knot\'s line from sixteen metres', async () => {
  const knot = marker('knot_yard_latch'), M = marker('trg_marks');
  const game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    await game.dbg('clearEncounter', 'enc_street');
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    // 26 m from the latch, looking straight at it (it was "seen" from here, and its 6.5 s line went first)
    const east = M.pos[0] + M.size[0] / 2;
    await game.run([{ call: ['teleport', east + 3, 0, knot.pos[2], 90, 0] }, { steps: 2 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 30 }]);
    assert.deepEqual(await keys(game, seq), [], 'at 25 m: nothing yet');
    // into the trigger, still looking at the latch
    await game.run([{ call: ['teleport', east - 1, 0, knot.pos[2], 90, 0] }, { steps: 2 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 20 }]);
    assert.deepEqual(await keys(game, seq), ['nar_marks'], 'the street\'s line is on screen first');
    // on to within 16 m: the knot's line is next
    await game.run([{ call: ['teleport', knot.pos[0] + 14, 0, knot.pos[2], 90, 0] }, { steps: 2 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 7 * 60 }]);
    assert.deepEqual(await keys(game, seq), ['nar_marks', 'nar_first_knot'], 'then the latch');
    // (pass i2) the knot's line is the very next: the street's line is heard out, never cut
    const said = await lines(game, seq);
    assert.ok(said[1].tick >= said[0].tick + said[0].ticks && said[1].tick - said[0].tick <= said[0].ticks + 45, `straight after the street's line (${(said[1].tick - said[0].tick) / 60} s of ${said[0].ticks / 60})`);
  } finally { await game.close(); }
});

// ---- the sighting -------------------------------------------------------------------------------------------------------
test('"When she looked again there was only rim": turning to the opened door is looking away, and the line is not cut at the threshold', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const DOWSER = marker('vista_dowser').params.target;
    const seq = await mark(game);
    // in the strip, looking at him until the door's clock opens the door (the line that names him has ended by then)
    await game.run([{ call: ['teleport', -88, 0, -10.5, 90, 0] }, { steps: 2 }, { aimAt: DOWSER, steps: 2 }]);
    const opened = await game.until({ event: 'door/state', where: { id: 'door_tally', state: 'opening' } }, 20 * 60);
    assert.ok(opened.met, 'the door opens by its clock while she watches him');
    assert.ok(!(await keys(game, seq)).includes('nar_dowser_gone'), 'he still stands there');
    // she turns to the door: half a second is enough now (it took two, and a brisk player was through the door by then)
    const door = marker('door_tally');
    const t0 = (await game.state()).tick;
    await game.run([{ aimAt: [door.pos[0], door.pos[1] + 1.2, door.pos[2]], steps: 45 }]);
    const gone = (await lines(game, seq)).find((l) => l.key === 'nar_dowser_gone');
    assert.ok(gone && gone.tick - t0 <= 45, `said as she turns away (${gone ? (gone.tick - t0) / 60 : 'never'} s)`);
    // and she walks in under it: the line is heard to its end
    const IN = marker('cp_tally_enter');
    await game.run([{ call: ['teleport', IN.pos[0], IN.pos[1], IN.pos[2] - 2, 180, 0] }, { steps: 5 * 60 }]);
    const end = (await game.events(seq, 'story/line_end')).find((e) => e.payload.key === 'nar_dowser_gone');
    assert.ok(end && end.tick - gone.tick >= gone.ticks - 1, `held its full time (${end ? (end.tick - gone.tick) / 60 : 0} of ${gone.ticks / 60} s)`);
  } finally { await game.close(); }
});

// ---- the rim ------------------------------------------------------------------------------------------------------------
test('the rim: at the ledge\'s edge the thread of light and the Rule\'s lean are told before the lamps; a branch tells them last before the fire (pass i3)', async () => {
  // (a) she stops where the town shows
  let game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([tp(ARRIVE), { steps: 20 }, { call: ['teleport', LAMPS.pos[0] + 3, LAMPS.pos[1], LAMPS.pos[2] + 2, 0, 0] }, { steps: 30 * 60 }]);
    assert.deepEqual((await keys(game, seq)).slice(0, 5), ['nar_rim_1', 'nar_rim_2', 'nar_rim_3', 'nar_lamps', 'nar_lamps_count'], 'in the order they were written');
  } finally { await game.close(); }
  // (b) straight to the stone, its lines heard, then the north edge without ever having looked at the town
  game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([tp(ARRIVE), { steps: 20 }, tp(STONE, 90), { steps: 2 }, { aimAt: ROUND.pos, steps: 2 }]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 90 * 60);
    const atStone = await keys(game, seq);
    assert.ok(!atStone.includes('nar_rim_2') && !atStone.includes('nar_rim_3'), `bent over the stone they wait (${atStone.join(' ')})`);
    await game.run([{ call: ['teleport', EXIT.pos[0] - 6, EXIT.pos[1], EXIT.pos[2] + 0.2, 0, 0] }, { steps: 3 }]);
    const card = await game.until({ event: 'ending/card' }, 180 * 60);
    assert.ok(card.met, 'the end card');
    const all = await keys(game, seq);
    // pass i2 (both story reviewers: "Against it she could see how far the Rule leaned" was said between the branch's
    // decision and its lines): scenery she never turned to is not told once the branch runs
    for (const k of ['nar_leave', 'nar_fire', 'nar_last']) assert.ok(all.includes(k), `${k} (${all.join(' ')})`);
    // pass i3 (story reviewer a: "Further than from the gully", the one line that says what the mending cost, was lost
    // to a player who walks straight to the stone): the Rule's line is never lost. Unsaid when the branch runs, it is
    // told last before the fire, behind the line that names the thread it is seen against
    const left = (await game.events(seq, 'ending/stone'))[0];
    const tail = (await lines(game, seq)).filter((l) => l.tick >= left.tick).map((l) => l.key);
    const leave = STORY.meta.rules.ending_branch.leave;
    // (pass i4: the scenery lines she is owed come BEFORE the branch's own; nothing stands between "Six, then." and the fire)
    assert.deepEqual(tail, ['nar_rim_2', 'nar_rim_3', ...leave], `after the leave: the thread and the Rule, its own lines, the fire's (${tail.join(' ')})`);
  } finally { await game.close(); }
});

test('a take between the stone\'s first and last line is answered at once with the take\'s two (pass i3); the Rule\'s line is not lost', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([tp(STONE, 90), { steps: 2 }, { aimAt: ROUND.pos, steps: 2 }]);
    await game.until({ event: 'story/line', where: { key: 'nar_stone_1' } }, 60 * 60);
    await game.run([{ steps: 90 }, ...takeRound(ROUND)]);
    const took = (await game.events(seq, 'ending/stone'))[0];
    assert.ok(took && took.payload.taken, 'taken while "Six spent cases on a flat stone" is on screen');
    await game.until({ event: 'ending/card' }, 180 * 60);
    const after = (await lines(game, seq)).filter((l) => l.tick >= took.tick).map((l) => l.key);
    // pass i3 (story reviewer b): her act is answered on its tick, and nothing describes a stone she has emptied
    assert.deepEqual(after.slice(0, 2), ['nar_take_1', 'nar_take_2'], after.join(' '));
    assert.ok((await lines(game, seq)).find((l) => l.key === 'nar_take_1').tick - took.tick <= 1, 'on the tick of the take');
    for (const k of ['nar_stone_2', 'nar_stone_3', 'nar_stone_4', 'nar_stone_short']) assert.ok(!after.includes(k), `${k} is not said (${after.join(' ')})`);
    assert.equal(after.filter((k) => k === 'nar_rim_3').length, 1, `the Rule's line is told, once (${after.join(' ')})`);
    assert.ok(after.indexOf('nar_rim_3') < after.indexOf('nar_fire'), 'before the fire');
  } finally { await game.close(); }
});

// ---- the other ending ----------------------------------------------------------------------------------------------------
test('after the end card "Go on" starts from the rim again: the stone untouched, the rim told again, and the other ending can be walked', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const flow = (action) => game.page.evaluate(async (a) => { const d = window.__dbg; d.emit('ui/action', { action: a }); await d.ext.core.idle(); for (let i = 0; i < 400 && d.ext.core.busy(); i++) { await new Promise((r) => setTimeout(r, 10)); } await d.ext.core.idle(); return d.state().game; }, action);
    let seq = await mark(game);
    await game.run([tp(ARRIVE), { steps: 20 }, tp(STONE, 90), { steps: 5 }, ...takeRound(ROUND)]);
    const card = await game.until({ event: 'ending/card' }, 180 * 60);
    assert.ok(card.met, 'the first ending: the round taken');
    const first = await keys(game, seq);
    assert.ok(first.includes('nar_take_2') && first.includes('nar_last'));
    const stats1 = (await game.state()).stats;
    assert.equal(stats1.tookStoneRound, true);
    // to the title: the save of the rim is offered
    assert.equal(await flow('quit_to_title'), 'title');
    const stored = await game.page.evaluate(() => { const s = window.__dbg.ext.core.ctx().save.readStored(); return s ? { cp: s.checkpoint, took: s.world.stats.tookStoneRound, shots: s.world.stats.shotsFired ?? null } : null; });
    assert.ok(stored && stored.cp === 'cp_rim' && stored.took === false, `the title has the rim to go on from (${JSON.stringify(stored)})`);
    // "Go on"
    assert.equal(await flow('continue'), 'playing');
    await game.run([{ steps: 5 }]);
    let st = await game.state();
    assert.equal(st.world.checkpoint, 'cp_rim');
    assert.equal(st.stats.tookStoneRound, false, 'the round is on the stone again');
    assert.equal((await status(game)).ending.phase, 0, 'no branch has begun');
    seq = await mark(game);
    // the rim is told again, and this time she leaves the round
    await game.run([tp(ARRIVE), { steps: 20 }, tp(STONE, 90), { steps: 2 }, { aimAt: ROUND.pos, steps: 2 }]);
    assert.equal((await game.state()).systems.world.interact.focus, 'ia_stone_round', 'the round is offered again');
    await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 90 * 60);
    await game.run([{ call: ['teleport', EXIT.pos[0] - 6, EXIT.pos[1], EXIT.pos[2] + 0.2, 0, 0] }, { steps: 3 }]);
    const again = await game.until({ event: 'ending/card' }, 180 * 60);
    assert.ok(again.met, 'the second ending');
    const second = await keys(game, seq);
    for (const k of ['nar_rim_1', 'nar_lamps', 'nar_lamps_count', 'nar_stone_1', 'nar_stone_4', 'nar_stone_wait', 'nar_leave', 'nar_fire', 'nar_last']) assert.ok(second.includes(k), `${k} is said in the second telling (${second.join(' ')})`);
    assert.ok(!second.includes('nar_take_2'));
    st = await game.state();
    assert.equal(st.stats.tookStoneRound, false, 'the card of the second ending says she left it');
    const kept = await game.page.evaluate(() => window.__dbg.ext.core.ctx().save.readStored()?.checkpoint ?? null);
    assert.equal(kept, 'cp_rim', 'and the rim can be walked again');
    // closer, pass i1: the end card's own item "The rim again" sends 'continue' from the ending state (no trip to the title)
    assert.equal((await game.state()).game, 'ending');
    assert.equal(await flow('continue'), 'playing', 'straight from the end card');
    await game.run([{ steps: 5 }]);
    st = await game.state();
    assert.equal(st.world.checkpoint, 'cp_rim');
    assert.equal(st.stats.tookStoneRound, false);
    assert.equal((await status(game)).ending.phase, 0, 'the third telling has not begun a branch');
    await game.run([tp(ARRIVE), { steps: 20 }, tp(STONE, 90), { steps: 5 }, ...takeRound(ROUND)]);
    const third = await game.until({ event: 'ending/card' }, 180 * 60);
    assert.ok(third.met && (await game.state()).stats.tookStoneRound === true, 'and the round can be taken this time');
    // "Walk it again" is a new run: the save goes
    assert.equal(await flow('again'), 'playing');
    await game.run([{ steps: 5 }]);
    assert.equal((await game.state()).world.checkpoint, 'cp_lip_start');
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.core.ctx().save.current?.checkpoint ?? null), 'cp_lip_start');
  } finally { await game.close(); }
});

void STORY;
