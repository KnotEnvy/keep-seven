// VfxApi (code-render 4.5): every pooled effect. Nothing here allocates after construction.
//
//   particles   one GPU batch (particles.ts), the recipes of every VfxId below
//   quads       blobs, rings, cards, halos, lines: refilled into one batch each frame (quads.ts)
//   decals      48 alpha-tested quads (decals.ts)
//   flash       the muzzle sprite, drawn in the view-model pass
//   pulse       the two radial slots of the world shader: slot 0 the muzzle, slot 1 the ring at the seventh
import * as THREE from 'three';
import type { CardKind, FlashKind, FxHandle, GameContext, LineKind, RingKind, SurfaceType, VfxApi, VfxId } from '../../core/contracts.ts';
import { HUE, PULSE_CAP } from '../shared.ts';
import type { SharedUniforms, Uniform } from '../shared.ts';
import { CELL, FX_RECTS } from './atlas.ts';
import { AmbientPoints, MAX_BLADES } from './ambient.ts';
import { DecalPool } from './decals.ts';
import { P_ADD, P_LIT, P_STRETCH, ParticleBatch, spec } from './particles.ts';
import type { ParticleSpec } from './particles.ts';
import {
  FLAG_ADD, FLAG_PX, MODE_BEAM, MODE_BILLBOARD, MODE_CARD, MODE_PLANE, QuadBatch,
  SHAPE_ATLAS, SHAPE_BLADE, SHAPE_BLOB, SHAPE_FIRE, SHAPE_LANCE, SHAPE_LINE, SHAPE_MOUTH, SHAPE_PATCH, SHAPE_RING, SHAPE_SOFT,
} from './quads.ts';

// ---- colours (linear) ---------------------------------------------------------------------------------------------
const lin = (hex: number): THREE.Color => new THREE.Color(hex);
const DUST_SAND = lin(0xddb98c), DUST_ADOBE = lin(0xddc3a4), DUST_STONE = lin(0x9c948a), DUST_WOOD = lin(0x927560), CLAY = lin(0xa9623f);
const LINEN = lin(0xd8cdb4), ENAMEL = lin(0xe6ebe2), CHIP_STONE = lin(0x6f6a64), CHIP_ADOBE = lin(0xb98a62), GREY = lin(0x8a8a92), GLASS = lin(0x9fb0a4);
const SPARK = lin(0xffe9b8), SPARK_END = lin(0xff9433), SPARK_GREY = lin(0xc8ccd0), STEAM = lin(0xd9d6cf);

function col2(s: Partial<ParticleSpec>, a: THREE.Color, b: THREE.Color = a): Partial<ParticleSpec> {
  s.r0 = a.r; s.g0 = a.g; s.b0 = a.b; s.r1 = b.r; s.g1 = b.g; s.b1 = b.b;
  return s;
}
/** [spec, count on Low, count on High] */
type Part = readonly [ParticleSpec, number, number];

const dust = (c: THREE.Color, p: Partial<ParticleSpec> = {}): ParticleSpec => spec({
  cell: CELL.dust_a, flags: P_LIT, speedMin: 0.6, speedMax: 1.8, spread: 0.9, vy: 0.25, gravity: 0.6, drag: 3.0, lifeMin: 0.4, lifeMax: 0.6,
  size0: 0.10, size1: 0.42, alpha: 0.55, spin: 0.8, fadeIn: 0.08, minPx: 7, ...col2({}, c), ...p,
});
const chips = (c: THREE.Color, p: Partial<ParticleSpec> = {}): ParticleSpec => spec({
  cell: CELL.shard, flags: P_LIT, speedMin: 1.5, speedMax: 3.5, spread: 0.8, gravity: 9.8, drag: 0.4, lifeMin: 0.35, lifeMax: 0.6,
  size0: 0.035, size1: 0.03, alpha: 1, spin: 9, fadeIn: 0.02, minPx: 3, ...col2({}, c), ...p,
});
const sparks = (a: THREE.Color, b: THREE.Color, p: Partial<ParticleSpec> = {}): ParticleSpec => spec({
  cell: CELL.spark, flags: P_ADD | P_STRETCH, speedMin: 3, speedMax: 7, spread: 0.9, gravity: 9.8, drag: 1.2, lifeMin: 0.18, lifeMax: 0.25,
  size0: 0.03, size1: 0.012, alpha: 1.2, fadeIn: 0.01, minPx: 5, ...col2({}, a, b), ...p,
});
const dot = (c: THREE.Color, size: number, life: number): ParticleSpec => spec({
  cell: CELL.soft_dot, flags: P_ADD, speedMin: 0, speedMax: 0, spread: 0, lifeMin: life, lifeMax: life, size0: size, size1: size * 1.3, alpha: 1.1, fadeIn: 0.01, minPx: 6, ...col2({}, c),
});
/**
 * The hit dot: a short additive point on every impact, never under 8 px, so a round that lands is answered at any range
 * ("silence after a shot is a bug"). Flame-white on the world, linen on cloth, enamel on the machines: never red.
 */
const hitDot = (c: THREE.Color): Part => [spec({
  cell: CELL.soft_dot, flags: P_ADD, speedMin: 0, speedMax: 0, spread: 0, lifeMin: 0.075, lifeMax: 0.075, size0: 0.11, size1: 0.16, alpha: 2.4, fadeIn: 0.01, minPx: 8, ...col2({}, c),
}), 1, 1];

const RECIPES: Readonly<Record<VfxId, readonly Part[]>> = {
  impact_sand: [[dust(DUST_SAND), 6, 10], [dust(DUST_SAND, { speedMin: 0.1, speedMax: 0.3, size0: 0.18, size1: 0.6, alpha: 0.4, lifeMin: 0.5, lifeMax: 0.5 }), 1, 1], hitDot(HUE.flameCore)],
  impact_wood: [[spec({ cell: CELL.splinter, flags: P_LIT, speedMin: 2, speedMax: 4.5, spread: 0.7, gravity: 9.8, drag: 0.6, lifeMin: 0.35, lifeMax: 0.55, size0: 0.07, size1: 0.06, spin: 12, minPx: 3, ...col2({}, DUST_WOOD) }), 4, 6], [dust(DUST_WOOD, { alpha: 0.4 }), 1, 2], hitDot(HUE.flameCore)],
  impact_adobe: [[dust(DUST_ADOBE), 5, 7], [chips(CHIP_ADOBE), 2, 3], hitDot(HUE.flameCore)],
  impact_metal: [[sparks(SPARK, SPARK_END), 6, 10], hitDot(HUE.flameCore)],
  impact_ceramic: [[chips(ENAMEL, { size0: 0.045, size1: 0.04 }), 5, 7], [sparks(SPARK, SPARK_END, { speedMin: 2, speedMax: 4 }), 2, 3], hitDot(ENAMEL)],
  impact_stone: [[dust(DUST_STONE), 4, 5], [chips(CHIP_STONE), 2, 3], hitDot(HUE.flameCore)],
  // cloth: ground-coloured dust and three linen threads. No red, ever.
  impact_cloth: [[dust(DUST_SAND, { speedMin: 0.4, speedMax: 1.2, alpha: 0.45 }), 5, 5], [spec({ cell: CELL.splinter, flags: P_LIT, speedMin: 1, speedMax: 2.2, spread: 1.0, gravity: 3, drag: 2.5, lifeMin: 0.5, lifeMax: 0.8, size0: 0.06, size1: 0.05, spin: 5, minPx: 3, ...col2({}, LINEN) }), 3, 3], hitDot(LINEN)],
  powder_smoke: [[spec({ cell: CELL.smoke_a, flags: P_LIT, speedMin: 0.3, speedMax: 0.9, spread: 0.5, vx: 0.18, vy: 0.45, drag: 2.2, lifeMin: 0.7, lifeMax: 0.7, size0: 0.08, size1: 0.45, alpha: 0.25, spin: 0.6, fadeIn: 0.1, ...col2({}, HUE.smoke) }), 4, 6]],
  knot_burst: [
    [spec({ cell: CELL.mote_cluster, flags: P_ADD, speedMin: 1.6, speedMax: 2.6, spread: Math.PI, gravity: 4.5, drag: 3.2, lifeMin: 0.45, lifeMax: 0.55, size0: 0.07, size1: 0.03, alpha: 1, spin: 3, ...col2({}, HUE.violet, GREY) }), 14, 22],
    [dot(HUE.white, 0.32, 0.06), 1, 1],
    [dust(lin(0xb9a8c6), { cell: CELL.dust_a, speedMin: 0.5, speedMax: 0.9, spread: 1.5, size0: 0.12, size1: 0.5, alpha: 0.35, vy: 0 }), 1, 1],
  ],
  bider_freed: [[spec({ cell: CELL.mote_cluster, flags: P_ADD, speedMin: 0.05, speedMax: 0.2, spread: 1.2, vy: 0.42, drag: 0.4, lifeMin: 1.3, lifeMax: 1.5, size0: 0.05, size1: 0.02, alpha: 0.7, scatter: 0.25, spin: 0.6, fadeIn: 0.2, ...col2({}, lin(0xcfc6dc), GREY) }), 6, 6]],
  bider_felled: [[dust(DUST_SAND, { speedMin: 0.5, speedMax: 1.3, spread: 1.4, vy: 0.1, size0: 0.14, size1: 0.6, lifeMin: 0.6, lifeMax: 0.9, scatter: 0.4 }), 6, 6]],
  transit_death: [[chips(GLASS, { spread: 1.2, size0: 0.04, size1: 0.035 }), 6, 6], [dot(HUE.white, 0.4, 0.07), 1, 1]],
  vent_open: [[dot(HUE.violet, 0.55, 0.5), 1, 1], [spec({ cell: CELL.mote_cluster, flags: P_ADD, speedMin: 0.15, speedMax: 0.35, spread: 0.8, vy: 0.1, drag: 0.5, lifeMin: 0.9, lifeMax: 1.2, size0: 0.05, size1: 0.02, alpha: 0.8, fadeIn: 0.15, ...col2({}, HUE.violet, HUE.violetCore) }), 4, 4]],
  stake_stick: [[sparks(SPARK, SPARK_END, { speedMin: 2, speedMax: 4 }), 4, 4]],
  stake_burst: [[sparks(SPARK, SPARK_END, { spread: Math.PI, speedMin: 2, speedMax: 5 }), 8, 10], [dot(SPARK, 0.25, 0.06), 1, 1]],
  slam_dust: [[dust(DUST_STONE, { speedMin: 3.0, speedMax: 4.5, spread: 1.55, vy: 0.3, drag: 2.4, size0: 0.25, size1: 0.9, lifeMin: 0.7, lifeMax: 1.0, alpha: 0.5 }), 12, 12], [chips(CHIP_STONE, { speedMin: 3, speedMax: 6, spread: 1.0, size0: 0.05, size1: 0.045 }), 8, 8]],
  charge_sparks: [[sparks(SPARK, SPARK_END, { speedMin: 2, speedMax: 5, spread: 1.1, lifeMin: 0.2, lifeMax: 0.35 }), 8, 8], [dust(DUST_STONE, { speedMin: 0.5, speedMax: 1.2, spread: 1.3 }), 6, 6]],
  plate_spark: [[sparks(SPARK_GREY, GREY), 6, 6], hitDot(SPARK_GREY)],
  canister_burst: [[sparks(SPARK, SPARK_END, { spread: 1.5, speedMin: 4, speedMax: 9, lifeMin: 0.25, lifeMax: 0.4 }), 16, 16], [dust(DUST_STONE, { speedMin: 2.5, speedMax: 3.5, spread: 1.55, size0: 0.25, size1: 0.8, alpha: 0.45 }), 4, 4], [dot(HUE.white, 0.9, 0.07), 1, 1]],
  guard_shatter: [[chips(ENAMEL, { speedMin: 2.5, speedMax: 6, spread: 1.3, size0: 0.07, size1: 0.06, lifeMin: 0.6, lifeMax: 1.0, scatter: 1.2 }), 20, 20], [dust(DUST_STONE, { size0: 0.3, size1: 0.9, alpha: 0.4, scatter: 1.0 }), 2, 2]],
  jug_burst: [
    [chips(CLAY, { spread: 1.5, speedMin: 1.5, speedMax: 3.5, size0: 0.06, size1: 0.05 }), 8, 8],
    // the pour: sand falling for 1.2 s, then a small heap of dust where it lands
    [spec({ cell: CELL.sand_pour, flags: P_LIT, speedMin: 0, speedMax: 0.15, spread: Math.PI, vy: -0.6, gravity: 5, drag: 0.5, lifeMin: 1.0, lifeMax: 1.2, size0: 0.09, size1: 0.22, alpha: 0.7, fadeIn: 0.1, scatter: 0.08, ...col2({}, DUST_SAND) }), 3, 3],
    [dust(DUST_SAND, { speedMin: 0.3, speedMax: 0.9, spread: 1.4, size0: 0.12, size1: 0.5, alpha: 0.4 }), 1, 1],
  ],
  insulator_break: [[chips(ENAMEL, { spread: 1.3, size0: 0.04, size1: 0.035 }), 6, 6], [dot(HUE.white, 0.3, 0.06), 1, 1]],
  bottle_break: [[chips(GLASS, { spread: 1.3, speedMin: 1.5, speedMax: 4, size0: 0.035, size1: 0.03 }), 6, 6], [dust(DUST_SAND, { alpha: 0.25, size0: 0.08, size1: 0.3 }), 1, 1]],
  pickup_glint: [[spec({ cell: CELL.star4, flags: P_ADD, speedMin: 0, speedMax: 0, spread: 0, lifeMin: 0.06, lifeMax: 0.06, size0: 0.16, size1: 0.22, alpha: 1.2, fadeIn: 0.2, ...col2({}, HUE.flameCore) }), 1, 1]],
  lamp_answer: [[dot(HUE.aquaCore, 0.3, 0.15), 1, 1]],
  dust_short: [[dust(DUST_SAND, { speedMin: 0.6, speedMax: 1.6, size0: 0.2, size1: 0.9, lifeMin: 0.7, lifeMax: 1.0 }), 4, 4]],
  embers: [[spec({ cell: CELL.soft_dot, flags: P_ADD, speedMin: 0.02, speedMax: 0.08, spread: 1.0, vy: 0.3, drag: 0.2, lifeMin: 1.8, lifeMax: 2.0, size0: 0.035, size1: 0.012, alpha: 1, scatter: 0.3, fadeIn: 0.1, ...col2({}, HUE.flameCore, HUE.flame) }), 6, 6]],
  steam: [[spec({ cell: CELL.smoke_b, flags: P_LIT, speedMin: 0.02, speedMax: 0.08, spread: 0.6, vy: 0.28, drag: 0.3, lifeMin: 1.8, lifeMax: 2.0, size0: 0.06, size1: 0.3, alpha: 0.09, scatter: 0.05, spin: 0.5, fadeIn: 0.25, ...col2({}, STEAM) }), 3, 3]],
  lance_sparks: [[sparks(SPARK, SPARK_END, { spread: 1.2 }), 6, 6]],
};

/**
 * How far a burst may grow with distance: its size and speed are multiplied by clamp(distance / 8 m, 1, this), so what
 * answers a shot holds the screen size it has at 8 m out to 32 m (the gallery asks for shots of 40 to 70 m; beyond 32 m
 * the sprites' pixel floors carry it). Effects that are not the answer to a shot keep their true size.
 */
const FAR_SCALE: Readonly<Partial<Record<VfxId, number>>> = {
  impact_sand: 4, impact_wood: 4, impact_adobe: 4, impact_metal: 4, impact_ceramic: 4, impact_stone: 4, impact_cloth: 4, plate_spark: 4,
  knot_burst: 3, transit_death: 3, stake_burst: 3, jug_burst: 3, insulator_break: 3, bottle_break: 3, dust_short: 3, lamp_answer: 3,
};
const FAR_NEAR = 8;
/** the alpha-blended (smoke, dust, chips) share of the screen particles may cover */
const SMOKE_CAP = 0.5;
/** past its cap a kind of particle is not emitted at all, except one shrunk sprite per burst up to this much over it */
const TOKEN_OVER = 1.15;
/** a one-shot that no frame has shown yet outlives its own life by at most this (a dip to 20 fps must not eat the flash) */
const SHOW_GRACE = 0.25;
/** the depth the last fire is drawn at when it is farther away than this (see fillCards) */
const FIRE_DEPTH = 60;
/** the last fire's flame is never drawn under this many pixels tall. Pass i2 (both story reviewers; the line is "Out on
 * the flat, one small fire. It was not moving."): 30 (a flame of about 18 px in its card), a point of light with a bloom and a hairline of smoke, where pass
 * i1's 92 px flame with its heavy column stood as tall as the line pylon and read as a bonfire at the edge of town */
const FIRE_PX = 38;      // exterior look, pass i3: 30 -> 38 (the visual reviewer: "its fire is small"; still "one small fire", a twentieth of the frame's height)
/** a Transit's aim (GDD: 0.9 s): its thread brightens and thickens over this long */
const THREAD_AIM_SECONDS = 0.9;
/**
 * The standing line is BORN at the seventh (look-dev, polish round 3; lead ruling R7: "the seventh shot must be a spectacle
 * a player would screenshot"). It appeared at its permanent 4 px in the frame of the shot, behind a flat aqua flood of the
 * muzzle pulse: nothing in the frame said that the bore had been proven. For STAND_FLARE seconds it is a column of light
 * (five times its core, nine times its halo, falling off fast) with a white heart where it leaves the bore's mouth; then
 * it is the constant 4 px line of ART_BIBLE 9.3 for the rest of the stage. Two additive quads, as that section budgets.
 */
const STAND_FLARE = 2.4, STAND_FLARE_TAU = 0.5;
/**
 * Underground look, pass i2 (visual reviewer: "the seventh shot is mostly a colour change ... short of a spectacle").
 * Inside the standing line's flare the bore ANSWERS: PROVE_RINGS ticked rings of aqua light leave the pit one after
 * another and climb the line to the vault (each PROVE_RING_LIFE seconds, PROVE_RING_GAP apart, easing out as it rises),
 * and PROVE_THREADS threads of light are drawn up the shaft's wall, one after another round the kerb, each with a bright
 * head. All of it is over at 2.35 s, inside STAND_FLARE: the four seconds of nothing that follow are untouched, no
 * particle is spawned, and Reduce Flashes shows none of it (standT0 is never set there). 16 additive quads at most.
 */
const PROVE_RINGS = 3, PROVE_RING_GAP = 0.3, PROVE_RING_LIFE = 1.5, PROVE_RING_R = 2.9;
const PROVE_THREADS = 8, PROVE_THREAD_GAP = 0.06, PROVE_THREAD_RISE = 1.0, PROVE_THREAD_LIFE = 1.8, PROVE_THREAD_R = 2.86;
/**
 * Underground look, pass i3 (visual reviewer: "from the kerb the spectacle is a flash, one thin ring, a few hairline
 * beams and the room swapping from violet to teal ... it reads as a lighting change"). The same budget (at most 18
 * additive quads for STAND_FLARE seconds, counted in fillProving's comment), spent on things that MOVE THROUGH THE ROOM:
 *   - the column HOLDS its white peak for PROVE_HOLD seconds before it falls (it was past half in a fifth of a second),
 *     and is half as thick again at the peak;
 *   - a SHOCK leaves the kerb across the floor, riding the shader's own front (ringRadius) to the walls: a bright
 *     ticked ring with a faint lit disc behind it, and a second, fainter, PROVE_SHOCK_GAP behind;
 *   - the kerb's ring of seams goes white for the hold (a crown of light on the notches, PROVE_CROWN_R) before it
 *     settles to the aqua the lamp set turns to;
 *   - the vault answers where the column meets the head: a soft bloom of light up there that falls with the flare;
 *   - three rising rings (four) and eight threads (twelve), each thread half as thick again.
 * The shader's front is PROVE_FRONT_WIDE metres wide while it crosses the kerb (1 m: four frames) and narrows to the
 * travelling edge of round 3 by the time it is on the open floor. The camera takes one knock (the render system's
 * trauma, PROVEN_TRAUMA; none under Reduce Motion). Nothing here spawns a particle or outlives STAND_FLARE.
 */
const PROVE_HOLD = 0.28, PROVE_SHOCK_GAP = 0.16, PROVE_SHOCK_FROM = 3.7, PROVE_SHOCK_TO = 15.2, PROVE_CROWN_R = 3.3, PROVE_FRONT_WIDE = 2.0;
/** the standing line's flare, 0..1, `age` seconds after the seventh: whole for PROVE_HOLD, then falling as round 3 set it */
function standFlare(age: number): number {
  if (age < PROVE_HOLD) return 1;
  const a = age - PROVE_HOLD;
  return Math.exp(-a / STAND_FLARE_TAU) * Math.max(0, 1 - a / (STAND_FLARE - PROVE_HOLD));
}

/** the ids, for tests and the sandbox grid */
export const VFX_IDS = Object.keys(RECIPES) as VfxId[];

// ---- lines ----------------------------------------------------------------------------------------------------------
interface LineStyle { pool: number; color: THREE.Color; core: number; total: number; halo: number; white: number; dash: number; head: number; life: number; hold: number; fade: number; streak: number }
const LINE_STYLE: Readonly<Record<LineKind, LineStyle>> = {
  tracer: { pool: 4, color: HUE.flameCore, core: 2, total: 7, halo: 0.35, white: 0.5, dash: 0, head: 0, life: 2 / 60, hold: 2 / 60, fade: 0, streak: 3 },
  // underground look, pass i1: streak 6 -> 0.7 (a 6 m line stood from the hit to the top of the frame; feedback.ts RICOCHET_M)
  ricochet: { pool: 4, color: HUE.flameCore, core: 2, total: 9, halo: 0.45, white: 0.5, dash: 0, head: 0, life: 2 / 60, hold: 2 / 60, fade: 0, streak: 0.7 },
  line_round: { pool: 4, color: HUE.aqua, core: 3, total: 13, halo: 0.35, white: 0.6, dash: 0, head: 0, life: 1.5, hold: 1.2, fade: 0.3, streak: 0 },
  // polish round 3 (combat critic: "at 18 m the 0.9 s aim tell is a faint dotted line a pixel or two wide"): a solid beam
  // with a white heart, 3 px growing to 5 over the aim (THREAD_AIM_SECONDS from the moment it is taken), a halo along it,
  // and a glow on the lens it comes from (fillQuads)
  sighting_thread: { pool: 6, color: HUE.flame, core: 3, total: 12, halo: 0.4, white: 0.55, dash: 0, head: 0, life: 0.9, hold: 0.9, fade: 0, streak: 0 },
  // polish round 2: 2 px of dashes read as a few specks at the far end of the arc. The warning is the shape that
  // carries a 30 damage sweep: 4 px with a white heart and a halo along its whole length, longer dashes.
  lance_thread: { pool: 2, color: HUE.flame, core: 4, total: 14, halo: 0.45, white: 0.6, dash: 0.45, head: 0, life: 1.2, hold: 1.2, fade: 0, streak: 0 },
  relight_thread: { pool: 6, color: HUE.violet, core: 2, total: 8, halo: 0.3, white: 0.2, dash: 0, head: 1, life: 1.0, hold: 1.0, fade: 0, streak: 0 },
  standing_line: { pool: 2, color: HUE.aqua, core: 4, total: 24, halo: 0.5, white: 1.0, dash: 0, head: 0, life: 1e9, hold: 1e9, fade: 0, streak: 0 },
  aqua_thread: { pool: 4, color: HUE.aqua, core: 2, total: 6, halo: 0.25, white: 0.2, dash: 0, head: 0, life: 1.0, hold: 0.7, fade: 0.3, streak: 0 },
};
const LINE_KINDS = Object.keys(LINE_STYLE) as LineKind[];
const KEPT_PULSE = HUE.aqua.clone().lerp(HUE.aquaCore, 0.55);

const CARD_POOL: Readonly<Record<CardKind, number>> = { sun_blade: MAX_BLADES, sun_patch: 3, lance: 1, mouth_glow: 6, aim_star: 6, halo: 16, last_fire: 1, dowser_glint: 1, sand_thread: 2 };
const CARD_KINDS = Object.keys(CARD_POOL) as CardKind[];
const RING_POOL: Readonly<Record<RingKind, number>> = { canister: 2, slam: 1 };
export const BLOB_POOL = 16;

/** A pooled persistent effect and its two alternating handles (a stale handle is a no-op until its turn comes again). */
class Slot {
  active = false; persistent = false; visible = true;
  ax = 0; ay = 0; az = 0; bx = 0; by = 0; bz = 0;
  level = 1; levelSet = false;
  t0 = 0; life = 0; hold = 0; fade = 0;
  radius = 0;
  gen = 0;
  /** written into the quad batch since it was taken / shown by a drawn frame since it was taken */
  written = false; shown = false;
  /**
   * Release pass p0: a streak that leaves the gun (lineFromMuzzle). While it lives its start follows the muzzle AS DRAWN
   * (rideLines); `qo` is where the fill wrote it into the quad batch this frame (-1: not written), `f` its age over its life.
   */
  rides = false; qo = -1; f = 0;
  readonly handles: [FxHandle, FxHandle];
  constructor(readonly kind: string, onRelease: (s: Slot) => void) {
    const make = (parity: number): FxHandle => ({
      setPosition: (x, y, z) => { if (this.active && (this.gen & 1) === parity) { this.ax = x; this.ay = y; this.az = z; } },
      setEnd: (x, y, z) => { if (this.active && (this.gen & 1) === parity) { this.bx = x; this.by = y; this.bz = z; } },
      setLevel: (level) => { if (this.active && (this.gen & 1) === parity) { this.level = level; this.levelSet = true; } },
      setVisible: (visible) => { if (this.active && (this.gen & 1) === parity) this.visible = visible; },
      release: () => { if (this.active && (this.gen & 1) === parity) onRelease(this); },
    });
    this.handles = [make(0), make(1)];
  }
  /** takes the slot; returns the handle of this acquisition */
  take(now: number, persistent: boolean): FxHandle {
    this.gen++;
    this.active = true; this.persistent = persistent; this.visible = true;
    this.level = 1; this.levelSet = false; this.t0 = now;
    this.written = false; this.shown = false;
    this.rides = false; this.qo = -1; this.f = 0;
    return this.handles[this.gen & 1] as FxHandle;
  }
}

const FLASH_VERT = 'uniform vec4 uRect; varying vec2 vUv; void main(){ vUv = uRect.xy + uv * uRect.zw; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }';
const FLASH_FRAG = /* glsl */`
uniform sampler2D uFx;
uniform vec4 uColor;
uniform float uInvExposure;
uniform float uMono;
varying vec2 vUv;
void main() {
	vec4 t = texture2D( uFx, vUv );
	// the atlas cells carry the powder flash's own flame tint; the kept round's flash is the one aqua-white flash of the
	// game (polish round 3: orange streaks showed inside it), so it takes the cell's brightness only
	t.rgb = mix( t.rgb, vec3( max( t.r, max( t.g, t.b ) ) ), uMono );
	gl_FragColor = vec4( t.rgb * uColor.rgb * ( uColor.a * uInvExposure ), 0.0 );
	#include <colorspace_fragment>
}
`;

export interface VfxHost {
  /** the mood's pulse scale (35 % outdoors by day) */
  pulseScale(): number;
  /** wrong_fade reached 1 behind the ring: the mood becomes L5p over `seconds` (pass i3: and the camera takes one knock) */
  proven(seconds: number): void;
  /** particle counts: the High column of ART_BIBLE 9.2 (features.particleScale at 1), else the Low one */
  high(): boolean;
  additiveCap(): number;
  bladeCards(): number;
}

export class Vfx implements VfxApi {
  readonly particles: ParticleBatch;
  readonly quads: QuadBatch;
  readonly decals: DecalPool;
  readonly ambient: AmbientPoints;
  readonly flashMesh: THREE.Mesh;
  readonly fx: Uniform<THREE.Texture | null> = { value: null };
  readonly invExposure: Uniform<number> = { value: 1 };
  private readonly lines: Record<LineKind, Slot[]>;
  private readonly cards: Record<CardKind, Slot[]>;
  private readonly rings: Record<RingKind, Slot[]>;
  private readonly blobs: Slot[] = [];
  private readonly allSlots: Slot[] = [];
  // pulse slots
  private readonly pulseT0 = [0, 0];
  private readonly pulseLife = [0, 0];
  private readonly pulseR = [0, 0, 0, 0, 0, 0];
  private readonly pulseRadius = [0, 0];
  // the flash sprite
  private flashT0 = -1; private flashLife = 0; private flashSize = 0.35; private flashRoll = 0;
  /** a drawn frame has shown the current flash */
  private flashShown = true;
  /** how far from the eye the current flash was asked for: kept while it rides the drawn muzzle (rideMuzzle) */
  private flashDist = 0;
  private readonly flashColor: Uniform<THREE.Vector4> = { value: new THREE.Vector4(1, 1, 1, 0) };
  private readonly flashRect: Uniform<THREE.Vector4> = { value: new THREE.Vector4() };
  private readonly flashMono: Uniform<number> = { value: 0 };
  // the ring at the seventh
  private ringT0 = -1;
  private ringReduced = false;
  private ringY = 0;
  /** the chamber's floor under the seventh's centre (the event carries the kerb's top, 1.2 m up: see provingRing) */
  private proveFloor = 0;
  private standing: FxHandle | null = null;
  /** when the standing line was born by the seventh (never for a restored proven bore, or under Reduce Flashes) */
  private standT0 = -1e9;
  /** no particle spawns before this simTime (the four seconds of nothing) */
  private quietUntil = -1;
  /** leaky estimates of screen coverage by additive and by blended particles */
  additiveLoad = 0;
  smokeLoad = 0;
  /** bursts asked for / drawn / refused by the quiet, since boot */
  readonly counts = { bursts: 0, quiet: 0, capped: 0, dropped: 0, lines: 0, rings: 0, flashes: 0, flashRides: 0, lineRides: 0, pulses: 0, decals: 0, provingRings: 0, provingIgnored: 0 };
  reduceFlashes = false;
  private readonly rng;
  private readonly cam = new THREE.Vector3();

  constructor(private readonly ctx: GameContext, private readonly shared: SharedUniforms, private readonly host: VfxHost) {
    this.rng = ctx.rng.fork('render.vfx');
    this.quads = new QuadBatch(this.fx, shared.uTime, this.invExposure);
    this.particles = new ParticleBatch(this.fx, shared.uTime, this.invExposure, this.quads.viewport, this.rng);
    this.particles.now = () => this.ctx.clock.simTime;
    this.decals = new DecalPool(this.fx, shared);
    this.ambient = new AmbientPoints(shared.uTime);
    const release = (s: Slot): void => { s.active = false; };
    const pool = (kind: string, n: number): Slot[] => {
      const out: Slot[] = [];
      for (let i = 0; i < n; i++) { const s = new Slot(kind, release); out.push(s); this.allSlots.push(s); }
      return out;
    };
    const lines = {} as Record<LineKind, Slot[]>;
    for (const k of LINE_KINDS) lines[k] = pool(k, LINE_STYLE[k].pool);
    this.lines = lines;
    const cards = {} as Record<CardKind, Slot[]>;
    for (const k of CARD_KINDS) cards[k] = pool(k, CARD_POOL[k]);
    this.cards = cards;
    this.rings = { canister: pool('canister', RING_POOL.canister), slam: pool('slam', RING_POOL.slam) };
    this.blobs = pool('blob', BLOB_POOL);
    const flashMaterial = new THREE.ShaderMaterial({
      name: 'keep_flash', uniforms: { uFx: this.fx, uColor: this.flashColor, uRect: this.flashRect, uInvExposure: this.invExposure, uMono: this.flashMono },
      vertexShader: FLASH_VERT, fragmentShader: FLASH_FRAG, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide,
    });
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMaterial);
    this.flashMesh.name = 'keep_fx_flash';
    this.flashMesh.frustumCulled = false;
    this.flashMesh.visible = false;
  }

  /** the atlas became active (or was re-created) */
  setAtlas(texture: THREE.Texture | null): void { this.fx.value = texture; }

  /**
   * The time an effect is STAMPED with: the simulation's, at the tick that asked for it. (Round 1 stamped with the
   * shader time of the last drawn frame. Whenever ticks ran without a frame between them, as in every scripted run and
   * at a low frame rate, an effect was born in the past: the Tamper's slam ring, asked for 3 s after the last frame,
   * was already over when the next frame came, and "nothing is drawn on the lift-hall floor".)
   */
  private now(): number { return this.ctx.clock.simTime; }
  /** the time a frame is DRAWN at (the shaders' uTime: the simulation's, interpolated) */
  private drawNow(): number { return this.shared.uTime.value; }

  // ---- bursts -------------------------------------------------------------------------------------------------------
  burst(id: VfxId, x: number, y: number, z: number, nx: number, ny: number, nz: number, scale = 1): void {
    const parts = RECIPES[id];
    if (!parts) return;
    this.counts.bursts++;
    if (this.now() < this.quietUntil) { this.counts.quiet++; return; }
    const high = this.host.high();
    const cam = this.ctx.scene.camera.position;
    const dist = Math.max(0.6, Math.hypot(x - cam.x, y - cam.y, z - cam.z));
    // what answers a shot keeps its screen size with distance
    const far = FAR_SCALE[id];
    if (far !== undefined && dist > FAR_NEAR) scale *= Math.min(far, dist / FAR_NEAR);
    const addCap = this.host.additiveCap();
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p] as Part, s = part[0];
      const n = high ? part[2] : part[1];
      const add = (s.flags & P_ADD) !== 0;
      // screen share of ONE sprite at its largest: (size / distance)^2 at a 1.2 focal length, a quarter of it covered
      const size = Math.max(s.size0, s.size1) * scale * ((s.flags & P_STRETCH) !== 0 ? 2 : 1);
      const per = (size * 1.2 / dist) * (size * 1.2 / dist) * 0.25;
      const cap = add ? addCap : SMOKE_CAP, load = add ? this.additiveLoad : this.smokeLoad;
      // the overdraw cap: sprites that would go over it are NOT emitted (fill cost is what the cap is for)
      let count = n, shrink = 1;
      if (load + per * n > cap) {
        this.counts.capped++;
        count = Math.floor((cap - load) / per);
        if (count < 1) {
          // never silent: one shrunk sprite of the burst's first part, while the load is only a little over
          if (p > 0 || load >= cap * TOKEN_OVER) { this.counts.dropped++; continue; }
          count = 1;
          shrink = Math.min(1, Math.sqrt(cap * 0.01 / per));
        }
      }
      const used = per * count * shrink * shrink;
      if (add) this.additiveLoad = load + used; else this.smokeLoad = load + used;
      this.particles.emit(s, count, x, y, z, nx, ny, nz, scale * shrink, 1);
    }
  }

  /** One sprite of an effect's first part (the ambient emitters: an ember, a wisp of steam). */
  trickle(id: VfxId, x: number, y: number, z: number): void {
    const parts = RECIPES[id];
    if (!parts || this.now() < this.quietUntil) return;
    this.particles.emit((parts[0] as Part)[0], 1, x, y, z, 0, 1, 0, 1, 1);
  }

  decal(surface: SurfaceType, x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    this.counts.decals++;
    this.decals.add(surface, x, y, z, nx, ny, nz, surface === 'adobe' || surface === 'stone' ? 0.16 : 0.12, this.rng.next() * 6.2831853);
  }

  // ---- lines --------------------------------------------------------------------------------------------------------
  line(kind: LineKind, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const pool = this.lines[kind], style = LINE_STYLE[kind];
    if (!pool) return;
    this.counts.lines++;
    // a free slot, else the oldest one-shot of the kind
    let slot: Slot | null = null;
    for (let i = 0; i < pool.length; i++) { const s = pool[i] as Slot; if (!s.active) { slot = s; break; } }
    if (!slot) for (let i = 0; i < pool.length; i++) { const s = pool[i] as Slot; if (!s.persistent && (!slot || s.t0 < slot.t0)) slot = s; }
    if (!slot) return;
    slot.take(this.now(), false);
    slot.ax = ax; slot.ay = ay; slot.az = az; slot.bx = bx; slot.by = by; slot.bz = bz;
    slot.life = style.life; slot.hold = style.hold; slot.fade = style.fade;
    this.lastLine = slot;
  }
  /**
   * A one-shot streak whose start is the revolver's muzzle (the tracer of a lead round). As `line`, and while it lives
   * its start is moved each drawn frame to the muzzle as that frame draws it (rideLines): the shot's own point is the
   * muzzle before the kick, 70 px under the risen barrel on the first drawn frame at 540p.
   */
  lineFromMuzzle(kind: LineKind, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    this.lastLine = null;
    this.line(kind, ax, ay, az, bx, by, bz);
    const slot = this.lastLine as Slot | null;
    if (slot && LINE_STYLE[kind].streak > 0) slot.rides = true;
  }
  private lastLine: Slot | null = null;
  acquireLine(kind: LineKind): FxHandle | null {
    const pool = this.lines[kind];
    if (!pool) return null;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i] as Slot;
      if (s.active) continue;
      const h = s.take(this.now(), true);
      s.ax = 0; s.ay = -1e4; s.az = 0; s.bx = 0; s.by = -1e4; s.bz = 0;
      return h;
    }
    return null;
  }

  ring(kind: RingKind, x: number, y: number, z: number, radius: number, fillSeconds: number, holdSeconds: number): void {
    const pool = this.rings[kind];
    if (!pool) return;
    this.counts.rings++;
    let slot: Slot | null = null;
    for (let i = 0; i < pool.length; i++) { const s = pool[i] as Slot; if (!s.active) { slot = s; break; } }
    if (!slot) for (let i = 0; i < pool.length; i++) { const s = pool[i] as Slot; if (!slot || s.t0 < slot.t0) slot = s; }
    if (!slot) return;
    slot.take(this.now(), false);
    slot.ax = x; slot.ay = y; slot.az = z; slot.radius = radius;
    slot.hold = Math.max(1e-3, fillSeconds); slot.fade = holdSeconds; slot.life = fillSeconds + holdSeconds;
  }

  acquireCard(kind: CardKind): FxHandle | null {
    const pool = this.cards[kind];
    if (!pool) return null;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i] as Slot;
      if (s.active) continue;
      const h = s.take(this.now(), true);
      s.ax = 0; s.ay = -1e4; s.az = 0; s.bx = 0; s.by = -1e4; s.bz = 0;
      return h;
    }
    return null;
  }

  blobShadow(): FxHandle | null {
    const pool = this.blobs;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i] as Slot;
      if (s.active) continue;
      const h = s.take(this.now(), true);
      s.ax = 0; s.ay = -1e4; s.az = 0;
      return h;
    }
    return null;
  }

  // ---- flash and pulse ----------------------------------------------------------------------------------------------
  muzzleFlash(kind: FlashKind, x: number, y: number, z: number): void {
    this.counts.flashes++;
    const kept = kind === 'kept';
    const reduce = this.reduceFlashes;
    this.flashT0 = this.now();
    this.flashShown = false;
    // 33 to 50 ms, one of the four shapes; the kept round's is aqua-white, larger and longer
    this.flashLife = kept ? 0.08 : 0.033 + this.rng.next() * 0.017;
    this.flashSize = (kept ? 0.5 : 0.35) * (reduce ? 0.6 : 1);
    const cell = this.rng.int(4);
    this.flashRect.value.set(FX_RECTS[cell * 4] as number, FX_RECTS[cell * 4 + 1] as number, FX_RECTS[cell * 4 + 2] as number, FX_RECTS[cell * 4 + 3] as number);
    const c = kept ? HUE.aquaCore : kind === 'line' ? HUE.aquaCore : HUE.white;
    this.flashColor.value.set(c.r, c.g, c.b, 1);
    this.flashMono.value = kind === 'lead' ? 0 : 1;
    this.flashMesh.position.set(x, y, z);
    const eye = this.ctx.player.eye;
    this.flashDist = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
    this.flashRoll = this.rng.next() * 6.2831853;
    // the kept round's pulse (look-dev, polish round 3): pure aqua x 3.2 over 9 m clipped everything she aims at to one
    // flat `#7CF2E2` for the two frames of the shot. An aqua-white at x 1.0 over 14 m and twice as long: the room is LIT
    // by the shot (the drum's back, the ribs, the kerb keep their form) instead of painted over.
    const k = (kept ? 1.0 : 3.0) * this.host.pulseScale() * (reduce ? 0.5 : 1);
    const p = kept ? KEPT_PULSE : kind === 'line' ? HUE.aqua : HUE.flame;
    this.setPulse(0, x, y, z, kept ? 14 : 7, kept ? 0.16 : 0.07, p.r * k, p.g * k, p.b * k);
  }
  pulse(x: number, y: number, z: number, radius: number, seconds: number, r: number, g: number, b: number): void {
    // slot 1 belongs to the ring while it runs; otherwise the slot whose pulse is older
    const now = this.now();
    const ringBusy = this.ringT0 >= 0 && !this.ringReduced && now - this.ringT0 < 1.6;
    const slot = ringBusy ? 0 : (now - this.pulseT0[0]! >= this.pulseLife[0]! ? 0 : 1);
    this.setPulse(slot, x, y, z, radius, seconds, r, g, b);
  }
  private setPulse(slot: number, x: number, y: number, z: number, radius: number, seconds: number, r: number, g: number, b: number): void {
    this.counts.pulses++;
    this.pulseT0[slot] = this.now(); this.pulseLife[slot] = seconds; this.pulseRadius[slot] = radius;
    this.pulseR[slot * 3] = r; this.pulseR[slot * 3 + 1] = g; this.pulseR[slot * 3 + 2] = b;
    (this.shared.uPulsePos.value[slot] as THREE.Vector4).set(x, y, z, 0);
    this.shared.uPulseAdd.value[slot] = 0;
  }

  provingRing(x: number, y: number, z: number): void {
    // the seventh proves the chamber once: a second call over a running ring or a proven bore is not a second spectacle
    if (this.ringT0 >= 0 || this.shared.uWrong.value.x >= 1) { this.counts.provingIgnored++; return; }
    this.counts.provingRings++;
    const now = this.now();
    this.ringT0 = now;
    this.ringReduced = this.reduceFlashes;
    this.ringY = y;
    // pass i3: the shock and the crown lie on the floor and on the notches. The boss sends the layout's `bore_opening`
    // (the centre of the kerb's TOP disc, 1.2 m over the floor); anything else is taken as the floor itself.
    const top = this.ctx.data.layout.markers.find((m) => m.id === 'bore_opening');
    this.proveFloor = top && Math.abs((top.pos[1] as number) - y) < 0.05 ? y - 1.2 : y;
    this.shared.uWrongCentre.value.set(x, y, z);
    // after the ring: four seconds in which no particle spawns
    this.quietUntil = now + 1.6 + 4.0;
    this.host.proven(1.6);
    this.standT0 = this.reduceFlashes ? -1e9 : now;
    if (!this.standing) this.standing = this.acquireLine('standing_line');
    if (this.standing) { this.standing.setPosition(x, y - 12, z); this.standing.setEnd(x, y + 40, z); }
  }
  /** a restore: wrong_fade without the spectacle */
  cancelRing(): void {
    this.ringT0 = -1;
    this.shared.uWrong.value.y = 0;
    const p = this.shared.uPulseCol.value[1] as THREE.Vector4;
    p.set(0, 0, 0, 1);
  }
  get ringRunning(): boolean { return this.ringT0 >= 0; }
  /** the standing line of a restored proven bore */
  standingLine(x: number, y: number, z: number, on: boolean): void {
    if (!this.ringRunning) this.standT0 = -1e9;
    if (on) {
      if (!this.standing) this.standing = this.acquireLine('standing_line');
      if (this.standing) { this.standing.setPosition(x, y - 12, z); this.standing.setEnd(x, y + 40, z); }
    } else if (this.standing) { this.standing.release(); this.standing = null; }
  }

  // ---- per frame ----------------------------------------------------------------------------------------------------
  /** Advances the pulses and the ring, and refills the quad batch. `frameDt` in seconds; `feetY` the ground under the player. */
  update(frameDt: number, viewportW: number, viewportH: number, exposure: number, viewQuat: THREE.Quaternion): void {
    const now = this.drawNow(), shared = this.shared;
    this.invExposure.value = 1 / Math.max(exposure, 1e-3);
    // what a filled pulse may add to a dynamic surface: PULSE_CAP of display white whatever the mood's exposure
    shared.uPulseCap.value = PULSE_CAP * this.invExposure.value;
    this.quads.viewport.value.set(viewportW, viewportH);
    this.ambient.viewport.value.set(viewportW, viewportH);
    const decay = Math.exp(-frameDt / 0.4);
    this.additiveLoad *= decay; this.smokeLoad *= decay;

    // pulses: a linear decay over their life
    for (let i = 0; i < 2; i++) {
      const col = shared.uPulseCol.value[i] as THREE.Vector4;
      if (i === 1 && this.ringT0 >= 0 && !this.ringReduced && now - this.ringT0 < 1.6) continue;
      const age = Math.max(0, now - (this.pulseT0[i] as number)), life = this.pulseLife[i] as number;
      if (life > 0 && age < life) {
        const k = 1 - age / life;
        col.set((this.pulseR[i * 3] as number) * k, (this.pulseR[i * 3 + 1] as number) * k, (this.pulseR[i * 3 + 2] as number) * k, Math.max(0.05, this.pulseRadius[i] as number));
      } else col.set(0, 0, 0, 1);
    }

    // the ring at the seventh: radius 0 -> 40 m in 1.6 s, wrong_fade 1 behind it, the bore's glow turning from the bottom up
    if (this.ringT0 >= 0) {
      const t = Math.max(0, now - this.ringT0) / 1.6;
      const w = shared.uWrong.value;
      if (t >= 1) {
        w.x = 1; w.y = 0; w.z = 1e5;
        this.cancelRing();
      } else if (this.ringReduced) {
        // Reduce Flashes: no ring, a 1.6 s tint
        w.x = t; w.y = 0; w.z = this.ringY - 8 + 30 * t;
      } else {
        // 0 -> 40 m in 1.6 s, slow out of the bore and fast at the walls (radius = 40 t^1.5). Linear, it crossed the
        // pit and the kerb, all she sees aiming down the bore, in a fifth of a second: the signature moment showed as
        // a cut (polish round 2). Now the first 8 m take half a second.
        const radius = ringRadius(t);
        w.y = radius; w.z = this.ringY - 8 + 30 * t;
        const c = shared.uWrongCentre.value;
        (shared.uPulsePos.value[1] as THREE.Vector4).set(c.x, c.y, c.z, radius);
        // look-dev, polish round 3: white x 0.6 over a 1.5 m falloff bleached the whole kerb she looks at for a third of
        // a second (a banded pale wash). An aqua-white front 1 m wide, brighter at its crest: an edge that is seen to travel.
        // pass i3: the front is PROVE_FRONT_WIDE across while it is on the kerb (the white peak is held), 1 m beyond 6 m
        (shared.uPulseCol.value[1] as THREE.Vector4).set(0.40, 0.58, 0.55, 1.0 + (PROVE_FRONT_WIDE - 1.0) * clamp01(1 - (radius - 2.5) / 3.5));
        shared.uPulseAdd.value[1] = 0.5;
      }
    }

    // the muzzle sprite faces the camera
    const flashAge = now - this.flashT0;
    // 33 to 50 ms of sim time, but never gone before one frame has shown it (20 fps is three ticks a frame)
    if (this.flashT0 >= 0 && (flashAge < this.flashLife || (!this.flashShown && flashAge < this.flashLife + SHOW_GRACE))) {
      this.flashMesh.visible = true;
      this.flashMesh.quaternion.copy(viewQuat);
      this.flashMesh.rotateZ(this.flashRoll);
      this.flashMesh.scale.setScalar(this.flashSize);
    } else this.flashMesh.visible = false;

    this.particles.update();
  }

  /** The pools into the quad batch (blobs first: they darken what the additive ones then add to). */
  fillQuads(sunShadow: boolean, exteriorAt: (x: number, y: number, z: number) => boolean): void {
    const q = this.quads, d = q.data, now = this.drawNow();
    const cam = this.cam.copy(this.ctx.scene.camera.position);
    let o = 0;
    // blob shadows (darkening): not drawn outdoors on High, where the sun shadow map replaces them
    for (let i = 0; i < this.blobs.length; i++) {
      const s = this.blobs[i] as Slot;
      if (!s.active || !s.visible) continue;
      if (sunShadow && exteriorAt(s.ax, s.ay, s.az)) continue;
      if ((o = q.next()) < 0) return;
      const size = 1.1 * (s.levelSet ? Math.max(0.2, s.level) : 1);
      d[o] = s.ax; d[o + 1] = s.ay + 0.025; d[o + 2] = s.az; d[o + 3] = MODE_PLANE;
      d[o + 4] = 0; d[o + 5] = 1; d[o + 6] = 0; d[o + 7] = size;
      d[o + 8] = 0; d[o + 9] = 0; d[o + 10] = 0; d[o + 11] = 0.55;
      d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
      d[o + 16] = SHAPE_BLOB; d[o + 17] = 0; d[o + 18] = size; d[o + 19] = 0;
    }
    this.fillRings(this.rings.canister, now);
    this.fillRings(this.rings.slam, now);
    this.fillCards(now, cam);
    this.fillProving(now);
    for (let k = 0; k < LINE_KINDS.length; k++) {
      const kind = LINE_KINDS[k] as LineKind, style = LINE_STYLE[kind], pool = this.lines[kind];
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i] as Slot;
        s.qo = -1;
        if (!s.active) continue;
        let alpha = 1, level = s.level;
        let ax = s.ax, ay = s.ay, az = s.az, bx = s.bx, by = s.by, bz = s.bz;
        if (!s.persistent) {
          let age = Math.max(0, now - s.t0);
          if (age >= s.life) {
            // a streak lives two ticks: at a low frame rate it stays until one frame has shown it
            if (style.streak <= 0 || s.shown || age >= s.life + SHOW_GRACE) { s.active = false; continue; }
            age = s.life;
          }
          if (age > s.hold && s.fade > 0) alpha = 1 - (age - s.hold) / s.fade;
          if (style.head > 0) level = age / s.life;
          if (style.streak > 0) {
            // a streak of fixed length travelling from a toward b over its two frames
            const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
            s.f = age / s.life;
            if (len > 1e-3) {
              const head = Math.min(len, style.streak + Math.max(0, len - style.streak) * (age / s.life) * 0.6);
              const tail = Math.max(0, head - style.streak);
              bx = ax + dx * head / len; by = ay + dy * head / len; bz = az + dz * head / len;
              ax += dx * tail / len; ay += dy * tail / len; az += dz * tail / len;
            }
          }
        }
        if (!s.visible || alpha <= 0) continue;
        let core = style.core;
        if (kind === 'sighting_thread' && s.persistent) {
          // the aim tell: from 45 % to full over the aim, and a glow on the lens (never under 16 px, 34 px at the shot)
          const aim = clamp01((now - s.t0) / THREAD_AIM_SECONDS);
          alpha *= 0.45 + 0.55 * aim; core += 2 * aim;
          if (s.ay > -9000) {
            if ((o = q.next()) < 0) return;
            const c = style.color, size = 0.35 + 0.5 * aim;
            d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = MODE_BILLBOARD;
            d[o + 4] = 0; d[o + 5] = 16 + 18 * aim; d[o + 6] = 0.05; d[o + 7] = size;
            d[o + 8] = c.r; d[o + 9] = c.g; d[o + 10] = c.b; d[o + 11] = 0.7 + 0.8 * aim;
            d[o + 12] = 0.8; d[o + 13] = 1; d[o + 14] = 0; d[o + 15] = 0;
            d[o + 16] = SHAPE_SOFT; d[o + 17] = 0; d[o + 18] = size; d[o + 19] = FLAG_ADD;
          }
        }
        let total = style.total, halo = style.halo;
        if (kind === 'standing_line') {
          const age = now - this.standT0;
          if (age >= 0 && age < STAND_FLARE) {
            const flare = standFlare(age);
            core += style.core * 8 * flare; total += style.total * 6 * flare; halo += 0.3 * flare;
            // the white heart at the bore's mouth (the line runs from 12 m under the floor)
            if ((o = q.next()) < 0) return;
            const hc = HUE.aquaCore, size = 1.2 + 6.5 * flare;
            d[o] = ax; d[o + 1] = ay + 12.9; d[o + 2] = az; d[o + 3] = MODE_BILLBOARD;
            d[o + 4] = 0; d[o + 5] = 0; d[o + 6] = 0.02; d[o + 7] = size;
            d[o + 8] = hc.r; d[o + 9] = hc.g; d[o + 10] = hc.b; d[o + 11] = Math.min(1, 1.6 * flare);
            d[o + 12] = 1; d[o + 13] = 0.35; d[o + 14] = 0; d[o + 15] = 0;
            d[o + 16] = SHAPE_SOFT; d[o + 17] = 0; d[o + 18] = size; d[o + 19] = FLAG_ADD;
          }
        }
        if ((o = q.next()) < 0) return;
        s.written = true;
        s.qo = o;
        const c = style.color;
        d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = MODE_BEAM;
        d[o + 4] = bx; d[o + 5] = by; d[o + 6] = bz; d[o + 7] = total;
        d[o + 8] = c.r; d[o + 9] = c.g; d[o + 10] = c.b; d[o + 11] = alpha;
        d[o + 12] = core; d[o + 13] = halo; d[o + 14] = style.white; d[o + 15] = style.head;
        d[o + 16] = SHAPE_LINE; d[o + 17] = level; d[o + 18] = style.dash; d[o + 19] = FLAG_ADD | FLAG_PX;
      }
    }
  }
  /**
   * The bore's answer to the seventh (see PROVE_RINGS and the pass i3 note): the shock across the floor (2 quads), the
   * crown on the kerb (1), the vault's bloom (1), rings climbing the standing line (3), threads drawn up the shaft (8).
   * With the standing line and its heart (fillQuads) that is 17 of the 18 additive quads ART_BIBLE 9.3 allows.
   */
  private fillProving(now: number): void {
    const age = now - this.standT0;
    if (age < 0 || age >= STAND_FLARE) return;
    const q = this.quads, d = q.data, c = this.shared.uWrongCentre.value, hue = HUE.aqua, core = HUE.aquaCore;
    const flare = standFlare(age);
    let o = 0;
    // the shock: on the floor, at the radius of the shader's front, from the kerb's foot to the wall
    for (let k = 0; k < 2; k++) {
      const a = age - k * PROVE_SHOCK_GAP;
      if (a <= 0) continue;
      const r = ringRadius(a / 1.6);
      if (r < PROVE_SHOCK_FROM || r > PROVE_SHOCK_TO) continue;
      if ((o = q.next()) < 0) return;
      const u = (r - PROVE_SHOCK_FROM) / (PROVE_SHOCK_TO - PROVE_SHOCK_FROM), size = r * 2 / 0.95;
      d[o] = c.x; d[o + 1] = this.proveFloor + 0.06; d[o + 2] = c.z; d[o + 3] = MODE_PLANE;
      d[o + 4] = 0; d[o + 5] = 1; d[o + 6] = 0; d[o + 7] = size;
      d[o + 8] = hue.r; d[o + 9] = hue.g; d[o + 10] = hue.b; d[o + 11] = (k === 0 ? 1.9 : 0.8) * Math.min(1, u * 8) * (1 - u * u * 0.75);
      d[o + 12] = 1; d[o + 13] = k === 0 ? 0.22 : 0.08; d[o + 14] = 0; d[o + 15] = 0;
      d[o + 16] = SHAPE_RING; d[o + 17] = 0; d[o + 18] = size; d[o + 19] = FLAG_ADD;
    }
    // the crown: the kerb's seams at white for the hold, falling with the flare
    if (flare > 0.04) {
      if ((o = q.next()) < 0) return;
      const size = PROVE_CROWN_R * 2 / 0.95;
      d[o] = c.x; d[o + 1] = this.proveFloor + 0.612; d[o + 2] = c.z; d[o + 3] = MODE_PLANE;
      d[o + 4] = 0; d[o + 5] = 1; d[o + 6] = 0; d[o + 7] = size;
      d[o + 8] = core.r; d[o + 9] = core.g; d[o + 10] = core.b; d[o + 11] = 2.2 * flare;
      d[o + 12] = 1; d[o + 13] = 0.05; d[o + 14] = 0; d[o + 15] = 0;
      d[o + 16] = SHAPE_RING; d[o + 17] = 0; d[o + 18] = size; d[o + 19] = FLAG_ADD;
      // the vault: where the column meets the head
      if ((o = q.next()) < 0) return;
      const vs = 4 + 7 * flare;
      d[o] = c.x; d[o + 1] = this.proveFloor + 13.3; d[o + 2] = c.z; d[o + 3] = MODE_BILLBOARD;
      d[o + 4] = 0; d[o + 5] = 0; d[o + 6] = 0.02; d[o + 7] = vs;
      d[o + 8] = hue.r; d[o + 9] = hue.g; d[o + 10] = hue.b; d[o + 11] = Math.min(1, 1.3 * flare);
      d[o + 12] = 0.8; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
      d[o + 16] = SHAPE_SOFT; d[o + 17] = 0; d[o + 18] = vs; d[o + 19] = FLAG_ADD;
    }
    for (let k = 0; k < PROVE_RINGS; k++) {
      const u = (age - k * PROVE_RING_GAP) / PROVE_RING_LIFE;
      if (u <= 0 || u >= 1) continue;
      if ((o = q.next()) < 0) return;
      const rise = 1 - (1 - u) * (1 - u), size = (PROVE_RING_R - 0.7 * rise) * 2 / 0.95;
      d[o] = c.x; d[o + 1] = c.y - 5 + 18.5 * rise; d[o + 2] = c.z; d[o + 3] = MODE_PLANE;
      d[o + 4] = 0; d[o + 5] = 1; d[o + 6] = 0; d[o + 7] = size;
      d[o + 8] = hue.r; d[o + 9] = hue.g; d[o + 10] = hue.b; d[o + 11] = 1.8 * Math.min(1, u * 10) * (1 - u);
      d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
      d[o + 16] = SHAPE_RING; d[o + 17] = 0; d[o + 18] = size; d[o + 19] = FLAG_ADD;
    }
    for (let k = 0; k < PROVE_THREADS; k++) {
      const a = age - k * PROVE_THREAD_GAP;
      if (a <= 0 || a >= PROVE_THREAD_LIFE) continue;
      if ((o = q.next()) < 0) return;
      // every other thread stands in a notch, the rest behind a merlon: bearings 0, 45, 90 ... taken three apart, so the
      // order runs round the kerb as a star, not as a sweep
      const b = ((k * 3) % PROVE_THREADS) * (Math.PI * 2 / PROVE_THREADS);
      const x = c.x + Math.sin(b) * PROVE_THREAD_R, z = c.z - Math.cos(b) * PROVE_THREAD_R;
      const head = Math.min(1, a / PROVE_THREAD_RISE), fade = a < PROVE_THREAD_RISE ? 1 : 1 - (a - PROVE_THREAD_RISE) / (PROVE_THREAD_LIFE - PROVE_THREAD_RISE);
      d[o] = x; d[o + 1] = c.y - 7; d[o + 2] = z; d[o + 3] = MODE_BEAM;
      d[o + 4] = x; d[o + 5] = c.y + 13.6; d[o + 6] = z; d[o + 7] = 14;
      d[o + 8] = hue.r; d[o + 9] = hue.g; d[o + 10] = hue.b; d[o + 11] = 0.95 * fade;
      d[o + 12] = 3; d[o + 13] = 0.35; d[o + 14] = 0.6; d[o + 15] = 1;
      d[o + 16] = SHAPE_LINE; d[o + 17] = 1 - (1 - head) * (1 - head); d[o + 18] = 0; d[o + 19] = FLAG_ADD | FLAG_PX;
    }
  }
  private fillRings(pool: Slot[], now: number): void {
    const q = this.quads, d = q.data, c = HUE.flame;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i] as Slot;
      if (!s.active) continue;
      const age = Math.max(0, now - s.t0);
      if (age >= s.life) { s.active = false; continue; }
      const o = q.next();
      if (o < 0) return;
      const size = s.radius * 2 / 0.95;
      d[o] = s.ax; d[o + 1] = s.ay + 0.04; d[o + 2] = s.az; d[o + 3] = MODE_PLANE;
      d[o + 4] = 0; d[o + 5] = 1; d[o + 6] = 0; d[o + 7] = size;
      d[o + 8] = c.r; d[o + 9] = c.g; d[o + 10] = c.b; d[o + 11] = 1.25;
      d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
      d[o + 16] = SHAPE_RING; d[o + 17] = Math.min(1, age / s.hold); d[o + 18] = size; d[o + 19] = FLAG_ADD;
    }
  }
  // the size, alpha and level of the next card: fields, not arguments (a double passed to a call is boxed)
  private cw = 0; private ch = 0; private ca = 0; private cl = 0;
  /**
   * Exterior look, pass i3 (R9: the gully on High): the three sun shafts the bake lays across the gully's floor
   * (blender/env_exterior/lip_dress.py SHAFTS), drawn in the dusty air as blade cards. Seven numbers each: where it
   * comes from, where it lands, its level (0: not drawn). The render system writes them every frame (system.ts
   * updateGullyShafts); they are not pooled cards, so the ambient points keep the wind's sand.
   */
  readonly gullyShafts = new Float32Array(3 * 7);
  private readonly gullySlot = new Slot('gully_shaft', () => { /* never released: a scratch slot */ });
  /** depth pull of the next billboard (see quads.ts), and the white share of a soft dot's heart; both go back to their defaults after one card */
  private cb = 0; private cwhite = 0.6;
  /** One instance of a card kind (mode 0 billboard, 1 beam, 3 crossed card) with this.cw / ch / ca / cl. */
  private card(mode: number, s: Slot, c: THREE.Color, shape: number, minPx: number, rect: number, flags: number): void {
    const o = this.quads.next();
    if (o < 0) return;
    const d = this.quads.data;
    d[o] = s.ax; d[o + 1] = s.ay; d[o + 2] = s.az; d[o + 3] = mode;
    if (mode === MODE_BILLBOARD) { d[o + 4] = 0; d[o + 5] = minPx; d[o + 6] = this.cb; } else { d[o + 4] = s.bx; d[o + 5] = s.by; d[o + 6] = s.bz; }
    d[o + 7] = this.cw;
    d[o + 8] = c.r; d[o + 9] = c.g; d[o + 10] = c.b; d[o + 11] = this.ca;
    if (rect >= 0) { d[o + 12] = FX_RECTS[rect] as number; d[o + 13] = FX_RECTS[rect + 1] as number; d[o + 14] = FX_RECTS[rect + 2] as number; d[o + 15] = FX_RECTS[rect + 3] as number; } else { d[o + 12] = this.cwhite; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0; }
    d[o + 16] = shape; d[o + 17] = this.cl; d[o + 18] = this.ch; d[o + 19] = flags;
    this.cb = 0; this.cwhite = 0.6;
  }
  private fillCards(now: number, cam: THREE.Vector3): void {
    const cards = this.cards, amb = this.ambient;
    // sun blades: crossed additive cards along the blade's path, 22 % at their peak; the motes ride in them
    const blades = cards.sun_blade, n = this.host.bladeCards();
    for (let i = 0; i < blades.length; i++) {
      const s = blades[i] as Slot, a = amb.bladeA, b = amb.bladeB;
      if (!s.active || !s.visible) { a[i * 4 + 3] = 0; continue; }
      const level = clamp01(s.level);
      a[i * 4] = s.ax; a[i * 4 + 1] = s.ay; a[i * 4 + 2] = s.az; a[i * 4 + 3] = level;
      b[i * 3] = s.bx; b[i * 3 + 1] = s.by; b[i * 3 + 2] = s.bz;
      for (let c = 0; c < n; c++) { this.cw = 1.15; this.ch = c * Math.PI / n; this.ca = 0.22 * level; this.cl = 0; this.card(MODE_CARD, s, HUE.blade, SHAPE_BLADE, 0, -1, FLAG_ADD); }
    }
    // exterior look, pass i3: the gully's sun shafts (gullyShafts): the same crossed cards, wider and dimmer, no motes of their own
    const gs = this.gullyShafts, gsl = this.gullySlot;
    for (let i = 0; i < 3; i++) {
      const lv = gs[i * 7 + 6] as number;
      if (lv <= 0.004) continue;
      gsl.ax = gs[i * 7] as number; gsl.ay = gs[i * 7 + 1] as number; gsl.az = gs[i * 7 + 2] as number;
      gsl.bx = gs[i * 7 + 3] as number; gsl.by = gs[i * 7 + 4] as number; gsl.bz = gs[i * 7 + 5] as number;
      for (let c = 0; c < n; c++) { this.cw = 1.7; this.ch = c * Math.PI / n; this.ca = 0.15 * clamp01(lv); this.cl = 0; this.card(MODE_CARD, gsl, HUE.blade, SHAPE_BLADE, 0, -1, FLAG_ADD); }
    }
    const patches = cards.sun_patch;
    for (let i = 0; i < patches.length; i++) {
      const s = patches[i] as Slot;
      if (!s.active || !s.visible) continue;
      // position = the patch's centre, end - position = the surface normal (its length up to 1 scales the 2.5 x 1.5 m patch)
      const k = Math.min(1, Math.hypot(s.bx - s.ax, s.by - s.ay, s.bz - s.az) || 1);
      const o = this.quads.next();
      if (o < 0) break;
      const d = this.quads.data, c = HUE.blade;
      d[o] = s.ax; d[o + 1] = s.ay; d[o + 2] = s.az; d[o + 3] = MODE_PLANE;
      d[o + 4] = s.bx - s.ax; d[o + 5] = s.by - s.ay; d[o + 6] = s.bz - s.az; d[o + 7] = 2.5 * k;
      d[o + 8] = c.r; d[o + 9] = c.g; d[o + 10] = c.b; d[o + 11] = 0.3 * clamp01(s.level);
      d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
      d[o + 16] = SHAPE_PATCH; d[o + 17] = 0; d[o + 18] = 1.5 * k; d[o + 19] = FLAG_ADD;
    }
    const lance = cards.lance;
    for (let i = 0; i < lance.length; i++) { const s = lance[i] as Slot; if (!s.active || !s.visible) continue; this.cw = 0.25; this.ch = 0; this.ca = clamp01(s.level); this.cl = 0; this.card(MODE_BEAM, s, HUE.flame, SHAPE_LANCE, 0, -1, FLAG_ADD); }
    const mouths = cards.mouth_glow;
    for (let i = 0; i < mouths.length; i++) { const s = mouths[i] as Slot; if (!s.active || !s.visible) continue; this.cw = 1.1; this.ch = 1.1; this.ca = 1; this.cl = clamp01(s.level); this.card(MODE_BILLBOARD, s, HUE.flame, SHAPE_MOUTH, 0, -1, FLAG_ADD); }
    const stars = cards.aim_star, star = CELL.star4 * 4;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i] as Slot;
      if (!s.active || !s.visible) continue;
      const size = 0.08 + 0.4 * clamp01(s.level);
      this.cw = size; this.ch = size; this.ca = 1; this.cl = 0;
      this.card(MODE_BILLBOARD, s, HUE.flameCore, SHAPE_ATLAS, 6, star, FLAG_ADD);
    }
    const halos = cards.halo;
    const wrong = this.shared.uWrong.value.x;
    for (let i = 0; i < halos.length; i++) {
      const s = halos[i] as Slot;
      if (!s.active || !s.visible || wrong > 0.5) continue;
      // a knot's halo: violet with a near-white heart, breathing with the knot's 1.5 Hz pulse
      this.cw = 0.4; this.ch = 0.4; this.ca = 0.5 * clamp01(s.level) * (0.85 + 0.15 * Math.sin(now * 9.42478)); this.cl = 0;
      this.card(MODE_BILLBOARD, s, HUE.violet, SHAPE_SOFT, 0, -1, FLAG_ADD);
    }
    const fire = cards.last_fire;
    for (let i = 0; i < fire.length; i++) {
      const s = fire[i] as Slot;
      if (!s.active || !s.visible) continue;
      // kindling from nothing over 1.5 s; a flicker between 5 and 8 Hz; never under 4 px however far it is
      const kindle = Math.min(1, Math.max(0, now - s.t0) / 1.5) * (s.levelSet ? clamp01(s.level) : 1);
      // pass i2: a far fire is steady ("It was not moving"): it breathes by a tenth, it does not gutter
      const flicker = 0.90 + 0.06 * Math.sin(now * 6.2831853 * 2.3) + 0.04 * Math.sin(now * 6.2831853 * 3.7 + 1.3);
      const size = Math.max(0.5, Math.hypot(s.ax - cam.x, s.ay - cam.y, s.az - cam.z) * 0.004);
      // polish round 2: the fire stands ON the plain 520 m out, so the lower half of its sprite was under the plain's
      // own surface, and from the ledge a dusk mesa of the backdrop stands in front of the place: "one small fire" was
      // not on screen at all. It is drawn at a depth of FIRE_DEPTH metres (the ledge, the stone and the revolver still
      // hide it; the backdrop 200 m and more away does not), stands at least 13 px tall, and has a warm glow of at
      // least 40 px round it: the brightest warm point of the frame.
      const far = Math.hypot(s.ax - cam.x, s.ay - cam.y, s.az - cam.z);
      const pull = far > FIRE_DEPTH * 1.5 ? 1 - FIRE_DEPTH / far : 0;
      // polish round 3 (lead ruling R5: "the fire must be visible"; the critic measured a soft 20 px dot with no light
      // cast, no smoke and no flicker presence). Back to front: the smoke (a thin column that crosses the horizon's
      // glow, three slow puffs that lean with the wind), a wide low glow on the ground round it, the halo, the flame
      // itself: at least 46 px tall, its heart white.
      const lean = 0.07 + 0.015 * Math.sin(now * 0.4);
      // the flame's smallest size on screen is FIRE_PX: the smoke is laid out in the flame's ON-SCREEN metres (`sk`), along
      // the camera's right (rx, rz) for its lean
      const camera = this.ctx.scene.camera;
      const pxPerM = this.quads.viewport.value.y * (camera.projectionMatrix.elements[5] as number) * 0.5 / Math.max(far, 1);
      const sk = size * Math.max(1, FIRE_PX / Math.max(size * 3.4 * pxPerM, 1e-3));
      const rx = camera.matrixWorld.elements[0] as number, rz = camera.matrixWorld.elements[2] as number;
      // pass i1 (both visual reviewers: "a small pale pill", "no flame shape, no light on the ground"): the smoke is a
      // taller column of six puffs, lit warm from below by the fire and rose-grey where it climbs into the afterglow
      for (let k = 0; k < 6; k++) {
        const o = this.quads.next();
        if (o < 0) break;
        const d = this.quads.data;
        // the puffs rise and are born again: a height of 0..1 that climbs with time
        // pass i2: a hairline, not a column: a thread a fifth of the flame wide at its foot that stands eight flames
        // tall in still air and only opens and leans where it thins out
        const rise = (now * 0.02 + k / 6) % 1;
        // pass i3 (the visual reviewer: "a thin dashed dark streak stands above it like an artifact"): six thin puffs 3.8
        // flame-metres apart drew as dashes. Each is twice as tall and wider as it climbs, at half the strength: one soft
        // column that opens and leans, with no gap in it
        const h = sk * (9.5 + 5.0 * rise), w = sk * (0.5 + 1.9 * rise * Math.sqrt(rise));
        const warm = Math.max(0, 1 - rise * 3.2) * (0.6 + 0.4 * flicker);
        d[o] = s.ax + rx * lean * sk * 30 * rise * rise; d[o + 1] = s.ay + sk * (4.2 + 23 * rise); d[o + 2] = s.az + rz * lean * sk * 30 * rise * rise; d[o + 3] = MODE_BILLBOARD;
        d[o + 4] = -lean; d[o + 5] = 0; d[o + 6] = pull; d[o + 7] = w;
        d[o + 8] = 0.085 + 0.30 * warm; d[o + 9] = 0.062 + 0.12 * warm; d[o + 10] = 0.090 + 0.02 * warm; d[o + 11] = 0.36 * kindle * Math.sin(Math.PI * Math.sqrt(rise));
        d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
        d[o + 16] = SHAPE_SOFT; d[o + 17] = 0; d[o + 18] = h; d[o + 19] = 0;
      }
      // the light it casts: two flat warm pools on the plain, a wide dim one that reaches the pylon's foot and the
      // nearest fronts, and a tight bright one under the flame; both breathe with the flicker
      for (let k = 0; k < 2; k++) {
        const o = this.quads.next();
        if (o < 0) break;
        const d = this.quads.data, c = HUE.flame;
        // pass i2: the light lies ON the flat: a long thin pool (26 flame-widths by a flame's height) and a short bright one
        const w = k === 0 ? 34 : 11, hh = k === 0 ? 3.0 : 1.9;
        d[o] = s.ax; d[o + 1] = s.ay - sk * 0.5; d[o + 2] = s.az; d[o + 3] = MODE_BILLBOARD;
        d[o + 4] = 0; d[o + 5] = hh * FIRE_PX / 3.4; d[o + 6] = pull; d[o + 7] = size * w;
        d[o + 8] = c.r; d[o + 9] = c.g * (k === 0 ? 0.78 : 1); d[o + 10] = c.b * (k === 0 ? 0.6 : 1); d[o + 11] = (k === 0 ? 0.30 : 0.62) * kindle * (0.72 + 0.28 * flicker);
        d[o + 12] = 0.1; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
        d[o + 16] = SHAPE_SOFT; d[o + 17] = 0; d[o + 18] = size * hh; d[o + 19] = FLAG_ADD;
      }
      // release pass p0 (closer; the UI team's row): the glow about 1.5 times wider (the halo 11 -> 16.5 sizes and at least
      // 180 px): with the gun let down under the end card the fire is the frame's only warm point. Pass i1: the halo is
      // dimmer (it washed the flame to white) and the flame is larger and coloured (quads.ts SHAPE_FIRE).
      // pass i2: the bloom of a small far light: a wide dim one (130 px) and a tight one round the flame (52 px)
      this.cw = size * 16.5; this.ch = size * 16.5; this.ca = 0.26 * kindle * (0.55 + 0.45 * flicker); this.cl = 0; this.cb = pull; this.cwhite = 0.1;
      this.card(MODE_BILLBOARD, s, HUE.flame, SHAPE_SOFT, 150, -1, FLAG_ADD);      // pass i3: 130 -> 150 px (at 170 px and 0.30 it lifted the afterglow over the fire to the flame's own level: tests/render/polish3 counts 64 hot rows)
      this.cw = size * 6; this.ch = size * 6; this.ca = 0.80 * kindle * (0.55 + 0.45 * flicker); this.cl = 0; this.cb = pull; this.cwhite = 0.25;
      s.ay += sk * 0.9;
      this.card(MODE_BILLBOARD, s, HUE.flame, SHAPE_SOFT, 60, -1, FLAG_ADD);
      s.ay -= sk * 0.9;
      // the flame stands with its heart on the fire's own point (its foot 0.8 of a flame-metre under it, as the old 46 px flame's was)
      this.cw = size * 3.0; this.ch = size * 3.4; this.ca = 2.0 * kindle * (0.80 + 0.25 * flicker); this.cl = 0; this.cb = pull;
      s.ay += sk * 0.9;
      this.card(MODE_BILLBOARD, s, HUE.flame, SHAPE_FIRE, FIRE_PX, -1, FLAG_ADD);
      s.ay -= sk * 0.9;
      // sparks: five motes that leave the flame's tip, drift with the smoke and go out
      // (pass i2: none, where there were five: a spark that climbs three flames over a fire half a kilometre off is a second light)
      for (let k = 0; k < 0; k++) {
        const o = this.quads.next();
        if (o < 0) break;
        const d = this.quads.data, c = HUE.flame;
        const t = (now * (0.21 + 0.035 * k) + k * 0.37) % 1;
        const sx = Math.sin(k * 2.4 + now * 1.3) * 0.5 + lean * 14 * t * t;
        const sp = sk * 0.22 * (1 - 0.5 * t);
        d[o] = s.ax + rx * sk * sx; d[o + 1] = s.ay + sk * (1.5 + 7.5 * t); d[o + 2] = s.az + rz * sk * sx; d[o + 3] = MODE_BILLBOARD;
        d[o + 4] = 0; d[o + 5] = 2.5; d[o + 6] = pull; d[o + 7] = sp;
        d[o + 8] = c.r; d[o + 9] = c.g; d[o + 10] = c.b; d[o + 11] = 1.6 * kindle * (1 - t) * (1 - t);
        d[o + 12] = 0.5; d[o + 13] = 1; d[o + 14] = 0; d[o + 15] = 0;
        d[o + 16] = SHAPE_SOFT; d[o + 17] = 0; d[o + 18] = sp; d[o + 19] = FLAG_ADD;
      }
    }
    const glint = cards.dowser_glint;
    for (let i = 0; i < glint.length; i++) {
      const s = glint[i] as Slot;
      if (!s.active || !s.visible) continue;
      const size = Math.max(0.3, Math.hypot(s.ax - cam.x, s.ay - cam.y, s.az - cam.z) * 0.012);
      this.cw = size; this.ch = size; this.ca = clamp01(s.level); this.cl = 0;
      this.card(MODE_BILLBOARD, s, HUE.flameCore, SHAPE_ATLAS, 6, star, FLAG_ADD);
    }
    const sand = cards.sand_thread;
    for (let i = 0; i < sand.length; i++) {
      const s = sand[i] as Slot;
      if (!s.active || !s.visible) continue;
      const o = this.quads.next();
      if (o < 0) break;
      const d = this.quads.data;
      d[o] = s.ax; d[o + 1] = s.ay; d[o + 2] = s.az; d[o + 3] = MODE_BEAM;
      d[o + 4] = s.bx; d[o + 5] = s.by; d[o + 6] = s.bz; d[o + 7] = 4;
      d[o + 8] = 0.95; d[o + 9] = 0.72; d[o + 10] = 0.45; d[o + 11] = 0.8 * clamp01(s.level);
      d[o + 12] = 2; d[o + 13] = 0.2; d[o + 14] = 0.3; d[o + 15] = 0;
      d[o + 16] = SHAPE_LINE; d[o + 17] = 1; d[o + 18] = 0; d[o + 19] = FLAG_ADD | FLAG_PX;
    }
  }

  /**
   * Polish round 5 (combat critic: "the flash is drawn away from the muzzle and stays put while the barrel recoils").
   * The caller asks for the flash at a WORLD point computed from the pose of the shot's tick; by the first drawn frame
   * the camera has kicked and the gun has risen, and the sprite stood 80 px (then 200 px) from the barrel at 540p. While
   * it lives, the sprite is put on the line from the eye through the view-model's DRAWN muzzle, as far out as it was
   * asked for (so its size on the screen is the one the caller chose). `muzzle` is the view-model's muzzle node with its
   * world matrix of this frame, `eye` the world matrix of the camera that draws it. No node (a page without a
   * view-model): the asked position stands.
   */
  rideMuzzle(muzzle: THREE.Object3D | null, eye: THREE.Matrix4): void {
    if (!muzzle || this.flashDist < 1e-3) return;
    const m = muzzle.matrixWorld.elements, e = eye.elements;
    const ex = e[12] as number, ey = e[13] as number, ez = e[14] as number;
    const dx = (m[12] as number) - ex, dy = (m[13] as number) - ey, dz = (m[14] as number) - ez;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-4)) return;
    const k = this.flashDist / len;
    this.flashMesh.position.set(ex + dx * k, ey + dy * k, ez + dz * k);
    this.counts.flashRides++;
  }

  /**
   * Release pass p0 (combat critic: "the tracer starts below the muzzle on the first frame of a shot"). The streaks that
   * left the gun (lineFromMuzzle) are re-anchored in the quad batch the fill has just written: their start becomes the
   * muzzle AS THIS FRAME DRAWS IT, seen through the WORLD camera (the view-model pass has its own narrower projection:
   * the point is moved across the view so both projections put it on the same pixel, at the same depth). `muzzle` and
   * `eye` as in rideMuzzle; `viewProj` / `worldProj` are the two cameras' projection matrices. Called by the system
   * between the fill and the draw; writes 6 floats per live streak, allocates nothing.
   */
  rideLines(muzzle: THREE.Object3D | null, eye: THREE.Matrix4, viewProj: THREE.Matrix4, worldProj: THREE.Matrix4): void {
    if (!muzzle) return;
    const pool = this.lines.tracer;
    let any = false;
    for (let i = 0; i < pool.length; i++) { const s = pool[i] as Slot; if (s.active && s.rides && s.qo >= 0) { any = true; break; } }
    if (!any) return;
    const m = muzzle.matrixWorld.elements, e = eye.elements, vp = viewProj.elements, wp = worldProj.elements;
    const w0 = wp[0] as number, w5 = wp[5] as number;
    if (!(w0 > 1e-6) || !(w5 > 1e-6)) return;
    // the camera's axes (columns of its world matrix: right, up, back) and the muzzle in camera space
    const rx = e[0] as number, ry = e[1] as number, rz = e[2] as number;
    const ux = e[4] as number, uy = e[5] as number, uz = e[6] as number;
    const kx = e[8] as number, ky = e[9] as number, kz = e[10] as number;
    const ex = e[12] as number, ey = e[13] as number, ez = e[14] as number;
    const px = (m[12] as number) - ex, py = (m[13] as number) - ey, pz = (m[14] as number) - ez;
    const cx = px * rx + py * ry + pz * rz, cy = px * ux + py * uy + pz * uz, depth = -(px * kx + py * ky + pz * kz);
    if (!(depth > 1e-3)) return;
    const x = cx * (vp[0] as number) / w0 - (vp[8] as number) * depth / w0, y = cy * (vp[5] as number) / w5;
    const ax = ex + rx * x + ux * y - kx * depth, ay = ey + ry * x + uy * y - ky * depth, az = ez + rz * x + uz * y - kz * depth;
    const d = this.quads.data, streak = LINE_STYLE.tracer.streak;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i] as Slot;
      if (!s.active || !s.rides || s.qo < 0) continue;
      const dx = s.bx - ax, dy = s.by - ay, dz = s.bz - az, len = Math.hypot(dx, dy, dz);
      if (!(len > 1e-3)) continue;
      const head = Math.min(len, streak + Math.max(0, len - streak) * s.f * 0.6), tail = Math.max(0, head - streak), o = s.qo;
      d[o] = ax + dx * tail / len; d[o + 1] = ay + dy * tail / len; d[o + 2] = az + dz * tail / len;
      d[o + 4] = ax + dx * head / len; d[o + 5] = ay + dy * head / len; d[o + 6] = az + dz * head / len;
      this.counts.lineRides++;
      this.lineStart.set(ax, ay, az);
    }
  }
  /** where the last riding streak was anchored (world): tests and `__dbg.ext.render.muzzle()` */
  readonly lineStart = new THREE.Vector3(0, -1e4, 0);

  /** A frame was drawn (not the hidden warm-up one): the flash and the streaks it showed may now end on time. */
  frameDrawn(): void {
    if (this.flashMesh.visible) this.flashShown = true;
    const a = this.lines.tracer, b = this.lines.ricochet;
    for (let i = 0; i < a.length; i++) { const s = a[i] as Slot; if (s.written) s.shown = true; }
    for (let i = 0; i < b.length; i++) { const s = b[i] as Slot; if (s.written) s.shown = true; }
  }
  /** The game paused: sim time stands still, and a flash frozen on the screen for as long as the menu is open is a glare. */
  paused(): void {
    this.flashT0 = -1; this.flashShown = true;
    this.flashMesh.visible = false;
    this.pulseLife[0] = 0;
    (this.shared.uPulseCol.value[0] as THREE.Vector4).set(0, 0, 0, 1);
    const t = this.lines.tracer, r = this.lines.ricochet;
    for (let i = 0; i < t.length; i++) (t[i] as Slot).active = false;
    for (let i = 0; i < r.length; i++) (r[i] as Slot).active = false;
  }

  /** true when a point is inside a lit sun blade (within 0.7 m of its axis) */
  bladeAt(x: number, y: number, z: number): boolean {
    const blades = this.cards.sun_blade;
    for (let i = 0; i < blades.length; i++) {
      const s = blades[i] as Slot;
      if (!s.active || !s.visible || s.level <= 0.05) continue;
      const dx = s.bx - s.ax, dy = s.by - s.ay, dz = s.bz - s.az;
      const l2 = dx * dx + dy * dy + dz * dz;
      if (l2 < 1e-6) continue;
      let t = ((x - s.ax) * dx + (y + 0.9 - s.ay) * dy + (z - s.az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = s.ax + dx * t - x, py = s.ay + dy * t - (y + 0.9), pz = s.az + dz * t - z;
      if (px * px + py * py + pz * pz < 0.9 * 0.9) return true;
    }
    return false;
  }
  activeBlades(): number {
    let n = 0;
    const blades = this.cards.sun_blade;
    for (let i = 0; i < blades.length; i++) if ((blades[i] as Slot).active && (blades[i] as Slot).visible) n++;
    return n;
  }

  /** active slots of a pool (tests, stats) */
  activeLines(kind: LineKind): number { return countActive(this.lines[kind]); }
  activeCards(kind: CardKind): number { return countActive(this.cards[kind]); }
  activeRings(): number { return countActive(this.rings.canister) + countActive(this.rings.slam); }
  activeBlobs(): number { return countActive(this.blobs); }

  /** A restart or a warp: one-shot effects stop; handles their owners hold stay theirs. */
  clearTransient(): void {
    this.particles.clear();
    this.decals.clear();
    for (let i = 0; i < this.allSlots.length; i++) { const s = this.allSlots[i] as Slot; if (s.active && !s.persistent) s.active = false; }
    this.flashT0 = -1; this.flashShown = true;
    this.pulseLife[0] = 0; this.pulseLife[1] = 0;
    this.quietUntil = -1;
    this.additiveLoad = 0; this.smokeLoad = 0;
  }

  dispose(): void {
    this.particles.dispose(); this.quads.dispose(); this.decals.dispose(); this.ambient.dispose();
    this.flashMesh.geometry.dispose();
    (this.flashMesh.material as THREE.Material).dispose();
  }
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
/** radius in metres of the ring at the seventh, t = 0..1 of its 1.6 s */
export function ringRadius(t: number): number { const u = clamp01(t); return 40 * u * Math.sqrt(u); }

function countActive(pool: Slot[]): number {
  let n = 0;
  for (let i = 0; i < pool.length; i++) if ((pool[i] as Slot).active) n++;
  return n;
}
