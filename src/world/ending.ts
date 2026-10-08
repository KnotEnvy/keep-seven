// src/world/ending.ts: the far rim (GDD 9.8, 4.4; LEVEL.md 7). The town's windows light to `lamps` (9 + freed), the
// stone glints, and ONLY the stone arms the ending: taking its round (take branch), or walking away from it (leave).
// Polish round 3, lead ruling R5 ("no fail-safe may take the final choice away while the player is still arriving"):
// the choice is hers for as long as she stands at the stone. "Leave" is the north edge once the stone's lines are
// over, or LEAVE_MIN seconds (round 5: 40; trg_stone.endAfterSeconds says 25) spent more than STONE_NEAR metres from
// the stone after its last line has been heard, with no line on screen; the clock starts again whenever she comes
// back. Walking to the edge before the stone does nothing.
// Fail-safes from cp_rim, counted from the moment she steps out of the lift cage (a player who lingers in the cage has
// not been on the rim yet): at 60 s the glint doubles and the first stone line points; at 150 s the stage ends from
// wherever she stands (never while she is within FAIL_NEAR metres of the stone: she is arriving), and if she never
// found the stone it ends without the lines about the round she never saw.
// Then the fire: her view is eased to it (unless reduce-motion: then it waits for her to look), it kindles IN VIEW, the
// last lines, and the wind comes only after the fire has been in her view cone for FIRE_SEEN seconds; 4 s of wind,
// the end card. The narrator sets the pace: each step waits for its last line to have been HEARD (the queue is
// serial), the lines that were still waiting when the branch begins are dropped (all but the stone's and the lamps':
// the end card counts lamps), and nothing is said once the card is up.
// Pass i2 (both story reviewers: a brisk take was followed by "Against it she could see how far the Rule leaned..." and
// "Nine, by her count..." between "Seven again." and the fire, and "She counted them" stood 23.6 s and four lines from
// its count): once a branch is decided the order is fixed. The lamps' lines that have not been told come FIRST, in
// their order and unbroken; then the branch's own lines; then the fire. The rim's scenery lines that have not been
// said by then are dropped. Nothing but the fire's lines follows `nar_take_2` / `nar_leave`.
import { FIXED_DT, PLAYER_EYE } from '../core/contracts.ts';
import type { FxHandle, GameEvents, LayoutMarker, ZoneId } from '../core/contracts.ts';
import { DEG2RAD, RAD2DEG } from '../core/math.ts';
import type * as THREE from 'three';
import { inVolume, lampCount, paramList, paramNumber, paramString } from './internals.ts';
import type { EndingApi, State } from './internals.ts';

/** the Rule leans 6 degrees in the opening and 9 on the rim, where the plumb thread stands out of the town (pass i2, both
 * story reviewers: at 2.5 it measured 1.8 to 2.4 degrees on screen in the gully while the narrator said "It leaned", and
 * the rim's "Further than from the gully" needs a lean that was seen there; it was 1 and 2 before pass i1, 2.5 and 5 after);
 * src/render/sky.ts holds the same default */
const LEAN_OPENING = 6, LEAN_RIM = 9;
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
/** R5, round 5: the least time away from the stone, with nothing being said, before walking away is her answer */
export const LEAVE_MIN = 40;
/**
 * Release pass p0 (R5; both the playthrough and the story critic: stepping back from the stone ended the stage
 * 40 quiet seconds later with nothing said, and the north edge ended it the moment she walked up to the view).
 * Walking away is never taken as her answer unsaid: `WARN_BEFORE` seconds before the leave clock runs out the narrator
 * says `WARN_LINE` (story.json; "The round would keep on its stone. She would not pass this way again."), the clock
 * stands still while it is on screen, and the leave branch cannot begin until it has been heard to its end. The north
 * edge says the same line the first time she steps onto it and takes her at her word only if she is on it when the
 * line is over (or steps onto it again afterwards). Coming back to the stone before the line has started takes the
 * line back (it is said the next time she walks away); taking the round drops it.
 */
export const WARN_BEFORE = 10;
export const WARN_LINE = 'nar_stone_wait';
/** pass i1: the lamps' third line (trg_lamps), said only when she freed somebody */
export const LAMPS_HERS = 'nar_lamps_hers';
/**
 * Pass i1 (story reviewer: a player who takes the round at once heard none of the stone's four lines, and never the
 * Rule's lean, which is what his note on the stone points at). A take made before the stone's first line has started
 * is answered with `STONE_SHORT` (story.json: the six cases and the seventh in one line), a take made after it but
 * before the last one with the last one itself ("And a seventh, unfired..."), each on the tick of the take with the
 * take's own two lines behind it. The rim's two scenery lines (the thread of light, the Rule against it) are no longer
 * dropped by a branch: unsaid, they are told in the branch ahead of the lamps, while her view is eased to the plain.
 */
export const STONE_SHORT = 'nar_stone_short';       // (pass i3: no longer said; see RIM_RULE below. The key stays in story.json)
/**
 * Pass i3 (story reviewer a: "Against it she could see how far the Rule leaned. Further than from the gully." is the
 * narrator's only statement that her shot tilted the Rule further, and a player who walks straight to the stone never
 * heard it; story reviewer b: a quick take was answered 13 s later, after the lamp count and a description of the stone
 * she had already emptied).
 *  - `RIM_RULE` is tied to the Rule. It is said when the Rule (`RIM_RULE_VISTA`) and the thread of light over the town
 *    are both inside VIEW_COS of the middle of her view: in its turn after the line that names the thread, and as the
 *    very next line (a PRESENT line) once that one has been heard and she turns to the Rule, as his note on the stone
 *    asks her to. It is never lost: a branch that finds it unsaid says it last of all before the fire, when her view
 *    has been eased to the plain and the Rule stands in the middle of it.
 *  - A take is answered on its tick, whatever is on screen or waiting (but the Rule's line itself): `nar_take_1` over the line on screen, then
 *    `nar_take_2`; the stone's lines that had not started are dropped, all of them, and `STONE_SHORT` is no longer
 *    said of a stone she has emptied. The lamps' lines still to be told follow the take's, unbroken, then the Rule's
 *    line if it is owed, then the fire.
 */
export const RIM_RULE = 'nar_rim_3', RIM_RULE_VISTA = 'vista_rim_rule';
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
const TURN_TOWARD_TOWN = 0;
/**
 * (pass i2: 0.15 -> 0. With the view lifted by TURN_LIFT_DEG the fire stands below the middle of the frame, at the
 * height of the revolver's muzzle, and 5 degrees right of centre is where the muzzle is: it covered the fire. Dead
 * ahead, the muzzle points just past it; the town is whole on the left and the panel further from the fire.)
 */
/**
 * how far above the fire the eased view comes to rest, in degrees. Pass i2 (both visual reviewers: "the bottom third is
 * a dark featureless dune", "about the lower 45 % is soft dune foreground"): aimed AT the fire the horizon stood at 54 %
 * of the frame's height; lifted, the land's edge is on the lower third and the two lines have the sky to lean in.
 * Well inside the cone the fire is "seen" in (SEEN_COS, 25 degrees).
 */
const TURN_LIFT_DEG = 12;
// (exterior look, pass i3; the visual reviewer: "the lower 40 % of the final frame is a dark dune; the town, lamps and fire
// occupy a thin band": 7 -> 12. The revolver is let down from the moment the fire catches, so nothing stands in the lower
// right any more: the land's edge is at 63 % of the frame's height, the fire at 68 %, the town's lamps under it, and the
// mesa's dark foot is the last tenth. The sky above carries the two lines, the clouds and the first stars.)
/** how long she is waited for to look at the fire by herself before it goes on without her (never a dead end) */
const LOOK_LIMIT = 20;

/** the town is in her view (in frame, not only in the middle of it) inside this cone */
const VIEW_COS = Math.cos(35 * DEG2RAD);

/** the Rule has been in her view this long (the director's LOOK_DWELL) */
const RULE_DWELL = 0.4;
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
  /** the arrival's scenery lines after the first (the thread of light, the Rule against it): kept through a branch (pass i1) */
  private readonly sceneLines: string[] = [];
  private lampsTrigger: LayoutMarker | undefined;
  /** where the Rule stands (RIM_RULE_VISTA's target); the line that names the thread; seconds both have been in her view */
  private readonly ruleAt: [number, number, number] | null = null;
  private readonly threadLine: string = '';
  private ruleT = 0;
  /** the scenery lines a branch still owes her (the Rule's, and the thread's in front of it) */
  private readonly sceneOwed: string[] = [];
  private readonly ruleKnown: boolean = false;
  private readonly townAt: [number, number, number] | null = null;
  // ---- the fire (phase FIRE)
  private kindled = false;
  private kindleT = 0;
  private seenT = 0;
  private lookWait = 0;
  /** the view has been eased up for the lamps' lines of a quick take (once a branch) */
  private lampTurned = false;
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
  /** WARN_LINE has been asked for and has not started yet (it is taken back if she returns to the stone first) */
  private warnAsked = false;
  /** design/story.json holds WARN_LINE (a build without it leaves as before) */
  private readonly warnKnown: boolean = false;
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
    this.warnKnown = data.story.lines[WARN_LINE] !== undefined;
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
    // pass i1: "Nine had kept their seats. The rest were hers." ties the count to the ones she freed. With nobody freed
    // the count IS the nine and the line would be false: it is dropped when its turn comes.
    if (this.lampLines.includes(LAMPS_HERS)) s.story.unless(LAMPS_HERS, () => s.stats.freed <= 0);
    for (const k of lines) this.spareSeen.push(k);
    for (const k of this.lampLines) this.spareTaken.push(k);       // (round 5: none of the stone's own once she has taken the round)
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
    const ruleTarget = data.layout.markers.find((m) => m.id === RIM_RULE_VISTA)?.params.target as [number, number, number] | undefined;
    if (ruleTarget) this.ruleAt = [ruleTarget[0], ruleTarget[1], ruleTarget[2]];
    this.ruleKnown = data.story.lines[RIM_RULE] !== undefined && this.ruleAt !== null;
    if (arrive) for (const k of paramList(arrive, 'lines').slice(1)) if (!this.lampLines.includes(k)) {
      this.sceneLines.push(k);
      if (k !== RIM_RULE || !this.ruleKnown) { s.story.waitWhile(k, away); if (this.threadLine === '') this.threadLine = k; continue; }
      // (pass i3) the Rule's line waits for the Rule, and for the line that names the thread it is seen against
      const thread = this.threadLine;
      s.story.waitWhile(k, () => this.phase === IDLE && (!this.ruleInView() || (thread !== '' && s.story.holds(thread) && s.story.current !== thread)));
    }
    // (pass i2: a branch drops the scenery lines it finds unsaid; pass i1 kept them and they were told after the take)
    this.lampsTrigger = data.markersOfType('trigger').find((m) => m.zone === this.zone && m !== this.stone && paramList(m, 'lines').length > 0 && paramList(m, 'lines').every((k) => this.lampLines.includes(k)));
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
    // pass i3 (RIM_RULE above): the Rule's line is never dropped by a branch; unsaid, it is said last before the fire,
    // behind the line that names the thread it is seen against if that one was never told either ("Against it...")
    const scene = this.sceneOwed;
    scene.length = 0;
    if (this.ruleKnown && !s.story.heard(RIM_RULE)) for (const k of this.sceneLines) if (!s.story.heard(k)) scene.push(k);
    const spare = unseen ? this.spareUnseen : branch === 'take' ? this.spareTaken : this.spareSeen;
    s.story.flushWhere((key) => scene.includes(key) || spare.includes(key));
    for (const k of scene) s.story.defer(k);
    if (branch === 'take' && own.length > 0) {
      // Polish round 5 (R12): her own act is answered on its tick: the first line of the take is on screen at once,
      // over whatever is there, and the second follows it. The stone's lines that had not started are dropped, all of
      // them. Pass i2 put the lamps' lines in front of the take's whenever one was on screen or still to be told, and
      // `STONE_SHORT` between them: the take was answered 13 s late, after a description of the stone she had emptied.
      // Pass i3: the take's two lines at once, always; then the lamps' lines that have not been told, in their order
      // and unbroken (the end card counts lamps: they are never lost); then the Rule's line; then the fire.
      // (one exception: the Rule's own line, on screen at that moment, is heard out, and the take's first line is the very
      // next: it is the one line the rim must not lose, and a narrator's line is never said twice)
      for (const key of this.lampLines) s.story.defer(key);
      if (this.ruleKnown && s.story.current === RIM_RULE) s.story.sayFront(own[0] as string); else s.story.sayOver(own[0] as string);
      for (let i = 1; i < own.length; i++) s.story.sayFront(own[i] as string);
      s.story.sayFrontAll(this.lampLines);
      s.story.sayFrontAll(scene);
      return;
    }
    s.story.sayFrontAll(this.lampLines);                 // not yet said (she never stood where the town shows): now
    for (const key of own) s.story.say(key);
    for (const key of scene) s.story.say(key);
  }
  /** a lamps line is on screen or waiting: the fire is not kindled over the count of the windows */
  private lampsPending(): boolean {
    for (let i = 0; i < this.lampLines.length; i++) if (this.s.story.holds(this.lampLines[i] as string)) return true;
    for (let i = 0; i < this.sceneOwed.length; i++) if (this.s.story.holds(this.sceneOwed[i] as string)) return true;   // (pass i3: nor over the Rule's line)
    return false;
  }
  /** the Rule and the thread of light it is seen against are both in her view */
  private ruleInView(): boolean {
    const { s } = this;
    const r = this.ruleAt, t = this.townAt;
    if (!r) return true;
    return s.lookCos(r[0], r[1], r[2]) >= VIEW_COS && (t === null || s.lookCos(t[0], t[1], t[2]) >= VIEW_COS);
  }
  /** the lamps' and the stone's triggers: what she has walked up to is told next, ahead of the arrival's scenery lines */
  front(m: LayoutMarker): boolean {
    if (this.zone === '' || m.zone !== this.zone) return false;
    if (m === this.stone) return true;
    if (m !== this.lampsTrigger) return false;
    // pass i1: at the ledge's edge the town is what she has walked up to: the two scenery lines about it that are still
    // waiting behind other things are told first, then the lamps (they were said only if she happened to look that way
    // after the stone; the director puts the lamps' lines behind these)
    for (const key of this.sceneLines) this.s.story.defer(key);
    this.s.story.sayFrontAll(this.sceneLines);
    return true;
  }
  /** the choice at the stone is still hers (no branch has begun): the stone's prompt shows only then */
  get open(): boolean { return this.phase === IDLE; }
  /** the end card is up: this telling is over (a "Go on" from the rim after it is told again from the lift) */
  get ended(): boolean { return this.phase === CARD; }
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
    this.pitch1 = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * RAD2DEG + TURN_LIFT_DEG;
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
      // (pass i3, RIM_RULE) once the thread has been named, a look at the Rule against it is told next
      if (this.ruleKnown && !s.story.heard(RIM_RULE) && s.story.holds(RIM_RULE) && (this.threadLine === '' || s.story.finished(this.threadLine))) {
        this.ruleT = this.ruleInView() ? this.ruleT + dt : 0;
        if (this.ruleT >= RULE_DWELL) { this.ruleT = 0; s.story.defer(RIM_RULE); s.story.sayPresent(RIM_RULE, false); }
      } else this.ruleT = 0;
      const stoneFound = this.stoneFlag !== '' && s.flags.has(this.stoneFlag);
      if (stoneFound) {
        // R5: the choice is hers while she stands at the stone and until she has heard what lies on it. The leave
        // clock counts only time spent away from the stone after its last line; coming back starts it again.
        const told = this.lastStoneLine === '' || s.story.finished(this.lastStoneLine);
        const away = this.stoneD2() > STONE_NEAR * STONE_NEAR;
        // Polish round 5 (R5; the story critic stepped 6 m back to look at the Rule, as the note on the stone tells
        // her to, and 25 s later the leave ending had been taken for her while the rim's own lines were on screen):
        // the clock stands still while any line is on screen (she is being told something: she is still deciding), and
        // it runs LEAVE_MIN seconds at least, whatever the marker says (its 25 cannot change: the design data is final).
        const p = s.ctx.player.position;
        const onEdge = told && this.exit !== undefined && inVolume(this.exit, p.x, p.y, p.z);
        if (!(told && away)) {
          this.sinceStone = 0;
          // back at the stone before the warning had started: it is taken back, and said when she next walks away
          if (this.warnAsked && !s.story.heard(WARN_LINE)) { s.story.defer(WARN_LINE); this.warnAsked = false; }
        } else if (s.story.current === '') this.sinceStone += dt;
        const limit = this.stone ? Math.max(LEAVE_MIN, paramNumber(this.stone, 'endAfterSeconds', 25)) : LEAVE_MIN;
        // p0: the warning, WARN_BEFORE seconds before the clock runs out, or as she first steps onto the north edge
        if (this.warnKnown && !this.warnAsked && !s.story.heard(WARN_LINE) && told && away && (onEdge || this.sinceStone >= limit - WARN_BEFORE)) {
          this.warnAsked = true;
          s.story.sayFront(WARN_LINE);
        }
        const warned = !this.warnKnown || s.story.finished(WARN_LINE);
        if (this.stone && warned && this.sinceStone >= limit) { this.begin(paramString(this.stone, 'endBranch') === 'take' ? 'take' : 'leave'); return; }
        // the north edge, once the stone has been found, its lines are over and the warning has been heard: she walks on
        if (onEdge && warned) this.begin('leave');
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
      const said = this.branchLast === '' ? s.story.idle : s.story.finished(this.branchLast);
      if (said && this.lampsPending() && this.phaseT < BRANCH_LIMIT) {
        // (round 5: a quick take leaves the lamps to be counted after it; her view is eased up from the stone to the
        // plain and the town first, so the windows are in frame while they are counted and the fire kindles in view)
        if (!this.lampTurned) { this.lampTurned = true; this.startTurn(); }
        this.tickTurn();
        return;
      }
      if (!said && this.phaseT < BRANCH_LIMIT) return;
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
      // Pass i1 (both story reviewers; the fixer's ruling in docs/requests/world.md: "walking the rim again after the
      // end is wanted"): the other ending is two minutes from the rim and cost a whole replay, because release pass p0
      // let the save go here. The save she holds is the rim's own, taken as the lift opened: the stone untouched, no
      // branch begun, the run's tallies as they stood. It is KEPT: the title offers "Go on VII . 1" and "Begin" asks
      // first, as over any save. Only a save that is not the rim's (a debug path) is let go as before.
      const held = s.ctx.save.current;
      if (!held || !this.rim || held.checkpoint !== this.rim.id) s.ctx.save.clear();
      s.story.silence();                                   // no line ever starts behind the end card
      this.cardPayload.stats = s.stats;
      s.ctx.events.emit('ending/card', this.cardPayload);
      const card = this.exit ? paramString(this.exit, 'card') : '';
      if (card !== '') s.story.say(card);
    }
  }

  reset(): void {
    this.arrived = false; this.sinceArrive = 0; this.sinceStone = 0; this.warnAsked = false; this.phase = IDLE; this.phaseT = 0; this.lit = -1; this.lampsSaid = false;
    this.boosted = false; this.glintT = 0; this.branchLast = ''; this.fireLast = ''; this.out = false; this.sinceOut = 0;
    this.kindled = false; this.kindleT = 0; this.seenT = 0; this.lookWait = 0; this.turn = -1; this.lampTurned = false; this.ruleT = 0; this.sceneOwed.length = 0;
    if (this.fire) { this.fire.release(); this.fire = null; }
    if (this.windows) this.s.ctx.render.lamps.setCount(this.windows, 0);
  }
  debug(): Record<string, unknown> {
    return {
      arrived: this.arrived, phase: this.phase, lit: Math.max(0, this.lit), boosted: this.boosted, out: this.out,
      fireCos: Math.round(this.s.lookCos(this.fireAt[0], this.fireAt[1], this.fireAt[2]) * 1e4) / 1e4,
      sinceStone: Math.round(this.sinceStone * 100) / 100, warned: this.warnKnown && this.s.story.heard(WARN_LINE), kindled: this.kindled, fireSeen: Math.round(this.seenT * 100) / 100, turning: this.turn >= 0,
    };
  }
}

export function createEnding(s: State): EndingApi { return new Ending(s); }
