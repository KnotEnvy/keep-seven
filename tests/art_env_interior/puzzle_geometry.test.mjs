// The three puzzles staged against the interior walls, held to the centimetre (work order art-env-interior 5):
//  (a) daylight: the three shutter openings are clear, and each blade ray from its window centre along the sun's
//      travel reaches its landing point without hitting zone geometry first;
//  (b) proving_line: the line eye -> knot_a -> knot_b -> knot_c is unobstructed but for each knot's own seat, and
//      every seat's face lies within 0.10 m behind its marker;
//  (c) the kept shot: from every proving mark at eye height the open bore is seen from 3.5 to 29 degrees below the
//      horizon;
//  (d) the cowl hides knot_hatch_latch from every nav node south of z -34.5;
//  (e) the hatch opening cannot be seen from trg_set_swap.
// Geometry = the SHIPPED zone files (public/assets/env), opaque structure only (m_frontier / m_pellam).
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, marker, zoneTris, segmentHits, add, sub, scale, norm, len, fmt } from './common.mjs';

const TRAVEL = L.meta.sun.travel;

test('(a) daylight: the shutter openings are clear and the three blades reach their landing points', async () => {
  const Z = await zoneTris('env_tally_house');
  for (const sid of ['shutter_s', 'shutter_m', 'shutter_n']) {
    const m = marker(sid), w = m.params.window, c = m.pos;
    // nine points of the opening, each cast through the 1 m wall (x -95.7 .. -97.3)
    for (const dz of [-0.55, 0, 0.55]) for (const y of [w.yMin + 0.03, (w.yMin + w.yMax) / 2, w.yMax - 0.03]) {
      const hits = segmentHits(Z, [-95.7, y, c[2] + dz], [-97.3, y, c[2] + dz]);
      assert.equal(hits.length, 0, `${sid}: the opening is blocked at ${fmt([-96, y, c[2] + dz])} (${hits.length} hits)`);
    }
    // the blade: from the window centre along the sun's travel to each landing point
    const hitsList = m.params.blade.hits;
    for (const h of hitsList) {
      const to = h.pos, dir = norm(TRAVEL);
      const tEnd = (to[0] - c[0]) / dir[0];
      const end = add(c, scale(dir, tEnd));
      assert.ok(len(sub(end, to)) < 0.2, `${sid}: ${h.what} at ${fmt(to)} lies on the sun's line from the window (off by ${len(sub(end, to)).toFixed(3)} m)`);
      const hits = segmentHits(Z, c, end).filter((x) => x.d < tEnd - 0.12);
      // the head chair stands in the middle blade's path: the hearthstone is lit past it (the blade lands on both)
      const blocked = hits.filter((x) => !(sid === 'shutter_m' && h.what !== 'head_chair' && Math.abs(c[0] + dir[0] * x.d - (-85.5)) < 0.6));
      assert.equal(blocked.length, 0, `${sid}: the blade to ${h.what} ${fmt(to)} is cut at ${blocked[0] ? fmt(add(c, scale(dir, blocked[0].d))) : ''} (${blocked.length} hits before it)`);
      console.log(`    ${sid}: blade to ${h.what} ${fmt(to)} clear for ${tEnd.toFixed(2)} m`);
    }
  }
});

test('(b) proving_line: the line from the mark through the three knots, and their seats 0.10 m behind them', async () => {
  const Z = await zoneTris('env_the_gallery');
  const eye = marker('pz_proving_mark').params.eye;
  const ks = ['knot_a', 'knot_b', 'knot_c'].map((k) => marker(k).pos);
  const dir = norm(sub(ks[2], eye));
  for (const k of ks) {                                               // the three really are on one line through the eye
    const d = len(sub(k, eye)), p = add(eye, scale(dir, d));
    assert.ok(len(sub(p, k)) < 0.03, `knot ${fmt(k)} is ${len(sub(p, k)).toFixed(3)} m off the line`);
  }
  const far = add(ks[2], scale(dir, 0.2));
  const hits = segmentHits(Z, eye, far);
  const dk = ks.map((k) => len(sub(k, eye)));
  for (const [i, k] of ks.entries()) {
    const own = hits.filter((h) => h.d > dk[i] - 0.05 && h.d < dk[i] + 0.9);
    assert.ok(own.length > 0, `knot ${['a', 'b', 'c'][i]}: there is a seat behind it`);
    const face = own[0].d - dk[i];
    assert.ok(face >= 0.0 && face <= 0.10 + 0.01, `knot ${['a', 'b', 'c'][i]}: the seat's face is ${face.toFixed(3)} m behind the marker (0 .. 0.10)`);
    console.log(`    knot_${['a', 'b', 'c'][i]}: seat face ${face.toFixed(3)} m behind ${fmt(k)}`);
  }
  const stray = hits.filter((h) => !dk.some((d) => h.d > d - 0.05 && h.d < d + 0.9));
  assert.equal(stray.length, 0, `the line is cut ${stray.length} times away from the seats, first at ${stray[0] ? fmt(add(eye, scale(dir, stray[0].d))) : ''}`);
  // nothing else stands in the walkway volume (x -81..-19, z -15.5..-12.5, y -12..-7) but the knot seats and their pipes
  const T = Z.tris; let inside = 0, first = null;
  for (let t = 0; t < T.length; t += 9) {
    const cx = (T[t] + T[t + 3] + T[t + 6]) / 3, cy = (T[t + 1] + T[t + 4] + T[t + 7]) / 3, cz = (T[t + 2] + T[t + 5] + T[t + 8]) / 3;
    if (cx < -80.9 || cx > -19.1 || cz < -15.45 || cz > -12.55 || cy < -11.97 || cy > -7.03) continue;
    if (ks.some((k) => Math.hypot(cx - k[0] - 0.4, cz - k[2]) < 1.25 && Math.abs(cy - k[1]) < 0.9)) continue;     // a seat, its elbow / valve / box
    if (Math.abs(cx - (ks[1][0] + 0.4)) < 0.4 && Math.abs(cy - ks[1][1]) < 0.4) continue;                         // knot_b's cross pipe
    if (Math.abs(cx + 59.0) < 0.62 && cy > -9.02) continue;                                                       // the baffle wall over its 3 x 3 m opening (x -59.5..-58.5) and its door frames
    if (Math.abs(cx - ks[2][0]) < 0.6 && cy > -7.1) continue;                                                     // knot_c's conduit on the ceiling (0.08 m deep) from the north wall to its box
    inside++; first ??= [cx, cy, cz];
  }
  assert.equal(inside, 0, `${inside} triangles stand in the walkway volume, e.g. at ${first ? fmt(first) : ''}`);
});

test('(c) the kept shot: from each proving mark the open bore is seen from 3.5 to 29 degrees below the horizon', async () => {
  const Z = await zoneTris('env_the_bore');
  const ax = [14, -44, 96];
  for (let k = 1; k <= 6; k++) {
    const m = marker(`ia_proving_mark_${k}`).pos, eye = [m[0], m[1] + 1.65, m[2]];
    const h = norm([ax[0] - m[0], 0, ax[2] - m[2]]);
    const seen = [];
    for (let a = 3.5; a <= 29.0001; a += 0.5) {
      const r = (a * Math.PI) / 180, d = [h[0] * Math.cos(r), -Math.sin(r), h[2] * Math.cos(r)];
      const end = add(eye, scale(d, 40));
      const hit = segmentHits(Z, eye, end)[0];
      const p = hit ? add(eye, scale(d, hit.d)) : end;
      const rad = Math.hypot(p[0] - ax[0], p[2] - ax[2]);
      // seen = before it meets anything, the line passes over the open bore (r < 3) below the kerb's top (the target's lid, -42.8)
      let ok = false;
      for (let s = 0; s <= (hit ? hit.d : 40); s += 0.02) {
        const q = add(eye, scale(d, s));
        if (Math.hypot(q[0] - ax[0], q[2] - ax[2]) < 3.0 && q[1] < -42.8) { ok = true; break; }
      }
      seen.push(ok);
      assert.ok(ok, `mark ${k}: at ${a} degrees the line meets ${fmt(p)} (r ${rad.toFixed(2)}) before it opens on the bore`);
    }
    console.log(`    mark ${k}: the open bore is seen at all ${seen.length} angles from 3.5 to 29 degrees`);
  }
});

test('(d) the cowl hides knot_hatch_latch from every nav node south of z -34.5', async () => {
  const Z = await zoneTris('env_tally_house');
  const k = marker('knot_hatch_latch').pos, r = marker('knot_hatch_latch').params.hitRadius;
  const pts = [k, add(k, [r, 0, 0]), add(k, [-r, 0, 0]), add(k, [0, r, 0]), add(k, [0, -r, 0]), add(k, [0, 0, -r]), add(k, [0, 0, r * 0.6])];
  let rays = 0;
  for (const n of L.nav.nodes.filter((n) => n.zone === 'tally_house' && n.pos[2] > -34.5)) {
    for (const h of [1.65, 2.65]) {
      const eye = add(n.pos, [0, h, 0]);
      for (const p of pts) {
        rays++;
        const hits = segmentHits(Z, eye, p).filter((x) => x.t < 0.999);
        assert.ok(hits.length > 0, `${n.id} ${fmt(n.pos)} at ${h} m sees the knot point ${fmt(p)}`);
      }
    }
  }
  console.log(`    ${rays} rays from nav nodes south of z -34.5: all blocked`);
});

test('(e) the hatch opening cannot be seen from trg_set_swap', async () => {
  const G = await zoneTris('env_the_gallery'), T = await zoneTris('env_tally_house');
  const v = marker('trg_set_swap'), c = v.pos, s = v.size;
  const hatch = marker('ia_hatch'); const hc = hatch.pos, hs = hatch.size;
  let rays = 0;
  for (const dx of [-0.6, 0, 0.6]) for (const dz of [-0.8, 0, 0.8]) {
    const x = c[0] + dx, z = c[2] + dz;
    const ground = -4.0 - (z + 32.0) * (4 / 6);                      // flight 2's ramp
    for (const h of [1.65, 2.65]) {
      const eye = [x, ground + h, z];
      for (const ix of [-0.45, 0, 0.45]) for (const iz of [-0.45, 0, 0.45]) {
        const p = [hc[0] + ix * hs[0], -0.25, hc[2] + iz * hs[2]];
        rays++;
        const blocked = segmentHits(G, eye, p).some((x) => x.t < 0.995) || segmentHits(T, eye, p).some((x) => x.t < 0.995);
        assert.ok(blocked, `from ${fmt(eye)} the hatch opening point ${fmt(p)} is visible`);
      }
    }
  }
  console.log(`    ${rays} of ${rays} rays from the set-swap volume to the hatch opening are blocked`);
});
