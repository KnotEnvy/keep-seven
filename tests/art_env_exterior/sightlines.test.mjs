// sightlines.test.mjs: the lines the level depends on are not blocked by the exterior's drawn geometry (LEVEL.md
// "preserve"): the doorway shot to the Rule, the kneeler from the gate, every nav node of trg_dowser and cp_yard_clear to
// the Dowser, the stand spot to all seven jugs, the street to the loft bell's rope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, Grid, loadAsset, marker } from './geo.mjs';

const EYE = 1.65;
let lip, street, day;
test.before(async () => {
  const a = await loadAsset('env_the_lip'), b = await loadAsset('env_plenty_street'), c = await loadAsset('env_backdrop_day');
  const all = new Float64Array(a.tris.length + b.tris.length);
  all.set(a.tris); all.set(b.tris, a.tris.length);
  lip = new Grid(all); street = lip; day = c;
});

function clear(grid, from, to, what, stopShort = 0.3) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const end = [from[0] + (to[0] - from[0]) * (1 - stopShort / d), from[1] + (to[1] - from[1]) * (1 - stopShort / d), from[2] + (to[2] - from[2]) * (1 - stopShort / d)];
  const hit = grid.segment(from, end);
  assert.equal(hit, null, `${what}: blocked ${hit ? (hit.t * d).toFixed(2) + ' m from the eye' : ''}`);
}

test('the doorway shot: player_start sees the foot of the Rule over the forecourt wall', () => {
  const s = marker('player_start').pos, t = marker('vista_rule').params.target;
  const eye = [s[0], s[1] + EYE, s[2]];
  // the Rule's foot is on the horizon due north: aim at the horizon (the sky shader draws the line from there up)
  const far = [t[0], eye[1] + 2.0, s[2] - 400.0];
  clear(lip, eye, far, 'player_start -> the Rule (horizon, due north)');
  clear(lip, eye, t, 'player_start -> vista_rule target');
});

test('the kneeler is seen from the gate down the street centre', () => {
  const v = marker('vista_kneeler');
  clear(street, [v.pos[0], v.pos[1] + EYE, v.pos[2]], v.params.target, 'vista_kneeler');
});

test('the Dowser is seen from every nav node in trg_dowser and from cp_yard_clear', () => {
  const sock = day.nodes.get('socket_dowser');
  assert.ok(sock, 'env_backdrop_day has socket_dowser');
  const tg = marker('trg_dowser'); const [sx, , sz] = tg.size;
  const inside = (p) => Math.abs(p[0] - tg.pos[0]) <= sx / 2 && Math.abs(p[2] - tg.pos[2]) <= sz / 2;
  const nodes = L.nav.nodes.filter((n) => n.zone === 'plenty_street' && inside(n.pos));
  assert.ok(nodes.length > 0);
  const target = [sock[0], sock[1] + 1.0, sock[2]];
  for (const n of nodes) clear(street, [n.pos[0], n.pos[1] + EYE, n.pos[2]], target, `${n.id} -> socket_dowser`, 60.0);
  const cp = marker('cp_yard_clear').pos;
  clear(street, [cp[0], cp[1] + EYE, cp[2]], target, 'cp_yard_clear -> socket_dowser', 60.0);
  console.log(`    ${nodes.length} nav nodes and cp_yard_clear see socket_dowser at (${sock.map((v) => v.toFixed(1)).join(', ')})`);
});

test('from the stand spot all seven jugs are in sight', () => {
  const stand = marker('trg_pz_jugs').params.standSpot;
  const eye = [stand[0], stand[1] + EYE, stand[2]];
  for (let k = 1; k <= 7; k++) {
    const j = marker('ia_jug_' + k).pos;
    clear(lip, eye, [j[0], j[1] + 0.25, j[2]], 'stand spot -> ia_jug_' + k, 0.35);
  }
});

test('the loft bell rope is seen from the street centre through the open loft door', () => {
  const rope = marker('sec_loft_bell_rope').pos;
  clear(street, [-23, 1.65, 0], rope, 'street centre -> sec_loft_bell_rope', 0.25);
});

// Polish round 3, lead ruling R4: "a dark, readable silhouette at least 24 px tall at 720p against clear sky". Round 2
// stood him on a bench with a cliff behind (pale on rock): the L1 fog lifts that rock to L* 72 and he was light on light.
// He now stands on the mesa's highest knob: nothing of the backdrop is in front of him, and nothing behind any part of a
// figure up to 14 m tall and 6 m wide (26 px at 720p is 10.6 m at 245 m), from the whole of trg_dowser.
test('the Dowser stands against clear sky: from the whole of trg_dowser nothing of the backdrop is behind him from 0.6 m to 14 m above his feet', () => {
  const sock = day.nodes.get('socket_dowser');
  const g = new Grid(day.tris, 8.0);
  const tg = marker('trg_dowser');
  let n = 0;
  for (const sx of [-0.5, 0, 0.5]) for (const sz of [-0.5, 0, 0.5]) {
    const eye = [tg.pos[0] + sx * tg.size[0], EYE, tg.pos[2] + sz * tg.size[2]];
    for (const h of [0.6, 2, 4, 8, 11, 14]) for (const side of [-3, 0, 3]) {
      const p = [sock[0], sock[1] + h, sock[2] + side];
      const d = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      const u = [(p[0] - eye[0]) / d, (p[1] - eye[1]) / d, (p[2] - eye[2]) / d];
      // nothing of the backdrop in front of him ...
      const before = [eye[0] + u[0] * (d - 0.5), eye[1] + u[1] * (d - 0.5), eye[2] + u[2] * (d - 0.5)];
      assert.equal(g.segment(eye, before), null, `a backdrop card stands between (${eye.map((v) => v.toFixed(1))}) and the Dowser at +${h} m`);
      // ... and open sky behind him: no ring, cliff or cloud within 1 200 m on the same ray
      const beyond = [p[0] + u[0] * 1200, p[1] + u[1] * 1200, p[2] + u[2] * 1200];
      const hit = g.segment([p[0] + u[0] * 0.5, p[1] + u[1] * 0.5, p[2] + u[2] * 0.5], beyond);
      assert.equal(hit, null, `rock or cloud behind the Dowser at +${h} m, ${side} m aside, seen from (${eye.map((v) => v.toFixed(1))})`);
      n++;
    }
  }
  // and his feet are on the skyline: the rock is right under them (0.6 m below his feet the same rays meet the mesa)
  const eye = [tg.pos[0], EYE, tg.pos[2]];
  assert.ok(g.segment(eye, [sock[0] - 1, sock[1] - 0.6, sock[2]]), 'the mesa top is under his feet');
  console.log(`    ${n} rays: open sky behind the Dowser on every one`);
});

test('the far country has no right-angle steps: no ring of either backdrop has a vertical side taller than 6 m on its outline', async () => {
  // a mesa's side is scree (29-37 degrees) under a battered cliff: every OUTLINE edge of the ring cards leans. The old
  // cards were one height each, so every change of height was a vertical outline edge (a city skyline). An outline edge
  // is one that belongs to a single triangle.
  const dusk = await loadAsset('env_backdrop_dusk');
  for (const [id, a, c] of [['env_backdrop_day', day, [-40, 30]], ['env_backdrop_dusk', dusk, [14, 60]]]) {
    const edges = new Map();
    const key = (p) => p.map((x) => Math.round(x * 20)).join(',');
    for (let i = 0; i < a.tris.length; i += 9) {
      const v = [0, 1, 2].map((k) => [a.tris[i + k * 3], a.tris[i + k * 3 + 1], a.tris[i + k * 3 + 2]]);
      if (!v.every((p) => [200, 350, 550, 800].some((R) => Math.abs(Math.hypot(p[0] - c[0], p[2] - c[1]) - R) < 0.5))) continue;       // the four rings only (not the pylon line, the clouds, the plain)
      if (v.every((p) => Math.abs(p[1] - v[0][1]) < 0.01)) continue;                              // the plain
      for (let k = 0; k < 3; k++) {
        const p = v[k], q = v[(k + 1) % 3];
        const ka = key(p), kb = key(q), kk = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        const e = edges.get(kk) ?? { n: 0, p, q }; e.n++; edges.set(kk, e);
      }
    }
    let steps = 0, worst = 0, outline = 0;
    for (const e of edges.values()) {
      if (e.n !== 1) continue;
      const run = Math.hypot(e.p[0] - e.q[0], e.p[2] - e.q[2]), rise = Math.abs(e.p[1] - e.q[1]);
      if (Math.max(e.p[1], e.q[1]) < 0) continue;                                                  // the cards' feet, under the plain
      outline++;
      if (rise > 6 && run < 0.12 * rise) { steps++; worst = Math.max(worst, rise); }             // steeper than 83 degrees
    }
    console.log(`    ${id}: ${outline} outline edges on the rings, ${steps} of them vertical and over 6 m`);
    assert.ok(outline > 100, `${id}: the rings have an outline`);
    assert.equal(steps, 0, `${id}: ${steps} vertical outline sides (tallest ${worst.toFixed(1)} m)`);
  }
});
