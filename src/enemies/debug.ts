// src/enemies/debug.ts: EnemiesDebug (the contract's cheat surface) and the helpers registered under
// window.__dbg.ext.enemies for the sandbox and the tests: mock rounds from any point, direct spawns, actor details.
// Test and sandbox code only: allocation is fine here.
import { ColFlag, LAYER_SHOT, MAX_LINE_HITS } from '../core/contracts.ts';
import type {
  AmmoType, BossPhase, DamageInfo, EncounterId, EnemiesDebug, EnemyKind, EntityId, HitPart, HitResponse, SpawnRequest, VignetteId,
} from '../core/contracts.ts';
import { DEG2RAD, RAD2DEG, round4 } from '../core/math.ts';
import { CAPS } from './defs.ts';
import type { Actor, Shared } from './internals.ts';
import { MAX_ACTORS } from './internals.ts';

export interface DebugHost {
  spawnAt(kind: EnemyKind, x: number, y: number, z: number, yaw: number): EntityId;
  spawn(request: Readonly<SpawnRequest>): EntityId;
  wake(id: EntityId): void;
  wakeEncounter(encounter: EncounterId): void;
  clearEncounter(encounter: EncounterId): void;
  playVignette(id: VignetteId): void;
  startBoss(phase: BossPhase, heard: boolean): void;
  setBossPhase(phase: BossPhase): void;
  killAll(freed: boolean): number;
  bossState(): Record<string, unknown>;
  bossPoint(kind: 'knot' | 'pawl' | 'guard' | 'hub', i: number): [number, number, number];
  /** a canister lobbed from the Windlass's canister mouth to a point (false: two are out) */
  lobCanister(x: number, y: number, z: number): boolean;
  sightPeak(reset: boolean): number;
  /** tests: the deaths counted in the running boss phase (the mercy scale and the teaching line read it) */
  setBossDeaths(n: number): void;
}

export interface RoundResult { id: string; kind: string; part: string; outcome: string; damage: number; healthLeft: number; stops: boolean; stopsLine: boolean; x: number; y: number; z: number }

export function createEnemiesDebug(S: Shared, host: DebugHost): EnemiesDebug {
  return {
    spawnAt: (kind, x, y, z, yawDeg) => host.spawnAt(kind, x, y, z, yawDeg * DEG2RAD),
    killAll: (freed) => host.killAll(freed),
    setBossPhase: (phase) => host.setBossPhase(phase),
    tokens: () => {
      const ids = (kind: 'melee' | 'ranged' | 'heavy'): EntityId[] => S.tokens.holders(kind).map((i) => (S.actors[i] as Actor).id);
      return { melee: ids('melee'), ranged: ids('ranged'), heavy: ids('heavy') };
    },
  };
}

function actorView(e: Actor): Record<string, unknown> {
  return {
    id: e.id, kind: e.kind, state: e.state, prev: e.prev, t: round4(e.t), hp: round4(e.hp), alive: e.alive, awake: e.awake,
    x: round4(e.x), y: round4(e.y), z: round4(e.z), yawDeg: round4(e.yaw * RAD2DEG),
    token: e.token, encounter: e.encounter, counted: e.counted, marker: e.marker, clip: e.clip, shown: e.shown,
    sees: e.sees, lane: e.lane, order: e.order, vignette: e.vignette,
    ventChest: e.ventChest, ventBack: e.ventBack, shots: e.shots, point: e.point, fresh: e.fresh, miss: e.miss,
    aim: [round4(e.aimX), round4(e.aimY), round4(e.aimZ)], hood: round4(e.hood), tint: e.tint, pathLen: e.pathLen, pathAt: e.pathAt, pathGoal: e.pathGoal, stuck: round4(e.stuck), lost: round4(e.lost), grounded: e.grounded,
  };
}

/** The helpers of `__dbg.ext.enemies`. */
export function createExt(S: Shared, host: DebugHost): Record<string, (...args: never[]) => unknown> {
  const col = S.ctx.collision;
  const hit = col.createHit();
  const list = col.createHitList();
  const out: HitResponse = { outcome: 'impact', stops: true, stopsLine: true, damageDealt: 0, healthLeft: 0 };
  const dmg: DamageInfo = { amount: 100, kind: 'bullet', source: 'player', sourceId: 'player', ammo: 'lead_round', shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
  let shotId = 9000;
  const norm = (dx: number, dy: number, dz: number): [number, number, number] => { const l = Math.hypot(dx, dy, dz) || 1; return [dx / l, dy / l, dz / l]; };
  const fill = (ox: number, oy: number, oz: number, d: [number, number, number], ammo: AmmoType, amount: number): void => {
    dmg.ox = ox; dmg.oy = oy; dmg.oz = oz; dmg.dx = d[0]; dmg.dy = d[1]; dmg.dz = d[2]; dmg.ammo = ammo; dmg.amount = amount; dmg.shotId = ++shotId;
  };
  const record = (h: typeof hit): RoundResult => ({
    id: h.entity ? h.entity.id : '', kind: h.entity ? h.entity.kind : 'world', part: h.part, outcome: out.outcome, damage: round4(out.damageDealt),
    healthLeft: round4(out.healthLeft), stops: out.stops, stopsLine: out.stopsLine, x: round4(h.x), y: round4(h.y), z: round4(h.z),
  });
  /** One lead round from a point along a direction: what the player's shot code does (ARCHITECTURE 3.6). */
  const leadRound = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, amount = 100): RoundResult | null => {
    const d = norm(dx, dy, dz);
    if (!col.raycast(ox, oy, oz, d[0], d[1], d[2], 200, LAYER_SHOT, hit)) return null;
    out.outcome = (hit.flags & ColFlag.GRILLE) !== 0 ? 'deflected' : 'impact'; out.stops = true; out.stopsLine = true; out.damageDealt = 0; out.healthLeft = 0;
    if (hit.receiver) { fill(ox, oy, oz, d, 'lead_round', amount); hit.receiver.onHit(hit, dmg, out); }
    return record(hit);
  };
  /** One line round: every hit along 60 m, near to far, a flat 300 each, until solid geometry or a response stops it. */
  const lineRound = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): RoundResult[] => {
    const d = norm(dx, dy, dz);
    const n = col.raycastAll(ox, oy, oz, d[0], d[1], d[2], 60, LAYER_SHOT, list);
    const results: RoundResult[] = [];
    for (let i = 0; i < n && i < MAX_LINE_HITS; i++) {
      const h = list.hits[i] as typeof hit;
      out.outcome = 'impact'; out.stops = true; out.stopsLine = true; out.damageDealt = 0; out.healthLeft = 0;
      if (h.receiver) { fill(ox, oy, oz, d, 'line_round', CAPS.lineRoundDamage); h.receiver.onHit(h, dmg, out); }
      else if ((h.flags & ColFlag.PIERCE) !== 0) out.stopsLine = false;
      results.push(record(h));
      if (out.stopsLine) break;
    }
    return results;
  };
  const centre = { x: 0, y: 0, z: 0 };
  const eye = (): [number, number, number] => { const p = S.ctx.player.position; return [p.x, p.y + 1.65, p.z]; };
  const api = {
    leadRound, lineRound,
    /** A lead (or line) round from the player's eye (or from `from`) at the centre of an entity's hit volume. */
    shootAt: (id: EntityId, part: HitPart | null = null, ammo: AmmoType = 'lead_round', from: [number, number, number] | null = null, offset: [number, number, number] = [0, 0, 0]) => {
      if (!col.volumeCentre(id, part, centre)) return null;
      const o = from ?? eye();
      const dx = centre.x + offset[0] - o[0], dy = centre.y + offset[1] - o[1], dz = centre.z + offset[2] - o[2];
      return ammo === 'lead_round' ? leadRound(o[0], o[1], o[2], dx, dy, dz) : lineRound(o[0], o[1], o[2], dx, dy, dz);
    },
    volumeCentre: (id: EntityId, part: HitPart | null = null) => (col.volumeCentre(id, part, centre) ? [round4(centre.x), round4(centre.y), round4(centre.z)] : null),
    spawn: (request: Partial<SpawnRequest> & { kind: EnemyKind; spawn: string }) => host.spawn({
      kind: request.kind, spawn: request.spawn, encounter: request.encounter ?? '', wave: request.wave ?? '', dormantClip: request.dormantClip ?? '',
      entrance: request.entrance ?? '', lane: request.lane ?? '', order: request.order ?? 0, counted: request.counted ?? true,
    }),
    wake: (id: EntityId) => host.wake(id),
    wakeEncounter: (id: EncounterId) => host.wakeEncounter(id),
    clearEncounter: (id: EncounterId) => host.clearEncounter(id),
    playVignette: (id: VignetteId) => host.playVignette(id),
    startBoss: (phase: BossPhase, heard: boolean) => host.startBoss(phase, heard),
    actors: () => { const a: Record<string, unknown>[] = []; for (let i = 0; i < MAX_ACTORS; i++) { const e = S.actors[i] as Actor; if (e.used) a.push(actorView(e)); } return a; },
    actor: (id: EntityId) => { for (let i = 0; i < MAX_ACTORS; i++) { const e = S.actors[i] as Actor; if (e.used && e.id === id) return actorView(e); } return null; },
    /** Put an actor somewhere (tests: a charge lined up on a rib). */
    place: (id: EntityId, x: number, y: number, z: number, yawDeg: number) => {
      for (let i = 0; i < MAX_ACTORS; i++) {
        const e = S.actors[i] as Actor;
        if (!e.used || e.id !== id) continue;
        e.x = x; e.y = y; e.z = z; e.yaw = yawDeg * DEG2RAD; e.pos.snap(x, y, z); e.rot.snap(e.yaw); e.pathGoal = -1;
        return true;
      }
      return false;
    },
    /** One stake from a point along a direction (tests: a stake in flight, the stuck-stake cap). Returns false when eight are flying. */
    fireStake: (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, speed = 18, harmful = true, damage = 22) => {
      const d = norm(dx, dy, dz), s = S.shot;
      s.ox = ox; s.oy = oy; s.oz = oz; s.dx = d[0]; s.dy = d[1]; s.dz = d[2]; s.speed = speed; s.damage = damage;
      s.kind = 'stake'; s.source = 'transit'; s.sourceId = 'debug'; s.encounter = ''; s.harmful = harmful; s.maxDistance = 0;
      return S.stakes.fire(s);
    },
    boss: () => host.bossState(),
    bossDeaths: (n: number) => host.setBossDeaths(n),
    /** World centre of a part of the Windlass: knot 0..5, pawl 0 (l) / 1 (r), the guard, the hub. */
    bossPoint: (kind: 'knot' | 'pawl' | 'guard' | 'hub', i = 0) => host.bossPoint(kind, i).map(round4),
    lobCanister: (x: number, y: number, z: number) => host.lobCanister(x, y, z),
    /** A lead (or line) round from her eye at a part of the Windlass. */
    shootBoss: (kind: 'knot' | 'pawl' | 'guard' | 'hub', i = 0, ammo: AmmoType = 'lead_round') => {
      const t = host.bossPoint(kind, i), o = eye();
      return ammo === 'lead_round' ? leadRound(o[0], o[1], o[2], t[0] - o[0], t[1] - o[1], t[2] - o[2]) : lineRound(o[0], o[1], o[2], t[0] - o[0], t[1] - o[1], t[2] - o[2]);
    },
    stats: (reset = false) => ({
      dealt: round4(S.dealt), maxHit: round4(S.maxHit), sightPeak: host.sightPeak(reset), flying: S.stakes.flying, stuck: S.stakes.stuck, cooled: S.stakes.cooled,
      statics: S.statics.length, time: round4(S.time), tick: S.tick, navNodes: S.nav.count, searches: S.nav.searches,
    }),
    statics: () => S.statics.map((b) => ({ asset: b.asset, x: round4(b.x), y: round4(b.y), z: round4(b.z), rotY: round4(b.rotY) })),
    nav: () => ({ count: S.nav.count, firing: Array.from(S.nav.firing).map((i) => S.nav.ids[i]), lanes: S.nav.lanes.map((l) => l.id) }),
    navPath: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const buf = new Int16Array(48);
      const n = S.nav.path(S.nav.nearest(ax, ay, az), S.nav.nearest(bx, by, bz), buf, true);
      return Array.from(buf.slice(0, n)).map((i) => S.nav.ids[i]);
    },
  };
  return api as unknown as Record<string, (...args: never[]) => unknown>;
}
