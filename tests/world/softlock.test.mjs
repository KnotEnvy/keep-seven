// Soft-lock guards and the critic's round-1 findings (code-world fixer): one encounter at a time (a knot that starts a
// fight holds while another is live), a save never holds a fight's start without the fight, a dormant member shot from
// outside does not lock her out, the jug gate's collider stands where the gate is drawn, narration heard once through a
// death, a queued line survives a checkpoint, a hint tier is not lost to a busy queue, a note at her feet is in reach.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, marker, open, server, shootScript, status } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const names = (ev, n) => ev.filter((e) => e.name === n);
const alive = (s, enc) => s.enemies.filter((e) => e.encounter === enc && e.alive);
async function killOne(game, enc) {
  const s = await game.state();
  const list = alive(s, enc);
  if (!list.length) return false;
  const e = list[0];
  for (const spot of [[e.x + 4, e.y, e.z], [e.x - 4, e.y, e.z], [e.x, e.y, e.z * 0.4], [e.x + 3, e.y, e.z * 0.5], [e.x - 3, e.y, e.z * 0.5]]) {
    await game.run([{ call: ['teleport', spot[0], spot[1], spot[2], 0, 0] }, { steps: 1 }, { aimAtEntity: [e.id] }, { steps: 1 }]);
    if (list.map((x) => x.id).includes((await game.dbg('probe')).entityId)) break;
  }
  await game.run([{ tap: 'fire', steps: 2 }]);
  return true;
}
const die = [{ call: ['god', false] }, { call: ['setHealth', 0] }, { until: { state: 'playing' }, maxSteps: 900 }, { steps: 10 }];
const damaged = (game, id) => game.page.evaluate((e) => window.__dbg.emit('enemy/damaged', { id: e, amount: 34, healthLeft: 66, part: 'body', x: 0, y: 0, z: 0 }), id);

test('the yard knot holds while the street fight is live; after the clear it starts the yard, and a death in the yard leaves the yard completable', async () => {
  const game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -3, 0, 0, 90, 0] }, { steps: 200 }]);
    let waves = [];
    for (let guard = 0; guard < 40 && !waves.includes('D'); guard++) {
      waves = names(await game.events(seq), 'encounter/wave').filter((e) => e.payload.id === 'enc_street').map((e) => e.payload.wave);
      if (waves.includes('D')) break;
      if (!(await killOne(game, 'enc_street'))) await game.run([{ steps: 30 }]); else await game.run([{ steps: 10 }]);
    }
    assert.ok(waves.includes('D'), 'wave D came');
    let s = await game.run([{ steps: 30 }]);
    assert.equal(alive(s, 'enc_street').length, 1, 'the gate Bider is up');
    // the gate has burst: the knot is in plain sight behind the last Bider
    const knot = marker('knot_yard_latch');
    const seqKnot = await mark(game);
    await game.run([{ call: ['teleport', knot.pos[0] + 9, 0, knot.pos[2], 90, 0] }, { steps: 1 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 1 }]);
    assert.equal((await game.dbg('probe')).entityId, 'knot_yard_latch', 'the knot can be hit through the burst gate');
    s = await game.run([{ tap: 'fire', steps: 3 }, { steps: 20 }]);
    let ev = await game.events(seqKnot);
    assert.equal(s.encounters.enc_yard.state, 'idle', 'the yard does not start inside the street fight');
    assert.equal(s.world.doors.ia_yard_door, 'closed', 'the yard door stays shut');
    assert.equal(names(ev, 'knot/burst').length, 0, 'the knot holds');
    assert.ok(names(ev, 'shootable/hit').some((e) => e.payload.id === 'knot_yard_latch'), 'it rings (harmless and audible)');
    assert.ok(!s.world.flags.includes('burst:knot_yard_latch'));
    // the street cleared: its checkpoint, then the knot does what it does
    for (let i = 0; i < 6 && alive(await game.state(), 'enc_street').length; i++) { await killOne(game, 'enc_street'); await game.run([{ steps: 5 }]); }
    s = await game.run([{ steps: 30 }]);
    assert.equal(s.encounters.enc_street.state, 'cleared');
    assert.equal(s.world.checkpoint, 'cp_street_clear');
    assert.equal(s.world.objective, 'obj_yard_door');
    assert.deepEqual(names(await game.events(seq), 'objective/changed').map((e) => e.payload.key).filter((k) => /yard/.test(k)), ['obj_yard_door'], 'the objective never ran ahead');
    await game.run([{ call: ['teleport', knot.pos[0] + 4, 0, knot.pos[2], 90, 0] }, { steps: 1 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 1 }, { tap: 'fire', steps: 3 }, { steps: 20 }]);
    s = await game.state();
    assert.notEqual(s.encounters.enc_yard.state, 'idle', 'the knot starts the yard');
    assert.notEqual(s.world.doors.ia_yard_door, 'closed');
    // a save taken now (a fight live) holds neither the burst knot nor the open door
    const save = await game.page.evaluate(() => window.__dbg.ext.core.ctx().world.captureSave());
    assert.ok(!save.onceFlags.includes('burst:knot_yard_latch'), 'no burst flag without the fight');
    assert.equal(save.doors.ia_yard_door, 'closed');
    assert.ok(!save.encountersCleared.includes('enc_yard'));
    assert.equal(save.objective, 'obj_yard_door');
    // die in the yard: back at cp_street_clear with the knot whole, and the yard can be started and finished
    s = await game.run(die);
    assert.equal(s.world.checkpoint, 'cp_street_clear');
    assert.equal(s.encounters.enc_yard.state, 'idle');
    assert.equal(s.world.doors.ia_yard_door, 'closed');
    await game.dbg('god', true);
    await game.run([{ call: ['teleport', knot.pos[0] + 4, 0, knot.pos[2], 90, 0] }, { steps: 1 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 1 }]);
    assert.equal((await game.dbg('probe')).entityId, 'knot_yard_latch', 'the knot is whole again');
    s = await game.run([{ tap: 'fire', steps: 3 }, { steps: 20 }]);
    assert.notEqual(s.encounters.enc_yard.state, 'idle', 'the yard starts again after the death');
    await game.dbg('clearEncounter', 'enc_yard');
    s = await game.run([{ steps: 5 }]);
    assert.equal(s.encounters.enc_yard.state, 'cleared');
    assert.equal(s.world.checkpoint, 'cp_yard_clear');
  } finally { await game.close(); }
});

test('a seated riser hit from the yard does not start enc_tally or shut the door in her face; nor from inside before the day-cell is lit; lit and inside, it does', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    await game.dbg('god', true);
    const trg = marker('trg_dowser');
    let s = await game.run([{ call: ['teleport', trg.pos[0], trg.pos[1], trg.pos[2], 0, 0] }, { steps: 16 * 60 }]);
    assert.equal(s.world.doors.door_tally, 'open', 'the sighting is over: the tally door stands open');
    const riser = s.enemies.find((e) => e.encounter === 'enc_tally' && e.alive);
    assert.ok(riser, 'the risers sit at the table');
    // from the yard
    let seq = await mark(game);
    await game.run([{ call: ['teleport', -89, 0, -12.6, 0, 0] }, { steps: 2 }]);
    await damaged(game, riser.id);
    s = await game.run([{ steps: 240 }]);
    assert.equal(s.world.zone, 'plenty_street');
    assert.equal(s.encounters.enc_tally.state, 'idle', 'not started from outside');
    assert.equal(s.world.doors.door_tally, 'open', 'the door is not shut in her face');
    assert.equal(names(await game.events(seq), 'door/state').filter((e) => e.payload.id === 'door_tally').length, 0);
    const w = await game.walkTo(-89, -17, { maxTicks: 600 });
    assert.equal(w.reason, 'arrived', 'she can walk in');
    // inside, the puzzle unsolved: GDD 13, no combat until solved
    await damaged(game, riser.id);
    s = await game.run([{ steps: 120 }]);
    assert.equal(s.world.zone, 'tally_house');
    assert.equal(s.encounters.enc_tally.state, 'idle', 'not started before the day-cell is lit');
    assert.equal(s.world.checkpoint === 'cp_tally_hatch', false);
    // lit, and she steps back out: still not from the yard
    await game.dbg('solvePuzzle', 'daylight');
    await game.run([{ call: ['teleport', -89, 0, -12.6, 0, 0] }, { steps: 2 }]);
    await damaged(game, riser.id);
    s = await game.run([{ steps: 60 }]);
    assert.equal(s.encounters.enc_tally.state, 'idle');
    assert.equal(s.world.doors.door_tally, 'open');
    // lit and inside: the knot lets go as if shot (hatch ajar, the line), the fight starts, the door shuts behind her
    seq = await mark(game);
    await game.run([{ call: ['teleport', -89, 0, -20, 0, 0] }, { steps: 2 }]);
    await damaged(game, riser.id);
    s = await game.run([{ steps: 120 }]);
    const ev = await game.events(seq);
    assert.notEqual(s.encounters.enc_tally.state, 'idle', 'started by the hit');
    assert.equal(s.world.doors.ia_hatch, 'ajar', 'the hatch went ajar, not straight to open');
    assert.ok(names(ev, 'knot/burst').some((e) => e.payload.id === 'knot_hatch_latch'));
    assert.ok(names(ev, 'audio/cue').some((e) => e.payload.cue === 'chairs_scrape'), 'the chairs scrape');
    assert.equal(s.world.doors.door_tally, 'closed', 'locked behind her, with her inside');
    assert.equal(s.world.zone, 'tally_house');
    await game.dbg('clearEncounter', 'enc_tally');
    s = await game.run([{ steps: 5 }]);
    assert.equal(s.world.checkpoint, 'cp_tally_hatch');
  } finally { await game.close(); }
});

test('a fight that locks an open door waits for her to be inside and clear of it (the lock is never shut in her face)', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    await game.dbg('god', true);
    const trg = marker('trg_dowser');
    await game.run([{ call: ['teleport', trg.pos[0], trg.pos[1], trg.pos[2], 0, 0] }, { steps: 16 * 60 }]);
    await game.dbg('solvePuzzle', 'daylight');
    // find a spot in the doorway that is already tally_house: the fight starts there, within a stride of the leaf
    const door = marker('door_tally');
    let spot = null;
    for (let z = door.pos[2] - 0.1; z > door.pos[2] - 1.45 && !spot; z -= 0.1) {
      const s = await game.run([{ call: ['teleport', door.pos[0], 0, z, 0, 0] }, { steps: 2 }]);
      if (s.world.zone === 'tally_house') spot = z;
    }
    if (spot === null) return;                       // the doorway belongs to the street all the way in: nothing to defer
    let s = await game.state();
    const riser = s.enemies.find((e) => e.encounter === 'enc_tally' && e.alive);
    await damaged(game, riser.id);
    s = await game.run([{ steps: 90 }]);
    assert.notEqual(s.encounters.enc_tally.state, 'idle');
    assert.equal(s.world.doors.door_tally, 'open', 'in the doorway: the door waits');
    // she backs out into the yard: it still waits, and she can come back in
    s = await game.run([{ call: ['teleport', door.pos[0], 0, door.pos[2] + 2, 0, 0] }, { steps: 120 }]);
    assert.equal(s.world.doors.door_tally, 'open', 'outside: never shut in her face');
    const w = await game.walkTo(door.pos[0], door.pos[2] - 2.5, { maxTicks: 600 });
    assert.equal(w.reason, 'arrived');
    s = await game.run([{ steps: 90 }]);
    assert.equal(s.world.doors.door_tally, 'closed', 'inside and clear: it shuts and locks');
    assert.equal(s.world.zone, 'tally_house');
  } finally { await game.close(); }
});

test('the jug gate stops her at the planks she sees: shut, at six jugs, and not at all once open', async () => {
  const game = await open(srv, {});
  try {
    await game.dbg('god', true);
    // where the hurdle is drawn (the gate_bar node of the bound instance)
    const bar = await game.page.evaluate(() => {
      const c = window.__dbg.ext.core.ctx();
      c.scene.world.updateMatrixWorld(true);
      let x = null;
      for (const root of Object.values(c.scene)) if (root && root.traverse) { root.updateMatrixWorld(true); root.traverse((o) => { if (o.name === 'gate_bar' && x === null) x = o.matrixWorld.elements[12]; }); }
      return x;
    });
    assert.ok(Math.abs(bar - 2.1) < 0.05, `the hurdle is drawn at x 2.1 (${bar})`);
    const walk = [{ call: ['teleport', 5, 0, 0, 90, 0] }, { steps: 2 }, { keys: ['KeyW'], steps: 240 }, { keys: [], steps: 2 }];
    let s = await game.run(walk);
    assert.ok(s.player.x >= bar + 0.35, `shut: she stops in front of the planks (x ${s.player.x})`);
    assert.ok(s.player.x <= bar + 1.0, 'and at them, not a stride short');
    for (let i = 1; i <= 6; i++) await game.run([{ call: ['teleport', 11, 0, 0, 90, 0] }, { steps: 1 }, ...shootScript('ia_jug_' + i), { steps: 20 }]);
    s = await game.run([{ steps: 30 }]);
    assert.equal(s.puzzles.seven_jugs.step, 6);
    s = await game.run([{ call: ['teleport', 5, 0, 0, 90, 0] }, { steps: 2 }, { keys: ['KeyW', 'ShiftLeft'], steps: 20 }, { keys: ['KeyW', 'ShiftLeft', 'Space'], steps: 4 }, { keys: ['KeyW', 'ShiftLeft'], steps: 200 }, { keys: [], steps: 2 }]);
    assert.ok(s.player.x >= bar + 0.35, `six jugs (1.2 m): still not passable, running and jumping (x ${s.player.x})`);
    await game.run([{ call: ['teleport', 11, 0, 0, 90, 0] }, { steps: 1 }, ...shootScript('ia_jug_7'), { steps: 240 }]);
    s = await game.state();
    assert.equal(s.world.doors.door_jug_gate, 'open');
    s = await game.run(walk);
    assert.ok(s.player.x < 0, `open: she walks through (x ${s.player.x})`);
  } finally { await game.close(); }
});

test('narration heard before a death is not said again after it; a line still waiting when a checkpoint commits is said after a restore; a hint that found the queue busy is said when it is quiet', async () => {
  const game = await open(srv, {});
  try {
    const say = (key) => game.page.evaluate((k) => window.__dbg.ext.world.say(k), key);
    const lines = async () => names(await game.events(0), 'story/line').map((e) => e.payload.key);
    // the opening narration is queued on first control; a checkpoint commits (the gate, by debug) before the second has started
    let st = await status(game);
    assert.ok(st.story.waiting.length + (st.story.current ? 1 : 0) >= 2, 'the opening lines are queued');
    const waiting = st.story.waiting.slice();
    await game.dbg('solvePuzzle', 'seven_jugs');
    let s = await game.run([{ steps: 2 }]);
    assert.equal(s.world.checkpoint, 'cp_lip_gate');
    const unheard = waiting.filter((k) => !(s.world.flags.includes(k)));
    assert.ok(unheard.length >= 1, 'a line was still waiting at the commit');
    s = await game.run(die);
    assert.equal(s.world.checkpoint, 'cp_lip_gate');
    assert.ok(!s.world.flags.some((f) => f.startsWith('q:')), 'the queue markers of a save are not world flags');
    await game.run([{ steps: 40 * 60 }]);
    let all = await lines();
    for (const k of unheard) assert.equal(all.filter((x) => x === k).length, 1, `${k} was said once, after the restore`);
    // heard, then a death at a checkpoint that was committed before it was heard: not again
    await say('nar_jugs_sand');
    await game.run([{ steps: 20 * 60 }]);
    all = await lines();
    assert.equal(all.filter((x) => x === 'nar_jugs_sand').length, 1);
    await game.run(die);
    await say('nar_jugs_sand');
    await game.run([{ steps: 20 * 60 }]);
    all = await lines();
    assert.equal(all.filter((x) => x === 'nar_jugs_sand').length, 1, 'once per run, through a death');
    for (const k of new Set(all.filter((x) => x.startsWith('nar_')))) assert.equal(all.filter((x) => x === k).length, 1, `${k} once`);
    // a hint tier's line that lands while a line is on screen is held, not dropped
    await say('nar_jugs_open');
    await game.run([{ steps: 30 }]);
    assert.equal((await status(game)).story.current, 'nar_jugs_open');
    const seq = await mark(game);
    await say('hint_jugs_2');
    await game.run([{ steps: 30 * 60 }]);
    const ev = await game.events(seq);
    const end = names(ev, 'story/line_end').find((e) => e.payload.key === 'nar_jugs_open');
    const hint = names(ev, 'story/line').find((e) => e.payload.key === 'hint_jugs_2');
    assert.ok(end && hint && hint.tick > end.tick, 'the hint is said once the line has ended');
  } finally { await game.close(); }
});

test('a note at her feet is in reach by the ground distance: E reads it from 2 m', async () => {
  const game = await open(srv, {});
  try {
    const note = marker('rd_note_lip');
    await game.run([{ call: ['teleport', note.pos[0] + 2, 14, note.pos[2], 90, 0] }, { steps: 30 }, { aimAtEntity: ['rd_note_lip'] }, { steps: 2 }]);
    assert.equal((await status(game)).interact.focus, 'rd_note_lip');
    const seq = await mark(game);
    await game.run([{ tap: 'interact', steps: 3 }]);
    const ev = await game.events(seq);
    assert.equal(names(ev, 'readable/opened').length, 1, 'opened from 2 m along the ground');
    assert.equal(names(ev, 'interact/used').length, 1);
  } finally { await game.close(); }
});
