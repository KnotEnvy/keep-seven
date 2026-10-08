// The player system: the body (controller.ts), the Assize six (weapon.ts, shots.ts), health (health.ts), the camera
// (camera.ts) and the hands (viewModel.ts) behind the PlayerSystem contract. It talks to the rest of the game only
// through the context, the contracts and the event bus (ARCHITECTURE 3.5).
//
// Tick order (fixedUpdate): health -> body -> movement events -> the line round still in flight -> weapon (the shot is
// resolved here, on the click's tick, from the eye of this tick) -> camera offsets -> view-model clips and bones.
// Look is applied per rendered frame in update(), unsmoothed and never time-scaled; the camera is written there.
import { PLAYER_EYE } from '../core/contracts.ts';
import type {
  DamageInfo, DebugSnapshot, GameContext, GameEvents, KeptContext, PickupKind, PlayerDebug, PlayerSave, PlayerSystem, Rng,
  SeventhState, Vec2, Vec3, WeaponView,
} from '../core/contracts.ts';
import { Interp3 } from '../core/interp.ts';
import { DEG2RAD, RAD2DEG, clamp, round4, wrapAngle } from '../core/math.ts';
import { CameraRig } from './camera.ts';
import type { BodyMotion } from './camera.ts';
import { Controller } from './controller.ts';
import { FLASH_PUSH, FOV_MAX, FOV_MIN, LOOK_DEG_PER_COUNT, MAX_HEALTH, MAX_PITCH_DEG, RESPAWN_MIN_HEALTH, WEAPON } from './defs.ts';
import { Health } from './health.ts';
import type { HealthHost } from './health.ts';
import { rayEntersBore } from './kept.ts';
import { Shots } from './shots.ts';
import { ViewModel } from './viewModel.ts';
import { Weapon } from './weapon.ts';
import type { ClipName, WeaponHost, WeaponInput } from './weapon.ts';

const MAX_PITCH = MAX_PITCH_DEG * DEG2RAD;
/** the camera may be kicked past the aim clamp, never past straight up */
const MAX_CAMERA_PITCH = 89.9 * DEG2RAD;

export class PlayerSystemImpl implements PlayerSystem, WeaponHost, HealthHost {
  readonly id = 'player' as const;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly eye: Vec3 = { x: 0, y: PLAYER_EYE, z: 0 };
  readonly forward: Vec3 = { x: 0, y: 0, z: -1 };
  yaw = 0;
  pitch = 0;
  readonly maxHealth = MAX_HEALTH;
  readonly weapon: WeaponView;
  readonly debug: PlayerDebug;
  readonly events: GameContext['events'];
  readonly dev: boolean;

  private readonly body: Controller;
  private readonly gun: Weapon;
  private readonly life: Health;
  private readonly shots: Shots;
  private readonly rig = new CameraRig();
  private readonly hands: ViewModel;
  private readonly rng: Rng;
  private readonly interp = new Interp3();
  private control = false;
  private lookLocked = false;
  private cameraOn = true;
  private sprintToggle = false;
  /** sim ticks this system has run: its own clock (ctx.clock.tick also counts while paused) */
  private simTicks = 0;
  /** degrees of look applied on the frame being drawn (the view-model's sway lags against it) */
  private lookYawDeg = 0;
  private lookPitchDeg = 0;
  private readonly look: Vec2 = { x: 0, y: 0 };
  private readonly input: WeaponInput = { enabled: false, firePressed: false, fireHeld: false, holdToFire: false, reloadPressed: false, linePressed: false, keptPressed: false };
  private readonly motion: BodyMotion = { grounded: false, sprinting: false, speed: 0, strafeSpeed: 0, stridePhase: 0, strideCount: 0, landed: false, landSpeed: 0, stepShift: 0 };
  private readonly origin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly aim: Vec3 = { x: 0, y: 0, z: -1 };
  private readonly muzzle: Vec3 = { x: 0, y: 0, z: 0 };
  /** where the last flash was asked for (world), and the true muzzle of that shot */
  private readonly flashAt: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly local: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly stepPayload: GameEvents['player/footstep'] = { x: 0, y: 0, z: 0, surface: 'none', sprint: false };
  private readonly jumpPayload: GameEvents['player/jumped'] = { x: 0, y: 0, z: 0 };
  private readonly landPayload: GameEvents['player/landed'] = { x: 0, y: 0, z: 0, speed: 0, surface: 'none' };
  private readonly controlPayload: GameEvents['player/control'] = { enabled: false, reason: '' };
  private readonly spawnedPayload: GameEvents['player/spawned'] = { checkpoint: 'cp_lip_start', x: 0, y: 0, z: 0 };
  private readonly off: (() => void)[] = [];

  constructor(private readonly ctx: GameContext) {
    this.events = ctx.events;
    this.dev = ctx.flags.dev || ctx.flags.test;
    this.rng = ctx.rng.fork('player');
    this.body = new Controller(ctx.collision);
    this.position = this.body.position;
    this.velocity = this.body.velocity;
    this.gun = new Weapon(this);
    this.weapon = this.gun;
    this.life = new Health(this);
    this.shots = new Shots(ctx, this.rng);
    this.hands = new ViewModel(ctx);
    this.debug = {
      setHealth: (hp) => this.life.set(hp),
      setAmmo: (chambered, reserve, lineRounds) => { this.gun.debugSetAmmo(chambered, reserve, lineRounds); this.shots.reset(); this.hands.resetRing(this.gun); },
      setAim: (yawDeg, pitchDeg) => this.setAim(yawDeg * DEG2RAD, pitchDeg * DEG2RAD),
      setSeventh: (state: SeventhState) => this.gun.debugSetSeventh(state),
    };
  }

  // ---- PlayerApi: state ----------------------------------------------------------------------------
  get grounded(): boolean { return this.body.grounded; }
  get sprinting(): boolean { return this.body.sprinting; }
  get alive(): boolean { return this.life.alive; }
  get health(): number { return this.life.hp; }

  // ---- lifecycle -----------------------------------------------------------------------------------
  /** pass i3: the gun was let down by the last fire (not yet by the end card) */
  private loweredForFire = false;
  init(): void {
    const { ctx } = this;
    this.off.push(ctx.events.on('game/state', (e) => {
      if (e.to === 'playing' && e.from === 'loading') {
        const p = this.spawnedPayload;
        p.checkpoint = ctx.world.checkpoint; p.x = this.position.x; p.y = this.position.y; p.z = this.position.z;
        ctx.events.emit('player/spawned', p);
      }
    }));
    this.off.push(ctx.events.on('boss/charge_required', () => this.gun.chargeRequired()));
    // release pass p0 (UI team): the end card lets the gun down out of the last image, and gives it back when it closes
    this.off.push(ctx.events.on('ui/screen', (e) => { if (e.screen === 'end') this.hands.setLowered(e.open); }));
    // pass i3 (world team; the player team was not active. Story reviewer a: from "Out on the flat, one small fire" to
    // the card the bright muzzle sat 60 px from the small fire at the same height): the gun goes down as the last fire
    // catches (the world's `ending/fire`), and stays down under the card; it is given back with any new placement
    this.off.push(ctx.events.on('ending/fire', () => { this.hands.setLowered(true); this.loweredForFire = true; }));
    // (she still has the gun until the wind: a shot or a reload after the fire has caught brings it back up)
    this.off.push(ctx.events.on('weapon/fired', () => { if (this.loweredForFire) { this.loweredForFire = false; this.hands.raise(); } }));
    this.off.push(ctx.events.on('weapon/reload', (e) => { if (this.loweredForFire && e.stage === 'open') { this.loweredForFire = false; this.hands.raise(); } }));
    this.off.push(ctx.events.on('ui/screen', (e) => { if (e.screen === 'end') this.loweredForFire = false; }));
    this.off.push(ctx.events.on('game/state', (e) => { if (e.to === 'loading' || e.to === 'title') this.hands.setLowered(false); }));
    this.off.push(ctx.events.on('options/changed', (e) => { if (e.key === 'sprintMode') this.sprintToggle = false; }));
    ctx.debug.register('player', {
      /** degrees of bloom the next shot would have (0 at the normal cadence) */
      spreadDeg: (() => round4(this.gun.bloom)) as (...args: never[]) => unknown,
      /** seconds into the weapon phase, and until it ends */
      phaseTimer: (() => ({ phase: this.gun.phase, t: round4(this.gun.t), remaining: round4(this.gun.remaining) })) as (...args: never[]) => unknown,
      /** force a velocity (the tunnelling test: 60 m/s) */
      setVelocity: ((x: number, y: number, z: number) => { this.velocity.x = x; this.velocity.y = y; this.velocity.z = z; }) as (...args: never[]) => unknown,
      /** the view-model as it is drawn: clip, the six round bones, the cuff loop */
      viewModel: (() => ({ attached: this.hands.attached, clip: this.hands.clipName, rounds: this.hands.shown.slice(), keptLoop: this.hands.keptLoopShown, proceduralKick: this.hands.usesProceduralKick, boneStep: this.hands.boneStep, turn: this.hands.turn, tracks: this.hands.tracksKept, tracksInFile: this.hands.tracksInFile })) as (...args: never[]) => unknown,
      /** where the held gun stands: read it, or (six numbers: metres x y z, degrees pitch yaw roll) try another placement */
      viewPlace: ((...a: number[]) => { if (a.length === 6) this.hands.setPlace(a[0] as number, a[1] as number, a[2] as number, a[3] as number, a[4] as number, a[5] as number); return this.hands.place.map(round4); }) as (...args: never[]) => unknown,
      /** the camera's additive offsets of this tick, degrees and metres */
      /** the last muzzle flash: where it was asked for, the true muzzle, and the eye of that shot (world) */
      flash: (() => ({ x: this.flashAt.x, y: this.flashAt.y, z: this.flashAt.z, muzzle: [this.muzzle.x, this.muzzle.y, this.muzzle.z], eye: [this.origin.x, this.origin.y, this.origin.z], push: FLASH_PUSH })) as (...args: never[]) => unknown,
      kick: (() => ({ pitchDeg: round4(this.rig.kickPitchDegNow), yawDeg: round4(this.rig.kickYawDegNow), fovDeg: round4(this.rig.fov.v), offsetY: round4(this.rig.offsetY.v), rollDeg: round4(this.rig.roll.v * RAD2DEG) })) as (...args: never[]) => unknown,
      /** pass i3: the gun is let down out of the frame (the last fire, the end card) */
      lowered: (() => this.hands.isLowered) as (...args: never[]) => unknown,
      /** play a view-model clip by name without touching the weapon's state (the sandbox's clip buttons) */
      playClip: ((name: ClipName) => { this.gun.clip = name; this.gun.clipSerial++; }) as (...args: never[]) => unknown,
      /** false: something else (an orbit camera) owns the world camera */
      camera: ((on: boolean) => { this.cameraOn = on; }) as (...args: never[]) => unknown,
      /** WeaponView and health beyond what state().player carries */
      extra: (() => ({ segment: this.life.segment, regenerating: this.life.regenerating, immunity: round4(this.life.immunity), keptMark: this.gun.keptMark, keptContext: this.gun.hasKeptContext, discarded: this.gun.discarded, spare: this.gun.spare, linePending: this.shots.pending })) as (...args: never[]) => unknown,
    });
  }
  start(): void {
    this.hands.attach();
    this.hands.tick(0, this.gun, false);
  }
  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    this.hands.detach();
  }

  private setAim(yaw: number, pitch: number): void {
    this.yaw = wrapAngle(yaw);
    this.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
    const cp = Math.cos(this.pitch);
    this.forward.x = -Math.sin(this.yaw) * cp; this.forward.y = Math.sin(this.pitch); this.forward.z = -Math.cos(this.yaw) * cp;
  }

  // ---- simulation ----------------------------------------------------------------------------------
  fixedUpdate(dt: number): void {
    if (dt <= 0) return;
    this.simTicks++;
    const { ctx } = this;
    const input = ctx.input, options = ctx.options.value, gun = this.gun, body = this.body;
    const active = this.control && this.life.alive && ctx.state.current === 'playing';
    this.life.tick(dt);

    // ---- the body
    let f = 0, s = 0, jump = false, sprint = false;
    if (active && gun.phase !== 'loading_kept') {             // GDD 6.6: input other than look is ignored during the load
      f = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0);
      s = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
      jump = input.pressed('jump');
      if (options.sprintMode === 'toggle') {
        if (input.pressed('sprint')) this.sprintToggle = !this.sprintToggle;
        if (f <= 0) this.sprintToggle = false;
        sprint = this.sprintToggle;
      } else sprint = input.held('sprint');
      // firing cancels sprint: not while the hammer is down and the cylinder turns
      if (gun.phase === 'firing' || gun.phase === 'firing_kept') sprint = false;
    }
    body.viewYaw = this.yaw;
    body.tick(dt, f, s, sprint, jump);
    this.moveEvents();

    // ---- the gun
    this.shots.tick();
    if (this.life.alive) {
      const wi = this.input;
      wi.enabled = active;
      wi.firePressed = active && input.pressed('fire'); wi.fireHeld = active && input.held('fire');
      wi.holdToFire = options.fireMode === 'hold';
      wi.reloadPressed = active && input.pressed('reload');
      wi.linePressed = active && input.pressed('line');
      wi.keptPressed = active && input.pressed('kept');
      gun.tick(dt, wi);
      if (gun.firedThisTick) this.sprintToggle = false;
    }

    // ---- camera offsets and the hands
    const m = this.motion, v = this.velocity;
    m.grounded = body.grounded; m.sprinting = body.sprinting;
    m.speed = Math.sqrt(v.x * v.x + v.z * v.z);
    m.strafeSpeed = v.x * Math.cos(this.yaw) - v.z * Math.sin(this.yaw);
    m.stridePhase = body.stridePhase; m.strideCount = body.strideCount;
    m.landed = body.landed; m.landSpeed = body.landSpeed; m.stepShift = body.stepShift;
    this.rig.tick(dt, m, options);
    this.hands.tick(dt, gun, body.sprinting);
    this.interp.set(this.position.x, this.position.y, this.position.z);
  }

  private moveEvents(): void {
    const body = this.body, p = this.position, events = this.ctx.events;
    if (body.jumped) {
      const e = this.jumpPayload;
      e.x = p.x; e.y = p.y; e.z = p.z;
      events.emit('player/jumped', e);
    }
    if (body.landed) {
      const e = this.landPayload;
      e.x = p.x; e.y = p.y; e.z = p.z; e.speed = body.landSpeed; e.surface = body.groundSurface;
      events.emit('player/landed', e);
    }
    if (body.footstep) {
      const e = this.stepPayload;
      e.x = p.x; e.y = p.y; e.z = p.z; e.surface = body.groundSurface; e.sprint = body.sprinting;
      events.emit('player/footstep', e);
    }
  }

  // ---- WeaponHost ----------------------------------------------------------------------------------
  /** The eye and the stored aim of this tick: where a round starts and goes. The kick never moves the aim. */
  private shotRay(): void {
    const p = this.position, f = this.forward, o = this.origin, d = this.aim;
    o.x = p.x; o.y = p.y + PLAYER_EYE; o.z = p.z;
    d.x = f.x; d.y = f.y; d.z = f.z;
    // the muzzle: its camera-space place under the view-model group, put at the camera this tick's aim gives
    const l = this.local, mz = this.muzzle;
    if (!this.hands.muzzleCameraSpace(l)) { l.x = 0.075; l.y = -0.07; l.z = -0.56; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    // camera axes in the world: right (cy, 0, -sy), up (sy sp, cp, cy sp), back (sy cp, -sp, cy cp)
    mz.x = o.x + cy * l.x + sy * sp * l.y + sy * cp * l.z;
    mz.y = o.y + cp * l.y - sp * l.z;
    mz.z = o.z - sy * l.x + cy * sp * l.y + cy * cp * l.z;
  }
  private afterShot(ammo: 'lead_round' | 'line_round' | 'kept_round'): void {
    const { ctx } = this;
    const def = WEAPON.ammo[ammo], mz = this.muzzle, reduce = ctx.options.value.reduceMotion;
    // The flash sprite is a fixed size in the world and drawn with no depth test: at the muzzle (0.46 m from the eye) its
    // core reached the crosshair and hid a body at 8 m for the three ticks in which it reacts. It is asked for farther
    // out along the eye-to-muzzle line: the same place on the screen, FLASH_PUSH times smaller. The tracer and
    // `weapon/fired` keep the true muzzle.
    const o = this.origin, fl = this.flashAt;
    fl.x = o.x + (mz.x - o.x) * FLASH_PUSH; fl.y = o.y + (mz.y - o.y) * FLASH_PUSH; fl.z = o.z + (mz.z - o.z) * FLASH_PUSH;
    ctx.render.vfx.muzzleFlash(ammo === 'lead_round' ? 'lead' : ammo === 'line_round' ? 'line' : 'kept', fl.x, fl.y, fl.z);
    if (!reduce) ctx.render.addTrauma(def.trauma);
    this.rig.fire(def, this.rng.range(-1, 1), reduce);
  }
  shoot(ammo: 'lead_round' | 'line_round', shotId: number, chambersLeft: number, bloomDeg: number): void {
    this.shotRay();
    if (ammo === 'lead_round') this.shots.lead(shotId, chambersLeft, this.origin, this.aim, this.muzzle, bloomDeg);
    else this.shots.line(shotId, chambersLeft, this.origin, this.aim, this.muzzle);
    this.afterShot(ammo);
  }
  shootKept(shotId: number, chambersLeft: number, context: Readonly<KeptContext>): void {
    this.shotRay();
    this.shots.kept(shotId, chambersLeft, this.origin, this.aim, this.muzzle, context);
    this.afterShot('kept_round');
  }
  aimEntersBore(context: Readonly<KeptContext>): boolean {
    const p = this.position, f = this.forward;
    return rayEntersBore(p.x, p.y + PLAYER_EYE, p.z, f.x, f.y, f.z, context) >= 0;
  }
  leftMark(context: Readonly<KeptContext>): boolean {
    const p = this.position;
    const dx = p.x - context.markX, dy = p.y - context.markY, dz = p.z - context.markZ;
    return dx * dx + dy * dy + dz * dz > context.leaveRadius * context.leaveRadius;
  }

  // ---- HealthHost ----------------------------------------------------------------------------------
  difficulty(): GameContext['options']['value']['difficulty'] { return this.ctx.options.value.difficulty; }
  trauma(amount: number): void { if (!this.ctx.options.value.reduceMotion) this.ctx.render.addTrauma(amount); }

  // ---- frames --------------------------------------------------------------------------------------
  update(_frameDt: number, alpha: number): void {
    const { ctx } = this;
    const o = ctx.options.value, rig = this.rig;
    ctx.input.consumeLook(this.look);
    this.lookYawDeg = 0; this.lookPitchDeg = 0;
    // the counts are always drained; they turn the view only while the game runs (a readable or the menu is a pause:
    // the pointer may stay locked behind it)
    if ((this.look.x !== 0 || this.look.y !== 0) && !this.lookLocked && this.life.alive && ctx.state.current === 'playing') {
      // per rendered frame, unsmoothed, never time-scaled: positive x turns right (yaw decreases), positive y looks down
      const k = LOOK_DEG_PER_COUNT * o.sensitivity;
      this.lookYawDeg = -this.look.x * k;
      this.lookPitchDeg = -this.look.y * k * (o.invertY ? -1 : 1);
      this.setAim(this.yaw + this.lookYawDeg * DEG2RAD, this.pitch + this.lookPitchDeg * DEG2RAD);
    }
    const eye = this.interp.get(alpha, this.eye);
    const side = rig.offsetSide.get(alpha);
    eye.x += Math.cos(this.yaw) * side; eye.z -= Math.sin(this.yaw) * side;
    eye.y += PLAYER_EYE + rig.offsetY.get(alpha);
    if (!this.cameraOn) return;
    const cam = ctx.scene.camera;
    cam.position.set(eye.x, eye.y, eye.z);
    cam.rotation.set(clamp(this.pitch + rig.kickPitch.get(alpha), -MAX_CAMERA_PITCH, MAX_CAMERA_PITCH), this.yaw + rig.kickYaw.get(alpha), rig.roll.get(alpha), 'YXZ');
    const fov = clamp(o.fov, FOV_MIN, FOV_MAX) + rig.fov.get(alpha);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
  lateUpdate(frameDt: number, alpha: number): void {
    this.hands.late(frameDt, alpha, this.rig, this.lookYawDeg, this.lookPitchDeg, this.ctx.options.value.reduceMotion);
  }

  // ---- PlayerApi: calls ----------------------------------------------------------------------------
  applyDamage(info: Readonly<DamageInfo>): number { return this.life.applyDamage(info); }
  givePickup(kind: PickupKind): boolean { return kind === 'pk_canteen' ? this.life.canteen() : this.gun.givePickup(kind); }
  giveLead(amount: number, floor: number): number { return this.gun.giveLead(amount, floor); }
  giveLineRounds(amount: number): number { return this.gun.giveLineRounds(amount); }
  takeStoneRound(): void { this.gun.takeStoneRound(); }
  setKeptContext(context: KeptContext | null): void { this.gun.setKeptContext(context); }
  teleport(x: number, y: number, z: number, yawDeg: number, pitchDeg: number): void {
    this.body.teleport(x, y, z);
    this.setAim(yawDeg * DEG2RAD, pitchDeg * DEG2RAD);
    this.interp.snap(x, y, z);
    this.rig.reset();
    this.eye.x = x; this.eye.y = y + PLAYER_EYE; this.eye.z = z;
  }
  setControl(enabled: boolean, reason: string, lockLook = false): void {
    this.lookLocked = !enabled && lockLook;
    if (this.control === enabled) return;
    this.control = enabled;
    if (enabled) this.gun.draw();                             // on spawn and after rides (GDD 6.9 `draw`)
    else this.sprintToggle = false;
    this.controlPayload.enabled = enabled; this.controlPayload.reason = reason;
    this.ctx.events.emit('player/control', this.controlPayload);
  }
  setGodMode(on: boolean): void { this.life.god = on; }

  // ---- save ----------------------------------------------------------------------------------------
  captureSave(): PlayerSave { return this.gun.capture(this.life.hp); }
  /**
   * A restore (the world has teleported her to the checkpoint) or the start of a new run (it has not placed her yet;
   * she may be dead, on the title or the ending): alive, the floors of GDD 5, a full cylinder, the gun ready, every
   * per-run field reset.
   */
  applySave(data: PlayerSave): void {
    const saved = Number.isFinite(data.health) ? data.health : MAX_HEALTH;
    this.life.restore(Math.max(saved, RESPAWN_MIN_HEALTH));
    this.gun.restore(data);
    this.shots.reset();
    this.hands.resetRing(this.gun);
    this.body.stop();
    this.rig.reset();
    this.sprintToggle = false;
  }

  debugState(): DebugSnapshot {
    const p = this.position, v = this.velocity, gun = this.gun, life = this.life, rig = this.rig;
    return {
      control: this.control, lookLocked: this.lookLocked, god: life.god,
      x: round4(p.x), y: round4(p.y), z: round4(p.z), vx: round4(v.x), vy: round4(v.y), vz: round4(v.z),
      speed: round4(Math.sqrt(v.x * v.x + v.z * v.z)),
      yawDeg: round4(this.yaw * RAD2DEG), pitchDeg: round4(this.pitch * RAD2DEG),
      grounded: this.body.grounded, sprinting: this.body.sprinting, surface: this.body.groundSurface,
      phase: gun.phase, phaseTime: round4(gun.t), phaseLeft: round4(gun.remaining), clip: gun.clip,
      chambered: gun.chambered, reserve: gun.reserve, lineRounds: gun.lineRounds, seventh: gun.seventh, shotsFired: gun.shotsFired,
      bloomDeg: round4(gun.bloom), kickPitchDeg: round4(rig.kickPitchDegNow), kickYawDeg: round4(rig.kickYawDegNow), fovAddDeg: round4(rig.fov.v),
      health: round4(life.hp), segment: life.segment, regenerating: life.regenerating, immunity: round4(life.immunity),
      keptAimLegal: gun.keptAimLegal, keptMark: gun.keptMark, linePending: this.shots.pending, simTicks: this.simTicks,
    };
  }
}
