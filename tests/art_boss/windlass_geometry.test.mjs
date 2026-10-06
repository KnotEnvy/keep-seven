// The numbers code-enemies and the GDD rely on, measured on the shipped file (piece art-boss-windlass; order art-boss 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE, HUB, loadWindlass } from './windlass_lib.mjs';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(4)} (wanted ${b} +- ${tol})`);
const DEG = 180 / Math.PI;
/** degrees clockwise from the top, seen from the front (+Z): the viewer has +X on her right */
const clock = (p) => ((Math.atan2(p.x - HUB.x, p.y - HUB.y) * DEG) + 360) % 360;

test('hub, drum size, knot ring, pawls, muzzles', async () => {
  const w = await loadWindlass();
  assert.ok(w.pos('drum_spin').distanceTo(HUB) <= 0.03, `drum_spin at ${w.pos('drum_spin').toArray()}`);
  const body = w.meshOf('body_mesh');
  let r = 0, z0 = 9, z1 = -9;
  body.positions.forEach((p, i) => { if (body.bone[i] !== 'drum_spin') return; r = Math.max(r, Math.hypot(p.x - HUB.x, p.y - HUB.y)); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
  near(2 * r, 5.0, 0.05, 'drum diameter');
  // depth: the drum proper is back plate to face plane; the barrel behind and the lid pins in front are fittings
  // (measured on the rim, r > 2.44 m: the lamp bezels stand 5 cm proud of the face and the chamber heads 10 cm off the back)
  let back = 9; const face = w.pos('thread_anchor_1').z;
  body.positions.forEach((p, i) => { if (body.bone[i] !== 'drum_spin' || Math.hypot(p.x - HUB.x, p.y - HUB.y) < 2.44) return; back = Math.min(back, p.z); });
  assert.ok(body.positions.some((p, i) => body.bone[i] === 'drum_spin' && Math.hypot(p.x - HUB.x, p.y - HUB.y) > 2.44 && Math.abs(p.z - face) < 0.005), 'the rim reaches the face plane');
  near(face - back, 2.2, 0.05, 'drum depth'); near(face, 3.1, 0.03, 'face plane z');
  for (let n = 1; n <= 6; n++) {
    const k = w.pos(`knot_${n}_hit`), t = w.pos(`thread_anchor_${n}`);
    near(Math.hypot(k.x - HUB.x, k.y - HUB.y), 1.7, 0.03, `knot_${n}_hit radius`); near(k.z, 2.8, 0.03, `knot_${n}_hit z`);
    const a = clock(k), want = 60 * (n - 1);
    assert.ok(Math.min(Math.abs(a - want), 360 - Math.abs(a - want)) < 1.0, `knot_${n}_hit at ${a.toFixed(1)} degrees clockwise from the top (wanted ${want})`);
    near(Math.hypot(t.x - HUB.x, t.y - HUB.y), 1.7, 0.03, `thread_anchor_${n} radius`); near(t.z, 3.1, 0.03, `thread_anchor_${n} z`);
  }
  // polish round 2: 3.2 m apart and 6 m up as the GDD has them, but 0.85 m in FRONT of the face (z 3.95, not the 2.6 of the
  // order): at 2.6 the seated guard (r 2.23 m at z 3.3 to 3.43) hid them from the floor in the one state they are targets
  assert.ok(w.pos('pawl_l_hit').distanceTo(new THREE.Vector3(-1.6, 6.0, 3.95)) <= 0.03);
  assert.ok(w.pos('pawl_r_hit').distanceTo(new THREE.Vector3(1.6, 6.0, 3.95)) <= 0.03);
  {
    // every vertex of both pawl knots is in front of the seated guard, and each knot is 0.6 m across (the GDD's r 0.3)
    const seat = w.clipPose('guard_slide_on', 1);
    const pose = new Map([...seat].map(([name, k]) => [name, w.posed(name, k)]));
    const pts = w.skinned(body, pose);
    let guardFront = -9;
    pts.forEach((p, i) => { if (body.bone[i].startsWith('guard_piece')) guardFront = Math.max(guardFront, p.z); });
    for (const side of ['pawl_l', 'pawl_r']) {
      let z0 = 9, x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      pts.forEach((p, i) => { if (body.bone[i] !== side) return; z0 = Math.min(z0, p.z); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
      assert.ok(z0 > guardFront + 0.1, `${side}: its lobes start at z ${z0.toFixed(2)}, the seated guard's front is at ${guardFront.toFixed(2)}`);
      assert.ok(x1 - x0 > 0.5 && x1 - x0 < 0.72 && y1 - y0 > 0.5 && y1 - y0 < 0.72, `${side}: lobe cluster ${(x1 - x0).toFixed(2)} x ${(y1 - y0).toFixed(2)} m`);
    }
  }
  assert.ok(w.pos('muzzle_top').distanceTo(new THREE.Vector3(0, 5.7, 3.1)) <= 0.03);
  console.log(`drum ${(2 * r).toFixed(3)} m across, ${(face - back).toFixed(3)} m deep, face at z ${face.toFixed(3)}; canister_muzzle at ${w.pos('canister_muzzle').toArray().map((v) => v.toFixed(2))} on ${w.nodes.get('canister_muzzle').getParentNode().getName()}`);
});

test('boss_lamps: 0-5 beside mouths 1-6 at 2.3 m, 6-11 the knot cores, 12-13 the pawl cores; each rides its bone', async () => {
  const w = await loadWindlass();
  const lamps = w.meshOf('boss_lamps');
  const sets = Array.from({ length: 14 }, () => ({ pts: [], bones: new Set() }));
  lamps.positions.forEach((p, i) => { const k = Math.round(lamps.uv1[i] * 14 - 0.5); sets[k].pts.push(p); sets[k].bones.add(lamps.bone[i]); });
  const centre = (pts) => pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  for (let i = 0; i < 14; i++) {
    const c = centre(sets[i].pts);
    assert.equal(sets[i].bones.size, 1, `lamp ${i} rides one bone`);
    const bone = [...sets[i].bones][0];
    if (i < 6) {
      near(Math.hypot(c.x - HUB.x, c.y - HUB.y), 2.3, 0.05, `lamp ${i} radius`);
      const a = clock(c), want = 60 * i;
      assert.ok(Math.min(Math.abs(a - want), 360 - Math.abs(a - want)) < 1.0, `lamp ${i} at ${a.toFixed(1)} degrees (mouth ${i + 1} is at ${want})`);
      assert.equal(bone, 'drum_spin');
    } else if (i < 12) {
      assert.ok(c.distanceTo(w.pos(`knot_${i - 5}_hit`)) <= 0.1, `lamp ${i} is ${c.distanceTo(w.pos(`knot_${i - 5}_hit`)).toFixed(3)} m from knot_${i - 5}_hit`);
      assert.equal(bone, `knot_${i - 5}`);
    } else {
      const side = i === 12 ? 'pawl_l' : 'pawl_r';
      assert.ok(c.distanceTo(w.pos(side + '_hit')) <= 0.1, `lamp ${i} is ${c.distanceTo(w.pos(side + '_hit')).toFixed(3)} m from ${side}_hit`);
      assert.equal(bone, side);
    }
  }
});

test('gauge: 26 segments 0.30 x 0.10, indices bottom to top, wider gaps after 9 and 19, on arm_yaw', async () => {
  const w = await loadWindlass();
  const g = w.meshOf('gauge');
  const seg = Array.from({ length: 26 }, () => ({ y0: 99, y1: -99, x0: 99, x1: -99 }));
  g.positions.forEach((p, i) => { const s = seg[Math.round(g.uv1[i] * 26 - 0.5)]; s.y0 = Math.min(s.y0, p.y); s.y1 = Math.max(s.y1, p.y); s.x0 = Math.min(s.x0, p.x); s.x1 = Math.max(s.x1, p.x); assert.equal(g.bone[i], 'arm_yaw'); });
  const gaps = [];
  for (let i = 0; i < 26; i++) {
    near(seg[i].y1 - seg[i].y0, 0.10, 0.002, `segment ${i} height`); near(seg[i].x1 - seg[i].x0, 0.30, 0.002, `segment ${i} width`);
    if (i) { assert.ok(seg[i].y0 > seg[i - 1].y1, `segment ${i} is above segment ${i - 1}`); gaps.push(seg[i].y0 - seg[i - 1].y1); }
  }
  const usual = gaps.filter((_, i) => i !== 9 && i !== 19);
  for (const i of [9, 19]) assert.ok(gaps[i] > Math.max(...usual) * 1.5, `the gap after segment ${i} (${gaps[i].toFixed(3)}) is wider than the rest (${Math.max(...usual).toFixed(3)})`);
  console.log(`gauge: y ${seg[0].y0.toFixed(2)} .. ${seg[25].y1.toFixed(2)}, x ${seg[0].x0.toFixed(2)} .. ${seg[0].x1.toFixed(2)}, usual gap ${usual[0].toFixed(3)}, group gaps ${gaps[9].toFixed(3)} / ${gaps[19].toFixed(3)}`);
});

test('the six mouth bones share one rest frame relative to their mouth; mouth_open retargeted to mouth_4 opens that lid 110 degrees', async () => {
  const w = await loadWindlass();
  const drumInv = w.world('drum_spin').invert();
  const ref = { q: null, p: null };
  for (let n = 1; n <= 6; n++) {
    const turn = new THREE.Matrix4().makeRotationZ(60 * (n - 1) / DEG);         // undo the mouth's place on the ring (clockwise = -Z)
    const m = turn.multiply(drumInv.clone().multiply(w.world(`mouth_${n}`)));
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s);
    if (n === 1) { ref.q = q; ref.p = p; continue; }
    assert.ok(Math.abs(q.dot(ref.q)) > 1 - 1e-5, `mouth_${n}: rest rotation differs from mouth_1's in its own mouth frame`);
    assert.ok(p.distanceTo(ref.p) < 2e-3, `mouth_${n}: hinge is ${p.distanceTo(ref.p).toFixed(4)} m from where mouth_1's is in its mouth frame`);
  }
  // retarget: mouth_1's last key onto mouth_4
  const key = w.clipPose('mouth_open', 1).get('mouth_1');
  const body = w.meshOf('body_mesh');
  for (const n of [1, 4]) {
    const pose = new Map([[`mouth_${n}`, w.posed(`mouth_${n}`, { translation: add(w.nodes.get(`mouth_${n}`).getTranslation(), sub(key.translation, w.nodes.get('mouth_1').getTranslation())), rotation: relQuat(w, n, key.rotation) })]]);
    const moved = w.skinned(body, pose);
    const lid = body.bone.map((b, i) => (b === `mouth_${n}` ? i : -1)).filter((i) => i >= 0);
    const delta = w.world(`mouth_${n}`, pose).multiply(w.world(`mouth_${n}`).invert());
    const c0 = w.pos(`thread_anchor_${n}`), c1 = c0.clone().applyMatrix4(delta);          // the lid's centre: the mouth's centre, carried by the bone
    assert.ok(lid.length > 40, `mouth_${n} carries a lid`);
    const hinge = w.pos(`mouth_${n}`);
    const a0 = Math.atan2(c0.y - hinge.y, c0.x - hinge.x), a1 = Math.atan2(c1.y - hinge.y, c1.x - hinge.x);
    const swing = (((a1 - a0) * DEG) + 540) % 360 - 180;
    near(Math.abs(swing), 110, 0.5, `mouth_${n} swing`);
    near(c1.z - c0.z, 0.10, 0.005, `mouth_${n} lift out of its recess`);
    // open, the lid is clear of its own mouth (knot visible) and of the lamp beside it
    const mouth = w.pos(`thread_anchor_${n}`);
    const lidR = 0.48;
    assert.ok(Math.hypot(c1.x - mouth.x, c1.y - mouth.y) >= 0.45 + lidR, `mouth_${n}: the open lid still covers the mouth (${Math.hypot(c1.x - mouth.x, c1.y - mouth.y).toFixed(3)} m)`);
    const lampAt = new THREE.Vector3(Math.sin(60 * (n - 1) / DEG) * 2.35, 4 + Math.cos(60 * (n - 1) / DEG) * 2.35, 0);
    assert.ok(Math.hypot(c1.x - lampAt.x, c1.y - lampAt.y) > lidR + 0.11, `mouth_${n}: the open lid covers its lamp`);
    if (n === 4) console.log(`mouth_open on mouth_4: swing ${swing.toFixed(2)} degrees, lift ${(c1.z - c0.z).toFixed(3)} m, lid centre ${Math.hypot(c1.x - mouth.x, c1.y - mouth.y).toFixed(3)} m from the mouth centre`);
  }
});

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
/** the clip's rotation key of mouth_1 expressed for mouth_n: rest_n * (rest_1^-1 * key) */
function relQuat(w, n, key) {
  const r1 = new THREE.Quaternion(...w.nodes.get('mouth_1').getRotation()), rn = new THREE.Quaternion(...w.nodes.get(`mouth_${n}`).getRotation());
  return rn.multiply(r1.invert().multiply(new THREE.Quaternion(...key))).toArray();
}
