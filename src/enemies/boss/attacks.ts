// src/enemies/boss/attacks.ts: the Windlass's pattern clocks (GDD 8.2).
//   phase 1: index, six discharges of 1.1 s (0.9 glow + 0.2 index) stake stake canister stake stake canister, haul 5.0 s
//   phase 2: guard set; index, stake canister lance stake canister (7.7 s), haul 6.5 s with the pawls and two adds
//   phase 3a: the drum spins free; index, fan (1.2 s spin-up + six stakes in 1.2 s), haul 3.0 s; relights; adds
//   phase 3b: dry clicks every 1.1 s, no damage possible; six hits, then the kill sequence
import { BOSS, BOSS_BY } from '../defs.ts';
import type { Boss } from './index.ts';
import { indexSteps } from './arm.ts';

/** timers compare with a hair of slack, so a 0.9 s glow is 54 ticks and not 55 */
const EPS = 1e-6;

/** The pattern of a cylinder phase and the seconds each discharge takes (pure: the tests read it). */
export function patternOf(phase: 'p1' | 'p2'): readonly ('stake' | 'canister' | 'lance')[] { return phase === 'p1' ? BOSS.p1Order : BOSS.p2Order; }
export function slotSeconds(phase: 'p1' | 'p2', kind: 'stake' | 'canister' | 'lance'): number {
  if (kind === 'lance') return BOSS.lanceThread + BOSS.lanceSweep;
  return phase === 'p1' ? BOSS.p1Glow + BOSS.p1Index + BOSS.p1Rest : BOSS.p2Glow + BOSS.p1Index;
}
export function patternSeconds(phase: 'p1' | 'p2'): number {
  let s = 0;
  for (const k of patternOf(phase)) s += slotSeconds(phase, k);
  return s;
}

/** Before each pattern it indexes to the bay she is in: 1.5 s per 60 degree step, mouths shut while moving. */
export function beginIndex(B: Boss): void {
  const to = B.playerBay();
  const from = B.arm.bay;
  if (B.phase !== 'p3a') B.setAllMouths(false);
  B.discharging = -1;
  B.sub = 'index'; B.t = 0;
  const seconds = B.arm.indexTo(to);
  if (seconds > 0) {
    B.indexingEvent(from, to, seconds);
    B.S.say('stn_boss_indexing');
    B.cue('ratchet');
  }
}

function beginPattern(B: Boss): void {
  B.sub = 'pattern'; B.t = 0;
  B.step = 0; B.slotT = 0; B.slotFired = false; B.parried = false; B.discharging = -1;
  for (let i = 0; i < 6; i++) B.lamp[i] = 1;
  B.arm.spinTo_(0, 0);
  beginSlot(B);
}

function beginSlot(B: Boss): void {
  const phase = B.phase === 'p2' ? 'p2' : 'p1';
  const kind = patternOf(phase)[B.step] as 'stake' | 'canister' | 'lance';
  B.slotT = 0; B.slotFired = false; B.parried = false;
  B.discharging = B.step;
  B.dischargeKind = kind;
  // the top mouth irises open and glows, with a rising tone
  B.setMouth(B.step, true, true);
  B.cue('mouth_iris');
  B.cue('glow_tone');
  if (kind === 'lance') B.ord.startLance(BOSS.lanceDamage * B.damageScale);
  B.S.tokens.limit = 1;                      // while it is mid-attack its adds share a single token (game-feel 3.3)
}

function fireSlot(B: Boss): void {
  const S = B.S;
  const phase = B.phase === 'p2' ? 'p2' : 'p1';
  const glow = (phase === 'p1' ? BOSS.p1Glow : BOSS.p2Glow) * BOSS_BY[S.difficultyId].glowScale;
  B.slotFired = true;
  if (B.dischargeKind === 'stake') {
    if (!B.parried) {
      B.discharged('stake', glow, true);
      // aimed at where she is at the end of the glow
      B.fireStake(S.px, S.py + 1.1, S.pz, BOSS.stakeDamage, 'stake');
    }
  } else if (B.dischargeKind === 'canister') {
    B.discharged('canister', glow, false);
    B.lobCanister();
  }
  endSlotMouth(B);
}

/** The lamp beside the mouth goes out as it fires, the lid shuts, the drum indexes one notch. */
function endSlotMouth(B: Boss): void {
  B.lamp[B.step] = 0;
  B.setMouth(B.step, false, true);
  B.arm.spinTo_(B.spinSign * 60 * (B.step + 1), BOSS.p1Index);
  B.cue('ratchet');
}

function beginHaul(B: Boss): void {
  const p2 = B.phase === 'p2';
  B.sub = 'haul'; B.t = 0;
  B.hauling = true;
  B.discharging = -1;
  B.haulSeconds = p2 ? BOSS.p2Haul : BOSS.p1Haul;
  B.S.tokens.limit = 0;
  // (a knot burst in its glow stays dark through this haul: GDD 8 "goes dark until the haul ends"; six a cycle at most)
  B.arm.spinTo_(0, 0.4);
  for (let i = 0; i < 6; i++) B.setMouth(i, true, true);
  B.S.say('stn_boss_hauling');
  // polish round 3 (R2: the rule is taught before it is needed): at the first haul of a try, the first included.
  // Release pass p0 (the playthrough critic: "the same hint line repeated after each death"): once per phase of a run,
  // not once per try. The world's line box says a hint a death cut off again after the respawn by itself, so on the
  // third try she had read it four times, and it held the box when the direct hint (`moveKey`) was owed.
  if (!B.taught && B.deaths >= BOSS.teachDeaths && B.teachSaidIn !== B.phase && B.S.ctx.data.story.lines[BOSS.teachKey] !== undefined) {
    B.taught = true; B.teachSaidIn = B.phase; B.S.say(BOSS.teachKey);
  }
  B.haulEvent(true, B.haulSeconds);
  B.cue('haul_whine');
  if (p2) {
    B.adds.haulStarted();
    if (B.pawl[0] === 1 && B.pawl[1] === 1) B.releaseGuard();
    // Pass i4 (the guard's fallback teaching, defs.ts `pawlsKey`): this haul begins with the guard not yet answered.
    // The line once, at the haul after `pawlHintHauls` of them; the rings are the body's (Boss.ringGuard).
    if (!B.guardAnswered) {
      B.guardIdleHauls++;
      if (B.guardIdleHauls > BOSS.pawlHintHauls && !B.pawlsSaid && B.S.ctx.data.story.lines[BOSS.pawlsKey] !== undefined) { B.pawlsSaid = true; B.S.say(BOSS.pawlsKey); }
    }
  }
}

function endHaul(B: Boss): void {
  B.hauling = false;
  B.haulEvent(false, 0);
  B.clearDark();
  for (let i = 0; i < 6; i++) { B.setMouth(i, false, true); B.lamp[i] = 1; }
  if (B.phase === 'p2') {
    // a dropped guard is hauled back over the face for the pattern. Polish round 3 (R2): burst pawls stay burst for the
    // phase (`BOSS.pawlsReset` false), so the guard drops by itself at every later haul (beginHaul)
    if (B.guard === 'released') { B.playBody('guard_raise'); B.setGuard('set'); B.cue('guard_slide'); }
    if (BOSS.pawlsReset) B.resetPawls();
  }
  beginIndex(B);
}

/** The tenth hit of a cylinder phase: slow motion on the breaking hit, 3 s invulnerable, the next phase. */
export function breakPhase(B: Boss): void {
  const S = B.S;
  S.ctx.clock.slowMotion(BOSS.breakScale, BOSS.breakSeconds, 'boss_break');
  if (B.hauling) { B.hauling = false; B.haulEvent(false, 0); }
  B.ord.clear();
  B.adds.reset();
  B.setAllMouths(false);
  B.discharging = -1;
  B.hits = 0;
  B.deaths = 0;
  B.lead = BOSS.transition;
  B.sub = 'transition';
  S.tokens.limit = 0;
  for (let i = 0; i < 6; i++) B.lamp[i] = 1;
  if (B.phase === 'p1') {
    B.guardSaid = false;
    S.say('stn_boss_p1_break');
    B.setPhase('p2');
    return;
  }
  // phase 2 ends: the guard shatters; the six proving marks are lit from this tick (BossView.marksLit)
  B.resetPawls();
  B.playBody('guard_shatter');
  B.cue('guard_shatter');
  B.setGuard('shattered');
  B.chargeAsked = false; B.relit = false; B.haulSaid3a = false; B.chargeSaid = 0;
  B.guardIdleHauls = 0; B.guardAnswered = false; B.pawlsSaid = false;
  S.say('stn_boss_p2_break');
  B.setPhase('p3a');
}

function tickCylinder(B: Boss): void {
  const phase = B.phase === 'p2' ? 'p2' : 'p1';
  switch (B.sub) {
    case 'transition': {
      if (phase === 'p2' && !B.guardSaid && B.t >= Math.max(0, B.lead - 1.5) - EPS) {
        // the guard plate slides over the face; world opens ia_line_locker_bore on boss/guard 'set'
        B.guardSaid = true;
        B.S.say('stn_boss_guard_set');
        B.playBody('guard_slide_on');
        B.cue('guard_slide');
        B.setGuard('set');
      }
      if (B.t >= B.lead - EPS) beginIndex(B);
      return;
    }
    case 'index': {
      if (!B.arm.moving) beginPattern(B);
      return;
    }
    case 'pattern': {
      const order = patternOf(phase);
      const kind = order[B.step] as 'stake' | 'canister' | 'lance';
      // release pass p0: on Hard the glow before a discharge is 15 % shorter, and the slot with it (BOSS_BY.glowScale)
      const glowFull = phase === 'p1' ? BOSS.p1Glow : BOSS.p2Glow;
      const glow = glowFull * BOSS_BY[B.S.difficultyId].glowScale;
      B.slotT += B.S.dt;
      if (kind === 'lance') {
        const total = BOSS.lanceThread + BOSS.lanceSweep;
        if (!B.slotFired && B.slotT >= total - BOSS.p1Index - EPS) { B.slotFired = true; endSlotMouth(B); }
        if (B.slotT < total - EPS) return;
      } else {
        if (!B.slotFired && B.slotT >= glow - EPS) fireSlot(B);
        // (phase 1 rests a beat after each notch, lids shut: `p1Rest`)
        // (polish round 4: on Hard the phase-1 rest is shorter, BOSS_BY)
        if (B.slotT < slotSeconds(phase, kind) - (glowFull - glow) - (phase === 'p1' ? BOSS.p1Rest * (1 - BOSS_BY[B.S.difficultyId].p1RestScale) : 0) - EPS) return;
      }
      B.step++;
      if (B.step >= order.length) beginHaul(B); else beginSlot(B);
      return;
    }
    case 'haul': {
      // the lamps relight one by one: the haul's clock
      const lit = Math.floor(B.t / B.haulSeconds * (BOSS.haulLamps + 1));
      for (let i = 0; i < 6; i++) B.lamp[i] = i < lit ? 1 : 0;
      if (B.t >= B.haulSeconds - EPS) { endHaul(B); return; }
      // Polish round 3 (R2, "keeps moving"): while it hauls it turns its open face to the bay she is in, as it does
      // when dry (phase 3b). A player who had circled out of its arc during the pattern met the drum's fluted back for
      // the whole haul and every round clanked: half of a moving player's hauls were lost that way.
      // One quick ratchet run (`haulFollowStep` a step: the hush's speed), and none that would not settle before the haul ends.
      if (BOSS.haulFollows && !B.arm.moving && B.playerBay() !== B.arm.bay) {
        const from = B.arm.bay, to = B.playerBay();
        const want = Math.abs(indexSteps(from, to)) * BOSS.haulFollowStep;
        if (B.t + want <= B.haulSeconds - EPS) {
          const seconds = B.arm.indexTo(to, want);
          if (seconds > 0) { B.indexingEvent(from, to, seconds); B.cue('ratchet'); }
        }
      }
      return;
    }
    default: beginIndex(B);
  }
}

function tickUnproven(B: Boss, dt: number): void {
  const S = B.S;
  if (B.sub !== 'transition') {
    B.arm.spinBy(BOSS.p3Spin, dt);            // the drum spins free at 40 degrees per second
    B.tickRelights();
  }
  // at phase start + 12 s, or at the first relight, and only if the kept round has not been loaded yet
  if (!B.chargeAsked && !B.keptLoaded && (B.pt >= BOSS.chargeRequiredAt - EPS || B.relit)) {
    B.chargeAsked = true;
    B.chargeSaid = 0;
    B.chargeEvent();
    S.say('stn_boss_charge_required');
    S.say('nar_one_left');
  } else if (B.chargeAsked && !B.keptLoaded) {
    // the line only (not the event: the hint ladder is counted from the first one), every `chargeRepeat` seconds until
    // she loads it. Pass i4: 30 s (it was 20), and the clock stands while she is at a proving mark.
    if (!B.onMark) B.chargeSaid += dt;
    if (B.chargeSaid >= BOSS.chargeRepeat - EPS) { B.chargeSaid = 0; S.say('stn_boss_charge_required'); }
  }
  switch (B.sub) {
    case 'transition': {
      if (B.t < B.lead - EPS) return;
      B.setAllMouths(true);
      beginIndex(B);
      return;
    }
    case 'index': {
      if (B.arm.moving) return;
      B.sub = 'fan'; B.t = 0;
      B.ord.startFan((B.hintT4 ? BOSS.fanDamageT4 : BOSS.fanDamage));
      B.cue('glow_tone');
      S.tokens.limit = 1;
      return;
    }
    case 'fan': {
      if (B.ord.fanStage !== 'none') return;
      B.sub = 'haul'; B.t = 0;
      B.hauling = true;
      B.haulSeconds = B.hintT4 ? BOSS.p3HaulT4 : BOSS.p3Haul;
      S.tokens.limit = 0;
      if (!B.haulSaid3a) { B.haulSaid3a = true; S.say('stn_boss_hauling'); }
      B.haulEvent(true, B.haulSeconds);
      B.cue('haul_whine');
      return;
    }
    case 'haul': {
      if (B.t < B.haulSeconds - EPS) return;
      B.hauling = false;
      B.haulEvent(false, 0);
      beginIndex(B);
      return;
    }
    case 'headdry': {
      if (B.t >= BOSS.headDry - EPS) beginIndex(B);
      return;
    }
    default: beginIndex(B);
  }
}

/** Phase 3b: dry. It goes on working and can hurt nobody. */
export function enterDry(B: Boss): void {
  B.sub = 'dry';
  B.hits = 0;
  B.clearDark();
  B.setAllMouths(true);
  B.dryClock = 0; B.drySaid = 0; B.drySaidAt = 0; B.shots3b = 0; B.reload3b = false; B.cleanSix = false;
  B.discharging = -1;
  B.S.tokens.limit = 0;
  B.setPhase('p3b');
  B.S.say('stn_dry');
}

/** The sixth lamp is out: x0.2 for 0.6 s, the drum runs down in slowing clicks, sags, three seconds of nothing. */
export function startKill(B: Boss): void {
  // the shot that lands the sixth hit announces itself (weapon/fired) after its receiver ran: it is the +1
  B.cleanSix = B.shots3b + 1 === BOSS.pipsP3 && !B.reload3b;
  B.sub = 'kill_run'; B.t = 0;
  B.killClicks = 0;
  B.S.ctx.clock.slowMotion(BOSS.killScale, BOSS.killSeconds, 'kill_sequence');
  B.cue('run_down');
}

function tickDry(B: Boss, dt: number): void {
  const S = B.S;
  switch (B.sub) {
    case 'dry': {
      B.arm.spinBy(BOSS.drySpin, dt);
      // it still turns its face to the bay she is in (its mouths stay open)
      if (!B.arm.moving && B.playerBay() !== B.arm.bay) {
        const from = B.arm.bay, to = B.playerBay(), seconds = B.arm.indexTo(to);
        if (seconds > 0) { B.indexingEvent(from, to, seconds); B.cue('ratchet'); }
      }
      B.dryClock += dt;
      if (B.dryClock >= BOSS.dryEvery - EPS) {
        // the top mouth irises open with a dry click and no glow: her own dry-fire sound, enormous
        B.dryClock -= BOSS.dryEvery;
        B.discharged('dry', 0, false);
        B.cue('dry_click_big');
      }
      // stn_boss_hauling twice, 4 s apart; nar_hauling after the second.
      // Polish round 5: each only once the line box has stood free for `dryLineQuiet` (Boss.lineQuiet), so it is shown
      // as it is said. Said on the clock alone, the second one waited behind the narrator's lines of the proof and was
      // shown 9.5 s after the Windlass had died. A line the kill overtakes is not said at all (sub is 'kill_run').
      if (B.lineQuiet >= BOSS.dryLineQuiet - EPS) {
        if (B.drySaid === 0 && B.t >= BOSS.dryHaulGap) { B.drySaid = 1; B.drySaidAt = B.t; S.say('stn_boss_hauling'); }
        else if (B.drySaid === 1 && B.t >= B.drySaidAt + BOSS.dryHaulGap) { B.drySaid = 2; B.drySaidAt = B.t; S.say('stn_boss_hauling'); }
        else if (B.drySaid === 2 && B.t >= B.drySaidAt + 2) { B.drySaid = 3; S.say('nar_hauling'); }
      }
      return;
    }
    case 'kill_run': {
      // click, click, slower, click, stop
      const u = B.t >= BOSS.runDown ? 1 : B.t / BOSS.runDown;
      B.arm.spinBy(BOSS.drySpin * 4 * (1 - u) * (1 - u), dt);
      const clicks = Math.floor(5 * (1 - (1 - u) * (1 - u)));
      if (clicks > B.killClicks) { B.killClicks = clicks; B.cue('ratchet'); }
      if (u >= 1) { B.sub = 'sag'; B.t = 0; B.setAllMouths(false); B.playBody('sag_death'); }
      return;
    }
    case 'sag': {
      if (B.t >= BOSS.sag) { B.sub = 'after'; B.t = 0; }
      return;
    }
    case 'after': {
      if (B.t < BOSS.afterSag) return;
      B.sub = 'rest';
      B.setPhase('dead');
      B.defeatedEvent();
      return;
    }
    default: return;
  }
}

export function tickFight(B: Boss, dt: number): void {
  switch (B.phase) {
    case 'p1': case 'p2':
      tickCylinder(B);
      if (B.phase === 'p2') B.adds.tick(dt, false, B.sub !== 'transition');
      return;
    case 'p3a':
      tickUnproven(B, dt);
      B.adds.tick(dt, true, B.sub !== 'transition');
      return;
    case 'hush':
      // it stands clear: the arm (ticked by the body) is all that moves; the relight clocks wait
      for (let i = 0; i < 6; i++) if (B.dark[i] === 1) B.relightAt[i] = (B.relightAt[i] as number) + dt;
      return;
    case 'proven':
      // frozen for the four seconds of silence
      if (B.t >= BOSS.proofFreeze - EPS) enterDry(B);
      return;
    case 'p3b':
      tickDry(B, dt);
      return;
    default: return;
  }
}
