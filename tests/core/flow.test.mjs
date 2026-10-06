// The run flow core owns (ARCHITECTURE 3.5, flow.ts): ui/action, the checkpoint commit, death and the restore.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, startServer } from '../harness.mjs';
import { CHECKPOINTS, LAYOUT, PIECES, STUBS } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });
const marker = (id) => LAYOUT.markers.find((m) => m.id === id);

test('death: dead for 1.8 s, then restored at the checkpoint with control back within 3.0 s of the fatal tick', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, checkpoint: 'cp_street_clear' });
  try {
    const cp = marker('cp_street_clear');
    await game.run([{ aim: [90, 0], actions: ['forward'], steps: 120 }, { actions: [], steps: 1 }]);
    let s = await game.state();
    assert.ok(Math.hypot(s.player.x - cp.pos[0], s.player.z - cp.pos[2]) > 5, 'she walked away from the mark');
    const fatal = (await game.run([{ call: ['setHealth', 0] }])).tick;
    s = await game.state();
    assert.equal(s.game, 'dead');
    assert.equal(s.player.alive, false);
    // 0.6 s fade + 1.2 s: still dead just before, playing again just after
    s = await game.run([{ steps: 107 }]);
    assert.equal(s.game, 'dead', 'still dead at 1.78 s');
    s = await game.run([{ steps: 1 }, { steps: 1 }]);
    assert.equal(s.game, 'playing');
    assert.ok(s.tick - fatal <= 180, `control is back ${((s.tick - fatal) / 60).toFixed(2)} s after the fatal tick`);
    assert.equal(s.player.alive, true);
    assert.ok(s.player.health >= 60);
    assert.deepEqual([s.player.x, s.player.y, s.player.z], cp.pos, 'respawned on the checkpoint marker');
    assert.equal(s.player.yawDeg, cp.rotY);
    assert.equal(s.stats.deaths, 1);
    const names = (await game.events(0)).map((e) => e.name);
    assert.ok(names.indexOf('player/died') < names.lastIndexOf('player/respawned'));
    const states = (await game.events(0, 'game/state')).map((e) => `${e.payload.from}>${e.payload.to}`);
    assert.deepEqual(states.slice(-2), ['playing>dead', 'dead>playing'], 'the set did not change: no loading state');
    // control really is back
    await game.run([{ aim: [90, 0], actions: ['forward'], steps: 30 }, { actions: [], steps: 1 }]);
    assert.ok((await game.state()).player.x < cp.pos[0] - 1.5);
    console.log(`death: control back ${((s.tick - fatal) / 60).toFixed(2)} s after the fatal tick (limit 3.0 s)`);
  } finally { await game.close(); }
});

test('checkpoint/reached is committed by core: SaveData, checkpoint/saved with movement and section', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS });
  try {
    await game.dbg('god', true);
    await game.run([{ call: ['solvePuzzle', 'seven_jugs'] }, { followPath: 'cp_lip_gate', maxTicks: 6000 }, { steps: 2 }]);
    let saved = (await game.events(0, 'checkpoint/saved')).map((e) => e.payload);
    assert.deepEqual(saved, [{ id: 'cp_lip_start', movement: 1, section: 1 }, { id: 'cp_lip_gate', movement: 1, section: 2 }]);
    // movement = 1-based index of the checkpoint's zone; section = its ordinal among that zone's checkpoints
    const want = {};
    for (const id of CHECKPOINTS) {
      const m = marker(id);
      want[id] = { movement: LAYOUT.zones.findIndex((z) => z.id === m.zone) + 1, section: LAYOUT.markers.filter((x) => x.type === 'checkpoint' && x.zone === m.zone).findIndex((x) => x.id === id) + 1 };
    }
    for (const id of ['cp_yard_clear', 'cp_tally_hatch', 'cp_gallery_baffle', 'cp_boss_p3', 'cp_rim']) {
      await game.dbg('checkpoint', id);
      const last = (await game.events(0, 'checkpoint/saved')).at(-1).payload;
      assert.deepEqual(last, { id, ...want[id] });
    }
    assert.deepEqual(want.cp_boss_p3, { movement: 6, section: 4 });
    assert.equal((await game.state()).world.checkpoint, 'cp_rim');
  } finally { await game.close(); }
});

test('ui/action: restart_checkpoint from pause, resume, quit_to_title, play again', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, checkpoint: 'cp_yard_clear' });
  try {
    const cp = marker('cp_yard_clear');
    await game.run([{ aim: [0, 0], actions: ['forward'], steps: 40 }, { actions: [], steps: 1 }]);
    // pause: the sim stops, input does nothing
    await game.dbg('pause', true);
    let s = await game.run([{ actions: ['forward'], steps: 30 }, { actions: [], steps: 0 }]);
    assert.equal(s.game, 'paused');
    const frozen = [s.player.x, s.player.z];
    // resume through the UI's one request path
    s = await game.run([{ call: ['emit', 'ui/action', { action: 'resume' }] }, { steps: 1 }]);
    assert.equal(s.game, 'playing');
    assert.deepEqual([s.player.x, s.player.z], frozen);
    // restart from the pause menu: loading, the restore, playing
    await game.dbg('pause', true);
    s = await game.run([{ call: ['emit', 'ui/action', { action: 'restart_checkpoint' }] }, { steps: 1 }]);
    assert.equal(s.game, 'playing');
    assert.deepEqual([s.player.x, s.player.y, s.player.z], cp.pos);
    let states = (await game.events(0, 'game/state')).map((e) => e.payload.to);
    assert.deepEqual(states.slice(-3), ['paused', 'loading', 'playing']);
    // the 'pause' action pauses by itself (handlePause)
    s = await game.run([{ tap: 'pause', steps: 2 }]);
    assert.equal(s.game, 'paused');
    // quit to the title: enemies cleared, control off
    await game.dbg('spawnEnemy', 'bider', cp.pos[0], cp.pos[1], cp.pos[2] + 3, 0);
    s = await game.run([{ call: ['emit', 'ui/action', { action: 'quit_to_title' }] }, { actions: ['forward'], steps: 20 }, { actions: [], steps: 0 }]);
    assert.equal(s.game, 'title');
    assert.equal(s.enemies.length, 0);
    // the title is the overhang doorway shot again (not the place she quit in), and she cannot walk out of it
    const start = marker('player_start');
    assert.deepEqual([s.player.x, s.player.y, s.player.z], start.pos, 'the title stands her on player_start, with no control');
    // play: a new run from the start, the save cleared
    s = await game.run([{ call: ['emit', 'ui/action', { action: 'play' }] }, { steps: 1 }]);
    assert.equal(s.game, 'playing');
    assert.equal(s.world.checkpoint, 'cp_lip_start');
    assert.equal(s.world.doors.door_jug_gate, 'closed', 'a new run: the world is reset');
    assert.deepEqual([s.player.x, s.player.y, s.player.z], marker('player_start').pos);
    assert.ok((await game.events(0, 'game/new_run')).length >= 2);
    // states outside the table are refused
    assert.equal(await game.page.evaluate(() => { window.__dbg.pause(false); return window.__dbg.state().game; }), 'playing');
  } finally { await game.close(); }
});

test('a new run gives a fresh player: after quit + play, after dying on the title, and after the ending', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, checkpoint: 'cp_street_clear' });
  try {
    const fresh = (await game.state()).player;
    assert.equal(fresh.health, 100);
    assert.equal(fresh.chambered, 6);
    const newRun = async (label) => {
      const s = await game.run([{ call: ['emit', 'ui/action', { action: label === 'again' ? 'again' : 'play' }] }, { steps: 1 }]);
      assert.equal(s.game, 'playing', label);
      assert.equal(s.world.checkpoint, 'cp_lip_start', label);
      assert.equal(s.player.alive, true, label);
      assert.equal(s.player.health, fresh.health, `${label}: full health`);
      assert.equal(s.player.chambered, fresh.chambered, `${label}: a full cylinder`);
      assert.equal(s.player.reserve, fresh.reserve, `${label}: the starting reserve`);
      assert.equal(s.player.lineRounds, fresh.lineRounds, `${label}: the starting line rounds`);
      assert.equal(s.player.seventh, fresh.seventh, `${label}: the seventh round as at the start`);
      // the save committed at cp_lip_start holds the fresh state, not the old run's
      const saved = await game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx().save.current; return { cp: c.checkpoint, ...c.player }; });
      assert.equal(saved.cp, 'cp_lip_start', label);
      assert.equal(saved.health, fresh.health, `${label}: saved health`);
      assert.equal(saved.reserve, fresh.reserve, `${label}: saved reserve`);
      assert.equal(saved.seventh, fresh.seventh, `${label}: saved seventh`);
      // and she can walk
      const before = [s.player.x, s.player.z];
      const after = await game.run([{ actions: ['forward'], steps: 60 }, { actions: [], steps: 1 }]);
      assert.ok(Math.hypot(after.player.x - before[0], after.player.z - before[1]) > 2, `${label}: 60 ticks of forward moved her`);
    };
    // 1. damage, spent ammunition, a changed seventh round; quit; play
    await game.run([{ call: ['setHealth', 40] }, { call: ['setAmmo', 2, 3, 1] }, { steps: 2 }]);
    await game.page.evaluate(() => window.__dbg.ext.core.setSeventh('violet'));
    await game.dbg('pause', true);
    let s = await game.run([{ call: ['emit', 'ui/action', { action: 'quit_to_title' }] }, { steps: 1 }]);
    assert.equal(s.game, 'title');
    assert.equal(s.player.health, 40, 'the old run is still on her at the title');
    await newRun('play after quit');
    // 2. dead when the run starts
    await game.dbg('pause', true);
    s = await game.run([{ call: ['emit', 'ui/action', { action: 'quit_to_title' }] }, { call: ['setHealth', 0] }, { steps: 1 }]);
    assert.equal(s.game, 'title');
    assert.equal(s.player.alive, false);
    await newRun('play while dead');
    // 3. 'again' from the ending
    await game.run([{ call: ['setHealth', 25] }, { call: ['setAmmo', 1, 0, 2] }, { steps: 1 }]);
    const ended = await game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx(); c.state.request('ending', 'test'); return c.state.current; });
    assert.equal(ended, 'ending');
    await newRun('again');
    // one checkpoint/saved per run start, never two
    const saved = (await game.events(0, 'checkpoint/saved')).map((e) => e.payload.id);
    assert.equal(saved.filter((id) => id === 'cp_lip_start').length, 4, 'boot + three new runs');
  } finally { await game.close(); }
});

test('continue resumes the stored save (?persist=1), through beginRun and the restore trio', async () => {
  const query = { persist: 1 };
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, query, checkpoint: 'cp_hall_gantry' });
  try {
    // the 35 HP save is committed THROUGH PLAY (the encounter's checkpoint commits when it is cleared): a warp
    // (`checkpoint`) is a debug jump whose save the real world synthesises fresh, at full health (code-world 4.9)
    await game.run([{ call: ['setHealth', 35] }, { call: ['clearEncounter', 'enc_matador'] }, { until: { event: 'checkpoint/saved', where: { id: 'cp_hall_clear' } }, maxSteps: 900 }]);
    const stored = await game.page.evaluate(() => JSON.parse(localStorage.getItem('keepseven.save.v1')));
    assert.equal(stored.version, 1);
    assert.equal(stored.checkpoint, 'cp_hall_clear');
    assert.ok(stored.world.encountersCleared.includes('enc_matador'));
    assert.equal(stored.world.doors.door_lift_cage, 'open');
    assert.equal(stored.player.health, 35);
    // load the page again: the title, with the stored save waiting
    const page2 = game.page;
    await page2.goto(server.url + '?test=1&persist=1&seed=1' + (STUBS ? '&stubs=' + STUBS.join(',') : ''));
    await page2.waitForFunction(() => window.__dbg && window.__dbg.ready);
    assert.equal(await page2.evaluate(() => window.__dbg.state().game), 'title');
    const s = await page2.evaluate(async () => {
      const dbg = window.__dbg;
      dbg.emit('ui/action', { action: 'continue' });
      for (let i = 0; i < 50 && dbg.state().game !== 'playing'; i++) await new Promise((r) => setTimeout(r, 20));
      dbg.step(1, false);
      return dbg.state();
    });
    assert.equal(s.game, 'playing');
    assert.equal(s.world.checkpoint, 'cp_hall_clear');
    assert.equal(s.world.set, 'underground');
    assert.equal(s.world.doors.door_lift_cage, 'open');
    assert.ok(s.encounters.enc_matador.state === 'cleared');
    assert.equal(s.player.health, 60, 'the respawn floor: at least 60 HP');
    assert.deepEqual([s.player.x, s.player.y, s.player.z], marker('cp_hall_clear').pos);
    await page2.evaluate(() => localStorage.clear());
  } finally { await game.close(); }
});
