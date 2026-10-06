// art-props-mech: the visible target and the hit sphere coincide. For every shootable part, the share of the hit
// sphere's front silhouette (radius = the marker's hitRadius) that the target's drawn triangles cover, and how far the
// covered patch sits from the sphere's centre. Whole-body targets (jug, knot, latch on its plate, port in its bezel,
// bell, plate) must fill 60 %; a cord or a rope cannot (a 5 cm cord in a 12 cm sphere): it must be centred and fill
// at least 10 %, and the measured share is printed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { glbIsPlaceholder } from '../../../tools/pipeline-lib.mjs';
import { M, load, fill, marker } from './glb.mjs';

const cases = [
  // asset, what, centre (asset-local game), radius, triangles that are the target, minimum fill
  ['ia_jug', 'jug body', M.assets.ia_jug.hitPoint, marker('ia_jug_1').params.hitRadius, (m) => m.name === 'jug_intact', 0.6],
  ['knot_mech', 'knot', M.assets.knot_mech.hitPoint, marker('knot_yard_latch').params.hitRadius, () => true, 0.6],
  ['ia_shutter', 'latch insulator on its plate', M.assets.ia_shutter.nodePos.latch, marker('ia_latch_s').params.hitRadius, (m, i) => m.joint[i] === 'latch', 0.6],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ['ia_bore_door', `port_${n} socket and bezel`, M.assets.ia_bore_door.nodePos[`port_${n}`], marker(`ia_ask_port_${n}`).params.hitRadius,
    (m, i) => m.material === 'm_prop' && m.tris[i].every((p) => p[2] > 0.1255 && Math.hypot(p[0] - M.assets.ia_bore_door.nodePos[`port_${n}`][0], p[1] - M.assets.ia_bore_door.nodePos[`port_${n}`][1]) < 0.2), 0.6]),
  ['prop_share_cloth', 'cord', M.assets.prop_share_cloth.nodePos.cord, marker('ia_cloth_cord').params.hitRadius, (m, i) => m.material === 'm_prop' && m.tris[i].every((p) => p[1] > -0.24), 0.1],
  ['ia_yard_bell', 'bell', M.assets.ia_yard_bell.hitPoint, 0.2, (m, i) => m.joint[i] === 'bell', 0.6],
  ['ia_range_plate', 'plate', M.assets.ia_range_plate.hitPoint, 0.35, (m, i) => m.joint[i] === 'plate', 0.6],
  ['sec_loft_bell', 'rope (both halves round the parting point)', M.assets.sec_loft_bell.nodePos.rope, marker('sec_loft_bell_rope').params.hitRadius, (m, i) => m.joint[i] === 'rope' || m.joint[i] === 'root', 0.1],
];
for (const [id, what, centre, r, keep, min] of cases) {
  test(`${id}: ${what} fills the hit sphere (r ${r} m)`, { skip: glbIsPlaceholder(M.assets[id]._pub, id) ? 'still a placeholder' : false }, async () => {
    const a = await load(id);
    const f = fill(a, centre, r, { keep, depth: r + 0.1 });
    console.log(`${id} ${what}: fill ${(f.fill * 100).toFixed(0)} % of the r ${r} m disc, centroid ${(f.offCentre * 100).toFixed(1)} cm off centre`);
    assert.ok(f.fill >= min, `fill ${(f.fill * 100).toFixed(0)} % < ${min * 100} %`);
    assert.ok(f.offCentre <= r * 0.35, `the target sits ${f.offCentre.toFixed(3)} m off the sphere's centre`);
  });
}

test('ia_shutter: every triangle of the latch lies inside its hit sphere', async () => {
  const a = await load('ia_shutter'), c = M.assets.ia_shutter.nodePos.latch, r = marker('ia_latch_s').params.hitRadius;
  let worst = 0;
  for (const m of a.meshes) m.tris.forEach((t, i) => { if (m.joint[i] === 'latch') for (const p of t) worst = Math.max(worst, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])); });
  assert.ok(worst <= r + 0.005, `farthest latch vertex ${worst.toFixed(3)} m from the centre (radius ${r})`);
});

test('ia_jug: the body lies inside the sphere of the largest jug marker in height, and the hit point is its centre', async () => {
  const a = await load('ia_jug'), c = M.assets.ia_jug.hitPoint;
  let lo = Infinity, hi = -Infinity, wide = 0;
  for (const m of a.meshes) if (m.name === 'jug_intact') for (const t of m.tris) for (const p of t) if (p[1] < -0.6) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); wide = Math.max(wide, Math.hypot(p[0], p[2])); }
  assert.ok(Math.abs((lo + hi) / 2 - c[1]) < 0.03, `body centre ${((lo + hi) / 2).toFixed(3)} against hitPoint ${c[1]}`);
  assert.ok(hi - lo <= 2 * 0.22 + 0.01 && wide <= 0.2, `body ${(hi - lo).toFixed(2)} m tall, ${(2 * wide).toFixed(2)} m across`);
});
