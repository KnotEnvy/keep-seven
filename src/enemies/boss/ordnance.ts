// src/enemies/boss/ordnance.ts: what the Windlass throws besides single stakes (GDD 8.2): canisters (lobbed, a ticked
// ring, a burst for 38), the lance (a thread on the start edge, then a blade across the arm's 70 degree arc) and the
// fan (six stakes across 24 degrees, at most two may hurt her). Pools: canister rings 2, lance 1.
import type { FxHandle } from '../../core/contracts.ts';
import { BOSS } from '../defs.ts';
import type { Shared } from '../internals.ts';
import { bearingDeg, clampToArc, offArc } from './arm.ts';
import type { Boss } from './index.ts';

interface Canister { live: boolean; ring: boolean; t: number; sx: number; sy: number; sz: number; tx: number; ty: number; tz: number; x: number; y: number; z: number; damage: number; handle: number; burstPending: boolean }

const RAD = Math.PI / 180;

export class Ordnance {
  private readonly canisters: Canister[] = [];
  /** rings on the floor right now (max 2) */
  rings = 0;
  flying = 0;
  // ---- lance
  lanceStage: 'none' | 'thread' | 'sweep' = 'none';
  private lanceT = 0;
  private lanceFrom = 0;
  private lanceDir = 1;
  private lanceBearing = 0;
  private lanceHit = false;
  private lancePending = false;
  private lanceFlip = false;
  private thread: FxHandle | null = null;
  private blade: FxHandle | null = null;
  private lanceDamage = 30;
  // ---- fan
  fanStage: 'none' | 'spinup' | 'firing' = 'none';
  private fanT = 0;
  private fanFired = 0;
  private fanBearing = 0;
  private fanDist = 8;
  private fanDamage = 18;
  private fanTy = 0;
  private instancesReady = false;

  constructor(private readonly S: Shared, private readonly B: Boss) {
    for (let i = 0; i < BOSS.canisterRings; i++) this.canisters.push({ live: false, ring: false, t: 0, sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, x: 0, y: 0, z: 0, damage: 38, handle: -1, burstPending: false });
  }

  rebuildInstances(): void {
    const inst = this.S.ctx.render.instances;
    const active = this.S.ctx.assets.isActive('proj_canister');
    for (const c of this.canisters) {
      if (c.handle >= 0) inst.remove(c.handle);
      c.handle = active ? inst.add('proj_canister', '', 0, -1000, 0, 0, 1) : -1;
      if (c.handle >= 0) inst.setTint(c.handle, 1, 1, 1);          // every instanced set of the module carries instance colours (pool.ts addInstance)
      if (c.handle >= 0) inst.setVisible(c.handle, false);
      c.live = false; c.ring = false;
    }
    this.rings = 0; this.flying = 0;
    this.instancesReady = active;
  }

  // ---- canisters ------------------------------------------------------------------------------------------
  /** Lob one from the canister mouth to a point on the floor. False when two are already out (max 2 rings alive). */
  launchCanister(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, damage: number): boolean {
    const { S } = this;
    let c: Canister | null = null;
    for (let i = 0; i < this.canisters.length; i++) if (!(this.canisters[i] as Canister).live) { c = this.canisters[i] as Canister; break; }
    if (!c) return false;
    c.live = true; c.ring = false; c.t = 0; c.burstPending = false;
    c.sx = ox; c.sy = oy; c.sz = oz; c.tx = tx; c.ty = ty; c.tz = tz;
    c.x = ox; c.y = oy; c.z = oz;
    c.damage = damage;
    this.flying++;
    if (c.handle >= 0) { S.ctx.render.instances.setVisible(c.handle, true); S.ctx.render.instances.setTransform(c.handle, ox, oy, oz, 0, 1); }
    const e = S.ev.projSpawned;
    e.x = ox; e.y = oy; e.z = oz; e.id = c === this.canisters[0] ? 'canister#0' : 'canister#1'; e.kind = 'canister'; e.source = 'windlass';
    S.ctx.events.emit('projectile/spawned', e);
    return true;
  }

  private idOf(c: Canister): string { return c === this.canisters[0] ? 'canister#0' : 'canister#1'; }

  private endCanister(c: Canister): void {
    if (!c.live) return;
    if (c.ring) this.rings--; else this.flying--;
    c.live = false; c.ring = false;
    if (c.handle >= 0) this.S.ctx.render.instances.setVisible(c.handle, false);
  }

  private tickCanister(c: Canister, dt: number): void {
    const { S } = this;
    c.t += dt;
    if (!c.ring) {
      // a lob: 1.2 s of flight, landing where she stood at the launch
      const u = c.t >= BOSS.canisterFlight ? 1 : c.t / BOSS.canisterFlight;
      c.x = c.sx + (c.tx - c.sx) * u; c.z = c.sz + (c.tz - c.sz) * u;
      c.y = c.sy + (c.ty - c.sy) * u + 3.0 * 4 * u * (1 - u);
      if (c.handle >= 0) S.ctx.render.instances.setTransform(c.handle, c.x, c.y, c.z, c.t * 6, 1);
      if (u < 1) return;
      c.ring = true; c.t = 0;
      this.flying--; this.rings++;
      c.x = c.tx; c.y = c.ty; c.z = c.tz;
      if (c.handle >= 0) S.ctx.render.instances.setTransform(c.handle, c.x, c.y + 0.15, c.z, 0, 1);
      const e = S.ev.projLanded;
      e.x = c.x; e.y = c.y; e.z = c.z; e.id = this.idOf(c); e.kind = 'canister'; e.surface = 'ceramic'; e.hitPlayer = false;
      S.ctx.events.emit('projectile/landed', e);
      // a hot-orange ticked ring, radius 3.5 m, for 1.0 s
      S.ctx.render.vfx.ring('canister', c.x, c.y, c.z, BOSS.canisterRing, BOSS.canisterFuse, 0.1);
      return;
    }
    if (c.t < BOSS.canisterFuse && !c.burstPending) return;
    // the burst: 38 within the ring, unless something that blocks boss fire stands between (GDD 8.2)
    const dx = S.px - c.x, dz = S.pz - c.z, dy = S.py - c.y;
    let hurt = S.pAlive && dx * dx + dz * dz <= BOSS.canisterRing * BOSS.canisterRing && Math.abs(dy) < 2.5;
    if (hurt) {
      const los = S.sight(c.x, c.y + 0.6, c.z, S.px, S.py + 1.0, S.pz);
      if (los < 0) { c.burstPending = true; return; }            // the ray budget is spent: burst on the next tick
      hurt = los === 1;
    }
    const e = S.ev.projBurst;
    e.x = c.x; e.y = c.y; e.z = c.z; e.id = this.idOf(c); e.kind = 'canister'; e.reason = 'fuse';
    this.endCanister(c);
    S.ctx.events.emit('projectile/burst', e);
    if (hurt) {
      const d = S.dmg;
      d.kind = 'canister'; d.source = 'windlass'; d.sourceId = 'windlass';
      d.ox = c.x; d.oy = c.y + 0.3; d.oz = c.z;
      S.hurt(c.damage);
    }
  }

  // ---- the lance ---------------------------------------------------------------------------------------------
  /** A dashed thread on the sweep's start edge for 1.2 s, then the blade (GDD 8.2). */
  startLance(damage: number): void {
    const { S } = this;
    this.lanceFlip = !this.lanceFlip;
    this.lanceDir = this.lanceFlip ? 1 : -1;
    this.lanceFrom = this.B.arm.heading - this.lanceDir * BOSS.lanceArcDeg / 2;
    this.lanceBearing = this.lanceFrom;
    this.lanceStage = 'thread';
    this.lanceT = 0;
    this.lanceHit = false; this.lancePending = false;
    this.lanceDamage = damage;
    this.thread = S.ctx.render.vfx.acquireLine('lance_thread');
    this.placeLance(this.thread);
  }
  private placeLance(h: FxHandle | null): void {
    if (!h) return;
    const B = this.B;
    const b = this.lanceBearing * RAD;
    const sx = Math.sin(b), sz = -Math.cos(b);
    const y = B.axisY + BOSS.lanceHeight;
    h.setPosition(B.axisX + sx * 3.7, y, B.axisZ + sz * 3.7);
    h.setEnd(B.axisX + sx * BOSS.lanceRange, y, B.axisZ + sz * BOSS.lanceRange);
  }
  private endLance(): void {
    if (this.thread) { this.thread.release(); this.thread = null; }
    if (this.blade) { this.blade.release(); this.blade = null; }
    this.lanceStage = 'none';
  }
  private tickLance(dt: number): void {
    const { S, B } = this;
    this.lanceT += dt;
    if (this.lanceStage === 'thread') {
      if (this.lanceT < BOSS.lanceThread) return;
      if (this.thread) { this.thread.release(); this.thread = null; }
      this.lanceStage = 'sweep';
      this.lanceT = 0;
      this.blade = S.ctx.render.vfx.acquireCard('lance');
      this.placeLance(this.blade);
      B.discharged('lance', BOSS.lanceThread, false);
      return;
    }
    // the sweep: 70 degrees in 2.5 s (28 degrees per second), 30 damage once; ribs block it
    const prev = this.lanceBearing;
    const u = this.lanceT >= BOSS.lanceSweep ? 1 : this.lanceT / BOSS.lanceSweep;
    this.lanceBearing = this.lanceFrom + this.lanceDir * BOSS.lanceArcDeg * u;
    this.placeLance(this.blade);
    if (!this.lanceHit && S.pAlive) {
      const dx = S.px - B.axisX, dz = S.pz - B.axisZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const chest = B.axisY + BOSS.lanceHeight;
      if (dist > 3.6 && dist <= BOSS.lanceRange && S.py <= chest && S.py + 1.8 >= chest) {
        const pb = bearingDeg(S.px, S.pz, B.axisX, B.axisZ);
        const half = Math.asin(Math.min(1, 0.35 / dist)) / RAD;
        const a = offArc(pb, prev) * this.lanceDir, b = offArc(pb, this.lanceBearing) * this.lanceDir;
        // the blade passed over her this tick (or is on her)
        if (this.lancePending || (a >= -half && b <= half)) {
          const br = pb * RAD;
          const los = S.sight(B.axisX + Math.sin(br) * 3.7, chest + 0.1, B.axisZ - Math.cos(br) * 3.7, S.px, chest + 0.1, S.pz);
          if (los < 0) this.lancePending = true;
          else {
            this.lancePending = false;
            this.lanceHit = true;
            if (los === 1) {
              const d = S.dmg;
              d.kind = 'lance'; d.source = 'windlass'; d.sourceId = 'windlass';
              d.ox = B.axisX; d.oy = chest; d.oz = B.axisZ;
              S.hurt(this.lanceDamage);
            }
          }
        }
      }
    }
    if (u >= 1) this.endLance();
  }

  // ---- the fan -------------------------------------------------------------------------------------------------
  /** 1.2 s of spin-up, then six stakes in 1.2 s across a 24 degree spread aimed where she stood at the start of the volley. */
  startFan(damage: number): void {
    this.fanStage = 'spinup';
    this.fanT = 0;
    this.fanFired = 0;
    this.fanDamage = damage;
    this.S.stakes.fanHits = 0;
  }
  /** 0..1 through the spin-up (the lamps flash in turn, or ramp with Reduce Flashes), -1 otherwise */
  get fanSpinUp(): number { return this.fanStage === 'spinup' ? Math.min(1, this.fanT / BOSS.fanSpinUp) : -1; }
  private tickFan(dt: number): void {
    const { S, B } = this;
    this.fanT += dt;
    if (this.fanStage === 'spinup') {
      if (this.fanT < BOSS.fanSpinUp) return;
      this.fanStage = 'firing';
      this.fanT = 0;
      const dx = S.px - B.axisX, dz = S.pz - B.axisZ;
      this.fanDist = Math.max(4.5, Math.sqrt(dx * dx + dz * dz));
      this.fanBearing = clampToArc(bearingDeg(S.px, S.pz, B.axisX, B.axisZ), B.arm.heading);
      this.fanTy = S.py + 1.1;
      B.discharged('fan', BOSS.fanSpinUp, false);
    }
    const gap = BOSS.fanSeconds / BOSS.fanStakes;
    while (this.fanFired < BOSS.fanStakes && this.fanT >= this.fanFired * gap) {
      const j = this.fanFired++;
      const bearing = (this.fanBearing - BOSS.fanSpreadDeg / 2 + j * BOSS.fanSpreadDeg / (BOSS.fanStakes - 1)) * RAD;
      const tx = B.axisX + Math.sin(bearing) * this.fanDist, tz = B.axisZ - Math.cos(bearing) * this.fanDist;
      B.fireStake(tx, this.fanTy, tz, this.fanDamage, 'fan');
    }
    if (this.fanFired >= BOSS.fanStakes && this.fanT >= BOSS.fanSeconds) this.fanStage = 'none';
  }

  // ---- all of it -----------------------------------------------------------------------------------------------
  get busy(): boolean { return this.lanceStage !== 'none' || this.fanStage !== 'none'; }

  tick(dt: number): void {
    if (this.flying > 0 || this.rings > 0) {
      for (let i = 0; i < this.canisters.length; i++) { const c = this.canisters[i] as Canister; if (c.live) this.tickCanister(c, dt); }
    }
    if (this.lanceStage !== 'none') this.tickLance(dt);
    if (this.fanStage !== 'none') this.tickFan(dt);
  }

  /** The hush: every canister bursts harmlessly, the lance and the fan stop. Returns how many canisters burst. */
  burstAll(): number {
    const { S } = this;
    let n = 0;
    for (let i = 0; i < this.canisters.length; i++) {
      const c = this.canisters[i] as Canister;
      if (!c.live) continue;
      const e = S.ev.projBurst;
      e.x = c.x; e.y = c.y; e.z = c.z; e.id = this.idOf(c); e.kind = 'canister'; e.reason = 'hush';
      this.endCanister(c);
      S.ctx.events.emit('projectile/burst', e);
      n++;
    }
    this.endLance();
    this.fanStage = 'none';
    return n;
  }

  /** Without events (a reset). */
  clear(): void {
    for (let i = 0; i < this.canisters.length; i++) this.endCanister(this.canisters[i] as Canister);
    this.endLance();
    this.fanStage = 'none';
    this.lanceFlip = false;
  }

  get ready(): boolean { return this.instancesReady; }
}
