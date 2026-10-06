// Shared helpers of tests/art_props/mech: read a SHIPPED GLB (public/assets) into plain arrays, place an asset at a
// layout marker by the rules of data.placement (ARCHITECTURE 9.2), rasterise a silhouette.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, loadManifest, loadLayout, gltfIO, mat4Mul, mat4FromTRS, mat4Point } from '../../../tools/pipeline-lib.mjs';

export { ROOT };
export const M = loadManifest();
export const L = loadLayout();
export const PIECE = 'art-props-mech';
export const MECH = Object.keys(M.assets).filter((id) => M.assets[id].owner === 'props_mech');
export const P0 = MECH.filter((id) => M.assets[id].priority === 0);
export const marker = (id) => { const m = L.markers.find((x) => x.id === id); if (!m) throw new Error(`no marker ${id}`); return m; };

export function node(cmd, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, cmd), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const world = (n) => { let m = mat4FromTRS(n.getTranslation(), n.getRotation(), n.getScale()); for (let p = n.getParentNode(); p; p = p.getParentNode()) m = mat4Mul(mat4FromTRS(p.getTranslation(), p.getRotation(), p.getScale()), m); return m; };

/** -> { nodes: {name: [x, y, z]}, meshes: [{ name, material, tris: [[a, b, c] of [x, y, z]], joint: [per triangle: joint name | null] }], bytes } in asset space, rest pose */
export async function load(id) {
  const io = await gltfIO();
  const doc = await io.read(M.assets[id]._pub);
  const root = doc.getRoot();
  const nodes = {}, meshes = [];
  for (const n of root.listNodes()) {
    const m = world(n);
    nodes[n.getName()] = [m[12], m[13], m[14]];
    const mesh = n.getMesh();
    if (!mesh) continue;
    const skin = n.getSkin(), joints = skin ? skin.listJoints().map((j) => j.getName()) : null;
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), j0 = p.getAttribute('JOINTS_0');
      const count = idx ? idx.getCount() : pos.getCount();
      const tris = [], joint = [], e = [0, 0, 0], j = [0, 0, 0, 0];
      const at = (i) => { const k = idx ? idx.getScalar(i) : i; pos.getElement(k, e); return skin ? [e[0], e[1], e[2]] : mat4Point(m, e); };
      for (let i = 0; i < count; i += 3) {
        tris.push([at(i), at(i + 1), at(i + 2)]);
        if (j0) { j0.getElement(idx ? idx.getScalar(i) : i, j); joint.push(joints[j[0]]); } else joint.push(null);
      }
      meshes.push({ name: n.getName(), material: p.getMaterial()?.getName() ?? null, tris, joint, extras: n.getExtras() });
    }
  }
  return { nodes, meshes };
}

/** Bounding box [min, max] of the triangles that pass `keep(mesh, triangleIndex)` */
export function bbox(asset, keep = () => true) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of asset.meshes) m.tris.forEach((t, i) => { if (!keep(m, i)) return; for (const p of t) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } });
  return [lo, hi];
}

/** data.placement: where the pivot of an asset bound to `mk` stands, and a function taking asset-local points to the world */
export function placement(mk, offset = [0, 0, 0], scale = 1) {
  const yaw = (mk.rotY ?? 0) * Math.PI / 180 + Math.PI, c = Math.cos(yaw), s = Math.sin(yaw);
  const rot = (p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  const o = rot(offset.map((v) => v * scale));
  const pos = [mk.pos[0] + o[0], mk.pos[1] + o[1], mk.pos[2] + o[2]];
  return { pos, yaw, toWorld: (p) => { const r = rot(p.map((v) => v * scale)); return [pos[0] + r[0], pos[1] + r[1], pos[2] + r[2]]; } };
}
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The share of the disc of radius r round `centre` (seen from the front, +Z, so in the XY plane) that drawn triangles
 * cover, and how far the centroid of the covered part lies from the centre. Triangles facing away or beyond the sphere
 * in depth by more than `depth` are ignored.
 */
export function fill(asset, centre, r, { keep = () => true, depth = 0.6, res = 96 } = {}) {
  const grid = new Uint8Array(res * res);
  const px = (v) => (v + r) / (2 * r) * res;
  for (const m of asset.meshes) m.tris.forEach((t, ti) => {
    if (!keep(m, ti)) return;
    const q = t.map((p) => [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]]);
    if (q.every((p) => Math.abs(p[2]) > depth)) return;
    const a = [px(q[0][0]), px(q[0][1])], b = [px(q[1][0]), px(q[1][1])], c = [px(q[2][0]), px(q[2][1])];
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(res - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(res - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-12) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = ((b[1] - c[1]) * (x + 0.5 - c[0]) + (c[0] - b[0]) * (y + 0.5 - c[1])) / d, v = ((c[1] - a[1]) * (x + 0.5 - c[0]) + (a[0] - c[0]) * (y + 0.5 - c[1])) / d;
      if (u >= 0 && v >= 0 && u + v <= 1) grid[y * res + x] = 1;
    }
  });
  let inside = 0, hit = 0, cx = 0, cy = 0;
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const dx = (x + 0.5) / res * 2 - 1, dy = (y + 0.5) / res * 2 - 1;
    if (dx * dx + dy * dy > 1) continue;
    inside++;
    if (grid[y * res + x]) { hit++; cx += dx; cy += dy; }
  }
  return { fill: hit / inside, offCentre: hit ? Math.hypot(cx / hit, cy / hit) * r : Infinity };
}
