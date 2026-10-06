// Layout solids -> collider triangles and greybox meshes (ARCHITECTURE 6, 7.3). The solid conventions are the ones
// of tools/layout_geom.mjs (box / ramp with `rise` + `skirt` / cylinder with `innerRadius`), ported, not re-derived.
// The collider half has no three.js dependency at run time, so tools can share it.
import * as THREE from 'three';
import { ColFlag, VERTEX_LIGHT_SCALE } from './contracts.ts';
import type { AssetDef, ChunkDef, LayoutData, LayoutSolid, ResidentSet, SurfaceType, ZoneId } from './contracts.ts';
import { DEG2RAD, surfaceIndex } from './math.ts';

export interface SolidColliders {
  /** world-space triangles, 9 floats each */
  positions: Float32Array;
  triSurface: Uint8Array;
  triFlags: Uint8Array;
  /** index into solidIds */
  triSolid: Uint16Array;
  solidIds: string[];
  triangles: number;
}

/** A solid is live when its zone is built, or when its `sets` contains the resident set (the peg-stair seam). */
export function solidLive(s: LayoutSolid, zones: readonly ZoneId[], residentSet: ResidentSet): boolean {
  return zones.includes(s.zone) || (s.sets !== undefined && s.sets.includes(residentSet));
}

/** Every LayoutSolid flag mapped to its ColFlag. */
export function solidFlags(s: LayoutSolid): number {
  let f = 0;
  if (s.pierce) f |= ColFlag.PIERCE;
  if (s.grille || s.skipsShots) f |= ColFlag.GRILLE;
  if (s.low) f |= ColFlag.LOW;
  if (s.stunsCharge) f |= ColFlag.STUNS_CHARGE;
  if (s.blocksBossFire) f |= ColFlag.BLOCKS_BOSS_FIRE;
  if (s.invisible) f |= ColFlag.INVISIBLE;
  if (s.playerOnly) f |= ColFlag.BODY_ONLY;
  return f;
}

/** Number of segments of a cylinder solid: chord error under 3 cm, 12 to 64, a multiple of 4. */
export function cylinderSegments(radius: number): number {
  const n = Math.ceil(Math.PI / Math.acos(Math.max(-1, Math.min(1, 1 - 0.03 / Math.max(radius, 0.05)))));
  return Math.min(64, Math.max(12, Math.ceil(n / 4) * 4));
}

/** Appends the triangles of one solid (outward winding) to `out` as flat xyz triples. Returns the triangle count. */
export function solidTriangles(s: LayoutSolid, out: number[]): number {
  const start = out.length;
  const px = s.pos[0], py = s.pos[1], pz = s.pos[2];
  const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): void => {
    // skip degenerate triangles (the low edge of a ramp without a skirt)
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-12) return;
    out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };
  if (s.shape === 'cylinder') {
    const R = s.size[0] / 2, ri = s.innerRadius ?? 0;
    const y0 = py - s.size[1] / 2, y1 = py + s.size[1] / 2;
    const n = cylinderSegments(R);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const ox0 = px + R * c0, oz0 = pz + R * s0, ox1 = px + R * c1, oz1 = pz + R * s1;
      // outer wall
      tri(ox0, y0, oz0, ox0, y1, oz0, ox1, y1, oz1);
      tri(ox0, y0, oz0, ox1, y1, oz1, ox1, y0, oz1);
      if (ri > 0) {
        const ix0 = px + ri * c0, iz0 = pz + ri * s0, ix1 = px + ri * c1, iz1 = pz + ri * s1;
        // inner wall (faces the axis)
        tri(ix1, y0, iz1, ix1, y1, iz1, ix0, y1, iz0);
        tri(ix1, y0, iz1, ix0, y1, iz0, ix0, y0, iz0);
        // top ring (+y), bottom ring (-y)
        tri(ox0, y1, oz0, ix0, y1, iz0, ix1, y1, iz1);
        tri(ox0, y1, oz0, ix1, y1, iz1, ox1, y1, oz1);
        tri(ox0, y0, oz0, ix1, y0, iz1, ix0, y0, iz0);
        tri(ox0, y0, oz0, ox1, y0, oz1, ix1, y0, iz1);
      } else {
        tri(px, y1, pz, ox1, y1, oz1, ox0, y1, oz0);
        tri(px, y0, pz, ox0, y0, oz0, ox1, y0, oz1);
      }
    }
    return (out.length - start) / 9;
  }
  // box or ramp
  const hx = s.size[0] / 2, hz = s.size[2] / 2;
  const r = (s.rotY || 0) * DEG2RAD, c = Math.cos(r), sn = Math.sin(r);
  const yLow = py - s.size[1] / 2, yHigh = py + s.size[1] / 2;
  const yBottom = s.shape === 'ramp' ? yLow - (s.skirt ?? 0) : yLow;
  // corners: 0 (-x,-z), 1 (+x,-z), 2 (+x,+z), 3 (-x,+z)
  const lx = [-hx, hx, hx, -hx], lz = [-hz, -hz, hz, hz];
  const wx: number[] = [], wz: number[] = [], top: number[] = [];
  for (let i = 0; i < 4; i++) {
    const x = lx[i] as number, z = lz[i] as number;
    wx.push(px + x * c + z * sn);
    wz.push(pz - x * sn + z * c);
    let high = true;
    if (s.shape === 'ramp') {
      switch (s.rise) {
        case '+x': high = x > 0; break;
        case '-x': high = x < 0; break;
        case '+z': high = z > 0; break;
        case '-z': high = z < 0; break;
        default: high = true;
      }
    }
    top.push(high ? yHigh : yLow);
  }
  const X = (i: number): number => wx[i] as number, Z = (i: number): number => wz[i] as number, T = (i: number): number => top[i] as number;
  // top (+y) and bottom (-y)
  tri(X(0), T(0), Z(0), X(3), T(3), Z(3), X(2), T(2), Z(2));
  tri(X(0), T(0), Z(0), X(2), T(2), Z(2), X(1), T(1), Z(1));
  tri(X(0), yBottom, Z(0), X(1), yBottom, Z(1), X(2), yBottom, Z(2));
  tri(X(0), yBottom, Z(0), X(2), yBottom, Z(2), X(3), yBottom, Z(3));
  // sides: quad (B_i, T_i, T_j, B_j) faces outward for i -> j going round 0,1,2,3
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(X(i), yBottom, Z(i), X(i), T(i), Z(i), X(j), T(j), Z(j));
    tri(X(i), yBottom, Z(i), X(j), T(j), Z(j), X(j), yBottom, Z(j));
  }
  return (out.length - start) / 9;
}

export interface ColliderBuildOptions {
  /** zones whose solids of role `terrain` are left out (a sculpted `collider_terrain` mesh replaces them, ARCHITECTURE 6) */
  skipTerrainZones?: readonly ZoneId[];
  /** extra world-space triangle soups appended after the solids (the sculpted terrain); `solidId` '' */
  extra?: readonly { positions: ArrayLike<number>; surface: SurfaceType; flags: number }[];
}

/**
 * Collider triangles of every live solid: positions plus per-triangle surface, ColFlag bits and solid index.
 * Solids with `dynamic` are included: the world switches them with collision.setSolidEnabled.
 */
export function buildSolidColliders(layout: LayoutData, zones: readonly ZoneId[], residentSet: ResidentSet, options: ColliderBuildOptions = {}): SolidColliders {
  const flat: number[] = [];
  const surf: number[] = [], flags: number[] = [], solid: number[] = [];
  const solidIds: string[] = [];
  const skip = options.skipTerrainZones;
  for (const s of layout.solids) {
    if (!solidLive(s, zones, residentSet)) continue;
    if (skip && s.role === 'terrain' && skip.includes(s.zone)) continue;
    const n = solidTriangles(s, flat);
    if (n === 0) continue;
    const si = solidIds.length;
    solidIds.push(s.id);
    const su = surfaceIndex(s.surface), fl = solidFlags(s);
    for (let i = 0; i < n; i++) { surf.push(su); flags.push(fl); solid.push(si); }
  }
  if (options.extra) {
    for (const e of options.extra) {
      const n = Math.floor(e.positions.length / 9);
      if (n === 0) continue;
      // An open sheet belongs to NO solid (collision.ts NO_SOLID: any index >= solidIds.length). With an id of its
      // own, capsuleFree's inside test counted the one crossing of the sheet below a capsule as "inside a solid".
      const si = 0xffff;
      const su = surfaceIndex(e.surface);
      for (let i = 0; i < n * 9; i++) flat.push(e.positions[i] as number);
      for (let i = 0; i < n; i++) { surf.push(su); flags.push(e.flags); solid.push(si); }
    }
  }
  return {
    positions: Float32Array.from(flat), triSurface: Uint8Array.from(surf), triFlags: Uint8Array.from(flags),
    triSolid: Uint16Array.from(solid), solidIds, triangles: surf.length,
  };
}

// ============================================================================================================
// The greybox look
// ============================================================================================================

/** Linear RGB tint per surface (the greybox palette). */
export const SURFACE_TINT: Readonly<Record<SurfaceType, readonly [number, number, number]>> = {
  sand: [0.58, 0.38, 0.15], wood: [0.25, 0.12, 0.05], adobe: [0.48, 0.25, 0.11], metal: [0.16, 0.19, 0.22],
  ceramic: [0.68, 0.66, 0.58], stone: [0.2, 0.19, 0.16], cloth: [0.32, 0.27, 0.2], none: [0.3, 0.3, 0.3],
};
const KEY = 1.3, AMBIENT = 0.9;

/**
 * One non-indexed geometry for a list of solids: position + colour (surface tint, lit by a fixed key so slopes read,
 * stored as tint * light / VERTEX_LIGHT_SCALE like every vertex-lit mesh) + a flat uv.
 */
export function buildGreyboxGeometry(solids: readonly LayoutSolid[], toSun: readonly [number, number, number]): THREE.BufferGeometry {
  const flat: number[] = [];
  const colors: number[] = [];
  const sl = Math.hypot(toSun[0], toSun[1], toSun[2]) || 1;
  const sx = toSun[0] / sl, sy = toSun[1] / sl, sz = toSun[2] / sl;
  for (const s of solids) {
    const start = flat.length;
    const n = solidTriangles(s, flat);
    const tint = SURFACE_TINT[s.surface] ?? SURFACE_TINT.none;
    for (let t = 0; t < n; t++) {
      const o = start + t * 9;
      const ax = flat[o] as number, ay = flat[o + 1] as number, az = flat[o + 2] as number;
      const ux = (flat[o + 3] as number) - ax, uy = (flat[o + 4] as number) - ay, uz = (flat[o + 5] as number) - az;
      const vx = (flat[o + 6] as number) - ax, vy = (flat[o + 7] as number) - ay, vz = (flat[o + 8] as number) - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // key from the sun, a weak fill from the opposite side and a sky term: every face orientation gets its own value
      const light = AMBIENT * (0.55 + 0.25 * ny) + KEY * Math.max(0, nx * sx + ny * sy + nz * sz) + 0.18 * Math.max(0, -(nx * sx + nz * sz));
      const k = Math.min(1, light / VERTEX_LIGHT_SCALE);
      for (let v = 0; v < 3; v++) colors.push(tint[0] * k, tint[1] * k, tint[2] * k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(flat), 3));
  g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(colors), 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** The unlit vertex-colour material of the greybox: COLOR_0 * VERTEX_LIGHT_SCALE. */
export function greyboxMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.color.setRGB(VERTEX_LIGHT_SCALE, VERTEX_LIGHT_SCALE, VERTEX_LIGHT_SCALE);
  m.name = 'greybox';
  return m;
}

/**
 * The greybox of the live solids as one mesh per surface (named `greybox__<surface>`), for sandboxes and tools.
 * Invisible solids are left out.
 */
export function buildSolidMeshes(layout: LayoutData, zones: readonly ZoneId[], residentSet: ResidentSet, material?: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'greybox';
  const bySurface = new Map<SurfaceType, LayoutSolid[]>();
  for (const s of layout.solids) {
    if (s.invisible || !solidLive(s, zones, residentSet)) continue;
    let list = bySurface.get(s.surface);
    if (!list) { list = []; bySurface.set(s.surface, list); }
    list.push(s);
  }
  const mat = material ?? greyboxMaterial();
  for (const [surface, list] of bySurface) {
    const mesh = new THREE.Mesh(buildGreyboxGeometry(list, layout.meta.sun.toSun), mat);
    mesh.name = 'greybox__' + surface;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}

// ---- zone placeholders: the greybox split into the manifest's chunk plan -------------------------------------

const SURFACE_MATERIAL: Readonly<Record<SurfaceType, string>> = {
  sand: 'm_sand', wood: 'm_frontier', adobe: 'm_frontier', cloth: 'm_frontier', metal: 'm_pellam', ceramic: 'm_pellam', stone: 'm_pellam', none: 'm_pellam',
};
function inBox(box: ChunkDef['box'], x: number, y: number, z: number): boolean {
  return x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1] && z >= box.min[2] && z <= box.max[2];
}
function boxDistance(box: ChunkDef['box'], x: number, y: number, z: number): number {
  const dx = Math.max(box.min[0] - x, 0, x - box.max[0]), dy = Math.max(box.min[1] - y, 0, y - box.max[1]), dz = Math.max(box.min[2] - z, 0, z - box.max[2]);
  return Math.hypot(dx, dy, dz);
}
/** Which chunk of a zone asset a solid belongs to in the placeholder (final art assigns faces by hand, ARCHITECTURE 7.5). */
export function chunkOfSolid(chunks: readonly ChunkDef[], s: LayoutSolid): ChunkDef | null {
  if (chunks.length === 0) return null;
  for (const c of chunks) if (c.solids && c.solids.includes(s.id)) return c;
  const walkable = s.role === 'floor' || s.role === 'terrain' || s.role === 'stairs' || s.role === 'platform';
  if (!walkable && s.size[1] >= 8) {
    for (const c of chunks) if (c.part === 'high' && !c.solids) return c;       // the skyline shell
  }
  let best: ChunkDef | null = null, bestD = Infinity;
  for (const c of chunks) {
    if (c.part === 'high') continue;
    if (inBox(c.box, s.pos[0], s.pos[1], s.pos[2])) return c;
    const d = boxDistance(c.box, s.pos[0], s.pos[1], s.pos[2]);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best ?? (chunks[0] as ChunkDef);
}
function materialOfSolid(chunk: ChunkDef, s: LayoutSolid): string {
  const want = SURFACE_MATERIAL[s.surface];
  if (chunk.materials.includes(want)) return want;
  for (const m of chunk.materials) if (m !== 'm_mask' && m !== 'm_emis') return m;
  return chunk.materials[0] ?? want;
}

/**
 * Placeholder of a zone asset: the zone's solids (with the seam solids it owns) as the meshes `<chunk id>__<material>`
 * of the manifest's chunk plan. Every planned mesh exists (a chunk material no solid maps to gets one tiny triangle), so
 * the draw calls of the placeholder are the plan's. Meshes carry userData.materialName and userData.bake = 'VL'.
 */
export function buildZoneGreybox(layout: LayoutData, zone: ZoneId, def: AssetDef): THREE.Group {
  const root = new THREE.Group();
  const chunks = def.chunks ?? [];
  const buckets = new Map<string, LayoutSolid[]>();
  for (const c of chunks) for (const m of c.materials) buckets.set(c.id + '__' + m, []);
  for (const s of layout.solids) {
    if (s.zone !== zone || s.invisible) continue;
    const chunk = chunkOfSolid(chunks, s);
    if (!chunk) continue;
    (buckets.get(chunk.id + '__' + materialOfSolid(chunk, s)) as LayoutSolid[]).push(s);
  }
  for (const c of chunks) {
    for (const m of c.materials) {
      const name = c.id + '__' + m;
      const solids = buckets.get(name) as LayoutSolid[];
      let geometry: THREE.BufferGeometry;
      if (solids.length > 0) geometry = buildGreyboxGeometry(solids, layout.meta.sun.toSun);
      else {
        // nothing maps here in the blockout: keep the planned draw call with one 1 cm triangle at the chunk's corner
        const [x, y, z] = c.box.min;
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x, y, z, x + 0.01, y, z, x, y, z + 0.01]), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(0.05), 3));
        geometry.computeBoundingSphere();
      }
      const mesh = new THREE.Mesh(geometry);
      mesh.name = name;
      mesh.userData.materialName = m;
      mesh.userData.bake = 'VL';
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
  }
  return root;
}
