// Look pass i6 (visual reviewers, minor: "the Lift Hall is the plainest room of the stage"; "the bore descent stair is two
// large flat green walls"). What was added is read back from the shipped files:
//   the hall   every rib carries its stencils (a bay number on three faces, a fastener row on four) and a conduit; a cable
//              tray runs along both long walls 3.1 m up, out of her reach; the floor's lamp streaks no longer clip
//   the stair  a handrail on the outer walls of both flights, a cable run on the inner walls, the stencil at the turn;
//              none of it stands further than 0.12 m off its wall (she keeps 0.35 m from a wall: no collider is needed)
// (blender/env_interior/env_lift_hall.py: rib_dress, build_trays, stain; env_the_bore.py: build_stair, stair_stain;
//  lm_paint.py paints the dirt into the two lightmaps.)
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { M, zoneTris } from './common.mjs';

const cen = (t, i) => [(t[i] + t[i + 3] + t[i + 6]) / 3, (t[i + 1] + t[i + 4] + t[i + 7]) / 3, (t[i + 2] + t[i + 5] + t[i + 8]) / 3];
const each = (z, f) => { for (let i = 0, k = 0; i < z.tris.length; i += 9, k++) f(cen(z.tris, i), z.mat[k], i); };

test('the hall: every rib is stencilled and piped, and a tray runs along both long walls', async () => {
  const all = await zoneTris('env_lift_hall', { opaque: false }), FL = -15;
  for (const [row, z] of [[1, -18], [2, -10]]) for (const [line, x] of [-9, -3, 3, 9, 15].entries()) {
    let mask = 0, pipe = 0;
    each(all, (c, mat) => {
      const dx = Math.abs(c[0] - x) - 0.8, dz = Math.abs(c[2] - z) - 1.2, on = Math.max(dx, dz);
      if (mat === 'm_mask' && on > -0.01 && on < 0.02 && c[1] > FL + 2.3 && c[1] < FL + 3.05) mask++;
      if (mat === 'm_pellam' && dz > 0.0 && dz < 0.06 && Math.abs(Math.abs(c[0] - x) - 0.5) < 0.04 && c[1] > FL + 0.3 && c[1] < FL + 4) pipe++;
    });
    assert.ok(mask >= 18, `rib ${row}${line + 1}: ${mask} stencil triangles on its faces (a number on three, fasteners on four: 20)`);
    assert.ok(pipe >= 6, `rib ${row}${line + 1}: ${pipe} triangles of a conduit on its nave face`);
  }
  for (const [name, zw] of [['north', -28], ['south', 0]]) {
    let n = 0, xmin = 1e9, xmax = -1e9, deep = 0;
    each(all, (c, mat) => {
      if (mat !== 'm_pellam' || c[1] < FL + 3.08 || c[1] > FL + 3.2) return;
      const d = Math.abs(c[2] - zw); if (d < 0.2 || d > 0.56) return;
      n++; xmin = Math.min(xmin, c[0]); xmax = Math.max(xmax, c[0]); deep = Math.max(deep, d);
    });
    assert.ok(n >= 40 && xmax - xmin > 30, `${name} wall: ${n} triangles of a tray over ${(xmax - xmin).toFixed(1)} m`);
  }
});

test('the hall: nothing that was added stands in her way (under 2 m it keeps within 0.35 m of a wall or a rib)', async () => {
  let bad = 0, seen = 0;
  const z = await zoneTris('env_lift_hall', { opaque: true }), FL = -15;
  // the fallen tray and its cables: the only new things under 2 m off a rib; x 3.6..8.4 on the north wall
  for (let i = 0; i < z.tris.length; i += 9) for (let k = 0; k < 9; k += 3) {
    const x = z.tris[i + k], y = z.tris[i + k + 1], zz = z.tris[i + k + 2];
    if (x < 3.7 || x > 8.4 || y < FL + 0.02 || y > FL + 2.0 || zz > -27.0 || zz < -28.0 + 0.015) continue;
    seen++; if (zz > -28 + 0.345) bad++;
  }
  assert.ok(seen > 20, `${seen} vertices of the fallen tray and its cables`);
  assert.equal(bad, 0, `${bad} of them further than 0.345 m from the wall`);
});

test('the hall: the lamp streaks on the floor keep tone (the lightmap has a third of the texels over 1.6 it had)', async () => {
  const { data, info } = await sharp(M.textures.lm_hall._pub).raw().toBuffer({ resolveWithObject: true });
  let n = 0; for (let i = 0; i < data.length; i += info.channels) if (Math.max(data[i], data[i + 1], data[i + 2]) >= 228) n++;
  assert.ok(n < 3500, `${n} texels at 228 or over (5850 before this pass: the streaks' cores; what is left is the ring, the cold bay and the practicals)`);
});

test('the bore stair: a handrail, a cable run and the stencil at the turn, all of it on the walls', async () => {
  const all = await zoneTris('env_the_bore', { opaque: false });
  let rail1 = 0, rail2 = 0, cab1 = 0, cab2 = 0, sten = 0, off = 0;
  const h1 = (zz) => -36 - (82 - zz) * 4 / 6, h2 = (x) => -40 - (26 - x) * 4 / 6;
  each(all, (c, mat) => {
    if (mat === 'm_mask' && Math.abs(c[2] - 74) < 0.02 && c[0] > 26.2 && c[0] < 27.4 && c[1] > -38.6 && c[1] < -38.2) sten++;
    if (mat !== 'm_pellam') return;
    if (c[2] > 76 && c[2] < 82) {
      const dy = c[1] - h1(c[2]);
      if (c[0] > 27.85 && c[0] < 27.97 && dy > 0.85 && dy < 1.05) { rail1++; if (c[0] < 27.88) off++; }
      if (c[0] > 26.0 && c[0] < 26.08 && dy > 2.1 && dy < 2.3) cab1++;
    }
    if (c[0] > 20 && c[0] < 26) {
      const dy = c[1] - h2(c[0]);
      if (c[2] > 74.03 && c[2] < 74.15 && dy > 0.85 && dy < 1.05) { rail2++; if (c[2] > 74.12) off++; }
      if (c[2] < 76.0 && c[2] > 75.92 && dy > 2.1 && dy < 2.3) cab2++;
    }
  });
  assert.ok(rail1 >= 12 && rail2 >= 10, `handrail triangles: flight 1 ${rail1}, flight 2 ${rail2}`);
  assert.ok(cab1 >= 12 && cab2 >= 10, `cable run triangles: flight 1 ${cab1}, flight 2 ${cab2}`);
  assert.ok(sten >= 6, `${sten} stencil triangles on the turn's north wall`);
  assert.equal(off, 0, `${off} handrail triangles further than 0.12 m off the wall`);
});
