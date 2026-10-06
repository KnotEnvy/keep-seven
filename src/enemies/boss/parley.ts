// src/enemies/boss/parley.ts: the asking (GDD 8.1; skipped on a retry). From the door sealing:
//   stn_parley_1 0-5.5 s, nar_parley 5.5-10, rv_ask 10-14.5, stn_parley_2 14.5-19, stn_parley_3 19-23,
//   stn_parley_4 23-27 with all six mouths open for 4.0 s from the tick the line appears, phase 1 at 28 s.
// A player who held fire gets a free cylinder into six open knots and nar_parley_kept. Any shot before stn_parley_4:
// a clank, stn_parley_refused, phase 1 at once. The clock is unscaled seconds of simulation.
import { BOSS } from '../defs.ts';
import type { Boss } from './index.ts';

const P = BOSS.parley;
/** [seconds from the seal, story key] in order (the machine's own clock: work order 4.8) */
export const PARLEY_LINES: readonly (readonly [number, string])[] = [
  [P.line1, 'stn_parley_1'], [P.narrator, 'nar_parley'], [P.ask, 'rv_ask'], [P.line2, 'stn_parley_2'], [P.line3, 'stn_parley_3'], [P.line4, 'stn_parley_4'],
];
const EPS = 1e-6;

export function startParley(B: Boss): void {
  B.sub = 'rest';
  B.parleyStage = 0;
  B.refused = false;
  B.hits = 0;
  B.setPhase('parley');
  B.parleyEvent('start');
  // it indexes to face her and dips: an acknowledgement
  const from = B.arm.bay, to = B.playerBay();
  const seconds = B.arm.indexTo(to);
  if (seconds > 0) { B.indexingEvent(from, to, seconds); B.cue('ratchet'); }
  B.playBody('present');
}

/** The asking is over: phase 1 begins, with whatever the free cylinder took already counted. */
function toPhaseOne(B: Boss, lead: number): void {
  B.parleyHeard = true;
  B.setAllMouths(false);
  B.clearDark();
  B.lead = lead;
  B.sub = 'transition';
  B.setPhase('p1');
}

export function tickParley(B: Boss): void {
  const clock = B.ut;
  while (B.parleyStage < PARLEY_LINES.length) {
    const line = PARLEY_LINES[B.parleyStage] as readonly [number, string];
    if (clock < line[0] - EPS) break;
    B.parleyStage++;
    B.S.say(line[1]);
    if (line[1] === 'stn_parley_4') {
      // the inspection: all six mouths open for 4.0 s, starting on the tick the line appears
      for (let i = 0; i < 6; i++) B.setMouth(i, true, true);
      B.parleyEvent('inspection');
    }
  }
  if (B.parleyStage === PARLEY_LINES.length && clock >= P.windowEnd - EPS) {
    B.parleyStage++;
    for (let i = 0; i < 6; i++) B.setMouth(i, false, true);
    B.parleyEvent('kept');
    B.S.say('nar_parley_kept');
  }
  if (clock >= P.phase1 - EPS) {
    B.parleyEvent('end');
    toPhaseOne(B, 0);
  }
}

/** A shot during the parley. Before stn_parley_4 it is a refusal: nothing is lost by impatience but the advantage. */
export function parleyShot(B: Boss): void {
  if (B.ut >= P.line4 - EPS || B.refused) return;
  B.refused = true;
  B.S.say('stn_parley_refused');
  B.parleyEvent('refused');
  toPhaseOne(B, 0.5);
}
