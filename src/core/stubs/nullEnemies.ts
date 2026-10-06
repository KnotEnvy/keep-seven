// Core stub for the enemies slot: no AI. `spawn` stands a placeholder capsule on a spawn marker with one body hit
// volume that dies to one hit; the events (spawned, felled / died, removed) are the real ones.
import { Layer } from '../contracts.ts';
import type {
  AssetBinding, AssetInstance, BossPhase, BossView, DamageInfo, DebugSnapshot, EncounterId, EnemiesDebug, EnemiesSave, EnemyKind,
  EnemySystem, EnemyView, EntityId, EntityRef, GameContext, GameEvents, GuardState, HitReceiver, HitResponse, HitResult,
  SpawnRequest, VignetteId, VolumeHandle,
} from '../contracts.ts';
import { DEG2RAD, RAD2DEG, round4 } from '../math.ts';

const CAPACITY = 16;
const BODY: Readonly<Record<EnemyKind, { radius: number; height: number; hp: number; threat: number }>> = {
  bider: { radius: 0.35, height: 1.5, hp: 100, threat: 1 },
  transit: { radius: 0.4, height: 1.7, hp: 100, threat: 2 },
  tamper: { radius: 0.9, height: 2.6, hp: 100, threat: 5 },
  windlass: { radius: 1.5, height: 4, hp: 100, threat: 10 },
};

/** The Windlass's health bar: 26 pips (GDD 12; code-ui shows 26 -> 0). */
const BOSS_PIPS = 26;
type BossFields = { -readonly [K in keyof Omit<BossView, 'phase'>]: BossView[K] };
/** What a HUD would plausibly see in each phase. The stub fights nobody: a test sets exact values with ext.enemies.setBoss. */
function bossFor(pips: number, guard: GuardState, mouthsOpen: number, armBay: number): Pick<BossFields, 'pips' | 'guard' | 'mouthsOpen' | 'armBay'> {
  return { pips, guard, mouthsOpen, armBay };
}
/** 10 + 10 + 6 pips (GDD 15): full at the start of each phase; phase 3a removes none, 3b has its six left. */
const BOSS_BY_PHASE: Readonly<Record<BossPhase, ReturnType<typeof bossFor>>> = {
  idle: bossFor(BOSS_PIPS, 'parked', 0, 0), parley: bossFor(BOSS_PIPS, 'parked', 0, 0),
  p1: bossFor(BOSS_PIPS, 'set', 1, 0), p2: bossFor(16, 'set', 2, 2),
  p3a: bossFor(6, 'set', 0, 4), hush: bossFor(6, 'set', 0, 4), proven: bossFor(6, 'released', 0, 4),
  p3b: bossFor(6, 'shattered', 3, 4), dead: bossFor(0, 'shattered', 0, 4),
};

class Slot implements HitReceiver {
  used = false;
  alive = false;
  id: EntityId = '';
  kind: EnemyKind = 'bider';
  x = 0; y = 0; z = 0; yaw = 0;
  hp = 0;
  encounter: EncounterId | '' = '';
  counted = false;
  volume: VolumeHandle = -1;
  instance: AssetInstance | null = null;
  ref: EntityRef = { id: '', kind: 'bider' };
  constructor(private readonly owner: NullEnemies) {}
  onHit(_hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    out.stops = true; out.stopsLine = false; out.damageDealt = Math.min(this.hp, damage.amount);
    this.hp -= out.damageDealt;
    out.healthLeft = Math.max(0, this.hp);
    if (this.hp <= 0) { out.outcome = 'kill'; this.owner.kill(this, false); } else out.outcome = 'hit';
  }
}

class NullEnemies implements EnemySystem {
  readonly id = 'enemies' as const;
  threat = 0;
  readonly boss: BossView;
  readonly debug: EnemiesDebug;
  private readonly slots: Slot[] = [];
  private serial = 0;
  private aiEnabled = true;
  private bossPhase: BossPhase = 'idle';
  private parleyHeard = false;
  /** values forced through __dbg.ext.enemies.setBoss; a phase change clears them */
  bossOver: Partial<BossFields> = {};
  private readonly vignettes: VignetteId[] = [];
  private readonly spawned: GameEvents['enemy/spawned'] = { x: 0, y: 0, z: 0, id: '', kind: 'bider', encounter: '', entrance: '' };
  private readonly felled: GameEvents['enemy/felled'] = { x: 0, y: 0, z: 0, id: '', encounter: '', counted: false };
  private readonly freedPayload: GameEvents['enemy/freed'] = { x: 0, y: 0, z: 0, id: '', encounter: '', cause: 'crown', counted: false };
  private readonly died: GameEvents['enemy/died'] = { x: 0, y: 0, z: 0, id: '', kind: 'bider', encounter: '' };
  private readonly removed: GameEvents['enemy/removed'] = { id: '' };
  private readonly phasePayload: GameEvents['boss/phase'] = { phase: 'idle', from: 'idle' };

  constructor(private readonly ctx: GameContext) {
    for (let i = 0; i < CAPACITY; i++) this.slots.push(new Slot(this));
    const self = this;
    this.boss = {
      get phase() { return self.bossPhase; },
      get pips() { return self.bossOver.pips ?? BOSS_BY_PHASE[self.bossPhase].pips; },
      get pipsTotal() { return self.bossOver.pipsTotal ?? BOSS_PIPS; },
      get armBay() { return self.bossOver.armBay ?? BOSS_BY_PHASE[self.bossPhase].armBay; },
      get guard(): GuardState { return self.bossOver.guard ?? BOSS_BY_PHASE[self.bossPhase].guard; },
      get mouthsOpen() { return self.bossOver.mouthsOpen ?? BOSS_BY_PHASE[self.bossPhase].mouthsOpen; },
      get marksLit() { return self.bossOver.marksLit ?? (self.bossPhase === 'p3a' || self.bossPhase === 'hush'); },
      get hush() { return self.bossOver.hush ?? self.bossPhase === 'hush'; },
    };
    this.debug = {
      spawnAt: (kind, x, y, z, yawDeg) => this.place(kind, x, y, z, yawDeg * DEG2RAD, '', false, ''),
      killAll: (freed) => {
        let n = 0;
        for (const s of this.slots) if (s.used && s.alive) { this.kill(s, freed); n++; }
        return n;
      },
      setBossPhase: (phase) => this.setBossPhase(phase),
      tokens: () => ({ melee: [], ranged: [], heavy: [] }),
    };
  }

  init(): void {
    this.ctx.debug.register('enemies', {
      /**
       * Stub only: force BossView fields ({ pips, pipsTotal, guard, mouthsOpen, armBay, marksLit, hush }) so a HUD or a
       * world script can be shown any boss state; emits boss/pips or boss/guard when those change. {} clears them.
       */
      setBoss: ((fields: Partial<BossFields>) => this.setBoss(fields)) as (...args: never[]) => unknown,
    });
  }
  private setBoss(fields: Partial<BossFields>): void {
    const before = { pips: this.boss.pips, guard: this.boss.guard };
    this.bossOver = Object.keys(fields).length === 0 ? {} : { ...this.bossOver, ...fields };
    const e = this.ctx.events;
    if (this.boss.pips !== before.pips) e.emit('boss/pips', { phase: this.bossPhase, remaining: this.boss.pips, total: this.boss.pipsTotal, lit: this.boss.pips });
    if (this.boss.guard !== before.guard) e.emit('boss/guard', { state: this.boss.guard });
  }
  dispose(): void { this.clearAll(); }

  private setBossPhase(phase: BossPhase): void {
    if (phase === this.bossPhase || !(phase in BOSS_BY_PHASE)) return;      // an unknown phase would leave the boss view undefined
    this.phasePayload.from = this.bossPhase; this.phasePayload.phase = phase;
    this.bossPhase = phase;
    this.bossOver = {};
    this.ctx.events.emit('boss/phase', this.phasePayload);
  }

  private place(kind: EnemyKind, x: number, y: number, z: number, yaw: number, encounter: EncounterId | '', counted: boolean, entrance: string): EntityId {
    const slot = this.slots.find((s) => !s.used);
    if (!slot) return '';
    const { ctx } = this;
    const body = BODY[kind];
    if (!body) return '';                                    // not a kind
    slot.used = true; slot.alive = true;
    slot.id = `${kind}#${++this.serial}`; slot.kind = kind;
    slot.x = x; slot.y = y; slot.z = z; slot.yaw = yaw;
    slot.hp = body.hp; slot.encounter = encounter; slot.counted = counted;
    slot.ref = { id: slot.id, kind };
    slot.volume = ctx.collision.addVolume({ shape: 'capsule', layer: Layer.ENEMY, flags: 0, surface: 'cloth', entity: slot.ref, part: 'body', priority: 0, receiver: slot });
    ctx.collision.setCapsule(slot.volume, x, y + body.radius, z, x, y + body.height - body.radius, z, body.radius);
    const binding = ctx.data.manifest.bindings.enemy[kind] as AssetBinding | null | undefined;
    if (binding && ctx.assets.isActive(binding.asset)) {
      const inst = ctx.assets.instantiate(binding.asset);
      inst.root.position.set(x, y, z);
      inst.root.rotation.set(0, yaw + Math.PI, 0);          // assets face +Z, yaw 0 faces -Z
      ctx.scene.dynamic.add(inst.root);
      slot.instance = inst;
    }
    this.threat += body.threat;
    const e = this.spawned;
    e.x = x; e.y = y; e.z = z; e.id = slot.id; e.kind = kind; e.encounter = encounter; e.entrance = entrance;
    ctx.events.emit('enemy/spawned', e);
    return slot.id;
  }

  private free(slot: Slot, announce: boolean): void {
    if (!slot.used) return;
    if (slot.alive) this.threat -= BODY[slot.kind].threat;
    this.ctx.collision.removeVolume(slot.volume);
    if (slot.instance) { slot.instance.release(); slot.instance = null; }
    slot.used = false; slot.alive = false;
    if (announce) { this.removed.id = slot.id; this.ctx.events.emit('enemy/removed', this.removed); }
  }

  /** The normal death path: events fire, encounters count. */
  kill(slot: Slot, freed: boolean): void {
    if (!slot.used || !slot.alive) return;
    const events = this.ctx.events;
    if (slot.kind === 'bider') {
      if (freed) {
        const f = this.freedPayload;
        f.x = slot.x; f.y = slot.y; f.z = slot.z; f.id = slot.id; f.encounter = slot.encounter; f.cause = 'crown'; f.counted = slot.counted;
        events.emit('enemy/freed', f);
      } else {
        const f = this.felled;
        f.x = slot.x; f.y = slot.y; f.z = slot.z; f.id = slot.id; f.encounter = slot.encounter; f.counted = slot.counted;
        events.emit('enemy/felled', f);
      }
    } else {
      const d = this.died;
      d.x = slot.x; d.y = slot.y; d.z = slot.z; d.id = slot.id; d.kind = slot.kind; d.encounter = slot.encounter;
      events.emit('enemy/died', d);
    }
    this.free(slot, true);
  }

  // ---- EnemiesApi -------------------------------------------------------------------------------
  spawn(request: Readonly<SpawnRequest>): EntityId {
    const m = this.ctx.data.marker(request.spawn);
    if (!m) return '';
    return this.place(request.kind, m.pos[0], m.pos[1], m.pos[2], (m.rotY ?? 0) * DEG2RAD, request.encounter, request.counted, request.entrance);
  }
  wake(_id: EntityId): void { /* nothing sleeps */ }
  wakeEncounter(_encounter: EncounterId): void { /* nothing sleeps */ }
  clearEncounter(encounter: EncounterId): void {
    for (const s of this.slots) if (s.used && s.encounter === encounter) this.free(s, false);
  }
  clearAll(): void {
    for (const s of this.slots) this.free(s, false);
    this.threat = 0;
  }
  aliveCount(encounter: EncounterId | ''): number {
    let n = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i] as Slot;
      if (s.used && s.alive && (encounter === '' || s.encounter === encounter)) n++;
    }
    return n;
  }
  list(out: EnemyView[]): number {
    let n = 0;
    for (const s of this.slots) {
      if (!s.used || n >= out.length) continue;
      const v = out[n] as EnemyView;
      v.id = s.id; v.kind = s.kind; v.state = s.alive ? 'idle' : 'dead'; v.hp = s.hp;
      v.x = s.x; v.y = s.y; v.z = s.z; v.yaw = s.yaw; v.encounter = s.encounter; v.alive = s.alive; v.hasToken = false;
      n++;
    }
    return n;
  }
  startBoss(fromPhase: BossPhase, parleyHeard: boolean): void {
    this.parleyHeard = this.parleyHeard || parleyHeard;
    this.setBossPhase(fromPhase === 'idle' || fromPhase === 'parley' ? 'p1' : fromPhase);
  }
  playVignette(id: VignetteId): void { if (!this.vignettes.includes(id)) this.vignettes.push(id); }
  setAiEnabled(on: boolean): void { this.aiEnabled = on; }

  // ---- save -------------------------------------------------------------------------------------
  captureSave(): EnemiesSave {
    return { bossPhase: this.bossPhase, parleyHeard: this.parleyHeard, deathsInBossPhase: 0, statics: [] };
  }
  applySave(data: EnemiesSave): void {
    this.clearAll();
    this.bossPhase = data.bossPhase;
    this.parleyHeard = data.parleyHeard;
  }

  debugState(): DebugSnapshot {
    const list: Record<string, unknown>[] = [];
    for (const s of this.slots) if (s.used) list.push({ id: s.id, kind: s.kind, x: round4(s.x), y: round4(s.y), z: round4(s.z), yawDeg: round4(s.yaw * RAD2DEG), hp: s.hp });
    return { stub: 'nullEnemies', ai: this.aiEnabled, bossPhase: this.bossPhase, parleyHeard: this.parleyHeard, alive: this.aliveCount(''), vignettes: this.vignettes.slice(), list };
  }
}

export function createNullEnemies(ctx: GameContext): EnemySystem { return new NullEnemies(ctx); }
