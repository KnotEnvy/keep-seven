// Event-driven feedback (code-render 4.6): the complete map from the event bus to the pooled effects. Nobody calls
// render for these: "silence after a shot is a bug". Payloads are the emitter's scratch objects: they are read inside
// the handler and never kept. Nothing here allocates after construction.
import type { EntityKind, GameContext, GameEvents, SurfaceType, VfxId } from '../core/contracts.ts';
import type { Vfx } from './vfx/vfx.ts';

/** impact burst of each surface a round can meet ('none': the round met nothing) */
export const SURFACE_VFX: Readonly<Record<SurfaceType, VfxId | ''>> = {
  sand: 'impact_sand', wood: 'impact_wood', adobe: 'impact_adobe', metal: 'impact_metal', ceramic: 'impact_ceramic', stone: 'impact_stone', cloth: 'impact_cloth', none: '',
};
/** what a body gives off when a round goes into it: cloth and dust for a Bider (never red), ceramic for the machines */
export const BODY_VFX: Readonly<Partial<Record<EntityKind, VfxId>>> = {
  bider: 'impact_cloth', transit: 'impact_ceramic', tamper: 'impact_ceramic', windlass: 'impact_ceramic',
  knot: 'impact_ceramic', stake: 'stake_burst', canister: 'canister_burst',
};
/** what a shootable does when it reacts (`shootable/hit`); kinds not listed take a metal impact */
export const SHOOTABLE_VFX: Readonly<Partial<Record<EntityKind, VfxId>>> = {
  jug: 'jug_burst', latch: 'insulator_break', bell: 'insulator_break', dowser: 'dust_short', ask_port: 'lamp_answer',
  cord: 'impact_cloth', rope: 'impact_cloth', range_plate: 'impact_metal',
};
/** the ambient emitters render runs by itself while their zone is drawn: [effect, seconds between sprites] */
export const AMBIENT_VFX: readonly (readonly [VfxId, number])[] = [['embers', 0.33], ['steam', 0.66]];

const MAX_PICKUPS = 32;
/** how far a deflected round's spark is thrown off the plate, metres (the streak itself is LINE_STYLE.ricochet.streak of it) */
export const RICOCHET_M = 1.6;
const GLINT_EVERY = 2.5;

export class Feedback {
  private readonly off: (() => void)[] = [];
  private readonly pickupId: string[] = [];
  private readonly pickupPos = new Float32Array(MAX_PICKUPS * 3);
  private readonly pickupNext = new Float32Array(MAX_PICKUPS);
  private pickups = 0;
  private readonly ambientNext = new Float32Array(AMBIENT_VFX.length);
  /** the camp's fire and kettle (layout prop_camp_three) */
  private readonly camp: readonly [number, number, number] | null;
  /** where the Windlass's guard breaks: its pivot plus the drum's height */
  private readonly guard: readonly [number, number, number];
  /** events handled since boot, by name (tests) */
  readonly handled: Record<string, number> = {};

  /** where the last shot's smoke and tracer began (world) */
  readonly muzzle = { x: 0, y: 0, z: 0 };

  /**
   * `seen(e, out)`: the world point that the world camera draws where the view-model pass draws the muzzle of the shot
   * `e`; false when it cannot say (then the event's own muzzle is used).
   */
  constructor(private readonly ctx: GameContext, private readonly vfx: Vfx, private readonly simTime: () => number, private readonly seen: ((e: Readonly<GameEvents['weapon/fired']>, out: { x: number; y: number; z: number }) => boolean) | null = null) {
    for (let i = 0; i < MAX_PICKUPS; i++) this.pickupId.push('');
    const layout = ctx.data.layout;
    const camp = layout.markers.find((m) => m.id === 'prop_camp_three');
    this.camp = camp ? [camp.pos[0], camp.pos[1], camp.pos[2]] : null;
    const boss = layout.markers.find((m) => m.id === 'sp_windlass');
    const height = boss && typeof boss.params.drumCentreHeight === 'number' ? boss.params.drumCentreHeight : 4;
    this.guard = boss ? [boss.pos[0], boss.pos[1] + height, boss.pos[2]] : [0, 0, 0];
  }

  private on<K extends keyof GameEvents>(name: K, handler: (e: Readonly<GameEvents[K]>) => void): void {
    this.handled[name] = 0;
    this.off.push(this.ctx.events.on(name, (e) => { this.handled[name] = (this.handled[name] as number) + 1; handler(e); }));
  }

  subscribe(): void {
    const vfx = this.vfx;
    this.on('weapon/fired', (e) => {
      // where the muzzle is SEEN (polish round 5): the event's muzzle is a point of the view-model pass's own narrow
      // projection, and the smoke and the tracer are drawn by the world camera. The event's point is the fallback.
      const m = this.muzzle;
      if (!this.seen || !this.seen(e, m)) { m.x = e.mx; m.y = e.my; m.z = e.mz; }
      vfx.burst('powder_smoke', m.x, m.y, m.z, e.dx, e.dy, e.dz);
      if (e.ammo === 'lead_round') vfx.lineFromMuzzle('tracer', m.x, m.y, m.z, e.endX, e.endY, e.endZ);
      else if (e.ammo === 'line_round') vfx.line('line_round', m.x, m.y, m.z, e.endX, e.endY, e.endZ);
      // kept_round: nothing more; its flash and the ring come by the direct calls and by boss/proven
    });
    this.on('combat/hit', (e) => {
      const surface = SURFACE_VFX[e.surface];
      switch (e.outcome) {
        case 'impact':
          if (surface !== '') { vfx.burst(surface, e.x, e.y, e.z, e.nx, e.ny, e.nz); vfx.decal(e.surface, e.x, e.y, e.z, e.nx, e.ny, e.nz); }
          break;
        case 'deflected':
          vfx.burst('plate_spark', e.x, e.y, e.z, e.nx, e.ny, e.nz);
          {
            // underground look, pass i1 (visual reviewer: "a one-pixel line from the hit straight up out of the frame: a
            // glitch, not a ricochet"). It was the mirrored direction drawn 6 m long: a round that meets a plate head-on
            // comes back along the view, so the line always stood on the crosshair and left the frame. Now a spark's
            // length (RICOCHET_M), thrown off the plate: the mirror direction leaned toward the surface's normal and to
            // one side of it (the side is the hit point's own hash: the same shot draws the same streak)
            let rx = e.ricochetX * 0.55 + e.nx * 0.45, ry = e.ricochetY * 0.55 + e.ny * 0.45, rz = e.ricochetZ * 0.55 + e.nz * 0.45;
            const hsh = Math.sin(e.x * 12.9898 + e.y * 78.233 + e.z * 37.719) * 43758.5453, side = (hsh - Math.floor(hsh)) < 0.5 ? -1 : 1;
            // a tangent of the surface: n x up (n x east where the surface is a floor or a ceiling)
            let tx = -e.nz, ty = 0, tz = e.nx;
            if (tx * tx + tz * tz < 0.04) { tx = 0; ty = e.nz; tz = -e.ny; }
            const tl = Math.hypot(tx, ty, tz) || 1;
            rx += tx / tl * 0.6 * side; ry += ty / tl * 0.6 * side + 0.15; rz += tz / tl * 0.6 * side;
            const rl = Math.hypot(rx, ry, rz) || 1, len = RICOCHET_M / rl;
            vfx.line('ricochet', e.x, e.y, e.z, e.x + rx * len, e.y + ry * len, e.z + rz * len);
          }
          break;
        case 'hit': case 'weak': case 'kill': case 'freed':
          vfx.burst(BODY_VFX[e.entityKind] ?? (surface !== '' ? surface : 'impact_ceramic'), e.x, e.y, e.z, e.nx, e.ny, e.nz);
          break;
        case 'broke':
          // the round's own mark; the thing's reaction comes with shootable/hit, breakable/broken or knot/burst
          vfx.burst(surface !== '' ? surface : 'impact_ceramic', e.x, e.y, e.z, e.nx, e.ny, e.nz, 0.7);
          break;
        case 'parried':
          vfx.burst('stake_burst', e.x, e.y, e.z, e.nx, e.ny, e.nz);
          break;
        case 'passed':
          vfx.burst('impact_cloth', e.x, e.y, e.z, e.nx, e.ny, e.nz, 0.5);
          break;
      }
      // a line round leaves a small aqua dot at every body it passes
      if (e.ammo === 'line_round' && e.outcome !== 'impact' && e.outcome !== 'deflected') vfx.burst('lamp_answer', e.x, e.y, e.z, e.nx, e.ny, e.nz, 0.6);
    });
    this.on('combat/line_resolved', (e) => { vfx.burst('lamp_answer', e.endX, e.endY, e.endZ, 0, 1, 0, 0.8); });
    this.on('enemy/freed', (e) => { vfx.burst('knot_burst', e.x, e.y, e.z, 0, 1, 0); vfx.burst('bider_freed', e.x, e.y, e.z, 0, 1, 0); });
    this.on('enemy/felled', (e) => { vfx.burst('bider_felled', e.x, e.y, e.z, 0, 1, 0); });
    this.on('enemy/died', (e) => {
      if (e.kind === 'transit') vfx.burst('transit_death', e.x, e.y, e.z, 0, 1, 0);
      else if (e.kind === 'tamper') vfx.burst('slam_dust', e.x, e.y, e.z, 0, 1, 0, 0.7);
    });
    this.on('enemy/telegraph', (e) => { if (e.kind === 'tamper' && e.attack === 'slam') vfx.burst('vent_open', e.x, e.y, e.z, 0, 1, 0); });
    this.on('enemy/attack', (e) => {
      if (e.kind === 'tamper' && e.attack === 'slam') vfx.burst('slam_dust', e.x, e.y, e.z, 0, 1, 0);
      else if (e.kind === 'tamper' && e.attack === 'charge') vfx.burst('charge_sparks', e.x, e.y, e.z, 0, 1, 0);
      else if (e.kind === 'windlass' && e.attack === 'lance') vfx.burst('lance_sparks', e.x, e.y, e.z, 0, 1, 0);
    });
    this.on('knot/burst', (e) => { vfx.burst('knot_burst', e.x, e.y, e.z, 0, 1, 0); });
    this.on('knot/regrown', (e) => { vfx.burst('vent_open', e.x, e.y, e.z, 0, 1, 0, 0.6); });
    this.on('shootable/hit', (e) => { vfx.burst(SHOOTABLE_VFX[e.kind] ?? 'impact_metal', e.x, e.y, e.z, 0, 1, 0); });
    this.on('breakable/broken', (e) => {
      const a = e.asset;
      vfx.burst(a.includes('jug') ? 'jug_burst' : a.includes('insulator') || a.includes('latch') || a.includes('bell') ? 'insulator_break' : 'bottle_break', e.x, e.y, e.z, 0, 1, 0);
    });
    this.on('projectile/landed', (e) => { if (e.kind === 'stake') vfx.burst('stake_stick', e.x, e.y, e.z, 0, 1, 0); });
    this.on('projectile/burst', (e) => { vfx.burst(e.kind === 'stake' ? 'stake_burst' : 'canister_burst', e.x, e.y, e.z, 0, 1, 0); });
    this.on('pickup/spawned', (e) => { this.addPickup(e.id, e.x, e.y, e.z); });
    this.on('pickup/collected', (e) => { this.removePickup(e.id); vfx.burst('pickup_glint', e.x, e.y + 0.15, e.z, 0, 1, 0, 1.6); });
    this.on('boss/guard', (e) => { if (e.state === 'shattered') vfx.burst('guard_shatter', this.guard[0], this.guard[1], this.guard[2], 0, 1, 0); });
    this.on('boss/proven', (e) => { vfx.provingRing(e.x, e.y, e.z); });
    this.on('lamp/set', (e) => {
      const m = this.ctx.data.layout.markers;
      for (let i = 0; i < m.length; i++) {
        const marker = m[i];
        if (marker && marker.id === e.id) { vfx.burst('lamp_answer', marker.pos[0], marker.pos[1], marker.pos[2], 0, 1, 0); break; }
      }
    });
  }

  private addPickup(id: string, x: number, y: number, z: number): void {
    for (let i = 0; i < this.pickups; i++) if (this.pickupId[i] === id) { this.pickupPos[i * 3] = x; this.pickupPos[i * 3 + 1] = y; this.pickupPos[i * 3 + 2] = z; return; }
    if (this.pickups >= MAX_PICKUPS) return;
    const i = this.pickups++;
    this.pickupId[i] = id;
    this.pickupPos[i * 3] = x; this.pickupPos[i * 3 + 1] = y; this.pickupPos[i * 3 + 2] = z;
    // staggered, so a row of pickups does not blink as one
    this.pickupNext[i] = this.simTime() + 0.4 + (i % 5) * 0.5;
  }
  private removePickup(id: string): void {
    for (let i = 0; i < this.pickups; i++) {
      if (this.pickupId[i] !== id) continue;
      const last = --this.pickups;
      this.pickupId[i] = this.pickupId[last] as string; this.pickupId[last] = '';
      this.pickupPos[i * 3] = this.pickupPos[last * 3] as number; this.pickupPos[i * 3 + 1] = this.pickupPos[last * 3 + 1] as number; this.pickupPos[i * 3 + 2] = this.pickupPos[last * 3 + 2] as number;
      this.pickupNext[i] = this.pickupNext[last] as number;
      return;
    }
  }
  /** a new run or a restore: the world spawns its pickups again */
  clearPickups(): void { for (let i = 0; i < this.pickups; i++) this.pickupId[i] = ''; this.pickups = 0; }
  get livePickups(): number { return this.pickups; }

  /** Once per frame: the glint of each live pickup every 2.5 s, and the camp's embers and steam while the bore is drawn. */
  update(boreDrawn: boolean): void {
    const now = this.simTime(), vfx = this.vfx;
    const cam = this.ctx.scene.camera.position;
    for (let i = 0; i < this.pickups; i++) {
      if (now < (this.pickupNext[i] as number)) continue;
      this.pickupNext[i] = now + GLINT_EVERY;
      const x = this.pickupPos[i * 3] as number, y = this.pickupPos[i * 3 + 1] as number, z = this.pickupPos[i * 3 + 2] as number;
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      if (dx * dx + dy * dy + dz * dz < 45 * 45) vfx.burst('pickup_glint', x, y + 0.18, z, 0, 1, 0);
    }
    const camp = this.camp;
    if (camp && boreDrawn) {
      const dx = camp[0] - cam.x, dy = camp[1] - cam.y, dz = camp[2] - cam.z;
      if (dx * dx + dy * dy + dz * dz < 40 * 40) {
        for (let i = 0; i < AMBIENT_VFX.length; i++) {
          if (now < (this.ambientNext[i] as number)) continue;
          const a = AMBIENT_VFX[i] as readonly [VfxId, number];
          this.ambientNext[i] = now + a[1];
          // embers rise from the bed; the kettle steams beside it
          if (i === 0) vfx.trickle(a[0], camp[0], camp[1] + 0.12, camp[2]);
          else vfx.trickle(a[0], camp[0] + 0.35, camp[1] + 0.3, camp[2] + 0.1);
        }
      }
    }
  }

  dispose(): void { for (const u of this.off) u(); this.off.length = 0; }
}
