// Polish round 2: one test per bug the critics filed against the world (docs/requests/code-world.md, section 8).
// The real world beside the core stubs, driven by the step hook.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, STORY, hintClock, mark, marker, open, server, shootScript, takeRound } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lineKeys = async (game, since) => (await game.events(since, 'story/line')).map((e) => e.payload.key);
const die = [{ call: ['god', false] }, { call: ['setHealth', 0] }, { until: { state: 'playing' }, maxSteps: 400 }, { steps: 3 }];

// ---- the kept-round hint ladder ------------------------------------------------------------------------------------
test('the kept ladder goes on through a death in phase 3a; the second death says the line that names the mark at once', async () => {
  let game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.run([{ steps: 600 }]);
    const seq = await mark(game);
    // 12 s of the ladder, a death, and 5 s more: tier 1 falls at 15 s of ladder time, not 15 s after the respawn
    await game.run([{ call: ['emit', 'boss/charge_required', {}] }, { steps: 12 * 60 }]);
    assert.equal((await game.events(seq, 'puzzle/hint')).length, 0, 'nothing before 15 s');
    await game.run(die);
    const respawn = (await game.state()).tick;
    // (the Windlass asks again on every respawn: the clock must not start over)
    await game.run([{ call: ['emit', 'boss/charge_required', {}] }, { steps: 5 * 60 }]);
    let hints = (await game.events(seq, 'puzzle/hint')).filter((e) => e.payload.puzzle === 'kept');
    assert.deepEqual(hints.map((e) => e.payload.tier), [1], 'tier 1 in the second life');
    assert.ok(hints[0].tick - respawn <= 3 * 60 + 30, `3 s into the second life (${((hints[0].tick - respawn) / 60).toFixed(1)} s), not 15`);
    // a second death in the phase: hint_kept_2 on the respawn, whatever the clock held
    await game.run(die);
    const second = (await game.state()).tick;
    await game.run([{ call: ['emit', 'boss/charge_required', {}] }, { steps: 8 * 60 }]);
    hints = (await game.events(seq, 'puzzle/hint')).filter((e) => e.payload.puzzle === 'kept');
    assert.deepEqual(hints.map((e) => e.payload.tier), [1, 2]);
    assert.ok(hints[1].tick - second <= 30, `tier 2 at once after the second death (${hints[1].tick - second} ticks)`);
    const line = (await game.events(seq, 'story/line')).find((e) => e.payload.key === 'hint_kept_2');
    assert.ok(line && line.tick - second <= 7 * 60, 'and the line is heard in that life');
    assert.equal(line.payload.text, STORY.lines.hint_kept_2.text);
  } finally { await game.close(); }
  // a player who dies every 20 s (the critic's run): each life adds to the ladder; the prompt comes back after a restore
  game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.run([{ steps: 600 }, { call: ['setOption', 'hints', 'normal'] }]);
    const seq = await mark(game);
    await game.run([{ call: ['emit', 'boss/charge_required', {}] }, { steps: 20 * 60 }]);
    for (let i = 0; i < 3; i++) await game.run([...die, { call: ['emit', 'boss/charge_required', {}] }, { steps: 20 * 60 }]);
    const ev = await game.events(seq);
    const tiers = ev.filter((e) => e.name === 'puzzle/hint' && e.payload.puzzle === 'kept').map((e) => e.payload.tier);
    assert.deepEqual(tiers, [1, 2, 3, 4], 'four lives of 20 s reach every tier (80 s of ladder)');
    const prompts = ev.filter((e) => e.name === 'ui/hint' && e.payload.key === 'ui_prompt_kept' && e.payload.show);
    assert.ok(prompts.length >= 2, 'the F prompt is put back after the restore that took it down');
    assert.equal((await game.state()).systems.world.kept.ladder, 4);
    // a debug warp is another timeline: the ladder starts from nothing
    await game.dbg('checkpoint', 'cp_boss_p3');
    await game.run([{ steps: 5 }]);
    assert.equal((await game.state()).systems.world.kept.ladderSeconds, 0);
  } finally { await game.close(); }
});

// ---- seven jugs, tier 2 --------------------------------------------------------------------------------------------
test('seven_jugs T2: "Six jugs down" is only said when six are down; before that the nudge is a glint and a creak', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 900 }]);
    const stand = marker('trg_pz_jugs').params.standSpot;
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 2 }]);
    let seq = await mark(game);
    await hintClock(game, 119.9);
    await game.run([{ steps: 400 }]);
    let ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'puzzle/hint' && e.payload.puzzle === 'seven_jugs' && e.payload.tier === 2), 'tier 2 reached with none shot');
    assert.ok(!ev.some((e) => e.name === 'story/line' && e.payload.key === 'hint_jugs_2'), 'the false line is not said');
    assert.ok(ev.some((e) => e.name === 'audio/cue' && e.payload.cue === 'sweep_creak'), 'the sweep creaks instead');
    assert.ok((await game.state()).systems.render.calls.some((c) => c.startsWith('vfx.acquireCard:halo')), 'and a jug glints');
    for (const id of ['ia_jug_1', 'ia_jug_2', 'ia_jug_3', 'ia_jug_4', 'ia_jug_5', 'ia_jug_6']) await game.run([...shootScript(id), { steps: 30 }]);
    await game.run([{ steps: 500 }]);
    assert.equal((await game.state()).puzzles.seven_jugs.step, 6);
    seq = await mark(game);
    await hintClock(game, 119.9);
    await game.run([{ steps: 60 }]);
    ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'story/line' && e.payload.key === 'hint_jugs_2'), 'with six down the line is true, and said');
  } finally { await game.close(); }
});

// ---- the rim -------------------------------------------------------------------------------------------------------
const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), ARRIVE = marker('trg_rim_arrive'), LAMPS = marker('trg_lamps');

test('the rim fail-safes do not run while she is still in the lift cage; forced from the rim unseen, no line about the round', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([{ steps: 160 * 60 }]);                 // well past 150 s, standing in the cage
    let s = await game.state();
    assert.equal(s.game, 'playing');
    assert.equal(s.systems.world.ending.out, false);
    assert.equal(s.systems.world.ending.boosted, false);
    let ev = await game.events(seq);
    assert.ok(!ev.some((e) => e.name.startsWith('ending/') && e.name !== 'ending/lamps'), 'nothing ends in the cage');
    assert.ok(!ev.some((e) => e.name === 'story/line' && e.payload.key.startsWith('nar_stone')), 'the stone is not narrated from the cage');
    // out of the cage, away from the stone: the pointer at 60 s, the end at 150 s, counted from here
    const out = (await game.state()).tick;
    await game.run([{ call: ['teleport', 20, 18, 108, 0, 0] }, { steps: 61 * 60 }]);
    const pointer = (await game.events(seq, 'story/line')).find((e) => e.payload.key === 'nar_stone_1');
    assert.ok(pointer && Math.abs(pointer.tick - out - 3600) <= 60, 'the pointer 60 s after she stepped out');
    await game.run([{ steps: 90 * 60 }]);
    const end = await game.until({ event: 'ending/card' }, 60 * 60);
    assert.ok(end.met, 'the end card');
    ev = await game.events(seq);
    const stone = ev.find((e) => e.name === 'ending/stone');
    assert.ok(stone && stone.payload.taken === false && Math.abs(stone.tick - out - 9000) <= 60, 'the stage ends 150 s after she stepped out');
    const lines = ev.filter((e) => e.name === 'story/line').map((e) => e.payload.key);
    for (const k of ['nar_take_1', 'nar_take_2', 'nar_leave']) assert.ok(!lines.includes(k), `${k} is not said about a round she never saw`);
    assert.ok(lines.includes('nar_fire') && lines.includes('nar_last'));
    s = await game.state();
    assert.equal(s.game, 'ending');
  } finally { await game.close(); }
});

test('the ending waits for the narrator: a round taken at once still ends on the last line, heard, before the card', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    // off the lift through the arrival trigger (four lines, 18.5 s), into the lamps' corner (two more), to the stone, and
    // the round taken inside the first two seconds on the rim: the critic's bot at its fastest
    await game.run([
      { call: ['teleport', ARRIVE.pos[0], ARRIVE.pos[1], ARRIVE.pos[2], 0, 0] }, { steps: 20 },
      { call: ['teleport', LAMPS.pos[0] + 3, LAMPS.pos[1], LAMPS.pos[2] + 2, 0, 0] }, { steps: 20 },
      { call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 5 }, ...takeRound(ROUND),
    ]);
    const taken = (await game.events(seq, 'ending/stone'))[0];
    assert.ok(taken && taken.payload.taken === true, 'the round is taken');
    const end = await game.until({ event: 'ending/card' }, 120 * 60);
    assert.ok(end.met, 'the end card');
    await game.run([{ steps: 10 * 60 }]);                  // nothing may start behind the card
    const ev = await game.events(seq);
    const card = ev.find((e) => e.name === 'ending/card'), fire = ev.find((e) => e.name === 'ending/fire');
    const lines = ev.filter((e) => e.name === 'story/line');
    const keys = lines.map((e) => e.payload.key);
    const ends = ev.filter((e) => e.name === 'story/line_end');
    // what was waiting about the rim's scenery is dropped; the lamps (polish round 3: the end card counts them), the
    // stone, the branch, the fire and the last line follow in order
    // (polish round 4: of the stone's four only the first; the other three describe a round she has already pocketed)
    assert.deepEqual(keys.slice(1), ['nar_lamps', 'nar_lamps_count', 'nar_stone_1', 'nar_take_1', 'nar_take_2', 'nar_fire', 'nar_last'], keys.join(' '));
    assert.equal(keys[0], 'nar_rim_1', 'the line that was on screen is not cut');
    const fireLine = lines.find((e) => e.payload.key === 'nar_fire'), lastLine = lines.find((e) => e.payload.key === 'nar_last');
    assert.ok(fireLine.tick >= fire.tick && fireLine.tick - fire.tick <= 2 * 60, `the narrator names the fire within 2 s of it (${(fireLine.tick - fire.tick) / 60} s)`);
    const lastEnd = ends.find((e) => e.payload.key === 'nar_last');
    assert.ok(lastEnd && lastEnd.tick - lastLine.tick >= Math.round(STORY.lines.nar_last.seconds * 60) - 1, 'the last line holds its full time');
    assert.ok(lastEnd.tick <= card.tick - 239, `the card comes 4 s after the last line has been heard (${(card.tick - lastEnd.tick) / 60} s)`);
    assert.ok(!lines.some((e) => e.tick > card.tick), 'no line starts behind the end card');
    assert.ok(ev.some((e) => e.name === 'audio/cue' && e.payload.cue === 'wire_resolve' && e.tick === lastLine.tick));
    assert.ok(ev.some((e) => e.name === 'story/card' && e.payload.key === 'card_end'));
  } finally { await game.close(); }
});

test('nar_lamps_count spells the count in words', async () => {
  const game = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    await game.page.evaluate(() => { for (let i = 0; i < 28; i++) window.__dbg.emit('enemy/freed', { x: 0, y: 0, z: 0, id: 'x#' + i, encounter: '', cause: 'crown', counted: true }); });
    await game.dbg('checkpoint', 'cp_rim');
    const seq = await mark(game);
    await game.run([{ call: ['teleport', LAMPS.pos[0] + 3, LAMPS.pos[1], LAMPS.pos[2] + 2, 0, 0] }, { steps: 12 * 60 }]);
    const line = (await game.events(seq, 'story/line')).find((e) => e.payload.key === 'nar_lamps_count');
    assert.ok(line, 'the count is said');
    assert.equal(line.payload.text, STORY.lines.nar_lamps_count.text.replace('{n}', 'Thirty-seven'));
    assert.ok(!/\d/.test(line.payload.text), 'no digit in the narrator\'s mouth');
  } finally { await game.close(); }
});

// ---- the first freed, the first felled, the Transit's turn --------------------------------------------------------
test('nar_first_seat on the first Bider freed and nar_first_fell on the first felled: once each, on the event', async () => {
  const game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.run([{ steps: 900 }]);
    const seq = await mark(game);
    const down = (name, i) => ({ call: ['emit', name, { x: 0, y: 0, z: 0, id: 'x#' + i, encounter: '', cause: 'crown', counted: true }] });
    // a Bider that is not hers (the one the Tamper breaks in its vignette: counted false) teaches nothing
    await game.run([{ call: ['emit', 'enemy/felled', { x: 0, y: 0, z: 0, id: 'v#0', encounter: '', counted: false }] }, { steps: 30 }]);
    assert.equal((await game.events(seq, 'story/line')).length, 0, 'not for a Bider she did not fell');
    await game.run([down('enemy/freed', 1), { steps: 2 }]);
    let lines = await game.events(seq, 'story/line');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].payload.key, 'nar_first_seat');
    assert.equal(lines[0].payload.text, STORY.lines.nar_first_seat.text);
    // the felled one while the first line is still on screen: next in line, ahead of anything waiting
    await game.run([{ call: ['emit', 'story/say', { key: 'nar_marks' }] }, down('enemy/felled', 2), { steps: 12 * 60 }]);
    lines = await game.events(seq, 'story/line');
    assert.deepEqual(lines.map((e) => e.payload.key), ['nar_first_seat', 'nar_first_fell', 'nar_marks']);
    await game.run([down('enemy/freed', 3), down('enemy/felled', 4), { steps: 12 * 60 }]);
    assert.equal((await game.events(seq, 'story/line')).length, 3, 'never again');
    // a Tamper or a Transit dying is neither
    const g2seq = await mark(game);
    await game.run([{ call: ['emit', 'enemy/died', { x: 0, y: 0, z: 0, id: 't#1', kind: 'transit', encounter: '' }] }, { steps: 60 }]);
    assert.equal((await game.events(g2seq, 'story/line')).length, 0);
  } finally { await game.close(); }
});

test('nar_transit is said on the turn, next in line; a Transit shot dead inside its vignette never says it', async () => {
  const yard = LAYOUT.encounters.find((e) => e.id === 'enc_yard');
  const t1 = yard.waves[0].spawns[0];
  for (const killed of [false, true]) {
    const game = await open(srv, { checkpoint: 'cp_street_clear' });
    try {
      await game.dbg('god', true);
      await game.run([{ steps: 600 }]);
      const seq = await mark(game);
      // the knot on the yard door starts the fight: the bell vignette (4 s), then wave A
      const knot = marker('knot_yard_latch');
      let burst = false;
      for (const [x, z] of [[knot.pos[0] + 4, knot.pos[2]], [knot.pos[0] + 3, knot.pos[2] + 1], [knot.pos[0] + 5, knot.pos[2] - 1]]) {
        await game.run([{ call: ['teleport', x, 0, z, 90, 0] }, { steps: 1 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 1 }]);
        if ((await game.dbg('probe')).entityId !== 'knot_yard_latch') continue;
        await game.run([{ tap: 'fire', steps: 2 }]);
        burst = true; break;
      }
      assert.ok(burst, 'the knot was shot');
      let s = await game.state();
      assert.equal(s.encounters.enc_yard.state, 'vignette');
      // a room's worth of narration is waiting when the moment comes
      await game.run([{ call: ['emit', 'story/say', { key: 'nar_marks' }] }, { call: ['emit', 'story/say', { key: 'nar_plenty' }] }, { call: ['emit', 'story/say', { key: 'nar_kneeler' }] }]);
      await game.until({ event: 'encounter/wave', where: { id: 'enc_yard' } }, 6 * 60);
      await game.run([{ steps: 2 }]);
      s = await game.state();
      const transit = s.enemies.find((e) => e.encounter === 'enc_yard' && e.alive);
      assert.ok(transit, `wave A: the Transit of ${t1}`);
      // shot dead before it has turned on her
      if (killed) await game.run([{ call: ['emit', 'enemy/died', { x: transit.x, y: transit.y, z: transit.z, id: transit.id, kind: 'transit', encounter: 'enc_yard' }] }]);
      const turn = (await game.state()).tick;
      await game.run([{ call: ['emit', 'enemy/state', { id: transit.id, kind: 'transit', from: 'vignette', to: 'plant' }] }, { steps: 40 * 60 }]);
      const lines = await game.events(seq, 'story/line');
      const said = lines.find((e) => e.payload.key === 'nar_transit');
      if (killed) assert.equal(said, undefined, 'dropped with the Transit');
      else {
        assert.ok(said, 'said');
        // behind the lines of the moments before it (the knot she shot, the station waking), ahead of everything that waits
        const keys = lines.map((e) => e.payload.key);
        assert.ok(said.tick - turn <= 12 * 60, `${((said.tick - turn) / 60).toFixed(1)} s after the turn`);
        assert.deepEqual(keys.filter((k) => ['nar_first_knot', 'stn_yard_wake', 'nar_transit'].includes(k)), ['nar_first_knot', 'stn_yard_wake', 'nar_transit'], 'the fight\'s lines in the order of its moments');
        for (const k of ['nar_marks', 'nar_plenty', 'nar_kneeler']) assert.ok(!keys.includes(k) || keys.indexOf(k) > keys.indexOf('nar_transit'), `${k} waits behind it`);
      }
    } finally { await game.close(); }
  }
});

test('narration does not follow her into the next place: lines still waiting when she has left are dropped, the load-bearing kept', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 60 }]);
    const seq = await mark(game);
    // half a minute of street narration queued, with one line the story stands on in the middle of it
    const say = (key) => ({ call: ['emit', 'story/say', { key }] });
    // (each said at a moment of its own: lines said together are one batch and play whole)
    const script = [];
    for (const k of ['nar_plenty', 'nar_kneeler', 'nar_marks', 'nar_seven', 'nar_first_knot', 'nar_rule']) script.push(say(k), { steps: 2 });
    await game.run([...script, { steps: 50 }]);
    // she walks into the Tally House: another zone
    const enter = marker('cp_tally_enter');
    await game.page.evaluate(() => window.__dbg.ext.world.forceDoor('door_tally', 'open'));
    await game.run([{ call: ['teleport', enter.pos[0], enter.pos[1], enter.pos[2], 0, 0] }, { steps: 60 * 60 }]);
    const s = await game.state();
    assert.equal(s.world.zone, 'tally_house');
    const keys = await lineKeys(game, seq);
    assert.ok(keys.includes('nar_seven'), 'the load-bearing line is still said: ' + keys.join(' '));
    for (const k of ['nar_marks', 'nar_first_knot', 'nar_rule']) assert.ok(!keys.includes(k), `${k} (about the street) is not said in the Tally House`);
    assert.ok(keys.includes('nar_tally_1') && keys.includes('nar_tally_3'), 'the house\'s own lines play');
    assert.ok(s.systems.world.story.stale >= 3, `dropped as stale: ${s.systems.world.story.stale}`);
    // told once is told: a stale narrator line is not said later by another marker
    await game.run([say('nar_marks'), { steps: 8 * 60 }]);
    assert.ok(!(await lineKeys(game, seq)).includes('nar_marks'));
  } finally { await game.close(); }
});

// ---- the key hints -------------------------------------------------------------------------------------------------
test('the reload hint appears on the second dry click although each click starts a reload; R takes it away for good', async () => {
  const game = await open(srv);
  try {
    await game.run([{ steps: 30 }]);
    const seq = await mark(game);
    const hints = async () => (await game.events(seq, 'ui/hint')).filter((e) => e.payload.key === 'ui_hint_reload').map((e) => e.payload.show);
    const dry = [{ call: ['emit', 'weapon/dry_fire', { reason: 'empty' }] }, { call: ['emit', 'weapon/reload', { stage: 'open', chambered: 0, reserve: 18 }] }, { steps: 2 }];
    await game.run(dry);
    assert.deepEqual(await hints(), [], 'not after one dry click');
    assert.ok(!(await game.state()).world.flags.includes('did_reload'), 'a reload the click started is not "she has reloaded"');
    await game.run([{ steps: 300 }, ...dry]);
    assert.deepEqual(await hints(), [true], 'on the second dry click');
    await game.run([{ steps: 7 * 60 }]);
    assert.deepEqual(await hints(), [true, false], 'it stands six seconds');
    await game.run(dry);
    assert.deepEqual(await hints(), [true, false, true], 'and comes back with the next dry click');
    // the reload action itself: the tick the key is pressed on
    await game.page.evaluate(() => { const dbg = window.__dbg; dbg.tap('reload'); dbg.step(1, false); dbg.emit('weapon/reload', { stage: 'open', chambered: 0, reserve: 18 }); dbg.step(2, false); });
    assert.deepEqual(await hints(), [true, false, true, false]);
    assert.ok((await game.state()).world.flags.includes('did_reload'));
    await game.run([...dry, ...dry, { steps: 60 }]);
    assert.deepEqual(await hints(), [true, false, true, false], 'never again');
  } finally { await game.close(); }
});

test('the interact hint never stands under the interact prompt saying the same thing', async () => {
  const game = await open(srv);
  try {
    const note = LAYOUT.markers.find((m) => m.type === 'readable');
    // beside the note, looking at it: the prompt names the key
    await game.run([{ call: ['teleport', note.pos[0] + 1.2, note.pos[1] - 0.05, note.pos[2], 90, 0] }, { steps: 2 }, { aimAt: note.pos, steps: 6 * 60 }]);
    let s = await game.state();
    assert.equal(s.systems.world.interact.focus, note.id, 'the note is in focus');
    assert.ok(!(await game.events(0, 'ui/hint')).some((e) => e.payload.key === 'ui_hint_interact' && e.payload.show), 'no hint under the prompt');
    // looking away, still beside it and never having used the key: now the hint has something to say
    const seq = await mark(game);
    await game.run([{ aim: [-90, 30], steps: 30 }]);
    s = await game.state();
    assert.equal(s.systems.world.interact.focus, '');
    assert.ok((await game.events(seq, 'ui/hint')).some((e) => e.payload.key === 'ui_hint_interact' && e.payload.show), 'the hint, with no prompt on screen');
    const seq2 = await mark(game);
    await game.run([{ aimAt: note.pos, steps: 5 }]);
    assert.ok((await game.events(seq2, 'ui/hint')).some((e) => e.payload.key === 'ui_hint_interact' && !e.payload.show), 'and it goes when the prompt comes back');
  } finally { await game.close(); }
});

// ---- the hatch knot's nudge ----------------------------------------------------------------------------------------
test('the hatch-knot nudge is said once; after that the latch is pointed at (a glint, an outline), not the line again', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 900 }, { call: ['solvePuzzle', 'daylight'] }, { steps: 600 }]);
    const stand = marker('trg_pz_daylight').params.standSpot;
    const seq = await mark(game);
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 61 * 60 }]);
    let keys = (await lineKeys(game, seq)).filter((k) => k === 'hint_yard_knot');
    assert.equal(keys.length, 1, 'the line at 60 s');
    await game.run([{ steps: 95 * 60 }]);
    keys = (await lineKeys(game, seq)).filter((k) => k === 'hint_yard_knot');
    assert.equal(keys.length, 1, 'not again at 120 s or 150 s');
    const calls = (await game.state()).systems.render.calls;
    assert.ok(calls.includes('setOutline:knot_hatch_latch'), 'the knot is outlined: ' + calls.filter((c) => c.startsWith('setOutline')).join(' '));
    assert.ok(calls.some((c) => c.startsWith('vfx.acquireCard:halo')), 'a glint over the cowl');
    // the knot shot: the outline is taken off
    const STAND = { x: -91.9, z: -35.5 };
    await game.run([{ call: ['teleport', STAND.x, 0, STAND.z, 180, 0] }, { steps: 2 }, ...shootScript('knot_hatch_latch', 1), { steps: 5 }]);
    assert.equal((await game.state()).world.doors.ia_hatch, 'ajar');
    assert.equal((await game.state()).systems.render.calls.filter((c) => c.startsWith('setOutline')).at(-1), 'setOutline:null');
  } finally { await game.close(); }
});

// ---- the ammo floor against a Tamper alone --------------------------------------------------------------------------
test('a round on the Tamper with six or fewer left shakes one packet out of it, again no sooner than 10 s later; wholly dry, the locker wall gives one', async () => {
  const game = await open(srv, { checkpoint: 'cp_hall_gantry' });
  try {
    await game.dbg('god', true);
    const t = marker('trg_enc_matador');
    await game.run([{ steps: 60 }, { call: ['teleport', t.pos[0], t.pos[1], t.pos[2], 0, 0] }, { steps: 5 }]);
    let s = await game.state();
    assert.equal(s.encounters.enc_matador.state, 'active');
    const tamper = s.enemies.find((e) => e.encounter === 'enc_matador');
    const hit = (outcome) => ({ call: ['emit', 'combat/hit', { x: tamper.x, y: tamper.y + 1.2, z: tamper.z, shotId: 1, order: 0, ammo: 'lead_round', outcome, entityId: tamper.id, entityKind: 'tamper', part: 'plate', surface: 'metal', nx: 0, ny: 0, nz: 1, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 }] });
    const seq = await mark(game);
    await game.run([{ call: ['setAmmo', 6, 12, 0] }, hit('deflected'), { steps: 2 }]);
    assert.equal((await game.events(seq, 'pickup/spawned')).length, 0, 'not with eighteen in hand');
    await game.run([{ call: ['setAmmo', 3, 2, 0] }, hit('deflected'), { steps: 2 }]);
    let drops = (await game.events(seq, 'pickup/spawned')).filter((e) => e.payload.dropped);
    assert.equal(drops.length, 1, 'one packet at five rounds');
    assert.equal(drops[0].payload.kind, 'pk_rounds_6');
    assert.ok(Math.abs(drops[0].payload.y - tamper.y) < 0.6, `it lies on the floor (y ${drops[0].payload.y})`);
    await game.run([hit('weak'), hit('deflected'), { steps: 2 }]);
    drops = (await game.events(seq, 'pickup/spawned')).filter((e) => e.payload.dropped);
    assert.equal(drops.length, 1, 'not again at once: it is not a tap');
    // polish round 4 (R1): it repeats 10 s later (one per attempt left a plain player dry among the Biders)
    await game.run([{ steps: 10 * 60 + 5 }, { call: ['setAmmo', 2, 2, 0] }, hit('deflected'), { steps: 2 }]);
    drops = (await game.events(seq, 'pickup/spawned')).filter((e) => e.payload.dropped);
    assert.equal(drops.length, 2, 'a second packet after 10 s');
    // wholly dry she cannot shake one out: after the wait one lies a step out from the hall's line locker
    await game.run([{ call: ['setAmmo', 0, 0, 0] }, { steps: 10 * 60 + 5 }]);
    drops = (await game.events(seq, 'pickup/spawned')).filter((e) => e.payload.dropped);
    const locker = marker('ia_line_locker_hall');
    assert.equal(drops.length, 3, 'a packet for a dry cylinder and an empty reserve');
    assert.ok(Math.hypot(drops[2].payload.x - (locker.pos[0] + 1.2), drops[2].payload.z - locker.pos[2]) < 0.1, 'by the locker wall');
  } finally { await game.close(); }
});

// ---- out of lead in the boss room ------------------------------------------------------------------------------------
test('with no lead at all in the boss room the cartridge points that can give call her: a glint, a brighter lamp', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 300 }]);
    const halos = async () => (await game.state()).systems.render.calls.filter((c) => c.startsWith('vfx.acquireCard:halo')).length;
    const before = await halos();
    await game.run([{ steps: 6 * 60 }]);
    assert.equal(await halos(), before, 'nothing calls while she has lead');
    const boosts = async () => (await game.state()).systems.render.calls.filter((c) => c === 'lamps.setBoost:lamp').length;
    const b0 = await boosts();
    await game.run([{ call: ['setAmmo', 0, 0, 0] }, { steps: 6 * 60 }]);
    assert.ok((await halos()) >= before + 2, 'the boxes glint');
    assert.equal((await boosts()) - b0, 2, 'the lamps of both boxes are raised, once');
    // eighteen from a box (polish round 4; twelve in round 3): she has lead again and they fall quiet
    const box = marker('ia_ammo_box_bore_e');
    await game.run([{ call: ['teleport', box.pos[0] - 1.4, box.pos[1], box.pos[2], -90, 0] }, { steps: 1 }, { aimAt: [box.pos[0], box.pos[1] + 0.45, box.pos[2]] }, { tap: 'interact', steps: 2 }]);
    assert.equal((await game.state()).player.reserve, 18);
    const quiet = await halos();
    await game.run([{ steps: 6 * 60 }]);
    assert.equal(await halos(), quiet, 'no glint once she has a round');
    assert.equal((await boosts()) - b0, 4, 'and the lamps are put back');
  } finally { await game.close(); }
});

// ---- the title after a quit ------------------------------------------------------------------------------------------
test('a quit to the title stops the run: nothing is said or counted under the menu, and "Begin" starts a run again', async () => {
  const game = await open(srv, { checkpoint: 'cp_street_clear' });
  try {
    await game.run([{ steps: 30 }, { call: ['emit', 'story/say', { key: 'nar_marks' }] }, { call: ['emit', 'story/say', { key: 'nar_plenty' }] }, { steps: 30 }]);
    await game.page.evaluate(async () => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      ctx.state.request('paused', 'menu');
      dbg.emit('ui/action', { action: 'quit_to_title' });
      await dbg.ext.core.idle();
    });
    let s = await game.run([{ steps: 2 }]);
    assert.equal(s.game, 'title');
    assert.equal(s.systems.world.story.current, '', 'the line on screen went with the run');
    assert.deepEqual(s.systems.world.story.waiting, []);
    const seq = await mark(game);
    const seconds = s.systems.world.playSeconds;
    s = await game.run([{ call: ['emit', 'story/say', { key: 'nar_kneeler' }] }, { steps: 10 * 60 }]);
    assert.equal((await game.events(seq, 'story/line')).length, 0, 'no line under the title');
    assert.equal(s.systems.world.playSeconds, seconds);
    s = await game.run([{ call: ['emit', 'ui/action', { action: 'play' }] }, { steps: 5 }]);
    assert.equal(s.game, 'playing');
    assert.equal(s.world.checkpoint, 'cp_lip_start');
    assert.ok((await game.events(seq, 'story/line')).some((e) => e.payload.key === 'nar_open_1'), 'a new run speaks from its first line');
  } finally { await game.close(); }
});
