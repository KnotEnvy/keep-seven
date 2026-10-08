// Polish round 4: one test per issue the fourth critic panel filed against the world (docs/requests/world.md). The real
// world beside the core stubs, driven by the step hook. The stone's prompt and the take branch's lines are in
// ending.test.mjs; the scheduler's gate is in director.spec.ts.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, marker, open, server } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const lineEvents = (game, since) => game.events(since, 'story/line');
const lineKeys = async (game, since) => (await lineEvents(game, since)).map((e) => e.payload.key);
const say = (game, key) => game.page.evaluate((k) => window.__dbg.ext.world.say(k), key);
const emit = (name, payload) => ({ call: ['emit', name, payload] });
const kept = (stage) => emit('weapon/kept', { stage, mark: '' });
const pips = (phase, remaining) => emit('boss/pips', { phase, remaining, total: 26, lit: 0 });
const die = [{ call: ['god', false] }, { call: ['setHealth', 0] }, { until: { state: 'playing' }, maxSteps: 400 }, { steps: 3 }];
const alive = (s, enc) => s.enemies.filter((e) => e.encounter === enc && e.alive);
const waveTick = async (game, enc, wave) => (await game.events(0, 'encounter/wave')).find((e) => e.payload.id === enc && e.payload.wave === wave)?.tick;

// ---- the end card's "Knots burst" --------------------------------------------------------------------------------
test('knots burst: a Windlass pip counts once; a change of phase, a death and a restore into a later phase count nothing', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p1' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 30 }]);
    const knots = async () => (await game.state()).stats.knotsBurst;
    // whatever the stub boss announced on its own start is the baseline: the first event after it counts nothing
    await game.run([pips('p1', 26), { steps: 1 }]);
    const k0 = await knots();
    await game.run([pips('p1', 25), pips('p1', 24), { steps: 1 }]);
    assert.equal(await knots(), k0 + 2, 'two pips, two knots');
    // the phases change and say what is left (the same 24, then 16 after phase 1's ten): nothing is counted again
    await game.run([pips('p1', 16), { steps: 1 }]);
    assert.equal(await knots(), k0 + 10, 'the ten of phase 1');
    for (const phase of ['p2', 'p2', 'p3a', 'hush', 'proven']) await game.run([pips(phase, 16), { steps: 1 }]);
    assert.equal(await knots(), k0 + 10, 'five announcements of the same sixteen left: no knot (the card read 186 for 78 rounds)');
    await game.run([pips('p2', 15), { steps: 1 }]);
    assert.equal(await knots(), k0 + 11);
    // a death: the stats go back to the checkpoint, and the phase begun again (26 left again, then 6 on a restore into
    // phase 3) counts nothing without a shot
    await game.run(die);
    const k1 = await knots();
    assert.ok(k1 <= k0 + 11);
    await game.run([pips('p1', 26), { steps: 1 }, pips('p3a', 6), { steps: 1 }]);
    await game.run(die);
    await game.run([pips('p3a', 6), { steps: 1 }, pips('p3a', 6), { steps: 1 }]);
    const k2 = await knots();
    await game.run([pips('p3b', 5), { steps: 1 }]);
    assert.equal(await knots(), k2 + 1, 'and the next real pip is one knot');
    const s = await game.state();
    assert.ok(s.stats.knotsBurst <= s.stats.roundsHit + s.stats.freed + 26, `never more knots than there are (${s.stats.knotsBurst})`);
  } finally { await game.close(); }
});

// ---- the seventh: the text keeps up with the action --------------------------------------------------------------
test('phase 3a: the station asks for the charge within 2 s of the phase; the press cuts in with nar_seal on the tick', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 900 }]);                                  // (what the checkpoint itself says is over)
    const seq = await mark(game);
    await game.run([emit('boss/phase', { phase: 'p3a', from: 'p2' }), { steps: 1 }]);
    const begun = (await game.state()).tick;
    await game.run([{ steps: 7 * 60 }]);
    let ev = await lineEvents(game, seq);
    const ask = ev.find((e) => e.payload.key === 'stn_boss_charge_required');
    assert.ok(ask, `the station asks (${ev.map((e) => e.payload.key).join(' ')})`);
    assert.ok(ask.tick - begun <= 2 * 60, `within 2 s of the phase (${((ask.tick - begun) / 60).toFixed(2)} s; it was 12 s)`);
    // (a warp to this checkpoint counts nar_one_left as told: the narrator's line that follows the ask is stood in for)
    // a narrator line (5.5 s) is on screen; she presses F
    // (pass i3: `nar_rim_3` waits for a look at the Rule now; any other narrator line stands in)
    await say(game, 'nar_rim_1');
    await game.run([{ steps: 30 }]);
    assert.equal((await game.state()).systems.world.story.current, 'nar_rim_1');
    await game.run([kept('loading'), { steps: 2 }]);
    const press = (await game.events(seq, 'weapon/kept')).find((e) => e.payload.stage === 'loading').tick;
    ev = await lineEvents(game, seq);
    const seal = ev.find((e) => e.payload.key === 'nar_seal');
    assert.ok(seal && seal.tick - press <= 1, `nar_seal on the press (${seal ? seal.tick - press : 'never'} ticks; it waited 5 s behind nar_one_left)`);
    assert.equal((await game.state()).systems.world.story.current, 'nar_seal', 'over the line that was on screen');
    // and the Windlass's own later ask is not said to a player who has broken the band
    await say(game, 'stn_boss_charge_required');
    await game.run([{ steps: 12 * 60 }]);
    const after = (await lineEvents(game, seq)).filter((e) => e.tick > press).map((e) => e.payload.key);
    assert.ok(!after.includes('stn_boss_charge_required'), `no ask after the press (${after.join(' ')})`);
    assert.ok(!after.includes('nar_office'), 'the office waits for the proof (or the ladder)');
  } finally { await game.close(); }
});

test('the proof: "BORE PROVEN." answers the shot at once, "HEAD DRY." is said, then nar_kept and the office; nothing older stands in between', async () => {
  for (const narrating of [false, true]) {
    const game = await open(srv, { checkpoint: 'cp_boss_p3' });
    try {
      await game.dbg('god', true);
      await game.run([{ steps: 900 }, emit('boss/phase', { phase: 'p3a', from: 'p2' }), { steps: 14 * 60 }]);
      const seq = await mark(game);
      // the Windlass's talk is waiting (a station line on screen, two more behind it) when she fires
      await game.run([kept('loading'), { steps: narrating ? 30 : 7 * 60 }]);
      await say(game, 'stn_service'); await say(game, 'stn_thanks'); await say(game, 'nar_rim_1');
      await game.run([{ steps: 20 }, emit('boss/proven', { x: 0, y: 0, z: 0 }), { steps: 1 }]);
      const fired = (await game.state()).tick - 1;
      // the Windlass announces its dry phase four seconds on, and asks for its line by the bus as it always did
      await game.run([{ steps: 239 }, emit('boss/phase', { phase: 'p3b', from: 'proven' }), emit('story/say', { key: 'stn_dry' }), { steps: 30 * 60 }]);
      const ev = (await lineEvents(game, seq)).filter((e) => e.tick >= fired);
      const keys = ev.map((e) => e.payload.key);
      const at = (k) => ev.find((e) => e.payload.key === k)?.tick;
      for (const k of ['stn_proven', 'stn_dry', 'nar_kept', 'nar_office']) assert.ok(keys.includes(k), `${k} (${keys.join(' ')})`);
      // (polish round 5, R12: nar_kept straight after BORE PROVEN, HEAD DRY behind it)
      assert.deepEqual(keys.filter((k) => ['stn_proven', 'stn_dry', 'nar_kept', 'nar_office'].includes(k)), ['stn_proven', 'nar_kept', 'stn_dry', 'nar_office'], 'in this order, each once');
      // nar_seal (5.5 s) may still be on screen when she fires 0.5 s after the press: it is cut (round 5; it held the station 3 s)
      assert.ok(at('stn_proven') - fired <= 2, `BORE PROVEN ${((at('stn_proven') - fired) / 60).toFixed(2)} s after the shot (it was 10 to 15 s, then 3 s)`);
      assert.ok(at('nar_kept') - fired <= 3.5 * 60, `nar_kept ${((at('nar_kept') - fired) / 60).toFixed(2)} s after the shot (it was 9 s)`);
      assert.ok(at('stn_dry') - fired >= 240 - 2 && at('stn_dry') - fired <= 10 * 60, `HEAD DRY after phase 3b begins, behind nar_kept (${((at('stn_dry') - fired) / 60).toFixed(2)} s)`);
      assert.ok(at('nar_office') - fired <= 22 * 60, `the office within 22 s (${((at('nar_office') - fired) / 60).toFixed(1)} s)`);
      for (const k of ['stn_service', 'stn_thanks', 'nar_rim_1']) assert.ok(!keys.slice(0, keys.indexOf('nar_office')).includes(k), `${k} does not stand in front of the proof's lines`);
      assert.ok((await game.events(seq, 'audio/cue')).some((e) => e.payload.cue === 'water_below'), 'water far below');
    } finally { await game.close(); }
  }
});

// ---- the file: the three who had not queued ---------------------------------------------------------------------------
test('enc_file (polish round 5): near the far door the rear pair start down the stair behind her, 4 s later the bang, 1 s later the door bursts on four; never a dead end', async () => {
  const far = marker('door_gallery_far');
  for (const walks of [true, false]) {
    const game = await open(srv, { checkpoint: 'cp_gallery_baffle' });
    try {
      await game.dbg('god', true);
      await game.run([{ steps: 200 }]);
      // the six, shot from 21 m short of the far door
      for (let guard = 0; guard < 12; guard++) {
        const up = alive(await game.state(), 'enc_file');
        if (!up.length) break;
        await game.run([{ call: ['teleport', -40, -12, -14, 0, 0] }, { steps: 1 }, { aimAtEntity: [up[0].id] }, { steps: 1 }, { tap: 'fire', steps: 2 }]);
      }
      const downs = (await game.events(0)).filter((e) => (e.name === 'enemy/felled' || e.name === 'enemy/freed') && e.payload.encounter === 'enc_file');
      assert.equal(downs.length, 6, 'the six are down');
      await game.run([{ steps: 8 * 60 }]);
      assert.equal(await waveTick(game, 'enc_file', 'R'), undefined, 'eight seconds on, 21 m from the door: nobody has come from either end');
      assert.equal(await waveTick(game, 'enc_file', 'B'), undefined);
      assert.equal((await game.state()).world.doors.door_gallery_far, 'closed');
      const seq = await mark(game);
      if (walks) {
        await game.run([{ call: ['teleport', far.pos[0] - 9, -12, -14, -90, 0] }, { steps: 3 }]);
        const r = await waveTick(game, 'enc_file', 'R');
        assert.ok(r && r >= (await game.state()).tick - 3, 'within 16 m of the door: the rear pair are let go');
        const rear = alive(await game.state(), 'enc_file');
        assert.equal(rear.length, 2, 'two, and nobody at the door yet');
        for (const e of rear) assert.ok(e.x < -84 && e.z < -18.5, `the rear pair start on the peg stair behind the bay wall (${e.x}, ${e.z})`);
        assert.equal(await waveTick(game, 'enc_file', 'B'), undefined);
        await game.run([{ steps: 60 }]);
        assert.ok((await lineKeys(game, seq)).includes('nar_file_behind'), 'the narrator names the two behind her');
        await game.run([{ steps: 4 * 60 - 60 }]);
        const b = await waveTick(game, 'enc_file', 'B');
        assert.ok(b && Math.abs(b - r - 4 * 60) <= 2, `the door's four are let go 4 s after the rear pair (${b ? (b - r) / 60 : 'never'})`);
        assert.equal(alive(await game.state(), 'enc_file').filter((e) => e.x > -19).length, 4, 'four behind the door');
        assert.equal((await game.state()).world.doors.door_gallery_far, 'closed', 'the door is still shut');
        assert.ok((await game.events(seq, 'audio/cue')).some((e) => e.payload.cue === 'shutter_bang' && Math.abs(e.payload.x - far.pos[0]) < 0.1 && e.tick === b), 'a bang on the door from the far side, on the tick they are let go');
        assert.ok((await game.events(seq, 'story/caption')).some((e) => e.payload.key === 'cap_bider_rattle'), 'and the rattle\'s caption');
        await game.run([{ steps: 90 }]);
        const opening = (await game.events(seq, 'door/state')).find((e) => e.payload.id === 'door_gallery_far' && e.payload.state === 'opening');
        assert.ok(opening && Math.abs(opening.tick - b - 60) <= 2, `the door bursts 1 s after (${opening ? (opening.tick - b) / 60 : 'never'})`);
        await game.run([{ steps: 5 * 60 }]);
        assert.ok((await lineKeys(game, seq)).includes('nar_file_more'), 'and the narrator names the four');
        // (this suite runs beside the stub enemies, which stand where they are spawned: that the rear pair reach her is
        // measured with the real ones, tests/e2e and scratch/r5-fixer/proxy/t5_file_c1.log)
      } else {
        // she never comes down the gallery: they come to her 25 s after the file was down to one
        const fifth = downs[4].tick;
        await game.run([{ steps: 20 * 60 }]);
        const r = await waveTick(game, 'enc_file', 'R');
        assert.ok(r && Math.abs(r - fifth - 25 * 60) <= 2, `R 25 s after the fifth fell (${r ? (r - fifth) / 60 : 'never'})`);
        await game.run([{ steps: 5 * 60 }]);
        const b = await waveTick(game, 'enc_file', 'B');
        assert.ok(b && Math.abs(b - r - 4 * 60) <= 2, `B 4 s after R (${b ? (b - r) / 60 : 'never'})`);
      }
    } finally { await game.close(); }
  }
});

// ---- the sighting's line and the Tally House ---------------------------------------------------------------------
test('the tally door does not open under "On the far rim, a man..."; and the line does not follow her into the Tally House', async () => {
  const DOWSER = marker('vista_dowser').params.target;
  let game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(game);
    // in the strip looking north for 11 s, then she sees him: the line is on screen when the door's 12 s are up
    await game.run([{ call: ['teleport', -88, 0, -10.5, 0, 0] }, { steps: 11 * 60 }, { aimAt: DOWSER, steps: 8 * 60 }]);
    const ev = await game.events(seq);
    const line = ev.find((e) => e.name === 'story/line' && e.payload.key === 'nar_dowser_seen');
    const end = ev.find((e) => e.name === 'story/line_end' && e.payload.key === 'nar_dowser_seen');
    const opened = ev.find((e) => e.name === 'door/state' && e.payload.id === 'door_tally' && e.payload.state === 'opening');
    assert.ok(line && end && opened, 'the line, its end, the door');
    assert.ok(line.tick - ev[0].tick < 12 * 60 && end.tick - ev[0].tick > 12 * 60, 'the line stood across the 12 s mark');
    assert.ok(opened.tick >= end.tick, `the door waits for the line (${opened.tick - end.tick} ticks after it; it opened ${end.tick - (ev[0].tick + 720)} ticks into it)`);
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(game);
    // the door let go by its clock, never looked at; then she sees him and walks in under the line
    await game.run([{ call: ['teleport', -88, 0, -10.5, 0, 0] }, { steps: 13 * 60 }, { aimAt: DOWSER, steps: 60 }]);
    assert.equal((await game.state()).systems.world.story.current, 'nar_dowser_seen');
    const door = marker('door_tally');
    await game.run([{ call: ['teleport', door.pos[0], 0, door.pos[2] - 4, 0, 0] }, { steps: 12 * 60 }]);
    assert.equal((await game.state()).world.zone, 'tally_house');
    const ev = await game.events(seq);
    const entered = ev.find((e) => e.name === 'zone/entered' && e.payload.zone === 'tally_house');
    const end = ev.find((e) => e.name === 'story/line_end' && e.payload.key === 'nar_dowser_seen');
    assert.ok(entered && end && end.tick - entered.tick <= 2, `the line is cut as she goes in (${end && entered ? end.tick - entered.tick : '?'} ticks)`);
    assert.ok(!ev.some((e) => e.name === 'story/line' && e.payload.key === 'nar_dowser_gone'), '"only rim" is not said inside');
  } finally { await game.close(); }
});

// ---- the rim's lines and what she is looking at -----------------------------------------------------------------
test('bent over the stone the thread over Plenty and the Rule are not narrated; they are when the town is in her view again', async () => {
  const STONE = marker('trg_stone'), ROUND = marker('ia_stone_round'), ARRIVE = marker('trg_rim_arrive'), TOWN = marker('vista_plenty').params.target;
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([{ call: ['teleport', ARRIVE.pos[0], ARRIVE.pos[1], ARRIVE.pos[2], 0, 0] }, { steps: 30 },
      { call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 2 }, { aimAt: ROUND.pos, steps: 45 * 60 }]);
    let keys = await lineKeys(game, seq);
    for (const k of ['nar_stone_1', 'nar_stone_4']) assert.ok(keys.includes(k), k);
    assert.ok(!keys.includes('nar_rim_2') && !keys.includes('nar_rim_3'), `45 s looking at the stone: no scenery line (${keys.join(' ')})`);
    const up = (await game.state()).tick;
    await game.run([{ aimAt: TOWN, steps: 12 * 60 }]);
    const ev = await lineEvents(game, seq);
    keys = ev.map((e) => e.payload.key);
    assert.ok(keys.includes('nar_rim_2') && keys.includes('nar_rim_3'), `she looks up at the town: both are said (${keys.join(' ')})`);
    assert.ok(ev.find((e) => e.payload.key === 'nar_rim_2').tick - up <= 30, 'the first as she looks');
    assert.equal((await game.events(seq)).some((e) => e.name === 'ending/stone'), false, 'and nothing was chosen for her meanwhile');
  } finally { await game.close(); }
});

// ---- the proving plate's lines --------------------------------------------------------------------------------------
test('the proving plate\'s three lines are said as it closes, ahead of what was waiting (they played 30 s and a fight later)', async () => {
  const game = await open(srv, { checkpoint: 'cp_gallery_bay' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 20 * 60 }]);
    const plate = marker('rd_plate_proving');
    const seq = await mark(game);
    // the narrator is busy with the room: one line on screen, three waiting
    for (const k of ['nar_rim_1', 'nar_tally_1', 'nar_tally_2', 'nar_tally_3']) await say(game, k);
    await game.run([{ steps: 20 }, { call: ['teleport', plate.pos[0], -12, plate.pos[2] + 1.3, 0, 0] }, { steps: 1 }, { aimAt: plate.pos, steps: 1 }, { tap: 'interact', steps: 2 }]);
    let ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'readable/closed' && e.payload.key === 'rd_plate_proving'), 'read and closed');
    const closed = ev.find((e) => e.name === 'readable/closed').tick;
    await game.run([{ steps: 25 * 60 }]);
    ev = await lineEvents(game, seq);
    const keys = ev.map((e) => e.payload.key).filter((k) => k !== 'nar_rim_1');
    assert.deepEqual(keys.slice(0, 3), ['nar_plate_1', 'nar_plate_2', 'nar_plate_3'], `the plate first (${keys.join(' ')})`);
    assert.ok(ev.find((e) => e.payload.key === 'nar_plate_1').tick - closed <= 6 * 60, 'the first within the line that was on screen');
    assert.ok(ev.find((e) => e.payload.key === 'nar_plate_3').tick - closed <= 17 * 60, 'all three within 17 s of the plate');
  } finally { await game.close(); }
});

// ---- into the Windlass ---------------------------------------------------------------------------------------------
test('each phase of the Windlass begins with at least two segments of health (no attempt weaker than a respawn\'s 60); phase 2 does not open on an empty reserve', async () => {
  const game = await open(srv, { checkpoint: 'cp_bore_ante' });
  try {
    await game.run([{ steps: 30 }, { call: ['setHealth', 34] }, { call: ['setAmmo', 2, 3, 0] }, { steps: 1 }]);
    const seq = await mark(game);
    await game.run([emit('boss/phase', { phase: 'p1', from: 'parley' }), { steps: 2 }]);
    let s = await game.state();
    assert.equal(s.world.checkpoint, 'cp_boss_p1');
    assert.ok(s.player.health >= 67, `health ${s.player.health} as phase 1 begins (it was 34, one canister from dead)`);
    assert.equal((await game.page.evaluate(() => window.__dbg.ext.core.ctx().save.current.player.health)) >= 67, true, 'and that is what cp_boss_p1 holds');
    const saved = (await game.events(seq, 'checkpoint/saved')).find((e) => e.payload.id === 'cp_boss_p1');
    assert.ok(saved, 'and the checkpoint is saved after it');
    await game.run([{ call: ['setHealth', 20] }, { steps: 1 }, emit('boss/phase', { phase: 'p2', from: 'p1' }), { steps: 5 }]);
    s = await game.state();
    assert.equal(s.world.checkpoint, 'cp_boss_p2');
    assert.ok(s.player.health >= 67, `and again as phase 2 begins (${s.player.health}; she came through phase 1 at 20)`);
    assert.equal(s.player.reserve, 15, 'a tin of twelve at her feet as the pawl breaks (reserve 3 -> 15)');
    assert.ok((await game.events(seq, 'pickup/collected')).some((e) => e.payload.kind === 'pk_rounds_12'));
    // with a tin or more in reserve, nothing: phase 3 begins and no pickup comes
    const n = (await game.events(seq, 'pickup/spawned')).length;
    await game.run([emit('boss/phase', { phase: 'p3a', from: 'p2' }), { steps: 5 }]);
    assert.equal((await game.events(seq, 'pickup/spawned')).length, n);
  } finally { await game.close(); }
  // with two segments or more, and with a tin in reserve, nothing is given
  const g2 = await open(srv, { checkpoint: 'cp_bore_ante' });
  try {
    await g2.run([{ steps: 30 }, { call: ['setHealth', 70] }, { call: ['setAmmo', 6, 12, 0] }, { steps: 1 }]);
    const seq = await mark(g2);
    await g2.run([emit('boss/phase', { phase: 'p1', from: 'parley' }), { steps: 2 }, emit('boss/phase', { phase: 'p2', from: 'p1' }), { steps: 5 }]);
    const s = await g2.state();
    assert.equal(s.player.health, 70);
    assert.equal(s.player.reserve, 12);
    assert.equal((await g2.events(seq, 'pickup/spawned')).length, 0);
  } finally { await g2.close(); }
});
