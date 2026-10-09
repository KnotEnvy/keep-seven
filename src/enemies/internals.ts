// src/enemies/internals.ts: the shared types and the one mutable state object of the enemies module (ARCHITECTURE 1.2).
// Files of the module talk through this file (the `Shared` object and its `hooks`), not by importing each other.
import type * as THREE from 'three';
import type {
  AssetInstance, CapsuleResolve, DamageInfo, Difficulty, DifficultyDef, EncounterId, EnemyKind, EntityId, EntityRef, FxHandle,
  GameContext, GameEvents, HitList, HitReceiver, HitResponse, HitResult, MarkerId, Rng, SpawnRequest, Vec3, VignetteId, ZoneId,
} from '../core/contracts.ts';
import { ColFlag } from '../core/contracts.ts';
import { Interp3, InterpAngle } from '../core/interp.ts';
import { CAPS, DIFFICULTY } from './defs.ts';
import type { HintRing } from './hintring.ts';
import type { Nav } from './nav.ts';
import type { Anim, AssetAnims } from './pool.ts';
import type { TokenKind, Tokens } from './tokens.ts';

export const MAX_ACTORS = 16;
export const PATH_CAP = 48;
export const WALKABLE_COS = Math.cos(45 * Math.PI / 180) - 1e-3;
/** flags a sight line ignores (ARCHITECTURE 6) */
export const SIGHT_IGNORE = ColFlag.GRILLE | ColFlag.LOW;
export const MAX_VOLUMES = 3;

/** One enemy body (Bider, Transit or Tamper). All state is in fields: nothing is allocated while it lives. */
export class Actor implements HitReceiver {
  used = false;
  /** counts toward the alive cap, the threat and the encounter */
  alive = false;
  /** false while dormant in a vignette loop */
  awake = false;
  id: EntityId = '';
  serial = 0;
  kind: EnemyKind = 'bider';
  ref: EntityRef = { id: '', kind: 'bider' };
  state = 'none';
  prev = 'none';
  /** seconds in `state` (game time) */
  t = 0;
  hp = 0;
  x = 0; y = 0; z = 0; yaw = 0;
  vy = 0;
  grounded = true;
  readonly pos = new Interp3();
  readonly rot = new InterpAngle();
  inst: AssetInstance | null = null;
  clip = '';
  /** the clip player (src/enemies/pool.ts): no three AnimationMixer, nothing allocated per tick */
  anim: Anim | null = null;
  /** pose freeze left, seconds (GDD 6.8: target-local, never global) */
  freeze = 0;
  /** drawn (dormant and vignette actors follow render.zoneVisible of their zone) */
  shown = true;
  encounter: EncounterId | '' = '';
  counted = false;
  wave = '';
  entrance = '';
  dormantClip = '';
  lane = -1;
  order = 0;
  marker: MarkerId | '' = '';
  zone: ZoneId | '' = '';
  vignette: VignetteId | '' = '';
  readonly vol: number[] = [-1, -1, -1];
  /** the node each volume follows (null: the body capsule at the feet) */
  readonly volNode: (THREE.Object3D | null)[] = [null, null, null];
  /** cached nodes: the head bone, a socket (hand, stake muzzle, ram head), and two code-driven bones (vent lids) */
  head: THREE.Object3D | null = null;
  socket: THREE.Object3D | null = null;
  boneA: THREE.Object3D | null = null;
  boneB: THREE.Object3D | null = null;
  shadow: FxHandle | null = null;
  // ---- navigation
  readonly path = new Int16Array(PATH_CAP);
  pathLen = 0;
  pathAt = 0;
  pathGoal = -1;
  /** module time before which a route that was not found is not searched for again (a shut door: one A* per half second, not one per tick) */
  pathRetry = 0;
  stuck = 0;
  // ---- perception
  sees = false;
  /** seconds since she was last seen */
  lost = 0;
  lkx = 0; lky = 0; lkz = 0;
  /** transit: this seek walks on past a Transit that already stands with a sight of her (polish round 4) */
  pass = false;
  // ---- attacks
  token: '' | TokenKind = '';
  /** the attack in hand has done its damage */
  struck = false;
  /** the attack in hand started outside her view cone (half frequency afterwards, GDD 7) */
  unseen = false;
  /** a locked direction (lunge, thrown body, charge, sidestep) */
  dirX = 0; dirZ = -1;
  moved = 0;
  /** a general purpose timer and counter of the current state */
  timer = 0;
  count = 0;
  // ---- bider
  fan = 0;
  /** seconds left of a sidestep out of a line of three, and its direction (open ground: no line round takes three) */
  dodge = 0;
  dodgeX = 0; dodgeZ = 0;
  lateral = 0;
  depth = 0;
  laneFollow = false;
  circleDir = 1;
  barkAt = 0;
  resume = 'approach';
  resumeFor = 0;
  hood = 1;
  /** it runs faster while far from her and outside her view (BIDER.hurryWaves: the rear pair of the file) */
  hurry = false;
  tint = 0;
  cup: AssetInstance | null = null;
  cause: 'crown' | 'line' | 'kept' = 'crown';
  /** seconds since it went down (the static swap at 3 s) */
  down = 0;
  // ---- transit
  point = -1;
  wantPoint = -1;
  /** the firing point its spawn marker names (nav node index), -1 = none */
  namedPoint = -1;
  shots = 0;
  fresh = true;
  miss = false;
  aimX = 0; aimY = 0; aimZ = 0;
  thread: FxHandle | null = null;
  star: FxHandle | null = null;
  crosshair = 0;
  sidestepAt = -1e9;
  heard = false;
  bell = false;
  /** firing points (bit i = nav.firing[i]) this Transit found unreachable or blind */
  badPoints = 0;
  /** seconds planted without a sight of her */
  blind = 0;
  /** module time before which it does not score the firing points again (eight routes a time: an event, not a think) */
  chooseAt = 0;
  /** seek: the node it walks to and the nearest it has come to it (progress; transit.ts) */
  seekNode = -1;
  seekBest = Infinity;
  /** firing points it has stood on (the point its spawn marker names is preferred until the first) */
  stood = 0;
  // ---- tamper
  ventChest = false;
  ventBack = false;
  chargedAt = -1e9;
  flinch = 0;
  ringX = 0; ringY = 0; ringZ = 0;
  /** module time before which it starts no attack (release pass p0: the pause after a slam that landed, however the slam's state ends) */
  quietUntil = -1e9;
  /** slams that have hurt her since it woke (the ring hint is said on `TAMPER.hintAfterSlams`) */
  slamsLanded = 0;
  /** slams in a row that have hurt her (a miss ends the row): the pause grows from the second (`TAMPER.slamAfterRun`) */
  slamsRun = 0;
  /** pass i4: seconds the help adds to the slam wind-up or the charge stun it is in (fixed when that began) */
  helpSeconds = 0;

  constructor(readonly index: number, private readonly shared: Shared) {}

  onHit(hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    this.shared.hooks.hit(this, hit, damage, out);
  }
}

/** A freed or felled Bider that stays in the world as an instanced static body (EnemiesSave.statics). */
export interface StaticBody { asset: string; x: number; y: number; z: number; rotY: number; handle: number }

/** What the files of the module ask of each other. index.ts fills it in. */
export interface Hooks {
  /** dispatch of a round that met an actor's hit volume */
  hit(e: Actor, hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void;
  /** spawn through the caps (the boss's adds, the vignettes); null when refused */
  spawn(request: Readonly<SpawnRequest>): Actor | null;
  spawnAt(kind: EnemyKind, x: number, y: number, z: number, yaw: number): Actor | null;
  wake(e: Actor): void;
  /** free one Bider (the proof, killAll(true)); `counted` goes into the event as the actor has it */
  freeBider(e: Actor, cause: 'crown' | 'line' | 'kept'): void;
  fellBider(e: Actor, dirX: number, dirZ: number): void;
  /** every Bider alive and awake falters `seconds` (the Tamper dies, the hush catches a wind-up) */
  falterBiders(seconds: number, onlyAttacking: boolean): void;
  killTransit(e: Actor): void;
  killTamper(e: Actor): void;
  /** a vignette actor left its vignette (woke, died, was freed, flinched) */
  vignetteActorGone(e: Actor): void;
  /** the Tamper's ram came down at a point (the vignette's Bider is knocked flat by it) */
  slamLanded(x: number, y: number, z: number, radius: number): void;
  /** a Transit's stake reached the bell of its vignette */
  bossFight(): boolean;
  /** pass i4: the Tamper's ring line, once per run of its fight (index.ts) */
  sayRing(): void;
}

export interface StakeShot {
  ox: number; oy: number; oz: number;
  dx: number; dy: number; dz: number;
  speed: number; damage: number;
  kind: 'stake' | 'fan';
  source: EnemyKind; sourceId: EntityId;
  encounter: EncounterId | '';
  /** false: it flies and sticks but cannot hurt her (the bell vignette) */
  harmful: boolean;
  /** > 0: it sticks where it has flown this far (the bell of the vignette: a target that is not a solid) */
  maxDistance: number;
}

export interface StakesApi {
  /** Returns false when all eight are in flight. */
  fire(shot: Readonly<StakeShot>): boolean;
  burstAll(reason: 'hush' | 'fuse'): number;
  clear(encounter: EncounterId | '' | null): void;
  readonly flying: number;
  readonly stuck: number;
  /** how many stakes of the running fan have hurt her (at most two may) */
  fanHits: number;
  /** stuck stakes that have cooled to dull orange (the stake_cool mesh) */
  readonly cooled: number;
}

export interface PoolApi {
  play(e: Actor, clip: string, fade?: number, speed?: number): void;
  /** the lean clips of an asset */
  anims(asset: string): AssetAnims;
  /** a clip player bound to an instance of an asset (the boss's body, the watcher) */
  createAnim(asset: string, root: THREE.Object3D): Anim;
  setState(e: Actor, state: string): void;
  disableVolumes(e: Actor): void;
  nodePos(e: Actor, node: string, out: Vec3): boolean;
  /** world position of an object of an instance (false when null) */
  objectPos(o: THREE.Object3D | null, out: Vec3): boolean;
  release(e: Actor, announce: boolean): void;
  addStatic(asset: string, x: number, y: number, z: number, rotY: number): void;
  takeToken(e: Actor, kind: TokenKind): boolean;
  dropToken(e: Actor): void;
}

class Payloads {
  readonly spawned: GameEvents['enemy/spawned'] = { x: 0, y: 0, z: 0, id: '', kind: 'bider', encounter: '', entrance: '' };
  readonly state: GameEvents['enemy/state'] = { id: '', kind: 'bider', from: '', to: '' };
  readonly telegraph: GameEvents['enemy/telegraph'] = { x: 0, y: 0, z: 0, id: '', kind: 'bider', attack: '', seconds: 0 };
  readonly attack: GameEvents['enemy/attack'] = { x: 0, y: 0, z: 0, id: '', kind: 'bider', attack: '' };
  readonly damaged: GameEvents['enemy/damaged'] = { id: '', kind: 'bider', part: 'body', amount: 0, hp: 0 };
  readonly felled: GameEvents['enemy/felled'] = { x: 0, y: 0, z: 0, id: '', encounter: '', counted: false };
  readonly freed: GameEvents['enemy/freed'] = { x: 0, y: 0, z: 0, id: '', encounter: '', cause: 'crown', counted: false };
  readonly died: GameEvents['enemy/died'] = { x: 0, y: 0, z: 0, id: '', kind: 'bider', encounter: '' };
  readonly removed: GameEvents['enemy/removed'] = { id: '' };
  readonly projSpawned: GameEvents['projectile/spawned'] = { x: 0, y: 0, z: 0, id: '', kind: 'stake', source: 'transit' };
  readonly projLanded: GameEvents['projectile/landed'] = { x: 0, y: 0, z: 0, id: '', kind: 'stake', surface: 'none', hitPlayer: false };
  readonly projBurst: GameEvents['projectile/burst'] = { x: 0, y: 0, z: 0, id: '', kind: 'stake', reason: 'shot' };
  readonly cue: GameEvents['audio/cue'] = { x: 0, y: 0, z: 0, cue: 'ratchet', positional: true, gain: 1, pitch: 1 };
  readonly say: GameEvents['story/say'] = { key: '' };
  readonly vignette: GameEvents['vignette/state'] = { id: 'vig_kneeler', stage: 'started' };
  readonly shootable: GameEvents['shootable/hit'] = { x: 0, y: 0, z: 0, id: '', kind: 'dowser', scaleDegree: 0, ammo: 'lead_round' };
}

/** The module's one mutable state object. */
export class Shared {
  /** game seconds this module has simulated (the sum of every dt handed to fixedUpdate) */
  time = 0;
  /** unscaled seconds of simulation (1/60 per tick the sim ran): timers that ignore slow motion */
  utime = 0;
  /** ticks this module has simulated (not clock.tick, which also counts while paused) */
  tick = 0;
  dt = 0;
  ai = true;
  /** the hush (GDD 8.2): she is loading the kept round on a mark. No melee token is granted; Biders hold at the ring. */
  hush = false;
  difficultyId: Difficulty = 'normal';
  difficulty: DifficultyDef = DIFFICULTY.normal;
  readonly rng: Rng;
  readonly actors: Actor[] = [];
  readonly statics: StaticBody[] = [];
  serial = 0;
  // ---- the player, read once per tick
  px = 0; py = 0; pz = 0;
  pvx = 0; pvz = 0;
  pSpeed = 0;
  pfx = 0; pfy = 0; pfz = -1;
  pAlive = true;
  /** line-of-sight rays left this tick (GDD 7: at most 4) */
  sightLeft = 0;
  // ---- scratch (owned here, valid only inside one call)
  readonly res: CapsuleResolve;
  readonly rayHit: HitResult;
  readonly hitList: HitList;
  /** arguments of nav.moveBody (the step) and nav.turnBody (the target yaw, the largest turn): doubles in fields are not boxed at the call */
  mx = 0.5; mz = 0.5; ang = 0.5; turn = 0.5;
  readonly v: Vec3 = { x: 0, y: 0, z: 0 };
  readonly v2: Vec3 = { x: 0, y: 0, z: 0 };
  readonly dmg: DamageInfo = { amount: 0, kind: 'lunge', source: 'bider', sourceId: '', ammo: null, shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
  readonly ev = new Payloads();
  readonly shot: StakeShot = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1, speed: 18, damage: 22, kind: 'stake', source: 'transit', sourceId: '', encounter: '', harmful: true, maxDistance: 0 };
  // ---- the parts (assigned by index.ts before init())
  hooks!: Hooks;
  nav!: Nav;
  tokens!: Tokens;
  stakes!: StakesApi;
  pool!: PoolApi;
  /** pass i4: the outline rings of the fallback teaching (0 and 1: the Tamper's vents or the Windlass's pawls; 2: the bore's line locker) */
  rings!: HintRing;
  /**
   * Pass i4: deaths to an awake Tamper in this run of the fight, `TAMPER.helpMax` at most: the steps of
   * help a player who keeps dying to it is given (defs.ts `backKey`). Kept across the encounter's reset; forgotten with
   * the run and when the Tamper dies.
   */
  tamperHelp = 0;
  /** total damage this module has dealt her and the largest single hit (tests: no hit over 38) */
  dealt = 0;
  maxHit = 0;

  constructor(readonly ctx: GameContext) {
    this.rng = ctx.rng.fork('enemies');
    const col = ctx.collision;
    this.res = col.createResolve();
    this.rayHit = col.createHit();
    this.hitList = col.createHitList();
    for (let i = 0; i < MAX_ACTORS; i++) this.actors.push(new Actor(i, this));
  }

  setDifficulty(id: Difficulty): void {
    this.difficultyId = id;
    this.difficulty = DIFFICULTY[id] ?? DIFFICULTY.normal;
    this.tokens.cap = this.difficulty.attackTokens;
  }

  /** Read the player once per tick. */
  readPlayer(): void {
    const pl = this.ctx.player, p = pl.position, v = pl.velocity, f = pl.forward;
    this.px = p.x; this.py = p.y; this.pz = p.z;
    this.pvx = v.x; this.pvz = v.z;
    this.pSpeed = Math.sqrt(v.x * v.x + v.z * v.z);
    this.pfx = f.x; this.pfy = f.y; this.pfz = f.z;
    this.pAlive = pl.alive;
  }

  /**
   * One budgeted sight line (GDD 7: at most four a tick across all enemies). 1 = clear, 0 = blocked, -1 = the budget
   * is spent: keep what you knew and ask again on your next think.
   */
  sight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    if (this.sightLeft <= 0) return -1;
    this.sightLeft--;
    return this.ctx.collision.lineOfSight(ax, ay, az, bx, by, bz, SIGHT_IGNORE) ? 1 : 0;
  }

  /** True when a point is inside her view cone (enemies outside it attack at half frequency). */
  inView(x: number, y: number, z: number): boolean {
    const dx = x - this.px, dy = y - (this.py + 1.65), dz = z - this.pz;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-4) return true;
    return (dx * this.pfx + dy * this.pfy + dz * this.pfz) / l >= CAPS.viewConeCos;
  }

  /**
   * The same on the horizontal angle only (where an attack starts: a body at her feet or on a step below is not
   * "outside her view" because the line to it dips). Anything within CAPS.viewNear in front of her is in view.
   */
  inViewFlat(x: number, z: number): boolean {
    const dx = x - this.px, dz = z - this.pz;
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l < 1e-4) return true;
    const fl = Math.sqrt(this.pfx * this.pfx + this.pfz * this.pfz);
    if (fl < 1e-4) return true;                             // she looks straight up or down: no horizontal facing to judge by
    const c = (dx * this.pfx + dz * this.pfz) / (l * fl);
    if (l <= CAPS.viewNear && c > 0) return true;
    return c >= CAPS.viewConeCos;
  }

  /**
   * The telegraph scale of an attack that starts at (x, z). GDD 7: an enemy never starts an attack from behind
   * within 6 m without its cue having played: its cue (`enemy/telegraph`, the tone and the pose) always runs, and
   * from outside her view inside that range it is never shorter than the written tell (Hard's -10 % is not taken).
   */
  tellScale(unseen: boolean, x: number, z: number): number {
    const s = this.difficulty.telegraphScale;
    if (s >= 1 || !unseen) return s;
    const dx = x - this.px, dz = z - this.pz;
    return dx * dx + dz * dz <= CAPS.behindCueRange * CAPS.behindCueRange ? 1 : s;
  }

  /** Damage to the player from the scratch DamageInfo (the caller filled kind, source, sourceId, origin). Returns what was applied. */
  hurt(amount: number): number {
    const d = this.dmg;
    d.amount = amount; d.ammo = null; d.shotId = 0;
    const tx = this.px - d.ox, ty = this.py + 1.2 - d.oy, tz = this.pz - d.oz;
    const l = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (l > 1e-5) { d.dx = tx / l; d.dy = ty / l; d.dz = tz / l; }
    const applied = this.ctx.player.applyDamage(d);
    this.dealt += applied;
    if (amount > this.maxHit) this.maxHit = amount;
    return applied;
  }

  cue(cue: GameEvents['audio/cue']['cue'], x: number, y: number, z: number, gain = 1, pitch = 1): void {
    const c = this.ev.cue;
    c.cue = cue; c.x = x; c.y = y; c.z = z; c.positional = true; c.gain = gain; c.pitch = pitch;
    this.ctx.events.emit('audio/cue', c);
  }
  say(key: string): void {
    this.ev.say.key = key;
    this.ctx.events.emit('story/say', this.ev.say);
  }
  vignetteState(id: VignetteId, stage: 'started' | 'ended' | 'skipped'): void {
    this.ev.vignette.id = id; this.ev.vignette.stage = stage;
    this.ctx.events.emit('vignette/state', this.ev.vignette);
  }
  telegraph(e: Actor, attack: string, seconds: number): void {
    const p = this.ev.telegraph;
    p.x = e.x; p.y = e.y; p.z = e.z; p.id = e.id; p.kind = e.kind; p.attack = attack; p.seconds = seconds;
    this.ctx.events.emit('enemy/telegraph', p);
  }
  attacked(e: Actor, attack: string): void {
    const p = this.ev.attack;
    p.x = e.x; p.y = e.y; p.z = e.z; p.id = e.id; p.kind = e.kind; p.attack = attack;
    this.ctx.events.emit('enemy/attack', p);
  }
  damaged(e: Actor, part: GameEvents['enemy/damaged']['part'], amount: number): void {
    const p = this.ev.damaged;
    p.id = e.id; p.kind = e.kind; p.part = part; p.amount = amount; p.hp = e.hp;
    this.ctx.events.emit('enemy/damaged', p);
  }
}

/** Fill a HitResponse completely (the receiver's duty). */
export function respond(out: HitResponse, outcome: HitResponse['outcome'], stops: boolean, stopsLine: boolean, dealt: number, left: number): void {
  out.outcome = outcome; out.stops = stops; out.stopsLine = stopsLine; out.damageDealt = dealt; out.healthLeft = left;
}

/** Unit horizontal direction a yaw faces (yaw 0 = -Z, positive turns left). */
export function faceX(yaw: number): number { return -Math.sin(yaw); }
export function faceZ(yaw: number): number { return -Math.cos(yaw); }

/** A bone or node of an asset template by its manifest name (a name in both lists is the bone). */
export function findNamed(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    const n = typeof o.userData.name === 'string' && o.userData.name.length > 0 ? (o.userData.name as string) : o.name;
    if (n !== name) return;
    if (!found || ((o as THREE.Bone).isBone === true && (found as THREE.Bone).isBone !== true)) found = o;
  });
  return found;
}

const SKIN_CLONES = new WeakMap<THREE.Material, THREE.Material>();
/**
 * Core's fallback look is ONE MeshBasicMaterial shared by every mesh of the game, skinned or not. three keeps one
 * program per material and re-derives it whenever the object in hand differs in `skinning` from the last one drawn
 * with it: a skinned enemy beside the static world on that material costs two program look-ups per frame (measured:
 * 10 KB per frame, however many enemies). A skinned instance of this module therefore draws with a clone that only
 * skinned meshes use (one clone per base material; the base is put back by `restoreMaterials` before the instance
 * returns to the store's pool). Any other material (the real renderer's) is left alone.
 */
export function ownSkinnedMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh !== true || mesh.userData.enemiesBaseMaterial) return;
    const base = mesh.material as THREE.Material;
    if (Array.isArray(base) || (base as THREE.MeshBasicMaterial).isMeshBasicMaterial !== true) return;
    let own = SKIN_CLONES.get(base);
    if (!own) { own = base.clone(); SKIN_CLONES.set(base, own); }
    mesh.userData.enemiesBaseMaterial = base;
    mesh.material = own;
  });
}
/** The materials an instance came with (after `ownSkinnedMaterials` or a Bider's tint). */
export function restoreMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh === true && mesh.userData.enemiesBaseMaterial) { mesh.material = mesh.userData.enemiesBaseMaterial as THREE.Material; mesh.userData.enemiesBaseMaterial = undefined; }
  });
}
