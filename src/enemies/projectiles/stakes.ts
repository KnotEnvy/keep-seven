// src/enemies/projectiles/stakes.ts: stakes in flight (pool of 8) and stuck stakes (cap 18, shared by the Transits and
// the Windlass, instanced, cooling to dull orange over 6 s, oldest recycled). GDD 7.2, 8.3; work order 4.4.
import * as THREE from 'three';
import { LAYER_SOLID, Layer, PLAYER_HEIGHT, PLAYER_RADIUS } from '../../core/contracts.ts';
import type { DamageInfo, EncounterId, EnemyKind, EntityId, EntityRef, HitReceiver, HitResponse, HitResult, SurfaceType } from '../../core/contracts.ts';
import { STAKES, TRANSIT } from '../defs.ts';
import type { Shared, StakeShot, StakesApi } from '../internals.ts';
import { respond } from '../internals.ts';

class Stake implements HitReceiver {
  live = false;
  x = 0; y = 0; z = 0;
  dx = 0; dy = 0; dz = -1;
  ox = 0; oy = 0; oz = 0;
  speed = 18;
  damage = 22;
  kind: 'stake' | 'fan' = 'stake';
  source: EnemyKind = 'transit';
  sourceId: EntityId = '';
  encounter: EncounterId | '' = '';
  harmful = true;
  /** metres left before it sticks in the air at its target (0: no such target) */
  left = 0;
  age = 0;
  volume = -1;
  handle = -1;
  readonly ref: EntityRef;
  constructor(readonly index: number, private readonly owner: Stakes) { this.ref = { id: `stake#${index}`, kind: 'stake' }; }
  onHit(_hit: Readonly<HitResult>, _damage: Readonly<DamageInfo>, out: HitResponse): void {
    // GDD 6.7: a stake in flight bursts in sparks under any round; never required
    respond(out, 'broke', true, false, 0, 0);
    this.owner.burst(this, 'shot');
  }
}

interface Stuck { used: boolean; age: number; cooled: boolean; hot: number; cool: number; order: number; x: number; y: number; z: number; dx: number; dy: number; dz: number }

const DULL: readonly [number, number, number] = [0.62, 0.34, 0.16];

export class Stakes implements StakesApi {
  private readonly flight: Stake[] = [];
  private readonly held: Stuck[] = [];
  private order = 0;
  flying = 0;
  stuck = 0;
  fanHits = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly fwd = new THREE.Vector3(0, 0, 1);
  private readonly dir = new THREE.Vector3();
  private handlesReady = false;

  constructor(private readonly S: Shared) {
    for (let i = 0; i < STAKES.inFlight; i++) this.flight.push(new Stake(i, this));
    for (let i = 0; i < STAKES.stuck; i++) this.held.push({ used: false, age: 0, cooled: false, hot: -1, cool: -1, order: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1 });
  }

  /** Volumes once (start()); instanced handles whenever the instanced meshes were rebuilt (a set swap). */
  createVolumes(): void {
    const col = this.S.ctx.collision;
    for (const s of this.flight) {
      if (s.volume >= 0) continue;
      s.volume = col.addVolume({ shape: 'sphere', layer: Layer.PROJECTILE, flags: 0, surface: 'metal', entity: s.ref, part: 'whole', priority: 0, receiver: s });
      col.setSphere(s.volume, 0, -1000, 0, STAKES.hitRadius);
      col.setVolumeEnabled(s.volume, false);
    }
  }
  rebuildInstances(): void {
    const inst = this.S.ctx.render.instances;
    const active = this.S.ctx.assets.isActive('proj_stake');
    for (const s of this.flight) {
      if (s.handle >= 0) inst.remove(s.handle);
      s.handle = active ? inst.add('proj_stake', 'stake_hot', 0, -1000, 0, 0, 1) : -1;
      if (s.handle >= 0) { if (s.live) this.place(s.handle, s.x, s.y, s.z, s.dx, s.dy, s.dz); else inst.setVisible(s.handle, false); }
    }
    for (const k of this.held) {
      if (k.hot >= 0) inst.remove(k.hot);
      if (k.cool >= 0) inst.remove(k.cool);
      k.hot = active ? inst.add('proj_stake', 'stake_hot', 0, -1000, 0, 0, 1) : -1;
      k.cool = active ? inst.add('proj_stake', 'stake_cool', 0, -1000, 0, 0, 1) : -1;
      if (k.hot >= 0) inst.setVisible(k.hot, false);
      if (k.cool >= 0) inst.setVisible(k.cool, false);
      k.used = false;
    }
    // Both sets carry a per-instance colour from the start. stake_hot and stake_cool share one material: if only the
    // hot set had instance colours (after the first cooling tint), three would rebuild the material's program key for
    // each of the two meshes every frame (about 5 KB each; measured 11 KB per frame beside the stub renderer).
    for (const k of this.held) {
      if (k.hot >= 0) inst.setTint(k.hot, 1, 1, 1);
      if (k.cool >= 0) inst.setTint(k.cool, 1, 1, 1);
    }
    for (const s of this.flight) if (s.handle >= 0) inst.setTint(s.handle, 1, 1, 1);
    this.stuck = 0;
    this.handlesReady = active;
  }

  /** Tip at (x, y, z), pointing along the unit direction (the asset's pivot is its tip, its length along -Z behind it). */
  private place(handle: number, x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    if (handle < 0) return;
    this.q.setFromUnitVectors(this.fwd, this.dir.set(dx, dy, dz));
    this.m.compose(this.p.set(x, y, z), this.q, this.one);
    this.S.ctx.render.instances.setMatrix(handle, this.m);
  }

  get cooled(): number { let n = 0; for (let i = 0; i < this.held.length; i++) { const k = this.held[i] as Stuck; if (k.used && k.cooled) n++; } return n; }

  fire(shot: Readonly<StakeShot>): boolean {
    const { S } = this;
    let s: Stake | null = null;
    for (let i = 0; i < this.flight.length; i++) if (!(this.flight[i] as Stake).live) { s = this.flight[i] as Stake; break; }
    if (!s) return false;
    s.live = true; s.age = 0;
    s.x = shot.ox; s.y = shot.oy; s.z = shot.oz;
    s.ox = shot.ox; s.oy = shot.oy; s.oz = shot.oz;
    s.dx = shot.dx; s.dy = shot.dy; s.dz = shot.dz;
    s.speed = shot.speed; s.damage = shot.damage; s.kind = shot.kind;
    s.source = shot.source; s.sourceId = shot.sourceId; s.encounter = shot.encounter; s.harmful = shot.harmful;
    s.left = shot.maxDistance;
    this.flying++;
    const col = S.ctx.collision;
    col.setSphere(s.volume, s.x, s.y, s.z, STAKES.hitRadius);
    col.setVolumeEnabled(s.volume, true);
    if (s.handle >= 0) { S.ctx.render.instances.setVisible(s.handle, true); this.place(s.handle, s.x, s.y, s.z, s.dx, s.dy, s.dz); }
    const e = S.ev.projSpawned;
    e.x = s.x; e.y = s.y; e.z = s.z; e.id = s.ref.id; e.kind = 'stake'; e.source = s.source;
    S.ctx.events.emit('projectile/spawned', e);
    return true;
  }

  private retire(s: Stake): void {
    if (!s.live) return;
    s.live = false;
    this.flying--;
    this.S.ctx.collision.setVolumeEnabled(s.volume, false);
    if (s.handle >= 0) this.S.ctx.render.instances.setVisible(s.handle, false);
  }

  burst(s: Stake, reason: 'shot' | 'hush' | 'parry' | 'fuse'): void {
    if (!s.live) return;
    const e = this.S.ev.projBurst;
    e.x = s.x; e.y = s.y; e.z = s.z; e.id = s.ref.id; e.kind = 'stake'; e.reason = reason;
    this.retire(s);
    this.S.ctx.events.emit('projectile/burst', e);
  }

  burstAll(reason: 'hush' | 'fuse'): number {
    let n = 0;
    for (let i = 0; i < this.flight.length; i++) { const s = this.flight[i] as Stake; if (s.live) { this.burst(s, reason); n++; } }
    return n;
  }

  /** Remove without events: every stake (null), or the ones in flight of one encounter. Stuck stakes go only with null. */
  clear(encounter: EncounterId | '' | null): void {
    for (let i = 0; i < this.flight.length; i++) {
      const s = this.flight[i] as Stake;
      if (s.live && (encounter === null || s.encounter === encounter)) this.retire(s);
    }
    if (encounter !== null) return;
    const inst = this.S.ctx.render.instances;
    for (const k of this.held) {
      if (!k.used) continue;
      k.used = false;
      if (k.hot >= 0) inst.setVisible(k.hot, false);
      if (k.cool >= 0) inst.setVisible(k.cool, false);
    }
    this.stuck = 0;
    this.fanHits = 0;
  }

  private stick(s: Stake, x: number, y: number, z: number, surface: SurfaceType, hitPlayer: boolean): void {
    const { S } = this;
    const e = S.ev.projLanded;
    e.x = x; e.y = y; e.z = z; e.id = s.ref.id; e.kind = 'stake'; e.surface = surface; e.hitPlayer = hitPlayer;
    if (!hitPlayer && this.handlesReady) {
      // the oldest slot is recycled (cap 18)
      let k: Stuck | null = null;
      for (let i = 0; i < this.held.length; i++) {
        const c = this.held[i] as Stuck;
        if (!c.used) { k = c; break; }
        if (!k || c.order < k.order) k = c;
      }
      if (k) {
        const inst = S.ctx.render.instances;
        if (!k.used) this.stuck++;
        if (k.cool >= 0) inst.setVisible(k.cool, false);
        k.used = true; k.age = 0; k.cooled = false; k.order = ++this.order;
        k.x = x; k.y = y; k.z = z; k.dx = s.dx; k.dy = s.dy; k.dz = s.dz;
        if (k.hot >= 0) { inst.setVisible(k.hot, true); inst.setTint(k.hot, 1, 1, 1); this.place(k.hot, x, y, z, s.dx, s.dy, s.dz); }
      }
    }
    this.retire(s);
    S.ctx.events.emit('projectile/landed', e);
  }

  private advance(s: Stake, dt: number): void {
    const { S } = this;
    const col = S.ctx.collision, hit = S.rayHit;
    const len = s.speed * dt;
    const wall = col.raycast(s.x, s.y, s.z, s.dx, s.dy, s.dz, len, LAYER_SOLID, hit);
    const reach = wall ? hit.distance : len;
    const ex = s.x + s.dx * reach, ey = s.y + s.dy * reach, ez = s.z + s.dz * reach;
    if (s.harmful && S.pAlive && col.segmentHitsCapsule(s.x, s.y, s.z, ex, ey, ez, TRANSIT.stakeRadius, S.px, S.py, S.pz, PLAYER_RADIUS, PLAYER_HEIGHT)) {
      // GDD 8.2: at most two stakes of one fan can hurt her
      const spent = s.kind === 'fan' && this.fanHits >= 2;
      if (!spent) {
        if (s.kind === 'fan') this.fanHits++;
        const d = S.dmg;
        d.kind = s.kind === 'fan' ? 'fan' : 'stake'; d.source = s.source === 'windlass' ? 'windlass' : 'transit'; d.sourceId = s.sourceId;
        d.ox = s.ox; d.oy = s.oy; d.oz = s.oz;
        S.hurt(s.damage);
      }
      this.stick(s, S.px, S.py + 1.1, S.pz, 'cloth', true);
      return;
    }
    if (wall) { this.stick(s, hit.x, hit.y, hit.z, hit.surface, false); return; }
    if (s.left > 0) {
      s.left -= len;
      if (s.left <= 0) { const back = -s.left; this.stick(s, ex - s.dx * back, ey - s.dy * back, ez - s.dz * back, 'metal', false); return; }
    }
    s.x = ex; s.y = ey; s.z = ez;
    s.age += dt;
    if (s.age > STAKES.life) { this.burst(s, 'fuse'); return; }
    col.setSphere(s.volume, s.x, s.y, s.z, STAKES.hitRadius);
    this.place(s.handle, s.x, s.y, s.z, s.dx, s.dy, s.dz);
  }

  tick(dt: number): void {
    if (this.flying > 0) {
      for (let i = 0; i < this.flight.length; i++) { const s = this.flight[i] as Stake; if (s.live) this.advance(s, dt); }
    }
    if (this.stuck > 0 && (this.S.tick % 6) === 0) this.cool(dt * 6);
  }

  /** Stuck stakes cool to dull orange over 6 s (a tint ten times a second), then swap to the cool mesh. */
  private cool(dt: number): void {
    const inst = this.S.ctx.render.instances;
    for (let i = 0; i < this.held.length; i++) {
      const k = this.held[i] as Stuck;
      if (!k.used || k.cooled) continue;
      k.age += dt;
      const f = k.age >= STAKES.coolSeconds ? 1 : k.age / STAKES.coolSeconds;
      if (f >= 1) {
        k.cooled = true;
        if (k.hot >= 0) inst.setVisible(k.hot, false);
        if (k.cool >= 0) { inst.setVisible(k.cool, true); this.place(k.cool, k.x, k.y, k.z, k.dx, k.dy, k.dz); }
      } else if (k.hot >= 0) {
        inst.setTint(k.hot, 1 + (DULL[0] - 1) * f, 1 + (DULL[1] - 1) * f, 1 + (DULL[2] - 1) * f);
      }
    }
  }
}
