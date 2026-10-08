// Boot to the title and to control on min, Low and High (ARCHITECTURE 11.4), on the runtime greybox with the core stubs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, openGame, startServer } from '../harness.mjs';
import { LAYOUT, PIECES, STUBS } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

const HOOK_METHODS = [
  'step', 'stepUntil', 'setRealtime', 'seed', 'start', 'checkpoint', 'pause', 'setOption', 'setTier', 'setKeys', 'setActions', 'tap', 'look',
  'setAim', 'aimAt', 'aimAtEntity', 'aimAtMarker', 'walkTo', 'followPath', 'navPath', 'teleport', 'teleportToMarker', 'god', 'setHealth',
  'setAmmo', 'aiEnabled', 'spawnEnemy', 'killAll', 'solvePuzzle', 'clearEncounter', 'setBossPhase', 'emit', 'state', 'player', 'enemies',
  'puzzles', 'objectives', 'perf', 'perfPeak', 'perfReset', 'perfRun', 'events', 'clearEvents', 'hash', 'probe', 'capture',
];

for (const tier of ['min', 'low', 'high']) {
  test(`boots to the title and to control on ${tier}`, async () => {
    const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier, start: false });
    try {
      const start = LAYOUT.markers.find((m) => m.id === 'player_start');
      // ---- the title: world not begun, player control off, camera at player_start, the sim running
      let s = await game.state();
      assert.equal(s.game, 'title');
      assert.deepEqual([s.player.x, s.player.y, s.player.z], start.pos);
      assert.equal(s.world.zone, 'the_lip');
      assert.equal(s.world.set, 'surface');
      assert.deepEqual(s.world.builtZones, ['the_lip', 'plenty_street', 'tally_house']);
      const hook = await game.page.evaluate((methods) => ({
        version: window.__dbg.version, ready: window.__dbg.ready, error: window.__dbg.error,
        missing: methods.filter((m) => typeof window.__dbg[m] !== 'function'), ext: typeof window.__dbg.ext,
      }), HOOK_METHODS);
      assert.deepEqual(hook, { version: 2, ready: true, error: null, missing: [], ext: 'object' });
      const perf = await game.perf();
      assert.equal(perf.tier, tier);
      assert.equal(perf.width, 960);
      assert.equal(perf.height, 540);
      assert.equal(perf.pixelRatio, 1, 'test mode: pixel ratio 1, no adaptation');
      assert.ok(perf.drawCalls > 0 && perf.triangles > 0, 'the first frame was drawn');
      assert.equal(perf.cell, '', 'no cell on the title screen');
      await game.run([{ actions: ['forward'], steps: 30 }, { actions: [], steps: 1 }]);
      s = await game.state();
      assert.equal(s.tick, 31, 'the sim runs in the title state');
      assert.deepEqual([s.player.x, s.player.z], [start.pos[0], start.pos[2]], 'no control on the title screen');
      if (tier === 'low') await game.shot('title_low');

      // ---- into the run
      const r = await game.dbg('start');
      assert.equal(r.state, 'playing');
      const events = await game.events(0);
      const names = events.map((e) => e.name);
      for (const name of ['load/progress', 'load/set', 'world/built', 'game/new_run', 'checkpoint/reached', 'checkpoint/saved', 'player/spawned'])
        assert.ok(names.includes(name), `event ${name} was emitted`);
      const states = events.filter((e) => e.name === 'game/state').map((e) => `${e.payload.from}>${e.payload.to}`);
      assert.deepEqual(states, ['boot>title', 'title>loading', 'loading>playing']);
      const saved = events.find((e) => e.name === 'checkpoint/saved');
      assert.deepEqual(saved.payload, { id: 'cp_lip_start', movement: 1, section: 1 });
      await game.run([{ aim: [0, 0], actions: ['forward'], steps: 60 }, { actions: [], steps: 1 }]);
      s = await game.state();
      assert.equal(s.game, 'playing');
      assert.ok(s.player.z < start.pos[2] - 3.5, `control: walked north, z = ${s.player.z}`);
      assert.equal(s.player.grounded, true);
      assert.equal(s.world.checkpoint, 'cp_lip_start');
      assert.equal(s.world.cell, 'cell_lip_gully');
      assert.equal((await game.perf()).tier, tier);
    } finally {
      await game.close();
    }
  });
}

test('?cp= boots straight into a run at that checkpoint, and ?autostart=1 leaves the title', async () => {
  let game = await openGame(server, { piece: PIECE, stubs: STUBS, start: false, query: { cp: 'cp_gallery_bay' } });
  try {
    const s = await game.state();
    const cp = LAYOUT.markers.find((m) => m.id === 'cp_gallery_bay');
    assert.equal(s.game, 'playing');
    assert.equal(s.world.checkpoint, 'cp_gallery_bay');
    assert.equal(s.world.set, 'underground');
    assert.deepEqual([s.player.x, s.player.y, s.player.z], cp.pos);
    assert.equal(s.player.yawDeg, cp.rotY === 180 ? 180 : cp.rotY);
  } finally { await game.close(); }
  game = await openGame(server, { piece: PIECE, stubs: STUBS, start: false, query: { autostart: 1 } });
  try {
    const s = await game.state();
    assert.equal(s.game, 'playing');
    assert.equal(s.world.checkpoint, 'cp_lip_start');
  } finally { await game.close(); }
});

test('the perf overlay shows every budget line (?perf=1)', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, query: { perf: 1 }, checkpoint: 'cp_street_clear' });
  try {
    await game.run([{ aim: [80, -4], steps: 2 }]);
    await game.page.evaluate(() => { for (let i = 0; i < 12; i++) window.__dbg.step(1, true); });
    const text = await game.page.evaluate(() => document.getElementById('perf-overlay').textContent);
    for (const word of ['tier low', 'draw calls', 'triangles', 'memory', 'cell cell_street', 'bound:', 'player', 'enemies', 'world', 'render', 'audio', 'ui', 'sim', 'update', 'heap'])
      assert.ok(text.includes(word), `the overlay shows "${word}"\n${text}`);
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.getElementById('perf-overlay')).display), 'block');
    await game.shot('overlay');
  } finally { await game.close(); }
});

test('boots and plays with NO asset files: every asset and texture synthesised from the manifest and the layout (?assets=none)', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, query: { assets: 'none' } });
  try {
    const report = await game.page.evaluate(() => window.__dbg.ext.assets.report());
    assert.equal(report.assetsFromFiles, 0);
    assert.equal(report.texturesFromFiles, 0);
    assert.ok(report.assetsSynthesised >= 37 && report.texturesSynthesised === 21, JSON.stringify(report));
    const placeholders = await game.page.evaluate(() => ['env_the_lip', 'env_plenty_street', 'enemy_bider', 'weapon_revolver'].map((id) => window.__dbg.ext.assets.isPlaceholder(id)));
    assert.deepEqual(placeholders, [true, true, true, true], 'isPlaceholder is true for synthesised assets');
    await game.dbg('god', true);
    const s = await game.run([{ followPath: 'critical', maxTicks: 6000 }, { call: ['spawnEnemy', 'bider', 6, 0, 3, 0] }, { aim: [35, -6], steps: 2 }]);
    assert.equal(s.world.cell, 'cell_lip_gate', 'walked the whole gully on the synthesised greybox');
    const perf = await game.dbg('perfRun', 2);
    // the synthesised zone carries the manifest's chunk plan: one mesh per (chunk, material)
    assert.ok(perf.drawCalls >= 8 && perf.triangles > 300, `${perf.drawCalls} calls, ${perf.triangles} triangles`);
    // the real renderer also counts the bone texture of every skinned enemy alive (16 KiB each: src/render collectStats);
    // the stub renderer counts the manifest alone
    const bones = STUBS && STUBS.includes('render') ? 0 : perf.enemiesAlive * 16384;
    assert.equal(perf.textureBytes - bones, 32789845, 'memory is accounted by the manifest, placeholder or not');
    await game.shot('greybox_no_asset_files');
  } finally { await game.close(); }
});

test('the asset store reports its sources and the R8 upload verdict', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS });
  try {
    const report = await game.page.evaluate(() => window.__dbg.ext.assets.report());
    console.log(`assets: ${report.assetsFromFiles} from files, ${report.assetsSynthesised} synthesised; textures: ${report.texturesFromFiles} from files, ${report.texturesSynthesised} synthesised; R8 upload: ${report.r8} (sample ${report.sample.join(',')}, gl error ${report.glError})`);
    assert.ok(['r8', 'rgba'].includes(report.r8), 'the R8 path was measured');
    assert.equal(report.assetsFromFiles + report.assetsSynthesised, 65, 'every asset of the three sets is decoded in test mode');
    assert.equal(report.texturesFromFiles + report.texturesSynthesised, 21);
    // the seam with the pipeline: once `node tools/build-assets.mjs --placeholders` has run, nothing is synthesised
    const shipped = fs.existsSync(path.join(ROOT, 'public/assets/env/env_the_lip.glb'));
    if (shipped) {
      assert.equal(report.assetsSynthesised, 0, 'every asset comes from its file in public/assets');
      assert.equal(report.texturesSynthesised, 0, 'every texture comes from its file in public/assets');
    } else console.log('assets: public/assets is empty, the store synthesised everything (run npm run assets:placeholders)');
    // an R8 fallback would cost 4x on eight textures: the store counts it
    // release pass p0: + tx_gun_detail (R8, 699 051), tx_hands (RGBA8, 1 398 101), tx_hands_detail (R8, 349 525): R14
    assert.equal(report.activeTextureBytes, report.r8 === 'r8' ? 32789845 : 32789845 + 3 * (699051 * 4 + 349525 * 2 + 21845 + 262144));
  } finally { await game.close(); }
});
