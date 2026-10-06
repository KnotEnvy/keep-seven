// src/world/ending.ts: the far rim (GDD 9.8, 4.4; LEVEL.md 7). The town's windows light to `lamps` (9 + freed), the
// stone glints, and ONLY the stone arms the ending: taking its round (take branch), or walking away from it (leave).
// Polish round 3, lead ruling R5 ("no fail-safe may take the final choice away while the player is still arriving"):
// the choice is hers for as long as she stands at the stone. "Leave" is the north edge once the stone's lines are
// over, or 25 s (trg_stone.endAfterSeconds) spent more than STONE_NEAR metres from the stone after its last line has
// been heard; the clock starts again whenever she comes back. Walking to the edge before the stone does nothing.
// Fail-safes from cp_rim, counted from the moment she steps out of the lift cage (a player who lingers in the cage has
// not been on the rim yet): at 60 s the glint doubles and the first stone line points; at 150 s the stage ends from
// wherever she stands (never while she is within FAIL_NEAR metres of the stone: she is arriving), and if she never
// found the stone it ends without the lines about the round she never saw.
// Then the fire: her view is eased to it (unless reduce-motion: then it waits for her to look), it kindles IN VIEW, the
// last lines, and the wind comes only after the fire has been in her view cone for FIRE_SEEN seconds; 4 s of wind,
// the end card. The narrator sets the pace: each step waits for its last line to have been HEARD (the queue is
// serial), the lines that were still waiting when the branch begins are dropped (all but the stone's and the lamps':
// the end card counts lamps), and nothing is said once the card is up.
import { FIXED_DT, PLAYER_EYE } from '../core/contracts.ts';
import type { FxHandle, GameEvents, LayoutMarker, ZoneId } from '../core/contracts.ts';
import { DEG2RAD, RAD2DEG } from '../core/math.ts';
import type * as THREE from 'three';
import { inVolume, lampCount, paramList, paramNumber, paramString } from './internals.ts';
import type { EndingApi, State } from './internals.ts';

/** ART_BIBLE 3: the Rule leans 1 degree in the opening and 2 on the rim, where the plumb thread stands out of the town */
const LEAN_OPENING = 1, LEAN_RIM = 2;
/** the windows light one by one over three seconds */
const WINDOWS_SECONDS = 3;
const KINDLE_SECONDS = 1.5;
const WIND_SECONDS = 4;
const GLINT_SECONDS = 0.3;
/**
 * Each step waits for its lines to have played. The clocks are only a fail-safe against a line that never ends: long
 * enough for everything the rim can still hold in the queue (the four stone lines, 18 s, and the branch's two).
 */
const BRANCH_LIMIT = 90, FIRE_LIMIT = 90;
/** she is out of the cage when she is this far past its interior */
const CAGE_MARGIN = 0.3;
/** R5: within this many metres of the stone she has not walked away from it: the leave clock does not run */
export const STONE_NEAR = 4;
/** within this many metres of a stone she has not found yet she is arriving: the 150 s fail-safe waits */
const FAIL_NEAR = 8;
/** the fire is seen while it is inside this cone of her view (the Dowser's test, GDD 9.3) */
const SEEN_COS = Math.cos(25 * DEG2RAD);
/** R5: the wind does not come before the fire has been in her view this long */
const FIRE_SEEN = 2;
/** her view is eased to the fire over this long (not with reduce-motion) */
const TURN_SECONDS = 1.5;
/** a view she moves herself by more than this during the ease is hers again */
const TURN_SLACK_DEG = 0.75;
/**
 * how far the eased view stands off the fire toward the town, as a share of the angle between them (both in frame).
 * Polish round 4 (R5): at 0.35 the fire stood 12 degrees right of centre (x 770 of 1280) and the end card's panel
 * (the right 36 to 40 % of the frame: from x 783 at 16:9, from 60 % across at 4:3) lay over its halo. At 0.15 it stands
 * 5.3 degrees right: x 695 at 16:9, 55.6 % across at 4:3, 53.5 % at 21:9, clear of the panel in all three, and the
 * town (drawn 12.5 m further east on its card in the same pass, blender/env_exterior/rim_town_card.py) is still
 * whole on the left. A constant, not a reading of the camera: the simulation never asks the display its shape.
 */
const TURN_TOWARD_TOWN = 0.15;
/** how long she is waited for to look at the fire by herself before it goes on without her (never a dead end) */
const LOOK_LIMIT = 20;

/** the town is in her view (in frame, not only in the middle of it) inside this cone */
const VIEW_COS = Math.cos(35 * DEG2RAD);

const IDLE = 0, BRANCH = 1, FIRE = 2, WIND = 3, CARD = 4;
const NO_LINES: readonly string[] = Object.freeze([]);

class Ending implements EndingApi {
  private readonly zone: ZoneId | '' = '';
  private readonly exit: LayoutMarker | undefined;
  private readonly stone: LayoutMarker | undefined;
  private readonly glintMarker: LayoutMarker | undefined;
  private readonly rim: LayoutMarker | undefined;
  private readonly stoneFlag: string = '';
  private readonly failGlint: number = 60;
  private readonly failLeave: number = 150;
  private readonly pointer: string = '';
  private readonly lastStoneLine: string = '';
  /** the round on the stone: what "at the stone" is measured from */
  private readonly round: LayoutMarker | undefined;
  /** what the branch keeps of the waiting lines: the stone's and the lamps' (seen), the lamps' alone (stone never found) */
  private readonly spareSeen: string[] = [];
  private readonly spareUnseen: string[] = [];
  private readonly spareTaken: string[] = [];
  private readonly lampLines: string[] = [];
  private readonly townAt: [number, number, number] | null = null;
  // ---- the fire (phase FIRE)
  private kindled = false;
  private kindleT = 0;
  private seenT = 0;
  private lookWait = 0;
  private turn = -1;
  private yaw0 = 0; private pitch0 = 0; private yaw1 = 0; private pitch1 = 0; private setYaw = 0; private setPitch = 0;
  /** the arrival cage of the lift that brings her here: centre and half extent (0 = no cage: the clocks run from arrival) */
  private readonly cage: [number, number, number] = [0, 0, 0];
  /** she has stepped out of the cage: the fail-safe clocks run from here */
  private out = false;
  private sinceOut = 0;
  private readonly fireAt: [number, number, number] = [0, 0, 0];
  private arrived = false;
  private sinceArrive = 0;
  private sinceStone = 0;
  private phase = IDLE;
  private phaseT = 0;
  private branchLast = '';
  private fireLast = '';
  private lit = -1;
  private lampsSaid = false;
  private glint: FxHandle | null = null;
  private glintT = 0;
  private glintLevel = 0;
  private boosted = false;
  private fire: FxHandle | null = null;
  private windows: THREE.Object3D | null = null;
  private readonly lampsPayload: GameEvents['ending/lamps'] = { count: 0 };
  private readonly stonePayload: GameEvents['ending/stone'] = { taken: false };
  private readonly firePayload: GameEvents['ending/fire'] = { x: 0, y: 0, z: 0 };
  private readonly cardPayload: GameEvents['ending/card'];

  constructor(private readonly s: State) {
    const { data, events } = s.ctx;
    this.cardPayload = { stats: s.stats };
    this.exit = data.layout.markers.find((m) => m.type === 'exit');
    if (!this.exit) return;
    this.zone = this.exit.zone;
    this.stone = data.markersOfType('trigger').find((m) => m.params.arms === this.exit?.id);
    this.stoneFlag = this.stone ? 'trg:' + this.stone.id : '';
    const lines = this.stone ? paramList(this.stone, 'lines') : [];
    this.lastStoneLine = lines.length ? (lines[lines.length - 1] as string) : '';
    this.round = data.markersOfType('interactable').find((m) => m.params.arms === this.exit?.id) ?? this.stone;
    // the lamps' lines: what the rim's other triggers say that the story stands on (story.keeps: never stale)
    for (const m of data.markersOfType('trigger')) {
      if (m.zone !== this.zone || m === this.stone) continue;
      for (const k of paramList(m, 'lines')) if (s.story.keeps(k) && !this.lampLines.includes(k)) this.lampLines.push(k);
    }
    for (const k of this.lampLines) { this.spareSeen.push(k); this.spareUnseen.push(k); }
    for (const k of lines) this.spareSeen.push(k);
    for (const k of this.lampLines) this.spareTaken.push(k);
    if (lines[0]) this.spareTaken.push(lines[0]);
    const town = data.markersInZone(this.zone).find((m) => m.type === 'vista' && m.params.lampsFormula !== undefined);
    const townTarget = town?.params.target as [number, number, number] | undefined;
    if (townTarget) this.townAt = [townTarget[0], townTarget[1], townTarget[2]];
    for (const portal of data.layout.nav.portals) {
      const m = data.layout.markers.find((x) => x.id === portal.cages[1]);
      if (m && m.zone === this.zone) { this.cage[0] = m.pos[0]; this.cage[1] = m.pos[2]; this.cage[2] = Math.max(portal.cageInterior[0], portal.cageInterior[2]) / 2 + CAGE_MARGIN; }
    }
    this.glintMarker = data.markersInZone(this.zone).find((m) => m.type === 'light' && m.params.kind === 'glint');
    this.rim = data.markersOfType('checkpoint').find((m) => Array.isArray(m.params.failSafes));
    const fails = (this.rim?.params.failSafes ?? []) as { afterSeconds: number; pointerLine?: string }[];
    if (fails[0]) { this.failGlint = fails[0].afterSeconds; this.pointer = fails[0].pointerLine ?? ''; }
    if (fails[1]) this.failLeave = fails[1].afterSeconds;
    const vista = data.markersInZone(this.zone).find((m) => m.type === 'vista' && m.params.kindles !== undefined);
    const target = vista?.params.target as [number, number, number] | undefined;
    if (target) { this.fireAt[0] = target[0]; this.fireAt[1] = target[1]; this.fireAt[2] = target[2]; }
    // Polish round 4: the arrival's scenery lines (the thread of light over the town, the Rule seen against it) are
    // about the view. Once she has walked up to the stone they wait until the town is in her view again instead of
    // being said while she is bent over the stone; the stone's own lines go ahead of them. A branch drops them.
    const arrive = data.markersOfType('trigger').find((m) => m.zone === this.zone && m !== this.stone && paramList(m, 'cards').length > 0);
    const away = (): boolean => this.phase === IDLE && this.stoneFlag !== '' && s.flags.has(this.stoneFlag) && this.townAt !== null
      && s.lookCos(this.townAt[0], this.townAt[1], this.townAt[2]) < VIEW_COS;
    if (arrive) for (const k of paramList(arrive, 'lines').slice(1)) if (!this.lampLines.includes(k)) s.story.waitWhile(k, away);
    events.on('checkpoint/reached', (e) => { if (this.rim && e.id === this.rim.id) this.arrive(); });
    events.on('story/line', (e) => { if (this.phase === FIRE && e.key === this.fireLast) s.cue('wire_resolve', 0, 0, 0, false); });
  }

  // ---- what is built --------------------------------------------------------------------------------
  attach(zone: ZoneId): void {
    const { s } = this;
    if (zone !== this.zone) return;
    const { data, render } = s.ctx;
    render.setSky(LEAN_RIM, true);
    // the town card's windows and the socket the last fire kindles at: nodes of the set's world-space assets
    this.windows = null;
    for (const id of data.manifest.sets[s.residentSet].assets ?? []) {
      const def = data.manifest.assets[id];
      if (!def) continue;
      if (def.lampSets && def.lampSets.town_windows !== undefined) this.windows = s.build.worldNode(id, 'town_windows');
      if (def.nodes.includes('socket_last_fire')) {
        const socket = s.build.worldNode(id, 'socket_last_fire');
        if (socket) { socket.updateWorldMatrix(true, false); const e = socket.matrixWorld.elements; this.fireAt[0] = e[12] as number; this.fireAt[1] = e[13] as number; this.fireAt[2] = e[14] as number; }
      }
    }
    this.lit = -1;
    if (this.windows) render.lamps.setCount(this.windows, 0);
    const g = this.glintMarker;
    if (g && !this.glint) {
      this.glint = render.vfx.acquireCard('aim_star');
      if (this.glint) { this.glint.setPosition(g.pos[0], g.pos[1], g.pos[2]); this.glint.setLevel(0); this.glint.setVisible(true); }
    }
  }
  detach(zone: ZoneId): void {
    if (zone !== this.zone) return;
    if (this.glint) { this.glint.release(); this.glint = null; }
    if (this.fire) { this.fire.release(); this.fire = null; }
    this.windows = null;
    this.s.ctx.render.setSky(LEAN_OPENING, false);
  }

  arrive(): void {
    if (this.arrived) return;
    this.arrived = true;
    this.sinceArrive = 0; this.sinceStone = 0; this.sinceOut = 0; this.out = false;
  }
  /** `E` on the stone's round: she takes it, and the take branch runs */
  take(): void {
    const { s } = this;
    if (this.phase !== IDLE || s.stats.tookStoneRound) return;
    s.stats.tookStoneRound = true;
    s.ctx.player.takeStoneRound();
    this.begin('take');
  }
  /** `unseen`: the 150 s fail-safe with the stone never found: no line about the round is said */
  private begin(branch: 'take' | 'leave', unseen = false): void {
    const { s } = this;
    if (this.phase !== IDLE) return;
    this.phase = BRANCH; this.phaseT = 0;
    this.stonePayload.taken = branch === 'take';
    s.ctx.events.emit('ending/stone', this.stonePayload);
    // story.json meta.rules.ending_branch: the branch's own lines first, then the exit's (the fire, the last line)
    const all = s.ctx.data.story.meta.rules as unknown as { ending_branch?: Record<string, string[]> };
    const exitLines = this.exit ? paramList(this.exit, 'lines') : [];
    const own = unseen ? [] : (all.ending_branch?.[branch] ?? []).filter((k) => !exitLines.includes(k));
    this.branchLast = own.length ? (own[own.length - 1] as string) : '';
    this.fireLast = exitLines.length ? (exitLines[exitLines.length - 1] as string) : '';
    // what was still waiting to be said about the rim is dropped: from here the lamps (the end card counts them: a brisk
    // player must not lose the one line that says why), the stone's lines (if she found it), the branch, the fire and
    // the last line follow each other with nothing between
    // (polish round 4: when she has TAKEN the round, the stone's lines that had not started are dropped with the rest,
    // all but the first: "And a seventh, unfired" was said 25 s after she had pocketed it)
    s.story.flush(unseen ? this.spareUnseen : branch === 'take' ? this.spareTaken : this.spareSeen);
    s.story.sayFrontAll(this.lampLines);                 // not yet said (she never stood where the town shows): now
    for (const key of own) s.story.say(key);
  }
  /** the lamps' and the stone's triggers: what she has walked up to is told next, ahead of the arrival's scenery lines */
  front(m: LayoutMarker): boolean {
    if (this.zone === '' || m.zone !== this.zone) return false;
    if (m === this.stone) return true;
    const lines = paramList(m, 'lines');
    return lines.length > 0 && lines.every((k) => this.lampLines.includes(k));
  }
  /** the choice at the stone is still hers (no branch has begun): the stone's prompt shows only then */
  get open(): boolean { return this.phase === IDLE; }
  /** squared ground distance from her to the round on the stone */
  private stoneD2(): number {
    const m = this.round;
    if (!m) return Infinity;
    const p = this.s.ctx.player.position, dx = p.x - m.pos[0], dz = p.z - m.pos[2];
    return dx * dx + dz * dz;
  }

  // ---- the fire -------------------------------------------------------------------------------------
  private fireSeen(): boolean { return this.s.lookCos(this.fireAt[0], this.fireAt[1], this.fireAt[2]) >= SEEN_COS; }
  /** ease her view to the fire, a little toward the town so the lit windows share the frame (not with reduce-motion) */
  private startTurn(): void {
    const { s } = this;
    this.turn = -1;
    if (s.ctx.options.value.reduceMotion || this.fireSeen()) return;
    const pl = s.ctx.player, p = pl.position;
    const dx = this.fireAt[0] - p.x, dy = this.fireAt[1] - (p.y + PLAYER_EYE), dz = this.fireAt[2] - p.z;
    // yaw 0 looks along -Z and a positive yaw turns left: forward = (-sin, 0, -cos)
    let want = Math.atan2(-dx, -dz) * RAD2DEG;
    if (this.townAt) {
      const town = Math.atan2(-(this.townAt[0] - p.x), -(this.townAt[2] - p.z)) * RAD2DEG;
      const off = (((town - want) % 360) + 540) % 360 - 180;
      want += Math.max(-40, Math.min(40, off)) * TURN_TOWARD_TOWN;
    }
    this.yaw0 = pl.yaw * RAD2DEG; this.pitch0 = pl.pitch * RAD2DEG;
    this.yaw1 = this.yaw0 + ((((want - this.yaw0) % 360) + 540) % 360 - 180);
    this.pitch1 = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * RAD2DEG;
    this.setYaw = this.yaw0; this.setPitch = this.pitch0;
    this.turn = 0;
  }
  private tickTurn(): void {
    if (this.turn < 0) return;
    const pl = this.s.ctx.player, p = pl.position;
    // she moved the view herself: it is hers
    if (Math.abs(pl.yaw * RAD2DEG - this.setYaw) > TURN_SLACK_DEG || Math.abs(pl.pitch * RAD2DEG - this.setPitch) > TURN_SLACK_DEG) { this.turn = -1; return; }
    this.turn++;
    const t = Math.min(1, (this.turn * FIXED_DT) / TURN_SECONDS), k = t * t * (3 - 2 * t);
    pl.teleport(p.x, p.y, p.z, this.yaw0 + (this.yaw1 - this.yaw0) * k, this.pitch0 + (this.pitch1 - this.pitch0) * k);
    this.setYaw = pl.yaw * RAD2DEG; this.setPitch = pl.pitch * RAD2DEG;
    if (t >= 1) this.turn = -1;
  }

  tick(dt: number): void {
    const { s } = this;
    if (this.zone === '' || !s.build.isBuilt(this.zone) || !this.arrived) return;
    const { render } = s.ctx;
    // ---- the lamps of Plenty: one window for each of the nine who kept their seats and each Bider freed
    if (this.windows) {
      const lamps = lampCount(s.stats.freed);
      const want = Math.min(lamps, Math.floor((lamps * Math.min(this.sinceArrive, WINDOWS_SECONDS)) / WINDOWS_SECONDS));
      if (want !== this.lit) { this.lit = want; render.lamps.setCount(this.windows, want); }
      if (!this.lampsSaid && want >= lamps) { this.lampsSaid = true; this.lampsPayload.count = lamps; s.ctx.events.emit('ending/lamps', this.lampsPayload); }
    }
    this.sinceArrive += dt;
    // ---- the brass glint on the six case mouths: a star every 2.5 s, twice the size and rate at the 60 s fail-safe
    if (this.glint && this.glintMarker) {
      const every = paramNumber(this.glintMarker, 'everySeconds', 2.5) / (this.boosted ? 2 : 1);
      this.glintT += FIXED_DT;
      if (this.glintT >= every) this.glintT = 0;
      const level = this.glintT < GLINT_SECONDS && !s.stats.tookStoneRound ? (this.boosted ? 2 : 1) : 0;
      if (level !== this.glintLevel) { this.glintLevel = level; this.glint.setLevel(level); }
    }
    if (this.phase === IDLE) {
      if (!s.playing) return;
      const stoneFound = this.stoneFlag !== '' && s.flags.has(this.stoneFlag);
      if (stoneFound) {
        // R5: the choice is hers while she stands at the stone and until she has heard what lies on it. The leave
        // clock counts only time spent away from the stone after its last line; coming back starts it again.
        const told = this.lastStoneLine === '' || s.story.finished(this.lastStoneLine);
        const away = this.stoneD2() > STONE_NEAR * STONE_NEAR;
        if (told && away) this.sinceStone += dt; else this.sinceStone = 0;
        if (this.stone && this.sinceStone >= paramNumber(this.stone, 'endAfterSeconds', 25)) { this.begin(paramString(this.stone, 'endBranch') === 'take' ? 'take' : 'leave'); return; }
        // the north edge, once the stone has been found and its lines are over: she walks on
        const p = s.ctx.player.position;
        if (told && this.exit && inVolume(this.exit, p.x, p.y, p.z)) this.begin('leave');
        return;
      }
      // the fail-safes count from her first step onto the rim, not from the lift's arrival
      if (!this.out) {
        const p = s.ctx.player.position, half = this.cage[2];
        this.out = half <= 0 || Math.abs(p.x - this.cage[0]) > half || Math.abs(p.z - this.cage[1]) > half;
        if (!this.out) return;
      }
      this.sinceOut += dt;
      if (!this.boosted && this.sinceOut >= this.failGlint) {
        this.boosted = true;
        if (this.pointer !== '') s.story.say(this.pointer);
      }
      // (never while she is on her way to the stone: R5)
      if (this.sinceOut >= this.failLeave && this.stoneD2() > FAIL_NEAR * FAIL_NEAR) this.begin('leave', true);
      return;
    }
    this.phaseT += dt;
    if (this.phase === BRANCH) {
      // the branch's last line has been heard (with no line of its own: whatever is still being said)
      const told = this.branchLast === '' ? s.story.idle : s.story.finished(this.branchLast);
      if (!told && this.phaseT < BRANCH_LIMIT) return;
      // the fire is next: her view is brought to it first, so it kindles where she is looking
      this.phase = FIRE; this.phaseT = 0;
      this.kindled = false; this.kindleT = 0; this.seenT = 0; this.lookWait = 0;
      this.startTurn();
    } else if (this.phase === FIRE) {
      const seen = this.fireSeen();
      if (!this.kindled) {
        this.tickTurn();
        // it catches once it is in her view (the ease over, or she looked by herself), or when she has been waited for
        if (!((seen && this.turn < 0) || this.phaseT >= LOOK_LIMIT)) return;
        this.kindled = true;
        // a fire kindles on the plain along the pylon line: the second fire of the stage
        this.firePayload.x = this.fireAt[0]; this.firePayload.y = this.fireAt[1]; this.firePayload.z = this.fireAt[2];
        s.ctx.events.emit('ending/fire', this.firePayload);
        this.fire = render.vfx.acquireCard('last_fire');
        if (this.fire) { this.fire.setPosition(this.fireAt[0], this.fireAt[1], this.fireAt[2]); this.fire.setLevel(0); this.fire.setVisible(true); }
        // next in line: the narrator names the fire as it catches
        s.story.sayFrontAll(this.exit ? paramList(this.exit, 'lines') : NO_LINES);
        return;
      }
      this.kindleT += dt;
      if (seen) this.seenT += dt;
      if (this.fire && this.kindleT <= KINDLE_SECONDS + FIXED_DT) this.fire.setLevel(Math.min(1, this.kindleT / KINDLE_SECONDS));
      // the last line of the stage has been heard to its end before the wind and the card
      const told = this.fireLast === '' || s.story.finished(this.fireLast);
      if (!told && this.kindleT < FIRE_LIMIT) return;
      // and the fire has been SEEN (R5): she is waited for, a while, if she was looking elsewhere
      if (this.seenT < FIRE_SEEN && this.kindleT < FIRE_LIMIT) { this.lookWait += dt; if (this.lookWait < LOOK_LIMIT) return; }
      this.phase = WIND; this.phaseT = 0;
      s.ctx.state.request('ending', 'stage_end');
      s.ctx.player.setControl(false, 'ending');
    } else if (this.phase === WIND) {
      if (this.phaseT < WIND_SECONDS) return;
      this.phase = CARD;
      s.story.silence();                                   // no line ever starts behind the end card
      this.cardPayload.stats = s.stats;
      s.ctx.events.emit('ending/card', this.cardPayload);
      const card = this.exit ? paramString(this.exit, 'card') : '';
      if (card !== '') s.story.say(card);
    }
  }

  reset(): void {
    this.arrived = false; this.sinceArrive = 0; this.sinceStone = 0; this.phase = IDLE; this.phaseT = 0; this.lit = -1; this.lampsSaid = false;
    this.boosted = false; this.glintT = 0; this.branchLast = ''; this.fireLast = ''; this.out = false; this.sinceOut = 0;
    this.kindled = false; this.kindleT = 0; this.seenT = 0; this.lookWait = 0; this.turn = -1;
    if (this.fire) { this.fire.release(); this.fire = null; }
    if (this.windows) this.s.ctx.render.lamps.setCount(this.windows, 0);
  }
  debug(): Record<string, unknown> {
    return {
      arrived: this.arrived, phase: this.phase, lit: Math.max(0, this.lit), boosted: this.boosted, out: this.out,
      fireCos: Math.round(this.s.lookCos(this.fireAt[0], this.fireAt[1], this.fireAt[2]) * 1e4) / 1e4,
      sinceStone: Math.round(this.sinceStone * 100) / 100, kindled: this.kindled, fireSeen: Math.round(this.seenT * 100) / 100, turning: this.turn >= 0,
    };
  }
}

export function createEnding(s: State): EndingApi { return new Ending(s); }
