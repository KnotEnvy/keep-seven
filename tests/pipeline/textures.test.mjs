// The six final shared textures: tiling, value ranges, the mark, the palette (ART_BIBLE 2.1, 4.2, 4.3, 5.6).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './common.mjs';
import { loadManifest, readJson } from '../../tools/pipeline-lib.mjs';

const M = loadManifest();
const LIB = path.join(ROOT, 'blender/lib');
async function grey(file) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { d: data, w: info.width, h: info.height, at: (x, y) => data[y * info.width + x] / 255 };
}
async function rgb(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { at: (x, y) => [data[(y * info.width + x) * 3], data[(y * info.width + x) * 3 + 1], data[(y * info.width + x) * 3 + 2]] };
}
/** mean |difference| across the U seam of rows y0..y1 versus between interior neighbours */
function seamU(img, y0, y1) {
  let wrap = 0, inner = 0, n = 0;
  for (let y = y0; y < y1; y++) { wrap += Math.abs(img.at(0, y) - img.at(img.w - 1, y)); inner += Math.abs(img.at(img.w / 2, y) - img.at(img.w / 2 - 1, y)); n++; }
  return [wrap / n, inner / n];
}

for (const id of ['tx_frontier_trim', 'tx_pellam_trim']) {
  test(`${id}: every row tiles in U, values in range, the flat cell is uniform 0.5 and shows no edge in its row`, async () => {
    const tab = readJson(path.join(LIB, id + '.json'));
    assert.deepEqual(Object.keys(tab.regions).filter((r) => !M.textures[id].regions.includes(r)), [], 'only manifest regions');
    for (const r of M.textures[id].regions) assert.ok(tab.regions[r], `region ${r} is in the table`);
    for (const [kind, file] of [['raw', M.textures[id]._raw], ['webp', M.textures[id]._pub]]) {
      if (!fs.existsSync(file)) { assert.equal(kind, 'raw' === kind ? 'skip' : kind); continue; }
      const img = await grey(file);
      const tol = kind === 'raw' ? 0 : 3 / 255;
      let lo = 1, hi = 0, below = 0;
      for (let i = 0; i < img.d.length; i++) { const v = img.d[i] / 255; if (v < lo) lo = v; if (v > hi) hi = v; if (v < 0.375) below++; }
      // ART_BIBLE 4.2: 0.38..0.62, drawn seam lines down to 0.22. Held exactly, as STORED and as SHIPPED (no rounding or
      // codec allowance: texdraw.finish_detail keeps one 8-bit code of headroom at both ends for the near-lossless WebP)
      assert.ok(lo >= 0.22, `${kind}: darkest value ${lo.toFixed(4)} (${Math.round(lo * 255)}/255) is under the 0.22 seam floor`);
      assert.ok(hi <= 0.62, `${kind}: brightest value ${hi.toFixed(4)} (${Math.round(hi * 255)}/255) is over 0.62`);
      assert.ok(below / img.d.length < 0.12, `${kind}: ${(100 * below / img.d.length).toFixed(1)} % of the sheet is seam-dark (under 0.38)`);
      for (const [name, r] of Object.entries(tab.regions)) {
        const [x, y, w, h] = r.px;
        if (name === 'flat') {
          for (let yy = y; yy < y + h; yy += (h > 16 ? 7 : 1)) for (let xx = x; xx < x + w; xx += (w > 16 ? 7 : 1)) assert.ok(Math.abs(img.at(xx, yy) - 128 / 255) <= 1 / 255 + tol, `${kind}: flat cell is not 0.5 at ${xx},${yy}: ${img.at(xx, yy)}`);
          // The cell lies INSIDE a row that walls are mapped with, so it must not show there: no edge round it. The four
          // pixels outside each side are still 0.5 (the row's detail fades in beyond them), and no step along its
          // border is larger than the steps the row has anyway.
          const host = Object.entries(tab.regions).find(([n2, r2]) => n2 !== 'flat' && x >= r2.px[0] && y >= r2.px[1] && x + w <= r2.px[0] + r2.px[2] && y + h <= r2.px[1] + r2.px[3]);
          assert.ok(host, `${kind}: the flat cell lies inside one row`);
          let ring = 0;
          for (let yy = y - 4; yy < y + h + 4; yy++) for (let xx = x - 4; xx < x + w + 4; xx++) ring = Math.max(ring, Math.abs(img.at(xx, yy) - 128 / 255));
          assert.ok(ring <= 3 / 255 + tol, `${kind}: the ${host[0]} row has an edge at the flat cell (a pixel within 4 px of it is ${(ring * 255).toFixed(1)}/255 from 0.5)`);
          if (kind === 'raw') console.log(`    ${id}: flat cell ${w} x ${h} px inside '${host[0]}', surroundings within ${(ring * 255).toFixed(1)}/255 of 0.5`);
          continue;
        }
        const [wrap, inner] = seamU(img, y, y + h);
        assert.ok(wrap < 2 / 255 + tol || wrap <= inner * 1.5, `${kind}: row ${name} does not tile in U (seam ${(wrap * 255).toFixed(2)}/255, interior ${(inner * 255).toFixed(2)}/255)`);
      }
      if (kind === 'raw') console.log(`    ${id}: values ${lo.toFixed(3)}..${hi.toFixed(3)}, ${(100 * below / img.d.length).toFixed(1)} % seam pixels`);
    }
  });
}

test('tx_frontier_trim: the tin row is 12 soft bars per 1.0 m sheet, running across the row (ART_BIBLE 4.2)', async () => {
  const tab = readJson(path.join(LIB, 'tx_frontier_trim.json'));
  const [x0, y0, w, h] = tab.regions.tin.px;
  assert.equal(tab.regions.tin.metres_u, 4.0, 'one U repeat is four 1.0 m sheets');
  const img = await grey(M.textures.tx_frontier_trim._raw);
  // the profile along U, averaged over the row between the nail lines
  const rows = []; for (let y = y0 + Math.round(h * 0.34); y < y0 + Math.round(h * 0.66); y++) rows.push(y);
  const prof = Array.from({ length: w }, (_, x) => rows.reduce((s, y) => s + img.at(x0 + x, y), 0) / rows.length);
  const mean = prof.reduce((a, b) => a + b, 0) / w;
  let crests = 0; for (let x = 0; x < w; x++) if (prof[x] < mean && prof[(x + 1) % w] >= mean) crests++;
  assert.equal(crests, 48, `48 bars per 4.0 m repeat = 12 per sheet (found ${crests})`);
  const lap = (x) => Math.min(x % (w / 4), w / 4 - (x % (w / 4))) < 8;            // the lap line and its shadow
  let step = 0, swing = [1, 0];
  for (let x = 0; x < w; x++) { if (!lap(x) && !lap((x + 1) % w)) step = Math.max(step, Math.abs(prof[(x + 1) % w] - prof[x])); swing = [Math.min(swing[0], prof[x]), Math.max(swing[1], prof[x])]; }
  assert.ok(swing[1] - swing[0] > 0.1, `the bars are visible (swing ${(swing[1] - swing[0]).toFixed(3)})`);
  assert.ok(step < 0.2 * (swing[1] - swing[0]), `soft: no step between neighbouring texels over a fifth of the swing (largest ${step.toFixed(3)} of ${(swing[1] - swing[0]).toFixed(3)})`);
  // constant along V: a texel differs little from its column's profile, so the row can be stretched to any height
  let dev = 0; for (const y of rows) for (let x = 0; x < w; x += 3) dev += Math.abs(img.at(x0 + x, y) - prof[x]);
  dev /= rows.length * Math.ceil(w / 3);
  assert.ok(dev < 0.012, `the corrugations run across the row (mean deviation from the column profile ${dev.toFixed(4)})`);
  console.log(`    tin: ${crests} bars per repeat, swing ${(swing[1] - swing[0]).toFixed(3)}, largest texel step ${step.toFixed(3)}, deviation along V ${dev.toFixed(4)}`);
});

test('tx_sand tiles both ways and stays in range', async () => {
  const img = await grey(M.textures.tx_sand._raw);
  let wx = 0, ix = 0, wy = 0, iy = 0, lo = 1, hi = 0;
  for (let i = 0; i < img.w; i++) {
    wx += Math.abs(img.at(0, i) - img.at(img.w - 1, i)); ix += Math.abs(img.at(200, i) - img.at(201, i));
    wy += Math.abs(img.at(i, 0) - img.at(i, img.h - 1)); iy += Math.abs(img.at(i, 200) - img.at(i, 201));
  }
  for (let i = 0; i < img.d.length; i++) { const v = img.d[i] / 255; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  console.log(`    seam x ${(wx / img.w * 255).toFixed(2)}/255 (interior ${(ix / img.w * 255).toFixed(2)}), y ${(wy / img.w * 255).toFixed(2)}/255 (interior ${(iy / img.w * 255).toFixed(2)}); values ${lo.toFixed(3)}..${hi.toFixed(3)}`);
  assert.ok(wx <= ix * 1.5 && wy <= iy * 1.5, 'the wrap-around difference is no larger than between interior neighbours');
  assert.ok(lo >= 0.38 - 1 / 255 && hi <= 0.62, `values ${lo.toFixed(4)}..${hi.toFixed(4)}`);
});

test('tx_mask: all 19 regions inside the sheet, no overlap; mark_cast matches the brand construction within 2 px', async () => {
  const tab = readJson(path.join(LIB, 'mask_regions.json'));
  const names = M.textures.tx_mask.regions;
  assert.equal(names.length, 19);
  const used = new Uint8Array(1024 * 512);
  for (const n of names) {
    const r = tab.regions[n]; assert.ok(r, `region ${n} is in mask_regions.json`);
    const [x, y, w, h] = r.px;
    assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512, `${n} inside the sheet`);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { assert.equal(used[yy * 1024 + xx], 0, `${n} overlaps another region at ${xx},${yy}`); used[yy * 1024 + xx] = 1; }
  }
  assert.equal(tab.regions.numerals.cells.length, 10); assert.equal(tab.regions.plate_lines.cells.length, 4);
  assert.equal(tab.regions.picto_misc.cells.length, 6); assert.equal(tab.regions.tally.cells.length, 4); assert.equal(tab.regions.family_marks.cells.length, 12);
  // the mark, from ART_BIBLE 5.6: six open discs r 0.22 U (wall 0.07 U) at 30 + 60 n degrees, stroke 0.08 U to (0, -2.10 U),
  // solid seventh r 0.28 U at (0, -2.38 U)
  const m = tab.regions.mark_cast, U = m.U_px, [cx, cy] = m.ring_centre_px, [rx, ry, rw, rh] = m.px;
  const sd = (px, py) => {
    const X = px - cx, Z = -(py - cy);
    let d = Infinity;
    for (let n = 0; n < 6; n++) {
      const a = ((30 + 60 * n) * Math.PI) / 180, r = Math.hypot(X - Math.sin(a) * U, Z - Math.cos(a) * U);
      d = Math.min(d, Math.max(r - 0.22 * U, 0.15 * U - r));
    }
    d = Math.min(d, Math.max(Math.abs(X) - 0.04 * U, Math.abs(Z + 1.05 * U) - 1.05 * U));
    return Math.min(d, Math.hypot(X, Z + 2.38 * U) - 0.28 * U);
  };
  for (const file of [M.textures.tx_mask._raw, M.textures.tx_mask._pub]) {
    const img = await grey(file);
    let wrong = 0, ink = 0;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const d = sd(x + 0.5, y + 0.5), on = img.at(rx + x, ry + y) > 0.5;
      if (on) ink++;
      if (Math.abs(d) > 2 && on !== (d < 0)) wrong++;
    }
    assert.ok(ink > 500, 'the mark is drawn');
    assert.equal(wrong, 0, `${path.basename(file)}: ${wrong} pixels of mark_cast are more than 2 px from the construction`);
  }
  // box 2.44 U wide: the mark fills its region
  assert.ok(2.44 * U > rw * 0.85 || 3.88 * U > rh * 0.85, 'the mark fills its region');
});

test('tx_palette: every colour of ART_BIBLE 2.1 within delta E 2; tx_palette_emis: black except the eight emissive cells', async () => {
  const BIBLE = { // ART_BIBLE 2.1, copied by hand (not read from palette.json)
    sand: '#CDA070', sand_pale: '#DDB98C', rock: '#A3563A', rock_dark: '#63302A', rock_cap: '#C27A55', adobe: '#B98A62', adobe_base: '#8E6549',
    board: '#6E4E38', board_bleached: '#927560', board_dark: '#3B2A22', tin: '#8B8478', rust: '#B5522B', linen: '#D8CDB4', cord: '#A58B63',
    leather: '#7A4E32', workcloth: '#5E4636', workcloth_light: '#7A5B45', town_paint: '#6F9A94', chalk: '#E9E4D6', graphite: '#3A3A40', clay: '#A9623F',
    ash: '#8C8780', ash_dark: '#2A2623', enamel: '#CFD6CC', enamel_stain: '#AEB6A8', steel: '#36525A', steel_dark: '#1E2F36', concrete: '#6F7A76',
    cable: '#1B1F24', livery: '#4FB8AC', hazard: '#B58A3C', brass: '#B88A3A', lens: '#0E1418', gun_blue: '#1C2230', gun_worn: '#6B7078', walnut: '#3A2318',
    walnut_worn: '#5A3824', glove: '#8A6A48', glove_worn: '#A58460', skin: '#9A6B4F', cuff: '#3A3432', kept_band: '#CFD6CC', husk: '#8A8A92' };
  const EMIS = { flame: '#FF9433', flame_core: '#FFE9B8', aqua: '#7CF2E2', aqua_core: '#E6FFFB', violet: '#B24BFF', violet_core: '#F0DCFF', violet_band: '#B24BFF', violet_band_core: '#F0DCFF' };
  const pal = readJson(path.join(LIB, 'palette.json'));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lab = (c) => {
    const l = c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const X = (0.4124 * l[0] + 0.3576 * l[1] + 0.1805 * l[2]) / 0.95047, Y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2], Z = (0.0193 * l[0] + 0.1192 * l[1] + 0.9505 * l[2]) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const img = await rgb(M.textures.tx_palette._pub), emis = await rgb(M.textures.tx_palette_emis._pub);
  const centre = (c) => [c.col * 16 + 8, c.row * 16 + 8];
  let worst = 0;
  for (const [name, h] of Object.entries(BIBLE)) {
    const c = pal.cells[name]; assert.ok(c, `palette has '${name}'`);
    const d = dE(img.at(...centre(c)), hex(h)); worst = Math.max(worst, d);
    assert.ok(d <= 2, `${name}: delta E ${d.toFixed(2)} from ${h}`);
  }
  const seen = new Set();
  for (const c of Object.values(pal.cells)) { const k = c.col + ',' + c.row; assert.ok(!seen.has(k), 'two colours share a cell'); seen.add(k); }
  for (const [name, h] of Object.entries(EMIS)) {
    const c = pal.cells[name]; assert.ok(c && c.emis, `${name} is an emissive cell`);
    assert.ok(dE(emis.at(...centre(c)), hex(h)) <= 2, `${name} emissive colour`);
  }
  let lit = 0;
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) { const p = emis.at(c * 16 + 8, r * 16 + 8); if (p[0] + p[1] + p[2] > 6) lit++; }
  assert.equal(lit, 8, 'exactly eight emissive cells are lit');
  console.log(`    ${Object.keys(BIBLE).length} palette colours, worst delta E ${worst.toFixed(2)}; 8 emissive cells`);
});

test('the six final shared textures total under 1.0 MB as WebP', () => {
  let total = 0; const parts = [];
  for (const id of ['tx_palette', 'tx_palette_emis', 'tx_frontier_trim', 'tx_pellam_trim', 'tx_sand', 'tx_mask']) { const n = fs.statSync(M.textures[id]._pub).size; total += n; parts.push(`${id} ${(n / 1024).toFixed(1)} kB`); }
  console.log(`    ${parts.join(', ')}: ${(total / 1024).toFixed(1)} kB`);
  assert.ok(total < 1e6);
});

test('tx_frontier_trim: the flat cell is one 16 px grid cell (exact at its centre through mip 4)', () => {
  const [x, y, w, h] = readJson(path.join(LIB, 'tx_frontier_trim.json')).regions.flat.px;
  assert.deepEqual([w, h, x % 16, y % 16], [16, 16, 0, 0]);
});
