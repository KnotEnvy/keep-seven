// src/world/puzzles/seven_jugs.ts: GDD 13.1. Six jugs on the gate bar, a seventh on the pylon's stub arm. Each one shot
// bursts, the sweep creaks up a notch and the gate rises 0.2 m; six leave it 1.2 m open (no crouch: impassable), the
// seventh opens it to 2.6 m. Any order. Each jug's hit sphere follows its hook as the bar rises.
import type * as THREE from 'three';
import type { DamageInfo, FxHandle, HitResponse, HitResult, LayoutMarker, MarkerId, PuzzleSave, PuzzleView, ZoneId } from '../../core/contracts.ts';
import { DEG2RAD } from '../../core/math.ts';
import { PUZZLE_CHECKPOINT, Shot, namedLine, paramNumber } from '../internals.ts';
import type { Puzzle, ShotOwner, State } from '../internals.ts';
import { PuzzleCore } from './hints.ts';

/** GDD 13.1: gate_height = 0.2 x min(jugs, 6), then 2.6 m at 7; the sweep arm turns 4 degrees a jug */
const NOTCH = 0.2;
const OPEN_HEIGHT = 2.6;
const SWEEP_DEG = 4;
/** T4: the seventh's hit radius doubles; 60 s later (360 s on Normal) the rope gives and what still hangs falls */
const FALL_AFTER_RELAX = 60;
const FALL_GAP = 0.15;

interface Jug {
  marker: LayoutMarker;
  seventh: boolean;
  /** rides the gate bar (a `follow` binding) */
  follows: boolean;
  broken: boolean;
  shot: Shot;
  /** instanced tokens: the intact variant the build placed, the broken one this file adds */
  intact: number;
  shard: number;
  hook: THREE.Object3D | null;
  hookRest: number;
}

/**
 * T2 with fewer than six jugs down (story.json; the volume's `hints.T2few` wins when level design names it there:
 * docs/requests/code-world.md).
 */
const LINE_T2_FEW = 'hint_jugs_2_few';

class SevenJugs implements Puzzle, ShotOwner {
  readonly id = 'seven_jugs' as const;
  readonly zone: ZoneId;
  readonly view: PuzzleView;
  private readonly core: PuzzleCore;
  private readonly jugs: Jug[] = [];
  private readonly door: MarkerId;
  private count = 0;
  private six = 0;
  private attached = false;
  private thread: FxHandle | null = null;
  private sweep: THREE.Object3D | null = null;
  private sweepRest = 0;
  private lastRaise = -1;
  private falling = false;
  private fallTimer = 0;
  private outlined = false;
  private readonly seventhJug: Jug | null;

  constructor(private readonly s: State) {
    this.core = new PuzzleCore(s, this.id, 7);
    this.view = this.core.view;
    const { data } = s.ctx;
    const elements = data.markersOfType('puzzle_element').filter((m) => m.params.puzzle === this.id);
    for (const m of elements) {
      const b = data.bindings(m)[0];
      this.jugs.push({
        marker: m, seventh: m.params.role === 'seventh_jug', follows: b !== undefined && b.follow !== undefined, broken: false,
        shot: new Shot(this, m.id, 'jug', this.jugs.length, m), intact: -1, shard: -1, hook: null, hookRest: 0,
      });
    }
    this.zone = (elements[0] as LayoutMarker).zone;
    this.seventhJug = this.jugs.find((j) => j.seventh) ?? null;
    const door = data.markersOfType('door').find((m) => m.params.puzzle === this.id);
    this.door = door ? door.id : '';
  }

  private hanging(): Jug | null {
    for (let i = 0; i < this.jugs.length; i++) if (!(this.jugs[i] as Jug).broken) return this.jugs[i] as Jug;
    return null;
  }
  private raiseFor(count: number): number { return count >= this.jugs.length ? OPEN_HEIGHT : NOTCH * Math.min(count, 6); }

  // ---- what is built --------------------------------------------------------------------------------
  attach(): void {
    const { s } = this;
    const { data } = s.ctx;
    this.attached = true;
    const gate = data.layout.markers.find((m) => m.id === this.door);
    const gateBinding = gate ? data.bindings(gate)[0] : undefined;
    const barName = gateBinding ? data.manifest.assets[gateBinding.asset]?.codeDriven?.[0] : undefined;
    const bar = barName ? s.build.node(this.door, barName) : null;
    for (const j of this.jugs) {
      const m = j.marker;
      j.intact = s.build.token(m.id);
      j.shard = -1;
      j.shot.enabled = !j.broken;
      j.shot.add(s, m.pos[0], m.pos[1], m.pos[2], paramNumber(m, 'hitRadius', 0.22) * (j.seventh && this.core.clock.relaxed ? 2 : 1), 'ceramic', 0);
      const b = data.bindings(m)[0];
      j.hook = b && b.follow ? s.build.node(b.follow.owner, b.follow.node) : null;
      if (j.hook) {
        // a hook that is not carried by the bar in this file (the placeholders) is moved with it by hand
        let carried = false;
        for (let o: THREE.Object3D | null = j.hook; o; o = o.parent) if (o === bar) carried = true;
        const rest = b && b.follow ? data.manifest.assets[(gateBinding as { asset: string }).asset]?.nodePos?.[b.follow.node] : undefined;
        j.hookRest = rest ? rest[1] : j.hook.position.y;
        if (carried) j.hook = null;
      }
    }
    for (const p of s.build.placed(this.door)) {
      const def = data.manifest.assets[p.binding.asset];
      if (p.inst && p.binding.space === 'world' && def && def.codeDriven && def.codeDriven[0]) {
        this.sweep = p.inst.node(def.codeDriven[0]);
        let rest = 0;
        s.ctx.assets.get(p.binding.asset).scene.traverse((o) => { if (o.name === (def.codeDriven as string[])[0] || o.userData.name === (def.codeDriven as string[])[0]) rest = o.rotation.z; });
        this.sweepRest = rest;
      }
    }
    this.sync();
  }
  detach(): void {
    const { s } = this;
    this.attached = false;
    for (const j of this.jugs) { j.shot.remove(s); j.intact = -1; j.shard = -1; j.hook = null; }
    if (this.thread) { this.thread.release(); this.thread = null; }
    this.sweep = null;
    this.lastRaise = -1;
  }
  /** push the puzzle's state onto what is built: variants, volumes, the bar, the sweep, the sand thread */
  private sync(): void {
    const { s } = this;
    if (!this.attached) return;
    for (const j of this.jugs) {
      const placed = s.build.placed(j.marker.id)[0];
      if (j.intact >= 0) s.build.instShow(j.intact, !j.broken);
      if (j.broken && j.shard < 0 && placed) j.shard = s.build.instAdd(placed.zone, placed.binding.asset, 'jug_broken', placed.x, placed.y, placed.z, placed.rot, placed.scale);
      if (!j.broken && j.shard >= 0) { s.build.instRemove(j.shard); j.shard = -1; }
      j.shot.enable(s, !j.broken);
    }
    const seventh = this.seventhJug;
    if (seventh && !seventh.broken && !this.thread) {
      const m = seventh.marker;
      this.thread = s.ctx.render.vfx.acquireCard('sand_thread');
      if (this.thread) { this.thread.setPosition(m.pos[0], m.pos[1] - 0.3, m.pos[2]); this.thread.setEnd(m.pos[0], 0, m.pos[2]); this.thread.setLevel(0.6); this.thread.setVisible(true); }
    }
    if (seventh && seventh.broken && this.thread) { this.thread.release(); this.thread = null; }
    if (this.sweep) { this.sweep.rotation.z = this.sweepRest - SWEEP_DEG * DEG2RAD * this.count; this.sweep.updateMatrix(); }
    this.lastRaise = -1;
    this.follow();
  }
  /** the jugs (drawn and hit) ride the bar: marker + the hook's displacement from rest */
  private follow(): void {
    const { s } = this;
    const raise = s.doors.raiseOf(this.door);
    if (raise === this.lastRaise) return;
    this.lastRaise = raise;
    for (const j of this.jugs) {
      if (!j.follows) continue;
      if (j.hook) { j.hook.position.y = j.hookRest + raise; j.hook.updateMatrix(); }
      const placed = s.build.placed(j.marker.id)[0];
      if (!placed) continue;
      if (j.intact >= 0) s.build.instMove(j.intact, placed.x, placed.y + raise, placed.z);
      if (j.shard >= 0) s.build.instMove(j.shard, placed.x, placed.y + raise, placed.z);
      j.shot.move(s, j.marker.pos[0], j.marker.pos[1] + raise, j.marker.pos[2]);
    }
  }

  // ---- shots ----------------------------------------------------------------------------------------
  onShot(shot: Shot, _hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    out.outcome = 'broke'; out.stops = true; out.stopsLine = false;
    this.burst(this.jugs[shot.index] as Jug, damage.ammo ?? 'lead_round', true);
  }
  private burst(j: Jug, ammo: 'lead_round' | 'line_round' | 'kept_round', announce: boolean): void {
    const { s } = this;
    if (j.broken || this.view.solved) return;
    j.broken = true;
    this.count++;
    const degree = j.seventh ? 7 : ++this.six;
    if (announce) s.shootableHit(j.marker.id, 'jug', degree, ammo, j.shot.x, j.shot.y, j.shot.z);
    this.sync();
    s.doors.setRaise(this.door, this.raiseFor(this.count));
    if (this.outlined) { s.ctx.render.setOutline(null); this.outlined = false; }
    if (announce) {
      const gate = s.ctx.data.layout.markers.find((m) => m.id === this.door);
      if (gate) { s.cueAt('gate_notch', gate); s.cueAt('sweep_creak', gate); }
      if (this.count === 1) s.story.say(namedLine(this.core.volume, 'lines', 'firstJug'));
    }
    this.core.progress(this.count, j.marker.id);
    if (this.count >= this.jugs.length) this.finish(false);
  }
  /** the gate opens: the same path for the seventh jug and for WorldDebug.solvePuzzle */
  private finish(instant: boolean): void {
    const { s } = this;
    s.doors.setRaise(this.door, OPEN_HEIGHT, instant);
    s.doors.open(this.door, instant);
    this.core.solved();
    if (!instant) s.story.say(namedLine(this.core.volume, 'lines', 'gateOpen'));
    const cp = PUZZLE_CHECKPOINT[this.id];
    if (cp) s.checkpoints.reach(cp, true);
  }

  /** a jug still hanging on the bar (not the seventh) */
  private onBar(): Jug | null {
    for (let i = 0; i < this.jugs.length; i++) { const j = this.jugs[i] as Jug; if (!j.broken && !j.seventh) return j; }
    return null;
  }

  tick(dt: number): void {
    const { s } = this;
    if (this.attached) this.follow();
    if (this.view.solved || !this.attached || !s.playing) return;
    const tier = this.core.tick();
    const seventh = this.seventhJug && !this.seventhJug.broken ? this.seventhJug : null;
    if (tier === 1) {
      // T1, wordless: the thing to shoot glints, slowly, until she shoots one (the seventh once six are down; before
      // that a jug still on the bar: polish round 3, with none shot tier 1 showed nothing at all)
      const j = this.count >= this.jugs.length - 1 ? seventh : this.onBar() ?? seventh;
      if (j) { this.core.cueAt(j.shot.x, j.shot.y, j.shot.z); s.cueAt('sweep_creak', j.marker); }
    } else if (tier === 2) {
      // the T2 line states that six are down: it is only true, and only spoils nothing, once they are. Before that
      // she is told what the jugs are for (hint_jugs_2_few), and one still on the bar glints while the sweep creaks
      if (this.count >= this.jugs.length - 1) s.story.say(this.core.hintKey('T2'));
      else {
        s.story.say(this.core.hintKey('T2few') || LINE_T2_FEW);
        const j = this.onBar() ?? seventh;
        if (j) { this.core.cueAt(j.shot.x, j.shot.y, j.shot.z); s.cueAt('sweep_creak', j.marker); }
      }
    } else if (tier === 3) {
      s.story.say(this.core.hintKey('T3'));
      const target = seventh ?? this.hanging();
      if (target) { s.ctx.render.setOutline(s.build.anchor(target.marker.id)); this.outlined = true; }
    } else if (tier === 4 && seventh) {
      seventh.shot.move(s, seventh.shot.x, seventh.shot.y, seventh.shot.z, paramNumber(seventh.marker, 'hitRadius', 0.24) * 2);
    }
    // T4 always applies: at 360 s the rope gives, and nothing that still hangs can hold her
    if (!this.falling && this.core.clock.relaxed && this.core.clock.pastRelax(s.ctx.options.value.hints) >= FALL_AFTER_RELAX) {
      this.falling = true;
      this.fallTimer = 0;
      s.story.say(this.core.hintKey('T4'));
    }
    if (this.falling) {
      this.fallTimer -= dt;
      if (this.fallTimer <= 0) {
        this.fallTimer = FALL_GAP;
        const next = seventh ?? this.hanging();
        if (next) this.burst(next, 'lead_round', true);
      }
    }
  }

  reset(): void {
    for (const j of this.jugs) j.broken = false;
    this.count = 0; this.six = 0; this.falling = false; this.outlined = false;
    this.core.reset();
    this.s.doors.setRaise(this.door, 0, true);
    this.sync();
  }
  capture(): PuzzleSave {
    let mask = 0;
    for (let i = 0; i < this.jugs.length; i++) if ((this.jugs[i] as Jug).broken) mask |= 1 << i;
    return { solved: this.view.solved, step: this.count, data: { broken: mask, six: this.six } };
  }
  solvedSave(): PuzzleSave { return { solved: true, step: this.jugs.length, data: { broken: (1 << this.jugs.length) - 1, six: 6 } }; }
  apply(save: PuzzleSave | undefined): void {
    const mask = save && typeof save.data.broken === 'number' ? save.data.broken : 0;
    this.core.reset();
    this.count = 0;
    for (let i = 0; i < this.jugs.length; i++) { const j = this.jugs[i] as Jug; j.broken = (mask & (1 << i)) !== 0; if (j.broken) this.count++; }
    this.six = save && typeof save.data.six === 'number' ? save.data.six : Math.min(6, this.count);
    this.view.solved = save !== undefined && save.solved;
    this.view.step = this.count;
    this.falling = false; this.outlined = false;
    this.s.doors.setRaise(this.door, this.raiseFor(this.count), true);
    this.sync();
  }
  solve(): void {
    if (this.view.solved) return;
    for (const j of this.jugs) j.broken = true;
    this.count = this.jugs.length; this.six = 6;
    this.view.step = this.count;
    this.sync();
    this.finish(true);
  }
  addHintSeconds(seconds: number): void { this.core.clock.seconds += seconds; }
}

export function createSevenJugs(s: State): Puzzle { return new SevenJugs(s); }
