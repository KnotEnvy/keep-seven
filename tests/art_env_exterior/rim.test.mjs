// rim.test.mjs (look team exterior, polish round 5): the mesa the ledge is cut into goes on east and west of it as WINGS
// of the same stratified cliff (env_backdrop_dusk.wing), not as plain quads; and the far country that was taken out of
// the dusk backdrop to pay for them (every landform within 60 degrees of south of the rim) is never in sight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid, loadAsset } from './geo.mjs';

const CENTRE = [14, 60];
let near, dusk;
test.before(async () => {
  const rim = await loadAsset('env_far_rim');
  dusk = await loadAsset('env_backdrop_dusk');
  // the rim's own rock: the zone, and what the backdrop draws within 110 m of the ledge's middle (wings, the far walls, scree)
  const keep = [];
  for (let i = 0; i < dusk.tris.length; i += 9) {
    let inside = true;
    for (let k = 0; k < 9; k += 3) if (Math.hypot(dusk.tris[i + k] - 14, dusk.tris[i + k + 2] - 106) > 110) inside = false;
    if (inside) for (let k = 0; k < 9; k++) keep.push(dusk.tris[i + k]);
  }
  const all = new Float64Array(rim.tris.length + keep.length);
  all.set(rim.tris); all.set(keep, rim.tris.length);
  near = new Grid(all);
});

test('the rim: no landform was removed from a bearing she can see (every ray that leaves the rim rock looks north of the culled sector)', () => {
  let rays = 0, open = 0, worst = 180;
  for (const ex of [-0.65, 7, 14, 21, 29.65]) for (const ez of [101.35, 106, 110.3]) for (const ey of [19.65, 20.75]) {
    for (let b = 0; b < 360; b += 2) for (const el of [0.5, 1, 2, 3, 4, 5, 6, 9]) {
      const br = (b * Math.PI) / 180, er = (el * Math.PI) / 180;
      const d = [Math.sin(br) * Math.cos(er), Math.sin(er), -Math.cos(br) * Math.cos(er)];
      const eye = [ex, ey, ez];
      rays++;
      if (near.segment(eye, [ex + d[0] * 150, ey + d[1] * 150, ez + d[2] * 150])) continue;
      open++;
      // where this ray crosses each ring of far country (round CENTRE; the tallest a landform of that ring can stand):
      // if the ray is still under that height there, a landform on that bearing would be in sight
      const ox = ex - CENTRE[0], oz = ez - CENTRE[1], h = Math.hypot(d[0], d[2]), ux = d[0] / h, uz = d[2] / h;
      for (const [R, H] of [[118, 15], [200, 34], [350, 46], [550, 60], [800, 70]]) {
        const pb = ox * ux + oz * uz, t = -pb + Math.sqrt(pb * pb - (ox * ox + oz * oz - R * R));
        if (ey + (d[1] / h) * t > H) continue;
        const px = ox + ux * t, pz = oz + uz * t;
        const south = Math.abs(Math.atan2(px, pz)) * 180 / Math.PI;        // 0 = due south of CENTRE (+z)
        worst = Math.min(worst, south);
        assert.ok(south > 60, `from (${eye.map((v) => v.toFixed(1))}) bearing ${b}, ${el} up: the ring at ${R} m is in sight ${south.toFixed(1)} degrees from south, where the far country was removed`);
      }
    }
  }
  console.log(`    ${rays} rays, ${open} leave the rim rock; the southernmost of them looks ${worst.toFixed(1)} degrees from south (the cull is 60)`);
});

test('the rim: the cliff goes on east and west as stratified wings (beds and a broken skyline, not one quad)', () => {
  for (const [name, x0, x1] of [['west', -26, -3], ['east', 31, 59]]) {
    const ys = new Set(); let top = -1e9, low = 1e9, tris = 0; const tops = [];
    for (let i = 0; i < dusk.tris.length; i += 9) {
      const v = [0, 3, 6].map((k) => [dusk.tris[i + k], dusk.tris[i + k + 1], dusk.tris[i + k + 2]]);
      if (!v.every((p) => p[0] > x0 && p[0] < x1 && p[2] > 100 && p[2] < 113 && p[1] > 17.5)) continue;
      tris++;
      for (const p of v) { ys.add(Math.round(p[1] * 4)); top = Math.max(top, p[1]); low = Math.min(low, p[1]); }
      tops.push(Math.max(...v.map((p) => p[1])));
    }
    const sky = tops.filter((t) => t > 21.5);
    const spread = Math.max(...sky) - Math.min(...sky);
    console.log(`    ${name}: ${tris} triangles above the ledge, ${ys.size} levels, top ${top.toFixed(1)}, skyline varies by ${spread.toFixed(2)} m`);
    assert.ok(tris >= 80, `${name} wing: ${tris} triangles above the ledge (a plain wall has 4)`);
    assert.ok(ys.size >= 12, `${name} wing: ${ys.size} distinct levels (beds)`);
    assert.ok(top > 22.5 && spread > 0.6, `${name} wing: a skyline over the eye that is not one line`);
  }
});
