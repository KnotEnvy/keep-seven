// Typed, id-indexed access to design/*.json (ARCHITECTURE 9). The three files are bundled as JSON imports.
import layoutJson from '../../design/layout.json';
import storyJson from '../../design/story.json';
import assetsJson from '../../design/assets.json';
import type {
  AssetBinding, AssetBindingValue, AssetManifest, DoorState, EncounterData, EncounterId, GameData, LayoutData, LayoutMarker,
  LayoutZone, MarkerId, MarkerType, NavNode, NavPortal, Placement, ResidentSet, StoryData, StoryKey, StoryLine, Vec3,
  VisibilityCell, ZoneId,
} from './contracts.ts';
import { DEG2RAD } from './math.ts';

export interface GameDataOptions {
  /** test / dev mode: unknown ids throw */
  strict: boolean;
  /** used by navPath(openOnly); late-bound to ctx.world.doorState */
  doorState?: (id: MarkerId) => DoorState;
  /** override the bundled files (unit tests) */
  layout?: LayoutData; story?: StoryData; manifest?: AssetManifest;
}

const EMPTY_BINDINGS: readonly AssetBinding[] = Object.freeze([]);
const EMPTY_MARKERS: readonly LayoutMarker[] = Object.freeze([]);

function inBounds(b: { min: [number, number, number]; max: [number, number, number] }, x: number, y: number, z: number): boolean {
  return x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2];
}

export class GameDataImpl implements GameData {
  readonly layout: LayoutData;
  readonly story: StoryData;
  readonly manifest: AssetManifest;
  private readonly strict: boolean;
  private doorStateOf: ((id: MarkerId) => DoorState) | null;
  private readonly markerById = new Map<string, LayoutMarker>();
  private readonly byType = new Map<string, LayoutMarker[]>();
  private readonly byZone = new Map<string, LayoutMarker[]>();
  private readonly zoneById = new Map<string, LayoutZone>();
  private readonly zonesOfSet = new Map<string, LayoutZone[]>();
  private readonly cellsOfZone = new Map<string, VisibilityCell[]>();
  private readonly encounterById = new Map<string, EncounterData>();
  private readonly bindingCache = new Map<string, readonly AssetBinding[]>();
  // ---- nav graph
  readonly navNodes: readonly NavNode[];
  private readonly nodeIndex = new Map<string, number>();
  private readonly adj: number[][] = [];
  private readonly adjCost: number[][] = [];
  /** doors on a link, by the link's key (gatesOfLink) */
  private readonly gateOfLink = new Map<string, MarkerId[]>();
  /** the same per adjacency entry (`adjGates[a][k]` gates the edge a -> adj[a][k]; null = open), so the search builds no keys */
  private readonly adjGates: (readonly MarkerId[] | null)[][] = [];
  private heapNode: Int32Array = new Int32Array(0);
  private heapKey: Float64Array = new Float64Array(0);
  private readonly portalByFrom = new Map<string, NavPortal>();
  private readonly gScore: Float64Array;
  private readonly cameFrom: Int32Array;
  private readonly closedFlag: Uint8Array;

  constructor(options: GameDataOptions) {
    this.layout = options.layout ?? (layoutJson as unknown as LayoutData);
    this.story = options.story ?? (storyJson as unknown as StoryData);
    this.manifest = options.manifest ?? (assetsJson as unknown as AssetManifest);
    this.strict = options.strict;
    this.doorStateOf = options.doorState ?? null;

    for (const z of this.layout.zones) {
      this.zoneById.set(z.id, z);
      let list = this.zonesOfSet.get(z.set);
      if (!list) { list = []; this.zonesOfSet.set(z.set, list); }
      list.push(z);
    }
    // highest priority first; stable for equal priorities (layout order)
    for (const list of this.zonesOfSet.values()) list.sort((a, b) => b.priority - a.priority);
    for (const m of this.layout.markers) {
      this.markerById.set(m.id, m);
      let t = this.byType.get(m.type); if (!t) { t = []; this.byType.set(m.type, t); } t.push(m);
      let z = this.byZone.get(m.zone); if (!z) { z = []; this.byZone.set(m.zone, z); } z.push(m);
    }
    for (const c of this.manifest.visibility.cells) {
      let list = this.cellsOfZone.get(c.zone); if (!list) { list = []; this.cellsOfZone.set(c.zone, list); } list.push(c);
    }
    for (const e of this.layout.encounters) this.encounterById.set(e.id, e);

    const nav = this.layout.nav;
    this.navNodes = nav.nodes;
    nav.nodes.forEach((n, i) => { this.nodeIndex.set(n.id, i); this.adj.push([]); this.adjCost.push([]); });
    const addEdge = (a: number, b: number, cost: number): void => {
      (this.adj[a] as number[]).push(b); (this.adjCost[a] as number[]).push(cost);
    };
    for (const [a, b] of nav.links) {
      const ia = this.nodeIndex.get(a), ib = this.nodeIndex.get(b);
      if (ia === undefined || ib === undefined) { if (this.strict) throw new Error(`layout nav link ${a} - ${b} names an unknown node`); continue; }
      const pa = (nav.nodes[ia] as NavNode).pos, pb = (nav.nodes[ib] as NavNode).pos;
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      addEdge(ia, ib, d); addEdge(ib, ia, d);
    }
    for (const p of nav.portals) {
      const ia = this.nodeIndex.get(p.from), ib = this.nodeIndex.get(p.to);
      if (ia === undefined || ib === undefined) { if (this.strict) throw new Error(`layout portal ${p.id} names an unknown node`); continue; }
      addEdge(ia, ib, 1);
      this.portalByFrom.set(p.from, p);
    }
    for (const g of nav.gates) {
      const key = GameDataImpl.linkKey(g.link[0], g.link[1]);
      let doors = this.gateOfLink.get(key); if (!doors) { doors = []; this.gateOfLink.set(key, doors); }
      if (!doors.includes(g.door)) doors.push(g.door);
    }
    let edges = 0;
    for (let a = 0; a < this.adj.length; a++) {
      const nb = this.adj[a] as number[];
      const gates: (readonly MarkerId[] | null)[] = [];
      for (let k = 0; k < nb.length; k++) gates.push(this.gateOfLink.get(GameDataImpl.linkKey((nav.nodes[a] as NavNode).id, (nav.nodes[nb[k] as number] as NavNode).id)) ?? null);
      this.adjGates.push(gates);
      edges += nb.length;
    }
    // every relaxation pushes at most one heap entry, and an edge relaxes at most once per direction
    this.heapNode = new Int32Array(edges + 2); this.heapKey = new Float64Array(edges + 2);
    const n = nav.nodes.length;
    this.gScore = new Float64Array(n); this.cameFrom = new Int32Array(n);
    this.closedFlag = new Uint8Array(n);

    if (this.strict) this.structuralCheck();
  }

  static linkKey(a: string, b: string): string { return a < b ? a + '|' + b : b + '|' + a; }
  /** Late binding: the context supplies world.doorState once the world slot exists. */
  setDoorState(fn: (id: MarkerId) => DoorState): void { this.doorStateOf = fn; }

  /** Cheap structural check (test / dev): every reference between the three files resolves. */
  private structuralCheck(): void {
    const errs: string[] = [];
    for (const m of this.layout.markers) if (!this.zoneById.has(m.zone)) errs.push(`marker ${m.id}: unknown zone ${m.zone}`);
    for (const s of this.layout.solids) if (!this.zoneById.has(s.zone)) errs.push(`solid ${s.id}: unknown zone ${s.zone}`);
    for (const z of this.layout.zones) {
      if (!this.manifest.zones[z.id]) errs.push(`zone ${z.id}: no entry in assets.json zones`);
      if (!this.cellsOfZone.get(z.id)?.length) errs.push(`zone ${z.id}: no visibility cell`);
    }
    for (const g of this.layout.nav.gates) if (!this.markerById.has(g.door)) errs.push(`nav gate names unknown door ${g.door}`);
    for (const p of this.layout.nav.portals) if (!this.markerById.has(p.via)) errs.push(`portal ${p.id}: unknown via marker ${p.via}`);
    for (const id of this.layout.nav.criticalPath) if (!this.nodeIndex.has(id)) errs.push(`criticalPath names unknown node ${id}`);
    for (const [id, set] of Object.entries(this.manifest.sets)) {
      for (const a of set.assets ?? []) if (!this.manifest.assets[a]) errs.push(`set ${id}: unknown asset ${a}`);
      for (const t of set.textures) if (!this.manifest.textures[t]) errs.push(`set ${id}: unknown texture ${t}`);
    }
    for (const c of this.manifest.visibility.cells) for (const u of c.show) if (!this.manifest.visibility.units[u]) errs.push(`cell ${c.id}: unknown unit ${u}`);
    if (errs.length) throw new Error('design data failed the structural check:\n  ' + errs.slice(0, 20).join('\n  '));
  }

  private unknown(kind: string, id: string): undefined {
    if (this.strict) throw new Error(`unknown ${kind} '${id}'`);
    return undefined;
  }

  marker(id: MarkerId): LayoutMarker | undefined { return this.markerById.get(id) ?? this.unknown('marker', id); }
  markersOfType(type: MarkerType): readonly LayoutMarker[] { return this.byType.get(type) ?? EMPTY_MARKERS; }
  markersInZone(zone: ZoneId): readonly LayoutMarker[] { return this.byZone.get(zone) ?? EMPTY_MARKERS; }
  zone(id: ZoneId): LayoutZone {
    const z = this.zoneById.get(id);
    if (!z) throw new Error(`unknown zone '${id}'`);
    return z;
  }
  zonesOf(set: ResidentSet): readonly LayoutZone[] { return this.zonesOfSet.get(set) ?? []; }

  zoneAt(x: number, y: number, z: number, set: ResidentSet): ZoneId | null {
    const list = this.zonesOfSet.get(set);
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {            // sorted by priority, highest first
      const zone = list[i] as LayoutZone;
      if (inBounds(zone.bounds, x, y, z)) return zone.id;
    }
    return null;
  }

  cellAt(zone: ZoneId, x: number, y: number, z: number): VisibilityCell {
    const list = this.cellsOfZone.get(zone);
    if (!list || list.length === 0) throw new Error(`zone '${zone}' has no visibility cell`);
    let fallback: VisibilityCell | null = null;
    for (let i = 0; i < list.length; i++) {
      const c = list[i] as VisibilityCell;
      if (!c.box) { if (!fallback) fallback = c; continue; }
      if (inBounds(c.box, x, y, z)) return c;
    }
    return fallback ?? (list[list.length - 1] as VisibilityCell);
  }

  bindings(marker: LayoutMarker): readonly AssetBinding[] {
    const cached = this.bindingCache.get(marker.id);
    if (cached) return cached;
    const B = this.manifest.bindings, p = marker.params ?? {};
    const out: AssetBinding[] = [];
    const add = (group: keyof AssetManifest['bindings'], key: unknown): void => {
      if (typeof key !== 'string') return;
      const table = B[group] as Record<string, AssetBindingValue> | undefined;
      if (!table || !(key in table)) {
        if (this.strict) throw new Error(`marker ${marker.id}: bindings.${group} has no entry '${key}'`);
        return;
      }
      const v = table[key];
      if (v === null || v === undefined) return;
      if (Array.isArray(v)) { for (const b of v) out.push(b); } else out.push(v);
    };
    if (marker.type === 'enemy_spawn') {
      // only the entrance: params.prop is the hand prop of its vignette, which src/enemies attaches
      if (p.entrance !== undefined) add('entrance', p.entrance);
    } else {
      if (marker.type === 'door') add('door', marker.id);
      else if (marker.type === 'puzzle_element' && p.interactable === undefined) add('puzzleElement', marker.id);
      if (marker.type !== 'door' && p.interactable !== undefined) add('interactable', p.interactable);
      if (p.pickup !== undefined) add('pickup', p.pickup);
      if (p.readable !== undefined) add('readable', p.readable);
      if (p.prop !== undefined) add('prop', p.prop);
    }
    const frozen: readonly AssetBinding[] = out.length ? out : EMPTY_BINDINGS;
    this.bindingCache.set(marker.id, frozen);
    return frozen;
  }

  placement(marker: LayoutMarker, binding: AssetBinding, out: Placement): Placement {
    const scale = binding.scale ?? 1;
    out.scale = scale;
    if (binding.space === 'world') { out.x = 0; out.y = 0; out.z = 0; out.rotYRad = 0; return out; }
    const rot = (marker.rotY ?? 0) * DEG2RAD + Math.PI;
    out.rotYRad = rot;
    const o = binding.offset;
    if (o) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const lx = o[0] * scale, ly = o[1] * scale, lz = o[2] * scale;
      out.x = marker.pos[0] + lx * c + lz * s;
      out.y = marker.pos[1] + ly;
      out.z = marker.pos[2] - lx * s + lz * c;
    } else {
      out.x = marker.pos[0]; out.y = marker.pos[1]; out.z = marker.pos[2];
    }
    return out;
  }

  private readonly scratchPlacement: Placement = { x: 0, y: 0, z: 0, rotYRad: 0, scale: 1 };
  nodeRest(marker: LayoutMarker, binding: AssetBinding, node: string, out: Vec3): boolean {
    const def = this.manifest.assets[binding.asset];
    if (!def) { this.unknown('asset', binding.asset); return false; }
    const local = def.nodePos?.[node];
    if (!local) return false;
    const p = this.placement(marker, binding, this.scratchPlacement);
    const c = Math.cos(p.rotYRad), s = Math.sin(p.rotYRad);
    const lx = local[0] * p.scale, ly = local[1] * p.scale, lz = local[2] * p.scale;
    out.x = p.x + lx * c + lz * s;
    out.y = p.y + ly;
    out.z = p.z - lx * s + lz * c;
    return true;
  }

  // ---- navigation ---------------------------------------------------------------------------
  /** Index of the nav node nearest a point (vertical distance counts double, so another storey loses). -1 when `accept` rejects all. */
  nearestNode(x: number, y: number, z: number, accept?: (node: NavNode, index: number) => boolean): number {
    let best = -1, bestD = Infinity;
    const nodes = this.navNodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i] as NavNode;
      if (accept && !accept(n, i)) continue;
      const dx = n.pos[0] - x, dy = (n.pos[1] - y) * 2, dz = n.pos[2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  navNode(id: string): NavNode | undefined { const i = this.nodeIndex.get(id); return i === undefined ? undefined : this.navNodes[i]; }
  navIndex(id: string): number { return this.nodeIndex.get(id) ?? -1; }
  /** Doors on the link between two nodes ([] when the link is not gated). */
  gatesOfLink(a: string, b: string): readonly MarkerId[] { return this.gateOfLink.get(GameDataImpl.linkKey(a, b)) ?? []; }
  /** The lift ride that starts at this node and ends at `to`, if any. */
  portalBetween(from: string, to: string): NavPortal | undefined {
    const p = this.portalByFrom.get(from);
    return p && p.to === to ? p : undefined;
  }
  /** A nav node id, or a marker id (its nearest node). -1 when neither. */
  resolveNode(idOrMarker: string): number {
    const i = this.nodeIndex.get(idOrMarker);
    if (i !== undefined) return i;
    const m = this.markerById.get(idOrMarker);
    if (!m) return -1;
    return this.nearestNode(m.pos[0], m.pos[1], m.pos[2]);
  }

  navPath(from: string, to: string, openOnly = false): string[] {
    const a = this.resolveNode(from), b = this.resolveNode(to);
    if (a < 0) { this.unknown('nav node or marker', from); return []; }
    if (b < 0) { this.unknown('nav node or marker', to); return []; }
    return this.navPathIndex(a, b, openOnly);
  }
  /**
   * A* over the nav graph. The search itself allocates nothing (typed scratch arrays, a binary heap, a gate list per
   * adjacency entry); the returned id array is the only allocation (about 0.1 to 1 KB), so call it when a route is
   * needed (a repath event), not every tick.
   */
  navPathIndex(a: number, b: number, openOnly: boolean): string[] {
    const out: string[] = [];
    this.navPathInto(a, b, openOnly, out);
    return out;
  }
  /** As navPathIndex, into a caller's array (cleared first). Returns the number of nodes; 0 when there is no route. */
  navPathInto(a: number, b: number, openOnly: boolean, out: string[]): number {
    const nodes = this.navNodes;
    out.length = 0;
    if (a === b) { out.push((nodes[a] as NavNode).id); return 1; }
    const g = this.gScore, came = this.cameFrom, closed = this.closedFlag;
    const heapNode = this.heapNode, heapKey = this.heapKey;
    g.fill(Infinity); came.fill(-1); closed.fill(0);
    const goal = (nodes[b] as NavNode).pos;
    const gx = goal[0], gy = goal[1], gz = goal[2];
    const doorState = openOnly ? this.doorStateOf : null;
    g[a] = 0;
    let size = 1;
    heapNode[0] = a; heapKey[0] = 0;
    while (size > 0) {
      // pop the smallest f
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
      if (closed[cur] === 1) continue;                       // an older, worse entry of a node already expanded
      if (cur === b) {
        for (let i = b; i >= 0; i = came[i] as number) out.push((nodes[i] as NavNode).id);
        out.reverse();
        return out.length;
      }
      closed[cur] = 1;
      const nb = this.adj[cur] as number[], cost = this.adjCost[cur] as number[], gates = this.adjGates[cur] as (readonly MarkerId[] | null)[];
      for (let k = 0; k < nb.length; k++) {
        const j = nb[k] as number;
        if (closed[j] === 1) continue;
        if (doorState) {
          const doors = gates[k] as readonly MarkerId[] | null;
          if (doors) {
            let shut = false;
            for (let d = 0; d < doors.length; d++) if (doorState(doors[d] as string) !== 'open') { shut = true; break; }
            if (shut) continue;
          }
        }
        const t = (g[cur] as number) + (cost[k] as number);
        if (t < (g[j] as number)) {
          g[j] = t; came[j] = cur;
          const p = (nodes[j] as NavNode).pos;
          const dx = p[0] - gx, dy = p[1] - gy, dz = p[2] - gz;
          const key = t + Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (size >= heapNode.length) continue;             // cannot happen (see the constructor); never write past the heap
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
    }
    return 0;
  }

  encounter(id: EncounterId): EncounterData {
    const e = this.encounterById.get(id);
    if (!e) throw new Error(`unknown encounter '${id}'`);
    return e;
  }
  line(key: StoryKey): StoryLine {
    const l = this.story.lines[key];
    if (!l) {
      if (this.strict) throw new Error(`unknown story line '${key}'`);
      return { speaker: 'caption', text: key, seconds: 2 };
    }
    return l;
  }
  ui(key: StoryKey): string {
    const s = this.story.ui[key];
    if (s === undefined) {
      if (this.strict) throw new Error(`unknown ui string '${key}'`);
      return key;
    }
    return s;
  }
}

export function createGameData(options: GameDataOptions): GameDataImpl { return new GameDataImpl(options); }
