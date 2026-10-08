// src/world/puzzles/the_asking.ts: GDD 13.4. The bore door asks three questions. The first two are answered by shooting
// a numbered port (4, then 6). The third has no port: the listening ring, dark until then, fills clockwise one lamp
// every 0.75 s while she stands in the antechamber and holds her fire; any shot, anywhere, empties it. Full ring: the
// door opens. The cradle lines are critical path: if she has not looked at the cradle, question 3 plays them.
import * as THREE from 'three';
import { FIXED_DT } from '../../core/contracts.ts';
import type { DamageInfo, GameEvents, HitResponse, HitResult, LayoutMarker, MarkerId, PuzzleSave, PuzzleView, ZoneId } from '../../core/contracts.ts';
import { Shot, doorOfPuzzle, lampNode, namedLine, paramList, paramNumber } from '../internals.ts';
import type { Puzzle, ShotOwner, State } from '../internals.ts';
import { PuzzleCore } from './hints.ts';

/** after three wrong shots at a numbered question the wrong ports go dark (GDD 13.4, the relaxation of questions 1 and 2) */
const WRONG_LIMIT = 3;
const FLASH_SECONDS = 0.4;
const FLUTTER_SECONDS = 1.2;
const FLUTTER_STEP = 0.15;
/** question 3: the hint clock runs only while she keeps emptying the ring (one fill's length after each shot) */
const EMPTYING_WINDOW = 9;
/**
 * Pass i2 (story reviewer a: "IDENTIFY STATION." six times in two minutes, once between the cradle's two lines, and
 * the first narrator hint only at 120 s). An unanswered question is asked again no sooner than `REASK_MIN` seconds
 * after it was last on screen (the volume's `reaskSeconds`, 20, is the design's older number: the larger wins), and
 * the clock runs only while NOTHING is being said or waiting to be said and she is not turned to the cradle from
 * within its look range (she is reading the room: the door does not talk over it). The repeat is queued like any
 * line, so it can never come between two lines of a pair.
 */
export const REASK_MIN = 50;
const CRADLE_COS = Math.cos(40 * Math.PI / 180);
/**
 * Pass i2: the asking's own hint ladder (seconds inside the antechamber without a right answer). Tier 1 (the right
 * port's lamp flutters) at 30 s and the first line ("It asked for numbers. The walls were covered in numbers.") at
 * 45 s on Normal: the shared ladder's 60 / 120 left her two minutes with a door that only repeated itself. Tiers 3
 * and 4 are the shared ones.
 */
export const ASK_HINT_NORMAL: readonly number[] = [30, 45, 210, 300];
export const ASK_HINT_FAST: readonly number[] = [15, 25, 120, 180];

class TheAsking implements Puzzle, ShotOwner {
  readonly id = 'the_asking' as const;
  readonly zone: ZoneId;
  readonly view: PuzzleView;
  private readonly core: PuzzleCore;
  private readonly ports: Shot[] = [];
  private readonly numbers: number[] = [];
  private readonly ring: LayoutMarker | undefined;
  private readonly cradle: LayoutMarker | undefined;
  /** the thing each question is about: its lamp flashes at a wrong answer */
  private readonly subjects: (LayoutMarker | undefined)[] = [];
  private readonly door: MarkerId;
  private readonly answers: (number | string)[];
  private readonly ringCount: number;
  /** ticks a lamp of the ring takes (0.75 s) */
  private readonly fillTicks: number;
  private readonly reask: number;
  private question = 0;
  private listen = 0;
  private wrongCount = 0;
  private relaxedPorts = false;
  /** ticks of the question 3 subtitle still to run; ticks into the lamp being filled */
  private subtitleLeft = 0;
  private ringT = 0;
  private reaskT = 0;
  private sinceEmpty = 1e9;
  private flashNode: THREE.Object3D | null = null;
  private flashLeft = 0;
  private flutterLeft = 0;
  private flutterT = 0;
  private flutterOn = true;
  private attached = false;
  private readonly v = new THREE.Vector3();
  private readonly questionPayload: GameEvents['asking/question'] = { question: 1 };
  private readonly listenPayload: GameEvents['asking/listen'] = { lit: 0, of: 12 };

  constructor(private readonly s: State) {
    this.core = new PuzzleCore(s, this.id, 3, { normal: ASK_HINT_NORMAL, fast: ASK_HINT_FAST });
    this.view = this.core.view;
    const { data } = s.ctx;
    const elements = data.markersOfType('puzzle_element').filter((m) => m.params.puzzle === this.id);
    this.zone = (elements[0] as LayoutMarker).zone;
    for (const m of elements) {
      if (m.params.role !== 'port') continue;
      this.ports.push(new Shot(this, m.id, 'ask_port', this.ports.length, m));
      this.numbers.push(paramNumber(m, 'number', this.ports.length));
    }
    this.ring = elements.find((m) => m.params.role === 'listening_lamps');
    this.ringCount = this.ring ? paramNumber(this.ring, 'count', 12) : 12;
    this.fillTicks = Math.max(1, Math.round((this.ring ? paramNumber(this.ring, 'fillSecondsEach', 0.75) : 0.75) / FIXED_DT));
    this.listenPayload.of = this.ringCount;
    const vol = this.core.volume;
    this.answers = vol && Array.isArray(vol.params.answers) ? (vol.params.answers as (number | string)[]) : [4, 6, 'hold fire'];
    this.reask = Math.max(REASK_MIN, vol ? paramNumber(vol, 'reaskSeconds', 20) : 20);
    this.door = doorOfPuzzle(s, this.id);
    const inZone = data.markersInZone(this.zone);
    this.cradle = inZone.find((m) => m.params.kind === 'look_target');
    // question n's subject is the prop whose `answers` names that question's line; question 3's is the cradle
    for (let q = 1; q <= 2; q++) this.subjects.push(inZone.find((m) => m.params.answers === namedLine(vol, 'lines', 'q' + q)));
    this.subjects.push(this.cradle);
    s.ctx.events.on('weapon/fired', () => this.onFired());
  }

  // ---- what is built --------------------------------------------------------------------------------
  attach(): void {
    const { s } = this;
    this.attached = true;
    for (const port of this.ports) {
      const m = port.marker as LayoutMarker;
      const node = s.build.partNode(m.id);
      if (node) node.getWorldPosition(this.v); else this.v.set(m.pos[0], m.pos[1], m.pos[2]);
      port.add(s, this.v.x, this.v.y, this.v.z, paramNumber(m, 'hitRadius', 0.2), 'ceramic', 0);
    }
    this.sync();
  }
  detach(): void {
    this.attached = false;
    for (const port of this.ports) port.remove(this.s);
    this.flashNode = null;
  }
  private answerIndex(): number {
    const a = this.answers[this.question - 1];
    return typeof a === 'number' ? this.numbers.indexOf(a) : -1;
  }
  private portMask(): number {
    if (this.view.solved || this.question === 0 || this.question >= 3) return 0;
    const answer = this.answerIndex();
    if (this.relaxedPorts && answer >= 0) return this.flutterOn ? 1 << answer : 0;
    const all = (1 << this.ports.length) - 1;
    return answer >= 0 && !this.flutterOn ? all & ~(1 << answer) : all;
  }
  /** the subject of a question: the lamp of the thing it is about */
  private subjectLamp(q: number): THREE.Object3D | null {
    const { s } = this;
    const m = this.subjects[q - 1];
    if (!m) return null;
    const own = lampNode(s, m.id);
    if (own) return own;
    // zone geometry (the wall diagram): the zone GLB's lamp set that carries the prop's name
    const env = s.ctx.data.manifest.assets[s.ctx.data.manifest.zones[this.zone].env];
    const stem = m.id.replace(/^prop_/, '');
    for (const name of Object.keys(env?.lampSets ?? {})) if (name.includes(stem)) return s.build.zoneNode(this.zone, name);
    return null;
  }
  private sync(): void {
    const { s } = this;
    if (!this.attached) return;
    const lamps = s.ctx.render.lamps;
    for (const port of this.ports) port.enable(s, !this.view.solved);
    const portLamps = this.door ? s.build.node(this.door, 'port_lamps') : null;
    if (portLamps) lamps.setMask(portLamps, this.portMask());
    const ring = this.ring ? s.build.partNode(this.ring.id) : null;
    if (ring) lamps.setCount(ring, this.listen);
    const cradle = this.cradle ? lampNode(s, this.cradle.id, 'cradle_lamp') : null;
    if (cradle) { lamps.setMask(cradle, 1); lamps.setBoost(cradle, 1 + this.listen / this.ringCount); }
  }

  // ---- the questions --------------------------------------------------------------------------------
  private put(q: number): void {
    const { s } = this;
    this.question = q;
    this.wrongCount = 0; this.relaxedPorts = false; this.reaskT = 0; this.flutterLeft = 0; this.flutterOn = true;
    this.listen = 0; this.ringT = 0; this.sinceEmpty = 1e9;
    this.questionPayload.question = q as 1 | 2 | 3;
    s.ctx.events.emit('asking/question', this.questionPayload);
    const key = namedLine(this.core.volume, 'lines', 'q' + q);
    if (key) s.story.sayNow(key);
    if (q === 3) {
      this.subtitleLeft = Math.round((s.ctx.data.story.lines[key]?.seconds ?? 3) / FIXED_DT);
      // nobody enters the chamber without hearing that he took the charge out (GDD 9.7): the question lights the cradle
      const lines = this.cradle ? paramList(this.cradle, 'lines') : [];
      s.story.sayFrontAll(lines);                         // (a line already heard is refused by the once-only rule)
    }
    this.sync();
  }
  /** she is turned to the cradle from within its look range */
  private atCradle(): boolean {
    const c = this.cradle;
    if (!c) return false;
    const p = this.s.ctx.player.position, dx = p.x - c.pos[0], dz = p.z - c.pos[2], r = paramNumber(c, 'lookRange', 4);
    return dx * dx + dz * dz <= r * r && this.s.lookCos(c.pos[0], c.pos[1], c.pos[2]) >= CRADLE_COS;
  }
  private onFired(): void {
    if (this.question !== 3 || this.view.solved || !this.attached) return;
    // any shot, anywhere, empties the ring at once; it starts again from nothing
    const had = this.listen;
    this.listen = 0; this.ringT = 0; this.sinceEmpty = 0;
    if (had > 0) {
      this.listenPayload.lit = 0;
      this.s.ctx.events.emit('asking/listen', this.listenPayload);
    }
    this.sync();
    // T1 on question 3: the cradle's lamp flares at each reset
    if (this.core.clock.tier >= 1 && this.s.hintsOn()) this.flash(this.subjectLamp(3));
  }
  private flash(node: THREE.Object3D | null): void {
    if (!node) return;
    this.s.ctx.render.lamps.setBoost(node, 3);
    this.flashNode = node; this.flashLeft = FLASH_SECONDS;
  }
  onShot(shot: Shot, _hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    const { s } = this;
    out.outcome = 'broke'; out.stops = true; out.stopsLine = true;
    const n = this.numbers[shot.index] as number;
    s.shootableHit(shot.id, 'ask_port', n, damage.ammo ?? 'lead_round', shot.x, shot.y, shot.z);
    if (this.view.solved || this.question === 0) return;
    if (this.question < 3 && this.answers[this.question - 1] === n) {
      this.core.progress(this.question, shot.id);
      this.put(this.question + 1);
      return;
    }
    // a wrong port: a flat tone, the station says so, and the lamp of what the question is about flashes
    this.wrongCount++;
    this.core.wrong(shot.id);
    s.cue('ask_wrong', shot.x, shot.y, shot.z);
    s.story.sayNow(namedLine(this.core.volume, 'lines', 'wrong'));
    this.flash(this.subjectLamp(this.question));
    if (this.question < 3 && this.wrongCount >= WRONG_LIMIT && !this.relaxedPorts) { this.relaxedPorts = true; this.sync(); }
  }
  private finish(instant: boolean): void {
    const { s } = this;
    this.question = 3;
    this.listen = this.ringCount;
    this.view.step = 3;
    this.core.solved();
    this.sync();
    if (!instant) {
      s.story.sayNow(namedLine(this.core.volume, 'lines', 'done'));
      const d = s.ctx.data.layout.markers.find((m) => m.id === this.door);
      if (d) s.cueAt('ask_right', d);
    }
    if (this.door) s.doors.open(this.door, instant);
  }

  tick(_dt: number): void {
    const { s } = this;
    if (!this.attached || !s.playing) return;
    if (this.flashLeft > 0) {
      this.flashLeft -= FIXED_DT;
      if (this.flashLeft <= 0 && this.flashNode) { s.ctx.render.lamps.setBoost(this.flashNode, this.flashNode === this.subjectLamp(3) ? 1 + this.listen / this.ringCount : 1); this.flashNode = null; }
    }
    if (this.view.solved) return;
    if (this.sinceEmpty < 1e8) this.sinceEmpty += FIXED_DT;
    const tier = this.core.tick(this.question < 3 || this.sinceEmpty < EMPTYING_WINDOW);
    if (this.question === 0) { if (this.core.inside) this.put(1); return; }
    if (tier === 1 && this.question < 3) { this.flutterLeft = FLUTTER_SECONDS; this.flutterT = 0; }
    else if (tier === 2) s.story.say(this.core.hintKey('T2'));
    else if (tier === 3) s.story.say(this.core.hintKey(this.question === 3 ? 'T3' : 'T3num'));
    else if (tier === 4 && this.question < 3 && !this.relaxedPorts) { this.relaxedPorts = true; this.sync(); }
    if (this.flutterLeft > 0) {
      // T1: the correct port's lamp flutters
      this.flutterLeft -= FIXED_DT; this.flutterT -= FIXED_DT;
      if (this.flutterT <= 0 || this.flutterLeft <= 0) {
        this.flutterT = FLUTTER_STEP;
        this.flutterOn = this.flutterLeft <= 0 ? true : !this.flutterOn;
        const portLamps = this.door ? s.build.node(this.door, 'port_lamps') : null;
        if (portLamps) s.ctx.render.lamps.setMask(portLamps, this.portMask());
      }
    }
    if (this.question < 3) {
      // an unanswered question is asked again, in a quiet moment (REASK_MIN)
      const key = namedLine(this.core.volume, 'lines', 'q' + this.question);
      if (s.story.current === key) this.reaskT = 0;                      // counted from the end of the question itself
      else if (this.core.inside && s.story.idle && !this.atCradle()) this.reaskT += FIXED_DT;
      if (this.reaskT >= this.reask) { this.reaskT = 0; s.story.say(key); }
      return;
    }
    // ---- question 3: the ring counts while she holds her fire, inside the volume
    if (this.subtitleLeft > 0) { this.subtitleLeft--; return; }
    if (!this.core.inside) return;
    if (++this.ringT < this.fillTicks) return;
    this.ringT = 0;
    this.listen++;
    const ring = this.ring ? s.build.partNode(this.ring.id) : null;
    if (ring) s.ctx.render.lamps.setCount(ring, this.listen);
    const cradle = this.cradle ? lampNode(s, this.cradle.id, 'cradle_lamp') : null;
    if (cradle) s.ctx.render.lamps.setBoost(cradle, 1 + this.listen / this.ringCount);
    if (this.ring) s.cueAt('listen_tick', this.ring);
    this.listenPayload.lit = this.listen;
    s.ctx.events.emit('asking/listen', this.listenPayload);
    if (this.listen >= this.ringCount) this.finish(false);
  }

  reset(): void {
    this.question = 0; this.listen = 0; this.wrongCount = 0; this.relaxedPorts = false; this.subtitleLeft = 0; this.ringT = 0;
    this.reaskT = 0; this.sinceEmpty = 1e9; this.flashLeft = 0; this.flashNode = null; this.flutterLeft = 0; this.flutterOn = true;
    this.core.reset();
    this.sync();
  }
  capture(): PuzzleSave { return { solved: this.view.solved, step: this.view.solved ? 3 : Math.max(0, this.question - 1), data: { question: this.question } }; }
  solvedSave(): PuzzleSave { return { solved: true, step: 3, data: { question: 3 } }; }
  apply(save: PuzzleSave | undefined): void {
    // an unfinished asking starts again from the first question (it is three shots long)
    this.reset();
    if (save && save.solved) { this.view.solved = true; this.view.step = 3; this.question = 3; this.listen = this.ringCount; }
    this.sync();
  }
  solve(): void { if (!this.view.solved) this.finish(true); }
  addHintSeconds(seconds: number): void { this.core.clock.seconds += seconds; }
}

export function createTheAsking(s: State): Puzzle { return new TheAsking(s); }
