// src/enemies/tokens.ts: attack tokens and the alive cap (GDD 7; game-feel 3.3). Pure logic: no DOM, no three.js.
//
// One pool: `cap` concurrent attacks (2 on Normal, Easy 1, Hard 3), inside it at most 2 melee, 1 ranged and 1 heavy.
// A token is held from the start of the wind-up to the end of the strike; the holder then waits 0.6 s before it may ask
// again, and no two attacks start within 0.3 s of each other. Time is the caller's game clock (seconds).
import { CAPS } from './defs.ts';

export type TokenKind = 'melee' | 'ranged' | 'heavy';
const KINDS: readonly TokenKind[] = ['melee', 'ranged', 'heavy'];
const SUB_CAP: Readonly<Record<TokenKind, number>> = { melee: CAPS.subMelee, ranged: CAPS.subRanged, heavy: CAPS.subHeavy };

export class Tokens {
  /** total concurrent attacks (the difficulty's attackTokens) */
  cap = 2;
  /** an upper bound on top of `cap` while the boss is mid-attack (its adds share one token); 0 = none */
  limit = 0;
  /** token kind held by each slot ('' = none) */
  private readonly held: ('' | TokenKind)[] = [];
  /** game time before which a slot may not ask again */
  private readonly readyAt: Float64Array;
  private lastStart = -1e9;
  private count = 0;
  private readonly perKind: Record<TokenKind, number> = { melee: 0, ranged: 0, heavy: 0 };

  constructor(readonly slots: number) {
    for (let i = 0; i < slots; i++) this.held.push('');
    this.readyAt = new Float64Array(slots);
  }

  reset(): void {
    for (let i = 0; i < this.slots; i++) { this.held[i] = ''; this.readyAt[i] = 0; }
    this.count = 0; this.lastStart = -1e9;
    this.perKind.melee = 0; this.perKind.ranged = 0; this.perKind.heavy = 0;
  }

  get active(): number { return this.count; }
  holds(slot: number): boolean { return this.held[slot] !== ''; }
  kindOf(slot: number): '' | TokenKind { return this.held[slot] ?? ''; }
  countOf(kind: TokenKind): number { return this.perKind[kind]; }
  private effectiveCap(): number { return this.limit > 0 && this.limit < this.cap ? this.limit : this.cap; }

  /** True when `request` would succeed now (no state change). */
  available(kind: TokenKind, slot: number, now: number): boolean {
    if (this.held[slot] !== '') return false;
    if (now < (this.readyAt[slot] as number)) return false;
    if (now - this.lastStart < CAPS.attackStartGap - 1e-9) return false;
    if (this.count >= this.effectiveCap()) return false;
    return this.perKind[kind] < SUB_CAP[kind];
  }

  /** Take a token for an attack that starts now. */
  request(kind: TokenKind, slot: number, now: number): boolean {
    if (!this.available(kind, slot, now)) return false;
    this.held[slot] = kind;
    this.perKind[kind]++;
    this.count++;
    this.lastStart = now;
    return true;
  }

  /** The attack ended (or was cancelled): the slot cools down `cooldown` seconds (0.6 unless the caller says otherwise). */
  release(slot: number, now: number, cooldown: number = CAPS.tokenCooldown): void {
    const kind = this.held[slot];
    if (kind === undefined || kind === '') return;
    this.held[slot] = '';
    this.perKind[kind]--;
    this.count--;
    this.readyAt[slot] = now + cooldown;
  }

  /** Extra waiting for one slot (the half-frequency rule for enemies outside her view cone). */
  delay(slot: number, until: number): void {
    if (until > (this.readyAt[slot] as number)) this.readyAt[slot] = until;
  }

  /** Slot indices holding each kind, for EnemiesDebug.tokens (allocates: debug only). */
  holders(kind: TokenKind): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.slots; i++) if (this.held[i] === kind) out.push(i);
    return out;
  }
  static readonly KINDS = KINDS;
}

/** The alive cap (GDD 7): 6 outside the boss room, boss + 3 inside it; per kind: transit 2, tamper 1. */
export function mayCome(aliveTotal: number, aliveOfKind: number, maxOfKind: number, bossFight: boolean, addsAlive: number): boolean {
  if (aliveOfKind >= maxOfKind) return false;
  if (bossFight) return addsAlive < CAPS.addsWithBoss;
  return aliveTotal < CAPS.aliveOutsideBoss;
}
