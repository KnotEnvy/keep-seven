// src/enemies/nav.ts: the nav graph of the built zones, gates, A*, lanes and the one way a body moves.
//
// The graph is the layout's nav nodes whose zone is built (or whose `sets` holds the resident set: the seam), rebuilt on
// `world/built`. A link listed in nav.gates is passable only while world.doorState(door) is 'open'. The search works on
// typed arrays allocated at rebuild (an explicit binary heap, generation stamps instead of clearing).
// Bodies move through collision.resolveCapsule, so a fan offset, a lunge or a thrown body never ends inside a wall and
// a ramp or a 0.3 m sill is simply walked.
import type { GameContext, LayoutMarker, MarkerId, NavNode, ZoneId } from '../core/contracts.ts';
import { DEG2RAD } from '../core/math.ts';
import type { Actor, Shared } from './internals.ts';
import { PATH_CAP, WALKABLE_COS } from './internals.ts';

export interface Lane {
  id: MarkerId;
  /** centre of the bottom face */
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  /** unit axis of the long side, in the lane's own frame turned by rotY */
  ax: number; az: number;
  cos: number; sin: number;
}

export class Nav {
  count = 0;
  ids: string[] = [];
  zone: ZoneId[] = [];
  x = new Float32Array(0);
  y = new Float32Array(0);
  z = new Float32Array(0);
  /** CSR adjacency */
  private adjStart = new Int32Array(1);
  private adjTo = new Int16Array(0);
  private adjCost = new Float32Array(0);
  /** up to two doors per directed edge (index into `doors`, -1 = none) */
  private adjGateA = new Int16Array(0);
  private adjGateB = new Int16Array(0);
  private doors: MarkerId[] = [];
  /** nodes tagged `firing_point` */
  firing = new Int16Array(0);
  /**
   * Per firing point (same index as `firing`): does it have a sight line to her? 1 yes, 0 no, -1 not looked at yet.
   * Refreshed one point per Transit think through the budgeted sight ray (transit.ts `scout`).
   */
  fpSees = new Int8Array(0);
  fpCursor = 0;
  /** game time each node was last used as a firing point; actor index standing on it (-1) */
  usedAt = new Float64Array(0);
  owner = new Int8Array(0);
  readonly lanes: Lane[] = [];
  // ---- search scratch
  private g = new Float32Array(0);
  private came = new Int16Array(0);
  private stamp = new Uint16Array(0);
  private closed = new Uint16Array(0);
  private generation = 0;
  private heapNode = new Int16Array(0);
  private heapKey = new Float32Array(0);
  private readonly costPath = new Int16Array(PATH_CAP);
  /** length in metres of the route the last successful `path` found */
  lastCost = 0;
  /** how many searches ran (debug) */
  searches = 0;
  private playerNodeTick = -1;
  private playerNodeValue = -1;

  constructor(private readonly ctx: GameContext) {
    for (const m of ctx.data.markersOfType('trigger')) if (m.params.kind === 'lane') this.lanes.push(makeLane(m));
  }

  laneIndex(id: MarkerId | ''): number {
    if (id === '') return -1;
    for (let i = 0; i < this.lanes.length; i++) if ((this.lanes[i] as Lane).id === id) return i;
    return -1;
  }

  /** Signed along-axis coordinate and lateral offset of a point in a lane's frame; false when outside its volume. */
  inLane(lane: Lane, x: number, y: number, z: number): boolean {
    const dy = y - lane.cy;
    if (dy < -0.5 || dy > lane.hy * 2 + 0.5) return false;
    const dx = x - lane.cx, dz = z - lane.cz;
    const lx = dx * lane.cos - dz * lane.sin, lz = dx * lane.sin + dz * lane.cos;
    return Math.abs(lx) <= lane.hx && Math.abs(lz) <= lane.hz;
  }

  /** Rebuild from the zones that exist now (state change: allocates). */
  rebuild(): void {
    const { ctx } = this;
    const nav = ctx.data.layout.nav;
    const built = ctx.world.builtZones, set = ctx.world.residentSet;
    const local = new Map<string, number>();
    const nodes: NavNode[] = [];
    for (const n of nav.nodes) {
      if (!(built.includes(n.zone) || (n.sets !== undefined && n.sets.includes(set)))) continue;
      local.set(n.id, nodes.length);
      nodes.push(n);
    }
    const count = nodes.length;
    this.count = count;
    this.ids = nodes.map((n) => n.id);
    this.zone = nodes.map((n) => n.zone);
    this.x = new Float32Array(count); this.y = new Float32Array(count); this.z = new Float32Array(count);
    const firing: number[] = [];
    nodes.forEach((n, i) => {
      this.x[i] = n.pos[0]; this.y[i] = n.pos[1]; this.z[i] = n.pos[2];
      if (n.tags && n.tags.includes('firing_point')) firing.push(i);
    });
    this.firing = Int16Array.from(firing);
    this.fpSees = new Int8Array(firing.length).fill(-1);
    this.fpCursor = 0;
    this.usedAt = new Float64Array(count).fill(-1e9);
    this.owner = new Int8Array(count).fill(-1);
    // gates by link
    this.doors = [];
    const gateOf = new Map<string, number[]>();
    const key = (a: string, b: string): string => (a < b ? a + '|' + b : b + '|' + a);
    for (const g of nav.gates) {
      let di = this.doors.indexOf(g.door);
      if (di < 0) { di = this.doors.length; this.doors.push(g.door); }
      const k = key(g.link[0], g.link[1]);
      let list = gateOf.get(k);
      if (!list) { list = []; gateOf.set(k, list); }
      if (!list.includes(di)) list.push(di);
    }
    const lists: number[][] = nodes.map(() => []);
    const gatesA: number[][] = nodes.map(() => []);
    const gatesB: number[][] = nodes.map(() => []);
    for (const [a, b] of nav.links) {
      const ia = local.get(a), ib = local.get(b);
      if (ia === undefined || ib === undefined) continue;
      const g = gateOf.get(key(a, b));
      (lists[ia] as number[]).push(ib); (lists[ib] as number[]).push(ia);
      (gatesA[ia] as number[]).push(g?.[0] ?? -1); (gatesA[ib] as number[]).push(g?.[0] ?? -1);
      (gatesB[ia] as number[]).push(g?.[1] ?? -1); (gatesB[ib] as number[]).push(g?.[1] ?? -1);
    }
    let edges = 0;
    for (const l of lists) edges += l.length;
    this.adjStart = new Int32Array(count + 1);
    this.adjTo = new Int16Array(edges); this.adjCost = new Float32Array(edges);
    this.adjGateA = new Int16Array(edges); this.adjGateB = new Int16Array(edges);
    let k = 0;
    for (let i = 0; i < count; i++) {
      this.adjStart[i] = k;
      const l = lists[i] as number[];
      for (let j = 0; j < l.length; j++) {
        const to = l[j] as number;
        this.adjTo[k] = to;
        this.adjCost[k] = Math.hypot((this.x[i] as number) - (this.x[to] as number), (this.y[i] as number) - (this.y[to] as number), (this.z[i] as number) - (this.z[to] as number));
        this.adjGateA[k] = (gatesA[i] as number[])[j] as number;
        this.adjGateB[k] = (gatesB[i] as number[])[j] as number;
        k++;
      }
    }
    this.adjStart[count] = k;
    this.g = new Float32Array(count); this.came = new Int16Array(count);
    this.stamp = new Uint16Array(count); this.closed = new Uint16Array(count);
    this.generation = 0;
    this.heapNode = new Int16Array(edges + 2); this.heapKey = new Float32Array(edges + 2);
    this.playerNodeTick = -1;
  }

  /** Metres of walking from node a to node b over open links; Infinity when there is no route. An event-time call (one A*). */
  routeLength(a: number, b: number): number {
    if (a === b) return 0;
    return this.path(a, b, this.costPath) > 0 ? this.lastCost : Infinity;
  }

  /** Index into `firing` of a node, or -1. */
  firingIndex(node: number): number {
    const list = this.firing;
    for (let i = 0; i < list.length; i++) if (list[i] === node) return i;
    return -1;
  }

  /** Index of the node nearest a point (height counts double, so another storey loses). -1 when the graph is empty. */
  nearest(x: number, y: number, z: number): number {
    let best = -1, bestD = Infinity;
    const nx = this.x, ny = this.y, nz = this.z;
    for (let i = 0; i < this.count; i++) {
      const dx = (nx[i] as number) - x, dy = ((ny[i] as number) - y) * 2, dz = (nz[i] as number) - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** The player's nearest node, found once per tick however many bodies ask. */
  playerNode(S: Shared): number {
    if (this.playerNodeTick !== S.tick) {
      this.playerNodeTick = S.tick;
      this.playerNodeValue = this.nearest(S.px, S.py, S.pz);
    }
    return this.playerNodeValue;
  }

  private open(gate: number): boolean {
    return gate < 0 || this.ctx.world.doorState(this.doors[gate] as MarkerId) === 'open';
  }

  /**
   * A* from node a to node b over links whose doors are open. Writes up to PATH_CAP node indices (a first) into `out`
   * and returns how many; 0 when there is no route. A route longer than the buffer is cut at its end: the caller
   * searches again when it gets there. With `near`, when b cannot be reached the route ends at the reachable node
   * nearest to b instead (the last node written is then not b).
   */
  path(a: number, b: number, out: Int16Array, near = false): number {
    if (a < 0 || b < 0 || a >= this.count || b >= this.count) return 0;
    if (a === b) { out[0] = a; return 1; }
    this.searches++;
    if (++this.generation >= 65535) { this.generation = 1; this.stamp.fill(0); this.closed.fill(0); }
    const gen = this.generation;
    const g = this.g, came = this.came, stamp = this.stamp, closed = this.closed;
    const heapNode = this.heapNode, heapKey = this.heapKey;
    const gx = this.x[b] as number, gy = this.y[b] as number, gz = this.z[b] as number;
    g[a] = 0; came[a] = -1; stamp[a] = gen;
    let size = 1;
    heapNode[0] = a; heapKey[0] = 0;
    let found = false;
    while (size > 0) {
      const cur = heapNode[0] as number;
      size--;
      if (size > 0) {
        const node = heapNode[size] as number, key = heapKey[size] as number;
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= size) break;
          if (c + 1 < size && (heapKey[c + 1] as number) < (heapKey[c] as number)) c++;
          if ((heapKey[c] as number) >= key) break;
          heapNode[i] = heapNode[c] as number; heapKey[i] = heapKey[c] as number;
          i = c;
        }
        heapNode[i] = node; heapKey[i] = key;
      }
      if (closed[cur] === gen) continue;
      if (cur === b) { found = true; break; }
      closed[cur] = gen;
      const end = this.adjStart[cur + 1] as number;
      for (let k = this.adjStart[cur] as number; k < end; k++) {
        const j = this.adjTo[k] as number;
        if (closed[j] === gen) continue;
        if (!this.open(this.adjGateA[k] as number) || !this.open(this.adjGateB[k] as number)) continue;
        const t = (g[cur] as number) + (this.adjCost[k] as number);
        if (stamp[j] === gen && t >= (g[j] as number)) continue;
        g[j] = t; came[j] = cur; stamp[j] = gen;
        const dx = (this.x[j] as number) - gx, dy = (this.y[j] as number) - gy, dz = (this.z[j] as number) - gz;
        const key = t + Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (size >= heapNode.length) continue;
        let i = size++;
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if ((heapKey[parent] as number) <= key) break;
          heapNode[i] = heapNode[parent] as number; heapKey[i] = heapKey[parent] as number;
          i = parent;
        }
        heapNode[i] = j; heapKey[i] = key;
      }
    }
    let end = b;
    if (!found) {
      if (!near) return 0;
      // polish round 4: no route (her nearest node is behind a shut door, or on a ledge the graph does not join): the
      // node this body CAN reach that is nearest to it. Everything the failed search closed is what it can reach.
      const cnt = this.count;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < cnt; i++) {
        if (closed[i] !== gen) continue;
        const dx = (this.x[i] as number) - gx, dy = ((this.y[i] as number) - gy) * 2, dz = (this.z[i] as number) - gz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return 0;
      end = best;
    }
    this.lastCost = g[end] as number;
    let n = 0;
    for (let i = end; i >= 0; i = came[i] as number) n++;
    // write the first PATH_CAP nodes of the route, start first
    let skip = n > PATH_CAP ? n - PATH_CAP : 0;
    const len = n - skip;
    let w = n - 1;
    for (let i = end; i >= 0; i = came[i] as number) {
      if (skip > 0) { skip--; w--; continue; }
      out[w] = i;
      w--;
    }
    return len;
  }
}

function makeLane(m: LayoutMarker): Lane {
  const size = m.size ?? [1, 3, 1];
  const r = (m.rotY ?? 0) * DEG2RAD;
  const alongX = size[0] >= size[2];
  const cos = Math.cos(r), sin = Math.sin(r);
  // the long side in world space (lane frame -> world: the inverse turn of inLane)
  const ax = alongX ? cos : sin, az = alongX ? -sin : cos;
  return { id: m.id, cx: m.pos[0], cy: m.pos[1], cz: m.pos[2], hx: size[0] / 2, hy: size[1] / 2, hz: size[2] / 2, ax, az, cos, sin };
}

/**
 * Move a body by (S.mx, S.mz) on the ground: one resolveCapsule a tick. The answer is left in S.res (hitWall, wallFlags).
 * A grounded body is pressed a little into the floor first so it follows ramps down; one that has left the ground falls.
 * The step comes in two fields of Shared, not as arguments: V8 boxes every double argument of a call it does not
 * inline (12 bytes each), and the big per-archetype tick functions are past the inlining budget.
 */
export function moveBody(S: Shared, e: Actor, radius: number, height: number): void {
  const res = S.res;
  const dx = S.mx, dz = S.mz;
  let drop: number;
  if (e.grounded) {
    const h = Math.sqrt(dx * dx + dz * dz);
    drop = h * 0.9 + 0.02;
    e.vy = 0;
  } else {
    e.vy -= 24 * S.dt;
    drop = -e.vy * S.dt;
  }
  S.ctx.collision.resolveCapsule(e.x + dx, e.y - drop, e.z + dz, radius, height, WALKABLE_COS, res);
  e.x = res.x; e.y = res.y; e.z = res.z;
  e.grounded = res.grounded;
}

/** Turn `yaw` toward `target` by at most `maxStep` radians. */
export function turnToward(yaw: number, target: number, maxStep: number): number {
  let d = (target - yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
  return yaw + d;
}

/** Turn a body's yaw toward S.ang by at most S.turn radians (fields, not arguments: see moveBody). */
export function turnBody(S: Shared, e: Actor): void {
  const maxStep = S.turn;
  let d = (S.ang - e.yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
  e.yaw = e.yaw + d;
}

/**
 * Keep the body's route to `goal` current and return the index (into nav arrays) of the node to walk to next, or -1
 * when it stands at the goal or there is no route. Searches only on a repath event: a new goal, or the old route used up.
 */
export function nextWaypoint(S: Shared, e: Actor, goal: number): number {
  const nav = S.nav;
  if (goal < 0 || nav.count === 0) return -1;
  if (e.pathGoal !== goal || e.pathAt >= e.pathLen) {
    if (e.pathGoal === goal && e.pathLen > 0 && (e.path[e.pathLen - 1] as number) === goal) return -1;     // arrived
    if (e.pathGoal === goal && S.time < e.pathRetry) return -1;                                              // no route (or only a partial one) a moment ago: not every tick
    const from = nav.nearest(e.x, e.y, e.z);
    // polish round 4: a goal that cannot be reached is walked toward as far as the graph goes (Nav.path `near`). Her
    // nearest node on the hall gantry is the gallery's last one, behind the door enc_matador shuts: with no route the
    // Tamper and its Biders walked straight at her and stood under the gantry for as long as she stayed up there.
    e.pathLen = nav.path(from, goal, e.path, true);
    e.pathGoal = goal;
    e.pathAt = 0;
    if (e.pathLen === 0) { e.pathRetry = S.time + 0.5; return -1; }
    if ((e.path[e.pathLen - 1] as number) !== goal) e.pathRetry = S.time + 0.5;                              // partial: look again in a moment, not on every tick at its end
    // already past the first node (on the way to the second): do not walk back to it
    if (e.pathLen > 1) {
      const a = e.path[0] as number, b = e.path[1] as number;
      const abx = (nav.x[b] as number) - (nav.x[a] as number), abz = (nav.z[b] as number) - (nav.z[a] as number);
      const apx = e.x - (nav.x[a] as number), apz = e.z - (nav.z[a] as number);
      if (apx * abx + apz * abz > 0) e.pathAt = 1;
    }
  }
  while (e.pathAt < e.pathLen) {
    const n = e.path[e.pathAt] as number;
    const dx = (nav.x[n] as number) - e.x, dz = (nav.z[n] as number) - e.z;
    if (dx * dx + dz * dz > 0.3 * 0.3) return n;
    e.pathAt++;
  }
  return -1;
}
