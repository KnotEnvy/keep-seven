// art-props-dress, work order section 6: every variant node present and non-empty; instanced assets one mesh and one
// material per variant; card_dowser exactly two triangles. Plus the numbers other pieces build against: seat and
// table heights, the trough rim, the rim stone's seat 7, the table's hand patches under the layout's seats, the
// Dowser card's glint on the drawn rod.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { M, IDS, readAsset, vertices, tris, bounds, lum, loadLayout, variantNames, meshVariants } from './dress.mjs';

const L = loadLayout();

test('variant nodes: present, non-empty, and each a child of the root', async () => {
  let n = 0;
  for (const id of IDS) {
    const a = await readAsset(id);
    for (const v of variantNames(M.assets[id])) {
      const node = a.nodes.get(v);
      if (node && !node.getMesh() && !meshVariants(a, id).includes(v) && node.listChildren().length === 0) continue;   // an empty (the card's glint)
      assert.ok(node, `${id}: variant node ${v} is missing`);
      assert.equal(node.getParentNode()?.getName(), id, `${id}/${v} is a child of the root`);
      let t = 0;
      for (const mn of a.meshNodes) if (a.variantOf(mn) === v) for (const p of mn.getMesh().listPrimitives()) t += tris(p);
      assert.ok(t > 0, `${id}/${v} has triangles`);
      n++;
    }
  }
  assert.equal(n, 17, 'ash x2, note x4, plate x3, coat x3, lantern x2, bottle x3, and nothing else');
});

test('instanced assets: one mesh and one material per variant (or for the whole asset), no skin, no clips', async () => {
  for (const id of IDS.filter((i) => M.assets[i].instanced)) {
    const a = await readAsset(id);
    const vs = meshVariants(a, id);
    const groups = new Map();
    for (const mn of a.meshNodes) { const v = a.variantOf(mn) ?? '(asset)'; groups.set(v, [...(groups.get(v) ?? []), mn]); }
    if (vs.length) assert.deepEqual([...groups.keys()].sort(), vs.slice().sort(), `${id}: every mesh belongs to a variant`);
    for (const [v, list] of groups) {
      assert.equal(list.length, 1, `${id}/${v}: one mesh`);
      assert.equal(list[0].getMesh().listPrimitives().length, 1, `${id}/${v}: one primitive (one material)`);
      assert.equal(list[0].getSkin(), null, `${id}/${v}: no skin`);
    }
    assert.equal(a.doc.getRoot().listAnimations().length, 0, `${id}: no clips`);
  }
});

test('card_dowser: exactly two triangles on m_mask; the glint empty sits on the drawn rod tip', async () => {
  const a = await readAsset('card_dowser');
  const prims = a.meshNodes.flatMap((n) => n.getMesh().listPrimitives().map((p) => [n, p]));
  assert.equal(prims.length, 1);
  assert.equal(tris(prims[0][1]), 2);
  assert.equal(prims[0][1].getMaterial().getName(), 'm_mask');
  const g = a.nodes.get('glint');
  assert.ok(g && !g.getMesh(), 'glint is an empty');
  const b = bounds(a);
  assert.ok(Math.abs(b.size[0] - 0.9) < 1e-3 && Math.abs(b.size[1] - 2.0) < 1e-3 && Math.abs(b.lo[1]) < 1e-4, `the card is 0.9 x 2.0 m standing on its feet (${b.size})`);
  // the glint in card UV, sampled in tx_mask: the rod's tip is drawn (opaque) within 3 px of it
  const t = g.getTranslation();
  const verts = vertices(prims[0][0], prims[0][1]);
  const uvA = prims[0][1].getAttribute('TEXCOORD_0'); const uvs = []; const e = [0, 0];
  for (let i = 0; i < uvA.getCount(); i++) { uvA.getElement(i, e); uvs.push([e[0], e[1]]); }
  const lx = verts.reduce((m, v, i) => (v.p[0] < verts[m].p[0] ? i : m), 0), rx = verts.reduce((m, v, i) => (v.p[0] > verts[m].p[0] ? i : m), 0);
  const u = uvs[lx][0] + (uvs[rx][0] - uvs[lx][0]) * (t[0] - verts[lx].p[0]) / (verts[rx].p[0] - verts[lx].p[0]);
  const top = verts.reduce((m, v, i) => (v.p[1] > verts[m].p[1] ? i : m), 0), bot = verts.reduce((m, v, i) => (v.p[1] < verts[m].p[1] ? i : m), 0);
  const v = uvs[bot][1] + (uvs[top][1] - uvs[bot][1]) * (t[1] - verts[bot].p[1]) / (verts[top].p[1] - verts[bot].p[1]);
  const img = await sharp(M.textures.tx_mask._pub).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = img.info.width, H = img.info.height, px = Math.round(u * W), py = Math.round(v * H);   // glTF v runs down the image
  let best = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) best = Math.max(best, img.data[(py + dy) * W + (px + dx)] ?? 0);
  console.log(`    glint at card (${t[0].toFixed(3)}, ${t[1].toFixed(3)}) -> tx_mask px (${px}, ${py}), brightest within 3 px: ${best}`);
  assert.ok(best > 127, 'the rod tip is drawn under the glint');
});

test('heights other pieces build against: chair seat 0.45, head chair seat ~0.45 under a 0.85 back, table top 0.76-0.80, trough rim 0.5', async () => {
  const top = async (id, f) => {
    const a = await readAsset(id); let hi = -Infinity;
    for (const n of a.meshNodes) for (const p of n.getMesh().listPrimitives()) for (const v of vertices(n, p)) if (f(v.p)) hi = Math.max(hi, v.p[1]);
    return hi;
  };
  // the rush: its rim stands at the seat height, its middle has sunk a little (front legs excluded: they stand proud)
  const chair = await top('prop_chair', (p) => Math.abs(p[0]) < 0.235 && Math.abs(p[2]) < 0.235 && !(Math.abs(p[0]) > 0.185 && p[2] > 0.17) && p[1] < 0.5);
  assert.ok(Math.abs(chair - 0.45) < 0.012, `chair seat rim ${chair}`);
  const sag = await top('prop_chair', (p) => Math.hypot(p[0], p[2]) < 0.05 && p[1] < 0.5);
  assert.ok(sag > 0.425 && sag <= chair, `chair seat middle ${sag}`);
  const head = await top('prop_head_chair', (p) => Math.abs(p[0]) < 0.15 && Math.abs(p[2]) < 0.25 && p[1] < 0.6);
  assert.ok(head > 0.42 && head < 0.48, `head chair seat ${head}`);
  const hb = bounds(await readAsset('prop_head_chair'));
  assert.ok(Math.abs(hb.size[1] - 0.85) < 0.03, `head chair height ${hb.size[1]}`);
  const a = await readAsset('prop_tally_table');
  let lo = Infinity, hi = -Infinity;
  for (const n of a.meshNodes) for (const p of n.getMesh().listPrimitives()) for (const v of vertices(n, p)) if (v.p[1] > 0.755) { hi = Math.max(hi, v.p[1]); }
  for (const n of a.meshNodes) for (const p of n.getMesh().listPrimitives()) {
    const vs = vertices(n, p);
    for (const v of vs) if (v.p[1] > 0.755 && Math.abs(v.p[0]) < 0.6) lo = Math.min(lo, v.p[1]);   // the top faces (board edges reach 0.035 lower)
  }
  assert.ok(hi <= 0.80 + 0.006 && lo >= 0.76 - 0.006, `table top from ${lo} to ${hi}`);
  const tb = bounds(a);
  assert.ok(Math.abs(tb.size[0] - 1.4) < 0.05 && Math.abs(tb.size[2] - 11.0) < 0.05, `table footprint ${tb.size}`);
  const rim = await top('prop_trough_pump', (p) => p[0] > -0.7 && p[0] < 1.2 && p[1] < 0.8);
  assert.ok(Math.abs(rim - 0.5) < 0.03, `trough rim ${rim}`);
});

test('the tally table: every one of the eleven seats has its pale pair of hand patches at the table edge in front of it', async () => {
  const tab = L.solids.find((s) => s.id === 'ty_table').pos;
  const seats = [...L.markers.find((m) => m.id === 'prop_tally_seated').params.seats.map((s) => s.pos),
    L.markers.find((m) => m.id === 'sp_tally_riser_w').pos, L.markers.find((m) => m.id === 'sp_tally_riser_e').pos].map((p) => [p[0] - tab[0], p[2] - tab[2]]);
  assert.equal(seats.length, 11);
  const a = await readAsset('prop_tally_table');
  const pts = [];
  for (const n of a.meshNodes) for (const p of n.getMesh().listPrimitives()) for (const v of vertices(n, p)) if (v.p[1] > 0.74) pts.push(v);
  const near = (x, z, r) => { const s = pts.filter((v) => Math.hypot(v.p[0] - x, v.p[2] - z) < r); return s.length ? s.reduce((t, v) => t + lum(v.rgb), 0) / s.length : null; };
  for (const [sx, sz] of seats) {
    const xe = Math.sign(sx) * 0.62;
    const patch = Math.max(near(xe, sz - 0.17, 0.09) ?? 0, near(xe, sz + 0.17, 0.09) ?? 0);
    const mid = near(xe, sz, 0.13);                                   // the same edge board between the two hands
    assert.ok(patch > 0 && mid !== null && patch > mid * 1.1, `seat at (${sx.toFixed(2)}, ${sz.toFixed(2)}): hand patch ${patch.toFixed(3)} vs the board between the hands ${mid?.toFixed(3)}`);
  }
});

test('the rim stone: seven seats 0.11 m apart, seat 7 (empty, dark) at the pivot column, six large brass cases standing in seats 1-6', async () => {
  // polish round 3 (R5 / R7): the six kept cases are part of the stone and stand at least twice life size, so that they
  // read as brass from 1.5 m; they swallow the zone's life-size prop_cartridge_kept cases (12 mm across, 41 mm tall)
  const a = await readAsset('prop_rim_stone');
  const all = [];
  for (const n of a.meshNodes) for (const p of n.getMesh().listPrimitives()) for (const v of vertices(n, p)) all.push(v);
  const slab = all.filter((v) => v.p[1] <= 0.1215), cases = all.filter((v) => v.p[1] > 0.13);
  const ext = (vs, k) => Math.max(...vs.map((v) => v.p[k])) - Math.min(...vs.map((v) => v.p[k]));
  console.log(`    slab x ${Math.min(...slab.map((v) => v.p[0])).toFixed(3)} .. ${Math.max(...slab.map((v) => v.p[0])).toFixed(3)}, depth ${ext(slab, 2).toFixed(3)}, height ${ext(slab, 1).toFixed(3)}`);
  assert.ok(Math.abs(ext(slab, 0) - 0.9) < 0.03 && Math.abs(ext(slab, 1) - 0.12) < 0.02 && Math.abs(ext(slab, 2) - 0.5) < 0.03, 'slab size');
  // seat 7: the only dark cup on the top, on the pivot
  const dark = all.filter((v) => v.p[1] > 0.119 && v.p[1] < 0.125 && lum(v.rgb) < 0.05).map((v) => v.p);
  assert.deepEqual([...new Set(dark.map((p) => Math.round(p[0] / 0.11)))], [0], 'the one empty seat is seat 7');
  const cx = dark.reduce((t, p) => t + p[0], 0) / dark.length, cz = dark.reduce((t, p) => t + p[2], 0) / dark.length;
  assert.ok(Math.hypot(cx, cz) < 0.01, `seat 7 at (${cx}, ${cz})`);
  // the six cases: one per seat column, mouth at least 80 mm above the top, wide enough to hold the life-size case
  const cols = [...new Set(cases.map((v) => Math.round(v.p[0] / 0.11)))].sort((x, y) => x - y);
  assert.deepEqual(cols, [-6, -5, -4, -3, -2, -1], `case columns ${cols}`);
  for (const c of cols) {
    const vs = all.filter((v) => v.p[1] > 0.1215 - 0.01 && Math.abs(v.p[0] - c * 0.11) < 0.03 && Math.abs(v.p[2]) < 0.03 && lum(v.rgb) >= 0.05 && Math.hypot(v.p[0] - c * 0.11, v.p[2]) > 0.008);
    const top = Math.max(...vs.map((v) => v.p[1]));
    const rMin = Math.min(...vs.filter((v) => v.p[1] > top - 0.02).map((v) => Math.hypot(v.p[0] - c * 0.11, v.p[2])));
    assert.ok(top - 0.12 >= 0.08 && top - 0.12 <= 0.11, `case ${c + 7}: stands ${(top - 0.12).toFixed(3)} m`);
    assert.ok(rMin >= 0.011, `case ${c + 7}: wall ${rMin.toFixed(4)} m from its axis (the life-size case inside is 0.006)`);
    const brass = cases.filter((v) => Math.round(v.p[0] / 0.11) === c && v.rgb[0] > v.rgb[2] * 1.5);
    assert.ok(brass.length >= 3, `case ${c + 7}: brass (red well over blue)`);
  }
});

test('the stone note: all m_prop, a dozen short pencil strokes (no bar spans the sheet), and its far leaf lies under seat 1 of the rim stone', async () => {
  const a = await readAsset('rd_note');
  const rad = (d) => d * Math.PI / 180;
  for (const n of a.meshNodes) for (const p of n.getMesh().listPrimitives()) assert.equal(p.getMaterial().getName(), 'm_prop', `${n.getName()} material`);
  for (const variant of ['note_lip', 'note_hearth', 'note_cradle', 'note_stone']) {
    const vs = [];
    for (const n of a.meshNodes) if (a.variantOf(n) === variant) for (const p of n.getMesh().listPrimitives()) for (const v of vertices(n, p)) vs.push(v);
    const ink = vs.filter((v) => lum(v.rgb) < 0.25), paper = vs.filter((v) => lum(v.rgb) > 0.5);
    assert.ok(ink.length >= 40 && paper.length >= 8, `${variant}: ${ink.length} ink vertices, ${paper.length} paper vertices`);
    if (variant !== 'note_stone') continue;
    // where blender/env_exterior/env_far_rim.py stands things: the stone's seat 7 on ia_stone_round turned by the solid's
    // rotY, the note on rd_note_stone turned 6 degrees more. Seat 1 in the note's frame (game x, z):
    const st = L.markers.find((m) => m.id === 'ia_stone_round').pos, nt = L.markers.find((m) => m.id === 'rd_note_stone').pos;
    const r = rad(L.solids.find((s) => s.id === 'rim_stone').rotY);
    const wx = st[0] - 0.66 * Math.cos(r) - nt[0], wz = st[2] + 0.66 * Math.sin(r) - nt[2];
    const t = r + rad(6);
    const lx = wx * Math.cos(t) - wz * Math.sin(t), lz = wx * Math.sin(t) + wz * Math.cos(t);
    const lo = [Math.min(...paper.map((v) => v.p[0])), Math.min(...paper.map((v) => v.p[2]))], hi = [Math.max(...paper.map((v) => v.p[0])), Math.max(...paper.map((v) => v.p[2]))];
    console.log(`    seat 1 in the note's frame (${lx.toFixed(3)}, ${lz.toFixed(3)}); the sheet x ${lo[0].toFixed(3)} .. ${hi[0].toFixed(3)}, z ${lo[1].toFixed(3)} .. ${hi[1].toFixed(3)}`);
    assert.ok(lx > lo[0] + 0.02 && lx < hi[0] - 0.02 && lz > lo[1] + 0.01 && lz < (lo[1] + hi[1]) / 2, 'seat 1 stands on the far leaf (the half away from the reader, game -z)');
    for (const v of ink) assert.ok(Math.hypot(v.p[0] - lx, v.p[2] - lz) > 0.02, 'no writing under the case');
  }
});

test('sizes: each asset (each variant) within its manifest placeholder box, except where the model is meant to differ', async () => {
  // meant to differ: rd_ledger lies OPEN (0.6 m across, its manifest box is the closed book); prop_coffee_pot has its lid
  // set down beside it (0.30 m over both); prop_rim_stone is offset
  // to put seat 7 on the pivot (its size holds, its centre does not); variants hang or lie their own way
  const skip = new Set(['rd_ledger', 'prop_coffee_pot', 'prop_coat_hung/coat_short', 'prop_coat_hung/coat_shawl']);   // the open book; the pot with its lid beside it; a short jacket and a shawl are not 1.1 m long
  const lines = []; const failures = [];
  for (const id of IDS) {
    if (skip.has(id)) continue;
    const a = await readAsset(id);
    const want = M.assets[id].placeholder.size;
    const vs = meshVariants(a, id);
    for (const v of vs.length ? vs : [null]) {
      if (skip.has(`${id}/${v}`)) continue;
      const b = bounds(a, v);
      const bad = [0, 1, 2].filter((k) => Math.abs(b.size[k] - want[k]) > Math.max(0.12, want[k] * 0.32));
      lines.push(`${(id + (v ? '/' + v : '')).padEnd(32)} ${b.size.map((x) => x.toFixed(2)).join(' x ')}  (manifest ${want.join(' x ')})${bad.length ? '  DIFFERS' : ''}`);
      if (bad.length) failures.push(`${id}${v ? '/' + v : ''}: ${b.size.map((x) => x.toFixed(3))} against ${want}`);
    }
  }
  console.log('    ' + lines.join('\n    '));
  assert.deepEqual(failures, []);
});
