// Release pass p0: one test for each of the nine issues the final reviewers left with the world
// (scratch/lead/known-issues-full.json, team "world"). The real world beside the core stubs, driven by the step hook.
// The yard's Transit count needs the real enemies: tests/world/release_p0_real.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, STORY, mark, marker, open, renderCalls, server, shoot, shootScript, status, takeRound } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lines = async (game, since) => (await game.events(since, 'story/line')).map((e) => ({ key: e.payload.key, tick: e.tick, ticks: Math.round(e.payload.seconds * 60) }));
const say = (game, key) => game.page.evaluate((k) => window.__dbg.ext.world.say(k), key);
const tp = (m, yaw = 0) => ({ call: ['teleport', m.pos[0], m.pos[1], m.pos[2], yaw, 0] });
const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), EXIT = marker('exit_rim');
const AWAY = [14, 18, 108];                                 // on the ledge, 13 m from the stone, outside the exit strip
const WARN = 'nar_stone_wait';

async function toldAtTheStone(game) {
  await game.run([tp(STONE, 90), { steps: 2 }]);
  await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 60 * 60);
  await game.run([{ steps: 30 }]);
}

// ---- issues 4 and 6: walking away from the stone ---------------------------------------------------------------------
test('the rim: reaching the stone names the choice; walking away is warned of ten quiet seconds before it is taken as her answer, and not taken before the warning is over', async () => {
  assert.ok(STORY.lines[WARN] && STORY.objectives.obj_rim_choice, 'the fixer\'s keys exist');
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([tp(STONE, 90), { steps: 3 }]);
    assert.equal((await game.state()).world.objective, 'obj_rim_choice', 'the objective names the choice as the stone\'s lines begin');
    await toldAtTheStone(game);
    await game.run([{ call: ['teleport', AWAY[0], AWAY[1], AWAY[2], 0, 0] }, { steps: 1 }]);
    const left = (await game.state()).tick;
    await game.until({ event: 'story/line', where: { key: WARN } }, 60 * 60);
    const all = await lines(game, seq);
    const warn = all.find((l) => l.key === WARN);
    assert.ok(warn, 'the warning is said');
    const spoken = all.filter((l) => l.tick >= left && l.tick < warn.tick).reduce((n, l) => n + l.ticks, 0);
    assert.ok(Math.abs(warn.tick - left - 30 * 60 - spoken) <= 90, `thirty quiet seconds after she walked away (${warn.tick - left} ticks, ${spoken} spoken over)`);
    assert.equal((await game.events(seq, 'ending/stone')).length, 0, 'nothing has been decided when the warning starts');
    await game.until({ event: 'ending/stone' }, 30 * 60);
    const end = (await game.events(seq, 'ending/stone'))[0];
    assert.equal(end.payload.taken, false);
    assert.ok(end.tick >= warn.tick + warn.ticks + 10 * 60 - 20, `ten more quiet seconds after the warning has been heard (${end.tick - warn.tick - warn.ticks} ticks)`);
  } finally { await game.close(); }
});

test('the rim: coming back to the stone before the warning starts takes it back (it is said the next time); taking the round while it is on screen cuts it', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await toldAtTheStone(game);
    // a line is on screen when she steps onto the north edge: the warning is asked for and has to wait its turn
    await say(game, 'nar_open_1');
    await game.run([{ steps: 20 }, { call: ['teleport', EXIT.pos[0] - 6, EXIT.pos[1], EXIT.pos[2] + 0.2, 0, 0] }, { steps: 3 }]);
    assert.ok((await status(game)).story.waiting.includes(WARN), 'the warning is asked for on the edge and waits behind the line on screen');
    // she walks back to the stone before it has started: it is taken back
    await game.run([tp(STONE, 90), { steps: 5 }]);
    assert.ok(!(await status(game)).story.waiting.includes(WARN), 'back at the stone: the warning is taken back');
    await game.run([{ steps: 9 * 60 }]);
    assert.ok(!(await lines(game, seq)).some((l) => l.key === WARN), 'and is not said while she stands at the stone');
    assert.equal((await game.events(seq, 'ending/stone')).length, 0, 'nothing was decided');
    await game.run([{ call: ['teleport', AWAY[0], AWAY[1], AWAY[2], 0, 0] }, { steps: 1 }]);
    await game.until({ event: 'story/line', where: { key: WARN } }, 60 * 60);
    assert.ok((await lines(game, seq)).some((l) => l.key === WARN), 'it is said the next time she walks away');
    // she goes back and takes the round with the warning on screen
    await game.run([tp(STONE, 90), { steps: 5 }, ...takeRound(ROUND)]);
    const end = (await game.events(seq, 'ending/stone'))[0];
    assert.ok(end && end.payload.taken === true, 'the round is hers');
    const after = await lines(game, seq);
    assert.ok(after.find((l) => l.key === 'nar_take_1').tick - end.tick <= 1, 'the take is answered on its tick, over the warning');
    const card = await game.until({ event: 'ending/card' }, 120 * 60);
    assert.ok(card.met);
    assert.ok(!(await lines(game, seq)).some((l) => l.key === 'nar_leave'), 'no line of the other branch');
  } finally { await game.close(); }
});

// ---- issue 8: the last lift's checkpoint, and "Go on" after the end ----------------------------------------------------
test('the Windlass\'s death saves the checkpoint she holds again: a restore finds it dead and the lift gate open; the end card keeps the rim\'s save (pass i1)', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_proven' });
  try {
    await game.run([{ steps: 30 }]);
    const save = () => game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx().save.current; return c ? { checkpoint: c.checkpoint, cleared: c.world.encountersCleared, flags: c.world.onceFlags, doors: c.world.doors, stats: c.world.stats } : null; });
    assert.ok(!(await save()).cleared.includes('enc_windlass'), 'the save of the proof holds the Windlass alive');
    const seq = await mark(game);
    await game.run([{ call: ['emit', 'boss/defeated', { cleanSix: true }] }, { steps: 3 }]);
    const s = await save();
    assert.equal(s.checkpoint, 'cp_boss_proven');
    assert.ok(s.cleared.includes('enc_windlass') && s.flags.includes('boss_dead'), 'saved again with the Windlass dead');
    assert.equal(s.stats.cleanSix, true, 'and the six dry chambers kept');
    assert.equal((await game.events(seq, 'checkpoint/saved')).length, 0, 'written to the store without a second announcement of the checkpoint');
    await game.run([{ steps: 240 }]);
    // "Back to the last count" on the way to the lift
    await game.page.evaluate(async () => { const d = window.__dbg; d.pause(true); d.step(2, false); d.emit('ui/action', { action: 'restart_checkpoint' }); await d.ext.core.idle(); for (let i = 0; i < 300 && d.state().game !== 'playing'; i++) { await new Promise((r) => setTimeout(r, 10)); await d.ext.core.idle(); } });
    await game.run([{ steps: 30 }]);
    const st = await game.state();
    assert.equal(st.game, 'playing');
    assert.equal(st.world.checkpoint, 'cp_boss_proven');
    assert.equal(st.encounters.enc_windlass.state, 'cleared', 'the restore does not give the Windlass back');
    assert.equal(st.world.doors.door_proving_lift.split(' ')[0], 'open', 'the lift gate stands open');
    assert.equal(st.world.objective, s.flags.includes('obj:obj_proving_lift') ? 'obj_proving_lift' : st.world.objective);
  } finally { await game.close(); }
  const end = await open(srv, { checkpoint: 'cp_rim' });
  try {
    await toldAtTheStone(end);
    assert.ok(await end.page.evaluate(() => window.__dbg.ext.core.ctx().save.current !== null), 'a save is held on the rim');
    await end.run([...takeRound(ROUND)]);
    const card = await end.until({ event: 'ending/card' }, 120 * 60);
    assert.ok(card.met);
    // pass i1 (re-ruled: the other ending is two minutes from the rim): the rim's own save is kept, the stone untouched in it
    const held = await end.page.evaluate(() => { const c = window.__dbg.ext.core.ctx().save; return { current: c.current ? c.current.checkpoint : null, stored: c.hasStoredSave(), took: c.current ? c.current.world.stats.tookStoneRound : null }; });
    assert.deepEqual(held, { current: 'cp_rim', stored: true, took: false }, 'after the end card the title can "Go on" from the rim');
  } finally { await end.close(); }
});

// ---- issue 1: the yard -------------------------------------------------------------------------------------------------
test('the yard: the first Transit is the vignette\'s own (taken at the start, never asked for twice); a packet of six lies on the way in from the first wave on', async () => {
  const game = await open(srv, { checkpoint: 'cp_street_clear' });
  try {
    await game.dbg('god', true);
    const knot = marker('knot_yard_latch'), door = marker('ia_yard_door'), t1 = marker('sp_yard_t1');
    await game.run([{ call: ['teleport', knot.pos[0] + 3, 0, knot.pos[2], 90, 0] }, { steps: 1 }]);
    const seq = await mark(game);
    await game.run([...shootScript('knot_yard_latch', 1), { steps: 2 }]);
    const transits = async () => (await game.state()).enemies.filter((e) => e.kind === 'transit' && e.encounter === 'enc_yard');
    const first = await transits();
    assert.equal(first.length, 1, 'the first member is taken from the enemies on the tick the vignette starts');
    await game.until({ event: 'encounter/wave', where: { id: 'enc_yard', wave: 'A' } }, 6 * 60);
    await game.run([{ steps: 120 }]);
    const later = await transits();
    assert.deepEqual(later.map((e) => e.id), first.map((e) => e.id), 'wave A does not ask for a second one');
    const drops = (await game.events(seq, 'pickup/spawned')).filter((e) => e.payload.dropped && e.payload.kind === 'pk_rounds_6');
    assert.equal(drops.length, 1, 'one packet of six');
    const d = drops[0].payload, into = Math.hypot(t1.pos[0] - door.pos[0], t1.pos[2] - door.pos[2]);
    const along = ((d.x - door.pos[0]) * (t1.pos[0] - door.pos[0]) + (d.z - door.pos[2]) * (t1.pos[2] - door.pos[2])) / into;
    assert.ok(Math.abs(along - 1.9) < 0.05 && Math.hypot(d.x - door.pos[0], d.z - door.pos[2]) < 2, `1.9 m inside the door, on the line into the yard (${d.x.toFixed(2)}, ${d.z.toFixed(2)})`);
    // walked over, it is hers (she is short of the cap)
    await game.run([{ call: ['setAmmo', 3, 5, 0] }, { call: ['teleport', d.x, d.y, d.z, 90, 0] }, { steps: 3 }]);
    assert.equal((await game.state()).player.reserve, 11);
  } finally { await game.close(); }
});

// ---- issues 3 and 7: lines that were late or lost ------------------------------------------------------------------------
test('the file\'s warnings are urgent: each is on screen within a second and a half of its wave, over a room line, never over a line the story stands on', async () => {
  const game = await open(srv, { checkpoint: 'cp_gallery_baffle' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 30 }]);
    const seq = await mark(game);
    const far = marker('door_gallery_far');
    // the baffle is open at this checkpoint: the file's fight starts by itself; a room line and lore are queued behind it
    await game.until({ event: 'encounter/wave', where: { id: 'enc_file', wave: 'A' } }, 20 * 60);
    const waves = async () => Object.fromEntries((await game.events(seq, 'encounter/wave')).filter((e) => e.payload.id === 'enc_file').map((e) => [e.payload.wave, e.tick]));
    const at = async (key) => (await lines(game, seq)).find((l) => l.key === key)?.tick;
    await game.run([{ steps: 100 }]);
    assert.ok((await at('nar_file')) - (await waves()).A <= 330, `"Six, in a queue" follows the line on screen at most (${(await at('nar_file')) - (await waves()).A} ticks)`);
    await game.run([{ steps: 6 * 60 }]);
    // the file is felled down to one, she walks to the far door: the rear pair, then the door
    const file = (await game.state()).enemies.filter((e) => e.encounter === 'enc_file');
    for (const e of file.slice(0, 5)) await game.run([{ call: ['emit', 'enemy/felled', { id: e.id, encounter: 'enc_file', counted: true, x: e.x, y: e.y, z: e.z }] }]);
    await game.run([{ steps: 6 * 60 }]);                      // ("It folded like a coat": the story stands on that one; it is left to end)
    await say(game, 'nar_open_1');                           // a room's description is on screen when the wave comes
    await game.run([{ steps: 40 }, { call: ['teleport', far.pos[0] - 12, far.pos[1], far.pos[2], -90, 0] }, { steps: 3 }]);
    let w = await waves();
    assert.ok(w.R, 'the rear pair are let go');
    assert.ok((await at('nar_file_behind')) - w.R <= 90, `"Two more on the stair behind her" within 1.5 s of the pair (${(await at('nar_file_behind')) - w.R} ticks)`);
    await game.until({ event: 'encounter/wave', where: { id: 'enc_file', wave: 'B' } }, 10 * 60);
    await game.run([{ steps: 120 }]);
    w = await waves();
    assert.ok((await at('nar_file_more')) - w.B <= 90, `"Four more, from the far door" within 1.5 s of the door's wave (${(await at('nar_file_more')) - w.B} ticks)`);
  } finally { await game.close(); }
});

test('a brisk player keeps the station\'s wake lines and "One round, one line": next in line when the cell wakes; on the first line shot, over a room line', async () => {
  for (const key of ['stn_tally_wake_2', 'nar_line_first']) assert.ok(STORY.meta.rules.never_stale.includes(key), `${key} is never stale (story.json)`);
  let game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    const stand = marker('trg_pz_daylight').params.standSpot;
    await game.run([{ steps: 60 }, { call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 2 }]);
    const seq = await mark(game);
    // four room lines are waiting when the cell wakes (it was: the two station lines found the queue full and were dropped)
    await game.run([...shootScript('ia_latch_n'), { steps: 5 }, ...shootScript('ia_cloth_cord'), { steps: 5 }]);
    for (const k of ['nar_open_1', 'nar_open_2', 'nar_rule', 'nar_plenty', 'nar_jugs_sand']) await say(game, k);
    await game.until({ event: 'world/hatch_powered' }, 30 * 60);
    const powered = (await game.events(seq, 'world/hatch_powered'))[0].tick;
    await game.run([{ steps: 22 * 60 }]);
    const said = await lines(game, seq);
    const w1 = said.find((l) => l.key === 'stn_tally_wake_1'), w2 = said.find((l) => l.key === 'stn_tally_wake_2');
    assert.ok(w1 && w2, `both wake lines are said (${said.map((l) => l.key).join(' ')})`);
    // (pass i2: next in line means behind the line on screen AND its continuation: `nar_open_1` / `nar_open_2` are a pair)
    assert.ok(w1.tick - powered <= 11 * 60 && w2.tick - w1.tick <= w1.ticks + 20, `next in line after the cell wakes (${w1.tick - powered} ticks), one after the other`);
    const rule = said.findIndex((l) => l.key === 'nar_rule');
    assert.ok(rule < 0 || said.findIndex((l) => l.key === 'stn_tally_wake_1') < rule, 'ahead of the lines that only wait');
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_gallery_bay' });
  try {
    await game.run([{ steps: 30 * 60 }]);                      // the bay's own lines run out
    const seq = await mark(game);
    await say(game, 'nar_open_1');
    await game.run([{ steps: 30 }, { call: ['setAmmo', 6, 24, 1] }, { steps: 2 }]);
    assert.equal((await status(game)).story.current, 'nar_open_1', 'a room line is on screen');
    const before = (await game.state()).tick;
    await shoot(game, 'line_round');
    await game.run([{ steps: 2 }]);
    const first = (await lines(game, seq)).find((l) => l.key === 'nar_line_first');
    assert.ok(first && first.tick - before <= 2, 'said on the shot, over the room line');
  } finally { await game.close(); }
});

// ---- issue 5: the secrets ----------------------------------------------------------------------------------------------
test('the secrets are pointed at: the loft bell rings by itself when she first comes near (not in a fight, never once found); the cold bay\'s seam glows until its knot is burst', async () => {
  assert.ok(STORY.lines.cap_loft_bell, 'the caption exists');
  const rope = marker('sec_loft_bell_rope');
  let game = await open(srv, { checkpoint: 'cp_street_clear' });
  try {
    await game.dbg('god', true);
    const rings = async (since) => (await game.events(since, 'audio/cue')).filter((e) => e.payload.cue === 'step_chime' && Math.abs(e.payload.x - rope.pos[0]) < 0.5);
    let seq = await mark(game);
    await game.run([{ call: ['teleport', rope.pos[0] + 30, 0, 0, 90, 0] }, { steps: 60 }]);
    assert.equal((await rings(seq)).length, 0, '30 m off: nothing');
    await game.run([{ call: ['teleport', rope.pos[0] + 15, 0, 0, 90, 0] }, { steps: 3 }]);
    assert.equal((await rings(seq)).length, 1, 'once, as she first comes within 22 m');
    assert.ok((await game.events(seq, 'story/caption')).some((e) => e.payload.key === 'cap_loft_bell'), 'with its caption');
    await game.run([{ steps: 20 * 60 }]);
    assert.equal((await rings(seq)).length, 1, 'not again within 30 s');
    await game.run([{ steps: 11 * 60 }]);
    assert.equal((await rings(seq)).length, 2, 'again after 30 s while she stays near');
    await game.run([{ steps: 100 * 60 }]);
    assert.equal((await rings(seq)).length, 3, 'three times a run at most');
    // found: never again (a fresh timeline: the count starts over)
    await game.dbg('checkpoint', 'cp_street_clear');
    await game.run([{ steps: 5 }, { call: ['teleport', -23, 0, 0, 0, 0] }, { steps: 1 }, ...shootScript('sec_loft_bell_rope', 2)]);
    assert.deepEqual((await game.state()).stats.secrets, ['sec_loft_bell']);
    seq = await mark(game);
    await game.run([{ steps: 70 * 60 }]);
    assert.equal((await rings(seq)).length, 0, 'the bell is down: it does not ring');
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 10 }]);
    const door = marker('door_cold_bay');
    let seam = (await status(game)).interact.seams.find((m) => m[0] === 'sec_cold_bay');
    assert.ok(seam && seam[1] === true, 'the seam glows while the secret is not found');
    assert.ok(Math.abs(seam[2] - door.pos[0]) < 0.01 && seam[3] - door.pos[1] < 0.1 && seam[4] < door.pos[2] && door.pos[2] - seam[4] <= 0.5, `at the foot of the door, on the hall's side (${seam.slice(2)})`);
    assert.ok((await renderCalls(game)).some((c) => JSON.stringify(c).includes('halo')), 'a halo card was taken from the renderer');
    const knot = marker('knot_cold_bay');
    await game.run([{ call: ['teleport', knot.pos[0], door.pos[1], knot.pos[2] - 2.3, 180, 0] }, { steps: 2 }, ...shootScript('knot_cold_bay', 2), { steps: 200 }]);
    assert.deepEqual((await game.state()).stats.secrets, ['sec_cold_bay']);
    seam = (await status(game)).interact.seams.find((m) => m[0] === 'sec_cold_bay');
    assert.equal(seam[1], false, 'found: the glow is gone');
  } finally { await game.close(); }
});

// ---- issue 9: what a set swap leaves behind ----------------------------------------------------------------------------
test('a set swap takes the world\'s released instances apart: no mesh of a zone that is gone keeps a parent (the renderer\'s lamp list lets go of them)', async () => {
  const game = await open(srv, { checkpoint: 'cp_street_clear' });
  try {
    await game.run([{ steps: 10 }]);
    const before = await game.page.evaluate(() => {
      const scene = window.__dbg.ext.core.ctx().scene.scene; const all = []; scene.traverse((o) => { if (o.isMesh) all.push(o); });
      window.__meshes = all; return all.length;
    });
    assert.ok(before > 20, `the surface set is drawn (${before} meshes)`);
    await game.dbg('checkpoint', 'cp_gallery_bay');
    await game.page.evaluate(() => window.__dbg.ext.core.idle());
    await game.run([{ steps: 10 }]);
    const left = await game.page.evaluate(() => {
      const ctx = window.__dbg.ext.core.ctx(), scene = ctx.scene.scene; let gone = 0, held = 0, live = 0; const names = [];
      for (const m of window.__meshes) {
        let root = m; while (root.parent) root = root.parent;
        if (root === scene) { live++; continue; }
        if (m.parent === null) gone++; else { held++; if (names.length < 8) names.push(m.name + ' < ' + root.name); }
      }
      return { gone, held, live, names };
    });
    assert.ok(left.gone > 20, `the released set's meshes stand alone (${JSON.stringify(left)})`);
    // what still has a parent outside the scene is an instance of an asset another resident set keeps (it waits in its pool)
    const pooled = await game.page.evaluate(() => {
      const ctx = window.__dbg.ext.core.ctx(), scene = ctx.scene.scene; const bad = [];
      for (const m of window.__meshes) { let root = m; while (root.parent) root = root.parent; if (root === scene || m.parent === null) continue; if (/^chunk_|^env_|lamp/.test(m.name)) bad.push(m.name); }
      return bad;
    });
    assert.deepEqual(pooled, [], 'no chunk or lamp mesh of the surface set is still held together');
  } finally { await game.close(); }
});
