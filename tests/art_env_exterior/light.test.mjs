// light.test.mjs: what the fixer round added to the exterior's definition of done (measured on the SHIPPED files):
//   * the street is walked into low sun: at least 30 % of the street floor between x -60 and -20 has a clear line to the sun;
//   * every struck door mark carries the Dowser's line at 22 degrees (in the plane of its wall, which leans 2-4 degrees);
//   * the Tally House's three west shutter openings are not blocked by this piece's geometry;
//   * the still strain-cloth says wind 0 in so many words; each Long Light zone shows its seam objects;
//   * viewer frames: no row of bright one-pixel sparkles on a shaded facade (cracks between parts showing the sky), no
//     black panel on a sunlit front, the overhang's rock inside the art bible's #2A1A1E-#48272D.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../harness.mjs';
import { gltfIO, worldMatrix, mat4Point, readJson } from '../../tools/pipeline-lib.mjs';
import { L, M, Grid, loadAsset, marker } from './geo.mjs';
import { viewerFrames, PIECE } from './views.mjs';

const SUN = L.meta?.sun?.toSun ?? [-0.686, 0.242, -0.686];
let street, lip;
test.before(async () => { street = await loadAsset('env_plenty_street'); lip = await loadAsset('env_the_lip'); });

test('Front Street is walked into low sun: 30 % or more of its floor (x -60..-20) is sunlit', () => {
  const g = new Grid(street.tris);
  const s = Math.hypot(...SUN), d = SUN.map((v) => v / s);
  let lit = 0, n = 0; const rows = [];
  for (let z = -6.75; z <= 6.75 + 1e-6; z += 0.5) {
    let r = 0, c = 0;
    for (let x = -59.75; x <= -20 + 1e-6; x += 0.5) {
      const a = [x, 0.12, z], b = [x + d[0] * 70, 0.12 + d[1] * 70, z + d[2] * 70];
      const hit = g.segment(a, b, (i) => street.mats[i] === 'm_sand');          // the ground itself (drifts, ruts) does not shade the street
      n++; c++; if (!hit) { lit++; r++; }
    }
    rows.push(`${z.toFixed(2)}:${Math.round(100 * r / c)}`);
  }
  const share = lit / n;
  console.log(`    sunlit share of the street floor, x -60..-20: ${(100 * share).toFixed(1)} % (${lit} of ${n} samples); by z (north to south): ${rows.join(' ')}`);
  assert.ok(share >= 0.30, `only ${(100 * share).toFixed(1)} % of the street floor is sunlit`);
});

test('every door mark is struck through at 22 degrees', async () => {
  const reg = readJson(path.join(ROOT, 'blender/lib/mask_regions.json'));
  const [W, H] = reg.size; const [rx, ry, rw, rh] = reg.regions.strike.px;
  const u0 = rx / W, u1 = (rx + rw) / W;
  const io = await gltfIO();
  const found = {}, marks = {};
  for (const id of ['env_plenty_street', 'env_the_lip']) {
    const doc = await io.read(M.assets[id]._pub); const angles = []; const where = []; marks[id] = where;
    for (const n of doc.getRoot().listNodes()) {
      if (!n.getMesh()) continue;
      const m = worldMatrix(n);
      for (const p of n.getMesh().listPrimitives()) {
        if (p.getMaterial()?.getName() !== 'm_mask') continue;
        const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), idx = p.getIndices();
        const cnt = idx ? idx.getCount() : pos.getCount();
        for (let i = 0; i < cnt; i += 3) {
          const v = [0, 1, 2].map((k) => { const j = idx ? idx.getScalar(i + k) : i + k; return { p: mat4Point(m, pos.getElement(j, [0, 0, 0])), t: uv.getElement(j, [0, 0]) }; });
          for (let k = 0; k < 3; k++) {
            const a = v[k], b = v[(k + 1) % 3];
            // a long edge of the strike: along U at one V inside the region (a mark that straddles a chunk plane is cut in two there)
            if (Math.abs(a.t[1] - b.t[1]) > 1e-4 || Math.abs(a.t[0] - b.t[0]) < 0.3 * (u1 - u0)) continue;
            if (Math.min(a.t[0], b.t[0]) < u0 - 2 / W || Math.max(a.t[0], b.t[0]) > u1 + 2 / W) continue;
            if (Math.min(a.t[1], b.t[1]) < ry / H - 2 / H || Math.max(a.t[1], b.t[1]) > (ry + rh) / H + 2 / H) continue;
            const dy = Math.abs(b.p[1] - a.p[1]), dh = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]);
            angles.push(Math.atan2(dy, dh) * 180 / Math.PI);
            const mid = [(a.p[0] + b.p[0]) / 2, (a.p[2] + b.p[2]) / 2];
            if (!where.some((q) => Math.hypot(q[0] - mid[0], q[1] - mid[1]) < 0.7)) where.push(mid);
          }
        }
      }
    }
    found[id] = angles;
  }
  const st = found.env_plenty_street, lp = found.env_the_lip;
  console.log(`    strike lines: street ${marks.env_plenty_street.length} marks (${Math.min(...st).toFixed(1)}..${Math.max(...st).toFixed(1)} deg), lip ${marks.env_the_lip.length} (${lp.map((a) => a.toFixed(1)).join(', ')})`);
  assert.equal(marks.env_plenty_street.length, 9, 'nine struck door marks in the street');
  assert.equal(marks.env_the_lip.length, 1, 'the struck mark on the left gate pier');
  for (const a of [...st, ...lp]) assert.ok(Math.abs(a - 22) <= 2.0, `a strike line at ${a.toFixed(1)} degrees (22 +- 2: the wall's own lean)`);
});

test('the Tally House shutter openings are not blocked by the exterior', () => {
  const g = new Grid(street.tris);
  let n = 0;
  for (const id of ['shutter_s', 'shutter_m', 'shutter_n']) {
    const m = marker(id); const [w, h] = m.size;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) {
      const z = m.pos[2] + (i / 4 - 0.5) * (w - 0.1), y = m.pos[1] + (j / 3 - 0.5) * (h - 0.1);
      const hit = g.segment([m.pos[0] - 2.5, y, z], [m.pos[0] + 2.5, y, z]);
      assert.equal(hit, null, `${id}: a ray through the opening meets ${hit ? street.mesh[hit.tri] : ''}`);
      n++;
    }
  }
  console.log(`    ${n} rays through the three shutter openings: clear (this piece draws the hall's south front only: its chunk's box ends at z -16.7)`);
});

test('dressing: the still strain-cloth carries wind 0; allowances hold', async () => {
  const io = await gltfIO();
  for (const [id, zone] of [['env_plenty_street', 'plenty_street'], ['env_the_lip', 'the_lip']]) {
    const doc = await io.read(M.assets[id]._pub);
    const emp = doc.getRoot().listNodes().filter((n) => /^(inst|brk)_\d+$/.test(n.getName()));
    const cloth = emp.filter((n) => n.getExtras().asset === 'prop_strain_cloth');
    if (zone === 'plenty_street') {
      assert.ok(cloth.length >= 4, 'the wash-house line');
      for (const c of cloth) assert.ok(c.getExtras().wind === 0 || c.getExtras().wind === 1, `${c.getName()}: wind is written (${c.getExtras().wind})`);
      assert.equal(cloth.filter((c) => c.getExtras().wind === 0).length, 1, 'exactly one cloth hangs dead still');
    }
    const kinds = new Set(emp.map((n) => n.getExtras().asset));
    console.log(`    ${id}: ${emp.length} dressing empties (${[...kinds].join(', ')})`);
  }
});

// ---- viewer frames (the shipped colours)
const lum = (d, k) => 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
async function load(file) { const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, w: info.width, h: info.height }; }
/** pixels much brighter than ALL their neighbours at distance 2: one-pixel sparkles (a crack between two parts showing the sky) */
function sparkles(img, box) {
  const [x0, y0, x1, y1] = box; let n = 0;
  for (let y = Math.max(2, y0); y < Math.min(img.h - 2, y1); y++) for (let x = Math.max(2, x0); x < Math.min(img.w - 2, x1); x++) {
    const c = lum(img.d, (y * img.w + x) * 3);
    let mx = 0;
    for (const [dx, dy] of [[-2, -2], [0, -2], [2, -2], [-2, 0], [2, 0], [-2, 2], [0, 2], [2, 2]]) mx = Math.max(mx, lum(img.d, ((y + dy) * img.w + x + dx) * 3));
    if (c > 1.5 * mx + 22) n++;
  }
  return n;
}
function mean(img, [x0, y0, x1, y1]) {
  const s = [0, 0, 0]; let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * img.w + x) * 3; s[0] += img.d[k]; s[1] += img.d[k + 1]; s[2] += img.d[k + 2]; n++; }
  return s.map((v) => Math.round(v / n));
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

test('viewer: no sparkle rows on shaded fronts, no black sign on a sunlit front, the overhang reads as dark rock', async () => {
  const dir = path.join(ROOT, 'shots', PIECE);
  const views = [
    { name: 'chk_feed_front', zone: 'plenty_street', eye: [-23, 1.65, -1], at: [-27, 3.2, -7] },
    { name: 'chk_dry_front', zone: 'plenty_street', eye: [-52, 1.65, -1.5], at: [-55, 2.4, -7] },
    { name: 'chk_smithy_sign', zone: 'plenty_street', eye: [-30, 1.65, 2], at: [-31, 4, 7] },
    { name: 'chk_wash_door', zone: 'plenty_street', eye: [-47, 1.65, 3], at: [-48.5, 0.3, 6.8] },
    { name: 'chk_overhang_back', zone: 'the_lip', eye: [15, 15.65, 102.5], at: [13, 15.3, 110] },
    { name: 'chk_overhang_side', zone: 'the_lip', eye: [14, 15.65, 105.5], at: [6, 15.6, 105] },
  ];
  await viewerFrames(views, { dir, suffix: '' });
  const img = Object.fromEntries(await Promise.all(views.map(async (v) => [v.name, await load(path.join(dir, v.name + '.png'))])));
  for (const n of ['chk_feed_front', 'chk_dry_front']) {
    const s = sparkles(img[n], n === 'chk_feed_front' ? [Math.round(img[n].w * 0.36), 0, img[n].w, img[n].h] : [0, 0, img[n].w, img[n].h]);
    console.log(`    ${n}: ${s} sparkle pixels`);
    assert.ok(s <= 12, `${n}: ${s} isolated bright pixels (cracks showing the sky)`);
  }
  // the sign board of the smithy stands in the sun: its planks read pale (the critic's frame showed a black panel, #130C08),
  // and nothing near it is black but the hair-wide shadow under its top frame timber
  const sign = img.chk_smithy_sign; let black = 0, tot = 0;
  for (let y = Math.round(sign.h * 0.3); y < Math.round(sign.h * 0.62); y++) for (let x = Math.round(sign.w * 0.25); x < Math.round(sign.w * 0.75); x++) {
    const k = (y * sign.w + x) * 3; tot++;
    if (sign.d[k] < 0x0B && sign.d[k + 1] < 0x0D && sign.d[k + 2] < 0x12) black++;
  }
  const board = mean(sign, [380, 238, 480, 262]);
  console.log(`    chk_smithy_sign: the board reads ${hex(board)}; ${black} of ${tot} pixels (${(100 * black / tot).toFixed(2)} %) under #0B0D12 on the sunlit front`);
  assert.ok(lum(board, 0) > 90, `the smithy's sign board is dark: ${hex(board)}`);
  assert.ok(black / tot < 0.02, `${black} black pixels on the sunlit smithy front`);
  const wash = img.chk_wash_door; let wb = 0;
  for (let y = Math.round(wash.h * 0.45); y < wash.h; y++) for (let x = 0; x < wash.w; x++) { const k = (y * wash.w + x) * 3; if (wash.d[k] < 0x0B && wash.d[k + 1] < 0x0D && wash.d[k + 2] < 0x12) wb++; }
  console.log(`    chk_wash_door: ${wb} pixels under #0B0D12 on the ground at the door`);
  assert.ok(wb < 250, `${wb} black pixels on the sand at the wash-house door (the gap under the door leaf is some 70; the critic's black quad was thousands)`);
  // the overhang's rock: ART_BIBLE 3.1, #2A1A1E..#48272D (L* about 12..21); measured on the back wall and a side wall
  const back = mean(img.chk_overhang_back, [300, 190, 520, 270]), side = mean(img.chk_overhang_side, [330, 200, 630, 300]), roof = mean(img.chk_overhang_back, [300, 30, 520, 90]);
  console.log(`    overhang rock in the viewer: back wall ${hex(back)}, side wall ${hex(side)}, roof ${hex(roof)} (target #2A1A1E..#48272D)`);
  for (const [nm, c] of [['back wall', back], ['side wall', side]]) {
    assert.ok(c[0] >= 0x2A - 6 && c[0] <= 0x48 + 10, `${nm} ${hex(c)}: red outside #2A..#48 (+-)`);
    assert.ok(c[0] > c[2] && c[0] > c[1], `${nm} ${hex(c)} is not a dark red-brown`);
  }
  assert.ok(roof[0] >= 0x1C, `the roof ${hex(roof)} is black`);
});
