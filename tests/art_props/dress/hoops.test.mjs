// art-props-dress: painted bands stay BANDS in the shipped file. A smooth vertex carries one COLOR_0, so a band painted
// per face on a smooth surface smears into its neighbours (the barrels once lost their hoops that way). The hoops are
// now real steps with sharp edges: at every hoop edge the file must hold the iron colour and the stave colour at the
// same point, and the band must stand proud of the staves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readAsset, vertices, lum } from './dress.mjs';

async function allVerts(id, variant = null) {
  const a = await readAsset(id);
  const out = [];
  for (const n of a.meshNodes) {
    if (variant !== null && a.variantOf(n) !== variant) continue;
    for (const prim of n.getMesh().listPrimitives()) out.push(...vertices(n, prim));
  }
  return out;
}
const key = (p) => p.map((x) => Math.round(x * 2000)).join(',');
/** Points of the mesh that carry two colours whose luminance differs by more than `ratio`. */
function steps(vs, ratio) {
  const m = new Map();
  for (const v of vs) { const k = key(v.p); const e = m.get(k) ?? { lo: Infinity, hi: -Infinity, p: v.p }; const l = lum(v.rgb); e.lo = Math.min(e.lo, l); e.hi = Math.max(e.hi, l); m.set(k, e); }
  return [...m.values()].filter((e) => e.hi > ratio * Math.max(e.lo, 1e-4));
}

test('prop_barrel: three hoops, each a dark band standing proud, with a hard colour step at both edges', async () => {
  const vs = await allVerts('prop_barrel');
  const side = vs.filter((v) => Math.hypot(v.p[0], v.p[2]) > 0.22);
  const ys = [...new Set(side.map((v) => Math.round(v.p[1] * 1000)))].sort((a, b) => a - b);
  const ring = (y) => side.filter((v) => Math.round(v.p[1] * 1000) === y);
  const rad = (r) => r.reduce((s, v) => s + Math.hypot(v.p[0], v.p[2]), 0) / r.length;
  const st = steps(side, 1.3);                                           // (the lowest hoop stands in the dust: a smaller step)
  // hoop edges: rings where the radius jumps by more than 8 mm to the next ring within 8 mm of height
  const edges = [];
  for (let i = 0; i + 1 < ys.length; i++) if (ys[i + 1] - ys[i] <= 8 && Math.abs(rad(ring(ys[i + 1])) - rad(ring(ys[i]))) > 0.008) edges.push([ys[i], ys[i + 1]]);
  console.log(`    rings at y (mm): ${ys.join(' ')}; hoop risers: ${edges.map((e) => e.join('-')).join(' ')}; ${st.length} points with a colour step`);
  assert.equal(edges.length, 4, 'a riser under the top hoop and at both edges of the middle hoop, and over the bottom hoop');
  for (const [y0, y1] of edges) {
    const foot = rad(ring(y0)) < rad(ring(y1)) ? y0 : y1;                 // the ring on the staves, at the foot of the riser
    const here = st.filter((e) => Math.round(e.p[1] * 1000) === foot);
    assert.ok(here.length >= 10, `hoop edge at y ${foot} mm: only ${here.length} of 12 points carry both iron and stave colour`);
  }
  // the bands themselves are dark and the staves between them are not
  const band = side.filter((v) => { const y = v.p[1]; return (y > 0.425 && y < 0.475) || (y > 0.845 && y < 0.895) || (y > 0.005 && y < 0.055); });
  const wood = side.filter((v) => { const y = v.p[1]; return (y > 0.10 && y < 0.38) || (y > 0.52 && y < 0.80); });
  const mean = (a) => a.reduce((s, v) => s + lum(v.rgb), 0) / a.length;
  const onBand = side.filter((v) => Math.abs(v.p[1] - 0.42) < 0.0015 || Math.abs(v.p[1] - 0.48) < 0.0015).filter((v) => lum(v.rgb) < 0.5 * mean(wood));
  assert.ok(wood.length >= 24 && onBand.length >= 24, `${wood.length} stave vertices, ${onBand.length} dark vertices on the middle hoop`);
  // staves: flat boards, each its own colour: the belly rings carry two colours per point
  const seams = steps(wood, 1.04);
  assert.ok(seams.length >= 16, `only ${seams.length} stave seams with a colour step`);
});

test('prop_water_cart: the four hoops of the barrel keep a hard colour step (iron against stave at the same point)', async () => {
  const vs = await allVerts('prop_water_cart');
  const st = steps(vs, 1.7).filter((e) => e.p[1] > 0.7 && e.lo < 0.16);
  console.log(`    ${st.length} points above the bed with a dark iron / stave colour step`);
  assert.ok(st.length >= 40, `${st.length} points: the hoops have smeared into the staves again`);
});

test('prop_coat_hung coat_shawl: the woven border is a band (cloth and stripe colour at the same point), not a blur', async () => {
  const vs = await allVerts('prop_coat_hung', 'coat_shawl');
  const m = new Map();
  for (const v of vs) { const k = key(v.p); (m.get(k) ?? m.set(k, []).get(k)).push(v.rgb); }
  // the stripe is the town's paint: green and blue above red; the cloth is tan: red above blue
  let n = 0;
  for (const cols of m.values()) if (cols.some((c) => c[2] > c[0] * 1.05) && cols.some((c) => c[0] > c[2] * 1.2)) n++;
  console.log(`    ${n} points where the stripe meets the cloth or the fringe`);
  assert.ok(n >= 14, `${n}`);
});
