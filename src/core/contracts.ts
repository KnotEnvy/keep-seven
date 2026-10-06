// src/core/contracts.ts — KEEP SEVEN shared contracts. Types and constants only: no logic, no DOM access.
// Frozen after the foundation phase. Change requests go to docs/requests/<piece>.md.
import type * as THREE from 'three';

// =====================================================================================
// 1. Identifiers and small shared types
// =====================================================================================

export type ZoneId = 'the_lip' | 'plenty_street' | 'tally_house' | 'the_gallery' | 'lift_hall' | 'the_bore' | 'far_rim';
export type ResidentSet = 'surface' | 'underground' | 'coda';
/** ART_BIBLE section 3. L5p is the bore after the proof. */
export type MoodId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L5p' | 'L6';
export type EnemyKind = 'bider' | 'transit' | 'tamper' | 'windlass';
export type PuzzleId = 'seven_jugs' | 'daylight' | 'proving_line' | 'the_asking';
export type EncounterId = 'enc_street' | 'enc_yard' | 'enc_tally' | 'enc_file' | 'enc_matador' | 'enc_windlass';
export type SecretId = 'sec_loft_bell' | 'sec_cold_bay';
export type CheckpointId =
  | 'cp_lip_start' | 'cp_lip_gate' | 'cp_street_clear' | 'cp_yard_clear' | 'cp_tally_enter' | 'cp_tally_hatch'
  | 'cp_gallery_bay' | 'cp_gallery_baffle' | 'cp_file_clear' | 'cp_hall_gantry' | 'cp_hall_clear' | 'cp_bore_ante'
  | 'cp_boss_p1' | 'cp_boss_p2' | 'cp_boss_p3' | 'cp_boss_proven' | 'cp_rim';
export type RideId = 'ride_lift_hall' | 'ride_proving_lift';
export type VignetteId = 'vig_kneeler' | 'vig_yard_bell' | 'vig_tamper' | 'vig_dowser' | 'vig_watcher';

/** Keys of design/assets.json `assets` / `textures`, design/layout.json marker ids, design/story.json keys. */
export type AssetId = string;
export type TextureId = string;
export type MarkerId = string;
export type StoryKey = string;
/** Runtime entity id. Layout things use their marker id ('ia_jug_3'); spawned things use '<kind>#<n>' ('bider#12'). */
export type EntityId = string;

export type AmmoType = 'lead_round' | 'line_round' | 'kept_round';
export type PickupKind = 'pk_rounds_6' | 'pk_rounds_12' | 'pk_canteen';
export type Difficulty = 'easy' | 'normal' | 'hard';
/** The two tiers a player can choose (CLAUDE.md, GDD 15). */
export type QualityTier = 'low' | 'high';
/** What the renderer is actually running: 'min' is the hidden no-composer tier that demotion (or ?tier=min) falls to. */
export type RenderTier = 'min' | QualityTier;
export type HintMode = 'off' | 'normal' | 'fast';
export type HintTier = 1 | 2 | 3 | 4;

/** Structural vector; THREE.Vector3 satisfies it. Never allocate one per frame. */
export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; y: number }

export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;
export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.65;
export const MAX_LINE_HITS = 16;
/** Equal to every lightmap's lightmapScale, so a lightmap's neutral (white) texel displays vertex light unchanged (7.4). */
export const VERTEX_LIGHT_SCALE = 2;

// =====================================================================================
// 2. Surfaces, collision, hits, damage
// =====================================================================================

/** GDD 6.8 impact sets. 'none' = no impact effect (kill volumes, invisible blockers). */
export type SurfaceType = 'sand' | 'wood' | 'adobe' | 'metal' | 'ceramic' | 'stone' | 'cloth' | 'none';

/** Bit flags on colliders and hit volumes. */
export const ColFlag = {
  NONE: 0,
  /** line rounds pass through (GDD 19.1) */
  PIERCE: 1 << 0,
  /** see-through; lead clanks and skips (ricochet tracer) */
  GRILLE: 1 << 1,
  /** cover below 2 m: does not hide a standing player from AI */
  LOW: 1 << 2,
  /** a Tamper charge that meets it ends in charge_stun */
  STUNS_CHARGE: 1 << 3,
  /** stops stakes, canisters' blast, the lance and the slam's line of sight */
  BLOCKS_BOSS_FIRE: 1 << 4,
  /** collision only, never drawn */
  INVISIBLE: 1 << 5,
  /** collides with capsules only (layout `playerOnly`): rays, sight lines and the kept-round aim test pass through */
  BODY_ONLY: 1 << 6,
} as const;

/** Query layers. A query passes a mask of the layers it wants to hit. */
export const Layer = {
  /** static level geometry (BVH) */
  WORLD: 1 << 0,
  /** doors, gates, shutters, the fallen ladder: movable boxes */
  DYNAMIC: 1 << 1,
  /** enemy and boss hit volumes */
  ENEMY: 1 << 2,
  /** shootable world things: jugs, latches, knots, ports, breakables */
  SHOOTABLE: 1 << 3,
  /** stakes and canisters in flight */
  PROJECTILE: 1 << 4,
  /** the player capsule (enemy attacks, projectiles) */
  PLAYER: 1 << 5,
  /** focus volumes of things used with `interact` that are not shot at: levers, lockers, boxes, readables, the stone */
  INTERACT: 1 << 6,
} as const;
export const LAYER_SOLID = Layer.WORLD | Layer.DYNAMIC;
/** The focus ray of src/world: nearest hit within 2.2 m; a focus exists when that hit is on INTERACT (or a SHOOTABLE that is also usable). */
export const LAYER_FOCUS = Layer.WORLD | Layer.DYNAMIC | Layer.SHOOTABLE | Layer.INTERACT;
export const LAYER_SHOT = Layer.WORLD | Layer.DYNAMIC | Layer.ENEMY | Layer.SHOOTABLE | Layer.PROJECTILE;

export type EntityKind =
  | 'world' | 'player' | 'bider' | 'transit' | 'tamper' | 'windlass'
  | 'knot' | 'jug' | 'bell' | 'latch' | 'cord' | 'rope' | 'range_plate' | 'ask_port' | 'breakable' | 'door'
  | 'stake' | 'canister' | 'dowser' | 'bore' | 'interactable';

/** Which part of an entity a volume is. Weak points are tested before the body of the same entity. */
export type HitPart =
  | 'body' | 'crown' | 'lens' | 'plate' | 'vent_chest' | 'vent_back'
  | 'mouth' | 'shutter' | 'guard' | 'pawl' | 'knot' | 'whole';

/** What a shot did to its target (GDD 6.7). Drives markers, sounds and VFX. */
export type HitOutcome =
  | 'impact'      // world surface or an inert thing: surface impact only
  | 'hit'         // damage, target still up (hit marker)
  | 'weak'        // weak-point damage, target still up (weak-point marker)
  | 'kill'        // target died or was felled (kill marker)
  | 'freed'       // a Bider sat down (freed marker)
  | 'deflected'   // plate, shut shutter, guard, grille (deflected glyph, ricochet)
  | 'broke'       // breakable or puzzle shootable reacted (jug, latch, bell, port, knot on a mechanism)
  | 'parried'     // a stake chamber misfired
  | 'passed';     // no hit volume (seated figures): the round goes on

export interface EntityRef {
  readonly id: EntityId;
  readonly kind: EntityKind;
}

export type DamageSource = 'player' | 'bider' | 'transit' | 'tamper' | 'windlass' | 'world';
export type DamageKind = 'bullet' | 'lunge' | 'stake' | 'slam' | 'charge' | 'canister' | 'lance' | 'fan' | 'kill_volume';

/** Mutable scratch struct: the sender fills it, the receiver must not keep a reference. */
export interface DamageInfo {
  amount: number;
  kind: DamageKind;
  source: DamageSource;
  sourceId: EntityId;
  /** ammunition for player shots, null otherwise */
  ammo: AmmoType | null;
  /** monotonic id of the trigger pull this belongs to (0 for non-player damage) */
  shotId: number;
  /** world position the damage came from (for the HUD damage arc) and its travel direction (unit) */
  ox: number; oy: number; oz: number;
  dx: number; dy: number; dz: number;
}

/** Result of a ray query. Mutable scratch struct owned by the caller (or by a HitList). */
export interface HitResult {
  hit: boolean;
  distance: number;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  surface: SurfaceType;
  /** ColFlag bits of what was hit */
  flags: number;
  /** Layer bit of what was hit */
  layer: number;
  /** null for static world geometry */
  entity: EntityRef | null;
  part: HitPart;
  /** the volume's receiver, if any (null for world geometry and for inert volumes) */
  receiver: HitReceiver | null;
  /** layout solid id for static geometry built from a solid, '' otherwise */
  solidId: string;
}

/** Preallocated list for raycastAll. `count` entries are valid, sorted near to far. */
export interface HitList {
  count: number;
  readonly hits: HitResult[];
}

/** Filled by a receiver so the shooter can finish the shot in the same tick. */
export interface HitResponse {
  outcome: HitOutcome;
  /** true: a lead round stops here. A line round stops only when `stopsLine` is true. */
  stops: boolean;
  stopsLine: boolean;
  damageDealt: number;
  /** the target's remaining health (0 when not applicable) */
  healthLeft: number;
}

/** Implemented by whoever owns a hit volume (enemies, boss, puzzle shootables, breakables, projectiles). */
export interface HitReceiver {
  /** Apply one round. Must fill `out` completely. Called synchronously inside the shooter's fixedUpdate. */
  onHit(hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void;
}

export type VolumeShape = 'sphere' | 'capsule' | 'box';
export interface HitVolumeDesc {
  shape: VolumeShape;
  layer: number;
  flags: number;
  surface: SurfaceType;
  entity: EntityRef;
  part: HitPart;
  /** higher wins when one ray crosses several volumes of the same entity (crown 10, lens 10, vent 10, body 0) */
  priority: number;
  receiver: HitReceiver | null;
}
export type VolumeHandle = number;
export type ColliderHandle = number;

/** Capsule depenetration result. Mutable scratch struct. */
export interface CapsuleResolve {
  /** corrected feet position */
  x: number; y: number; z: number;
  grounded: boolean;
  groundNx: number; groundNy: number; groundNz: number;
  groundSurface: SurfaceType;
  /** true when a non-walkable surface pushed the capsule this call */
  hitWall: boolean;
  wallNx: number; wallNy: number; wallNz: number;
  /** ColFlag bits of the wall that pushed hardest (STUNS_CHARGE for ribs) */
  wallFlags: number;
  hitCeiling: boolean;
}

export interface OverlapList {
  count: number;
  readonly entities: (EntityRef | null)[];
  readonly parts: HitPart[];
  readonly receivers: (HitReceiver | null)[];
}

/**
 * The collision and query service. Implemented once in src/core/collision.ts (zero allocation per query).
 * Content is supplied by src/world (static colliders, doors) and by volume owners (enemies, puzzles, projectiles).
 * All positions are world space, metres.
 */
export interface CollisionWorld {
  // ---- content (load time or state changes; never per frame)
  /** Replace the static collider set. `positions` are world-space triangles (9 floats each); the per-triangle arrays are parallel. Builds the BVH. */
  setStatic(positions: Float32Array, triSurface: Uint8Array, triFlags: Uint8Array, triSolid: Uint16Array, solidIds: readonly string[]): void;
  clearStatic(): void;
  /** Switch every static triangle built from one layout solid on or off (solids with `dynamic` + `enabledBy`, e.g. the fallen loft ladder). */
  setSolidEnabled(solidId: string, enabled: boolean): void;
  /** An oriented box (rotation about Y only) on Layer.DYNAMIC. Half extents in metres. */
  addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotYRad: number, surface: SurfaceType, flags: number, entity: EntityRef | null): ColliderHandle;
  setBoxTransform(h: ColliderHandle, cx: number, cy: number, cz: number, rotYRad: number): void;
  setBoxEnabled(h: ColliderHandle, enabled: boolean): void;
  removeBox(h: ColliderHandle): void;

  // ---- hit volumes (ray and overlap targets; they never block movement)
  addVolume(desc: HitVolumeDesc): VolumeHandle;
  setSphere(h: VolumeHandle, x: number, y: number, z: number, radius: number): void;
  setCapsule(h: VolumeHandle, ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number): void;
  setVolumeBox(h: VolumeHandle, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotYRad: number): void;
  setVolumeEnabled(h: VolumeHandle, enabled: boolean): void;
  removeVolume(h: VolumeHandle): void;

  // ---- movement
  /**
   * Push a vertical capsule (feet at x,y,z) out of Layer.WORLD | Layer.DYNAMIC geometry.
   * Walkable surfaces (normal.y > walkableCos) push straight up so nothing slides on ramps.
   * Callers sub-step so that speed * dt / subSteps < radius.
   */
  resolveCapsule(x: number, y: number, z: number, radius: number, height: number, walkableCos: number, out: CapsuleResolve): void;
  /** Downward ray from (x, y, z). Returns the ground y, or NaN when nothing is within maxDrop. Fills outHit when given. */
  groundHeight(x: number, y: number, z: number, maxDrop: number, outHit?: HitResult): number;
  /** True when a capsule at this feet position touches nothing solid. */
  capsuleFree(x: number, y: number, z: number, radius: number, height: number): boolean;

  // ---- rays
  /** Nearest hit along a unit direction. One hit per entity (highest priority volume). Returns out.hit. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number, layerMask: number, out: HitResult): boolean;
  /** Every hit along the ray, near to far, at most MAX_LINE_HITS, one per entity. Does not stop at anything: the caller walks the list and stops per GDD 6.4. Returns out.count. */
  raycastAll(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number, layerMask: number, out: HitList): number;
  /** True when no Layer.WORLD | Layer.DYNAMIC geometry lies between the points. Colliders whose flags intersect `ignoreFlags` are skipped (pass ColFlag.LOW | ColFlag.GRILLE for sight). ColFlag.BODY_ONLY colliders never block a ray or a sight line. */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ignoreFlags: number): boolean;

  /** Centre of an enabled hit volume of an entity (`part` null = its highest-priority volume). False when there is none. Debug, tests and aim assists. */
  volumeCentre(entity: EntityId, part: HitPart | null, out: Vec3): boolean;

  // ---- overlaps
  /** Volumes (not static geometry) touching a sphere. Returns out.count (list capacity 32). */
  overlapSphere(x: number, y: number, z: number, radius: number, layerMask: number, out: OverlapList): number;
  /** True when a sphere of `radius` swept from a to b touches a vertical capsule (feet at cap). Projectile-vs-player and lunge tests. */
  segmentHitsCapsule(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, capX: number, capY: number, capZ: number, capRadius: number, capHeight: number): boolean;

  // ---- factories for the scratch structs (call once, keep)
  createHit(): HitResult;
  createHitList(): HitList;
  createResolve(): CapsuleResolve;
  createOverlapList(): OverlapList;

  /** Counters for the perf overlay: queries this tick, static triangles, boxes, volumes. */
  readonly stats: { rays: number; capsules: number; triangles: number; boxes: number; volumes: number };
}

// =====================================================================================
// 3. Design data (typed views of design/*.json)
// =====================================================================================

export type SolidShape = 'box' | 'ramp' | 'cylinder';
export type SolidRole = 'floor' | 'ceiling' | 'terrain' | 'platform' | 'cover' | 'wall' | 'blocker' | 'stairs';
export interface LayoutSolid {
  id: string; zone: ZoneId; shape: SolidShape; role: SolidRole; surface: Exclude<SurfaceType, 'none'>;
  pos: [number, number, number]; size: [number, number, number]; rotY: number;
  rise?: '+x' | '-x' | '+z' | '-z'; skirt?: number; innerRadius?: number;
  pierce?: boolean; dynamic?: boolean; enabledBy?: MarkerId; grille?: boolean; skipsShots?: boolean; seeThrough?: boolean;
  invisible?: boolean; low?: boolean; stunsCharge?: boolean; blocksBossFire?: boolean;
  /** collides with bodies only (ColFlag.BODY_ONLY) */
  playerOnly?: boolean;
  /** resident in every listed set instead of only its zone's (the peg-stair seam); `seam` flags those solids */
  sets?: ResidentSet[]; seam?: boolean;
  prop?: string; interactable?: string; puzzle?: PuzzleId; facade?: string; note?: string;
  /** hints for the art pass and the map; no runtime meaning */
  landmark?: boolean; leanDeg?: number; bearingDeg?: number; dress?: string;
}
export type MarkerType =
  | 'player_start' | 'checkpoint' | 'enemy_spawn' | 'pickup' | 'interactable' | 'door' | 'puzzle_element'
  | 'trigger' | 'readable' | 'prop' | 'vista' | 'light' | 'exit';
export interface LayoutMarker {
  id: MarkerId; zone: ZoneId; type: MarkerType;
  pos: [number, number, number]; rotY: number; size?: [number, number, number];
  /** free-form per type; see docs/LEVEL.md. Owners narrow it with their own param types. */
  params: Record<string, unknown>;
}
export interface LayoutZone {
  id: ZoneId; name: string; kind: 'exterior' | 'interior'; set: ResidentSet;
  /** zoneAt returns the containing zone with the highest priority (interior 10, exterior 0) */
  priority: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  mood: MoodId; moodIntro?: MoodId; neighbors: ZoneId[]; card: StoryKey; note?: string;
}
export interface NavNode { id: string; zone: ZoneId; pos: [number, number, number]; tags?: string[]; sets?: ResidentSet[] }
/** A lift ride: a rigid teleport between two identical cages. p' = to + R(yawDeg) * (p - from), yaw' = yaw + yawDeg. */
export interface NavPortal {
  id: RideId; from: string; to: string; via: MarkerId;
  cages: [MarkerId, MarkerId]; cageInterior: [number, number, number];
  transform: { from: [number, number, number]; to: [number, number, number]; yawDeg: number };
  ride: string;
}
export interface NavData {
  nodes: NavNode[];
  links: [string, string][];
  /** links that cross a door marker: passable only while world.doorState(door) is 'open' */
  gates: { link: [string, string]; door: MarkerId }[];
  portals: NavPortal[];
  criticalPath: string[];
  criticalPathLength: number;
}
export interface EncounterWaveData {
  id: string; spawns: MarkerId[]; delay: number;
  /** the rule in words (GDD 10); the machine-readable fields below override it where present */
  when: string;
  lane?: MarkerId; opensDoor?: MarkerId; doorStaysOpen?: boolean; repeating?: boolean;
  /** seconds on the encounter clock; a wave whose time comes while `cancelledIf` holds never spawns */
  atSeconds?: number; cancelledIf?: string;
  /** seconds after the previous wave is all down, or `orAtSeconds` on the encounter clock, whichever is first */
  afterWaveDownSeconds?: number; orAtSeconds?: number;
  lines?: StoryKey[]; laneFollowing?: boolean; lateralOffsets?: number[]; depthStagger?: number;
  /** repeating adds: which spawn to use and how far from the player it must be */
  pick?: string; minPlayerDistance?: number; ifTooClose?: string; note?: string;
}
export interface EncounterData {
  id: EncounterId; zone: ZoneId; trigger: MarkerId; maxAlive: number;
  composition: Record<string, number | string>;
  locksDoors: MarkerId[]; waves: EncounterWaveData[];
  onClear: { checkpoint?: CheckpointId; lines?: StoryKey[]; objective?: StoryKey; then?: MarkerId; opens?: MarkerId; opensWithinSeconds?: number; clearRule?: string; door?: string; note?: string };
}
export interface LayoutData {
  meta: { version: number; sun: { azimuthDeg: number; elevationDeg: number; toSun: [number, number, number]; travel: [number, number, number] }; player: { radius: number; height: number; eye: number; stepUp: number; maxSlopeDeg: number; jumpApex: number } };
  zones: LayoutZone[]; solids: LayoutSolid[]; markers: LayoutMarker[]; nav: NavData; encounters: EncounterData[];
}

export type Speaker = 'narrator' | 'station' | 'reeve' | 'card' | 'caption';
export interface StoryLine { speaker: Speaker; text: string; seconds: number }
export interface StoryReadable { title: string; body: string }
export interface StoryData {
  meta: { version: number; rules: { once_only: StoryKey[]; narrator_repeat: string; subtitle_max_chars: number; subtitle_lines: number }; load_bearing: string[] };
  lines: Record<StoryKey, StoryLine>;
  readables: Record<StoryKey, StoryReadable>;
  objectives: Record<StoryKey, string>;
  ui: Record<StoryKey, string>;
}

export type BakeClass = 'LM' | 'VL' | 'LM+VL' | 'AO' | 'UNLIT';
export type PlacedBy = 'origin' | 'zone' | 'layout' | 'dressing' | 'code';
/** 0 = on the critical path within 5 m, or load-bearing; 1 = on the path, not load-bearing; 2 = dressing, secrets, polish (7.3). */
export type Priority = 0 | 1 | 2;
export interface ClipDef {
  name: string; loop: boolean; seconds: number; priority: Priority;
  /** priority 2 only: the clip of the same asset this one may ship as a copy of (GDD 20.1) */
  fallback?: string;
}
/** Where the pivot sits in the placeholder box (and how validators place it). 'world' = authored in world coordinates. */
export type PlaceholderAnchor = 'base' | 'sill' | 'centre' | 'top' | 'back' | 'back_base' | 'hinge' | 'world';
/** One static mesh group of a zone GLB: meshes named `<id>__<material>`, one per material (7.5). */
export interface ChunkDef {
  id: string; tris: number; materials: string[]; drawCalls: number;
  box: { min: [number, number, number]; max: [number, number, number] };
  /** 'high' = only what stands more than 3 m above the path (a skyline shell); 'low' = the rest */
  part?: 'high' | 'low';
  solids?: string[];
}
export interface AssetDef {
  path: string; source: string; owner: string; category: 'env' | 'props' | 'weapons' | 'enemies' | 'boss';
  priority: Priority;
  triBudget: number; drawCalls: number; materials: string[]; bake: BakeClass; skinned: boolean;
  bones?: string[]; nodes: string[]; lampSets?: Record<string, number>; codeDriven?: string[];
  /** asset-local positions (pivot frame, +Z front) of nodes that gameplay or the layout depends on; check-glb holds final art to them within 0.03 m */
  nodePos?: Record<string, [number, number, number]>;
  /** asset-local centre of the thing the player shoots at (its hit sphere) */
  hitPoint?: [number, number, number];
  animations: ClipDef[]; collision: string; instanced: boolean; lightmapped: boolean;
  lightmaps?: TextureId[]; lightLayers?: TextureId[]; zone: ZoneId | null; sets: ResidentSet[]; placedBy: PlacedBy;
  pivot: string; placeholder: { shape: 'box' | 'capsule' | 'cylinder'; size: [number, number, number]; anchor: PlaceholderAnchor; source?: string };
  /** zone GLBs only: the chunk plan and the named mesh nodes drawn beside the chunks (rotor, lamp sets, plugs) */
  chunks?: ChunkDef[]; drawnNodes?: string[];
  notes?: string;
}
export interface TextureDef {
  path: string; source: string; owner: string;
  kind: 'detail' | 'mask' | 'palette' | 'emissive' | 'albedo' | 'matcap' | 'fx' | 'noise' | 'lightmap' | 'lightlayer';
  size: [number, number]; format: 'r8' | 'rgba8'; colorSpace: 'srgb' | 'none'; mips: boolean; wrap: 'repeat' | 'clamp';
  sets: (ResidentSet | 'always')[]; gpuBytes: number; lightmapScale?: number; uv?: number; regions?: string[]; usedBy?: string[]; notes?: string;
  /** lightmaps and light layers: the reserved block vertex-lit vertices point UV1 at (value 1 on a lightmap, 0 on a layer) */
  neutralTexel?: { px: [number, number, number, number]; uv: [number, number]; value: number };
}
/**
 * How a layout reference becomes a runtime object (section 9).
 *  instance  world instantiates the asset once per marker        variant   as instance, showing only variant node `node`
 *  partOf    a part (`node`, or the root) of the instance that marker `owner` created; nothing is instantiated
 *  zoneNode  `node` (lamp `index`) of a zone GLB already in the scene   embedded  merged into the zone GLB; world adds only interaction
 *  actor     spawned by src/enemies (encounter members, vignette actors); never by world
 */
export type BindingMode = 'instance' | 'variant' | 'partOf' | 'zoneNode' | 'embedded' | 'actor';
export interface AssetBinding {
  asset: AssetId; mode: BindingMode; node?: string; scale?: number;
  /** asset-local metres from the marker to the pivot: pivot = marker.pos + R * offset * scale (default: the marker is the pivot) */
  offset?: [number, number, number];
  /** partOf: the marker whose instance holds the part; `tolerance` is how far the marker may be from the node (default 0.06 m) */
  owner?: MarkerId; tolerance?: number;
  /** zoneNode: lamp index inside the lamp set `node` */
  index?: number;
  /** the instance and its hit volume keep their rest offset from this node of the owner marker's instance (jugs on the gate bar) */
  follow?: { owner: MarkerId; node: string };
  /** 'world': the asset is authored in world coordinates and added at identity */
  space?: 'world';
  /** 'seats': one instance per entry of marker.params.seats */
  per?: 'seats';
  /** actor: the vignette that owns it and the static asset used if that vignette is cut */
  vignette?: VignetteId; fallback?: AssetId;
}
export type AssetBindingValue = AssetBinding | AssetBinding[] | null;
/** A condition on a visibility rule: a door marker's state (anything but 'closed' is not_closed) or a world flag. */
export interface VisibilityCondition {
  units: string[]; why: string;
  door?: MarkerId; state?: 'closed' | 'not_closed';
  flag?: string; value?: boolean;
  /** encounters that cannot be live while the condition holds (budget arithmetic only) */
  notDuring?: EncounterId[];
}
/** What is drawn while the player's feet are in `box` (or anywhere else in `zone` when there is no box). First match in array order. */
export interface VisibilityCell {
  id: string; zone: ZoneId;
  box?: { min: [number, number, number]; max: [number, number, number] };
  show: string[]; showIf?: VisibilityCondition[];
  accept?: { unit: string; why: string; plug?: string }[];
  why: string;
  /** computed by tools/gen_assets.mjs: the most that can be drawn from this cell */
  budget: { when: string; staticTris: number; dynamicTris: number; triangles: number; drawCalls: { typical: number; worst: number } };
}
export interface TierDef {
  userSelectable: boolean; composer: boolean; antialias: 'none' | 'context_msaa' | 'fxaa'; bloom: boolean; sunShadowMap: boolean;
  maxPixelRatio: number; minPixelRatio: number; maxBufferHeight: number; maxBufferPixels: number; textureBudgetMB: number;
  drawCalls: { typical: number; worst: number }; triangles: number; fullScreenDraws: number;
  /** render targets at the largest buffer: bytes per drawing-buffer pixel, plus fixed-size targets */
  targets: { name: string; bytesPerPixel: number }[]; fixed?: { name: string; bytes: number }[];
  bytesPerPixel: number; renderTargetBytes: number; notes?: string;
}
export interface AssetManifest {
  meta: { version: number; vertexLightScale: number; owners: string[]; pieces: Record<string, string[]> };
  assets: Record<AssetId, AssetDef>;
  textures: Record<TextureId, TextureDef>;
  tiers: Record<RenderTier, TierDef>;
  /** what the budget model adds to the static chunks of a cell (gun, effects, bodies, projectiles, the alive cap) */
  allowances: Record<string, unknown>;
  /** `triangles` and `drawCalls` are computed: everything the visibility cells allow to be drawn while the player is in the zone */
  zones: Record<ZoneId, {
    set: ResidentSet; env: AssetId; chunks: string[]; cells: string[];
    dressing: { tris: number; drawCalls: number; assets: AssetId[] };
    drawCalls: { typical: number; worst: number }; triangles: number;
  }>;
  visibility: {
    /** everything render.setVisible can show or hide: zone chunks and world-space assets without chunks */
    units: Record<string, { asset: AssetId; zone: ZoneId | null; tris: number; drawCalls: number; box?: ChunkDef['box']; part?: 'high' | 'low' }>;
    cells: VisibilityCell[];
    /** a black doorway panel (a drawn node of `asset`): shown while `door` is not closed and `unit` is hidden */
    plugs: { node: string; asset: AssetId; door: MarkerId; unit: string }[];
  };
  sets: Record<ResidentSet | 'always', { zones?: ZoneId[]; textures: TextureId[]; textureBytes: number; assets?: AssetId[]; residentTextureMB?: number }>;
  /** what is resident when, with its memory per tier; the `seam` stage has the surface set plus one staged zone (3.6) */
  stages: { id: string; when: string; resident: ResidentSet; staged?: { zone: ZoneId; assets: AssetId[]; textures: TextureId[] }; textureBytes: number; totalMB: Record<RenderTier, number> }[];
  bindings: Record<'pickup' | 'enemy' | 'interactable' | 'prop' | 'door' | 'puzzleElement' | 'readable' | 'entrance' | 'solidProp' | 'zoneEmbedded', Record<string, AssetBindingValue>>;
}
/** World transform of an asset pivot for a marker and one of its bindings. */
export interface Placement { x: number; y: number; z: number; rotYRad: number; scale: number }

export interface GameData {
  readonly layout: LayoutData;
  readonly story: StoryData;
  readonly manifest: AssetManifest;
  /** O(1) lookups built once at boot. They throw on an unknown id in test mode and return undefined otherwise. */
  marker(id: MarkerId): LayoutMarker | undefined;
  markersOfType(type: MarkerType): readonly LayoutMarker[];
  markersInZone(zone: ZoneId): readonly LayoutMarker[];
  zone(id: ZoneId): LayoutZone;
  /** Zone containing a point among the zones of one resident set: the highest `priority` wins; null outside every zone. */
  zoneAt(x: number, y: number, z: number, set: ResidentSet): ZoneId | null;
  /** The visibility cell for feet at a point of a zone (first cell of that zone whose box contains it, else the zone's default). */
  cellAt(zone: ZoneId, x: number, y: number, z: number): VisibilityCell;
  /**
   * The bindings a marker resolves to, in the one lookup order: a door marker through `door` (its params.interactable is not a
   * second binding); a puzzle_element without params.interactable through `puzzleElement`; then params.interactable, pickup,
   * readable, prop. An enemy_spawn resolves only its params.entrance through `entrance` (its params.prop is the hand prop
   * of its vignette, which src/enemies attaches). Empty when the marker binds nothing.
   */
  bindings(marker: LayoutMarker): readonly AssetBinding[];
  /** Pivot transform for (marker, binding): pos = marker.pos + R * offset * scale, rotYRad = radians(marker.rotY) + PI (assets face +Z, a marker's rotY 0 faces -Z). */
  placement(marker: LayoutMarker, binding: AssetBinding, out: Placement): Placement;
  /** World position of a node of the instance (marker, binding) from the asset's nodePos, before any animation. False when the asset lists no position for it. */
  nodeRest(marker: LayoutMarker, binding: AssetBinding, node: string, out: Vec3): boolean;
  /** Nav path between two nodes or markers (nearest node), over links whose gates are open when `openOnly`; [] when there is none. */
  navPath(from: string, to: string, openOnly?: boolean): string[];
  encounter(id: EncounterId): EncounterData;
  line(key: StoryKey): StoryLine;
  ui(key: StoryKey): string;
}

// =====================================================================================
// 4. Gameplay definitions (data, exported by the owning module, typed here)
// =====================================================================================

export interface AmmoDef {
  type: AmmoType;
  range: number;
  damage: number;
  weakPointMultiplier: number;
  plateMultiplier: number;
  pierces: boolean;
  cadence: number;
  cameraKickPitchDeg: number; cameraKickYawDeg: number; cameraKickPeak: number; cameraKickRecover: number;
  viewKickBack: number; viewKickRiseDeg: number; viewKickSeconds: number;
  fovPunchDeg: number; fovPunchSeconds: number;
  trauma: number;
}
export interface WeaponDef {
  id: 'assize_six';
  asset: AssetId;
  cylinder: 6;
  reserveCap: number; startReserve: number; lineRoundCap: number;
  fireBuffer: number;
  bloomPerShotDeg: number; bloomDecaySeconds: number;
  reloadOpen: number; reloadPerRound: number; reloadClose: number; reloadFastClose: number;
  loadLine: number; unloadLine: number; loadKept: number; unloadKept: number;
  ammo: Record<AmmoType, AmmoDef>;
}

export interface HitVolumeDef {
  part: HitPart;
  shape: VolumeShape;
  /** node (bone or empty) the volume follows */
  node: string;
  radius: number;
  /** capsule only: second node or a local offset along +Y from `node` */
  height?: number;
  priority: number;
  damageMultiplier: number;
  /** only damaged while this is true in the enemy's state (vents, mouths); while it is false a round that hits the volume is treated as hitting the plate */
  gatedBy?: 'vent_chest_open' | 'vent_back_open' | 'mouth_open' | 'guard_down';
  /** ammunition that ignores the gate (GDD 7.3: a line round reaches a Tamper knot through the shut plate) */
  gateIgnoredBy?: AmmoType[];
}
export interface AttackDef {
  id: string;
  kind: DamageKind;
  damage: number;
  token: 'melee' | 'ranged' | 'heavy' | 'none';
  telegraph: number;
  range: number;
}
export interface EnemyDef {
  kind: EnemyKind;
  asset: AssetId;
  hp: number;
  threat: number;
  maxAlive: number;
  moveSpeed: number;
  bodyRadius: number;
  bodyHeight: number;
  volumes: HitVolumeDef[];
  attacks: AttackDef[];
}
export interface DifficultyDef {
  damageTaken: number;
  attackTokens: number;
  telegraphScale: number;
  biderDropChance: number;
  crownKnotRadius: number;
}

export type ChamberState = 'empty' | 'lead' | 'line' | 'kept';
export type SeventhState = 'sealed' | 'pulse' | 'band_broken' | 'chambered' | 'spent' | 'violet';
export type WeaponPhase = 'ready' | 'firing' | 'reload_open' | 'reload_round' | 'reload_close' | 'loading_line' | 'unloading_line' | 'loading_kept' | 'unloading_kept' | 'firing_kept' | 'taking_round' | 'drawing';
export type BossPhase = 'idle' | 'parley' | 'p1' | 'p2' | 'p3a' | 'hush' | 'proven' | 'p3b' | 'dead';
/** 'ajar' = released but impassable (the hatch after its knot: the collider stays; GDD 9.4). */
export type DoorState = 'closed' | 'ajar' | 'opening' | 'open' | 'closing';
export type EncounterState = 'idle' | 'vignette' | 'active' | 'cleared';
export type GuardState = 'parked' | 'set' | 'released' | 'shattered';

// =====================================================================================
// 5. Options, save data, stats
// =====================================================================================

export type Action = 'forward' | 'back' | 'left' | 'right' | 'fire' | 'reload' | 'line' | 'kept' | 'interact' | 'sprint' | 'jump' | 'pause';
export const ACTIONS: readonly Action[] = ['forward', 'back', 'left', 'right', 'fire', 'reload', 'line', 'kept', 'interact', 'sprint', 'jump', 'pause'];
/** KeyboardEvent.code values, or 'Mouse0' / 'Mouse1' / 'Mouse2'. Up to two per action. */
export type Bindings = Record<Action, string[]>;

export interface Options {
  sensitivity: number;          // 0.2 .. 4
  invertY: boolean;
  fov: number;                  // 50 .. 80, vertical degrees
  headBob: number;              // 0 .. 1.5
  screenShake: number;          // 0 .. 1
  reduceMotion: boolean;
  reduceFlashes: boolean;
  subtitles: boolean;
  subtitleSize: 'S' | 'M' | 'L' | 'XL';
  subtitleBackground: number;   // 0 .. 1
  captions: boolean;
  difficulty: Difficulty;
  sprintMode: 'hold' | 'toggle';
  fireMode: 'click' | 'hold';
  bindings: Bindings;
  crosshairSize: number;        // 0.5 .. 2
  crosshairColour: string;      // '#rrggbb'
  crosshairOutline: boolean;
  hints: HintMode;
  graphics: 'auto' | QualityTier;
  resolutionScale: number;      // 0.5 .. 1: upper bound for the adaptive pixel ratio, as a fraction of the tier maximum
  volumeMaster: number;         // 0 .. 1
  volumeEffects: number;
  volumeMusic: number;
}

export interface RunStats {
  playSeconds: number;
  roundsFired: number;
  roundsHit: number;
  knotsBurst: number;
  linesOfThree: number;
  cleanSix: boolean;
  secrets: SecretId[];
  freed: number;
  felled: number;
  deaths: number;
  tookStoneRound: boolean;
}

export interface PlayerSave {
  health: number;
  cylinder: ChamberState[];
  reserve: number;
  lineRounds: number;
  seventh: SeventhState;
}
export interface PuzzleSave { solved: boolean; step: number; data: Record<string, number | boolean | string> }
export interface WorldSave {
  zone: ZoneId;
  objective: StoryKey;
  puzzles: Record<PuzzleId, PuzzleSave>;
  doors: Record<MarkerId, DoorState>;
  encountersCleared: EncounterId[];
  pickupsTaken: MarkerId[];
  lockersUsed: MarkerId[];
  brokenIds: MarkerId[];
  onceFlags: string[];
  vignettesSeen: VignetteId[];
  stats: RunStats;
}
export interface EnemiesSave {
  bossPhase: BossPhase;
  parleyHeard: boolean;
  deathsInBossPhase: number;
  /** freed and felled Biders that stay in the world as static bodies */
  statics: { asset: AssetId; x: number; y: number; z: number; rotY: number }[];
}
export interface SaveData {
  version: 1;
  checkpoint: CheckpointId;
  tick: number;
  player: PlayerSave;
  world: WorldSave;
  enemies: EnemiesSave;
}

// =====================================================================================
// 6. Events
// =====================================================================================

interface PosPayload { x: number; y: number; z: number }

/**
 * name -> payload. The bus is synchronous. Payloads are scratch objects owned by the emitter:
 * listeners copy what they need and never keep the reference. No event may be emitted every frame.
 */
export interface GameEvents {
  // ---- game, loading, settings
  'game/state': { from: GameState; to: GameState; reason: string };
  'game/new_run': { difficulty: Difficulty };
  'load/progress': { loaded: number; total: number; label: string };
  'load/set': { set: ResidentSet; stage: 'prefetched' | 'activated' | 'released' };
  'options/changed': { key: keyof Options };
  'quality/changed': { tier: RenderTier; pixelRatio: number; reason: 'detect' | 'user' | 'adaptive' | 'demote' };
  'input/pointer_lock': { locked: boolean };
  'time/scale': { scale: number; realSeconds: number; reason: 'last_enemy' | 'boss_break' | 'hush' | 'kill_sequence' | 'debug' };

  // ---- player
  'player/spawned': { checkpoint: CheckpointId; x: number; y: number; z: number };
  'player/damaged': { amount: number; health: number; kind: DamageKind; source: DamageSource; fromX: number; fromY: number; fromZ: number; graceUsed: boolean };
  'player/healed': { amount: number; health: number };
  'player/health_segment': { segment: 0 | 1 | 2; regenerating: boolean };
  'player/died': { kind: DamageKind; source: DamageSource };
  'player/respawned': { checkpoint: CheckpointId };
  'player/footstep': PosPayload & { surface: SurfaceType; sprint: boolean };
  'player/jumped': PosPayload;
  'player/landed': PosPayload & { speed: number; surface: SurfaceType };
  'player/control': { enabled: boolean; reason: string };

  // ---- weapon
  'weapon/fired': { shotId: number; ammo: AmmoType; chambersLeft: number; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number; mx: number; my: number; mz: number; endX: number; endY: number; endZ: number };
  'weapon/dry_fire': { reason: 'empty' | 'kept_not_in_bore' };
  'weapon/reload': { stage: 'open' | 'round' | 'close' | 'fast_close'; chambered: number; reserve: number };
  'weapon/line': { stage: 'loaded' | 'unloaded'; held: number };
  'weapon/kept': { stage: 'denied' | 'loading' | 'chambered' | 'unloaded' | 'fired'; mark: MarkerId | '' };
  'weapon/ammo': { chambered: number; reserve: number; lineRounds: number };
  'weapon/seventh': { state: SeventhState };

  // ---- combat (one 'combat/hit' per thing a round meets; a line round emits several, 40 ms apart)
  'combat/hit': PosPayload & { shotId: number; order: number; ammo: AmmoType; outcome: HitOutcome; entityId: EntityId; entityKind: EntityKind; part: HitPart; surface: SurfaceType; nx: number; ny: number; nz: number; damage: number; ricochetX: number; ricochetY: number; ricochetZ: number };
  'combat/line_resolved': { shotId: number; bodies: number; freed: number; knots: number; endX: number; endY: number; endZ: number };

  // ---- enemies
  'enemy/spawned': PosPayload & { id: EntityId; kind: EnemyKind; encounter: EncounterId | ''; entrance: string };
  'enemy/state': { id: EntityId; kind: EnemyKind; from: string; to: string };
  'enemy/telegraph': PosPayload & { id: EntityId; kind: EnemyKind; attack: string; seconds: number };
  'enemy/attack': PosPayload & { id: EntityId; kind: EnemyKind; attack: string };
  'enemy/damaged': { id: EntityId; kind: EnemyKind; part: HitPart; amount: number; hp: number };
  'enemy/felled': PosPayload & { id: EntityId; encounter: EncounterId | ''; counted: boolean };
  'enemy/freed': PosPayload & { id: EntityId; encounter: EncounterId | ''; cause: 'crown' | 'line' | 'kept'; counted: boolean };
  'enemy/died': PosPayload & { id: EntityId; kind: EnemyKind; encounter: EncounterId | '' };
  'enemy/removed': { id: EntityId };
  'projectile/spawned': PosPayload & { id: EntityId; kind: 'stake' | 'canister'; source: EnemyKind };
  'projectile/landed': PosPayload & { id: EntityId; kind: 'stake' | 'canister'; surface: SurfaceType; hitPlayer: boolean };
  'projectile/burst': PosPayload & { id: EntityId; kind: 'stake' | 'canister'; reason: 'shot' | 'hush' | 'parry' | 'fuse' };

  // ---- boss
  'boss/parley': { stage: 'start' | 'inspection' | 'refused' | 'kept' | 'end' };
  'boss/phase': { phase: BossPhase; from: BossPhase };
  'boss/pips': { phase: BossPhase; remaining: number; total: number; lit: number };
  'boss/indexing': { fromBay: number; toBay: number; seconds: number };
  'boss/discharge': { kind: 'stake' | 'canister' | 'lance' | 'fan' | 'dry'; mouth: number; glowSeconds: number; parryable: boolean };
  'boss/haul': { on: boolean; seconds: number };
  'boss/mouth': { mouth: number; state: 'open' | 'shut' | 'dark' | 'relit' };
  'boss/guard': { state: GuardState };
  'boss/pawl': { side: 'l' | 'r'; burst: boolean };
  'boss/charge_required': Record<string, never>;
  'boss/head_dry': { seconds: number };
  'boss/hush': { on: boolean };
  'boss/proven': PosPayload;
  'boss/defeated': { cleanSix: boolean };

  // ---- world: pickups, interaction, doors, shootables
  'pickup/spawned': PosPayload & { id: EntityId; kind: PickupKind; dropped: boolean };
  'pickup/collected': PosPayload & { id: EntityId; kind: PickupKind; amount: number };
  // interaction: src/world polls input.pressed('interact'), owns the focus ray and emits all four of these
  'interact/focus': { id: MarkerId | ''; prompt: StoryKey | ''; kind: 'read' | 'take' | 'use' | 'kept' | '' };
  'interact/used': { id: MarkerId; kind: 'read' | 'take' | 'use' };
  'readable/opened': { key: StoryKey };
  'readable/closed': { key: StoryKey };
  'door/state': { id: MarkerId; state: DoorState; locked: boolean };
  'shootable/hit': PosPayload & { id: MarkerId; kind: EntityKind; scaleDegree: number; ammo: AmmoType };
  'breakable/broken': PosPayload & { id: EntityId; asset: AssetId };
  'knot/burst': PosPayload & { id: EntityId; onMechanism: boolean; regrows: boolean };
  'knot/regrown': PosPayload & { id: EntityId };
  'lamp/set': { id: MarkerId; lit: number; of: number };
  'ride/state': { id: RideId; stage: 'started' | 'ended'; seconds: number };

  // ---- puzzles, encounters, story
  'puzzle/entered': { puzzle: PuzzleId };
  'puzzle/progress': { puzzle: PuzzleId; step: number; of: number; detail: string };
  'puzzle/wrong': { puzzle: PuzzleId; detail: string };
  'puzzle/hint': { puzzle: PuzzleId | 'kept'; tier: HintTier };
  'puzzle/solved': { puzzle: PuzzleId; seconds: number };
  'asking/question': { question: 1 | 2 | 3 };
  'asking/listen': { lit: number; of: number };
  'world/hatch_powered': Record<string, never>;
  'world/on_step': { on: boolean };
  /** the player's visibility cell changed (enemies hide dormant actors whose zone is no longer drawn) */
  'world/cell': { cell: string; zone: ZoneId };
  /** a zone of the next set was built beside the resident set, or dropped again (the seam, 3.6) */
  'world/staged': { zone: ZoneId; staged: boolean };
  /** buildSet or stageZone finished: world.builtZones changed (enemies rebuild their nav graph and create the vignette actors of new zones) */
  'world/built': { set: ResidentSet; zones: number };
  'encounter/started': { id: EncounterId };
  'encounter/wave': { id: EncounterId; wave: string };
  'encounter/last_enemy': { id: EncounterId; enemy: EntityId };
  'encounter/cleared': { id: EncounterId; seconds: number };
  'encounter/reset': { id: EncounterId };
  'vignette/state': { id: VignetteId; stage: 'started' | 'ended' | 'skipped' };
  'zone/entered': { zone: ZoneId; from: ZoneId | ''; mood: MoodId };
  'story/say': { key: StoryKey };
  'story/line': { key: StoryKey; speaker: Speaker; text: string; seconds: number };
  'story/line_end': { key: StoryKey };
  'story/card': { key: StoryKey; text: string; seconds: number };
  'story/caption': { key: StoryKey; text: string; seconds: number };
  'objective/changed': { key: StoryKey; text: string };
  'checkpoint/reached': { id: CheckpointId };
  'checkpoint/saved': { id: CheckpointId; movement: number; section: number };
  'secret/found': { id: SecretId };
  'ending/lamps': { count: number };
  'ending/stone': { taken: boolean };
  'ending/fire': PosPayload;
  'ending/card': { stats: RunStats };

  // ---- ui, audio
  'ui/screen': { screen: UiScreen; open: boolean };
  'ui/hint': { key: StoryKey; show: boolean };
  'ui/action': { action: 'play' | 'continue' | 'resume' | 'restart_checkpoint' | 'quit_to_title' | 'again' };
  /** the ONLY way to ask for a sound that has no domain event of its own (there is no direct audio call) */
  'audio/cue': PosPayload & { cue: AudioCue; positional: boolean; gain: number; pitch: number };
  /** emitted by src/audio alone, derived from encounter/*, boss/phase, game/state and enemies.threat */
  'music/state': { state: 'silent' | 'calm' | 'combat' | 'boss' | 'ending'; intensity: 0 | 1 | 2 | 3 };
}
export type EventName = keyof GameEvents;
export type Unsubscribe = () => void;

export interface EventBus {
  on<K extends EventName>(name: K, handler: (payload: Readonly<GameEvents[K]>) => void): Unsubscribe;
  once<K extends EventName>(name: K, handler: (payload: Readonly<GameEvents[K]>) => void): Unsubscribe;
  /** Synchronous. Handlers run in subscription order. A throwing handler is reported and does not stop the others. */
  emit<K extends EventName>(name: K, payload: GameEvents[K]): void;
}

export type UiScreen = 'title' | 'story' | 'options' | 'credits' | 'loading' | 'pause' | 'readable' | 'death' | 'end' | 'click_to_resume';

/** Sounds with no domain event of their own, requested with the 'audio/cue' event. Everything else the audio system derives from the events above. */
export type AudioCue =
  | 'door_creak' | 'gate_bang' | 'gate_notch' | 'shutter_bang' | 'hatch_iris' | 'baffle_grind' | 'grate_clang' | 'lift_run' | 'lever_throw'
  | 'chairs_scrape' | 'locker_chime' | 'locker_open' | 'dispense' | 'ui_move' | 'ui_select' | 'ui_back' | 'checkpoint'
  | 'station_chime' | 'listen_tick' | 'ask_wrong' | 'ask_right' | 'step_chime' | 'cell_wake' | 'hum_stop' | 'water_below'
  | 'ratchet' | 'mouth_iris' | 'glow_tone' | 'haul_whine' | 'refill_gurgle' | 'dry_click_big' | 'run_down' | 'guard_slide' | 'guard_shatter'
  | 'fire_kindle' | 'wire_resolve' | 'sweep_creak' | 'sand_pour' | 'pump_clatter';

// =====================================================================================
// 7. Core services
// =====================================================================================

export type GameState = 'boot' | 'title' | 'loading' | 'playing' | 'paused' | 'dead' | 'ending';
export type PauseReason = 'menu' | 'readable' | 'focus_lost' | '';
export interface GameStateMachine {
  readonly current: GameState;
  readonly previous: GameState;
  readonly pauseReason: PauseReason;
  /** true in 'title', 'playing', 'dead' and 'ending': fixedUpdate runs. False in 'boot', 'loading' and 'paused'. */
  readonly simRunning: boolean;
  /** Returns false when the transition is not in the table (docs/ARCHITECTURE.md 3.4). */
  request(next: GameState, reason?: string, pauseReason?: PauseReason): boolean;
}

export interface GameClock {
  /** fixed ticks since boot (never scaled, never reset). It also advances while the game is paused or loading: count your own ticks in fixedUpdate, or use unscaledTime, for anything that must stop with the game */
  readonly tick: number;
  /** seconds of simulation: the sum of every dt handed to fixedUpdate */
  readonly simTime: number;
  /** FIXED_DT for every tick on which the sim ran (it stops while paused or loading, unlike tick): use for timers that must ignore slow-motion */
  readonly unscaledTime: number;
  readonly timeScale: number;
  /** rendered frames since boot */
  readonly frame: number;
  /** interpolation factor of the frame being rendered, 0..1 */
  readonly alpha: number;
  /** Lowest active request wins. Duration is in unscaled seconds. No effect with options.reduceMotion. */
  slowMotion(scale: number, realSeconds: number, reason: GameEvents['time/scale']['reason']): void;
}

/** Seeded PRNG (mulberry32). The only source of randomness in gameplay code. */
export interface Rng {
  /** [0, 1) */
  next(): number;
  range(min: number, max: number): number;
  /** integer in [0, n) */
  int(n: number): number;
  chance(p: number): boolean;
  /** independent stream; the same label always yields the same stream for a given seed */
  fork(label: string): Rng;
  readonly state: number;
}

export interface Input {
  /** Level state at the current tick. */
  held(action: Action): boolean;
  /** True for exactly one tick after the action went down (latched between ticks, so a click is never lost). */
  pressed(action: Action): boolean;
  released(action: Action): boolean;
  /** Mouse counts accumulated since the last call. Call once per rendered frame (player camera only). */
  consumeLook(out: Vec2): void;
  readonly pointerLocked: boolean;
  /** Must be called from a user gesture. Tries raw input first, then the plain request. */
  requestPointerLock(): void;
  exitPointerLock(): void;
  /** When false, gameplay actions read as up and look deltas are discarded (menus, readables). */
  setGameplayEnabled(enabled: boolean): void;
  /** Test hook and rebinding UI. Same path as real events. */
  injectCode(code: string, down: boolean): void;
  injectAction(action: Action, down: boolean): void;
  injectLook(dx: number, dy: number): void;
  /** Calls back with the next key or mouse button code pressed (rebinding); Escape cancels with ''. */
  captureNextCode(callback: (code: string) => void): void;
}

export interface OptionsStore {
  readonly value: Readonly<Options>;
  set<K extends keyof Options>(key: K, value: Options[K]): void;
  reset(): void;
}

export interface SaveStore {
  /** the last committed checkpoint of this run (also what a respawn restores) */
  readonly current: SaveData | null;
  hasStoredSave(): boolean;
  readStored(): SaveData | null;
  commit(data: SaveData): void;
  clear(): void;
}

/** Implemented by player, enemies and world. Capture returns plain JSON data. */
export interface Saveable<T> {
  captureSave(): T;
  applySave(data: T): void;
}

export type MaterialResolver = (blenderMaterialName: string, mesh: THREE.Mesh, def: AssetDef | null) => THREE.Material;

export interface LoadedAsset {
  readonly id: AssetId;
  readonly def: AssetDef;
  /** shared template: never add it to the scene, never mutate it */
  readonly scene: THREE.Object3D;
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
  readonly isPlaceholder: boolean;
}
export interface AssetInstance {
  readonly id: AssetId;
  readonly root: THREE.Object3D;
  /** null when the asset has no clips */
  readonly mixer: THREE.AnimationMixer | null;
  /** Named node, bone or empty from the manifest. Throws on a name that is not in the manifest. */
  node(name: string): THREE.Object3D;
  /** Cached action; its timeScale is preset so the clip lasts exactly the manifest's seconds. Throws on an unknown clip. */
  action(clip: string): THREE.AnimationAction;
  /** Returns the instance to the pool (removes it from its parent, stops actions). */
  release(): void;
}
export interface AssetStore {
  readonly manifest: AssetManifest;
  /** Fetch and decode everything a set needs. No GPU memory. Idempotent. */
  prefetch(set: ResidentSet | 'always', onProgress?: (loaded: number, total: number) => void): Promise<void>;
  /** Upload to the GPU and make get()/instantiate()/texture() legal. `only` restricts the step to some ids (staged swap). Uploads at most one texture per frame while the game is in 'playing'. */
  activate(set: ResidentSet | 'always', only?: readonly string[]): Promise<void>;
  /** Dispose GPU and CPU data that no other active set needs. */
  release(set: ResidentSet): void;
  isActive(id: AssetId | TextureId): boolean;
  get(id: AssetId): LoadedAsset;
  instantiate(id: AssetId): AssetInstance;
  texture(id: TextureId): THREE.Texture;
  clipSeconds(id: AssetId, clip: string): number;
  /** Installed by src/render before any asset is activated. Core's fallback makes unlit vertex-colour materials. */
  setMaterialResolver(resolver: MaterialResolver): void;
}

export interface QualityFeatures {
  /** false on 'min': no EffectComposer, tone map and grade inlined into the materials */
  composer: boolean;
  bloom: boolean;
  /** 'context_msaa' only when the WebGL context was created for 'min'; 'fxaa' is a second EffectPass on High */
  antialias: 'none' | 'context_msaa' | 'fxaa';
  sunShadowMap: boolean;
  haloScale: number;
  heatShimmer: boolean;
  sandSparkle: boolean;
  enamelFresnel: boolean;
  bladeCards: 2 | 3;
  particleScale: number;
  maxPixelRatio: number;
  minPixelRatio: number;
  /** drawing-buffer caps from design/assets.json `tiers` (the pixel ratio is clamped so neither is exceeded) */
  maxBufferHeight: number;
  maxBufferPixels: number;
  additiveOverdrawCap: number;
}
export interface QualityManager {
  /** what is running; 'min' is reached only by demotion, by detection on a very weak GPU, or by ?tier=min */
  readonly tier: RenderTier;
  readonly features: Readonly<QualityFeatures>;
  readonly pixelRatio: number;
  /** 'auto' re-runs detection. Emits 'quality/changed'. */
  setTier(tier: RenderTier | 'auto', reason: GameEvents['quality/changed']['reason']): void;
  /** Feed the real requestAnimationFrame delta. Never called in test mode. */
  onFrameTime(frameMs: number): void;
}

/** Measured numbers. All counters describe the last rendered frame unless stated. */
export interface PerfStats {
  tier: RenderTier;
  /** the visibility cell the frame was drawn from ('' on the title screen and in sandboxes without a world) */
  cell: string;
  pixelRatio: number;
  width: number;
  height: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  programs: number;
  geometries: number;
  textures: number;
  /** estimate: every resident texture (format, size, mips) plus skeleton bone textures */
  textureBytes: number;
  /** estimate: composer buffers, bloom chain, shadow map */
  renderTargetBytes: number;
  /** JS milliseconds: all fixedUpdate calls of the last frame */
  simMs: number;
  /** JS milliseconds: update + lateUpdate */
  updateMs: number;
  /** JS milliseconds: renderer submission (not GPU time) */
  renderMs: number;
  /** simMs + updateMs + renderMs */
  frameMs: number;
  /** real requestAnimationFrame delta (0 in test mode) */
  rafMs: number;
  visibleZones: number;
  enemiesAlive: number;
  particles: number;
  decals: number;
  instances: number;
  audioVoices: number;
  rays: number;
  heapBytes: number;
}
export interface PerfMonitor {
  readonly last: Readonly<PerfStats>;
  /** per-field maximum since resetPeak() */
  readonly peak: Readonly<PerfStats>;
  resetPeak(): void;
  /** JS ms per system for the last frame, in SYSTEM_ORDER */
  readonly systemMs: Float32Array;
  /** Systems write their own counters here before the frame ends (particles, decals, enemiesAlive ...). */
  readonly scratch: PerfStats;
}

export interface SceneRoots {
  readonly scene: THREE.Scene;
  /** The one world camera. Player owns its transform and FOV; render owns its aspect. */
  readonly camera: THREE.PerspectiveCamera;
  /** static zone geometry: one child group per zone, named by ZoneId; its children are the chunk meshes and drawn nodes (render toggles their .visible) */
  readonly world: THREE.Group;
  /** enemies, boss, runtime props, pickups, projectiles */
  readonly dynamic: THREE.Group;
  /** particles, decals, lines, cards: render owns the children */
  readonly fx: THREE.Group;
  /** camera space: render copies the world camera's pose onto this group and draws it in a second pass with its own 52 degree projection and a cleared depth range; whoever adds children never transforms the group */
  readonly viewModel: THREE.Group;
}

export interface RunFlags {
  /** ?test=1: no rAF loop, deterministic stepping, debug hook installed */
  readonly test: boolean;
  /** dev server or ?debug=1: perf overlay key, debug registry, extra validation */
  readonly dev: boolean;
  readonly seed: number;
  readonly tierOverride: RenderTier | null;
  readonly startCheckpoint: CheckpointId | null;
  readonly sandbox: string | null;
}

/** JSON-safe snapshot contributed by a system. Numbers rounded to 1e-4. */
export type DebugSnapshot = Record<string, unknown>;
export interface DebugRegistry {
  /** Register extra helpers under window.__dbg.ext[name]. No-op outside test/dev. */
  register(name: string, api: Record<string, (...args: never[]) => unknown>): void;
}

// =====================================================================================
// 8. Systems
// =====================================================================================

export type SystemId = 'player' | 'enemies' | 'world' | 'render' | 'audio' | 'ui';
/** fixedUpdate, update and lateUpdate all run in this order. */
export const SYSTEM_ORDER: readonly SystemId[] = ['player', 'enemies', 'world', 'render', 'audio', 'ui'];

export interface GameSystem {
  readonly id: SystemId;
  /** Called once, in SYSTEM_ORDER, after every system object exists. May await asset work. Subscribe to events here. */
  init(): void | Promise<void>;
  /** Called after the 'always' set and the first resident set are active and the level is built: create pools, warm up. */
  start?(): void | Promise<void>;
  /** 60 Hz simulation. dt = FIXED_DT * clock.timeScale. Runs only while state.simRunning. */
  fixedUpdate?(dt: number): void;
  /** Once per rendered frame, every state. frameDt is real seconds (FIXED_DT in test mode); alpha interpolates previous -> current sim state. */
  update?(frameDt: number, alpha: number): void;
  /** After every update(): anything that depends on the final camera transform. */
  lateUpdate?(frameDt: number, alpha: number): void;
  /** JSON-safe state for window.__dbg.state(). */
  debugState(): DebugSnapshot;
  dispose(): void;
}

// ---- player ----------------------------------------------------------------------------

export interface WeaponView {
  readonly phase: WeaponPhase;
  /** chamber 0 is under the hammer */
  readonly cylinder: readonly ChamberState[];
  readonly chambered: number;
  readonly reserve: number;
  readonly lineRounds: number;
  readonly seventh: SeventhState;
  readonly shotsFired: number;
  /** true while the kept round is chambered and the aim ray enters the bore target volume (the HUD plumb glyph's "legal aim" state) */
  readonly keptAimLegal: boolean;
}
/**
 * Set by src/world while the player stands on a lit proving mark in boss phase 3a (the marks are lit from its first tick); null otherwise.
 * The bore target is a vertical cylinder (layout marker bore_opening params.volume): the kept round fires when the aim ray
 * enters it. The player tests the ray against this cylinder analytically; no collider (kerb, guard, boss) takes part.
 */
export interface KeptContext {
  mark: MarkerId;
  markX: number; markY: number; markZ: number;
  leaveRadius: number;
  boreX: number; boreZ: number;
  boreTopY: number; boreBottomY: number;
  boreRadius: number;
}
/** Cheats for the debug hook and tests. Only src/core/debugHook.ts and test code may call a system's `debug` surface. */
export interface PlayerDebug {
  setHealth(hp: number): void;
  /** `chambered` lead rounds under and after the hammer, the rest of the cylinder empty */
  setAmmo(chambered: number, reserve: number, lineRounds: number): void;
  /** Set the view direction exactly (degrees; yaw 0 faces -Z, positive yaw turns left; positive pitch looks up). */
  setAim(yawDeg: number, pitchDeg: number): void;
  setSeventh(state: SeventhState): void;
}
export interface PlayerApi {
  /** feet, current sim state */
  readonly position: Readonly<Vec3>;
  readonly velocity: Readonly<Vec3>;
  /** interpolated eye position of the frame being rendered */
  readonly eye: Readonly<Vec3>;
  /** unit view direction */
  readonly forward: Readonly<Vec3>;
  readonly yaw: number;
  readonly pitch: number;
  readonly grounded: boolean;
  readonly sprinting: boolean;
  readonly alive: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly weapon: WeaponView;
  /** Returns the damage actually applied (after difficulty, absorb, grace, god mode). */
  applyDamage(info: Readonly<DamageInfo>): number;
  /** Returns false when the pickup was ignored (canteen at full health, reserve at cap). */
  givePickup(kind: PickupKind): boolean;
  /** Tops the reserve up to `floor` (refill box) or adds `amount`. Returns rounds added. */
  giveLead(amount: number, floor: number): number;
  /** Returns rounds accepted (carry cap 2). */
  giveLineRounds(amount: number): number;
  /** The stone: plays take_round and sets the seventh to 'violet'. */
  takeStoneRound(): void;
  setKeptContext(context: KeptContext | null): void;
  teleport(x: number, y: number, z: number, yawDeg: number, pitchDeg: number): void;
  /** Movement and weapon input off (rides, death, ending). Look stays on unless lockLook. */
  setControl(enabled: boolean, reason: string, lockLook?: boolean): void;
  setGodMode(on: boolean): void;
  readonly debug: PlayerDebug;
}
export interface PlayerSystem extends GameSystem, PlayerApi, Saveable<PlayerSave> { readonly id: 'player' }

// ---- enemies ---------------------------------------------------------------------------

export interface SpawnRequest {
  kind: EnemyKind;
  spawn: MarkerId;
  encounter: EncounterId | '';
  wave: string;
  /** vignette loop to hold until wake() ('scoop_kneel', 'sit_table', 'queue_stand', 'pound_bulkhead'); '' = active at once */
  dormantClip: string;
  /** 'doorway' | 'emerge' | 'climb_out' | 'rise' */
  entrance: string;
  lane: MarkerId | '';
  /** file order for lane followers; 0 otherwise */
  order: number;
  counted: boolean;
}
export interface EnemyView {
  id: EntityId;
  kind: EnemyKind;
  state: string;
  hp: number;
  x: number; y: number; z: number;
  yaw: number;
  encounter: EncounterId | '';
  alive: boolean;
  hasToken: boolean;
}
export interface BossView {
  readonly phase: BossPhase;
  readonly pips: number;
  readonly pipsTotal: number;
  readonly armBay: number;
  readonly guard: GuardState;
  readonly mouthsOpen: number;
  readonly marksLit: boolean;
  readonly hush: boolean;
}
export interface EnemiesApi {
  /** Returns '' when the alive cap or pool is exhausted (the director retries next tick). */
  spawn(request: Readonly<SpawnRequest>): EntityId;
  /** Dormant enemy leaves its vignette loop (plays its rise clip, then approaches). */
  wake(id: EntityId): void;
  wakeEncounter(encounter: EncounterId): void;
  /** Remove every live enemy and projectile of an encounter without events (respawn, reset). */
  clearEncounter(encounter: EncounterId): void;
  clearAll(): void;
  aliveCount(encounter: EncounterId | ''): number;
  /** sum of threat of everything alive and awake (drives music intensity) */
  readonly threat: number;
  /** Copies up to out.length views; returns the count. Debug, tests and UI only. */
  list(out: EnemyView[]): number;
  /** Starts the Windlass encounter (parley unless heard). World calls it when the bore door is crossed. */
  startBoss(fromPhase: BossPhase, parleyHeard: boolean): void;
  readonly boss: BossView;
  /**
   * Plays a non-combat scene with enemy actors. The anchor is the layout marker whose params.vignette.id is `id`:
   * vig_kneeler (sp_street_kneeler), vig_yard_bell (sp_yard_t1), vig_tamper (trg_hall_gantry), vig_dowser (trg_dowser: the card),
   * vig_watcher (trg_watcher: the seated actor at prop_watcher, which enemies create when the_gallery is built).
   */
  playVignette(id: VignetteId): void;
  setAiEnabled(on: boolean): void;
  readonly debug: EnemiesDebug;
}
export interface EnemiesDebug {
  /** Spawn an active enemy at a point, outside any encounter. Returns '' when the pool is exhausted. */
  spawnAt(kind: EnemyKind, x: number, y: number, z: number, yawDeg: number): EntityId;
  /** Fells or kills everything alive through the normal death path (events fire, encounters count). freed = true frees Biders instead. Returns the count. */
  killAll(freed: boolean): number;
  /** Jump the Windlass to the start of a phase with the state that phase starts in (pips, guard, marks). */
  setBossPhase(phase: BossPhase): void;
  /** Attack-token holders, for tests of the token rule. */
  tokens(): { melee: EntityId[]; ranged: EntityId[]; heavy: EntityId[] };
}
export interface EnemySystem extends GameSystem, EnemiesApi, Saveable<EnemiesSave> { readonly id: 'enemies' }

// ---- world -----------------------------------------------------------------------------

export interface PuzzleView { id: PuzzleId; solved: boolean; step: number; of: number; hintTier: 0 | HintTier; secondsIdle: number; data: Record<string, number | boolean | string> }
export interface EncounterView { id: EncounterId; state: EncounterState; wave: string; alive: number; spawned: number; seconds: number }
export interface WorldDebug {
  /** Put a puzzle in its solved state through the same path the last correct input takes (doors open, lines are skipped). */
  solvePuzzle(id: PuzzleId): void;
  /** Mark an encounter cleared: remaining members are removed, onClear runs (checkpoint, doors, objective), no drops. */
  clearEncounter(id: EncounterId): void;
  /** Every world flag that is currently true, sorted. */
  flags(): string[];
}
export interface WorldApi {
  /** data.zoneAt(player feet, residentSet): on the peg-stair seam this is tally_house until trg_set_swap, the_gallery after */
  readonly zone: ZoneId;
  /** id of the visibility cell the player is in (design/assets.json visibility.cells) */
  readonly cell: string;
  readonly residentSet: ResidentSet;
  /** zones whose colliders, markers and props exist right now: the resident set's zones plus a staged zone (3.6) */
  readonly builtZones: readonly ZoneId[];
  readonly mood: MoodId;
  readonly objective: StoryKey;
  readonly checkpoint: CheckpointId;
  readonly stats: Readonly<RunStats>;
  /** 9 + freed, clamped to 48 */
  readonly lamps: number;
  puzzle(id: PuzzleId): Readonly<PuzzleView>;
  encounter(id: EncounterId): Readonly<EncounterView>;
  doorState(id: MarkerId): DoorState;
  /** Named boolean world facts, saved with the run: 'hatch_powered', 'cell_lit', 'boss_dead', the once-only line flags, and the 'did_<action>' flags the lazy key hints read ('did_move', 'did_fire', 'did_reload', 'did_sprint', 'did_interact', 'did_line'). */
  flag(name: string): boolean;
  /** Drops (enemy deaths, the ammo floor, boss adds). */
  spawnPickup(kind: PickupKind, x: number, y: number, z: number): void;
  /** Make exactly this set's zones the built ones: zones of the set that are already built (staged) are kept, every other zone is torn down. Colliders are rebuilt once. */
  buildSet(set: ResidentSet): Promise<void>;
  /** Build one zone of another set beside the resident set (its assets must be active): colliders, markers, triggers, props, nav. The seam uses it for the_gallery. */
  stageZone(zone: ZoneId): Promise<void>;
  /** New run from the start, or resume the stored save. */
  beginRun(fromSave: SaveData | null): Promise<void>;
  /** Reload the last committed checkpoint (death, pause menu, debug). */
  restoreCheckpoint(): Promise<void>;
  /** Debug and tests: jump to any checkpoint with a plausible state for it. */
  warpToCheckpoint(id: CheckpointId): Promise<void>;
  readonly debug: WorldDebug;
}
export interface WorldSystem extends GameSystem, WorldApi, Saveable<WorldSave> { readonly id: 'world' }

// ---- render ----------------------------------------------------------------------------

export type VfxId =
  | 'impact_sand' | 'impact_wood' | 'impact_adobe' | 'impact_metal' | 'impact_ceramic' | 'impact_stone' | 'impact_cloth'
  | 'powder_smoke' | 'knot_burst' | 'bider_freed' | 'bider_felled' | 'transit_death' | 'vent_open' | 'stake_stick' | 'stake_burst'
  | 'slam_dust' | 'charge_sparks' | 'plate_spark' | 'canister_burst' | 'guard_shatter' | 'jug_burst' | 'insulator_break' | 'bottle_break'
  | 'pickup_glint' | 'lamp_answer' | 'dust_short' | 'embers' | 'steam' | 'lance_sparks';
export type LineKind = 'tracer' | 'ricochet' | 'line_round' | 'sighting_thread' | 'lance_thread' | 'relight_thread' | 'standing_line' | 'aqua_thread';
export type FlashKind = 'lead' | 'line' | 'kept';
export type RingKind = 'slam' | 'canister';
export type CardKind = 'sun_blade' | 'sun_patch' | 'lance' | 'mouth_glow' | 'aim_star' | 'halo' | 'last_fire' | 'dowser_glint' | 'sand_thread';

/** Handle to a pooled persistent effect. Calling any method after release() is a no-op. */
export interface FxHandle {
  setPosition(x: number, y: number, z: number): void;
  setEnd(x: number, y: number, z: number): void;
  /** 0..1 fill / progress / intensity, meaning per effect */
  setLevel(level: number): void;
  setVisible(visible: boolean): void;
  release(): void;
}
export interface VfxApi {
  /** One-shot particle effect at a point, oriented along a normal. */
  burst(id: VfxId, x: number, y: number, z: number, nx: number, ny: number, nz: number, scale?: number): void;
  /** Bullet decal from the pool of 48 (sand takes none). */
  decal(surface: SurfaceType, x: number, y: number, z: number, nx: number, ny: number, nz: number): void;
  /** One-shot constant-pixel-width line that fades by itself (tracer 2 frames, line round 1.2 s + 0.3 s). */
  line(kind: LineKind, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void;
  /** Persistent line; the caller moves and releases it. Returns null when the pool for that kind is empty. */
  acquireLine(kind: LineKind): FxHandle | null;
  /** Ticked ground ring (r metres) that fills over fillSeconds, then holds holdSeconds and releases itself. */
  ring(kind: RingKind, x: number, y: number, z: number, radius: number, fillSeconds: number, holdSeconds: number): void;
  /** Persistent additive card or sprite. */
  acquireCard(kind: CardKind): FxHandle | null;
  /** Flash sprite at the view-model muzzle plus the world light pulse and the pooled point light. */
  muzzleFlash(kind: FlashKind, x: number, y: number, z: number): void;
  /** Radial term in the world shader (shared by the muzzle pulse and the ring at the seventh). */
  pulse(x: number, y: number, z: number, radius: number, seconds: number, r: number, g: number, b: number): void;
  /** The ring at the seventh: radius 0 -> 40 m in 1.6 s, wrong_fade 0 -> 1 behind it (a slow tint with reduceFlashes). */
  provingRing(x: number, y: number, z: number): void;
  /** One blob shadow quad from the instanced pool (min and Low everywhere; High indoors only: outdoors the sun shadow map replaces it and the handle is a no-op). */
  blobShadow(): FxHandle | null;
}
export type InstanceHandle = number;
export interface InstanceApi {
  /**
   * Adds one instance of (asset, node) at a world transform. One InstancedMesh per (asset, node): one draw call. Returns -1 when the asset is not active.
   * An instance takes its ambient and key from the zone that contains it at add() time, baked into its instance colour (an instanced set can span zones;
   * instances never move between zones). setTint multiplies on top of that.
   */
  add(asset: AssetId, node: string, x: number, y: number, z: number, rotYRad: number, scale: number): InstanceHandle;
  setTransform(h: InstanceHandle, x: number, y: number, z: number, rotYRad: number, scale: number): void;
  setMatrix(h: InstanceHandle, m: THREE.Matrix4): void;
  /** Multiplies the instance colour (jitter, cooling stakes). */
  setTint(h: InstanceHandle, r: number, g: number, b: number): void;
  setVisible(h: InstanceHandle, visible: boolean): void;
  remove(h: InstanceHandle): void;
}
export interface LampApi {
  /** Lamp i of a lamp-set mesh is lit when bit i of mask is set (sets of up to 32). */
  setMask(lampSet: THREE.Object3D, mask: number): void;
  /** Lamps 0 .. count-1 lit (any size; town windows, listening ring). */
  setCount(lampSet: THREE.Object3D, count: number): void;
  /** Over-bright factor for the 150 ms "answer" blink and hint pulses; 1 = normal. */
  setBoost(lampSet: THREE.Object3D, boost: number): void;
}
export interface RenderApi {
  readonly renderer: THREE.WebGLRenderer;
  readonly vfx: VfxApi;
  readonly instances: InstanceApi;
  readonly lamps: LampApi;
  /** The single material factory (also installed as the AssetStore resolver). */
  material(blenderMaterialName: string, mesh: THREE.Mesh, def: AssetDef | null): THREE.Material;
  /** Called by the loop after lateUpdate. */
  render(frameDt: number, alpha: number): void;
  resize(cssWidth: number, cssHeight: number): void;
  /**
   * The units that should be drawn: zone chunks and chunkless world-space assets (design/assets.json visibility.units) plus plug nodes.
   * Everything else under SceneRoots.world is hidden. World calls it when the player's cell, a door named in a rule, or a flag changes.
   */
  setVisible(units: readonly string[]): void;
  unitVisible(unit: string): boolean;
  /** true when any chunk of the zone is drawn */
  zoneVisible(zone: ZoneId): boolean;
  /** Cross-fades fog, sky, grade, dynamic ambient and key to a mood (ART_BIBLE 3 and 11.1). */
  setMood(mood: MoodId, seconds: number): void;
  /** Extra exposure multiplier on top of the mood (the 20 s glare ramp, the Tally entry). */
  setExposure(multiplier: number, seconds: number): void;
  /** Weight 0..1 of a light layer texture (lm_tally_hatch, lm_bore_glow). */
  setLightLayer(texture: TextureId, weight: number, seconds: number): void;
  /** 0 = wrong (violet), 1 = proven (aqua). The proving ring drives it; saves restore it with this. */
  setWrongFade(value: number): void;
  /** Emissive multiplier of one dynamic object (a dead Transit's lens, a freed Bider's knot). */
  setEmissive(object: THREE.Object3D, scale: number): void;
  /** Camera trauma 0..1 (rotational shake), scaled by options.screenShake; decays 1.8 per second. */
  addTrauma(amount: number): void;
  /** Screen-space outline pulse on an object (hint tier 3). null clears. */
  setOutline(object: THREE.Object3D | null): void;
  /** Sky parameters the story changes: the Rule's lean in degrees and the plumb thread from the town. */
  setSky(ruleLeanDeg: number, threadVisible: boolean): void;
  /** Compile programs, upload textures and draw one hidden frame with every zone of the active set visible. */
  warmUp(): Promise<void>;
  /** Fill-rate benchmark used by the quality manager behind the loading screen: median ms per full-screen pass. */
  benchmark(): Promise<number>;
  /** Render now and return a PNG data URL (tests). */
  capture(): string;
  /** Fills the renderer-side fields of PerfStats for the frame just drawn. */
  collectStats(out: PerfStats): void;
}
export interface RenderSystem extends GameSystem, RenderApi { readonly id: 'render' }

// ---- audio, ui -------------------------------------------------------------------------

export interface AudioApi {
  /** Call inside the first user gesture. Safe to call repeatedly. */
  unlock(): void;
  readonly unlocked: boolean;
  /** Sounding voices (perf overlay, tests). */
  readonly voices: number;
  /** Names of the last `n` sounds started with their sim tick (tests assert "no bullet produces nothing"). */
  recent(n: number): { name: string; tick: number }[];
}
export interface AudioSystem extends GameSystem, AudioApi { readonly id: 'audio' }

export interface UiApi {
  /** True while a menu, readable or card owns the keyboard. */
  readonly modalOpen: boolean;
  /** Current top screen, '' during play. */
  readonly screen: UiScreen | '';
  /** Text currently on screen, for tests: subtitle lines, caption, prompt, objective, hint, card. */
  visibleText(): { subtitle: string; speaker: string; caption: string; prompt: string; hint: string; card: string; checkpoint: string };
}
export interface UiSystem extends GameSystem, UiApi { readonly id: 'ui' }

// ---- factories (each module's index.ts exports exactly one) ------------------------------

export type CreatePlayerSystem = (ctx: GameContext) => PlayerSystem;      // src/player/index.ts   createPlayerSystem
export type CreateEnemySystem = (ctx: GameContext) => EnemySystem;        // src/enemies/index.ts  createEnemySystem
export type CreateWorldSystem = (ctx: GameContext) => WorldSystem;        // src/world/index.ts    createWorldSystem
export type CreateRenderSystem = (ctx: GameContext, canvas: HTMLCanvasElement) => RenderSystem; // src/render/index.ts createRenderSystem
export type CreateAudioSystem = (ctx: GameContext) => AudioSystem;        // src/audio/index.ts    createAudioSystem
export type CreateUiSystem = (ctx: GameContext, root: HTMLElement) => UiSystem;                 // src/ui/index.ts     createUiSystem

// =====================================================================================
// 9. The context
// =====================================================================================

export interface GameContext {
  readonly flags: RunFlags;
  readonly data: GameData;
  readonly events: EventBus;
  readonly clock: GameClock;
  readonly rng: Rng;
  readonly state: GameStateMachine;
  readonly input: Input;
  readonly options: OptionsStore;
  readonly save: SaveStore;
  readonly assets: AssetStore;
  readonly quality: QualityManager;
  readonly collision: CollisionWorld;
  readonly scene: SceneRoots;
  readonly perf: PerfMonitor;
  readonly debug: DebugRegistry;
  // Systems. The composition root assigns each one right after its factory returns; until then the field holds
  // core's inert stub. A factory must not call another system: cross-system calls are legal from init() onward.
  readonly player: PlayerApi;
  readonly enemies: EnemiesApi;
  readonly world: WorldApi;
  readonly render: RenderApi;
  readonly audio: AudioApi;
  readonly ui: UiApi;
}
/** What the composition root and sandboxes see: system slots are writable. */
export type MutableGameContext = { -readonly [K in keyof GameContext]: GameContext[K] };

// =====================================================================================
// 10. The debug hook (window.__dbg, present with ?test=1 or on the dev server)
// =====================================================================================

export interface DebugStepResult { tick: number; simTime: number; state: GameState }
/** Data-only condition, so it can cross page.evaluate. `path` is a dotted path into DebugState. */
export type DebugCondition =
  | { event: EventName; where?: Record<string, string | number | boolean> }
  | { path: string; op: '==' | '!=' | '<' | '<=' | '>' | '>='; value: string | number | boolean }
  | { state: GameState };
export interface DebugUntilResult extends DebugStepResult { met: boolean; steps: number }
export interface LoggedEvent { seq: number; tick: number; name: EventName; payload: Record<string, unknown> }
export interface DebugPlayerState {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; yawDeg: number; pitchDeg: number;
  grounded: boolean; sprinting: boolean; alive: boolean; health: number; zone: ZoneId;
  phase: WeaponPhase; cylinder: ChamberState[]; chambered: number; reserve: number; lineRounds: number; seventh: SeventhState; god: boolean;
}
export interface DebugState {
  tick: number;
  simTime: number;
  game: GameState;
  seed: number;
  rngState: number;
  player: DebugPlayerState;
  enemies: EnemyView[];
  boss: { phase: BossPhase; pips: number; pipsTotal: number; armBay: number; guard: GuardState; mouthsOpen: number; marksLit: boolean; hush: boolean };
  puzzles: Record<PuzzleId, PuzzleView>;
  encounters: Record<EncounterId, EncounterView>;
  world: { zone: ZoneId; cell: string; set: ResidentSet; builtZones: ZoneId[]; mood: MoodId; objective: StoryKey; checkpoint: CheckpointId; lamps: number; doors: Record<MarkerId, DoorState>; flags: string[] };
  stats: RunStats;
  ui: { screen: UiScreen | ''; subtitle: string; speaker: string; caption: string; prompt: string; hint: string; card: string; checkpoint: string };
  /** each system's own debugState() */
  systems: Record<SystemId, DebugSnapshot>;
}
/** Why a walk ended. 'gate' = a closed door on the path; 'portal' = the path continues through a lift ride; 'state' = the game left 'playing'. */
export type DebugWalkReason = 'arrived' | 'stuck' | 'max_ticks' | 'gate' | 'portal' | 'dead' | 'state' | 'no_path';
export interface DebugWalkOptions {
  sprint?: boolean;
  /** default 3600 */
  maxTicks?: number;
  /** default 0.4 m (horizontal) */
  stopRadius?: number;
  /** keep the current pitch instead of looking level along the path */
  keepPitch?: boolean;
}
export interface DebugWalkResult {
  arrived: boolean; reason: DebugWalkReason; ticks: number;
  x: number; y: number; z: number;
  /** where progress stopped (reason 'stuck'), else null */
  stuckAt: { x: number; y: number; z: number } | null;
  /** last nav node reached, '' for walkTo */
  node: string;
  /** the door that stopped the walk (reason 'gate'), else '' */
  gate: MarkerId | '';
}
export interface DebugHook {
  readonly version: 2;
  /** set last: assets active, level built, first frame drawn */
  ready: boolean;
  /** first uncaught error or console.error text, or null */
  error: string | null;

  // ---- time
  /** Advance n fixed ticks (default 1) with the held input; draw the final state unless render is false. */
  step(n?: number, render?: boolean): DebugStepResult;
  /** Step until the condition holds or maxSteps ticks pass. Never renders. */
  stepUntil(condition: DebugCondition, maxSteps: number): DebugUntilResult;
  /** Start or stop the real-time requestAnimationFrame loop (off by default in test mode). */
  setRealtime(on: boolean): void;
  /** Reseed every RNG stream. Call before start(). */
  seed(n: number): void;

  // ---- flow
  /** Title -> playing without a click. Resolves when control is given. */
  start(options?: { checkpoint?: CheckpointId; difficulty?: Difficulty }): Promise<DebugStepResult>;
  /** Warp to a checkpoint mid-run (swaps resident set if needed). */
  checkpoint(id: CheckpointId): Promise<DebugStepResult>;
  pause(on: boolean): void;
  setOption<K extends keyof Options>(key: K, value: Options[K]): void;
  setTier(tier: RenderTier): void;

  // ---- input
  /** Replace the held set with KeyboardEvent.code / 'Mouse0' values. */
  setKeys(codes: string[]): void;
  /** Replace the held set with actions (independent of bindings). */
  setActions(actions: Action[]): void;
  /** Hold an action for exactly `ticks` ticks starting at the next step (default 1), then release it. */
  tap(action: Action, ticks?: number): void;
  /** Mouse counts applied on the next step (positive x = turn right, positive y = look down). */
  look(dx: number, dy: number): void;
  /** Set the view direction exactly. */
  setAim(yawDeg: number, pitchDeg: number): void;
  /** Aim the eye at a world point; errorM adds a seeded lateral miss of that many metres. */
  aimAt(x: number, y: number, z: number, errorM?: number): void;
  /** Aim at an entity's hit volume centre ('crown', 'lens', ...). Returns false when the entity or part does not exist. */
  aimAtEntity(id: EntityId, part?: HitPart, errorM?: number): boolean;
  /** Aim at a layout marker's position. */
  aimAtMarker(id: MarkerId): boolean;

  // ---- movement by input (the player really walks: collision, step-up, doors and triggers behave as for a person)
  /**
   * Walk in a straight line to (x, z): each tick turn to face it, hold 'forward' (and 'sprint') through the real input path, step once.
   * Stops within stopRadius, when no progress is made for 45 ticks ('stuck'), on death, or at maxTicks. Never renders.
   */
  walkTo(x: number, z: number, options?: DebugWalkOptions): DebugWalkResult;
  /**
   * Walk the nav graph by walkTo from node to node. `to` is a nav node id, a marker id (its nearest node) or 'critical' (the rest of
   * nav.criticalPath from the nearest node on it). Stops with 'gate' in front of a link whose door is not open and with 'portal' at a
   * lift ride (throw the lever with tap('interact'), step through the ride, call again).
   */
  followPath(to: string, options?: DebugWalkOptions): DebugWalkResult;
  /** data.navPath: node ids from one node or marker to another, ignoring door states. */
  navPath(from: string, to: string): string[];

  // ---- cheats
  teleport(x: number, y: number, z: number, yawDeg?: number, pitchDeg?: number): void;
  teleportToMarker(id: MarkerId, yawDeg?: number): boolean;
  god(on: boolean): void;
  setHealth(hp: number): void;
  setAmmo(chambered: number, reserve: number, lineRounds: number): void;
  aiEnabled(on: boolean): void;
  /** Spawn at a point (sandboxes and feel tests). Returns the id, '' on failure. */
  spawnEnemy(kind: EnemyKind, x: number, y: number, z: number, yawDeg?: number): EntityId;
  /** Fells or kills everything alive; with freed = true Biders are freed instead. */
  killAll(freed?: boolean): number;
  solvePuzzle(id: PuzzleId): void;
  clearEncounter(id: EncounterId): void;
  setBossPhase(phase: BossPhase): void;
  emit<K extends EventName>(name: K, payload: GameEvents[K]): void;

  // ---- queries
  state(): DebugState;
  player(): DebugPlayerState;
  enemies(): EnemyView[];
  puzzles(): Record<PuzzleId, PuzzleView>;
  objectives(): { current: StoryKey; text: string; checkpoint: CheckpointId };
  /** Counters of the last rendered frame (call after step(n, true)). */
  perf(): PerfStats;
  /** Per-field maxima since perfReset(). */
  perfPeak(): PerfStats;
  perfReset(): void;
  /** Steps `ticks` ticks rendering every one and returns the peak (worst-tick budgets). */
  perfRun(ticks: number): PerfStats;
  /** Events since `sinceSeq` (exclusive), oldest first; the ring holds the last 4096. */
  events(sinceSeq?: number, nameFilter?: string): LoggedEvent[];
  clearEvents(): void;
  /** FNV-1a of state() without the perf-dependent parts: equal across runs and across tiers. */
  hash(): string;
  /** Ray from the eye along the aim: what the next shot would hit. */
  probe(): { hit: boolean; distance: number; entityId: EntityId; entityKind: EntityKind; part: HitPart; surface: SurfaceType; x: number; y: number; z: number };
  /** Render now and return a PNG data URL. */
  capture(): string;
  /** Helpers registered by systems through ctx.debug.register(). */
  ext: Record<string, Record<string, (...args: never[]) => unknown>>;
}
declare global {
  interface Window { __dbg?: DebugHook }
}
