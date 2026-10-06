// Shot resolution (GDD 6.7, 6.8; ARCHITECTURE 3.6 "A lead round", "A line round", "The kept round"): everything a
// round does happens inside the player's fixedUpdate, on the tick of the click. Scratch structs are created once.
import { ColFlag, LAYER_SHOT, Layer, MAX_LINE_HITS } from '../core/contracts.ts';
import type {
  AmmoType, DamageInfo, EntityKind, GameContext, GameEvents, HitList, HitOutcome, HitResponse, HitResult, KeptContext, Rng, Vec3,
} from '../core/contracts.ts';
import { LINE_TICKS_PER_HIT, WEAPON } from './defs.ts';
import { rayEntersBore } from './kept.ts';

const DEG = Math.PI / 180;
const GEOMETRY = Layer.WORLD | Layer.DYNAMIC;

function isBody(kind: EntityKind): boolean { return kind === 'bider' || kind === 'transit' || kind === 'tamper' || kind === 'windlass'; }

export class Shots {
  private readonly hit: HitResult;
  private readonly list: HitList;
  private readonly centre: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly response: HitResponse = { outcome: 'impact', stops: true, stopsLine: true, damageDealt: 0, healthLeft: 0 };
  private readonly damage: DamageInfo = { amount: 0, kind: 'bullet', source: 'player', sourceId: 'player', ammo: 'lead_round', shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
  private readonly firedPayload: GameEvents['weapon/fired'] = { shotId: 0, ammo: 'lead_round', chambersLeft: 6, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0, mx: 0, my: 0, mz: 0, endX: 0, endY: 0, endZ: 0 };
  private readonly hitPayload: GameEvents['combat/hit'] = { x: 0, y: 0, z: 0, shotId: 0, order: 0, ammo: 'lead_round', outcome: 'impact', entityId: '', entityKind: 'world', part: 'whole', surface: 'none', nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 };
  private readonly resolvedPayload: GameEvents['combat/line_resolved'] = { shotId: 0, bodies: 0, freed: 0, knots: 0, endX: 0, endY: 0, endZ: 0 };
  // ---- the line round in flight: its bodies react 40 ms apart
  private lineActive = false;
  private lineNext = 0;
  private lineTicks = 0;
  private lineShot = 0;
  private lineBodies = 0;
  private lineFreed = 0;
  private lineKnots = 0;
  private readonly lineOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly lineDir: Vec3 = { x: 0, y: 0, z: -1 };
  private receiverFailed = false;
  // ---- a lead round that a receiver let pass (rare): what it met behind
  private readonly pass: HitList;
  private readonly passIndex: number[] = new Array<number>(MAX_LINE_HITS).fill(0);
  private readonly passOutcome: HitOutcome[] = new Array<HitOutcome>(MAX_LINE_HITS).fill('impact');
  private readonly passDamage: number[] = new Array<number>(MAX_LINE_HITS).fill(0);
  private passStopped = false;
  private firstOutcome: HitOutcome = 'impact';
  private firstDamage = 0;

  constructor(private readonly ctx: GameContext, private readonly rng: Rng) {
    this.hit = ctx.collision.createHit();
    this.list = ctx.collision.createHitList();
    this.pass = ctx.collision.createHitList();
  }

  /** hits of a line round still waiting for their tick */
  get pending(): number { return this.lineActive ? this.list.count - this.lineNext : 0; }

  private fillFired(ammo: AmmoType, shotId: number, chambersLeft: number, o: Readonly<Vec3>, d: Readonly<Vec3>, m: Readonly<Vec3>): GameEvents['weapon/fired'] {
    const f = this.firedPayload;
    f.shotId = shotId; f.ammo = ammo; f.chambersLeft = chambersLeft;
    f.ox = o.x; f.oy = o.y; f.oz = o.z; f.dx = d.x; f.dy = d.y; f.dz = d.z;
    f.mx = m.x; f.my = m.y; f.mz = m.z;
    return f;
  }
  private fillDamage(ammo: AmmoType, shotId: number, o: Readonly<Vec3>, d: Readonly<Vec3>): DamageInfo {
    const dmg = this.damage;
    dmg.amount = WEAPON.ammo[ammo].damage; dmg.ammo = ammo; dmg.shotId = shotId;
    dmg.ox = o.x; dmg.oy = o.y; dmg.oz = o.z; dmg.dx = d.x; dmg.dy = d.y; dmg.dz = d.z;
    return dmg;
  }
  /** Ask the receiver; a receiver that throws is reported once and the round is an impact. */
  private receive(h: HitResult, dmg: DamageInfo): void {
    const res = this.response;
    res.outcome = 'impact'; res.stops = true; res.stopsLine = true; res.damageDealt = 0; res.healthLeft = 0;
    if (!h.receiver) return;
    try { h.receiver.onHit(h, dmg, res); } catch (err) {
      if (!this.receiverFailed) { this.receiverFailed = true; console.error(`[player] a hit receiver threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`); }
      res.outcome = 'impact'; res.stops = true; res.stopsLine = true; res.damageDealt = 0;
    }
  }
  private emitHit(h: Readonly<HitResult>, ammo: AmmoType, shotId: number, order: number, d: Readonly<Vec3>): void {
    const res = this.response, p = this.hitPayload;
    p.x = h.x; p.y = h.y; p.z = h.z; p.shotId = shotId; p.order = order; p.ammo = ammo; p.outcome = res.outcome;
    p.entityId = h.entity ? h.entity.id : ''; p.entityKind = h.entity ? h.entity.kind : 'world';
    p.part = h.part; p.surface = h.surface; p.nx = h.nx; p.ny = h.ny; p.nz = h.nz; p.damage = res.damageDealt;
    const dot = 2 * (d.x * h.nx + d.y * h.ny + d.z * h.nz);
    p.ricochetX = d.x - dot * h.nx; p.ricochetY = d.y - dot * h.ny; p.ricochetZ = d.z - dot * h.nz;
    this.ctx.events.emit('combat/hit', p);
  }
  /** Bloom: a seeded offset inside a cone of `deg` around d (in place). Never drawn at the normal cadence (bloom is 0). */
  private spread(d: Vec3, deg: number): void {
    if (deg <= 0) return;
    const a = this.rng.next() * Math.PI * 2, r = Math.tan(deg * DEG) * Math.sqrt(this.rng.next());
    // any vector across d, then the one across both
    let ux = -d.z, uy = 0, uz = d.x;
    let l = Math.sqrt(ux * ux + uz * uz);
    if (l < 1e-6) { ux = 1; uz = 0; l = 1; }
    ux /= l; uz /= l;
    const vx = d.y * uz - d.z * uy, vy = d.z * ux - d.x * uz, vz = d.x * uy - d.y * ux;
    const c = Math.cos(a) * r, s = Math.sin(a) * r;
    d.x += ux * c + vx * s; d.y += uy * c + vy * s; d.z += uz * c + vz * s;
    l = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    d.x /= l; d.y /= l; d.z /= l;
  }

  /**
   * One lead round: nearest hit within 200 m, the receiver's answer, `weapon/fired`, then `combat/hit`. A receiver
   * that answers `stops: false` (outcome `passed`: a thing with no body to hit) lets the round go on to what is behind.
   */
  lead(shotId: number, chambersLeft: number, o: Readonly<Vec3>, d: Vec3, m: Readonly<Vec3>, bloomDeg: number): void {
    const { ctx } = this;
    const hit = this.hit, range = WEAPON.ammo.lead_round.range, res = this.response;
    this.spread(d, bloomDeg);
    const got = ctx.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range, LAYER_SHOT, hit);
    const dmg = this.fillDamage('lead_round', shotId, o, d);
    let passed = 0, through = false;
    let last: HitResult | null = null;
    if (got) {
      this.receive(hit, dmg);
      if (!hit.receiver && (hit.flags & ColFlag.GRILLE) !== 0) res.outcome = 'deflected';
      last = hit;
      if (hit.receiver && !res.stops) {
        through = true;
        passed = this.leadThrough(dmg);
        last = this.passStopped ? this.pass.hits[this.passIndex[passed - 1] as number] as HitResult : null;
      }
    }
    const f = this.fillFired('lead_round', shotId, chambersLeft, o, d, m);
    f.endX = last ? last.x : o.x + d.x * range; f.endY = last ? last.y : o.y + d.y * range; f.endZ = last ? last.z : o.z + d.z * range;
    ctx.events.emit('weapon/fired', f);
    if (!got) return;
    if (!through) { this.emitHit(hit, 'lead_round', shotId, 0, d); return; }
    // the round went through: the first thing it met, then each thing behind it, in order
    res.outcome = this.firstOutcome; res.damageDealt = this.firstDamage;
    this.emitHit(hit, 'lead_round', shotId, 0, d);
    for (let k = 0; k < passed; k++) {
      res.outcome = this.passOutcome[k] as HitOutcome; res.damageDealt = this.passDamage[k] as number;
      this.emitHit(this.pass.hits[this.passIndex[k] as number] as HitResult, 'lead_round', shotId, k + 1, d);
    }
  }
  /** The first receiver let the lead round pass: walk what lies behind it until something stops it. Returns the count walked. */
  private leadThrough(dmg: DamageInfo): number {
    const col = this.ctx.collision, res = this.response, first = this.hit, list = this.pass;
    this.firstOutcome = res.outcome; this.firstDamage = res.damageDealt;
    this.passStopped = false;
    const n = col.raycastAll(dmg.ox, dmg.oy, dmg.oz, dmg.dx, dmg.dy, dmg.dz, WEAPON.ammo.lead_round.range, LAYER_SHOT, list);
    let count = 0;
    for (let i = 0; i < n && count < MAX_LINE_HITS; i++) {
      const h = list.hits[i] as HitResult;
      if (h.distance <= first.distance + 1e-4 || (h.entity !== null && first.entity !== null && h.entity.id === first.entity.id)) continue;
      this.receive(h, dmg);
      if (!h.receiver && (h.flags & ColFlag.GRILLE) !== 0) res.outcome = 'deflected';
      this.passIndex[count] = i; this.passOutcome[count] = res.outcome; this.passDamage[count] = res.damageDealt;
      count++;
      if (!h.receiver || res.stops) { this.passStopped = true; break; }
    }
    return count;
  }

  /**
   * One line round: every hit within 60 m, near to far. `weapon/fired` carries the geometric end (the first solid that
   * is not tagged PIERCE, or 60 m); the bodies then react one by one, entry i at tick offset round(i * 2.4), and
   * `combat/line_resolved` follows the last (with the real end, if a receiver stopped the line).
   */
  line(shotId: number, chambersLeft: number, o: Readonly<Vec3>, d: Readonly<Vec3>, m: Readonly<Vec3>): void {
    const { ctx } = this;
    if (this.lineActive) this.flushLine();                // cannot happen at the cadence; never leave a line unresolved
    const range = WEAPON.ammo.line_round.range, list = this.list;
    const n = ctx.collision.raycastAll(o.x, o.y, o.z, d.x, d.y, d.z, range, LAYER_SHOT, list);
    const f = this.fillFired('line_round', shotId, chambersLeft, o, d, m);
    f.endX = o.x + d.x * range; f.endY = o.y + d.y * range; f.endZ = o.z + d.z * range;
    for (let i = 0; i < n; i++) {
      const h = list.hits[i] as HitResult;
      if ((h.layer & GEOMETRY) !== 0 && !h.receiver && (h.flags & ColFlag.PIERCE) === 0) { f.endX = h.x; f.endY = h.y; f.endZ = h.z; break; }
    }
    this.lineActive = true; this.lineNext = 0; this.lineTicks = 0; this.lineShot = shotId;
    this.lineBodies = 0; this.lineFreed = 0; this.lineKnots = 0;
    this.lineOrigin.x = o.x; this.lineOrigin.y = o.y; this.lineOrigin.z = o.z;
    this.lineDir.x = d.x; this.lineDir.y = d.y; this.lineDir.z = d.z;
    const r = this.resolvedPayload;
    r.endX = f.endX; r.endY = f.endY; r.endZ = f.endZ;
    ctx.events.emit('weapon/fired', f);
    this.advanceLine();                                    // entry 0 on the click's tick
  }
  /** Called once per sim tick after the weapon: the line round's next bodies. */
  tick(): void {
    if (!this.lineActive) return;
    this.lineTicks++;
    this.advanceLine();
  }
  private flushLine(): void { this.lineTicks = 1 << 20; this.advanceLine(); }
  private advanceLine(): void {
    const col = this.ctx.collision, list = this.list, d = this.lineDir;
    while (this.lineActive) {
      const i = this.lineNext;
      if (i >= list.count) { this.finishLine(); return; }
      if (Math.round(i * LINE_TICKS_PER_HIT) > this.lineTicks) return;
      this.lineNext = i + 1;
      const h = list.hits[i] as HitResult;
      let stop: boolean;
      if (h.receiver) {
        // an entity destroyed before its turn (its volume is gone or disabled) is skipped
        if (h.entity && !col.volumeCentre(h.entity.id, h.part, this.centre)) continue;
        this.receive(h, this.fillDamage('line_round', this.lineShot, this.lineOrigin, d));
        stop = this.response.stopsLine;
      } else {
        const res = this.response;
        res.outcome = 'impact'; res.damageDealt = 0; res.healthLeft = 0;
        // static or dynamic geometry stops the line unless it is tagged PIERCE; an inert volume never does
        stop = (h.layer & GEOMETRY) !== 0 && (h.flags & ColFlag.PIERCE) === 0;
      }
      const kind: EntityKind = h.entity ? h.entity.kind : 'world';
      const outcome = this.response.outcome;
      if (outcome !== 'passed') {
        if (isBody(kind)) this.lineBodies++;
        if (kind === 'knot') this.lineKnots++;
      }
      if (outcome === 'freed') this.lineFreed++;
      this.emitHit(h, 'line_round', this.lineShot, i, d);
      if (stop) {
        const r = this.resolvedPayload;
        r.endX = h.x; r.endY = h.y; r.endZ = h.z;
        this.finishLine();
        return;
      }
    }
  }
  private finishLine(): void {
    this.lineActive = false;
    const r = this.resolvedPayload;
    r.shotId = this.lineShot; r.bodies = this.lineBodies; r.freed = this.lineFreed; r.knots = this.lineKnots;
    this.ctx.events.emit('combat/line_resolved', r);
  }

  /** The kept round: no collision query; the end is where the aim ray meets the bore cylinder. */
  kept(shotId: number, chambersLeft: number, o: Readonly<Vec3>, d: Readonly<Vec3>, m: Readonly<Vec3>, context: Readonly<KeptContext>): void {
    const t = Math.max(0, rayEntersBore(o.x, o.y, o.z, d.x, d.y, d.z, context));
    const f = this.fillFired('kept_round', shotId, chambersLeft, o, d, m);
    f.endX = o.x + d.x * t; f.endY = o.y + d.y * t; f.endZ = o.z + d.z * t;
    this.ctx.events.emit('weapon/fired', f);
    // "no bullet produces nothing": the bore itself is what this round meets
    const p = this.hitPayload;
    p.x = f.endX; p.y = f.endY; p.z = f.endZ; p.shotId = shotId; p.order = 0; p.ammo = 'kept_round'; p.outcome = 'impact';
    p.entityId = context.mark; p.entityKind = 'bore'; p.part = 'whole'; p.surface = 'none';
    p.nx = 0; p.ny = 1; p.nz = 0; p.damage = 0; p.ricochetX = 0; p.ricochetY = 0; p.ricochetZ = 0;
    this.ctx.events.emit('combat/hit', p);
  }

  /** A restore: a line still in flight belongs to the run that died. */
  reset(): void { this.lineActive = false; this.lineNext = 0; this.list.count = 0; }
}
