// src/world/doors.ts: the door state machine (closed | ajar | opening | open | closing), colliders, locks, `door/state`.
// A door's clip comes from its bound asset (its own instance, or through `partOf` the cage that owns the gate); the
// collider is the marker's box, on while closed, ajar or closing. A door never shuts on the player: it waits until her
// capsule is clear of its box.
import { ColFlag, PLAYER_HEIGHT, PLAYER_RADIUS } from '../core/contracts.ts';
import type { AssetInstance, AudioCue, ColliderHandle, DoorState, GameEvents, LayoutMarker, MarkerId, ZoneId } from '../core/contracts.ts';
import type * as THREE from 'three';
import { DEG2RAD } from '../core/math.ts';
import type { DoorsApi, State } from './internals.ts';

/** the hatch released by its knot holds the `open` clip here: a 0.3 m gap, the collider stays (GDD 9.4) */
const AJAR = 0.15;
/** a code-raised gate travels at this speed (0.2 m a notch in a fifth of a second) */
const RAISE_SPEED = 1.0;
const FALLBACK_SECONDS = 0.6;
const DEFAULT_SIZE: readonly [number, number, number] = [1.2, 2.2, 0.2];
/** the thinnest box a door gets (a capsule moving 0.1 m a tick must not step through it) */
const MIN_DEPTH = 0.35;
/** sounds with no domain event (code-world 4.2); every other door creaks */
const OPEN_CUE: Readonly<Record<string, AudioCue>> = { door_yard_gate: 'gate_bang', ia_hatch: 'hatch_iris', ia_baffle: 'baffle_grind' };

interface Door {
  id: MarkerId;
  marker: LayoutMarker;
  state: DoorState;
  locked: boolean;
  /** it was open when it was locked: it opens again when the lock goes */
  reopen: boolean;
  wantClose: boolean;
  /** metres past the door's plane she must be before a requested close starts */
  clear: number;
  /** a world flag the door needs before it can open (the hatch: hatch_powered), '' for none */
  requires: string;
  /** it was asked to open before what it requires was there */
  wantOpen: boolean;
  hatch: boolean;
  box: ColliderHandle;
  /** where the box stands (the marker, or the plane of the bound instance when that lies outside the marker's box) and its half thickness */
  bx: number; bz: number; hz: number;
  inst: AssetInstance | null;
  openClip: string; closeClip: string;
  openSeconds: number; closeSeconds: number;
  /** 0 = shut, 1 = open (the `open` clip's fraction) */
  progress: number;
  /** the closing travel, 0..1 */
  closing: number;
  // a code-driven gate (no clip): the node that rises and where it stands
  raiseNode: THREE.Object3D | null;
  raiseRest: number;
  raise: number;
  raiseTarget: number;
}

class Doors implements DoorsApi {
  private readonly list: Door[] = [];
  private readonly byId = new Map<MarkerId, Door>();
  private readonly idList: MarkerId[] = [];
  private readonly payload: GameEvents['door/state'] = { id: '', state: 'closed', locked: false };

  constructor(private readonly s: State) {
    for (const m of s.ctx.data.markersOfType('door')) {
      const d: Door = {
        id: m.id, marker: m, state: 'closed', locked: false, reopen: false, wantClose: false, clear: 0, requires: '', wantOpen: false, hatch: m.params.kind === 'hatch', box: -1,
        bx: m.pos[0], bz: m.pos[2], hz: (m.size ?? DEFAULT_SIZE)[2] / 2,
        inst: null, openClip: '', closeClip: '', openSeconds: FALLBACK_SECONDS, closeSeconds: FALLBACK_SECONDS, progress: 0, closing: 0,
        raiseNode: null, raiseRest: 0, raise: 0, raiseTarget: 0,
      };
      const req = m.params.requires;
      // only a flag: an encounter or a puzzle named here is the director's and the puzzles' business
      if (typeof req === 'string' && /^[a-z_]+$/.test(req) && !req.startsWith('enc_')) d.requires = req;
      this.placeBox(d);
      this.list.push(d);
      this.byId.set(m.id, d);
      this.idList.push(m.id);
    }
  }

  /**
   * The collider stands where the door is drawn. A door's box is the marker's, except when its bound instance is set
   * off along the door's thickness by more than the marker's half depth (door_jug_gate: the hurdle hangs 1.1 m in
   * front of the marker): then the box is centred on the instance's plane, as thick as the asset (never under
   * MIN_DEPTH), so she stops at the planks she sees. docs/requests/code-world.md asks level design to move the marker.
   */
  private placeBox(d: Door): void {
    const { data } = this.s.ctx;
    const m = d.marker, size = m.size ?? DEFAULT_SIZE;
    if (d.hatch) return;
    for (const b of data.bindings(m)) {
      if (b.mode !== 'instance' || b.space === 'world' || !b.offset || Math.abs(b.offset[2]) <= size[2] / 2) continue;
      const p = data.placement(m, b, this.placement);
      // only the offset along the thickness moves the box: a sideways offset is a hinge
      const r = m.rotY * DEG2RAD, nx = Math.sin(r), nz = Math.cos(r);
      const along = (p.x - m.pos[0]) * nx + (p.z - m.pos[2]) * nz;
      d.bx = m.pos[0] + nx * along; d.bz = m.pos[2] + nz * along;
      const depth = data.manifest.assets[b.asset]?.placeholder?.size[2] ?? size[2];
      d.hz = Math.max(MIN_DEPTH, Math.min(depth, size[2])) / 2;
      return;
    }
  }
  private readonly placement = { x: 0, y: 0, z: 0, rotYRad: 0, scale: 1 };

  ids(): readonly MarkerId[] { return this.idList; }
  state(id: MarkerId): DoorState { return this.byId.get(id)?.state ?? 'closed'; }
  locked(id: MarkerId): boolean { return this.byId.get(id)?.locked ?? false; }
  raiseOf(id: MarkerId): number { return this.byId.get(id)?.raise ?? 0; }

  private live(d: Door): boolean {
    const b = this.s.build;
    if (b.isBuilt(d.marker.zone)) return true;
    const connects = d.marker.params.connects;
    if (Array.isArray(connects)) for (const z of connects as ZoneId[]) if (b.isBuilt(z)) return true;
    return false;
  }
  private solid(state: DoorState): boolean { return state === 'closed' || state === 'ajar' || state === 'closing'; }

  // ---- what is built --------------------------------------------------------------------------------
  /** Look again at every door: colliders for the live ones, the instance each is drawn by, the pose of its state. */
  attach(_zone: ZoneId): void {
    const { ctx } = this.s;
    const col = ctx.collision;
    for (const d of this.list) {
      if (!this.live(d)) {
        if (d.box >= 0) { col.removeBox(d.box); d.box = -1; }
        d.inst = null; d.raiseNode = null;
        continue;
      }
      const m = d.marker, size = m.size ?? DEFAULT_SIZE;
      if (d.box < 0) {
        const flags = m.params.pierce === true ? ColFlag.PIERCE : 0;
        // doors: [width, height, thickness] with the sill at pos; the hatch: [x, thickness, z] with its bottom at pos
        d.box = col.addBox(d.bx, m.pos[1] + size[1] / 2, d.bz, size[0] / 2, size[1] / 2, d.hz, m.rotY * DEG2RAD,
          d.hatch || m.params.pierce === true ? 'metal' : 'wood', flags, { id: m.id, kind: 'door' });
      }
      const inst = this.s.build.instance(d.id);
      if (inst !== d.inst) {
        d.inst = inst;
        d.openClip = ''; d.closeClip = ''; d.raiseNode = null;
        if (inst) {
          const def = ctx.data.manifest.assets[inst.id];
          for (const c of def ? def.animations : []) {
            if (d.openClip === '' && (c.name === 'open' || c.name.endsWith('_open'))) { d.openClip = c.name; d.openSeconds = c.seconds; }
            if (d.closeClip === '' && (c.name === 'close' || c.name.endsWith('_close'))) { d.closeClip = c.name; d.closeSeconds = c.seconds; }
          }
          if (d.closeClip === '') d.closeSeconds = d.openSeconds;
          if (d.openClip === '' && def && def.codeDriven && def.codeDriven.length > 0) {
            d.raiseNode = inst.node(def.codeDriven[0] as string);
            d.raiseRest = this.restOf(inst, def.codeDriven[0] as string);
          }
        }
      }
      this.pose(d);
      this.syncBox(d);
    }
  }
  /** the rest height of a code-driven node: the template's, whatever a pooled instance was left at */
  private restOf(inst: AssetInstance, node: string): number {
    const loaded = this.s.ctx.assets.get(inst.id);
    let y = inst.node(node).position.y;
    loaded.scene.traverse((o) => { if (o.name === node || o.userData.name === node) y = o.position.y; });
    return y;
  }
  detach(zone: ZoneId): void {
    // instances of this zone are about to be released: drop them (attach finds the new ones)
    for (const d of this.list) {
      if (!d.inst) continue;
      const placed = this.s.build.placed(d.id);
      let gone = false;
      for (let i = 0; i < placed.length; i++) if ((placed[i] as { zone: ZoneId }).zone === zone && (placed[i] as { inst: AssetInstance | null }).inst === d.inst) gone = true;
      const owner = this.ownerMarker(d);
      if (owner) {
        const op = this.s.build.placed(owner);
        for (let i = 0; i < op.length; i++) if ((op[i] as { zone: ZoneId }).zone === zone && (op[i] as { inst: AssetInstance | null }).inst === d.inst) gone = true;
      }
      if (gone) { d.inst = null; d.raiseNode = null; }
    }
  }
  private ownerMarker(d: Door): MarkerId | '' {
    for (const b of this.s.ctx.data.bindings(d.marker)) if (b.mode === 'partOf' && b.owner) return b.owner;
    return '';
  }

  private syncBox(d: Door): void {
    if (d.box < 0) return;
    const col = this.s.ctx.collision;
    const m = d.marker, size = m.size ?? DEFAULT_SIZE;
    col.setBoxTransform(d.box, d.bx, m.pos[1] + size[1] / 2 + d.raise, d.bz, m.rotY * DEG2RAD);
    col.setBoxEnabled(d.box, this.solid(d.state));
  }
  /** Put the instance in the pose of the door's state (a restore, a rebuild). */
  private pose(d: Door): void {
    const { s } = this;
    if (d.raiseNode) { d.raiseNode.position.y = d.raiseRest + d.raise; return; }
    if (!d.inst || d.openClip === '') return;
    if (d.state === 'closing' && d.closeClip !== '') s.poseClip(d.inst, d.closeClip, d.closing);
    else s.poseClip(d.inst, d.openClip, d.state === 'closing' ? 1 - d.closing : d.progress);
  }

  private emit(d: Door): void {
    const p = this.payload;
    p.id = d.id; p.state = d.state; p.locked = d.locked;
    this.s.ctx.events.emit('door/state', p);
  }
  private set(d: Door, state: DoorState): void {
    if (d.state === state) return;
    d.state = state;
    if (d.box >= 0) this.s.ctx.collision.setBoxEnabled(d.box, this.solid(state));
    this.s.visDirty = true;
    this.emit(d);
  }

  // ---- the machine ----------------------------------------------------------------------------------
  open(id: MarkerId, instant = false, force = false): void {
    const d = this.byId.get(id);
    if (!d) return;
    d.wantClose = false;
    if (d.locked && !force) { d.reopen = true; return; }
    if (d.requires !== '' && !this.s.flags.has(d.requires) && !force) { d.wantOpen = true; return; }
    d.wantOpen = false;
    if (d.state === 'open' || (d.state === 'opening' && !instant)) return;
    if (instant) {
      d.progress = 1; d.closing = 0;
      if (d.raiseNode || d.raiseTarget > 0) d.raise = d.raiseTarget;
      this.set(d, 'open');
      this.pose(d); this.syncBox(d);
      return;
    }
    if (d.state === 'closing') d.progress = 1 - d.closing;
    d.closing = 0;
    // the marker's own `cue` wins when level design gives one (docs/requests/code-world.md)
    const cue = (typeof d.marker.params.cue === 'string' ? (d.marker.params.cue as AudioCue) : undefined) ?? OPEN_CUE[id] ?? (d.raiseNode ? undefined : 'door_creak');
    if (cue) this.s.cueAt(cue, d.marker);
    this.set(d, 'opening');
    if (d.inst && d.openClip !== '') this.s.poseClip(d.inst, d.openClip, d.progress);
  }
  close(id: MarkerId, instant = false, clear = 0): void {
    const d = this.byId.get(id);
    if (!d) return;
    d.clear = clear;
    if (d.state === 'closed' || (d.state === 'closing' && !instant)) { d.wantClose = false; return; }
    if (instant) {
      d.wantClose = false;
      d.progress = 0; d.closing = 0;
      this.set(d, 'closed');
      this.pose(d); this.syncBox(d);
      return;
    }
    if (d.state === 'ajar') { d.progress = 0; this.set(d, 'closed'); this.pose(d); return; }
    d.wantClose = true;                                 // it starts as soon as she is clear of the leaf (tick)
  }
  ajar(id: MarkerId): void {
    const d = this.byId.get(id);
    if (!d || d.state !== 'closed') return;
    d.progress = AJAR;
    this.set(d, 'ajar');
    this.pose(d);
  }
  lock(id: MarkerId, on: boolean): void {
    const d = this.byId.get(id);
    if (!d || d.locked === on) return;
    d.locked = on;
    if (on) {
      d.reopen = (d.state === 'open' || d.state === 'opening') && !d.wantClose;
      if (d.reopen) this.close(id);
      this.emit(d);
    } else {
      this.emit(d);
      if (d.reopen) { d.reopen = false; this.open(id); }
    }
  }
  setRaise(id: MarkerId, height: number, instant = false): void {
    const d = this.byId.get(id);
    if (!d) return;
    d.raiseTarget = height;
    if (instant) { d.raise = height; this.pose(d); this.syncBox(d); }
  }
  force(id: MarkerId, state: DoorState): void {
    const d = this.byId.get(id);
    if (!d) return;
    d.wantClose = false;
    d.progress = state === 'open' || state === 'opening' ? 1 : state === 'ajar' ? AJAR : 0;
    d.closing = 0;
    this.set(d, state === 'opening' ? 'open' : state === 'closing' ? 'closed' : state);
    this.pose(d); this.syncBox(d);
  }

  /** her capsule against the door's box grown by her radius */
  private blocked(d: Door): boolean {
    const p = this.s.ctx.player.position;
    const m = d.marker, size = m.size ?? DEFAULT_SIZE;
    const bottom = m.pos[1] + d.raise, top = bottom + size[1];
    if (p.y >= top || p.y + PLAYER_HEIGHT <= bottom) return false;
    const r = m.rotY * DEG2RAD, c = Math.cos(r), sn = Math.sin(r);
    const dx = p.x - d.bx, dz = p.z - d.bz;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    return Math.abs(lx) < size[0] / 2 + PLAYER_RADIUS + 0.05 && Math.abs(lz) < Math.max(d.hz + PLAYER_RADIUS + 0.05, d.clear);
  }

  tick(dt: number): void {
    const { s } = this;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i] as Door;
      if (d.wantOpen && s.flags.has(d.requires)) this.open(d.id);
      if (d.raise !== d.raiseTarget) {
        const step = RAISE_SPEED * dt;
        d.raise = Math.abs(d.raiseTarget - d.raise) <= step ? d.raiseTarget : d.raise + Math.sign(d.raiseTarget - d.raise) * step;
        if (d.raiseNode) d.raiseNode.position.y = d.raiseRest + d.raise;
        this.syncBox(d);
      }
      if (d.wantClose && (d.state === 'open' || d.state === 'opening') && !this.blocked(d)) {
        d.wantClose = false;
        d.closing = d.state === 'opening' ? 1 - d.progress : 0;
        this.set(d, 'closing');
        if (d.inst && d.openClip !== '') {
          if (d.closeClip !== '') s.poseClip(d.inst, d.closeClip, d.closing); else s.poseClip(d.inst, d.openClip, 1 - d.closing);
        }
      }
      if (d.state === 'opening') {
        if (d.openClip === '') {
          // a code-raised gate is open when the bar has arrived; a door with no clip at all opens at once
          if (d.raise === d.raiseTarget) { d.progress = 1; this.set(d, 'open'); }
          continue;
        }
        d.progress += dt / d.openSeconds;
        if (d.progress >= 1) { d.progress = 1; s.scrubClip(d.inst, d.openClip, 1); this.set(d, 'open'); } else s.scrubClip(d.inst, d.openClip, d.progress);
      } else if (d.state === 'closing') {
        d.closing += dt / d.closeSeconds;
        const done = d.closing >= 1;
        if (done) d.closing = 1;
        if (d.inst && d.openClip !== '') {
          if (d.closeClip !== '') s.scrubClip(d.inst, d.closeClip, d.closing); else s.scrubClip(d.inst, d.openClip, 1 - d.closing);
        }
        if (done) { d.progress = 0; d.closing = 0; this.set(d, 'closed'); }
      }
    }
  }

  reset(): void {
    for (const d of this.list) {
      d.locked = false; d.reopen = false; d.wantClose = false; d.wantOpen = false; d.progress = 0; d.closing = 0; d.raise = 0; d.raiseTarget = 0;
      if (d.state !== 'closed') { d.state = 'closed'; this.s.visDirty = true; }
      this.pose(d); this.syncBox(d);
    }
  }
  capture(out: Record<MarkerId, DoorState>): void {
    // a save holds resting states: a door in travel is saved where it is going
    for (const d of this.list) out[d.id] = d.state === 'opening' ? 'open' : d.state === 'closing' || d.wantClose ? 'closed' : d.state;
  }
  apply(save: Readonly<Record<MarkerId, DoorState>>): void {
    for (const d of this.list) {
      const want = save[d.id] ?? 'closed';
      const state: DoorState = want === 'opening' ? 'open' : want === 'closing' ? 'closed' : want;
      d.locked = false; d.reopen = false; d.wantClose = false; d.wantOpen = false; d.closing = 0;
      d.progress = state === 'open' ? 1 : state === 'ajar' ? AJAR : 0;
      if (d.raiseTarget > 0 || d.raise > 0) { d.raise = state === 'open' ? d.raiseTarget : d.raise; }
      if (d.state !== state) { d.state = state; this.s.visDirty = true; }
      this.pose(d); this.syncBox(d);
    }
  }
}

export function createDoors(s: State): DoorsApi { return new Doors(s); }
