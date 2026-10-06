// Shared by the art-env-interior tests: the shipped zone GLBs as world-space triangle soups, and segment casts.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadManifest, loadLayout, gltfIO, worldMatrix, mat4Point, ROOT } from '../../tools/pipeline-lib.mjs';

export { ROOT };
export const M = loadManifest();
export const L = loadLayout();
export const ZONES = ['env_tally_house', 'env_the_gallery', 'env_lift_hall', 'env_the_bore'];
export const marker = (id) => { const m = L.markers.find((x) => x.id === id); if (!m) throw new Error(`no marker ${id}`); return m; };
export const solid = (id) => { const s = L.solids.find((x) => x.id === id); if (!s) throw new Error(`no solid ${id}`); return s; };

export function node(args) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const cache = new Map();
/**
 * The zone's shipped GLB as triangles (world space). opaque: only the chunk meshes of the structure materials
 * (m_frontier / m_pellam): m_mask cards are cut by their mask and m_emis lamps are light, not walls.
 * Returns { tris: Float64Array (9 per triangle), mat: [material per triangle], count, grid }.
 */
export async function zoneTris(id, { opaque = true, file = null } = {}) {
  const key = `${id}:${opaque}:${file}`;
  if (cache.has(key)) return cache.get(key);
  const io = await gltfIO();
  const doc = await io.read(file ?? M.assets[id]._pub);
  const out = [], mats = [];
  for (const n of doc.getRoot().listNodes()) {
    if (!n.getMesh() || !n.getName().includes('__')) continue;
    const m = worldMatrix(n);
    for (const p of n.getMesh().listPrimitives()) {
      const mat = p.getMaterial()?.getName();
      if (opaque && !['m_frontier', 'm_pellam'].includes(mat)) continue;
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), e = [0, 0, 0];
      const w = []; for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, e); w.push(mat4Point(m, e)); }
      for (let i = 0; i < idx.getCount(); i += 3) { for (let k = 0; k < 3; k++) out.push(...w[idx.getScalar(i + k)]); mats.push(mat); }
    }
  }
  const tris = Float64Array.from(out);
  const r = { tris, mat: mats, count: tris.length / 9, grid: buildGrid(tris) };
  cache.set(key, r);
  return r;
}

const CELL = 2.0;
function buildGrid(T) {
  const g = new Map();
  for (let t = 0; t < T.length; t += 9) {
    const x0 = Math.min(T[t], T[t + 3], T[t + 6]), x1 = Math.max(T[t], T[t + 3], T[t + 6]);
    const z0 = Math.min(T[t + 2], T[t + 5], T[t + 8]), z1 = Math.max(T[t + 2], T[t + 5], T[t + 8]);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = i * 100003 + j; if (!g.has(k)) g.set(k, []); g.get(k).push(t);
    }
  }
  return g;
}

/** Every hit of the segment a -> b with the zone's triangles: sorted list of { t (0..1), d (metres), tri }. */
export function segmentHits(Z, a, b) {
  const T = Z.tris, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const seen = new Set(), hits = [];
  // walk the grid cells along the segment (sampled every half cell)
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CELL * 0.5)));
  for (let s = 0; s <= n; s++) {
    const x = a[0] + dx * s / n, z = a[2] + dz * s / n;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const k = (Math.floor(x / CELL) + di) * 100003 + (Math.floor(z / CELL) + dj);
      const list = Z.grid.get(k); if (!list) continue;
      for (const t of list) {
        if (seen.has(t)) continue; seen.add(t);
        const h = rayTri(a, [dx, dy, dz], T, t);
        if (h !== null && h >= 0 && h <= 1) hits.push({ t: h, d: h * len, tri: t / 9 });
      }
    }
  }
  return hits.sort((p, q) => p.t - q.t);
}

function rayTri(o, d, T, t) {     // Moller-Trumbore, both faces
  const e1x = T[t + 3] - T[t], e1y = T[t + 4] - T[t + 1], e1z = T[t + 5] - T[t + 2];
  const e2x = T[t + 6] - T[t], e2y = T[t + 7] - T[t + 1], e2z = T[t + 8] - T[t + 2];
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det, sx = o[0] - T[t], sy = o[1] - T[t + 1], sz = o[2] - T[t + 2];
  const u = (sx * px + sy * py + sz * pz) * inv; if (u < -1e-9 || u > 1 + 1e-9) return null;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
export const len = (a) => Math.hypot(...a);
export const fmt = (p) => `(${p.map((v) => v.toFixed(2)).join(', ')})`;
