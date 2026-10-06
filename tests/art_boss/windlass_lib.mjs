// Shared reading of the shipped Windlass for the windlass_* tests (piece art-boss-windlass): the GLB through
// gltf-transform (meshopt decoded), rest-pose world matrices, skinned vertices by bone, clip keys.
import path from 'node:path';
import * as THREE from 'three';
import { ROOT, gltfIO, loadManifest, loadLayout } from '../../tools/pipeline-lib.mjs';

export { THREE, ROOT };
export const M = loadManifest();
export const LAYOUT = loadLayout();
export const FILE = path.join(ROOT, 'public/assets/boss/boss_windlass.glb');
export const HUB = new THREE.Vector3(0, 4.0, 2.0);

export async function loadWindlass(file = FILE) {
  const io = await gltfIO();
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const local = (n) => new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), new THREE.Quaternion(...n.getRotation()), new THREE.Vector3(...n.getScale()));
  /** world matrix of a node; `pose` = Map(name -> Matrix4 local override) */
  const world = (name, pose = null) => {
    const m = new THREE.Matrix4();
    for (let n = nodes.get(name); n; n = n.getParentNode()) m.premultiply(pose?.get(n.getName()) ?? local(n));
    return m;
  };
  const pos = (name, pose = null) => new THREE.Vector3().setFromMatrixPosition(world(name, pose));
  const skin = root.listSkins()[0];
  const joints = skin.listJoints().map((j) => j.getName());
  /** { positions: Vector3[], bone: string[], index: number[], uv1: number[] } of a mesh node (rest pose, asset space) */
  const meshOf = (name) => {
    const prim = nodes.get(name).getMesh().listPrimitives()[0];
    const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'), U1 = prim.getAttribute('TEXCOORD_1');
    const positions = [], bone = [], uv1 = [], e = [];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, e); positions.push(new THREE.Vector3(e[0], e[1], e[2]));
      const j = J.getElement(i, []), w = W.getElement(i, []);
      let best = 0; for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
      bone.push(joints[j[best]]);
      if (U1) uv1.push(U1.getElement(i, [])[0]);
    }
    return { positions, bone, uv1, index: Array.from(prim.getIndices().getArray()), tris: prim.getIndices().getCount() / 3 };
  };
  /** a clip sampled at t01 of its length (keys interpolated as the runtime does): Map(name -> { translation, rotation, scale }) */
  const clipPose = (clip, t01 = 1) => {
    const an = root.listAnimations().find((a) => a.getName() === clip);
    const end = Math.max(...an.listSamplers().map((s) => s.getInput().getScalar(s.getInput().getCount() - 1)));
    const t = t01 * end, out = new Map();
    for (const ch of an.listChannels()) {
      const s = ch.getSampler(), inp = s.getInput(), o = s.getOutput(), n = inp.getCount();
      let i = 0;
      while (i < n - 1 && inp.getScalar(i + 1) <= t) i++;
      let v = o.getElement(i, []);
      if (i < n - 1 && t > inp.getScalar(i) && s.getInterpolation() !== 'STEP') {
        const k = (t - inp.getScalar(i)) / (inp.getScalar(i + 1) - inp.getScalar(i)), b = o.getElement(i + 1, []);
        v = ch.getTargetPath() === 'rotation' ? new THREE.Quaternion(...v).slerp(new THREE.Quaternion(...b), k).toArray() : v.map((x, j) => x + (b[j] - x) * k);
      }
      const name = ch.getTargetNode().getName();
      if (!out.has(name)) out.set(name, {});
      out.get(name)[ch.getTargetPath()] = v;
    }
    return out;
  };
  /** local matrix of a node with a clip pose (and optional extra { rot: Quaternion applied after, scale }) */
  const posed = (name, p, extra = null) => {
    const n = nodes.get(name);
    const t = new THREE.Vector3(...(p?.translation ?? n.getTranslation())), r = new THREE.Quaternion(...(p?.rotation ?? n.getRotation())), s = new THREE.Vector3(...(p?.scale ?? n.getScale()));
    if (extra) r.multiply(extra);
    return new THREE.Matrix4().compose(t, r, s);
  };
  /** every vertex of `mesh` under `pose` (rigid skin: one bone per vertex) */
  const skinned = (mesh, pose) => {
    const cache = new Map();
    const xf = (b) => { if (!cache.has(b)) cache.set(b, world(b, pose).multiply(world(b).invert())); return cache.get(b); };
    return mesh.positions.map((p, i) => p.clone().applyMatrix4(xf(mesh.bone[i])));
  };
  return { doc, root, nodes, local, world, pos, joints, meshOf, clipPose, posed, skinned };
}

/** the bore chamber's kerb and ribs from design/layout.json, relative to the bore axis at floor level */
export function chamber() {
  const kerb = LAYOUT.solids.find((s) => s.id === 'bo_kerb');
  const axis = [kerb.pos[0], kerb.pos[1] - kerb.size[1] / 2, kerb.pos[2]];
  const boxes = LAYOUT.solids.filter((s) => /^bo_kerb_hi_|^bo_rib_/.test(s.id)).map((s) => ({
    id: s.id, c: [s.pos[0] - axis[0], s.pos[1] - axis[1], s.pos[2] - axis[2]], h: [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2], rot: (s.rotY ?? 0) * Math.PI / 180 }));
  const ring = { inner: kerb.innerRadius, outer: kerb.size[0] / 2, top: kerb.size[1] };
  /** name of the solid that contains the point (asset space, any yaw of the room is the caller's), or null */
  const hit = (p) => {
    const r = Math.hypot(p.x, p.z);
    if (p.y < ring.top - 1e-3 && p.y > -20 && r > ring.inner + 1e-3 && r < ring.outer - 1e-3) return 'bo_kerb';
    if (p.y < 0 && r > ring.inner + 1e-3) return 'bore wall / floor';
    for (const b of boxes) {
      const dx = p.x - b.c[0], dz = p.z - b.c[2], c = Math.cos(b.rot), s = Math.sin(b.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;                        // three.js rotY: world = R * local
      if (Math.abs(lx) < b.h[0] - 1e-3 && Math.abs(p.y - b.c[1]) < b.h[1] - 1e-3 && Math.abs(lz) < b.h[2] - 1e-3) return b.id;
    }
    return null;
  };
  return { ring, boxes, hit };
}
