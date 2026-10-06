// Helper of the art-boss-tamper tests: reads a shipped GLB, evaluates a clip, skins the rigid mesh in Node (three's maths)
// and casts rays at it. Everything is in ASSET space = game space: metres, +Y up, the creature faces +Z.
import path from 'node:path';
import * as THREE from 'three';
import { ROOT, gltfIO } from '../../tools/pipeline-lib.mjs';

export const PUB = (id) => path.join(ROOT, 'public/assets/enemies', id + '.glb');

export async function loadRig(file) {
  const io = await gltfIO();
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const parent = new Map();
  for (const n of nodes) for (const c of n.listChildren()) parent.set(c, n);
  const meshNode = nodes.find((n) => n.getMesh());
  const skin = meshNode.getSkin();
  const prim = meshNode.getMesh().listPrimitives()[0];
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), jnt = prim.getAttribute('JOINTS_0'), uv = prim.getAttribute('TEXCOORD_0');
  const joints = skin ? skin.listJoints() : [];
  const ibm = skin ? joints.map((_, i) => new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i, []))) : [];
  const clips = new Map(root.listAnimations().map((a) => [a.getName(), a]));
  return { doc, nodes, parent, meshNode, prim, pos, idx, jnt, uv, joints, ibm, clips, byName: new Map(nodes.map((n) => [n.getName(), n])) };
}

/** Local TRS of every node at `seconds` of `clip` (null = rest), plus extra local X turns {bone: degrees} applied on top. */
export function localPose(rig, clip, seconds, turns = {}) {
  const local = new Map();
  for (const n of rig.nodes) local.set(n, { t: n.getTranslation().slice(), r: n.getRotation().slice(), s: n.getScale().slice() });
  if (clip) {
    const anim = rig.clips.get(clip);
    if (!anim) throw new Error(`no clip ${clip}`);
    for (const ch of anim.listChannels()) {
      const s = ch.getSampler(), inp = s.getInput(), out = s.getOutput(), n = inp.getCount();
      let i = 0; while (i < n - 1 && inp.getScalar(i + 1) <= seconds) i++;
      const j = Math.min(n - 1, i + 1), t0 = inp.getScalar(i), t1 = inp.getScalar(j);
      const k = s.getInterpolation() === 'STEP' || j === i || t1 === t0 ? 0 : Math.min(1, Math.max(0, (seconds - t0) / (t1 - t0)));
      const a = out.getElement(i, []), b = out.getElement(j, []);
      const tgt = local.get(ch.getTargetNode()), p = ch.getTargetPath();
      if (p === 'rotation') {
        const q = new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b), k);
        tgt.r = q.toArray();
      } else tgt[p === 'translation' ? 't' : 's'] = a.map((v, x) => v + (b[x] - v) * k);
    }
  }
  for (const [name, deg] of Object.entries(turns)) {
    const l = local.get(rig.byName.get(name));
    l.r = new THREE.Quaternion().fromArray(l.r).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg * Math.PI / 180)).toArray();
  }
  return local;
}

export function worldMatrices(rig, local) {
  const world = new Map();
  const get = (n) => {
    if (world.has(n)) return world.get(n);
    const l = local.get(n);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...l.t), new THREE.Quaternion(...l.r), new THREE.Vector3(...l.s));
    const p = rig.parent.get(n);
    if (p) m.premultiply(get(p));
    world.set(n, m); return m;
  };
  for (const n of rig.nodes) get(n);
  return world;
}

/** Skinned vertex positions (Float32Array xyz) for a pose; a static mesh comes back as it is. */
export function skinned(rig, world) {
  const n = rig.pos.getCount(), out = new Float32Array(n * 3), v = new THREE.Vector3(), e = [], j = [];
  const mats = rig.joints.map((jn, i) => new THREE.Matrix4().multiplyMatrices(world.get(jn), rig.ibm[i]));
  const own = world.get(rig.meshNode);
  for (let i = 0; i < n; i++) {
    v.fromArray(rig.pos.getElement(i, e));
    if (rig.jnt) v.applyMatrix4(mats[rig.jnt.getElement(i, j)[0]]); else v.applyMatrix4(own);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

export function bounds(p) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  return { min: mn, max: mx, size: mx.map((v, k) => v - mn[k]) };
}

/** Distance along the ray from `from` toward `to` of the first triangle hit (Infinity when nothing is in the way). */
export function firstHit(rig, p, from, to) {
  const o = new THREE.Vector3(...from), d = new THREE.Vector3(...to).sub(o); d.normalize();
  const ray = new THREE.Ray(o, d), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  let best = Infinity;
  for (let t = 0; t < rig.idx.getCount(); t += 3) {
    a.fromArray(p, rig.idx.getScalar(t) * 3); b.fromArray(p, rig.idx.getScalar(t + 1) * 3); c.fromArray(p, rig.idx.getScalar(t + 2) * 3);
    if (ray.intersectTriangle(a, b, c, false, hit)) best = Math.min(best, hit.distanceTo(o));
  }
  return best;
}

export const point = (world, rig, name) => new THREE.Vector3().setFromMatrixPosition(world.get(rig.byName.get(name))).toArray();
export const clipSeconds = (rig, clip) => Math.max(...rig.clips.get(clip).listSamplers().map((s) => s.getInput().getScalar(s.getInput().getCount() - 1)));
