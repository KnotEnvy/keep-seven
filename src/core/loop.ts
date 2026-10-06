// The frame and tick of ARCHITECTURE 3.3. One requestAnimationFrame owner.
import { FIXED_DT, MAX_STEPS_PER_FRAME, SYSTEM_ORDER } from './contracts.ts';
import type { GameContext, GameSystem, PerfStats } from './contracts.ts';
import { coreOf } from './context.ts';
import type { CoreInternals } from './context.ts';
import { PerfOverlay } from './perfOverlay.ts';

/** Sorts systems into SYSTEM_ORDER (player, enemies, world, render, audio, ui). */
export function orderSystems(systems: readonly GameSystem[]): GameSystem[] {
  const out = systems.slice();
  out.sort((a, b) => SYSTEM_ORDER.indexOf(a.id) - SYSTEM_ORDER.indexOf(b.id));
  return out;
}

/** ticks of play without the pointer lock before the game pauses itself (0.75 s) */
export const LOCK_GRACE_TICKS = 45;
/** frames the adaptive controller leaves out after a set or a staged zone was built (their uploads and program links) */
const QUALITY_HOLD_FRAMES = 30;

interface MemoryPerformance { memory?: { usedJSHeapSize: number } }

export class Loop {
  running = false;
  private last = 0;
  private acc = 0;
  private raf = 0;
  private rafMs = 0;
  /** the pointer lock was lost or refused during 'loading': pause when play begins */
  private lockLost = false;
  /** ticks in a row spent 'playing' without the pointer lock after it has been asked for (the watchdog in runTick) */
  private unlockedTicks = 0;
  /** true between `webglcontextlost` and `webglcontextrestored`: nothing is drawn */
  contextLost = false;
  private readonly core: CoreInternals;
  private readonly onFrame: (now: number) => void;
  readonly overlay: PerfOverlay | null;
  /** collision queries of the last drawn frame (all the ticks since the frame before), and the per-frame maxima */
  readonly collisionLast = { rays: 0, sight: 0, capsules: 0 };
  readonly collisionPeak = { rays: 0, sight: 0, capsules: 0 };

  constructor(private readonly ctx: GameContext, private readonly systems: readonly GameSystem[]) {
    this.core = coreOf(ctx);
    this.onFrame = (now: number): void => this.frame(now);
    const core = this.core;
    this.overlay = (ctx.flags.dev || ctx.flags.test || core.url.perf) && typeof document !== 'undefined' ? new PerfOverlay(ctx, core, core.url.perf) : null;
    // pointer lock lost, or refused (input.ts emits `locked: false` for a refused request too), while playing pauses the
    // game (not in test mode: headless has no lock). Lost or refused while LOADING (the click on the title asked for it,
    // the answer came before the run began) pauses on the first tick of play: never a run with a dead mouse.
    ctx.events.on('input/pointer_lock', (e) => {
      if (ctx.flags.test) return;
      if (e.locked) { this.lockLost = false; return; }
      if (ctx.state.current === 'playing') ctx.state.request('paused', 'focus_lost', 'focus_lost');
      // lost on the death card too (Esc, alt-tab): a respawn in the same set goes 'dead' -> 'playing' directly, and without
      // this the fight went on with a dead mouse and no pause screen (polish round 2, robustness)
      else if (ctx.state.current === 'loading' || ctx.state.current === 'dead') this.lockLost = true;
      // lost behind an open note (polish round 4, robustness): closing it went straight to 'playing' with a free cursor
      // for the watchdog's 45 ticks, and a click in that window fired a round. The first tick of play pauses instead.
      else if (ctx.state.current === 'paused' && ctx.state.pauseReason === 'readable') this.lockLost = true;
    });
    ctx.events.on('load/set', () => core.quality.hold(QUALITY_HOLD_FRAMES));
    ctx.events.on('world/staged', () => core.quality.hold(QUALITY_HOLD_FRAMES));
    // A lost WebGL context: the picture is gone but the simulation would run on behind it. Pause (a click resumes), keep
    // the browser from giving the context up for good, and build the GPU state again when it comes back.
    const canvas = core.canvas as HTMLCanvasElement | undefined;
    if (canvas && typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.contextLost = true;
        if (ctx.state.current === 'playing') ctx.state.request('paused', 'context_lost', 'focus_lost');
        else if (ctx.state.current === 'loading' || ctx.state.current === 'dead') this.lockLost = true;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        void ctx.render.warmUp();
      });
    }
  }

  start(): void {
    if (this.running || typeof requestAnimationFrame !== 'function') return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.onFrame);
  }
  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame(now: number): void {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.onFrame);
    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (frameDt < 0) frameDt = 0;
    this.rafMs = frameDt * 1000;
    // the adaptive controller measures play: a title, a loading screen, a menu or a death card is not load
    if (this.ctx.state.current !== 'playing') this.core.quality.hold(2);
    this.core.quality.onFrameTime(this.rafMs);
    if (frameDt > 0.25) frameDt = 0.25;
    this.acc += frameDt;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) { this.tick(); this.acc -= FIXED_DT; steps++; }
    if (this.acc >= FIXED_DT) this.acc = 0;                    // drop the backlog rather than spiral
    this.renderFrame(frameDt, this.acc / FIXED_DT, true);
  }

  /**
   * Called at the start and at the end of EVERY tick, stepped or real-time (the debug hook's `tap()` bookkeeping: a tap
   * presses its action before input.beginTick() and counts the tick off afterwards, whoever ran the tick).
   */
  preTick: (() => void) | null = null;
  postTick: (() => void) | null = null;

  /**
   * True while the systems' fixedUpdate calls of a tick are running. A checkpoint reached in there is committed by the
   * flow when the tick is over (flow.fixedUpdate), so that every system's part of the save is taken at one consistent
   * moment: inside an event chain the listeners of one event have not all run yet.
   */
  ticking = false;
  /** One fixed tick. Also what window.__dbg.step() runs. */
  tick(): void {
    if (this.preTick) this.preTick();
    this.runTick();
    if (this.postTick) this.postTick();
  }
  private runTick(): void {
    const { ctx, core, systems } = this;
    const perf = core.perf;
    core.input.beginTick();
    const dt = core.clock.advance(core.state.simRunning);
    if (this.lockLost && ctx.state.current === 'playing') { this.lockLost = false; ctx.state.request('paused', 'focus_lost', 'focus_lost'); }
    // The watchdog (polish round 3): whatever path led into play (a note closed after the lock was lost behind it, a
    // request that threw, returned nothing or was never answered), a game that is 'playing' with a free cursor for
    // LOCK_GRACE_TICKS is paused with the click-to-resume plate. The grace is what an asynchronous grant needs after
    // "Resume". Not in test mode (headless has no lock) and not before anything has asked for the lock.
    if (!ctx.flags.test && ctx.state.current === 'playing' && core.input.lockAsked && !core.input.pointerLocked) {
      if (++this.unlockedTicks >= LOCK_GRACE_TICKS) { this.unlockedTicks = 0; ctx.state.request('paused', 'focus_lost', 'focus_lost'); }
    } else this.unlockedTicks = 0;
    // handlePause
    if (ctx.state.current === 'playing' && core.input.pressed('pause')) ctx.state.request('paused', 'pause', 'menu');
    if (!core.state.simRunning) return;
    const t0 = performance.now();
    let t = t0;
    this.ticking = true;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i] as GameSystem;
      if (s.fixedUpdate) {
        try { s.fixedUpdate(dt); } catch (err) { this.report(s.id, 'fixedUpdate', err); }
      }
      const n = performance.now();
      perf.systemAcc[i] = (perf.systemAcc[i] as number) + (n - t);
      t = n;
    }
    this.ticking = false;
    if (core.flow) core.flow.fixedUpdate();
    perf.scratch.simMs += performance.now() - t0;
  }

  /** update, lateUpdate, render and the perf bookkeeping of one frame. */
  renderFrame(frameDt: number, alpha: number, draw: boolean): void {
    const { ctx, core, systems } = this;
    const perf = core.perf;
    core.clock.beginFrame(alpha);
    const t0 = performance.now();
    let t = t0;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i] as GameSystem;
      if (s.update) {
        try { s.update(frameDt, alpha); } catch (err) { this.report(s.id, 'update', err); }
      }
      const n = performance.now();
      perf.systemAcc[i] = (perf.systemAcc[i] as number) + (n - t);
      t = n;
    }
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i] as GameSystem;
      if (s.lateUpdate) {
        try { s.lateUpdate(frameDt, alpha); } catch (err) { this.report(s.id, 'lateUpdate', err); }
      }
      const n = performance.now();
      perf.systemAcc[i] = (perf.systemAcc[i] as number) + (n - t);
      t = n;
    }
    const hooks = core.frameHooks;
    for (let i = 0; i < hooks.length; i++) (hooks[i] as (frameDt: number, alpha: number) => void)(frameDt, alpha);
    const t1 = performance.now();
    const scratch: PerfStats = perf.scratch;
    scratch.updateMs = t1 - t0;
    if (draw && !this.contextLost) {
      try { ctx.render.render(frameDt, alpha); } catch (err) { this.report('render', 'render', err); }
      scratch.renderMs = performance.now() - t1;
      scratch.tier = ctx.quality.tier;
      scratch.pixelRatio = ctx.quality.pixelRatio;
      scratch.cell = ctx.state.current === 'title' || ctx.state.current === 'boot' ? '' : ctx.world.cell;
      scratch.rafMs = ctx.flags.test ? 0 : this.rafMs;
      scratch.audioVoices = ctx.audio.voices;
      scratch.enemiesAlive = ctx.enemies.aliveCount('');
      const stats = ctx.collision.stats;
      const sight = ctx.collision as { sightRays?: number };
      scratch.rays = stats.rays;
      // per drawn frame, and the largest since the last reset (__dbg.ext.core.collisionCounts)
      const last = this.collisionLast, peak = this.collisionPeak;
      last.rays = stats.rays; last.capsules = stats.capsules; last.sight = sight.sightRays ?? 0;
      if (last.rays > peak.rays) peak.rays = last.rays;
      if (last.capsules > peak.capsules) peak.capsules = last.capsules;
      if (last.sight > peak.sight) peak.sight = last.sight;
      stats.rays = 0; stats.capsules = 0; if (sight.sightRays !== undefined) sight.sightRays = 0;
      if ((core.clock.frame & 31) === 0 || scratch.heapBytes === 0) {
        const mem = (performance as unknown as MemoryPerformance).memory;      // a snapshot object: read it rarely
        if (mem) scratch.heapBytes = mem.usedJSHeapSize;
      }
      ctx.render.collectStats(scratch);
      perf.endFrame();
      if (this.overlay) this.overlay.update();
    }
  }

  private readonly reported = new Set<string>();
  /** In the loop never throw: log once per (system, phase) through console.error and continue. */
  private report(id: string, phase: string, err: unknown): void {
    const key = id + '.' + phase;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    console.error(`[loop] ${key} threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }
}

/** The loop of a context (created on first use, shared by startLoop and the debug hook). */
export function getLoop(ctx: GameContext, systems: readonly GameSystem[]): Loop {
  const core = coreOf(ctx);
  if (!core.loop) core.loop = new Loop(ctx, orderSystems(systems));
  return core.loop;
}

/** Starts the real-time loop. Not started when flags.test (the debug hook steps instead). */
export function startLoop(ctx: GameContext, systems: readonly GameSystem[]): Loop {
  const loop = getLoop(ctx, systems);
  installResize(ctx);
  if (!ctx.flags.test) loop.start();
  return loop;
}

/** Keeps the renderer and the quality manager on the canvas's CSS size. */
export function installResize(ctx: GameContext): void {
  const core = coreOf(ctx);
  if (typeof window === 'undefined') return;
  const apply = (): void => {
    const w = core.canvas.clientWidth || window.innerWidth, h = core.canvas.clientHeight || window.innerHeight;
    core.quality.setViewport(w, h);
    ctx.render.resize(w, h);
  };
  window.addEventListener('resize', apply);
  apply();
}
