// art-weapons: the shipped weapon_revolver.glb is drawn single-sided (both materials, FrontSide at run time), so every
// closed part must face OUT. The first build shipped the whole left arm inside-out (mirrored construction flipped once
// too often): Cycles previews are two-sided and did not show it. Run: node --test tests/art_weapons/geometry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { M } from './lib.mjs';
import { gltfIO } from '../../tools/pipeline-lib.mjs';

const io = await gltfIO();
const doc = await io.read(M.assets.weapon_revolver._pub);
const meshNode = (name) => doc.getRoot().listNodes().find((n) => n.getName() === name);

/** triangles of a skinned mesh grouped by the heaviest joint of their first vertex: [[A, B, C]] */
function groups(name) {
  const n = meshNode(name), names = n.getSkin().listJoints().map((j) => j.getName()), out = {};
  let tris = 0;
  for (const p of n.getMesh().listPrimitives()) {
    const P = p.getAttribute('POSITION'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), I = p.getIndices();
    const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    const joint = (i) => { J.getElement(i, j); W.getElement(i, w); let k = 0; for (let q = 1; q < 4; q++) if (w[q] > w[k]) k = q; return names[j[k]]; };
    for (let t = 0; t < I.getCount(); t += 3) {
      const ids = [0, 1, 2].map((e) => I.getScalar(t + e));
      (out[joint(ids[0])] ||= []).push(ids.map((i) => P.getElement(i, [0, 0, 0]))); tris++;
    }
  }
  return { out, tris, material: n.getMesh().listPrimitives()[0].getMaterial() };
}

test('arms_mesh faces out: in every bone group more triangles look away from the group centre than toward it (single-sided materials)', () => {
  const { out, material } = groups('arms_mesh');
  assert.equal(material.getDoubleSided(), false, 'm_prop is single-sided: the test below is what keeps the arms solid');
  const rows = [];
  for (const [bone, tris] of Object.entries(out)) {
    const pts = tris.flat(), c = [0, 1, 2].map((k) => pts.reduce((s, q) => s + q[k], 0) / pts.length);
    let away = 0, toward = 0;
    for (const [A, B, C] of tris) {
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const d = [0, 1, 2].map((k) => (A[k] + B[k] + C[k]) / 3 - c[k]);
      if (g[0] * d[0] + g[1] * d[1] + g[2] * d[2] < 0) toward++; else away++;
    }
    rows.push(`${bone} ${away}/${toward}`);
    assert.ok(away > toward * 1.5, `${bone}: ${away} triangles face away from the part's centre, ${toward} toward it: the part is inside-out`);
  }
  console.log('arms_mesh, triangles facing out / in per bone: ' + rows.join('; '));
});

test('triangle split: gun_mesh <= 3200, arms_mesh <= 2800', () => {
  const g = groups('gun_mesh').tris, a = groups('arms_mesh').tris;
  console.log(`gun_mesh ${g} triangles, arms_mesh ${a} triangles`);
  assert.ok(g <= 3200, `gun_mesh ${g}`); assert.ok(a <= 2800, `arms_mesh ${a}`);
});
