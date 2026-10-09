// Look pass i5 (visual reviewer, major: "bright cyan slivers cross the boss room's lift doorway"). The chamber's two 3 x 3 m
// openings (the bore door at z 81, the proving-lift gate at z 111; x 12.5..15.5, floor -44) are cut out of the six-fold
// sector by face centre, and the livery band and the lamp's conduit kept a triangle each whose point stood in the
// opening (blender/env_interior/env_the_bore.py, `cut_at_opening`). This reads the shipped GLB: no triangle of the room's
// shell may lie in the plane of either wall inside its opening.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { M, fmt } from './common.mjs';

test('the bore: nothing of the wall hangs in the bore door or the proving-lift gate', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(process.env.KS_BORE_GLB || M.assets.env_the_bore._pub);
  const FL = -44, bad = [];
  let seen = 0;
  for (const n of doc.getRoot().listNodes()) {
    if (!n.getMesh() || !n.getName().startsWith('chunk_bo_chamber')) continue;
    const m = n.getWorldMatrix();
    const at = (e) => [m[0] * e[0] + m[4] * e[1] + m[8] * e[2] + m[12], m[1] * e[0] + m[5] * e[1] + m[9] * e[2] + m[13], m[2] * e[0] + m[6] * e[1] + m[10] * e[2] + m[14]];
    for (const p of n.getMesh().listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), e = [0, 0, 0];
      for (let i = 0; i < idx.getCount(); i += 3) {
        const t = [0, 1, 2].map((k) => at(pos.getElement(idx.getScalar(i + k), e)));
        seen++;
        for (const zw of [81, 111]) {
          if (!t.every((v) => Math.abs(v[2] - zw) < 0.2)) continue;
          const c = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, zw];
          const inside = (v) => Math.abs(v[0] - 14) < 1.4 && v[1] > FL + 0.05 && v[1] < FL + 2.9;
          if (inside(c) || t.some(inside)) bad.push(`${n.getName()} ${t.map(fmt).join(' ')}`);
        }
      }
    }
  }
  assert.ok(seen > 20000, `read ${seen} triangles of the chamber`);
  assert.equal(bad.length, 0, `${bad.length} triangle(s) in an opening:\n${bad.slice(0, 6).join('\n')}`);
});
