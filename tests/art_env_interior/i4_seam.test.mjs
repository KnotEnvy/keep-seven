// Look pass i4 (visual reviewer: "a red noisy panel at the head of the peg stair"). On the seam (cell_tally_seam: the
// staged flight 1, landing 1 and the top of flight 2, before trg_set_swap) only chunk_gl_stair of the gallery is drawn.
// The wall of the stair's shaft over the proving bay's mouth (x -87..-85, y -7..-1 at z -18) had its centre on the line
// between the two chunks' boxes and went to chunk_gl_bay: from the seam she saw the sky through it. It belongs to the
// stair's chunk (blender/env_interior/env_the_gallery.py, `shaft_end`). This reads the shipped GLB: the area of the
// stair chunk's triangles in that plane must cover the wall (12 m2), and the bay's chunk must hold none of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { M } from './common.mjs';

test('the gallery: the shaft wall over the bay mouth is in the stair chunk (drawn on the seam)', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(M.assets.env_the_gallery._pub);
  const area = { chunk_gl_stair: 0, chunk_gl_bay: 0 };
  for (const n of doc.getRoot().listNodes()) {
    const chunk = n.getName().split('__')[0];
    if (!n.getMesh() || !(chunk in area) || !n.getName().endsWith('__m_pellam')) continue;
    const m = n.getWorldMatrix();
    const at = (e) => [m[0] * e[0] + m[4] * e[1] + m[8] * e[2] + m[12], m[1] * e[0] + m[5] * e[1] + m[9] * e[2] + m[13], m[2] * e[0] + m[6] * e[1] + m[10] * e[2] + m[14]];
    for (const p of n.getMesh().listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), e = [0, 0, 0];
      for (let i = 0; i < idx.getCount(); i += 3) {
        const t = [0, 1, 2].map((k) => at(pos.getElement(idx.getScalar(i + k), e)));
        if (!t.every((v) => Math.abs(v[2] + 18) < 0.02 && v[0] > -87.02 && v[0] < -84.98 && v[1] > -7.02 && v[1] < -0.98)) continue;
        area[chunk] += Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;
      }
    }
  }
  assert.ok(area.chunk_gl_stair > 11.9, `the stair chunk holds ${area.chunk_gl_stair.toFixed(2)} m2 of the 12 m2 wall over the mouth`);
  assert.ok(area.chunk_gl_bay < 0.01, `the bay chunk still holds ${area.chunk_gl_bay.toFixed(2)} m2 of it`);
});
