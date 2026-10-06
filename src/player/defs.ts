// src/player/defs.ts: every number of the player and the Assize six, each with the section it comes from.
// No other module hardcodes these (code-player order, section 3). Units: metres, seconds, degrees unless named.
import { FIXED_DT, PLAYER_EYE, PLAYER_HEIGHT, PLAYER_RADIUS } from '../core/contracts.ts';
import type { AmmoDef, Difficulty, PickupKind, WeaponDef, WeaponPhase } from '../core/contracts.ts';

const DEG = Math.PI / 180;

// ---- body (GDD 5; CLAUDE.md conventions) --------------------------------------------------------------
export const RADIUS = PLAYER_RADIUS;                 // 0.35
export const HEIGHT = PLAYER_HEIGHT;                 // 1.8
export const EYE = PLAYER_EYE;                       // 1.65

// ---- movement (GDD 5; game-feel 1.2 and 9) ------------------------------------------------------------
export const RUN_SPEED = 5.0;
export const SPRINT_SPEED = 6.75;                    // forward only; firing cancels it
export const BACK_SCALE = 0.9;
export const STRAFE_SCALE = 1.0;
export const GROUND_ACCEL = 12;                      // Quake-style: accel * dt * wishSpeed per tick
export const GROUND_FRICTION = 8;
export const STOP_SPEED = 2.0;
export const AIR_ACCEL = 12;                         // m/s^2 toward the wish direction, no air friction
/**
 * GDD 5 caps the horizontal air speed at the take-off speed. TUNED (docs/requests/code-player.md, D1): the cap is never
 * below this, because a jump from rest (pressed against the ledge she wants to mount: take-off speed 0) could not be
 * steered at all and no ledge could be mounted from a standstill. 2.5 m/s cannot gain speed over a run (5.0).
 */
export const AIR_MIN_CAP = 2.5;
export const GRAVITY = 24;
export const JUMP_VELOCITY = 6.93;
/** v^2 / 2g: 1.0 m. Also the highest landing the controller accepts above the take-off ground (GDD 5 "Jump reach"). */
export const JUMP_APEX = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
export const COYOTE_TIME = 0.10;
export const JUMP_BUFFER = 0.10;
export const SUB_STEPS = 3;                          // speed * dt / subSteps < radius up to 60 m/s (ARCHITECTURE 6)
export const STEP_UP = 0.35;
export const MAX_SLOPE_DEG = 45;
export const WALKABLE_COS = Math.cos(MAX_SLOPE_DEG * DEG) - 1e-3;
/** a horizontal speed no input produces: the sub-step count is raised above it so nothing tunnels (tests force 60 m/s) */
export const MAX_SUBSTEP_TRAVEL = RADIUS * 0.9;

// ---- footsteps and camera motion (GDD 5; game-feel 1.4) -----------------------------------------------
export const STRIDE_RUN = 1.9;
export const STRIDE_SPRINT = 2.3;
export const BOB_VERTICAL = 0.028;
export const BOB_LATERAL = 0.014;
export const STRAFE_ROLL_DEG = 1.0;
export const SPRINT_FOV_DEG = 4;
export const SPRINT_FOV_IN = 0.2;
export const SPRINT_FOV_OUT = 0.3;
export const STEP_SMOOTH_RATE = 18;                  // eye Y eases to the body at 18 / s after a step
export const LAND_DIP_PER_MPS = 0.012;
export const LAND_DIP_MAX = 0.12;
export const LAND_DIP_SECONDS = 0.22;
/** how fast the bob amplitude follows "walking on the ground" (per second); not in the GDD: a fade, not a feature */
export const BOB_FADE_RATE = 9;

// ---- look (GDD 5) -------------------------------------------------------------------------------------
export const LOOK_DEG_PER_COUNT = 0.07;
export const MAX_PITCH_DEG = 89;
export const FOV_MIN = 50;
export const FOV_MAX = 80;

// ---- health (GDD 5, 15) -------------------------------------------------------------------------------
export const MAX_HEALTH = 100;
/** upper bounds of the three segments, 34 / 33 / 33 from the bottom */
export const SEGMENT_TOPS: readonly [number, number, number] = [34, 67, 100];
export const REGEN_DELAY = 4;
export const REGEN_RATE = 12;
export const ABSORB_BELOW = 20;                      // the last 20 HP ...
export const ABSORB_SCALE = 0.75;                    // ... absorb x0.75
export const GRACE_ABOVE = 25;                       // a fatal hit from above 25 HP ...
export const GRACE_SECONDS = 0.75;                   // ... leaves 1 HP and this much immunity
export const MAX_SINGLE_HIT = 38;
export const DAMAGE_TAKEN: Readonly<Record<Difficulty, number>> = { easy: 0.6, normal: 1.0, hard: 1.4 };
/** damage trauma: +0.3 at 10 HP to +0.6 at 38 HP, linear */
export const TRAUMA_DAMAGE_MIN = 0.3;
export const TRAUMA_DAMAGE_MAX = 0.6;
export const TRAUMA_DAMAGE_LOW_HP = 10;
export const RESPAWN_MIN_HEALTH = 60;                // GDD 5 "Respawn"; ARCHITECTURE 10.1
export const RESPAWN_MIN_RESERVE = 18;
export const REFILL_FLOOR = 18;                      // GDD 6.5: the refill box tops the reserve up to 18
export const PICKUP_ROUNDS: Readonly<Record<PickupKind, number>> = { pk_rounds_6: 6, pk_rounds_12: 12, pk_canteen: 0 };

// ---- the Assize six (GDD 6.2 to 6.6) ------------------------------------------------------------------
const LEAD: AmmoDef = {
  type: 'lead_round', range: 200, damage: 100, weakPointMultiplier: 2, plateMultiplier: 0.25, pierces: false, cadence: 0.48,
  cameraKickPitchDeg: 2.5, cameraKickYawDeg: 0.4, cameraKickPeak: 0.055, cameraKickRecover: 0.32,
  viewKickBack: 0.08, viewKickRiseDeg: 20, viewKickSeconds: 0.3,
  fovPunchDeg: 1.2, fovPunchSeconds: 0.08, trauma: 0.25,
};
const LINE: AmmoDef = { ...LEAD, type: 'line_round', range: 60, damage: 300, weakPointMultiplier: 1, plateMultiplier: 1, pierces: true };
const KEPT: AmmoDef = {
  type: 'kept_round', range: 0, damage: 0, weakPointMultiplier: 1, plateMultiplier: 1, pierces: false, cadence: 1.2,
  cameraKickPitchDeg: 3.5, cameraKickYawDeg: 0, cameraKickPeak: 0.08, cameraKickRecover: 0.6,
  viewKickBack: 0.11, viewKickRiseDeg: 26, viewKickSeconds: 0.6,
  fovPunchDeg: 0, fovPunchSeconds: 0, trauma: 0.15,
};
export const WEAPON: WeaponDef = {
  id: 'assize_six', asset: 'weapon_revolver', cylinder: 6,
  reserveCap: 36, startReserve: 24, lineRoundCap: 2,
  fireBuffer: 0.15, bloomPerShotDeg: 1.5, bloomDecaySeconds: 0.35,
  reloadOpen: 0.35, reloadPerRound: 0.30, reloadClose: 0.30, reloadFastClose: 0.20,
  loadLine: 0.55, unloadLine: 0.35, loadKept: 1.8, unloadKept: 0.3,
  ammo: { lead_round: LEAD, line_round: LINE, kept_round: KEPT },
};
/**
 * Polish round 4 (combat critic): a pull on an empty cylinder is a beat of its own. The hammer falls (`dry_fire` clip,
 * the click) and the gun stays so for this long before the reload opens by itself; R starts it at once.
 */
export const DRY_BEAT = 7 * FIXED_DT;
/**
 * The flash is asked for this many times farther from the eye than the muzzle, on the eye-to-muzzle line: the same
 * place on the screen and 1 / FLASH_PUSH the size (0.625: 37 % smaller), so its core stays clear of the crosshair.
 */
export const FLASH_PUSH = 1.6;
export const FIRE_KEPT_SECONDS = 1.2;                // GDD 6.9 `fire_kept`
export const TAKE_ROUND_SECONDS = 1.0;               // GDD 6.9 `take_round`
export const DRAW_SECONDS = 0.5;                     // GDD 6.9 `draw`
/** the round is pushed home on frame 5 of `reload_round` (art-weapons clip table): the seat click and the HUD dot */
export const RELOAD_SEAT_AT = 10 * FIXED_DT;
/** line-round bodies react 40 ms apart: entry i at tick offset round(i * 2.4) (ARCHITECTURE 3.6) */
export const LINE_TICKS_PER_HIT = 2.4;
/** when `kept_loop` leaves the cuff inside `load_kept` (art-weapons: "stage the hand-off at 0.9 s") and returns in the other clips */
export const KEPT_LOOP_HIDE_AT = 0.9;
export const KEPT_LOOP_SHOW_AT_TAKE = 0.8;
/** cross-fade between view-model clips (order 4.7: at most 60 ms). Out of `fire` and `reload_round` it is a cut: see viewModel.ts */
export const CLIP_FADE = 0.05;
/**
 * The art bible puts the view-model kick (0.08 m back, 20 degree rise) INSIDE the `fire` / `fire_kept` clips of the
 * final gun (art-weapons clip table). While this is true the procedural kick is added only when the loaded `fire`
 * clip does not move the `root` or `gun` bone (8 degrees or 3 cm): never both. The placeholder's `fire` swings its root
 * 21 degrees, so it gets none either. false: the procedural kick always. Re-check when art-weapons lands.
 */
export const VIEW_KICK_IN_FINAL_CLIPS = true;
/**
 * The FALLBACK ring order, used only when the `fire` clip does not turn the cylinder bone (the placeholder): +1 means
 * one notch brings `round_2` under the hammer after `round_1`. The view-model reads the real direction from the turn in
 * the `fire` clip (the final gun: -1, `round_6` follows `round_1`; viewModel.ts detectTurn).
 */
export const CYLINDER_BONE_STEP = 1;
/** view-model sway against look input: degrees of lag per degree-per-tick of look, clamped (order 4.7: 2 to 3 degrees) */
export const SWAY_MAX_DEG = 2.5;
export const SWAY_RATE = 14;
/** weapon bob is 2.5 x the camera's, the landing dip 2 x (game-feel 1.4) */
/**
 * Where the held gun stands at rest (lead ruling R6, polish round 3): metres added to the pose the asset is authored
 * in (camera space: +X right, +Y up, -Z forward) and a turn about the grip in degrees (pitch lifts the muzzle, yaw
 * turns it left, roll leans the top to the left). Tuned by measurement: tests/player/place.test.mjs.
 */
// Polish round 4 (look team gun): turned 3.5 degrees further and rolled 10 degrees the other way, 4 cm farther from the
// eye: more of the left side (cylinder flutes, trigger guard) and less of the top strap and the back; the muzzle stands
// about 100 px right and 70 px below the crosshair at 720p (it was 52 / 50), the rear and the gun hand are in frame.
export const VIEW_PLACE = { x: 0, y: 0.025, z: 0.026, pitchDeg: -7, yawDeg: 7.5, rollDeg: -13 } as const;   // look team gun, polish round 5: raised 3.5 % of the frame height so the thumb, the gloved fingers and the walnut grip are in the frame (was 0.004, 0.013, 0.023, -7, 8.5, -14)
/**
 * Where the whole view-model stands during a clip in which the hands work on the gun (reload, the line round, the kept
 * round): the clips are staged for the authored pose and a 52 degree view; in the 40 degree view-model pass they are
 * framed by this (same axes as VIEW_PLACE) so the gun sits whole in the right half and the gloves leave by the bottom edge.
 */
export const VIEW_PLACE_HANDLING = { x: -0.02, y: -0.07, z: -0.03, pitchDeg: 0, yawDeg: 0, rollDeg: 0 } as const;
/** seconds over which the placement leaves for a clip in which the hands work on the gun, and returns (viewModel.ts isHandling) */
export const VIEW_PLACE_BLEND = 0.15;
export const VIEW_BOB_SCALE = 2.5;
export const VIEW_DIP_SCALE = 2;

/** seconds of each timed weapon phase; `ready` has none, `reload_round` restarts per round */
export const PHASE_SECONDS: Readonly<Record<WeaponPhase, number>> = {
  ready: 0,
  firing: LEAD.cadence,
  reload_open: WEAPON.reloadOpen,
  reload_round: WEAPON.reloadPerRound,
  reload_close: WEAPON.reloadClose,              // `reload_fast_close` is this phase with WEAPON.reloadFastClose
  loading_line: WEAPON.loadLine,
  unloading_line: WEAPON.unloadLine,
  loading_kept: WEAPON.loadKept,
  unloading_kept: WEAPON.unloadKept,
  firing_kept: FIRE_KEPT_SECONDS,
  taking_round: TAKE_ROUND_SECONDS,
  drawing: DRAW_SECONDS,
};
/** timers compare with this slack, so 0.35 s is 21 ticks and never 22 */
export const TIME_EPS = 1e-6;
