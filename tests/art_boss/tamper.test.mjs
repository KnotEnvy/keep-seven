// art-boss-tamper: the vents, the wind-up height, the slam, the size (work order art-boss section 5). Pure data: the
// shipped GLB is posed and skinned in Node (tamper_lib.mjs); the same poses through the real loader are in tamper_viewer.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadRig, localPose, worldMatrices, skinned, bounds, firstHit, point, clipSeconds, PUB } from './tamper_lib.mjs';

const EYE = 1.65;
const rig = await loadRig(PUB('enemy_tamper'));
const names = rig.joints.map((j) => j.getName());
const boneOf = (() => { const e = [], out = new Int32Array(rig.pos.getCount()); for (let i = 0; i < out.length; i++) out[i] = rig.jnt.getElement(i, e)[0]; return out; })();
/** the posed vertices (xyz list) of one bone's rigid part */
const part = (p, bone) => { const b = names.indexOf(bone), q = []; for (let i = 0; i < boneOf.length; i++) if (boneOf[i] === b) q.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); return q; };
const local = (q, m) => { const v = new THREE.Vector3(), out = []; for (let i = 0; i < q.length; i += 3) { v.set(q[i], q[i + 1], q[i + 2]).applyMatrix4(m); out.push(v.x, v.y, v.z); } return out; };
const posed = (clip, t, turns) => { const w = worldMatrices(rig, localPose(rig, clip, t, turns)); return { w, p: skinned(rig, w) }; };

test('tamper: idle size 2.4 +- 0.1 m high, 1.6 +- 0.1 m wide, feet on the floor', () => {
  const b = bounds(posed('idle', 0).p);
  console.log(`idle: ${b.size[0].toFixed(3)} wide, ${b.size[1].toFixed(3)} high, ${b.size[2].toFixed(3)} deep, lowest y ${b.min[1].toFixed(3)}`);
  assert.ok(Math.abs(b.size[1] - 2.4) <= 0.1); assert.ok(Math.abs(b.size[0] - 1.6) <= 0.1);
  assert.ok(Math.abs(b.min[1]) < 0.01);
});

test('tamper: the last frame of slam_windup is at least 1.8 x the idle height (the tell)', () => {
  const idle = bounds(posed('idle', 0).p).size[1];
  const up = bounds(posed('slam_windup', clipSeconds(rig, 'slam_windup')).p).size[1];
  console.log(`slam_windup: ${up.toFixed(3)} m high = ${(up / idle).toFixed(2)} x idle (${idle.toFixed(3)})`);
  assert.ok(up >= 1.8 * idle);
});

test('tamper: ram_head reaches the floor about 1.6 m ahead on the last frame of slam; the body has dropped 0.15 m', () => {
  const { w } = posed('slam', clipSeconds(rig, 'slam'));
  const h = point(w, rig, 'ram_head'), pel = point(w, rig, 'pelvis'), pel0 = point(posed(null, 0).w, rig, 'pelvis');
  console.log(`slam end: ram_head (${h.map((v) => v.toFixed(3)).join(', ')}), pelvis dropped ${(pel0[1] - pel[1]).toFixed(3)} m`);
  assert.ok(h[1] <= 0.1); assert.ok(Math.abs(h[2] - 1.6) <= 0.2);
  assert.ok(Math.abs((pel0[1] - pel[1]) - 0.15) <= 0.02);
});

test('tamper: lids shut hide both knot points; +80 degrees about the bone\'s local X shows each from 4 m at eye height', () => {
  const rows = [];
  for (const [bone, node, z] of [['vent_chest', 'vent_chest_knot', 4], ['vent_back', 'vent_back_knot', -4]]) {
    const shut = posed(null, 0), open = posed(null, 0, { [bone]: 80 });
    const k = point(shut.w, rig, node), eye = [0, EYE, z], d = Math.hypot(k[0] - eye[0], k[1] - eye[1], k[2] - eye[2]);
    const hs = firstHit(rig, shut.p, eye, k), ho = firstHit(rig, open.p, eye, k);
    rows.push(`${node} (${k.map((v) => v.toFixed(3)).join(', ')}): shut, first hit ${(d - hs).toFixed(3)} m in front of it; open, ${ho === Infinity ? 'nothing' : (d - ho).toFixed(3) + ' m'} in front`);
    assert.ok(hs < d - 0.05, `${node} is visible with the lid shut`);
    // (the only thing in front of the point is the knot's own central lobe, a few centimetres)
    assert.ok(ho > d - 0.1, `${node} is hidden with the lid open (hit ${(d - ho).toFixed(3)} m in front)`);
    // the whole hit sphere's centre line is clear from the player's fighting distances too
    for (const zz of [2, 3]) assert.ok(firstHit(rig, open.p, [0, EYE, Math.sign(z) * zz], k) > Math.hypot(k[1] - EYE, Math.abs(k[2]) - zz) - 0.1, `${node} from ${zz} m`);
    // the knot is INSIDE the body: behind the lid plane, in front of the cavity's back wall
    const through = firstHit(rig, shut.p, k, [k[0], k[1], k[2] - Math.sign(z) * 2]);
    assert.ok(through < 0.3, `${node} has the cavity's back within 0.3 m behind it (${through.toFixed(3)})`);
  }
  console.log(rows.join('\n'));
});

test('tamper: the open lid is an awning in side silhouette (it stands at least 0.3 m proud of the shut outline)', () => {
  for (const [bone, sign] of [['vent_chest', 1], ['vent_back', -1]]) {
    const body = (p) => { const q = []; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i]) < 0.3 && p[i + 1] > 1.2) q.push(p[i], p[i + 1], p[i + 2]); return q; };   // the hatch's own column
    const shut = bounds(body(posed(null, 0).p)), open = bounds(body(posed(null, 0, { [bone]: 80 }).p));
    const proud = sign > 0 ? open.max[2] - shut.max[2] : shut.min[2] - open.min[2];
    console.log(`${bone} open: ${proud.toFixed(3)} m beyond the shut outline`);
    assert.ok(proud >= 0.3);
  }
});

test('tamper: every clip, every frame: nothing under the floor (the stunned ram dents it 6 cm, nothing else passes 2 cm)', () => {
  const rows = [];
  for (const clip of rig.clips.keys()) {
    const T = clipSeconds(rig, clip), N = Math.round(T * 30); let low = Infinity, lowRam = Infinity, lowFoot = Infinity;
    for (let i = 0; i <= N; i++) {
      const { w, p } = posed(clip, T * i / N);
      low = Math.min(low, bounds(p).min[1]); lowRam = Math.min(lowRam, point(w, rig, 'ram_head')[1]);
      for (const foot of ['leg_l_foot', 'leg_r_foot']) lowFoot = Math.min(lowFoot, bounds(part(p, foot)).min[1]);
    }
    rows.push(`${clip} lowest vertex ${low.toFixed(3)}, lowest sole ${lowFoot.toFixed(3)}, ram face centre ${lowRam.toFixed(3)}`);
    assert.ok(low >= (clip === 'charge_stun' ? -0.07 : -0.02), `${clip}: lowest vertex at ${low.toFixed(3)}`);
    assert.ok(lowFoot >= -0.006, `${clip}: a sole at ${lowFoot.toFixed(3)}`);
  }
  console.log(rows.join('\n'));
});

test('tamper: walk: the planted foot travels at one constant speed, 2.0 m per cycle (play at speed = v / 1.667)', () => {
  // docs/requests/art-boss-tamper.md section 2 gives code-enemies this number; if the stride changes, change it there
  const T = clipSeconds(rig, 'walk'), N = 36, rows = [];
  for (const foot of ['leg_l_foot', 'leg_r_foot']) {
    const z = [], y = [];
    for (let i = 0; i <= N; i++) { const b = bounds(part(posed('walk', T * i / N).p, foot)); z.push((b.min[2] + b.max[2]) / 2); y.push(b.min[1]); }
    // stance = the frames in which the foot moves BACK (asset -Z) flat on the floor; its per-frame step must be constant
    const steps = [];
    for (let i = 0; i < N; i++) if (y[i] < 0.004 && y[i + 1] < 0.004 && z[i + 1] < z[i]) steps.push(z[i] - z[i + 1]);
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length, dev = Math.max(...steps.map((v) => Math.abs(v - mean)));
    const perCycle = mean * N;
    rows.push(`${foot}: ${steps.length} planted frames, ${mean.toFixed(4)} m per frame (max deviation ${dev.toFixed(4)}), ${perCycle.toFixed(3)} m per cycle = ${(perCycle / T).toFixed(3)} m/s`);
    assert.ok(steps.length >= 14, `${foot} is planted for ${steps.length} frames`);
    assert.ok(dev <= 0.004, `${foot}: the stance is not linear (${dev.toFixed(4)})`);
    assert.ok(Math.abs(perCycle - 2.0) <= 0.03, `${foot}: ${perCycle.toFixed(3)} m per cycle`);
  }
  console.log(rows.join('\n'));
});

test('tamper: the ram never passes through the right leg or foot, in any clip', () => {
  const rest = posed(null, 0), boxes = {};
  // each part's box in its own BONE frame (for the ram that is along the arm: the tightest box round shaft and head)
  const inv = (w, bone) => w.get(rig.joints[names.indexOf(bone)]).clone().invert();
  for (const bone of ['leg_r_foot', 'leg_r_upper', 'arm_r_ram']) boxes[bone] = bounds(local(part(rest.p, bone), inv(rest.w, bone)));
  let worst = 0, at = '';
  for (const clip of rig.clips.keys()) {
    const T = clipSeconds(rig, clip), N = Math.round(T * 30);
    for (let i = 0; i <= N; i++) {
      const { w, p } = posed(clip, T * i / N);
      for (const [a, b] of [['arm_r_ram', 'leg_r_foot'], ['arm_r_ram', 'leg_r_upper'], ['leg_r_foot', 'arm_r_ram']]) {
        const q = local(part(p, a), inv(w, b)), bx = boxes[b];
        for (let k = 0; k < q.length; k += 3) {
          const d = Math.min(q[k] - bx.min[0], bx.max[0] - q[k], q[k + 1] - bx.min[1], bx.max[1] - q[k + 1], q[k + 2] - bx.min[2], bx.max[2] - q[k + 2]);
          if (d > worst) { worst = d; at = `${clip} frame ${i}: ${a} in ${b}`; }
        }
      }
    }
  }
  console.log(`deepest a vertex of one gets into the other's box: ${worst.toFixed(3)} m ${at}`);
  assert.ok(worst <= 0.01, at);
});

test('tamper: charge keeps its pelvis pitch (a constant channel the exporter would drop) and its feet level in the stance', () => {
  const ch = rig.clips.get('charge').listChannels().map((c) => `${c.getTargetNode().getName()}.${c.getTargetPath()}`);
  assert.ok(ch.includes('pelvis.rotation'), 'charge has no pelvis rotation track');
  const T = clipSeconds(rig, 'charge');
  for (let i = 0; i <= 15; i++) {
    const p = posed('charge', T * i / 15).p;
    for (const foot of ['leg_l_foot', 'leg_r_foot']) assert.ok(bounds(part(p, foot)).min[1] >= -0.006, `${foot} under the floor on frame ${i}`);
  }
});

test('tamper: an open lid is at least 0.10 m thick edge-on (2 px in a 48 px figure: the awning reads from the side)', () => {
  for (const bone of ['vent_chest', 'vent_back']) {
    const { w, p } = posed(null, 0), q = local(part(p, bone), w.get(rig.joints[names.indexOf(bone)]).clone().invert()), b = bounds(q);
    const thin = Math.min(...b.size);                                 // at the hinge: the back tapers to the free edge (the knot's sight line)
    console.log(`${bone}: lid ${b.size.map((v) => v.toFixed(3)).join(' x ')} m in its own frame`);
    assert.ok(thin >= 0.10, `${bone} is ${thin.toFixed(3)} m thick`);
  }
});

test('tamper: pound_bulkhead strikes a vertical target 2.7 m ahead at 1.5 m', () => {
  const T = clipSeconds(rig, 'pound_bulkhead'); let best = null;
  for (let f = 0; f <= 78; f++) { const h = point(posed('pound_bulkhead', T * f / 78).w, rig, 'ram_head'); if (!best || h[2] > best[2]) best = h; }
  console.log(`pound_bulkhead: farthest reach of ram_head (${best.map((v) => v.toFixed(3)).join(', ')})`);
  assert.ok(Math.abs(best[2] - 2.7) <= 0.05 && Math.abs(best[1] - 1.5) <= 0.1);
});
