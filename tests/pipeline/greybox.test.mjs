// The greybox zone GLBs (built in Python from the layout solids) agree with the runtime colliders (src/core/greybox.ts):
//   * every vertex of a chunk mesh lies within 1 cm of the surface of the runtime collider set (>= 2000 vertices a zone,
//     or all of them);
//   * at every nav node a downward ray onto the GLB's chunk meshes returns the node's y within 2 cm.
// That is a statement about the PLACEHOLDER (root extra `placeholder: true`). Once an env builder ships the final zone
// (bevels, trim, sculpted terrain, dressing: nothing lies on the blockout any more), only what final art still owes the
// colliders is asked: a floor under every nav node within 5 cm of the collider floor the player stands on (0.3 m on
// sculpted terrain, the tolerance check-glb gives collider_terrain).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadManifest, loadLayout, gltfIO, worldMatrix, mat4Point } from '../../tools/pipeline-lib.mjs';
import { buildPlaceholderCopies } from './common.mjs';
import { buildSolidColliders } from '../../src/core/greybox.ts';
import { World } from '../../tools/layout_geom.mjs';

const M = loadManifest(), L = loadLayout();

function pointTriDist2(p, t, o) {
  // squared distance from point p to triangle t[o..o+8] (Ericson, Real-Time Collision Detection 5.1.5)
  const ax = t[o], ay = t[o + 1], az = t[o + 2], bx = t[o + 3], by = t[o + 4], bz = t[o + 5], cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; } else {
    const bpx = p[0] - bx, bpy = p[1] - by, bpz = p[2] - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; } else {
        const cpx = p[0] - cx, cpy = p[1] - cy, cpz = p[2] - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz); } else {
              const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
              qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  return (p[0] - qx) ** 2 + (p[1] - qy) ** 2 + (p[2] - qz) ** 2;
}
function rayDown(tris, x, z, yFrom) {
  let best = null;
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], az = tris[t + 2], bx = tris[t + 3], bz = tris[t + 5], cx = tris[t + 6], cz = tris[t + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    const y = u * tris[t + 1] + v * tris[t + 4] + w * tris[t + 7];
    if (y <= yFrom + 1e-6 && (best === null || y > best)) best = y;
  }
  return best;
}

const FINAL_FLOOR_TOL = 0.05, FINAL_TERRAIN_TOL = 0.30;

/** Compare one zone GLB (a glTF-transform Document) with the runtime colliders. Returns what it measured. */
function compare(doc, zone) {
  const root = doc.getRoot().listNodes().find((n) => n.getName() === M.zones[zone.id].env);
  const placeholder = !!root?.getExtras().placeholder;
  const verts = [], tris = [];
  for (const n of doc.getRoot().listNodes()) {
    if (!n.getMesh() || !n.getName().includes('__')) continue;
    const m = worldMatrix(n);
    for (const p of n.getMesh().listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), e = [0, 0, 0], w = [];
      for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, e); w.push(mat4Point(m, e)); }
      verts.push(...w);
      for (let i = 0; i < idx.getCount(); i++) tris.push(...w[idx.getScalar(i)]);
    }
  }
  const col = buildSolidColliders(L, [zone.id], zone.set);
  assert.ok(col.triangles > 0 && verts.length > 0);
  const out = { placeholder, checked: 0, bad: 0, worst: 0, colliderTriangles: col.triangles, nodes: 0, off: [] };
  // (1) vertices on the collider surface: the greybox only
  if (placeholder) {
    const step = Math.max(1, Math.floor(verts.length / 4000));
    for (let i = 0; i < verts.length; i += step) {
      let best = Infinity;
      for (let t = 0; t < col.positions.length && best > 1e-10; t += 9) { const d = pointTriDist2(verts[i], col.positions, t); if (d < best) best = d; }
      const d = Math.sqrt(best); out.checked++;
      if (d > out.worst) out.worst = d;
      if (d > 0.01) out.bad++;
    }
    assert.ok(out.checked >= Math.min(2000, verts.length), `sampled ${out.checked} of ${verts.length} vertices`);
  }
  // (2) nav nodes stand on the GLB
  const T = Float64Array.from(tris);
  const world = new World(L.solids.filter((s) => s.zone === zone.id && !s.dynamic));      // the same rule as tools/check-glb.mjs
  const onTerrain = (p) => { const g = world.ground(p[0], p[2], p[1], 0.5, 1.2); return !!g && g.solid.role === 'terrain'; };
  for (const n of L.nav.nodes) {
    if (n.zone !== zone.id) continue;
    out.nodes++;
    const tol = placeholder ? 0.02 : onTerrain(n.pos) ? FINAL_TERRAIN_TOL : FINAL_FLOOR_TOL;
    const y = rayDown(T, n.pos[0], n.pos[2], n.pos[1] + 0.5);
    if (y === null || Math.abs(y - n.pos[1]) > tol) out.off.push(`${n.id} (glb ${y === null ? 'no hit' : y.toFixed(3)}, node ${n.pos[1]}, tolerance ${tol})`);
  }
  return out;
}

for (const zone of L.zones) {
  test(`greybox of ${zone.id} agrees with the runtime colliders`, async () => {
    const id = M.zones[zone.id].env, a = M.assets[id];
    const io = await gltfIO();
    const r = compare(await io.read(a._pub), zone);
    if (r.placeholder) {
      assert.equal(r.bad, 0, `${r.bad} of ${r.checked} sampled vertices are more than 1 cm off the collider surface (worst ${r.worst.toFixed(4)} m)`);
      console.log(`    ${id}: ${r.checked} vertices within ${(r.worst * 1000).toFixed(2)} mm of ${r.colliderTriangles} collider triangles; ${r.nodes - r.off.length}/${r.nodes} nav nodes within 2 cm`);
    } else console.log(`    ${id} is FINAL ART: the vertex-on-collider comparison is the greybox's and is skipped; ${r.nodes - r.off.length}/${r.nodes} nav nodes have a floor within ${FINAL_FLOOR_TOL} m (${FINAL_TERRAIN_TOL} m on terrain)`);
    assert.deepEqual(r.off, [], `nav nodes off the ${r.placeholder ? 'greybox' : 'zone'} floor: ${r.off.slice(0, 8).join(', ')}`);
  });
}

// Dressing empties (ARCHITECTURE 7.5): world instantiates `inst_<nnn>` / `brk_<nnn>` generically from the extras
// {asset, node?, wind?}; render draws them as instanced sets. The placeholder zones carry real ones (two or three inst
// and one brk from the zone's allowance) so both code paths run against files before the zone artists place theirs.
for (const zone of L.zones) {
  test(`dressing empties of ${zone.id}: placeholder anchors with extras, on a floor, off the nav links`, async () => {
    const id = M.zones[zone.id].env, allow = M.zones[zone.id].dressing ?? { assets: [] };
    const io = await gltfIO();
    const doc = await io.read(M.assets[id]._pub);
    const nodes = doc.getRoot().listNodes();
    const placeholder = !!nodes.find((n) => n.getName() === id)?.getExtras().placeholder;
    const dress = nodes.filter((n) => /^(inst|brk)_\d{3}$/.test(n.getName()));
    const inst = dress.filter((n) => n.getName().startsWith('inst_')), brk = dress.filter((n) => n.getName().startsWith('brk_'));
    assert.equal(new Set(dress.map((n) => n.getName())).size, dress.length, 'dressing empty names are unique');
    if (!allow.assets.length) { assert.equal(dress.length, 0, `${zone.id} has no dressing allowance: no empties`); return; }
    if (placeholder) {
      assert.ok(inst.length >= 2 && inst.length <= 3, `placeholder ${id} carries 2 or 3 inst_ empties (has ${inst.length})`);
      assert.equal(brk.length, 1, `placeholder ${id} carries one brk_ empty (has ${brk.length})`);
    }
    const tris = [];
    for (const n of nodes) {
      if (!n.getMesh() || !n.getName().includes('__')) continue;
      const m = worldMatrix(n);
      for (const p of n.getMesh().listPrimitives()) {
        const pos = p.getAttribute('POSITION'), idx = p.getIndices(), e = [0, 0, 0];
        for (let i = 0; i < idx.getCount(); i++) { pos.getElement(idx.getScalar(i), e); tris.push(...mat4Point(m, e)); }
      }
    }
    const T = Float64Array.from(tris);
    const byId = new Map(L.nav.nodes.map((n) => [n.id, n]));
    const segs = L.nav.links.map(([a, b]) => [byId.get(a).pos, byId.get(b).pos]);
    const sets = new Set();
    for (const n of dress) {
      const ex = n.getExtras(), name = n.getName(), d = M.assets[ex.asset];
      assert.equal(n.getMesh(), null, `${name} is an empty`);
      assert.ok(d, `${name}: extras.asset '${ex.asset}' is a manifest asset`);
      assert.ok(allow.assets.includes(ex.asset), `${name}: ${ex.asset} is in the dressing allowance of ${zone.id} (${allow.assets.join(', ')})`);
      assert.equal(d.instanced, true, `${name}: ${ex.asset} is an instanced asset`);
      if ((d.nodes ?? []).length) assert.ok(d.nodes.includes(ex.node), `${name}: extras.node '${ex.node}' is a variant node of ${ex.asset} (${d.nodes.join(', ')})`);
      else assert.equal(ex.node, undefined, `${name}: ${ex.asset} has no variant nodes, so no node extra`);
      sets.add(`${ex.asset}/${ex.node ?? ''}`);
      if (!placeholder) continue;
      const m = worldMatrix(n), p = [m[12], m[13], m[14]];
      const hung = d.placeholder.anchor === 'top';
      const y = rayDown(T, p[0], p[2], p[1] + 0.1);
      assert.ok(y !== null && Math.abs(p[1] - y - (hung ? 1.7 : 0)) < 0.02, `${name} (${ex.asset}) ${hung ? 'hangs 1.7 m above' : 'stands on'} the greybox floor (floor ${y}, empty ${p[1].toFixed(3)})`);
      let best = Infinity;
      for (const [a, b] of segs) {
        const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz;
        const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / l2));
        if (Math.abs(a[1] + (b[1] - a[1]) * t - y) > 2.5) continue;
        best = Math.min(best, Math.hypot(p[0] - (a[0] + dx * t), p[2] - (a[2] + dz * t)));
      }
      assert.ok(best >= 0.9, `${name} is ${best.toFixed(2)} m from the nearest nav link (>= 0.9 m: it never blocks a path)`);
    }
    assert.ok(sets.size <= allow.drawCalls, `${sets.size} instanced sets <= the allowance of ${allow.drawCalls} draw calls`);
    console.log(`    ${id}: ${inst.length} inst + ${brk.length} brk (${[...sets].join(', ')})${placeholder ? '' : ' [final art: counts are the artist\'s]'}`);
  });
}

test('a final zone is not held to the blockout: vertices may leave the collider surface, floors may not', async () => {
  // what the first env builder's file looks like to this test: no placeholder flag, bevelled / displaced geometry
  const zone = L.zones.find((z) => z.id === 'tally_house'), id = M.zones[zone.id].env;
  const io = await gltfIO();
  // the shipped Tally House is final art since the integration: this test starts from a placeholder copy built for it
  const P = loadManifest(buildPlaceholderCopies());
  const move = async (dy, wallPush) => {
    const doc = await io.read(P.assets[id]._pub);
    const root = doc.getRoot().listNodes().find((n) => n.getName() === id);
    assert.equal(root.getExtras().placeholder, true, 'this test starts from the placeholder zone');
    root.setExtras({ ...root.getExtras(), placeholder: false });
    for (const n of doc.getRoot().listNodes()) {
      if (!n.getMesh() || !n.getName().includes('__')) continue;
      for (const p of n.getMesh().listPrimitives()) {
        const pos = p.getAttribute('POSITION').clone(), arr = Float32Array.from(pos.getArray());
        for (let i = 0; i < arr.length; i += 3) { arr[i] += wallPush * Math.sin(arr[i + 1] * 3.1); arr[i + 1] += dy; }      // a wavy wall, a lifted floor
        pos.setArray(arr); p.setAttribute('POSITION', pos);
      }
    }
    return compare(doc, zone);
  };
  const final = await move(0.03, 0.06);
  assert.equal(final.placeholder, false); assert.equal(final.checked, 0, 'no vertex is compared with the blockout');
  assert.deepEqual(final.off, [], 'a floor 3 cm off the collider floor is accepted');
  const sunk = await move(0.12, 0.0);
  assert.ok(sunk.off.length > 0, 'a floor 12 cm off the collider floor is caught');
  // the same file still flagged as a placeholder is held to the 1 cm rule
  const doc = await io.read(P.assets[id]._pub);
  for (const n of doc.getRoot().listNodes()) if (n.getMesh() && n.getName().includes('__')) for (const p of n.getMesh().listPrimitives()) {
    const pos = p.getAttribute('POSITION').clone(), arr = Float32Array.from(pos.getArray());
    for (let i = 0; i < arr.length; i += 3) arr[i] += 0.06;
    pos.setArray(arr); p.setAttribute('POSITION', pos);
  }
  assert.ok(compare(doc, zone).bad > 0, 'a placeholder 6 cm off the colliders fails');
});
