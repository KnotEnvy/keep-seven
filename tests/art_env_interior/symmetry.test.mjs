// The bore chamber is one 60 degree sector baked once and copied about bore_axis (work order art-env-interior 4.4, 5):
// the six sectors share their lightmap UVs, and turning the chamber's vertex light by 60 degrees about the axis changes
// no vertex by more than 1/255. Measured on the shipped file: every vertex of chunk_bo_chamber__m_pellam inside the
// ring (r <= 15.3, floor to ceiling) is turned by 60 degrees and looked up (2 mm); its UV1 must be equal and its colour
// within 1/255. The door bay, the lift gate and the catwalk openings break the pattern by design: at least 80 % of
// the ring's vertices must have a counterpart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { M, ZONES } from './common.mjs';
import { gltfIO, worldMatrix, mat4Point } from '../../tools/pipeline-lib.mjs';

test('the six sectors share lightmap UVs and their vertex light is six-fold symmetric', async () => {
  const io = await gltfIO();
  const doc = await io.read(M.assets.env_the_bore._pub);
  const n = doc.getRoot().listNodes().find((x) => x.getName() === 'chunk_bo_chamber__m_pellam');
  assert.ok(n, 'chunk_bo_chamber__m_pellam exists');
  const m = worldMatrix(n), p = n.getMesh().listPrimitives()[0];
  const P = p.getAttribute('POSITION'), U = p.getAttribute('TEXCOORD_1'), C = p.getAttribute('COLOR_0');
  const v = [], e = [0, 0, 0], u = [0, 0], c = [0, 0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, e); const w = mat4Point(m, e); U.getElement(i, u); C.getElement(i, c);
    v.push({ w, u: [u[0], u[1]], c: [c[0], c[1], c[2]] });
  }
  const key = (w) => `${Math.round(w[0] * 200)},${Math.round(w[1] * 200)},${Math.round(w[2] * 200)}`;
  const grid = new Map();
  for (const x of v) { const k = key(x.w); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(x); }
  const near = (w) => {
    const out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const k = `${Math.round(w[0] * 200) + dx},${Math.round(w[1] * 200) + dy},${Math.round(w[2] * 200) + dz}`;
      for (const x of grid.get(k) ?? []) if (Math.hypot(x.w[0] - w[0], x.w[1] - w[1], x.w[2] - w[2]) < 0.002) out.push(x);
    }
    return out;
  };
  const ax = [14, 96], a = Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
  // the parts placed on top of the sectors, by design not symmetric: the door bay and the lift gate (3 x 3 m openings
  // through the 0 and 180 degree facets), the catwalk's openings (facets 30, 45, 315, 330 between -36.3 and -32 m)
  const brg = (w) => ((Math.atan2(w[0] - ax[0], -(w[2] - ax[1])) * 180) / Math.PI + 360) % 360;
  const onTop = (w) => {
    const r = Math.hypot(w[0] - ax[0], w[2] - ax[1]), b = brg(w);
    if (r > 14.4 && w[1] < -40.9 && (b < 8 || b > 352 || Math.abs(b - 180) < 8)) return true;
    if (r > 14.4 && w[1] > -36.4 && w[1] < -31.9 && (b > 20 && b < 55 || b > 305 && b < 340)) return true;
    return false;
  };
  let ring = 0, matched = 0, worstC = 0, uvBad = 0;
  for (const x of v) {
    const dx = x.w[0] - ax[0], dz = x.w[2] - ax[1];
    if (Math.hypot(dx, dz) > 15.3 || x.w[1] < -50.95 || x.w[1] > -29.9) continue;
    const w2 = [ax[0] + dx * ca - dz * sa, x.w[1], ax[1] + dx * sa + dz * ca];
    if (onTop(x.w) || onTop(w2)) continue;
    ring++;
    const cand = near(w2);
    if (!cand.length) continue;
    // the same corner can carry several (normal / UV) splits: compare with the best one
    let best = Infinity, uvOk = false;
    for (const y of cand) {
      best = Math.min(best, Math.max(...[0, 1, 2].map((k) => Math.abs(y.c[k] - x.c[k]))));
      if (Math.abs(y.u[0] - x.u[0]) < 1e-3 && Math.abs(y.u[1] - x.u[1]) < 1e-3) uvOk = true;
    }
    matched++;
    worstC = Math.max(worstC, best);
    if (!uvOk) uvBad++;
  }
  console.log(`    ${ring} vertices in the ring, ${matched} with a counterpart 60 degrees on (${(100 * matched / ring).toFixed(1)} %); worst colour difference ${(worstC * 255).toFixed(2)} / 255; ${uvBad} without an equal UV1`);
  assert.ok(matched / ring >= 0.8, `only ${matched} of ${ring} vertices have a counterpart`);
  assert.ok(worstC <= 1 / 255 + 1e-6, `vertex light differs by ${(worstC * 255).toFixed(2)} / 255 between sectors`);
  assert.equal(uvBad, 0, `${uvBad} vertices do not share their lightmap UV with their counterpart`);
});
