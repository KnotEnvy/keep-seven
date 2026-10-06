// src/enemies/defs.ts: every number of the enemies module, copied from docs/GDD.md with its section.
// Tuning happens in polish rounds, on evidence: change a number here and nowhere else.
import type { Difficulty, DifficultyDef, EnemyDef, EnemyKind } from '../core/contracts.ts';

/** GDD 15, the difficulty table. Health never scales (GDD 7). */
export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: { damageTaken: 0.6, attackTokens: 1, telegraphScale: 1.2, biderDropChance: 0.40, crownKnotRadius: 0.26 },    // GDD 15
  normal: { damageTaken: 1.0, attackTokens: 2, telegraphScale: 1.0, biderDropChance: 0.25, crownKnotRadius: 0.22 },  // GDD 15
  hard: { damageTaken: 1.4, attackTokens: 3, telegraphScale: 0.9, biderDropChance: 0.15, crownKnotRadius: 0.20 },    // GDD 15
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  bider: {
    kind: 'bider', asset: 'enemy_bider',
    hp: 100,                // GDD 7.1
    threat: 1,              // GDD 7.1
    maxAlive: 6,            // GDD 7: never more than 6 alive
    moveSpeed: 5.8,         // GDD 7.1 run
    bodyRadius: 0.3,        // work order 4.2: body capsule r 0.3
    bodyHeight: 1.4,        // GDD 7.1: 1.4 m at the stoop
    volumes: [
      { part: 'crown', shape: 'sphere', node: 'crown', radius: 0.22, priority: 10, damageMultiplier: 1 },             // GDD 7.1 (radius by difficulty, GDD 15)
      { part: 'body', shape: 'capsule', node: 'root', radius: 0.3, height: 1.15, priority: 0, damageMultiplier: 1 },  // to shoulder height
    ],
    attacks: [{ id: 'lunge', kind: 'lunge', damage: 18, token: 'melee', telegraph: 0.5, range: 2.4 }],                // GDD 7.1
  },
  transit: {
    kind: 'transit', asset: 'enemy_transit',
    hp: 200,                // GDD 7.2
    threat: 2,              // GDD 7.2
    maxAlive: 2,            // GDD 7.2
    moveSpeed: 3.5,         // GDD 7.2 walk
    bodyRadius: 0.45,       // drum head 0.45 m across; legs inside 0.55 m
    bodyHeight: 1.9,        // GDD 7.2
    volumes: [
      { part: 'lens', shape: 'sphere', node: 'lens', radius: 0.17, priority: 10, damageMultiplier: 2 },               // GDD 7.2: x2, one shot
      { part: 'body', shape: 'capsule', node: 'root', radius: 0.35, height: 1.8, priority: 0, damageMultiplier: 1 },  // legs and drum
    ],
    attacks: [{ id: 'aim', kind: 'stake', damage: 22, token: 'ranged', telegraph: 0.9, range: 25 }],                  // GDD 7.2
  },
  tamper: {
    kind: 'tamper', asset: 'enemy_tamper',
    hp: 900,                // GDD 7.3 (polish round 4, R1: 1 200 was an ammunition wall, 48 plate hits against 30 carried; round 3: was 600). Five vent hits, a line round is a third
    threat: 4,              // GDD 7.3
    maxAlive: 1,            // GDD 7.3
    moveSpeed: 2.5,         // GDD 7.3 walk
    bodyRadius: 0.8,        // GDD 7.3: 1.6 m wide
    bodyHeight: 2.4,        // GDD 7.3
    volumes: [
      { part: 'vent_chest', shape: 'sphere', node: 'vent_chest_knot', radius: 0.28, priority: 10, damageMultiplier: 2, gatedBy: 'vent_chest_open', gateIgnoredBy: ['line_round'] },   // GDD 7.3
      { part: 'vent_back', shape: 'sphere', node: 'vent_back_knot', radius: 0.28, priority: 10, damageMultiplier: 2, gatedBy: 'vent_back_open', gateIgnoredBy: ['line_round'] },      // GDD 7.3
      { part: 'plate', shape: 'capsule', node: 'root', radius: 0.8, height: 2.4, priority: 0, damageMultiplier: 0.25 },   // GDD 7.3: plate x0.25
    ],
    attacks: [
      { id: 'slam', kind: 'slam', damage: 38, token: 'heavy', telegraph: 1.0, range: 4.5 },      // GDD 7.3
      { id: 'charge', kind: 'charge', damage: 35, token: 'heavy', telegraph: 0.8, range: 20 },   // GDD 7.3
    ],
  },
  windlass: {
    kind: 'windlass', asset: 'boss_windlass',
    hp: 26,                 // GDD 8.2: 26 pips
    threat: 10,
    maxAlive: 1,
    moveSpeed: 0,           // it does not leave the gantry
    bodyRadius: 2.5,        // GDD 8: drum 5.0 m across
    bodyHeight: 6.5,        // GDD 8: hangs from 1.5 to 6.5 m
    volumes: [
      { part: 'mouth', shape: 'sphere', node: 'knot_1_hit', radius: 0.45, priority: 10, damageMultiplier: 1, gatedBy: 'mouth_open' },   // GDD 8
      { part: 'mouth', shape: 'sphere', node: 'knot_2_hit', radius: 0.45, priority: 10, damageMultiplier: 1, gatedBy: 'mouth_open' },
      { part: 'mouth', shape: 'sphere', node: 'knot_3_hit', radius: 0.45, priority: 10, damageMultiplier: 1, gatedBy: 'mouth_open' },
      { part: 'mouth', shape: 'sphere', node: 'knot_4_hit', radius: 0.45, priority: 10, damageMultiplier: 1, gatedBy: 'mouth_open' },
      { part: 'mouth', shape: 'sphere', node: 'knot_5_hit', radius: 0.45, priority: 10, damageMultiplier: 1, gatedBy: 'mouth_open' },
      { part: 'mouth', shape: 'sphere', node: 'knot_6_hit', radius: 0.45, priority: 10, damageMultiplier: 1, gatedBy: 'mouth_open' },
      { part: 'pawl', shape: 'sphere', node: 'pawl_l_hit', radius: 0.3, priority: 10, damageMultiplier: 1 },             // GDD 8.2 phase 2
      { part: 'pawl', shape: 'sphere', node: 'pawl_r_hit', radius: 0.3, priority: 10, damageMultiplier: 1 },
      { part: 'guard', shape: 'box', node: 'drum_spin', radius: 2.3, priority: 5, damageMultiplier: 0, gatedBy: 'guard_down' },   // disc 4.6 m across
      { part: 'shutter', shape: 'box', node: 'drum_spin', radius: 2.5, priority: 0, damageMultiplier: 0 },                         // shut lids and drum face
    ],
    attacks: [
      { id: 'stake', kind: 'stake', damage: 25, token: 'none', telegraph: 0.9, range: 30 },      // GDD 8.2 phase 1
      { id: 'canister', kind: 'canister', damage: 38, token: 'none', telegraph: 0.9, range: 30 },
      { id: 'lance', kind: 'lance', damage: 30, token: 'none', telegraph: 1.2, range: 15 },      // GDD 8.2 phase 2
      { id: 'fan', kind: 'fan', damage: 18, token: 'none', telegraph: 1.2, range: 30 },          // GDD 8.2 phase 3a
    ],
  },
};

// ---- shared rules (GDD 7, work order 4.1) ------------------------------------------------------------------
export const CAPS = {
  aliveOutsideBoss: 6,            // GDD 7
  addsWithBoss: 3,                // GDD 7: boss + 3
  subMelee: 2, subRanged: 1, subHeavy: 1,   // GDD 7
  tokenCooldown: 0.6,             // GDD 7
  attackStartGap: 0.3,            // GDD 7
  thinkEveryTicks: 6,             // GDD 7: AI thinks at 10 Hz
  sightRaysPerTick: 4,            // GDD 7: at most 4 line-of-sight rays per frame
  viewConeCos: Math.cos(50 * Math.PI / 180),   // "outside the view cone": more than 50 degrees off her view, measured on the horizontal angle (a 62 degree vertical FOV at 16:9 is 94 degrees across)
  viewNear: 1.5,                  // a body this close in front of her (within 90 degrees of her facing) is in view whatever the angle to its feet
  behindCueRange: 6,              // GDD 7: no attack from behind within 6 m without its cue: there the tell is never shortened (Shared.tellScale)
  fastTargetSpeed: 3,             // work order 4.1: ranged accuracy x0.8 against a player faster than 3 m/s
  fastTargetAccuracy: 0.8,
  hitFreeze: 0.05,                // GDD 6.8: 50 ms on a hit
  killFreeze: 0.07,               // GDD 6.8: 70 ms on a kill or a freeing
  staticAfter: 3.0,               // GDD 7.1: after 3 s the body is an instanced static mesh
  lineRoundDamage: 300,           // GDD 6.7 / ARCHITECTURE 3.6: a flat 300, no multiplier
} as const;

// ---- bider (GDD 7.1) ---------------------------------------------------------------------------------------
export const BIDER = {
  windupRange: 2.4, circleRange: 3.0, circleSpeed: 3.0, barkEvery: 1.5,
  windup: 0.5, lunge: 0.35, lungeDistance: 2.2, lungeReach: 1.8, recover: 0.6,
  /**
   * Polish round 2: the lunge's one hit lands no earlier than this into the 0.35 s state (7 ticks: the body has by then
   * travelled 0.75 of its 2.2 m). It used to land on the first tick, from 2.3 m, before anything had visibly moved.
   */
  strikeAfter: 0.12,
  /**
   * Polish round 2: no two Biders' centres closer than this (bodies are 0.6 m across). A positional push-apart after
   * the steering step, at most `separateStep` metres a tick each, so nothing pops (index.ts separateBiders).
   */
  separateMin: 0.95, separateStep: 0.07,
  /**
   * Polish round 3: `separateMin` 0.75 -> 0.95 (three or four round a standing player settled 0.6 m apart, shoulders
   * and arms through one another); and a circling Bider holds rather than strafe within 50 degrees (seen from her) of
   * the one ahead of it on the 3 m ring.
   */
  circleGapCos: Math.cos(50 * Math.PI / 180),
  /**
   * The lunging body stops this far from her axis; the 1.8 m reach is unchanged, so the strike still lands. Fix round 1:
   * by the written numbers (wind-up at 2.4 m, 2.2 m forward) it ended 0.1 m from a standing player, inside the camera.
   * The lunge clip throws the head 0.5 m ahead of the root at 0.9 m height: at 1.5 m its knot is inside a level
   * 62 degree view (at 0.9 m it is under the frame until the recover ends: shots/code-enemies/fix_bider_recover_lookdown.png).
   */
  standOff: 1.5,
  stumbleFelled: 0.4, stumbleFelledRange: 1.2, stumbleKnot: 0.5, stumbleKnotRange: 4.0,
  falter: 2.0, falterBack: 2.0,
  dieBack: 0.9, thrown: 1.2, sitDown: 0.9,
  rise: { kneel_to_stand: 1.0, rise_from_seat: 1.2, turn_about: 1.5, climb_out: 1.2 } as Readonly<Record<string, number>>,
  /** approach offsets in open ground, degrees: groups fan (GDD 7.1) */
  fanDeg: [0, 12, -12, 25, -25] as readonly number[],
  laneSpacing: 1.6,               // GDD 10: in file, 1.6 m apart
  lostSightAfter: 1.0,            // GDD 7.1: last known position after 1 s without sight
  /** polish round 4: straight at her only within this much height of her; beyond it the nav graph (ramps, stairs) */
  directLevel: 1.2,
  cupDetachAt: 0.4,               // work order 4.6: frame 12 of kneel_to_stand
  hoodScale: 0.05,                // ART_BIBLE 7: +-5 % hood scale
  /** four workcloth tints (ART_BIBLE 7: variation without new meshes), multipliers on the authored colour */
  // integration: the wider spread art-enemies-bider asked for (in a file of six the first four were hard to tell apart at 5 m)
  tints: [[1, 1, 1], [0.72, 0.70, 0.70], [1.15, 1.05, 0.90], [0.90, 0.95, 1.0]] as readonly (readonly [number, number, number])[],
} as const;

// ---- transit (GDD 7.2) -------------------------------------------------------------------------------------
export const TRANSIT = {
  emerge: 1.2, plant: 0.3, aim: 0.9, threadFreeze: 0.25, headStill: 0.4, fire: 0.25, cooldown: 1.2,
  /**
   * Polish round 4 (R1): the pause between two stakes by difficulty. The yard was harder than the Windlass for a
   * middling shot (a death each run, 174 and 212 HP of stakes): 0.3 s more on Normal and Easy. Hard keeps GDD 7.2's 1.2.
   */
  cooldownBy: { easy: 1.5, normal: 1.5, hard: 1.2 } as Readonly<Record<Difficulty, number>>,
  shotsPerPoint: 2, bandMin: 12, bandMax: 25, backOff: 8, pointReuse: 10,
  stakeSpeed: 18, stakeRadius: 0.15,
  sight: 40, coneCos: Math.cos(60 * Math.PI / 180),   // 120 degree cone
  sidestep: 0.4, sidestepDistance: 1.5, sidestepAfter: 0.6, sidestepBeyond: 10, sidestepEvery: 3,
  flinch: 0.25, dieFold: 1.0,
  /** firing-point score (GDD 7.2 "scored: line of sight, band, unoccupied, not used in the last 10 s") */
  scoreSight: 15, scoreBand: 20, scoreReused: 8, scoreNamed: 8, scorePerMetre: 0.3,
  /** planted without a sight of her this long, it looks for a point that has one; after `blindGiveUp` it moves anyway */
  blindAfter: 2.5, blindGiveUp: 6,
  /** planted blind this long with no authored point in sight of her, it walks toward her until it sees her (at most `seekMax` seconds a go) */
  seekAfter: 3.0, seekMax: 12,
  /** polish round 3: a seek that ended without a sight of her holds where it stands this long before it thinks of moving again */
  seekHold: 6,
  /** polish round 3: a seeking Transit holds this far short of another Transit that stands on its way */
  seekApart: 1.8,
  /**
   * Polish round 4: a Transit held blind behind another that has a sight of her (the second one through the yard door
   * stood in the doorway for 70 s) goes on past it after `passAfter` seconds without a sight, and plants where it sees
   * her at least `passApart` from every other Transit. A pass that finds no such place holds `passRetry` before the next.
   */
  passAfter: 6, passApart: 2.0, passRetry: 12,
  /** the crosshair "rests on it": her aim ray passes within this of the body's axis between these heights (legs to drum) */
  crosshairRadius: 0.45, crosshairLow: 0.3, crosshairHigh: 1.7,
  /** the bell vignette: after the stake it turns to her, and the scene is held this long so it runs about 4 s (work order 4.6: 1.2 + 0.3 + 0.9 + 0.25 + 1.35) */
  bellTurn: 1.35,
  missOffset: 1.1,                // a deliberate miss passes this far beside her (capsule 0.35 + stake 0.15 + margin)
} as const;

// ---- stakes (GDD 7.2, 8.3) ---------------------------------------------------------------------------------
export const STAKES = {
  inFlight: 8, stuck: 18, hitRadius: 0.30, coolSeconds: 6, life: 4,
} as const;

// ---- tamper (GDD 7.3) --------------------------------------------------------------------------------------
export const TAMPER = {
  turnWalk: 90, turnCharge: 20,   // degrees per second
  slamRange: 4.5, slamWindup: 1.0, slam: 0.3, slamRadius: 3.5, slamRecover: 1.5, slamVentOpen: 0.5,
  /**
   * Polish round 5 (R1, the playthrough critic): the slam's wind-up by difficulty, before `telegraphScale`. The Tamper
   * was the stage's peak, above the Windlass: a 0.5 s-reaction proxy died to it twice (slam 178 of 248 damage). 0.15 s
   * more tell on Normal and Easy (Easy: 1.15 x 1.2 = 1.38 s); Hard keeps GDD 7.3's 1.0. The vent's window is unchanged:
   * it still opens `slamVentLateBy` before the arm comes down. The clip (authored for `slamWindup`) is played slower.
   */
  slamWindupBy: { easy: 1.15, normal: 1.15, hard: 1.0 } as Readonly<Record<Difficulty, number>>,
  /** polish round 3 (R3): the chest vent opens this long before the arm comes down, not for the whole wind-up (GDD 7.3 follows) */
  slamVentLate: 0.6,
  /**
   * Polish round 4 (R1): how long before the arm comes down the chest vent opens, by difficulty (tamper.ts reads this
   * table; `slamVentLate` above is Normal's value, kept for the tests that name it). Easy: the whole 1.0 s wind-up.
   * Normal and Hard keep the late vent: open through the whole wind-up, a round on sight cancelled every slam and the
   * fight cost nothing (round 3). The ammunition wall of round 4 is answered with health (900) and the repeating
   * packet (world/director.ts), not with a wider vent.
   */
  slamVentLateBy: { easy: 1.0, normal: 0.6, hard: 0.6 } as Readonly<Record<Difficulty, number>>,
  /** polish round 4: a charge is stunned by a wall, a rib or the cabinet only once it has pushed the body this far off its line (metres, summed while in contact); a shallower graze is slid past */
  grazeDepth: 0.25,
  /** polish round 4: after a slam that hit her, no new attack starts until this long after its recover (seconds) */
  slamAfterHit: 1.5,
  /** polish round 4: walking into something for 0.5 s without getting on, it walks the graph for this long instead of straight at her */
  unwedge: 3.0,
  /** polish round 4: it walks straight at her only within this much height of her; off her level it walks the graph (the gantry ramp) */
  directLevel: 0.6,
  chargeMin: 8, chargeMax: 20, chargeWindup: 0.8, chargeSpeed: 9, chargeDistance: 22, chargeEvery: 4, chargeStun: 2.0,
  stagger: 1.5,
  /** polish round 4 (R1): 1.8 s (GDD 7.3 said 3.0). At 900 HP a line round through a knot and the three vent shots 3.0 s gave room for were the whole Tamper in one stagger; 1.8 s buys two */
  lineStagger: 1.8, flinchPlate: 0.2, pushback: 0.2, die: 2.2,
  ventDamage: 200,                // GDD 7.3: vents x2
  /** polish round 4: a lead round counts in an open vent only from that vent's side: up to about 17 degrees past square-on (the horizontal cosine between the round and the body's facing) */
  ventSide: 0.3,
  plateDamage: 25,                // GDD 7.3: plate x0.25
  /** the pounding loop of the vignette (clip pound_bulkhead, 2.6 s): the chest vent is open through the wind-up, the ram lands at `strikeAt` */
  poundLoop: 2.6, poundWindup: 1.1, poundStrikeAt: 1.3,
  /** where a slam lands, in front of the body (the reach of the tamping arm) */
  slamReach: 1.6,
  /** vent lids: +80 degrees about the bone's local X axis is fully open (art-boss 4.2, "Convention for code"). RE-CHECK when final art lands. */
  ventOpenDeg: 80, ventAxis: [1, 0, 0] as readonly [number, number, number],
} as const;

// ---- the Windlass (GDD 8) ----------------------------------------------------------------------------------
export const BOSS = {
  pipsP1: 10, pipsP2: 10, pipsP3: 6, pipsTotal: 26,      // GDD 8.2
  arcDeg: 35,                    // GDD 8: aims only within +-35 degrees of the arm's heading
  indexStep: 1.5,                // GDD 8: 1.5 s per 60 degree step
  overshootDeg: 2, settle: 0.2,  // art-boss: a 2 degree overshoot and settle
  transition: 3.0,               // GDD 8.2: phase transitions 3 s, invulnerable
  breakScale: 0.3, breakSeconds: 0.3,
  // parley (GDD 8.1), seconds from the door sealing
  parley: { line1: 0, narrator: 5.5, ask: 10, line2: 14.5, line3: 19, line4: 23, windowEnd: 27, phase1: 28 },
  /**
   * Polish round 3 (R2): the inspection gives at most this many of phase 1's ten hits (it was all six a quick hand could
   * land: phase 1 was then over in 21 s on a first try, before its pattern had been seen once). On the last one the lids shut.
   */
  parleyGift: 2,
  // phase 1
  p1Glow: 0.9, p1Index: 0.2, p1Haul: 3.0,
  /**
   * Polish round 3 (R2): phase 1 rests this long after each notch, lids shut, before the next chamber opens. With a lit
   * knot counting whenever its mouth stands open, six chambers 1.1 s apart were a hit a second: phase 1 was over in
   * 20 s. The beat also gives each tell its own moment (and her time to step behind a rib).
   */
  p1Rest: 0.8,
  p1Order: ['stake', 'stake', 'canister', 'stake', 'stake', 'canister'] as readonly ('stake' | 'canister')[],
  stakeSpeed: 20, stakeDamage: 25,
  canisterFlight: 1.2, canisterRing: 3.5, canisterFuse: 1.0, canisterDamage: 38, canisterRings: 2,
  // phase 2
  p2Glow: 0.8, p2Haul: 6.5, p2OpenGuaranteed: 4.5,
  p2Order: ['stake', 'canister', 'lance', 'stake', 'canister'] as readonly ('stake' | 'canister' | 'lance')[],
  lanceThread: 1.2, lanceSweep: 2.5, lanceArcDeg: 70, lanceDamage: 30, lanceHeight: 1.2, lanceRange: 15,
  lineThroughGuard: 3,           // GDD 8.2: fixed at 3 hits
  p2AddsPerHaul: 2, p2AddsAlive: 3, p2AddsTotal: 6,
  // phase 3a
  p3Spin: 40, fanSpinUp: 1.2, fanSeconds: 1.2, fanStakes: 6, fanSpreadDeg: 24, fanDamage: 18, fanDamageT4: 9, fanMaxHits: 2,
  p3Haul: 3.0, p3HaulT4: 6.0, relight: 4.0, relightThread: 1.0,
  chargeRequiredAt: 12, headDry: 6.0,
  /**
   * Polish round 2: in phase 3a `stn_boss_hauling` is said once (the caption and the lamps carry every later haul), and
   * `stn_boss_charge_required` is said again this often until the kept round has been loaded: fourteen HAULINGs in 75 s
   * had buried the one instruction that matters (scratch/r2-story-ux/p3.log).
   */
  chargeRepeat: 20,
  p3AddsAlive: 3, p3AddEvery: 8, p3AddsTotal: 9,
  // the hush and the proof
  hushScale: 0.5, hushSeconds: 1.8, hushSwing: 1.5, proofFreeze: 4.0,
  hushSlowEvery: 3.0,            // unscaled seconds between two hush slow-motion runs (a re-load inside it does not restart the 1.8 s)
  // phase 3b
  drySpin: 15, dryEvery: 1.1, dryHaulGap: 4.0,
  killScale: 0.2, killSeconds: 0.6, runDown: 2.4, sag: 3.0, afterSag: 3.0,
  // adds (GDD 10, LEVEL 8)
  addMinDistance: 7, addRetry: 1.0,
  addGrateClear: 1.0,            // an add does not rise through a body within this of its grate (fix round 1)
  mercyDeaths: 1, mercyScale: 0.85,
  /**
   * Polish round 5 (the playthrough critic): a respawn or a continue into a fighting phase. The head holds its first
   * attack this long (it was 1.5 s: a player who stood to get her bearings was dead again in 9 to 10 s, three times
   * running), and on the difficulties named she comes back with full health (the checkpoint gave 67).
   */
  retryLead: 4.0,
  retryFullHealth: { easy: true, normal: true, hard: false } as Readonly<Record<Difficulty, boolean>>,
  /**
   * Polish round 5 (the story critic): phase 3b's two HAULINGs and the narrator's line are said only when the line box
   * has been free this long (so they are shown at once, never queued behind the narrator): one queued at dry + 8 s was
   * shown 9.5 s after the Windlass had died, after THANK YOU FOR YOUR PATIENCE.
   */
  dryLineQuiet: 0.5,
  /** polish round 3 (R2): the teaching line is said at the first haul of a try from this many deaths on: 0 = every try, the first included */
  teachDeaths: 0,
  /** polish round 3 (R2): false = a burst pawl stays burst for the rest of phase 2 (it was reset at the end of every haul: 110 to 290 s phases) */
  pawlsReset: false as boolean,
  /** polish round 3 (R2): while it hauls in phase 1 or 2 the arm indexes to the bay she is in, mouths open (it was fixed until the next pattern) */
  haulFollows: true as boolean, haulFollowStep: 0.5,
  /**
   * Said at the first haul of each try of phase 1 or 2 (`teachDeaths`): the ribs stop what it throws, and the six stand
   * open while it hauls. Said only when design/story.json has the key.
   */
  teachKey: 'hint_boss_haul',
  knotRadius: 0.45, pawlRadius: 0.3,
  mouthSeconds: 0.2,
  haulLamps: 6,
} as const;

/**
 * Polish round 4 (the combat critic): Hard played the Windlass at Normal's lengths with only more damage. On Hard the
 * rest after each phase-1 notch is shorter and its stakes fly faster (GDD 15). Normal and Easy are 1 and 1.
 */
export const BOSS_BY: Readonly<Record<Difficulty, { p1RestScale: number; stakeSpeedScale: number }>> = {
  easy: { p1RestScale: 1, stakeSpeedScale: 1 },
  normal: { p1RestScale: 1, stakeSpeedScale: 1 },
  hard: { p1RestScale: 0.5, stakeSpeedScale: 1.15 },
};

/** GDD 8.3: no hit over 38. */
export const MAX_HIT = 38;

// ---- walk clips against ground speed (integration, polish round 2: docs/requests/art-boss-tamper.md 5, art-enemies-transit.md 2)
// The art's walk cycles are authored for a ground speed (the Tamper's 0.9 m legs reach 1.667 m/s at the clip's own pace,
// the Transit's stride is 2.8 m/s); the GDD's speeds are faster. The GDD's speeds stand (the fights are timed on them):
// the clips are played faster by the ratio, so no foot slides.
/** GDD 7.3: 2.5 m/s against a clip authored for 1.667 m/s: a brisk two-beat stamp, 0.8 s a cycle */
export const TAMPER_WALK_RATE = 2.5 / 1.667;
/** GDD 7.2: 3.5 m/s (relocate) against a clip authored for 2.8 m/s */
export const TRANSIT_WALK_RATE = 3.5 / 2.8;
