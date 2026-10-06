// proj_canister (piece art-boss-windlass; order art-boss 4.3): 80 triangles, one m_prop mesh, pivot at the centre.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, gltfIO } from '../../tools/pipeline-lib.mjs';

test('check-glb passes proj_canister', () => {
  const r = spawnSync(process.execPath, ['tools/check-glb.mjs', 'proj_canister'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('a squat pot 0.35 across and 0.30 tall about its centre, at most 80 triangles, one unskinned m_prop mesh', async () => {
  const io = await gltfIO();
  const doc = await io.read(path.join(ROOT, 'public/assets/boss/proj_canister.glb'));
  const meshes = doc.getRoot().listNodes().filter((n) => n.getMesh());
  assert.equal(meshes.length, 1); assert.equal(doc.getRoot().listSkins().length, 0); assert.equal(doc.getRoot().listAnimations().length, 0);
  const prim = meshes[0].getMesh().listPrimitives()[0];
  assert.equal(prim.getMaterial().getName(), 'm_prop');
  const tris = prim.getIndices().getCount() / 3;
  assert.ok(tris <= 80, `${tris} triangles`);
  const P = prim.getAttribute('POSITION'), lo = [9, 9, 9], hi = [-9, -9, -9], e = [];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], e[k]); hi[k] = Math.max(hi[k], e[k]); } }
  assert.ok(Math.abs(hi[1] - lo[1] - 0.30) < 0.005 && Math.abs(hi[1] + lo[1]) < 0.005, `height ${hi[1] - lo[1]} about y = 0`);
  for (const k of [0, 2]) assert.ok(hi[k] - lo[k] > 0.31 && hi[k] - lo[k] <= 0.351 && Math.abs(hi[k] + lo[k]) < 0.03, `axis ${k}: ${lo[k]} .. ${hi[k]}`);
  console.log(`proj_canister: ${tris} triangles, ${(hi[0] - lo[0]).toFixed(3)} x ${(hi[1] - lo[1]).toFixed(3)} x ${(hi[2] - lo[2]).toFixed(3)} m`);
});
