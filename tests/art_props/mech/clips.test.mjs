// art-props-mech: every clip through the real loader (sandbox/viewer.html), held at t = 0, 0.5 and 1 with setClip:
// no console error, the end pose differs from the start; the hatch at 15 % is the 0.3 m "ajar" gap; a cage's
// gate_open leaves the whole opening clear. One frame per clip is written to shots/art-props-mech/clip_<id>__<clip>.png.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { glbIsPlaceholder } from '../../../tools/pipeline-lib.mjs';
import { startServer, openGame } from '../../harness.mjs';
import { M, L, MECH, PIECE, marker } from './glb.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.close(); });

const withAsset = async (id, fn) => {
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: id, shot: 1, yaw: 25, pitch: 12 } });
  try { return await fn(game); } finally { await game.close(); }
};
const poseAt = (game, clip, t) => game.page.evaluate(([c, tt]) => { const v = window.__dbg.ext.viewer; v.setClip(c, tt); return v.pose(); }, [clip, t]);
const RETURNS = new Set(['ia_ammo_box.dispense', 'ia_yard_bell.ring', 'ia_range_plate.ring']);
const differs = (a, b) => Object.keys(a).some((k) => ['pos', 'quat', 'scale'].some((f) => a[k][f].some((v, i) => Math.abs(v - b[k][f][i]) > 1e-3)));

for (const id of MECH) {
  const clips = M.assets[id].animations;
  if (!clips.length) continue;
  test(`${id}: ${clips.map((c) => c.name).join(', ')}`, { skip: glbIsPlaceholder(M.assets[id]._pub, id) ? 'still a placeholder' : false }, async () => {
    await withAsset(id, async (game) => {
      for (const c of clips) {
        const p0 = await poseAt(game, c.name, 0), p5 = await poseAt(game, c.name, 0.5), p1 = await poseAt(game, c.name, 1);
        for (const p of [p0, p5, p1]) for (const [name, v] of Object.entries(p)) assert.ok([...v.pos, ...v.quat, ...v.scale].every(Number.isFinite), `${id}.${c.name}: ${name} is finite`);
        // a kick or a ring settles back where it began (the manifest: "the flap kicks and settles", "swings and damps"): there the
        // motion is held to the quarter and half-way poses instead
        if (RETURNS.has(`${id}.${c.name}`)) { const pq = await poseAt(game, c.name, 0.25); assert.ok(differs(p0, pq), `${id}.${c.name}: it moves by a quarter of the way`); assert.ok(!differs(p0, p1), `${id}.${c.name}: it settles back`); }
        else assert.ok(differs(p0, p1), `${id}.${c.name}: the end pose differs from the start`);
        await game.page.evaluate(([cn]) => window.__dbg.ext.viewer.setClip(cn, 0.5), [c.name]);
        await game.step(1, true);
        await game.shot(`clip_${id}__${c.name}`);
      }
      assert.deepEqual(game.consoleErrors, [], `${id}: console errors`);
    });
  });
}

test('ia_hatch: `open` held at 15 % is a 0.30 m gap (linear in time), and at 100 % each leaf has slid 1.0 m', async () => {
  await withAsset('ia_hatch', async (game) => {
    const rest = await poseAt(game, '', 0);
    const gap = async (t) => { const p = await poseAt(game, 'open', t); return (p.leaf_a.pos[2] - rest.leaf_a.pos[2]) - (p.leaf_b.pos[2] - rest.leaf_b.pos[2]); };
    const g15 = await gap(0.15), g50 = await gap(0.5), g100 = await gap(1);
    console.log(`ia_hatch gap: 15 % ${g15.toFixed(3)} m, 50 % ${g50.toFixed(3)} m, 100 % ${g100.toFixed(3)} m`);
    assert.ok(Math.abs(g15 - marker('ia_hatch').params.ajarGap) <= 0.02, `gap at 15 %: ${g15.toFixed(3)} m`);
    assert.ok(Math.abs(g50 - 1.0) <= 0.02 && Math.abs(g100 - 2.0) <= 0.02, 'linear in time');
  });
});

for (const [id, gateH] of [['ia_lift_cage', L.nav.portals[0].cageInterior[1]], ['ia_proving_lift_cage', marker('door_proving_lift').size[1]]]) {
  test(`${id}: gate_open leaves the whole opening clear (the folded gate is above ${gateH} m); gate_close brings it back`, async () => {
    await withAsset(id, async (game) => {
      const open = await poseAt(game, 'gate_open', 1), shut = await poseAt(game, 'gate_close', 1), rest = await poseAt(game, '', 0);
      // the gate's geometry spans 0 .. gateH above the bone at rest: its lowest point follows the bone, its top is at pos.y + gateH * scale.y
      const bottom = open.gate.pos[1] - rest.gate.pos[1], top = bottom + gateH * open.gate.scale[1];
      console.log(`${id}: folded gate from ${bottom.toFixed(2)} to ${top.toFixed(2)} m`);
      assert.ok(bottom >= gateH - 0.01, `the folded gate's foot is at ${bottom.toFixed(3)} m`);
      assert.ok(top - bottom <= 0.3, 'the gate folds to a bundle under 0.3 m');
      assert.ok(Math.abs(shut.gate.pos[1] - rest.gate.pos[1]) < 1e-3 && Math.abs(shut.gate.scale[1] - 1) < 1e-3, 'gate_close ends shut');
      // the gate HANGS from the header through both clips: its top edge never sags below the header line (it floated up to
      // 0.9 m under it before the fix) and never rises more than its park (the bundle's own height) above it
      for (const clip of ['gate_open', 'gate_close']) {
        for (let k = 0; k <= 20; k++) {
          const p = await poseAt(game, clip, k / 20);
          const topK = p.gate.pos[1] - rest.gate.pos[1] + gateH * p.gate.scale[1];
          assert.ok(topK >= gateH - 0.03 && topK <= gateH + 0.3, `${clip} at ${(k / 20).toFixed(2)}: the gate's top edge is at ${topK.toFixed(3)} m, the header at ${gateH} m`);
        }
      }
    });
  });
}

test('prop_stock_gate: gate_bar is code-driven and takes the hooks with it', async () => {
  await withAsset('prop_stock_gate', async (game) => {
    const r = await game.page.evaluate(() => {
      const v = window.__dbg.ext.viewer, a = v.pose(['hook_1', 'gate_bar']);
      const bone = a.gate_bar;
      return { a, isBone: bone.isBone, local: bone.local };
    });
    assert.equal(r.isBone, true);
    assert.ok(r.local.quat.slice(0, 3).every((q) => Math.abs(q) < 1e-4), `gate_bar's rest frame is the game's axes (local quaternion ${r.local.quat.map((q) => q.toFixed(3))}): code raises it along +Y`);
  });
});

test('prop_share_cloth: fall ends as a heap ON the hall floor (the batten 4.0 to 4.6 m down, folded, bunched to under 80 % width)', async () => {
  await withAsset('prop_share_cloth', async (game) => {
    const rest = await poseAt(game, '', 0), end = await poseAt(game, 'fall', 1);
    const drop = rest.cloth_1.pos[1] - end.cloth_1.pos[1];
    console.log(`prop_share_cloth: the batten hem ends ${drop.toFixed(2)} m down, width x ${end.cloth_1.scale[0].toFixed(2)}`);
    const floor = marker('ia_cloth_cord').pos[1] - 0;                            // the cord top's height above the hall floor
    assert.ok(drop > floor - 0.255 - 0.6 && drop < floor - 0.255, `the batten rests on the heap, ${drop.toFixed(2)} m down of ${(floor - 0.255).toFixed(2)}`);
    assert.ok(end.cloth_1.scale[0] < 0.8, 'the width bunches');
    const dot = (a, b) => Math.abs(a.quat[0] * b.quat[0] + a.quat[1] * b.quat[1] + a.quat[2] * b.quat[2] + a.quat[3] * b.quat[3]);
    assert.ok(dot(end.cloth_1, end.cloth_2) < 0.97 && dot(end.cloth_2, end.cloth_3) < 0.97, 'the three bands lie at different angles');
  });
});
