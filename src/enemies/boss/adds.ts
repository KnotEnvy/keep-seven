// src/enemies/boss/adds.ts: the Windlass's Bider adds (GDD 8.2, 10; LEVEL 8). They climb out of the kerb grate
// FARTHEST from the player, never one within 7 m (hold and retry each second). Phase 2: two at each haul start, at most
// 3 alive and 6 in the phase. Phase 3a: one every 8 s, at most 3 alive and 9 in the phase, none after hint T3.
import type { MarkerId, SpawnRequest } from '../../core/contracts.ts';
import { BOSS } from '../defs.ts';
import type { Actor, Shared } from '../internals.ts';
import { MAX_ACTORS } from '../internals.ts';

export interface Grate { id: MarkerId; x: number; z: number }

/**
 * Index of the grate farthest from the player that is at least `minDistance` away; -1 when every grate is too close.
 * `busy` is a bit mask of grates to pass over (a body is still climbing out of them): the next farthest is taken.
 */
export function chooseGrate(px: number, pz: number, grates: readonly Grate[], minDistance: number = BOSS.addMinDistance, busy = 0): number {
  let best = -1, bestD = -1;
  for (let i = 0; i < grates.length; i++) {
    if ((busy & (1 << i)) !== 0) continue;
    const g = grates[i] as Grate;
    const d = Math.sqrt((g.x - px) * (g.x - px) + (g.z - pz) * (g.z - pz));
    if (d < minDistance) continue;
    if (d > bestD) { bestD = d; best = i; }
  }
  return best;
}

/** How many adds a phase-2 haul may ask for: two, inside the phase total of six. */
export function p2Wave(spawnedInPhase: number): number {
  return Math.max(0, Math.min(BOSS.p2AddsPerHaul, BOSS.p2AddsTotal - spawnedInPhase));
}

export class Adds {
  readonly grates: Grate[] = [];
  /** adds still to come (they come one at a time, 0.5 s apart) */
  pending = 0;
  spawned = 0;
  private wait = 0;
  private every = 0;
  stopped = false;
  private readonly request: SpawnRequest = { kind: 'bider', spawn: '', encounter: 'enc_windlass', wave: 'adds', dormantClip: '', entrance: 'climb_out', lane: '', order: 0, counted: true };

  constructor(private readonly S: Shared) {
    const wave = S.ctx.data.layout.encounters.find((e) => e.id === 'enc_windlass')?.waves.find((w) => w.id === 'adds');
    for (const id of wave?.spawns ?? []) {
      const m = S.ctx.data.layout.markers.find((x) => x.id === id);
      if (m) this.grates.push({ id, x: m.pos[0], z: m.pos[2] });
    }
  }

  reset(): void { this.pending = 0; this.spawned = 0; this.wait = 0; this.every = 0; this.stopped = false; }

  alive(): number {
    let n = 0;
    for (let i = 0; i < MAX_ACTORS; i++) { const e = this.S.actors[i] as Actor; if (e.used && e.alive && e.encounter === 'enc_windlass') n++; }
    return n;
  }

  /** A body is on this grate: one still in its climb, or any Bider within a metre of it. */
  private occupied(g: Grate): boolean {
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = this.S.actors[i] as Actor;
      if (!e.used || !e.alive || e.kind !== 'bider') continue;
      const dx = e.x - g.x, dz = e.z - g.z;
      if (dx * dx + dz * dz < BOSS.addGrateClear * BOSS.addGrateClear) return true;
    }
    return false;
  }

  /** Phase 2: a haul begins. */
  haulStarted(): void { this.pending += p2Wave(this.spawned + this.pending); }

  /** Per tick. `phase3` runs the one-every-8-s clock; `active` is false while the Windlass is hushed, frozen or broken. */
  tick(dt: number, phase3: boolean, active: boolean): void {
    if (!active) return;
    if (phase3 && !this.stopped) {
      this.every += dt;
      if (this.every >= BOSS.p3AddEvery) {
        this.every -= BOSS.p3AddEvery;
        if (this.spawned + this.pending < BOSS.p3AddsTotal) this.pending++;
      }
    }
    if (this.pending <= 0) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const cap = phase3 ? BOSS.p3AddsAlive : BOSS.p2AddsAlive;
    if (this.alive() >= cap) { this.wait = BOSS.addRetry; return; }
    // a grate with a body still climbing out of it (or standing on it) is passed over: the second add of a haul takes
    // the next farthest grate instead of rising through the first
    let busy = 0;
    for (let i = 0; i < this.grates.length; i++) if (this.occupied(this.grates[i] as Grate)) busy |= 1 << i;
    const g = chooseGrate(this.S.px, this.S.pz, this.grates, BOSS.addMinDistance, busy);
    if (g < 0) { this.wait = busy !== 0 ? 0.25 : BOSS.addRetry; return; }   // every free grate is within 7 m of her: hold and retry (a second; sooner when one is only busy)
    this.request.spawn = (this.grates[g] as Grate).id;
    const e = this.S.hooks.spawn(this.request);
    if (!e) { this.wait = BOSS.addRetry; return; }
    this.pending--;
    this.spawned++;
    this.wait = 0.5;
  }
}
