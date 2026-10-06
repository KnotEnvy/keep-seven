// art-weapons 5: one cartridge everywhere. Overall length 41 +- 1 mm and case diameter 12 +- 0.5 mm in every variant of the
// three cartridge props AND in the rounds the gun's left hand handles (round_hand_*, kept_loop); the kept band 9 +- 1 mm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { M, loadGlb, rotate } from './lib.mjs';
import { glbJson } from '../../tools/pipeline-lib.mjs';

/** verts [[x, y, z]] of one round, `origin` its case head centre, `axis` its unit axis -> { length, diameter, band } in mm */
function measure(verts, origin, axis) {
  const rows = verts.map((v) => { const d = [v[0] - origin[0], v[1] - origin[1], v[2] - origin[2]]; const t = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]; return [t * 1000, Math.hypot(d[0] - axis[0] * t, d[1] - axis[1] * t, d[2] - axis[2] * t) * 1000]; });
  const ts = rows.map((r) => r[0]);
  const length = Math.max(...ts) - Math.min(...ts);
  // the case wall: rings between 3 and 30 mm up the case, the band (a sleeve 0.2 mm proud) left out
  const wall = rows.filter(([t, r]) => t > 2.5 && t < 11.5 || t > 22 && t < 33.5).map((r) => r[1]);
  const diameter = 2 * Math.max(...wall);
  const sleeve = rows.filter(([t, r]) => t > 2.5 && t < 32 && r > Math.max(...wall) + 0.1).map((r) => r[0]);
  const band = sleeve.length ? Math.max(...sleeve) - Math.min(...sleeve) : 0;
  return { length, diameter, band };
}

const fmt = (m) => `${m.length.toFixed(1)} x ${m.diameter.toFixed(2)} mm` + (m.band ? `, band ${m.band.toFixed(1)} mm` : '');

test('the three cartridge props: every variant is 41 mm long on a 12 mm case, pivot at the case head; the kept band is 9 mm', async () => {
  for (const id of ['prop_cartridge_lead', 'prop_cartridge_line', 'prop_cartridge_kept']) {
    const g = await loadGlb(id);
    const want = M.assets[id].nodes.length ? M.assets[id].nodes : [null];
    assert.equal(g.meshes.length, want.length, `${id}: ${g.meshes.length} meshes`);
    for (const m of g.meshes) {
      if (want[0]) assert.ok(want.includes(m.node), `${id}: unexpected mesh node ${m.node}`);
      const o = g.nodes[m.node].pos;
      const r = measure(m.verts, o, [0, 1, 0]);                                  // game space: a cartridge stands on its head, nose up
      const spent = /spent/.test(m.node);
      console.log(`${id} / ${m.node}: ${fmt(r)}, ${m.tris} tris`);
      const lo = Math.min(...m.verts.map((v) => v[1] - o[1])) * 1000;
      assert.ok(Math.abs(lo) < 0.05, `${id}/${m.node}: the pivot is not the case head (lowest vertex ${lo} mm)`);
      if (spent) assert.ok(Math.abs(r.length - 33) <= 1, `${m.node}: an empty case is 33 mm, got ${r.length}`);
      else assert.ok(Math.abs(r.length - 41) <= 1, `${m.node}: overall ${r.length} mm`);
      assert.ok(Math.abs(r.diameter - 12) <= 0.5, `${m.node}: case ${r.diameter} mm`);
      if (id === 'prop_cartridge_kept') assert.ok(Math.abs(r.band - 9) <= 1, `${m.node}: band ${r.band} mm`);
      else assert.equal(r.band, 0);
    }
  }
});

test('the rounds in the gun are the same cartridge: round_hand_lead / _line / _kept and kept_loop (41 x 12 mm; the loop round wears the 9 mm band)', async () => {
  const g = await loadGlb('weapon_revolver');
  const arms = g.meshes.find((m) => m.node === 'arms_mesh');
  const js = glbJson(M.assets.weapon_revolver._pub);
  for (const b of ['round_hand_lead', 'round_hand_line', 'round_hand_kept', 'kept_loop']) {
    const node = g.nodes[b], m = node.m;
    const axis = [m[4], m[5], m[6]], len = Math.hypot(...axis); axis.forEach((x, i) => { axis[i] = x / len; });      // the bone's own +Y: head -> nose
    // the bone's vertices within 60 mm of its head (round_hand_lead / _line also carry a band half 0.75 m behind; the loop's leather strap rides arm_l)
    const verts = arms.verts.filter((v, i) => arms.joints[i] === b && Math.hypot(v[0] - node.pos[0], v[1] - node.pos[1], v[2] - node.pos[2]) < 0.06);
    assert.ok(verts.length >= 30, `${b}: ${verts.length} vertices`);
    const r = measure(verts, node.pos, axis);
    console.log(`weapon_revolver / ${b}: ${fmt(r)} (${verts.length} vertices)`);
    assert.ok(Math.abs(r.length - 41) <= 1, `${b}: overall ${r.length} mm`);
    assert.ok(Math.abs(r.diameter - 12) <= 0.5, `${b}: case ${r.diameter} mm`);
    if (b === 'kept_loop') assert.ok(Math.abs(r.band - 9) <= 1, `kept_loop: band ${r.band} mm`);
  }
  // the six case heads in the cylinder: a 13 mm rim on each round_n bone
  const gun = g.meshes.find((mm) => mm.node === 'gun_mesh');
  for (let i = 1; i <= 6; i++) {
    const b = `round_${i}`, o = g.nodes[b].pos;
    const verts = gun.verts.filter((v, k) => gun.joints[k] === b);
    assert.ok(verts.length >= 8, `${b}: no case head`);
    const d = 2 * Math.max(...verts.map((v) => Math.hypot(v[0] - o[0], v[1] - o[1], v[2] - o[2]))) * 1000;
    assert.ok(d > 12 && d < 14.5, `${b}: case head ${d} mm across`);
  }
});

test('the pickups: pk_rounds_6 0.14 x 0.06 x 0.09, pk_rounds_12 0.18 x 0.07 x 0.12, pivot at the base centre', async () => {
  for (const [id, size] of [['pk_rounds_6', [0.14, 0.06, 0.09]], ['pk_rounds_12', [0.18, 0.07, 0.12]]]) {
    const g = await loadGlb(id);
    const all = g.meshes.flatMap((m) => m.verts);
    const mn = [0, 1, 2].map((k) => Math.min(...all.map((v) => v[k]))), mx = [0, 1, 2].map((k) => Math.max(...all.map((v) => v[k])));
    const dim = mx.map((v, k) => v - mn[k]);
    console.log(`${id}: ${dim.map((x) => x.toFixed(3)).join(' x ')} m (x, y up, z), base at y ${mn[1].toFixed(4)}, centre x ${((mn[0] + mx[0]) / 2).toFixed(3)} z ${((mn[2] + mx[2]) / 2).toFixed(3)}`);
    assert.ok(Math.abs(dim[0] - size[0]) < 0.02 && Math.abs(dim[1] - size[1]) < 0.02 && Math.abs(dim[2] - size[2]) < 0.02, `${id}: ${dim}`);
    assert.ok(Math.abs(mn[1]) < 0.002 && Math.abs(mn[0] + mx[0]) < 0.03 && Math.abs(mn[2] + mx[2]) < 0.03, `${id}: the pivot is not the base centre`);
  }
});
