// Shot resolution (GDD 6.7, 6.8; ARCHITECTURE 3.6 "A lead round", "A line round", "The kept round"): everything a
// round does happens inside the player's fixedUpdate, on the tick of the click. Scratch structs are created once.
import { ColFlag, LAYER_SHOT, Layer, MAX_LINE_HITS } from '../core/contracts.ts';
import type {
  AmmoType, DamageInfo, EntityKind, GameContext, GameEvents, HitList, HitOutcome, HitResponse, HitResult, KeptContext, Rng, Vec3,
} from '../core/contracts.ts';
import { LINE_HOLD_MAX_SLOPE, LINE_TICKS_PER_HIT, WEAPON } from './defs.ts';
import { rayEntersBore } from './kept.ts';

const DEG = Math.PI / 180;
const GEOMETRY = Layer.WORLD | Layer.DYNAMIC;

function isBody(kind: EntityKind): boolean { return kind === 'bider' || kind === 'transit' || kind === 'tamper' || kind === 'windlass'; }
/** what ends a line round without being asked: solid geometry that is not tagged PIERCE */
function isWall(h: Readonly<HitResult>): boolean { return (h.layer & GEOMETRY) !== 0 && !h.receiver && (h.flags & ColFlag.PIERCE) === 0; }
function isBodyHit(h: Readonly<HitResult>): boolean { return h.receiver !== null && h.entity !== null && isBody(h.entity.kind); }

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
  /**
   * What the round meets, in order: the straight ray's hits and, when it holds its height behind the first body (see
   * `hold`), that body followed by the level ray's. Entries from `seqHeld` on belong to the level ray.
   */
  private readonly seq: HitResult[] = [];
  private seqCount = 0;
  private seqHeld = -1;
  private readonly held: HitList;
  private readonly heldOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly heldDir: Vec3 = { x: 0, y: 0, z: -1 };
  private readonly heldEnd: Vec3 = { x: 0, y: 0, z: 0 };
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
    this.held = ctx.collision.createHitList();
    for (let i = 0; i < MAX_LINE_HITS * 2; i++) this.seq.push(this.hit);
  }

  /** hits of a line round still waiting for their tick */
  get pending(): number { return this.lineActive ? this.seqCount - this.lineNext : 0; }
  /** true while the line round in flight has left its aim ray to hold the height of the first body (debug, tests) */
  get holding(): boolean { return this.lineActive && this.seqHeld >= 0; }

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
    let walled = false;
    for (let i = 0; i < n; i++) {
      const h = list.hits[i] as HitResult;
      this.seq[i] = h;
      if (!walled && isWall(h)) { walled = true; f.endX = h.x; f.endY = h.y; f.endZ = h.z; }
    }
    this.seqCount = n; this.seqHeld = -1;
    this.lineActive = true; this.lineNext = 0; this.lineTicks = 0; this.lineShot = shotId;
    this.lineBodies = 0; this.lineFreed = 0; this.lineKnots = 0;
    this.lineOrigin.x = o.x; this.lineOrigin.y = o.y; this.lineOrigin.z = o.z;
    this.lineDir.x = d.x; this.lineDir.y = d.y; this.lineDir.z = d.z;
    const r = this.resolvedPayload;
    r.endX = f.endX; r.endY = f.endY; r.endZ = f.endZ;
    if (this.hold(n, range)) {
      // the aim ray is drawn as far as the body it went through (render, on `weapon/fired`); the level run from there is ours
      const lead = this.seq[this.seqHeld - 1] as HitResult, e = this.heldEnd;
      f.endX = lead.x; f.endY = lead.y; f.endZ = lead.z;
      r.endX = e.x; r.endY = e.y; r.endZ = e.z;
      ctx.events.emit('weapon/fired', f);
      ctx.render.vfx.line('line_round', lead.x, lead.y, lead.z, e.x, e.y, e.z);
      this.advanceLine();
      return;
    }
    ctx.events.emit('weapon/fired', f);
    this.advanceLine();                                    // entry 0 on the click's tick
  }
  /**
   * "One round, one line" (pass i4, combat review). The eye is at 1.65 m and a Bider's body at 0.6 m: a round aimed at
   * the first of a file slopes into the sand behind the second. So once the round has gone through a body it may HOLD
   * THAT HEIGHT for the rest of its range: from the point where it met the first body it runs level, on the same
   * heading. It does so only when that is strictly better for her: the level run must meet every receiver the aim ray
   * would have met behind that body (the same entity, the same part: a knot, a weak point or a plate is never traded
   * away) and at least one body more. Otherwise the round flies as aimed, as before. Decided on the click's tick from
   * the two rays; returns true when the sequence now ends in the level run (`seqHeld` is its first entry).
   */
  private hold(n: number, range: number): boolean {
    const d = this.lineDir, list = this.list;
    if (d.y > LINE_HOLD_MAX_SLOPE || d.y < -LINE_HOLD_MAX_SLOPE) return false;
    // the first body on the aim ray, if no wall comes before it
    let b = -1;
    for (let i = 0; i < n; i++) {
      const h = list.hits[i] as HitResult;
      if (isWall(h)) return false;
      if (isBodyHit(h)) { b = i; break; }
    }
    if (b < 0) return false;
    const lead = list.hits[b] as HitResult, leadId = (lead.entity as NonNullable<HitResult['entity']>).id;
    const left = range - lead.distance;
    if (left <= 0.5) return false;
    const hl = Math.sqrt(d.x * d.x + d.z * d.z);
    const hd = this.heldDir, ho = this.heldOrigin;
    hd.x = d.x / hl; hd.y = 0; hd.z = d.z / hl;
    ho.x = lead.x; ho.y = lead.y; ho.z = lead.z;
    const held = this.held;
    const m = this.ctx.collision.raycastAll(ho.x, ho.y, ho.z, hd.x, hd.y, hd.z, left, LAYER_SHOT, held);
    // the level run as far as its wall
    let heldStop = m, heldBodies = 0;
    for (let k = 0; k < m; k++) {
      const h = held.hits[k] as HitResult;
      if (isWall(h)) { heldStop = k + 1; break; }
      if (isBodyHit(h) && (h.entity as NonNullable<HitResult['entity']>).id !== leadId) heldBodies++;
    }
    // what the aim ray meets behind the first body: every receiver of it must be in the level run too
    let aimBodies = 0;
    for (let i = b + 1; i < n; i++) {
      const h = list.hits[i] as HitResult;
      if (isWall(h)) break;
      if (!h.receiver) continue;
      if (!h.entity) return false;
      let kept = false;
      for (let k = 0; k < heldStop && !kept; k++) {
        const g = held.hits[k] as HitResult;
        kept = g.entity !== null && g.entity.id === h.entity.id && g.part === h.part;
      }
      if (!kept) return false;
      if (isBody(h.entity.kind)) aimBodies++;
    }
    if (heldBodies <= aimBodies) return false;
    let count = b + 1;
    this.seqHeld = count;
    const e = this.heldEnd;
    e.x = ho.x + hd.x * left; e.y = ho.y; e.z = ho.z + hd.z * left;
    for (let k = 0; k < heldStop && count < this.seq.length; k++) {
      const h = held.hits[k] as HitResult;
      // the body it has just gone through (the level ray starts on its skin) and anything it already met
      if (h.entity !== null && this.met(h.entity.id, b)) continue;
      this.seq[count++] = h;
      if (isWall(h)) { e.x = h.x; e.y = h.y; e.z = h.z; }
    }
    this.seqCount = count;
    return true;
  }
  private met(id: string, upTo: number): boolean {
    for (let i = 0; i <= upTo; i++) { const h = this.list.hits[i] as HitResult; if (h.entity !== null && h.entity.id === id) return true; }
    return false;
  }

  /** Called once per sim tick after the weapon: the line round's next bodies. */
  tick(): void {
    if (!this.lineActive) return;
    this.lineTicks++;
    this.advanceLine();
  }
  private flushLine(): void { this.lineTicks = 1 << 20; this.advanceLine(); }
  private advanceLine(): void {
    const col = this.ctx.collision;
    while (this.lineActive) {
      const i = this.lineNext;
      if (i >= this.seqCount) { this.finishLine(); return; }
      // an entry of the level run is a hit of THAT ray: its origin and heading are what a receiver and the ricochet read
      const level = this.seqHeld >= 0 && i >= this.seqHeld;
      const o = level ? this.heldOrigin : this.lineOrigin, d = level ? this.heldDir : this.lineDir;
      if (Math.round(i * LINE_TICKS_PER_HIT) > this.lineTicks) return;
      this.lineNext = i + 1;
      const h = this.seq[i] as HitResult;
      let stop: boolean;
      if (h.receiver) {
        // an entity destroyed before its turn (its volume is gone or disabled) is skipped
        if (h.entity && !col.volumeCentre(h.entity.id, h.part, this.centre)) continue;
        this.receive(h, this.fillDamage('line_round', this.lineShot, o, d));
        stop = this.response.stopsLine;
      } else {
        const res = this.response;
        res.outcome = 'impact'; res.damageDealt = 0; res.healthLeft = 0;
        // static or dynamic geometry stops the line unless it is tagged PIERCE; an inert volume never does
        stop = isWall(h);
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
  reset(): void { this.lineActive = false; this.lineNext = 0; this.list.count = 0; this.held.count = 0; this.seqCount = 0; this.seqHeld = -1; }
}
