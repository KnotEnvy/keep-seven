// src/world/interact.ts: the focus ray and `interact/*` (ARCHITECTURE 3.5), pickups, refill boxes, line lockers,
// readables (pause and resume), the loose shootables (the yard bell, the range plates, the two knots that are not a
// puzzle's, the loft bell's rope, the bore), look targets (the cradle) and the lazy key hints (GDD 5, 6.4, 6.5, 12.1, 14).
import * as THREE from 'three';
import { ColFlag, FIXED_DT, LAYER_FOCUS, Layer, PLAYER_EYE } from '../core/contracts.ts';
import type {
  AssetInstance, DamageInfo, EncounterId, EntityRef, GameEvents, HitResponse, HitResult, LayoutMarker, MarkerId, PickupKind,
  SecretId, StoryKey, VolumeHandle, WorldSave, ZoneId,
} from '../core/contracts.ts';
import { DEG2RAD } from '../core/math.ts';
import { PUZZLES, Shot, inVolume, namedLine, paramList, paramNumber, paramString } from './internals.ts';
import type { InteractApi, ShotOwner, State } from './internals.ts';

/** GDD 5: use range 2.2 m, the prompt from 3.0 m, a 25 degree cone when the ray itself misses */
const USE_RANGE = 2.2;
const PROMPT_RANGE = 3.0;
/** below knee height the use range is measured along the ground */
const LOW_THING = 0.5;
const CONE_COS = Math.cos(25 * DEG2RAD);
const FOCUS_RADIUS = 0.35;
/**
 * The stone (polish round 3): the note lies 0.4 m from the round, and two 0.35 m focus spheres were one target: `E`
 * meant for the note took the round, which ends the game. The round's sphere is the cartridge, the note's is the paper
 * as drawn, and until the note has been opened once it is the one offered whenever both are inside the cone.
 */
const ROUND_RADIUS = 0.12, PAPER_RADIUS = 0.2, BESIDE = 0.8;
/**
 * Polish round 4: "offered first" hid the final choice behind the wrong verb (aimed at the round, the prompt read
 * READ). Of the round and the note the one she is LOOKING AT is offered: the one nearer the middle of her view. Only
 * when they are within this many degrees of each other (she is looking between them) does the unread note win.
 */
const BESIDE_TIE_DEG = 2;
/** the sight line to the round or the note is taken this far above its point (both lie on the stone's top face) */
const BESIDE_LIFT = 0.08;
/** pickups are walked over (producer ruling 10) */
const PICKUP_RADIUS = 0.9;
const PICKUP_RETRY = 30;
const MAX_DROPS = 12;
/** GDD 6.5: a refill box tops the reserve to 18 */
const BOX_FLOOR = 18;
/** GDD 12.1: a key hint shows only if the action was not done within 4 s of first being needed */
const HINT_AFTER = 4;
/** the round a locker offers: code-placed, no binding names it (docs/requests/code-world.md) */
const LOCKER_ROUND = 'prop_cartridge_line';
/** the mercy tin: after two deaths in the same boss phase (GDD 14) */
const MERCY_DEATHS = 2;
/** a knot left alone: after its one line, a wordless pulse this often */
const KNOT_PULSE_EVERY = 30;
/** with no lead at all, a boss-room cartridge point that can give glints this often, its lamp this much brighter */
const EMPTY_PULSE_EVERY = 2.5, EMPTY_LAMP_BOOST = 2.5;

const AMMO = 0, LOCKER = 1, READABLE = 2, RIDE = 3, STONE = 4;
/** index of ui_hint_interact in the lazy hint list */
const HINT_INTERACT = 4;
const HINT_RELOAD = 2;
/** the reload hint stands this long each time, and is shown at most this often */
const RELOAD_HINT_SECONDS = 6, RELOAD_HINT_SHOWS = 3;
interface Thing {
  id: MarkerId;
  marker: LayoutMarker;
  role: number;
  kind: 'read' | 'take' | 'use';
  prompt: StoryKey;
  volume: VolumeHandle;
  ref: EntityRef;
  x: number; y: number; z: number;
  live: boolean;
  /** ammo box in the boss room: seconds until it gives again */
  cooldown: number;
  /** boss-room box: it is calling her (she has no lead at all) */
  calling: boolean;
  /** locker: a round is in the slot */
  offering: boolean;
  /** locker: it has given what it gives once (saved) */
  used: boolean;
  round: number;
  /** the radius of its focus sphere */
  radius: number;
  /** the readable that lies beside it and is offered first until it has been read (the stone's note); null for most */
  beside: Thing | null;
  /** readable: the saved flag "she has opened it" */
  readFlag: string;
}
interface Pickup {
  id: string; kind: PickupKind; marker: LayoutMarker | null; zone: ZoneId;
  x: number; y: number; z: number;
  token: number;
  live: boolean; taken: boolean; available: boolean; dropped: boolean;
  retry: number;
}
interface LazyHint { key: StoryKey; flag: string; needed: boolean; timer: number; shown: boolean; immediate: boolean; shownFor: number; shows: number }
interface Look { marker: LayoutMarker; timer: number; flag: string; x: number; y: number; z: number }
interface Loose { marker: LayoutMarker; shot: Shot; role: number; done: boolean; idle: number; nudges: number; outlined: boolean }
const KNOT = 0, BELL = 1, PLATE = 2, ROPE = 3, BORE = 4;

class Interact implements InteractApi, ShotOwner {
  private readonly things: Thing[] = [];
  private readonly byEntity = new Map<string, Thing>();
  private readonly pickups: Pickup[] = [];
  private dropCursor = 0;
  private readonly loose: Loose[] = [];
  private readonly looks: Look[] = [];
  private readonly hints: LazyHint[] = [];
  private focus: Thing | null = null;
  private focusKept = false;
  private keptMark: MarkerId | '' = '';
  private openKey: StoryKey = '';
  private openThing: Thing | null = null;
  private emptyT = 0;
  private dryClicks = 0;
  /** an empty click on this tick (the reload hint shows on the click itself) */
  private dryNow = false;
  private bayBonus = false;                            // the bay locker's one more round after the solve is still to give
  private boreSaid: string = '';
  private firstReadable: LayoutMarker | undefined;
  private readonly firstPuzzleVolume: LayoutMarker | undefined;
  private boreVolume: VolumeHandle = -1;
  private readonly hit: HitResult;
  private readonly v = new THREE.Vector3();
  private readonly focusPayload: GameEvents['interact/focus'] = { id: '', prompt: '', kind: '' };
  private readonly usedPayload: GameEvents['interact/used'] = { id: '', kind: 'use' };
  private readonly spawnedPayload: GameEvents['pickup/spawned'] = { x: 0, y: 0, z: 0, id: '', kind: 'pk_rounds_6', dropped: false };
  private readonly collectedPayload: GameEvents['pickup/collected'] = { x: 0, y: 0, z: 0, id: '', kind: 'pk_rounds_6', amount: 0 };
  private readonly hintPayload: GameEvents['ui/hint'] = { key: '', show: false };
  private readonly readablePayload: GameEvents['readable/opened'] = { key: '' };
  private readonly secretPayload: GameEvents['secret/found'] = { id: 'sec_loft_bell' };

  constructor(private readonly s: State) {
    const { data, events, collision } = s.ctx;
    this.hit = collision.createHit();
    // ---- things used with `interact`
    for (const m of data.layout.markers) {
      if (m.type === 'readable') { this.addThing(m, READABLE, 'read', 'ui_prompt_read'); if (!this.firstReadable) this.firstReadable = m; continue; }
      if (m.type === 'pickup') {
        this.pickups.push({ id: m.id, kind: paramString(m, 'pickup') as PickupKind, marker: m, zone: m.zone, x: m.pos[0], y: m.pos[1], z: m.pos[2], token: -1, live: false, taken: false, available: true, dropped: false, retry: 0 });
        continue;
      }
      if (m.type !== 'interactable') continue;
      const key = paramString(m, 'interactable');
      const kind = paramString(m, 'kind');
      if (m.params.ride !== undefined) this.addThing(m, RIDE, 'use', 'ui_prompt_use');
      else if (key === 'ia_ammo_box') this.addThing(m, AMMO, 'use', 'ui_prompt_use');
      else if (key.startsWith('ia_line_locker')) this.addThing(m, LOCKER, 'take', 'ui_prompt_take');
      else if (paramString(m, 'prompt') === 'ui_prompt_take') this.addThing(m, STONE, 'take', 'ui_prompt_take');
      else if (kind === 'look_target') this.looks.push({ marker: m, timer: 0, flag: 'looked:' + m.id, x: m.pos[0], y: m.pos[1], z: m.pos[2] });
      else if (kind === 'knot' && !s.forcers.has(m.id)) this.addLoose(m, KNOT, 'knot');
      else if (kind === 'shootable') this.addLoose(m, m.params.scaleDegree !== undefined ? PLATE : m.params.drops !== undefined ? ROPE : BELL, m.params.scaleDegree !== undefined ? 'range_plate' : m.params.drops !== undefined ? 'rope' : 'bell');
    }
    // a thing that is taken for good (the round on the stone) with a readable beside it: each gets a sphere its own size
    for (const t of this.things) {
      if (t.role !== STONE) continue;
      t.radius = ROUND_RADIUS;
      for (const r of this.things) {
        if (r.role !== READABLE || r.marker.zone !== t.marker.zone) continue;
        const dx = r.x - t.x, dy = r.y - t.y, dz = r.z - t.z;
        if (dx * dx + dy * dy + dz * dz <= BESIDE * BESIDE) { r.radius = PAPER_RADIUS; t.beside = r; this.stoneNotes.add(r.id); }
      }
    }
    const bore = data.markersOfType('puzzle_element').find((m) => m.params.role === 'bore_opening');
    if (bore) this.addLoose(bore, BORE, 'bore');
    for (let i = 0; i < MAX_DROPS; i++) this.pickups.push({ id: 'drop#' + i, kind: 'pk_rounds_6', marker: null, zone: 'the_lip', x: 0, y: 0, z: 0, token: -1, live: false, taken: true, available: true, dropped: true, retry: 0 });
    this.firstPuzzleVolume = data.markersOfType('trigger').find((m) => m.params.puzzle === PUZZLES[0] && m.params.role === 'volume');
    // ---- the lazy key hints, each with the flag that says "she has done it"
    for (const [key, flag, immediate] of [['ui_hint_move', 'did_move', false], ['ui_hint_fire', 'did_fire', false], ['ui_hint_reload', 'did_reload', true],
      ['ui_hint_sprint', 'did_sprint', false], ['ui_hint_interact', 'did_interact', false], ['ui_hint_line', 'did_line', false]] as const) {
      this.hints.push({ key, flag, needed: false, timer: 0, shown: false, immediate, shownFor: 0, shows: 0 });
    }
    events.on('weapon/fired', () => this.did('did_fire'));
    // "she has reloaded" is the reload ACTION: a dry click starts a reload by itself (GDD 6.3) and teaches no key
    events.on('weapon/reload', (e) => { if (e.stage === 'open' && s.ctx.input.pressed('reload')) this.did('did_reload'); });
    events.on('weapon/dry_fire', (e) => { if (e.reason === 'empty') { this.dryClicks++; this.dryNow = true; } });
    events.on('weapon/line', (e) => { if (e.stage === 'loaded') this.did('did_line'); });
    events.on('game/state', (e) => this.onGameState(e.from));
    events.on('boss/guard', (e) => { if (e.state === 'set') this.stockBore(); });
    events.on('door/state', (e) => {
      // a secret behind a door is found when the door stands open
      if (e.state !== 'open') return;
      const m = data.layout.markers.find((x) => x.id === e.id);
      const secret = m ? paramString(m, 'secret') : '';
      if (secret !== '') this.found(secret as SecretId);
    });
  }
  private addThing(m: LayoutMarker, role: number, kind: Thing['kind'], prompt: StoryKey): void {
    const t: Thing = { id: m.id, marker: m, role, kind, prompt, volume: -1, ref: { id: m.id, kind: 'interactable' }, x: m.pos[0], y: m.pos[1], z: m.pos[2], live: false, cooldown: 0, calling: false, offering: false, used: false, round: -1, radius: FOCUS_RADIUS, beside: null, readFlag: 'read:' + m.id };
    this.things.push(t);
    this.byEntity.set(m.id, t);
  }
  private addLoose(m: LayoutMarker, role: number, kind: 'knot' | 'bell' | 'range_plate' | 'rope' | 'bore'): void {
    const l: Loose = { marker: m, shot: new Shot(this, m.id, kind, this.loose.length, m), role, done: false, idle: 0, nudges: 0, outlined: false };
    this.loose.push(l);
    if (role === KNOT) this.s.forcers.set(m.id, (announce = false) => this.burstKnot(l, announce));
  }

  // ---- what is built --------------------------------------------------------------------------------
  attach(zone: ZoneId): void {
    const { s } = this;
    const { collision, data } = s.ctx;
    for (const t of this.things) {
      if (t.marker.zone !== zone || t.live) continue;
      t.live = true;
      // the focus volume sits on the thing she looks at: the middle of a floor-standing asset, the marker otherwise
      t.x = t.marker.pos[0]; t.y = t.marker.pos[1]; t.z = t.marker.pos[2];
      const placed = s.build.placed(t.id)[0];
      if (placed) {
        const ph = data.manifest.assets[placed.binding.asset]?.placeholder;
        if (ph && (ph.anchor === 'base' || ph.anchor === 'back_base') && !placed.binding.offset) t.y += ph.size[1] / 2;
      }
      const part = t.role === RIDE ? s.build.partNode(t.id) : null;
      if (part) { part.getWorldPosition(this.v); t.x = this.v.x; t.y = this.v.y; t.z = this.v.z; }
      t.volume = collision.addVolume({ shape: 'sphere', layer: Layer.INTERACT, flags: 0, surface: 'none', entity: t.ref, part: 'whole', priority: 0, receiver: null });
      collision.setSphere(t.volume, t.x, t.y, t.z, t.radius);
      t.round = -1;
      this.syncThing(t);
    }
    for (const p of this.pickups) {
      if (p.dropped || p.zone !== zone) continue;
      p.live = true;
      p.token = s.build.token(p.id);
      this.syncPickup(p, true);
    }
    for (const l of this.loose) {
      const m = l.marker;
      if (m.zone !== zone) continue;
      if (l.role === BORE) {
        const vol = m.params.volume as { radius: number; top: number; axis: [number, number, number] } | undefined;
        if (!vol) continue;
        // a disc below the kerb: lead rings flat on it, a line round is told it is short
        this.boreVolume = collision.addVolume({ shape: 'box', layer: Layer.SHOOTABLE, flags: 0, surface: 'none', entity: l.shot.ref, part: 'whole', priority: 0, receiver: l.shot });
        collision.setVolumeBox(this.boreVolume, vol.axis[0], vol.top - 1.8, vol.axis[2], vol.radius, 0.2, vol.radius, 0);
        l.shot.x = vol.axis[0]; l.shot.y = vol.top - 1.8; l.shot.z = vol.axis[2];
        continue;
      }
      let x = m.pos[0], y = m.pos[1], z = m.pos[2];
      const part = s.build.partNode(m.id);                 // a part of another marker's instance (the rope of the loft bell)
      if (part) { part.getWorldPosition(this.v); x = this.v.x; y = this.v.y; z = this.v.z; }
      l.shot.enabled = !l.done;
      l.shot.add(s, x, y, z, paramNumber(m, 'hitRadius', l.role === PLATE ? 0.4 : 0.2), l.role === KNOT ? 'metal' : 'ceramic', m.params.pierce === true ? ColFlag.PIERCE : 0);
      this.syncLoose(l);
    }
  }
  detach(zone: ZoneId): void {
    const { s } = this;
    const col = s.ctx.collision;
    for (const t of this.things) {
      if (t.marker.zone !== zone || !t.live) continue;
      t.live = false;
      col.removeVolume(t.volume); t.volume = -1;
      t.round = -1;
      if (this.focus === t) this.setFocus(null, false);
    }
    for (const p of this.pickups) {
      if (p.zone !== zone || !p.live) continue;
      p.live = false; p.token = -1;
      if (p.dropped) p.taken = true;
    }
    for (const l of this.loose) {
      if (l.marker.zone !== zone) continue;
      if (l.role === BORE) { if (this.boreVolume >= 0) { col.removeVolume(this.boreVolume); this.boreVolume = -1; } } else l.shot.remove(s);
    }
  }

  // ---- things ---------------------------------------------------------------------------------------
  private instOf(t: Thing): AssetInstance | null { return this.s.build.instance(t.id); }
  private clipOf(inst: AssetInstance | null, name: string): string {
    if (!inst) return '';
    const def = this.s.ctx.data.manifest.assets[inst.id];
    const c = def ? def.animations.find((a) => a.name === name || a.name.endsWith('_' + name)) ?? (name === '' ? def.animations[0] : undefined) : undefined;
    return c ? c.name : '';
  }
  /** push a thing's state onto what is built (the locker's door and round, the box's lamp) */
  private syncThing(t: Thing): void {
    const { s } = this;
    if (!t.live) return;
    const inst = this.instOf(t);
    if (t.role === LOCKER) {
      const open = this.clipOf(inst, 'open');
      if (open) s.poseClip(inst, open, t.offering ? 1 : 0);
      if (t.offering && t.round < 0 && inst && s.ctx.assets.isActive(LOCKER_ROUND)) {
        inst.root.updateWorldMatrix(true, true);
        inst.node('round_slot').getWorldPosition(this.v);
        t.round = s.build.instAdd(t.marker.zone, LOCKER_ROUND, '', this.v.x, this.v.y, this.v.z, 0, 1);
      }
      if (t.round >= 0) s.build.instShow(t.round, t.offering);
      const lamp = s.build.node(t.id, 'lamp');
      if (lamp) s.ctx.render.lamps.setMask(lamp, t.offering ? 1 : 0);
    } else if (t.role === AMMO) {
      const lamp = s.build.node(t.id, 'lamp');
      if (lamp) s.ctx.render.lamps.setMask(lamp, t.cooldown > 0 ? 0 : 1);
    }
  }
  /** the last look at the stone's pair: degrees off the round, off the note, each in reach (debug) */
  private readonly pairDebug = [0, 0, 0, 0];
  /** readables that lie beside the round on the stone */
  private readonly stoneNotes = new Set<string>();
  private available(t: Thing): boolean {
    if (t.role === LOCKER) return t.offering;
    if (t.role === AMMO) return t.cooldown <= 0;
    if (t.role === RIDE) return this.s.rides.available(t.id);
    // the round on the stone is offered only while the choice is hers: once a branch has begun (she walked on) the
    // prompt goes with it (polish round 3: a dead "Take" stood on screen to the end card)
    if (t.role === STONE) return !this.s.stats.tookStoneRound && this.s.ending.open;
    // his note under the cases goes the same way: no "Read" stands under the fire and the last lines
    if (t.role === READABLE && this.stoneNotes.has(t.id)) return this.s.ending.open;
    return true;
  }
  /** a locker starts to offer a round: it opens, the round shows, it chimes */
  private offer(t: Thing): void {
    if (t.offering) return;
    t.offering = true;
    if (!t.live) return;
    const { s } = this;
    this.syncThing(t);
    const open = this.clipOf(this.instOf(t), 'open');
    if (open) s.playClip(this.instOf(t), open);
    s.cue('locker_open', t.x, t.y, t.z);
    s.cue('locker_chime', t.x, t.y, t.z);
  }
  private isBay(t: Thing): boolean { return typeof t.marker.params.rule === 'string' && typeof t.marker.params.hint === 'string'; }
  private isBore(t: Thing): boolean { return typeof t.marker.params.rule === 'string' && t.marker.params.hint === undefined; }
  private stockBore(): void {
    // once per attempt at phase 2: it opens with the guard set
    for (const t of this.things) if (t.role === LOCKER && this.isBore(t) && !t.used) this.offer(t);
  }
  onProvingSolved(): void {
    this.bayBonus = true;
    for (const t of this.things) if (t.role === LOCKER && this.isBay(t)) { t.offering = false; this.offer(t); }
  }
  private use(t: Thing): void {
    const { s } = this;
    const pl = s.ctx.player;
    if (t.role === AMMO) {
      const boss = t.marker.params.bossRoom === true;
      if (boss) { pl.giveLead(paramNumber(t.marker, 'gives', 6), 0); t.cooldown = paramNumber(t.marker, 'cooldownSeconds', 20); } else pl.giveLead(0, BOX_FLOOR);
      const clip = this.clipOf(this.instOf(t), 'dispense');
      if (clip) s.playClip(this.instOf(t), clip);
      s.cue('dispense', t.x, t.y, t.z);
      this.syncThing(t);
    } else if (t.role === LOCKER) {
      if (pl.giveLineRounds(1) < 1) return;                       // she carries two: it stays in the slot
      t.offering = false;
      if (this.isBay(t)) { if (this.bayBonus && s.puzzles.proving_line.view.solved) { this.bayBonus = false; t.used = true; } this.hintNeed('did_line'); } else t.used = true;
      this.syncThing(t);
      const close = this.clipOf(this.instOf(t), 'close');
      if (close) s.playClip(this.instOf(t), close);
    } else if (t.role === READABLE) {
      const key = paramString(t.marker, 'readable');
      s.flags.add(t.readFlag);
      this.openKey = key; this.openThing = t;
      this.readablePayload.key = key;
      s.ctx.events.emit('readable/opened', this.readablePayload);
      // UI shows the viewer and asks for 'playing' when it is closed (ARCHITECTURE 3.5)
      if (!s.ctx.state.request('paused', 'readable', 'readable') && this.openKey === key) { this.openKey = ''; this.openThing = null; }
    } else if (t.role === RIDE) s.rides.start(t.id);
    else if (t.role === STONE) {
      const token = s.build.token(t.id);
      if (token >= 0) s.build.instShow(token, false);
      s.ending.take();
    }
    this.did('did_interact');
  }
  private onGameState(from: string): void {
    const { s } = this;
    if (from !== 'paused' || this.openKey === '' || s.ctx.state.pauseReason !== 'readable') return;
    const key = this.openKey, t = this.openThing;
    this.openKey = ''; this.openThing = null;
    this.readablePayload.key = key;
    s.ctx.events.emit('readable/closed', this.readablePayload);
    if (!t) return;
    // what she has just read is told next, in its order (polish round 4: the proving plate's three lines, the first
    // statement of what the seventh round is, waited behind the bay's own and played half a minute and a fight later)
    const then = paramString(t.marker, 'thenLine');
    if (then !== '') s.story.sayFront(then);
    s.story.sayFrontAll(paramList(t.marker, 'lines'));
  }

  // ---- focus ----------------------------------------------------------------------------------------
  setKeptFocus(mark: MarkerId | ''): void { this.keptMark = mark; }
  private setFocus(t: Thing | null, kept: boolean): void {
    if (t === this.focus && kept === this.focusKept) return;
    this.focus = t; this.focusKept = kept;
    const p = this.focusPayload;
    if (kept) { p.id = this.keptMark; p.prompt = 'ui_prompt_kept'; p.kind = 'kept'; }
    else if (t) { p.id = t.id; p.prompt = t.prompt; p.kind = t.kind; }
    else { p.id = ''; p.prompt = ''; p.kind = ''; }
    this.s.ctx.events.emit('interact/focus', p);
  }
  private tickFocus(): void {
    const { s } = this;
    const { collision, player, input } = s.ctx;
    if (s.rides.riding) { this.setFocus(null, false); return; }
    if (this.keptMark !== '') { this.setFocus(null, true); return; }
    const p = player.position, f = player.forward;
    const ex = p.x, ey = p.y + PLAYER_EYE, ez = p.z;
    let best: Thing | null = null, bestD = Infinity;
    const hit = this.hit;
    const got = collision.raycast(ex, ey, ez, f.x, f.y, f.z, PROMPT_RANGE, LAYER_FOCUS, hit);
    if (got && hit.layer === Layer.INTERACT && hit.entity) {
      const t = this.byEntity.get(hit.entity.id);
      if (t && t.live && this.available(t)) { best = t; bestD = hit.distance; }
    }
    if (!best) {
      // the ray missed: the nearest thing inside the cone and the range, with a clear line to it
      for (let i = 0; i < this.things.length; i++) {
        const t = this.things[i] as Thing;
        if (!t.live) continue;
        const dx = t.x - ex, dy = t.y - ey, dz = t.z - ez;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > PROMPT_RANGE || d >= bestD) continue;
        if (d > 1e-3 && (dx * f.x + dy * f.y + dz * f.z) / d < CONE_COS) continue;
        if (!this.available(t)) continue;
        if (!collision.lineOfSight(ex, ey, ez, t.x, t.y, t.z, 0)) continue;
        best = t; bestD = d;
      }
    }
    // the round on the stone and the note beside it: the one she is looking at (the round is for good, so a look that
    // falls between the two offers the note until it has been opened once)
    const pair = best && best.beside ? best : best && best.role === READABLE && this.stoneNotes.has(best.id) ? this.roundBeside(best) : null;
    if (best && pair && pair.beside) {
      const note = pair.beside;
      const aRound = this.offAxis(pair, ex, ey, ez, f.x, f.y, f.z), aNote = this.offAxis(note, ex, ey, ez, f.x, f.y, f.z);
      // (the one the ray or the cone found is in reach already; the other is asked for, its sight line taken a little
      // above the stone: the round's own point lies in the stone's top face)
      const noteOk = best === note || this.inReach(note, ex, ey, ez, f.x, f.y, f.z), roundOk = best === pair || this.inReach(pair, ex, ey, ez, f.x, f.y, f.z);
      const unread = !s.flags.has(note.readFlag);
      this.pairDebug[0] = aRound; this.pairDebug[1] = aNote; this.pairDebug[2] = roundOk ? 1 : 0; this.pairDebug[3] = noteOk ? 1 : 0;
      const want = !roundOk ? note : !noteOk ? pair : aNote <= aRound + (unread ? BESIDE_TIE_DEG : -BESIDE_TIE_DEG) ? note : pair;
      if (want !== best && (want === note ? noteOk : roundOk)) {
        best = want;
        const dx = best.x - ex, dy = best.y - ey, dz = best.z - ez;
        bestD = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }
    this.setFocus(best, false);
    // a thing at her feet (a note on a stone) is in reach by the ground distance: the eye is 1.65 m above it
    if (best && best.y < p.y + LOW_THING) { const dx = best.x - ex, dz = best.z - ez; bestD = Math.min(bestD, Math.sqrt(dx * dx + dz * dz)); }
    if (best && bestD <= USE_RANGE && input.pressed('interact')) {
      this.usedPayload.id = best.id; this.usedPayload.kind = best.kind;
      s.ctx.events.emit('interact/used', this.usedPayload);
      this.use(best);
    }
  }

  /** a thing inside the prompt range and the focus cone, with a clear line to it */
  private inReach(r: Thing, ex: number, ey: number, ez: number, fx: number, fy: number, fz: number): boolean {
    if (!r.live || !this.available(r)) return false;
    const dx = r.x - ex, dy = r.y - ey, dz = r.z - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > PROMPT_RANGE || (d > 1e-3 && (dx * fx + dy * fy + dz * fz) / d < CONE_COS)) return false;
    return this.s.ctx.collision.lineOfSight(ex, ey, ez, r.x, r.y + BESIDE_LIFT, r.z, 0);
  }
  /** degrees between her view and the line to a thing */
  private offAxis(r: Thing, ex: number, ey: number, ez: number, fx: number, fy: number, fz: number): number {
    const dx = r.x - ex, dy = r.y - ey, dz = r.z - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return d > 1e-3 ? Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy + dz * fz) / d))) / DEG2RAD : 0;
  }
  /** the round a stone note lies beside */
  private roundBeside(note: Thing): Thing | null {
    for (let i = 0; i < this.things.length; i++) { const t = this.things[i] as Thing; if (t.beside === note) return t; }
    return null;
  }

  // ---- pickups --------------------------------------------------------------------------------------
  private announce(p: Pickup): void {
    const e = this.spawnedPayload;
    e.id = p.id; e.kind = p.kind; e.dropped = p.dropped; e.x = p.x; e.y = p.y; e.z = p.z;
    this.s.ctx.events.emit('pickup/spawned', e);
  }
  private pickupAvailable(p: Pickup): boolean {
    const m = p.marker;
    if (!m) return true;
    const after = paramString(m, 'availableAfter');
    if (after !== '' && !this.s.director.cleared(after as EncounterId)) return false;
    if (m.params.conditional !== undefined && this.s.bossDeaths < MERCY_DEATHS) return false;
    return true;
  }
  private syncPickup(p: Pickup, announce: boolean): void {
    const { s } = this;
    if (!p.live) return;
    p.available = this.pickupAvailable(p);
    const shown = !p.taken && p.available;
    if (p.token >= 0) s.build.instShow(p.token, shown);
    if (shown && announce) this.announce(p);
  }
  spawnPickup(kind: PickupKind, x: number, y: number, z: number): void {
    const { s } = this;
    const asset = s.ctx.data.manifest.bindings.pickup[kind];
    if (!asset || Array.isArray(asset)) return;
    // the oldest drop makes room when all twelve lie about
    let slot: Pickup | null = null;
    const first = this.pickups.length - MAX_DROPS;
    for (let i = 0; i < MAX_DROPS; i++) { const p = this.pickups[first + i] as Pickup; if (p.taken || !p.live) { slot = p; break; } }
    if (!slot) { slot = this.pickups[first + this.dropCursor] as Pickup; this.dropCursor = (this.dropCursor + 1) % MAX_DROPS; }
    if (slot.token >= 0) s.build.instRemove(slot.token);
    slot.kind = kind; slot.zone = s.zone; slot.x = x; slot.y = y; slot.z = z; slot.live = true; slot.taken = false; slot.available = true; slot.retry = 0;
    slot.token = s.ctx.assets.isActive(asset.asset) ? s.build.instAdd(s.zone, asset.asset, asset.node ?? '', x, y, z, 0, 1) : -1;
    this.announce(slot);
  }
  private tickPickups(): void {
    const { s } = this;
    const pos = s.ctx.player.position;
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i] as Pickup;
      if (!p.live || p.taken) continue;
      if (!p.available) { if (this.pickupAvailable(p)) this.syncPickup(p, true); continue; }
      if (p.retry > 0) { p.retry--; continue; }
      const dx = pos.x - p.x, dz = pos.z - p.z, dy = pos.y - p.y;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS || dy > 1.2 || dy < -1.2) continue;
      if (!s.ctx.player.givePickup(p.kind)) { p.retry = PICKUP_RETRY; continue; }       // at the cap, or at full health: it stays lying
      p.taken = true;
      if (p.token >= 0) { if (p.dropped) { s.build.instRemove(p.token); p.token = -1; } else s.build.instShow(p.token, false); }
      const e = this.collectedPayload;
      e.id = p.id; e.kind = p.kind; e.x = p.x; e.y = p.y; e.z = p.z;
      e.amount = p.kind === 'pk_rounds_12' ? 12 : p.kind === 'pk_rounds_6' ? 6 : 1;
      s.ctx.events.emit('pickup/collected', e);
      const line = p.marker ? paramString(p.marker, 'line') : '';
      if (line !== '') s.story.say(line);
    }
  }

  // ---- loose shootables -----------------------------------------------------------------------------
  private syncLoose(l: Loose): void {
    const { s } = this;
    if (l.role === KNOT) {
      const inst = s.build.instance(l.marker.id);
      const node = inst ? s.ctx.data.manifest.assets[inst.id]?.nodes[0] : undefined;
      if (inst && node) inst.node(node).visible = !l.done;
    } else if (l.role === ROPE) {
      const inst = s.build.instance(l.marker.id);
      const clip = this.clipOf(inst, '');
      if (clip) s.poseClip(inst, clip, l.done ? 1 : 0);
    }
    if (l.role !== BORE) l.shot.enable(s, !l.done);
  }
  private found(id: SecretId): void {
    const { s } = this;
    if (s.stats.secrets.includes(id)) return;
    s.stats.secrets.push(id);
    this.secretPayload.id = id;
    s.ctx.events.emit('secret/found', this.secretPayload);
  }
  private burstKnot(l: Loose, announce: boolean): void {
    const { s } = this;
    if (l.done) return;
    l.done = true;
    if (l.outlined) { l.outlined = false; s.ctx.render.setOutline(null); }
    const m = l.marker;
    s.setFlag('burst:' + m.id, true);
    this.syncLoose(l);
    const door = paramString(m, 'opens');
    if (door !== '') s.doors.open(door, !announce);
    // the objective is the run's state, not a line: it is set on the debug path too
    s.story.setObjective(paramString(m, 'objective'));
    if (!announce) return;
    s.knotBurst(m.id, false, l.shot.x, l.shot.y, l.shot.z);
    s.story.sayFrontAll(paramList(m, 'lines'));                          // on the event: the knot she has just shot
    const enc = paramString(m, 'startsEncounter');
    if (enc !== '') s.director.start(enc as EncounterId);
  }
  onShot(shot: Shot, _hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    const { s } = this;
    const l = this.loose[shot.index] as Loose;
    const m = l.marker;
    const ammo = damage.ammo ?? 'lead_round';
    const line = ammo === 'line_round';
    out.outcome = 'broke'; out.stops = true; out.stopsLine = false;
    if (l.role === KNOT) {
      // A knot that starts a fight holds while another fight is live: it rings and stays whole (one encounter at a
      // time: a second fight begun inside the first could be saved half-started by the first one's checkpoint).
      if (paramString(m, 'startsEncounter') !== '' && s.director.live) {
        out.outcome = 'impact'; out.stopsLine = true;
        s.shootableHit(m.id, 'knot', 0, ammo, shot.x, shot.y, shot.z);
        return;
      }
      this.burstKnot(l, true);
      return;
    }
    if (l.role === BORE) {
      // lead down the bore rings flat; a line round is short of the bottom (GDD 6.4): neither proves it
      out.outcome = 'impact'; out.stopsLine = true;
      s.shootableHit(m.id, 'bore', 0, ammo, shot.x, shot.y, shot.z);
      if (line) { s.story.say(namedLine(m, 'lines', 'line')); return; }
      const phase = s.ctx.enemies.boss.phase;
      if (this.boreSaid !== phase) { this.boreSaid = phase; s.story.say(namedLine(m, 'lines', 'lead')); }
      return;
    }
    const inst = s.build.instance(m.id);
    if (l.role === ROPE) {
      l.done = true;
      const clip = this.clipOf(inst, '');
      if (clip) s.playClip(inst, clip);
      l.shot.enable(s, false);
      s.shootableHit(m.id, 'rope', 0, ammo, shot.x, shot.y, shot.z);
      // the bell falls, rings, and knocks the loft ladder down: its ramp collider comes on
      const solid = paramString(m, 'drops');
      if (solid !== '') { s.setFlag('enabled:' + solid, true); s.ctx.collision.setSolidEnabled(solid, true); }
      const secret = paramString(m, 'secret');
      if (secret !== '') this.found(secret as SecretId);
      return;
    }
    // the yard bell and the range plates ring
    const clip = this.clipOf(inst, 'ring');
    if (clip) s.playClip(inst, clip);
    s.shootableHit(m.id, l.role === PLATE ? 'range_plate' : 'bell', paramNumber(m, 'scaleDegree', 0), ammo, shot.x, shot.y, shot.z);
    if (l.role === PLATE) out.stops = !line;
  }
  /** GDD 14: a knot left alone is nudged ("T2 at 60 s: hint_yard_knot") while she stands near it out of combat */
  private tickKnotHints(): void {
    const { s } = this;
    const p = s.ctx.player.position;
    for (let i = 0; i < this.loose.length; i++) {
      const l = this.loose[i] as Loose;
      if (l.role !== KNOT || l.done || l.shot.volume < 0) continue;
      const hint = l.marker.params.hint as { T2?: string; atSeconds?: number } | undefined;
      if (!hint || !hint.T2) continue;
      const dx = p.x - l.shot.x, dz = p.z - l.shot.z;
      if (dx * dx + dz * dz > 144 || s.director.live) continue;
      l.idle += FIXED_DT;
      if (l.idle < (l.nudges === 0 ? (hint.atSeconds ?? 60) : KNOT_PULSE_EVERY)) continue;
      l.idle = 0;
      if (!s.hintsOn()) continue;
      // the line once; after that the knot itself is pointed at (a glint and an outline pulse), not the line again
      if (l.nudges++ === 0) { s.story.say(hint.T2); continue; }
      s.glint(l.shot.x, l.shot.y, l.shot.z, 2.5);
      const inst = s.build.instance(l.marker.id);
      s.ctx.render.setOutline(inst ? inst.root : s.build.anchor(l.marker.id));
      l.outlined = true;
    }
  }

  // ---- look targets (the cradle) --------------------------------------------------------------------
  private tickLooks(): void {
    const { s } = this;
    const p = s.ctx.player.position;
    for (let i = 0; i < this.looks.length; i++) {
      const l = this.looks[i] as Look;
      if (s.flags.has(l.flag) || !s.build.isBuilt(l.marker.zone)) continue;
      const range = paramNumber(l.marker, 'lookRange', 4);
      const dx = l.x - p.x, dy = l.y - (p.y + PLAYER_EYE), dz = l.z - p.z;
      const seen = dx * dx + dy * dy + dz * dz <= range * range && s.lookCos(l.x, l.y, l.z) >= CONE_COS
        && s.ctx.collision.lineOfSight(p.x, p.y + PLAYER_EYE, p.z, l.x, l.y, l.z, 0);
      l.timer = seen ? l.timer + FIXED_DT : 0;
      if (l.timer < paramNumber(l.marker, 'lookSeconds', 0.5)) continue;
      s.flags.add(l.flag);
      for (const key of paramList(l.marker, 'lines')) s.story.say(key);
    }
  }

  // ---- lazy key hints -------------------------------------------------------------------------------
  private did(flag: string): void {
    const { s } = this;
    if (s.flags.has(flag)) return;
    s.flags.add(flag);
    for (let i = 0; i < this.hints.length; i++) { const h = this.hints[i] as LazyHint; if (h.flag === flag && h.shown) this.showHint(h, false); }
  }
  private hintNeed(flag: string): void {
    for (let i = 0; i < this.hints.length; i++) { const h = this.hints[i] as LazyHint; if (h.flag === flag) h.needed = true; }
  }
  private showHint(h: LazyHint, show: boolean): void {
    h.shown = show;
    if (show) { h.shownFor = 0; h.shows++; }
    this.hintPayload.key = h.key; this.hintPayload.show = show;
    this.s.ctx.events.emit('ui/hint', this.hintPayload);
  }
  private tickHints(): void {
    const { s } = this;
    const pl = s.ctx.player, p = pl.position;
    // what has been done
    if (!s.flags.has('did_move') && (pl.velocity.x * pl.velocity.x + pl.velocity.z * pl.velocity.z) > 0.25) this.did('did_move');
    if (!s.flags.has('did_sprint') && pl.sprinting) this.did('did_sprint');
    // what is needed
    const h = this.hints;
    (h[0] as LazyHint).needed = true;                                                   // move: from first control
    if (this.firstPuzzleVolume && inVolume(this.firstPuzzleVolume, p.x, p.y, p.z)) (h[1] as LazyHint).needed = true;
    // reload: only after two dry clicks, on the click; it stands RELOAD_HINT_SECONDS and comes back with a later click
    // (three times at most) until she has used the key
    const reload = h[HINT_RELOAD] as LazyHint;
    if (reload.shown) { reload.shownFor += FIXED_DT; if (reload.shownFor >= RELOAD_HINT_SECONDS) { this.showHint(reload, false); reload.needed = false; } }
    if (this.dryNow && this.dryClicks >= 2 && reload.shows < RELOAD_HINT_SHOWS) reload.needed = true;
    this.dryNow = false;
    if (s.needSprint) (h[3] as LazyHint).needed = true;
    const r = this.firstReadable;
    if (r && s.build.isBuilt(r.zone)) { const dx = p.x - r.pos[0], dz = p.z - r.pos[2]; if (dx * dx + dz * dz <= 9 && Math.abs(p.y - r.pos[1]) < 2) (h[4] as LazyHint).needed = true; }
    for (let k = 0; k < h.length; k++) {
      // (the reload hint is looked at last, so the others have stood down on the tick it comes up)
      const i = k < HINT_RELOAD ? k : k === h.length - 1 ? HINT_RELOAD : k + 1;
      const x = h[i] as LazyHint;
      if (s.flags.has(x.flag)) continue;
      // An empty gun comes first (polish round 3: a player who stood still and fired the cylinder dry kept "W A S D to
      // walk" on screen; the UI shows one hint at a time). While the reload hint is up, or due on this tick, every
      // other hint stands down; it comes back when the reload hint has gone.
      if (i !== HINT_RELOAD && (reload.shown || (reload.needed && !s.flags.has(reload.flag)))) { if (x.shown) this.showHint(x, false); continue; }
      // the interact prompt already names the key: the hint never stands under it saying the same thing
      const covered = i === HINT_INTERACT && this.focus !== null && !this.focusKept;
      if (x.shown) { if (covered) this.showHint(x, false); continue; }
      if (!x.needed) continue;
      x.timer += FIXED_DT;
      if (covered) continue;
      if (x.immediate || x.timer >= HINT_AFTER) this.showHint(x, true);
    }
  }

  tick(_dt: number): void {
    const { s } = this;
    this.tickFocus();
    this.tickPickups();
    this.tickLooks();
    this.tickKnotHints();
    this.tickHints();
    // out of lead altogether in the boss room: the cartridge points that can give call her (a glint every 2.5 s, their
    // lamps bright) until she has a round again. Nothing is said: the station does not know what she carries.
    const w = s.ctx.player.weapon;
    const empty = w.chambered + w.reserve === 0;
    let pulse = false;
    if (empty) { this.emptyT += FIXED_DT; if (this.emptyT >= EMPTY_PULSE_EVERY) { this.emptyT = 0; pulse = true; } } else this.emptyT = EMPTY_PULSE_EVERY - 0.5;
    for (let i = 0; i < this.things.length; i++) {
      const t = this.things[i] as Thing;
      if (!t.live) continue;
      if (t.role === AMMO && t.marker.params.bossRoom === true) {
        const call = empty && t.cooldown <= 0;
        if (call !== t.calling) { t.calling = call; const lamp = s.build.node(t.id, 'lamp'); if (lamp) s.ctx.render.lamps.setBoost(lamp, call ? EMPTY_LAMP_BOOST : 1); }
        if (call && pulse) s.glint(t.x, t.y + 0.25, t.z, 1.2);
      }
      if (t.role === AMMO && t.cooldown > 0) { t.cooldown -= FIXED_DT; if (t.cooldown <= 0) { t.cooldown = 0; this.syncThing(t); } }
      // the bay locker: a round whenever she holds none and the door is still shut; one more, once, after the solve
      if (t.role === LOCKER && !t.offering && !t.used) {
        if (this.isBay(t)) {
          if (!s.puzzles.proving_line.view.solved && s.ctx.player.weapon.lineRounds === 0) this.offer(t);
        } else if (!this.isBore(t)) this.offer(t);
      }
    }
  }

  reset(): void {
    const { s } = this;
    for (const t of this.things) { t.cooldown = 0; t.offering = false; t.used = false; t.calling = false; this.syncThing(t); }
    this.emptyT = 0;
    for (const p of this.pickups) {
      if (p.dropped) { if (p.token >= 0) s.build.instRemove(p.token); p.token = -1; p.taken = true; p.live = false; continue; }
      p.taken = false; p.retry = 0;
      this.syncPickup(p, false);
    }
    for (const l of this.loose) { l.done = false; l.idle = 0; l.nudges = 0; l.outlined = false; this.syncLoose(l); }
    for (const l of this.looks) l.timer = 0;
    for (const h of this.hints) { if (h.shown) this.showHint(h, false); h.needed = false; h.timer = 0; h.shownFor = 0; h.shows = 0; }
    this.dryClicks = 0; this.dryNow = false; this.bayBonus = false; this.boreSaid = ''; this.openKey = ''; this.openThing = null; this.keptMark = '';
    this.setFocus(null, false);
  }
  capture(save: WorldSave): void {
    for (const p of this.pickups) if (!p.dropped && p.taken) save.pickupsTaken.push(p.id);
    for (const t of this.things) if (t.role === LOCKER && t.used) save.lockersUsed.push(t.id);
  }
  apply(save: Readonly<WorldSave>): void {
    const { s } = this;
    this.reset();
    for (const p of this.pickups) { if (p.dropped) continue; p.taken = save.pickupsTaken.includes(p.id); this.syncPickup(p, !p.taken); }
    for (const t of this.things) {
      if (t.role !== LOCKER) continue;
      t.used = save.lockersUsed.includes(t.id);
      // cp_gallery_baffle restocks the bay locker: its one more round is there again unless a later save holds it used
      if (this.isBay(t) && !t.used && s.puzzles.proving_line.view.solved) { this.bayBonus = true; t.offering = true; }
      this.syncThing(t);
    }
    for (const l of this.loose) {
      l.done = l.role === KNOT ? s.flags.has('burst:' + l.marker.id) : l.role === ROPE ? s.flags.has('enabled:' + paramString(l.marker, 'drops')) : false;
      this.syncLoose(l);
    }
  }
  debug(): Record<string, unknown> {
    return {
      focus: this.focusKept ? this.keptMark : this.focus ? this.focus.id : '',
      pickups: this.pickups.filter((p) => p.live && !p.taken && p.available).length,
      lockers: this.things.filter((t) => t.role === LOCKER && t.offering).map((t) => t.id),
      hints: this.hints.filter((h) => h.shown).map((h) => h.key),
      stone: this.things.filter((t) => t.role === STONE || this.stoneNotes.has(t.id)).map((t) => [t.id, Math.round(t.x * 100) / 100, Math.round(t.y * 100) / 100, Math.round(t.z * 100) / 100, t.live]),
      pair: this.pairDebug.map((v) => Math.round(v * 10) / 10),
    };
  }
}

export function createInteract(s: State): InteractApi { return new Interact(s); }
