// sandbox/player: the real `player` system beside the core stubs (docs/ARCHITECTURE.md section 12; code-player order 5).
//   ?scene=course  the feel course: flat run, 30 / 45 / 60 degree ramps, 0.2 / 0.35 / 0.5 m steps, a 2 m gap, a low ceiling
//   ?scene=range   a firing range: one dummy receiver per HitOutcome, five PIERCE plates with a body behind, a grille, every surface
//   ?scene=kept    a kept-round mark ring and the bore volume of the layout's `bore_opening`, with the legal-aim state shown
//   ?scene=layout  the real level greybox, in play at cp_lip_start
//   ?test=1        no real-time loop: drive it through window.__dbg     F3 / ?perf=1  the perf overlay
// `__dbg.ext.range.*` builds dummies and marks from a test, so a test does not depend on a scene of this page.
import * as THREE from 'three';
import { ColFlag, Layer } from '../src/core/contracts.ts';
import type {
  DamageInfo, DamageKind, DamageSource, EntityKind, GameContext, HitOutcome, HitPart, HitReceiver, HitResponse, KeptContext, SurfaceType, VolumeHandle,
} from '../src/core/contracts.ts';
import { ROOM_ORIGIN, createSandbox } from '../src/core/sandbox.ts';
import type { RoomSolid, Sandbox } from '../src/core/sandbox.ts';
import { createPlayerSystem } from '../src/player/index.ts';

const OX = ROOM_ORIGIN[0], OY = ROOM_ORIGIN[1], OZ = ROOM_ORIGIN[2];
const OUTCOMES: readonly HitOutcome[] = ['impact', 'hit', 'weak', 'kill', 'freed', 'deflected', 'broke', 'parried', 'passed'];
const SURFACES: readonly Exclude<SurfaceType, 'none'>[] = ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth'];
const DAMAGE_KINDS: readonly DamageKind[] = ['bullet', 'lunge', 'stake', 'slam', 'charge', 'canister', 'lance', 'fan', 'kill_volume'];
const CLIPS = ['idle', 'sprint', 'draw', 'fire', 'dry_fire', 'reload_open', 'reload_round', 'reload_close', 'reload_fast_close', 'load_line', 'unload_line', 'load_kept', 'unload_kept', 'fire_kept', 'take_round'] as const;
const OUTCOME_COLOUR: Record<HitOutcome, number> = { impact: 0x8a8378, hit: 0xd9c9a0, weak: 0xffe08a, kill: 0xc9603a, freed: 0x7cf2e2, deflected: 0x6f7f88, broke: 0xb98cd9, parried: 0xe9a23b, passed: 0x4a5560 };
/** what each outcome's dummy is, so `combat/line_resolved` has bodies and knots to count */
const OUTCOME_KIND: Record<HitOutcome, EntityKind> = { impact: 'range_plate', hit: 'transit', weak: 'tamper', kill: 'bider', freed: 'bider', deflected: 'tamper', broke: 'knot', parried: 'stake', passed: 'bider' };
const OUTCOME_PART: Record<HitOutcome, HitPart> = { impact: 'whole', hit: 'body', weak: 'vent_chest', kill: 'body', freed: 'crown', deflected: 'plate', broke: 'knot', parried: 'whole', passed: 'body' };

const wall = (x: number, z: number, w: number, d: number, h = 5, surface: RoomSolid['surface'] = 'adobe'): RoomSolid => ({ shape: 'box', pos: [x, h / 2 - 0.5, z], size: [w, h, d], rotY: 0, surface, role: 'wall' });
const ROOM_SHELL = (half: number): RoomSolid[] => [
  { shape: 'box', pos: [0, -0.5, 0], size: [half * 2, 1, half * 2], rotY: 0, surface: 'stone', role: 'floor' },
  wall(0, -half - 0.5, half * 2 + 2, 1), wall(0, half + 0.5, half * 2 + 2, 1), wall(-half - 0.5, 0, 1, half * 2), wall(half + 0.5, 0, 1, half * 2),
];
const ramp = (x: number, deg: number): RoomSolid[] => {
  const run = 4, rise = run * Math.tan((deg * Math.PI) / 180);
  return [
    { shape: 'ramp', pos: [x, rise / 2, -6 - run / 2], size: [3, rise, run], rotY: 0, surface: 'wood', role: 'stairs', rise: '-z', skirt: 0 },
    { shape: 'box', pos: [x, rise / 2, -10 - 2], size: [3, rise, 4], rotY: 0, surface: 'wood', role: 'platform' },
  ];
};
const COURSE: RoomSolid[] = [
  ...ROOM_SHELL(30),
  ...ramp(-12, 30), ...ramp(-8, 45), ...ramp(-4, 60),
  { shape: 'box', pos: [2, 0.1, -8], size: [2, 0.2, 4], rotY: 0, surface: 'metal', role: 'platform' },
  { shape: 'box', pos: [5, 0.175, -8], size: [2, 0.35, 4], rotY: 0, surface: 'metal', role: 'platform' },
  { shape: 'box', pos: [8, 0.25, -8], size: [2, 0.5, 4], rotY: 0, surface: 'metal', role: 'platform' },
  // a 2 m gap between two 0.6 m platforms, reached by a ramp
  { shape: 'ramp', pos: [14, 0.3, -3], size: [3, 0.6, 2], rotY: 0, surface: 'wood', role: 'stairs', rise: '-z', skirt: 0 },
  { shape: 'box', pos: [14, 0.3, -6], size: [3, 0.6, 4], rotY: 0, surface: 'stone', role: 'platform' },
  { shape: 'box', pos: [14, 0.3, -12], size: [3, 0.6, 4], rotY: 0, surface: 'stone', role: 'platform' },
  // a low ceiling: 1.9 m of headroom (she walks under it and cannot jump there)
  { shape: 'box', pos: [20, 2.05, -8], size: [4, 0.3, 8], rotY: 0, surface: 'stone', role: 'ceiling' },
  // cover as in the layout: 0.9 m (mountable by a jump), 1.2 m and 1.3 m (not)
  { shape: 'box', pos: [-18, 0.45, -8], size: [2, 0.9, 2], rotY: 0, surface: 'wood', role: 'cover', low: true },
  { shape: 'box', pos: [-22, 0.6, -8], size: [2, 1.2, 2], rotY: 0, surface: 'wood', role: 'cover', low: true },
  { shape: 'box', pos: [-26, 0.65, -8], size: [2, 1.3, 2], rotY: 20, surface: 'ceramic', role: 'cover', low: true },
];
const RANGE: RoomSolid[] = [
  ...ROOM_SHELL(20),
  // five PIERCE plates in a row, 1 m apart
  ...[0, 1, 2, 3, 4].map((i): RoomSolid => ({ id: `plate_${i}`, shape: 'box', pos: [12, 1, -6 - i], size: [1.6, 2, 0.08], rotY: 0, surface: 'ceramic', role: 'cover', pierce: true })),
  { id: 'grille', shape: 'box', pos: [-12, 1, -8], size: [2, 2, 0.08], rotY: 0, surface: 'metal', role: 'cover', grille: true },
  ...SURFACES.map((surface, i): RoomSolid => ({ id: `patch_${surface}`, shape: 'box', pos: [-6 + i * 2, 1, -16], size: [1.6, 2, 0.4], rotY: 0, surface, role: 'cover' })),
];

/** A hit volume whose receiver answers one fixed outcome: what the player's shot code relies on from every receiver. */
class Dummy implements HitReceiver {
  hits = 0;
  lastAmount = 0;
  lastAmmo = '';
  readonly handle: VolumeHandle;
  readonly mesh: THREE.Mesh;
  constructor(ctx: GameContext, readonly id: string, readonly outcome: HitOutcome, x: number, y: number, z: number, radius: number, private readonly stopsLine: boolean, kind: EntityKind, part: HitPart, group: THREE.Group) {
    this.handle = ctx.collision.addVolume({
      shape: 'sphere', layer: kind === 'knot' || kind === 'range_plate' ? Layer.SHOOTABLE : kind === 'stake' ? Layer.PROJECTILE : Layer.ENEMY,
      flags: ColFlag.NONE, surface: outcome === 'deflected' ? 'metal' : 'cloth', entity: { id, kind }, part, priority: 0, receiver: this,
    });
    ctx.collision.setSphere(this.handle, x, y, z, radius);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), new THREE.MeshBasicMaterial({ color: OUTCOME_COLOUR[outcome] }));
    this.mesh.position.set(x, y, z);
    this.mesh.name = id;
    group.add(this.mesh);
  }
  onHit(_hit: unknown, damage: Readonly<DamageInfo>, out: HitResponse): void {
    this.hits++;
    this.lastAmount = damage.amount; this.lastAmmo = damage.ammo ?? '';
    out.outcome = this.outcome;
    out.stops = this.outcome !== 'passed';
    out.stopsLine = this.stopsLine;
    out.damageDealt = this.outcome === 'hit' || this.outcome === 'weak' || this.outcome === 'kill' || this.outcome === 'freed' ? damage.amount : 0;
    out.healthLeft = this.outcome === 'hit' || this.outcome === 'weak' ? 100 : 0;
  }
}

class Range {
  readonly group = new THREE.Group();
  readonly dummies = new Map<string, Dummy>();
  private readonly marks: KeptContext[] = [];
  private bore: THREE.Mesh | null = null;
  private onMark = '';
  constructor(private readonly sb: Sandbox) {
    this.group.name = 'sandbox_range';
    sb.ctx.scene.dynamic.add(this.group);
  }
  /** room coordinates */
  dummy(id: string, outcome: HitOutcome, x: number, y: number, z: number, options: { radius?: number; stopsLine?: boolean; kind?: EntityKind; part?: HitPart } = {}): string {
    const d = new Dummy(this.sb.ctx, id, outcome, x + OX, y + OY, z + OZ, options.radius ?? 0.4, options.stopsLine === true, options.kind ?? OUTCOME_KIND[outcome], options.part ?? OUTCOME_PART[outcome], this.group);
    this.dummies.set(id, d);
    return id;
  }
  remove(id: string): void {
    const d = this.dummies.get(id);
    if (!d) return;
    this.sb.ctx.collision.removeVolume(d.handle);
    d.mesh.removeFromParent();
    this.dummies.delete(id);
  }
  disable(id: string): void { const d = this.dummies.get(id); if (d) this.sb.ctx.collision.setVolumeEnabled(d.handle, false); }
  report(): Record<string, { hits: number; amount: number; ammo: string }> {
    const out: Record<string, { hits: number; amount: number; ammo: string }> = {};
    for (const [id, d] of this.dummies) out[id] = { hits: d.hits, amount: d.lastAmount, ammo: d.lastAmmo };
    return out;
  }
  /** The bore of the layout, moved so its floor is the room's floor and its axis is at (ax, az): six marks and the target volume. */
  bore_(ax: number, az: number): KeptContext[] {
    const { ctx } = this.sb;
    const data = ctx.data;
    const opening = data.marker('bore_opening');
    const volume = (opening?.params.volume ?? { radius: 3, top: -42.8, bottom: -50, axis: [14, 0, 96] }) as { radius: number; top: number; bottom: number; axis: [number, number, number] };
    const marks = data.layout.markers.filter((m) => /^ia_proving_mark_\d$/.test(m.id));
    const floorY = marks[0] ? marks[0].pos[1] : -44;
    this.marks.length = 0;
    for (const m of marks) {
      const leave = typeof m.params.leaveRadius === 'number' ? m.params.leaveRadius : 2.5;
      this.marks.push({
        mark: m.id, markX: m.pos[0] - volume.axis[0] + ax + OX, markY: m.pos[1] - floorY + OY, markZ: m.pos[2] - volume.axis[2] + az + OZ, leaveRadius: leave,
        boreX: ax + OX, boreZ: az + OZ, boreTopY: volume.top - floorY + OY, boreBottomY: volume.bottom - floorY + OY, boreRadius: volume.radius,
      });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x7cf2e2 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(m.pos[0] - volume.axis[0] + ax + OX, OY + 0.02, m.pos[2] - volume.axis[2] + az + OZ);
      disc.name = m.id;
      this.group.add(disc);
    }
    const h = volume.top - volume.bottom;
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(volume.radius, volume.radius, h, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x55606a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    bore.position.set(ax + OX, volume.bottom - floorY + OY + h / 2, az + OZ);
    bore.name = 'bore_volume';
    this.group.add(bore);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(volume.radius, 32), bore.material);
    lid.rotation.x = -Math.PI / 2; lid.position.y = h / 2;
    bore.add(lid);
    this.bore = bore;
    return this.marks.map((m) => ({ ...m }));
  }
  marksOf(): KeptContext[] { return this.marks.map((m) => ({ ...m })); }
  /** What the world does: while she stands on a mark the player has its context; the bore shows the legal-aim state. */
  frame(): void {
    const { ctx } = this.sb;
    if (this.bore) (this.bore.material as THREE.MeshBasicMaterial).color.setHex(ctx.player.weapon.keptAimLegal ? 0x7cf2e2 : ctx.player.weapon.seventh === 'chambered' ? 0x8a5a9a : 0x55606a);
    if (this.marks.length === 0) return;
    const p = ctx.player.position;
    let on = '';
    for (const m of this.marks) if (Math.hypot(p.x - m.markX, p.z - m.markZ) <= 0.9 && Math.abs(p.y - m.markY) < 1) { on = m.mark; if (on !== this.onMark) ctx.player.setKeptContext(m); }
    if (on === '' && this.onMark !== '') ctx.player.setKeptContext(null);
    this.onMark = on;
  }
}

function kerb(ax: number, az: number): RoomSolid[] {
  // the bore: a 6 m hole in the floor behind a 0.6 m kerb ring (the test ignores it: GDD 6.6 rule 4)
  return [
    { shape: 'cylinder', pos: [ax, -3.5, az], size: [60, 7, 60], rotY: 0, surface: 'stone', role: 'floor', innerRadius: 3 },
    { shape: 'cylinder', pos: [ax, 0.3, az], size: [7.2, 0.6, 7.2], rotY: 0, surface: 'ceramic', role: 'blocker', innerRadius: 3 },
    { shape: 'box', pos: [ax, -7.5, az], size: [8, 1, 8], rotY: 0, surface: 'metal', role: 'floor' },
    wall(ax, az - 20.5, 42, 1, 8), wall(ax, az + 20.5, 42, 1, 8), wall(ax - 20.5, az, 1, 40, 8), wall(ax + 20.5, az, 1, 40, 8),
  ];
}

void createSandbox({
  piece: 'player',
  systems: { player: createPlayerSystem },
  scene: {
    course: async (sb) => { await sb.room(COURSE, [0, 0, 6], 0); },
    range: async (sb) => { await sb.room(RANGE, [0, 0, 6], 0); },
    kept: async (sb) => { await sb.room(kerb(0, 0), [0, 0, 9], 0); },
    layout: async (sb) => { await sb.start('cp_lip_start'); },
    room: async (sb) => { await sb.boxRoom(); },
  },
}).then((sb) => {
  const { ctx } = sb;
  const range = new Range(sb);
  const ext = window.__dbg?.ext.player as Record<string, (...args: unknown[]) => unknown> | undefined;
  if (sb.sceneName === 'range') {
    OUTCOMES.forEach((o, i) => range.dummy('dummy_' + o, o, -8 + i * 2, 1.2, -10));
    range.dummy('body_behind_plates', 'freed', 12, 1.2, -11.5, { stopsLine: true });
  }
  if (sb.sceneName === 'kept') range.bore_(0, 0);
  sb.onFrame(() => range.frame());

  // ---- the world's stand-ins
  sb.separator();
  sb.button('ammo box', () => ctx.player.giveLead(0, 18), 'the refill box: tops the reserve up to 18');
  sb.button('boss box +6', () => ctx.player.giveLead(6, 0));
  sb.button('packet +6', () => ctx.player.givePickup('pk_rounds_6'));
  sb.button('tin +12', () => ctx.player.givePickup('pk_rounds_12'));
  sb.button('line locker', () => ctx.player.giveLineRounds(1));
  sb.button('canteen', () => ctx.player.givePickup('pk_canteen'));
  sb.button('stone', () => ctx.player.takeStoneRound());
  sb.button('charge required', () => ctx.events.emit('boss/charge_required', {}));
  sb.button('control', () => { control = !control; ctx.player.setControl(control, 'sandbox'); });
  let control = true;
  sb.separator();
  const scratch: DamageInfo = { amount: 0, kind: 'bullet', source: 'bider', sourceId: 'sandbox', ammo: null, shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
  const hurt = (kind: DamageKind, amount: number, source: DamageSource): void => {
    const p = ctx.player.position, f = ctx.player.forward;
    scratch.kind = kind; scratch.amount = amount; scratch.source = source;
    scratch.ox = p.x - f.z * 4; scratch.oy = p.y + 1.2; scratch.oz = p.z + f.x * 4;   // from her right
    ctx.player.applyDamage(scratch);
  };
  const AMOUNT: Record<DamageKind, number> = { bullet: 10, lunge: 22, stake: 28, slam: 38, charge: 34, canister: 38, lance: 30, fan: 18, kill_volume: 999 };
  for (const kind of DAMAGE_KINDS) sb.button('hurt: ' + kind, () => hurt(kind, AMOUNT[kind], kind === 'kill_volume' ? 'world' : 'bider'), `${AMOUNT[kind]} damage`);
  sb.button('god', () => { god = !god; ctx.player.setGodMode(god); });
  let god = false;
  sb.separator();
  for (const clip of CLIPS) sb.button(clip, () => { if (ext?.playClip) ext.playClip(clip); }, 'view-model clip');
  sb.separator();
  sb.button('reduce motion', () => ctx.options.set('reduceMotion', !ctx.options.value.reduceMotion));
  sb.button('fire: click/hold', () => ctx.options.set('fireMode', ctx.options.value.fireMode === 'click' ? 'hold' : 'click'));
  sb.button('sprint: hold/toggle', () => ctx.options.set('sprintMode', ctx.options.value.sprintMode === 'hold' ? 'toggle' : 'hold'));
  sb.button('difficulty', () => ctx.options.set('difficulty', ctx.options.value.difficulty === 'easy' ? 'normal' : ctx.options.value.difficulty === 'normal' ? 'hard' : 'easy'));
  sb.separator();

  // ---- live readout, and a plain crosshair (the HUD is the ui piece's)
  const set = sb.readout();
  const cross = document.createElement('div');
  cross.id = 'crosshair';
  cross.style.cssText = 'position:fixed;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#fff;outline:1px solid #000;z-index:800;pointer-events:none';
  document.body.appendChild(cross);
  const round = (v: number, d = 2): string => v.toFixed(d);
  const glyph: Record<string, string> = { lead: 'o', line: '=', kept: '7', empty: '.' };
  let readoutOn = true;
  sb.onFrame(() => {
    if (!readoutOn) return;
    const pl = ctx.player, w = pl.weapon;
    const k = (ext?.kick ? ext.kick() : { pitchDeg: 0, yawDeg: 0 }) as { pitchDeg: number; yawDeg: number };
    const x = (ext?.extra ? ext.extra() : { segment: 0, regenerating: false, immunity: 0 }) as { segment: number; regenerating: boolean; immunity: number };
    const speed = Math.hypot(pl.velocity.x, pl.velocity.z);
    const hp = pl.health;
    const segs = [Math.min(34, hp), Math.min(33, Math.max(0, hp - 34)), Math.min(33, Math.max(0, hp - 67))].map((v) => round(v, 0)).join('/');
    set(`speed ${round(speed)} m/s${pl.sprinting ? ' SPRINT' : ''}${pl.grounded ? '' : ' air'}  |  ${w.phase}  [${w.cylinder.map((c) => glyph[c]).join('')}] +${w.reserve}  line ${w.lineRounds}  seventh ${w.seventh}${w.keptAimLegal ? ' LEGAL' : ''}  |  spread ${round(ext?.spreadDeg ? ext.spreadDeg() as number : 0)} deg  kick ${round(k.pitchDeg)}/${round(k.yawDeg)} deg  |  hp ${round(hp, 0)} (${segs})${x.regenerating ? ' regen' : ''}${x.immunity > 0 ? ' grace' : ''}  ${ctx.options.value.difficulty}`);
    cross.style.background = w.keptAimLegal ? '#7cf2e2' : '#fff';
  });

  // ?bar=0: the buttons out of the way (the readout stays)
  if (sb.params.get('bar') === '0') for (const b of Array.from(document.querySelectorAll('#bar button, #bar .sep'))) (b as HTMLElement).style.display = 'none';

  ctx.debug.register('range', {
    dummy: ((id: string, outcome: HitOutcome, x: number, y: number, z: number, options?: { radius?: number; stopsLine?: boolean; kind?: EntityKind; part?: HitPart }) => range.dummy(id, outcome, x, y, z, options)) as (...args: never[]) => unknown,
    remove: ((id: string) => range.remove(id)) as (...args: never[]) => unknown,
    disable: ((id: string) => range.disable(id)) as (...args: never[]) => unknown,
    report: (() => range.report()) as (...args: never[]) => unknown,
    /** the bore at room (ax, az): returns the six mark contexts (world coordinates) */
    bore: ((ax: number, az: number) => range.bore_(ax, az)) as (...args: never[]) => unknown,
    marks: (() => range.marksOf()) as (...args: never[]) => unknown,
    setKeptContext: ((c: KeptContext | null) => ctx.player.setKeptContext(c)) as (...args: never[]) => unknown,
    give: ((what: 'lead' | 'line' | 'pickup' | 'stone', a?: number | string, b?: number) => what === 'lead' ? ctx.player.giveLead(Number(a ?? 0), b ?? 0) : what === 'line' ? ctx.player.giveLineRounds(Number(a ?? 1)) : what === 'pickup' ? ctx.player.givePickup(a as 'pk_rounds_6') : ctx.player.takeStoneRound()) as (...args: never[]) => unknown,
    control: ((on: boolean, reason?: string, lockLook?: boolean) => ctx.player.setControl(on, reason ?? 'test', lockLook)) as (...args: never[]) => unknown,
    save: (() => ({ captured: (ctx.player as unknown as { captureSave(): unknown }).captureSave() })) as (...args: never[]) => unknown,
    applySave: ((data: unknown) => (ctx.player as unknown as { applySave(d: unknown): void }).applySave(data)) as (...args: never[]) => unknown,
    renderCalls: (() => ((sb.systems.find((s) => s.id === 'render')?.debugState() ?? {}) as { calls?: string[] }).calls ?? []) as (...args: never[]) => unknown,
    origin: (() => [OX, OY, OZ]) as (...args: never[]) => unknown,
    /** the readout builds a string per frame: off for an allocation measurement of the player alone */
    readout: ((on: boolean) => { readoutOn = on; }) as (...args: never[]) => unknown,
  });
});
