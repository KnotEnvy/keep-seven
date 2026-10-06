// The body: a Quake-style ground / air model on the 60 Hz tick (GDD 5; game-feel 1.2), moved through
// CollisionWorld.resolveCapsule in sub-steps, with the 0.35 m step-up, the 45 degree slope limit, coyote time and a
// jump buffer. No three.js, no DOM: it needs a CollisionWorld and numbers, so it runs in a unit test as it runs in the game.
//
// Three properties of the collision engine are handled here (ARCHITECTURE 6; pinned in tests/core/collision.spec.ts):
//  (a) resolveCapsule itself carries a capsule onto any walkable top below the centre of its lower sphere (one radius,
//      0.35 m, above the feet) and can leave it up to 0.14 m above that top. So the height really gained is checked
//      after every move: on the ground a rise that is more than a slope explains is validated against the ledge really
//      found under her (`support`), and refused above STEP_UP; in the air nothing may put her higher than the jump's
//      apex above the take-off ground (`airCeilY`), or a 1.0 m jump would mount the layout's 1.3 m cover.
//  (b) a groundHeight ray that starts inside a solid reports its underside: `support` probes a ledge from a metre up.
//  (c) the ground under the capsule's centre says nothing about its rim: every snap is resolved and the engine's answer kept.
import type { CapsuleResolve, CollisionWorld, HitResult, SurfaceType, Vec3 } from '../core/contracts.ts';
import {
  AIR_ACCEL, AIR_MIN_CAP, BACK_SCALE, COYOTE_TIME, GRAVITY, GROUND_ACCEL, GROUND_FRICTION, HEIGHT, JUMP_APEX, JUMP_BUFFER,
  JUMP_VELOCITY, MAX_SUBSTEP_TRAVEL, RADIUS, RUN_SPEED, SPRINT_SPEED, STEP_UP, STOP_SPEED, STRAFE_SCALE, STRIDE_RUN,
  STRIDE_SPRINT, SUB_STEPS, WALKABLE_COS,
} from './defs.ts';

/** how far above the ground under its centre a capsule may stand: riding a 45 degree slope, or a step's edge */
const SNAP_RIDE = STEP_UP;
/** how far the capsule is lifted above STEP_UP to try a step (clearance over the lip) */
const STEP_LIFT = STEP_UP + 0.02;
/** slack on the step height and on the air ceiling (the engine rests a capsule a few millimetres proud): 0.36 m is a wall */
const STEP_TOL = 0.008;
/** eight points on the capsule's rim (and the centre): where a too-high top is looked for under an airborne body */
const RIM_X: readonly number[] = [0, 1, 0.7071, 0, -0.7071, -1, -0.7071, 0, 0.7071].map((v) => v * RADIUS);
const RIM_Z: readonly number[] = [0, 0, 0.7071, 1, 0.7071, 0, -0.7071, -1, -0.7071].map((v) => v * RADIUS);
/** consecutive refused airborne sub-steps after which the engine's answer is taken: a mounted crate beats a stuck player */
const MAX_AIR_STAYS = 12;
// cells of the query scratch `q` (see "collision queries" in the class)
const X = 0, Y = 1, Z = 2, DROP = 3, GROUND = 4, SX = 5, SY = 6, SZ = 7, SUPPORT = 8, H = 9, SNY = 10;
/** she counts as sprinting above this horizontal speed (with the sprint input): a run tops out at RUN_SPEED */
const SPRINT_MIN_SPEED = RUN_SPEED + 0.2;
/** a rise in one sub-step that no walkable slope explains (45 degrees at sprint speed is 0.04 m): the engine's ledge lift */
const LIFT_SUSPECT = 0.08;
const MAX_SUB_STEPS = 8;

export class Controller {
  readonly position: Vec3 = { x: 0, y: 0, z: 0 };
  readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };
  grounded = false;
  groundSurface: SurfaceType = 'none';
  /**
   * Really sprinting on this tick: the sprint input, forward, and a measured horizontal speed above a run. Pressed
   * against a wall, or steering a standing jump, she is not (the FOV, the sprint clip, the stride and what enemies read).
   */
  sprinting = false;
  // ---- what happened on the last tick (read by the system right after tick()) ----
  jumped = false;
  landed = false;
  /** downward speed at the moment of landing, m/s */
  landSpeed = 0;
  footstep = false;
  /** sum of the vertical jumps of this tick that were not motion (a step climbed, a snap down): the camera smooths them */
  stepShift = 0;
  /** 0..1 along the current stride; a footfall at each wrap */
  stridePhase = 0;
  /** footfalls since the last teleport (the lateral bob alternates on its parity) */
  strideCount = 0;

  /** seconds left of each window; negative = closed (a window that has run for exactly its time is still open) */
  private coyote = -1;
  private jumpBuffer = -1;
  /** horizontal speed limit while airborne (GDD 5: the take-off speed) */
  private airCap = AIR_MIN_CAP;
  /** the highest feet height the engine may leave her at while airborne */
  private airCeilY = 0;
  private tickStartY = 0;
  private airStays = 0;
  private readonly q = new Float64Array(11);
  private dirX = 0;
  private dirZ = 0;
  /** this tick's dt (a field, not a parameter of move(): see "collision queries") */
  private dt = 0;
  /** the view yaw the wish direction is built from: radians, 0 faces -Z, positive turns left. Set before tick(). */
  viewYaw = 0;
  private readonly res: CapsuleResolve;
  private readonly res2: CapsuleResolve;
  private readonly hit: HitResult;

  constructor(private readonly col: CollisionWorld) {
    this.res = col.createResolve(); this.res2 = col.createResolve(); this.hit = col.createHit();
  }

  teleport(x: number, y: number, z: number): void {
    const p = this.position, v = this.velocity;
    p.x = x; p.y = y; p.z = z;
    v.x = 0; v.y = 0; v.z = 0;
    this.coyote = -1; this.jumpBuffer = -1; this.airCap = AIR_MIN_CAP; this.airCeilY = y; this.airStays = 0;
    this.stridePhase = 0; this.strideCount = 0; this.sprinting = false;
    this.jumped = false; this.landed = false; this.footstep = false; this.stepShift = 0;
    // settle on whatever is under the new position, so `grounded` is right on the very next tick
    const g = this.col.groundHeight(x, y + 0.3, z, 0.6, this.hit);
    this.grounded = !Number.isNaN(g) && Math.abs(g - y) < 0.3;
    this.groundSurface = this.grounded ? this.hit.surface : 'none';
  }
  stop(): void { const v = this.velocity; v.x = 0; v.y = 0; v.z = 0; this.sprinting = false; }

  /**
   * One sim tick. `forward` and `strafe` are -1, 0 or 1 (strafe +1 = right), the direction comes from `viewYaw`,
   * `sprint` is already resolved by the caller (hold or toggle, cancelled by fire).
   */
  tick(dt: number, forward: number, strafe: number, sprint: boolean, jumpPressed: boolean): void {
    this.jumped = false; this.landed = false; this.footstep = false; this.stepShift = 0; this.landSpeed = 0;
    if (dt <= 0) return;
    this.dt = dt;
    const p = this.position, v = this.velocity;
    const startX = p.x, startZ = p.z;
    const wasGrounded = this.grounded;

    // ---- wish direction and speed
    let wishX = 0, wishZ = 0, wishSpeed = 0;
    let wantSprint = false;
    if (forward !== 0 || strafe !== 0) {
      const sin = Math.sin(this.viewYaw), cos = Math.cos(this.viewYaw);
      // forward = (-sin, -cos), right = (cos, -sin)
      wishX = -sin * forward + cos * strafe; wishZ = -cos * forward - sin * strafe;
      const l = Math.sqrt(wishX * wishX + wishZ * wishZ);        // Math.hypot boxes its result: sqrt stays unboxed
      wishX /= l; wishZ /= l;
      wantSprint = sprint && forward > 0;
      wishSpeed = wantSprint ? SPRINT_SPEED : forward < 0 ? RUN_SPEED * BACK_SCALE : RUN_SPEED * (forward === 0 ? STRAFE_SCALE : 1);
    }

    // ---- timers
    if (jumpPressed) this.jumpBuffer = JUMP_BUFFER; else if (this.jumpBuffer > -1e-9) this.jumpBuffer -= dt;
    if (wasGrounded) this.coyote = COYOTE_TIME; else if (this.coyote > -1e-9) this.coyote -= dt;

    // ---- velocity
    if (wasGrounded) {
      this.friction(dt);
      this.accelerate(wishX, wishZ, wishSpeed, GROUND_ACCEL * dt * wishSpeed);
    } else if (wishSpeed > 0) {
      v.x += wishX * AIR_ACCEL * dt; v.z += wishZ * AIR_ACCEL * dt;
      const s = Math.sqrt(v.x * v.x + v.z * v.z);
      if (s > this.airCap) { const k = this.airCap / s; v.x *= k; v.z *= k; }
    }

    // ---- jump: on the ground, or within the coyote time of leaving it; a press up to JUMP_BUFFER early still counts
    if (this.jumpBuffer > -1e-9 && (wasGrounded || this.coyote > -1e-9)) {
      v.y = JUMP_VELOCITY;
      this.grounded = false;
      this.coyote = -1; this.jumpBuffer = -1;
      this.airCeilY = p.y + JUMP_APEX;
      this.setAirCap();
      this.jumped = true;
    }

    this.tickStartY = p.y;
    this.move();
    // measured after the move: a wall has taken the speed that ran into it
    this.sprinting = wantSprint && v.x * v.x + v.z * v.z > SPRINT_MIN_SPEED * SPRINT_MIN_SPEED;

    if (wasGrounded && !this.grounded && !this.jumped) {
      // walked off an edge: nothing may lift her above where she left the ground
      this.airCeilY = p.y > this.tickStartY ? p.y : this.tickStartY;
      this.setAirCap();
    }
    // ---- footfalls: distance really travelled on the ground
    if (this.grounded && wasGrounded) {
      const mx = p.x - startX, mz = p.z - startZ;
      const d = Math.sqrt(mx * mx + mz * mz);
      if (d > 1e-6) {
        this.stridePhase += d / (this.sprinting ? STRIDE_SPRINT : STRIDE_RUN);
        if (this.stridePhase >= 1) { this.stridePhase -= 1; this.strideCount++; this.footstep = true; }
      }
    }
  }
  private setAirCap(): void {
    const v = this.velocity;
    const s = Math.sqrt(v.x * v.x + v.z * v.z);
    this.airCap = s > AIR_MIN_CAP ? s : AIR_MIN_CAP;
  }

  /** Quake's ground friction: a drop proportional to speed, with a stop-speed floor so she stops instead of creeping. */
  private friction(dt: number): void {
    const v = this.velocity;
    const speed = Math.sqrt(v.x * v.x + v.z * v.z);
    if (speed < 1e-6) { v.x = 0; v.z = 0; return; }
    const control = speed < STOP_SPEED ? STOP_SPEED : speed;
    let next = speed - control * GROUND_FRICTION * dt;
    if (next < 0) next = 0;
    const k = next / speed;
    v.x *= k; v.z *= k;
  }
  private accelerate(wishX: number, wishZ: number, wishSpeed: number, accelSpeed: number): void {
    if (wishSpeed <= 0) return;
    const v = this.velocity;
    const add = wishSpeed - (v.x * wishX + v.z * wishZ);
    if (add <= 0) return;
    const a = accelSpeed < add ? accelSpeed : add;
    v.x += wishX * a; v.z += wishZ * a;
  }

  // ---- collision queries -----------------------------------------------------------------------------
  // V8 boxes every non-integer number handed to a function it does not inline (16 bytes apiece), and the engine's
  // zero-allocation queries stay zero only when their thin wrappers are inlined into a SMALL caller
  // (docs/requests/foundation-collision.md 2). So every query is made from one of these three-line methods, and its
  // arguments and results travel through the Float64Array `q`, never as parameters of the large functions below.
  /** resolveCapsule with the feet at q[X], q[Y], q[Z] */
  private resolve(out: CapsuleResolve): void {
    const q = this.q;
    this.col.resolveCapsule(q[X] as number, q[Y] as number, q[Z] as number, RADIUS, HEIGHT, WALKABLE_COS, out);
  }
  private free(): boolean {
    const q = this.q;
    return this.col.capsuleFree(q[X] as number, q[Y] as number, q[Z] as number, RADIUS, HEIGHT);
  }
  /** groundHeight from q[X], q[Y], q[Z] down q[DROP] -> q[GROUND] (NaN when there is none) */
  private ground(): void {
    const q = this.q;
    q[GROUND] = this.col.groundHeight(q[X] as number, q[Y] as number, q[Z] as number, q[DROP] as number, this.hit);
  }

  /**
   * q[SUPPORT] = the height the capsule stands at near (q[SX], q[SZ]) when its feet are about q[SY]: the walkable
   * ground under its centre, or a flat ledge under its leading edge when that is higher (a capsule resting half on a
   * step). NaN when there is nothing within reach.
   */
  private support(): void {
    const q = this.q, hit = this.hit;
    const x = q[SX] as number, y = q[SY] as number, z = q[SZ] as number;
    q[SUPPORT] = NaN; q[SNY] = 0;
    q[X] = x; q[Y] = y + STEP_UP + 0.05; q[Z] = z; q[DROP] = 2 * STEP_UP + 0.15;
    this.ground();
    if (!Number.isNaN(q[GROUND] as number) && hit.ny > WALKABLE_COS) { q[SUPPORT] = q[GROUND] as number; q[SNY] = hit.ny; }
    if (this.dirX !== 0 || this.dirZ !== 0) {
      // from a metre up, not from just above her feet: a ray that starts INSIDE a ledge too high to climb comes out
      // through its underside and reports that as ground. From above, the too-high top is what is found, and refused.
      q[X] = x + this.dirX * RADIUS; q[Y] = y + 1.0; q[Z] = z + this.dirZ * RADIUS; q[DROP] = 1.0 + STEP_UP + 0.1;
      this.ground();
      // only a flat ledge: on a ramp the capsule is carried by the walkable push, not by its leading edge
      const l = q[GROUND] as number, best = q[SUPPORT] as number;
      if (!Number.isNaN(l) && hit.ny > 0.999 && (Number.isNaN(best) || l > best + 0.01)) { q[SUPPORT] = l; q[SNY] = 1; }
    }
  }

  /**
   * True when a FLAT top higher than the air ceiling, and higher than her feet, lies under the capsule's footprint at
   * (q[SX], q[SY], q[SZ]): she overlaps something she cannot reach by jumping (the engine would roll her onto it over
   * its edge).
   */
  private tooHighTop(): boolean {
    const q = this.q, hit = this.hit, limit = this.airCeilY + STEP_TOL;
    const x = q[SX] as number, y = q[SY] as number, z = q[SZ] as number;
    for (let i = 0; i < 9; i++) {
      q[X] = x + (RIM_X[i] as number); q[Y] = y + 1.0; q[Z] = z + (RIM_Z[i] as number); q[DROP] = 1.0;
      this.ground();
      const g = q[GROUND] as number;
      if (!Number.isNaN(g) && g > limit && g > y + 1e-3 && hit.ny > 0.999) return true;
    }
    return false;
  }

  /** Gravity, the horizontal move, depenetration, step-up and the ground snap, in sub-steps of q[H] seconds. */
  private move(): void {
    const v = this.velocity, dt = this.dt;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) + GRAVITY * dt;
    let n = Math.ceil((speed * dt) / MAX_SUBSTEP_TRAVEL);
    if (n < SUB_STEPS) n = SUB_STEPS; else if (n > MAX_SUB_STEPS) n = MAX_SUB_STEPS;
    this.q[H] = dt / n;
    for (let s = 0; s < n; s++) this.subStep();
  }

  private subStep(): void {
    const p = this.position, v = this.velocity, res = this.res, r2 = this.res2, q = this.q;
    const h = q[H] as number;
    const wasGrounded = this.grounded;
    v.y -= GRAVITY * h;
    const hs = Math.sqrt(v.x * v.x + v.z * v.z);
    const dirX = hs > 1e-6 ? v.x / hs : 0, dirZ = hs > 1e-6 ? v.z / hs : 0;
    this.dirX = dirX; this.dirZ = dirZ;
    const dx = v.x * h, dz = v.z * h;
    const nx = p.x + dx, ny = p.y + v.y * h, nz = p.z + dz;
    q[X] = nx; q[Y] = ny; q[Z] = nz;
    this.resolve(res);
    let rx = res.x, ry = res.y, rz = res.z, grounded = res.grounded && v.y <= 0, ceiling = res.hitCeiling;
    let surface = res.groundSurface;
    let blocked = res.hitWall;
    let shift = 0;

    if (wasGrounded) {
      let stepped = false;
      // step-up: blocked by something low while walking on the ground -> lift, move, drop
      if (res.hitWall && hs > 1e-6) {
        const lx = nx - res.x, lz = nz - res.z;
        q[X] = p.x; q[Y] = p.y + STEP_LIFT; q[Z] = p.z;
        if (lx * lx + lz * lz > 1e-10 && this.free()) {
          q[X] = p.x + dx; q[Z] = p.z + dz;
          this.resolve(r2);
          q[SX] = r2.x; q[SY] = p.y; q[SZ] = r2.z;
          this.support();
          const g = q[SUPPORT] as number;
          if (!Number.isNaN(g) && g <= p.y + STEP_UP + STEP_TOL && g >= p.y - STEP_UP) {
            const gained = (r2.x - p.x) * dirX + (r2.z - p.z) * dirZ, plain = (res.x - p.x) * dirX + (res.z - p.z) * dirZ;
            if (gained > plain + 1e-5) {
              q[X] = r2.x; q[Y] = g; q[Z] = r2.z;
              this.resolve(r2);
              // the engine may have carried the lifted capsule onto a top up to one radius higher than the lift:
              // what counts is the height really gained
              if (r2.y - p.y <= STEP_UP + STEP_TOL) {
                shift = r2.y - p.y;
                rx = r2.x; ry = r2.y; rz = r2.z; grounded = true; ceiling = false; surface = r2.groundSurface;
                stepped = true; blocked = false;
              }
            }
          }
        }
      }
      // (a) the engine's own ledge lift: a rise no slope explains is taken only onto a ledge that is really there and
      // at most STEP_UP above her feet, and she is put down ON it (the engine can leave her 0.14 m above it, in the air)
      if (!stepped && ry - p.y > LIFT_SUSPECT) {
        let ok = false;
        q[SX] = rx; q[SY] = p.y; q[SZ] = rz;
        this.support();
        const g = q[SUPPORT] as number;
        if (!Number.isNaN(g) && g - p.y <= STEP_UP + STEP_TOL) {
          q[X] = rx; q[Y] = g; q[Z] = rz;
          this.resolve(r2);
          if (r2.y - p.y <= STEP_UP + STEP_TOL) {
            shift = r2.y - p.y;
            rx = r2.x; ry = r2.y; rz = r2.z; grounded = r2.grounded; ceiling = false; surface = r2.groundSurface;
            ok = true;
          }
        }
        if (!ok) { rx = p.x; ry = p.y; rz = p.z; grounded = true; ceiling = false; surface = this.groundSurface; blocked = true; }
      }
      // never more than one step in one tick, however the sub-steps add up
      if (ry - this.tickStartY > STEP_UP + STEP_TOL + 0.03) { rx = p.x; ry = p.y; rz = p.z; grounded = true; surface = this.groundSurface; blocked = true; shift = 0; }
      // stay on the ground going down ramps and small steps, and while resting half on a ledge
      if (!grounded && v.y <= 0) {
        q[SX] = rx; q[SY] = ry; q[SZ] = rz;
        this.support();
        const g = q[SUPPORT] as number;
        if (!Number.isNaN(g) && ry - g <= STEP_UP && g - ry <= 0.05) {
          // (c) put straight down beside a ledge she is leaving, the capsule would be inside it: let the engine place
          // her at that height and keep what it answers, if it answers "standing"
          const sny = q[SNY] as number;
          q[X] = rx; q[Y] = g; q[Z] = rz;
          this.resolve(r2);
          // over the crest of a ramp at the walkable limit the engine carries her on the crest's edge and the slope
          // but, within a rounding of 45 degrees, does not call it standing (measured 0.15 to 0.2 m past the crest):
          // the ground under her centre is a walkable slope, nothing pushed her sideways, so she stands
          const onSlope = sny < 0.999 && sny > WALKABLE_COS && !r2.hitWall;
          if ((r2.grounded || onSlope) && r2.y - g <= SNAP_RIDE && g - r2.y <= 0.01) {
            if (ry - r2.y > LIFT_SUSPECT) shift += r2.y - ry;
            rx = r2.x; ry = r2.y; rz = r2.z; grounded = true; if (r2.grounded) surface = r2.groundSurface; else surface = this.groundSurface;
          }
        }
      }
    } else if (ry > ny + 1e-4 && this.liftedTooHigh(rx, ry, rz)) {
      // (a) in the air: the engine pushed her up, and either it left her higher than her jump reaches or she hangs
      // over a top that is. That top is a wall to her: take the vertical part of the move only.
      q[X] = p.x; q[Y] = ny; q[Z] = p.z;
      this.resolve(r2);
      const again = r2.y > ny + 1e-4 && r2.y > p.y + 1e-4 && this.liftedTooHigh(r2.x, r2.y, r2.z);
      if (again && this.airStays < MAX_AIR_STAYS) {
        this.airStays++;
        rx = p.x; ry = p.y; rz = p.z; grounded = false; ceiling = false;
        if (v.y > 0) v.y = 0;
      } else if (!again) {
        this.airStays = 0;
        rx = r2.x; ry = r2.y; rz = r2.z; grounded = r2.grounded && v.y <= 0; ceiling = r2.hitCeiling; surface = r2.groundSurface;
      } else this.airStays = 0;                            // stuck: keep the engine's first answer
      v.x = 0; v.z = 0;
      blocked = false;
    } else if (!wasGrounded) this.airStays = 0;

    // a wall takes the part of the velocity that runs into it (the rest slides along)
    if (blocked) {
      if (res.hitWall) {
        const into = v.x * res.wallNx + v.z * res.wallNz;
        if (into < 0) { v.x -= into * res.wallNx; v.z -= into * res.wallNz; }
      } else { v.x = 0; v.z = 0; }
    }
    if (grounded && !wasGrounded) { this.landed = true; this.landSpeed = -v.y; }
    p.x = rx; p.y = ry; p.z = rz;
    this.grounded = grounded;
    this.stepShift += shift;
    if (grounded) { v.y = 0; this.groundSurface = surface; }
    else if (ceiling && v.y > 0) v.y = 0;
  }
  /** Rare (an airborne body the engine pushed up): is she above the air ceiling, or over a top that is? */
  private liftedTooHigh(x: number, y: number, z: number): boolean {
    if (y > this.airCeilY + STEP_TOL) return true;
    const q = this.q;
    q[SX] = x; q[SY] = y; q[SZ] = z;
    return this.tooHighTop();
  }
}

/** The speed she is asking for with these inputs (for readouts and tests). */
export function wishSpeedOf(forward: number, strafe: number, sprint: boolean): number {
  if (forward === 0 && strafe === 0) return 0;
  return sprint && forward > 0 ? SPRINT_SPEED : forward < 0 ? RUN_SPEED * BACK_SCALE : RUN_SPEED;
}
