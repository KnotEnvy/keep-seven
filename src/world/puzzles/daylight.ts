// src/world/puzzles/daylight.ts: GDD 13.2. Three shutters high on the west wall, each dropped by shooting the latch
// beneath it; each throws a blade of sun on a piece of the story. The north blade lands on the share cloth until its
// cord is shot; then it reaches the day-cell: cell_lit = shutter_open[n] && cloth_down, hatch_powered = cell_lit.
// Step three is the knot on the hatch latch: the hatch goes ajar and enc_tally starts.
import * as THREE from 'three';
import { FIXED_DT } from '../../core/contracts.ts';
import type {
  AssetInstance, DamageInfo, EncounterId, FxHandle, HitResponse, HitResult, LayoutMarker, MarkerId, PuzzleSave, PuzzleView, ZoneId,
} from '../../core/contracts.ts';
import { DEG2RAD } from '../../core/math.ts';
import { Shot, inVolume, paramList, paramNumber, paramString } from '../internals.ts';
import type { Puzzle, ShotOwner, State } from '../internals.ts';
import { PuzzleCore } from './hints.ts';
import { URGENT_READ } from '../story.ts';

/** each blade's narration starts when its landing patch comes within 30 degrees of the crosshair, or 4 s after the drop */
const LOOK_COS = Math.cos(30 * DEG2RAD);
const NARRATE_AFTER = 4;
/** the cell wakes when the light has had time to arrive (the shutter's drop, the cloth's fall) */
const LIGHT_DELAY = 0.5;
/** T4: the north latch gives on its own and the cord frays through 10 s later */
const FRAY_AFTER = 10;
/** the knot on the latch is nudged again every minute it is left (a hint line may repeat) */
const KNOT_HINT_EVERY = 60;
/** after the line: a wordless pulse on the latch this often */
const KNOT_PULSE_EVERY = 30;
/** the glint stands this far above the knot: over the cowl's hood, where the stand spot can see it */
const KNOT_GLINT_UP = 0.55;

interface Hit { what: string; pos: [number, number, number] }
interface Shutter {
  marker: LayoutMarker;
  latch: Shot;
  hits: Hit[];
  open: boolean;
  narrated: boolean;
  /** seconds since the drop */
  since: number;
  blade: FxHandle | null;
  patches: (FxHandle | null)[];
}

const LATCH = 0, CORD = 1, KNOT = 2;

class Daylight implements Puzzle, ShotOwner {
  readonly id = 'daylight' as const;
  readonly zone: ZoneId;
  readonly view: PuzzleView;
  private readonly core: PuzzleCore;
  private readonly shutters: Shutter[] = [];
  /** the shutter the day-cell faces: the one that matters */
  private key = 0;
  private readonly cell: LayoutMarker | undefined;
  private readonly cordMarker: LayoutMarker | undefined;
  private readonly clothMarker: LayoutMarker | undefined;
  private readonly knotMarker: LayoutMarker | undefined;
  private readonly cord: Shot | null;
  private readonly knot: Shot | null;
  private readonly hatch: MarkerId;
  private readonly encounter: EncounterId | '';
  private readonly knotHint: string;
  private cloth = false;
  /** the cloth was already down when the key shutter opened: its blade never landed on it */
  private clothMissed = false;
  private lit = false;
  private burst = false;
  private lightIn = -1;
  private frayIn = -1;
  private knotIdle = 0;
  /** how often the knot has been nudged since it went live: the line once, then a wordless pulse on the latch */
  private knotNudges = 0;
  private attached = false;
  private outlined = false;

  constructor(private readonly s: State) {
    this.core = new PuzzleCore(s, this.id, 3);
    this.view = this.core.view;
    const { data } = s.ctx;
    const elements = data.markersOfType('puzzle_element').filter((m) => m.params.puzzle === this.id);
    this.zone = (elements[0] as LayoutMarker).zone;
    this.cell = elements.find((m) => m.params.role === 'day_cell');
    for (const m of elements) {
      if (m.params.role !== 'shutter') continue;
      const latch = elements.find((x) => x.params.role === 'latch' && x.params.opens === m.id);
      const blade = m.params.blade as { hits?: Hit[] } | undefined;
      if (this.cell && this.cell.params.facesShutter === m.id) this.key = this.shutters.length;
      this.shutters.push({
        marker: m, latch: new Shot(this, latch ? latch.id : m.id, 'latch', this.shutters.length * 4 + LATCH, latch ?? null),
        hits: blade && blade.hits ? blade.hits : [], open: false, narrated: false, since: 0, blade: null, patches: [null, null],
      });
    }
    this.cordMarker = elements.find((m) => m.params.role === 'cord');
    this.clothMarker = this.cordMarker ? data.layout.markers.find((m) => m.id === this.cordMarker?.params.drops) : undefined;
    this.cord = this.cordMarker ? new Shot(this, this.cordMarker.id, 'cord', CORD, this.cordMarker) : null;
    this.knotMarker = this.cell ? data.layout.markers.find((m) => m.id === this.cell?.params.stripsTo) : undefined;
    this.knot = this.knotMarker ? new Shot(this, this.knotMarker.id, 'knot', KNOT, this.knotMarker) : null;
    this.hatch = this.knotMarker ? paramString(this.knotMarker, 'releases') : '';
    this.encounter = this.knotMarker ? (paramString(this.knotMarker, 'startsEncounter') as EncounterId | '') : '';
    // the one line the stage has for "a knot wants shooting" (the yard knot's hint)
    let hint = '';
    for (const m of data.markersOfType('interactable')) {
      const h = m.params.hint as { T2?: string } | undefined;
      if (hint === '' && h && typeof h.T2 === 'string') hint = h.T2;
    }
    this.knotHint = hint;
    if (this.knotMarker) s.forcers.set(this.knotMarker.id, (announce = false) => this.force(announce));
    // Pass i3 (both story reviewers: "The share-cloth hung in the light's way" was said 24 to 34 s after the cloth had
    // fallen, at the hearth and two rooms on). The key shutter's line is about the cloth with the light on it: it is
    // dropped unheard when its turn comes with the cloth down (story.ts UNKEPT: it no longer waits for ever).
    const key = this.shutters[this.key];
    if (key) for (const k of paramList(key.marker, 'lines')) s.story.unless(k, () => this.cloth);
  }

  // ---- what is built --------------------------------------------------------------------------------
  private partPos(id: MarkerId, fallback: LayoutMarker, out: { x: number; y: number; z: number }): void {
    const node = this.s.build.partNode(id);
    if (node) { node.getWorldPosition(this.v); out.x = this.v.x; out.y = this.v.y; out.z = this.v.z; return; }
    out.x = fallback.pos[0]; out.y = fallback.pos[1]; out.z = fallback.pos[2];
  }
  private readonly v = new THREE.Vector3();
  private readonly at = { x: 0, y: 0, z: 0 };

  attach(): void {
    const { s } = this;
    this.attached = true;
    for (const sh of this.shutters) {
      const m = sh.latch.marker;
      if (!m) continue;
      this.partPos(m.id, m, this.at);                    // the latch is a part of the shutter's instance
      sh.latch.add(s, this.at.x, this.at.y, this.at.z, paramNumber(m, 'hitRadius', 0.14), 'ceramic', 0);
    }
    if (this.cord && this.cordMarker) {
      this.partPos(this.cordMarker.id, this.cordMarker, this.at);
      this.cord.add(s, this.at.x, this.at.y, this.at.z, paramNumber(this.cordMarker, 'hitRadius', 0.12), 'cloth', 0);
    }
    if (this.knot && this.knotMarker) {
      const m = this.knotMarker;
      this.knot.add(s, m.pos[0], m.pos[1], m.pos[2], paramNumber(m, 'hitRadius', 0.16), 'metal', 0);
    }
    this.sync();
  }
  detach(): void {
    const { s } = this;
    this.attached = false;
    for (const sh of this.shutters) { sh.latch.remove(s); this.dropCards(sh); }
    if (this.cord) this.cord.remove(s);
    if (this.knot) this.knot.remove(s);
  }
  private dropCards(sh: Shutter): void {
    if (sh.blade) { sh.blade.release(); sh.blade = null; }
    for (let i = 0; i < sh.patches.length; i++) { const p = sh.patches[i]; if (p) { p.release(); sh.patches[i] = null; } }
  }
  private clipOf(inst: AssetInstance | null): string {
    if (!inst) return '';
    const def = this.s.ctx.data.manifest.assets[inst.id];
    return def && def.animations[0] ? def.animations[0].name : '';
  }
  /** how far the blade of a shutter reaches: the key blade stops at the cloth while it hangs */
  private reach(i: number): number {
    const sh = this.shutters[i] as Shutter;
    return i === this.key && !this.cloth ? Math.min(1, sh.hits.length) : sh.hits.length;
  }
  /** the blade and its landing patches (render's pooled cards): drawn from the window to where it lands */
  private throwBlade(i: number): void {
    const { s } = this;
    const sh = this.shutters[i] as Shutter;
    const n = this.reach(i);
    if (!sh.open || n === 0) { this.dropCards(sh); return; }
    const vfx = s.ctx.render.vfx;
    const end = sh.hits[n - 1] as Hit;
    if (!sh.blade) sh.blade = vfx.acquireCard('sun_blade');
    if (sh.blade) { sh.blade.setPosition(sh.marker.pos[0], sh.marker.pos[1], sh.marker.pos[2]); sh.blade.setEnd(end.pos[0], end.pos[1], end.pos[2]); sh.blade.setLevel(1); sh.blade.setVisible(true); }
    for (let k = 0; k < sh.patches.length; k++) {
      const hit = k < n ? sh.hits[k] : undefined;
      // the cloth is no landing once it is down
      const wanted = hit !== undefined && !(i === this.key && this.cloth && k < n - 1);
      let p = sh.patches[k] ?? null;
      if (!wanted) { if (p) { p.release(); sh.patches[k] = null; } continue; }
      if (!p) { p = vfx.acquireCard('sun_patch'); sh.patches[k] = p; }
      if (p && hit) { p.setPosition(hit.pos[0], hit.pos[1], hit.pos[2]); p.setLevel(1); p.setVisible(true); }
    }
  }
  private lamps(fadeSeconds = 0): void {
    const { s } = this;
    const { data, render } = s.ctx;
    const on = this.lit ? 1 : 0;
    const face = this.cell ? s.build.node(this.cell.id, 'cell_face') : null;
    if (face) render.lamps.setMask(face, on);
    const env = data.manifest.assets[data.manifest.zones[this.zone].env];
    for (const name of Object.keys(env?.lampSets ?? {})) { const n = s.build.zoneNode(this.zone, name); if (n) render.lamps.setMask(n, on); }
    const latchLamp = this.hatch ? s.build.node(this.hatch, 'latch_lamp') : null;
    if (latchLamp) render.lamps.setMask(latchLamp, on);
    const layer = env?.lightLayers?.[0];
    if (layer && s.ctx.assets.isActive(layer)) render.setLightLayer(layer, on, fadeSeconds);
  }
  /** push the state onto what is built */
  private sync(): void {
    const { s } = this;
    if (!this.attached) return;
    for (let i = 0; i < this.shutters.length; i++) {
      const sh = this.shutters[i] as Shutter;
      const inst = s.build.instance(sh.marker.id);
      const clip = this.clipOf(inst);
      if (clip) s.poseClip(inst, clip, sh.open ? 1 : 0);
      sh.latch.enable(s, !sh.open);
      this.throwBlade(i);
    }
    if (this.clothMarker) {
      const inst = s.build.instance(this.clothMarker.id);
      const clip = this.clipOf(inst);
      if (clip) s.poseClip(inst, clip, this.cloth ? 1 : 0);
    }
    if (this.cord) this.cord.enable(s, !this.cloth);
    this.syncKnot();
    this.lamps();
  }
  private syncKnot(): void {
    const { s } = this;
    if (!this.knot || !this.knotMarker || !this.attached) return;
    const live = this.lit && !this.burst;
    this.knot.enable(s, live);                           // its volume is off until the hatch has power
    const inst = s.build.instance(this.knotMarker.id);
    const node = inst ? s.ctx.data.manifest.assets[inst.id]?.nodes[0] : undefined;
    if (inst && node) inst.node(node).visible = !this.burst;
  }
  private steps(): number { return ((this.shutters[this.key] as Shutter).open ? 1 : 0) + (this.cloth ? 1 : 0) + (this.burst ? 1 : 0); }

  // ---- shots ----------------------------------------------------------------------------------------
  onShot(shot: Shot, _hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    out.outcome = 'broke'; out.stops = true; out.stopsLine = false;
    const ammo = damage.ammo ?? 'lead_round';
    const what = shot.index % 4;
    if (what === LATCH) {
      this.s.shootableHit(shot.id, 'latch', 0, ammo, shot.x, shot.y, shot.z);
      this.drop(shot.index >> 2, true);
    } else if (shot.index === CORD) {
      this.s.shootableHit(shot.id, 'cord', 0, ammo, shot.x, shot.y, shot.z);
      this.fall(true);
    } else if (shot.index === KNOT) {
      // one encounter at a time: while another fight is live the knot rings and holds
      if (this.encounter && this.s.director.live) { out.outcome = 'impact'; out.stopsLine = true; this.s.shootableHit(shot.id, 'knot', 0, ammo, shot.x, shot.y, shot.z); return; }
      this.burstKnot(true);
    }
  }
  /** a latch lets go: the shutter falls open with a bang and its blade crosses the hall */
  private drop(i: number, announce: boolean): void {
    const { s } = this;
    const sh = this.shutters[i] as Shutter;
    if (sh.open) return;
    sh.open = true; sh.since = 0; sh.narrated = !announce;
    if (i === this.key && this.cloth) this.clothMissed = true;
    sh.latch.enable(s, false);
    if (this.attached) {
      const inst = s.build.instance(sh.marker.id);
      const clip = this.clipOf(inst);
      if (announce && clip) s.playClip(inst, clip); else if (clip) s.poseClip(inst, clip, 1);
      this.throwBlade(i);
    }
    if (announce) s.cueAt('shutter_bang', sh.marker);
    if (this.outlined) { s.ctx.render.setOutline(null); this.outlined = false; }
    if (i === this.key) this.core.progress(this.steps(), sh.marker.id);
    else s.progress(this.view, sh.marker.id);               // a story shutter: something happened, the clock keeps counting
    this.evaluate(announce);
  }
  private fall(announce: boolean): void {
    const { s } = this;
    if (this.cloth) return;
    this.cloth = true;
    if (this.cord) this.cord.enable(s, false);
    if (this.attached && this.clothMarker) {
      const inst = s.build.instance(this.clothMarker.id);
      const clip = this.clipOf(inst);
      if (announce && clip) s.playClip(inst, clip); else if (clip) s.poseClip(inst, clip, 1);
      this.throwBlade(this.key);
    }
    if (this.outlined) { s.ctx.render.setOutline(null); this.outlined = false; }
    this.core.progress(this.steps(), this.cordMarker ? this.cordMarker.id : 'cord');
    this.evaluate(announce);
  }
  private evaluate(announce: boolean): void {
    if (this.lit || !(this.shutters[this.key] as Shutter).open || !this.cloth) return;
    if (announce) this.lightIn = LIGHT_DELAY; else this.light(false);
  }
  /** cell_lit: the day-cell wakes the headworks and the hatch has power */
  private light(announce: boolean): void {
    const { s } = this;
    if (this.lit) return;
    this.lit = true;
    this.lightIn = -1; this.frayIn = -1;
    s.setFlag('cell_lit', true);
    s.setFlag('hatch_powered', true);
    this.lamps(announce ? 1.5 : 0);
    this.syncKnot();
    if (this.cell) {
      if (announce) {
        s.cueAt('cell_wake', this.cell);
        // (p0: the station's answer to the light is next in line: said behind the room's lines a brisk player lost both)
        // (pass i1: its first line is about this second: over a room line once that line has had URGENT_READ of its
        // time; it came up to 6 s after the light, behind a narrator line)
        const wake = paramList(this.cell, 'lines');
        if (wake.length > 0) s.story.sayUrgent(wake[0] as string, URGENT_READ);
        for (let i = 1; i < wake.length; i++) s.story.sayFront(wake[i] as string);
      }
      s.story.setObjective(paramString(this.cell, 'objective'));
    }
    s.lamp(this.cell ? this.cell.id : 'day_cell', 1, 1);
    s.ctx.events.emit('world/hatch_powered', HATCH_POWERED);
    this.core.solved();
  }
  /** step three: the latch lets go, the hatch parts 0.3 m and stops ajar, two of the seated stand */
  private burstKnot(announce: boolean): void {
    const { s } = this;
    if (this.burst || !this.knot || !this.knotMarker) return;
    this.burst = true;
    if (this.outlined) { s.ctx.render.setOutline(null); this.outlined = false; }
    this.syncKnot();
    this.view.step = this.steps();
    if (announce) {
      s.knotBurst(this.knot.id, false, this.knot.x, this.knot.y, this.knot.z);
      s.progress(this.view, this.knot.id);
      // on the event: the two rise now (pass i1: urgent, over a room line; "Two of them stood" was said late or,
      // when the two were down first, never)
      for (const key of paramList(this.knotMarker, 'lines')) s.story.sayUrgent(key);
    }
    if (this.hatch) s.doors.ajar(this.hatch);
    if (announce && this.encounter) s.director.start(this.encounter);
  }
  /** WorldDebug.clearEncounter of the encounter this knot starts: the knot is gone, nobody stood up */
  private force(announce: boolean): void {
    // (announced: a riser was shot with the hatch powered: the knot lets go as if she had shot it)
    if (!this.lit) { if (announce) return; this.solve(); }
    this.burstKnot(announce);
  }

  /**
   * The knot on the hatch latch sits in a cowl that faces away from where the puzzle was solved (layout: a house-rule
   * exception). The nudge is said once; after that it does not repeat the line: the latch itself is pointed at, with a
   * glint over the cowl (seen from the stand spot) and an outline pulse on the knot.
   */
  private nudgeKnot(): void {
    const { s } = this;
    const m = this.knotMarker;
    if (!m) return;
    if (this.knotNudges++ === 0) { s.story.say(this.knotHint); return; }
    s.glint(m.pos[0], m.pos[1] + KNOT_GLINT_UP, m.pos[2], 2.5);
    const inst = s.build.instance(m.id);
    s.ctx.render.setOutline(inst ? inst.root : s.build.anchor(m.id));
    this.outlined = true;
  }

  tick(_dt: number): void {
    const { s } = this;
    if (!this.attached || !s.playing) return;
    // ---- narration waits for the look (GDD 13.2 rule 3)
    for (let i = 0; i < this.shutters.length; i++) {
      const sh = this.shutters[i] as Shutter;
      if (!sh.open || sh.narrated) continue;
      sh.since += FIXED_DT;
      const hit = sh.hits[0];
      const looked = hit !== undefined && s.lookCos(hit.pos[0], hit.pos[1], hit.pos[2]) >= LOOK_COS;
      // (pass i3: the key shutter's landing is the cloth, which she shoots down next: its line does not wait for the look)
      if (!looked && sh.since < NARRATE_AFTER && i !== this.key) continue;
      sh.narrated = true;
      if (i === this.key && this.clothMissed) continue;
      // (pass i3: a landing she is looking at is told next, behind the continuation of the line on screen; one she never
      // turned to waits its turn like any room line. The cloth's is told next either way: the cord is what she shoots next)
      for (const key of paramList(sh.marker, 'lines')) { if (looked || i === this.key) s.story.sayPresent(key, false); else s.story.say(key); }
    }
    if (this.lightIn >= 0) { this.lightIn -= FIXED_DT; if (this.lightIn < 0) this.light(true); }
    if (this.frayIn >= 0 && !this.cloth) { this.frayIn -= FIXED_DT; if (this.frayIn < 0) this.fall(true); }
    if (this.lit) {
      // solved, but the hatch still wants its knot shot: say so again each minute she stands about
      if (!this.burst && this.knotHint !== '') {
        const p = s.ctx.player.position;
        const m = this.core.volume;
        if (m !== undefined && inVolume(m, p.x, p.y, p.z) && !s.director.live) this.knotIdle += FIXED_DT;
        if (this.knotIdle >= (this.knotNudges === 0 ? KNOT_HINT_EVERY : KNOT_PULSE_EVERY)) { this.knotIdle = 0; if (s.hintsOn()) this.nudgeKnot(); }
      }
      return;
    }
    const tier = this.core.tick();
    if (tier === 0) return;
    const key = this.shutters[this.key] as Shutter;
    const target = !key.open ? key.latch : this.cord;
    if (tier === 1 && target) this.core.cueAt(target.x, target.y, target.z);       // T1: the next thing to shoot glints, slowly
    else if (tier === 2) s.story.say(this.core.hintKey('T2'));
    else if (tier === 3) {
      s.story.say(this.core.hintKey('T3'));
      if (target) { s.ctx.render.setOutline(s.build.anchor(target.id)); this.outlined = true; }
    } else if (tier === 4) {
      // the puzzle relaxes: the north latch gives on its own, the cord frays through ten seconds later
      s.story.say(this.core.hintKey('T4'));
      if (!key.open) this.drop(this.key, true);
      if (!this.cloth) this.frayIn = FRAY_AFTER;
    }
  }

  reset(): void {
    for (const sh of this.shutters) { sh.open = false; sh.narrated = false; sh.since = 0; }
    this.cloth = false; this.clothMissed = false; this.lit = false; this.burst = false;
    this.lightIn = -1; this.frayIn = -1; this.knotIdle = 0; this.knotNudges = 0; this.outlined = false;
    this.core.reset();
    this.sync();
  }
  capture(): PuzzleSave {
    let open = 0;
    for (let i = 0; i < this.shutters.length; i++) if ((this.shutters[i] as Shutter).open) open |= 1 << i;
    return { solved: this.lit, step: this.steps(), data: { open, cloth: this.cloth, knot: this.burst } };
  }
  solvedSave(): PuzzleSave { return { solved: true, step: 2, data: { open: 1 << this.key, cloth: true, knot: false } }; }
  apply(save: PuzzleSave | undefined): void {
    const open = save && typeof save.data.open === 'number' ? save.data.open : 0;
    this.core.reset();
    for (let i = 0; i < this.shutters.length; i++) { const sh = this.shutters[i] as Shutter; sh.open = (open & (1 << i)) !== 0; sh.narrated = sh.open; sh.since = 0; }
    this.cloth = save !== undefined && save.data.cloth === true;
    this.burst = save !== undefined && save.data.knot === true;
    this.lit = save !== undefined && save.solved;
    this.clothMissed = false; this.lightIn = -1; this.frayIn = -1; this.knotIdle = 0; this.knotNudges = 0; this.outlined = false;
    if (!this.lit && (this.shutters[this.key] as Shutter).open && this.cloth) this.lightIn = LIGHT_DELAY;
    this.view.solved = this.lit;
    this.view.step = this.steps();
    this.sync();
  }
  solve(): void {
    if (this.lit) return;
    this.drop(this.key, false);
    this.fall(false);
    this.light(false);
  }
  addHintSeconds(seconds: number): void { this.core.clock.seconds += seconds; }
}
const HATCH_POWERED: Record<string, never> = {};

export function createDaylight(s: State): Puzzle { return new Daylight(s); }
