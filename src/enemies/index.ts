// src/enemies: AI, navigation, three archetypes, the Windlass, projectiles, hit reactions, the five vignettes
// (docs/workorders/code-enemies.md). This file is the composition of the module: lifecycle, events, EnemiesApi, save.
// It exports exactly one factory (docs/ARCHITECTURE.md section 5, "Factory summary").
import { FIXED_DT } from '../core/contracts.ts';
import type {
  BossPhase, BossView, CreateEnemySystem, DamageInfo, DamageKind, DebugSnapshot, EncounterId, EnemiesDebug, EnemiesSave, EnemyKind, EnemySystem,
  EnemyView, EntityId, GameContext, HitResponse, HitResult, LayoutMarker, SpawnRequest, VignetteId,
} from '../core/contracts.ts';
import { DEG2RAD, RAD2DEG, round4 } from '../core/math.ts';
import { beginBider, falterBider, fellBider, freeBider, hitBider, tickBider, wakeBider } from './bider.ts';
import { Boss } from './boss/index.ts';
import { createEnemiesDebug, createExt } from './debug.ts';
import type { DebugHost } from './debug.ts';
import { BIDER, CAPS, ENEMIES, TAMPER } from './defs.ts';
import { HintRing } from './hintring.ts';
import type { Actor } from './internals.ts';
import { MAX_ACTORS, Shared } from './internals.ts';
import { Nav, moveBody } from './nav.ts';
import { ActorPool } from './pool.ts';
import { Stakes } from './projectiles/stakes.ts';
import { beginTamper, hitTamper, killTamper, tickTamper, wakeTamper } from './tamper.ts';
import { Tokens, mayCome } from './tokens.ts';
import { beginTransit, hitTransit, killTransit, tickTransit, transitHears } from './transit.ts';
import { Vignettes } from './vignettes.ts';

const BIDER_R = ENEMIES.bider.bodyRadius, BIDER_H = ENEMIES.bider.bodyHeight;
/** states in which a Bider takes part in the push-apart (not dormant, rising, waiting in a vignette or down) */
const PUSHED: Readonly<Record<string, boolean>> = { approach: true, circle: true, windup: true, lunge: true, recover: true, stumble: true, falter: true };

class Enemies implements EnemySystem, DebugHost {
  readonly id = 'enemies' as const;
  readonly debug: EnemiesDebug;
  private readonly S: Shared;
  private readonly pool: ActorPool;
  private readonly stakes: Stakes;
  private readonly bossImpl: Boss;
  private readonly vignettes: Vignettes;
  private readonly markers = new Map<string, LayoutMarker>();
  private readonly off: (() => void)[] = [];
  private sightUsedPeak = 0;
  private deathsPhase: BossPhase = 'idle';
  private started = false;
  /** her last death was to the Tamper's slam; and the unscaled module time at which `TAMPER.hintKey` is owed (-1 none) */
  private slamDeath = false;
  private ringHintAt = -1;
  /**
   * Pass i4 (defs.ts `TAMPER.backKey`): deaths to an awake Tamper in this run of its fight; the ring line and the wall
   * line have each been said (or shown by anyone) in it; the line owed on the respawn ('' none).
   */
  private tamperDeaths = 0;
  private tamperDeath = false;
  private ringSaid = false;
  private backSaid = false;
  private respawnKey = '';

  constructor(private readonly ctx: GameContext) {
    const S = new Shared(ctx);
    this.S = S;
    S.tokens = new Tokens(MAX_ACTORS);
    S.nav = new Nav(ctx);
    this.pool = new ActorPool(S);
    S.pool = this.pool;
    this.stakes = new Stakes(S);
    S.stakes = this.stakes;
    this.vignettes = new Vignettes(S);
    S.rings = new HintRing(ctx, 'enemies_hint_rings');
    for (const m of ctx.data.layout.markers) this.markers.set(m.id, m);
    S.hooks = {
      hit: (e, hit, damage, out) => this.hit(e, hit, damage, out),
      spawn: (request) => this.spawnActor(request),
      spawnAt: (kind, x, y, z, yaw) => this.place(kind, x, y, z, yaw),
      wake: (e) => this.wakeActor(e),
      freeBider: (e, cause) => freeBider(S, e, cause),
      fellBider: (e, dx, dz) => fellBider(S, e, dx, dz),
      falterBiders: (seconds, onlyAttacking) => this.falterBiders(seconds, onlyAttacking),
      killTransit: (e) => killTransit(S, e),
      killTamper: (e) => killTamper(S, e),
      vignetteActorGone: (e) => this.vignettes.actorGone(e),
      slamLanded: (x, y, z, radius) => this.vignettes.slamLanded(x, y, z, radius),
      bossFight: () => this.bossImpl.fighting,
      sayRing: () => this.sayRing(),
    };
    this.bossImpl = new Boss(S);
    S.setDifficulty(ctx.options.value.difficulty);
    this.debug = createEnemiesDebug(S, this);
  }

  get boss(): BossView { return this.bossImpl.view; }

  // ---- lifecycle ----------------------------------------------------------------------------------------
  init(): void {
    const { ctx } = this;
    const S = this.S, on = ctx.events;
    this.off.push(on.on('weapon/kept', (e) => this.bossImpl.onKept(e)));
    this.off.push(on.on('weapon/fired', (e) => {
      for (let i = 0; i < MAX_ACTORS; i++) { const a = S.actors[i] as Actor; if (a.used && a.kind === 'transit') transitHears(S, a); }
      this.bossImpl.onFired();
      this.vignettes.onFired(e);
    }));
    this.off.push(on.on('weapon/reload', (e) => { if (e.stage === 'round') this.bossImpl.onReload(); }));
    this.off.push(on.on('world/built', () => this.onBuilt()));
    this.off.push(on.on('load/set', (e) => { if (e.stage === 'released') this.onReleased(); }));
    this.off.push(on.on('world/cell', () => { this.pool.refreshShown(); this.vignettes.onCell(); }));
    this.off.push(on.on('puzzle/hint', (e) => { if (e.puzzle === 'kept') this.bossImpl.onHint(e.tier); }));
    this.off.push(on.on('options/changed', (e) => { if (e.key === 'difficulty') S.setDifficulty(ctx.options.value.difficulty); }));
    this.off.push(on.on('game/new_run', (e) => { S.setDifficulty(e.difficulty); this.forgetRun(); }));
    this.off.push(on.on('encounter/reset', (e) => this.clearEncounter(e.id)));
    this.off.push(on.on('player/died', (e) => {
      this.deathsPhase = this.bossImpl.save().bossPhase; this.bossImpl.onDied(e.source === 'windlass' ? e.kind : '');
      if (e.kind === 'slam' && e.source === 'tamper') this.slamDeath = true;
      // pass i4: a death while a Tamper is up and fighting counts toward its help, whatever dealt the last of it
      if (this.tamperAwake()) { this.tamperDeath = true; this.tamperDeaths++; S.tamperHelp = Math.min(TAMPER.helpMax, this.tamperDeaths); }
    }));
    this.off.push(on.on('enemy/died', (e) => { if (e.kind === 'tamper') { this.tamperDeaths = 0; this.tamperDeath = false; S.tamperHelp = 0; this.ringHintAt = -1; } }));
    this.off.push(on.on('vignette/state', (e) => this.vignettes.onVignetteState(e)));
    // polish round 5: the Windlass says phase 3b's lines only into a free line box, and fills her health on a retry
    this.off.push(on.on('story/line', (e) => {
      this.bossImpl.onLine(true, e.key, e.seconds);
      // (a line shown counts as said, whoever said it: the world's queue replays a hint a death cut off)
      if (e.key === TAMPER.hintKey) this.ringSaid = true; else if (e.key === TAMPER.backKey) this.backSaid = true;
    }));
    this.off.push(on.on('story/line_end', () => this.bossImpl.onLine(false)));
    this.off.push(on.on('player/respawned', () => {
      this.bossImpl.onRespawned();
      // release pass p0: she died under the Tamper's arm: the ring is named a second after she has control again
      // Pass i4: once only. The ring line if no slam had said it yet; else, once, the other half of the rule (the wall);
      // after that the respawn says nothing and the help is the outline and the longer openings (defs.ts `backKey`).
      const slam = this.slamDeath, tamper = this.tamperDeath;
      this.slamDeath = false; this.tamperDeath = false;
      const lines = this.ctx.data.story.lines;
      this.respawnKey = '';
      if (slam && !this.ringSaid && lines[TAMPER.hintKey] !== undefined) this.respawnKey = TAMPER.hintKey;
      else if ((slam || tamper) && !this.backSaid && lines[TAMPER.backKey] !== undefined) this.respawnKey = TAMPER.backKey;
      this.ringHintAt = this.respawnKey !== '' ? S.utime + TAMPER.hintAfterRespawn : -1;
    }));
    ctx.debug.register('enemies', createExt(S, this));
  }

  start(): void {
    this.started = true;
    this.stakes.createVolumes();
    this.onBuilt();
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    this.clearAll();
    this.bossImpl.dropBody();
  }

  /** world/built: the zones changed. New nav graph, instanced handles made again, bodies of zones that are gone dropped. */
  private onBuilt(): void {
    if (!this.started) return;
    const S = this.S, ctx = this.ctx;
    S.nav.rebuild();
    const built = ctx.world.builtZones;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = S.actors[i] as Actor;
      if (!e.used) continue;
      e.pathGoal = -1; e.pathLen = 0; e.point = -1; e.wantPoint = -1; e.namedPoint = -1; e.badPoints = 0;
      if ((e.zone !== '' && !built.includes(e.zone)) || !ctx.assets.isActive(ENEMIES[e.kind].asset)) this.pool.release(e, false);
    }
    this.stakes.clear(null);
    this.stakes.rebuildInstances();
    this.bossImpl.ord.rebuildInstances();
    this.pool.readdStatics();
    if (built.includes('the_bore')) this.bossImpl.ensureBody(); else this.bossImpl.dropBody();
    this.vignettes.onBuilt();
    this.pool.refreshShown();
  }

  /** A resident set was released: instances of assets that are no longer active are forgotten (never reused). */
  private onReleased(): void {
    const S = this.S, ctx = this.ctx;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = S.actors[i] as Actor;
      if (e.used && !ctx.assets.isActive(ENEMIES[e.kind].asset)) this.pool.release(e, false);
    }
    if (!ctx.assets.isActive('boss_windlass')) this.bossImpl.dropBody();
    this.vignettes.onReleased();
  }

  // ---- the tick -----------------------------------------------------------------------------------------
  fixedUpdate(dt: number): void {
    const S = this.S;
    S.dt = dt; S.time += dt; S.utime += FIXED_DT; S.tick++;
    S.readPlayer();
    S.sightLeft = CAPS.sightRaysPerTick;
    if (this.ringHintAt >= 0 && S.utime >= this.ringHintAt) {
      this.ringHintAt = -1;
      if (this.respawnKey === TAMPER.hintKey) { if (!this.ringSaid) { this.ringSaid = true; S.say(TAMPER.hintKey); } }
      else if (this.respawnKey === TAMPER.backKey) { if (!this.backSaid) { this.backSaid = true; S.say(TAMPER.backKey); } }
      this.respawnKey = '';
    }
    // round robin: a different body gets the first of the four sight rays each tick
    const first = S.tick % MAX_ACTORS;
    for (let k = 0; k < MAX_ACTORS; k++) {
      const e = S.actors[(first + k) % MAX_ACTORS] as Actor;
      if (!e.used) continue;
      this.tickActor(e, dt);
    }
    if (S.ai) this.separateBiders();
    this.stakes.tick(dt);
    this.vignettes.tick(dt);
    this.bossImpl.tick(dt);
    S.rings.commit();
    const used = CAPS.sightRaysPerTick - S.sightLeft;
    if (used > this.sightUsedPeak) this.sightUsedPeak = used;
  }

  /**
   * Biders do not stand inside one another (polish round 2). After the steering step every pair of standing Biders
   * closer than BIDER.separateMin is pushed apart along the line between them, through the collision engine (so nobody
   * is pushed into a wall), at most BIDER.separateStep a tick each. A body in its lunge is not moved (its line is
   * locked): the other one takes the whole push. Nobody is pushed closer to her than the lunge's stand-off (`push`). Bodies in a file keep their lane spacing by themselves.
   */
  private separateBiders(): void {
    const S = this.S;
    const min = BIDER.separateMin, cap = BIDER.separateStep;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const a = S.actors[i] as Actor;
      if (!a.used || !a.alive || !a.awake || a.kind !== 'bider' || !PUSHED[a.state]) continue;
      for (let j = i + 1; j < MAX_ACTORS; j++) {
        const b = S.actors[j] as Actor;
        if (!b.used || !b.alive || !b.awake || b.kind !== 'bider' || !PUSHED[b.state]) continue;
        if (Math.abs(a.y - b.y) > 1.2) continue;
        let dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= (min - 0.03) * (min - 0.03)) continue;                  // a dead band: two that circle shoulder to shoulder are not nudged every tick
        let d = Math.sqrt(d2);
        if (d < 1e-3) { const ang = (i * 7 + j * 3) * 1.1; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }   // on one spot: any fixed direction
        // a body in its lunge keeps its line: the other one of the pair takes the whole push, twice as fast. Two
        // lunges that end on one spot: the later body gives way (a nudge off its line, not a new line).
        const ux = dx / d, uz = dz / d;
        const am = a.state !== 'lunge', bm = b.state !== 'lunge' || !am;
        const need = min - Math.sqrt(d2);
        const each = am && bm ? need * 0.5 : need;
        const most = am && bm ? cap : cap * 2;
        const k = each > most ? most : each;
        if (am) this.push(a, -ux, -uz, k, i);
        if (bm) this.push(b, ux, uz, k, j);
      }
    }
  }

  /**
   * One Bider's share of a push: `k` metres along (ux, uz). Within the lunge's stand-off of her (1.5 m, where the
   * camera is) the part of the push that points at her is taken out: it slides round her instead of into her.
   */
  private push(e: Actor, ux: number, uz: number, k: number, salt: number): void {
    const S = this.S;
    const dx = S.px - e.x, dz = S.pz - e.z;
    const d2 = dx * dx + dz * dz;
    const near = BIDER.standOff + 0.1;
    if (d2 < near * near && d2 > 1e-6 && Math.abs(S.py - e.y) <= 1.6) {
      const d = Math.sqrt(d2), rx = dx / d, rz = dz / d;
      const c = ux * rx + uz * rz;
      if (c > 0) {
        ux -= c * rx; uz -= c * rz;
        const l = Math.sqrt(ux * ux + uz * uz);
        if (l < 0.2) { const s = (salt & 1) === 0 ? 1 : -1; ux = -rz * s; uz = rx * s; } else { ux /= l; uz /= l; }
      }
    }
    S.mx = ux * k; S.mz = uz * k;
    moveBody(S, e, BIDER_R, BIDER_H);
  }

  private tickActor(e: Actor, dt: number): void {
    const S = this.S;
    e.t += dt;
    if (e.kind === 'bider') tickBider(S, e, dt);
    else if (e.kind === 'transit') tickTransit(S, e, dt);
    else tickTamper(S, e, dt);
    if (e.used) this.pool.animate(e, dt);
  }

  update(_frameDt: number, alpha: number): void {
    this.pool.present(alpha);
    this.vignettes.present();
  }

  // ---- hits ---------------------------------------------------------------------------------------------
  private hit(e: Actor, hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
    if (e.kind === 'bider') hitBider(this.S, e, hit, damage, out);
    else if (e.kind === 'transit') hitTransit(this.S, e, hit, damage, out);
    else hitTamper(this.S, e, hit, damage, out);
  }

  private falterBiders(seconds: number, onlyAttacking: boolean): void {
    const S = this.S;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = S.actors[i] as Actor;
      if (!e.used || !e.alive || e.kind !== 'bider') continue;
      if (onlyAttacking && e.state !== 'windup' && e.state !== 'lunge') continue;
      falterBider(S, e, seconds);
    }
  }

  // ---- spawning -----------------------------------------------------------------------------------------
  private countAlive(kind: EnemyKind | null, encounter: EncounterId | '' | null): number {
    const S = this.S;
    let n = 0;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = S.actors[i] as Actor;
      if (e.used && e.alive && (kind === null || e.kind === kind) && (encounter === null || e.encounter === encounter)) n++;
    }
    return n;
  }

  private allowed(kind: EnemyKind, encounter: EncounterId | ''): boolean {
    const boss = this.bossImpl.fighting && encounter === 'enc_windlass';
    return mayCome(this.countAlive(null, null), this.countAlive(kind, null), ENEMIES[kind].maxAlive, boss, this.countAlive(null, 'enc_windlass'));
  }

  private begin(e: Actor, request: Readonly<SpawnRequest> | null, marker: LayoutMarker | null): void {
    const S = this.S;
    if (e.kind === 'bider') beginBider(S, e, request, marker);
    else if (e.kind === 'transit') beginTransit(S, e, request, marker);
    else beginTamper(S, e, request, marker);
    this.pool.animate(e, 0);
    if (!e.awake && e.zone !== '') { e.shown = this.ctx.render.zoneVisible(e.zone); if (e.inst) e.inst.root.visible = e.shown; }
    const p = S.ev.spawned;
    p.x = e.x; p.y = e.y; p.z = e.z; p.id = e.id; p.kind = e.kind; p.encounter = e.encounter; p.entrance = e.entrance;
    this.ctx.events.emit('enemy/spawned', p);
  }

  /** An active enemy at a point, outside any encounter (debug, sandbox). */
  private place(kind: EnemyKind, x: number, y: number, z: number, yaw: number): Actor | null {
    if (kind === 'windlass' || !ENEMIES[kind]) return null;
    if (!this.allowed(kind, '')) return null;
    const e = this.pool.create(kind, x, y, z, yaw);
    if (!e) return null;
    this.begin(e, null, null);
    return e;
  }

  private spawnActor(request: Readonly<SpawnRequest>): Actor | null {
    const S = this.S;
    const m = this.markers.get(request.spawn);
    if (!m || request.kind === 'windlass' || !ENEMIES[request.kind]) return null;
    // a vignette already stood this actor on its marker: the wave takes it over instead of doubling it
    for (let i = 0; i < MAX_ACTORS; i++) {
      const o = S.actors[i] as Actor;
      if (!o.used || !o.alive || o.marker !== request.spawn || o.kind !== request.kind) continue;
      if (o.vignette === '' && o.awake) continue;
      o.encounter = request.encounter; o.counted = request.counted; o.wave = request.wave; o.order = request.order;
      if (request.lane !== '') { o.lane = S.nav.laneIndex(request.lane); o.laneFollow = o.lane >= 0; }
      return o;
    }
    if (!this.allowed(request.kind, request.encounter)) return null;
    const e = this.pool.create(request.kind, m.pos[0], m.pos[1], m.pos[2], (m.rotY ?? 0) * DEG2RAD);
    if (!e) return null;
    e.encounter = request.encounter; e.counted = request.counted; e.wave = request.wave; e.entrance = request.entrance;
    e.lane = S.nav.laneIndex(request.lane); e.order = request.order;
    e.marker = request.spawn; e.zone = m.zone;
    this.begin(e, request, m);
    return e;
  }

  private find(id: EntityId): Actor | null {
    const S = this.S;
    for (let i = 0; i < MAX_ACTORS; i++) { const e = S.actors[i] as Actor; if (e.used && e.id === id) return e; }
    return null;
  }

  private wakeActor(e: Actor): void {
    if (!e.alive || e.awake) return;
    if (e.kind === 'bider') wakeBider(this.S, e);
    else if (e.kind === 'tamper') wakeTamper(this.S, e);
    e.awake = true;
    e.shown = true;
    if (e.inst) e.inst.root.visible = true;
  }

  // ---- EnemiesApi ---------------------------------------------------------------------------------------
  spawn(request: Readonly<SpawnRequest>): EntityId {
    if (request.kind === 'windlass') return this.bossImpl.ensureBody() ? this.bossImpl.ref.id : '';
    const e = this.spawnActor(request);
    return e ? e.id : '';
  }
  spawnAt(kind: EnemyKind, x: number, y: number, z: number, yaw: number): EntityId {
    if (kind === 'windlass') return this.bossImpl.ensureBody() ? this.bossImpl.ref.id : '';
    const e = this.place(kind, x, y, z, yaw);
    return e ? e.id : '';
  }
  wake(id: EntityId): void { const e = this.find(id); if (e) this.wakeActor(e); }
  wakeEncounter(encounter: EncounterId): void {
    const S = this.S;
    for (let i = 0; i < MAX_ACTORS; i++) { const e = S.actors[i] as Actor; if (e.used && e.encounter === encounter) this.wakeActor(e); }
  }
  clearEncounter(encounter: EncounterId): void {
    const S = this.S;
    for (let i = 0; i < MAX_ACTORS; i++) { const e = S.actors[i] as Actor; if (e.used && e.encounter === encounter) this.pool.release(e, false); }
    this.stakes.clear(encounter);
    if (encounter === 'enc_windlass') this.bossImpl.stop();
  }
  /** Nothing of a run stays: enemies, projectiles, tokens, vignettes, static bodies, the boss's state. */
  clearAll(): void {
    this.wipe();
    this.bossImpl.reset();
    this.bossImpl.parleyHeard = false;
    this.bossImpl.deaths = 0;
    this.bossImpl.retryOf = '';
    this.deathsPhase = 'idle';
    this.forgetRun();
    this.S.rings.clear();
  }
  /** What is said or given once per run of a fight is owed again: a new run, or everything cleared. */
  private forgetRun(): void {
    this.bossImpl.forgetRun();
    this.slamDeath = false; this.ringHintAt = -1;
    this.tamperDeaths = 0; this.tamperDeath = false; this.ringSaid = false; this.backSaid = false; this.respawnKey = '';
    this.S.tamperHelp = 0;
  }
  /** Is a Tamper up and fighting (not the pounding one behind the bulkhead)? */
  private tamperAwake(): boolean {
    const S = this.S;
    for (let i = 0; i < MAX_ACTORS; i++) { const e = S.actors[i] as Actor; if (e.used && e.alive && e.awake && e.kind === 'tamper' && e.state !== 'vignette') return true; }
    return false;
  }
  /** tests: the Tamper's help as it stands */
  tamperHelpState(): Record<string, unknown> {
    return { deaths: this.tamperDeaths, help: this.S.tamperHelp, ringSaid: this.ringSaid, backSaid: this.backSaid, rings: this.S.rings.mask };
  }
  setTamperDeaths(n: number): void { this.tamperDeaths = n; this.S.tamperHelp = Math.min(TAMPER.helpMax, n); }
  /** `TAMPER.hintKey` from the Tamper itself (its second slam): once per run of the fight. */
  private sayRing(): void {
    if (this.ringSaid || this.ctx.data.story.lines[TAMPER.hintKey] === undefined) return;
    this.ringSaid = true;
    this.S.say(TAMPER.hintKey);
  }
  private wipe(): void {
    const S = this.S;
    for (let i = 0; i < MAX_ACTORS; i++) this.pool.release(S.actors[i] as Actor, false);
    this.stakes.clear(null);
    this.pool.clearStatics();
    this.vignettes.clear(true);
    S.tokens.reset();
    S.tokens.cap = S.difficulty.attackTokens;
    S.dealt = 0; S.maxHit = 0;
  }
  aliveCount(encounter: EncounterId | ''): number {
    let n = this.countAlive(null, encounter === '' ? null : encounter);
    if (this.bossImpl.alive && (encounter === '' || encounter === 'enc_windlass')) n++;
    return n;
  }
  get threat(): number {
    const S = this.S;
    let t = this.bossImpl.alive ? ENEMIES.windlass.threat : 0;
    for (let i = 0; i < MAX_ACTORS; i++) { const e = S.actors[i] as Actor; if (e.used && e.alive && e.awake) t += ENEMIES[e.kind].threat; }
    return t;
  }
  list(out: EnemyView[]): number {
    const S = this.S;
    let n = 0;
    for (let i = 0; i < MAX_ACTORS && n < out.length; i++) {
      const e = S.actors[i] as Actor;
      if (!e.used) continue;
      const v = out[n] as EnemyView;
      v.id = e.id; v.kind = e.kind; v.state = e.state; v.hp = e.hp; v.x = e.x; v.y = e.y; v.z = e.z; v.yaw = e.yaw;
      v.encounter = e.encounter; v.alive = e.alive; v.hasToken = e.token !== '';
      n++;
    }
    const b = this.bossImpl;
    if (b.alive && b.inst && n < out.length) {
      const v = out[n] as EnemyView;
      v.id = b.ref.id; v.kind = 'windlass'; v.state = b.phase; v.hp = b.pips; v.x = b.axisX; v.y = b.axisY; v.z = b.axisZ;
      v.yaw = -b.arm.heading * DEG2RAD; v.encounter = 'enc_windlass'; v.alive = true; v.hasToken = false;
      n++;
    }
    return n;
  }
  startBoss(fromPhase: BossPhase, parleyHeard: boolean): void { this.bossImpl.start(fromPhase, parleyHeard); }
  playVignette(id: VignetteId): void { this.vignettes.play(id); }
  setAiEnabled(on: boolean): void { this.S.ai = on; }

  // ---- DebugHost ----------------------------------------------------------------------------------------
  setBossPhase(phase: BossPhase): void { this.bossImpl.forgetRun(); this.bossImpl.startPhase(phase); }   // a debug jump is a fresh timeline: its first haul teaches
  killAll(freed: boolean): number {
    const S = this.S;
    let n = 0;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = S.actors[i] as Actor;
      if (!e.used || !e.alive) continue;
      if (e.kind === 'bider') { if (freed) freeBider(S, e, 'crown'); else fellBider(S, e, e.x - S.px, e.z - S.pz); }
      else if (e.kind === 'transit') killTransit(S, e);
      else killTamper(S, e);
      n++;
    }
    return n;
  }
  bossState(): Record<string, unknown> { return this.bossImpl.debugState(); }
  setBossDeaths(n: number, lastKind?: DamageKind | ''): void { this.bossImpl.deaths = n; if (lastKind !== undefined) this.bossImpl.lastDeath = lastKind; }
  /** tests (pass i3): has an asking been heard in this page (a shot in the next one skips instead of refusing)? */
  setBossAsked(v: boolean): void { this.bossImpl.askedBefore = v; }
  lobCanister(x: number, y: number, z: number): boolean {
    const v = this.S.v2;
    this.bossImpl.canisterPos(v);
    return this.bossImpl.ord.launchCanister(v.x, v.y, v.z, x, y, z, 38);
  }
  bossPoint(kind: 'knot' | 'pawl' | 'guard' | 'hub', i: number): [number, number, number] {
    const v = this.S.v2;
    this.bossImpl.pointOf(kind, i, v);
    return [v.x, v.y, v.z];
  }
  sightPeak(reset: boolean): number { const v = this.sightUsedPeak; if (reset) this.sightUsedPeak = 0; return v; }

  // ---- save ---------------------------------------------------------------------------------------------
  captureSave(): EnemiesSave {
    const b = this.bossImpl.save();
    return {
      bossPhase: b.bossPhase, parleyHeard: b.parleyHeard, deathsInBossPhase: b.deathsInBossPhase,
      statics: this.S.statics.map((s) => ({ asset: s.asset, x: s.x, y: s.y, z: s.z, rotY: s.rotY })),
    };
  }
  applySave(data: EnemiesSave): void {
    const deaths = this.bossImpl.deaths;
    this.wipe();
    for (const s of data.statics ?? []) if (this.ctx.assets.isActive(s.asset)) this.pool.addStatic(s.asset, s.x, s.y, s.z, s.rotY);
    this.bossImpl.restore(data, deaths, this.deathsPhase);
  }

  debugState(): DebugSnapshot {
    const S = this.S;
    const actors: Record<string, unknown>[] = [];
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = S.actors[i] as Actor;
      if (!e.used) continue;
      actors.push({
        id: e.id, kind: e.kind, state: e.state, hp: round4(e.hp), alive: e.alive, awake: e.awake, token: e.token,
        x: round4(e.x), y: round4(e.y), z: round4(e.z), yawDeg: round4(e.yaw * RAD2DEG), encounter: e.encounter, clip: e.clip,
      });
    }
    const t = this.debug.tokens();
    return {
      ai: S.ai, difficulty: S.difficultyId, time: round4(S.time), alive: this.aliveCount(''), threat: this.threat,
      tokens: t, actors, stakes: { flying: S.stakes.flying, stuck: S.stakes.stuck }, statics: S.statics.length,
      navNodes: S.nav.count, boss: this.bossImpl.debugState(), vignettes: this.vignettes.debugState(),
    };
  }
}

export const createEnemySystem: CreateEnemySystem = (ctx) => new Enemies(ctx);
