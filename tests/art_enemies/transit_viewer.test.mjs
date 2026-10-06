// art-enemies-transit: every clip of enemy_transit (and proj_stake) through the real loader with no console error, and
// what each clip promises, measured on the bones (asset space: game metres, +Y up, the creature faces +Z).
import test from 'node:test';
import assert from 'node:assert/strict';
import { manifest, openViewer, setClip, startServer } from './transit_lib.mjs';

const A = 'enemy_transit';
const LEGS = ['a', 'b', 'c'];
const AZ = { a: 180, b: 60, c: 300 };
const footRest = (l, r = 0.55) => [Math.sin(AZ[l] * Math.PI / 180) * r, 0, Math.cos(AZ[l] * Math.PI / 180) * r];
const rot = (q, v) => {                                  // rotate v by quaternion q = [x, y, z, w]
  const [x, y, z, w] = q, [a, b, c] = v;
  const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
  return [a + w * tx + (y * tz - z * ty), b + w * ty + (z * tx - x * tz), c + w * tz + (x * ty - y * tx)];
};
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const SHIN = Math.hypot(0.05, 0.71);                     // knee pivot -> the centre of the ground plate

let server, game, clips;
const pose = (clip, t) => game.page.evaluate(([c, x]) => { window.__dbg.ext.viewer.setClip(c, x); return window.__dbg.ext.viewer.pose(); }, [clip, t]);
const feet = (p) => Object.fromEntries(LEGS.map((l) => [l, add(p[`leg_${l}_lower`].pos, rot(p[`leg_${l}_lower`].quat, [0, SHIN, 0]))]));
const frames = (clip) => Math.round(clips[clip].seconds * 30);
const lensDir = (p) => rot(p.lens.quat, [0, 0, 1]);      // an unrotated socket faces +Z

test.before(async () => {
  server = await startServer();
  clips = Object.fromEntries(manifest().assets[A].animations.map((c) => [c.name, c]));
  game = await openViewer(server, A, { yaw: 30, pitch: 10 });
});
test.after(async () => { await game.close(); await server.close(); });

test('transit: the rest pose stands on three feet 0.55 m from the centre, lens at eye height, about 1.9 m tall', async () => {
  const p = await pose('', 0);
  const f = feet(p);
  for (const l of LEGS) assert.ok(dist(f[l], footRest(l)) < 0.005, `foot ${l} at ${f[l].map((x) => x.toFixed(3))}`);
  assert.ok(Math.abs(p.lens.pos[1] - 1.575) < 0.01 && p.lens.pos[2] > 0.15, `lens at ${p.lens.pos}`);
  assert.ok(lensDir(p)[2] > 0.999, 'the lens looks along +Z');
  assert.ok(p.stake_muzzle.pos[2] > 0.35 && p.stake_muzzle.pos[1] < p.lens.pos[1], `stake_muzzle at ${p.stake_muzzle.pos}`);
  const size = await game.page.evaluate(() => { const b = window.__dbg.ext.core.ctx().scene.dynamic.getObjectByName('viewer_holder'); let lo = Infinity, hi = -Infinity; b.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); lo = Math.min(lo, o.geometry.boundingBox.min.y); hi = Math.max(hi, o.geometry.boundingBox.max.y); } }); return [lo, hi]; });
  console.log(`  mesh height ${size[0].toFixed(3)} .. ${size[1].toFixed(3)} m (the spikes are under the ground plates)`);
  assert.ok(size[1] > 1.85 && size[1] < 1.95, `top at ${size[1]}`);
});

test('transit: every clip plays through the viewer; loops close; idle_scan starts on the rest pose', async () => {
  const rest = await pose('', 0);
  for (const name of Object.keys(clips)) {
    const a = await pose(name, 0), b = await pose(name, 1);
    if (clips[name].loop) for (const k of Object.keys(a)) assert.ok(dist(a[k].pos, b[k].pos) < 1e-3, `${name}: ${k} differs between the first and the last frame`);
  }
  const a = await pose('idle_scan', 0);
  for (const k of Object.keys(a)) assert.ok(dist(a[k].pos, rest[k].pos) < 1e-3, `idle_scan frame 0: ${k} is not at rest`);
});

test('transit: walk is a three-beat gait (two cycles in the clip) with the drum perfectly level and a 0.84 m stride', async () => {
  const n = frames('walk'); const air = { a: 0, b: 0, c: 0 }; let two = 0; let ref = null; const zs = { a: [], b: [], c: [] };
  for (let i = 0; i < n; i++) {
    const p = await pose('walk', i / n); const f = feet(p);
    const up = LEGS.filter((l) => f[l][1] > 0.012);
    for (const l of up) air[l]++;
    for (const l of LEGS) zs[l].push(up.includes(l) ? null : f[l][2]);
    if (up.length > 1) two++;
    if (!ref) ref = p;
    assert.ok(dist(p.head.pos, ref.head.pos) < 5e-4, `frame ${i}: the drum moved ${dist(p.head.pos, ref.head.pos)}`);
    assert.ok(dist(p.lens.pos, ref.lens.pos) < 5e-4, `frame ${i}: the lens moved`);
    for (const l of LEGS) assert.ok(f[l][1] > -0.004, `frame ${i}: foot ${l} is ${f[l][1].toFixed(3)} under the ground`);
  }
  console.log(`  frames in the air of ${n}: a ${air.a}, b ${air.b}, c ${air.c}; frames with two feet up: ${two}`);
  for (const l of LEGS) assert.ok(air[l] >= 6 && air[l] <= 10, `leg ${l} is in the air for ${air[l]} frames`);
  // the stance: a planted foot travels back under the body at a steady 2.8 m/s (0.84 m in 0.3 s), over at least 0.75 m
  for (const l of LEGS) {
    const steps = [], z = zs[l];
    for (let i = 1; i < z.length; i++) if (z[i] !== null && z[i - 1] !== null) steps.push(z[i - 1] - z[i]);
    const ground = z.filter((v) => v !== null), travel = Math.max(...ground) - Math.min(...ground);
    const mean = steps.reduce((x, y) => x + y, 0) / steps.length * 30;
    console.log(`  leg ${l}: stance speed ${mean.toFixed(2)} m/s, travel seen on whole frames ${travel.toFixed(2)} m`);
    for (const d of steps) assert.ok(Math.abs(d * 30 - 2.8) < 0.15, `leg ${l}: a stance step of ${(d * 30).toFixed(2)} m/s`);
    assert.ok(travel > 0.7, `leg ${l}: stance travel ${travel}`);
  }
  assert.equal(two, 0, 'one leg at a time');
});

test('transit: planted feet do not slide or sink in plant (end), aim_hold and fire; aim dips the head 12 degrees', async () => {
  const end = feet(await pose('plant', 1));
  for (const [clip, n] of [['aim_hold', frames('aim_hold')], ['fire', frames('fire')]]) {
    for (let i = 0; i <= n; i++) {
      const p = await pose(clip, i / n); const f = feet(p);
      for (const l of LEGS) assert.ok(dist(f[l], end[l]) < 0.004, `${clip} frame ${i}: foot ${l} is ${dist(f[l], end[l]).toFixed(4)} m from where plant left it`);
    }
  }
  for (const l of LEGS) assert.ok(Math.abs(end[l][1]) < 0.003, `plant ends with foot ${l} at height ${end[l][1]}`);
  const rest = await pose('', 0), planted = await pose('plant', 1), aim = await pose('aim_hold', 0);
  assert.ok(Math.abs((rest.head.pos[1] - planted.head.pos[1]) - 0.02) < 0.003, `the drum settles ${(rest.head.pos[1] - planted.head.pos[1]).toFixed(3)} m`);
  const d = lensDir(aim), dip = Math.asin(-d[1]) * 180 / Math.PI;
  console.log(`  aim_hold dip ${dip.toFixed(2)} degrees`);
  assert.ok(Math.abs(dip - 12) < 0.3, `dip ${dip}`);
  // the tremor: the lens moves less than 1.5 mm over the whole loop, and it does move
  let far = 0; const n = frames('aim_hold');
  for (let i = 0; i < n; i++) { const p = await pose('aim_hold', i / n); far = Math.max(far, dist(p.lens.pos, aim.lens.pos)); }
  assert.ok(far < 0.0015, `the lens wanders ${far} m in aim_hold`);
  // fire: the drum recoils about 6 cm and comes back to the aim pose
  let back = 0; const nf = frames('fire');
  for (let i = 0; i <= nf; i++) { const p = await pose('fire', i / nf); back = Math.max(back, aim.lens.pos[2] - p.lens.pos[2]); }
  console.log(`  fire: the lens recoils ${back.toFixed(3)} m`);
  assert.ok(back > 0.05 && back < 0.07, `recoil ${back}`);
  const last = await pose('fire', 1);
  assert.ok(dist(last.lens.pos, aim.lens.pos) < 0.002, 'fire ends on the aim pose');
});

test('transit: idle_scan steps and holds; flinch snaps about 20 degrees aside and lifts one leg', async () => {
  const n = frames('idle_scan'); const yaws = [];
  for (let i = 0; i <= n; i++) { const d = lensDir(await pose('idle_scan', i / n)); yaws.push(Math.atan2(d[0], d[2]) * 180 / Math.PI); }
  let still = 0, big = 0;
  for (let i = 1; i < yaws.length; i++) { const s = Math.abs(yaws[i] - yaws[i - 1]); if (s < 0.05) still++; if (s > 3) big++; }
  console.log(`  idle_scan: yaw ${Math.min(...yaws).toFixed(1)} .. ${Math.max(...yaws).toFixed(1)} degrees, ${still} still frames of ${n}, ${big} frames faster than 90 deg/s`);
  assert.ok(still > n * 0.55, 'mostly holds');
  assert.ok(big >= 8, 'moves in snaps');
  assert.ok(Math.max(...yaws) > 25 && Math.min(...yaws) < -25);
  const nf = frames('flinch'); let yaw = 0, lift = 0;
  for (let i = 0; i <= nf; i++) { const p = await pose('flinch', i / nf); const d = lensDir(p); yaw = Math.max(yaw, Math.abs(Math.atan2(d[0], d[2])) * 180 / Math.PI); lift = Math.max(lift, ...Object.values(feet(p)).map((f) => f[1])); }
  console.log(`  flinch: yaw ${yaw.toFixed(1)} degrees, a foot lifts ${lift.toFixed(3)} m`);
  assert.ok(yaw > 18 && yaw < 27 && lift > 0.08);
});

test('transit: emerge starts as a folded bundle about 1.1 m tall and ends standing; die_fold ends lens-down on the ground', async () => {
  const fold = await pose('emerge', 0), up = await pose('emerge', 1), rest = await pose('', 0);
  const top = fold.head.pos[1] + (1.80 - 1.25);            // the drum's top above its ball joint (the drum is bowed: a little less)
  console.log(`  emerge: folded, the ball joint is at ${fold.head.pos[1].toFixed(3)} m, the drum top below ${top.toFixed(2)} m`);
  assert.ok(top < 1.30 && fold.head.pos[1] < 0.63, `folded height ${top}`);
  assert.ok(lensDir(fold)[1] < -0.8, 'the drum is bowed right over in the bundle');
  for (const k of Object.keys(up)) assert.ok(dist(up[k].pos, rest[k].pos) < 2e-3, `emerge ends off the rest pose at ${k}`);
  const dead = await pose('die_fold', 1), d = lensDir(dead);
  console.log(`  die_fold: lens direction ${d.map((x) => x.toFixed(2))}, lens height ${dead.lens.pos[1].toFixed(3)} m`);
  assert.ok(d[1] < -0.9, `the lens faces down (${d})`);
  assert.ok(dead.lens.pos[1] < 0.20 && dead.lens.pos[1] > 0.02, `lens height ${dead.lens.pos[1]}`);
  const f = feet(dead);
  for (const l of LEGS) assert.ok(f[l][1] > -0.01 && f[l][1] < 0.06, `die_fold: foot ${l} at height ${f[l][1].toFixed(3)}`);
  const a = await pose('die_fold', 0.9);
  for (const k of Object.keys(a)) assert.ok(dist(a[k].pos, dead[k].pos) < 1e-3, 'die_fold holds its last pose');
});

test('transit: no clip pops (no bone pivot or socket moves more than 0.35 m in a frame) and no vertex goes under the ground', async () => {
  // the skinned vertices in asset space, on the page: lowest point of the mesh at this pose
  const lowest = () => game.page.evaluate(() => {
    window.__dbg.step(0, true);
    const holder = window.__dbg.ext.core.ctx().scene.dynamic.getObjectByName('viewer_holder');
    const root = holder.getObjectByName('enemy_transit');
    holder.updateMatrixWorld(true);
    let mesh = null; holder.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    mesh.skeleton.update();
    const inv = root.matrixWorld.clone().invert(), V = root.position.clone(), n = mesh.geometry.attributes.position.count;
    let lo = Infinity;
    for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, V); V.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv); if (V.y < lo) lo = V.y; }
    return lo;
  });
  const worst = {};
  for (const name of Object.keys(clips)) {
    const n = frames(name); let prev = null, jump = 0, at = '', low = Infinity, lowAt = 0, footJump = 0;
    for (let i = 0; i <= n; i++) {
      const p = await pose(name, i / n), f = feet(p), lo = await lowest();
      if (lo < low) { low = lo; lowAt = i; }
      if (prev) {
        for (const k of Object.keys(p)) { const d = dist(p[k].pos, prev.p[k].pos); if (d > jump) { jump = d; at = `${k} f${i}`; } }
        for (const l of LEGS) footJump = Math.max(footJump, dist(f[l], prev.f[l]));
      }
      prev = { p, f };
    }
    worst[name] = { jump, at, low, lowAt, footJump };
    console.log(`  ${name.padEnd(11)} largest pivot step ${jump.toFixed(3)} m (${at}); largest foot step ${footJump.toFixed(3)} m; lowest vertex ${low.toFixed(3)} m (f${lowAt})`);
  }
  for (const [name, w] of Object.entries(worst)) {
    assert.ok(w.jump <= 0.35, `${name}: ${w.at} moves ${w.jump.toFixed(3)} m in one frame`);
    // walk: at the two ends of a 0.84 m stride the shin leans 30 degrees and the rim of the 0.10 m ground plate digs
    // 1.5 cm deeper than the spike does at rest (the plate's CENTRE stays on the ground: asserted in the walk test)
    assert.ok(w.low >= (name === 'walk' ? -0.07 : -0.055), `${name}: a vertex is ${w.low.toFixed(3)} m under the ground on frame ${w.lowAt}`);
  }
});

test('transit: emerge unfolds one, two, three: each knee leaves the ground upward and never dips, each foot strikes once', async () => {
  const n = frames('emerge'); const strikes = {}; const kneeY = { a: [], b: [], c: [] };
  for (let i = 0; i <= n; i++) {
    const p = await pose('emerge', i / n), f = feet(p);
    for (const l of LEGS) {
      kneeY[l].push(p[`leg_${l}_lower`].pos[1]);
      assert.ok(f[l][1] > -0.004, `frame ${i}: foot ${l} is ${f[l][1].toFixed(3)} under the ground`);
      if (strikes[l] === undefined && i > 4 && f[l][1] < 0.004) strikes[l] = i;
    }
  }
  console.log(`  emerge: strikes on frames b ${strikes.b}, c ${strikes.c}, a ${strikes.a}; knee heights at f0 ${LEGS.map((l) => kneeY[l][0].toFixed(3))}`);
  assert.ok(strikes.b < strikes.c && strikes.c < strikes.a, 'front-left, front-right, rear');
  assert.ok(strikes.c - strikes.b >= 4 && strikes.a - strikes.c >= 4, 'the strikes are apart');
  for (const l of LEGS) {
    const lo = Math.min(...kneeY[l]);
    assert.ok(lo > 0.08, `knee ${l} pivot dips to ${lo.toFixed(3)} m (its disc has a radius of 0.084 m)`);
    for (let i = 1; i < kneeY[l].length; i++) assert.ok(Math.abs(kneeY[l][i] - kneeY[l][i - 1]) < 0.2, `knee ${l} jumps ${(kneeY[l][i] - kneeY[l][i - 1]).toFixed(2)} m on frame ${i}`);
  }
});

test('transit: die_fold starts on the aim pose (it is killed while it holds still)', async () => {
  const aim = await pose('aim_hold', 0), die = await pose('die_fold', 0);
  let far = 0; for (const k of Object.keys(aim)) far = Math.max(far, dist(aim[k].pos, die[k].pos));
  console.log(`  die_fold frame 0 against aim_hold frame 0: ${far.toFixed(4)} m at most`);
  assert.ok(far < 0.002, `die_fold starts ${far} m off the aim pose`);
});

test('stake: proj_stake loads through the viewer with no console error', async () => {
  const g = await openViewer(server, 'proj_stake', {});
  await g.dbg('step', 0, true);
  await g.close();
});
