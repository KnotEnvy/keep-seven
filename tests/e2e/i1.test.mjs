// PASS i1 (the cross-cutting fixer), on the real game with all six systems:
//   1. the lamps of Plenty are tied to the ones she freed: a third line on the rim when she freed somebody (and not
//      when she freed nobody), and an end-card row that reads "lit of the windows that could have been", with the
//      dark windows drawn and one line that says whose the lamps are. Nothing holds a count of the felled.
//   2. the cold camp (pot, note, tin) is inside the opening frame, so the first two lines describe what is in view.
//   3. the lift-head diagram's three lines are on the way to the cage: walking from the checkpoint straight to the
//      gate says them.
//   4. the Tally House at a brisk puzzle pace (a shutter every five seconds): the chair's lines are said in the room
//      and nothing of the room is dropped stale.
//
//   node --test --test-concurrency=1 tests/e2e/i1.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, openGame, startServer } from '../harness.mjs';

const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const STORY = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/story.json'), 'utf8'));
const marker = (id) => LAYOUT.markers.find((m) => m.id === id);
const PIECE = 'i1-fixer';
const SMALL = { width: 640, height: 360 };

let server;
before(async () => { server = await startServer({}); });
after(async () => { await server.close(); });

const mark = async (game) => { const all = await game.events(0); return all.length ? all.at(-1).seq : 0; };
const lines = async (game, since) => (await game.events(since, 'story/line')).map((e) => e.payload);
const down = (name, n, from = 0) => Array.from({ length: n }, (_, i) => ({ call: ['emit', name, { x: 0, y: 0, z: 0, id: `bider#${from + i}`, encounter: '', cause: 'crown', counted: true }] }));

/** stand on the lamps' patch of the rim looking at the town, and wait for the lamps' lines */
async function rimLines(game) {
  const LAMPS = marker('trg_lamps'), TOWN = marker('vista_plenty').params.target;
  const seq = await mark(game);
  await game.run([{ steps: 30 }, { call: ['teleport', LAMPS.pos[0], LAMPS.pos[1], LAMPS.pos[2], 0, 0] }, { steps: 2 }, { aimAt: TOWN, steps: 40 * 60 }]);
  return { said: await lines(game, seq), lamps: (await game.events(0, 'ending/lamps')).at(-1) };
}
const card = (game) => game.page.evaluate(() => {
  const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
  if (ctx.state.current !== 'ending') ctx.state.request('ending', 'test');
  dbg.step(0, true);
  dbg.emit('ending/card', { stats: { ...ctx.world.stats } });
  dbg.step(0, true);
  const el = document.querySelector('.k7 .end'), row = el.querySelector('[data-row="lamps"]');
  const shown = (cls) => [...row.querySelectorAll('.lamp' + cls)].filter((l) => getComputedStyle(l).display !== 'none').length;
  const panel = el.querySelector('.end-panel').getBoundingClientRect(), note = row.querySelector('.lamps-note').getBoundingClientRect();
  return {
    value: row.querySelector('.v').textContent, lit: shown('.on'), dark: shown('.dark'), note: row.querySelector('.lamps-note').textContent,
    noteWidth: note.width,
    noteInside: note.width === 0 || (note.left >= panel.left - 0.5 && note.right <= panel.right + 0.5 && note.bottom <= panel.bottom + 0.5),
    world: { lamps: ctx.world.lamps, lampsOf: ctx.world.lampsOf, freed: ctx.world.stats.freed, felled: ctx.world.stats.felled },
    leaves: [...el.querySelectorAll('*')].filter((e) => e.children.length === 0).map((e) => e.textContent),
  };
});

test('the lamps are hers: a third line on the rim when she freed somebody, and the end card reads lit of possible', async () => {
  const game = await openGame(server, { piece: PIECE, checkpoint: 'cp_rim', viewport: { width: 1280, height: 720 } });
  try {
    await game.run([...down('enemy/freed', 22), ...down('enemy/felled', 13, 100), { steps: 2 }]);
    const { said, lamps } = await rimLines(game);
    const keys = said.map((l) => l.key);
    for (const k of ['nar_lamps', 'nar_lamps_count', 'nar_lamps_hers']) assert.ok(keys.includes(k), `${k} is said (${keys.join(' ')})`);
    assert.ok(keys.indexOf('nar_lamps') < keys.indexOf('nar_lamps_count') && keys.indexOf('nar_lamps_count') < keys.indexOf('nar_lamps_hers'), 'in this order');
    assert.equal(keys.indexOf('nar_lamps_hers'), keys.indexOf('nar_lamps_count') + 1, 'straight after the count');
    assert.equal(said.find((l) => l.key === 'nar_lamps_count').text, STORY.lines.nar_lamps_count.text.replace('{n}', 'Thirty-one'));
    assert.equal(said.find((l) => l.key === 'nar_lamps_hers').text, STORY.lines.nar_lamps_hers.text);
    assert.equal(lamps.payload.count, 31);
    const c = await card(game);
    assert.deepEqual(c.world, { lamps: 31, lampsOf: 44, freed: 22, felled: 13 });
    assert.equal(c.value, `31 ${STORY.ui.ui_end_of} 44`, 'lit of the windows that could have been');
    assert.deepEqual([c.lit, c.dark], [31, 13], 'a lit window for each lamp, a dark pane for each that stayed dark');
    assert.equal(c.note, STORY.ui.ui_end_lamps_freed.replace('{n}', '22'));
    assert.ok(c.noteInside && c.noteWidth > 100, 'the note is drawn, on the panel');
    assert.ok(c.leaves.every((t) => !/(^|\D)13(\D|$)/.test(t)), 'no element holds the count of the felled');
    await game.page.waitForTimeout(6000);                    // the rows light one at a time (CSS): for the evidence picture only, nothing is asserted on it
    await game.shot('i1_card_31_of_44');
    assert.deepEqual(game.consoleErrors, []);
  } finally { await game.close(); }
});

test('with nobody freed the count is the nine: the third line is not said, and the row is a plain number', async () => {
  const game = await openGame(server, { piece: PIECE, checkpoint: 'cp_rim', viewport: SMALL });
  try {
    const { said } = await rimLines(game);
    const keys = said.map((l) => l.key);
    assert.ok(keys.includes('nar_lamps_count') && !keys.includes('nar_lamps_hers'), keys.join(' '));
    assert.equal(said.find((l) => l.key === 'nar_lamps_count').text, STORY.lines.nar_lamps_count.text.replace('{n}', 'Nine'));
    const c = await card(game);
    assert.deepEqual([c.value, c.lit, c.dark, c.note], ['9', 9, 0, STORY.ui.ui_end_lamps_kept]);
    assert.deepEqual(game.consoleErrors, []);
  } finally { await game.close(); }
});

test('the cold camp is inside the opening frame, in the shaft of sun: the first lines describe what is in view', async () => {
  const START = marker('player_start'), CAMP = marker('prop_camp_one'), NOTE = marker('rd_note_lip'), TIN = marker('pk_rounds_12_camp1');
  // geometry first (no browser): bearing off the start view (she looks down -Z), and the distance
  for (const m of [CAMP, NOTE, TIN]) {
    const dx = m.pos[0] - START.pos[0], dz = m.pos[2] - START.pos[2];
    const off = Math.abs(Math.atan2(dx, -dz) * 180 / Math.PI), dist = Math.hypot(dx, dz);
    assert.ok(dz < 0 && off <= 32, `${m.id} is ${off.toFixed(1)} degrees off the opening view (it was 56): inside a 4:3 frame's half-width`);
    assert.ok(dist >= 3 && dist <= 7, `${m.id} is ${dist.toFixed(1)} m away: near enough to read as a pot, not underfoot`);
  }
  const game = await openGame(server, { piece: PIECE, checkpoint: null, viewport: { width: 1280, height: 720 }, tier: 'low' });
  try {
    const seq = await mark(game);
    await game.run([{ steps: 30 }]);
    const where = await game.page.evaluate(([camp, tin]) => {
      const ctx = window.__dbg.ext.core.ctx(), cam = ctx.scene.camera;
      cam.updateMatrixWorld(true);
      const project = (p) => { const v = cam.position.clone().set(p[0], p[1] + 0.15, p[2]).project(cam); return [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((0.5 - v.y * 0.5) * innerHeight), v.z < 1]; };
      return { camp: project(camp), tin: project(tin), w: innerWidth, h: innerHeight };
    }, [CAMP.pos, TIN.pos]);
    for (const [name, p] of [['the pot', where.camp], ['the tin', where.tin]]) {
      assert.ok(p[2] && p[0] > where.w * 0.04 && p[0] < where.w * 0.96 && p[1] > where.h * 0.3 && p[1] < where.h * 0.96, `${name} is in the first frame at ${p[0]}, ${p[1]} of ${where.w} x ${where.h}`);
    }
    assert.equal((await lines(game, seq))[0]?.key ?? (await lines(game, 0))[0]?.key, 'nar_open_1', 'and the first line is the one about the pot');
    await game.shot('i1_opening_frame');
    // the note can still be read from where it now lies
    await game.run([{ call: ['teleport', NOTE.pos[0] + 1.2, 14, NOTE.pos[2] + 0.6, 0, 0] }, { steps: 20 }, { aimAtEntity: ['rd_note_lip'] }, { steps: 2 }, { tap: 'interact', steps: 4 }]);
    assert.ok((await game.events(seq, 'readable/opened')).some((e) => e.payload.key === 'rd_note_lip'), 'the note opens');
    assert.deepEqual(game.consoleErrors, []);
  } finally { await game.close(); }
});

test('the diagram\'s lines are on the way to the cage: from the hall checkpoint straight to the gate says all three', async () => {
  const CP = marker('cp_hall_clear'), GATE = marker('door_lift_cage'), TRG = marker('trg_hall_diagram');
  // the trigger covers the whole approach to the gate (the gate is 6 m wide on z)
  assert.ok(TRG.pos[0] - TRG.size[0] / 2 <= CP.pos[0] && TRG.pos[0] + TRG.size[0] / 2 >= GATE.pos[0] - 0.2, 'from the checkpoint to the gate on x');
  assert.ok(TRG.pos[2] - TRG.size[2] / 2 <= GATE.pos[2] - 3 && TRG.pos[2] + TRG.size[2] / 2 >= GATE.pos[2] + 3, 'the gate\'s width on z');
  const game = await openGame(server, { piece: PIECE, checkpoint: 'cp_hall_clear', viewport: SMALL });
  try {
    const seq = await mark(game);
    // walk east from the checkpoint into the cage, never turning to the diagram
    await game.run([{ steps: 30 }, { call: ['teleport', CP.pos[0] - 6, CP.pos[1], CP.pos[2], -90, 0] }, { steps: 10 },
      { walkTo: [GATE.pos[0] + 2.5, GATE.pos[2]], maxTicks: 8 * 60, stopRadius: 0.6 }, { steps: 22 * 60 }]);
    const at = (await game.state()).player;
    assert.ok(at.x > GATE.pos[0], `she walked into the cage (x ${at.x})`);
    const keys = (await lines(game, seq)).map((l) => l.key);
    for (const k of ['nar_mark_1', 'nar_mark_2', 'nar_mark_3']) assert.ok(keys.includes(k), `${k} is said (${keys.join(' ')})`);
    assert.deepEqual(game.consoleErrors, []);
  } finally { await game.close(); }
});

test('the Tally House at five seconds a shutter: the chair\'s lines are said in the room and none of the room\'s lines goes stale', async () => {
  const game = await openGame(server, { piece: PIECE, checkpoint: 'cp_tally_enter', viewport: SMALL });
  try {
    await game.run([{ steps: 20 * 60 }]);                    // the three lines of the way in
    const stand = marker('trg_pz_daylight').params.standSpot;
    const seq = await mark(game);
    const shoot = (id) => [{ aimAtEntity: [id] }, { tap: 'fire', steps: 2 }];
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 2 },
      ...shoot('ia_latch_s'), { steps: 5 * 60 }, ...shoot('ia_latch_m'), { steps: 5 * 60 }, ...shoot('ia_latch_n'), { steps: 28 * 60 }]);
    const keys = (await lines(game, seq)).map((l) => l.key);
    for (const k of ['nar_tally_wall', 'nar_tally_chair', 'nar_tally_chair_2', 'nar_tally_cloth']) assert.ok(keys.includes(k), `${k} is said within 38 s of the first shutter (${keys.join(' ')})`);
    assert.ok(keys.indexOf('nar_tally_chair') < keys.indexOf('nar_tally_chair_2'), 'the chair\'s two lines in order');
    const story = (await game.page.evaluate(() => window.__dbg.ext.world.status())).story;
    assert.equal(story.stale ?? 0, 0, `no line of the room was dropped stale (${JSON.stringify(story).slice(0, 300)})`);
    assert.deepEqual(game.consoleErrors, []);
  } finally { await game.close(); }
});

// ---- closer, pass i1: the other ending is one item away on the end card itself ---------------------------------------------
test('the real end card offers "The rim again": it goes on from the rim with the stone untouched, and "Walk it again" is still a new run', async () => {
  const game = await openGame(server, { piece: 'i1-closer', checkpoint: 'cp_rim', viewport: { width: 1280, height: 720 } });
  try {
    const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), ARRIVE = marker('trg_rim_arrive');
    await game.run([{ call: ['teleport', ARRIVE.pos[0], ARRIVE.pos[1], ARRIVE.pos[2], 0, 0] }, { steps: 20 }, { call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 5 }, { aimAt: ROUND.pos, steps: 2 }, { tap: 'interact', steps: 4 }]);
    const c = await game.until({ event: 'ending/card' }, 180 * 60);
    assert.ok(c.met, 'the end card (the round taken)');
    assert.equal((await game.state()).stats.tookStoneRound, true);
    await game.run([{ steps: 2 }]);
    const items = () => game.page.evaluate(() => {
      const end = document.querySelector('.k7 .end'), panel = end.querySelector('.end-panel').getBoundingClientRect();
      return [...end.querySelectorAll('.menu [data-item]')].filter((n) => getComputedStyle(n).display !== 'none').map((n) => { const r = n.getBoundingClientRect(); return { id: n.getAttribute('data-item'), text: n.textContent.trim(), inside: r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5 && r.right <= innerWidth, h: r.height, font: parseFloat(getComputedStyle(n).fontSize) }; });
    });
    const shown = await items();
    assert.deepEqual(shown.map((i) => i.id), ['again', 'rim', 'menu'], JSON.stringify(shown));
    assert.equal(shown[1].text.toLowerCase(), STORY.ui.ui_end_rim.toLowerCase());
    for (const i of shown) assert.ok(i.inside && i.h < i.font * 2.2, `'${i.text}' is one line inside the panel (${JSON.stringify(i)})`);
    await game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } } });
    await game.shot('end_card_rim_again');
    // the item itself (through the UI's own handler: the end menu is locked while the rows light, so wait it out in ticks)
    const state = await game.page.evaluate(async () => {
      const d = window.__dbg, core = d.ext.core;
      await core.stepAsync(12 * 60, false);
      document.querySelector('.k7 .end .menu [data-item="rim"]').click();
      await core.idle();
      for (let i = 0; i < 400 && (core.busy() || d.state().game !== 'playing'); i++) { await new Promise((r) => setTimeout(r, 10)); await core.idle(); }
      await core.stepAsync(5, false);
      const s = d.state();
      return { game: s.game, cp: s.world.checkpoint, took: s.stats.tookStoneRound, stored: core.ctx().save.readStored()?.checkpoint ?? null, phase: d.ext.world.status().ending.phase };
    });
    assert.deepEqual(state, { game: 'playing', cp: 'cp_rim', took: false, stored: 'cp_rim', phase: 0 });
  } finally { await game.close(); }
});

// ---- closer, pass i1 (ruling R11): the hatch's cowl is not a perch ------------------------------------------------------------
test('the Tally House: a riser that cannot see her as it stands (she behind the hatch\'s cowl) still comes for her', async () => {
  const game = await openGame(server, { piece: 'i1-closer', checkpoint: 'cp_yard_clear', viewport: SMALL });
  try {
    // she came in from the yard (the risers were seated while she was still in the street), and stands north of the cowl
    await game.run([{ steps: 30 }, { call: ['teleport', -92.33, 0, -36.65, 0, 0] }, { steps: 5 }]);
    const woke = await game.page.evaluate(() => { const d = window.__dbg; d.ext.enemies.wakeEncounter('enc_tally'); return d.enemies().filter((e) => e.encounter === 'enc_tally').length; });
    assert.equal(woke, 2, 'the two at the table');
    // (god mode: this measures where they go, not what they cost. The east riser sees her past the cowl; the west one's
    // line of sight runs through it)
    const r = await game.page.evaluate(async () => {
      const d = window.__dbg, ctx = d.ext.core.ctx();
      d.god(true);
      const nearest = {};
      for (let i = 0; i < 20 * 60; i++) {
        await d.ext.core.stepAsync(1, false);
        const p = ctx.player.position;
        for (const e of d.ext.enemies.actors()) { if (e.encounter !== 'enc_tally' || !e.alive) continue; const dist = Math.hypot(e.x - p.x, e.z - p.z); if (!(nearest[e.marker] <= dist)) nearest[e.marker] = dist; }
      }
      return nearest;
    });
    for (const m of ['sp_tally_riser_w', 'sp_tally_riser_e']) assert.ok(r[m] < 4.5, `${m} comes for her within twenty seconds (nearest ${r[m]?.toFixed(1)} m); before the fix the one that could not see her ran to the shut street door and stayed there (${JSON.stringify(r)})`);
  } finally { await game.close(); }
});
