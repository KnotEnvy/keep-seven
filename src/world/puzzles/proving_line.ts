// src/world/puzzles/proving_line.ts: GDD 13.3. Three knots that heal each other hold the baffle. A lead round bursts
// one (its door lamp lights); it regrows in 3.0 s. A line round bursts every knot on its line. All three burst within
// 0.5 s of each other do not regrow: solved.
//
// The assist (producer ruling 6): the snap lives in knot_a's hit receiver. While she stands on the brass step, knot_a
// answers line rounds with an enlarged volume (0.6 m) and bursts b and c itself, 40 and 80 ms later. GDD 13.3 says
// "standing anywhere on the step works", so the test is the 0.6 m alone (docs/requests/code-world.md: from a corner of
// the step a ray aimed at knot_a is 5.7 degrees off the authored true line, more than the order's 3). T4 widens it to
// any line round within 10 degrees of the true line.
import { FIXED_DT } from '../../core/contracts.ts';
import type {
  DamageInfo, GameEvents, HitResponse, HitResult, LayoutMarker, LayoutSolid, MarkerId, PuzzleSave, PuzzleView, ZoneId,
} from '../../core/contracts.ts';
import { DEG2RAD } from '../../core/math.ts';
import { PUZZLE_CHECKPOINT, Shot, doorOfPuzzle, lampNode, namedLine, paramNumber, paramString, rayDistance } from '../internals.ts';
import type { Puzzle, ShotOwner, State } from '../internals.ts';
import { PuzzleCore } from './hints.ts';

/** GDD 13.3 */
const TOGETHER = 0.5;
const ASSIST_GAP = 0.04;

interface Knot { marker: LayoutMarker; shot: Shot; burst: boolean; since: number; pending: number; radius: number; regrow: number }

/** the T1 pulse of the knots starts again this long after its last glint */
const T1_AGAIN = 3;

class ProvingLine implements Puzzle, ShotOwner {
  readonly id = 'proving_line' as const;
  readonly zone: ZoneId;
  readonly view: PuzzleView;
  private readonly core: PuzzleCore;
  private readonly knots: Knot[] = [];
  private readonly mark: LayoutMarker | undefined;
  private readonly loop: LayoutMarker | undefined;
  private readonly step: LayoutSolid | undefined;
  private readonly door: MarkerId;
  /** unit direction of the authored true line: the eye above the mark through the knots */
  private lineX = 1; private lineY = 0; private lineZ = 0;
  private readonly snapRadius: number;
  private readonly snapT4Cos: number;
  private readonly snapT4Radius: number;
  private onStep = false;
  private attached = false;
  private outlined = false;
  private glintIn = -1;
  private glintAt = 0;
  /** the locker in this zone that gives the line round for this puzzle (the bay's): T4 points at it */
  private readonly locker: LayoutMarker | undefined;
  private readonly stepPayload: GameEvents['world/on_step'] = { on: false };
  private readonly regrownPayload: GameEvents['knot/regrown'] = { x: 0, y: 0, z: 0, id: '' };

  constructor(private readonly s: State) {
    this.core = new PuzzleCore(s, this.id, 3);
    this.view = this.core.view;
    const { data } = s.ctx;
    const elements = data.markersOfType('puzzle_element').filter((m) => m.params.puzzle === this.id);
    this.zone = (elements[0] as LayoutMarker).zone;
    this.mark = elements.find((m) => m.params.role === 'mark');
    this.loop = elements.find((m) => m.params.role === 'sighting_loop');
    for (const m of elements) {
      if (m.params.role !== 'knot') continue;
      this.knots.push({ marker: m, shot: new Shot(this, m.id, 'knot', this.knots.length, m), burst: false, since: 0, pending: -1, radius: paramNumber(m, 'hitRadius', 0.2), regrow: paramNumber(m, 'regrowSeconds', 3) });
    }
    const eye = (this.mark?.params.eye as [number, number, number] | undefined) ?? [0, 0, 0];
    const far = this.knots[this.knots.length - 1];
    if (far) {
      const dx = far.marker.pos[0] - eye[0], dy = far.marker.pos[1] - eye[1], dz = far.marker.pos[2] - eye[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      this.lineX = dx / l; this.lineY = dy / l; this.lineZ = dz / l;
    }
    this.step = data.layout.solids.find((x) => x.id === this.mark?.params.step);
    this.snapRadius = this.mark ? paramNumber(this.mark, 'snapRadiusAtKnotA', 0.6) : 0.6;
    const t4 = (this.mark ? paramNumber(this.mark, 'snapT4Deg', 10) : 10) * DEG2RAD;
    this.snapT4Cos = Math.cos(t4);
    const near = this.knots[0];
    const reach = near ? Math.hypot(near.marker.pos[0] - eye[0], near.marker.pos[1] - eye[1], near.marker.pos[2] - eye[2]) + (this.step ? this.step.size[0] : 1.6) : 10;
    this.snapT4Radius = Math.max(this.snapRadius, reach * Math.tan(t4) + 0.3);
    this.door = doorOfPuzzle(s, this.id);
    this.locker = data.markersOfType('interactable').find((m) => m.zone === this.zone && paramString(m, 'interactable').startsWith('ia_line_locker'));
    // the first line round fired, wherever: the narrator says what it is (once)
    s.ctx.events.on('weapon/fired', (e) => {
      if (e.ammo !== 'line_round') return;
      // (p0: on her act, over a room's description: it was said a room later, or never)
      s.story.sayUrgent(namedLine(this.core.volume, 'lines', 'firstLine'));
      this.afterLine(e);
    });
  }

  // ---- what is built --------------------------------------------------------------------------------
  attach(): void {
    const { s } = this;
    this.attached = true;
    for (const k of this.knots) {
      const m = k.marker;
      k.shot.add(s, m.pos[0], m.pos[1], m.pos[2], k.radius, 'metal', 0);
    }
    this.onStep = false;
    this.sync();
  }
  detach(): void {
    const { s } = this;
    this.attached = false;
    for (const k of this.knots) k.shot.remove(s);
    if (this.onStep) { this.onStep = false; this.stepPayload.on = false; s.ctx.events.emit('world/on_step', this.stepPayload); }
  }
  private mask(): number {
    let mask = 0;
    for (let i = 0; i < this.knots.length; i++) if ((this.knots[i] as Knot).burst) mask |= 1 << i;
    return mask;
  }
  private lamps(): void {
    const { s } = this;
    const node = this.door ? lampNode(s, this.door) : null;
    if (node) s.ctx.render.lamps.setMask(node, this.mask());
  }
  private showKnot(k: Knot): void {
    const inst = this.s.build.instance(k.marker.id);
    const node = inst ? this.s.ctx.data.manifest.assets[inst.id]?.nodes[0] : undefined;
    if (inst && node) inst.node(node).visible = !k.burst;
  }
  private stepLamps(): void {
    const { s } = this;
    const lamps = s.ctx.render.lamps;
    const on = this.onStep ? 1 : 0;
    const rim = this.loop ? lampNode(s, this.loop.id) : null;
    if (rim) lamps.setMask(rim, on);
    const glow = this.mark ? lampNode(s, this.mark.id) : null;
    // (T4: the mark's glow stands lit, brighter, until she steps on it)
    const call = this.core.clock.relaxed && !this.view.solved;
    if (glow) { lamps.setMask(glow, on || call ? 1 : 0); lamps.setBoost(glow, call && !this.onStep ? 2 : 1); }
  }
  private sync(): void {
    const { s } = this;
    if (!this.attached) return;
    for (const k of this.knots) { this.showKnot(k); k.shot.enable(s, !this.view.solved); }
    this.lamps();
    this.stepLamps();
    this.assistVolume();
  }
  /** knot_a's volume: its own 0.2 m, the assist's 0.6 m on the step, wider once T4 has relaxed the puzzle */
  private assistVolume(): void {
    const k = this.knots[0];
    if (!k || !this.attached) return;
    const r = !this.onStep ? k.radius : this.core.clock.relaxed ? this.snapT4Radius : this.snapRadius;
    if (r !== k.shot.radius) k.shot.move(this.s, k.shot.x, k.shot.y, k.shot.z, r);
  }

  // ---- shots ----------------------------------------------------------------------------------------
  /** a line round fired from the step that the assist takes: within 0.6 m of knot_a, or (T4) within 10 degrees of the true line */
  private assisted(k: Knot, d: Readonly<DamageInfo>): boolean {
    if (!this.onStep) return false;
    if (rayDistance(d, k.shot.x, k.shot.y, k.shot.z) <= this.snapRadius) return true;
    return this.core.clock.relaxed && d.dx * this.lineX + d.dy * this.lineY + d.dz * this.lineZ >= this.snapT4Cos;
  }
  /**
   * The same assist when the round never reached knot_a's volume: from the step's corners nearest the gallery the end
   * of the south pipe bank stands between her eye and the knot (docs/requests/code-world.md). The line is judged from
   * the shot itself (weapon/fired comes after the receivers), so "standing anywhere on the step works" (GDD 13.3).
   */
  private afterLine(e: Readonly<GameEvents['weapon/fired']>): void {
    const k = this.knots[0];
    if (!k || !this.attached || this.view.solved || !this.onStep || e.shotId === this.assistedShot) return;
    const d = this.ray;
    d.ox = e.ox; d.oy = e.oy; d.oz = e.oz; d.dx = e.dx; d.dy = e.dy; d.dz = e.dz; d.shotId = e.shotId;
    if (!this.assisted(k, d)) return;
    this.assistedShot = e.shotId;
    this.lineShot = e.shotId;
    this.burst(k);
    for (let i = 1; i < this.knots.length; i++) { const o = this.knots[i] as Knot; if (!o.burst && o.pending < 0) o.pending = ASSIST_GAP * i; }
  }
  private assistedShot = -1;
  private readonly ray: DamageInfo = { amount: 0, kind: 'bullet', source: 'player', sourceId: 'player', ammo: 'line_round', shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };

  onShot(shot: Shot, _hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    const k = this.knots[shot.index] as Knot;
    const line = damage.ammo === 'line_round';
    out.stopsLine = false;
    if (line && shot.index === 0 && this.assisted(k, damage)) {
      this.assistedShot = damage.shotId;
      // the three burst as one line: a now, the rest 40 ms apart, as the round would have met them
      out.outcome = 'broke'; out.stops = true;
      this.lineShot = damage.shotId;
      this.burst(k);
      for (let i = 1; i < this.knots.length; i++) { const o = this.knots[i] as Knot; if (!o.burst && o.pending < 0) o.pending = ASSIST_GAP * i; }
      return;
    }
    // the volume may be larger than the knot (the assist): a round that does not meet the knot itself passes
    if (k.burst || rayDistance(damage, k.shot.x, k.shot.y, k.shot.z) > k.radius) { out.outcome = 'passed'; out.stops = false; return; }
    out.outcome = 'broke'; out.stops = !line;
    this.lineShot = line ? damage.shotId : -1;
    this.burst(k);
  }
  /**
   * Pass i4 (story reviewer b; R12): the end card's "Lines of three or more" stood at 0 after the one line the stage
   * teaches. The player's own count (`combat/line_resolved`) sees the knots the round itself met: one or two, since the
   * assist bursts the rest 40 ms apart from this file. The shot id of the last line round that burst a knot here: when
   * the puzzle is solved by it (all three inside TOGETHER), it is a line of three unless the player's count already
   * said so for that shot (`State.lineCounted`).
   */
  private lineShot = -1;
  private burst(k: Knot): void {
    const { s } = this;
    if (k.burst || this.view.solved) return;
    k.burst = true; k.since = 0; k.pending = -1;
    this.showKnot(k);
    this.lamps();
    let n = 0, together = true;
    for (const o of this.knots) { if (o.burst) n++; if (!o.burst || o.since > TOGETHER) together = false; }
    const solved = together && n === this.knots.length;
    s.knotBurst(k.marker.id, !solved, k.shot.x, k.shot.y, k.shot.z);
    if (this.door) s.lamp(this.door, n, this.knots.length);
    this.view.step = n;
    s.progress(this.view, k.marker.id);
    if (solved && this.lineShot >= 0 && s.lineCounted !== this.lineShot) { s.lineCounted = this.lineShot; s.stats.linesOfThree++; }
    if (solved) this.finish(false);
  }
  private finish(instant: boolean): void {
    const { s } = this;
    for (const k of this.knots) { k.burst = true; k.pending = -1; }
    this.view.step = this.knots.length;
    if (this.outlined) { s.ctx.render.setOutline(null); this.outlined = false; }
    this.core.solved();
    this.sync();
    if (this.door) s.doors.open(this.door, instant);
    const cp = PUZZLE_CHECKPOINT[this.id];
    if (cp) s.checkpoints.reach(cp, true);
    s.interact.onProvingSolved();
  }

  tick(_dt: number): void {
    const { s } = this;
    if (!this.attached || !s.playing) return;
    // ---- the brass step: on it or off it
    const step = this.step;
    if (step) {
      const p = s.ctx.player.position;
      const top = step.pos[1] + step.size[1] / 2;
      const on = Math.abs(p.x - step.pos[0]) <= step.size[0] / 2 && Math.abs(p.z - step.pos[2]) <= step.size[2] / 2 && p.y >= top - 0.05 && p.y <= top + 0.5;
      if (on !== this.onStep) {
        this.onStep = on;
        this.stepPayload.on = on;
        s.ctx.events.emit('world/on_step', this.stepPayload);
        if (on && this.mark) s.cueAt('step_chime', this.mark);
        this.stepLamps();
        this.assistVolume();
      }
    }
    if (this.view.solved) return;
    for (let i = 0; i < this.knots.length; i++) {
      const k = this.knots[i] as Knot;
      if (k.pending >= 0) { k.pending -= FIXED_DT; if (k.pending < 0) { this.burst(k); if (this.view.solved) return; } }
      if (!k.burst) continue;
      k.since += FIXED_DT;
      if (k.since < k.regrow) continue;
      // alone, it heals: a descending tone and its lamp gutters out
      k.burst = false;
      this.showKnot(k);
      this.lamps();
      const r = this.regrownPayload;
      r.id = k.marker.id; r.x = k.shot.x; r.y = k.shot.y; r.z = k.shot.z;
      s.ctx.events.emit('knot/regrown', r);
      if (this.door) s.lamp(this.door, this.mask() === 0 ? 0 : this.count(), this.knots.length);
      this.view.step = this.count();
    }
    const tier = this.core.tick();
    if (tier === 1) {
      // the knots pulse near to far, and the loop's rim glints
      this.glintIn = 0; this.glintAt = 0;
      const rim = this.loop ? lampNode(s, this.loop.id) : null;
      if (rim) s.ctx.render.lamps.setBoost(rim, 2);
    } else if (tier === 2) s.story.say(this.core.hintKey('T2'));
    else if (tier === 3) {
      s.story.say(this.core.hintKey('T3'));
      const inst = this.mark ? s.build.instance(this.mark.id) : null;
      if (inst) { s.ctx.render.setOutline(inst.root); this.outlined = true; }
    } else if (tier === 4) {
      // T4 (polish round 3: it drew nothing): the assist widens, AND the two things she needs are lit: the brass
      // step's own glow stands on with nobody on it, and the step and the locker that gives the round glint in turn
      this.assistVolume();
      this.stepLamps();
      if (this.mark) this.core.cueAt(this.mark.pos[0], this.mark.pos[1] + 0.15, this.mark.pos[2]);
      const locker = this.locker;
      if (locker) this.core.cueAt(locker.pos[0], locker.pos[1] + 1.0, locker.pos[2], true);
    }
    if (this.glintIn >= 0) {
      this.glintIn -= FIXED_DT;
      if (this.glintIn < 0) {
        const k = this.knots[this.glintAt];
        if (k) { s.glint(k.shot.x, k.shot.y, k.shot.z, 0.6); this.glintAt++; this.glintIn = 0.3; }
        else {
          // T1 goes on as a slow pulse (polish round 3): the knots glint near to far again every few seconds until a
          // correct step, while she stands in the bay with hints on
          const again = this.core.clock.tier >= 1 && this.core.inside && s.hintsOn();
          this.glintIn = again ? T1_AGAIN : -1; this.glintAt = 0;
          const rim = this.loop ? lampNode(s, this.loop.id) : null;
          if (rim && !again) s.ctx.render.lamps.setBoost(rim, 1);
        }
      }
    }
  }
  private count(): number {
    let n = 0;
    for (let i = 0; i < this.knots.length; i++) if ((this.knots[i] as Knot).burst) n++;
    return n;
  }

  reset(): void {
    for (const k of this.knots) { k.burst = false; k.since = 0; k.pending = -1; }
    this.outlined = false; this.glintIn = -1;
    this.core.reset();
    this.sync();
  }
  capture(): PuzzleSave { return { solved: this.view.solved, step: this.view.solved ? this.knots.length : 0, data: {} }; }
  solvedSave(): PuzzleSave { return { solved: true, step: this.knots.length, data: {} }; }
  apply(save: PuzzleSave | undefined): void {
    this.core.reset();
    const solved = save !== undefined && save.solved;
    for (const k of this.knots) { k.burst = solved; k.since = 0; k.pending = -1; }
    this.view.solved = solved;
    this.view.step = solved ? this.knots.length : 0;
    this.outlined = false; this.glintIn = -1;
    this.sync();
  }
  solve(): void { if (!this.view.solved) this.finish(true); }
  addHintSeconds(seconds: number): void { this.core.clock.seconds += seconds; }
}

export function createProvingLine(s: State): Puzzle { return new ProvingLine(s); }
