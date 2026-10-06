// Shared geometry helpers for design/layout.json (generator, validator, map renderer).
// Conventions (also recorded in layout.meta.conventions):
//   game space: metres, +Y up, -Z forward/north, +X east. rotY in degrees, three.js sense
//   (positive = counter-clockwise seen from above; yaw 0 faces -Z, yaw 90 faces -X).
//   box:      pos = centre, size = full extents [x,y,z], rotated about Y by rotY.
//   ramp:     same footprint as a box. The top surface rises from (pos.y - size.y/2) at the
//             low edge to (pos.y + size.y/2) at the high edge, along local `rise`
//             ("+x" | "-x" | "+z" | "-z" = the direction that goes UP). Solid beneath,
//             down to pos.y - size.y/2 - skirt.
//   cylinder: pos = centre, size = [diameter, height, diameter]; optional innerRadius
//             makes it a tube / annulus (floor with a hole, kerb ring).

export const rad = (d) => (d * Math.PI) / 180;
export const WALKABLE = new Set(['floor', 'platform', 'stairs', 'terrain']);

export function toLocal(s, x, z) {
  const dx = x - s.pos[0], dz = z - s.pos[2];
  const r = rad(s.rotY || 0), c = Math.cos(r), sn = Math.sin(r);
  return [dx * c - dz * sn, dx * sn + dz * c];
}
export function toWorld(s, lx, lz) {
  const r = rad(s.rotY || 0), c = Math.cos(r), sn = Math.sin(r);
  return [s.pos[0] + lx * c + lz * sn, s.pos[2] - lx * sn + lz * c];
}
export function bottomOf(s) {
  return s.pos[1] - s.size[1] / 2 - (s.shape === 'ramp' ? s.skirt || 0 : 0);
}
export function topMax(s) { return s.pos[1] + s.size[1] / 2; }

/** Top height of solid `s` at the point of its footprint closest to (x,z), or null when
 *  the footprint is farther than r from (x,z). */
export function topAt(s, x, z, r = 0) {
  const [lx, lz] = toLocal(s, x, z);
  if (s.shape === 'cylinder') {
    const d = Math.hypot(lx, lz), R = s.size[0] / 2, ri = s.innerRadius || 0;
    if (d > R + r || d < ri - r) return null;
    return topMax(s);
  }
  const hx = s.size[0] / 2, hz = s.size[2] / 2;
  const cx = Math.max(-hx, Math.min(hx, lx)), cz = Math.max(-hz, Math.min(hz, lz));
  if (Math.hypot(lx - cx, lz - cz) > r) return null;
  if (s.shape === 'ramp') {
    let t = 0;
    switch (s.rise) {
      case '+x': t = (cx + hx) / (2 * hx); break;
      case '-x': t = (hx - cx) / (2 * hx); break;
      case '+z': t = (cz + hz) / (2 * hz); break;
      case '-z': t = (hz - cz) / (2 * hz); break;
    }
    return s.pos[1] - s.size[1] / 2 + t * s.size[1];
  }
  return topMax(s);
}

/** World-space AABB of a solid: {min:[x,y,z], max:[x,y,z]}. */
export function aabb(s) {
  const hx = s.size[0] / 2, hz = s.size[2] / 2;
  let xs = [], zs = [];
  if (s.shape === 'cylinder') { xs = [s.pos[0] - hx, s.pos[0] + hx]; zs = [s.pos[2] - hx, s.pos[2] + hx]; }
  else for (const [a, b] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) { const [wx, wz] = toWorld(s, a, b); xs.push(wx); zs.push(wz); }
  return { min: [Math.min(...xs), bottomOf(s), Math.min(...zs)], max: [Math.max(...xs), topMax(s), Math.max(...zs)] };
}

/** Footprint corners in world xz (boxes / ramps). */
export function corners(s) {
  const hx = s.size[0] / 2, hz = s.size[2] / 2;
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => toWorld(s, a, b));
}

export class World {
  constructor(solids) {
    this.solids = solids.map((s) => ({ s, bb: aabb(s) }));
  }
  /** Highest walkable top at (x,z) within [yRef - down, yRef + up]. */
  ground(x, z, yRef, up = 0.5, down = 1.2) {
    let best = null;
    for (const { s, bb } of this.solids) {
      if (s.dynamic || !WALKABLE.has(s.role)) continue;
      if (x < bb.min[0] || x > bb.max[0] || z < bb.min[2] || z > bb.max[2]) continue;
      const t = topAt(s, x, z, 0);
      if (t === null || t > yRef + up || t < yRef - down) continue;
      if (!best || t > best.y) best = { y: t, solid: s };
    }
    return best;
  }
  /** Highest top of ANY solid at (x,z) not above yRef + up (for things resting on props). */
  support(x, z, yRef, up = 0.3) {
    let best = null;
    for (const { s, bb } of this.solids) {
      if (s.dynamic || s.role === 'ceiling') continue;
      if (x < bb.min[0] || x > bb.max[0] || z < bb.min[2] || z > bb.max[2]) continue;
      const t = topAt(s, x, z, 0);
      if (t === null || t > yRef + up) continue;
      if (!best || t > best.y) best = { y: t, solid: s };
    }
    return best;
  }
  /** Is a body of radius r standing with feet at height g at (x,z) intersecting a solid? */
  blocker(x, z, g, r = 0.45, lo = 0.4, hi = 1.75) {
    for (const { s, bb } of this.solids) {
      if (x < bb.min[0] - r || x > bb.max[0] + r || z < bb.min[2] - r || z > bb.max[2] + r) continue;
      if (bb.max[1] <= g + lo || bb.min[1] >= g + hi) continue;
      const t = topAt(s, x, z, r);
      if (t === null) continue;
      if (t > g + lo) return s;
    }
    return null;
  }
  /** Can a body of radius r walk the straight segment a -> b? Returns null when clear,
   *  else a reason string. */
  walk(a, b, r = 0.45, step = 0.25) {
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / step));
    let g = a[1];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a[0] + dx * t, z = a[2] + dz * t;
      const gr = this.ground(x, z, g, 0.45);
      if (!gr) return `no floor at (${x.toFixed(2)}, ${z.toFixed(2)}) near y ${g.toFixed(2)}`;
      if (Math.abs(gr.y - g) > 0.45) return `drop/step of ${(gr.y - g).toFixed(2)} m at (${x.toFixed(2)}, ${z.toFixed(2)})`;
      g = gr.y;
      const bl = this.blocker(x, z, g, r);
      if (bl) return `blocked by ${bl.id} at (${x.toFixed(2)}, ${z.toFixed(2)})`;
    }
    if (Math.abs(g - b[1]) > 0.3) return `ends at y ${g.toFixed(2)}, node is at ${b[1].toFixed(2)}`;
    return null;
  }
}

export function inBounds(p, b, eps = 1e-6) {
  for (let i = 0; i < 3; i++) if (p[i] < b.min[i] - eps || p[i] > b.max[i] + eps) return false;
  return true;
}
