// openings.test.mjs: the exterior's drawn geometry respects the layout (LEVEL.md "preserve"):
//   * every door opening of the exterior zones is clear: a grid of rays through it meets no triangle;
//   * every cover solid is covered by drawn geometry within +-0.25 m (a ray from 0.25 m outside each side to 0.25 m
//     inside it meets the zone's geometry): what the player hides behind is what they see;
//   * no drawn triangle above 0.35 m enters the body sweep of a nav link (0.45 m round the link, 0.35..1.8 m up).
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, M, Grid, loadAsset, marker, boxPoint, rad } from './geo.mjs';
import { World } from '../../tools/layout_geom.mjs';

const ZONES = { the_lip: 'env_the_lip', plenty_street: 'env_plenty_street', far_rim: 'env_far_rim' };
const data = {};
test.before(async () => { for (const [z, id] of Object.entries(ZONES)) { const a = await loadAsset(id); data[z] = { ...a, grid: new Grid(a.tris) }; } });

test('door openings are clear of drawn geometry', () => {
  let n = 0;
  for (const zone of Object.keys(ZONES)) {
    for (const m of L.markers.filter((x) => x.zone === zone && x.type === 'door')) {
      const [w, h] = m.size; const r = rad(m.rotY ?? 0);
      const ax = [Math.cos(r), 0, -Math.sin(r)], nz = [Math.sin(r), 0, Math.cos(r)];          // local x (across), local z (through)
      const bad = [];
      for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) {
        const u = (i / 8 - 0.5) * (w - 0.2), y = m.pos[1] + 0.1 + (j / 8) * (h - 0.25);
        const c = [m.pos[0] + ax[0] * u, y, m.pos[2] + ax[2] * u];
        const a = [c[0] - nz[0] * 1.5, y, c[2] - nz[2] * 1.5], b = [c[0] + nz[0] * 1.5, y, c[2] + nz[2] * 1.5];
        // plug_door_tally fills the Tally House's doorway on purpose: it is drawn only while the hall behind is hidden
        const hit = data[zone].grid.segment(a, b, (i) => data[zone].mesh[i].startsWith('plug_'));
        if (hit) bad.push(`(${c.map((v) => v.toFixed(2)).join(', ')}) ${data[zone].mesh[hit.tri]}`);
        n++;
      }
      assert.deepEqual(bad, [], `${m.id}: rays through the opening hit drawn geometry`);
    }
  }
  console.log(`    ${n} rays through ${L.markers.filter((x) => x.type === 'door' && ZONES[x.zone]).length} door openings: all clear`);
});

test('cover solids are covered by drawn geometry within 0.25 m', () => {
  const report = [];
  const world = new World(L.solids.filter((x) => Object.keys(ZONES).includes(x.zone)));
  for (const zone of Object.keys(ZONES)) {
    for (const s of L.solids.filter((x) => x.zone === zone && x.role === 'cover' && x.shape === 'box')) {
      const hx = s.size[0] / 2, hz = s.size[2] / 2, y0 = s.pos[1] - s.size[1] / 2, y1 = s.pos[1] + s.size[1] / 2;
      let tot = 0, ok = 0;
      const sides = [[1, 0, hx, hz], [-1, 0, hx, hz], [0, 1, hz, hx], [0, -1, hz, hx]];
      for (const [sx, sz, half, along] of sides) {
        for (let a = -along + 0.3; a <= along - 0.3 + 1e-6; a += 0.35) for (let y = y0 + 0.3; y <= y1 - 0.25 + 1e-6; y += 0.35) {
          const lx = sx ? sx * half : a, lz = sz ? sz * half : a;
          const nx = sx, nz = sz;
          const gp = boxPoint(s, lx + nx * 0.3, y, lz + nz * 0.3);
          const gr = world.ground(gp[0], gp[2], y1, 0.5, 30.0);
          if (gr && y < gr.y + 0.3) continue;                                // under the ground beside it: nothing to see
          const out = boxPoint(s, lx + nx * 0.25, y, lz + nz * 0.25), inn = boxPoint(s, lx - nx * 0.25, y, lz - nz * 0.25);
          tot++; if (data[zone].grid.segment(out, inn)) ok++;
        }
      }
      if (tot) report.push({ id: s.id, share: ok / tot, tot });
    }
  }
  // cover filled by an EMBEDDED PROP (bindings.solidProp): the prop's shape is art-props' (their order: "full-height
  // cover: fill the layout solid"); reported here, held to it there
  const propOwned = new Set(Object.entries(M.bindings.solidProp).filter(([, v]) => v).map(([k]) => k));
  const owned = (id) => propOwned.has(L.solids.find((x) => x.id === id).prop);
  // the rib keeps the art bible's 0.6 m shoulders (they leave the solid's top 0.15 m) and its missing panel (a 0.5 m cavity)
  const floorOf = { st_cover_rib: 0.75 };
  for (const r of report) console.log(`    ${r.id.padEnd(22)} ${(100 * r.share).toFixed(0).padStart(3)} % of ${r.tot} samples${owned(r.id) ? '   (embedded prop: art-props)' : ''}`);
  const fails = report.filter((r) => !owned(r.id) && r.share < (floorOf[r.id] ?? 0.9));
  assert.deepEqual(fails.map((r) => `${r.id} ${(100 * r.share).toFixed(0)} %`), [], 'cover solids with less than 90 % of their faces drawn within 0.25 m');
});

test('no drawn triangle above 0.35 m enters a nav link body sweep', () => {
  const nodes = new Map(L.nav.nodes.map((n) => [n.id, n]));
  const world = new World(L.solids.filter((x) => Object.keys(ZONES).includes(x.zone)));
  const bad = new Map();
  let links = 0;
  for (const zone of Object.keys(ZONES)) {
    const T = data[zone].tris, g = data[zone].grid;
    for (const [ia, ib] of L.nav.links) {
      const a = nodes.get(ia), b = nodes.get(ib);
      if (a.zone !== zone || b.zone !== zone) continue;
      links++;
      const A = a.pos, B = b.pos;
      const dx = B[0] - A[0], dz = B[2] - A[2], l2 = dx * dx + dz * dz;
      // the floor along the link (a link over a ramp walks the ramp): sampled every 0.1 m once
      const ns = Math.max(1, Math.ceil(Math.sqrt(l2) / 0.1)), floor = new Float64Array(ns + 1);
      for (let k = 0; k <= ns; k++) {
        const t = k / ns, lin = A[1] + (B[1] - A[1]) * t;
        const fl = world.ground(A[0] + dx * t, A[2] + dz * t, lin, 1.0, 1.0);
        floor[k] = fl ? Math.max(lin, fl.y) : lin;
      }
      for (const i of g.near(A, B, 0.5)) {
        // sample the triangle densely enough for a 0.45 m test
        const p = [0, 1, 2].map((k) => [T[i * 9 + k * 3], T[i * 9 + k * 3 + 1], T[i * 9 + k * 3 + 2]]);
        const e = Math.max(Math.hypot(p[1][0] - p[0][0], p[1][2] - p[0][2]), Math.hypot(p[2][0] - p[0][0], p[2][2] - p[0][2]), Math.hypot(p[1][1] - p[0][1], p[2][1] - p[0][1]));
        const n = Math.min(40, Math.max(2, Math.ceil(e / 0.1)));
        for (let u = 0; u <= n; u++) for (let v = 0; u + v <= n; v++) {
          const w = n - u - v;
          const q = [0, 1, 2].map((k) => (p[0][k] * u + p[1][k] * v + p[2][k] * w) / n);
          const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((q[0] - A[0]) * dx + (q[2] - A[2]) * dz) / l2));
          const cx = A[0] + dx * t, cz = A[2] + dz * t, gy = floor[Math.round(t * ns)];
          if (Math.hypot(q[0] - cx, q[2] - cz) < 0.45 && q[1] > gy + 0.35 && q[1] < gy + 1.8) {
            const key = `${data[zone].mesh[i]} near ${ia}-${ib}`;
            if (!bad.has(key)) bad.set(key, q.map((x) => x.toFixed(2)).join(', '));
          }
        }
      }
    }
  }
  console.log(`    ${links} nav links checked`);
  assert.deepEqual([...bad.entries()].slice(0, 20).map(([k, v]) => `${k} at (${v})`), [], 'drawn triangles in a nav link body sweep');
});
