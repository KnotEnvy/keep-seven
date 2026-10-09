// src/world/interact.ts: the focus ray and `interact/*` (ARCHITECTURE 3.5), pickups, refill boxes, line lockers,
// readables (pause and resume), the loose shootables (the yard bell, the range plates, the two knots that are not a
// puzzle's, the loft bell's rope, the bore), look targets (the cradle) and the lazy key hints (GDD 5, 6.4, 6.5, 12.1, 14).
import * as THREE from 'three';
import { ColFlag, FIXED_DT, LAYER_FOCUS, Layer, PLAYER_EYE } from '../core/contracts.ts';
import type {
  AssetInstance, DamageInfo, EncounterId, EntityRef, FxHandle, GameEvents, HitResponse, HitResult, LayoutMarker, MarkerId, PickupKind,
  SecretId, StoryKey, VolumeHandle, WorldSave, ZoneId,
} from '../core/contracts.ts';
import { DEG2RAD } from '../core/math.ts';
import { PUZZLES, Shot, inVolume, namedLine, paramList, paramNumber, paramString } from './internals.ts';
import type { InteractApi, ShotOwner, State } from './internals.ts';
import { URGENT_READ } from './story.ts';

/**
 * GDD 5 said: use range 2.2 m, the prompt from 3.0 m. Pass i3 (story reviewer b, a major: between the two the prompt
 * stood at full strength with its key cap, and `E` did nothing: at the first note of the game, at the bay's locker and
 * at the cradle's note). The prompt never says more than the key does: ONE reach, 3.0 m, for the prompt and for the
 * key (ruling R1; docs/requests/world.md asks for GDD 5 to follow). A 25 degree cone when the ray itself misses.
 */
export const USE_RANGE = 3.0;
const PROMPT_RANGE = USE_RANGE;
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
/**
 * Release pass p0 (the playthrough critic: "nothing in play points at either secret": the end card's "THINGS FOUND
 * 0 of 2" was the first a player heard of them). Two wordless pointers, each gone once its secret is found:
 * the loft bell rings once by itself the first time she is within `BELL_NEAR` metres of it with no fight on (a single
 * note of the bell voice at the bell, its caption `cap_loft_bell`, the bell's own swing if it has one), and at most
 * `BELL_RINGS` times a run, `BELL_AGAIN` seconds apart, while she stays near; and a faint knot-violet glow lies in the
 * foot of the seam of a shut door that a knot holds over a secret (the cold bay), on the side she walks past.
 */
export const BELL_NEAR = 12, BELL_AGAIN = 30, BELL_RINGS = 3;
/**
 * Pass i4 (the playthrough review again: "nothing in play points at the two secrets"; every one of eleven runs ended
 * with none found). The two pointers were there and too faint to be taken for one: the bell rang once from 22 m as she
 * stepped through the gate posts, under the movement card and the town's name line, and the seam's glow was a still
 * smudge at the foot of a door. Now: the bell rings when she is within `BELL_NEAR` = 12 m (under the loft, its open door
 * in view) and a glint stands on it for `BELL_GLINT` seconds with each ring, so the eye finds what the ear heard; and
 * the knot behind a secret's door glints through its inspection slot every `SEAM_GLINT_EVERY` seconds while she is
 * within `SEAM_NEAR` metres out of a fight, and the seam's glow breathes (`SEAM_LOW` to `SEAM_LEVEL`). Wordless, and
 * gone when the secret is found. (A hum for the knot is the audio team's: docs/requests/world.md.)
 */
export const BELL_GLINT = 1.5, SEAM_NEAR = 14, SEAM_GLINT_EVERY = 4, SEAM_GLINT = 1.2, SEAM_LOW = 0.25, SEAM_BREATH = 2.4;
const BELL_CUE = 'step_chime', BELL_GAIN = 0.8, BELL_PITCH = 0.75, BELL_CAPTION = 'cap_loft_bell';
/** the seam's glow: the level of the pooled halo card (0.4 m, additive), and how far out of the door's plane it lies */
export const SEAM_LEVEL = 0.55;
const SEAM_OUT = 0.3, SEAM_UP = 0.06;
interface Ringer { loose: Loose; rings: number; wait: number }
interface Seam { secret: SecretId; zone: ZoneId; x: number; y: number; z: number; card: FxHandle | null; kx: number; ky: number; kz: number; t: number; glints: number }
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
/** the line that names the first note and the case it lies under (story.json; trg_open's second line) */
const CASE_LINE = 'nar_open_2';
/** the mercy tin: after two deaths in the same boss phase (GDD 14) */
const MERCY_DEATHS = 2;
/** a knot left alone: after its one line, a wordless pulse this often */
const KNOT_PULSE_EVERY = 30;
/**
 * a latch knot is "seen" inside this many metres and this cone of her view: its line is said then (polish round 5).
 * Pass i1: 16 m (it was 26). The street's quiet line ("Every door wore the well mark", trg_marks, from 22 m before the
 * yard door) is asked for a second after a knot seen at 26 m, waited behind the knot's 6.5 s line, and was dropped when
 * the fight the knot starts was on by its turn: a player who shot the latch within six seconds never heard it. At 16 m
 * the street's line is on screen first and the knot's follows it.
 */
const KNOT_SEEN = 16, KNOT_SEEN_COS = Math.cos(14 * Math.PI / 180);
/** with no lead at all, a boss-room cartridge point that can give glints this often, its lamp this much brighter */
const EMPTY_PULSE_EVERY = 2.5, EMPTY_LAMP_BOOST = 2.5;

const AMMO = 0, LOCKER = 1, READABLE = 2, RIDE = 3, STONE = 4;
/** index of ui_hint_interact in the lazy hint list */
const HINT_INTERACT = 4;
const HINT_RELOAD = 2, HINT_SPRINT = 3;
/** the reload hint stands this long each time, and is shown at most this often */
export const RELOAD_HINT_SECONDS = 6, RELOAD_HINT_SHOWS = 3;
/**
 * Pass i1 (story reviewer: "R to reload" came up on the second dry click, which is already inside the reload a dry
 * click starts by itself, and stood its six seconds: for 3.7 s it told a player with six in the gun to reload).
 * A pull on an empty cylinder always reloads, so a dry click teaches no key and raises nothing any more. The hint is
 * shown when the key would HELP and nothing is doing it for her: `RELOAD_LOW` rounds or fewer under the hammer, lead in
 * reserve, the gun at rest (no reload running, no shot) for `RELOAD_LOW_SECONDS`. It is taken down the tick a reload
 * opens or the cylinder holds more again, stands `RELOAD_HINT_SECONDS` at most, and is not raised again for
 * `RELOAD_HINT_AGAIN` seconds; three times a run at most, and never once she has used the key.
 */
export const RELOAD_LOW = 2, RELOAD_LOW_SECONDS = 1.5, RELOAD_HINT_AGAIN = 20;
/**
 * Pass i1 (story reviewer: "Hold SHIFT to run" came up on the tick of the movement card with a line on screen, three
 * texts at once, and then stood under the crosshair until she ran: 27 s through six shots and a reload, 56 s for a
 * brisk player, over the jug puzzle). The run hint waits for `SPRINT_QUIET` seconds with no line and no card on
 * screen, no fight on and her outside every puzzle's volume; it stands `SPRINT_HINT_SECONDS`, comes back once after
 * `SPRINT_AGAIN` quiet seconds if she still has not run (`SPRINT_HINT_SHOWS` in all), and is taken down when she walks
 * into a puzzle.
 */
export const SPRINT_QUIET = 3, SPRINT_HINT_SECONDS = 8, SPRINT_AGAIN = 40, SPRINT_HINT_SHOWS = 2;
/**
 * Pass i3 (story reviewer a: narration fills the whole 100 m of the gully, so the quiet the hint waited for came at the
 * gate: it showed 31.3 s in and was withdrawn 0.6 s later as she stepped into the jug puzzle, and that counted as one
 * of its two showings). The hint has a row of its own above the subtitle: once she has WALKED `SPRINT_WALKED` metres
 * since the hint was first owed (the top of the gully) it is shown beside a line, though still never under a movement
 * card, in a fight or in a puzzle. A showing cut short of `SPRINT_SHOWN_MIN` seconds does not count.
 */
export const SPRINT_WALKED = 3, SPRINT_SHOWN_MIN = 2;
/**
 * Pass i4 (story reviewer a: still 16.9 s into play, past the middle of the 100 m gully it is for; the two cards at the
 * mouth of the overhang, 7.5 s of them, held it back). The hint is owed from the mouth of the overhang (`trg_glare`) and
 * is shown once she has walked `SPRINT_WALKED` = 3 metres from there (it was 15), beside a line, and under the movement
 * card ("I. The Lip") too: only the game's own title card keeps a clean frame (`TITLE_CARD`, four seconds). So it is up
 * a little over four seconds after she steps out, with four fifths of the walk ahead. It goes at her first run, and after
 * `SPRINT_HINT_SECONDS` in any case.
 *
 * The fire hint (the playthrough review: "LEFT CLICK TO FIRE" stood from 1.6 s to the end of a 400 s stand at the gate,
 * and on after the gate had opened by itself): it is about the jug gate. It stands `FIRE_HINT_SECONDS`, comes back once
 * `FIRE_AGAIN` seconds later if she still has not fired (`FIRE_HINT_SHOWS` in all), and is taken down when the gate's
 * puzzle is solved or she walks out of its volume.
 */
export const TITLE_CARD = 'card_title';
export const FIRE_HINT_SECONDS = 8, FIRE_AGAIN = 40, FIRE_HINT_SHOWS = 2;
const HINT_FIRE = 1;
/**
 * Pass i1 (both story reviewers: nothing pointed at the first note). The spent case his note lies under glints like
 * the cases on the last stone, every `CASE_GLINT_EVERY` seconds from the line that names it (`CASE_LINE`) until she
 * has opened the note or walked `CASE_GLINT_GONE` metres on.
 */
export const CASE_GLINT_EVERY = 2.5, CASE_GLINT_SECONDS = 0.35, CASE_GLINT_GONE = 14, CASE_GLINT_LIFT = 0.06, CASE_GLINT_LEVEL = 2;
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
interface Loose { marker: LayoutMarker; shot: Shot; role: number; done: boolean; idle: number; nudges: number; outlined: boolean; seenFlag: string }
const KNOT = 0, BELL = 1, PLATE = 2, ROPE = 3, BORE = 4;

class Interact implements InteractApi, ShotOwner {
  private readonly things: Thing[] = [];
  private readonly byEntity = new Map<string, Thing>();
  private readonly pickups: Pickup[] = [];
  private dropCursor = 0;
  private readonly loose: Loose[] = [];
  private readonly looks: Look[] = [];
  /** p0: the secrets' pointers (BELL_NEAR above) */
  private readonly ringers: Ringer[] = [];
  private readonly seams: Seam[] = [];
  private readonly hints: LazyHint[] = [];
  private focus: Thing | null = null;
  private focusKept = false;
  private keptMark: MarkerId | '' = '';
  private openKey: StoryKey = '';
  private openThing: Thing | null = null;
  private emptyT = 0;
  /** a reload is running (weapon/reload: open .. close), whoever started it */
  private reloading = false;
  /** seconds the cylinder has been low with the gun at rest; seconds until the reload hint may be raised again */
  private lowT = 0;
  private reloadRest = 0;
  /** seconds until the run hint may come back */
  private sprintRest = 0;
  /** seconds until the fire hint may come back (FIRE_AGAIN) */
  private fireRest = 0;
  /** metres walked since the run hint was first owed (SPRINT_WALKED) */
  private sprintWalk = 0;
  private readonly puzzleVolumes: LayoutMarker[] = [];
  /** the first note's spent case: seconds to its next glint (-1: not glinting) */
  private caseT = -1;
  private caseCard: FxHandle | null = null;
  private caseLevel = 0;
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
    // ---- p0: what points at the secrets
    for (const l of this.loose) if (l.role === ROPE && paramString(l.marker, 'secret') !== '') this.ringers.push({ loose: l, rings: 0, wait: 0 });
    for (const d of data.markersOfType('door')) {
      const secret = paramString(d, 'secret');
      const knot = data.layout.markers.find((x) => x.params.kind === 'knot' && x.params.opens === d.id);
      if (secret === '' || !knot) continue;
      // the side she walks past is the one away from what the door hides (the secret's own things lie behind it)
      let ix = 0, iz = 0, n = 0;
      for (const x of data.layout.markers) if (x !== d && x !== knot && x.params.secret === secret) { ix += x.pos[0]; iz += x.pos[2]; n++; }
      let ox = 0, oz = -1;
      if (n > 0) { ox = d.pos[0] - ix / n; oz = d.pos[2] - iz / n; }
      // (out of the door's plane only: along the normal of its leaf)
      const yaw = d.rotY * DEG2RAD, nx = Math.sin(yaw), nz = Math.cos(yaw), side = ox * nx + oz * nz >= 0 ? 1 : -1;
      this.seams.push({ secret: secret as SecretId, zone: d.zone, x: d.pos[0] + nx * side * SEAM_OUT, y: d.pos[1] + SEAM_UP, z: d.pos[2] + nz * side * SEAM_OUT, card: null, kx: knot.pos[0], ky: knot.pos[1], kz: knot.pos[2], t: 0, glints: 0 });
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
    events.on('weapon/reload', (e) => {
      if (e.stage === 'open' && s.ctx.input.pressed('reload')) this.did('did_reload');
      this.reloading = e.stage === 'open' || e.stage === 'round';
    });
    for (const m of data.markersOfType('trigger')) if (m.params.puzzle !== undefined && m.params.role === 'volume') this.puzzleVolumes.push(m);
    events.on('story/line', (e) => { if (e.key === CASE_LINE && this.firstReadable && !s.flags.has('read:' + this.firstReadable.id)) this.caseT = 0; });
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
    const l: Loose = { marker: m, shot: new Shot(this, m.id, kind, this.loose.length, m), role, done: false, idle: 0, nudges: 0, outlined: false, seenFlag: 'seen:' + m.id };
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
    this.syncSeams();
  }
  /** p0: a seam glows while its zone is built and its secret is not found */
  private syncSeams(): void {
    const { s } = this;
    for (let i = 0; i < this.seams.length; i++) {
      const m = this.seams[i] as Seam;
      const on = s.build.isBuilt(m.zone) && !s.stats.secrets.includes(m.secret);
      if (on && !m.card) {
        m.card = s.ctx.render.vfx.acquireCard('halo');
        if (m.card) { m.card.setPosition(m.x, m.y, m.z); m.card.setLevel(SEAM_LEVEL); m.card.setVisible(true); }
      } else if (!on && m.card) { m.card.release(); m.card = null; }
    }
  }
  /** p0: the loft bell, once, in the wind */
  private tickRingers(): void {
    const { s } = this;
    const p = s.ctx.player.position;
    for (let i = 0; i < this.ringers.length; i++) {
      const r = this.ringers[i] as Ringer, l = r.loose;
      if (l.done || l.shot.volume < 0 || r.rings >= BELL_RINGS) continue;
      if (r.wait > 0) { r.wait -= FIXED_DT; continue; }
      const dx = p.x - l.shot.x, dz = p.z - l.shot.z;
      if (dx * dx + dz * dz > BELL_NEAR * BELL_NEAR || s.director.live) continue;
      r.rings++; r.wait = BELL_AGAIN;
      s.cue(BELL_CUE, l.shot.x, l.shot.y, l.shot.z, true, BELL_GAIN, BELL_PITCH);
      s.glint(l.shot.x, l.shot.y, l.shot.z, BELL_GLINT);
      s.story.say(BELL_CAPTION);
      const bell = s.build.instance(paramString(l.marker, 'secret'));
      const ring = this.clipOf(bell, 'ring');
      if (ring) s.playClip(bell, ring);
    }
  }
  /** pass i4: a secret's seam breathes and its knot glints through the slot while she is near, out of a fight */
  private tickSeams(): void {
    const { s } = this;
    const p = s.ctx.player.position;
    for (let i = 0; i < this.seams.length; i++) {
      const m = this.seams[i] as Seam;
      if (!m.card) continue;
      const dx = p.x - m.x, dz = p.z - m.z;
      if (dx * dx + dz * dz > SEAM_NEAR * SEAM_NEAR || Math.abs(p.y - m.y) > 4 || s.director.live) { if (m.t !== 0) { m.t = 0; m.card.setLevel(SEAM_LEVEL); } continue; }
      const was = m.t;
      m.t += FIXED_DT;
      m.card.setLevel(SEAM_LOW + (SEAM_LEVEL - SEAM_LOW) * (0.5 - 0.5 * Math.cos((m.t / SEAM_BREATH) * Math.PI * 2)));
      if (Math.floor(m.t / SEAM_GLINT_EVERY) !== Math.floor(was / SEAM_GLINT_EVERY) || was === 0) { m.glints++; s.glint(m.kx, m.ky, m.kz, SEAM_GLINT); }
    }
  }
  detach(zone: ZoneId): void {
    const { s } = this;
    const col = s.ctx.collision;
    for (const m of this.seams) if (m.zone === zone && m.card) { m.card.release(); m.card = null; }
    if (this.firstReadable && this.firstReadable.zone === zone) this.endCase();
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
    this.syncSeams();
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
      const dx = p.x - l.shot.x, dz = p.z - l.shot.z;
      const d2 = dx * dx + dz * dz;
      // Polish round 5 (story critic: the latch knot's line was said after the door it held had burst open): a knot
      // on a latch is described the first time she looks at it from near, out of a fight; the burst still says it
      // if she shot first (and the director drops it there if it cannot start at once)
      if (d2 <= KNOT_SEEN * KNOT_SEEN && !s.director.live && l.marker.params.opens !== undefined && !s.flags.has(l.seenFlag)
        && s.lookCos(l.shot.x, l.shot.y, l.shot.z) >= KNOT_SEEN_COS) {
        s.flags.add(l.seenFlag);
        const lines = paramList(l.marker, 'lines');
        // what she is looking at: next in line (pass i1: over a room line once that line has been read, URGENT_READ: a
        // player who shot the latch while the street's line was still up lost the knot's, the first said of any knot)
        if (lines.length > 0) s.story.sayUrgent(lines[0] as string, URGENT_READ);
        for (let k = 1; k < lines.length; k++) s.story.sayFront(lines[k] as string);
      }
      const hint = l.marker.params.hint as { T2?: string; atSeconds?: number } | undefined;
      if (!hint || !hint.T2) continue;
      if (d2 > 144 || s.director.live) continue;
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
    // fire (pass i4, FIRE_HINT_SECONDS above): at the jug gate while it is shut; eight seconds, once more, then never
    const fire = h[HINT_FIRE] as LazyHint;
    const atGate = this.firstPuzzleVolume !== undefined && inVolume(this.firstPuzzleVolume, p.x, p.y, p.z) && !s.puzzles[PUZZLES[0] as (typeof PUZZLES)[number]].view.solved;
    if (fire.shown) {
      fire.shownFor += FIXED_DT;
      if (!atGate || fire.shownFor >= FIRE_HINT_SECONDS) { this.showHint(fire, false); fire.needed = false; fire.timer = 0; this.fireRest = FIRE_AGAIN; }
    } else if (atGate && fire.shows < FIRE_HINT_SHOWS && !s.flags.has(fire.flag)) {
      // (after its rest the hint is due at once: the four seconds it first waits have long been waited)
      if (this.fireRest > 0) { this.fireRest -= FIXED_DT; fire.needed = false; fire.timer = this.fireRest > 0 ? 0 : HINT_AFTER; } else fire.needed = true;
    } else { fire.needed = false; fire.timer = 0; }
    // reload (pass i1, RELOAD_LOW above): when the key would help and no reload is running
    const reload = h[HINT_RELOAD] as LazyHint;
    const w = pl.weapon;
    const busy = this.reloading || w.phase !== 'ready';
    const low = w.chambered <= RELOAD_LOW && w.reserve > 0 && !busy;
    if (this.reloadRest > 0) this.reloadRest -= FIXED_DT;
    if (reload.shown) {
      reload.shownFor += FIXED_DT;
      if (!low || reload.shownFor >= RELOAD_HINT_SECONDS) { this.showHint(reload, false); reload.needed = false; this.lowT = 0; this.reloadRest = RELOAD_HINT_AGAIN; }
    } else if (low && reload.shows < RELOAD_HINT_SHOWS && this.reloadRest <= 0 && s.playing) {
      this.lowT += FIXED_DT;
      reload.needed = this.lowT >= RELOAD_LOW_SECONDS;
    } else { this.lowT = 0; reload.needed = false; }
    // run (pass i1, SPRINT_QUIET above): a quiet moment on open ground, for a while, twice at most
    const sprint = h[HINT_SPRINT] as LazyHint;
    let inPuzzle = false;
    for (let i = 0; i < this.puzzleVolumes.length && !inPuzzle; i++) inPuzzle = inVolume(this.puzzleVolumes[i] as LayoutMarker, p.x, p.y, p.z);
    // (pass i3, SPRINT_WALKED: after fifteen metres at a walk the hint no longer waits for the narrator to fall silent)
    if (s.needSprint && !s.flags.has(sprint.flag) && this.sprintWalk < SPRINT_WALKED) this.sprintWalk += Math.sqrt(pl.velocity.x * pl.velocity.x + pl.velocity.z * pl.velocity.z) * FIXED_DT;
    const walked = this.sprintWalk >= SPRINT_WALKED;
    // (pass i4: the game's title card alone keeps the hint back; a movement card does not)
    const titled = s.story.cardUp && (s.story.cardKey === '' || s.story.cardKey === TITLE_CARD);
    const open = !titled && !s.director.live && !inPuzzle;
    const quiet = open && !s.story.cardUp && s.story.current === '';
    if (sprint.shown) {
      sprint.shownFor += FIXED_DT;
      if (inPuzzle || sprint.shownFor >= SPRINT_HINT_SECONDS) {
        // a showing she could not have read is not one of the two, and comes back at the next open moment
        const brief = sprint.shownFor < SPRINT_SHOWN_MIN;
        this.showHint(sprint, false); sprint.needed = false; sprint.timer = 0; this.sprintRest = brief ? 0 : SPRINT_AGAIN;
        if (brief && sprint.shows > 0) sprint.shows--;
      }
    } else if (s.needSprint && sprint.shows < SPRINT_HINT_SHOWS && !s.flags.has(sprint.flag)) {
      // (the loop below shows it at HINT_AFTER: the timer is held at what is left of the quiet it still has to wait for)
      if (this.sprintRest > 0) { if (open) this.sprintRest -= FIXED_DT; sprint.needed = false; sprint.timer = HINT_AFTER - SPRINT_QUIET; }
      else if (walked && open) { sprint.needed = true; sprint.timer = HINT_AFTER; }
      else if (!quiet) { sprint.needed = false; sprint.timer = HINT_AFTER - SPRINT_QUIET; }
      else sprint.needed = true;
    } else sprint.needed = false;
    const r = this.firstReadable;
    if (r && s.build.isBuilt(r.zone)) {
      const dx = p.x - r.pos[0], dz = p.z - r.pos[2];
      const near = dx * dx + dz * dz <= 9 && Math.abs(p.y - r.pos[1]) < 2;
      const hint = h[HINT_INTERACT] as LazyHint;
      if (near) hint.needed = true;
      // Pass i1 (cross-cutting fixer): the first note now lies beside the way out of the overhang (design/layout.json
      // prop_camp_one), so everybody passes within 3 m of it. The hint is about the note she stands at: once she has
      // walked on without it the hint is taken back (it was raised for good, and came up four seconds later wherever
      // she was by then, to stay until she used the key on something).
      else if (hint.needed && !s.flags.has(hint.flag)) { hint.needed = false; hint.timer = 0; if (hint.shown) this.showHint(hint, false); }
    }
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

  /** pass i1: the brass of the spent case over the first note (CASE_GLINT_EVERY above): the star the last stone's cases have */
  private tickCase(): void {
    if (this.caseT < 0) return;
    const { s } = this;
    const r = this.firstReadable;
    let on = r !== undefined && s.build.isBuilt(r.zone) && !s.flags.has('read:' + r.id);
    if (on && r) { const p = s.ctx.player.position, dx = p.x - r.pos[0], dz = p.z - r.pos[2]; on = dx * dx + dz * dz <= CASE_GLINT_GONE * CASE_GLINT_GONE; }
    if (!on || !r) { this.endCase(); return; }
    if (!this.caseCard) {
      this.caseCard = s.ctx.render.vfx.acquireCard('aim_star');
      if (this.caseCard) { this.caseCard.setPosition(r.pos[0], r.pos[1] + CASE_GLINT_LIFT, r.pos[2]); this.caseCard.setLevel(0); this.caseCard.setVisible(true); }
    }
    this.caseT += FIXED_DT;
    if (this.caseT >= CASE_GLINT_EVERY) this.caseT = 0;
    const level = this.caseT < CASE_GLINT_SECONDS ? CASE_GLINT_LEVEL : 0;
    if (level !== this.caseLevel) { this.caseLevel = level; if (this.caseCard) this.caseCard.setLevel(level); }
  }
  private endCase(): void {
    this.caseT = -1; this.caseLevel = 0;
    if (this.caseCard) { this.caseCard.release(); this.caseCard = null; }
  }

  tick(_dt: number): void {
    const { s } = this;
    this.tickFocus();
    this.tickPickups();
    this.tickLooks();
    this.tickKnotHints();
    this.tickRingers();
    this.tickSeams();
    this.tickHints();
    this.tickCase();
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
    for (const r of this.ringers) { r.rings = 0; r.wait = 0; }
    this.syncSeams();
    for (const h of this.hints) { if (h.shown) this.showHint(h, false); h.needed = false; h.timer = 0; h.shownFor = 0; h.shows = 0; }
    this.reloading = false; this.lowT = 0; this.reloadRest = 0; this.sprintRest = 0; this.sprintWalk = 0; this.fireRest = 0; this.endCase(); this.bayBonus = false; this.boreSaid = ''; this.openKey = ''; this.openThing = null; this.keptMark = '';
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
    this.syncSeams();                                     // (the stats of the save are in place: checkpoints.applySave)
  }
  debug(): Record<string, unknown> {
    return {
      focus: this.focusKept ? this.keptMark : this.focus ? this.focus.id : '',
      pickups: this.pickups.filter((p) => p.live && !p.taken && p.available).length,
      lockers: this.things.filter((t) => t.role === LOCKER && t.offering).map((t) => t.id),
      hints: this.hints.filter((h) => h.shown).map((h) => h.key), caseGlint: this.caseT >= 0,
      stone: this.things.filter((t) => t.role === STONE || this.stoneNotes.has(t.id)).map((t) => [t.id, Math.round(t.x * 100) / 100, Math.round(t.y * 100) / 100, Math.round(t.z * 100) / 100, t.live]),
      pair: this.pairDebug.map((v) => Math.round(v * 10) / 10),
      bell: this.ringers.map((r) => r.rings), seams: this.seams.map((m) => [m.secret, m.card !== null, Math.round(m.x * 100) / 100, Math.round(m.y * 100) / 100, Math.round(m.z * 100) / 100, m.glints]),
    };
  }
}

export function createInteract(s: State): InteractApi { return new Interact(s); }
