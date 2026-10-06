// art-props-mech: what closes an opening fits the layout's marker (ART_BIBLE 7.1 openings table), and every nodePos
// node, placed by the rules of data.placement, lands on its partner marker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { glbIsPlaceholder } from '../../../tools/pipeline-lib.mjs';
import { M, L, load, bbox, marker, placement, dist } from './glb.mjs';

const TOL = 0.05;
const final = (id) => !M.assets[id]._placeholder;
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol + 1e-6, `${what}: ${a.toFixed(3)} against ${b} (tolerance ${tol})`);
const jointOnly = (...names) => (m, i) => names.includes(m.joint[i]);
const solid = (m) => m.material === 'm_prop' || m.material === 'm_frontier';

test('prop_stock_gate closes door_jug_gate: hurdle 3.9 wide under a bar whose underside is 2.35 m up', async () => {
  const a = await load('prop_stock_gate'), size = marker('door_jug_gate').size;
  const [lo, hi] = bbox(a, (m, i) => m.name === 'prop_stock_gate_mesh' && m.tris[i].every((p) => p[1] < 2.3));
  near(hi[0] - lo[0], size[0] - 0.1, 0.06, 'hurdle width (the opening less 5 cm a side)');
  near(lo[1], 0, 0.13, 'hurdle foot'); 
  const [blo, bhi] = bbox(a, (m, i) => m.name === 'prop_stock_gate_mesh' && m.tris[i].every((p) => p[1] > 2.34 && Math.abs(p[0]) < 1.5));
  near(blo[1], 2.35, 0.03, 'bar underside'); near(bhi[1], 2.65, TOL, 'bar top');
  const [alo, ahi] = bbox(a, (m) => m.name === 'prop_stock_gate_mesh');
  near(ahi[0] - alo[0], 4.6, 0.06, 'bar length'); assert.ok(ahi[1] <= size[1] + TOL, 'the gate stays under the opening height');
});

for (const [id, mk, keep] of [
  ['ia_yard_door', 'ia_yard_door', (m) => solid(m)],
  ['prop_door_frontier', 'door_alley', (m) => solid(m)],
  ['prop_door_frontier', 'door_tally', (m) => solid(m)],
  ['ia_shutter', 'shutter_s', jointOnly('shutter_leaf')],
  ['ia_baffle', 'ia_baffle', jointOnly('leaf_l', 'leaf_r')],
  ['prop_door_pellam', 'door_gallery_far', (m, i) => m.joint[i] === 'leaf' && m.tris[i].every((p) => p[1] <= 3.001)],
  ['ia_bore_door', 'door_bore', jointOnly('door_disc')],
  ['prop_yard_gate', 'door_yard_gate', jointOnly('leaf_l', 'leaf_r')],
  ['ia_cold_bay_shutter', 'door_cold_bay', jointOnly('shutter')],
]) {
  test(`${id} fills ${mk}`, { skip: glbIsPlaceholder(M.assets[id]._pub, id) ? 'still a placeholder' : false }, async () => {
    const a = await load(id), size = marker(mk).size;
    const [lo, hi] = bbox(a, keep);
    near(hi[0] - lo[0], size[0], TOL, 'width'); near(hi[1] - lo[1], size[1], TOL, 'height');
  });
}

test('ia_hatch fills the 4 x 2 m opening', async () => {
  const a = await load('ia_hatch'), size = marker('ia_hatch').size;
  const [lo, hi] = bbox(a, jointOnly('leaf_a', 'leaf_b'));
  near(hi[0] - lo[0], size[0], TOL, 'length'); near(hi[2] - lo[2], size[2], TOL, 'width');
  assert.ok(hi[1] <= 0.03, `the leaves' tops are at floor level (${hi[1].toFixed(3)} m)`);
});

for (const [id, portal] of [['ia_lift_cage', 'ride_lift_hall'], ['ia_proving_lift_cage', 'ride_proving_lift']]) {
  test(`${id} is the layout's cage (${portal})`, async () => {
    const a = await load(id), [w, h, d] = L.nav.portals.find((p) => p.id === portal).cageInterior;
    const [lo, hi] = bbox(a, (m) => m.material === 'm_mask' );
    near(hi[0] - lo[0], w, 0.08, 'interior width between the grille walls'); near(hi[2] - lo[2], d, 0.08, 'interior depth');
    const [low] = bbox(a, (m, i) => m.joint[i] === 'root' && m.tris[i].every((p) => p[1] > 2.5 && Math.abs(p[0]) < w / 2 - 0.2 && Math.abs(p[2]) < d / 2 - 0.2));
    assert.ok(low[1] >= h - 0.01, `clear height ${low[1].toFixed(2)} m under the roof beams (the layout's cage is ${h} m)`);
    const floor = bbox(a, (m, i) => m.joint[i] === 'root' && m.tris[i].every((p) => p[1] < 0.02));
    near(floor[1][1], 0, 0.02, 'floor level');
  });
}

// ---- nodePos nodes on their partner markers
const B = M.bindings;
function place(kind, key) {
  const b = B[kind][key]; const one = Array.isArray(b) ? b[0] : b;
  const mk = kind === 'prop' ? L.markers.find((m) => m.type === 'prop' && m.params?.prop === key) : marker(key);
  return { ...placement(mk, one.offset ?? [0, 0, 0], one.scale ?? 1), asset: one.asset };
}
const cases = [
  ...['s', 'm', 'n'].map((k) => ['ia_shutter', 'latch', () => place('puzzleElement', `shutter_${k}`), `ia_latch_${k}`]),
  ['prop_share_cloth', 'cord', () => place('prop', 'share_cloth'), 'ia_cloth_cord'],
  ['prop_share_cloth', 'cloth', () => place('prop', 'share_cloth'), 'prop_share_cloth'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ['ia_bore_door', `port_${n}`, () => place('door', 'door_bore'), `ia_ask_port_${n}`]),
  ['prop_sighting_loop', 'loop_rim', () => place('puzzleElement', 'pz_sighting_loop'), 'pz_sighting_loop'],
  ['ia_proving_lift_cage', 'control', () => placement(marker('lift_depart_bore')), 'ia_proving_lift'],
  ['sec_loft_bell', 'rope', () => place('prop', 'insulator_bell'), 'sec_loft_bell_rope'],
  ['ia_yard_bell', 'bell', () => place('interactable', 'ia_yard_bell'), 'ia_yard_bell'],
];
for (const [id, name, where, partner] of cases) {
  test(`${id}.${name} lands on ${partner}`, async () => {
    const a = await load(id), p = where().toWorld(a.nodes[name]);
    const d = dist(p, marker(partner).pos);
    assert.ok(d <= TOL, `${name} at (${p.map((v) => v.toFixed(3)).join(', ')}), ${partner} at (${marker(partner).pos.join(', ')}): ${d.toFixed(3)} m apart`);
  });
}

test('prop_stock_gate.hook_n + (0, -0.81, 0) is ia_jug_n: the jugs hang on the hooks', async () => {
  const a = await load('prop_stock_gate'), pl = place('door', 'door_jug_gate');
  for (let n = 1; n <= 6; n++) {
    const h = a.nodes[`hook_${n}`], p = pl.toWorld([h[0], h[1] - 0.81, h[2]]), d = dist(p, marker(`ia_jug_${n}`).pos);
    assert.ok(d <= TOL, `hook_${n}: ${d.toFixed(3)} m from ia_jug_${n}`);
  }
});

for (const [id, key, knot] of [['ia_yard_door', 'ia_yard_door', 'knot_yard_latch'], ['ia_hatch', 'ia_hatch', 'knot_hatch_latch'], ['ia_cold_bay_shutter', 'door_cold_bay', 'knot_cold_bay']]) {
  test(`${id}.socket_knot is on ${knot} (the knot's centre; its collar's back is 0.08 m behind)`, async () => {
    const a = await load(id), p = place('door', key).toWorld(a.nodes.socket_knot);
    const d = dist(p, marker(knot).pos);
    assert.ok(d <= TOL, `socket_knot at (${p.map((v) => v.toFixed(3)).join(', ')}), ${knot} at (${marker(knot).pos.join(', ')}): ${d.toFixed(3)} m apart`);
  });
}
