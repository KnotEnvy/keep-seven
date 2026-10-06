// Core stub for the audio slot: silent, but it logs what it WOULD voice, so "no bullet produces nothing" can be
// asserted before real audio exists.
import type { AudioSystem, DebugSnapshot, GameContext } from '../contracts.ts';

const RING = 128;

class NullAudio implements AudioSystem {
  readonly id = 'audio' as const;
  unlocked = false;
  readonly voices = 0;
  private readonly names: string[] = [];
  private readonly ticks: number[] = [];
  private head = 0;
  private count = 0;
  private readonly off: (() => void)[] = [];
  constructor(private readonly ctx: GameContext) {}

  private log(name: string): void {
    this.names[this.head] = name; this.ticks[this.head] = this.ctx.clock.tick;
    this.head = (this.head + 1) % RING;
    if (this.count < RING) this.count++;
  }
  init(): void {
    const e = this.ctx.events;
    this.off.push(e.on('weapon/fired', (p) => this.log('weapon/fired:' + p.ammo)));
    this.off.push(e.on('combat/hit', (p) => this.log('combat/hit:' + p.outcome)));
    this.off.push(e.on('audio/cue', (p) => this.log('audio/cue:' + p.cue)));
  }
  unlock(): void { this.unlocked = true; }
  recent(n: number): { name: string; tick: number }[] {
    const out: { name: string; tick: number }[] = [];
    const k = Math.min(n, this.count);
    for (let i = k; i >= 1; i--) {
      const j = (this.head - i + RING * 2) % RING;
      out.push({ name: this.names[j] as string, tick: this.ticks[j] as number });
    }
    return out;
  }
  debugState(): DebugSnapshot {
    return { stub: 'nullAudio', unlocked: this.unlocked, voices: 0, recent: this.recent(16).map((r) => r.name + '@' + r.tick) };
  }
  dispose(): void { for (const f of this.off) f(); this.off.length = 0; }
}

export function createNullAudio(ctx: GameContext): AudioSystem { return new NullAudio(ctx); }
