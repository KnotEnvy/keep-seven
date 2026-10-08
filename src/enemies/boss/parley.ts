// src/enemies/boss/parley.ts: the asking (GDD 8.1; skipped on a retry). The written timeline, from the door sealing
// (closing of pass i3: one roll-call line):
//   stn_parley_1 0-3.5 s, nar_parley 3.5-7.5, rv_ask 7.5-11.5, stn_parley_2 (the whole roll-call) 11.5-16,
//   stn_parley_4 16-20 with all six mouths open for 4.0 s from the tick the line appears, phase 1 at 21 s.
// A player who held fire gets a free cylinder into six open knots and nar_parley_kept. Any shot before the inspection:
// a clank, stn_parley_refused, phase 1 at once. The clock is unscaled seconds of simulation.
//
// Release pass p0 (the story critic: the text ran about 9 s behind the machine when she walked straight in from the
// cradle, the six chambers stood open for inspection under the chamber roll-call, and the line that teaches the rule
// appeared 3.7 s into phase 1). The timeline is now held to the lines AS SHOWN: each line is said when the one before
// it has been on screen for its written time; a line that has to wait its turn behind the narrator shifts everything
// behind it by as much (`Boss.parleyShift`); the mouths open on the tick `stn_parley_4` comes on screen (`parleyShown`,
// from `story/line`), and the close, `nar_parley_kept` and phase 1 follow that tick by the written 4 s and 5 s. Where
// nothing shows lines (the sandboxes: `Boss.storyLive` false) the written timeline runs unchanged, and a line that is
// never shown (dropped by the queue) holds its stage `BOSS.parleyLineWait` seconds and no longer.
//
// Pass i3 (story reviewer a: 29.9 s of standing between the seal and phase 1, and the same again on a second play).
//   1. The written clock is no longer a table of this file: a line's stage lasts as long as the line is HELD, which is
//      what `story/line` reports when it comes on screen (the world's hold) and `design/story.json` `seconds` where
//      nothing shows lines. A line the story data does not carry is not asked for (a roll-call merged into one line
//      needs no change here). Shorter text in the data is a shorter asking, to the tick.
//   2. The roll-call is shown as well as said: the six mouth lamps are dark from the seal and come on one by one as
//      their chambers are named, spread over the roll-call lines as held (`rollLamps`).
//   3. A second hearing can be cut short. Once an asking has been heard out or refused in this page (`Boss.askedBefore`:
//      a new run does not forget it), a shot before the inspection is not a refusal: the machine goes straight to
//      `stn_parley_4` and the open mouths, so nothing is lost by it but the round (`parleySkip`).
import { BOSS } from '../defs.ts';
import type { Boss } from './index.ts';

const P = BOSS.parley;
/**
 * [seconds from the seal, story key] in order: the written times of pass i2's text, used for a key whose `seconds` the
 * story data does not carry (a stub's data). The clock that runs is `parleyPlan`'s.
 */
export const PARLEY_LINES: readonly (readonly [number, string])[] = [
  [P.line1, 'stn_parley_1'], [P.narrator, 'nar_parley'], [P.ask, 'rv_ask'], [P.line2, 'stn_parley_2'], [P.line4, 'stn_parley_4'],
];
const INSPECTION = 'stn_parley_4';
const EPS = 1e-6;
/** however the lines fare, phase 1 begins no later than this after the seal (the asking cannot hang) */
const HARD_END = P.phase1 + 60;
/** the open mouths, and the beat between their shutting and phase 1 */
const WINDOW = P.windowEnd - P.line4, AFTER = P.phase1 - P.windowEnd;

/** The asking as the story data has it: the keys that exist, in order, and the seconds each is held (pure: logic.spec.ts). */
export function parleyPlan(lines: Readonly<Record<string, { seconds?: number } | undefined>>, keys: string[], holds: number[]): number {
  keys.length = 0; holds.length = 0;
  for (let i = 0; i < PARLEY_LINES.length; i++) {
    const line = PARLEY_LINES[i] as readonly [number, string];
    const data = lines[line[1]];
    // (the inspection is the machine's own stage: it runs whatever the data says)
    if (data === undefined && line[1] !== INSPECTION) continue;
    const next = PARLEY_LINES[i + 1];
    const written = (next ? next[0] : P.windowEnd) - line[0];
    keys.push(line[1]);
    holds.push(data !== undefined && typeof data.seconds === 'number' && data.seconds > 0 ? data.seconds : written);
  }
  return keys.length;
}

/** Is `keys[i]` a roll-call line: the station's, between its first line and the inspection? */
function isRoll(keys: readonly string[], i: number): boolean {
  return i > 0 && i < keys.length - 1 && (keys[i] as string).startsWith('stn_');
}

export function startParley(B: Boss): void {
  B.sub = 'rest';
  B.parleyStage = 0;
  B.refused = false; B.parleySkipped = false;
  B.parleyAwait = ''; B.parleySaidAt = 0; B.parleyShift = 0; B.inspectAt = -1;
  B.parleyDue = 0; B.parleyWritten = 0; B.keptSaid = false;
  parleyPlan(B.S.ctx.data.story.lines, B.parleyKeys, B.parleyHolds);
  B.rollLines = 0;
  for (let i = 0; i < B.parleyKeys.length; i++) if (isRoll(B.parleyKeys, i)) B.rollLines++;
  B.rollLine = -1; B.rollAt = 0; B.rollHold = 0; B.rollLit = 0;
  // the six lamps wait to be named (with no roll-call in the data they stand lit, as at rest)
  if (B.rollLines > 0) for (let i = 0; i < 6; i++) B.lamp[i] = 0;
  B.hits = 0;
  B.setPhase('parley');
  B.parleyEvent('start');
  // it indexes to face her and dips: an acknowledgement
  const from = B.arm.bay, to = B.playerBay();
  const seconds = B.arm.indexTo(to);
  if (seconds > 0) { B.indexingEvent(from, to, seconds); B.cue('ratchet'); }
  B.playBody('present');
}

function lampsOn(B: Boss): void { for (let i = 0; i < 6; i++) B.lamp[i] = 1; B.rollLit = 6; }

/** The asking is over: phase 1 begins, with whatever the free cylinder took already counted. */
function toPhaseOne(B: Boss, lead: number): void {
  B.parleyHeard = true;
  B.askedBefore = true;
  B.parleyAwait = '';
  B.setAllMouths(false);
  B.clearDark();
  lampsOn(B);
  B.lead = lead;
  B.sub = 'transition';
  B.setPhase('p1');
}

/**
 * A parley line is on screen for `seconds` (0: nothing shows lines, the data's time): the stage behind it is due when
 * it has been read. `gaveUp`: it never came on screen in `parleyLineWait` seconds; the line after it is due now (the
 * time the lost line would have held is not waited too).
 */
function shown(B: Boss, key: string, seconds: number, gaveUp = false): void {
  B.parleyAwait = '';
  const i = B.parleyKeys.indexOf(key);
  if (i < 0) return;
  const hold = gaveUp ? 0 : seconds > 0 ? seconds : B.parleyHolds[i] as number;
  B.parleyWritten += B.parleyHolds[i] as number;
  // (where nothing shows lines the stages are a clock: each is due its hold after the one before was DUE, without drift)
  B.parleyDue = B.storyLive ? B.ut + hold : B.parleyDue + hold;
  B.parleyShift = B.parleyDue - B.parleyWritten;
  if (isRoll(B.parleyKeys, i) && !gaveUp) {
    let n = 0;
    for (let k = 1; k < i; k++) if (isRoll(B.parleyKeys, k)) n++;
    B.rollLine = n; B.rollAt = B.ut; B.rollHold = hold;
  }
  if (key === INSPECTION && B.inspectAt < 0) {
    // the inspection: all six mouths open for 4.0 s, starting on the tick the line appears
    B.inspectAt = B.ut;
    lampsOn(B);
    for (let m = 0; m < 6; m++) B.setMouth(m, true, true);
    B.parleyEvent('inspection');
  }
}

/** `story/line` during the asking (boss/index.ts onLine). */
export function parleyShown(B: Boss, key: string, seconds: number): void {
  if (B.parleyAwait !== '' && key === B.parleyAwait) shown(B, key, seconds);
}

/**
 * The roll-call, shown: the lamp of each chamber comes on as it is named. A line that names `per` chambers lights them
 * at the middles of `per` equal parts of the time it is held; whatever a lost line did not light is lit by the next.
 */
function rollLamps(B: Boss): void {
  if (B.rollLit >= 6 || B.rollLine < 0 || B.rollLines <= 0) return;
  const per = 6 / B.rollLines;
  const f = B.rollHold > 0 ? (B.ut - B.rollAt) / B.rollHold : 1;
  const want = Math.min(6, Math.floor(B.rollLine * per + Math.min(per, Math.max(0, f * per + 0.5)) + EPS));
  while (B.rollLit < want) {
    B.lamp[B.rollLit] = 1;
    B.rollLit++;
    B.lampTick();
  }
}

export function tickParley(B: Boss): void {
  const clock = B.ut;
  if (clock >= HARD_END) { B.parleyEvent('end'); toPhaseOne(B, 0); return; }
  // the line said last has not come on screen yet: it holds the stages behind it, for `parleyLineWait` at most
  if (B.parleyAwait !== '' && clock - B.parleySaidAt >= BOSS.parleyLineWait - EPS) shown(B, B.parleyAwait, 0, true);
  while (B.parleyAwait === '' && B.parleyStage < B.parleyKeys.length) {
    if (clock < B.parleyDue - EPS) break;
    const key = B.parleyKeys[B.parleyStage] as string;
    B.parleyStage++;
    if (B.storyLive) {
      // (set before the line is asked for: a free line box may show it inside the call)
      B.parleyAwait = key; B.parleySaidAt = clock;
      B.S.say(key);
    } else {
      B.S.say(key);
      shown(B, key, 0);
    }
  }
  rollLamps(B);
  if (B.inspectAt < 0) return;
  if (!B.keptSaid && clock >= B.inspectAt + WINDOW - EPS) {
    B.keptSaid = true;
    for (let i = 0; i < 6; i++) B.setMouth(i, false, true);
    B.parleyEvent('kept');
    B.S.say('nar_parley_kept');
  }
  if (clock >= B.inspectAt + WINDOW + AFTER - EPS) {
    B.parleyEvent('end');
    // (where lines are shown, the first tell waits for `nar_parley_kept` to be read: defs.ts `parleyKeptLead`)
    toPhaseOne(B, B.storyLive ? BOSS.parleyKeptLead : 0);
  }
}

/**
 * A shot during the parley. Before the inspection it is a refusal: nothing is lost by impatience but the advantage.
 * Pass i3: when she has heard an asking before in this page it is no refusal but a skip. The lines not yet asked for
 * are passed over, `stn_parley_4` is asked for at once and the six open when it comes on screen (behind the line that
 * is up: 5.5 s at most); a second impatient shot before then changes nothing.
 */
export function parleyShot(B: Boss): void {
  if (B.inspectAt >= 0 || B.refused) return;
  if (B.askedBefore) {
    if (B.parleySkipped) return;
    B.parleySkipped = true;
    const at = B.parleyKeys.indexOf(INSPECTION);
    if (B.parleyStage <= at) {
      // (a line asked for and not yet shown keeps its turn: the inspection is asked for behind it)
      for (let i = B.parleyStage; i < at; i++) B.parleyWritten += B.parleyHolds[i] as number;
      B.parleyStage = at;
      if (B.parleyAwait === '') B.parleyDue = B.ut;
    }
    lampsOn(B);
    B.cue('ratchet');
    return;
  }
  B.refused = true;
  B.S.say('stn_parley_refused');
  B.parleyEvent('refused');
  toPhaseOne(B, 0.5);
}
