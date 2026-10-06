// src/world/build.ts: the level per resident set and the staged seam (ARCHITECTURE 3.6): zone groups under
// scene.world, colliders through core/greybox, every marker of the built zones through data.bindings by `mode`, the
// dressing empties of the zone GLBs (breakables with a hit volume), the instanced registry, and the visibility cells.
import * as THREE from 'three';
import { ColFlag, Layer } from '../core/contracts.ts';
import type {
  AssetBinding, AssetDef, AssetInstance, CheckpointId, ColliderHandle, DamageInfo, EntityRef, GameEvents, HitReceiver, HitResponse,
  HitResult, InstanceHandle, LayoutMarker, MarkerId, Placement, ResidentSet, SurfaceType, VisibilityCell, VisibilityCondition,
  VolumeHandle, ZoneId,
} from '../core/contracts.ts';
import { buildSolidColliders } from '../core/greybox.ts';
import { DEG2RAD } from '../core/math.ts';
import type { BuildApi, Placed, State } from './internals.ts';

type Step = () => Promise<void> | null;
/** one step of a build spread over world ticks: true when it is done (the next step runs on the next tick) */
type Slice = () => boolean;
interface Job { steps: Slice[]; at: number; resolve: () => void; promise: Promise<void> | null; swap: ResidentSet | null }
/** an asset request that failed during play is asked again this many ticks later (core has already retried three times) */
const RETRY_TICKS = 180;
/** a spread build waits at most this many ticks for a rendered frame before it runs its next slice anyway */
const GATE_TICKS = 30;
/**
 * A build in play that waits on files (the hatch that stays shut, the lift that rides on in the dark) says so: one
 * plain line through the caption channel after this long, again every NOTICE_EVERY seconds until the files have come
 * (polish round 3: a hatch that stayed shut read as a broken puzzle). With no line of its own in story.json
 * (`system.waiting`, asked of integration) the line is core's `system.load_failed`, and it is shown only once a
 * request has failed or the wait has passed NOTICE_SLOW seconds: a slow download is not a failed one.
 */
const NOTICE_AFTER = 3, NOTICE_SLOW = 10, NOTICE_EVERY = 5, NOTICE_HOLD = 4.5;
/** extra builds of the first static collider set of a page, to warm the BVH builder (see rebuildColliders) */
const BVH_WARM_BUILDS = 2;
/** what index.ts gives the build: the other files' attach / detach, called zone by zone */
export interface BuildHooks {
  attach(zone: ZoneId): void;
  detach(zone: ZoneId): void;
  /** the set of built zones changed (doors that join two zones look again at what is live) */
  changed(): void;
}

interface Inst { used: boolean; handle: InstanceHandle; zone: ZoneId; unit: string; shown: boolean; visible: boolean; x: number; y: number; z: number; rot: number; scale: number }
interface UnitGroup { zone: ZoneId; unit: string; group: THREE.Group }
interface Loose { zone: ZoneId; inst: AssetInstance }

const DRESSING = /^(inst|brk)_\d+$/;
const MAX_DRESS_BOXES = 24;
const MAX_BREAKABLES = 48;

class Breakable implements HitReceiver {
  id = '';
  asset = '';
  zone: ZoneId = 'the_lip';
  token = -1;
  volume: VolumeHandle = -1;
  box: ColliderHandle = -1;
  x = 0; y = 0; z = 0;
  broken = false;
  ref: EntityRef = { id: '', kind: 'breakable' };
  constructor(private readonly owner: Build) {}
  onHit(_hit: Readonly<HitResult>, _damage: Readonly<DamageInfo>, out: HitResponse): void {
    // any round breaks it; a line round goes on through
    out.outcome = 'broke'; out.stops = true; out.stopsLine = false; out.damageDealt = 0; out.healthLeft = 0;
    this.owner.breakIt(this, true);
  }
}

class Build implements BuildApi {
  private readonly zoneInstances = new Map<ZoneId, AssetInstance>();
  private readonly worldAssets = new Map<string, AssetInstance>();
  private readonly placedBy = new Map<MarkerId, Placed[]>();
  private readonly groups: UnitGroup[] = [];
  private readonly rideGroup = new THREE.Group();
  private readonly anchorGroup = new THREE.Group();
  private readonly anchors = new Map<MarkerId, THREE.Object3D>();
  private readonly insts: Inst[] = [];
  private readonly looseDressing: Loose[] = [];
  private readonly dressBoxes: { zone: ZoneId; box: ColliderHandle }[] = [];
  private readonly breakables: Breakable[] = [];
  private readonly brokenSet = new Set<string>();
  private readonly cageMarkers = new Set<MarkerId>();
  private readonly cageBoxes: { min: [number, number, number]; max: [number, number, number] }[] = [];
  private readonly rotors: { zone: ZoneId; node: THREE.Object3D }[] = [];
  private readonly markerCount: Record<string, number> = {};
  private pending: Promise<void> | null = null;
  /**
   * The build in progress during play (polish round 2: the swap on the stair, the staging when the hatch powers and
   * the swap in the proving lift each did all of their work, and a full warm-up frame, inside one tick: the only
   * hitches of the whole stage). During play the work is cut into slices, one per world tick: drop the old set, wait
   * for the new one's files, instance its zones, build (colliders, markers, hooks: one tick, because the director and
   * the enemies read them together), then compile the new programs one object per tick WITHOUT drawing, so the driver
   * compiles them off the frame. Under the step hook (`?test=1`) and behind a loading screen everything still
   * finishes in one tick (ARCHITECTURE 18).
   */
  private job: Job | null = null;
  private collidersAhead = '';
  private spreadOverride: boolean | null = null;
  /**
   * Polish round 3 (the hatch froze one frame for 93 to 231 ms): the loop runs several ticks in one frame whenever a
   * frame was slow, and a slice per TICK then put the zone, the colliders and the stage step into the same frame. A
   * slice is now run at most once per RENDERED frame (`frame` counts update() calls); a job never waits more than
   * GATE_TICKS ticks for a frame (a tab that draws nothing must not strand a half-built set). Off under the step hook,
   * where nothing is drawn unless asked (tests force it with setSpread(on, true)).
   */
  private bvhWarm = false;
  /** ticks the running job has waited on files, and whether a request for them has failed */
  private waitTicks = 0;
  private waitOn = false;
  private waitFailed = false;
  private readonly noticePayload: GameEvents['story/caption'] = { key: '', text: '', seconds: NOTICE_HOLD };
  private frame = 0;
  private sliceFrame = -1;
  private gateWait = 0;
  private gateOverride: boolean | null = null;
  private warmTarget: THREE.WebGLRenderTarget | null = null;
  private showEverything = false;
  private cellRef: VisibilityCell | null = null;
  private readonly units: string[] = [];
  private readonly P: Placement = { x: 0, y: 0, z: 0, rotYRad: 0, scale: 1 };
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly k = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly cellPayload: GameEvents['world/cell'] = { cell: '', zone: 'the_lip' };
  private readonly brokenPayload: GameEvents['breakable/broken'] = { x: 0, y: 0, z: 0, id: '', asset: '' };

  constructor(private readonly s: State, private readonly hooks: BuildHooks) {
    const { scene, data } = s.ctx;
    this.rideGroup.name = 'props:rides';
    this.anchorGroup.name = 'world_anchors';
    scene.dynamic.add(this.rideGroup, this.anchorGroup);
    for (const portal of data.layout.nav.portals) {
      for (const id of portal.cages) {
        this.cageMarkers.add(id);
        const m = data.layout.markers.find((x) => x.id === id);
        if (!m) continue;
        const [w, h, d] = portal.cageInterior;
        const half = Math.max(w, d) / 2;
        this.cageBoxes.push({ min: [m.pos[0] - half, m.pos[1] - 0.1, m.pos[2] - half], max: [m.pos[0] + half, m.pos[1] + h, m.pos[2] + half] });
      }
    }
  }

  get busy(): boolean { return this.pending !== null || this.job !== null; }
  /** the day-cell is lit and the gallery is not yet built beside the surface set: the hatch may not open on nothing */
  get seamPending(): boolean {
    const { s } = this;
    if (!s.flags.has('hatch_powered')) return false;
    const stage = s.ctx.data.manifest.stages.find((x) => x.id === 'seam');
    const zone = stage && stage.staged ? stage.staged.zone : null;
    return !!stage && !!zone && s.residentSet === stage.resident && s.staged !== zone;
  }
  /** builds are spread over ticks only while she is playing in real time (or when a test asks for it) */
  private get spread(): boolean {
    const on = this.spreadOverride ?? !this.s.ctx.flags.test;
    return on && this.s.ctx.state.current === 'playing';
  }
  setSpread(on: boolean | null, gate: boolean | null = null): void { this.spreadOverride = on; this.gateOverride = gate; }
  /** debug: the slice the spread build stands on, of how many ('' = no job) */
  jobState(): string { return this.job ? `${this.job.at}/${this.job.steps.length}${this.pending ? ' pending' : ''}` : this.pending ? 'pending' : ''; }

  // ---- the spread build -----------------------------------------------------------------------------
  private startJob(steps: Slice[], swap: ResidentSet | null = null): Promise<void> {
    this.cancelJob();
    const job: Job = { steps, at: 0, resolve: () => {}, promise: null, swap };
    job.promise = new Promise<void>((resolve) => { job.resolve = resolve; });
    this.job = job;
    return job.promise;
  }
  /** a restore, a quit or another build takes over: the job stops where it is (every slice leaves a consistent world) */
  private cancelJob(): void {
    const job = this.job;
    if (!job) return;
    this.job = null;
    job.resolve();
  }
  /** one slice per world tick, in any game state (a pause does not strand a half-built set) */
  tick(): void {
    const job = this.job;
    if (!job) { this.waitTicks = 0; this.waitOn = false; this.waitFailed = false; return; }
    if (this.waitOn) this.notice(); else this.waitTicks = 0;
    // one slice per rendered frame: the second and third tick of a slow frame add nothing to it
    if ((this.gateOverride ?? !this.s.ctx.flags.test) && this.sliceFrame === this.frame && ++this.gateWait < GATE_TICKS) return;
    this.sliceFrame = this.frame; this.gateWait = 0;
    const step = job.steps[job.at] as Slice;
    if (!step()) return;
    if (this.job !== job) return;                        // the slice itself replaced or cancelled the job
    if (++job.at < job.steps.length) return;
    this.job = null;
    this.disposeWarmTarget();
    job.resolve();
  }
  /**
   * Ask for something that may fail (files that will not come), again every RETRY_TICKS until it has come. Returns a
   * slice that is done when it has. Nothing else is touched while it waits: the world stays as it is.
   */
  private until(ask: () => Promise<void>, ready: (() => boolean) | null): Slice {
    let asked = false, failed = false, came = false, wait = 0;
    const done = (): boolean => (ready ? ready() : came);
    return () => {
      if (done()) { this.waitOn = false; return true; }
      this.waitOn = true;
      if (failed) { if (--wait > 0) return false; failed = false; asked = false; }
      if (!asked) {
        asked = true;
        ask().then(() => { came = true; }, (err: unknown) => {
          failed = true; wait = RETRY_TICKS; this.waitFailed = true;
          console.warn(`[world] build: ${err instanceof Error ? err.message : String(err)}; asking again in ${Math.round(RETRY_TICKS / 60)} s`);
        });
      }
      if (done()) { this.waitOn = false; return true; }
      return false;
    };
  }
  /** she is waiting on files: tell her, plainly, and again while it lasts */
  private notice(): void {
    const { s } = this;
    const t = this.waitTicks++;
    const system = (s.ctx.data.story as unknown as { system?: Record<string, string> }).system;
    const own = system ? system.waiting : undefined;
    const after = Math.round((own !== undefined || this.waitFailed ? NOTICE_AFTER : NOTICE_SLOW) * 60);
    if (t < after || (t - after) % Math.round(NOTICE_EVERY * 60) !== 0) return;
    const text = own ?? (system ? system.load_failed : undefined);
    if (!text || s.ctx.state.current !== 'playing') return;
    this.noticePayload.text = text;
    s.ctx.events.emit('story/caption', this.noticePayload);
  }
  /**
   * Compile the programs an object's materials need, without drawing it. The program a material gets depends on what
   * the renderer is drawing into (a render target: linear output, no tone map; the canvas on the `min` tier: both
   * inlined), so the compile runs under the same kind of target as render's own frames (three r186 WebGLPrograms).
   */
  private precompile(object: THREE.Object3D): void {
    const { render, scene, quality } = this.s.ctx;
    const r = render.renderer;
    const prev = r.getRenderTarget();
    let target: THREE.WebGLRenderTarget | null = null;
    if (quality.features.composer) {
      if (!this.warmTarget) this.warmTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
      target = this.warmTarget;
    }
    try {
      r.setRenderTarget(target);
      // compile() creates the programs and hands them to the driver; three asks for their link status only on first use,
      // so where the driver compiles in parallel (KHR_parallel_shader_compile) nothing on this thread waits for it
      r.compile(object, scene.camera, scene.scene);
    } catch (err) {
      console.warn(`[world] build: precompile of '${object.name}' failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      r.setRenderTarget(prev);
    }
  }
  private disposeWarmTarget(): void {
    if (this.warmTarget) { this.warmTarget.dispose(); this.warmTarget = null; }
  }
  /** slices that compile, one object per tick, the zones just built and the templates of the assets that came with them */
  private warmSlices(zones: readonly ZoneId[], ids: readonly string[]): Slice[] {
    const { assets } = this.s.ctx;
    const out: Slice[] = [];
    for (const z of zones) out.push(() => { const inst = this.zoneInstances.get(z); if (inst) this.precompile(inst.root); return true; });
    for (const id of ids) out.push(() => { if (assets.isActive(id) && this.s.ctx.data.manifest.assets[id]) this.precompile(assets.get(id).scene); return true; });
    return out;
  }
  isBuilt(zone: ZoneId): boolean { return this.s.builtZones.includes(zone); }
  markerLive(m: LayoutMarker): boolean {
    if (this.s.builtZones.includes(m.zone)) return true;
    const sets = m.params.sets;
    return Array.isArray(sets) && sets.includes(this.s.residentSet);
  }

  // ---- sets, chains ---------------------------------------------------------------------------------
  private zonesOf(set: ResidentSet): ZoneId[] {
    return this.s.ctx.data.layout.zones.filter((z) => z.set === set).map((z) => z.id);
  }
  private envOf(zone: ZoneId): string { return this.s.ctx.data.manifest.zones[zone].env; }
  private setActive(set: ResidentSet): boolean {
    const { assets, data } = this.s.ctx;
    for (const id of data.manifest.sets[set].assets ?? []) if (!assets.isActive(id)) return false;
    for (const id of data.manifest.sets[set].textures) if (!assets.isActive(id)) return false;
    return true;
  }
  /** Run steps in order, synchronously for as long as they finish synchronously (test mode: always; ARCHITECTURE 18). */
  private chain(steps: Step[], from = 0): Promise<void> | null {
    for (let i = from; i < steps.length; i++) {
      const p = (steps[i] as Step)();
      if (p) return p.then(() => this.chain(steps, i + 1) ?? undefined);
    }
    return null;
  }
  track(p: Promise<void> | null): Promise<void> {
    if (!p) return Promise.resolve();
    const done = p.then(() => { if (this.pending === done) this.pending = null; });
    this.pending = done;
    return done;
  }

  // ---- zone groups ----------------------------------------------------------------------------------
  private addZone(zone: ZoneId): void {
    if (this.zoneInstances.has(zone)) return;
    const inst = this.s.ctx.assets.instantiate(this.envOf(zone));
    inst.root.name = zone;                              // SceneRoots.world: one child group per zone, named by ZoneId
    inst.root.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    inst.root.updateMatrixWorld(true);
    this.s.ctx.scene.world.add(inst.root);
    this.zoneInstances.set(zone, inst);
  }
  private groupOf(zone: ZoneId, unit: string): THREE.Group {
    for (let i = 0; i < this.groups.length; i++) { const g = this.groups[i] as UnitGroup; if (g.zone === zone && g.unit === unit) return g.group; }
    const group = new THREE.Group();
    group.name = 'props:' + zone + (unit ? ':' + unit : '');
    this.s.ctx.scene.dynamic.add(group);
    this.groups.push({ zone, unit, group });
    return group;
  }
  /** The chunk a point stands in (the low part first: a skyline chunk shares its zone's whole box). '' = none. */
  private unitAt(zone: ZoneId, x: number, y: number, z: number): string {
    const m = this.s.ctx.data.manifest;
    let high = '';
    for (const id of m.zones[zone].chunks) {
      const u = m.visibility.units[id];
      if (!u || !u.box) continue;
      const b = u.box;
      if (x < b.min[0] || x > b.max[0] || y < b.min[1] - 0.5 || y > b.max[1] + 0.5 || z < b.min[2] || z > b.max[2]) continue;
      if (u.part === 'high') { if (!high) high = id; continue; }
      return id;
    }
    return high;
  }

  // ---- markers --------------------------------------------------------------------------------------
  /** the built zone a marker's instances belong to: its own, or (a door that joins two zones) the first built one it connects */
  private homeOf(m: LayoutMarker): ZoneId | null {
    if (this.s.builtZones.includes(m.zone)) return m.zone;
    const connects = m.params.connects;
    if (m.type === 'door' && Array.isArray(connects)) for (const z of connects as ZoneId[]) if (this.s.builtZones.includes(z)) return z;
    return null;
  }
  private place(m: LayoutMarker, home: ZoneId): void {
    const { data, assets } = this.s.ctx;
    const bindings = data.bindings(m);
    if (bindings.length === 0) return;
    let list = this.placedBy.get(m.id);
    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i] as AssetBinding;
      if (b.mode !== 'instance' && b.mode !== 'variant') continue;
      if (list && list.some((p) => p.binding === b)) continue;
      if (!assets.isActive(b.asset)) continue;                     // not in this stage: placed when its set is (top-up)
      const def = data.manifest.assets[b.asset] as AssetDef;
      if (!list) { list = []; this.placedBy.set(m.id, list); }
      const node = b.node ?? '';
      if (b.per === 'seats') {
        const seats = m.params.seats as { pos: [number, number, number]; rotY: number }[] | undefined;
        for (const seat of seats ?? []) {
          const rot = seat.rotY * DEG2RAD + Math.PI, scale = b.scale ?? 1;
          const token = this.instAdd(home, b.asset, node, seat.pos[0], seat.pos[1], seat.pos[2], rot, scale);
          list.push({ marker: m, binding: b, zone: home, unit: '', inst: null, token, x: seat.pos[0], y: seat.pos[1], z: seat.pos[2], rot, scale });
        }
        continue;
      }
      const p = data.placement(m, b, this.P);
      if (def.instanced) {
        const token = this.instAdd(home, b.asset, node, p.x, p.y, p.z, p.rotYRad, p.scale);
        list.push({ marker: m, binding: b, zone: home, unit: '', inst: null, token, x: p.x, y: p.y, z: p.z, rot: p.rotYRad, scale: p.scale });
        continue;
      }
      const inst = assets.instantiate(b.asset);
      inst.root.name = m.id;
      inst.root.position.set(p.x, p.y, p.z);
      inst.root.rotation.set(0, p.rotYRad, 0);
      inst.root.scale.setScalar(p.scale);
      if (b.mode === 'variant') {
        for (const name of def.nodes) { const n = inst.node(name); if ((n as THREE.Mesh).isMesh) n.visible = name === b.node; }
      }
      const moves = inst.mixer !== null || (def.codeDriven !== undefined && def.codeDriven.length > 0) || def.skinned;
      inst.root.updateMatrix();
      if (!moves) inst.root.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
      else inst.root.matrixAutoUpdate = false;
      const unit = b.space === 'world' ? this.unitAt(home, m.pos[0], m.pos[1], m.pos[2]) : this.unitAt(home, p.x, p.y, p.z);
      (this.cageMarkers.has(m.id) ? this.rideGroup : this.groupOf(home, unit)).add(inst.root);
      inst.root.updateMatrixWorld(true);
      list.push({ marker: m, binding: b, zone: home, unit, inst, token: -1, x: p.x, y: p.y, z: p.z, rot: p.rotYRad, scale: p.scale });
    }
  }
  /** Every marker that belongs to a built zone and is not placed yet (idempotent: also the top-up after a swap). */
  private placeMarkers(): void {
    const { data } = this.s.ctx;
    const counts = this.markerCount;
    for (const k of Object.keys(counts)) delete counts[k];
    for (const m of data.layout.markers) {
      const home = this.homeOf(m);
      if (!home) continue;
      counts[home] = (counts[home] ?? 0) + 1;
      this.place(m, home);
    }
  }

  // ---- dressing empties -----------------------------------------------------------------------------
  private inCage(x: number, y: number, z: number): boolean {
    for (const b of this.cageBoxes) if (x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2]) return true;
    return false;
  }
  private dress(zone: ZoneId): void {
    const { data, assets, collision } = this.s.ctx;
    const zoneInst = this.zoneInstances.get(zone);
    if (!zoneInst) return;
    const root = zoneInst.root;
    for (let i = 0; i < root.children.length; i++) {
      const o = root.children[i] as THREE.Object3D;
      const name = typeof o.userData.name === 'string' ? (o.userData.name as string) : o.name;
      if (!DRESSING.test(name)) continue;
      const asset = o.userData.asset;
      if (typeof asset !== 'string') continue;
      const def = data.manifest.assets[asset];
      if (!def || !assets.isActive(asset)) continue;
      const node = typeof o.userData.node === 'string' ? (o.userData.node as string) : '';
      o.updateWorldMatrix(true, false);
      o.matrixWorld.decompose(this.v, this.q, this.k);
      const x = this.v.x, y = this.v.y, z = this.v.z, scale = this.k.x;
      const rot = this.e.setFromQuaternion(this.q, 'YXZ').y;
      const id = zone + ':' + name;
      const breakable = name.startsWith('brk_');
      let token = -1;
      if (def.instanced) token = this.instAdd(zone, asset, node, x, y, z, rot, scale);
      else {
        const inst = assets.instantiate(asset);
        inst.root.name = id;
        inst.root.position.set(x, y, z); inst.root.rotation.set(0, rot, 0); inst.root.scale.setScalar(scale);
        inst.root.traverse((c) => { c.matrixAutoUpdate = false; c.updateMatrix(); });
        this.groupOf(zone, this.unitAt(zone, x, y, z)).add(inst.root);
        inst.root.updateMatrixWorld(true);
        this.looseDressing.push({ zone, inst });
      }
      // the box of the placeholder is the collider and the hit volume (final art is held to it by check-glb)
      const size = def.placeholder.size, anchor = def.placeholder.anchor;
      const hx = size[0] * scale / 2, hy = size[1] * scale / 2, hz = size[2] * scale / 2;
      const cy = anchor === 'top' ? y - hy : anchor === 'centre' ? y : y + hy;
      let box: ColliderHandle = -1;
      // nothing may stand in a lift cage: a ride puts her wherever she stood in the other one (docs/requests/code-world.md)
      if (def.collision === 'box' && this.dressBoxes.length < MAX_DRESS_BOXES && !this.inCage(x, cy, z) && !this.brokenSet.has(id)) {
        box = collision.addBox(x, cy, z, hx, hy, hz, rot, 'wood', ColFlag.LOW, null);
        this.dressBoxes.push({ zone, box });
      }
      if (!breakable || this.breakables.length >= MAX_BREAKABLES) continue;
      const b = new Breakable(this);
      b.id = id; b.asset = asset; b.zone = zone; b.token = token; b.box = box; b.x = x; b.y = cy; b.z = z;
      b.ref = { id, kind: 'breakable' };
      b.volume = collision.addVolume({ shape: 'sphere', layer: Layer.SHOOTABLE, flags: 0, surface: 'ceramic', entity: b.ref, part: 'whole', priority: 0, receiver: b });
      collision.setSphere(b.volume, x, cy, z, Math.max(0.12, Math.min(0.6, Math.max(hx, hy, hz))));
      this.breakables.push(b);
      if (this.brokenSet.has(id)) this.breakIt(b, false);
    }
  }
  breakIt(b: Breakable, announce: boolean): void {
    if (b.broken) return;
    b.broken = true;
    const col = this.s.ctx.collision;
    col.setVolumeEnabled(b.volume, false);
    if (b.box >= 0) col.setBoxEnabled(b.box, false);
    if (b.token >= 0) this.instShow(b.token, false);
    this.brokenSet.add(b.id);
    if (!announce) return;
    const p = this.brokenPayload;
    p.id = b.id; p.asset = b.asset; p.x = b.x; p.y = b.y; p.z = b.z;
    this.s.ctx.events.emit('breakable/broken', p);
    this.s.director.onBreakable(b.x, b.y, b.z);
  }
  brokenIds(out: string[]): void { for (const id of this.brokenSet) out.push(id); out.sort(); }
  applyBroken(ids: readonly string[]): void {
    const col = this.s.ctx.collision;
    this.brokenSet.clear();
    for (const id of ids) this.brokenSet.add(id);
    for (const b of this.breakables) {
      const want = this.brokenSet.has(b.id);
      if (want === b.broken) continue;
      b.broken = want;
      col.setVolumeEnabled(b.volume, !want);
      if (b.box >= 0) col.setBoxEnabled(b.box, !want);
      if (b.token >= 0) this.instShow(b.token, !want);
    }
  }

  // ---- teardown -------------------------------------------------------------------------------------
  private removeZones(drop: (zone: ZoneId) => boolean): void {
    const { s } = this;
    const col = s.ctx.collision;
    const gone: ZoneId[] = [];
    for (const z of s.builtZones) if (drop(z)) gone.push(z);
    for (const [zone] of this.zoneInstances) if (drop(zone) && !gone.includes(zone)) gone.push(zone);
    for (const zone of gone) if (s.builtZones.includes(zone)) this.hooks.detach(zone);
    for (const zone of gone) {
      for (const [id, list] of this.placedBy) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i] as Placed;
          if (p.zone !== zone) continue;
          if (p.inst) { s.forgetClips(p.inst); p.inst.release(); }
          if (p.token >= 0) this.instRemove(p.token);
          list.splice(i, 1);
        }
        if (list.length === 0) this.placedBy.delete(id);
      }
      for (let i = this.looseDressing.length - 1; i >= 0; i--) {
        const l = this.looseDressing[i] as Loose;
        if (l.zone === zone) { l.inst.release(); this.looseDressing.splice(i, 1); }
      }
      for (let i = this.dressBoxes.length - 1; i >= 0; i--) {
        const d = this.dressBoxes[i] as { zone: ZoneId; box: ColliderHandle };
        if (d.zone === zone) { col.removeBox(d.box); this.dressBoxes.splice(i, 1); }
      }
      for (let i = this.breakables.length - 1; i >= 0; i--) {
        const b = this.breakables[i] as Breakable;
        if (b.zone === zone) { col.removeVolume(b.volume); this.breakables.splice(i, 1); }
      }
      for (let i = this.insts.length - 1; i >= 0; i--) { const r = this.insts[i] as Inst; if (r.used && r.zone === zone) this.instRemove(i); }
      for (let i = this.rotors.length - 1; i >= 0; i--) if ((this.rotors[i] as { zone: ZoneId }).zone === zone) this.rotors.splice(i, 1);
      for (let i = this.groups.length - 1; i >= 0; i--) {
        const g = this.groups[i] as UnitGroup;
        if (g.zone === zone) { g.group.removeFromParent(); this.groups.splice(i, 1); }
      }
      const inst = this.zoneInstances.get(zone);
      if (inst) { inst.release(); this.zoneInstances.delete(zone); }
    }
    s.builtZones = s.builtZones.filter((z) => !drop(z));
    if (s.staged && drop(s.staged)) s.staged = null;
  }

  /** Chunkless world-space assets of the resident set (backdrops, the town card): units of their own, added at identity. */
  private syncWorldAssets(): void {
    const { assets, data, scene } = this.s.ctx;
    const want = new Set<string>();
    for (const id of data.manifest.sets[this.s.residentSet].assets ?? []) {
      const def = data.manifest.assets[id];
      if (def && def.placedBy === 'origin' && !def.chunks && data.manifest.visibility.units[id]) want.add(id);
    }
    for (const [id, inst] of this.worldAssets) if (!want.has(id)) { inst.release(); this.worldAssets.delete(id); }
    for (const id of want) {
      if (this.worldAssets.has(id) || !assets.isActive(id)) continue;
      const inst = assets.instantiate(id);
      inst.root.name = id;
      inst.root.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
      inst.root.updateMatrixWorld(true);
      scene.world.add(inst.root);
      this.worldAssets.set(id, inst);
    }
  }

  // ---- colliders ------------------------------------------------------------------------------------
  /** A sculpted `collider_terrain` mesh in final art replaces the zone's solids of role `terrain` (ARCHITECTURE 6). */
  private terrainOf(zone: ZoneId): { positions: number[]; surface: SurfaceType; flags: number } | null {
    const env = this.envOf(zone);
    const def = this.s.ctx.data.manifest.assets[env];
    if (!def || def.collision !== 'mesh' || !this.s.ctx.assets.isActive(env)) return null;
    const loaded = this.s.ctx.assets.get(env);
    if (loaded.isPlaceholder) return null;
    let found: THREE.Mesh | null = null;
    loaded.scene.traverse((o) => { if ((o.name === 'collider_terrain' || o.userData.name === 'collider_terrain') && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh; });
    const mesh = found as THREE.Mesh | null;
    if (!mesh) return null;
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
    const out: number[] = [];
    const v = new THREE.Vector3();
    const n = index ? index.count : pos.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
    if (out.length < 9) return null;
    return { positions: out, surface: 'sand', flags: 0 };
  }
  /**
   * The static colliders of `zones` (default: the built ones). The spread build makes them a tick ahead of the rest
   * (`ahead`): the BVH is the largest single piece of a build, and solids standing a tick early under a shut hatch
   * hold nobody up. buildNow / stageNow then find them made and do not make them again.
   */
  private rebuildColliders(zones: readonly ZoneId[] = this.s.builtZones, ahead = false): void {
    const { s } = this;
    // Polish round 3: the solids of the zone the seam stages (the gallery under the Tally House) stand from the moment
    // the surface set is built, behind the loading screen. Staging it when the hatch powers then rebuilds nothing: that
    // one synchronous BVH build of surface + gallery (24 to 42 ms measured, 27 to 55 ms a tick) was the freeze on the
    // Daylight puzzle's payoff. Nobody can stand in those solids before the hatch opens, and it opens only once staged.
    const seam = this.seamZone();
    let early = false;
    if (seam && !zones.includes(seam)) { zones = zones.concat(seam); early = true; }
    const key = s.residentSet + ':' + zones.join(',');
    if (this.collidersAhead === key) { if (!ahead) this.collidersAhead = ''; return; }
    this.collidersAhead = ahead || early ? key : '';
    const skip: ZoneId[] = [];
    const extra: { positions: number[]; surface: SurfaceType; flags: number }[] = [];
    for (const z of zones) { const t = this.terrainOf(z); if (t) { skip.push(z); extra.push(t); } }
    const c = buildSolidColliders(s.ctx.data.layout, zones as ZoneId[], s.residentSet, { skipTerrainZones: skip, extra });
    s.ctx.collision.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds);
    // The BVH builder is cold code the first times it runs: measured in the real loop, the underground set's small
    // static set cost 20 to 22 ms on the peg stair as the second build of the page, and 2.4 ms as the third. So the
    // first build of a page (behind the loading screen, never in play, never under the step hook) is made three times:
    // the stair's and the lift's builds in play then run warm.
    if (!this.bvhWarm && !s.ctx.flags.test && s.ctx.state.current !== 'playing') {
      this.bvhWarm = true;
      for (let i = 0; i < BVH_WARM_BUILDS; i++) s.ctx.collision.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds);
    }
    for (const solid of s.ctx.data.layout.solids) {
      if (solid.dynamic && c.solidIds.includes(solid.id)) s.ctx.collision.setSolidEnabled(solid.id, s.flags.has('enabled:' + solid.id));
    }
  }

  /** the zone the seam stage builds beside the resident set, while that set is the resident one ('' otherwise) */
  private seamZone(): ZoneId | '' {
    const stage = this.s.ctx.data.manifest.stages.find((x) => x.id === 'seam');
    return stage && stage.staged && this.s.residentSet === stage.resident ? stage.staged.zone : '';
  }

  /**
   * The wall diagrams of the lift head (the hall's, the antechamber's) are lamp sets of their zone GLB: six in a ring lit
   * and the seventh, hung apart, dark (GDD 9.6: "six in a ring, one hung apart").
   */
  private lightDiagrams(zone: ZoneId): void {
    const def = this.s.ctx.data.manifest.assets[this.envOf(zone)];
    for (const [name, count] of Object.entries(def?.lampSets ?? {})) {
      if (!name.includes('diagram')) continue;
      const node = this.zoneNode(zone, name);
      if (node) this.s.ctx.render.lamps.setMask(node, count >= 7 ? 0x3f : (1 << count) - 1);
    }
  }
  /** zone nodes code drives: the wind-pump rotor (a `zoneNode` prop binding) */
  private findRotors(zone: ZoneId): void {
    const { data } = this.s.ctx;
    for (const m of data.markersInZone(zone)) {
      if (m.type !== 'prop') continue;
      for (const b of data.bindings(m)) {
        if (b.mode !== 'zoneNode' || !b.node || b.index !== undefined) continue;
        const def = data.manifest.assets[b.asset];
        if (!def || !def.codeDriven || !def.codeDriven.includes(b.node)) continue;
        const node = this.zoneNode(zone, b.node);
        if (node) this.rotors.push({ zone, node });
      }
    }
  }

  /** Make exactly this set's zones the built ones, now. The set's assets must be active. */
  private buildNow(set: ResidentSet): void {
    const { s } = this;
    const target = this.zonesOf(set);
    s.residentSet = set;
    this.removeZones((z) => !target.includes(z));
    const fresh: ZoneId[] = [];
    // (a zone the spread build instanced ahead of this tick is fresh too: it is not built until it is in builtZones)
    for (const z of target) { if (!this.zoneInstances.has(z) || !s.builtZones.includes(z)) fresh.push(z); this.addZone(z); }
    s.builtZones = target;
    s.staged = null;
    this.syncWorldAssets();
    this.rebuildColliders();
    this.placeMarkers();
    for (const z of fresh) { this.dress(z); this.findRotors(z); this.lightDiagrams(z); }
    for (const z of fresh) this.hooks.attach(z);
    this.hooks.changed();
    s.visDirty = true;
    // the zone she is in follows the resident set from this tick on (the stair is the_gallery once the swap has run)
    s.placed(1);
    s.ctx.events.emit('world/built', { set, zones: s.builtZones.length });
  }

  buildSet(set: ResidentSet): Promise<void> {
    this.cancelJob();
    return this.track(this.chain([
      () => (this.setActive(set) ? null : this.s.ctx.assets.prefetch(set).then(() => this.s.ctx.assets.activate(set))),
      () => { this.buildNow(set); return null; },
    ]));
  }

  stageZone(zone: ZoneId): Promise<void> {
    const { s } = this;
    if (s.builtZones.includes(zone)) return Promise.resolve();
    if (!s.ctx.assets.isActive(this.envOf(zone))) return Promise.reject(new Error(`stageZone('${zone}'): its assets are not active`));
    this.stageNow(zone);
    return Promise.resolve();
  }
  private stageNow(zone: ZoneId): void {
    const { s } = this;
    this.addZone(zone);
    s.builtZones = s.builtZones.concat(zone);
    s.staged = zone;
    this.rebuildColliders();
    this.placeMarkers();
    this.dress(zone);
    this.findRotors(zone);
    this.lightDiagrams(zone);
    this.hooks.attach(zone);
    this.hooks.changed();
    s.visDirty = true;
    s.ctx.events.emit('world/staged', { zone, staged: true });
    s.ctx.events.emit('world/built', { set: s.residentSet, zones: s.builtZones.length });
  }

  /** The `seam` stage: the gallery's assets beside the surface set, then the gallery built beside it (3.6). */
  /**
   * `inPlay`: asked by the day-cell lighting while she plays (it may be spread over ticks). A restore, a warp or a
   * resume asks without it and is never spread: the flow that awaits it runs no tick until it has resolved.
   */
  enterSeam(inPlay = false): Promise<void> | null {
    const { s } = this;
    const { assets, data } = s.ctx;
    const stage = data.manifest.stages.find((x) => x.id === 'seam');
    const zone = stage && stage.staged ? stage.staged.zone : null;
    if (!stage || !zone || s.residentSet !== stage.resident || s.staged === zone) return null;
    const ids = stage.staged ? stage.staged.assets.concat(stage.staged.textures) : [];
    const set = data.zone(zone).set;
    const still = (): boolean => s.residentSet === stage.resident && s.staged !== zone;
    if (inPlay && this.spread) {
      // during play: the files first (asked again until they come: the hatch stays shut meanwhile, `seamPending`), then
      // the zone instanced on one tick, built on the next, and its programs compiled a tick at a time
      void assets.prefetch(set).then(() => undefined, () => undefined);
      const staged = stage.staged ? stage.staged.assets : [];
      return this.startJob([
        this.until(() => assets.activate(set, ids), () => assets.isActive(this.envOf(zone)) && ids.every((id) => assets.isActive(id))),
        () => { if (still()) { this.addZone(zone); s.visDirty = true; } return true; },
        () => { if (still()) this.rebuildColliders(s.builtZones.concat(zone), true); return true; },
        () => { if (still()) this.stageNow(zone); return true; },
        ...this.warmSlices([zone], staged),
      ]);
    }
    this.cancelJob();
    void assets.prefetch(set).then(() => undefined, () => undefined);
    return this.chain([
      () => { const p = assets.activate(set, ids); return assets.isActive(this.envOf(zone)) ? null : p; },
      () => { if (still()) void this.stageZone(zone); return null; },
    ]);
  }
  leaveSeam(): void {
    const { s } = this;
    const zone = s.staged;
    this.cancelJob();
    if (!zone) return;
    this.removeZones((z) => z === zone);
    s.ctx.assets.release(s.ctx.data.zone(zone).set);
    this.rebuildColliders();
    this.placeMarkers();
    this.hooks.changed();
    s.visDirty = true;
    s.ctx.events.emit('world/staged', { zone, staged: false });
    s.ctx.events.emit('world/built', { set: s.residentSet, zones: s.builtZones.length });
  }

  private resident(set: ResidentSet): boolean {
    const { s } = this;
    // already resident and built (a staged zone beside it is the seam stage's business, not a swap)
    return s.residentSet === set && s.builtZones.length > 0 && this.zonesOf(set).every((z) => s.builtZones.includes(z));
  }
  /** the old set goes: its zones, its world-space assets, its claims (the stage's memory budget: never two sets' textures at once) */
  private dropFor(set: ResidentSet): void {
    const { s } = this;
    const prev = s.residentSet;
    const target = this.zonesOf(set);
    s.residentSet = set;                                // world.zone follows from this tick on
    this.removeZones((z) => !target.includes(z));
    for (const [id, inst] of this.worldAssets) { inst.release(); this.worldAssets.delete(id); }
    if (prev !== set) s.ctx.assets.release(prev);
    s.visDirty = true;
  }
  /**
   * Swap the resident set: the new set's files first (a download that fails leaves the old place whole: nothing has
   * been dropped yet), then drop the old zones and release the old set, activate and build the new one, warm up.
   */
  swapTo(set: ResidentSet): Promise<void> | null {
    const { s } = this;
    const { assets, render } = s.ctx;
    this.cancelJob();
    if (this.resident(set)) return null;
    return this.chain([
      // under the step hook every set is decoded at boot (ARCHITECTURE 18): nothing to wait for
      () => (s.ctx.flags.test ? null : assets.prefetch(set)),
      // finish in the same tick when everything is already decoded
      () => { this.dropFor(set); const p = assets.activate(set); return this.setActive(set) ? null : p; },
      () => { this.buildNow(set); void render.warmUp(); return null; },
    ]);
  }
  /**
   * The swap while she is playing (the stair, the proving lift), spread over ticks: see `job`. `onBuilt` runs on the
   * tick the new colliders are in (the lift moves her with them). With the step hook, or outside play, it is swapTo.
   */
  swapInPlay(set: ResidentSet, onBuilt: (() => void) | null): Promise<void> | null {
    const { s } = this;
    const { assets, data } = s.ctx;
    if (!this.spread) {
      const p = this.swapTo(set);
      if (!p) { if (onBuilt) onBuilt(); return null; }
      return p.then(() => { if (onBuilt) onBuilt(); });
    }
    if (this.resident(set)) { this.cancelJob(); if (onBuilt) onBuilt(); return null; }
    // asked again while the swap to this set is under way (she stands in the trigger): it goes on, it does not start over
    if (this.job && this.job.swap === set) return this.job.promise;
    const target = this.zonesOf(set);
    const fresh = target.filter((z) => !s.builtZones.includes(z));
    const before = new Set<string>();
    for (const id of data.manifest.sets[set].assets ?? []) if (assets.isActive(id)) before.add(id);
    const came = (data.manifest.sets[set].assets ?? []).filter((id) => !before.has(id));
    let dropped = false;
    return this.startJob([
      // 1 the files, asked again until they have come: until then the old set is whole and she can go on in it
      this.until(() => assets.prefetch(set), null),
      // 2 the old set goes, the new one is activated (core uploads one texture a frame while she plays)
      this.until(() => { if (!dropped) { dropped = true; this.dropFor(set); } return assets.activate(set); }, () => dropped && this.setActive(set)),
      // 3 the new zones' scene graphs, one a tick, not yet built (hidden by the visibility pass at the end of the tick)
      () => {
        for (const z of fresh) if (!this.zoneInstances.has(z)) { this.addZone(z); s.visDirty = true; return false; }
        return true;
      },
      // 4 the colliders a tick ahead, when nobody has to be moved with them (the stair: she stands in a zone both sets hold)
      () => { if (!onBuilt) this.rebuildColliders(target, true); return true; },
      // 5 markers, dressing, hooks: together (the director and the enemies read them as one), and in a lift she is moved
      //   on this tick, with the colliders
      () => { this.buildNow(set); if (onBuilt) onBuilt(); return true; },
      // 6 the new programs, an object a tick
      ...this.warmSlices(fresh, came),
    ], set);
  }

  ensureFor(checkpoint: CheckpointId, hatchPowered: boolean): Promise<void> | null {
    const { data } = this.s.ctx;
    const marker = data.marker(checkpoint);
    const set = marker ? data.zone(marker.zone).set : 'surface';
    const stage = data.manifest.stages.find((x) => x.id === 'seam');
    this.cancelJob();
    return this.chain([
      () => this.swapTo(set),
      () => {
        if (!stage || set !== stage.resident) return null;
        if (hatchPowered) return this.enterSeam();
        this.leaveSeam();
        return null;
      },
    ]);
  }

  // ---- lookups --------------------------------------------------------------------------------------
  placed(marker: MarkerId): readonly Placed[] { return this.placedBy.get(marker) ?? NONE; }
  private ownInstance(marker: MarkerId, asset?: string): AssetInstance | null {
    const list = this.placedBy.get(marker);
    if (!list) return null;
    for (let i = 0; i < list.length; i++) { const p = list[i] as Placed; if (p.inst && (asset === undefined || p.binding.asset === asset)) return p.inst; }
    return null;
  }
  instance(marker: MarkerId, asset?: string): AssetInstance | null {
    const own = this.ownInstance(marker, asset);
    if (own) return own;
    const m = this.markerOf(marker);
    if (!m) return null;
    for (const b of this.s.ctx.data.bindings(m)) {
      if (b.mode === 'partOf' && b.owner && (asset === undefined || b.asset === asset)) { const inst = this.ownInstance(b.owner, b.asset); if (inst) return inst; }
    }
    return null;
  }
  private markerOf(id: MarkerId): LayoutMarker | undefined { return this.s.ctx.data.layout.markers.find((m) => m.id === id); }
  node(marker: MarkerId, node: string): THREE.Object3D | null {
    const { data } = this.s.ctx;
    const list = this.placedBy.get(marker);
    if (list) {
      for (const p of list) if (p.inst && this.hasNode(p.binding.asset, node)) return p.inst.node(node);
    }
    const m = this.markerOf(marker);
    if (!m) return null;
    for (const b of data.bindings(m)) {
      if (b.mode === 'partOf' && b.owner && this.hasNode(b.asset, node)) { const inst = this.ownInstance(b.owner, b.asset); if (inst) return inst.node(node); }
      if (b.mode === 'zoneNode' && this.hasNode(b.asset, node)) {
        const zone = data.manifest.assets[b.asset]?.zone;
        if (zone) return this.zoneNode(zone, node);
      }
    }
    return null;
  }
  private hasNode(asset: string, node: string): boolean {
    const def = this.s.ctx.data.manifest.assets[asset];
    return def !== undefined && (def.nodes.includes(node) || (def.bones !== undefined && def.bones.includes(node)));
  }
  partNode(marker: MarkerId): THREE.Object3D | null {
    const m = this.markerOf(marker);
    if (!m) return null;
    for (const b of this.s.ctx.data.bindings(m)) {
      if (b.mode !== 'partOf' || !b.owner) continue;
      const inst = this.ownInstance(b.owner, b.asset);
      if (!inst) return null;
      inst.root.updateWorldMatrix(true, true);
      return b.node ? inst.node(b.node) : inst.root;
    }
    return null;
  }
  zoneNode(zone: ZoneId, node: string): THREE.Object3D | null {
    const inst = this.zoneInstances.get(zone);
    if (!inst || !this.hasNode(inst.id, node)) return null;
    return inst.node(node);
  }
  worldNode(asset: string, node: string): THREE.Object3D | null {
    const inst = this.worldAssets.get(asset);
    if (!inst || !this.hasNode(asset, node)) return null;
    return inst.node(node);
  }
  anchor(marker: MarkerId): THREE.Object3D {
    let o = this.anchors.get(marker);
    if (!o) {
      o = new THREE.Object3D();
      o.name = marker;
      const m = this.markerOf(marker);
      if (m) o.position.set(m.pos[0], m.pos[1], m.pos[2]);
      o.matrixAutoUpdate = false; o.updateMatrix();
      this.anchorGroup.add(o);
      o.updateMatrixWorld(true);
      this.anchors.set(marker, o);
    }
    return o;
  }

  // ---- instanced registry ---------------------------------------------------------------------------
  instAdd(zone: ZoneId, asset: string, node: string, x: number, y: number, z: number, rot: number, scale: number): number {
    const handle = this.s.ctx.render.instances.add(asset, node, x, y, z, rot, scale);
    let token = -1;
    for (let i = 0; i < this.insts.length; i++) if (!(this.insts[i] as Inst).used) { token = i; break; }
    if (token < 0) { token = this.insts.length; this.insts.push({ used: false, handle: -1, zone, unit: '', shown: true, visible: true, x: 0, y: 0, z: 0, rot: 0, scale: 1 }); }
    const r = this.insts[token] as Inst;
    r.used = true; r.handle = handle; r.zone = zone; r.unit = this.unitAt(zone, x, y, z); r.shown = true;
    r.x = x; r.y = y; r.z = z; r.rot = rot; r.scale = scale;
    r.visible = this.unitShown(zone, r.unit);
    if (!r.visible && handle >= 0) this.s.ctx.render.instances.setVisible(handle, false);
    return token;
  }
  instMove(token: number, x: number, y: number, z: number): void {
    const r = this.insts[token];
    if (!r || !r.used) return;
    r.x = x; r.y = y; r.z = z;
    if (r.handle >= 0) this.s.ctx.render.instances.setTransform(r.handle, x, y, z, r.rot, r.scale);
    if (r.handle >= 0 && !(r.visible && r.shown)) this.s.ctx.render.instances.setVisible(r.handle, false);
  }
  instShow(token: number, on: boolean): void {
    const r = this.insts[token];
    if (!r || !r.used || r.shown === on) return;
    r.shown = on;
    if (r.handle >= 0) this.s.ctx.render.instances.setVisible(r.handle, on && r.visible);
  }
  instRemove(token: number): void {
    const r = this.insts[token];
    if (!r || !r.used) return;
    if (r.handle >= 0) this.s.ctx.render.instances.remove(r.handle);
    r.used = false; r.handle = -1;
  }
  token(marker: MarkerId): number {
    const list = this.placedBy.get(marker);
    if (!list) return -1;
    for (let i = 0; i < list.length; i++) if ((list[i] as Placed).token >= 0) return (list[i] as Placed).token;
    return -1;
  }

  // ---- visibility -----------------------------------------------------------------------------------
  private unitShown(zone: ZoneId, unit: string): boolean {
    if (this.s.rideDark) return false;
    if (this.showEverything) return true;
    const render = this.s.ctx.render;
    return unit !== '' ? render.unitVisible(unit) : render.zoneVisible(zone);
  }
  private conditionHolds(c: VisibilityCondition): boolean {
    if (c.door !== undefined) {
      const closed = this.s.doors.state(c.door) === 'closed';
      return c.state === 'closed' ? closed : !closed;
    }
    if (c.flag !== undefined) return this.s.flags.has(c.flag) === (c.value ?? true);
    return true;
  }
  /** The visibility cell and the unit list (3.6 "Visibility"): the last step of every tick. */
  updateVisibility(): void {
    const { s } = this;
    const { ctx } = s;
    const p = ctx.player.position;
    // while she is outside every zone of the resident set (the stair between the hatch closing and the swap) the cell
    // stays what it was, as the zone does
    const cell = !s.zoneHeld || !this.cellRef ? ctx.data.cellAt(s.zone, p.x, p.y, p.z) : this.cellRef;
    const changed = cell !== this.cellRef;
    if (!changed && !s.visDirty) return;
    this.cellRef = cell;
    s.cell = cell.id;
    s.visDirty = false;
    const units = this.units;
    units.length = 0;
    if (this.showEverything) {
      for (const id of Object.keys(ctx.data.manifest.visibility.units)) units.push(id);
    } else if (!s.rideDark) {
      for (let i = 0; i < cell.show.length; i++) units.push(cell.show[i] as string);
      if (cell.showIf) {
        for (let i = 0; i < cell.showIf.length; i++) {
          const c = cell.showIf[i] as VisibilityCondition;
          if (!this.conditionHolds(c)) continue;
          for (let k = 0; k < c.units.length; k++) if (!units.includes(c.units[k] as string)) units.push(c.units[k] as string);
        }
      }
      const plugs = ctx.data.manifest.visibility.plugs;
      for (let i = 0; i < plugs.length; i++) {
        const plug = plugs[i] as (typeof plugs)[number];
        // integration (ruled with the art integrator): the plug is drawn WHENEVER the unit behind it is hidden, door shut
        // or not. The final door (prop_door_frontier) has gaps between its planks, and with the Tally House hidden the
        // shut door showed slits of bright sky from the yard. A black panel behind a shut door costs one draw call.
        if (!units.includes(plug.unit)) units.push(plug.node);
      }
    }
    ctx.render.setVisible(units);
    this.applyUnitVisibility();
    if (changed) {
      this.cellPayload.cell = cell.id; this.cellPayload.zone = s.zone;
      ctx.events.emit('world/cell', this.cellPayload);
    }
  }
  /** Runtime props stand in chunks: each is drawn while its chunk is (ARCHITECTURE 7.5). */
  private applyUnitVisibility(): void {
    const instances = this.s.ctx.render.instances;
    for (let i = 0; i < this.groups.length; i++) {
      const g = this.groups[i] as UnitGroup;
      g.group.visible = this.unitShown(g.zone, g.unit);
    }
    for (let i = 0; i < this.insts.length; i++) {
      const r = this.insts[i] as Inst;
      if (!r.used) continue;
      const vis = this.unitShown(r.zone, r.unit);
      if (vis === r.visible) continue;
      r.visible = vis;
      if (r.handle >= 0) instances.setVisible(r.handle, vis && r.shown);
    }
    // the lift cages: each with its zone, and in a ride's dark only what the rides file left visible
    if (!this.s.rideDark) {
      for (const id of this.cageMarkers) {
        const list = this.placedBy.get(id);
        if (!list) continue;
        for (const p of list) if (p.inst) p.inst.root.visible = this.unitShown(p.zone, this.unitAt(p.zone, p.x, p.y, p.z));
      }
    }
  }
  showAll(on: boolean): void { this.showEverything = on; this.s.visDirty = true; this.updateVisibility(); }

  /** per rendered frame: nodes code spins (the wind-pump rotor, 9 degrees a second) */
  update(): void {
    this.frame++;
    if (this.rotors.length === 0) return;
    const angle = this.s.ctx.clock.simTime * 9 * DEG2RAD;
    for (let i = 0; i < this.rotors.length; i++) {
      const r = this.rotors[i] as { zone: ZoneId; node: THREE.Object3D };
      if (!r.node.visible) continue;
      r.node.rotation.z = angle;
      r.node.updateMatrix();
      r.node.matrixWorldNeedsUpdate = true;
    }
  }

  counts(): Record<string, number> { return { ...this.markerCount }; }

  dispose(): void {
    this.cancelJob();
    this.disposeWarmTarget();
    this.removeZones(() => true);
    for (const [, inst] of this.worldAssets) inst.release();
    this.worldAssets.clear();
    this.rideGroup.removeFromParent();
    this.anchorGroup.removeFromParent();
  }
}
const NONE: readonly Placed[] = Object.freeze([]);

export function createBuild(s: State, hooks: BuildHooks): BuildApi { return new Build(s, hooks); }
