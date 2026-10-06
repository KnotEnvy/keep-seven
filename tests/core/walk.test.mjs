// The critical path walked BY INPUT (ARCHITECTURE 11.4): followPath('critical') from cp_lip_start to the last node at the
// rim, god mode on, every door forced open through world.debug at each `gate` stop, both rides taken with tap('interact').
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, openGame, startServer } from '../harness.mjs';
import { CHECKPOINTS, LAYOUT, PIECES, STUBS, median, walk } from './route.mjs';

const PIECE = 'foundation-core';
const NAV = LAYOUT.nav;
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

let reference = null;

test('walks the whole critical path, tick by tick: arrived, never stuck, grounded, in a zone, the right distance', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS });
  try {
    await game.dbg('god', true);
    // maxTicks 1: every tick is observed, and every call re-enters followPath from wherever she stands
    const r = await walk(game, 'critical', { perTick: true });
    const s = await game.state();
    assert.equal(r.reason, 'arrived', `the walk ended '${r.reason}' at node ${r.node} ${JSON.stringify(r.stuckAt)}; ${r.problems.join('; ')}`);
    assert.deepEqual(r.problems, [], 'grounded or fallen less than 0.5 m, and in a zone, at every tick');
    assert.ok(r.maxFall < 0.5, `largest fall ${r.maxFall}`);
    assert.equal(r.node, NAV.criticalPath[NAV.criticalPath.length - 1]);
    assert.deepEqual(r.zones, LAYOUT.zones.map((z) => z.id), 'every zone, in order');
    assert.deepEqual(r.rides.map((x) => x.id), ['ride_lift_hall', 'ride_proving_lift']);
    assert.ok(r.rides[0].ticks >= 25 * 60, 'the lift hall ride lasts its 25 s');
    assert.ok(r.rides[1].ticks >= 12 * 60, 'the proving lift ride lasts at least 12 s');
    const want = NAV.criticalPathLength;
    assert.ok(Math.abs(r.distance - want) <= want * 0.05, `walked ${r.distance.toFixed(1)} m, the path is ${want} m`);
    assert.equal(s.world.set, 'coda');
    assert.equal(s.world.zone, 'far_rim');
    assert.equal(s.world.checkpoint, 'cp_rim');
    assert.equal(s.player.grounded, true);
    reference = { hash: await game.dbg('hash'), ticks: r.ticks, at: [s.player.x, s.player.y, s.player.z], distance: r.distance, gates: r.gates, rides: r.rides, maxFall: r.maxFall };
    console.log(`walk: ${r.distance.toFixed(1)} m of ${want} m in ${r.ticks} ticks (${(r.ticks / 60).toFixed(0)} s of game), ${r.calls} followPath calls, ${r.wallMs.toFixed(0)} ms wall; gates ${r.gates.join(', ')}`);
  } finally { await game.close(); }
});

test('the same walk in long calls ends at the same tick and place, and core + stubs stay inside the JS budget', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS });
  try {
    await game.dbg('god', true);
    const r = await walk(game, 'critical', { chunk: 30, perfEvery: 30 });
    const s = await game.state();
    assert.equal(r.reason, 'arrived', `ended '${r.reason}' at ${r.node}`);
    assert.ok(reference, 'the tick-by-tick walk ran first');
    assert.equal(r.ticks, reference.ticks);
    assert.deepEqual([s.player.x, s.player.y, s.player.z], reference.at);
    assert.equal(await game.dbg('hash'), reference.hash, 'restarting followPath every tick changes nothing');
    const js = median(r.jsMs);
    const perTick = r.wallMs / r.ticks;
    console.log(`walk: simMs + updateMs median ${js.toFixed(3)} ms over ${r.jsMs.length} samples (target <= 1.0 for core + stubs); ${perTick.toFixed(4)} ms wall per tick including one render per 30 ticks`);
    assert.ok(js <= 1.0, `simMs + updateMs median ${js.toFixed(3)} ms`);
    fs.mkdirSync(path.join(ROOT, 'shots', PIECE), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'walk.json'), JSON.stringify({ ...reference, criticalPathLength: NAV.criticalPathLength, jsMsMedian: js, jsSamples: r.jsMs.length }, null, 1));
  } finally { await game.close(); }
});

test('followPath stops with gate, portal and no_path, and walkTo reports stuck against a wall', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS });
  try {
    await game.dbg('god', true);
    // a closed door on the route: 'gate', standing in front of it
    let r = await game.followPath('critical', { maxTicks: 6000 });
    assert.equal(r.reason, 'gate');
    assert.equal(r.gate, 'door_jug_gate');
    assert.equal(r.arrived, false);
    const gate = LAYOUT.markers.find((m) => m.id === 'door_jug_gate');
    assert.ok(Math.hypot(r.x - gate.pos[0], r.z - gate.pos[2]) < 6, 'she stands by the gate');
    assert.equal((await game.followPath('critical')).reason, 'gate', 'calling again does not walk through it');
    // walking straight at the shut gate: stuck, with the place
    r = await game.walkTo(gate.pos[0] - 6, gate.pos[2], { maxTicks: 600 });
    assert.equal(r.reason, 'stuck');
    assert.ok(r.stuckAt && Math.abs(r.stuckAt.x - r.x) < 1e-6);
    assert.ok(r.x > gate.pos[0], 'the gate held');
    // max_ticks
    await game.dbg('checkpoint', 'cp_lip_start');
    r = await game.followPath('critical', { maxTicks: 30 });
    assert.equal(r.reason, 'max_ticks');
    assert.equal(r.ticks, 30);
    // a marker as the target, and the nav path of the hook
    r = await game.followPath('cp_lip_gate', { maxTicks: 6000 });
    assert.ok(r.reason === 'gate' || r.reason === 'arrived');
    const p = await game.dbg('navPath', 'cp_lip_start', 'cp_lip_gate');
    assert.ok(p.length > 10 && p[0] === 'n_lip_001');
    // an unknown target
    assert.equal((await game.followPath('n_no_such_node')).reason, 'no_path');
    // a lift ride on the route: 'portal' at the cage, until the lever is thrown
    await game.dbg('checkpoint', 'cp_hall_clear');
    r = await game.followPath('critical', { maxTicks: 3000 });
    assert.equal(r.reason, 'portal');
    assert.equal(r.node, 'n_lh_cage');
    assert.equal((await game.followPath('critical')).reason, 'portal');
    // input is restored: nothing is held after a walk
    await game.step(30);                                      // the real controller coasts to a stop (the stub stops dead)
    const before = (await game.state()).player;
    await game.step(30);
    const after = (await game.state()).player;
    assert.deepEqual([after.x, after.z], [before.x, before.z]);
    // not playing: 'state'
    await game.dbg('pause', true);
    assert.equal((await game.followPath('critical')).reason, 'state');
    await game.dbg('pause', false);
    // dead: 'dead'
    await game.dbg('god', false);
    await game.dbg('setHealth', 0);
    assert.equal((await game.followPath('critical')).reason, 'dead');
  } finally { await game.close(); }
});

// Adversarial: random headings, sprint, strafe and jumps from every checkpoint. The capsule must never be inside
// geometry and no grounded tick may lift her more than a step (the hatch stair beside the Tally House floor did both).
test('random walks from every checkpoint: never inside a solid, never up a ledge higher than a step', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS });
  try {
    const total = { runs: 0, maxRise: 0, problems: [] };
    for (const cp of CHECKPOINTS) {
      await game.dbg('checkpoint', cp);
      await game.dbg('god', true);
      for (let seed = 1; seed <= 3; seed++) {
        const r = await game.page.evaluate(({ seed, ticks }) => {
          const dbg = window.__dbg, core = dbg.ext.core;
          let s = seed * 2654435761 >>> 0;
          const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
          const out = { problems: [], maxRise: 0 };
          let p = dbg.player(), left = 0;
          for (let t = 0; t < ticks; t++) {
            if (left-- <= 0) {
              left = 10 + Math.floor(rnd() * 80);
              dbg.setAim(rnd() * 360 - 180, 0);
              const a = ['forward'];
              if (rnd() < 0.5) a.push('sprint');
              if (rnd() < 0.3) a.push(rnd() < 0.5 ? 'left' : 'right');
              dbg.setActions(a);
              if (rnd() < 0.15) dbg.tap('jump');
            }
            dbg.step(1, false);
            if (dbg.state().game !== 'playing') break;
            const q = dbg.player();
            if (Math.hypot(q.x - p.x, q.z - p.z) < 2 && Math.abs(q.y - p.y) < 2 && p.grounded && q.grounded) {
              if (q.y - p.y > out.maxRise) out.maxRise = q.y - p.y;
              if (q.y - p.y > 0.4 && out.problems.length < 3) out.problems.push(`rose ${(q.y - p.y).toFixed(3)} m in one tick to (${q.x}, ${q.y}, ${q.z})`);
            }
            // a slimmer, shorter capsule lifted 8 cm: not free means the real one is centimetres inside a solid
            if (!core.capsuleFree(q.x, q.y + 0.08, q.z, 0.27, 1.6) && out.problems.length < 3) out.problems.push(`inside a solid at (${q.x}, ${q.y}, ${q.z}) tick ${t}`);
            p = q;
          }
          dbg.setActions([]);
          return out;
        }, { seed, ticks: 1500 });
        total.runs++;
        total.maxRise = Math.max(total.maxRise, r.maxRise);
        for (const text of r.problems) total.problems.push(`${cp} seed ${seed}: ${text}`);
      }
    }
    console.log(`random walks: ${total.runs} runs of 1500 ticks, largest grounded rise in one tick ${total.maxRise.toFixed(3)} m`);
    assert.deepEqual(total.problems, []);
    assert.equal(total.runs, CHECKPOINTS.length * 3);
  } finally { await game.close(); }
});
