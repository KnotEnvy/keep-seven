// Polish round 5: what the cross-cutting fixer added to the world's director (docs/requests/polish-r5-fixer.md). The real
// world beside the core stubs, driven by the step hook. The file's rear pair is in polish_r4.test.mjs (the ambush test)
// and director.spec.ts.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, marker, open, server, status, STORY } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lineKeys = async (game, since) => (await game.events(since, 'story/line')).map((e) => e.payload.key);
const emit = (name, payload) => ({ call: ['emit', name, payload] });

test('the Tamper: the fourth round in a row off its plate says where the lead belongs, once an attempt; a vent hit starts the count again; not on Hard', async () => {
  assert.ok(STORY.lines.hint_tamper_vent, 'the line exists');
  for (const difficulty of ['normal', 'hard']) {
    const game = await open(srv, { checkpoint: 'cp_hall_gantry' });
    try {
      await game.dbg('god', true);
      await game.dbg('setOption', 'difficulty', difficulty);
      const t = marker('trg_enc_matador');
      await game.run([{ steps: 60 }, { call: ['teleport', t.pos[0], t.pos[1], t.pos[2], 0, 0] }, { steps: 5 }, { call: ['setAmmo', 6, 24, 0] }]);
      const s = await game.state();
      assert.equal(s.encounters.enc_matador.state, 'active');
      const tamper = s.enemies.find((e) => e.encounter === 'enc_matador');
      const hit = (outcome) => emit('combat/hit', { x: tamper.x, y: tamper.y + 1.2, z: tamper.z, shotId: 1, order: 0, ammo: 'lead_round', outcome, entityId: tamper.id, entityKind: 'tamper', part: 'plate', surface: 'metal', nx: 0, ny: 0, nz: 1, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 });
      // whatever the hall's own lines are, let them run out first: a hint waits for a quiet moment
      await game.run([{ steps: 20 * 60 }]);
      const seq = await mark(game);
      await game.run([hit('deflected'), hit('deflected'), hit('deflected'), hit('weak'), hit('deflected'), hit('deflected'), hit('deflected'), { steps: 30 }]);
      assert.ok(!(await lineKeys(game, seq)).includes('hint_tamper_vent'), 'three, a vent hit, three more: not yet');
      await game.run([hit('deflected'), { steps: 60 }]);
      const said = (await lineKeys(game, seq)).filter((k) => k === 'hint_tamper_vent').length;
      assert.equal(said, difficulty === 'hard' ? 0 : 1, `${difficulty}: the fourth in a row`);
      await game.run([{ steps: 8 * 60 }, hit('deflected'), hit('deflected'), hit('deflected'), hit('deflected'), hit('deflected'), { steps: 120 }]);
      assert.equal((await lineKeys(game, seq)).filter((k) => k === 'hint_tamper_vent').length, difficulty === 'hard' ? 0 : 1, 'once an attempt');
    } finally { await game.close(); }
  }
});

test('the Windlass: the break into phase 3 also shakes a tin loose when she holds less than a tin in reserve', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p2' });
  try {
    await game.run([{ steps: 30 }, { call: ['setAmmo', 4, 0, 0] }, { steps: 1 }]);
    const seq = await mark(game);
    await game.run([emit('boss/phase', { phase: 'p3a', from: 'p2' }), { steps: 5 }]);
    const s = await game.state();
    assert.equal(s.world.checkpoint, 'cp_boss_p3');
    assert.ok((await game.events(seq, 'pickup/spawned')).some((e) => e.payload.kind === 'pk_rounds_12'), 'a tin of twelve at her feet');
    assert.equal(s.player.reserve, 12, 'reserve 0 -> 12');
  } finally { await game.close(); }
});

// =====================================================================================================================
// The world team's own issues of round 5 (docs/requests/world.md, section 3)
// =====================================================================================================================
const lineEvents = (game, since) => game.events(since, 'story/line');
const say = (game, key) => game.page.evaluate((k) => window.__dbg.ext.world.say(k), key);
const kept = (stage) => emit('weapon/kept', { stage, mark: '' });
const tp = (m, yaw = 0, dx = 0, dz = 0) => ({ call: ['teleport', m.pos[0] + dx, m.pos[1], m.pos[2] + dz, yaw, 0] });

// ---- R12: the lines that pay off the seventh shot land with the shot --------------------------------------------
test('the seventh, fired promptly: BORE PROVEN on the shot\'s tick over the band line, nar_kept as it leaves the screen, then HEAD DRY and the office', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 900 }, emit('boss/phase', { phase: 'p3a', from: 'p2' }), { steps: 4 * 60 }]);
    const seq = await mark(game);
    // the press, and the shot 0.7 s later: the band line (5.5 s) has only just begun
    await game.run([kept('loading'), { steps: 42 }]);
    assert.equal((await game.state()).systems.world.story.current, 'nar_seal');
    await game.run([emit('boss/phase', { phase: 'hush', from: 'p3a' }), kept('fired'), emit('boss/proven', { x: 0, y: 0, z: 0 }), emit('boss/phase', { phase: 'proven', from: 'hush' }), { steps: 1 }]);
    const fired = (await game.state()).tick - 1;
    assert.equal((await game.state()).systems.world.story.current, 'stn_proven', 'BORE PROVEN is on screen on the shot (it waited 3 s behind the band line)');
    await game.run([{ steps: 239 }, emit('boss/phase', { phase: 'p3b', from: 'proven' }), emit('story/say', { key: 'stn_dry' }), { steps: 30 * 60 }]);
    const ev = (await lineEvents(game, seq)).filter((e) => e.tick >= fired);
    const at = (k) => (ev.find((e) => e.payload.key === k)?.tick ?? Infinity) - fired;
    const keys = ev.map((e) => e.payload.key);
    assert.deepEqual(keys, ['stn_proven', 'nar_kept', 'stn_dry', 'nar_office'], keys.join(' '));
    assert.ok(at('stn_proven') <= 1, `BORE PROVEN ${at('stn_proven')} ticks after the shot`);
    assert.ok(at('nar_kept') <= 3.5 * 60, `nar_kept ${(at('nar_kept') / 60).toFixed(2)} s after the shot (it was 9 s, in phase 3b)`);
    assert.ok(at('stn_dry') <= 9 * 60, `HEAD DRY ${(at('stn_dry') / 60).toFixed(2)} s after the shot`);
    assert.ok(at('nar_office') <= 12 * 60, `the office ${(at('nar_office') / 60).toFixed(2)} s after the shot (it was 14 s)`);
  } finally { await game.close(); }
});

test('the kept ladder: tier 1 says its own line (hint_kept_1), never the office before the proof; the office is still said after it', async () => {
  assert.ok(STORY.lines.hint_kept_1, 'the line exists');
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 900 }]);
    const seq = await mark(game);
    await game.run([emit('boss/phase', { phase: 'p3a', from: 'p2' }), { steps: 12 * 60 }, emit('boss/charge_required', {}), { steps: 28 * 60 }]);
    const hints = (await game.events(seq, 'puzzle/hint')).filter((e) => e.payload.puzzle === 'kept');
    assert.deepEqual(hints.map((e) => e.payload.tier), [1]);
    let ev = await lineEvents(game, seq);
    const h1 = ev.find((e) => e.payload.key === 'hint_kept_1');
    assert.ok(h1 && h1.tick - hints[0].tick <= 2, `tier 1 says hint_kept_1 (${ev.map((e) => e.payload.key).join(' ')})`);
    assert.equal(h1.payload.text, STORY.lines.hint_kept_1.text);
    assert.ok(!ev.some((e) => e.payload.key === 'nar_office'), 'the pay-off line is not spent as a hint');
    await game.run([kept('loading'), { steps: 60 }, emit('boss/proven', { x: 0, y: 0, z: 0 }), { steps: 240 }, emit('boss/phase', { phase: 'p3b', from: 'proven' }), { steps: 20 * 60 }]);
    ev = await lineEvents(game, seq);
    assert.ok(ev.some((e) => e.payload.key === 'nar_office'), 'and it is said after the proof');
  } finally { await game.close(); }
});

// ---- R5: stepping back from the stone does not choose for her ---------------------------------------------------
test('R5: 6 m back from the stone to look at the Rule: no ending at 25 s; the clock stands while a line is on screen; 40 quiet seconds end it', async () => {
  const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round');
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([tp(STONE), { steps: 2 }]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 60 * 60);
    await game.run([{ steps: 30 }]);
    // six metres off, as the critic's player stood
    await game.run([{ call: ['teleport', ROUND.pos[0] + 6, STONE.pos[1], ROUND.pos[2] + 1.5, 0, 0] }, { steps: 1 }]);
    const left = (await game.state()).tick;
    const since = async () => (await game.state()).systems.world.ending.sinceStone;
    await game.run([{ steps: 10 * 60 }]);
    const s10 = await since();
    assert.ok(s10 > 9 && s10 <= 10.1, `the clock runs while nothing is said (${s10})`);
    // a line comes on screen (5.5 s): the clock stands
    // (pass i1: the rim's own scenery lines are told at the ledge's edge now; any line does)
    await say(game, 'nar_marks');
    await game.run([{ steps: 2 }]);
    assert.equal((await status(game)).story.current, 'nar_marks', 'a line is on screen');
    await game.run([{ steps: 5 * 60 }]);
    const s15 = await since();
    assert.ok(s15 - s10 < 0.5, `the clock stood while the line was on screen (${s10} -> ${s15})`);
    await game.run([{ steps: 13 * 60 }]);                    // 28 s away
    assert.equal((await game.events(seq, 'ending/stone')).length, 0, 'not at 25 s (it was: the leave ending taken for her)');
    assert.equal((await game.state()).game, 'playing');
    // she steps back to the stone and takes the round: the choice is still hers
    await game.run([tp(STONE, 90), { steps: 5 }]);
    assert.equal(await since(), 0, 'coming back starts the clock again');
    await game.run([{ call: ['teleport', ROUND.pos[0] + 6, STONE.pos[1], ROUND.pos[2] + 1.5, 0, 0] }, { steps: 1 }]);
    const again = (await game.state()).tick;
    await game.run([{ steps: 39 * 60 }]);
    assert.equal((await game.events(seq, 'ending/stone')).length, 0, 'not before 40 s');
    // (release pass p0: the warning line, said ten seconds before the clock runs out, stops the clock while it is up)
    await game.run([{ steps: 90 + 6 * 60 }]);
    const e = (await game.events(seq, 'ending/stone'))[0];
    assert.ok(e && e.payload.taken === false && e.tick - again >= 2400 - 2, `a real leave still ends the stage, 40 s on (${e ? e.tick - again : 'never'} ticks)`);
    void left;
  } finally { await game.close(); }
});

// ---- lines that came after the thing they describe ---------------------------------------------------------------
test('a quick take at the stone: answered on its tick (pass i3); none of the stone\'s four lines after it; the lamps, then the Rule\'s line, then the fire', async () => {
  const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), ARRIVE = marker('trg_rim_arrive');
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    // off the lift, to the stone, and 3.5 s there before the round is taken (the critic's brisk player)
    await game.run([tp(ARRIVE), { steps: 30 }, tp(STONE, 90), { steps: 3.5 * 60 }, { aimAt: ROUND.pos, steps: 2 }, { tap: 'interact', steps: 4 }]);
    const took = (await game.events(seq, 'ending/stone'))[0];
    assert.ok(took && took.payload.taken === true, 'taken');
    const end = await game.until({ event: 'ending/card' }, 120 * 60);
    assert.ok(end.met, 'the end card');
    const ev = await lineEvents(game, seq);
    const after = ev.filter((e) => e.tick >= took.tick).map((e) => e.payload.key);
    // (pass i1: the stone's first line had not started: the one condensed stone line answers the take, then the take's two)
    // (pass i2: the lamps' count, begun before the take, is finished first; after "Seven again." only the fire)
    // (pass i3, story reviewer b: answered on the tick of the take again, as in round 5; the lamps' lines follow the
    // take's unbroken, then the thread and the Rule against it (story reviewer a: never lost), then the fire)
    assert.deepEqual(after, ['nar_take_1', 'nar_take_2', 'nar_lamps', 'nar_lamps_count', 'nar_rim_2', 'nar_rim_3', 'nar_fire', 'nar_last'], after.join(' '));
    assert.ok(ev.find((e) => e.payload.key === 'nar_take_1').tick - took.tick <= 1, 'the take is answered on its tick');
    const lampsAt = ev.find((e) => e.payload.key === 'nar_lamps'), countAt = ev.find((e) => e.payload.key === 'nar_lamps_count');
    assert.ok(countAt.tick - (lampsAt.tick + Math.round(lampsAt.payload.seconds * 60)) <= 20, '"She counted them" and the count are one breath apart (they were 23.6 s and four lines apart)');
    for (const k of ['nar_stone_1', 'nar_stone_2', 'nar_stone_3', 'nar_stone_4']) assert.ok(!after.includes(k), `${k} is not said after the take (${after.join(' ')})`);
    const all = ev.map((e) => e.payload.key);
    for (const k of ['nar_lamps', 'nar_lamps_count', 'nar_fire', 'nar_last']) assert.ok(all.includes(k), `${k} (${all.join(' ')})`);
    assert.ok(all.indexOf('nar_lamps_count') < all.indexOf('nar_fire'), 'the fire waits for the lamps');
    const fire = (await game.events(seq, 'ending/fire'))[0];
    const count = (await game.events(seq, 'story/line_end')).find((e) => e.payload.key === 'nar_lamps_count');
    assert.ok(count && fire.tick >= count.tick, 'the fire kindles after the count of the lamps has been read');
  } finally { await game.close(); }
});

test('the yard latch: its line is said when she first looks at the knot; shot before it can be said, it starts within 1.5 s of the burst or not at all', async () => {
  const knot = marker('knot_yard_latch'), cp = marker('cp_street_clear');
  // (a) seen first
  let game = await open(srv, { checkpoint: 'cp_street_clear' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    // 30 m up the street with her back to the door: nothing; then she turns and walks to within 26 m
    await game.run([{ call: ['teleport', knot.pos[0] + 30, 0, knot.pos[2], -90, 0] }, { steps: 8 * 60 }]);
    const before = (await lineEvents(game, seq)).map((e) => e.payload.key);
    await game.run([{ call: ['teleport', knot.pos[0] + 14, 0, knot.pos[2], 90, 0] }, { steps: 1 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 30 }]);
    const ev = await lineEvents(game, seq);
    assert.ok(before.includes('nar_first_knot') || ev.some((e) => e.payload.key === 'nar_first_knot'), `said on sight (${ev.map((e) => e.payload.key).join(' ')})`);
    assert.equal((await game.state()).encounters.enc_yard.state, 'idle', 'before the knot is shot');
    void cp;
  } finally { await game.close(); }
  // (b) shot from far with the narrator busy: never said late
  game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    await game.dbg('clearEncounter', 'enc_street');
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    let burst = false;
    for (const [x, z] of [[knot.pos[0] + 30, knot.pos[2]], [knot.pos[0] + 28, knot.pos[2] + 0.5], [knot.pos[0] + 27, knot.pos[2] - 0.5]]) {
      await game.run([{ call: ['teleport', x, 0, z, -90, 0] }, { steps: 2 }]);
      await say(game, 'nar_marks'); await say(game, 'nar_rule');
      await game.run([{ steps: 20 }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 1 }]);
      if ((await game.dbg('probe')).entityId !== 'knot_yard_latch') continue;
      await game.run([{ tap: 'fire', steps: 2 }]);
      burst = true; break;
    }
    assert.ok(burst, 'the knot was shot from beyond its sight range or behind her back');
    const at = (await game.events(seq, 'knot/burst'))[0].tick;
    await game.run([{ steps: 30 * 60 }]);
    const line = (await lineEvents(game, seq)).find((e) => e.payload.key === 'nar_first_knot');
    assert.ok(!line || line.tick - at <= 90, `not said ${line ? ((line.tick - at) / 60).toFixed(1) : 0} s after the door stood open (it was 3 s)`);
  } finally { await game.close(); }
});

test('the street\'s after-the-fight line is not said once the yard fight has begun (it would follow the latch line into the fight)', async () => {
  const knot = marker('knot_yard_latch');
  const game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    await game.dbg('clearEncounter', 'enc_street');
    await game.run([{ steps: 30 * 60 }]);
    const seq = await mark(game);
    // into trg_marks (x -71 to -57) looking at the latch 10 m off: the latch line is next, the room's line behind it
    let burst = false;
    for (const dz of [0, 0.6, -0.6]) {
      await game.run([{ call: ['teleport', knot.pos[0] + 10, 0, knot.pos[2] + dz, 90, 0] }, { aimAtEntity: ['knot_yard_latch'] }, { steps: 30 }]);
      if ((await game.dbg('probe')).entityId !== 'knot_yard_latch') continue;
      await game.run([{ tap: 'fire', steps: 2 }]);
      burst = true; break;
    }
    assert.ok(burst, 'the knot was shot');
    const at = (await game.events(seq, 'knot/burst'))[0].tick;
    await game.run([{ steps: 40 * 60 }]);
    const ev = await lineEvents(game, seq);
    const keys = ev.map((e) => e.payload.key);
    const first = ev.find((e) => e.payload.key === 'nar_first_knot');
    assert.ok(first && first.tick < at, `the latch line before the burst (${keys.join(' ')})`);
    assert.ok(!keys.includes('nar_marks'), `"Every door wore the well mark" is not said in the yard fight (${keys.join(' ')})`);
  } finally { await game.close(); }
});

test('the watcher in the niche: its lines are said when she has looked at it (pass i2); walked on to the bay locker before their turn, they are not said there', async () => {
  const W = marker('trg_watcher'), LOCKER = marker('ia_line_locker_bay'), FIG = marker('prop_watcher');
  for (const stays of [true, false]) {
    const game = await open(srv, { checkpoint: 'cp_tally_hatch' })   // (the last checkpoint before the peg stair);
    try {
      await game.dbg('god', true);
      await game.run([{ steps: 60 }]);
      const seq = await mark(game);
      // a room's description is on screen as she comes down the flight
      await say(game, 'nar_marks');
      await game.run([{ steps: 10 }, tp(W, 180), { aimAt: [FIG.pos[0], FIG.pos[1] + 0.95, FIG.pos[2]], steps: 30 }]);
      if (!stays) await game.run([{ steps: 30 }, { call: ['teleport', LOCKER.pos[0], LOCKER.pos[1], LOCKER.pos[2] - 1, 0, 0] }]);
      await game.run([{ steps: 30 * 60 }]);
      const keys = (await lineEvents(game, seq)).map((e) => e.payload.key);
      if (stays) assert.deepEqual(keys.filter((k) => k.startsWith('nar_watcher')), ['nar_watcher_1', 'nar_watcher_2'], keys.join(' '));
      else assert.deepEqual(keys.filter((k) => k.startsWith('nar_watcher')), [], `15 m on, at the locker: neither is said (${keys.join(' ')})`);
    } finally { await game.close(); }
  }
});
