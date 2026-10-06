// The peg-stair seam (ARCHITECTURE 3.6 rule 8): warp to cp_tally_hatch, walk by input down flight 1, landing 1 and
// flights 2 and 3, rendering every tick on Low. At every tick: grounded or falling less than 0.5 m, world.zone not null,
// textureBytes + renderTargetBytes <= 64 MiB. Once: the hatch closed before trg_set_swap fired, the set is `underground`
// at the foot, and walking back up ends under a closed hatch.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assertBudget, openGame, startServer } from '../harness.mjs';
import { LAYOUT, MANIFEST, MiB, PIECES, STUBS } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

/** in the page: walk `to` one tick at a time, rendering every tick */
async function pageSeam({ to, shotAtY }) {
  const dbg = window.__dbg;
  const out = { reason: '', ticks: 0, problems: [], maxFall: 0, worstBytes: 0, worstAt: '', zones: [], cells: [], sets: [], shot: null, perfByStage: {}, maxDrawCalls: 0, maxTriangles: 0 };
  let groundY = dbg.player().y;
  const seen = (list, v) => { if (list[list.length - 1] !== v) list.push(v); };
  for (let i = 0; i < 4000; i++) {
    const r = dbg.followPath(to, { maxTicks: 1 });
    dbg.step(0, true);                                   // a render every tick
    out.ticks += r.ticks;
    const p = dbg.player(), f = dbg.perf(), w = dbg.state().world;
    if (p.grounded) groundY = p.y;
    else { const fall = groundY - p.y; out.maxFall = Math.max(out.maxFall, fall); if (fall >= 0.5 && out.problems.length < 8) out.problems.push(`fell ${fall.toFixed(2)} m at ${p.x},${p.y},${p.z}`); }
    if (!p.zone && out.problems.length < 8) out.problems.push(`zone null at ${p.x},${p.y},${p.z}`);
    const bytes = f.textureBytes + f.renderTargetBytes;
    if (bytes > out.worstBytes) { out.worstBytes = bytes; out.worstAt = `${w.set}/${w.cell} tick ${i}`; }
    out.maxDrawCalls = Math.max(out.maxDrawCalls, f.drawCalls); out.maxTriangles = Math.max(out.maxTriangles, f.triangles);
    const stage = `${w.set}:${w.builtZones.join('+')}`;
    out.perfByStage[stage] = Math.max(out.perfByStage[stage] ?? 0, bytes);
    seen(out.zones, p.zone); seen(out.cells, w.cell); seen(out.sets, w.set);
    if (shotAtY !== null && out.shot === null && p.y <= shotAtY) out.shot = dbg.capture();
    if (r.reason !== 'max_ticks') { out.reason = r.reason; out.gate = r.gate; out.node = r.node; break; }
  }
  return out;
}

test('walking the seam by input: grounded, in a zone and inside the texture budget at every tick', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier: 'low', checkpoint: 'cp_tally_hatch' });
  try {
    await game.dbg('god', true);
    let s = await game.state();
    assert.equal(s.world.set, 'surface');
    assert.deepEqual(s.world.builtZones, ['the_lip', 'plenty_street', 'tally_house', 'the_gallery'], 'the seam stage: the gallery is staged beside the surface set');
    assert.ok(s.world.flags.includes('hatch_powered'));
    assert.equal(s.world.doors.ia_hatch, 'open');
    const seq0 = (await game.events(0)).at(-1).seq;

    const down = await game.page.evaluate(async ({ fn, args }) => (new Function('return (' + fn + ')')())(args), { fn: pageSeam.toString(), args: { to: 'cp_gallery_bay', shotAtY: -1.6 } });
    assert.equal(down.reason, 'arrived', `ended '${down.reason}' at ${down.node}; ${down.problems.join('; ')}`);
    assert.deepEqual(down.problems, []);
    assert.ok(down.maxFall < 0.5);
    const budget = MANIFEST.tiers.low.textureBudgetMB * MiB;
    assert.ok(down.worstBytes <= budget, `textures + render targets peaked at ${(down.worstBytes / MiB).toFixed(1)} MiB (${down.worstAt})`);
    assert.deepEqual(down.zones, ['tally_house', 'the_gallery'], 'tally_house until trg_set_swap, the_gallery after');
    assert.deepEqual(down.sets, ['surface', 'underground']);
    assert.deepEqual(down.cells, ['cell_tally', 'cell_tally_seam', 'cell_gallery_stair', 'cell_gallery']);
    fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'seam_flight1.png'), Buffer.from(down.shot.replace(/^data:image\/png;base64,/, ''), 'base64'));

    // ---- once: the hatch closed before the swap; the set is underground at the foot
    const events = await game.events(seq0);
    const closed = events.find((e) => e.name === 'door/state' && e.payload.id === 'ia_hatch' && e.payload.state === 'closed');
    const released = events.find((e) => e.name === 'load/set' && e.payload.set === 'surface' && e.payload.stage === 'released');
    const built = events.find((e) => e.name === 'world/built' && e.payload.set === 'underground');
    assert.ok(closed, 'the hatch closed');
    assert.ok(released && built, 'the surface set was released and the underground set built');
    assert.ok(closed.seq < released.seq && closed.seq < built.seq, 'the hatch closed before trg_set_swap fired');
    assert.ok(closed.tick < released.tick, 'on an earlier tick');
    s = await game.state();
    assert.equal(s.world.set, 'underground');
    assert.deepEqual(s.world.builtZones, ['the_gallery', 'lift_hall', 'the_bore']);
    assert.equal(s.world.doors.ia_hatch, 'closed');
    assert.equal(s.world.checkpoint, 'cp_gallery_bay', 'no checkpoint inside the seam: the next one is the stair foot');
    const foot = LAYOUT.markers.find((m) => m.id === 'cp_gallery_bay');
    assert.ok(Math.hypot(s.player.x - foot.pos[0], s.player.z - foot.pos[2]) < 1 && Math.abs(s.player.y - foot.pos[1]) < 0.1);
    assertBudget(await game.dbg('perfRun', 4), { zone: 'the_gallery', tier: 'low' });

    // ---- walking back up ends under a closed hatch
    const up = await game.page.evaluate(async ({ fn, args }) => (new Function('return (' + fn + ')')())(args), { fn: pageSeam.toString(), args: { to: 'cp_tally_hatch', shotAtY: null } });
    assert.equal(up.reason, 'gate');
    assert.equal(up.gate, 'ia_hatch');
    assert.deepEqual(up.problems, []);
    s = await game.state();
    assert.equal(s.world.doors.ia_hatch, 'closed');
    assert.ok(s.player.y < -0.3 && s.player.y > -4.6, `she stands on the stair under the hatch (y ${s.player.y})`);
    assert.equal(s.world.zone, 'the_gallery');
    // pushing on up the stair: the lid holds
    const hatch = LAYOUT.markers.find((m) => m.id === 'ia_hatch');
    await game.walkTo(hatch.pos[0] - 3, hatch.pos[2], { maxTicks: 240 });
    s = await game.state();
    assert.ok(s.player.y + 1.8 <= hatch.pos[1] + 0.02, `her head stays under the lid (feet y ${s.player.y})`);

    const report = { worstMiB: down.worstBytes / MiB, worstAt: down.worstAt, byStage: Object.fromEntries(Object.entries(down.perfByStage).map(([k, v]) => [k, +(v / MiB).toFixed(2)])), ticksDown: down.ticks, maxDrawCalls: down.maxDrawCalls, maxTriangles: down.maxTriangles };
    fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'seam.json'), JSON.stringify(report, null, 1));
    console.log(`seam: worst textures + render targets ${report.worstMiB.toFixed(1)} MiB at 960 x 540 (${down.worstAt}); by stage ${JSON.stringify(report.byStage)}; ${down.ticks} ticks down, every one rendered`);
  } finally { await game.close(); }
});

test('the seam stage at Low\'s largest buffer stays under 64 MiB, and matches the manifest\'s stage table', async () => {
  // 1366 x 768 is the tier's cap: the worst case the manifest's `stages` are computed for
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier: 'low', checkpoint: 'cp_tally_hatch', viewport: { width: 1366, height: 768 } });
  try {
    await game.step(2, true);
    const f = await game.perf();
    const stage = MANIFEST.stages.find((x) => x.id === 'seam');
    assert.equal(f.textureBytes, stage.textureBytes, 'active textures are exactly the seam stage\'s');
    const mb = (f.textureBytes + f.renderTargetBytes) / MiB;
    assert.ok(Math.abs(mb - stage.totalMB.low) < 0.15, `measured ${mb.toFixed(2)} MiB, the manifest says ${stage.totalMB.low}`);
    assert.ok(mb <= 64);
    console.log(`seam at 1366 x 768 (Low's cap): ${mb.toFixed(1)} MiB (textures ${(f.textureBytes / MiB).toFixed(1)} + targets ${(f.renderTargetBytes / MiB).toFixed(1)})`);
  } finally { await game.close(); }
});

test('a restore inside the seam returns to cp_tally_hatch: in place before the swap, through loading after it', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier: 'low', checkpoint: 'cp_tally_hatch' });
  try {
    await game.dbg('god', false);
    // die on flight 1, surface still resident: restored in place, the seam stage re-entered
    await game.run([{ followPath: 'cp_gallery_bay', maxTicks: 40 }, { call: ['setHealth', 0] }, { steps: 109 }, { steps: 2 }]);
    let s = await game.state();
    assert.equal(s.game, 'playing');
    assert.equal(s.world.checkpoint, 'cp_tally_hatch');
    assert.deepEqual(s.world.builtZones, ['the_lip', 'plenty_street', 'tally_house', 'the_gallery']);
    let states = (await game.events(0, 'game/state')).map((e) => e.payload.to);
    assert.ok(!states.slice(states.lastIndexOf('dead')).includes('loading'), 'same set: no loading state');
    // die past the swap: cp_gallery_bay is not reached yet, so the restore swaps the sets back, through loading
    for (let i = 0; i < 60 && s.world.set === 'surface'; i++) s = await game.run([{ followPath: 'cp_gallery_bay', maxTicks: 8 }]);
    assert.equal(s.world.set, 'underground', 'past trg_set_swap');
    assert.ok(s.player.y > -9, 'still on the stair');
    assert.equal(s.world.checkpoint, 'cp_tally_hatch');
    await game.run([{ call: ['setHealth', 0] }, { steps: 109 }, { steps: 2 }]);
    s = await game.state();
    assert.equal(s.game, 'playing');
    assert.equal(s.world.set, 'surface');
    assert.deepEqual(s.world.builtZones, ['the_lip', 'plenty_street', 'tally_house', 'the_gallery'], 'hatch_powered: the seam stage again, before control');
    assert.equal(s.world.doors.ia_hatch, 'open');
    states = (await game.events(0, 'game/state')).map((e) => e.payload.to);
    assert.deepEqual(states.slice(states.lastIndexOf('dead')), ['dead', 'loading', 'playing']);
    const f = await game.dbg('perfRun', 2);
    assert.ok((f.textureBytes + f.renderTargetBytes) / MiB <= 64);
    assert.equal(f.textureBytes, MANIFEST.stages.find((x) => x.id === 'seam').textureBytes, 'nothing of the underground set leaked');
  } finally { await game.close(); }
});
