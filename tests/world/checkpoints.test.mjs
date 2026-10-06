// Checkpoints and save (code-world 4.9; GDD 18): every checkpoint reachable by warpToCheckpoint with a consistent world,
// a death at each restored on the marker within 3.0 s when the set does not change, the encounter in progress reset with
// its tallies discarded, the save's JSON round trip, a stored save resumed.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINTS } from '../core/route.mjs';
import { LAYOUT, mark, marker, open, server, shootScript } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const SET_OF = Object.fromEntries(LAYOUT.zones.map((z) => [z.id, z.set]));

test('every checkpoint by warp: a consistent world (set, doors, puzzles, objective); a death there restored on the marker within 3 s', async () => {
  const game = await open(srv);
  try {
    const rows = [];
    for (const cp of CHECKPOINTS) {
      const m = marker(cp);
      let s = await game.run([{ call: ['checkpoint', cp] }, { steps: 2 }]);
      assert.equal(s.world.checkpoint, cp);
      assert.equal(s.world.set, SET_OF[m.zone], `${cp}: the set`);
      assert.equal(s.world.zone, m.zone, `${cp}: the zone`);
      assert.ok(Math.hypot(s.player.x - m.pos[0], s.player.z - m.pos[2]) < 0.6, `${cp}: on the marker`);
      const i = CHECKPOINTS.indexOf(cp);
      assert.equal(s.puzzles.seven_jugs.solved, i >= 1, `${cp}: seven_jugs`);
      assert.equal(s.puzzles.daylight.solved, i >= 5, `${cp}: daylight`);
      assert.equal(s.puzzles.proving_line.solved, i >= 7, `${cp}: proving_line`);
      assert.equal(s.puzzles.the_asking.solved, i >= 12, `${cp}: the_asking`);
      if (SET_OF[m.zone] === 'surface') assert.equal(s.world.doors.door_jug_gate, i >= 1 ? 'open' : 'closed');
      if (cp === 'cp_tally_hatch') assert.ok(s.world.builtZones.includes('the_gallery') && s.world.doors.ia_hatch === 'open');
      if (cp === 'cp_hall_clear') assert.equal(s.world.doors.door_lift_cage, 'open');
      assert.ok(s.world.objective.startsWith('obj_'), `${cp}: an objective (${s.world.objective})`);
      assert.equal(s.player.health, 100);
      assert.equal(s.player.reserve, 24);
      assert.equal(s.player.lineRounds, i >= 7 ? 1 : 0);
      assert.equal(s.player.seventh, i >= 15 ? 'spent' : 'sealed');
      // a death here: restored on the marker, control back within 3.0 s of the fatal tick (no set change)
      const fatal = (await game.run([{ call: ['god', false] }, { call: ['setHealth', 0] }])).tick;
      s = await game.run([{ until: { state: 'playing' }, maxSteps: 400 }, { steps: 1 }]);
      assert.equal(s.game, 'playing', `${cp}: back in play`);
      assert.ok(s.tick - fatal <= 180, `${cp}: ${(s.tick - fatal) / 60} s`);
      assert.equal(s.world.checkpoint, cp);
      assert.ok(Math.hypot(s.player.x - m.pos[0], s.player.z - m.pos[2]) < 0.6, `${cp}: respawned on the marker`);
      rows.push(`${cp} ${s.world.set} ${s.world.objective} ${((s.tick - fatal) / 60).toFixed(2)} s`);
    }
    console.log(rows.join('\n'));
  } finally { await game.close(); }
});

test('the encounter in progress resets on a death, its freed and felled discarded; captureSave survives a JSON round trip', async () => {
  const game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    await game.run([{ call: ['teleport', -3, 0, 0, 90, 0] }, { steps: 200 }]);
    const a = (await game.state()).enemies.find((e) => e.encounter === 'enc_street' && e.alive);
    let s = await game.run([...shootScript(a.id), { steps: 2 }]);
    assert.equal(s.stats.felled, 1);
    const seq = await mark(game);
    s = await game.run([{ call: ['god', false] }, { call: ['setHealth', 0] }, { until: { state: 'playing' }, maxSteps: 400 }, { steps: 2 }]);
    assert.ok((await game.events(seq, 'encounter/reset')).some((e) => e.payload.id === 'enc_street'));
    assert.equal(s.encounters.enc_street.state, 'idle');
    assert.equal(s.stats.felled, 0, 'the tally of the fight in progress is gone');
    assert.equal(s.stats.deaths, 1);
    // the kneeler is back, dormant at the trough
    s = await game.run([{ steps: 2 }]);
    assert.ok(s.enemies.some((e) => e.encounter === 'enc_street'));
    // the round trip: capture, JSON, apply, capture
    const same = await game.page.evaluate(() => {
      const c = window.__dbg.ext.core.ctx();
      const a1 = JSON.stringify(c.world.captureSave());
      c.world.applySave(JSON.parse(a1));
      const a2 = JSON.stringify(c.world.captureSave());
      return [a1 === a2, a1.length];
    });
    assert.deepEqual(same[0], true);
  } finally { await game.close(); }
});

test('a stored save resumes (continue): the set, the doors, the puzzles and the checkpoint come back', async () => {
  const game = await open(srv, { checkpoint: 'cp_gallery_baffle', query: { persist: 1 } });
  try {
    const stored = await game.page.evaluate(() => JSON.parse(localStorage.getItem('keepseven.save.v1')));
    assert.equal(stored.checkpoint, 'cp_gallery_baffle');
    assert.equal(stored.world.puzzles.proving_line.solved, true);
    await game.page.goto(srv.url + '?test=1&persist=1&seed=1&stubs=player,enemies,render,audio,ui');
    await game.page.waitForFunction(() => window.__dbg && window.__dbg.ready);
    const s = await game.page.evaluate(async () => {
      const dbg = window.__dbg;
      dbg.emit('ui/action', { action: 'continue' });
      for (let i = 0; i < 100 && dbg.state().game !== 'playing'; i++) await new Promise((r) => setTimeout(r, 20));
      dbg.step(2, false);
      return dbg.state();
    });
    assert.equal(s.game, 'playing');
    assert.equal(s.world.checkpoint, 'cp_gallery_baffle');
    assert.equal(s.world.set, 'underground');
    assert.equal(s.puzzles.proving_line.solved, true);
    assert.ok(s.world.doors.ia_baffle === 'open');
    await game.page.evaluate(() => localStorage.clear());
  } finally { await game.close(); }
});
