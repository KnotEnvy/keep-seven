// Openings, cover and nav links against the shipped interior zones (work order art-env-interior 5):
//  * every door / gate opening of the four zones is clear at its marker's size (a grid of segments through it);
//  * ribs, the cabinet, the latch cowl, the hearth breast, the kerb and its merlons are drawn within +-0.25 m of their
//    layout solids (a segment across each sampled face of the solid meets drawn geometry);
//  * nothing stands more than 0.35 m above a nav link (a vertical segment from 0.36 to 1.85 m over every 0.3 m of link).
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, M, marker, solid, zoneTris, segmentHits, add, sub, scale, fmt } from './common.mjs';

const ZONE_OF = { tally_house: 'env_tally_house', the_gallery: 'env_the_gallery', lift_hall: 'env_lift_hall', the_bore: 'env_the_bore' };

test('every door and gate opening is clear at its marker size', async () => {
  const doors = L.markers.filter((m) => m.type === 'door' && (ZONE_OF[m.zone] || m.id === 'door_tally'));
  const files = await Promise.all(Object.values(ZONE_OF).map((id) => zoneTris(id)));
  for (const d of doors) {
    let rays = 0;
    if (d.params?.kind === 'hatch') {                                   // a floor opening: vertical segments through the floor slab
      const [w, , dz] = d.size;
      for (const fx of [-0.45, -0.2, 0, 0.2, 0.45]) for (const fz of [-0.42, 0, 0.42]) {
        const p = [d.pos[0] + fx * w, 0, d.pos[2] + fz * dz]; rays++;
        for (const Z of files) assert.equal(segmentHits(Z, add(p, [0, 0.3, 0]), add(p, [0, -0.29, 0])).length, 0, `${d.id}: blocked at ${fmt(p)}`);       // through the 0.3 m floor slab
      }
    } else {
      const [w, h] = d.size, r = ((d.rotY ?? 0) * Math.PI) / 180;
      const fwd = [-Math.sin(r), 0, -Math.cos(r)], right = [Math.cos(r), 0, -Math.sin(r)];
      for (const fx of [-0.47, -0.25, 0, 0.25, 0.47]) for (const fy of [0.03, 0.3, 0.6, 0.97]) {
        const p = add(add(d.pos, scale(right, fx * (w - 0.04) * 1.0)), [0, fy * (h - 0.06) + 0.01, 0]);
        if (d.params?.kind === 'disc' && Math.hypot(fx * w, fy * h - h / 2) > w / 2 - 0.05) continue;   // the round door: its circle
        rays++;
        for (const Z of files) {
          const hits = segmentHits(Z, sub(p, scale(fwd, 0.8)), add(p, scale(fwd, 0.8)));
          assert.equal(hits.length, 0, `${d.id}: the ${w} x ${h} m opening is blocked at ${fmt(p)}`);
        }
      }
    }
    console.log(`    ${d.id} (${d.size.slice(0, 2).join(' x ')} m): ${rays} segments through it, all clear`);
  }
});

function boxFaces(s) {
  const r = ((s.rotY ?? 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r), [hx, hy, hz] = s.size.map((v) => v / 2);
  const toW = (x, z) => [s.pos[0] + x * c + z * sn, s.pos[2] - x * sn + z * c];
  const faces = [];
  for (const [ax, sign] of [[0, 1], [0, -1], [2, 1], [2, -1]]) {
    const n = ax === 0 ? toW(sign, 0) : toW(0, sign); const nn = [n[0] - s.pos[0], 0, n[1] - s.pos[2]];
    const span = ax === 0 ? hz : hx;
    for (let t = -span + 0.3; t <= span - 0.3 + 1e-6; t += Math.max(0.3, (2 * span - 0.6) / 4)) {             // 0.3 m in from the solid's edges
      const [x, z] = ax === 0 ? toW(sign * hx, t) : toW(t, sign * hz);
      for (const y of [s.pos[1] - hy + 0.12, Math.min(s.pos[1] + hy - 0.12, s.pos[1] - hy + 2.2)]) faces.push({ p: [x, y, z], n: nn });
    }
  }
  return faces;
}

test('ribs, cabinet, cowl, hearth, kerb and merlons are drawn within 0.25 m of their solids', async () => {
  const want = L.solids.filter((s) => ZONE_OF[s.zone] && !s.invisible && (/^(lh_rib_|bo_rib_|bo_kerb_hi_|ty_latch_cowl_back|ty_hearth$|lh_ramp_cabinet)/.test(s.id)));
  for (const s of want) {
    const Z = await zoneTris(ZONE_OF[s.zone]);
    let n = 0;
    for (const f of boxFaces(s)) {
      // faces that stand against a wall are hidden in it: skip a sample whose outside is inside another wall solid
      const hits = segmentHits(Z, add(f.p, scale(f.n, 0.25)), sub(f.p, scale(f.n, 0.25)));
      if (s.id === 'ty_hearth' && f.n[0] > 0.5) continue;              // its back is the east wall
      if (s.id.startsWith('bo_kerb_hi') && Math.abs(f.n[0] * (s.pos[0] - 14) + f.n[2] * (s.pos[2] - 96)) < 0.5) continue;   // merlon ends run along the ring
      n++;
      assert.ok(hits.length > 0, `${s.id}: no drawn surface within 0.25 m of its face at ${fmt(f.p)}`);
    }
    console.log(`    ${s.id}: ${n} face samples covered`);
  }
  // the kerb ring (a cylinder): inner and outer faces at 0.3 m up all round
  const Z = await zoneTris('env_the_bore'); let k = 0;
  for (let b = 0; b < 360; b += 7.5) for (const [r, dir] of [[3.0, -1], [3.6, 1]]) {
    const u = [Math.sin((b * Math.PI) / 180), 0, -Math.cos((b * Math.PI) / 180)];
    const p = [14 + u[0] * r, -43.7, 96 + u[2] * r]; k++;
    assert.ok(segmentHits(Z, add(p, scale(u, 0.25 * dir)), sub(p, scale(u, 0.25 * dir))).length > 0, `bo_kerb: no drawn face near ${fmt(p)}`);
  }
  console.log(`    bo_kerb: ${k} samples round the ring covered`);
});

test('nothing over 0.35 m stands on a nav link', async () => {
  const byId = new Map(L.nav.nodes.map((n) => [n.id, n]));
  for (const [zone, id] of Object.entries(ZONE_OF)) {
    const Z = await zoneTris(id); let samples = 0;
    for (const [a, b] of L.nav.links) {
      const na = byId.get(a), nb = byId.get(b);
      if (na.zone !== zone || nb.zone !== zone) continue;
      const d = sub(nb.pos, na.pos), l = Math.hypot(d[0], d[2]), n = Math.max(1, Math.ceil(l / 0.3));
      for (let i = 0; i <= n; i++) {
        const q = add(na.pos, scale(d, i / n)); samples++;
        // stand on the zone's own floor under the link (a link between two slopes cuts a corner below the floor)
        // (n_lh_003 - n_lh_005 runs straight from the gantry deck to the middle of the ramp: 0.56 m under the ramp's head)
        const below = segmentHits(Z, add(q, [0, 0.9, 0]), add(q, [0, -0.6, 0]));
        const p = below.length ? add(q, [0, 0.9 - below[0].d, 0]) : q;
        const hits = segmentHits(Z, add(p, [0, 0.36, 0]), add(p, [0, 1.85, 0]));
        assert.equal(hits.length, 0, `${zone}: something stands over the link ${a} - ${b} at ${fmt(p)} (${hits.length} hits)`);
      }
    }
    console.log(`    ${zone}: ${samples} samples on its nav links, clear from 0.36 to 1.85 m`);
  }
});
