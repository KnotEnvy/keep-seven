// src/enemies/boss/index.ts: the Windlass (GDD 8; work order 4.7): phases, pips, the body and its hit volumes, the
// hush, the proof and the save state. The pattern clocks are in attacks.ts, the asking in parley.ts, the arm in arm.ts,
// canisters / lance / fan in ordnance.ts, the Bider adds in adds.ts.
import * as THREE from 'three';
import { FIXED_DT, Layer } from '../../core/contracts.ts';
import type {
  AssetInstance, BossPhase, BossView, DamageInfo, EnemiesSave, EntityRef, FxHandle, GameEvents, GuardState, HitReceiver, HitResponse,
  HitResult, Vec3,
} from '../../core/contracts.ts';
import { BOSS, BOSS_BY, TRANSIT } from '../defs.ts';
import type { Shared } from '../internals.ts';
import type { Anim } from '../pool.ts';
import { findNamed, ownSkinnedMaterials, respond, restoreMaterials } from '../internals.ts';
import { Adds } from './adds.ts';
import { Arm, bayOfBearing, bearingDeg, canisterBearing, clampToArc, oppositeBay } from './arm.ts';
import { beginIndex, breakPhase, enterDry, startKill, tickFight } from './attacks.ts';
import { Ordnance } from './ordnance.ts';
import { parleyShot, startParley, tickParley } from './parley.ts';

const RAD = Math.PI / 180;
const SPHERE_SLOP = 0.025;
const KNOT_R: number = BOSS.knotRadius, PAWL_R: number = BOSS.pawlRadius, KNOT_ALONG = 2.8, PAWL_ALONG = 3.95;
type PartKind = 'mouth' | 'pawl' | 'guard' | 'shutter';
const FIGHT: Readonly<Partial<Record<BossPhase, boolean>>> = { p1: true, p2: true, p3a: true, hush: true };

class Part implements HitReceiver {
  volume = -1;
  constructor(private readonly boss: Boss, readonly kind: PartKind, readonly index: number) {}
  onHit(hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void { this.boss.onHit(this, hit, damage, out); }
}

/** Remaining pips shown for a phase with `hits` taken in it and `dark` knots (GDD 8.2: 26 = 10 + 10 + 6). */
export function pipsFor(phase: BossPhase, hits: number, dark: number): number {
  switch (phase) {
    case 'idle': case 'parley': case 'p1': return BOSS.pipsTotal - Math.min(hits, BOSS.pipsP1);
    case 'p2': return BOSS.pipsP2 + BOSS.pipsP3 - Math.min(hits, BOSS.pipsP2);
    case 'p3a': case 'hush': case 'proven': return BOSS.pipsP3 - dark;          // nothing is removed for good before the proof
    case 'p3b': return BOSS.pipsP3 - Math.min(hits, BOSS.pipsP3);
    default: return 0;
  }
}

/** Hits that count from a round of `n` hits when `taken` of the phase's `total` are already down (damage does not carry across a phase). */
export function countHits(taken: number, total: number, n: number): number { return Math.max(0, Math.min(n, total - taken)); }

export class Boss {
  readonly ref: EntityRef = { id: 'windlass', kind: 'windlass' };
  phase: BossPhase = 'idle';
  /** step inside a phase: 'rest', 'transition', 'index', 'pattern', 'haul', 'fan', 'headdry', 'kill_run', 'sag', 'after' */
  sub = 'rest';
  /** seconds in `sub`, in the phase, and unscaled seconds in the phase (the parley timeline) */
  t = 0;
  pt = 0;
  ut = 0;
  /** length of the current 'transition' */
  lead: number = BOSS.transition;
  hits = 0;
  guard: GuardState = 'parked';
  parleyHeard = false;
  deaths = 0;
  /** its first stake at her has not been fired yet (it always misses) */
  fresh = true;
  // ---- parley
  parleyStage = 0;
  refused = false;
  // ---- mouths (index 0..5 = mouth 1..6)
  readonly want = new Uint8Array(6);
  readonly openF = new Float32Array(6);
  readonly dark = new Uint8Array(6);
  readonly relightAt = new Float64Array(6);
  readonly lamp = new Uint8Array(6);
  readonly pawl = new Uint8Array(2);
  private readonly threads: (FxHandle | null)[] = [null, null, null, null, null, null];
  // ---- pattern
  step = 0;
  slotT = 0;
  slotFired = false;
  /** mouth index glowing before a discharge, -1 otherwise */
  discharging = -1;
  dischargeKind: 'stake' | 'canister' | 'lance' = 'stake';
  parried = false;
  hauling = false;
  haulSeconds = 0;
  guardSaid = false;
  /** the teaching line of this try has been said (BOSS.teachKey) */
  taught = false;
  // ---- phase 3
  chargeAsked = false;
  /** seconds since `stn_boss_charge_required` was last said (it repeats until the kept round is loaded) */
  chargeSaid = 0;
  /** phase 3a has said `stn_boss_hauling` (once per phase) */
  haulSaid3a = false;
  keptLoaded = false;
  hintT3 = false;
  hintT4 = false;
  relit = false;
  hushFrom = 1;
  /** unscaled module time the hush's slow motion was last asked for */
  private hushSlowAt = -1e9;
  dryClock = 0;
  drySaid = 0;
  shots3b = 0;
  reload3b = false;
  cleanSix = false;
  killClicks = 0;
  // ---- parts
  readonly arm = new Arm();
  readonly ord: Ordnance;
  readonly adds: Adds;
  readonly view: BossView;
  // ---- body
  inst: AssetInstance | null = null;
  axisX = 14; axisY = -44; axisZ = 96;
  private armBone: THREE.Object3D | null = null;
  private drumBone: THREE.Object3D | null = null;
  private readonly mouthBone: (THREE.Object3D | null)[] = [null, null, null, null, null, null];
  private readonly knotBone: (THREE.Object3D | null)[] = [null, null, null, null, null, null];
  private readonly knotHit: (THREE.Object3D | null)[] = [null, null, null, null, null, null];
  private readonly anchor: (THREE.Object3D | null)[] = [null, null, null, null, null, null];
  private readonly pawlBone: (THREE.Object3D | null)[] = [null, null];
  private readonly pawlHit: (THREE.Object3D | null)[] = [null, null];
  private muzzle: THREE.Object3D | null = null;
  private canMuzzle: THREE.Object3D | null = null;
  private lampSet: THREE.Object3D | null = null;
  private gauge: THREE.Object3D | null = null;
  private looseLamps = false;
  private readonly lampRest = new THREE.Vector3();
  private readonly gaugeRest = new THREE.Vector3();
  private readonly armRest = new THREE.Quaternion();
  private readonly armAxis = new THREE.Vector3(0, 1, 0);
  private readonly drumRest = new THREE.Quaternion();
  private readonly drumAxis = new THREE.Vector3(0, 0, 1);
  /** rest pose of each lid, and the open swing as a turn relative to mouth_1's rest (the same for every lid) */
  private readonly mouthRest: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly rest1Inv = new THREE.Quaternion();
  private readonly swing = new THREE.Quaternion();
  private readonly swingOpen = new THREE.Quaternion();
  private readonly identity = new THREE.Quaternion();
  /** +1 when mouth 2 is reached by a positive turn about the heading axis (final art: clockwise seen from the front), -1 otherwise */
  spinSign = 1;
  /** mouth_open's swing of mouth_1, sampled at 21 even steps when the body is made (null: the clip does not move the lid) */
  private mouthTable: Float32Array | null = null;
  /** mouth_close's swing of mouth_1, the same way (null: no such clip, or it is not mouth_open's reverse: a lid then shuts along mouth_open backwards) */
  private closeTable: Float32Array | null = null;
  private readonly mt = new Float64Array(4);
  private readonly q = new THREE.Quaternion();
  private readonly v3 = new THREE.Vector3();
  private readonly parts: Part[] = [];
  /** the body clip player: idle_sway, or the last one-shot (present, guard_*, sag_death) held on its last frame */
  private anim: Anim | null = null;
  bodyClip = '';
  private lastMask = -1;
  private lastGauge = -1;
  private lastClicks = 0;
  // ---- scratch payloads
  private readonly evPhase: GameEvents['boss/phase'] = { phase: 'idle', from: 'idle' };
  private readonly evPips: GameEvents['boss/pips'] = { phase: 'idle', remaining: 26, total: 26, lit: 26 };
  private readonly evIndexing: GameEvents['boss/indexing'] = { fromBay: 1, toBay: 1, seconds: 0 };
  private readonly evDischarge: GameEvents['boss/discharge'] = { kind: 'stake', mouth: 1, glowSeconds: 0, parryable: false };
  private readonly evHaul: GameEvents['boss/haul'] = { on: false, seconds: 0 };
  private readonly evMouth: GameEvents['boss/mouth'] = { mouth: 1, state: 'open' };
  private readonly evGuard: GameEvents['boss/guard'] = { state: 'parked' };
  private readonly evPawl: GameEvents['boss/pawl'] = { side: 'l', burst: false };
  private readonly evParley: GameEvents['boss/parley'] = { stage: 'start' };
  private readonly evHush: GameEvents['boss/hush'] = { on: false };
  private readonly evHeadDry: GameEvents['boss/head_dry'] = { seconds: 6 };
  private readonly evProven: GameEvents['boss/proven'] = { x: 0, y: 0, z: 0 };
  private readonly evDefeated: GameEvents['boss/defeated'] = { cleanSix: false };
  private readonly evCharge: GameEvents['boss/charge_required'] = {};
  private readonly tmp: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(readonly S: Shared) {
    this.ord = new Ordnance(S, this);
    this.adds = new Adds(S);
    for (let i = 0; i < 6; i++) this.parts.push(new Part(this, 'mouth', i));
    this.parts.push(new Part(this, 'pawl', 0), new Part(this, 'pawl', 1), new Part(this, 'guard', 0), new Part(this, 'shutter', 0));
    const m = S.ctx.data.layout.markers.find((x) => x.id === 'sp_windlass');
    if (m) { this.axisX = m.pos[0]; this.axisY = m.pos[1]; this.axisZ = m.pos[2]; }
    for (let i = 0; i < 6; i++) this.lamp[i] = 1;
    const self = this;
    this.view = {
      get phase() { return self.phase; },
      get pips() { return self.pips; },
      get pipsTotal() { return BOSS.pipsTotal; },
      get armBay() { return self.arm.bay; },
      get guard() { return self.guard; },
      get mouthsOpen() { return self.mouthsOpen; },
      get marksLit() { return self.phase === 'p3a' || self.phase === 'hush'; },
      get hush() { return self.phase === 'hush'; },
    };
  }

  // ---- derived state --------------------------------------------------------------------------------------
  get darkCount(): number { let n = 0; for (let i = 0; i < 6; i++) n += this.dark[i] as number; return n; }
  get pips(): number { return pipsFor(this.phase, this.hits, this.darkCount); }
  get mouthsOpen(): number { let n = 0; for (let i = 0; i < 6; i++) if ((this.openF[i] as number) > 0.5) n++; return n; }
  get fighting(): boolean { return FIGHT[this.phase] === true || this.phase === 'parley' || this.phase === 'proven' || this.phase === 'p3b'; }
  /** counts toward the threat and the alive cap */
  get alive(): boolean { return this.phase !== 'idle' && this.phase !== 'dead'; }
  /** boss damage x0.85 after two deaths in the same phase (GDD 8.3) */
  get damageScale(): number { return this.deaths >= BOSS.mercyDeaths ? BOSS.mercyScale : 1; }
  /** index (0..5) of the mouth at the top for the drum's spin */
  get topMouth(): number { return (((Math.round(this.arm.spin * this.spinSign / 60) % 6) + 6) % 6); }
  playerBay(): number { return bayOfBearing(bearingDeg(this.S.px, this.S.pz, this.axisX, this.axisZ)); }

  // ---- events ---------------------------------------------------------------------------------------------
  emitPips(): void {
    const p = this.evPips, n = this.pips;
    p.phase = this.phase; p.remaining = n; p.total = BOSS.pipsTotal; p.lit = n;
    this.S.ctx.events.emit('boss/pips', p);
  }
  /** Change phase. Everything a save must hold is set before the event goes out (the checkpoint commits inside it). */
  setPhase(phase: BossPhase): void {
    const from = this.phase;
    if (from === phase) return;
    this.phase = phase;
    this.S.hush = phase === 'hush';
    this.pt = 0; this.ut = 0; this.t = 0;
    this.evPhase.phase = phase; this.evPhase.from = from;
    this.S.ctx.events.emit('boss/phase', this.evPhase);
    this.emitPips();
  }
  mouthEvent(index: number, state: GameEvents['boss/mouth']['state']): void {
    this.evMouth.mouth = index + 1; this.evMouth.state = state;
    this.S.ctx.events.emit('boss/mouth', this.evMouth);
  }
  setGuard(state: GuardState): void {
    if (this.guard === state) return;
    this.guard = state;
    if (this.inst) this.syncMouthGate();                    // the knots behind a guard that has just dropped are live on this tick
    this.evGuard.state = state;
    this.S.ctx.events.emit('boss/guard', this.evGuard);
  }
  haulEvent(on: boolean, seconds: number): void {
    this.evHaul.on = on; this.evHaul.seconds = seconds;
    this.S.ctx.events.emit('boss/haul', this.evHaul);
  }
  indexingEvent(fromBay: number, toBay: number, seconds: number): void {
    const e = this.evIndexing;
    e.fromBay = fromBay; e.toBay = toBay; e.seconds = seconds;
    this.S.ctx.events.emit('boss/indexing', e);
  }
  parleyEvent(stage: GameEvents['boss/parley']['stage']): void {
    this.evParley.stage = stage;
    this.S.ctx.events.emit('boss/parley', this.evParley);
  }
  headDryEvent(): void { this.evHeadDry.seconds = BOSS.headDry; this.S.ctx.events.emit('boss/head_dry', this.evHeadDry); }
  chargeEvent(): void { this.S.ctx.events.emit('boss/charge_required', this.evCharge); }
  defeatedEvent(): void { this.evDefeated.cleanSix = this.cleanSix; this.S.ctx.events.emit('boss/defeated', this.evDefeated); }
  /** `boss/discharge` for the mouth in hand (or the top mouth). */
  discharged(kind: GameEvents['boss/discharge']['kind'], glowSeconds: number, parryable: boolean): void {
    const e = this.evDischarge;
    e.kind = kind; e.mouth = (this.discharging >= 0 ? this.discharging : this.topMouth) + 1; e.glowSeconds = glowSeconds; e.parryable = parryable;
    this.S.ctx.events.emit('boss/discharge', e);
  }
  cue(cue: GameEvents['audio/cue']['cue']): void {
    this.hub(this.tmp);
    this.S.cue(cue, this.tmp.x, this.tmp.y, this.tmp.z);
  }

  // ---- geometry -------------------------------------------------------------------------------------------
  /** The drum's hub (2 m out along the heading, 4 m up). */
  hub(out: Vec3): void {
    const b = this.arm.heading * RAD;
    out.x = this.axisX + Math.sin(b) * 2.0; out.y = this.axisY + 4.0; out.z = this.axisZ - Math.cos(b) * 2.0;
  }
  private nodeAt(o: THREE.Object3D | null, out: Vec3, up: number, along: number): void {
    if (o) {
      o.updateWorldMatrix(true, false);
      const m = o.matrixWorld.elements;
      out.x = m[12] as number; out.y = m[13] as number; out.z = m[14] as number;
      return;
    }
    const b = this.arm.heading * RAD;
    out.x = this.axisX + Math.sin(b) * along; out.y = this.axisY + up; out.z = this.axisZ - Math.cos(b) * along;
  }
  muzzlePos(out: Vec3): void { this.nodeAt(this.muzzle, out, 5.7, 3.1); }
  /** Debug and tests: the centre of knot i (0..5), pawl i (0 l, 1 r), the guard or the hub. */
  pointOf(kind: 'knot' | 'pawl' | 'guard' | 'hub', i: number, out: Vec3): void {
    if (kind === 'knot') this.nodeAt(this.knotHit[i] ?? null, out, 4, 2.8);
    else if (kind === 'pawl') this.nodeAt(this.pawlHit[i] ?? null, out, 6, 3.95);
    else if (kind === 'guard') { const b = this.arm.heading * RAD; out.x = this.axisX + Math.sin(b) * 3.25; out.y = this.axisY + 4.0; out.z = this.axisZ - Math.cos(b) * 3.25; }
    else this.hub(out);
  }
  canisterPos(out: Vec3): void { this.nodeAt(this.canMuzzle, out, 4.0, 3.1); }

  /**
   * One stake from the firing position toward a point, clamped into the arm's arc (GDD 8: it aims only within
   * +-35 degrees of its heading). Its first stake at her is a deliberate miss (work order 4.1).
   */
  fireStake(tx: number, ty: number, tz: number, damage: number, kind: 'stake' | 'fan'): void {
    const { S } = this;
    const dist = Math.hypot(tx - this.axisX, tz - this.axisZ);
    const b = clampToArc(bearingDeg(tx, tz, this.axisX, this.axisZ), this.arm.heading) * RAD;
    let x = this.axisX + Math.sin(b) * dist, z = this.axisZ - Math.cos(b) * dist;
    const m = this.tmp;
    this.muzzlePos(m);
    if (this.fresh && kind === 'stake') {
      this.fresh = false;
      const dx = x - m.x, dz = z - m.z, l = Math.hypot(dx, dz) || 1;
      let sx = -dz / l, sz = dx / l;
      if (sx * S.pvx + sz * S.pvz > 0) { sx = -sx; sz = -sz; }
      x += sx * TRANSIT.missOffset; z += sz * TRANSIT.missOffset;
    }
    const dx = x - m.x, dy = ty - m.y, dz = z - m.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const s = S.shot;
    s.ox = m.x; s.oy = m.y; s.oz = m.z;
    s.dx = dx / l; s.dy = dy / l; s.dz = dz / l;
    s.speed = BOSS.stakeSpeed * BOSS_BY[S.difficultyId].stakeSpeedScale; s.damage = damage * this.damageScale;
    s.kind = kind; s.source = 'windlass'; s.sourceId = 'windlass'; s.encounter = 'enc_windlass'; s.harmful = true; s.maxDistance = 0;
    S.stakes.fire(s);
  }

  /** A canister lobbed to where she stands now (inside the arc), from the canister mouth. */
  lobCanister(): void {
    const { S } = this;
    const dist = Math.hypot(S.px - this.axisX, S.pz - this.axisZ);
    const b = canisterBearing(bearingDeg(S.px, S.pz, this.axisX, this.axisZ), this.arm.heading, dist) * RAD;
    const m = this.tmp;
    this.canisterPos(m);
    this.ord.launchCanister(m.x, m.y, m.z, this.axisX + Math.sin(b) * dist, S.py, this.axisZ - Math.cos(b) * dist, BOSS.canisterDamage * this.damageScale);
  }

  // ---- the body -------------------------------------------------------------------------------------------
  /** Stand the Windlass on its marker when the bore is built and its asset is active. */
  ensureBody(): boolean {
    const { S } = this;
    if (this.inst) return true;
    if (!S.ctx.world.builtZones.includes('the_bore') || !S.ctx.assets.isActive('boss_windlass')) return false;
    const loaded = S.ctx.assets.get('boss_windlass');
    const inst = S.ctx.assets.instantiate('boss_windlass');
    this.inst = inst;
    inst.root.position.set(this.axisX, this.axisY, this.axisZ);
    inst.root.rotation.set(0, Math.PI, 0);                // the asset's arm heads +Z at yaw 0; bay 1 (the door) is -Z
    S.ctx.scene.dynamic.add(inst.root);
    ownSkinnedMaterials(inst.root);
    this.armBone = inst.node('arm_yaw');
    this.drumBone = inst.node('drum_spin');
    for (let i = 0; i < 6; i++) {
      this.mouthBone[i] = inst.node(`mouth_${i + 1}`);
      this.knotBone[i] = inst.node(`knot_${i + 1}`);
      this.knotHit[i] = inst.node(`knot_${i + 1}_hit`);
      this.anchor[i] = inst.node(`thread_anchor_${i + 1}`);
    }
    this.pawlBone[0] = inst.node('pawl_l'); this.pawlBone[1] = inst.node('pawl_r');
    this.pawlHit[0] = inst.node('pawl_l_hit'); this.pawlHit[1] = inst.node('pawl_r_hit');
    this.muzzle = inst.node('muzzle_top');
    this.canMuzzle = inst.node('canister_muzzle');
    this.lampSet = inst.node('boss_lamps');
    this.gauge = inst.node('gauge');
    // lamp sets that are plain children of the root (the placeholder) do not ride the arm: they are carried by code
    this.looseLamps = this.lampSet.parent === inst.root && (this.lampSet as THREE.SkinnedMesh).isSkinnedMesh !== true;
    if (this.looseLamps) { this.lampRest.copy(this.lampSet.position); this.gaugeRest.copy(this.gauge.position); }
    // rest frames come from the template, which no mixer and no code ever poses
    const tpl = loaded.scene;
    const armT = findNamed(tpl, 'arm_yaw'), drumT = findNamed(tpl, 'drum_spin');
    if (armT) { this.armRest.copy(armT.quaternion); restAxis(armT, tpl, 0, 1, 0, this.armAxis); }
    if (drumT) { this.drumRest.copy(drumT.quaternion); restAxis(drumT, tpl, 0, 0, 1, this.drumAxis); }
    for (let i = 0; i < 6; i++) { const t = findNamed(tpl, `mouth_${i + 1}`); if (t) (this.mouthRest[i] as THREE.Quaternion).copy(t.quaternion); }
    this.rest1Inv.copy(this.mouthRest[0] as THREE.Quaternion).invert();
    // without a moving clip (the placeholder): the lid swings 110 degrees aside about its local X (art-boss 4.1)
    this.swingOpen.setFromAxisAngle(this.v3.set(1, 0, 0), 110 * RAD);
    // which way round the mouths are numbered: where knot 2 sits beside the hub
    const knot2 = findNamed(tpl, 'knot_2_hit');
    this.spinSign = knot2 && knot2.position.x < 0 ? -1 : 1;
    // mouth_open is authored on mouth_1 and retargeted here to every mouth (they share one local rest frame)
    // a clip that does not move the lid (the placeholder's) is replaced by the 110 degree swing of the art order
    this.mouthTable = lidTable(loaded.clips.get('mouth_open'));
    // mouth_close (the reverse with a 4 degree bounce) drives a lid on its way shut, when it is the reverse of mouth_open
    const close = this.mouthTable ? lidTable(loaded.clips.get('mouth_close')) : null;
    this.closeTable = close && quatDot(close, 0, this.mouthTable as Float32Array, 80) > 0.995 && quatDot(close, 80, this.mouthTable as Float32Array, 0) > 0.995 ? close : null;
    const col = S.ctx.collision;
    for (const p of this.parts) {
      const part = p.kind === 'mouth' ? 'mouth' : p.kind === 'pawl' ? 'pawl' : p.kind === 'guard' ? 'guard' : 'shutter';
      const priority = p.kind === 'mouth' || p.kind === 'pawl' ? 10 : p.kind === 'guard' ? 5 : 0;
      p.volume = col.addVolume({
        shape: p.kind === 'mouth' || p.kind === 'pawl' ? 'sphere' : 'box', layer: Layer.ENEMY, flags: 0,
        surface: p.kind === 'mouth' || p.kind === 'pawl' ? 'cloth' : 'ceramic', entity: this.ref, part, priority, receiver: p,
      });
    }
    this.anim = S.pool.createAnim('boss_windlass', inst.root);
    this.bodyClip = '';
    this.boxHeading = NaN;
    this.sphereForce = true;
    this.mouthGate = 0x3f;
    this.armQFor = NaN; this.drumQFor = NaN; this.lidQFor.fill(NaN);
    this.lastMask = -1; this.lastGauge = -1;
    this.playSway();
    this.pose();
    this.updateVolumes();
    this.syncLamps();
    return true;
  }

  dropBody(): void {
    const { S } = this;
    const inst = this.inst;
    if (!inst) return;
    const col = S.ctx.collision;
    for (const p of this.parts) { if (p.volume >= 0) col.removeVolume(p.volume); p.volume = -1; }
    for (let i = 0; i < 6; i++) { const t = this.threads[i]; if (t) { t.release(); this.threads[i] = null; } }
    this.ord.clear();
    restoreMaterials(inst.root);
    if (S.ctx.assets.isActive('boss_windlass')) inst.release();
    else inst.root.removeFromParent();
    this.inst = null;
    this.armBone = null; this.drumBone = null; this.muzzle = null; this.canMuzzle = null; this.lampSet = null; this.gauge = null;
    for (let i = 0; i < 6; i++) { this.mouthBone[i] = null; this.knotBone[i] = null; this.knotHit[i] = null; this.anchor[i] = null; }
    this.pawlBone[0] = null; this.pawlBone[1] = null; this.pawlHit[0] = null; this.pawlHit[1] = null;
    this.anim = null; this.bodyClip = '';
  }

  private playSway(): void {
    if (!this.anim || this.bodyClip === 'idle_sway') return;
    const c = this.anim.set ? this.anim.set.clips.get('idle_sway') : undefined;
    if (c) { this.anim.play(c, 0.3, 1); this.bodyClip = 'idle_sway'; }
  }
  /** A one-shot body clip (present, guard_*, sag_death); it stays on its last frame until the next one. */
  playBody(clip: string): void {
    if (!this.anim) return;
    const c = this.anim.set ? this.anim.set.clips.get(clip) : undefined;
    if (c) { this.anim.play(c, 0.1, 1); this.bodyClip = clip; }
  }

  /** The code-driven bones, after the mixer: arm yaw, drum spin, the six lids, burst knots and pawls. */
  private pose(): void {
    const arm = this.armBone, drum = this.drumBone;
    if (!arm || !drum) return;
    const yaw = -this.arm.heading * RAD;
    // Each code-driven rotation is worked out when its input changes and copied onto the bone every tick (the clip
    // player runs first and may have written the bone). Worked out every tick, the doubles handed to three's
    // setFromAxisAngle / set / slerp were 190 B per tick (polish round 2, scratch/r2-fix-code-enemies/perf/).
    if (this.arm.heading !== this.armQFor) { this.armQFor = this.arm.heading; this.armQ.copy(this.armRest).multiply(this.q.setFromAxisAngle(this.armAxis, yaw)); }
    arm.quaternion.copy(this.armQ);
    if (this.arm.spin !== this.drumQFor) { this.drumQFor = this.arm.spin; this.drumQ.copy(this.drumRest).multiply(this.q.setFromAxisAngle(this.drumAxis, this.arm.spin * RAD)); }
    drum.quaternion.copy(this.drumQ);
    for (let i = 0; i < 6; i++) {
      const lid = this.mouthBone[i];
      if (lid) {
        const f = this.openF[i] as number;
        const closing = this.want[i] === 0 && f > 0 && f < 1;
        const key = closing ? -1 - f : f;
        const lq = this.lidQ[i] as THREE.Quaternion;
        if (key !== this.lidQFor[i]) {
          this.lidQFor[i] = key;
          // the swing authored on mouth_1 (relative to its rest), applied on this lid's own rest frame
          if (this.mouthTable) { this.mouthSwing(f, closing); this.swing.set(this.mt[0] as number, this.mt[1] as number, this.mt[2] as number, this.mt[3] as number).premultiply(this.rest1Inv); }
          else this.swing.copy(this.identity).slerp(this.swingOpen, f);
          lq.copy(this.mouthRest[i] as THREE.Quaternion).multiply(this.swing);
        }
        lid.quaternion.copy(lq);
      }
      const knot = this.knotBone[i];
      if (knot) knot.scale.setScalar(this.dark[i] === 1 ? 0.35 : 1);
    }
    for (let i = 0; i < 2; i++) { const p = this.pawlBone[i]; if (p) p.scale.setScalar(this.pawl[i] === 1 ? 0.3 : 1); }
    if (this.looseLamps && this.lampSet && this.gauge) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      this.lampSet.position.set(this.lampRest.x * c + this.lampRest.z * s, this.lampRest.y, -this.lampRest.x * s + this.lampRest.z * c);
      this.lampSet.rotation.y = yaw;
      this.gauge.position.set(this.gaugeRest.x * c + this.gaugeRest.z * s, this.gaugeRest.y, -this.gaugeRest.x * s + this.gaugeRest.z * c);
      this.gauge.rotation.y = yaw;
    }
  }

  private readonly armQ = new THREE.Quaternion();
  private readonly drumQ = new THREE.Quaternion();
  private readonly lidQ: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  /** the heading, spin and lid fraction the cached rotations were worked out for (NaN: not yet) */
  private armQFor = NaN;
  private drumQFor = NaN;
  private readonly lidQFor = new Float64Array(6).fill(NaN);

  /** mouth_1's pose at a fraction of mouth_open, from the table (a normalised lerp between neighbouring samples) */
  private mouthSwing(f: number, closing: boolean): void {
    // shutting: mouth_close played forward (open at its start, shut with its bounce at its end)
    const shut = closing && this.closeTable !== null;
    const tbl = (shut ? this.closeTable : this.mouthTable) as Float32Array, x = Math.max(0, Math.min(1, shut ? 1 - f : f)) * 20;
    const k = Math.min(19, Math.floor(x)), u = x - k, a = k * 4, b = a + 4, m = this.mt;
    let d = 0;
    for (let j = 0; j < 4; j++) d += (tbl[a + j] as number) * (tbl[b + j] as number);
    const s = d < 0 ? -1 : 1;
    let l = 0;
    for (let j = 0; j < 4; j++) { m[j] = (tbl[a + j] as number) + ((tbl[b + j] as number) * s - (tbl[a + j] as number)) * u; l += (m[j] as number) * (m[j] as number); }
    l = Math.sqrt(l) || 1;
    for (let j = 0; j < 4; j++) m[j] = (m[j] as number) / l;
  }

  private updateVolumes(): void {
    // (the radii are module constants: `BOSS.knotRadius` read here is a double field, and a double field read into a
    // call argument is a fresh 12 B heap number each time: 96 B per tick for the eight)
    for (let i = 0; i < 6; i++) this.sphereAt(i, this.knotHit[i] ?? null, 4, KNOT_ALONG, KNOT_R);
    // Polish round 3: a knot's sphere exists only while its mouth stands open and the guard is off the face (the
    // manifest's `gatedBy: 'mouth_open'`). Until now the six spheres were always live, in front of the shut lids and the
    // set guard: a round at a shut mouth was reported as a hit on a 'mouth' (cloth), and whatever asked "can a round
    // reach that knot" (the crosshair probe, a test, a player proxy) was told yes. Written on change only.
    this.syncMouthGate();
    for (let i = 0; i < 2; i++) {
      this.sphereAt(6 + i, this.pawlHit[i] ?? null, 6, PAWL_ALONG, PAWL_R);
      this.S.ctx.collision.setVolumeEnabled((this.parts[6 + i] as Part).volume, this.phase === 'p2' && this.pawl[i] === 0);
    }
    this.sphereForce = false;
    // the guard plate stands 1.25 m in front of the hub, over the face; the drum is 5.0 m across and 2.2 m deep.
    // The two boxes turn with the arm only: they are written when its heading changes, not every tick (each write
    // boxes eight doubles on its way into the collision engine: 145 B per tick measured while the arm stood still)
    if (this.arm.heading !== this.boxHeading) {
      this.boxHeading = this.arm.heading;
      this.boxAt(8, 3.25, 2.3, 0.08);
      this.boxAt(9, 2.0, 2.5, 1.05);
    }
    this.S.ctx.collision.setVolumeEnabled((this.parts[8] as Part).volume, this.guard === 'set');
  }
  /** which mouth spheres are enabled, one bit each (a new volume is enabled: 0x3f) */
  private mouthGate = 0x3f;
  private syncMouthGate(): void {
    let gate = 0;
    if (this.guard !== 'set') for (let i = 0; i < 6; i++) if ((this.openF[i] as number) > 0.5) gate |= 1 << i;
    if (gate === this.mouthGate) return;
    for (let i = 0; i < 6; i++) if (((gate ^ this.mouthGate) & (1 << i)) !== 0) this.S.ctx.collision.setVolumeEnabled((this.parts[i] as Part).volume, (gate & (1 << i)) !== 0);
    this.mouthGate = gate;
  }
  /** the heading the guard and shutter boxes were last written for (NaN: not yet) */
  private boxHeading = NaN;
  /** Small on purpose: a collision call in a small function passes its numbers unboxed (foundation-collision 2). */
  private sphereAt(part: number, node: THREE.Object3D | null, up: number, along: number, radius: number): void {
    const p = this.tmp;
    this.nodeAt(node, p, up, along);
    // Polish round 2 (docs/requests/polish-r2-fixer.md): a sphere is written to the collision engine only when its
    // node has moved SPHERE_SLOP (25 mm on a 0.3 to 0.45 m sphere) since the last write. Each write passes three
    // doubles through a call V8 does not inline here and boxes them: eight spheres a tick were 316 to 394 B per tick.
    const w = this.sphereAtPos, o = part * 3;
    const dx = p.x - (w[o] as number), dy = p.y - (w[o + 1] as number), dz = p.z - (w[o + 2] as number);
    if (!this.sphereForce && dx * dx + dy * dy + dz * dz < SPHERE_SLOP * SPHERE_SLOP) return;
    w[o] = p.x; w[o + 1] = p.y; w[o + 2] = p.z;
    this.S.ctx.collision.setSphere((this.parts[part] as Part).volume, p.x, p.y, p.z, radius);
  }
  /** where each sphere (knots 0..5, pawls 6..7) was last written, and "write them all" (a new body, a reset) */
  private readonly sphereAtPos = new Float64Array(24);
  private sphereForce = true;
  private boxAt(part: number, out: number, half: number, depth: number): void {
    const b = this.arm.heading * RAD;
    this.S.ctx.collision.setVolumeBox((this.parts[part] as Part).volume, this.axisX + Math.sin(b) * out, this.axisY + 4.0, this.axisZ - Math.cos(b) * out, half, half, depth, Math.PI - b);
  }

  /** boss_lamps: 0-5 the mouth lamps, 6-11 the knot cores, 12-13 the pawl cores; gauge: the pips. Written on change only. */
  private syncLamps(): void {
    if (!this.lampSet || !this.gauge) return;
    let mask = 0;
    const spin = this.ord.fanSpinUp;
    if (spin >= 0) {
      // the fan's spin-up: the six lamps flash in turn at 5 Hz, or ramp steadily with Reduce Flashes (GDD 8.3)
      if (this.S.ctx.options.value.reduceFlashes) { const n = Math.floor(spin * 6.999); for (let i = 0; i < n && i < 6; i++) mask |= 1 << i; }
      else mask |= 1 << (Math.floor(spin * BOSS.fanSpinUp * 5) % 6);
    } else for (let i = 0; i < 6; i++) if (this.lamp[i] === 1) mask |= 1 << i;
    for (let i = 0; i < 6; i++) if (this.dark[i] === 0) mask |= 1 << (6 + i);
    // the pawl cores are a cue, so they are lit only while a pawl can be burst: a phase 2 haul with the guard set (closer, polish round 2)
    if (this.phase === 'p2' && this.hauling && this.guard === 'set') for (let i = 0; i < 2; i++) if (this.pawl[i] === 0) mask |= 1 << (12 + i);
    if (this.phase === 'dead') mask = 0;
    if (mask !== this.lastMask) { this.lastMask = mask; this.S.ctx.render.lamps.setMask(this.lampSet, mask); }
    const pips = this.pips;
    if (pips !== this.lastGauge) { this.lastGauge = pips; this.S.ctx.render.lamps.setCount(this.gauge, pips); }
  }

  // ---- hits (GDD 8: only a knot in an open mouth takes a hit) ---------------------------------------------------
  /** Is the guard plate over the face? */
  get guarded(): boolean { return this.guard === 'set'; }

  /** One or more hits on open, lit knots: they go dark, the pips go out. `first` is the knot struck (-1: any). Returns hits counted. */
  takeHits(first: number, n: number): number {
    let taken = 0;
    for (let k = 0; k < 6 && taken < n; k++) {
      const i = first >= 0 ? (first + k) % 6 : k;
      if (this.dark[i] === 1 || (this.openF[i] as number) <= 0.5) continue;
      if (this.phase === 'parley') { if (this.hits >= BOSS.parleyGift) break; } else if (this.phase === 'p1') { if (this.hits >= BOSS.pipsP1) break; } else if (this.phase === 'p2') { if (this.hits >= BOSS.pipsP2) break; }
      this.dark[i] = 1;
      taken++;
      if (this.phase === 'p3a') this.relightAt[i] = this.S.time + BOSS.relight;
      else this.hits++;
      this.mouthEvent(i, 'dark');
    }
    if (taken === 0) return 0;
    this.emitPips();
    // the inspection's gift is `parleyGift` hits: on the last of them the six lids shut (nothing stands open that would only clank)
    if (this.phase === 'parley' && this.hits >= BOSS.parleyGift) for (let i = 0; i < 6; i++) this.setMouth(i, false, true);
    if (this.phase === 'p1' && this.hits >= BOSS.pipsP1) breakPhase(this);
    else if (this.phase === 'p2' && this.hits >= BOSS.pipsP2) breakPhase(this);
    else if (this.phase === 'p3b' && this.hits >= BOSS.pipsP3) startKill(this);
    else if (this.phase === 'p3a' && this.darkCount === 6) this.headDry();
    return taken;
  }

  /** All six dark at once before any relight: the head is dry, no attacks for 6 s (GDD 8.2). */
  private headDry(): void {
    this.S.say('stn_boss_head_dry_refilling');
    this.headDryEvent();
    this.ord.clear();
    if (this.hauling) { this.hauling = false; this.haulEvent(false, 0); }
    this.sub = 'headdry'; this.t = 0;
  }

  onHit(part: Part, _hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    const line = damage.ammo === 'line_round' || damage.ammo === 'kept_round';
    const vulnerable = (this.phase === 'p1' || this.phase === 'p2' || this.phase === 'p3a' || this.phase === 'p3b' || this.phase === 'parley') && this.sub !== 'transition' && this.sub !== 'kill_run' && this.sub !== 'sag' && this.sub !== 'after';
    if (part.kind === 'pawl') {
      // two knots high on the arm: both burst and the guard drops (phase 2)
      if (this.phase !== 'p2' || this.pawl[part.index] === 1 || this.sub === 'transition') { respond(out, 'deflected', !line, false, 0, this.pips); return; }
      this.pawl[part.index] = 1;
      this.evPawl.side = part.index === 0 ? 'l' : 'r'; this.evPawl.burst = true;
      this.S.ctx.events.emit('boss/pawl', this.evPawl);
      if (this.pawl[0] === 1 && this.pawl[1] === 1 && this.hauling) this.releaseGuard();
      respond(out, 'broke', !line, false, 1, this.pips);
      return;
    }
    // the knots and the guard face out along the heading: a round from behind meets the drum's back
    const hb = this.arm.heading * RAD;
    if ((part.kind === 'mouth' || part.kind === 'guard') && damage.dx * Math.sin(hb) - damage.dz * Math.cos(hb) > -0.1) {
      respond(out, 'deflected', true, true, 0, this.pips);
      return;
    }
    const guarded = this.guarded;
    if (guarded && (part.kind === 'guard' || part.kind === 'mouth')) {
      // lead clanks off the guard; a line round pierces it and counts as exactly three hits (GDD 8.2)
      if (line && vulnerable && this.mouthsOpen > 0) {
        const n = this.takeHits(-1, BOSS.lineThroughGuard);
        if (n > 0) { respond(out, 'weak', false, true, n, this.pips); return; }
      }
      respond(out, line ? 'impact' : 'deflected', !line, false, 0, this.pips);
      return;
    }
    if (part.kind === 'mouth' && vulnerable) {
      const i = part.index;
      if ((this.openF[i] as number) > 0.5 && this.dark[i] === 0) {
        // Polish round 3 (lead ruling R2, "shoot what glows"): a lit knot in an open mouth takes its hit whenever the
        // mouth stands open, the chamber that is about to fire included. Until now that one shot answered with a parry
        // or a clank and no pip, and a plain player who shot the only thing that glowed died six times in phase 1.
        // A stake chamber struck in its glow still misfires (the parry: no stake); a canister cannot be stopped.
        if (this.discharging === i && this.sub === 'pattern' && this.dischargeKind === 'stake' && !this.slotFired && !this.parried) {
          this.parried = true;
          const p = this.tmp, e = this.S.ev.projBurst;
          this.muzzlePos(p);
          e.x = p.x; e.y = p.y; e.z = p.z; e.id = ''; e.kind = 'stake'; e.reason = 'parry';
          this.S.ctx.events.emit('projectile/burst', e);
        }
        const n = this.takeHits(i, 1);
        if (n > 0) { respond(out, 'weak', true, true, n, this.pips); return; }
      }
    }
    // a shut lid, the drum face, a dark knot, or anything while it cannot be hurt
    respond(out, 'deflected', true, true, 0, this.pips);
  }

  /** Both pawls shot in a haul: the guard drops for the rest of it, at least `p2OpenGuaranteed` (the haul extends); with both burst it drops again at every later haul of the phase. */
  releaseGuard(): void {
    if (this.guard !== 'set') return;
    this.S.say('stn_boss_guard_released');
    this.playBody('guard_drop');
    this.setGuard('released');
    const left = this.haulSeconds - this.t;
    if (left < BOSS.p2OpenGuaranteed) this.haulSeconds = this.t + BOSS.p2OpenGuaranteed;
  }
  resetPawls(): void {
    for (let i = 0; i < 2; i++) {
      if (this.pawl[i] === 0) continue;
      this.pawl[i] = 0;
      this.evPawl.side = i === 0 ? 'l' : 'r'; this.evPawl.burst = false;
      this.S.ctx.events.emit('boss/pawl', this.evPawl);
    }
  }

  // ---- mouths ---------------------------------------------------------------------------------------------
  setMouth(i: number, open: boolean, announce: boolean): void {
    const v = open ? 1 : 0;
    if (this.want[i] === v) return;
    this.want[i] = v;
    if (announce) this.mouthEvent(i, open ? 'open' : 'shut');
  }
  setAllMouths(open: boolean): void { for (let i = 0; i < 6; i++) this.setMouth(i, open, false); }
  clearDark(): void {
    for (let i = 0; i < 6; i++) {
      this.dark[i] = 0;
      const t = this.threads[i];
      if (t) { t.release(); this.threads[i] = null; }
    }
  }

  /** Phase 3a: a dark mouth relights from the bore 4.0 s after its hit, a violet thread climbing to it for the last second. */
  tickRelights(): void {
    const { S } = this;
    for (let i = 0; i < 6; i++) {
      if (this.dark[i] === 0) continue;
      const left = (this.relightAt[i] as number) - S.time;
      if (left <= BOSS.relightThread && left > 0) {
        let t = this.threads[i] ?? null;
        if (!t) { t = S.ctx.render.vfx.acquireLine('relight_thread'); this.threads[i] = t; }
        if (t) {
          const p = this.tmp;
          this.nodeAt(this.anchor[i] ?? null, p, 4, 3.1);
          t.setPosition(this.axisX, this.axisY + 1.2, this.axisZ);
          t.setEnd(p.x, p.y, p.z);
          t.setLevel(1 - left / BOSS.relightThread);
        }
      }
      if (left > 0) continue;
      this.dark[i] = 0;
      const t = this.threads[i];
      if (t) { t.release(); this.threads[i] = null; }
      this.mouthEvent(i, 'relit');
      S.say('stn_boss_refilled');
      this.cue('refill_gurgle');
      this.emitPips();
      this.relit = true;
    }
  }

  // ---- the kept round ---------------------------------------------------------------------------------------
  /** `weapon/kept` (GDD 8.2, "The hush"). */
  onKept(e: Readonly<GameEvents['weapon/kept']>): void {
    const { S } = this;
    if (e.stage === 'loading') {
      this.keptLoaded = true;
      if (this.phase !== 'p3a') return;
      // every stake and canister in flight bursts harmlessly; the mouths shut; no attack until the shot or the unload
      S.stakes.burstAll('hush');
      this.ord.burstAll();
      if (this.hauling) { this.hauling = false; this.haulEvent(false, 0); }
      this.setAllMouths(false);
      // one slow-motion run per hush, never restarted by loading again while it (or its tail) is still running:
      // toggling the load on a mark cannot hold the fight at half speed
      if (S.utime - this.hushSlowAt >= BOSS.hushSlowEvery) { this.hushSlowAt = S.utime; S.ctx.clock.slowMotion(BOSS.hushScale, BOSS.hushSeconds, 'hush'); }
      S.hooks.falterBiders(2.0, true);
      // the arm swings in one ratchet run to the index opposite the occupied mark
      let bay = this.playerBay();
      let to = oppositeBay(bay);
      const m = e.mark !== '' ? S.ctx.data.layout.markers.find((x) => x.id === e.mark) : undefined;
      if (m) {
        if (typeof m.params.bay === 'number') { bay = m.params.bay; to = oppositeBay(bay); }
        if (typeof m.params.armSwingsTo === 'number') to = m.params.armSwingsTo;
      }
      this.hushFrom = bay;
      const from = this.arm.bay;
      const seconds = this.arm.indexTo(to, BOSS.hushSwing);
      if (seconds > 0) this.cue('ratchet');
      this.sub = 'rest';
      this.setPhase('hush');
      this.evHush.on = true;
      S.ctx.events.emit('boss/hush', this.evHush);
      if (seconds > 0) this.indexingEvent(from, to, seconds);
      return;
    }
    if (e.stage === 'unloaded') {
      if (this.phase !== 'hush') return;
      this.evHush.on = false;
      S.ctx.events.emit('boss/hush', this.evHush);
      this.setPhase('p3a');
      this.pt = BOSS.chargeRequiredAt;                     // not a new phase: the line and the adds clock do not start again
      this.setAllMouths(true);
      beginIndex(this);
      return;
    }
    if (e.stage === 'fired') this.prove();
  }

  /** The proof: the seventh went down the bore. */
  prove(): void {
    const { S } = this;
    if (this.phase !== 'hush' && this.phase !== 'p3a') return;
    S.stakes.burstAll('hush');
    this.ord.burstAll();
    if (this.hauling) { this.hauling = false; this.haulEvent(false, 0); }
    if (this.phase === 'hush') { this.evHush.on = false; S.ctx.events.emit('boss/hush', this.evHush); }
    this.enterProven();
  }
  enterProven(): void {
    const { S } = this;
    this.setAllMouths(false);
    this.clearDark();
    this.sub = 'rest';
    this.setPhase('proven');
    // the bore axis at the kerb top
    const m = S.ctx.data.layout.markers.find((x) => x.id === 'bore_opening');
    this.evProven.x = this.axisX; this.evProven.y = m ? m.pos[1] : this.axisY + 1.2; this.evProven.z = this.axisZ;
    S.ctx.events.emit('boss/proven', this.evProven);
    // every Bider alive sits, counted
    for (let i = 0; i < S.actors.length; i++) { const a = S.actors[i]; if (a && a.used && a.alive && a.kind === 'bider') S.hooks.freeBider(a, 'kept'); }
  }

  // ---- lifecycle --------------------------------------------------------------------------------------------
  /** Everything of a fight forgotten, the head at rest on the door index. No events. */
  reset(): void {
    this.phase = 'idle'; this.sub = 'rest'; this.t = 0; this.pt = 0; this.ut = 0;
    this.S.hush = false;
    this.hits = 0; this.guard = 'parked'; this.fresh = true;
    this.parleyStage = 0; this.refused = false;
    for (let i = 0; i < 6; i++) { this.want[i] = 0; this.openF[i] = 0; this.lamp[i] = 1; this.relightAt[i] = 0; }
    this.clearDark();
    this.pawl[0] = 0; this.pawl[1] = 0;
    this.step = 0; this.slotT = 0; this.slotFired = false; this.discharging = -1; this.parried = false;
    this.hauling = false; this.haulSeconds = 0; this.guardSaid = false; this.taught = false;
    this.chargeAsked = false; this.chargeSaid = 0; this.haulSaid3a = false; this.keptLoaded = false; this.hintT3 = false; this.hintT4 = false; this.relit = false;
    this.dryClock = 0; this.drySaid = 0; this.shots3b = 0; this.reload3b = false; this.cleanSix = false; this.killClicks = 0;
    this.arm.reset(1);
    this.lastClicks = 0;
    this.ord.clear();
    this.adds.reset();
    this.S.tokens.limit = 0;
    if (this.inst) { this.bodyClip = ''; this.playSway(); this.pose(); this.updateVolumes(); this.syncLamps(); }
  }

  /**
   * Begin a phase in the state it starts in. `natural` false = a retry, a restore or a debug jump: a short lead-in
   * instead of the 3 s break, no break line.
   */
  startPhase(phase: BossPhase): void {
    const heard = this.parleyHeard, deaths = this.deaths;
    const from = this.phase;
    this.phase = 'idle';
    this.reset();
    this.phase = from;                                     // boss/phase reports where it came from
    this.parleyHeard = heard; this.deaths = deaths;
    this.ensureBody();
    this.lead = 1.5;
    switch (phase) {
      case 'idle': this.setPhase('idle'); return;
      case 'parley': startParley(this); return;
      case 'p1': this.parleyHeard = true; this.sub = 'transition'; this.setPhase('p1'); return;
      case 'p2': this.parleyHeard = true; this.guard = 'parked'; this.sub = 'transition'; this.setPhase('p2'); return;
      case 'p3a': case 'hush':
        this.parleyHeard = true; this.guard = 'shattered'; this.sub = 'transition';
        if (this.inst) this.playBody('guard_shatter');
        this.setPhase('p3a');
        if (phase === 'hush') { const e = this.hushEvent; e.stage = 'loading'; e.mark = ''; this.onKept(e); }
        return;
      case 'proven': this.parleyHeard = true; this.guard = 'shattered'; if (this.inst) this.playBody('guard_shatter'); this.enterProven(); return;
      case 'p3b': this.parleyHeard = true; this.guard = 'shattered'; if (this.inst) this.playBody('guard_shatter'); enterDry(this); return;
      case 'dead':
        this.parleyHeard = true; this.guard = 'shattered';
        if (this.inst) this.playBody('sag_death');
        this.setPhase('dead');
        this.defeatedEvent();
        return;
      default: return;
    }
  }
  private readonly hushEvent: GameEvents['weapon/kept'] = { stage: 'loading', mark: '' };

  /** `EnemiesApi.startBoss`: the door was crossed. A phase already running (a restore resumed it) is left alone. */
  start(fromPhase: BossPhase, parleyHeard: boolean): void {
    if (parleyHeard) this.parleyHeard = true;
    if (this.phase !== 'idle') return;
    let phase = fromPhase;
    if (phase === 'idle' || phase === 'parley') phase = this.parleyHeard ? 'p1' : 'parley';
    if (phase === 'hush') phase = 'p3a';
    if (phase === 'proven') phase = 'p3b';
    this.startPhase(phase);
  }

  /** Stop without events: the encounter was reset or cleared. */
  stop(): void {
    const heard = this.parleyHeard, deaths = this.deaths;
    this.reset();
    this.parleyHeard = heard; this.deaths = deaths;
  }

  save(): Pick<EnemiesSave, 'bossPhase' | 'parleyHeard' | 'deathsInBossPhase'> {
    const phase: BossPhase = this.phase === 'hush' ? 'p3a' : this.phase === 'parley' ? 'idle' : this.phase;
    return { bossPhase: phase, parleyHeard: this.parleyHeard, deathsInBossPhase: this.deaths };
  }

  /** A restore: the fight starts again at the saved phase, parley skipped (GDD 8.3: within 3 s). */
  restore(data: Readonly<EnemiesSave>, deathsNow: number, deathsPhase: BossPhase): void {
    this.reset();
    this.parleyHeard = data.parleyHeard;
    this.deaths = data.bossPhase === deathsPhase ? Math.max(data.deathsInBossPhase, deathsNow) : data.deathsInBossPhase;
    const phase = data.bossPhase;
    if (phase === 'p1' || phase === 'p2' || phase === 'p3a' || phase === 'p3b') this.startPhase(phase);
    else if (phase === 'proven') this.startPhase('p3b');
    else if (phase === 'dead') this.restDead();
  }

  /**
   * A restore after the fight: the Windlass hangs sagged and dark, and nothing is announced. The defeat was told once
   * when it happened; core applies this save before world's on every restore and 'continue', and a second
   * `boss/defeated` / `boss/phase` would replay the ending to world, audio, UI and the stats.
   */
  private restDead(): void {
    this.parleyHeard = true;
    this.guard = 'shattered';
    this.phase = 'dead';
    this.sub = 'rest';
    for (let i = 0; i < 6; i++) { this.lamp[i] = 0; this.dark[i] = 1; }
    this.ensureBody();
    if (this.inst) { this.playBody('sag_death'); if (this.anim) { this.anim.advance(BOSS.sag + 1); this.anim.apply(); } this.pose(); this.updateVolumes(); this.syncLamps(); }
  }

  onDied(): void { if (FIGHT[this.phase] === true || this.phase === 'p3b' || this.phase === 'proven') this.deaths++; }

  onFired(): void {
    if (this.phase === 'parley') parleyShot(this);
    else if (this.phase === 'p3b') this.shots3b++;
  }
  onReload(): void { if (this.phase === 'p3b') this.reload3b = true; }
  onHint(tier: number): void {
    if (tier >= 3) { this.hintT3 = true; this.adds.stopped = true; }
    if (tier >= 4) this.hintT4 = true;
  }

  // ---- per tick -----------------------------------------------------------------------------------------------
  tick(dt: number): void {
    const { S } = this;
    const inst = this.inst;
    if (!inst) return;
    if (this.phase !== 'idle' && this.phase !== 'dead' && S.ai) {
      this.t += dt; this.pt += dt; this.ut += FIXED_DT;
      if (this.phase === 'parley') tickParley(this);
      else tickFight(this, dt);
    } else if (this.phase === 'dead' || this.phase === 'idle') S.tokens.limit = 0;
    // the arm: a ratchet click per 60 degree step
    if (this.arm.moving) {
      this.arm.tick(dt);
      if (this.arm.clicks > this.lastClicks) { this.lastClicks = this.arm.clicks; this.cue('ratchet'); }
      if (!this.arm.moving) this.lastClicks = 0;
    } else this.arm.tick(dt);
    // lids: 0.2 s open or shut
    const k = dt / BOSS.mouthSeconds;
    for (let i = 0; i < 6; i++) {
      const f = this.openF[i] as number;
      if (this.want[i] === 1) { if (f < 1) this.openF[i] = f + k > 1 ? 1 : f + k; } else if (f > 0) this.openF[i] = f - k < 0 ? 0 : f - k;
    }
    this.ord.tick(dt);
    if (this.anim) { this.anim.advance(dt); this.anim.apply(); }
    this.pose();
    this.updateVolumes();
    this.syncLamps();
  }

  debugState(): Record<string, unknown> {
    return {
      phase: this.phase, sub: this.sub, t: Math.round(this.t * 1e4) / 1e4, hits: this.hits, pips: this.pips, guard: this.guard,
      armBay: this.arm.bay, heading: Math.round(this.arm.heading * 1e4) / 1e4, spin: Math.round(this.arm.spin * 1e4) / 1e4, moving: this.arm.moving,
      mouths: Array.from(this.want), dark: Array.from(this.dark), lamps: Array.from(this.lamp), pawls: Array.from(this.pawl),
      step: this.step, hauling: this.hauling, deaths: this.deaths, parleyHeard: this.parleyHeard, body: this.inst !== null,
      rings: this.ord.rings, canisters: this.ord.flying, lance: this.ord.lanceStage, fan: this.ord.fanStage,
      lidClose: this.closeTable !== null, addsSpawned: this.adds.spawned, addsPending: this.adds.pending, chargeAsked: this.chargeAsked, cleanSix: this.cleanSix,
    };
  }
}

function quatDot(a: Float32Array, ai: number, b: Float32Array, bi: number): number {
  return Math.abs((a[ai] as number) * (b[bi] as number) + (a[ai + 1] as number) * (b[bi + 1] as number) + (a[ai + 2] as number) * (b[bi + 2] as number) + (a[ai + 3] as number) * (b[bi + 3] as number));
}

/** mouth_1's rotation through a lid clip at 21 even steps; null when the clip is missing or does not move the lid. */
function lidTable(clip: THREE.AnimationClip | undefined): Float32Array | null {
  if (!clip || clip.duration <= 1e-4) return null;
  const track = clip.tracks.find((t) => /(^|[./])mouth_1\.quaternion$/.test(t.name));
  if (!track) return null;
  // `createInterpolant` is set by KeyframeTrack.setInterpolation (slerp for a quaternion track); the typings leave it out
  const interp = (track as unknown as { createInterpolant(result?: unknown): THREE.Interpolant }).createInterpolant(undefined);
  const table = new Float32Array(21 * 4);
  let moved = false;
  for (let k = 0; k <= 20; k++) {
    const v = interp.evaluate(clip.duration * k / 20) as ArrayLike<number>;
    for (let j = 0; j < 4; j++) table[k * 4 + j] = v[j] as number;
    if (k > 0 && quatDot(table, 0, table, k * 4) < 0.9999) moved = true;
  }
  return moved ? table : null;
}

/** Unit axis, in a template bone's own frame, of an asset-space direction (so code can turn the bone about it). */
function restAxis(bone: THREE.Object3D, root: THREE.Object3D, x: number, y: number, z: number, out: THREE.Vector3): void {
  const world = new THREE.Quaternion();
  const chain: THREE.Object3D[] = [];
  for (let o: THREE.Object3D | null = bone; o && o !== root.parent; o = o.parent) chain.unshift(o);
  for (const o of chain) world.multiply(o.quaternion);
  out.set(x, y, z).applyQuaternion(world.invert()).normalize();
}
