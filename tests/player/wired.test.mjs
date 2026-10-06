// src/player in its slot of the GAME (the index page), beside five core stubs (the harness default for a
// 'code-player' piece: ?stubs=enemies,world,render,audio,ui). The contract surface the others will use.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, openGame } from '../harness.mjs';
import { PIECE, eventsSince, ext, lastSeq, server } from './common.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });
const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const marker = (id) => LAYOUT.markers.find((m) => m.id === id);

test('in the game: the real system is in the slot, a run starts fresh, she walks the lip by input, one shot fells the stub Bider', async () => {
  const game = await openGame(srv, { piece: PIECE, tier: 'low' });
  try {
    assert.deepEqual(await ext(game, 'core', 'stubs'), ['enemies', 'world', 'render', 'audio', 'ui'], 'the player slot holds src/player');
    let s = await game.state();
    assert.equal(s.systems.player.stub, undefined, 'not the dummy player');
    assert.deepEqual([s.player.health, s.player.cylinder, s.player.reserve, s.player.lineRounds, s.player.seventh, s.player.alive],
      [100, ['lead', 'lead', 'lead', 'lead', 'lead', 'lead'], 24, 0, 'sealed', true], 'the state a run begins with');
    assert.deepEqual([s.player.x, s.player.y, s.player.z], marker('player_start').pos);
    assert.deepEqual((await game.events(0, 'player/spawned')).map((e) => e.payload.checkpoint), ['cp_lip_start']);
    assert.equal((await ext(game, 'player', 'viewModel')).attached, true, 'the revolver hangs in the view-model group');
    // the save the run began with is the fresh state
    const saved = await game.page.evaluate(() => window.__dbg.ext.core.ctx().save.current.player);
    assert.deepEqual(saved, { health: 100, cylinder: ['lead', 'lead', 'lead', 'lead', 'lead', 'lead'], reserve: 24, lineRounds: 0, seventh: 'sealed' });
    // by input along the critical path to the first gate
    const walked = await game.followPath('critical', { maxTicks: 2400 });
    assert.equal(walked.reason, 'gate', `the walk ended '${walked.reason}' at ${walked.node}`);
    s = await game.state();
    assert.ok(s.player.grounded && s.world.zone === 'the_lip');
    assert.ok((await game.events(0, 'player/footstep')).length > 10, 'footfalls on the way');
    // a stub Bider 8 m ahead: one lead round
    const id = await game.dbg('spawnEnemy', 'bider', s.player.x + 6, s.player.y, s.player.z, 0);
    const seq = await lastSeq(game);
    await game.run([{ steps: 2 }, { aimAtEntity: [id, 'body'], steps: 1 }, { tap: 'fire', steps: 2 }]);
    const names = (await eventsSince(game, seq)).map((e) => e.name).filter((n) => ['enemy/felled', 'weapon/fired', 'combat/hit', 'weapon/ammo'].includes(n));
    assert.deepEqual(names, ['enemy/felled', 'weapon/fired', 'combat/hit', 'weapon/ammo'], 'the receiver ran inside the shot, before weapon/fired and combat/hit');
    const hit = (await eventsSince(game, seq, 'combat/hit'))[0].payload;
    assert.deepEqual([hit.outcome, hit.entityId, hit.damage], ['kill', id, 100]);
    s = await game.state();
    assert.deepEqual([s.stats.roundsFired, s.stats.felled, s.player.chambered], [1, 1, 5]);
    assert.deepEqual(s.systems.audio.recent.slice(-2).map((x) => x.split('@')[0]), ['weapon/fired:lead_round', 'combat/hit:kill'], 'the audio stub heard both');
  } finally { await game.close(); }
});

test('in the game: death and respawn apply the floors; a new run resets her; the title has no control', async () => {
  const game = await openGame(srv, { piece: PIECE, tier: 'low', checkpoint: 'cp_street_clear' });
  try {
    await ext(game, 'core', 'setSeventh', 'band_broken');
    await game.run([{ call: ['setAmmo', 2, 3, 1] }, { call: ['setHealth', 30] }, { tap: 'reload', steps: 5 }]);
    await game.dbg('clearEncounter', 'enc_yard');           // commits cp_yard_clear with that state
    let saved = await game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx().save.current; return { cp: c.checkpoint, ...c.player }; });
    assert.deepEqual([saved.cp, saved.reserve, saved.lineRounds, saved.seventh], ['cp_yard_clear', 3, 1, 'band_broken']);
    assert.ok(saved.health >= 30 && saved.health <= 34);
    const fatal = (await game.run([{ call: ['setHealth', 0] }])).tick;
    let s = await game.state();
    assert.deepEqual([s.game, s.player.alive], ['dead', false]);
    const back = await game.until({ state: 'playing' }, 300);
    assert.ok(back.met && (back.tick - fatal) / 60 <= 3.0, `control back ${((back.tick - fatal) / 60).toFixed(2)} s after the fatal tick`);
    s = await game.state();
    assert.deepEqual([s.player.alive, s.player.health, s.player.chambered, s.player.reserve, s.player.lineRounds, s.player.seventh, s.player.phase],
      [true, 60, 6, 18, 1, 'band_broken', 'ready'], 'max(saved, 60) HP, a full cylinder, max(saved, 18) reserve, the saved line rounds and seventh');
    const cp = marker('cp_yard_clear');
    assert.ok(Math.hypot(s.player.x - cp.pos[0], s.player.z - cp.pos[2]) < 0.5, 'at the checkpoint');
    const moved = await game.run([{ actions: ['forward'], steps: 40 }, { actions: [], steps: 1 }]);
    assert.ok(Math.hypot(moved.player.x - s.player.x, moved.player.z - s.player.z) > 2, 'and she walks');
    // quit to the title: no control there; play: everything fresh
    s = await game.run([{ call: ['pause', true] }, { call: ['emit', 'ui/action', { action: 'quit_to_title' }] }, { actions: ['forward'], tap: 'fire', steps: 20 }, { actions: [], steps: 1 }]);
    assert.equal(s.game, 'title');
    // the title is the overhang shot again (core's titleShot, INTEGRATION_REPORT C.2 row 10): she stands on player_start, and held
    // keys do not move her from it (docs/requests/polish-r2-fixer.md, code-player 2)
    const ps = marker('player_start');
    assert.ok(Math.hypot(s.player.x - ps.pos[0], s.player.z - ps.pos[2]) < 0.6, `no walking on the title: she stands on player_start (${s.player.x.toFixed(2)}, ${s.player.z.toFixed(2)})`);
    assert.equal(s.stats.roundsFired, 0, 'no shot on the title');
    s = await game.run([{ call: ['emit', 'ui/action', { action: 'play' }] }, { steps: 1 }]);
    assert.deepEqual([s.game, s.player.health, s.player.chambered, s.player.reserve, s.player.lineRounds, s.player.seventh], ['playing', 100, 6, 24, 0, 'sealed']);
    assert.equal(s.player.phase, 'drawing', 'the draw clip on spawn');
    saved = await game.page.evaluate(() => window.__dbg.ext.core.ctx().save.current.player);
    assert.deepEqual([saved.health, saved.reserve, saved.seventh], [100, 24, 'sealed'], 'the first save of the new run holds the fresh state');
  } finally { await game.close(); }
});

test('in the game: on the real proving marks of the bore the kept round loads, is legal down the bore whatever the kerb, and is spent; a ride takes control and gives it back', async () => {
  const game = await openGame(srv, { piece: PIECE, tier: 'low', checkpoint: 'cp_boss_p3' });
  try {
    const bore = marker('bore_opening').params.volume;
    await game.dbg('god', true);
    await game.dbg('emit', 'boss/charge_required', {});
    assert.equal((await game.state()).player.seventh, 'pulse');
    for (const n of [1, 4]) {
      const m = marker('ia_proving_mark_' + n);
      const context = { mark: m.id, markX: m.pos[0], markY: m.pos[1], markZ: m.pos[2], leaveRadius: m.params.leaveRadius, boreX: bore.axis[0], boreZ: bore.axis[2], boreTopY: bore.top, boreBottomY: bore.bottom, boreRadius: bore.radius };
      await game.dbg('teleportToMarker', m.id);
      await game.page.evaluate((c) => window.__dbg.ext.core.ctx().player.setKeptContext(c), context);
      await game.run([{ steps: 2 }, { tap: 'kept', steps: 109 }]);
      let s = await game.state();
      assert.deepEqual([s.player.seventh, s.player.grounded], ['chambered', true], `${m.id}: chambered on the real mark`);
      // straight at the axis, 25 degrees down: the kerb is in the way of a collision ray, not of this test
      await game.run([{ aimAt: [bore.axis[0], m.pos[1] + 1.65 - Math.tan(25 * Math.PI / 180) * 4.9, bore.axis[2]], steps: 2 }]);
      const probe = await game.dbg('probe');
      assert.equal((await ext(game, 'core', 'playerExtra')).keptAimLegal, true, `${m.id}: legal (a lead ray from here would hit ${probe.hit ? probe.surface + ' at ' + probe.distance.toFixed(1) + ' m' : 'nothing'})`);
      if (n === 1) {
        // walk away from the mark: unloaded, band broken, never lost
        await game.page.evaluate(() => window.__dbg.ext.core.ctx().player.setKeptContext(null));
        await game.dbg('teleport', m.pos[0], m.pos[1], m.pos[2] - 2.6, 0, 0);
        await game.step(22);
        s = await game.state();
        assert.equal(s.player.seventh, 'band_broken');
      } else {
        const seq = await lastSeq(game);
        s = await game.run([{ tap: 'fire', steps: 2 }]);
        assert.deepEqual((await eventsSince(game, seq, 'weapon/kept')).map((e) => [e.payload.stage, e.payload.mark]), [['fired', m.id]]);
        assert.equal(s.player.seventh, 'spent');
      }
    }
    // a ride: the world takes movement and the gun, not the look; the draw clip when it gives them back
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().player.setControl(false, 'ride'));
    let s = await game.run([{ steps: 80 }, { actions: ['forward'], tap: 'fire', look: [40, 0], steps: 10 }]);
    const at = [s.player.x, s.player.z];
    assert.equal((await game.events(0, 'weapon/fired')).length, 1, 'no shot during the ride');
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().player.setControl(true, 'ride_over'));
    s = await game.run([{ steps: 1 }]);
    assert.equal(s.player.phase, 'drawing');
    s = await game.run([{ aim: [180, 0], steps: 40 }, { actions: [], steps: 1 }]);          // mark 4 is on the +Z side: away from the kerb
    assert.ok(Math.hypot(s.player.x - at[0], s.player.z - at[1]) > 1, 'she walks again');
  } finally { await game.close(); }
});
