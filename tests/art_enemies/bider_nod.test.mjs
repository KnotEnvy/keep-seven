// Pass i1 (look team creatures-props): the nine at the tally table are one instanced mesh, and the render system turns each
// one's head a little about its neck (src/render/materials.ts DYN_VERT, the BREATH block). The weight is UV1.y of
// bider_table_static, the pivot is a constant of the shader: this file holds the two to each other and keeps every other
// breathing static at UV1.y = 0 (a freed Bider's static body must not pop to another head pose when it replaces the skinned one).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ROOT } from '../harness.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
async function read(id) {
  const doc = await io.read(path.join(ROOT, 'blender/export/enemies', id + '.glb'));
  let pivot = null; const v = [];
  for (const n of doc.getRoot().listNodes()) {
    const e = n.getExtras();
    if (e && Array.isArray(e.nod_pivot)) pivot = e.nod_pivot;
    const m = n.getMesh(); if (!m) continue;
    const me = m.getExtras(); if (me && Array.isArray(me.nod_pivot)) pivot = me.nod_pivot;
    for (const p of m.listPrimitives()) {
      const u1 = p.getAttribute('TEXCOORD_1'), pos = p.getAttribute('POSITION');
      if (!u1) continue;
      for (let i = 0; i < u1.getCount(); i++) v.push({ w: u1.getElement(i, [])[1], p: pos.getElement(i, []) });
    }
  }
  return { pivot, v };
}

test('bider_table_static: UV1.y is the head\'s weight, and the shader turns the head about the asset\'s own neck', async () => {
  const { pivot, v } = await read('bider_table_static');
  assert.ok(pivot, 'the build writes the extra nod_pivot (game space)');
  const src = fs.readFileSync(path.join(ROOT, 'src/render/materials.ts'), 'utf8');
  const m = /NOD_PIVOT = vec3\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)/.exec(src);
  assert.ok(m, 'materials.ts names NOD_PIVOT');
  const shader = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = Math.hypot(...shader.map((x, i) => x - pivot[i]));
  console.log(`  nod pivot: asset (${pivot.join(', ')}), shader (${shader.join(', ')}): ${(d * 1000).toFixed(1)} mm apart`);
  assert.ok(d <= 0.005, `the shader's pivot is ${(d * 1000).toFixed(1)} mm from the asset's neck: copy the build log's "nod pivot" into NOD_PIVOT`);
  // pass i2: the body carries 0.02, not 0 (the shader's mark for "this mesh slumps": uv1.y > 0.01); the head's weight runs 0.02 .. 1
  const head = v.filter((x) => x.w > 0.99), body = v.filter((x) => x.w < 0.03);
  console.log(`  ${v.length} vertices: ${head.length} of the head, ${body.length} of the body, ${v.length - head.length - body.length} between (the gathers at the cord)`);
  assert.ok(head.length > 60 && body.length > 150, 'a head and a body');
  assert.ok(v.every((x) => x.w >= -1e-3 && x.w <= 1 + 1e-3), 'weights are 0..1');
  // everything of the head is above the pivot's own height less a hand, and nothing of the body turns
  assert.ok(head.every((x) => x.p[1] > pivot[1] - 0.06), 'no head-weighted vertex hangs under the neck');
  assert.ok(Math.max(...body.map((x) => x.p[1])) < pivot[1] + 0.12, 'nothing of the unweighted body stands in the head');
});

test('bider_seated_static: UV1.y is 0 on every vertex (its head keeps the pose the skinned Bider sat down in)', async () => {
  const { v } = await read('bider_seated_static');
  assert.ok(v.length > 100, 'it carries the breath weight in UV1');
  assert.ok(v.every((x) => Math.abs(x.w) < 1e-3), `UV1.y up to ${Math.max(...v.map((x) => x.w))}`);
});
