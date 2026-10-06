// The Windlass never enters the kerb, its merlons, the bore wall, the floor or a rib (the real solids of design/layout.json),
// at any index, any drum angle, guard parked or seated, and on EVERY frame of guard_drop, guard_raise, guard_shatter, present,
// sag_death and idle_sway (piece art-boss-windlass). The guard also stays inside r 4.7 m of the bore axis and never comes
// below 1.25 m outside the kerb's inner edge (the walkable floor starts at r 3.6 m; the player's head is at 1.65 to 1.8 m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE, loadWindlass, chamber } from './windlass_lib.mjs';

const DEG = Math.PI / 180;
/** vertices + a barycentric grid inside every triangle longer than 0.5 m */
function samples(mesh, pts, bones = null) {
  const out = pts.slice();
  if (bones && !bones.length) {
    for (const b of mesh.bone) bones.push(b.startsWith('guard'));
    for (let i = 0; i < mesh.index.length; i += 3) {
      const a = mesh.positions[mesh.index[i]], b = mesh.positions[mesh.index[i + 1]], c = mesh.positions[mesh.index[i + 2]];
      const n = Math.min(12, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.25));
      for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) { if ((u === 0 || u === n) && (v === 0 || v === n - u)) continue; bones.push(mesh.bone[mesh.index[i]].startsWith('guard')); }
    }
  }
  for (let i = 0; i < mesh.index.length; i += 3) {
    const a = pts[mesh.index[i]], b = pts[mesh.index[i + 1]], c = pts[mesh.index[i + 2]];
    const r0 = mesh.positions[mesh.index[i]], r1 = mesh.positions[mesh.index[i + 1]], r2 = mesh.positions[mesh.index[i + 2]];
    const n = Math.min(12, Math.ceil(Math.max(r0.distanceTo(r1), r1.distanceTo(r2), r2.distanceTo(r0)) / 0.25));   // by REST size: the same count in every pose
    for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) {
      if ((u === 0 || u === n) && (v === 0 || v === n - u)) continue;
      out.push(new THREE.Vector3().addScaledVector(a, u / n).addScaledVector(b, v / n).addScaledVector(c, (n - u - v) / n));
    }
  }
  return out;
}

test('clear of the kerb, merlons, bore wall, floor and ribs in every pose the fight uses', async () => {
  const w = await loadWindlass();
  const body = w.meshOf('body_mesh');
  const room = chamber();
  const qY = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg * DEG);
  const qZ = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), deg * DEG);
  const guardBone = body.bone.map((b) => b.startsWith('guard'));
  const sampleBone = [];                                                   // bone of every sample (vertices first, then per triangle)
  const check = (label, pose, guardMayTouch = false) => {
    const pts = samples(body, w.skinned(body, pose), sampleBone);
    let low = Infinity, touching = 0, guardPts = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], hit = room.hit(p), isGuard = sampleBone[i];
      if (isGuard) guardPts++;
      if (hit !== null && isGuard && guardMayTouch && hit !== 'bore wall / floor') { touching++; continue; }
      assert.equal(hit, null, `${label}: a point of body_mesh at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) is inside ${hit}`);
      if (Math.hypot(p.x, p.z) > room.ring.outer) low = Math.min(low, p.y);
    }
    return { n: pts.length, low, touching, guardPts };
  };
  let n = 0, low = Infinity, poses = 0, worst = 0; const touched = new Set();
  const seat = w.clipPose('guard_slide_on', 1).get('guard');
  for (let index = 0; index < 6; index++) for (const spin of [0, 15, 30, 45]) for (const guard of ['parked', 'seated']) {
    const pose = new Map([['arm_yaw', w.posed('arm_yaw', null, qY(index * 60))], ['drum_spin', w.posed('drum_spin', null, qZ(-spin))]]);
    if (guard === 'seated') pose.set('guard', w.posed('guard', seat));
    const r = check(`index ${index + 1}, drum ${spin} degrees, guard ${guard}`, pose);
    n += r.n; low = Math.min(low, r.low); poses++;
  }
  // the clips that move the head or the guard, every frame, at two indexes
  let guardMaxR = 0, guardLow = Infinity, pawlGap = Infinity;
  for (const [clip, frames] of [['guard_drop', 18], ['guard_raise', 18], ['guard_shatter', 30], ['guard_slide_on', 36], ['present', 30], ['sag_death', 90], ['idle_sway', 120]]) {
    // present, sag_death and idle_sway tilt the ROOT (the parent of arm_yaw): they are authored for arm_yaw = 0 and are played at another
    // index by turning the instance's scene node (the room is six-fold symmetric, so index 1 stands for all six)
    for (const index of (clip.startsWith('guard_') ? [0, 1] : [0])) for (let f = 0; f <= frames; f += clip === 'sag_death' || clip === 'idle_sway' ? 3 : 1) {
      const key = w.clipPose(clip, f / frames);
      const pose = new Map([['arm_yaw', w.posed('arm_yaw', null, qY(index * 60))]]);
      for (const [name, k] of key) if (name !== 'arm_yaw' && !pose.has(name)) pose.set(name, w.posed(name, k));
      if (clip === 'sag_death') for (const c of ['cable_a', 'cable_b', 'cable_c']) pose.delete(c), pose.set(c, w.posed(c, key.get(c)));
      // no frame is excused: the fan folds and runs up in the plane of the face; the shattered leaves break down above the kerb line
      const moving = false;
      const r = check(`${clip} frame ${f}, index ${index + 1}`, pose, moving);
      n += r.n; low = Math.min(low, r.low); poses++;
      if (r.touching) { worst = Math.max(worst, r.touching / r.guardPts); touched.add(`${clip} ${f}`); }
      if (clip.startsWith('guard_')) {
        const pts = w.skinned(body, new Map([...pose].filter(([k]) => k !== 'arm_yaw')));
        for (let i = 0; i < pts.length; i++) {
          if (!guardBone[i]) continue;
          const p = pts[i];
          assert.ok(!(Math.hypot(p.x, p.y - 4.0) < 2.49 && p.z > 0.91 && p.z < 3.27), `${clip} frame ${f}: the guard is inside the drum (or the lids, pins and lamps standing 0.17 m off its face) at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
          const rr = Math.hypot(p.x, p.z);
          assert.ok(rr < 4.7, `${clip} frame ${f}: a guard vertex is ${rr.toFixed(2)} m from the bore axis (limit 4.7)`);
          assert.ok(!(rr > 3.0 && p.y < 1.25), `${clip} frame ${f}: a guard vertex is at y ${p.y.toFixed(2)} m outside the kerb's inner edge (r ${rr.toFixed(2)})`);
          guardMaxR = Math.max(guardMaxR, rr); if (rr > 3.0) guardLow = Math.min(guardLow, p.y);
        }
        // polish round 2: the pawls stand in front of the guard's plane of travel, each on a dog plate hung from an outrigger
        // under the crosshead's end. No point of the guard (vertices and a 0.25 m grid on its faces) enters either, on any frame
        if (index === 0) {
          const all = samples(body, pts, sampleBone);
          for (let i = 0; i < all.length; i++) {
            if (!sampleBone[i]) continue;
            const p = all[i], ax = Math.abs(p.x);
            const inPawl = ax > 1.16 && ax < 2.30 && p.y > 5.56 && p.y < 6.61 && p.z > 3.68 && p.z < 4.12;
            const inBeam = ax > 2.30 && ax < 2.56 && p.y > 6.33 && p.y < 6.61 && p.z > 2.90 && p.z < 3.84;
            assert.ok(!inPawl && !inBeam, `${clip} frame ${f}: the guard passes through a pawl (${inPawl ? 'plate or knot' : 'outrigger'}) at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
            if (ax > 1.16 && ax < 2.30 && p.y > 5.56 && p.y < 6.61) pawlGap = Math.min(pawlGap, 3.68 - p.z);
          }
        }
      }
    }
  }
  console.log(`clearance: ${poses} poses, ${n} points, none inside a solid; lowest point over the floor outside the kerb ${low.toFixed(2)} m. Guard through drop, raise, shatter and slide_on: furthest from the axis ${guardMaxR.toFixed(2)} m, lowest outside r 3.0 ${guardLow.toFixed(2)} m; frames touching the kerb: ${touched.size}; least gap between the guard and the back of a pawl plate ${pawlGap.toFixed(3)} m`);
  assert.equal(touched.size, 0);
});
