// window.__dbg (ARCHITECTURE 11.2), version 2. Implemented against the contracts only: every cheat delegates to a
// system's API or `debug` surface, and the path walker moves the player by input through the real tick.
import { ACTIONS, ColFlag, FIXED_DT, LAYER_SHOT, PLAYER_EYE } from './contracts.ts';
import type {
  Action, BossPhase, CheckpointId, DamageInfo, DamageKind, DamageSource, DebugCondition, DebugHook, DebugPlayerState, DebugState, DebugStepResult, DebugUntilResult,
  DebugWalkOptions, DebugWalkReason, DebugWalkResult, Difficulty, DoorState, EncounterId, EncounterView, EnemyKind, EnemyView,
  EntityId, EntityKind, EventName, GameContext, GameEvents, GameSystem, HitPart, HitResult, LoggedEvent, MarkerId, NavNode,
  Options, PerfStats, PuzzleId, PuzzleView, RenderTier, RunStats, SeventhState, StoryKey, SurfaceType, SystemId, Vec3,
} from './contracts.ts';
import { coreOf } from './context.ts';
import type { CoreInternals } from './context.ts';
import { getLoop } from './loop.ts';
import type { Loop } from './loop.ts';
import storyJson from '../../design/story.json';
import { RAD2DEG, firstNonFinite, fnv1a, nonFiniteCount, roundDeep, yawOf } from './math.ts';

const PUZZLES: readonly PuzzleId[] = ['seven_jugs', 'daylight', 'proving_line', 'the_asking'];
const ENCOUNTERS: readonly EncounterId[] = ['enc_street', 'enc_yard', 'enc_tally', 'enc_file', 'enc_matador', 'enc_windlass'];
const ENEMY_KINDS: readonly EnemyKind[] = ['bider', 'transit', 'tamper', 'windlass'];
const BOSS_PHASES: readonly BossPhase[] = ['idle', 'parley', 'p1', 'p2', 'p3a', 'hush', 'proven', 'p3b', 'dead'];
/** Bad arguments fail at the hook, by name: a NaN handed to a controller would otherwise sit in the player's position. */
function finite(method: string, names: string, ...values: (number | undefined)[]): void {
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v))) throw new Error(`__dbg.${method}: ${names.split(' ')[i] ?? 'argument ' + i} is ${String(v)} (a finite number is needed)`);
  }
}
function member<T extends string>(method: string, value: T, list: readonly T[]): void {
  if (!list.includes(value)) throw new Error(`__dbg.${method}: unknown id '${String(value)}' (${list.join(', ')})`);
}
const STUCK_TICKS = 45;
const STUCK_PROGRESS = 0.05;
const NODE_RADIUS = 0.4;
const NODE_RADIUS_LOS = 0.8;
const MAX_VIEWS = 32;
/** followPath resumes its previous route while the player is within this distance of the link she was walking */
const RESUME_RADIUS = 3;

interface Tap { action: Action; left: number; started: boolean }

function emptyView(): EnemyView {
  return { id: '', kind: 'bider', state: '', hp: 0, x: 0, y: 0, z: 0, yaw: 0, encounter: '', alive: false, hasToken: false };
}

class DebugHookImpl implements DebugHook {
  readonly version = 2 as const;
  ready = false;
  readonly ext: Record<string, Record<string, (...args: never[]) => unknown>>;
  private readonly core: CoreInternals;
  private readonly loop: Loop;
  private readonly heldCodes = new Set<string>();
  private readonly heldActions = new Set<Action>();
  private readonly taps: Tap[] = [];
  private lookPending = false;
  private godOn = false;
  private seedValue: number;
  private readonly views: EnemyView[] = [];
  private readonly hit: HitResult;
  private readonly centre: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly ctx: GameContext, private readonly systems: readonly GameSystem[]) {
    this.core = coreOf(ctx);
    this.loop = getLoop(ctx, systems);
    this.ext = this.core.debug.ext;
    this.seedValue = ctx.flags.seed;
    for (let i = 0; i < MAX_VIEWS; i++) this.views.push(emptyView());
    this.hit = ctx.collision.createHit();
    this.loop.preTick = () => this.tapsBegin();
    this.loop.postTick = () => this.tapsEnd();
  }

  get error(): string | null { return this.core.error; }
  set error(text: string | null) { this.core.error = text; }

  /**
   * roundDeep that does not hide a NaN: the snapshot still carries 0 (JSON has no NaN), but the first non-finite number
   * found is written to `__dbg.error` with its path (`state(): player.x is NaN`), so the harness fails the test.
   */
  private round<T>(value: T, path: string): T {
    const before = nonFiniteCount();
    const out = roundDeep(value);
    if (nonFiniteCount() !== before && this.core.error === null) {
      const bad = firstNonFinite(value);
      this.core.error = `state(): ${path}${bad ? bad.path : ''} is ${bad ? bad.text : 'not finite'}`;
    }
    return out;
  }

  // ---- time ---------------------------------------------------------------------------------------
  private result(): DebugStepResult {
    return { tick: this.ctx.clock.tick, simTime: roundDeep(this.ctx.clock.simTime), state: this.ctx.state.current };
  }
  /**
   * One tick through the loop. The taps are pressed and counted off by the loop's own per-tick hooks (`tapsBegin` /
   * `tapsEnd`, installed in the constructor), so a tap works the same under `step()` and under the real-time loop.
   */
  private tickOnce(): void { this.loop.tick(); }
  private tapsBegin(): void {
    const taps = this.taps;
    if (taps.length === 0) return;
    const input = this.core.input;
    for (let i = 0; i < taps.length; i++) {
      const t = taps[i] as Tap;
      if (!t.started) { t.started = true; input.injectAction(t.action, true); }
    }
  }
  private tapsEnd(): void {
    const taps = this.taps;
    if (taps.length === 0) return;
    const input = this.core.input;
    for (let i = taps.length - 1; i >= 0; i--) {
      const t = taps[i] as Tap;
      if (!t.started) continue;                              // queued inside this tick (by a handler): it starts with the next
      if (--t.left <= 0) {
        taps.splice(i, 1);
        if (!this.heldActions.has(t.action)) input.injectAction(t.action, false);
      }
    }
  }
  /**
   * True while a flow job (a respawn, a restart, a warp, the start of a run) is still running. Those jobs run on
   * promises, which cannot settle inside a synchronous call, so NO TICK IS RUN WHILE ONE IS PENDING: step, stepUntil,
   * perfRun, walkTo and followPath stop there and return what they did (`ext.core.ran()` has the tick count). The
   * asynchronous `ext.core.stepAsync` / `untilAsync` (what tests/harness.mjs calls) let the job finish and go on, so
   * the tick a restore lands on is the same however the caller batched its steps.
   */
  get busy(): boolean { const f = this.core.flow; return f !== null && f.busy; }
  /** ticks the last step / stepUntil / perfRun call really ran */
  ran = 0;
  private warned = false;
  /**
   * One console.warn (the first time only) when a synchronous call returned with ticks left because a flow job is
   * pending: a raw page.evaluate script must not lose ticks silently. The harness never gets here (it steps through
   * stepAsync / untilAsync).
   */
  private warnShort(method: string, ran: number, asked: number): void {
    if (this.warned || ran >= asked || !this.busy) return;
    this.warned = true;
    console.warn(`__dbg.${method}: ran ${ran} of ${asked} ticks and stopped, because a flow job (a respawn, a restart, a warp, the start of a run) is pending and no tick runs until it settles. Use await __dbg.ext.core.stepAsync(n) / untilAsync(condition, maxSteps), or game.step / game.until / game.run of tests/harness.mjs. (__dbg.ext.core.ran() has the count; this warning is printed once.)`);
  }
  step(n = 1, render = true): DebugStepResult {
    const r = this.stepSync(n, render);
    this.warnShort('step', this.ran, n);
    return r;
  }
  private stepSync(n: number, render: boolean): DebugStepResult {
    let i = 0;
    for (; i < n; i++) {
      if (this.busy) break;
      this.tickOnce();
      if (this.lookPending) {
        // look deltas apply on the next tick's frame: one update / lateUpdate pass without drawing
        this.lookPending = false;
        this.loop.renderFrame(FIXED_DT, 1, false);
      }
    }
    this.ran = i;
    if (render) this.loop.renderFrame(FIXED_DT, 1, true);
    return this.result();
  }
  /** Resolves when no flow job and no asset activation is pending. Throws if one cannot finish without ticks. */
  async idle(): Promise<void> {
    const flow = this.core.flow;
    if (!flow) return;
    for (let round = 0; this.busy; round++) {
      if (round > 64) throw new Error('__dbg: flow jobs keep being queued while no tick runs');
      let timer = 0;
      const late = new Promise<'late'>((resolve) => { timer = setTimeout(() => resolve('late'), 30000) as unknown as number; });
      const got = await Promise.race([flow.idle().then(() => 'done' as const), late]);
      clearTimeout(timer);
      if (got === 'late') throw new Error('__dbg: a flow job (respawn, restart, warp) did not finish within 30 s without a tick; restoreCheckpoint / beginRun must not wait on the simulation');
    }
    await this.core.assets.idle();
  }
  /** step(n) across flow jobs: every one of the n ticks is run, each job settles between the same two ticks on every run. */
  async stepAsync(n = 1, render = false): Promise<DebugStepResult> {
    let left = n;
    for (;;) {
      await this.idle();
      if (left <= 0) break;
      this.stepSync(left, false);
      left -= this.ran;
    }
    this.ran = n;
    if (render) this.loop.renderFrame(FIXED_DT, 1, true);
    return this.result();
  }
  /** stepUntil across flow jobs; the condition is also looked at after a job settles (a respawn ends in 'playing' with no tick). */
  async untilAsync(condition: DebugCondition, maxSteps: number): Promise<DebugUntilResult> {
    const since = this.core.events.lastSeq;
    let steps = 0, met = false;
    for (;;) {
      await this.idle();
      if (steps > 0 && this.conditionMet(condition, since)) { met = true; break; }
      if (steps >= maxSteps) break;
      const r = this.untilSync(condition, maxSteps - steps, since);
      steps += r.steps;
      if (r.met) { met = true; await this.idle(); break; }
      if (r.steps === 0 && !this.busy) break;
    }
    this.ran = steps;
    return { ...this.result(), met, steps };
  }
  private resolvePath(root: unknown, path: string): unknown {
    let v: unknown = root;
    for (const key of path.split('.')) {
      if (v === null || typeof v !== 'object') return undefined;
      v = (v as Record<string, unknown>)[key];
    }
    return v;
  }
  private conditionMet(c: DebugCondition, sinceSeq: number): boolean {
    if ('state' in c) return this.ctx.state.current === c.state;
    if ('event' in c) {
      const bus = this.core.events;
      for (let s = sinceSeq + 1; s <= bus.lastSeq; s++) {
        const e = bus.eventAt(s);
        if (!e || e.name !== c.event) continue;
        let ok = true;
        if (c.where) for (const k of Object.keys(c.where)) if (e.payload[k] !== c.where[k]) { ok = false; break; }
        if (ok) return true;
      }
      return false;
    }
    const v = this.resolvePath(this.state(), c.path);
    const w = c.value;
    switch (c.op) {
      case '==': return v === w;
      case '!=': return v !== w;
      case '<': return (v as number) < (w as number);
      case '<=': return (v as number) <= (w as number);
      case '>': return (v as number) > (w as number);
      case '>=': return (v as number) >= (w as number);
      default: return false;
    }
  }
  stepUntil(condition: DebugCondition, maxSteps: number, sinceSeq = -1): DebugUntilResult {
    const r = this.untilSync(condition, maxSteps, sinceSeq);
    if (!r.met) this.warnShort('stepUntil', r.steps, maxSteps);
    return r;
  }
  private untilSync(condition: DebugCondition, maxSteps: number, sinceSeq: number): DebugUntilResult {
    const since = sinceSeq >= 0 ? sinceSeq : this.core.events.lastSeq;
    let steps = 0, met = false;
    let cursor = since;
    while (steps < maxSteps) {
      if (this.busy) break;                                  // see `busy`: the caller lets the job settle and calls again
      this.tickOnce();
      steps++;
      if ('event' in condition) {
        // only the events not looked at yet need looking at
        met = this.conditionMet(condition, cursor);
        cursor = this.core.events.lastSeq;
      } else met = this.conditionMet(condition, since);
      if (met) break;
    }
    this.ran = steps;
    return { ...this.result(), met, steps };
  }
  setRealtime(on: boolean): void { if (on) this.loop.start(); else this.loop.stop(); }
  seed(n: number): void { this.seedValue = n; this.core.rng.reseed(n); }

  // ---- flow ---------------------------------------------------------------------------------------
  private flow(): NonNullable<CoreInternals['flow']> {
    const f = this.core.flow;
    if (!f) throw new Error('the game has not booted');
    return f;
  }
  async start(options: { checkpoint?: CheckpointId; difficulty?: Difficulty } = {}): Promise<DebugStepResult> {
    const flow = this.flow();
    await flow.idle();
    const state = this.ctx.state.current;
    if (state === 'title' || state === 'ending') await flow.play(options.difficulty);
    else if (options.difficulty) this.ctx.options.set('difficulty', options.difficulty);
    if (options.checkpoint && options.checkpoint !== this.ctx.world.checkpoint) await flow.warp(options.checkpoint);
    await this.core.assets.idle();
    return this.result();
  }
  async checkpoint(id: CheckpointId): Promise<DebugStepResult> {
    const flow = this.flow();
    await flow.idle();
    if (this.ctx.state.current === 'title' || this.ctx.state.current === 'ending') await flow.play();
    await flow.warp(id);
    await this.core.assets.idle();
    return this.result();
  }
  pause(on: boolean): void {
    if (on) this.ctx.state.request('paused', 'debug', 'menu'); else this.ctx.state.request('playing', 'resume');
  }
  setOption<K extends keyof Options>(key: K, value: Options[K]): void { this.ctx.options.set(key, value); }
  setTier(tier: RenderTier): void {
    if (!Object.prototype.hasOwnProperty.call(this.ctx.data.manifest.tiers, tier)) throw new Error(`__dbg.setTier: unknown id '${String(tier)}' (${Object.keys(this.ctx.data.manifest.tiers).join(', ')})`);
    this.ctx.quality.setTier(tier, 'user');
  }

  // ---- input --------------------------------------------------------------------------------------
  setKeys(codes: string[]): void {
    const input = this.core.input;
    for (const c of Array.from(this.heldCodes)) if (!codes.includes(c)) { this.heldCodes.delete(c); input.injectCode(c, false); }
    for (const c of codes) if (!this.heldCodes.has(c)) { this.heldCodes.add(c); input.injectCode(c, true); }
  }
  setActions(actions: Action[]): void {
    const input = this.core.input;
    for (const a of ACTIONS) {
      const want = actions.includes(a);
      if (want === this.heldActions.has(a)) continue;
      if (want) this.heldActions.add(a); else this.heldActions.delete(a);
      input.injectAction(a, want);
    }
  }
  tap(action: Action, ticks = 1): void { this.taps.push({ action, left: Math.max(1, ticks), started: false }); }
  look(dx: number, dy: number): void { finite('look', 'dx dy', dx, dy); this.core.input.injectLook(dx, dy); this.lookPending = true; }
  setAim(yawDeg: number, pitchDeg: number): void { finite('setAim', 'yawDeg pitchDeg', yawDeg, pitchDeg); this.ctx.player.debug.setAim(yawDeg, pitchDeg); }
  aimAt(x: number, y: number, z: number, errorM = 0): void {
    finite('aimAt', 'x y z errorM', x, y, z, errorM);
    const p = this.ctx.player.position;
    const ex = p.x, ey = p.y + PLAYER_EYE, ez = p.z;
    let dx = x - ex, dy = y - ey, dz = z - ez;
    if (errorM > 0) {
      // a seeded lateral miss: offset the target in the plane across the line of sight
      const rng = this.aimRng ?? (this.aimRng = this.ctx.rng.fork('debug/aim'));
      const len = Math.hypot(dx, dy, dz) || 1;
      const fx = dx / len, fy = dy / len, fz = dz / len;
      let rx = -fz, rz = fx;                               // right = forward x up, flattened
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      const ux = -fy * rz, uy = fz * rx - fx * rz, uz = fy * rx;   // up = right x forward
      const a = rng.next() * Math.PI * 2, c = Math.cos(a) * errorM, s = Math.sin(a) * errorM;
      dx += rx * c + ux * s; dy += uy * s; dz += rz * c + uz * s;
    }
    const yaw = yawOf(dx, dz) * RAD2DEG;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) * RAD2DEG;
    this.ctx.player.debug.setAim(yaw, pitch);
  }
  private aimRng: ReturnType<GameContext['rng']['fork']> | null = null;
  aimAtEntity(id: EntityId, part?: HitPart, errorM = 0): boolean {
    if (!this.ctx.collision.volumeCentre(id, part ?? null, this.centre)) return false;
    this.aimAt(this.centre.x, this.centre.y, this.centre.z, errorM);
    return true;
  }
  aimAtMarker(id: MarkerId): boolean {
    const m = this.ctx.data.layout.markers.find((x) => x.id === id);
    if (!m) return false;
    this.aimAt(m.pos[0], m.pos[1], m.pos[2]);
    return true;
  }

  // ---- movement by input ----------------------------------------------------------------------------
  private walkResult(reason: DebugWalkReason, ticks: number, node: string, gate: MarkerId | '', stuck: boolean): DebugWalkResult {
    const p = this.ctx.player.position;
    const at = { x: roundDeep(p.x), y: roundDeep(p.y), z: roundDeep(p.z) };
    return { arrived: reason === 'arrived', reason, ticks, x: at.x, y: at.y, z: at.z, stuckAt: stuck ? at : null, node, gate };
  }
  private holdWalk(on: boolean, sprint: boolean): void {
    const input = this.core.input;
    input.injectAction('forward', on || this.heldActions.has('forward'));
    if (sprint) input.injectAction('sprint', on || this.heldActions.has('sprint'));
  }
  /**
   * Walk toward (x, z) until within `radius`. Returns null when it got there, else why it stopped.
   * `budget.ticks` counts every tick taken; `los` (optional) widens the radius to NODE_RADIUS_LOS when that point is in sight.
   */
  private walkLeg(x: number, z: number, radius: number, options: DebugWalkOptions, budget: { ticks: number; max: number }, los: NavNode | null): DebugWalkReason | null {
    const { ctx } = this;
    const player = ctx.player, p = player.position;
    let best = Infinity, idle = 0;
    for (;;) {
      const dx = x - p.x, dz = z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= radius) return null;
      if (los && dist <= NODE_RADIUS_LOS
        && ctx.collision.lineOfSight(p.x, p.y + 1.0, p.z, los.pos[0], los.pos[1] + 1.0, los.pos[2], ColFlag.LOW | ColFlag.GRILLE)) return null;
      if (!player.alive) return 'dead';
      if (ctx.state.current !== 'playing') return 'state';
      if (budget.ticks >= budget.max) return 'max_ticks';
      if (this.busy) return 'state';                         // a flow job is pending: no tick until it has settled
      if (dist < best - STUCK_PROGRESS) { best = dist; idle = 0; } else if (++idle >= STUCK_TICKS) return 'stuck';
      player.debug.setAim(yawOf(dx, dz) * RAD2DEG, options.keepPitch ? player.pitch * RAD2DEG : 0);
      this.holdWalk(true, options.sprint === true);
      this.tickOnce();
      budget.ticks++;
    }
  }
  walkTo(x: number, z: number, options: DebugWalkOptions = {}): DebugWalkResult {
    finite('walkTo', 'x z', x, z);
    const budget = { ticks: 0, max: options.maxTicks ?? 3600 };
    let reason: DebugWalkReason | null;
    try {
      reason = this.walkLeg(x, z, options.stopRadius ?? NODE_RADIUS, options, budget, null);
    } finally {
      this.holdWalk(false, options.sprint === true);
    }
    return this.walkResult(reason ?? 'arrived', budget.ticks, '', '', reason === 'stuck');
  }
  private nodeLive(n: NavNode): boolean {
    const w = this.ctx.world;
    return w.builtZones.includes(n.zone) || (n.sets !== undefined && n.sets.includes(w.residentSet));
  }
  followPath(to: string, options: DebugWalkOptions = {}): DebugWalkResult {
    const { ctx } = this;
    const data = this.core.data, world = ctx.world, p = ctx.player.position;
    const budget = { ticks: 0, max: options.maxTicks ?? 3600 };
    if (!ctx.player.alive) return this.walkResult('dead', 0, '', '', false);
    if (ctx.state.current !== 'playing') return this.walkResult('state', 0, '', '', false);
    // ---- the node list: resume the previous call's place on the same route when she is still on it
    let path: string[] = [];
    let i = -1;
    let prev: NavNode | null = null;
    const c = this.cursor;
    if (c && c.to === to && c.index < c.path.length) {
      const target = data.navNode(c.path[c.index] as string) as NavNode;
      const before = c.index > 0 ? (data.navNode(c.path[c.index - 1] as string) as NavNode) : null;
      if (c.hasPrev && before && !data.portalBetween(before.id, target.id) && this.segmentDistance(p, before, target) <= RESUME_RADIUS) { path = c.path; i = c.index; prev = before; }
      else if (c.hasPrev && before && data.portalBetween(before.id, target.id) && this.nodeDistance(p, before) <= RESUME_RADIUS) { path = c.path; i = c.index; prev = before; }
      else if (this.nodeDistance(p, target) <= RESUME_RADIUS) { path = c.path; i = c.index; prev = null; }
    }
    if (i < 0) {
      if (to === 'critical') path = data.layout.nav.criticalPath;
      else {
        const goal = data.resolveNode(to);
        const start = data.nearestNode(p.x, p.y, p.z, (n) => this.nodeLive(n));
        if (goal < 0 || start < 0) return this.walkResult('no_path', 0, '', '', false);
        path = data.navPathIndex(start, goal, false);
      }
      if (path.length === 0) return this.walkResult('no_path', 0, '', '', false);
      // the nearest link of the route (a portal is not a link she can stand on); its far end is the first target
      let bestD = Infinity;
      i = 0;
      for (let k = 0; k < path.length; k++) {
        const a = data.navNode(path[k] as string) as NavNode;
        if (!this.nodeLive(a)) continue;
        const dn = this.nodeDistance(p, a);
        if (dn < bestD) { bestD = dn; i = k; prev = null; }
        if (k + 1 >= path.length) continue;
        const b = data.navNode(path[k + 1] as string) as NavNode;
        if (!this.nodeLive(b) || data.portalBetween(a.id, b.id)) continue;
        const ds = this.segmentDistance(p, a, b);
        // on the link itself (past its start): head for its end
        if (ds <= bestD + 1e-9 && this.segmentT > 1e-6) { bestD = ds; i = k + 1; prev = a; }
      }
      if (bestD === Infinity) return this.walkResult('no_path', 0, '', '', false);
      // standing on the start node of a link: that node is reached, the link is next
      if (prev === null && i + 1 < path.length && bestD <= NODE_RADIUS) { prev = data.navNode(path[i] as string) as NavNode; i++; }
    }
    let last = prev ? prev.id : '';
    let reason: DebugWalkReason | null = null;
    let gate: MarkerId | '' = '';
    try {
      for (; i < path.length; i++) {
        const node = data.navNode(path[i] as string) as NavNode;
        if (prev) {
          if (data.portalBetween(prev.id, node.id)) { reason = 'portal'; break; }
          const doors = data.gatesOfLink(prev.id, node.id);
          for (let d = 0; d < doors.length; d++) if (world.doorState(doors[d] as string) !== 'open') { gate = doors[d] as string; break; }
          if (gate !== '') { reason = 'gate'; break; }
        }
        if (!this.nodeLive(node)) { reason = 'state'; break; }       // the world has not built that far yet
        const final = i === path.length - 1;
        let los: NavNode | null = null;
        if (!final) {
          const next = data.navNode(path[i + 1] as string) as NavNode;
          // the wider radius only when the following link can simply be walked
          if (!data.portalBetween(node.id, next.id) && data.gatesOfLink(node.id, next.id).length === 0 && this.nodeLive(next)) los = next;
        }
        reason = this.walkLeg(node.pos[0], node.pos[2], final ? options.stopRadius ?? NODE_RADIUS : NODE_RADIUS, options, budget, los);
        if (reason) break;
        prev = node; last = node.id;
      }
    } finally {
      this.holdWalk(false, options.sprint === true);
    }
    this.cursor = reason === null ? null : { to, path, index: Math.min(i, path.length - 1), hasPrev: prev !== null };
    return this.walkResult(reason ?? 'arrived', budget.ticks, last, gate, reason === 'stuck');
  }
  /** where the last followPath stopped on its route, so the next call with the same target goes on from there */
  private cursor: { to: string; path: string[]; index: number; hasPrev: boolean } | null = null;
  private segmentT = 0;
  /** Distance from a point to a nav node; a metre of height counts double (another storey is far). */
  private nodeDistance(p: Readonly<Vec3>, n: NavNode): number {
    return Math.hypot(n.pos[0] - p.x, (n.pos[1] - p.y) * 2, n.pos[2] - p.z);
  }
  /** Distance from a point to the link a -> b (same metric); leaves the parameter of the nearest point in segmentT. */
  private segmentDistance(p: Readonly<Vec3>, a: NavNode, b: NavNode): number {
    const ax = a.pos[0], ay = a.pos[1] * 2, az = a.pos[2];
    const bx = b.pos[0] - ax, by = b.pos[1] * 2 - ay, bz = b.pos[2] - az;
    const px = p.x - ax, py = p.y * 2 - ay, pz = p.z - az;
    const len2 = bx * bx + by * by + bz * bz;
    let t = len2 > 1e-9 ? (px * bx + py * by + pz * bz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    this.segmentT = t;
    return Math.hypot(px - bx * t, py - by * t, pz - bz * t);
  }
  navPath(from: string, to: string): string[] { return this.ctx.data.navPath(from, to, false); }

  // ---- cheats -------------------------------------------------------------------------------------
  teleport(x: number, y: number, z: number, yawDeg?: number, pitchDeg?: number): void {
    finite('teleport', 'x y z yawDeg pitchDeg', x, y, z, yawDeg, pitchDeg);
    const pl = this.ctx.player;
    pl.teleport(x, y, z, yawDeg ?? pl.yaw * RAD2DEG, pitchDeg ?? pl.pitch * RAD2DEG);
  }
  teleportToMarker(id: MarkerId, yawDeg?: number): boolean {
    const m = this.ctx.data.layout.markers.find((x) => x.id === id);
    if (!m) return false;
    this.ctx.player.teleport(m.pos[0], m.pos[1], m.pos[2], yawDeg ?? m.rotY ?? 0, 0);
    return true;
  }
  god(on: boolean): void { this.godOn = on; this.ctx.player.setGodMode(on); }
  setHealth(hp: number): void { finite('setHealth', 'hp', hp); this.ctx.player.debug.setHealth(hp); }
  setAmmo(chambered: number, reserve: number, lineRounds: number): void { this.ctx.player.debug.setAmmo(chambered, reserve, lineRounds); }
  aiEnabled(on: boolean): void { this.ctx.enemies.setAiEnabled(on); }
  spawnEnemy(kind: EnemyKind, x: number, y: number, z: number, yawDeg = 0): EntityId {
    member('spawnEnemy', kind, ENEMY_KINDS);
    finite('spawnEnemy', 'kind x y z yawDeg', 0, x, y, z, yawDeg);
    return this.ctx.enemies.debug.spawnAt(kind, x, y, z, yawDeg);
  }
  killAll(freed = false): number { return this.ctx.enemies.debug.killAll(freed); }
  solvePuzzle(id: PuzzleId): void {
    member('solvePuzzle', id, PUZZLES);
    this.ctx.world.debug.solvePuzzle(id);
  }
  clearEncounter(id: EncounterId): void {
    member('clearEncounter', id, ENCOUNTERS);
    this.ctx.world.debug.clearEncounter(id);
  }
  setBossPhase(phase: BossPhase): void { member('setBossPhase', phase, BOSS_PHASES); this.ctx.enemies.debug.setBossPhase(phase); }
  emit<K extends EventName>(name: K, payload: GameEvents[K]): void { this.ctx.events.emit(name, payload); }

  // ---- queries ------------------------------------------------------------------------------------
  player(): DebugPlayerState {
    const pl = this.ctx.player, w = pl.weapon;
    return this.round({
      x: pl.position.x, y: pl.position.y, z: pl.position.z, vx: pl.velocity.x, vy: pl.velocity.y, vz: pl.velocity.z,
      yawDeg: pl.yaw * RAD2DEG, pitchDeg: pl.pitch * RAD2DEG,
      grounded: pl.grounded, sprinting: pl.sprinting, alive: pl.alive, health: pl.health, zone: this.ctx.world.zone,
      phase: w.phase, cylinder: w.cylinder.slice(), chambered: w.chambered, reserve: w.reserve, lineRounds: w.lineRounds, seventh: w.seventh,
      god: this.godOn,
    }, 'player');
  }
  enemies(): EnemyView[] {
    const n = this.ctx.enemies.list(this.views);
    const out: EnemyView[] = [];
    for (let i = 0; i < n; i++) out.push(this.round({ ...(this.views[i] as EnemyView) }, `enemies[${i}]`));
    return out;
  }
  puzzles(): Record<PuzzleId, PuzzleView> {
    const out = {} as Record<PuzzleId, PuzzleView>;
    for (const id of PUZZLES) { const v = this.ctx.world.puzzle(id); out[id] = this.round({ ...v, data: { ...v.data } }, 'puzzles.' + id); }
    return out;
  }
  objectives(): { current: StoryKey; text: string; checkpoint: CheckpointId } {
    const w = this.ctx.world;
    return { current: w.objective, text: this.ctx.data.story.objectives[w.objective] ?? '', checkpoint: w.checkpoint };
  }
  state(): DebugState {
    const { ctx } = this;
    const w = ctx.world, b = ctx.enemies.boss, ui = ctx.ui;
    const player = this.player(), enemies = this.enemies();   // first: a NaN is reported where it first shows, in reading order
    const encounters = {} as Record<EncounterId, EncounterView>;
    for (const id of ENCOUNTERS) encounters[id] = this.round({ ...w.encounter(id) }, 'encounters.' + id);
    const doors: Record<MarkerId, DoorState> = {};
    for (const m of ctx.data.markersOfType('door')) doors[m.id] = w.doorState(m.id);
    const systems = {} as Record<SystemId, Record<string, unknown>>;
    for (const s of this.systems) systems[s.id] = this.round(s.debugState(), 'systems.' + s.id);
    const stats: RunStats = this.round({ ...w.stats, secrets: w.stats.secrets.slice() }, 'stats');
    return {
      tick: ctx.clock.tick, simTime: this.round(ctx.clock.simTime, 'simTime'), game: ctx.state.current, seed: this.seedValue, rngState: ctx.rng.state,
      player,
      enemies,
      boss: this.round({ phase: b.phase, pips: b.pips, pipsTotal: b.pipsTotal, armBay: b.armBay, guard: b.guard, mouthsOpen: b.mouthsOpen, marksLit: b.marksLit, hush: b.hush }, 'boss'),
      puzzles: this.puzzles(),
      encounters,
      world: {
        zone: w.zone, cell: w.cell, set: w.residentSet, builtZones: w.builtZones.slice(), mood: w.mood, objective: w.objective,
        checkpoint: w.checkpoint, lamps: w.lamps, doors, flags: w.debug.flags(),
      },
      stats,
      ui: { screen: ui.screen, ...ui.visibleText() },
      systems,
    };
  }
  private copyPerf(p: Readonly<PerfStats>): PerfStats { return { ...p }; }
  perf(): PerfStats { return this.copyPerf(this.ctx.perf.last); }
  perfPeak(): PerfStats { return this.copyPerf(this.ctx.perf.peak); }
  perfReset(): void { this.ctx.perf.resetPeak(); }
  perfRun(ticks: number): PerfStats {
    this.ctx.perf.resetPeak();
    let i = 0;
    for (; i < ticks; i++) {
      if (this.busy) break;
      this.tickOnce();
      this.loop.renderFrame(FIXED_DT, 1, true);
    }
    this.ran = i;
    this.warnShort('perfRun', i, ticks);
    return this.copyPerf(this.ctx.perf.peak);
  }
  events(sinceSeq = 0, nameFilter?: string): LoggedEvent[] { return this.core.events.events(sinceSeq, nameFilter); }
  clearEvents(): void { this.core.events.clearEvents(); }
  hash(): string {
    // without the perf-dependent parts: the render system's snapshot (tier, draw state) is left out
    const s = this.state() as unknown as { systems: Record<string, unknown> };
    const systems: Record<string, unknown> = {};
    for (const k of Object.keys(s.systems)) if (k !== 'render') systems[k] = s.systems[k];
    s.systems = systems;
    return fnv1a(JSON.stringify(s));
  }
  probe(): { hit: boolean; distance: number; entityId: EntityId; entityKind: EntityKind; part: HitPart; surface: SurfaceType; x: number; y: number; z: number } {
    const pl = this.ctx.player, p = pl.position, f = pl.forward, h = this.hit;
    const got = this.ctx.collision.raycast(p.x, p.y + PLAYER_EYE, p.z, f.x, f.y, f.z, 200, LAYER_SHOT, h);
    return roundDeep({
      hit: got, distance: got ? h.distance : 0, entityId: got && h.entity ? h.entity.id : '', entityKind: got && h.entity ? h.entity.kind : 'world',
      part: got ? h.part : 'whole', surface: got ? h.surface : 'none', x: got ? h.x : 0, y: got ? h.y : 0, z: got ? h.z : 0,
    });
  }
  capture(): string {
    this.loop.renderFrame(FIXED_DT, 1, false);
    return this.ctx.render.capture();
  }
}

/** Installs window.__dbg (flags.test or flags.dev). `ready` is set last: assets active, level built, first frame drawn. */
export function installDebugHook(ctx: GameContext, systems: readonly GameSystem[]): DebugHook | null {
  if (!ctx.flags.test && !ctx.flags.dev) return null;
  const hook = new DebugHookImpl(ctx, systems);
  const core = coreOf(ctx);
  const damageScratch: DamageInfo = { amount: 0, kind: 'bullet', source: 'world', sourceId: 'world', ammo: null, shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
  // helpers beside the contract surface (ARCHITECTURE 11.2 `ext`): what tests/harness.mjs steps with, and the switch
  // an allocation test uses to leave the debug event ring out of its measurement
  core.debug.register('core', {
    busy: (() => hook.busy) as (...args: never[]) => unknown,
    ran: (() => hook.ran) as (...args: never[]) => unknown,
    idle: (() => hook.idle()) as (...args: never[]) => unknown,
    stepAsync: ((n?: number, render?: boolean) => hook.stepAsync(n, render)) as (...args: never[]) => unknown,
    untilAsync: ((condition: DebugCondition, maxSteps: number) => hook.untilAsync(condition, maxSteps)) as (...args: never[]) => unknown,
    recordEvents: ((on: boolean) => { core.events.setRecording(on); }) as (...args: never[]) => unknown,
    /**
     * Collision queries per drawn frame: `{ last, peak }`, each `{ rays, sight, capsules }`. `rays` counts raycast,
     * raycastAll, groundHeight and lineOfSight; `sight` is the lineOfSight share. Pass true to reset the maxima first
     * (then run frames with perfRun and read again).
     */
    collisionCounts: ((reset?: boolean) => {
      const loop = getLoop(ctx, systems);
      if (reset) { loop.collisionPeak.rays = 0; loop.collisionPeak.sight = 0; loop.collisionPeak.capsules = 0; }
      return { last: { ...loop.collisionLast }, peak: { ...loop.collisionPeak } };
    }) as (...args: never[]) => unknown,
    // ---- contract surface the DebugHook interface has no method for (core-owned, stable: ARCHITECTURE 11.2 `ext`) ----
    /** PlayerDebug.setSeventh */
    setSeventh: ((state: SeventhState) => ctx.player.debug.setSeventh(state)) as (...args: never[]) => unknown,
    /** EnemiesDebug.tokens(): the attack-token holders */
    tokens: (() => { const t = ctx.enemies.debug.tokens(); return { melee: t.melee.slice(), ranged: t.ranged.slice(), heavy: t.heavy.slice() }; }) as (...args: never[]) => unknown,
    /**
     * PlayerApi.applyDamage with a scratch DamageInfo (grace, the last-20-HP absorb, the damage arc: setHealth goes
     * round all of them). `ox, oy, oz` is where the damage comes from (default: 5 m in front of her eyes); the travel
     * direction is from there to her chest. Returns the damage really applied.
     */
    damage: ((amount: number, kind: DamageKind = 'bullet', source: DamageSource = 'world', ox?: number, oy?: number, oz?: number) => {
      const pl = ctx.player, p = pl.position, f = pl.forward;
      const d = damageScratch;
      d.amount = amount; d.kind = kind; d.source = source; d.sourceId = source; d.ammo = null; d.shotId = 0;
      d.ox = ox ?? p.x + f.x * 5; d.oy = oy ?? p.y + PLAYER_EYE + f.y * 5; d.oz = oz ?? p.z + f.z * 5;
      const tx = p.x - d.ox, ty = p.y + 1.2 - d.oy, tz = p.z - d.oz;
      const l = Math.hypot(tx, ty, tz) || 1;
      d.dx = tx / l; d.dy = ty / l; d.dz = tz / l;
      return pl.applyDamage(d);
    }) as (...args: never[]) => unknown,
    /** GameClock.timeScale (slow motion) */
    timeScale: (() => ctx.clock.timeScale) as (...args: never[]) => unknown,
    /** what `state().player` does not carry: the last `player/control` event (null before the first), WeaponView.keptAimLegal and shotsFired */
    playerExtra: (() => ({ control: core.control.enabled, controlReason: core.control.reason, keptAimLegal: ctx.player.weapon.keptAimLegal, shotsFired: ctx.player.weapon.shotsFired })) as (...args: never[]) => unknown,
    /**
     * The GameContext, for a test that must read a contract surface the hook does not wrap (ctx.save.current,
     * ctx.assets, ctx.scene ...). Page-side only: it cannot cross page.evaluate. (`__dbg.ctx` happens to work at
     * runtime too, but it is a private field of the implementation; this is the supported way.)
     */
    ctx: (() => ctx) as (...args: never[]) => unknown,
    /** the run flow's own bookkeeping: the last job that threw, how often the net under the world caught her, the GL context */
    flow: (() => ({
      lastFailure: core.flow ? core.flow.lastFailure : null, fallsCaught: core.flow ? core.flow.fallsCaught : 0,
      contextLost: core.loop ? core.loop.contextLost : false, retries: core.assets.report.retries,
    })) as (...args: never[]) => unknown,
    /** is a capsule standing with its feet at (x, y, z) clear of every solid? (walk tests: "never inside geometry") */
    capsuleFree: ((x: number, y: number, z: number, radius: number, height: number) => ctx.collision.capsuleFree(x, y, z, radius, height)) as (...args: never[]) => unknown,
  });
  if (typeof window !== 'undefined') window.__dbg = hook;
  if (ctx.flags.test) hook.step(0, true);
  hook.ready = true;
  return hook;
}

/** true when this browser can give a WebGL2 context at all (probed on a scratch canvas) */
function hasWebgl2(): boolean {
  try { return document.createElement('canvas').getContext('webgl2') !== null; } catch { return false; }
}
/**
 * The one plain line a player sees when the game cannot start. The words come from story.json (`system.no_webgl`,
 * `system.boot_failed`, `system.boot_connection`, `system.boot_retry`). The error itself is NOT in it (polish round 3:
 * the card read "asset 'env_the_lip': file assets/env/env_the_lip.glb failed to load" or "Offset is outside the bounds
 * of the DataView"): a file that would not come is said as a connection line, anything else gets no middle sentence.
 * The raw text goes to console.error and window.__dbg.error (reportBootFailure), which is what a bug report needs.
 */
export function bootFailureText(err: unknown, webgl2: boolean): string {
  const story = storyJson as unknown as { ui: Record<string, string>; system?: Record<string, string> };
  const title = story.ui.ui_title ?? '';
  const system = story.system ?? {};
  if (!webgl2) return system.no_webgl ?? `${title} cannot start: this browser or device does not provide WebGL 2.`;
  const raw = err instanceof Error ? err.message : String(err);
  const network = /failed to load|failed to fetch|networkerror|load failed|HTTP \d{3}|status \d{3}/i.test(raw);
  const parts = [system.boot_failed ?? `${title} could not start.`];
  if (network) parts.push(system.boot_connection ?? 'A file it needs would not load. Check the connection.');
  if (system.boot_retry) parts.push(system.boot_retry);
  return parts.join(' ');
}
/**
 * What main.ts does when boot throws: the error goes to the console, ONE PLAIN LINE goes onto the page (a production
 * page was a blank black screen before), and window.__dbg carries the error so a harness fails fast instead of timing out.
 */
export function reportBootFailure(err: unknown): void {
  const text = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error('[boot] ' + text);
  if (typeof window === 'undefined') return;
  if (!window.__dbg) window.__dbg = { version: 2, ready: false, error: text } as unknown as DebugHook;
  try {
    const line = bootFailureText(err, hasWebgl2());
    if (!document.title) document.title = (storyJson as unknown as { ui: Record<string, string> }).ui.ui_title ?? '';
    const host = document.getElementById('ui') ?? document.body;
    let el = document.getElementById('boot-failure');
    if (!el) {
      el = document.createElement('div');
      el.id = 'boot-failure';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:8vmin;text-align:center;'
        + 'background:#0b0d12;color:#e8dcc4;font:18px/1.5 Georgia,serif;z-index:1000;-webkit-user-select:text;user-select:text';
      host.appendChild(el);
    }
    el.textContent = line;
  } catch { /* the page itself is unusable: the console line above is all there is */ }
}
