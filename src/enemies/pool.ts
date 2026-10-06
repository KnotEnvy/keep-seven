// src/enemies/pool.ts: actor slots, asset instances, hit volumes, clips, pose freeze, interpolation, static bodies and
// the visibility of dormant actors (work order 4.1).
import * as THREE from 'three';
import { Layer } from '../core/contracts.ts';
import type { EnemyKind, HitVolumeDef, SurfaceType, Vec3, ZoneId } from '../core/contracts.ts';
import { BIDER, ENEMIES, TAMPER } from './defs.ts';
import type { Actor, PoolApi, Shared, StaticBody } from './internals.ts';
import { MAX_ACTORS, findNamed, ownSkinnedMaterials, restoreMaterials } from './internals.ts';
import type { TokenKind } from './tokens.ts';

const SURFACE: Readonly<Record<EnemyKind, SurfaceType>> = { bider: 'cloth', transit: 'ceramic', tamper: 'metal', windlass: 'ceramic' };
const STATIC_CAP = 48;
/** states in which the Tamper's clip owns the vent bones (README ruling 8) */
const TAMPER_CLIP_VENTS: Readonly<Record<string, boolean>> = { stagger: true, charge_stun: true, die: true };

export class ActorPool implements PoolApi {
  private readonly animsByAsset = new Map<object, AssetAnims>();
  private readonly tintCache = new Map<THREE.Material, THREE.Material[]>();
  private readonly ventRest = new THREE.Quaternion();
  private readonly ventOpen = new THREE.Quaternion();
  private readonly ventRestB = new THREE.Quaternion();
  private readonly ventOpenB = new THREE.Quaternion();
  private readonly q = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly lerp: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly S: Shared) {}

  // ---- slots ------------------------------------------------------------------------------------------
  /** A free slot, or the oldest body that is down when none is free; null when everything is alive. */
  private slot(): Actor | null {
    const actors = this.S.actors;
    for (let i = 0; i < MAX_ACTORS; i++) if (!(actors[i] as Actor).used) return actors[i] as Actor;
    let oldest: Actor | null = null;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = actors[i] as Actor;
      if (e.alive) continue;
      if (!oldest || e.down > oldest.down) oldest = e;
    }
    if (oldest) this.release(oldest, true);
    return oldest;
  }

  /** Stand a body of `kind` at a point. No caps here (index.ts applies them). Null when the pool or the asset is not there. */
  create(kind: EnemyKind, x: number, y: number, z: number, yaw: number): Actor | null {
    const { S } = this;
    const def = ENEMIES[kind];
    if (!def || kind === 'windlass') return null;
    if (!S.ctx.assets.isActive(def.asset)) return null;
    const e = this.slot();
    if (!e) return null;
    const inst = S.ctx.assets.instantiate(def.asset);
    e.used = true; e.alive = true; e.awake = true;
    e.serial = ++S.serial;
    e.id = `${kind}#${e.serial}`;
    e.kind = kind;
    e.ref = { id: e.id, kind };
    e.state = 'none'; e.prev = 'none'; e.t = 0;
    e.hp = def.hp;
    e.x = x; e.y = y; e.z = z; e.yaw = yaw; e.vy = 0; e.grounded = true;
    e.pos.snap(x, y, z); e.rot.snap(yaw);
    e.inst = inst; e.clip = ''; e.freeze = 0; e.shown = true;
    if (!e.anim) e.anim = new Anim();
    e.anim.bind(this.anims(def.asset), inst.root);
    e.encounter = ''; e.counted = false; e.wave = ''; e.entrance = ''; e.dormantClip = ''; e.lane = -1; e.order = 0;
    e.marker = ''; e.vignette = '';
    const zone = S.ctx.data.zoneAt(x, y + 0.5, z, S.ctx.world.residentSet);
    e.zone = (zone ?? '') as ZoneId | '';
    e.pathLen = 0; e.pathAt = 0; e.pathGoal = -1; e.pathRetry = 0; e.stuck = 0;
    e.sees = false; e.lost = 0; e.lkx = S.px; e.lky = S.py; e.lkz = S.pz;
    e.token = ''; e.struck = false; e.unseen = false; e.dirX = 0; e.dirZ = -1; e.moved = 0; e.timer = 0; e.count = 0;
    e.fan = 0; e.dodge = 0; e.dodgeX = 0; e.dodgeZ = 0; e.lateral = 0; e.depth = 0; e.laneFollow = false; e.circleDir = 1; e.barkAt = 0; e.resume = 'approach'; e.resumeFor = 0;
    e.hood = 1; e.tint = 0; e.cup = null; e.cause = 'crown'; e.down = 0;
    e.point = -1; e.wantPoint = -1; e.namedPoint = -1; e.shots = 0; e.fresh = true; e.miss = false; e.thread = null; e.star = null;
    e.crosshair = 0; e.sidestepAt = -1e9; e.heard = false; e.bell = false; e.badPoints = 0; e.blind = 0; e.stood = 0; e.chooseAt = 0; e.seekNode = -1; e.seekBest = Infinity; e.pass = false;
    e.ventChest = false; e.ventBack = false; e.chargedAt = -1e9; e.flinch = 0;

    inst.root.position.set(x, y, z);
    inst.root.rotation.set(0, yaw + Math.PI, 0);          // assets face +Z, yaw 0 faces -Z
    inst.root.visible = true;
    S.ctx.scene.dynamic.add(inst.root);
    S.ctx.render.setEmissive(inst.root, 1);

    // nodes and hit volumes
    e.head = null; e.socket = null; e.boneA = null; e.boneB = null;
    for (let i = 0; i < e.vol.length; i++) {
      const v: HitVolumeDef | undefined = def.volumes[i];
      if (!v) { e.vol[i] = -1; e.volNode[i] = null; continue; }
      e.volNode[i] = v.node === 'root' ? null : inst.node(v.node);
      e.vol[i] = S.ctx.collision.addVolume({
        shape: v.shape, layer: Layer.ENEMY, flags: 0, surface: SURFACE[kind], entity: e.ref, part: v.part, priority: v.priority, receiver: e,
      });
    }
    if (kind === 'bider') {
      e.head = inst.node('head');
      e.socket = inst.node('hand_socket_r');
      this.vary(e);
    } else if (kind === 'transit') {
      e.head = inst.node('head');
      e.socket = inst.node('stake_muzzle');
    } else if (kind === 'tamper') {
      e.socket = inst.node('ram_head');
      e.boneA = inst.node('vent_chest');
      e.boneB = inst.node('vent_back');
      // rest pose of the lids (a fresh or a reset instance stands in its rest pose) and the open pose: +80 degrees about local X
      this.axis.set(TAMPER.ventAxis[0], TAMPER.ventAxis[1], TAMPER.ventAxis[2]);
      this.q.setFromAxisAngle(this.axis, TAMPER.ventOpenDeg * Math.PI / 180);
      // (read from the asset's template, which no mixer ever poses)
      const template = S.ctx.assets.get(def.asset).scene;
      const restA = findNamed(template, 'vent_chest') ?? e.boneA, restB = findNamed(template, 'vent_back') ?? e.boneB;
      this.ventRest.copy(restA.quaternion); this.ventOpen.copy(restA.quaternion).multiply(this.q);
      this.ventRestB.copy(restB.quaternion); this.ventOpenB.copy(restB.quaternion).multiply(this.q);
    }
    ownSkinnedMaterials(inst.root);                        // (a Bider's tinted variant is already its own)
    this.updateVolumes(e);
    e.shadow = S.ctx.render.vfx.blobShadow();
    if (kind === 'tamper' && e.shadow) e.shadow.setLevel(2);           // 1.1 m x 2: its own feet hid the blob (docs/requests/code-render.md row 7)
    return e;
  }

  /** Bider variety (ART_BIBLE 7): one of four workcloth tints and a +-5 % hood, from the module's RNG stream. */
  private vary(e: Actor): void {
    const { S } = this;
    e.tint = S.rng.int(BIDER.tints.length);
    e.hood = 1 + (S.rng.next() * 2 - 1) * BIDER.hoodScale;
    const inst = e.inst;
    if (!inst) return;
    const tint = BIDER.tints[e.tint] as readonly [number, number, number];
    inst.root.userData.tint = tint;                         // the renderer's hook (docs/requests/code-enemies.md)
    inst.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.userData.tint = tint;
      const base = (mesh.userData.enemiesBaseMaterial as THREE.Material | undefined) ?? (mesh.material as THREE.Material);
      mesh.userData.enemiesBaseMaterial = base;
      const colour = (base as THREE.MeshBasicMaterial).color;
      if (!colour || !(colour as THREE.Color).isColor) return;
      let variants = this.tintCache.get(base);
      if (!variants) {
        variants = BIDER.tints.map((t) => {
          const m = base.clone() as THREE.MeshBasicMaterial;
          m.color.setRGB(colour.r * t[0], colour.g * t[1], colour.b * t[2]);
          return m;
        });
        this.tintCache.set(base, variants);
      }
      mesh.material = variants[e.tint] as THREE.Material;
    });
  }

  /** Take a slot out of the world. `announce` emits enemy/removed (never during clearEncounter / clearAll). */
  release(e: Actor, announce: boolean): void {
    const { S } = this;
    if (!e.used) return;
    this.dropToken(e);
    const col = S.ctx.collision;
    for (let i = 0; i < e.vol.length; i++) { const h = e.vol[i] as number; if (h >= 0) col.removeVolume(h); e.vol[i] = -1; e.volNode[i] = null; }
    if (e.thread) { e.thread.release(); e.thread = null; }
    if (e.star) { e.star.release(); e.star = null; }
    if (e.shadow) { e.shadow.release(); e.shadow = null; }
    if (e.cup) { this.dropInstance(e.cup, 'prop_cup_tin'); e.cup = null; }
    if (e.point >= 0 && e.point < S.nav.owner.length && S.nav.owner[e.point] === e.index) S.nav.owner[e.point] = -1;
    e.point = -1; e.wantPoint = -1; e.namedPoint = -1;
    if (e.inst) {
      // a base material restored, so a pooled instance carries no tint of its last life
      restoreMaterials(e.inst.root);
      this.dropInstance(e.inst, ENEMIES[e.kind].asset);
      e.inst = null;
    }
    if (e.anim) e.anim.unbind();
    e.clip = '';
    e.head = null; e.socket = null; e.boneA = null; e.boneB = null;
    const id = e.id;
    e.used = false; e.alive = false; e.awake = false; e.state = 'none';
    if (announce) { S.ev.removed.id = id; S.ctx.events.emit('enemy/removed', S.ev.removed); }
  }

  /** Give an instance back: to the store's pool while its asset is active, otherwise just out of the scene (its asset was released). */
  dropInstance(inst: NonNullable<Actor['inst']>, asset: string): void {
    if (this.S.ctx.assets.isActive(asset)) inst.release();
    else inst.root.removeFromParent();
  }

  // ---- clips ------------------------------------------------------------------------------------------
  /** The lean clip set of an asset (built once per loaded asset). */
  anims(asset: string): AssetAnims {
    const loaded = this.S.ctx.assets.get(asset);
    let a = this.animsByAsset.get(loaded);
    if (!a) { a = new AssetAnims(loaded.scene, loaded.clips, loaded.def.animations); this.animsByAsset.set(loaded, a); }
    return a;
  }

  createAnim(asset: string, root: THREE.Object3D): Anim {
    const a = new Anim();
    a.bind(this.anims(asset), root);
    return a;
  }

  play(e: Actor, clip: string, fade = 0.1, speed = 1): void {
    if (!e.inst || !e.anim) return;
    const c = e.anim.set ? e.anim.set.clips.get(clip) : undefined;
    if (!c) return;
    e.anim.play(c, fade, speed);
    e.clip = clip;
  }

  setState(e: Actor, state: string): void {
    const p = this.S.ev.state;
    p.id = e.id; p.kind = e.kind; p.from = e.state; p.to = state;
    e.prev = e.state; e.state = state; e.t = 1e-6;                // a hair above zero: `t >= 0.25` is then 15 ticks, not 16
    this.S.ctx.events.emit('enemy/state', p);
  }

  // ---- tokens -----------------------------------------------------------------------------------------
  takeToken(e: Actor, kind: TokenKind): boolean {
    if (e.token !== '') return true;
    if (!this.S.tokens.request(kind, e.index, this.S.time)) return false;
    e.token = kind;
    return true;
  }
  dropToken(e: Actor): void {
    if (e.token === '') return;
    this.S.tokens.release(e.index, this.S.time);
    e.token = '';
  }

  // ---- per tick ---------------------------------------------------------------------------------------
  /** The mixer (with the target-local pose freeze), the code-driven bones, the transform and the hit volumes. */
  animate(e: Actor, dt: number): void {
    const inst = e.inst;
    if (!inst) return;
    if (e.freeze > 0) e.freeze -= dt;
    else if (e.anim && e.shown) { e.anim.advance(dt); e.anim.apply(); }
    if (e.kind === 'bider') {
      if (e.head) e.head.scale.setScalar(e.hood);
    } else if (e.kind === 'tamper' && e.boneA && e.boneB && TAMPER_CLIP_VENTS[e.state] !== true) {
      e.boneA.quaternion.copy(e.ventChest ? this.ventOpen : this.ventRest);
      e.boneB.quaternion.copy(e.ventBack ? this.ventOpenB : this.ventRestB);
    }
    const root = inst.root;
    root.position.set(e.x, e.y, e.z);
    root.rotation.y = e.yaw + Math.PI;
    e.pos.set(e.x, e.y, e.z);
    e.rot.set(e.yaw);
    if (e.alive) this.updateVolumes(e);
  }

  updateVolumes(e: Actor): void {
    const col = this.S.ctx.collision;
    const vols = ENEMIES[e.kind].volumes;
    for (let i = 0; i < e.vol.length; i++) {
      const h = e.vol[i] as number;
      if (h < 0) continue;
      const v = vols[i] as HitVolumeDef;
      const node = e.volNode[i] as THREE.Object3D | null;
      if (node) {
        node.updateWorldMatrix(true, false);
        const m = node.matrixWorld.elements;
        const r = e.kind === 'bider' && v.part === 'crown' ? this.S.difficulty.crownKnotRadius : v.radius;
        col.setSphere(h, m[12] as number, m[13] as number, m[14] as number, r);
      } else {
        const top = v.height ?? 1;
        col.setCapsule(h, e.x, e.y + v.radius, e.z, e.x, e.y + Math.max(v.radius + 0.01, top - v.radius), e.z, v.radius);
      }
    }
  }

  disableVolumes(e: Actor): void {
    const col = this.S.ctx.collision;
    for (let i = 0; i < e.vol.length; i++) { const h = e.vol[i] as number; if (h >= 0) col.setVolumeEnabled(h, false); }
  }

  /** World position of a named node of the actor's instance (state changes, not every tick). */
  nodePos(e: Actor, node: string, out: Vec3): boolean {
    if (!e.inst) return false;
    return this.objectPos(e.inst.node(node), out);
  }
  objectPos(o: THREE.Object3D | null, out: Vec3): boolean {
    if (!o) return false;
    o.updateWorldMatrix(true, false);
    const m = o.matrixWorld.elements;
    out.x = m[12] as number; out.y = m[13] as number; out.z = m[14] as number;
    return true;
  }

  /** Once per rendered frame: draw every body between its last two sim states. */
  present(alpha: number): void {
    const actors = this.S.actors, p = this.lerp;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = actors[i] as Actor;
      if (!e.used || !e.inst) continue;
      e.pos.get(alpha, p);
      const root = e.inst.root;
      root.position.set(p.x, p.y, p.z);
      root.rotation.y = e.rot.get(alpha) + Math.PI;
      if (e.shadow) e.shadow.setPosition(p.x, p.y + 0.02, p.z);
    }
  }

  // ---- dormant and vignette actors follow the visibility of their zone -----------------------------------
  refreshShown(): void {
    const { S } = this;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = S.actors[i] as Actor;
      if (!e.used || !e.inst) continue;
      const hidden = (!e.awake || e.vignette !== '') && e.alive && e.zone !== '' && !S.ctx.render.zoneVisible(e.zone);
      e.shown = !hidden;
      e.inst.root.visible = e.shown;
    }
  }

  // ---- static bodies ----------------------------------------------------------------------------------
  /**
   * One instance of a static body, carrying an instance colour (white) from the start. Every instanced set this module
   * makes does: sets that share a material (core's fallback is one material for everything) must all have instance
   * colours or none, or three re-derives the material's program for each of them every frame. Fix round 1: a freed
   * Bider's static body beside one stuck stake cost 9.6 KB per rendered frame (docs/requests/code-enemies.md 1.5).
   */
  private addInstance(asset: string, x: number, y: number, z: number, rotY: number): number {
    const inst = this.S.ctx.render.instances;
    const handle = inst.add(asset, '', x, y, z, rotY, 1);
    if (handle >= 0) inst.setTint(handle, 1, 1, 1);
    return handle;
  }
  addStatic(asset: string, x: number, y: number, z: number, rotY: number): void {
    const { S } = this;
    if (S.statics.length >= STATIC_CAP) {
      const old = S.statics.shift() as StaticBody;
      if (old.handle >= 0) S.ctx.render.instances.remove(old.handle);
    }
    const handle = this.addInstance(asset, x, y, z, rotY);
    S.statics.push({ asset, x, y, z, rotY, handle });
  }
  clearStatics(): void {
    const { S } = this;
    for (const b of S.statics) if (b.handle >= 0) S.ctx.render.instances.remove(b.handle);
    S.statics.length = 0;
  }
  /** The set changed: the instanced meshes were rebuilt, so every body is added again. */
  readdStatics(): void {
    const { S } = this;
    for (const b of S.statics) {
      if (b.handle >= 0) S.ctx.render.instances.remove(b.handle);
      b.handle = this.addInstance(b.asset, b.x, b.y, b.z, b.rotY);
    }
  }
}


// =============================================================================================================
// Clips without three's AnimationMixer: a lean sampler (zero allocation per tick, a crossfade between two clips)
// =============================================================================================================

/** One animated property of one node: position (0), quaternion (1) or scale (2). */
export interface LeanTrack {
  /** index into AssetAnims.names; slot = node * 3 + prop */
  node: number; prop: number; slot: number; size: number;
  times: Float32Array; values: Float32Array;
  /** STEP keys hold until the next key */
  step: boolean;
}
export interface LeanClip { name: string; duration: number; seconds: number; loop: boolean; tracks: LeanTrack[] }

/**
 * The clips of one loaded asset, each without the tracks that hold their node at its rest value for the whole clip
 * (scale 1, the rig's offsets: two thirds of the tracks of every enemy clip). A node no clip animates stays at rest.
 */
export class AssetAnims {
  readonly names: string[] = [];
  readonly rest: number[][] = [];
  readonly clips = new Map<string, LeanClip>();
  constructor(template: THREE.Object3D, clips: ReadonlyMap<string, THREE.AnimationClip>, defs: readonly { name: string; loop: boolean; seconds: number }[]) {
    for (const def of defs) {
      const clip = clips.get(def.name);
      if (!clip) continue;
      const tracks: LeanTrack[] = [];
      for (const track of clip.tracks) {
        const parsed = THREE.PropertyBinding.parseTrackName(track.name);
        const node = THREE.PropertyBinding.findNode(template, parsed.nodeName) as THREE.Object3D | null;
        const prop = parsed.propertyName === 'position' ? 0 : parsed.propertyName === 'quaternion' ? 1 : parsed.propertyName === 'scale' ? 2 : -1;
        if (!node || prop < 0) continue;
        const size = prop === 1 ? 4 : 3;
        let values = track.values as Float32Array;
        const keys = track.times.length;
        if (values.length === keys * size * 3) {
          // a cubic spline: in-tangent, value, out-tangent per key; keep the values (sampled linearly)
          const v = new Float32Array(keys * size);
          for (let k = 0; k < keys; k++) for (let j = 0; j < size; j++) v[k * size + j] = values[k * size * 3 + size + j] as number;
          values = v;
        }
        if (values.length !== keys * size) continue;
        const restOf = prop === 0 ? [node.position.x, node.position.y, node.position.z] : prop === 1 ? [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w] : [node.scale.x, node.scale.y, node.scale.z];
        let still = true;
        for (let k = 0; k < keys && still; k++) {
          if (size === 4) {
            const dot = (values[k * 4] as number) * (restOf[0] as number) + (values[k * 4 + 1] as number) * (restOf[1] as number) + (values[k * 4 + 2] as number) * (restOf[2] as number) + (values[k * 4 + 3] as number) * (restOf[3] as number);
            if (Math.abs(dot) < 1 - 1e-8) still = false;
          } else for (let j = 0; j < 3; j++) if (Math.abs((values[k * 3 + j] as number) - (restOf[j] as number)) > 1e-4) { still = false; break; }
        }
        if (still) continue;
        let index = this.names.indexOf(parsed.nodeName);
        if (index < 0) { index = this.names.length; this.names.push(parsed.nodeName); this.rest.push([]); }
        (this.rest[index] as number[])[prop] = 0;
        tracks.push({ node: index, prop, slot: index * 3 + prop, size, times: track.times as Float32Array, values, step: track.getInterpolation() === THREE.InterpolateDiscrete });
      }
      this.clips.set(def.name, { name: def.name, duration: clip.duration, seconds: def.seconds, loop: def.loop, tracks });
    }
    // rest values per node and property (position, quaternion, scale), 4 floats each
    for (let i = 0; i < this.names.length; i++) {
      const node = THREE.PropertyBinding.findNode(template, this.names[i] as string) as THREE.Object3D;
      this.rest[i] = [node.position.x, node.position.y, node.position.z, 0, node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w, node.scale.x, node.scale.y, node.scale.z, 0];
    }
  }
}

const MAX_SLOTS = 64 * 3;

/**
 * Doubles handed between the functions below go through this scratch, not through arguments: V8 boxes a double argument
 * (a 12-byte HeapNumber) at every call it does not inline, and the sampler runs per track per body per tick
 * (measured, six Biders: 370 B per tick from `apply` and `write` before, see docs/requests/code-enemies.md 6).
 * [0] the clip time for `sample`, [1] the blend weight for `blendQuat`.
 */
const ARG = new Float64Array(2);

/** Sample one track at the clip time in ARG[0] into out[0..size). */
function sample(t: LeanTrack, out: Float64Array): void {
  const time = ARG[0] as number;
  const times = t.times, v = t.values, n = times.length, size = t.size;
  // the first key after `time` (binary search: a handful of steps)
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if ((times[mid] as number) > time) hi = mid; else lo = mid + 1; }
  if (lo === 0 || lo >= n || t.step) {
    const k = (lo === 0 ? 0 : lo - 1) * size;
    for (let j = 0; j < size; j++) out[j] = v[k + j] as number;
    return;
  }
  const t0 = times[lo - 1] as number, t1 = times[lo] as number;
  const u = t1 > t0 ? (time - t0) / (t1 - t0) : 0;
  const a = (lo - 1) * size, b = lo * size;
  if (size === 4) { ARG[1] = u; blendQuat(v, a, v, b, out); }
  else for (let j = 0; j < 3; j++) out[j] = (v[a + j] as number) + ((v[b + j] as number) - (v[a + j] as number)) * u;
}

/** Normalised lerp of two quaternions along the short arc (close keys and short fades: no slerp needed). */
function blendQuat(p: ArrayLike<number>, pa: number, q: ArrayLike<number>, qa: number, out: Float64Array): void {
  const u = ARG[1] as number;
  const x0 = p[pa] as number, y0 = p[pa + 1] as number, z0 = p[pa + 2] as number, w0 = p[pa + 3] as number;
  let x1 = q[qa] as number, y1 = q[qa + 1] as number, z1 = q[qa + 2] as number, w1 = q[qa + 3] as number;
  if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
  const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, z = z0 + (z1 - z0) * u, w = w0 + (w1 - w0) * u;
  const l = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l; out[3] = w / l;
}

/**
 * One instance's clip player: the current clip, and the previous one fading out under it. Times are in clip seconds;
 * a clip lasts the manifest's seconds (the authored length only sets the playback rate, never gameplay).
 */
export class Anim {
  set: AssetAnims | null = null;
  private readonly nodes: (THREE.Object3D | null)[] = [];
  cur: LeanClip | null = null;
  private curT = 0;
  private curRate = 1;
  private prev: LeanClip | null = null;
  private prevT = 0;
  private prevRate = 1;
  private fadeT = 0;
  private fadeDur = 0;
  private stamp = 0;
  private readonly prevVal = new Float64Array(MAX_SLOTS * 4);
  private readonly prevStamp = new Int32Array(MAX_SLOTS);
  private readonly curStamp = new Int32Array(MAX_SLOTS);
  private readonly a = new Float64Array(4);
  private readonly b = new Float64Array(4);
  /** true once a clip that does not loop has reached its end */
  done = false;

  bind(set: AssetAnims, root: THREE.Object3D): void {
    this.set = set;
    this.nodes.length = 0;
    for (let i = 0; i < set.names.length; i++) this.nodes.push(THREE.PropertyBinding.findNode(root, set.names[i] as string) as THREE.Object3D | null);
    this.cur = null; this.prev = null; this.done = false; this.fadeDur = 0;
    // an instance back from the store's pool still holds the last pose it was given: every animated node to rest
    for (let i = 0; i < this.nodes.length; i++) {
      const o = this.nodes[i], r = set.rest[i] as number[];
      if (!o) continue;
      o.position.set(r[0] as number, r[1] as number, r[2] as number);
      o.quaternion.set(r[4] as number, r[5] as number, r[6] as number, r[7] as number);
      o.scale.set(r[8] as number, r[9] as number, r[10] as number);
    }
  }
  unbind(): void { this.set = null; this.nodes.length = 0; this.cur = null; this.prev = null; }

  /** Seconds into the current clip, in the clip's own (manifest) seconds. */
  get time(): number { return this.cur ? this.curT / Math.max(1e-6, this.curRate) : 0; }

  play(clip: LeanClip, fade: number, speed: number): void {
    const rate = (clip.seconds > 1e-6 ? clip.duration / clip.seconds : 1) * speed;
    if (this.cur === clip && clip.loop && !this.done) { this.curRate = rate; return; }
    if (this.cur && fade > 0) {
      this.prev = this.cur; this.prevT = this.curT; this.prevRate = this.done ? 0 : this.curRate;
      this.fadeT = 0; this.fadeDur = fade;
    } else {
      // no fade: whatever the old clip moved and the new one does not goes back to rest at once
      if (this.cur) { this.prev = this.cur; this.prevT = this.curT; this.fadeDur = 1e-6; this.fadeT = 1e-6; }
    }
    this.cur = clip; this.curT = 0; this.curRate = rate; this.done = false;
  }

  advance(dt: number): void {
    const c = this.cur;
    if (c) {
      this.curT += dt * this.curRate;
      if (this.curT >= c.duration) {
        if (c.loop && c.duration > 1e-6) this.curT %= c.duration;
        else { this.curT = c.duration; this.done = true; }
      }
    }
    const p = this.prev;
    if (p) {
      this.prevT += dt * this.prevRate;
      if (this.prevT >= p.duration) this.prevT = p.loop && p.duration > 1e-6 ? this.prevT % p.duration : p.duration;
      this.fadeT += dt;
    }
  }

  /** Write the pose: the current clip blended over the fading one (or over rest, for what only one of them moves). */
  apply(): void {
    const set = this.set, c = this.cur;
    if (!set || !c) return;
    const stamp = ++this.stamp;
    const p = this.prev;
    const w = p ? (this.fadeDur > 0 ? Math.min(1, this.fadeT / this.fadeDur) : 1) : 1;
    this.w = w;
    if (p) {
      const tracks = p.tracks;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i] as LeanTrack;
        ARG[0] = this.prevT;
        sample(t, this.a);
        const o = t.slot * 4;
        for (let j = 0; j < t.size; j++) this.prevVal[o + j] = this.a[j] as number;
        this.prevStamp[t.slot] = stamp;
      }
    }
    const tracks = c.tracks;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i] as LeanTrack;
      ARG[0] = this.curT;
      sample(t, this.a);
      this.curStamp[t.slot] = stamp;
      if (w < 1) {
        // from the fading clip's value (or rest) to this one
        if (this.prevStamp[t.slot] === stamp) this.mix(this.prevVal, t.slot * 4, this.a, t.size);
        else this.mixRest(set, t, this.a, true);
      }
      this.write(t.node, t.prop, this.a);
    }
    if (p) {
      const pt = p.tracks;
      for (let i = 0; i < pt.length; i++) {
        const t = pt[i] as LeanTrack;
        if (this.curStamp[t.slot] === stamp) continue;
        // only the fading clip moves this one: it eases back to rest
        const o = t.slot * 4;
        for (let j = 0; j < t.size; j++) this.a[j] = this.prevVal[o + j] as number;
        this.mixRest(set, t, this.a, false);
        this.write(t.node, t.prop, this.a);
      }
      if (w >= 1) this.prev = null;
    }
  }

  /** the blend weight of the apply() in hand (a field, not an argument: see ARG) */
  private w = 1;
  /** out = from (at `fromOffset`) -> out, by this.w (blendQuat reads its inputs before it writes: aliasing is safe) */
  private mix(from: Float64Array, fromOffset: number, out: Float64Array, size: number): void {
    const w = this.w;
    if (size === 4) { ARG[1] = w; blendQuat(from, fromOffset, out, 0, out); return; }
    for (let j = 0; j < size; j++) out[j] = (from[fromOffset + j] as number) + ((out[j] as number) - (from[fromOffset + j] as number)) * w;
  }
  /** toward = true: rest -> out by this.w; false: out -> rest by this.w */
  private mixRest(set: AssetAnims, t: LeanTrack, out: Float64Array, toward: boolean): void {
    const rest = set.rest[t.node] as number[], o = t.prop * 4, b = this.b, w = this.w;
    for (let j = 0; j < t.size; j++) b[j] = rest[o + j] as number;
    if (t.size === 4) { ARG[1] = w; if (toward) blendQuat(b, 0, out, 0, out); else blendQuat(out, 0, b, 0, out); return; }
    for (let j = 0; j < 3; j++) out[j] = toward ? (b[j] as number) + ((out[j] as number) - (b[j] as number)) * w : (out[j] as number) + ((b[j] as number) - (out[j] as number)) * w;
  }
  private write(node: number, prop: number, v: Float64Array): void {
    const o = this.nodes[node];
    if (!o) return;
    // fromArray, not set(x, y, z, w): an array and an offset cross the call, no boxed doubles
    if (prop === 1) o.quaternion.fromArray(v, 0);
    else if (prop === 0) o.position.fromArray(v, 0);
    else o.scale.fromArray(v, 0);
  }
}
