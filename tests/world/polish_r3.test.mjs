// Polish round 3: one test per bug the third critic panel filed against the world that is not the ending's
// (tests/world/ending.test.mjs), the seam's (seam.test.mjs) or the sighting's (misc.test.mjs). The real world beside
// the core stubs, driven by the step hook. docs/requests/code-world.md, section 9.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY, hintClock, mark, marker, open, server, shootScript } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lineKeys = async (game, since) => (await game.events(since, 'story/line')).map((e) => e.payload.key);
const say = (game, key) => game.page.evaluate((k) => window.__dbg.ext.world.say(k), key);
const die = [{ call: ['god', false] }, { call: ['setHealth', 0] }, { until: { state: 'playing' }, maxSteps: 400 }, { steps: 3 }];
const hints = async (game, since) => (await game.events(since, 'ui/hint')).map((e) => `${e.payload.key}:${e.payload.show}`);
const halos = async (game) => (await game.state()).systems.render.calls.filter((c) => c.startsWith('vfx.acquireCard:halo')).length;

// ---- lines that trail their subject -----------------------------------------------------------------------------------
test('"Two of them stood" is not said once both have sat down again: a fight\'s line is dropped if the fight is cleared when its turn comes', async () => {
  for (const cleared of [true, false]) {
    const game = await open(srv, { checkpoint: 'cp_tally_enter' });
    try {
      await game.dbg('god', true);
      await game.run([{ steps: 25 * 60 }]);                 // (the Tally House's own three lines have been said)
      const seq = await mark(game);
      // a line on screen, the fight's line behind it; then the fight is over before its turn comes
      await say(game, 'nar_rim_1'); await say(game, 'nar_two_rise');
      await game.run([{ steps: 30 }]);
      if (cleared) await game.dbg('clearEncounter', 'enc_tally');
      await game.run([{ steps: 14 * 60 }]);
      const keys = await lineKeys(game, seq);
      assert.ok(keys.includes('nar_rim_1'));
      assert.equal(keys.includes('nar_two_rise'), !cleared, cleared ? `not said after the clear (${keys.join(' ')})` : 'said while the fight stands');
      if (cleared) assert.ok((await game.state()).world.flags.includes('nar_two_rise'), 'it counts as told: nothing says it later');
    } finally { await game.close(); }
  }
});

test('"BORE PROVEN" is said on the proof, ahead of whatever was waiting (it came 31 s late, behind the station\'s lines for the dead head)', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 600 }]);
    const seq = await mark(game);
    await game.run([{ call: ['emit', 'boss/proven', { x: 0, y: 0, z: 0 }] }, { steps: 60 }]);
    const proof = (await game.state()).tick - 60;
    // three lines queue up behind the shot (the boss's own talk, the lift head coming into service)
    await say(game, 'nar_rim_1'); await say(game, 'nar_rim_2'); await say(game, 'stn_service');
    await game.run([{ steps: 30 * 60 }]);
    const ev = await game.events(seq, 'story/line');
    const keys = ev.map((e) => e.payload.key);
    for (const k of ['nar_kept', 'stn_proven', 'stn_service', 'nar_rim_2']) assert.ok(keys.includes(k), `${k} (${keys.join(' ')})`);
    assert.ok(keys.indexOf('nar_kept') < keys.indexOf('stn_service') && keys.indexOf('nar_kept') < keys.indexOf('nar_rim_2'), `the proof's lines come first (${keys.join(' ')})`);
    // polish round 4: the station first, on the shot; nar_kept after the four seconds of silence
    assert.ok(keys.indexOf('stn_proven') < keys.indexOf('nar_kept'));
    const proven = ev.find((e) => e.payload.key === 'stn_proven');
    assert.ok(proven.tick - proof <= 6 * 60, `on the proof, or behind the one line that was on screen (${((proven.tick - proof) / 60).toFixed(1)} s)`);
  } finally { await game.close(); }
});

test('a hint line a death cut off is said again after the respawn (hint_kept_2 was lost when she died as its tier fired)', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.run([{ steps: 600 }]);
    const seq = await mark(game);
    await game.run([{ call: ['emit', 'boss/charge_required', {}] }, { steps: 16 * 60 }]);      // tier 1 at 15 s
    // the narrator is speaking when tier 2 falls (30 s): the hint is next in line (pass i4: it was held for a quiet
    // moment that the Windlass's talk never gave), and she dies before its turn comes
    await game.run([{ steps: 13 * 60 }]);
    await say(game, 'nar_rim_1');
    await game.run([{ steps: 60 + 30 }]);
    let ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'puzzle/hint' && e.payload.puzzle === 'kept' && e.payload.tier === 2), 'tier 2 was reached');
    assert.ok(!ev.some((e) => e.name === 'story/line' && e.payload.key === 'hint_kept_2'), 'its line had not started (the narrator was speaking)');
    await game.run(die);
    await game.run([{ steps: 12 * 60 }]);
    ev = await game.events(seq);
    const respawn = ev.filter((e) => e.name === 'game/state' && e.payload.to === 'playing').at(-1).tick;
    const line = ev.find((e) => e.name === 'story/line' && e.payload.key === 'hint_kept_2');
    assert.ok(line && line.tick >= respawn, 'said after the respawn');
    assert.ok(line.tick - respawn <= 10 * 60, `within 10 s of it (${((line.tick - respawn) / 60).toFixed(1)} s)`);
    assert.equal(ev.filter((e) => e.name === 'puzzle/hint' && e.payload.puzzle === 'kept' && e.payload.tier === 2).length, 1, 'the tier itself is not reached twice');
  } finally { await game.close(); }
});

// ---- hints ------------------------------------------------------------------------------------------------------------
test('an empty gun comes before "W A S D to walk": the reload hint takes the place of any other key hint, which comes back after it', async () => {
  const game = await open(srv);
  try {
    let seq = await mark(game);
    await game.run([{ steps: 250 }]);
    assert.ok((await hints(game, seq)).includes('ui_hint_move:true'), 'standing still: the move hint');
    seq = await mark(game);
    // she stands where she is with an empty cylinder and no reload running (pass i1: the hint is for a gun at rest)
    await game.run([{ call: ['setAmmo', 0, 18, 0] }, { steps: 95 }]);
    let h = await hints(game, seq);
    assert.deepEqual(h, ['ui_hint_move:false', 'ui_hint_reload:true'], h.join(' '));
    assert.deepEqual((await game.state()).systems.world.interact.hints, ['ui_hint_reload']);
    // six seconds on, the reload hint has gone and the move hint is back (she still has not walked)
    await game.run([{ steps: 6 * 60 + 30 }]);
    h = await hints(game, seq);
    assert.deepEqual(h.slice(2), ['ui_hint_reload:false', 'ui_hint_move:true'], h.join(' '));
  } finally { await game.close(); }
});

test('seven_jugs with none shot: tier 1 is a slow pulse on a jug (not nothing), tier 2 says what the jugs are for', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 900 }]);
    const stand = marker('trg_pz_jugs').params.standSpot;
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 2 }]);
    let seq = await mark(game);
    const before = await halos(game);
    await hintClock(game, 59.9);
    await game.run([{ steps: 10 * 60 }]);
    let ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'puzzle/hint' && e.payload.puzzle === 'seven_jugs' && e.payload.tier === 1), 'tier 1 reached with none shot');
    const pulses = (await halos(game)) - before;
    assert.ok(pulses >= 3, `the cue pulses: ${pulses} glints in ten seconds (one every 3 s)`);
    assert.ok(ev.some((e) => e.name === 'audio/cue' && e.payload.cue === 'sweep_creak'));
    // tier 2 with fewer than six down: the line that is true then
    seq = await mark(game);
    await hintClock(game, 50);
    await game.run([{ steps: 6 * 60 }]);
    ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'puzzle/hint' && e.payload.tier === 2));
    const line = ev.find((e) => e.name === 'story/line' && e.payload.key === 'hint_jugs_2_few');
    assert.ok(line, 'hint_jugs_2_few is said');
    assert.equal(line.payload.text, STORY.lines.hint_jugs_2_few.text);
    assert.ok(!ev.some((e) => e.name === 'story/line' && e.payload.key === 'hint_jugs_2'), 'not "Six jugs down"');
    // a jug shot: the pulse stops with the correct step
    await game.run([...shootScript('ia_jug_1'), { steps: 30 }]);
    const after = await halos(game);
    await game.run([{ steps: 8 * 60 }]);
    assert.equal((await halos(game)) - after, 0, 'no pulse after a correct step');
  } finally { await game.close(); }
});

test('the proving line, tier 4: the brass step\'s glow stands lit and the step and the locker glint in turn (it drew nothing)', async () => {
  const game = await open(srv, { checkpoint: 'cp_gallery_bay' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 120 }]);
    const vol = marker('trg_pz_proving_line');
    await game.run([{ call: ['teleport', vol.pos[0], vol.pos[1], vol.pos[2], 0, 0] }, { steps: 5 }]);
    assert.ok((await game.state()).puzzles.proving_line, 'the puzzle');
    const seq = await mark(game);
    await hintClock(game, 299.9);
    const before = await halos(game);
    await game.run([{ steps: 10 * 60 }]);
    const ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'puzzle/hint' && e.payload.puzzle === 'proving_line' && e.payload.tier === 4), 'tier 4 reached');
    const calls = (await game.state()).systems.render.calls;
    const lamps = calls.filter((c) => c.startsWith('lamps.'));
    assert.equal(lamps.filter((c) => c.startsWith('lamps.setMask:mark_glow:')).at(-1), 'lamps.setMask:mark_glow:1', `the mark's glow stands lit with nobody on the step (${lamps.slice(-8).join(' | ')})`);
    assert.ok(lamps.includes('lamps.setBoost:mark_glow'), 'and brighter');
    assert.ok((await halos(game)) - before >= 3, 'the step and the locker glint in turn');
  } finally { await game.close(); }
});

// ---- the ammo floor ---------------------------------------------------------------------------------------------------
test('the ammo floor holds for a Transit put down in a fight (a plain player ran dry in the yard)', async () => {
  for (const ammo of [[2, 3], [6, 12]]) {
    const game = await open(srv, { checkpoint: 'cp_street_clear' });
    try {
      await game.dbg('god', true);
      const knot = marker('knot_yard_latch');
      await game.run([{ call: ['teleport', knot.pos[0] + 3, 0, knot.pos[2], 90, 0] }, { steps: 1 }, ...shootScript('knot_yard_latch', 1), { steps: 300 }]);
      const t1 = (await game.state()).enemies.find((e) => e.encounter === 'enc_yard' && e.alive);
      assert.ok(t1 && t1.kind === 'transit', 'T1 is up');
      await game.run([{ call: ['teleport', t1.x + 3, 0, t1.z, 90, 0] }, { steps: 1 }, { call: ['setAmmo', ammo[0], ammo[1], 0] }]);
      const seq = await mark(game);
      await game.run([...shootScript(t1.id), { steps: 2 }]);
      const ev = await game.events(seq);
      assert.ok(ev.some((e) => e.name === 'enemy/died'), 'the Transit is down');
      const drop = ev.find((e) => e.name === 'pickup/spawned' && e.payload.dropped);
      if (ammo[0] + ammo[1] <= 6) assert.ok(drop && drop.payload.kind === 'pk_rounds_6', 'at the floor: a packet where it fell');
      else assert.equal(drop, undefined, 'above the floor a Transit drops nothing');
    } finally { await game.close(); }
  }
});
