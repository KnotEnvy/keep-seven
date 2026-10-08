// Pass i2 (look team creatures-props): the cloth of the townspeople is PAINTED, in the rows of tx_palette that were free
// (blender/tex/cloth_atlas.py: hood 256 x 80 at y 96, coat 160 x 80 and sleeve 48 x 80 at y 176, weave 48 x 80). A hood, a
// coat or a sleeve points UV0 into its region; everything else still points at the centre of a 16 px colour cell.
// This file holds the two halves to each other: the regions are painted (not the old flat grey), the colour cells above
// them did not move, and each Bider asset has cloth corners inside the regions and none outside both.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ROOT } from '../harness.mjs';

const REGIONS = { hood: [0, 96, 256, 80], coat: [0, 176, 160, 80], sleeve: [160, 176, 48, 80], weave: [208, 176, 48, 80] };
// pass i3: the crown knot (bound glass) is painted too, in the cells of columns 10-15, rows 2-5 (blender/tex/knot_atlas.py)
const KNOT = { knot: [160, 32, 64, 64], knot_dead: [224, 32, 32, 32], cord: [224, 64, 32, 16], cord_dead: [224, 80, 32, 16] };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

test('tx_palette / tx_palette_emis: the crown knot is painted; its light is in the live regions only, a white heart in violet', async () => {
  const rd = async (f) => (await sharp(path.join(ROOT, 'blender/export/tex', f)).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data;
  const alb = await rd('tx_palette.png'), emi = await rd('tx_palette_emis.png');
  const px = (d, x, y) => [d[(y * 256 + x) * 3], d[(y * 256 + x) * 3 + 1], d[(y * 256 + x) * 3 + 2]];
  const sum = (d, [x0, y0, w, h]) => { let s = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const p = px(d, x, y); s += p[0] + p[1] + p[2]; } return s / (w * h * 3); };
  const dev = (d, [x0, y0, w, h]) => { let s = 0, s2 = 0, n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const p = px(d, x, y); const l = (p[0] + p[1] + p[2]) / 3; s += l; s2 += l * l; n++; } return Math.sqrt(s2 / n - (s / n) ** 2); };
  for (const [name, r] of Object.entries(KNOT)) assert.ok(dev(alb, r) > 8, `${name}: the albedo is painted (deviation ${dev(alb, r).toFixed(1)})`);
  assert.equal(sum(emi, KNOT.knot_dead), 0, 'the knot of a freed Bider has no light in it');
  assert.equal(sum(emi, KNOT.cord_dead), 0, 'nor has its cord');
  // the heart of the glass: near white, a little off the middle; the body violet (blue over red over green); black on the grommet
  const heart = px(emi, 160 + 33, 32 + 33), body = px(emi, 160 + 32, 32 + 17), ring = px(emi, 160 + 32, 32 + 4);
  console.log(`  heart ${heart}, body ${body}, grommet ${ring}; mean light of the live view ${sum(emi, KNOT.knot).toFixed(1)} of 255`);
  assert.ok(Math.min(...heart) > 190, `the heart is near white (${heart})`);
  assert.ok(body[2] > body[0] && body[0] > body[1] * 1.5 && body[2] > 150, `the body is violet (${body})`);
  assert.ok(ring[0] + ring[1] + ring[2] < 40, `the grommet's outer turn is dark in the emissive sheet (${ring})`);
  // the shader's wrong_fade test (materials.ts DYN_FRAG: violet = b > 1.3 g and r > 1.1 g, in linear) holds for the glass
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  let lit = 0, violet = 0;
  for (let y = 32; y < 96; y++) for (let x = 160; x < 224; x++) { const p = px(emi, x, y).map(lin); if (p[0] + p[1] + p[2] < 0.02) continue; lit++; if (p[2] >= p[1] * 1.3 && p[0] >= p[1] * 1.1) violet++; }
  assert.ok(violet / lit > 0.995, `${violet} of ${lit} lit texels of the glass go out with wrong_fade`);
});

test('tx_palette: the four cloth regions are painted, and rows 0-5 are still flat 16 px cells', async () => {
  const { data, info } = await sharp(path.join(ROOT, 'blender/export/tex/tx_palette.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 256); assert.equal(info.height, 256);
  const lum = (x, y) => { const i = (y * 256 + x) * 3; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
  for (const [name, [x0, y0, w, h]] of Object.entries(REGIONS)) {
    let s = 0, s2 = 0, n = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const l = lum(x, y); s += l; s2 += l * l; n++; }
    const sd = Math.sqrt(s2 / n - (s / n) ** 2);
    console.log(`  ${name}: mean ${(s / n).toFixed(1)}, deviation ${sd.toFixed(1)} of 255`);
    assert.ok(sd > 4, `${name}: the region is flat (deviation ${sd.toFixed(2)}): cloth_atlas.paint did not run`);
  }
  for (let row = 0; row < 6; row++) for (let col = 0; col < 16; col++) {
    if (col >= 10 && row >= 2) continue;                                // pass i3: the crown knot's block (blender/tex/knot_atlas.py)
    const a = lum(col * 16 + 2, row * 16 + 2), b = lum(col * 16 + 13, row * 16 + 13);
    assert.ok(Math.abs(a - b) < 0.5, `cell ${col},${row} is not one flat colour any more`);
  }
});

for (const [id, want] of [['bider_table_static', 150], ['bider_seated_static', 120], ['bider_felled_static', 110], ['enemy_bider', 500]]) {
  test(`${id}: hood, coat and sleeves point into the cloth regions; the rest at cell centres`, async () => {
    const doc = await io.read(path.join(ROOT, 'blender/export/enemies', id + '.glb'));
    let cloth = 0, cell = 0, lost = 0, knot = 0; const per = { hood: 0, coat: 0, sleeve: 0, weave: 0 };
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
      const uv = p.getAttribute('TEXCOORD_0'); if (!uv) continue;
      for (let i = 0; i < uv.getCount(); i++) {
        const [u, v] = uv.getElement(i, []); const x = u * 256, y = v * 256;
        const r = Object.entries(REGIONS).find(([, [x0, y0, w, h]]) => x >= x0 + 0.5 && x <= x0 + w - 0.5 && y >= y0 + 0.5 && y <= y0 + h - 0.5);
        if (r) { cloth++; per[r[0]]++; continue; }
        if (Object.values(KNOT).some(([x0, y0, w, h]) => x >= x0 + 0.5 && x <= x0 + w - 0.5 && y >= y0 + 0.5 && y <= y0 + h - 0.5)) { knot++; continue; }
        const onCentre = y < 96 && Math.abs((x % 16) - 8) < 0.6 && Math.abs((y % 16) - 8) < 0.6;
        if (onCentre) cell++; else lost++;
      }
    }
    console.log(`  ${id}: ${cloth} corners on cloth (hood ${per.hood}, coat ${per.coat}, sleeve ${per.sleeve}), ${cell} on colour cells`);
    assert.ok(knot >= 40, `the crown knot points into its painted regions (${knot} corners)`);
    assert.equal(lost, 0, `${lost} corners are neither inside a cloth region nor on a cell centre (they would sample a seam or another cloth)`);
    assert.ok(cloth >= want, `only ${cloth} corners on cloth`);
    assert.ok(per.hood > 0 && per.coat > 0 && per.sleeve > 0, 'a hood, a coat and sleeves');
  });
}
