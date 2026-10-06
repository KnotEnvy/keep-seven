// The build's own verdict on the five interior files, and the piece's status (work order art-env-interior 5):
// `node tools/check-glb.mjs` on every id (triangles, draw calls, chunk plan, boxes, lamp sets, bake extras, thin parts,
// dressing allowance) and `asset-status --require=0 --owner env_interior` (no P0 asset is still a placeholder).
import test from 'node:test';
import assert from 'node:assert/strict';
import { node, M } from './common.mjs';

const IDS = ['env_tally_house', 'env_the_gallery', 'env_lift_hall', 'env_the_bore', 'env_lift_shaft'];

test('check-glb passes on the five interior files', () => {
  const r = node(['tools/check-glb.mjs', ...IDS]);
  assert.equal(r.code, 0, r.out);
  for (const id of IDS) assert.match(r.out, new RegExp(`(ok|pass|PASS|✔)[^\\n]*${id}|${id}[^\\n]*(ok|pass|PASS)`, 'i'), `check-glb printed no verdict for ${id}:\n${r.out}`);
  console.log(r.out.split('\n').filter((l) => IDS.some((id) => l.includes(id))).map((l) => '    ' + l.trim()).join('\n'));
});

test('asset-status --require=0 --owner env_interior: no P0 asset is a placeholder', () => {
  const r = node(['tools/asset-status.mjs', '--require=0', '--owner', 'env_interior']);
  assert.equal(r.code, 0, r.out);
  console.log(r.out.split('\n').slice(0, 3).map((l) => '    ' + l).join('\n'));
});

test('budgets of the order: triangles and draw calls per zone and per chunk, the download share', async () => {
  const { gltfIO } = await import('../../tools/pipeline-lib.mjs');
  const fs = await import('node:fs');
  const io = await gltfIO();
  const limits = { env_tally_house: [17000, 4], env_the_gallery: [32000, 10], env_lift_hall: [36000, 4], env_the_bore: [40000, 10], env_lift_shaft: [800, 7] };
  let bytes = 0;
  for (const id of IDS) {
    const a = M.assets[id]; bytes += fs.statSync(a._pub).size;
    const doc = await io.read(a._pub);
    let tris = 0, calls = 0; const perChunk = {};
    for (const n of doc.getRoot().listNodes()) {
      const mesh = n.getMesh(); if (!mesh) continue;
      for (const p of mesh.listPrimitives()) {
        const t = p.getIndices().getCount() / 3; tris += t; calls++;
        const c = n.getName().split('__')[0]; if (n.getName().includes('__')) perChunk[c] = (perChunk[c] ?? 0) + t;
      }
    }
    assert.ok(tris <= limits[id][0], `${id}: ${tris} triangles > ${limits[id][0]}`);
    assert.ok(calls <= limits[id][1], `${id}: ${calls} draw calls > ${limits[id][1]}`);
    for (const c of a.chunks ?? []) assert.ok((perChunk[c.id] ?? 0) <= c.tris, `${id} ${c.id}: ${perChunk[c.id]} triangles > its share ${c.tris}`);
    console.log(`    ${id}: ${tris} triangles, ${calls} draw calls ${a.chunks ? '(' + a.chunks.map((c) => `${c.id} ${perChunk[c.id] ?? 0}/${c.tris}`).join(', ') + ')' : ''}`);
  }
  let lm = 0;
  for (const t of ['lm_tally', 'lm_tally_hatch', 'lm_gallery', 'lm_hall', 'lm_bore', 'lm_bore_glow']) lm += fs.statSync(M.textures[t]._pub).size;
  console.log(`    download: GLBs ${(bytes / 1048576).toFixed(2)} MB (share 2.5), lightmaps ${(lm / 1048576).toFixed(2)} MB (share 3.0)`);
  assert.ok(bytes <= 2.5 * 1048576, `the five GLBs are ${(bytes / 1048576).toFixed(2)} MB > 2.5 MB`);
  assert.ok(lm <= 3.0 * 1048576, `the six lightmaps are ${(lm / 1048576).toFixed(2)} MB > 3.0 MB`);
});

test('env_lift_shaft: a 6.4 x 12 x 6.4 m shell on its pivot, six lamp bars as nodes of their own, no horizontal edge on the shell', async () => {
  const { gltfIO, worldMatrix, mat4Point } = await import('../../tools/pipeline-lib.mjs');
  const io = await gltfIO();
  const a = M.assets.env_lift_shaft;
  const doc = await io.read(a._pub);
  const nodes = doc.getRoot().listNodes();
  assert.notEqual(nodes.find((n) => n.getName() === 'env_lift_shaft')?.getExtras()?.placeholder, true, 'env_lift_shaft is still the placeholder');
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; let level = 0, tris = 0;
  for (const n of nodes) {
    const mesh = n.getMesh(); if (!mesh || n.getName().startsWith('lamp_bar_')) continue;
    const m = worldMatrix(n);
    for (const p of mesh.listPrimitives()) {
      assert.equal(p.getMaterial().getName(), 'm_pellam');
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), e = [0, 0, 0], w = [];
      for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, e); const q = mat4Point(m, e); w.push(q); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }
      // a face that lies level (its normal is vertical) would be a ledge, a bracket or a cap: something that shows the shell standing still
      for (let i = 0; i < idx.getCount(); i += 3) {
        const [p0, p1, p2] = [0, 1, 2].map((k) => w[idx.getScalar(i + k)]); tris++;
        const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
        if (Math.abs(ny) > 0.3 * Math.hypot(nx, ny, nz)) level++;
      }
    }
  }
  assert.ok(Math.abs(lo[0] + 3.2) < 0.01 && Math.abs(hi[0] - 3.2) < 0.01 && Math.abs(lo[2] + 3.2) < 0.01 && Math.abs(hi[2] - 3.2) < 0.01, `footprint ${lo[0]}..${hi[0]} x ${lo[2]}..${hi[2]} (6.4 x 6.4 on the pivot)`);
  assert.ok(Math.abs(lo[1]) < 0.01 && Math.abs(hi[1] - 12) < 0.01, `height ${lo[1]}..${hi[1]} (0..12 above the cage floor)`);
  assert.equal(level, 0, `${level} of ${tris} shell triangles are not vertical`);
  for (let i = 1; i <= 6; i++) {
    const n = nodes.find((x) => x.getName() === `lamp_bar_${i}`);
    assert.ok(n?.getMesh(), `lamp_bar_${i} is a mesh node`);
    assert.equal(n.getMesh().listPrimitives().length, 1); assert.equal(n.getMesh().listPrimitives()[0].getMaterial().getName(), 'm_emis');
    const t = mat4Point(worldMatrix(n), [0, 0, 0]);
    assert.ok(Math.hypot(t[0], t[1] - (2 * i - 1), t[2] - 3.2) < 0.01, `lamp_bar_${i} origin ${t.map((v) => v.toFixed(2))} (0, ${2 * i - 1}, 3.2)`);
  }
  console.log(`    env_lift_shaft: ${tris} shell triangles, all vertical; bars at y 1, 3, 5, 7, 9, 11 on the +z wall`);
});
