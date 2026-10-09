// Health (GDD 5): 100 HP in three segments 34 / 33 / 33, the current segment regenerating after 4 s without damage,
// difficulty scaling, the last-20-HP absorb, the last-hit grace and god mode. Pure logic: no three.js, no DOM.
import type { DamageInfo, DamageKind, DamageSource, Difficulty, EventBus, GameEvents } from '../core/contracts.ts';
import {
  ABSORB_BELOW, ABSORB_SCALE, DAMAGE_TAKEN, GRACE_ABOVE, GRACE_SECONDS, MAX_HEALTH, MAX_SINGLE_HIT, REGEN_DELAY, REGEN_RATE,
  SEGMENT_TOPS, TIME_EPS, TRAUMA_DAMAGE_LOW_HP, TRAUMA_DAMAGE_MAX, TRAUMA_DAMAGE_MIN,
} from './defs.ts';

export interface HealthHost {
  readonly events: EventBus;
  /** read live: difficulty may change mid-run (GDD 15) */
  difficulty(): Difficulty;
  /** camera trauma request (render applies it); never called under reduceMotion by the host */
  trauma(amount: number): void;
  /** the flinch: `strength` 0 (10 HP or less) to 1 (38 HP), and where the blow came from (world X, Z) */
  flinch(strength: number, fromX: number, fromZ: number): void;
  /** dev / test builds report a hit above the GDD's largest single hit */
  readonly dev: boolean;
}

/** Index (0, 1, 2) of the segment that holds `hp`: a segment that is exactly full is the current one. */
export function segmentOf(hp: number): 0 | 1 | 2 {
  return hp <= SEGMENT_TOPS[0] ? 0 : hp <= SEGMENT_TOPS[1] ? 1 : 2;
}

export class Health {
  hp = MAX_HEALTH;
  alive = true;
  god = false;
  /** seconds of immunity left after the last-hit grace */
  immunity = 0;
  /** seconds since the last damage */
  sinceDamage = REGEN_DELAY;
  regenerating = false;
  private regenGained = 0;
  private warned = false;
  private readonly damagedPayload: GameEvents['player/damaged'] = { amount: 0, health: 0, kind: 'bullet', source: 'world', fromX: 0, fromY: 0, fromZ: 0, graceUsed: false };
  private readonly diedPayload: GameEvents['player/died'] = { kind: 'bullet', source: 'world' };
  private readonly healedPayload: GameEvents['player/healed'] = { amount: 0, health: 0 };
  private readonly segmentPayload: GameEvents['player/health_segment'] = { segment: 0, regenerating: false };

  constructor(private readonly host: HealthHost) {}

  get segment(): 0 | 1 | 2 { return segmentOf(this.hp); }

  private setRegenerating(on: boolean): void {
    if (this.regenerating === on) return;
    this.regenerating = on;
    this.segmentPayload.segment = this.segment; this.segmentPayload.regenerating = on;
    this.host.events.emit('player/health_segment', this.segmentPayload);
  }
  private healed(amount: number): void {
    this.healedPayload.amount = amount; this.healedPayload.health = this.hp;
    this.host.events.emit('player/healed', this.healedPayload);
  }

  /** One sim tick: the grace window and the regeneration of the current segment. */
  tick(dt: number): void {
    if (!this.alive) return;
    if (this.immunity > 0) this.immunity = this.immunity - dt > TIME_EPS ? this.immunity - dt : 0;
    this.sinceDamage += dt;
    const top = SEGMENT_TOPS[this.segment];
    if (this.hp >= top) { this.setRegenerating(false); return; }
    if (this.sinceDamage < REGEN_DELAY - TIME_EPS) return;
    if (!this.regenerating) { this.regenGained = 0; this.setRegenerating(true); }
    const gain = Math.min(top - this.hp, REGEN_RATE * dt);
    this.hp += gain; this.regenGained += gain;
    if (this.hp >= top - 1e-9) {
      this.hp = top;
      this.setRegenerating(false);
      this.healed(this.regenGained);
    }
  }

  private die(kind: DamageKind, source: DamageSource): void {
    this.alive = false;
    this.hp = 0;
    this.immunity = 0;
    this.regenerating = false;
    this.diedPayload.kind = kind; this.diedPayload.source = source;
    this.host.events.emit('player/died', this.diedPayload);
  }

  /** PlayerApi.applyDamage: returns the health really removed. */
  applyDamage(info: Readonly<DamageInfo>): number {
    if (!this.alive || this.god) return 0;
    const killVolume = info.kind === 'kill_volume';
    // a kill volume is the one thing that is not a hit: no scaling, no absorb, no grace, no immunity (GDD 5: lethal drops)
    if (killVolume) { const had = this.hp; this.die(info.kind, info.source); return had; }
    if (this.immunity > 0) return 0;
    const raw = Math.max(0, info.amount);
    if (raw <= 0) return 0;
    if (raw > MAX_SINGLE_HIT && this.host.dev && !this.warned) {
      this.warned = true;
      const text = `[player] a single hit of ${raw} from '${info.source}' (${info.kind}) is above the GDD's largest hit (${MAX_SINGLE_HIT})`;
      // a real attacker over the cap is a bug in that attacker; a test's or the world's own damage call is only told
      if (info.source === 'world') console.warn(text); else console.error(text);
    }
    const before = this.hp;
    let amount = raw * DAMAGE_TAKEN[this.host.difficulty()];
    let hp = before;
    if (hp > ABSORB_BELOW) {
      const above = Math.min(amount, hp - ABSORB_BELOW);
      hp -= above; amount -= above;
    }
    hp -= amount * ABSORB_SCALE;                             // what reaches the last 20 HP is absorbed x0.75
    let grace = false;
    if (hp <= 0 && before > GRACE_ABOVE) { hp = 1; grace = true; this.immunity = GRACE_SECONDS; }
    this.sinceDamage = 0;
    this.setRegenerating(false);
    const applied = before - Math.max(0, hp);
    if (applied > 0) {
      const k = (applied - TRAUMA_DAMAGE_LOW_HP) / (MAX_SINGLE_HIT - TRAUMA_DAMAGE_LOW_HP);
      const s = k < 0 ? 0 : k > 1 ? 1 : k;
      this.host.trauma(TRAUMA_DAMAGE_MIN + (TRAUMA_DAMAGE_MAX - TRAUMA_DAMAGE_MIN) * s);
      this.host.flinch(s, info.ox, info.oz);
    }
    if (hp <= 0) { this.die(info.kind, info.source); return applied; }
    this.hp = hp;
    const d = this.damagedPayload;
    d.amount = applied; d.health = hp; d.kind = info.kind; d.source = info.source;
    d.fromX = info.ox; d.fromY = info.oy; d.fromZ = info.oz; d.graceUsed = grace;
    this.host.events.emit('player/damaged', d);
    return applied;
  }

  /** `pk_canteen`: the current segment to full, the next one if it already is; false at 100 HP. */
  canteen(): boolean {
    if (!this.alive || this.hp >= MAX_HEALTH) return false;
    const seg = this.segment;
    const top = this.hp >= SEGMENT_TOPS[seg] ? SEGMENT_TOPS[Math.min(2, seg + 1) as 0 | 1 | 2] : SEGMENT_TOPS[seg];
    const gained = top - this.hp;
    this.setRegenerating(false);
    this.hp = top;
    this.healed(gained);
    return true;
  }

  /** PlayerDebug.setHealth: goes round scaling, absorb and grace. 0 kills. */
  set(hp: number): void {
    const v = hp < 0 ? 0 : hp > MAX_HEALTH ? MAX_HEALTH : hp;
    if (v <= 0) { if (this.alive) this.die('kill_volume', 'world'); else this.hp = 0; return; }
    this.hp = v;
    this.alive = true;
    this.setRegenerating(false);
  }

  /** A restore or a new run: alive, every timer reset (the HUD is told only if a regeneration was running). */
  restore(hp: number): void {
    this.setRegenerating(false);
    this.hp = hp < 1 ? 1 : hp > MAX_HEALTH ? MAX_HEALTH : hp;
    this.alive = true;
    this.immunity = 0;
    this.sinceDamage = 0;
    this.regenerating = false;
    this.regenGained = 0;
  }
}
