// Budget and determinism (work order 6, last box): the bore in phase 2 with 3 adds, 8 stakes in flight, 18 stuck and
// 2 rings: fixedUpdate + update of src/enemies <= 1.0 ms median per frame; <= 4 lineOfSight rays per frame;
// allocation <= 6 KB per tick (measureAlloc, 3000 ticks of warm-up); equal hash() across two runs and across tiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, measureAlloc } from '../harness.mjs';
import { inPage, openIndex, openScene, useServer, PIECE } from './lib.mjs';

useServer();
const report = {};
const write = () => { fs.mkdirSync(path.join(ROOT, 'shots', PIECE), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'budget.json'), JSON.stringify(report, null, 1)); };

/** Page side: the worst fight of the bore (phase 2, 3 adds, 8 stakes flying, 18 stuck, 2 rings), held there while frames are drawn. */
const setupBore = async (dbg, e, core) => {
  dbg.god(true);
  dbg.teleport(14, -44, 84.5, 180, 0);
  dbg.setBossPhase('p2');
  await H.until(() => e.boss().hauling, 1200);
  for (const g of ['sp_bore_grate_1', 'sp_bore_grate_2', 'sp_bore_grate_3']) e.spawn({ kind: 'bider', spawn: g, encounter: 'enc_windlass', wave: 'adds', entrance: 'climb_out' });
  // 18 stuck in the chamber wall
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 8; i++) e.fireStake(14 + (i - 4) * 0.8, -42.5 + round * 0.3, 98, 0.3, 0, 1, 25, false);
    await core.stepAsync(60);
  }
  return { stuck: e.stats().stuck, adds: e.actors().filter((a) => a.alive && a.encounter === 'enc_windlass').length };
};
/** Page side: keep 8 stakes in flight and 2 rings on the floor for `frames` rendered frames; per frame the module's ms. */
const holdBore = (dbg, e, core, a) => {
  const perf = core.ctx().perf;
  const ms = [], flying = [], rings = [];
  let sightPeak = 0;
  dbg.ext.core.collisionCounts(true);
  for (let f = 0; f < a.frames; f++) {
    if (f % 20 === 0) {
      // slow stakes crossing the outer ring (harmless) so eight stay up, and two canisters
      for (let i = 0; i < 8; i++) e.fireStake(14 + Math.sin(i) * 12, -42 + (i % 3) * 0.4, 96 - Math.cos(i) * 12, Math.cos(i), 0, Math.sin(i), 3, false);
      if (f % 120 === 0) { e.lobCanister(4, -44, 96); e.lobCanister(24, -44, 96); }
    }
    dbg.step(1, true);
    ms.push(perf.systemMs[1]);
    flying.push(e.stats().flying);
    rings.push(e.boss().rings);
    const c = dbg.ext.core.collisionCounts(false);
    sightPeak = Math.max(sightPeak, c.last.sight);
  }
  ms.sort((x, y) => x - y);
  return {
    median: ms[ms.length >> 1], p90: ms[Math.floor(ms.length * 0.9)], max: ms[ms.length - 1], sightPeak,
    flying: Math.max(...flying), flyingMin: Math.min(...flying.slice(40)), rings: Math.max(...rings), stuck: e.stats().stuck,
    alive: e.actors().filter((x) => x.alive).length, peak: dbg.ext.core.collisionCounts(false).peak,
  };
};

test('budget: the bore in phase 2 (3 adds, 8 stakes in flight, 18 stuck, 2 rings): <= 1.0 ms median, <= 4 sight rays per frame', async () => {
  const game = await openScene('bore', { viewport: { width: 320, height: 180 } });
  try {
    const set = await inPage(game, setupBore);
    assert.equal(set.stuck, 18);
    assert.equal(set.adds, 3);
    await inPage(game, holdBore, { frames: 600 });                      // warm the JIT
    const r = await inPage(game, holdBore, { frames: 600 });
    report.bore = { ...r, ...set };
    write();
    console.log(`budget: bore p2: median ${r.median.toFixed(3)} ms, p90 ${r.p90.toFixed(3)}, max ${r.max.toFixed(3)}; sight rays per frame peak ${r.sightPeak}; flying ${r.flying}, stuck ${r.stuck}, rings ${r.rings}, alive ${r.alive}`);
    assert.equal(r.flying, 8);
    assert.equal(r.stuck, 18);
    assert.equal(r.rings, 2);
    assert.ok(r.median <= 1.0, `median ${r.median} ms`);
    assert.ok(r.sightPeak <= 4, `${r.sightPeak} lineOfSight rays in a frame`);
    assert.ok(r.peak.sight <= 4, `${r.peak.sight} lineOfSight rays in a frame (peak counter)`);
  } finally { await game.close(); }
});

test('budget: six Biders, then two Transits and four Biders, in the street and the yard: per-frame ms and sight rays', async () => {
  const game = await openScene('yard', { viewport: { width: 320, height: 180 } });
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.teleport(-84, 0, 0, 90, 0);
      for (let i = 0; i < 4; i++) dbg.spawnEnemy('bider', -100 + i * 2, 0, 8 - i, 0);
      dbg.spawnEnemy('transit', -104, 0, -9, -90);
      dbg.spawnEnemy('transit', -106, 0, 10, -90);
      const perf = core.ctx().perf;
      const run = (n) => { const ms = []; let sight = 0; for (let f = 0; f < n; f++) { dbg.step(1, true); ms.push(perf.systemMs[1]); sight = Math.max(sight, dbg.ext.core.collisionCounts(false).last.sight); } ms.sort((a, b) => a - b); return { median: ms[ms.length >> 1], max: ms[ms.length - 1], sight }; };
      run(600);
      return run(600);
    });
    report.yard = r;
    write();
    console.log(`budget: yard, 2 Transits + 4 Biders: median ${r.median.toFixed(3)} ms, max ${r.max.toFixed(3)}, sight peak ${r.sight}`);
    assert.ok(r.median <= 1.0);
    assert.ok(r.sight <= 4);
  } finally { await game.close(); }
});

test('allocation: the bore fight allocates at most 6 KB per tick (measureAlloc, 3000 ticks of warm-up), and so does a street fight', async () => {
  const game = await openScene('bore');
  try {
    await inPage(game, setupBore);
    // the phase-2 cycle runs on by itself: discharges, the lance, canisters, hauls, the adds fighting her
    const bore = await measureAlloc(game, (dbg, n) => dbg.step(n, false));
    report.allocBore = bore;
    const s2 = await inPage(game, async (dbg, e, core) => {
      core.ctx().enemies.clearAll();
      dbg.setBossPhase('p3a');
      return true;
    });
    void s2;
    const fan = await measureAlloc(game, (dbg, n) => dbg.step(n, false));
    report.allocP3 = fan;
    write();
    console.log(`alloc: bore p2 ${bore.perTick.toFixed(0)} B/tick (samples ${bore.samples.map((x) => x.toFixed(0)).join(' ')}); p3a ${fan.perTick.toFixed(0)} B/tick`);
    assert.ok(bore.perTick <= 6144, `${bore.perTick} B per tick`);
    assert.ok(fan.perTick <= 6144, `${fan.perTick} B per tick`);
  } finally { await game.close(); }
  const street = await openScene('street');
  try {
    await inPage(street, async (dbg) => {
      dbg.god(true);
      dbg.teleport(-30, 0, 0, 90, 0);
      for (let i = 0; i < 6; i++) dbg.spawnEnemy('bider', -40 - i, 0, (i % 3 - 1) * 3, 0);
      return true;
    });
    const fight = await measureAlloc(street, (dbg, n) => dbg.step(n, false));
    report.allocStreet = fight;
    write();
    console.log(`alloc: street, 6 Biders ${fight.perTick.toFixed(0)} B/tick`);
    assert.ok(fight.perTick <= 6144);
  } finally { await street.close(); }
});

// Work order 7 item 2: the module's ms in each sandbox scene (bore and yard above; street, file and hall here).
test('budget: street (six Biders), file (the queue of six) and hall (the Tamper and four Biders): per-frame ms and sight rays', async () => {
  const measure = (dbg, e, core) => {
    const perf = core.ctx().perf;
    const run = (n) => { const ms = []; let sight = 0; for (let f = 0; f < n; f++) { dbg.step(1, true); ms.push(perf.systemMs[1]); sight = Math.max(sight, dbg.ext.core.collisionCounts(false).last.sight); } ms.sort((a, b) => a - b); return { median: ms[ms.length >> 1], p90: ms[Math.floor(n * 0.9)], max: ms[ms.length - 1], sight, alive: e.actors().filter((x) => x.alive).length }; };
    run(400);
    return run(400);
  };
  const scenes = {
    street: (dbg) => { dbg.god(true); dbg.teleport(-30, 0, 0, 90, 0); for (let i = 0; i < 6; i++) dbg.spawnEnemy('bider', -40 - i, 0, (i % 3 - 1) * 3, 0); },
    file: async (dbg, e, core) => {
      dbg.god(true); dbg.teleport(-62, -12, -14, -90, 0);
      for (let k = 1; k <= 6; k++) e.spawn({ kind: 'bider', spawn: 'sp_file_' + k, encounter: 'enc_file', wave: 'A', dormantClip: 'queue_stand', entrance: 'rise', lane: 'lane_gallery', order: k });
      await core.stepAsync(20);
      core.ctx().enemies.wakeEncounter('enc_file');
    },
    hall: (dbg) => { dbg.god(true); dbg.teleport(-6, -15, -14, -90, 0); dbg.spawnEnemy('tamper', 4, -15, -14, 90); for (let i = 0; i < 4; i++) dbg.spawnEnemy('bider', 8 + i * 1.5, -15, -16 + i, 90); },
  };
  for (const [scene, setup] of Object.entries(scenes)) {
    const game = await openScene(scene, { viewport: { width: 320, height: 180 } });
    try {
      await inPage(game, setup);
      const r = await inPage(game, measure);
      report[scene] = r;
      write();
      console.log(`budget: ${scene}: median ${r.median.toFixed(3)} ms, p90 ${r.p90.toFixed(3)}, max ${r.max.toFixed(3)}, sight peak ${r.sight}, alive ${r.alive}`);
      assert.ok(r.alive >= 5, `${scene}: the fight is on (${r.alive} alive)`);
      assert.ok(r.median <= 1.0, `${scene}: median ${r.median} ms`);
      assert.ok(r.sight <= 4, `${scene}: ${r.sight} sight rays in a frame`);
    } finally { await game.close(); }
  }
});

// A tick plus a rendered frame with skinned bodies on screen and stakes stuck and cooling. Two three.js traps live
// here (docs/requests/code-enemies.md 1.5 and 1b.1): a material shared by skinned and static meshes, and two instanced
// sets on one material of which only one has instance colours; each costs a program look-up per frame (10 KB).
test('allocation: a tick plus a rendered frame beside three Biders and two Transits firing stays under 6 KB', async () => {
  // on the index page (the sandbox's own overlay builds strings every frame), as tests/core/alloc.test.mjs does
  const game = await openIndex({ tier: 'low', checkpoint: 'cp_street_clear', viewport: { width: 96, height: 54 } });
  try {
    await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.setAim(90, 0);
      for (let i = 0; i < 3; i++) dbg.spawnEnemy('bider', -74 - i * 3, 0, -3 + i * 2, 90);
      dbg.spawnEnemy('transit', -75.5, 0, -2, 90);
      dbg.spawnEnemy('transit', -78.5, 0, 2, 90);
      await H.until(() => e.stats().stuck >= 1, 3000);
      // fix round 1: a freed Bider's static body stands beside the stuck stakes (two instanced sets on core's one
      // fallback material: 9.6 KB per frame when only one of them carried instance colours)
      const b = e.actors().find((x) => x.kind === 'bider');
      e.shootAt(b.id, 'crown', 'lead_round', [b.x + 3, b.y + 1.4, b.z]);
      await H.until(() => e.stats().statics >= 1, 400);
      return true;
    });
    const frames = (dbg, n) => { for (let i = 0; i < n; i++) dbg.step(1, true); };
    const framed = await measureAlloc(game, frames, { perBatch: 30 });
    const st = await inPage(game, (dbg, e) => ({ stuck: e.stats().stuck, statics: e.stats().statics, alive: e.actors().filter((x) => x.alive).length }));
    report.allocFrame = { ...framed, ...st };
    write();
    console.log(`alloc: index page, tick + rendered frame ${framed.perTick.toFixed(0)} B (${st.alive} alive, ${st.stuck} stakes stuck, ${st.statics} static body)`);
    assert.ok(st.stuck >= 1 && st.alive === 4 && st.statics >= 1, `the fight is on, stakes are stuck and a freed Bider sits as a static body (${JSON.stringify(st)})`);
    assert.ok(framed.perTick <= 6144, `${framed.perTick} B per tick + frame`);
  } finally { await game.close(); }
});

const SCRIPT = async (dbg, e, core) => {
  dbg.god(true);
  dbg.teleport(14, -44, 84.5, 180, 0);
  dbg.setBossPhase('p1');
  await core.stepAsync(600);
  for (let k = 0; k < 6; k++) e.shootBoss('knot', k);
  await core.stepAsync(600);
  dbg.setBossPhase('p2');
  await core.stepAsync(900);
  dbg.setBossPhase('p3a');
  e.spawn({ kind: 'bider', spawn: 'sp_bore_grate_2', encounter: 'enc_windlass', wave: 'adds', entrance: 'climb_out' });
  await core.stepAsync(900);
  return { hash: dbg.hash(), boss: e.boss(), actors: e.actors().length, stats: e.stats() };
};

test('determinism: one script on two page loads, and on min / Low / High: the same hash', async () => {
  const runs = {};
  for (const [name, tier] of [['a', 'low'], ['b', 'low'], ['min', 'min'], ['high', 'high']]) {
    const game = await openScene('bore', { tier, seed: 11 });
    try { runs[name] = await inPage(game, SCRIPT); } finally { await game.close(); }
  }
  report.determinism = Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.hash]));
  write();
  assert.equal(runs.a.hash, runs.b.hash, 'two loads');
  assert.equal(runs.min.hash, runs.a.hash, 'min');
  assert.equal(runs.high.hash, runs.a.hash, 'High');
  assert.deepEqual(runs.a.boss, runs.b.boss);
  assert.ok(runs.a.stats.maxHit <= 38, `no hit over 38 (${runs.a.stats.maxHit})`);
});

test('fix round 1: an enemy with no route to her, and a Transit with no point to go to, do not search the nav graph every tick', async () => {
  const game = await openIndex({ tier: 'low', checkpoint: 'cp_street_clear', viewport: { width: 96, height: 54 } });
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      for (let i = 0; i < 6; i++) dbg.spawnEnemy(i % 2 ? 'transit' : 'bider', -74 - i * 1.5, 0, -3 + i, 90);
      dbg.setActions(['forward', 'left']);
      await core.stepAsync(600);
      const s0 = e.stats().searches;
      await core.stepAsync(1200);
      return { searches: e.stats().searches - s0, alive: e.actors().filter((x) => x.alive).length };
    });
    assert.ok(r.alive >= 3);
    assert.ok(r.searches <= 600, `${r.searches} route searches in 1200 ticks beside ${r.alive} enemies (4400 before the fix)`);
    console.log(`nav: ${r.searches} route searches in 1200 ticks (${r.alive} alive, one Bider with no route, two Transits planted)`);
  } finally { await game.close(); }
});
