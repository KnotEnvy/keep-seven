// Core stub for the player slot: a walk controller good enough for the walk tests (5 m/s, gravity 24, capsule
// 0.35 x 1.8, 3 sub-steps, 0.35 m step-up by lift-move-drop, 45 degree slope limit, a 6.5 m/s jump on a press), a fly
// mode for sandboxes, health only, and a click-to-shoot ray that calls HitReceiver.onHit with 100 damage.
//
// Three things about the collision engine that any controller built on it has to handle (all are tested in
// tests/core/sandbox.test.mjs):
//  - resolveCapsule lifts a capsule onto ANY walkable top that is below the centre of its lower sphere (one radius,
//    0.35 m, above the feet), and can leave it up to 0.14 m above that top (measured: a ledge 0.30 m up -> lifted
//    0.305 m; 0.34 m up -> 0.475 m; 0.36 m up -> a wall; pinned in tests/core/collision.spec.ts). A controller that
//    lifts the capsule to try a step therefore reaches radius + lift, so the height really gained has to be checked
//    after the move (see `move`: the step is refused above STEP_UP). THE SAME HOLDS IN THE AIR: a jump reaches
//    apex + radius. This stub does not check it (apex 0.86 m: it lands on a 1.1 m box, not on a 1.2 m one); the real
//    controller, with the GDD's 1.0 m apex, must, or the layout's 1.3 m cover is mountable.
//  - groundHeight under the capsule's centre says nothing about its rim: snapping the feet down to it while the rim
//    still overhangs a ledge puts the capsule inside the ledge. Resolve the capsule at the snapped height and keep
//    the engine's answer.
//  - a groundHeight ray that starts inside a solid leaves through its underside and reports that: probe for a ledge
//    from above anything climbable, and refuse what is too high (see `support`).
import {
  ColFlag, FIXED_DT, LAYER_SHOT, LAYER_SOLID, PLAYER_EYE, PLAYER_HEIGHT, PLAYER_RADIUS,
} from '../contracts.ts';
import type {
  CapsuleResolve, ChamberState, DamageInfo, DebugSnapshot, GameContext, GameEvents, HitResponse, HitResult, KeptContext,
  PickupKind, PlayerDebug, PlayerSave, PlayerSystem, SeventhState, Vec2, Vec3, WeaponView,
} from '../contracts.ts';
import { Interp3 } from '../interp.ts';
import { DEG2RAD, RAD2DEG, clamp, round4, wrapAngle } from '../math.ts';

const WALK_SPEED = 5.0;
const SPRINT_SPEED = 7.0;
const FLY_SPEED = 12.0;
const GRAVITY = 24;
const SUB_STEPS = 3;
const STEP_UP = 0.35;
/** how far above the ground under its centre a capsule may stand: riding a 45 degree slope (radius x (sqrt 2 - 1)) or a step's edge */
const SNAP_RIDE = STEP_UP;
const JUMP_SPEED = 6.5;                 // 0.88 m of rise under GRAVITY
const WALKABLE_COS = Math.cos(45 * DEG2RAD) - 1e-3;
const LOOK_RAD_PER_COUNT = 0.0022;
const MAX_PITCH = 89 * DEG2RAD;
const MAX_HEALTH = 100;
const SHOT_DAMAGE = 100;
const SHOT_RANGE = 200;

class DummyPlayer implements PlayerSystem {
  readonly id = 'player' as const;
  readonly position: Vec3 = { x: 0, y: 0, z: 0 };
  readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };
  readonly eye: Vec3 = { x: 0, y: PLAYER_EYE, z: 0 };
  readonly forward: Vec3 = { x: 0, y: 0, z: -1 };
  yaw = 0;
  pitch = 0;
  grounded = false;
  sprinting = false;
  alive = true;
  health = MAX_HEALTH;
  readonly maxHealth = MAX_HEALTH;
  readonly weapon: WeaponView;
  readonly debug: PlayerDebug;
  private readonly cylinder: ChamberState[] = ['lead', 'lead', 'lead', 'lead', 'lead', 'lead'];
  private reserve = 18;
  private lineRounds = 0;
  private seventh: SeventhState = 'sealed';
  private shotsFired = 0;
  private control = false;
  private lookLocked = false;
  private god = false;
  private fly = false;
  private cameraOn = true;
  private kept: KeptContext | null = null;
  private readonly interp = new Interp3();
  private readonly res: CapsuleResolve;
  private readonly res2: CapsuleResolve;
  private readonly hit: HitResult;
  private readonly look: Vec2 = { x: 0, y: 0 };
  private readonly response: HitResponse = { outcome: 'impact', stops: true, stopsLine: true, damageDealt: 0, healthLeft: 0 };
  private readonly damage: DamageInfo = { amount: SHOT_DAMAGE, kind: 'bullet', source: 'player', sourceId: 'player', ammo: 'lead_round', shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
  private readonly firedPayload: GameEvents['weapon/fired'] = { shotId: 0, ammo: 'lead_round', chambersLeft: 6, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0, mx: 0, my: 0, mz: 0, endX: 0, endY: 0, endZ: 0 };
  private readonly hitPayload: GameEvents['combat/hit'] = { x: 0, y: 0, z: 0, shotId: 0, order: 0, ammo: 'lead_round', outcome: 'impact', entityId: '', entityKind: 'world', part: 'whole', surface: 'none', nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 };
  private readonly damagedPayload: GameEvents['player/damaged'] = { amount: 0, health: 0, kind: 'bullet', source: 'world', fromX: 0, fromY: 0, fromZ: 0, graceUsed: false };
  private readonly diedPayload: GameEvents['player/died'] = { kind: 'bullet', source: 'world' };
  private readonly controlPayload: GameEvents['player/control'] = { enabled: false, reason: '' };
  private readonly spawnedPayload: GameEvents['player/spawned'] = { checkpoint: 'cp_lip_start', x: 0, y: 0, z: 0 };
  private readonly off: (() => void)[] = [];

  constructor(private readonly ctx: GameContext) {
    const col = ctx.collision;
    this.res = col.createResolve(); this.res2 = col.createResolve(); this.hit = col.createHit();
    const self = this;
    this.weapon = {
      get phase() { return 'ready' as const; },
      get cylinder() { return self.cylinder; },
      get chambered() { let n = 0; for (let i = 0; i < 6; i++) if (self.cylinder[i] !== 'empty') n++; return n; },
      get reserve() { return self.reserve; },
      get lineRounds() { return self.lineRounds; },
      get seventh() { return self.seventh; },
      get shotsFired() { return self.shotsFired; },
      get keptAimLegal() { return false; },
    };
    this.debug = {
      setHealth: (hp) => this.setHealth(hp),
      setAmmo: (chambered, reserve, lineRounds) => {
        for (let i = 0; i < 6; i++) this.cylinder[i] = i < chambered ? 'lead' : 'empty';
        this.reserve = Math.max(0, reserve); this.lineRounds = Math.max(0, lineRounds);
      },
      setAim: (yawDeg, pitchDeg) => this.setAim(yawDeg * DEG2RAD, pitchDeg * DEG2RAD),
      setSeventh: (state) => { this.seventh = state; },
    };
  }

  // ---- lifecycle ----------------------------------------------------------------------------------
  init(): void {
    const { ctx } = this;
    this.off.push(ctx.events.on('game/state', (e) => {
      if (e.to === 'playing' && e.from === 'loading') {
        const p = this.spawnedPayload;
        p.checkpoint = ctx.world.checkpoint; p.x = this.position.x; p.y = this.position.y; p.z = this.position.z;
        ctx.events.emit('player/spawned', p);
      }
    }));
    ctx.debug.register('player', {
      /** fly mode for sandboxes: no gravity, no collision */
      fly: ((on: boolean) => { this.fly = on; }) as (...args: never[]) => unknown,
      /** false: something else (the viewer's orbit camera) owns the world camera */
      camera: ((on: boolean) => { this.cameraOn = on; }) as (...args: never[]) => unknown,
    });
  }
  dispose(): void { for (const f of this.off) f(); this.off.length = 0; }

  private setAim(yaw: number, pitch: number): void {
    this.yaw = wrapAngle(yaw);
    this.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
    const cp = Math.cos(this.pitch);
    this.forward.x = -Math.sin(this.yaw) * cp; this.forward.y = Math.sin(this.pitch); this.forward.z = -Math.cos(this.yaw) * cp;
  }
  private setHealth(hp: number): void {
    this.health = clamp(hp, 0, MAX_HEALTH);
    if (this.health <= 0 && this.alive) this.die('kill_volume', 'world');
    else if (this.health > 0) this.alive = true;
  }
  private die(kind: DamageInfo['kind'], source: DamageInfo['source']): void {
    this.alive = false;
    this.health = 0;
    this.diedPayload.kind = kind; this.diedPayload.source = source;
    this.ctx.events.emit('player/died', this.diedPayload);
  }

  // ---- simulation ---------------------------------------------------------------------------------
  fixedUpdate(dt: number): void {
    const { ctx } = this;
    const input = ctx.input, p = this.position, v = this.velocity;
    const active = this.control && this.alive && ctx.state.current === 'playing';
    let wishX = 0, wishZ = 0, speed = 0;
    this.sprinting = false;
    if (active) {
      const f = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0);
      const s = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
      if (f !== 0 || s !== 0) {
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        // forward = (-sin, -cos), right = (cos, -sin)
        wishX = -sin * f + cos * s; wishZ = -cos * f - sin * s;
        const l = Math.sqrt(wishX * wishX + wishZ * wishZ);        // Math.hypot boxes its result: sqrt stays unboxed
        wishX /= l; wishZ /= l;
        this.sprinting = input.held('sprint') && f > 0;
        speed = this.fly ? FLY_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      }
    }
    if (this.fly) {
      const up = active ? (input.held('jump') ? 1 : 0) - (input.held('sprint') ? 1 : 0) : 0;
      p.x += wishX * speed * dt; p.z += wishZ * speed * dt; p.y += up * FLY_SPEED * dt + (active ? this.forward.y * speed * dt * (input.held('forward') ? 1 : 0) : 0);
      v.x = wishX * speed; v.y = 0; v.z = wishZ * speed;
      this.grounded = false;
    } else if (dt > 0) {
      v.x = wishX * speed; v.z = wishZ * speed;
      if (active && this.grounded && input.pressed('jump')) { v.y = JUMP_SPEED; this.grounded = false; }
      this.move(dt);
    }
    this.interp.set(p.x, p.y, p.z);
    if (active && input.pressed('fire')) this.shoot();
  }

  /**
   * Height the capsule stands at near (x, z): the walkable ground under its centre, or a flat ledge under its leading
   * edge when that is higher (a capsule resting half on a step). NaN when there is nothing within reach.
   */
  private support(x: number, y: number, z: number, dirX: number, dirZ: number): number {
    const col = this.ctx.collision, hit = this.hit;
    const top = y + STEP_UP + 0.05, reach = 2 * STEP_UP + 0.15;
    let best = NaN;
    const c = col.groundHeight(x, top, z, reach, hit);
    if (!Number.isNaN(c) && hit.ny > WALKABLE_COS) best = c;
    if (dirX !== 0 || dirZ !== 0) {
      // from a metre up, not from `top`: a ray that starts INSIDE a ledge too high to climb comes out through its
      // underside and reports that as ground (a 0.3 m floor slab 0.6 m above a stair did exactly this, and she was
      // lifted against the slab's edge, then onto it). From above, the too-high top is what is found, and refused.
      const l = col.groundHeight(x + dirX * PLAYER_RADIUS, y + 1.0, z + dirZ * PLAYER_RADIUS, 1.0 + STEP_UP + 0.1, hit);
      // only a flat ledge: on a ramp the capsule is carried by the walkable push, not by its leading edge
      if (!Number.isNaN(l) && hit.ny > 0.999 && (Number.isNaN(best) || l > best + 0.01)) best = l;
    }
    return best;
  }

  /** Gravity, horizontal move, depenetration and step-up, in SUB_STEPS sub-steps. */
  private move(dt: number): void {
    const col = this.ctx.collision, p = this.position, v = this.velocity, res = this.res;
    const sub = dt / SUB_STEPS;
    const speed = Math.sqrt(v.x * v.x + v.z * v.z);
    const dirX = speed > 1e-6 ? v.x / speed : 0, dirZ = speed > 1e-6 ? v.z / speed : 0;
    for (let s = 0; s < SUB_STEPS; s++) {
      const wasGrounded = this.grounded;
      v.y -= GRAVITY * sub;
      const dx = v.x * sub, dz = v.z * sub;
      const nx = p.x + dx, ny = p.y + v.y * sub, nz = p.z + dz;
      col.resolveCapsule(nx, ny, nz, PLAYER_RADIUS, PLAYER_HEIGHT, WALKABLE_COS, res);
      let rx = res.x, ry = res.y, rz = res.z, grounded = res.grounded && v.y <= 0, ceiling = res.hitCeiling;
      // step-up: blocked by something low while walking on the ground -> lift, move, drop
      if (wasGrounded && res.hitWall && speed > 1e-6) {
        const lx = nx - res.x, lz = nz - res.z;
        const lost = Math.sqrt(lx * lx + lz * lz);
        if (lost > 1e-5 && col.capsuleFree(p.x, p.y + STEP_UP + 0.02, p.z, PLAYER_RADIUS, PLAYER_HEIGHT)) {
          const r2 = this.res2;
          col.resolveCapsule(p.x + dx, p.y + STEP_UP + 0.02, p.z + dz, PLAYER_RADIUS, PLAYER_HEIGHT, WALKABLE_COS, r2);
          const g = this.support(r2.x, p.y, r2.z, dirX, dirZ);
          if (!Number.isNaN(g) && g <= p.y + STEP_UP + 0.02 && g >= p.y - STEP_UP) {
            const gained = (r2.x - p.x) * dirX + (r2.z - p.z) * dirZ, plain = (res.x - p.x) * dirX + (res.z - p.z) * dirZ;
            if (gained > plain + 1e-5) {
              col.resolveCapsule(r2.x, g, r2.z, PLAYER_RADIUS, PLAYER_HEIGHT, WALKABLE_COS, r2);
              // the engine may have carried the lifted capsule onto a top up to one radius higher than the lift:
              // what counts is the height really gained
              if (r2.y - p.y <= STEP_UP + 0.02) { rx = r2.x; ry = r2.y; rz = r2.z; grounded = true; ceiling = false; }
            }
          }
        }
      }
      // stay on the ground going down ramps and small steps, and while resting half on a ledge
      if (!grounded && wasGrounded && v.y <= 0) {
        const g = this.support(rx, ry, rz, dirX, dirZ);
        if (!Number.isNaN(g) && ry - g <= STEP_UP && g - ry <= 0.05) {
          // The ground under the centre says nothing about the rim: put straight down beside a ledge she is leaving,
          // the capsule would be inside it. Let the engine place her at that height and keep what it answers, if it
          // answers "standing" within what a capsule rides above a slope (it holds her on the ledge's edge until she
          // is clear of it).
          const r2 = this.res2;
          col.resolveCapsule(rx, g, rz, PLAYER_RADIUS, PLAYER_HEIGHT, WALKABLE_COS, r2);
          if (r2.grounded && r2.y - g <= SNAP_RIDE && g - r2.y <= 0.01) { rx = r2.x; ry = r2.y; rz = r2.z; grounded = true; }
        }
      }
      p.x = rx; p.y = ry; p.z = rz;
      this.grounded = grounded;
      if (grounded) v.y = 0;
      else if (ceiling && v.y > 0) v.y = 0;
    }
  }

  private shoot(): void {
    const { ctx } = this;
    const hit = this.hit, f = this.forward, p = this.position;
    const ox = p.x, oy = p.y + PLAYER_EYE, oz = p.z;
    const shotId = ++this.shotsFired;
    const got = ctx.collision.raycast(ox, oy, oz, f.x, f.y, f.z, SHOT_RANGE, LAYER_SHOT, hit);
    const res = this.response;
    res.outcome = 'impact'; res.stops = true; res.stopsLine = true; res.damageDealt = 0; res.healthLeft = 0;
    if (got && hit.receiver) {
      const d = this.damage;
      d.shotId = shotId; d.ox = ox; d.oy = oy; d.oz = oz; d.dx = f.x; d.dy = f.y; d.dz = f.z;
      hit.receiver.onHit(hit, d, res);
    } else if (got && (hit.flags & ColFlag.GRILLE) !== 0) res.outcome = 'deflected';
    const fired = this.firedPayload;
    fired.shotId = shotId; fired.chambersLeft = 6;
    fired.ox = ox; fired.oy = oy; fired.oz = oz; fired.dx = f.x; fired.dy = f.y; fired.dz = f.z;
    fired.mx = ox + f.x * 0.5; fired.my = oy + f.y * 0.5 - 0.1; fired.mz = oz + f.z * 0.5;
    fired.endX = got ? hit.x : ox + f.x * SHOT_RANGE; fired.endY = got ? hit.y : oy + f.y * SHOT_RANGE; fired.endZ = got ? hit.z : oz + f.z * SHOT_RANGE;
    ctx.events.emit('weapon/fired', fired);
    if (got) {
      const h = this.hitPayload;
      h.x = hit.x; h.y = hit.y; h.z = hit.z; h.shotId = shotId; h.order = 0; h.outcome = res.outcome;
      h.entityId = hit.entity ? hit.entity.id : ''; h.entityKind = hit.entity ? hit.entity.kind : 'world';
      h.part = hit.part; h.surface = hit.surface; h.nx = hit.nx; h.ny = hit.ny; h.nz = hit.nz; h.damage = res.damageDealt;
      const dot = 2 * (f.x * hit.nx + f.y * hit.ny + f.z * hit.nz);
      h.ricochetX = f.x - dot * hit.nx; h.ricochetY = f.y - dot * hit.ny; h.ricochetZ = f.z - dot * hit.nz;
      ctx.events.emit('combat/hit', h);
    }
  }

  // ---- frames -------------------------------------------------------------------------------------
  update(_frameDt: number, alpha: number): void {
    const { ctx } = this;
    ctx.input.consumeLook(this.look);
    if ((this.look.x !== 0 || this.look.y !== 0) && !this.lookLocked && this.alive) {
      const o = ctx.options.value;
      const k = LOOK_RAD_PER_COUNT * o.sensitivity;
      // positive x turns right (yaw decreases); positive y looks down
      this.setAim(this.yaw - this.look.x * k, this.pitch - this.look.y * k * (o.invertY ? -1 : 1));
    }
    this.interp.get(alpha, this.eye);
    this.eye.y += PLAYER_EYE;
    if (!this.cameraOn) return;
    const cam = ctx.scene.camera;
    cam.position.set(this.eye.x, this.eye.y, this.eye.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (cam.fov !== ctx.options.value.fov) { cam.fov = ctx.options.value.fov; cam.updateProjectionMatrix(); }
  }

  // ---- PlayerApi ------------------------------------------------------------------------------------
  applyDamage(info: Readonly<DamageInfo>): number {
    if (!this.alive || this.god) return 0;
    const amount = Math.min(this.health, Math.max(0, info.amount));
    this.health -= amount;
    if (this.health <= 0) { this.die(info.kind, info.source); return amount; }
    const d = this.damagedPayload;
    d.amount = amount; d.health = this.health; d.kind = info.kind; d.source = info.source;
    d.fromX = info.ox; d.fromY = info.oy; d.fromZ = info.oz; d.graceUsed = false;
    this.ctx.events.emit('player/damaged', d);
    return amount;
  }
  givePickup(kind: PickupKind): boolean {
    if (kind === 'pk_canteen') { if (this.health >= MAX_HEALTH) return false; this.health = Math.min(MAX_HEALTH, this.health + 35); return true; }
    if (this.reserve >= 36) return false;
    this.reserve = Math.min(36, this.reserve + (kind === 'pk_rounds_12' ? 12 : 6));
    return true;
  }
  giveLead(amount: number, floor: number): number {
    const before = this.reserve;
    this.reserve = Math.min(36, Math.max(this.reserve + amount, floor));
    return this.reserve - before;
  }
  giveLineRounds(amount: number): number {
    const before = this.lineRounds;
    this.lineRounds = Math.min(2, this.lineRounds + amount);
    return this.lineRounds - before;
  }
  takeStoneRound(): void { this.seventh = 'violet'; }
  setKeptContext(context: KeptContext | null): void { this.kept = context; }
  teleport(x: number, y: number, z: number, yawDeg: number, pitchDeg: number): void {
    const p = this.position;
    p.x = x; p.y = y; p.z = z;
    this.velocity.x = 0; this.velocity.y = 0; this.velocity.z = 0;
    this.setAim(yawDeg * DEG2RAD, pitchDeg * DEG2RAD);
    this.interp.snap(x, y, z);
    this.eye.x = x; this.eye.y = y + PLAYER_EYE; this.eye.z = z;
    // settle on whatever is under the new position, so `grounded` is right on the very next tick
    const g = this.ctx.collision.groundHeight(x, y + 0.3, z, 0.6);
    this.grounded = !Number.isNaN(g) && Math.abs(g - y) < 0.3;
  }
  setControl(enabled: boolean, reason: string, lockLook = false): void {
    this.lookLocked = !enabled && lockLook;
    if (this.control === enabled) return;
    this.control = enabled;
    this.controlPayload.enabled = enabled; this.controlPayload.reason = reason;
    this.ctx.events.emit('player/control', this.controlPayload);
  }
  setGodMode(on: boolean): void { this.god = on; }

  // ---- save -----------------------------------------------------------------------------------------
  captureSave(): PlayerSave {
    return { health: this.health, cylinder: this.cylinder.slice(), reserve: this.reserve, lineRounds: this.lineRounds, seventh: this.seventh };
  }
  applySave(data: PlayerSave): void {
    // the floors of ARCHITECTURE 10.1: 60 HP, 18 reserve, a full cylinder of lead, the saved line rounds
    this.health = Math.max(data.health, 60);
    this.reserve = Math.max(data.reserve, 18);
    for (let i = 0; i < 6; i++) this.cylinder[i] = 'lead';
    this.lineRounds = data.lineRounds;
    this.seventh = data.seventh;
    this.alive = true;
    this.velocity.x = 0; this.velocity.y = 0; this.velocity.z = 0;
  }

  debugState(): DebugSnapshot {
    return {
      stub: 'dummyPlayer', control: this.control, fly: this.fly, god: this.god,
      x: round4(this.position.x), y: round4(this.position.y), z: round4(this.position.z),
      yawDeg: round4(this.yaw * RAD2DEG), pitchDeg: round4(this.pitch * RAD2DEG),
      grounded: this.grounded, health: round4(this.health), keptMark: this.kept ? this.kept.mark : '',
      simDt: round4(FIXED_DT), solidLayers: LAYER_SOLID,
    };
  }
  /** core only: what the debug hook reports as `god` */
  get godMode(): boolean { return this.god; }
}

export function createDummyPlayer(ctx: GameContext): PlayerSystem { return new DummyPlayer(ctx); }
