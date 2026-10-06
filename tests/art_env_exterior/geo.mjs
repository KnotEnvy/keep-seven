// Geometry of the shipped exterior GLBs for the tests of tests/art_env_exterior (not a test file): drawn triangles in
// world space (game coordinates), a 2-D grid to find them fast, segment and ray queries.
import path from 'node:path';
import { ROOT, loadManifest, loadLayout, gltfIO, worldMatrix, mat4Point } from '../../tools/pipeline-lib.mjs';

export const M = loadManifest();
export const L = loadLayout();
export const ZONE_ASSETS = { the_lip: 'env_the_lip', plenty_street: 'env_plenty_street', far_rim: 'env_far_rim' };
export const OWN = ['env_the_lip', 'env_plenty_street', 'env_far_rim', 'rim_town_card', 'env_backdrop_day', 'env_backdrop_dusk'];

/** { tris: Float64Array (9 per triangle), mats: [name per triangle], mesh: [node name per triangle], nodes: Map(name -> world position) } */
export async function loadAsset(id, { drawnOnly = true } = {}) {
  const io = await gltfIO();
  const doc = await io.read(M.assets[id]._pub);
  const out = []; const mats = []; const mesh = []; const nodes = new Map();
  for (const n of doc.getRoot().listNodes()) {
    const m = worldMatrix(n);
    nodes.set(n.getName(), [m[12], m[13], m[14]]);
    if (!n.getMesh()) continue;
    if (drawnOnly && n.getName() === 'collider_terrain') continue;
    for (const p of n.getMesh().listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), e = [0, 0, 0];
      const cnt = idx ? idx.getCount() : pos.getCount();
      const mat = p.getMaterial()?.getName() ?? '';
      for (let i = 0; i < cnt; i += 3) {
        for (let k = 0; k < 3; k++) { pos.getElement(idx ? idx.getScalar(i + k) : i + k, e); const w = mat4Point(m, e); out.push(w[0], w[1], w[2]); }
        mats.push(mat); mesh.push(n.getName());
      }
    }
  }
  return { tris: Float64Array.from(out), mats, mesh, nodes };
}

export class Grid {
  constructor(tris, cell = 2.0) {
    this.t = tris; this.cell = cell; this.map = new Map();
    for (let i = 0; i < tris.length / 9; i++) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) { const x = tris[i * 9 + k * 3], z = tris[i * 9 + k * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let a = Math.floor(x0 / cell); a <= Math.floor(x1 / cell); a++) for (let b = Math.floor(z0 / cell); b <= Math.floor(z1 / cell); b++) {
        const k = a + ',' + b; if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(i);
      }
    }
  }
  /** triangle indices whose bin touches the segment a -> b (padded by `pad` metres) */
  near(a, b, pad = 0) {
    const out = new Set(); const L = Math.hypot(b[0] - a[0], b[2] - a[2]); const n = Math.max(1, Math.ceil(L / (this.cell * 0.5)));
    const r = Math.ceil(pad / this.cell);
    for (let s = 0; s <= n; s++) {
      const x = a[0] + (b[0] - a[0]) * s / n, z = a[2] + (b[2] - a[2]) * s / n;
      const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
      for (let i = -r - 1; i <= r + 1; i++) for (let j = -r - 1; j <= r + 1; j++) for (const t of this.map.get((cx + i) + ',' + (cz + j)) ?? []) out.add(t);
    }
    return out;
  }
  /** first hit parameter t in (0, 1] of the segment a -> b, or null; `skip(i)` leaves triangles out */
  segment(a, b, skip = null) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let best = null, which = -1;
    for (const i of this.near(a, b)) {
      if (skip && skip(i)) continue;
      const t = rayTri(a, d, this.t, i);
      if (t !== null && t > 1e-6 && t <= 1 && (best === null || t < best)) { best = t; which = i; }
    }
    return best === null ? null : { t: best, tri: which };
  }
}

export function rayTri(o, d, T, i) {
  const ax = T[i * 9], ay = T[i * 9 + 1], az = T[i * 9 + 2];
  const e1 = [T[i * 9 + 3] - ax, T[i * 9 + 4] - ay, T[i * 9 + 5] - az], e2 = [T[i * 9 + 6] - ax, T[i * 9 + 7] - ay, T[i * 9 + 8] - az];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det; const s = [o[0] - ax, o[1] - ay, o[2] - az];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv; if (u < 0 || u > 1) return null;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (v < 0 || u + v > 1) return null;
  return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
}

export const marker = (id) => L.markers.find((m) => m.id === id);
export const solid = (id) => L.solids.find((s) => s.id === id);
export const rad = (d) => (d * Math.PI) / 180;
/** a layout box solid's local (x along width, z along depth) -> world, as tools/layout_geom.mjs */
export function boxPoint(s, lx, y, lz) {
  const r = rad(s.rotY ?? 0), c = Math.cos(r), sn = Math.sin(r);
  return [s.pos[0] + lx * c + lz * sn, y, s.pos[2] - lx * sn + lz * c];
}
