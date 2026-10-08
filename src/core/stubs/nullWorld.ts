// Core stub for the world slot, and the first real consumer of the seam rules (ARCHITECTURE 3.6): zones per resident
// set, the staged gallery, colliders, visibility cells, doors as boxes, the hatch, trg_hatch_close / trg_set_swap, the two
// rides as nav.portals teleports, checkpoints by proximity, begin / restore / warp. No puzzles, no story, no encounters:
// `debug.solvePuzzle` and `debug.clearEncounter` only apply what those things do to doors, flags and checkpoints.
import * as THREE from 'three';
import { ColFlag, PLAYER_HEIGHT, PLAYER_RADIUS } from '../contracts.ts';
import type {
  AssetInstance, BossPhase, CheckpointId, ColliderHandle, DebugSnapshot, DoorState, EncounterId, EncounterView, GameContext, GameEvents,
  LayoutMarker, MarkerId, MoodId, NavPortal, PickupKind, PuzzleId, PuzzleSave, PuzzleView, ResidentSet, RunStats, SaveData,
  StoryKey, SurfaceType, VisibilityCell, WorldDebug, WorldSave, WorldSystem, ZoneId,
} from '../contracts.ts';
import { SURFACE_TINT, buildSolidColliders } from '../greybox.ts';
import { DEG2RAD, RAD2DEG, round4 } from '../math.ts';

const PUZZLES: readonly PuzzleId[] = ['seven_jugs', 'daylight', 'proving_line', 'the_asking'];
const ENCOUNTERS: readonly EncounterId[] = ['enc_street', 'enc_yard', 'enc_tally', 'enc_file', 'enc_matador', 'enc_windlass'];
/** What solving a puzzle / clearing an encounter opens in the stub (the real rules are src/world's). */
const PUZZLE_OPENS: Readonly<Record<PuzzleId, readonly MarkerId[]>> = {
  seven_jugs: ['door_jug_gate'], daylight: [], proving_line: ['ia_baffle'], the_asking: ['door_bore'],
};
const ENCOUNTER_OPENS: Readonly<Record<EncounterId, readonly MarkerId[]>> = {
  enc_street: ['door_yard_gate'], enc_yard: ['ia_yard_door', 'door_alley', 'door_tally'], enc_tally: ['ia_hatch'],
  enc_file: ['door_gallery_far'], enc_matador: ['door_lift_cage'], enc_windlass: ['door_proving_lift'],
};
/** What has happened by the time each checkpoint is reached (warpToCheckpoint's "plausible state"). */
const PROGRESS: readonly { cp: CheckpointId; puzzles: readonly PuzzleId[]; encounters: readonly EncounterId[] }[] = [
  { cp: 'cp_lip_start', puzzles: [], encounters: [] },
  { cp: 'cp_lip_gate', puzzles: ['seven_jugs'], encounters: [] },
  { cp: 'cp_street_clear', puzzles: [], encounters: ['enc_street'] },
  { cp: 'cp_yard_clear', puzzles: [], encounters: ['enc_yard'] },
  { cp: 'cp_tally_enter', puzzles: [], encounters: [] },
  { cp: 'cp_tally_hatch', puzzles: ['daylight'], encounters: ['enc_tally'] },
  { cp: 'cp_gallery_bay', puzzles: [], encounters: [] },
  { cp: 'cp_gallery_baffle', puzzles: ['proving_line'], encounters: [] },
  { cp: 'cp_file_clear', puzzles: [], encounters: ['enc_file'] },
  { cp: 'cp_hall_gantry', puzzles: [], encounters: [] },
  { cp: 'cp_hall_clear', puzzles: [], encounters: ['enc_matador'] },
  { cp: 'cp_bore_ante', puzzles: [], encounters: [] },
  { cp: 'cp_boss_p1', puzzles: ['the_asking'], encounters: [] },
  { cp: 'cp_boss_p2', puzzles: [], encounters: [] },
  { cp: 'cp_boss_p3', puzzles: [], encounters: [] },
  { cp: 'cp_boss_proven', puzzles: [], encounters: [] },
  { cp: 'cp_rim', puzzles: [], encounters: ['enc_windlass'] },
];
const CHECKPOINT_RADIUS = 1.6;
/**
 * Checkpoints that are PLACES commit by proximity (layout `params.when`): the start, 'entering ...', 'foot of the
 * stair', 'the lift opens on the rim'. The others are things that happen: encounter and puzzle checkpoints commit
 * through clearEncounter / solvePuzzle, the four boss checkpoints (whose markers stand 0.5 m apart) on the boss's
 * own events.
 */
const PLACE_WHEN = /^(start$|entering |foot of the stair$|the lift opens on the rim$)/;
const PUZZLE_CHECKPOINT: Readonly<Partial<Record<PuzzleId, CheckpointId>>> = { seven_jugs: 'cp_lip_gate', proving_line: 'cp_gallery_baffle' };
const BOSS_PHASE_CHECKPOINT: Readonly<Partial<Record<BossPhase, CheckpointId>>> = { p1: 'cp_boss_p1', p2: 'cp_boss_p2', p3a: 'cp_boss_p3', proven: 'cp_boss_proven', p3b: 'cp_boss_proven' };
const INTERACT_RADIUS = 3.2;
const RIDE_DARK_TICKS = 60;
const HATCH = 'ia_hatch';

interface Door { marker: LayoutMarker; state: DoorState; box: ColliderHandle; hatch: boolean }
interface Ride { portal: NavPortal; ticks: number; total: number; teleported: boolean; swap: ResidentSet | null; building: boolean }
type Step = () => Promise<void> | null;

function emptyStats(): RunStats {
  return { playSeconds: 0, roundsFired: 0, roundsHit: 0, knotsBurst: 0, linesOfThree: 0, cleanSix: false, secrets: [], freed: 0, felled: 0, deaths: 0, tookStoneRound: false };
}
/** Is a point inside a marker volume (pos = centre of the bottom face, size before rotY)? */
function inVolume(m: LayoutMarker, x: number, y: number, z: number): boolean {
  const size = m.size;
  if (!size) return false;
  const dy = y - m.pos[1];
  if (dy < -0.01 || dy > size[1]) return false;
  const r = (m.rotY ?? 0) * DEG2RAD, c = Math.cos(r), s = Math.sin(r);
  const dx = x - m.pos[0], dz = z - m.pos[2];
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= size[0] / 2 && Math.abs(lz) <= size[2] / 2;
}

class NullWorld implements WorldSystem {
  readonly id = 'world' as const;
  zone: ZoneId = 'the_lip';
  cell = '';
  residentSet: ResidentSet = 'surface';
  builtZones: ZoneId[] = [];
  mood: MoodId = 'L1';
  objective: StoryKey = '';
  checkpoint: CheckpointId = 'cp_lip_start';
  stats: RunStats = emptyStats();
  readonly debug: WorldDebug;
  private staged: ZoneId | null = null;
  private readonly zoneInstances = new Map<ZoneId, AssetInstance>();
  private readonly worldAssets = new Map<string, AssetInstance>();
  private readonly doors = new Map<MarkerId, Door>();
  private readonly doorList: Door[] = [];
  /** every shut door as a greybox box (one instanced draw call): a closed door must not be an invisible collider */
  private doorMesh: THREE.InstancedMesh | null = null;
  private readonly flags = new Set<string>();
  private readonly solved = new Set<PuzzleId>();
  private readonly cleared = new Set<EncounterId>();
  private readonly checkpoints: LayoutMarker[];
  private readonly trgHatchClose: LayoutMarker | undefined;
  private readonly trgSetSwap: LayoutMarker | undefined;
  private ride: Ride | null = null;
  private pending: Promise<void> | null = null;
  private visDirty = true;
  private readonly units: string[] = [];
  private cellRef: VisibilityCell | null = null;
  private started = false;
  private readonly off: (() => void)[] = [];
  private readonly doorPayload: GameEvents['door/state'] = { id: '', state: 'closed', locked: false };
  private readonly cellPayload: GameEvents['world/cell'] = { cell: '', zone: 'the_lip' };
  private readonly zonePayload: GameEvents['zone/entered'] = { zone: 'the_lip', from: '', mood: 'L1' };
  private readonly reachedPayload: GameEvents['checkpoint/reached'] = { id: 'cp_lip_start' };
  private readonly ridePayload: GameEvents['ride/state'] = { id: 'ride_lift_hall', stage: 'started', seconds: 0 };

  constructor(private readonly ctx: GameContext) {
    const data = ctx.data;
    this.checkpoints = data.markersOfType('checkpoint').slice();
    this.trgHatchClose = data.layout.markers.find((m) => m.id === 'trg_hatch_close');
    this.trgSetSwap = data.layout.markers.find((m) => m.id === 'trg_set_swap');
    for (const m of data.markersOfType('door')) {
      const d: Door = { marker: m, state: 'closed', box: -1, hatch: m.params.kind === 'hatch' };
      this.doors.set(m.id, d);
      this.doorList.push(d);
    }
    this.objective = Object.keys(data.story.objectives)[0] ?? '';
    this.debug = {
      solvePuzzle: (id) => this.solvePuzzle(id, true),
      clearEncounter: (id) => this.clearEncounter(id, true),
      flags: () => Array.from(this.flags).sort(),
    };
  }

  // ---- lifecycle ----------------------------------------------------------------------------------
  init(): void {
    const { ctx } = this;
    this.off.push(ctx.events.on('enemy/freed', () => { this.stats.freed++; }));
    this.off.push(ctx.events.on('enemy/felled', () => { this.stats.felled++; }));
    this.off.push(ctx.events.on('player/died', () => { this.stats.deaths++; }));
    this.off.push(ctx.events.on('weapon/fired', () => { this.stats.roundsFired++; }));
    // the boss checkpoints are events, not places (see PLACE_WHEN)
    this.off.push(ctx.events.on('boss/phase', (e) => { const cp = BOSS_PHASE_CHECKPOINT[e.phase]; if (cp) this.reachBuilt(cp); }));
    this.off.push(ctx.events.on('boss/proven', () => { this.reachBuilt('cp_boss_proven'); }));
    ctx.debug.register('world', {
      setDoor: ((id: MarkerId, state: DoorState) => this.setDoor(id, state)) as (...args: never[]) => unknown,
      setFlag: ((name: string, on: boolean) => this.setFlag(name, on)) as (...args: never[]) => unknown,
      showAll: ((on: boolean) => { this.showAll = on; this.visDirty = true; this.updateVisibility(); }) as (...args: never[]) => unknown,
    });
  }
  private showAll = false;

  start(): void {
    // the title screen: world not begun, camera at player_start
    const m = this.ctx.data.marker('player_start');
    if (m) this.ctx.player.teleport(m.pos[0], m.pos[1], m.pos[2], m.rotY ?? 0, 0);
    this.started = true;
    this.updateZone(true);
    this.updateVisibility();
  }
  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    this.removeZones(() => true);
    for (const d of this.doorList) if (d.box >= 0) { this.ctx.collision.removeBox(d.box); d.box = -1; }
    if (this.doorMesh) { this.doorMesh.parent?.removeFromParent(); this.doorMesh.removeFromParent(); this.doorMesh.geometry.dispose(); (this.doorMesh.material as THREE.Material).dispose(); this.doorMesh.dispose(); this.doorMesh = null; }
  }

  get lamps(): number { return Math.min(48, 9 + this.stats.freed); }
  get lampsOf(): number { return Math.min(48, 9 + this.stats.freed + this.stats.felled); }

  // ---- building -----------------------------------------------------------------------------------
  private zonesOf(set: ResidentSet): ZoneId[] {
    return this.ctx.data.layout.zones.filter((z) => z.set === set).map((z) => z.id);
  }
  private envOf(zone: ZoneId): string { return (this.ctx.data.manifest.zones[zone] as { env: string }).env; }
  private setActive(set: ResidentSet): boolean {
    const { assets, data } = this.ctx;
    for (const id of data.manifest.sets[set].assets ?? []) if (!assets.isActive(id)) return false;
    for (const id of data.manifest.sets[set].textures) if (!assets.isActive(id)) return false;
    return true;
  }
  /** Run steps in order, synchronously for as long as they finish synchronously (test mode: always). */
  private chain(steps: Step[], from = 0): Promise<void> | null {
    for (let i = from; i < steps.length; i++) {
      const p = (steps[i] as Step)();
      if (p) return p.then(() => this.chain(steps, i + 1) ?? undefined);
    }
    return null;
  }
  private track(p: Promise<void> | null): Promise<void> {
    if (!p) return Promise.resolve();
    const done = p.then(() => { if (this.pending === done) this.pending = null; });
    this.pending = done;
    return done;
  }

  private addZone(zone: ZoneId): void {
    if (this.zoneInstances.has(zone)) return;
    const inst = this.ctx.assets.instantiate(this.envOf(zone));
    inst.root.name = zone;                              // SceneRoots.world: one child group per zone, named by ZoneId
    inst.root.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    inst.root.updateMatrixWorld(true);
    this.ctx.scene.world.add(inst.root);
    this.zoneInstances.set(zone, inst);
  }
  private removeZones(drop: (zone: ZoneId) => boolean): void {
    for (const [zone, inst] of this.zoneInstances) {
      if (!drop(zone)) continue;
      inst.release();
      this.zoneInstances.delete(zone);
    }
    this.builtZones = this.builtZones.filter((z) => !drop(z));
    if (this.staged && drop(this.staged)) this.staged = null;
  }
  /** Chunkless world-space assets of the resident set (backdrops, the town card): units of their own. */
  private syncWorldAssets(): void {
    const { assets, data, scene } = this.ctx;
    const want = new Set<string>();
    for (const id of data.manifest.sets[this.residentSet].assets ?? []) {
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
  /** A sculpted `collider_terrain` mesh in final art replaces the zone's solids of role `terrain` (ARCHITECTURE 6). */
  private terrainOf(zone: ZoneId): { positions: number[]; surface: SurfaceType; flags: number } | null {
    const env = this.envOf(zone);
    const def = this.ctx.data.manifest.assets[env];
    if (!def || def.collision !== 'mesh' || !this.ctx.assets.isActive(env)) return null;
    const loaded = this.ctx.assets.get(env);
    if (loaded.isPlaceholder) return null;
    let mesh: THREE.Mesh | null = null;
    loaded.scene.traverse((o) => { if ((o.name === 'collider_terrain' || o.userData.name === 'collider_terrain') && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    const found = mesh as THREE.Mesh | null;
    if (!found) return null;
    found.updateWorldMatrix(true, false);
    const pos = found.geometry.getAttribute('position'), index = found.geometry.getIndex();
    const out: number[] = [];
    const v = new THREE.Vector3();
    const n = index ? index.count : pos.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(found.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
    return { positions: out, surface: 'sand', flags: 0 };
  }
  private rebuildColliders(): void {
    const { ctx } = this;
    const skip: ZoneId[] = [];
    const extra: { positions: number[]; surface: SurfaceType; flags: number }[] = [];
    for (const z of this.builtZones) { const t = this.terrainOf(z); if (t) { skip.push(z); extra.push(t); } }
    const c = buildSolidColliders(ctx.data.layout, this.builtZones, this.residentSet, { skipTerrainZones: skip, extra });
    ctx.collision.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds);
    for (const s of ctx.data.layout.solids) {
      if (s.dynamic && c.solidIds.includes(s.id)) ctx.collision.setSolidEnabled(s.id, this.flags.has('enabled:' + s.id));
    }
    this.syncDoors();
  }
  private doorLive(d: Door): boolean {
    if (this.builtZones.includes(d.marker.zone)) return true;
    const connects = d.marker.params.connects;
    if (Array.isArray(connects)) for (const z of connects) if (this.builtZones.includes(z as ZoneId)) return true;
    return false;
  }
  private syncDoors(): void {
    const col = this.ctx.collision;
    for (const d of this.doorList) {
      const live = this.doorLive(d);
      if (!live) { if (d.box >= 0) { col.removeBox(d.box); d.box = -1; } continue; }
      if (d.box < 0) {
        const m = d.marker, size = m.size ?? [1.2, 2.2, 0.2];
        const flags = m.params.pierce === true ? ColFlag.PIERCE : 0;
        // doors: [width, height, thickness] with the sill at pos; the hatch: [x, thickness, z] with its bottom at pos
        d.box = col.addBox(m.pos[0], m.pos[1] + size[1] / 2, m.pos[2], size[0] / 2, size[1] / 2, size[2] / 2, (m.rotY ?? 0) * DEG2RAD,
          d.hatch ? 'metal' : 'wood', flags, { id: m.id, kind: 'door' });
      }
      col.setBoxEnabled(d.box, d.state === 'closed' || d.state === 'ajar' || d.state === 'closing');
    }
    this.drawDoors();
  }
  /**
   * One instance per door whose collider is live and enabled: the box of the collider itself, coloured by its surface
   * (lighter than a wall of that surface, with shaded faces, so it reads as a leaf). Named `stub_doors` in
   * scene.dynamic; a sandbox room hides it.
   */
  private drawDoors(): void {
    let mesh = this.doorMesh;
    if (!mesh) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const normal = geo.getAttribute('normal'), shade = new Float32Array(normal.count * 3);
      for (let i = 0; i < normal.count; i++) {
        const k = 0.7 + 0.3 * Math.max(0, normal.getY(i)) + 0.15 * Math.abs(normal.getZ(i));
        shade[i * 3] = k; shade[i * 3 + 1] = k; shade[i * 3 + 2] = k;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      mat.name = 'stub_door';
      mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.doorList.length));
      mesh.name = 'stub_doors_mesh';
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      const holder = new THREE.Group();                    // the holder's visibility is the sandbox's, the mesh's is ours
      holder.name = 'stub_doors';
      holder.add(mesh);
      this.ctx.scene.dynamic.add(holder);
      this.doorMesh = mesh;
    }
    const m4 = this.doorM4, q = this.doorQ, v = this.doorV, k = this.doorS, c = this.doorC;
    let n = 0;
    for (const d of this.doorList) {
      if (d.box < 0 || !(d.state === 'closed' || d.state === 'ajar' || d.state === 'closing')) continue;
      const m = d.marker, size = m.size ?? [1.2, 2.2, 0.2];
      q.setFromAxisAngle(this.doorUp, (m.rotY ?? 0) * DEG2RAD);
      m4.compose(v.set(m.pos[0], m.pos[1] + size[1] / 2, m.pos[2]), q, k.set(size[0], size[1], size[2]));
      mesh.setMatrixAt(n, m4);
      const tint = SURFACE_TINT[d.hatch ? 'metal' : 'wood'];
      const lift = d.hatch ? 2.2 : 1.3;                  // pale steel for the hatch, dark wood against the adobe for a door
      mesh.setColorAt(n, c.setRGB(tint[0] * lift, tint[1] * lift, tint[2] * lift));
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  private readonly doorM4 = new THREE.Matrix4();
  private readonly doorQ = new THREE.Quaternion();
  private readonly doorV = new THREE.Vector3();
  private readonly doorS = new THREE.Vector3();
  private readonly doorC = new THREE.Color();
  private readonly doorUp = new THREE.Vector3(0, 1, 0);

  /** Make exactly this set's zones the built ones, now. The set's assets must be active. */
  private buildNow(set: ResidentSet): void {
    const target = this.zonesOf(set);
    this.residentSet = set;
    this.removeZones((z) => !target.includes(z));
    for (const z of target) this.addZone(z);
    this.builtZones = target;
    this.staged = null;
    this.syncWorldAssets();
    this.rebuildColliders();
    this.visDirty = true;
    if (this.started) { this.updateZone(true); this.updateVisibility(); }
    this.ctx.events.emit('world/built', { set, zones: this.builtZones.length });
  }

  buildSet(set: ResidentSet): Promise<void> {
    return this.track(this.chain([
      () => (this.setActive(set) ? null : this.ctx.assets.prefetch(set).then(() => this.ctx.assets.activate(set))),
      () => { this.buildNow(set); return null; },
    ]));
  }

  stageZone(zone: ZoneId): Promise<void> {
    if (this.builtZones.includes(zone)) return Promise.resolve();
    if (!this.ctx.assets.isActive(this.envOf(zone))) return Promise.reject(new Error(`stageZone('${zone}'): its assets are not active`));
    this.addZone(zone);
    this.builtZones = this.builtZones.concat(zone);
    this.staged = zone;
    this.rebuildColliders();
    this.visDirty = true;
    this.ctx.events.emit('world/staged', { zone, staged: true });
    this.ctx.events.emit('world/built', { set: this.residentSet, zones: this.builtZones.length });
    return Promise.resolve();
  }

  /** The `seam` stage: the gallery's assets beside the surface set, then the gallery built beside it (3.6). */
  private enterSeam(): Promise<void> | null {
    if (this.residentSet !== 'surface' || this.staged === 'the_gallery') return null;
    const { assets, data } = this.ctx;
    const stage = data.manifest.stages.find((s) => s.id === 'seam');
    const ids = stage && stage.staged ? stage.staged.assets.concat(stage.staged.textures) : [this.envOf('the_gallery')];
    void assets.prefetch('underground');
    return this.chain([
      () => { const p = assets.activate('underground', ids); return assets.isActive(this.envOf('the_gallery')) ? null : p; },
      () => { void this.stageZone('the_gallery'); return null; },
    ]);
  }
  private leaveSeam(): void {
    if (this.staged !== 'the_gallery' || this.residentSet !== 'surface') return;
    this.removeZones((z) => z === 'the_gallery');
    this.ctx.assets.release('underground');
    this.rebuildColliders();
    this.visDirty = true;
    this.ctx.events.emit('world/staged', { zone: 'the_gallery', staged: false });
    this.ctx.events.emit('world/built', { set: this.residentSet, zones: this.builtZones.length });
  }

  /** Swap the resident set: drop the old zones, release the old set, activate and build the new one, warm up. */
  private swapTo(set: ResidentSet): Promise<void> | null {
    const { assets, render } = this.ctx;
    const prev = this.residentSet;
    // already resident and built (a staged zone beside it is the seam stage's business, not a swap)
    if (prev === set && this.builtZones.length > 0 && this.zonesOf(set).every((z) => this.builtZones.includes(z))) return null;
    const target = this.zonesOf(set);
    this.residentSet = set;                              // world.zone follows from this tick on
    this.removeZones((z) => !target.includes(z));
    for (const [id, inst] of this.worldAssets) { inst.release(); this.worldAssets.delete(id); }
    if (prev !== set) assets.release(prev);
    return this.chain([
      () => { const p = assets.activate(set); return this.setActive(set) ? null : p; },
      () => { this.buildNow(set); void render.warmUp(); return null; },
    ]);
  }
  /** The set a checkpoint needs, with the seam stage when the hatch is powered on the surface (3.6 rule 6). */
  private ensureFor(checkpoint: CheckpointId, hatchPowered: boolean): Promise<void> | null {
    const marker = this.ctx.data.marker(checkpoint);
    const set = marker ? this.ctx.data.zone(marker.zone).set : 'surface';
    return this.chain([
      () => this.swapTo(set),
      () => {
        if (set !== 'surface') return null;
        if (hatchPowered) return this.enterSeam();
        this.leaveSeam();
        return null;
      },
    ]);
  }

  // ---- doors, flags ---------------------------------------------------------------------------------
  doorState(id: MarkerId): DoorState { return this.doors.get(id)?.state ?? 'closed'; }
  flag(name: string): boolean { return this.flags.has(name); }
  private setFlag(name: string, on: boolean): void {
    if (on === this.flags.has(name)) return;
    if (on) this.flags.add(name); else this.flags.delete(name);
    this.visDirty = true;
  }
  private setDoor(id: MarkerId, state: DoorState, announce = true): void {
    const d = this.doors.get(id);
    if (!d || d.state === state) return;
    d.state = state;
    if (d.box >= 0) { this.ctx.collision.setBoxEnabled(d.box, state === 'closed' || state === 'ajar' || state === 'closing'); this.drawDoors(); }
    this.visDirty = true;
    if (announce) {
      this.doorPayload.id = id; this.doorPayload.state = state; this.doorPayload.locked = false;
      this.ctx.events.emit('door/state', this.doorPayload);
    }
  }

  private solvePuzzle(id: PuzzleId, announce: boolean): void {
    if (this.solved.has(id)) return;
    this.solved.add(id);
    for (const door of PUZZLE_OPENS[id]) this.setDoor(door, 'open', announce);
    if (id === 'daylight') {
      this.setFlag('cell_lit', true);
      this.setFlag('hatch_powered', true);
      if (announce) {
        this.ctx.events.emit('world/hatch_powered', {});
        this.track(this.enterSeam());
      }
    }
    if (!announce) return;
    this.ctx.events.emit('puzzle/solved', { puzzle: id, seconds: 0 });
    const cp = PUZZLE_CHECKPOINT[id];
    if (cp) this.reach(cp);
  }
  private clearEncounter(id: EncounterId, announce: boolean): void {
    if (this.cleared.has(id)) return;
    if (id === 'enc_tally' && !this.solved.has('daylight')) this.solvePuzzle('daylight', announce);   // the hatch needs power
    this.cleared.add(id);
    if (announce) this.ctx.enemies.clearEncounter(id);
    if (id === 'enc_windlass') this.setFlag('boss_dead', true);
    for (const door of ENCOUNTER_OPENS[id]) this.setDoor(door, 'open', announce);
    if (!announce) return;
    this.ctx.events.emit('encounter/cleared', { id, seconds: 0 });
    const cp = this.ctx.data.encounter(id).onClear.checkpoint;
    if (cp) this.reach(cp);
  }

  // ---- checkpoints ----------------------------------------------------------------------------------
  private indexOf(id: CheckpointId): number { return this.checkpoints.findIndex((m) => m.id === id); }
  private reach(id: CheckpointId): void {
    if (this.indexOf(id) <= this.indexOf(this.checkpoint)) return;       // each checkpoint commits once, and never backwards
    this.checkpoint = id;
    const objective = this.ctx.data.marker(id)?.params.objective;
    if (typeof objective === 'string') this.objective = objective;
    this.reachedPayload.id = id;
    this.ctx.events.emit('checkpoint/reached', this.reachedPayload);
  }
  /** reach(), for a checkpoint that belongs to an event: only in a run, and only when its zone is built (as proximity did) */
  private reachBuilt(id: CheckpointId): void {
    const m = this.ctx.data.marker(id);
    if (!this.started || !m || !this.builtZones.includes(m.zone)) return;
    this.reach(id);
  }
  private resetRun(): void {
    this.flags.clear(); this.solved.clear(); this.cleared.clear();
    for (const d of this.doorList) this.setDoor(d.marker.id, 'closed', false);
    this.stats = emptyStats();
    this.ride = null;
    this.objective = Object.keys(this.ctx.data.story.objectives)[0] ?? '';
    this.visDirty = true;
  }
  private place(markerId: string): void {
    const m = this.ctx.data.marker(markerId);
    if (!m) return;
    this.ctx.player.teleport(m.pos[0], m.pos[1], m.pos[2], m.rotY ?? 0, 0);
    this.updateZone(true);
    this.updateVisibility();
  }

  beginRun(fromSave: SaveData | null): Promise<void> {
    if (fromSave) {
      // the flow applies the save (enemies, world, player) once the right set is resident
      return this.track(this.ensureFor(fromSave.checkpoint, fromSave.world.onceFlags.includes('hatch_powered')));
    }
    this.resetRun();
    return this.track(this.chain([
      () => this.ensureFor('cp_lip_start', false),
      () => {
        this.checkpoint = 'cp_lip_start';
        this.place('player_start');
        this.reachedPayload.id = 'cp_lip_start';
        this.ctx.events.emit('checkpoint/reached', this.reachedPayload);
        return null;
      },
    ]));
  }

  restoreCheckpoint(): Promise<void> {
    const save = this.ctx.save.current;
    if (!save) return Promise.resolve();
    this.ride = null;
    return this.track(this.ensureFor(save.checkpoint, save.world.onceFlags.includes('hatch_powered')));
  }

  warpToCheckpoint(id: CheckpointId): Promise<void> {
    const index = PROGRESS.findIndex((p) => p.cp === id);
    if (index < 0) return Promise.reject(new Error(`unknown checkpoint '${id}'`));
    const stats = this.stats;
    this.resetRun();
    this.stats = stats;
    for (let i = 0; i <= index; i++) {
      const p = PROGRESS[i] as (typeof PROGRESS)[number];
      for (const z of p.puzzles) this.solvePuzzle(z, false);
      for (const e of p.encounters) this.clearEncounter(e, false);
      const objective = this.ctx.data.marker(p.cp)?.params.objective;
      if (typeof objective === 'string') this.objective = objective;
    }
    // the hatch shuts behind her on the first landing: open at cp_tally_hatch, closed from the stair foot on
    if (index > PROGRESS.findIndex((p) => p.cp === 'cp_tally_hatch')) this.setDoor(HATCH, 'closed', false);
    return this.track(this.chain([
      () => this.ensureFor(id, this.flags.has('hatch_powered')),
      () => {
        this.checkpoint = id;
        this.place(id);
        this.reachedPayload.id = id;
        this.ctx.events.emit('checkpoint/reached', this.reachedPayload);
        return null;
      },
    ]));
  }

  // ---- save -----------------------------------------------------------------------------------------
  captureSave(): WorldSave {
    const puzzles = {} as Record<PuzzleId, PuzzleSave>;
    for (const id of PUZZLES) puzzles[id] = { solved: this.solved.has(id), step: this.solved.has(id) ? 1 : 0, data: {} };
    const doors: Record<MarkerId, DoorState> = {};
    for (const d of this.doorList) doors[d.marker.id] = d.state;
    return {
      zone: this.zone, objective: this.objective, puzzles, doors,
      encountersCleared: ENCOUNTERS.filter((e) => this.cleared.has(e)),
      pickupsTaken: [], lockersUsed: [], brokenIds: [],
      onceFlags: Array.from(this.flags).sort(), vignettesSeen: [],
      stats: { ...this.stats, secrets: this.stats.secrets.slice() },
    };
  }
  applySave(data: WorldSave): void {
    this.flags.clear(); this.solved.clear(); this.cleared.clear();
    for (const f of data.onceFlags) this.flags.add(f);
    for (const id of PUZZLES) if (data.puzzles[id]?.solved) this.solved.add(id);
    for (const e of data.encountersCleared) this.cleared.add(e);
    for (const d of this.doorList) this.setDoor(d.marker.id, data.doors[d.marker.id] ?? 'closed', false);
    this.objective = data.objective;
    const deaths = this.stats.deaths;
    this.stats = { ...data.stats, secrets: data.stats.secrets.slice(), deaths: Math.max(deaths, data.stats.deaths) };
    this.ride = null;
    const save = this.ctx.save.current;
    this.checkpoint = save ? save.checkpoint : this.checkpoint;
    for (const s of this.ctx.data.layout.solids) if (s.dynamic) this.ctx.collision.setSolidEnabled(s.id, this.flags.has('enabled:' + s.id));
    // 3.6 rule 6: the surface set with the hatch powered is the seam stage, before control is given
    if (this.residentSet === 'surface' && this.flags.has('hatch_powered')) this.track(this.enterSeam());
    this.visDirty = true;
    this.place(this.checkpoint);                      // the respawn target is the checkpoint marker
  }

  // ---- per tick -------------------------------------------------------------------------------------
  private updateZone(force: boolean): void {
    const p = this.ctx.player.position;
    const z = this.ctx.data.zoneAt(p.x, p.y, p.z, this.residentSet);
    if (z !== null && (z !== this.zone || force)) {
      const from = this.zone;
      this.zone = z;
      this.mood = this.ctx.data.zone(z).mood;
      if (z !== from) {
        this.zonePayload.zone = z; this.zonePayload.from = from; this.zonePayload.mood = this.mood;
        this.ctx.events.emit('zone/entered', this.zonePayload);
        this.ctx.render.setMood(this.mood, 1);
      }
    }
  }

  private conditionHolds(c: VisibilityCell['showIf'] extends (infer T)[] | undefined ? T : never): boolean {
    if (c.door !== undefined) {
      const closed = this.doorState(c.door) === 'closed';
      return c.state === 'closed' ? closed : !closed;
    }
    if (c.flag !== undefined) return this.flags.has(c.flag) === (c.value ?? true);
    return true;
  }
  /** The visibility cell and the unit list (3.6 "Visibility"). */
  private updateVisibility(): void {
    const { ctx } = this;
    const p = ctx.player.position;
    const cell = ctx.data.cellAt(this.zone, p.x, p.y, p.z);
    const changed = cell !== this.cellRef;
    if (!changed && !this.visDirty) return;
    this.cellRef = cell;
    this.cell = cell.id;
    this.visDirty = false;
    const units = this.units;
    units.length = 0;
    if (this.showAll) {
      for (const id of Object.keys(ctx.data.manifest.visibility.units)) units.push(id);
    } else {
      for (let i = 0; i < cell.show.length; i++) units.push(cell.show[i] as string);
      if (cell.showIf) {
        for (let i = 0; i < cell.showIf.length; i++) {
          const c = cell.showIf[i] as NonNullable<VisibilityCell['showIf']>[number];
          if (!this.conditionHolds(c)) continue;
          for (let k = 0; k < c.units.length; k++) if (!units.includes(c.units[k] as string)) units.push(c.units[k] as string);
        }
      }
      const plugs = ctx.data.manifest.visibility.plugs;
      for (let i = 0; i < plugs.length; i++) {
        const plug = plugs[i] as (typeof plugs)[number];
        if (this.doorState(plug.door) !== 'closed' && !units.includes(plug.unit)) units.push(plug.node);
      }
    }
    ctx.render.setVisible(units);
    if (changed) {
      this.cellPayload.cell = cell.id; this.cellPayload.zone = this.zone;
      ctx.events.emit('world/cell', this.cellPayload);
    }
  }

  private updateSeam(): void {
    const p = this.ctx.player.position;
    const hatch = this.doors.get(HATCH);
    if (!hatch || !this.cleared.has('enc_tally')) return;
    // rule 5: the hatch shuts when she stands on the first landing and her capsule is clear of the leaf
    if (hatch.state === 'open' && this.trgHatchClose && inVolume(this.trgHatchClose, p.x, p.y, p.z) && p.y <= -3.5) {
      const m = hatch.marker, size = m.size ?? [4, 0.3, 2];
      const overlaps = p.y < m.pos[1] + size[1] && p.y + PLAYER_HEIGHT > m.pos[1]
        && Math.abs(p.x - m.pos[0]) < size[0] / 2 + PLAYER_RADIUS && Math.abs(p.z - m.pos[2]) < size[2] / 2 + PLAYER_RADIUS;
      if (!overlaps) { this.setDoor(HATCH, 'closing'); this.setDoor(HATCH, 'closed'); }
    }
    if (this.residentSet === 'surface' && hatch.state === 'closed' && this.staged === 'the_gallery' && this.trgSetSwap && inVolume(this.trgSetSwap, p.x, p.y, p.z)) {
      this.track(this.swapTo('underground'));
    }
  }

  private startRide(portal: NavPortal): void {
    const via = this.ctx.data.marker(portal.via);
    const ride = via?.params.ride as { seconds?: number; residentSet?: { load?: ResidentSet } } | undefined;
    const seconds = ride?.seconds ?? 12;
    this.ride = { portal, ticks: 0, total: Math.round(seconds * 60), teleported: false, swap: ride?.residentSet?.load ?? null, building: false };
    this.ctx.player.setControl(false, 'ride');
    if (this.ride.swap) void this.ctx.assets.prefetch(this.ride.swap);
    this.ridePayload.id = portal.id; this.ridePayload.stage = 'started'; this.ridePayload.seconds = seconds;
    this.ctx.events.emit('ride/state', this.ridePayload);
  }
  /** The rigid teleport of a ride: p' = to + R(yawDeg) * (p - from), yaw' = yaw + yawDeg. */
  private teleportRide(portal: NavPortal): void {
    const pl = this.ctx.player, p = pl.position, t = portal.transform;
    const a = t.yawDeg * DEG2RAD, c = Math.cos(a), s = Math.sin(a);
    const dx = p.x - t.from[0], dy = p.y - t.from[1], dz = p.z - t.from[2];
    pl.teleport(t.to[0] + dx * c + dz * s, t.to[1] + dy, t.to[2] - dx * s + dz * c, pl.yaw * RAD2DEG + t.yawDeg, pl.pitch * RAD2DEG);
  }
  private updateRide(): void {
    const { ctx } = this;
    const ride = this.ride;
    if (!ride) {
      if (!ctx.input.pressed('interact') || ctx.state.current !== 'playing') return;
      const p = ctx.player.position;
      const portals = ctx.data.layout.nav.portals;
      for (let i = 0; i < portals.length; i++) {
        const portal = portals[i] as NavPortal;
        const via = ctx.data.marker(portal.via);
        if (!via || !this.builtZones.includes(via.zone)) continue;
        if (Math.hypot(p.x - via.pos[0], p.y - via.pos[1], p.z - via.pos[2]) > INTERACT_RADIUS) continue;
        this.startRide(portal);
        return;
      }
      return;
    }
    ride.ticks++;
    if (!ride.teleported) {
      if (ride.swap) {
        // the cage goes dark, the sets swap, and she is moved in the same step the colliders change
        if (ride.ticks >= RIDE_DARK_TICKS && !ride.building) {
          ride.building = true;
          const portal = ride.portal;
          this.track(this.chain([
            () => this.swapTo(ride.swap as ResidentSet),
            () => { this.teleportRide(portal); ride.teleported = true; this.updateZone(true); this.visDirty = true; this.updateVisibility(); return null; },
          ]));
        }
      } else if (ride.ticks >= (ride.total >> 1)) {
        this.teleportRide(ride.portal);
        ride.teleported = true;
      }
    }
    if (ride.teleported && ride.ticks >= ride.total) {
      this.ride = null;
      ctx.player.setControl(true, 'ride');
      this.ridePayload.id = ride.portal.id; this.ridePayload.stage = 'ended'; this.ridePayload.seconds = ride.total / 60;
      ctx.events.emit('ride/state', this.ridePayload);
    }
  }

  private updateCheckpoints(): void {
    const p = this.ctx.player.position;
    const list = this.checkpoints;
    let current = -1;
    for (let i = 0; i < list.length; i++) if ((list[i] as LayoutMarker).id === this.checkpoint) { current = i; break; }
    for (let i = current + 1; i < list.length; i++) {
      const m = list[i] as LayoutMarker;
      if (!PLACE_WHEN.test(String(m.params.when ?? ''))) continue;
      if (!this.builtZones.includes(m.zone)) continue;
      if (Math.abs(p.y - m.pos[1]) > 1.5) continue;
      const dx = p.x - m.pos[0], dz = p.z - m.pos[2];
      if (dx * dx + dz * dz > CHECKPOINT_RADIUS * CHECKPOINT_RADIUS) continue;
      this.reach(m.id as CheckpointId);
      return;
    }
  }

  fixedUpdate(dt: number): void {
    if (!this.started) return;
    const playing = this.ctx.state.current === 'playing';
    this.updateZone(false);
    if (playing) {
      this.stats.playSeconds += dt;
      this.updateSeam();
      this.updateRide();
      this.updateCheckpoints();
    }
    this.updateVisibility();
  }

  // ---- views ----------------------------------------------------------------------------------------
  puzzle(id: PuzzleId): Readonly<PuzzleView> {
    const solved = this.solved.has(id);
    return { id, solved, step: solved ? 1 : 0, of: 1, hintTier: 0, secondsIdle: 0, data: {} };
  }
  encounter(id: EncounterId): Readonly<EncounterView> {
    return { id, state: this.cleared.has(id) ? 'cleared' : 'idle', wave: '', alive: this.ctx.enemies.aliveCount(id), spawned: 0, seconds: 0 };
  }
  spawnPickup(kind: PickupKind, x: number, y: number, z: number): void {
    this.ctx.events.emit('pickup/spawned', { x, y, z, id: `${kind}#drop`, kind, dropped: true });
  }

  debugState(): DebugSnapshot {
    const doors: Record<string, string> = {};
    for (const d of this.doorList) doors[d.marker.id] = d.state;
    return {
      stub: 'nullWorld', set: this.residentSet, staged: this.staged ?? '', builtZones: this.builtZones.slice(),
      zone: this.zone, cell: this.cell, checkpoint: this.checkpoint, doors,
      flags: Array.from(this.flags).sort(), solved: PUZZLES.filter((p) => this.solved.has(p)), cleared: ENCOUNTERS.filter((e) => this.cleared.has(e)),
      ride: this.ride ? { id: this.ride.portal.id, ticks: this.ride.ticks, teleported: this.ride.teleported } : null,
      playSeconds: round4(this.stats.playSeconds), busy: this.pending !== null,
    };
  }
}

export function createNullWorld(ctx: GameContext): WorldSystem { return new NullWorld(ctx); }
