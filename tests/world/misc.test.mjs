// The rest of the world's things (code-world 4.3, 4.5, 4.6, 4.8): readables, the cradle, the two secrets, the bore's
// lines, the lazy key hints, the Dowser sighting, the Tamper's vignette clock, the mercy tin, captions.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, mark, marker, open, server, shoot, shootScript } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const keys = async (game, since, name = 'story/line') => (await game.events(since, name)).map((e) => e.payload.key);
const centre = (game, id) => game.page.evaluate((e) => { const v = { x: 0, y: 0, z: 0 }; return window.__dbg.ext.core.ctx().collision.volumeCentre(e, null, v) ? v : null; }, id);

test('a readable pauses the game and closes; nar_ask is the middle shutter\'s third line; the cradle speaks when looked at within 4 m', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.run([{ steps: 900 }]);
    const note = marker('rd_note_hearth');
    let seq = await mark(game);
    await game.run([{ call: ['teleport', note.pos[0] - 0.2, 0, note.pos[2] + 1.4, 0, 0] }, { steps: 1 }, { aimAt: note.pos, steps: 1 }, { tap: 'interact', steps: 2 }, { steps: 600 }]);
    const ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'readable/opened' && e.payload.key === 'rd_note_hearth'));
    assert.ok(ev.some((e) => e.name === 'readable/closed' && e.payload.key === 'rd_note_hearth'));
    assert.ok(ev.some((e) => e.name === 'game/state' && e.payload.to === 'paused'));
    // polish round 2: nar_ask left the hearth note (optional) for the critical path: the third of shutter_m's lines
    assert.equal(note.params.thenLine, undefined);
    assert.ok(!(await keys(game, seq)).includes('nar_ask'), 'the hearth note says nothing after it closes');
    const shutter = marker('shutter_m');
    // pass i1 (cross-cutting fixer; both story reviewers: at five seconds a shutter the room's lines were dropped or said
    // rooms later): the middle shutter says the chair's two lines; nar_tally_hearth is said when the fight clears and
    // nar_ask on the peg stair
    assert.deepEqual(shutter.params.lines, ['nar_tally_chair', 'nar_tally_chair_2']);
    assert.deepEqual(LAYOUT.encounters.find((e) => e.id === 'enc_tally').onClear.lines, ['nar_nine', 'nar_tally_hearth']);
    assert.deepEqual(marker('trg_peg_stair').params.lines, ['nar_pegs_1', 'nar_pegs_2', 'nar_ask']);
    const stand = marker('trg_pz_daylight').params.standSpot;
    seq = await mark(game);
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 2 }, ...shootScript('ia_latch_m', 1), { aimAt: shutter.params.blade.hits[0].pos, steps: 30 * 60 }]);
    assert.deepEqual((await keys(game, seq)).filter((k) => shutter.params.lines.includes(k)), shutter.params.lines, 'the four, in order, on the critical path');
    const g2 = await open(srv, { checkpoint: 'cp_bore_ante' });
    try {
      await g2.run([{ steps: 900 }]);
      const cradle = marker('ia_cradle');
      seq = await mark(g2);
      await g2.run([{ call: ['teleport', cradle.pos[0] + 0.5, -44, cradle.pos[2] - 3, 0, 0] }, { steps: 1 }, { aimAt: cradle.pos, steps: 40 }]);
      assert.ok((await g2.state()).world.flags.includes('looked:ia_cradle'), 'looked at for 0.5 s within 4 m');
      await g2.run([{ steps: 1200 }]);
      const lines = await keys(g2, seq);
      assert.ok(lines.includes('nar_cradle') && lines.includes('nar_cradle_2'), lines.join(' '));
    } finally { await g2.close(); }
  } finally { await game.close(); }
});

test('the secrets: the loft bell\'s rope drops the ladder; the cold bay knot opens its shutter', async () => {
  const game = await open(srv, { checkpoint: 'cp_street_clear' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -23, 0, 0, 0, 0] }, { steps: 1 }, ...shootScript('sec_loft_bell_rope', 2)]);
    const s = await game.state();
    assert.ok((await game.events(seq, 'secret/found')).some((e) => e.payload.id === 'sec_loft_bell'));
    assert.ok(s.world.flags.includes('enabled:st_loft_ladder'));
    assert.deepEqual(s.stats.secrets, ['sec_loft_bell']);
    const ladder = await game.page.evaluate(() => window.__dbg.ext.core.ctx().collision.groundHeight(-26.2, 4, -6.3, 6));
    assert.ok(ladder > 0.5, `the fallen ladder is a ramp now (ground ${ladder})`);
  } finally { await game.close(); }
  const g2 = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    await g2.dbg('god', true);
    const knot = marker('knot_cold_bay');
    let aimed = false;
    for (const [x, z] of [[3, -6], [3, -8], [3, -4], [2.6, -6]]) {
      await g2.run([{ call: ['teleport', x, -15, z, 0, 0] }, { steps: 1 }, { aimAtEntity: ['knot_cold_bay'] }, { steps: 1 }]);
      if ((await g2.dbg('probe')).entityId === 'knot_cold_bay') { aimed = true; break; }
    }
    assert.ok(aimed, 'the knot is seen through the slot from the nave');
    const seq = await mark(g2);
    await g2.run([{ tap: 'fire', steps: 150 }]);
    const ev = await g2.events(seq);
    assert.ok(ev.some((e) => e.name === 'knot/burst' && e.payload.id === 'knot_cold_bay'));
    assert.ok(ev.some((e) => e.name === 'door/state' && e.payload.id === 'door_cold_bay' && e.payload.state === 'open'));
    assert.ok(ev.some((e) => e.name === 'secret/found' && e.payload.id === 'sec_cold_bay'));
    void knot;
  } finally { await g2.close(); }
});

test('the bore: lead rings flat and the station says so once a phase; a line round is told it is short', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p2' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 600 }]);
    const m = marker('ia_proving_mark_1');
    const seq = await mark(game);
    await game.run([{ call: ['teleport', m.pos[0], m.pos[1], m.pos[2], 180, 0] }, { steps: 1 }, { aimAt: [14, -45, 96], steps: 1 }, { tap: 'fire', steps: 300 }, { tap: 'fire', steps: 300 }]);
    await shoot(game, 'line_round');
    await game.run([{ steps: 400 }]);
    const ev = await game.events(seq);
    assert.equal(ev.filter((e) => e.name === 'shootable/hit' && e.payload.kind === 'bore').length, 3);
    const lines = ev.filter((e) => e.name === 'story/line').map((e) => e.payload.key);
    assert.equal(lines.filter((k) => k === 'stn_bore_lead').length, 1, 'once in the phase');
    assert.ok(lines.includes('stn_bore_line_short'));
  } finally { await game.close(); }
});

test('the lazy key hints: move after 4 s still, fire after 4 s at the jugs, reload when the cylinder is low and at rest; gone when done', async () => {
  const game = await open(srv);
  try {
    let seq = await mark(game);
    await game.run([{ steps: 250 }]);
    let hints = (await game.events(seq, 'ui/hint')).map((e) => `${e.payload.key}:${e.payload.show}`);
    assert.ok(hints.includes('ui_hint_move:true'), hints.join(' '));
    await game.run([{ actions: ['forward'], steps: 30 }, { actions: [], steps: 1 }]);
    hints = (await game.events(seq, 'ui/hint')).map((e) => `${e.payload.key}:${e.payload.show}`);
    assert.ok(hints.includes('ui_hint_move:false'));
    seq = await mark(game);
    const stand = marker('trg_pz_jugs').params.standSpot;
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 250 }]);
    hints = (await game.events(seq, 'ui/hint')).map((e) => `${e.payload.key}:${e.payload.show}`);
    assert.ok(hints.includes('ui_hint_fire:true'), hints.join(' '));
    await game.run([{ tap: 'fire', steps: 2 }]);
    seq = await mark(game);
    // (pass i1: dry clicks raise nothing, each starts a reload by itself; the hint is for a low cylinder with the gun at rest)
    await game.run([{ call: ['emit', 'weapon/dry_fire', { reason: 'empty' }] }, { steps: 1 }, { call: ['emit', 'weapon/dry_fire', { reason: 'empty' }] }, { steps: 1 }]);
    assert.equal((await game.events(seq, 'ui/hint')).length, 0, 'not on a dry click');
    await game.run([{ call: ['setAmmo', 2, 18, 0] }, { steps: 100 }]);
    hints = (await game.events(seq, 'ui/hint')).map((e) => `${e.payload.key}:${e.payload.show}`);
    assert.deepEqual(hints, ['ui_hint_reload:true']);
    // the reload ACTION takes it away (a reload a dry click starts by itself does not: tests/world/polish_r2.test.mjs)
    await game.page.evaluate(() => { const dbg = window.__dbg; dbg.tap('reload'); dbg.step(1, false); dbg.emit('weapon/reload', { stage: 'open', chambered: 0, reserve: 18 }); dbg.step(1, false); });
    hints = (await game.events(seq, 'ui/hint')).map((e) => `${e.payload.key}:${e.payload.show}`);
    assert.ok(hints.includes('ui_hint_reload:false'));
    assert.ok((await game.state()).world.flags.includes('did_reload'));
  } finally { await game.close(); }
});

test('the sighting: nar_dowser_seen when he is in view, he goes when she looks away; else the door opens 12 s after she came in', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(game);
    await game.run([{ steps: 90 }, { aim: [-90, 0], steps: 200 }, { steps: 600 }]);
    const ev = await game.events(seq);
    const lines = ev.filter((e) => e.name === 'story/line').map((e) => e.payload.key);
    assert.ok(lines.includes('nar_dowser_seen') && lines.includes('nar_dowser_gone'), lines.join(' '));
    assert.ok(ev.some((e) => e.name === 'vignette/state' && e.payload.id === 'vig_dowser' && e.payload.stage === 'ended'));
    const gone = ev.find((e) => e.name === 'story/line_end' && e.payload.key === 'nar_dowser_gone');
    const opened = ev.find((e) => e.name === 'door/state' && e.payload.id === 'door_tally' && e.payload.state === 'opening');
    assert.ok(gone && opened && opened.tick - gone.tick <= 1, 'the door opens when the line has played');
  } finally { await game.close(); }
  const g2 = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(g2);
    // never looking west: the door opens 12 s after she came into the strip, and nothing is narrated
    await g2.run([{ call: ['teleport', -88, 0, -10.5, 0, 30] }, { steps: 12 * 60 + 30 }]);
    const ev = await g2.events(seq);
    assert.ok(!ev.some((e) => e.name === 'story/line' && e.payload.key.startsWith('nar_dowser')));
    const opened = ev.find((e) => e.name === 'door/state' && e.payload.id === 'door_tally' && e.payload.state === 'opening');
    assert.ok(opened && Math.abs(opened.tick - ev[0].tick - 720) <= 40, 'twelve seconds after she came in');
  } finally { await g2.close(); }
  // ---- lead ruling R4 (polish round 3): he is held until she has actually looked at him
  const g4 = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const DOWSER = marker('vista_dowser').params.target;
    const sight = async () => (await g4.state()).systems.world.director;
    const ended = async (since) => (await g4.events(since, 'vignette/state')).some((e) => e.payload.id === 'vig_dowser' && e.payload.stage === 'ended');
    let seq = await mark(g4);
    // in the strip, looking north for 14 s: the door's clock lets the door go, and he still stands on the mesa
    await g4.run([{ call: ['teleport', -88, 0, -10.5, 0, 0] }, { steps: 14 * 60 }]);
    assert.equal((await g4.state()).world.doors.door_tally !== 'closed', true, 'the door is let go at 12 s');
    assert.equal(await ended(seq), false, 'never looked at: he has not gone');
    assert.equal((await sight()).sight, 1);
    // he comes into the edge of her view (25 degrees off): the beat and its line start, but that is not looking at him
    const yawTo = Math.atan2(-(DOWSER[0] + 88), -(DOWSER[2] + 10.5)) * 180 / Math.PI;
    await g4.run([{ aim: [yawTo - 25, 12], steps: 14 * 60 }]);
    assert.ok((await g4.events(seq, 'story/line')).some((e) => e.payload.key === 'nar_dowser_seen'), 'in view: the line');
    assert.equal(await ended(seq), false, 'fourteen seconds in the corner of her eye: the 12 s clock does not take him');
    assert.equal((await sight()).sightLooked, 0);
    // she looks at him for a second and a half. Pass i4: the clock (long past) does NOT take him while he is in her view
    seq = await mark(g4);
    await g4.run([{ aimAt: DOWSER, steps: 90 }, { steps: 5 * 60 }]);
    assert.equal(await ended(seq), false, 'looked at and still in her view: he stands (he was taken at 12 s under "When she looked again")');
    // off the middle of her view but in the frame (40 degrees): he still stands
    await g4.run([{ aim: [yawTo - 40, 12], steps: 4 * 60 }]);
    assert.equal(await ended(seq), false, 'in the frame, off its middle: he stands');
    // out of the frame for half a second (the door has opened by its clock): he is gone, and the line is true
    await g4.run([{ aim: [yawTo - 90, 0], steps: 40 }]);
    assert.equal(await ended(seq), true, 'she looked away: he goes');
    assert.ok((await g4.events(seq, 'story/line')).some((e) => e.payload.key === 'nar_dowser_gone'));
  } finally { await g4.close(); }
  const g5 = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    // never looked at, and she goes in through the open door: he goes without a word (the card is not left standing)
    const seq = await mark(g5);
    await g5.run([{ call: ['teleport', -88, 0, -10.5, 0, 0] }, { steps: 13 * 60 }]);
    const door = marker('door_tally');
    await g5.run([{ call: ['teleport', door.pos[0], 0, door.pos[2] - 4, 0, 0] }, { steps: 30 }]);
    const ev = await g5.events(seq);
    assert.equal((await g5.state()).world.zone, 'tally_house');
    assert.ok(ev.some((e) => e.name === 'vignette/state' && e.payload.id === 'vig_dowser' && e.payload.stage === 'ended'));
    assert.ok(!ev.some((e) => e.name === 'story/line' && e.payload.key.startsWith('nar_dowser')));
    assert.equal((await g5.state()).systems.world.director.sight, 4);
  } finally { await g5.close(); }
  const g3 = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(g3);
    await g3.run([{ call: ['teleport', -60, 0, 0, 0, 0] }, { steps: 21 * 60 }]);
    assert.ok((await g3.events(seq, 'lamp/set')).some((e) => e.payload.id === 'light_yard_tally_door'), 'the breadcrumb at 20 s when she never came near');
    assert.equal((await g3.state()).world.doors.door_tally, 'closed');
  } finally { await g3.close(); }
});

test('the Tamper\'s vignette ends after 8 s, or is skipped by walking on into the fight', async () => {
  const game = await open(srv, { checkpoint: 'cp_hall_gantry' });
  try {
    const seq = await mark(game);
    await game.run([{ steps: 9 * 60 }]);
    assert.ok((await game.events(0, 'vignette/state')).some((e) => e.payload.id === 'vig_tamper' && e.payload.stage === 'ended'));
    void seq;
  } finally { await game.close(); }
  const g2 = await open(srv, { checkpoint: 'cp_hall_gantry' });
  try {
    const t = marker('trg_enc_matador');
    await g2.run([{ steps: 60 }, { call: ['teleport', t.pos[0], t.pos[1], t.pos[2], 0, 0] }, { steps: 2 }]);
    assert.ok((await g2.events(0, 'vignette/state')).some((e) => e.payload.id === 'vig_tamper' && e.payload.stage === 'skipped'));
  } finally { await g2.close(); }
});

test('two deaths in the same boss phase bring the mercy tin, silently', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p2' });
  try {
    const seq = await mark(game);
    for (let i = 0; i < 2; i++) await game.run([{ call: ['setHealth', 0] }, { until: { state: 'playing' }, maxSteps: 400 }, { steps: 3 }]);
    const spawned = (await game.events(seq, 'pickup/spawned')).filter((e) => e.payload.id === 'pk_rounds_12_mercy');
    assert.equal(spawned.length, 1, 'the mercy tin appears');
    assert.equal((await game.state()).stats.deaths, 2);
  } finally { await game.close(); }
});

test('captions: 2 s, never the same key again within 4 s, none when captions are off', async () => {
  const game = await open(srv);
  try {
    const seq = await mark(game);
    await game.run([{ call: ['emit', 'story/say', { key: 'cap_gate' }] }, { steps: 60 }, { call: ['emit', 'story/say', { key: 'cap_gate' }] }, { steps: 200 }, { call: ['emit', 'story/say', { key: 'cap_gate' }] }, { steps: 1 }]);
    const caps = (await game.events(seq, 'story/caption')).map((e) => e.payload.seconds);
    assert.deepEqual(caps, [2, 2]);
    await game.run([{ call: ['setOption', 'captions', false] }, { steps: 300 }, { call: ['emit', 'story/say', { key: 'cap_shutter' }] }, { steps: 1 }]);
    assert.equal((await game.events(seq, 'story/caption')).length, 2);
  } finally { await game.close(); }
});
