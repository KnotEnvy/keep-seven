// Determinism (ARCHITECTURE 11.2): two loads, one script -> equal hash() and equal PNG; equal hash across tiers.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, comparePng, openGame, startServer } from '../harness.mjs';
import { GATE_OPENERS, PIECES, STUBS } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

// input by keys, actions, look and taps; a walk by input through a gate; an enemy shot; a set swap; a death and respawn
const SCRIPT = [
  { call: ['god', false] },
  { keys: ['KeyW'], look: [240, -30], steps: 90 },
  { keys: ['KeyW', 'KeyD', 'ShiftLeft'], look: [-500, 60], steps: 75 },
  { keys: [], actions: ['back'], steps: 20 },
  { actions: [], steps: 1 },
  { followPath: 'critical', maxTicks: 900 },
  { call: ['spawnEnemy', 'bider', 14, 14, 99, 0] },
  { aimAtEntity: ['bider#1', 'body', 0.05], tap: 'fire', steps: 3 },
  { followPath: 'critical', maxTicks: 3000 },
  ...GATE_OPENERS.door_jug_gate.map((c) => ({ call: c })),
  { followPath: 'critical', maxTicks: 600 },
  { call: ['checkpoint', 'cp_tally_hatch'] },
  { followPath: 'cp_gallery_bay', maxTicks: 1200 },
  { look: [300, 40], steps: 10 },
  { call: ['setHealth', 0] },
  { steps: 110 },
  { steps: 10 },
  { walkTo: [-84, -15], maxTicks: 120 },
];

async function runOnce(tier, name) {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier, seed: 7 });
  try {
    const state = await game.run(SCRIPT);
    const hash = await game.dbg('hash');
    const [file] = await game.shotSeries([{ name }]);
    return { hash, state, file };
  } finally { await game.close(); }
}

test('two page loads replaying one script: identical hash, identical state, identical PNG', async () => {
  const a = await runOnce('low', 'determinism_a');
  const b = await runOnce('low', 'determinism_b');
  assert.equal(a.state.game, 'playing', 'the script ends in play (it died and respawned on the way)');
  assert.equal(a.state.world.set, 'underground', 'the script crossed the seam');
  assert.ok(a.state.stats.deaths >= 1);
  assert.equal(a.hash, b.hash);
  const strip = (s) => { const c = structuredClone(s); delete c.systems.render; return c; };
  assert.deepEqual(strip(a.state), strip(b.state));
  assert.equal(comparePng(a.file, b.file, { threshold: 0 }), 0, 'screenshots differ');
  assert.ok(fs.statSync(a.file).size > 2000, 'the screenshot is not blank');
  fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'determinism.json'), JSON.stringify({ hash: a.hash, tick: a.state.tick, player: a.state.player }, null, 1));
});

test('the hash is the same on min, Low and High: the render tier does not leak into the simulation', async () => {
  const low = await runOnce('low', 'determinism_low');
  const min = await runOnce('min', 'determinism_min');
  const high = await runOnce('high', 'determinism_high');
  assert.equal(min.hash, low.hash);
  assert.equal(high.hash, low.hash);
});

// A death in the middle of a script: the restore is a promise chain, so it must land between the same two ticks
// however the caller cuts the script into calls (ARCHITECTURE 11.2: same script, same hash).
test('a death and respawn give one hash in three batchings, and until({ state: playing }) is met within 110 ticks', async () => {
  const batch = async (mode) => {
    const game = await openGame(server, { piece: PIECE, stubs: STUBS, checkpoint: 'cp_street_clear' });
    try {
      await game.dbg('setKeys', ['KeyW']);
      await game.dbg('setHealth', 0);
      if (mode === 'one') await game.step(200);
      else if (mode === 'tens') for (let i = 0; i < 20; i++) await game.step(10);
      else if (mode === 'ones') for (let i = 0; i < 200; i++) await game.step(1);
      else await game.run([{ steps: 107 }, { steps: 1 }, { steps: 50 }, { steps: 42 }]);
      const s = await game.state();
      return { hash: await game.dbg('hash'), tick: s.tick, game: s.game, x: s.player.x, z: s.player.z, deaths: s.stats.deaths };
    } finally { await game.close(); }
  };
  const one = await batch('one');
  assert.equal(one.game, 'playing');
  assert.equal(one.deaths, 1);
  for (const mode of ['tens', 'ones', 'script']) assert.deepEqual(await batch(mode), one, `batched as '${mode}'`);

  const game = await openGame(server, { piece: PIECE, stubs: STUBS, checkpoint: 'cp_street_clear' });
  try {
    // the harness: across the job
    await game.dbg('setHealth', 0);
    const u = await game.until({ state: 'playing' }, 400);
    assert.deepEqual([u.met, u.state], [true, 'playing']);
    assert.ok(u.steps >= 100 && u.steps <= 110, `respawned after ${u.steps} ticks`);
    // the raw synchronous hook inside one evaluate: it stops at the job instead of burning its budget while dead
    const raw = await game.page.evaluate(() => {
      const dbg = window.__dbg;
      dbg.setHealth(0);
      const r = dbg.stepUntil({ state: 'playing' }, 400);
      const stopped = { met: r.met, steps: r.steps, busy: dbg.ext.core.busy(), state: dbg.state().game };
      const s = dbg.step(50, false);
      return { stopped, ranWhileBusy: dbg.ext.core.ran(), tickAfter: s.tick, tickBefore: r.tick };
    });
    assert.deepEqual(raw.stopped, { met: false, steps: u.steps, busy: true, state: 'dead' });
    assert.equal(raw.ranWhileBusy, 0, 'no tick runs while the restore is pending');
    assert.equal(raw.tickAfter, raw.tickBefore);
    const after = await game.until({ state: 'playing' }, 5);
    assert.equal(after.met, true);
    // a walk that meets a death stops; the next one walks on from the checkpoint
    await game.dbg('god', false);
    const w = await game.page.evaluate(() => { const dbg = window.__dbg; dbg.setHealth(0); return dbg.walkTo(-60, -2, { maxTicks: 400 }); });
    assert.equal(w.reason, 'dead');
    const s = await game.run([{ until: { state: 'playing' }, maxSteps: 200 }, { walkTo: [-62, -2], maxTicks: 600 }]);
    assert.equal(s.game, 'playing');
  } finally { await game.close(); }
});

test('a different seed changes the seeded aim error but not an unseeded walk', async () => {
  const run = async (seed) => {
    const game = await openGame(server, { piece: PIECE, stubs: STUBS, seed });
    try {
      await game.run([{ call: ['spawnEnemy', 'bider', 14, 14, 99, 0] }, { aimAtEntity: ['bider#1', 'body', 0.4], steps: 1 }]);
      const aim = (await game.state()).player.yawDeg;
      await game.run([{ followPath: 'critical', maxTicks: 300 }]);
      const p = (await game.state()).player;
      return { aim, at: [p.x, p.y, p.z], rng: (await game.state()).rngState };
    } finally { await game.close(); }
  };
  const a = await run(1), b = await run(2);
  assert.notEqual(a.aim, b.aim);
  assert.notEqual(a.rng, b.rng);
  assert.deepEqual(a.at, b.at);
});
