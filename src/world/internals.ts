// src/world/internals.ts: the shared types and the one mutable state object of the world piece (ARCHITECTURE 1.2).
// The files of src/world talk through this file, never by importing each other: index.ts creates the State, every
// other file exports one `create<Module>(s)` factory whose result index.ts hangs on the State.
import type * as THREE from 'three';
import { FIXED_DT, Layer, PLAYER_EYE } from '../core/contracts.ts';
import type {
  BossPhase,
  AssetBinding, AssetInstance, AudioCue, CheckpointId, DamageInfo, DoorState, EncounterId, EncounterView, EntityKind, EntityRef, FxHandle,
  GameContext, GameEvents, HintTier, HitReceiver, HitResponse, HitResult, LayoutMarker, MarkerId, MoodId, PickupKind, PuzzleId,
  PuzzleSave, PuzzleView, ResidentSet, Rng, RunStats, SaveData, StoryKey, SurfaceType, VignetteId, VolumeHandle, WorldSave, ZoneId,
} from '../core/contracts.ts';
import { DEG2RAD } from '../core/math.ts';

export const PUZZLES: readonly PuzzleId[] = ['seven_jugs', 'daylight', 'proving_line', 'the_asking'];
export const ENCOUNTERS: readonly EncounterId[] = ['enc_street', 'enc_yard', 'enc_tally', 'enc_file', 'enc_matador', 'enc_windlass'];
/** 9 seated at the Tally table who never rose (GDD 4.4); the town card has 48 window quads. */
export const LAMPS_BASE = 9;
export const LAMPS_MAX = 48;

/**
 * The lamps lit in Plenty: 9 + freed, at most 48. One count is never shown or said: nineteen (docs/research/art-tone.md
 * 1.5 "Numbers": the homage keeps that number off prominent display). Ten freed light twenty: somebody lit one more.
 */
export const LAMPS_SKIPPED = 19;
export function lampCount(freed: number): number {
  const n = Math.min(LAMPS_MAX, LAMPS_BASE + Math.max(0, freed));
  return n === LAMPS_SKIPPED ? n + 1 : n;
}

export function emptyStats(): RunStats {
  return { playSeconds: 0, roundsFired: 0, roundsHit: 0, knotsBurst: 0, linesOfThree: 0, cleanSix: false, secrets: [], freed: 0, felled: 0, deaths: 0, tookStoneRound: false };
}

/** Is a point inside a marker volume (pos = centre of the bottom face, size before rotY)? */
export function inVolume(m: LayoutMarker, x: number, y: number, z: number): boolean {
  const size = m.size;
  if (!size) return false;
  const dy = y - m.pos[1];
  if (dy < -0.01 || dy > size[1]) return false;
  const dx = x - m.pos[0], dz = z - m.pos[2];
  if (m.rotY === 0) return Math.abs(dx) <= size[0] / 2 && Math.abs(dz) <= size[2] / 2;
  const r = m.rotY * DEG2RAD, c = Math.cos(r), s = Math.sin(r);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= size[0] / 2 && Math.abs(lz) <= size[2] / 2;
}

/** A string list in a marker's params (`lines`, `cards`); [] for anything else (an object of named lines belongs to its owner). */
export function paramList(m: LayoutMarker, key: string): readonly string[] {
  const v = m.params[key];
  return Array.isArray(v) ? (v as string[]) : EMPTY;
}
const EMPTY: readonly string[] = Object.freeze([]);
export function paramString(m: LayoutMarker, key: string): string {
  const v = m.params[key];
  return typeof v === 'string' ? v : '';
}
export function paramNumber(m: LayoutMarker, key: string, fallback: number): number {
  const v = m.params[key];
  return typeof v === 'number' ? v : fallback;
}
/** A named line of a marker whose `lines` is an object ({ firstJug: 'nar_jugs_sand' }). */
export function namedLine(m: LayoutMarker | undefined, group: string, name: string): string {
  if (!m) return '';
  const v = m.params[group];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
  const k = (v as Record<string, unknown>)[name];
  return typeof k === 'string' ? k : '';
}

/** The checkpoints two puzzles commit when they are solved (GDD 18: "jug gate open", "proving_line solved"). */
export const PUZZLE_CHECKPOINT: Readonly<Partial<Record<PuzzleId, CheckpointId>>> = { seven_jugs: 'cp_lip_gate', proving_line: 'cp_gallery_baffle' };

/** Whoever owns shootable volumes: one call per round that meets one. Must fill `out` completely. */
export interface ShotOwner {
  onShot(shot: Shot, hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void;
}
/** A shootable world thing: one hit volume on Layer.SHOOTABLE with its receiver (ARCHITECTURE 6). */
export class Shot implements HitReceiver {
  volume: VolumeHandle = -1;
  readonly ref: EntityRef;
  x = 0; y = 0; z = 0;
  radius = 0.2;
  enabled = true;
  constructor(private readonly owner: ShotOwner, readonly id: MarkerId, kind: EntityKind, readonly index: number, readonly marker: LayoutMarker | null) {
    this.ref = { id, kind };
  }
  onHit(hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    out.outcome = 'impact'; out.stops = true; out.stopsLine = true; out.damageDealt = 0; out.healthLeft = 0;
    this.owner.onShot(this, hit, damage, out);
  }
  /** create the sphere volume (flags: ColFlag bits, e.g. PIERCE for a range plate) */
  add(s: State, x: number, y: number, z: number, radius: number, surface: SurfaceType, flags: number): this {
    const col = s.ctx.collision;
    if (this.volume < 0) this.volume = col.addVolume({ shape: 'sphere', layer: Layer.SHOOTABLE, flags, surface, entity: this.ref, part: 'whole', priority: 0, receiver: this });
    this.move(s, x, y, z, radius);
    col.setVolumeEnabled(this.volume, this.enabled);
    return this;
  }
  move(s: State, x: number, y: number, z: number, radius = this.radius): void {
    this.x = x; this.y = y; this.z = z; this.radius = radius;
    if (this.volume >= 0) s.ctx.collision.setSphere(this.volume, x, y, z, radius);
  }
  enable(s: State, on: boolean): void {
    this.enabled = on;
    if (this.volume >= 0) s.ctx.collision.setVolumeEnabled(this.volume, on);
  }
  remove(s: State): void {
    if (this.volume >= 0) s.ctx.collision.removeVolume(this.volume);
    this.volume = -1;
  }
}
/** distance from a point to the ray a round travelled (origin and unit direction in the DamageInfo) */
export function rayDistance(d: Readonly<DamageInfo>, x: number, y: number, z: number): number {
  const px = x - d.ox, py = y - d.oy, pz = z - d.oz;
  const t = Math.max(0, px * d.dx + py * d.dy + pz * d.dz);
  const cx = px - d.dx * t, cy = py - d.dy * t, cz = pz - d.dz * t;
  return Math.sqrt(cx * cx + cy * cy + cz * cz);
}

/** The door a puzzle opens: the door marker that names it (`puzzle`, or an `opensOn` text that starts with its id). */
export function doorOfPuzzle(s: State, id: PuzzleId): MarkerId {
  for (const m of s.ctx.data.markersOfType('door')) {
    if (m.params.puzzle === id) return m.id;
    const on = m.params.opensOn;
    if (typeof on === 'string' && on.startsWith(id)) return m.id;
  }
  return '';
}
/** A lamp-set node of the instance a marker is drawn by (`name`, or the asset's first lamp set). Null when not built. */
export function lampNode(s: State, marker: MarkerId, name = ''): THREE.Object3D | null {
  if (name !== '') return s.build.node(marker, name);
  const inst = s.build.instance(marker);
  if (!inst) return null;
  const sets = s.ctx.data.manifest.assets[inst.id]?.lampSets;
  const first = sets ? Object.keys(sets)[0] : undefined;
  return first ? inst.node(first) : null;
}

/** One (marker, binding) the build instantiated: an AssetInstance of its own, or one instance of an instanced set. */
export interface Placed {
  marker: LayoutMarker;
  binding: AssetBinding;
  zone: ZoneId;
  /** the visibility unit (zone chunk) it stands in; '' = drawn while any chunk of its zone is */
  unit: string;
  inst: AssetInstance | null;
  /** token of the instanced registry (build.inst*), -1 when it has an AssetInstance */
  token: number;
  x: number; y: number; z: number; rot: number; scale: number;
}

/** A puzzle (src/world/puzzles/<id>.ts). Elements exist only while their zone is built. */
export interface Puzzle {
  readonly id: PuzzleId;
  readonly view: PuzzleView;
  readonly zone: ZoneId;
  /** the zone was built: create volumes and cards, put every element in the puzzle's current state */
  attach(): void;
  detach(): void;
  /** a new run */
  reset(): void;
  tick(dt: number): void;
  capture(): PuzzleSave;
  apply(save: PuzzleSave | undefined): void;
  /** what a plausible save of the solved puzzle holds (warpToCheckpoint) */
  solvedSave(): PuzzleSave;
  /** WorldDebug.solvePuzzle: the path the last correct input takes, doors at once, lines skipped */
  solve(): void;
  /** debug: add seconds to the hint clock */
  addHintSeconds(seconds: number): void;
}

export interface BuildApi {
  buildSet(set: ResidentSet): Promise<void>;
  stageZone(zone: ZoneId): Promise<void>;
  /** the set (and seam stage) a checkpoint needs; null when everything finished synchronously */
  ensureFor(checkpoint: CheckpointId, hatchPowered: boolean): Promise<void> | null;
  swapTo(set: ResidentSet): Promise<void> | null;
  /** the swap during play: spread over ticks when she plays in real time; `onBuilt` on the tick the new set's colliders are in */
  swapInPlay(set: ResidentSet, onBuilt: (() => void) | null): Promise<void> | null;
  /** `inPlay`: the day-cell lit while she plays (may be spread over ticks); a restore never passes it */
  enterSeam(inPlay?: boolean): Promise<void> | null;
  leaveSeam(): void;
  track(p: Promise<void> | null): Promise<void>;
  readonly busy: boolean;
  /** the hatch has power and the staged gallery is not built yet (its files are still coming) */
  readonly seamPending: boolean;
  /** one slice of a build spread over ticks (every tick, in any game state) */
  tick(): void;
  /** tests: force the spread build on (true) or off (false) under the step hook; null = the default (real time only) */
  /** `gate`: one slice per rendered frame (true / false; null = the default: on in real time, off under the step hook) */
  setSpread(on: boolean | null, gate?: boolean | null): void;
  jobState(): string;
  isBuilt(zone: ZoneId): boolean;
  /** live: its zone is built, or its `sets` holds the resident set (the seam) */
  markerLive(m: LayoutMarker): boolean;
  placed(marker: MarkerId): readonly Placed[];
  /** the AssetInstance a marker created (the first, or the one of `asset`); through `partOf` the owner's */
  instance(marker: MarkerId, asset?: string): AssetInstance | null;
  /** a named node of the marker's own instances, of its `partOf` owner, or of the zone GLB it names; null when not built */
  node(marker: MarkerId, node: string): THREE.Object3D | null;
  /** the node (or root) a `partOf` binding of the marker resolves to */
  partNode(marker: MarkerId): THREE.Object3D | null;
  zoneNode(zone: ZoneId, node: string): THREE.Object3D | null;
  /** world-space asset (backdrops, the town card) by id */
  worldNode(asset: string, node: string): THREE.Object3D | null;
  /** an empty at the marker, named by its id: what render.setOutline is given for things that have no object of their own */
  anchor(marker: MarkerId): THREE.Object3D;
  // ---- instanced registry (visibility follows the unit the instance stands in)
  instAdd(zone: ZoneId, asset: string, node: string, x: number, y: number, z: number, rot: number, scale: number): number;
  instMove(token: number, x: number, y: number, z: number): void;
  instShow(token: number, on: boolean): void;
  instRemove(token: number): void;
  token(marker: MarkerId): number;
  updateVisibility(): void;
  update(): void;
  /** broken breakables (save) */
  brokenIds(out: string[]): void;
  applyBroken(ids: readonly string[]): void;
  counts(): Record<string, number>;
  showAll(on: boolean): void;
  dispose(): void;
}

export interface DoorsApi {
  state(id: MarkerId): DoorState;
  locked(id: MarkerId): boolean;
  /** `force`: also a locked door (a wave that enters through it) */
  open(id: MarkerId, instant?: boolean, force?: boolean): void;
  /** `clear`: metres she must be past the door's plane before it starts to shut (a door sealed behind her does not shut on her heels) */
  close(id: MarkerId, instant?: boolean, clear?: number): void;
  ajar(id: MarkerId): void;
  /** the door is held shut for an encounter; an open door closes and opens again when the lock goes */
  lock(id: MarkerId, on: boolean): void;
  /** code-driven gates (door_jug_gate): the height the bar should stand at above the sill; it travels there, the collider with it */
  setRaise(id: MarkerId, height: number, instant?: boolean): void;
  /** where the bar is now */
  raiseOf(id: MarkerId): number;
  attach(zone: ZoneId): void;
  detach(zone: ZoneId): void;
  reset(): void;
  tick(dt: number): void;
  capture(out: Record<MarkerId, DoorState>): void;
  apply(save: Readonly<Record<MarkerId, DoorState>>): void;
  /** debug: any state, at once */
  force(id: MarkerId, state: DoorState): void;
  ids(): readonly MarkerId[];
}

export interface StoryApi {
  /** queue a line, card or caption by key (the same path as the `story/say` event); `zone`: the place it is about, when not where she stands */
  say(key: StoryKey, zone?: string, alsoZone?: string): void;
  /** next in line, ahead of what is waiting (critical-path lines tied to a moment) */
  sayFront(key: StoryKey): void;
  /** several lines tied to one moment (a wave, a clear): next in line, in their order */
  sayFrontAll(keys: readonly StoryKey[]): void;
  /** drop every line that has not started, except these keys (the ending's branch: only the stone's lines go on) */
  flush(spare: readonly StoryKey[]): void;
  /** the same with a rule: drop every line that has not started unless `spare(key)` */
  flushWhere(spare: (key: StoryKey) => boolean): void;
  /** on screen at once, cutting whatever is there: the line that answers her own act */
  sayOver(key: StoryKey): void;
  /** `key` is not said: dropped if it is waiting, cut if it is on screen (what it is about is behind her) */
  drop(key: StoryKey): void;
  /** `key` leaves the line if it is only waiting, unheard and untold: it may be asked for again at a better moment */
  defer(key: StoryKey): void;
  /**
   * `key` is about this second (a wave released, her own first line shot): on screen at once, over a line that may be
   * cut (not one the story stands on, not another urgent one, not one in its last second); else the very next line
   */
  sayUrgent(key: StoryKey, read?: number): void;
  /**
   * pass i3: `key` is about what she is looking at this second: the very next line (ahead of everything that waits,
   * with `part` the continuation of the line on screen too), on screen at once over a station line or a hint that has
   * been read. Give it an `unless` rule: it is dropped when its subject is behind her by its turn
   */
  sayPresent(key: StoryKey, part?: boolean, alsoZone?: string): void;
  /** pass i3: for `seconds`, a `story/say` for `key` from another system is ignored (the world has just said it) */
  mute(key: StoryKey, seconds: number): void;
  /** `key` keeps its place in line while `away()` is true (its subject is out of her view); the lines behind it go ahead */
  waitWhile(key: StoryKey, away: () => boolean): void;
  /** the world says `key` at its own moment: a `story/say` for it from another system is ignored */
  take(key: StoryKey): void;
  /** pass i2: `key` is held on screen `seconds` instead of story.json's time (the Windlass's roll-call) */
  hold(key: StoryKey, seconds: number): void;
  /**
   * pass i2: `key` opens a scene another system runs (the Windlass's first parley line): when that system asks for it,
   * every line that is only waiting and that the story does not stand on is dropped, and it is said like `sayNow`
   */
  opening(key: StoryKey): void;
  /** the end card is up: no line starts after it */
  silence(): void;
  /** a station line that answers the player's act: replaces a station or hint line on screen, else plays next */
  sayNow(key: StoryKey): void;
  setObjective(key: StoryKey, announce?: boolean): void;
  /** the key now on screen, '' when none */
  readonly current: StoryKey;
  /** nothing on screen and nothing waiting */
  readonly idle: boolean;
  /** a title card is on screen or about to be (pass i1: no key hint is raised over a movement card) */
  readonly cardUp: boolean;
  played(key: StoryKey): boolean;
  /** true once the line's hold is over (this run) */
  finished(key: StoryKey): boolean;
  /** the line has started, or was dropped unheard, in this run */
  heard(key: StoryKey): boolean;
  /** a line the story stands on: never dropped for waiting (story.json meta.rules.never_stale, else NEVER_STALE) */
  keeps(key: StoryKey): boolean;
  /** the key is on screen or waiting */
  holds(key: StoryKey): boolean;
  /** `key` is dropped unheard if `over()` is true when its turn comes (the fight it announces is already cleared) */
  unless(key: StoryKey, over: () => boolean): void;
  tick(): void;
  reset(): void;
  /** drop what is waiting and on screen (a restore) */
  clear(): void;
  /** forget a hint line that is being held for a quiet moment (the puzzle moved on) */
  cancelHint(): void;
  /** the keys waiting to be said, in order (a save keeps them) */
  queued(out: string[]): void;
  /** the saved flags are back: keep what was heard this run heard, say again what the save held waiting */
  restored(): void;
  /** a debug warp: nothing has been heard in this timeline */
  forget(): void;
  debug(): Record<string, unknown>;
}

export interface DirectorApi {
  tickTriggers(dt: number): void;
  tick(dt: number): void;
  /** per rendered frame: the far figure of the sighting keeps its smallest size on screen (R4) */
  presentSighting(): void;
  attach(zone: ZoneId): void;
  detach(zone: ZoneId): void;
  reset(): void;
  encounter(id: EncounterId): Readonly<EncounterView>;
  cleared(id: EncounterId): boolean;
  /** an encounter is in its vignette or fight */
  readonly live: boolean;
  start(id: EncounterId): void;
  /** WorldDebug.clearEncounter */
  debugClear(id: EncounterId): void;
  /** a breakable broke: the ammo floor */
  onBreakable(x: number, y: number, z: number): void;
  triggerFired(id: MarkerId): boolean;
  /** a new run has control: the trigger that sets the first objective fires, wherever she stands (layout trg_open: "fires on first control") */
  fireStart(): void;
  /** the mood of a zone now: its intro mood until the exposure ramp of its glare trigger has run (the_lip: L0, then L1) */
  moodOf(zone: ZoneId): MoodId;
  /** the tallies of an encounter are final (its clear, or a boss checkpoint) */
  commitTallies(id: EncounterId): void;
  capture(save: WorldSave): void;
  apply(save: Readonly<WorldSave>, full: SaveData | null): void;
  /** freed and felled of encounters still live: left out of a save */
  pendingFreed(): number;
  pendingFelled(): number;
  debug(): Record<string, unknown>;
}

export interface InteractApi {
  attach(zone: ZoneId): void;
  detach(zone: ZoneId): void;
  reset(): void;
  tick(dt: number): void;
  spawnPickup(kind: PickupKind, x: number, y: number, z: number): void;
  /** proving_line was solved: the bay locker chimes and offers one more */
  onProvingSolved(): void;
  /** the kept module owns the focus while she stands on a lit mark */
  setKeptFocus(mark: MarkerId | ''): void;
  capture(save: WorldSave): void;
  apply(save: Readonly<WorldSave>): void;
  debug(): Record<string, unknown>;
}

export interface CheckpointsApi {
  /** commit a checkpoint (never backwards, each once); a place checkpoint waits while an encounter is live */
  reach(id: CheckpointId, force?: boolean): void;
  /** write the save she holds again with the world as it stands now and this boss phase; no event (p0: the Windlass's death) */
  again(bossPhase: BossPhase): void;
  tick(): void;
  reset(): void;
  beginRun(fromSave: SaveData | null): Promise<void>;
  restoreCheckpoint(): Promise<void>;
  warpToCheckpoint(id: CheckpointId): Promise<void>;
  captureSave(): WorldSave;
  applySave(data: WorldSave): void;
  index(id: CheckpointId): number;
}

export interface RidesApi {
  tick(dt: number): void;
  update(alpha: number): void;
  attach(zone: ZoneId): void;
  detach(zone: ZoneId): void;
  reset(): void;
  /** `E` on a ride's lever or control: false when its requirement is not met or a ride is running */
  start(via: MarkerId): boolean;
  available(via: MarkerId): boolean;
  readonly riding: boolean;
  debug(): Record<string, unknown> | null;
}

export interface EndingApi {
  /** the end card is up (pass i1: going on from the rim after it tells the rim again) */
  readonly ended: boolean;
  tick(dt: number): void;
  attach(zone: ZoneId): void;
  detach(zone: ZoneId): void;
  reset(): void;
  /** `E` on the stone's round */
  take(): void;
  /** the rim's clocks start (the lift opened on the rim, or a restore at cp_rim) */
  arrive(): void;
  /** no branch has begun: the choice at the stone is still hers (its prompt shows only then) */
  readonly open: boolean;
  /** a trigger of the rim whose lines go to the front of the queue: what she stands at now (the lamps, the stone) */
  front(m: LayoutMarker): boolean;
  debug(): Record<string, unknown>;
}

export interface KeptApi {
  tick(dt: number): void;
  attach(zone: ZoneId): void;
  detach(zone: ZoneId): void;
  reset(): void;
  /** `warp`: a debug warp (another timeline: the kept ladder starts over) */
  apply(full: SaveData | null, warp?: boolean): void;
  addHintSeconds(seconds: number): void;
  debug(): Record<string, unknown>;
}

interface ClipPlay { inst: AssetInstance | null; left: number }
interface Glint { card: FxHandle | null; left: number }
const CLIP_SLOTS = 24;
const GLINT_SLOTS = 6;

/** The one mutable object every file of src/world works on. */
export class State {
  readonly rng: Rng;
  // ---- the contract's fields (WorldApi reads them)
  zone: ZoneId = 'the_lip';
  cell = '';
  residentSet: ResidentSet = 'surface';
  builtZones: ZoneId[] = [];
  mood: MoodId = 'L1';
  objective: StoryKey = '';
  checkpoint: CheckpointId = 'cp_lip_start';
  stats: RunStats = emptyStats();
  // ---- run
  /** start() has run: the level is built and she stands somewhere */
  started = false;
  /** a run has begun (beginRun); false on the title screen */
  running = false;
  /** the game state is 'playing' on this tick */
  playing = false;
  /** named boolean facts, saved with the run: world flags, once-only lines and cards, fired triggers, did_<action> */
  readonly flags = new Set<string>();
  /** vignettes that have played (never replay) */
  readonly vignettesSeen = new Set<VignetteId>();
  visDirty = true;
  /** she is outside every zone of the resident set (the stair between the hatch closing and the swap): zone and cell are held */
  zoneHeld = false;
  /** the zone of another set built beside the resident set (the seam), or null */
  staged: ZoneId | null = null;
  /** seconds the next zone's mood takes to fade in (a ride sets it at its teleport); 0 = the usual one second */
  zoneFade = 0;
  /** a ride is in its dark stretch: nothing of the level is drawn */
  rideDark = false;
  /** player deaths per boss phase in this run (the mercy tin); not saved: a restore must not forget them */
  bossDeaths = 0;
  bossDeathPhase = '';
  /**
   * What stands behind an encounter's trigger marker when the trigger is a thing she shoots (a knot): the file that owns
   * the thing registers how to force it, so WorldDebug.clearEncounter can take the same path without a line or a fight.
   * `announce`: as if she had shot it (lines, cues, the encounter it starts): a hit on a dormant member stands in for it.
   */
  readonly forcers = new Map<MarkerId, (announce?: boolean) => void>();
  /** she was put somewhere (a new run, a restore): index.ts looks again at the zone, the mood and what is drawn */
  placed: (moodSeconds?: number) => void = () => {};
  /** wave B of the first fight has spawned: the moment sprint is first needed (the lazy key hint) */
  needSprint = false;
  // ---- modules (assigned by index.ts right after construction)
  build!: BuildApi;
  doors!: DoorsApi;
  story!: StoryApi;
  director!: DirectorApi;
  interact!: InteractApi;
  checkpoints!: CheckpointsApi;
  rides!: RidesApi;
  ending!: EndingApi;
  kept!: KeptApi;
  puzzles!: Record<PuzzleId, Puzzle>;

  private readonly clips: ClipPlay[] = [];
  private clipCount = 0;
  private readonly glints: Glint[] = [];
  private readonly cuePayload: GameEvents['audio/cue'] = { x: 0, y: 0, z: 0, cue: 'door_creak', positional: true, gain: 1, pitch: 1 };
  private readonly lampPayload: GameEvents['lamp/set'] = { id: '', lit: 0, of: 0 };
  private readonly hintPayload: GameEvents['puzzle/hint'] = { puzzle: 'seven_jugs', tier: 1 };
  private readonly progressPayload: GameEvents['puzzle/progress'] = { puzzle: 'seven_jugs', step: 0, of: 0, detail: '' };
  private readonly shootablePayload: GameEvents['shootable/hit'] = { x: 0, y: 0, z: 0, id: '', kind: 'jug', scaleDegree: 0, ammo: 'lead_round' };
  private readonly knotPayload: GameEvents['knot/burst'] = { x: 0, y: 0, z: 0, id: '', onMechanism: true, regrows: false };

  constructor(readonly ctx: GameContext) {
    this.rng = ctx.rng.fork('world');
    for (let i = 0; i < CLIP_SLOTS; i++) this.clips.push({ inst: null, left: 0 });
    for (let i = 0; i < GLINT_SLOTS; i++) this.glints.push({ card: null, left: 0 });
  }

  // ---- flags ----------------------------------------------------------------------------------------
  flag(name: string): boolean { return this.flags.has(name); }
  setFlag(name: string, on: boolean): void {
    if (on === this.flags.has(name)) return;
    if (on) this.flags.add(name); else this.flags.delete(name);
    this.visDirty = true;                              // a visibility rule may name it
  }

  // ---- small shared emitters (scratch payloads: no allocation) ----------------------------------------
  cue(cue: AudioCue, x: number, y: number, z: number, positional = true, gain = 1, pitch = 1): void {
    const p = this.cuePayload;
    p.cue = cue; p.x = x; p.y = y; p.z = z; p.positional = positional; p.gain = gain; p.pitch = pitch;
    this.ctx.events.emit('audio/cue', p);
  }
  cueAt(cue: AudioCue, m: LayoutMarker): void { this.cue(cue, m.pos[0], m.pos[1], m.pos[2], true); }
  lamp(id: MarkerId, lit: number, of: number): void {
    const p = this.lampPayload;
    p.id = id; p.lit = lit; p.of = of;
    this.ctx.events.emit('lamp/set', p);
  }
  hint(puzzle: PuzzleId | 'kept', tier: HintTier): void {
    const p = this.hintPayload;
    p.puzzle = puzzle; p.tier = tier;
    this.ctx.events.emit('puzzle/hint', p);
  }
  progress(view: PuzzleView, detail: string): void {
    const p = this.progressPayload;
    p.puzzle = view.id; p.step = view.step; p.of = view.of; p.detail = detail;
    this.ctx.events.emit('puzzle/progress', p);
  }
  shootableHit(id: MarkerId, kind: GameEvents['shootable/hit']['kind'], scaleDegree: number, ammo: GameEvents['shootable/hit']['ammo'], x: number, y: number, z: number): void {
    const p = this.shootablePayload;
    p.id = id; p.kind = kind; p.scaleDegree = scaleDegree; p.ammo = ammo; p.x = x; p.y = y; p.z = z;
    this.ctx.events.emit('shootable/hit', p);
  }
  knotBurst(id: MarkerId, regrows: boolean, x: number, y: number, z: number): void {
    const p = this.knotPayload;
    p.id = id; p.onMechanism = true; p.regrows = regrows; p.x = x; p.y = y; p.z = z;
    this.stats.knotsBurst++;
    this.ctx.events.emit('knot/burst', p);
  }

  // ---- hint mode ------------------------------------------------------------------------------------
  /** T1 to T3 are suppressed with hints off; T4 always applies (GDD 13) */
  hintsOn(): boolean { return this.ctx.options.value.hints !== 'off'; }

  // ---- view helpers ---------------------------------------------------------------------------------
  /** cosine of the angle between the view and the direction from the eye to a point (1 = dead ahead) */
  lookCos(x: number, y: number, z: number): number {
    const pl = this.ctx.player, p = pl.position, f = pl.forward;
    const dx = x - p.x, dy = y - (p.y + PLAYER_EYE), dz = z - p.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return 1;
    return (dx * f.x + dy * f.y + dz * f.z) / len;
  }

  // ---- one-shot clips -------------------------------------------------------------------------------
  /** Play a clip of an instance from its start to its last frame (it stays there). */
  playClip(inst: AssetInstance | null, clip: string): void {
    if (!inst || !inst.mixer) return;
    const seconds = this.ctx.assets.clipSeconds(inst.id, clip);
    const a = inst.action(clip);
    inst.mixer.stopAllAction();
    a.reset(); a.paused = false; a.play();
    inst.mixer.update(0);
    let slot: ClipPlay | null = null;
    for (let i = 0; i < this.clipCount; i++) if ((this.clips[i] as ClipPlay).inst === inst) slot = this.clips[i] as ClipPlay;
    if (!slot) {
      if (this.clipCount >= CLIP_SLOTS) { this.poseClip(inst, clip, 1); return; }
      slot = this.clips[this.clipCount++] as ClipPlay;
    }
    slot.inst = inst; slot.left = seconds;
  }
  /** Hold a clip at a fraction of its length (0 = first frame, 1 = last). */
  poseClip(inst: AssetInstance | null, clip: string, t01: number): void {
    if (!inst || !inst.mixer) return;
    for (let i = 0; i < this.clipCount; i++) if ((this.clips[i] as ClipPlay).inst === inst) this.dropClip(i);
    const a = inst.action(clip);
    inst.mixer.stopAllAction();
    a.reset(); a.play();
    a.paused = true;
    a.time = a.getClip().duration * (t01 < 0 ? 0 : t01 > 1 ? 1 : t01);
    inst.mixer.update(0);
  }
  /** Move a clip that poseClip is holding (no re-activation: for a door in travel). */
  scrubClip(inst: AssetInstance | null, clip: string, t01: number): void {
    if (!inst || !inst.mixer) return;
    const a = inst.action(clip);
    a.time = a.getClip().duration * (t01 < 0 ? 0 : t01 > 1 ? 1 : t01);
    inst.mixer.update(0);
  }
  /** Back to the rest pose. */
  restPose(inst: AssetInstance | null): void {
    if (!inst || !inst.mixer) return;
    for (let i = 0; i < this.clipCount; i++) if ((this.clips[i] as ClipPlay).inst === inst) this.dropClip(i);
    inst.mixer.stopAllAction();
  }
  forgetClips(inst: AssetInstance): void {
    for (let i = this.clipCount - 1; i >= 0; i--) if ((this.clips[i] as ClipPlay).inst === inst) this.dropClip(i);
  }
  private dropClip(i: number): void {
    const last = --this.clipCount;
    const a = this.clips[i] as ClipPlay, b = this.clips[last] as ClipPlay;
    a.inst = b.inst; a.left = b.left;
    b.inst = null;
  }
  tickClips(dt: number): void {
    for (let i = this.clipCount - 1; i >= 0; i--) {
      const c = this.clips[i] as ClipPlay;
      const inst = c.inst;
      if (!inst || !inst.mixer) { this.dropClip(i); continue; }
      inst.mixer.update(dt);
      c.left -= dt;
      if (c.left <= 0) this.dropClip(i);
    }
    for (let i = 0; i < GLINT_SLOTS; i++) {
      const g = this.glints[i] as Glint;
      if (!g.card) continue;
      g.left -= FIXED_DT;
      if (g.left <= 0) { g.card.release(); g.card = null; }
    }
  }
  /** A short wordless glint at a point (hint tier 1): a pooled halo card that releases itself. */
  glint(x: number, y: number, z: number, seconds: number): void {
    for (let i = 0; i < GLINT_SLOTS; i++) {
      const g = this.glints[i] as Glint;
      if (g.card) continue;
      const card = this.ctx.render.vfx.acquireCard('halo');
      if (!card) return;
      card.setPosition(x, y, z); card.setLevel(1); card.setVisible(true);
      g.card = card; g.left = seconds;
      return;
    }
  }
  releaseGlints(): void {
    for (let i = 0; i < GLINT_SLOTS; i++) { const g = this.glints[i] as Glint; if (g.card) { g.card.release(); g.card = null; } }
  }
}

