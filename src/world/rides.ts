// src/world/rides.ts: the two lift rides (rigid teleports between identical cages inside a dark ride, nav.portals) and
// the seam on the peg stair (ARCHITECTURE 3.6 rules 3, 5 and 6): the staged gallery on world/hatch_powered, the hatch
// that shuts on the first landing, the set swap on the second flight, the swap to the coda in the proving lift's dark.
import { FIXED_DT } from '../core/contracts.ts';
import type {
  AssetInstance, CheckpointId, EncounterId, GameEvents, LayoutMarker, MarkerId, NavPortal, ResidentSet, ZoneId,
} from '../core/contracts.ts';
import type * as THREE from 'three';
import { DEG2RAD, RAD2DEG } from '../core/math.ts';
import { inVolume, paramString } from './internals.ts';
import type { RidesApi, State } from './internals.ts';

/** the shaft the cage is seen against in a ride: code-placed, no binding names it (docs/requests/code-world.md) */
const SHAFT = 'env_lift_shaft';
/** the gate has shut (its clip is 1.0 s): the dark begins */
const DARK_TICKS = 60;
/** a ride that swaps the resident set does so this long into the dark */
const SWAP_TICKS = 90;
/** GDD 9.6: lamps pass at a slowing rate */
const LAMP_FAST = 4, LAMP_SLOW = 0.5;
/**
 * She throws the lever facing the cage's back wall, and would ride the whole dark with a mesh a metre from her face.
 * As the gate shuts she is turned, once and gently, to the gate: the open side, where the shaft's lamps pass. Look is
 * hers throughout (producer ruling 11): the turn stops the moment she moves the view herself.
 */
const TURN_TICKS = 54;
const TURN_SLACK_DEG = 0.05;
/** the arrival's mood fades in over what is left of the ride, at most this long (it starts in the dark, not at the gate) */
const MOOD_FADE_MAX = 8;

interface RideDef {
  portal: NavPortal;
  via: LayoutMarker;
  seconds: number;
  lines: readonly string[];
  requires: EncounterId | 'boss' | '';
  swap: ResidentSet | null;
  /** the door marker that is the departure cage's gate */
  door: MarkerId;
}
interface Running {
  def: RideDef; ticks: number; total: number; dark: boolean; teleported: boolean; building: boolean; said: number;
  /** the turn to the gate: ticks into it (-1 = none, or over), from and to (degrees), and the view she was last given */
  turn: number; yaw0: number; pitch0: number; yaw1: number; setYaw: number; setPitch: number;
}

/** pass i2: the most a ride is held for its own lines to have started (ticks) */
export const LINES_GRACE_TICKS = 8 * 60;
class Rides implements RidesApi {
  private readonly defs: RideDef[] = [];
  private run: Running | null = null;
  private readonly slot: Running;
  private shaft: AssetInstance | null = null;
  private readonly bars: THREE.Object3D[] = [];
  private readonly barRest: number[] = [];
  private barSpan = 12;
  private lampDir = 1;
  // ---- the seam
  private readonly hatch: MarkerId = '';
  private readonly closeTrigger: LayoutMarker | undefined;
  private readonly swapTrigger: LayoutMarker | undefined;
  private readonly seamAfter: EncounterId | '' = '';
  private closeBelow = -3.5;
  private swapArmed = false;
  private shutTicks = 0;
  private readonly payload: GameEvents['ride/state'] = { id: 'ride_lift_hall', stage: 'started', seconds: 0 };

  constructor(private readonly s: State) {
    const { data, events } = s.ctx;
    for (const portal of data.layout.nav.portals) {
      const via = data.layout.markers.find((m) => m.id === portal.via);
      if (!via) continue;
      const ride = via.params.ride as { seconds?: number; lines?: string[]; residentSet?: { load?: ResidentSet } } | undefined;
      const req = paramString(via, 'requires');
      const enc = /^(enc_[a-z_]+) clear$/.exec(req);
      let door = '';
      for (const d of data.markersOfType('door')) for (const b of data.bindings(d)) if (b.mode === 'partOf' && b.owner === portal.cages[0]) door = d.id;
      this.defs.push({
        portal, via, seconds: ride?.seconds ?? 12, lines: ride?.lines ?? [], requires: enc ? (enc[1] as EncounterId) : req.startsWith('boss') ? 'boss' : '',
        swap: ride?.residentSet?.load ?? null, door,
      });
    }
    this.slot = { def: this.defs[0] as RideDef, ticks: 0, total: 0, dark: false, teleported: false, building: false, said: 0, turn: -1, yaw0: 0, pitch0: 0, yaw1: 0, setYaw: 0, setPitch: 0 };
    const hatch = data.markersOfType('door').find((m) => m.params.kind === 'hatch');
    if (hatch) {
      this.hatch = hatch.id;
      this.closeTrigger = data.markersOfType('trigger').find((m) => m.params.closes === hatch.id && typeof m.params.when === 'string');
      const y = /y (-?\d+(?:\.\d+)?)/.exec(this.closeTrigger ? paramString(this.closeTrigger, 'when') : '');
      if (y) this.closeBelow = Number(y[1]);
      const req = /^(enc_[a-z_]+) clear$/.exec(this.closeTrigger ? paramString(this.closeTrigger, 'requires') : '');
      this.seamAfter = req ? (req[1] as EncounterId) : '';
    }
    this.swapTrigger = data.markersOfType('trigger').find((m) => m.params.residentSet !== undefined);
    // the day-cell lights: the gallery is staged beside the surface set, and the hatch waits for it before it opens
    events.on('world/hatch_powered', () => { if (s.started) void s.build.track(s.build.enterSeam(true)); });
  }

  get riding(): boolean { return this.run !== null; }

  // ---- the seam -------------------------------------------------------------------------------------
  private tickSeam(): void {
    const { s } = this;
    if (this.hatch === '' || this.seamAfter === '' || !s.director.cleared(this.seamAfter)) return;
    const p = s.ctx.player.position;
    const state = s.doors.state(this.hatch);
    const close = this.closeTrigger;
    // rule 5: the hatch shuts when her feet are on the first landing (doors.ts waits while she stands in the opening)
    if (close && (state === 'open' || state === 'opening') && s.build.markerLive(close) && p.y <= this.closeBelow && inVolume(close, p.x, p.y, p.z)) s.doors.close(this.hatch);
    const swap = this.swapTrigger;
    if (!swap || !s.staged) return;
    const sets = swap.params.residentSet as { unload: ResidentSet; load: ResidentSet };
    if (s.residentSet !== sets.unload) return;
    // the swap is asked for on the second flight and happens the moment the hatch is shut (its close takes a second);
    // once asked it is under way (in real time over several ticks): standing in the trigger does not ask again
    if (s.build.busy) return;
    if (!this.swapArmed && inVolume(swap, p.x, p.y, p.z)) this.swapArmed = true;
    // (one tick after it has shut: nothing of the surface is unloaded on the tick the lid comes down)
    this.shutTicks = state === 'closed' ? this.shutTicks + 1 : 0;
    if (this.swapArmed && this.shutTicks >= 2) {
      this.swapArmed = false;
      void s.build.track(s.build.swapInPlay(sets.load, null));
    }
  }

  // ---- rides ----------------------------------------------------------------------------------------
  private defOf(via: MarkerId): RideDef | null {
    for (let i = 0; i < this.defs.length; i++) if ((this.defs[i] as RideDef).via.id === via) return this.defs[i] as RideDef;
    return null;
  }
  available(via: MarkerId): boolean {
    const { s } = this;
    const d = this.defOf(via);
    if (!d || this.run || !s.build.isBuilt(d.via.zone)) return false;
    if (d.requires === 'boss') return s.flags.has('boss_dead');
    return d.requires === '' || s.director.cleared(d.requires);
  }
  start(via: MarkerId): boolean {
    const { s } = this;
    if (!this.available(via)) return false;
    const d = this.defOf(via) as RideDef;
    const r = this.slot;
    r.def = d; r.ticks = 0; r.total = Math.round(d.seconds / FIXED_DT); r.dark = false; r.teleported = false; r.building = false; r.said = 0; r.turn = -1;
    this.run = r;
    this.beginTurn(r);
    const lever = s.build.placed(via)[0];
    if (lever && lever.inst) {
      const clip = s.ctx.data.manifest.assets[lever.inst.id]?.animations[0];
      if (clip) s.playClip(lever.inst, clip.name);
    }
    s.cueAt('lever_throw', d.via);
    s.cueAt('lift_run', d.via);
    if (d.door !== '') s.doors.close(d.door);
    s.ctx.player.setControl(false, 'ride');
    if (d.swap) void s.ctx.assets.prefetch(d.swap);
    this.payload.id = d.portal.id; this.payload.stage = 'started'; this.payload.seconds = d.seconds;
    s.ctx.events.emit('ride/state', this.payload);
    return true;
  }
  /** where the gate of the departure cage is: the cage instance's `gate` node, else the side the cage marker faces */
  private beginTurn(r: Running): void {
    const { s } = this;
    const pl = s.ctx.player, p = pl.position;
    const cageId = r.def.portal.cages[0];
    const cage = s.ctx.data.layout.markers.find((m) => m.id === cageId);
    r.turn = -1;
    if (!cage) return;
    // the gate: the cage instance's own `gate` node; without one, the side the layout names (params.gateSide)
    const half = r.def.portal.cageInterior[2] / 2;
    const side = paramString(cage, 'gateSide');
    let gx = cage.pos[0] + (side === 'east' ? half : side === 'west' ? -half : 0), gz = cage.pos[2] + (side === 'south' ? half : side === 'north' ? -half : 0);
    const gate = s.build.node(cageId, 'gate');
    if (gate) { gate.updateWorldMatrix(true, false); const e = gate.matrixWorld.elements; gx = e[12] as number; gz = e[14] as number; }
    else if (side === '') return;
    const dx = gx - p.x, dz = gz - p.z;
    if (dx * dx + dz * dz < 0.04) return;
    r.yaw0 = pl.yaw * RAD2DEG; r.pitch0 = pl.pitch * RAD2DEG;
    // yaw 0 looks along -Z and a positive yaw turns left: forward = (-sin, 0, -cos)
    const want = Math.atan2(-dx, -dz) * RAD2DEG;
    r.yaw1 = r.yaw0 + ((((want - r.yaw0) % 360) + 540) % 360 - 180);
    r.setYaw = r.yaw0; r.setPitch = r.pitch0;
    r.turn = 0;
  }
  private tickTurn(r: Running): void {
    if (r.turn < 0) return;
    const pl = this.s.ctx.player, p = pl.position;
    // she moved the view herself: it is hers
    if (Math.abs(pl.yaw * RAD2DEG - r.setYaw) > TURN_SLACK_DEG || Math.abs(pl.pitch * RAD2DEG - r.setPitch) > TURN_SLACK_DEG) { r.turn = -1; return; }
    r.turn++;
    const t = Math.min(1, r.turn / TURN_TICKS), k = t * t * (3 - 2 * t);
    const yaw = r.yaw0 + (r.yaw1 - r.yaw0) * k, pitch = r.pitch0 * (1 - k);
    pl.teleport(p.x, p.y, p.z, yaw, pitch);
    r.setYaw = pl.yaw * RAD2DEG; r.setPitch = pl.pitch * RAD2DEG;
    if (t >= 1) r.turn = -1;
  }
  /** The rigid teleport of a ride: p' = to + R(yawDeg) * (p - from), yaw' = yaw + yawDeg. */
  private teleport(portal: NavPortal): void {
    const pl = this.s.ctx.player, p = pl.position, t = portal.transform;
    const a = t.yawDeg * DEG2RAD, c = Math.cos(a), sn = Math.sin(a);
    const dx = p.x - t.from[0], dy = p.y - t.from[1], dz = p.z - t.from[2];
    pl.teleport(t.to[0] + dx * c + dz * sn, t.to[1] + dy, t.to[2] - dx * sn + dz * c, pl.yaw * RAD2DEG + t.yawDeg, pl.pitch * RAD2DEG);
  }
  private gateClip(inst: AssetInstance, open: boolean): string {
    const def = this.s.ctx.data.manifest.assets[inst.id];
    const c = def ? def.animations.find((a) => (open ? a.name === 'open' || a.name.endsWith('_open') : a.name === 'close' || a.name.endsWith('_close'))) : undefined;
    return c ? c.name : '';
  }
  /** in the dark only one cage is drawn: the one she stands in, against the shaft */
  private showCage(cage: MarkerId): void {
    const { s } = this;
    for (const d of this.defs) {
      for (const id of d.portal.cages) {
        const inst = s.build.instance(id);
        if (inst) inst.root.visible = id === cage;
      }
    }
    const m = s.ctx.data.layout.markers.find((x) => x.id === cage);
    if (!m) return;
    if (!this.shaft && s.ctx.assets.isActive(SHAFT)) {
      const inst = s.ctx.assets.instantiate(SHAFT);
      inst.root.name = SHAFT;
      s.ctx.scene.dynamic.add(inst.root);
      this.shaft = inst;
      this.bars.length = 0; this.barRest.length = 0;
      const def = s.ctx.data.manifest.assets[SHAFT];
      for (const name of def?.codeDriven ?? []) { const n = inst.node(name); this.bars.push(n); this.barRest.push(n.position.y); }
      this.barSpan = def ? def.placeholder.size[1] : 12;
    }
    if (!this.shaft) return;
    // the shaft is modelled for the widest cage; a narrower cage scales it
    let widest = 0;
    for (const d of this.defs) widest = Math.max(widest, d.portal.cageInterior[0]);
    const run = this.run;
    const scale = run && widest > 0 ? run.def.portal.cageInterior[0] / widest : 1;
    const root = this.shaft.root;
    root.position.set(m.pos[0], m.pos[1], m.pos[2]);
    root.rotation.set(0, m.rotY * DEG2RAD + Math.PI, 0);
    root.scale.set(scale, 1, scale);
    root.visible = true;
    root.updateMatrix();
  }
  private dropShaft(): void {
    if (this.shaft) { this.shaft.release(); this.shaft = null; }
    this.bars.length = 0; this.barRest.length = 0;
  }
  private afterTeleport(r: Running): void {
    const { s } = this;
    const arrival = r.def.portal.cages[1];
    r.teleported = true;
    r.turn = -1;
    // the place she is going to comes up slowly through the rest of the dark, not in the last second at the gate
    s.zoneFade = Math.max(1, Math.min(MOOD_FADE_MAX, (r.total - r.ticks) * FIXED_DT));
    this.showCage(arrival);
    const inst = s.build.instance(arrival);
    const open = inst ? this.gateClip(inst, true) : '';
    if (inst && open) s.poseClip(inst, open, 0);             // its gate is shut until the ride is over
  }
  private end(r: Running): void {
    const { s } = this;
    this.run = null;
    s.rideDark = false; s.visDirty = true;
    if (this.shaft) this.shaft.root.visible = false;
    const arrival = r.def.portal.cages[1];
    const inst = s.build.instance(arrival);
    const open = inst ? this.gateClip(inst, true) : '';
    if (inst && open) s.playClip(inst, open);
    s.ctx.player.setControl(true, 'ride');
    this.payload.id = r.def.portal.id; this.payload.stage = 'ended'; this.payload.seconds = r.ticks * FIXED_DT;
    s.ctx.events.emit('ride/state', this.payload);
    // a checkpoint that is "the lift opens": its marker stands in the arrival cage
    const cage = s.ctx.data.layout.markers.find((m) => m.id === arrival);
    if (!cage) return;
    const half = r.def.portal.cageInterior[0] / 2;
    for (const cp of s.ctx.data.markersOfType('checkpoint')) {
      if (cp.zone === cage.zone && Math.abs(cp.pos[0] - cage.pos[0]) <= half && Math.abs(cp.pos[2] - cage.pos[2]) <= half && Math.abs(cp.pos[1] - cage.pos[1]) < 1) s.checkpoints.reach(cp.id as CheckpointId, true);
    }
  }

  tick(_dt: number): void {
    const { s } = this;
    this.tickSeam();
    const r = this.run;
    if (!r) return;
    r.ticks++;
    this.tickTurn(r);
    const d = r.def;
    if (!r.dark && r.ticks >= DARK_TICKS) {
      r.dark = true;
      s.rideDark = true; s.visDirty = true;
      this.lampDir = d.portal.transform.to[1] > d.portal.transform.from[1] ? -1 : 1;
      this.showCage(d.portal.cages[0]);
    }
    // the station reads its inventory in the dark: the ride's lines, spread over it
    while (r.said < d.lines.length && r.ticks >= (r.total * (r.said + 1)) / (d.lines.length + 1)) { s.story.say(d.lines[r.said] as string); r.said++; }
    if (!r.teleported) {
      if (d.swap) {
        // the cage is dark: the sets swap, and she is moved in the same step the colliders change
        if (r.ticks >= SWAP_TICKS && !r.building) {
          r.building = true;
          this.dropShaft();                              // it belongs to the set that is about to go
          // (she is moved on the tick the coda's colliders are in; in real time the build is spread over the dark)
          const p = s.build.swapInPlay(d.swap, () => { if (this.run === r && !r.teleported) { this.teleport(d.portal); this.afterTeleport(r); } });
          if (p) void s.build.track(p);
        }
      } else if (r.ticks >= (r.total >> 1)) { this.teleport(d.portal); this.afterTeleport(r); }
    }
    // (pass i2) the gate does not open on a line of the ride that is still waiting its turn: the station finishes its
    // reading in the dark, LINES_GRACE seconds at most (a player who never looked at the hall's drawing is told its
    // three lines in the cage, and the ride's own stand behind them)
    if (r.teleported && r.ticks >= r.total && (r.ticks >= r.total + LINES_GRACE_TICKS || !this.linesWaiting(d))) this.end(r);
  }
  private linesWaiting(d: Running['def']): boolean {
    const { story } = this.s;
    for (let i = 0; i < d.lines.length; i++) { const k = d.lines[i] as string; if (story.holds(k) && story.current !== k) return true; }
    return false;
  }

  /** per rendered frame: the lamp bars pass, fast then slow */
  update(alpha: number): void {
    const r = this.run;
    if (!r || !r.dark || this.bars.length === 0) return;
    const span = Math.max(1, r.total - DARK_TICKS) * FIXED_DT;
    const t = Math.min(span, Math.max(0, (r.ticks - DARK_TICKS + alpha) * FIXED_DT));
    // the distance run under a speed that falls in a line from LAMP_FAST to LAMP_SLOW
    const travelled = LAMP_FAST * t - ((LAMP_FAST - LAMP_SLOW) * t * t) / (2 * span);
    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i] as THREE.Object3D;
      let y = ((this.barRest[i] as number) + this.lampDir * travelled) % this.barSpan;
      if (y < 0) y += this.barSpan;
      bar.position.y = y;
      bar.updateMatrix();
      bar.matrixWorldNeedsUpdate = true;
    }
    if (this.shaft) this.shaft.root.matrixWorldNeedsUpdate = true;
  }

  attach(zone: ZoneId): void {
    const { s } = this;
    // an arrival cage stands with its gate open unless a ride is about to open it
    for (const d of this.defs) {
      const arrival = d.portal.cages[1];
      const m = s.ctx.data.layout.markers.find((x) => x.id === arrival);
      if (!m || m.zone !== zone) continue;
      const inst = s.build.instance(arrival);
      const open = inst ? this.gateClip(inst, true) : '';
      if (inst && open) s.poseClip(inst, open, this.run && this.run.def === d ? 0 : 1);
    }
  }
  detach(_zone: ZoneId): void { /* cage instances are the build's; the shaft is dropped by the swap itself */ }
  reset(): void {
    const { s } = this;
    if (this.run) { this.run = null; s.rideDark = false; s.visDirty = true; }
    s.zoneFade = 0;
    if (this.shaft) this.shaft.root.visible = false;
    this.swapArmed = false;
  }
  debug(): Record<string, unknown> | null {
    const r = this.run;
    return r ? { id: r.def.portal.id, ticks: r.ticks, total: r.total, dark: r.dark, teleported: r.teleported } : null;
  }
}

export function createRides(s: State): RidesApi { return new Rides(s); }
