// The run flow (ARCHITECTURE 3.5, producer ruling 1): boot, every `ui/action`, the checkpoint commit, the death
// sequence, and the one caller of the restore order: await world.restoreCheckpoint(), then enemies.applySave,
// world.applySave, player.applySave.
import type {
  CheckpointId, Difficulty, EnemySystem, GameContext, GameEvents, GameSystem, PlayerSave, PlayerSystem, ResidentSet, SaveData, WorldSystem,
} from './contracts.ts';
import { coreOf } from './context.ts';
import type { CoreInternals } from './context.ts';
import { STALL_SAY_MS } from './assets.ts';

/** 0.6 s fade + 1.2 s `ui_death`, in unscaled ticks. */
export const DEATH_TICKS = Math.round((0.6 + 1.2) * 60);

function find<T extends GameSystem>(systems: readonly GameSystem[], id: string): T {
  const s = systems.find((x) => x.id === id);
  if (!s) throw new Error(`flow: no '${id}' system`);
  return s as T;
}

export class Flow {
  private readonly core: CoreInternals;
  private readonly player: PlayerSystem;
  private readonly enemies: EnemySystem;
  private readonly world: WorldSystem;
  private deathTick = -1;
  private restoring = false;
  /** actions run one at a time, in the order they were asked for */
  private queue: Promise<void> = Promise.resolve();
  private pendingJobs = 0;
  private readonly savedPayload: GameEvents['checkpoint/saved'] = { id: 'cp_lip_start', movement: 1, section: 1 };
  /**
   * The player's save as she is after every start(): what a NEW run begins with. `game/new_run` has no listener that
   * owns "reset the player", and the run's first save must hold the fresh state, so core applies this itself.
   */
  private freshPlayer: PlayerSave | null = null;

  constructor(private readonly ctx: GameContext, private readonly systems: readonly GameSystem[]) {
    this.core = coreOf(ctx);
    this.player = find<PlayerSystem>(systems, 'player');
    this.enemies = find<EnemySystem>(systems, 'enemies');
    this.world = find<WorldSystem>(systems, 'world');
    let floor = Infinity;
    for (const z of ctx.data.layout.zones) floor = Math.min(floor, z.bounds.min[1]);
    this.killY = (Number.isFinite(floor) ? floor : 0) - 20;
    ctx.events.on('ui/action', (e) => { void this.action(e.action); });
    ctx.events.on('checkpoint/reached', (e) => {
      // nothing is saved from the title: she stands on the start mark there with the world of the run she quit
      if (ctx.state.current === 'title' || ctx.state.current === 'boot' || this.shooting) return;
      // Nor while a save is being applied (polish round 4, robustness): enemies.applySave sets the Windlass's phase,
      // the world's listener of that phase reaches cp_boss_p*, and outside a tick that commit was immediate: BEFORE
      // world.applySave and player.applySave had run. "Go on" at a boss checkpoint so replaced the stored save with
      // the restored enemies beside a fresh world and a fresh player, and the next death gave that hybrid back.
      // The save being applied IS the current one; nothing reached while it goes in may replace it.
      if (this.applying) return;
      // Inside a tick the checkpoint is committed when the tick is over (fixedUpdate below): the event that reached it
      // (a kill, the kept round) may not have run through every system's listener yet, and a save taken in between
      // holds one system's "after" beside another's "before" (found by the playthrough: the save of cp_boss_proven
      // held the Windlass in its hush, so a death there gave back an unproven bore and a spent seventh).
      // The player's part is taken now, while she is certainly alive. Outside a tick (the start of a run, a warp, a
      // debug call) the commit is immediate, as before.
      const loop = this.core.loop;
      if (loop && loop.ticking) {
        if (this.pendingCount < this.pendingIds.length) { this.pendingIds[this.pendingCount] = e.id; this.pendingPlayer[this.pendingCount] = this.player.captureSave(); this.pendingCount++; }
        return;
      }
      this.commit(e.id, null);
    });
    ctx.events.on('player/died', () => this.onDied());
    ctx.events.on('zone/entered', (e) => this.fetchAhead(e.zone));
  }

  /**
   * Pass i4 (performance): the next resident set's files are asked for when she enters the last zone before it (the
   * Tally House for the underground set, the bore for the coda), not when the puzzle that opens the way is solved: by
   * then they are in the browser's cache and decoded, whatever the line's speed. Nothing is activated or uploaded here;
   * the world's own prefetch at the seam finds the files loaded. Test mode decodes every set at boot.
   */
  private fetchAhead(zone: string): void {
    const { ctx } = this;
    if (ctx.flags.test || ctx.state.current !== 'playing') return;
    const zones = ctx.data.layout.zones;
    const at = zones.findIndex((z) => z.id === zone);
    const here = zones[at], next = zones[at + 1];
    if (!here || !next || next.set === here.set || here.set !== ctx.world.residentSet) return;
    ctx.assets.prefetch(next.set).then(() => undefined, () => undefined);     // a failure here is not an error: the seam asks again
  }

  /**
   * Pass i4 (robustness): a request that stalls during the first load, or behind any LOADING screen, left the bar
   * standing with no word. While the state is 'boot' or 'loading' and nothing has arrived for `STALL_SAY_MS`, core shows
   * story.json `system.waiting` low on the screen; it goes when bytes come again or the state changes. (In play the
   * world and the UI say it themselves.) The asset store gives a stalled request up after 30 s and tries it again.
   */
  private waiting: HTMLElement | null = null;
  private watch: ReturnType<typeof setInterval> | null = null;
  private watchConnection(): void {
    if (this.ctx.flags.test || this.watch !== null || typeof document === 'undefined' || typeof setInterval !== 'function') return;
    this.watch = setInterval(() => {
      const state = this.ctx.state.current;
      const quiet = (state === 'boot' || state === 'loading') && this.core.assets.quietFor() >= STALL_SAY_MS;
      if (!quiet) { if (this.waiting) this.waiting.style.display = 'none'; return; }
      let el = this.waiting;
      if (!el) {
        el = document.createElement('div');
        el.id = 'flow-waiting';
        el.setAttribute('role', 'status');
        // under the loading bar, on its left edge (src/ui/ui.css `.load-foot`: 7 % in, 13 % up; 5.5 % up in a narrow frame)
        el.style.cssText = 'position:fixed;left:calc(7% + 1.6vh);right:7%;bottom:1.8vh;text-align:left;pointer-events:none;'
          + 'color:#e8dcc4;font:italic 18px/1.5 Georgia,serif;text-shadow:0 1px 3px #0b0d12,0 0 12px #0b0d12;z-index:900';
        el.textContent = this.systemText('waiting', 'Waiting on the connection.');
        this.core.uiRoot.appendChild(el);
        this.waiting = el;
      }
      el.style.display = '';
    }, 1000);
  }

  /** True while an action, a respawn or a warp is still running. */
  get busy(): boolean { return this.pendingJobs > 0; }

  private run(job: () => Promise<void>): Promise<void> {
    this.pendingJobs++;
    const next = this.queue.then(job).catch((err: unknown) => {
      console.error(`[flow] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      return this.failed(err);
    }).then(() => { this.pendingJobs--; });
    this.queue = next;
    return next;
  }

  /** the last flow job that threw: what, and in which state it left the game (the debug hook and tests read it) */
  lastFailure: { message: string; state: string } | null = null;
  private notice: HTMLElement | null = null;
  /**
   * A flow job threw (a file that would not come after every retry, a save this build cannot apply, a system's
   * applySave). Before polish round 2 the error was logged and the game stayed where it was: on a LOADING screen no key
   * leaves. Nothing may strand her there: from 'loading' the game goes back to the title, with one plain line saying why.
   * The save is kept (the asset store forgets a failed request, so "Go on" tries the files again); continueRun clears a
   * save it could not apply before it gets here.
   */
  private async failed(err: unknown): Promise<void> {
    const { ctx } = this;
    const state = ctx.state.current;
    this.lastFailure = { message: err instanceof Error ? err.message : String(err), state };
    this.restoring = false;
    this.deathTick = -1;
    // a respawn in the same set runs in 'dead': that one must not be left on the death card either
    if (state === 'dead') ctx.state.request('loading', 'respawn_failed');
    if (ctx.state.current !== 'loading') return;
    try {
      this.enemies.clearAll();
      ctx.player.setControl(false, 'title');
      // a swap that failed half-way has let the old set go: the title gets its own place back (from the browser's
      // cache) behind the loading screen, before it is shown
      await this.titleShot();
      ctx.state.request('title', 'load_failed');
      this.freePointer();
      this.showNotice(this.systemText('load_failed', 'It would not load. Check the connection and go on.'));
    } catch (again) {
      console.error(`[flow] ${again instanceof Error ? again.stack ?? again.message : String(again)}`);
    }
  }
  /** The click on "Begin" / "Go on" took the pointer lock; a title that comes back needs the cursor for its menu. */
  private freePointer(): void {
    const input = this.ctx.input;
    if (input.pointerLocked) input.exitPointerLock();
  }
  /** story.json `system`: the plain lines core shows by itself (not a UI screen, so not under `ui`) */
  private systemText(key: string, fallback: string): string {
    const system = (this.ctx.data.story as unknown as { system?: Record<string, string> }).system;
    return (system && system[key]) || fallback;
  }
  /** One plain line over the title until the next state change (core's own: the UI contract has no error card). */
  private showNotice(text: string): void {
    if (typeof document === 'undefined') return;
    let el = this.notice;
    if (!el) {
      el = document.createElement('div');
      el.id = 'flow-notice';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:9vh;padding:0 8vmin;text-align:center;pointer-events:none;'
        + 'color:#e8dcc4;font:italic 18px/1.5 Georgia,serif;text-shadow:0 1px 3px #0b0d12,0 0 12px #0b0d12;z-index:900';
      this.core.uiRoot.appendChild(el);
      this.notice = el;
      this.ctx.events.on('game/state', (e) => { if (e.to !== 'title' && this.notice) this.notice.style.display = 'none'; });
    }
    el.textContent = text;
    el.style.display = '';
  }

  // ---- boot -------------------------------------------------------------------------------------
  /**
   * Boot outside test mode gives the page a turn between its stages: the decode, the uploads, the level build, each
   * system's start and the shader warm-up were one main-thread task of 1.4 s (polish round 2, performance), during which
   * nothing on the page answered.
   */
  private breathe(): Promise<void> | null {
    if (this.ctx.flags.test || typeof setTimeout !== 'function') return null;
    return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
  async boot(): Promise<void> {
    const { ctx, core } = this;
    const progress: GameEvents['load/progress'] = { loaded: 0, total: 1, label: 'always' };
    const report = (label: string) => (loaded: number, total: number): void => {
      progress.loaded = loaded; progress.total = total; progress.label = label;
      ctx.events.emit('load/progress', progress);
    };
    ctx.events.emit('load/progress', progress);
    this.watchConnection();
    if (!ctx.flags.test) core.quality.detect(rendererString(ctx));
    await core.assets.probeR8();                    // before any texture is created: the verdict picks R8 or RGBA8
    // (pass i4, performance) the surface set's files are ASKED FOR now, beside the always set's: before, their requests
    // went out only after the always set had been fetched, decoded and uploaded. They are awaited (and counted on the
    // loading line) in their turn below; a failure is reported there, not here.
    if (!ctx.flags.test) ctx.assets.prefetch('surface').then(() => undefined, () => undefined);
    await ctx.assets.prefetch('always', report('always'));
    await ctx.assets.activate('always');
    await ctx.assets.prefetch('surface', report('surface'));
    await this.breathe();
    await ctx.assets.activate('surface');
    await this.breathe();
    if (ctx.flags.test) {
      // test mode decodes every set up front (no GPU memory), so later set swaps are synchronous and deterministic
      await ctx.assets.prefetch('underground', report('underground'));
      await ctx.assets.prefetch('coda', report('coda'));
    }
    await ctx.world.buildSet('surface');
    await this.breathe();
    if (!ctx.flags.test) core.quality.applyBenchmark(await ctx.render.benchmark());
    for (const s of this.systems) if (s.start) { await s.start(); await this.breathe(); }
    this.freshPlayer = this.player.captureSave();
    await ctx.render.warmUp();
    await this.breathe();
    if (!ctx.flags.test) {
      // the first drawn frame uploads every geometry and texture of the title shot: behind the loading screen, not as
      // a stall under a menu that is already on screen
      try { ctx.render.render(0, 1); } catch (err) { console.warn(`[flow] first frame: ${err instanceof Error ? err.message : String(err)}`); }
      await this.breathe();
    }
    ctx.player.setControl(false, 'title');
    ctx.state.request('title', 'boot_done');
    // dev / test / ?debug=1 only (context.ts drops both parameters on a public page)
    if (ctx.flags.startCheckpoint || core.url.autostart) {
      await this.play();
      if (ctx.flags.startCheckpoint && ctx.flags.startCheckpoint !== 'cp_lip_start') await this.warp(ctx.flags.startCheckpoint);
    }
  }

  // ---- ui/action ----------------------------------------------------------------------------------
  action(action: GameEvents['ui/action']['action']): Promise<void> {
    switch (action) {
      case 'play': case 'again': return this.play();
      case 'continue': return this.continueRun();
      case 'resume': this.ctx.state.request('playing', 'resume'); return Promise.resolve();
      case 'restart_checkpoint': return this.restartCheckpoint();
      case 'quit_to_title': return this.quitToTitle();
      default: return Promise.resolve();
    }
  }

  play(difficulty?: Difficulty): Promise<void> {
    return this.run(async () => {
      const { ctx } = this;
      if (ctx.state.current !== 'title' && ctx.state.current !== 'ending') return;
      if (difficulty) ctx.options.set('difficulty', difficulty);
      ctx.save.clear();
      ctx.events.emit('game/new_run', { difficulty: ctx.options.value.difficulty });
      if (!ctx.state.request('loading', 'play')) return;
      this.core.clock.clearSlowMotion();
      this.enemies.clearAll();
      // before beginRun: the world places her and reaches cp_lip_start in there, and that commit must save the fresh state
      this.resetPlayer();
      await ctx.world.beginRun(null);
      ctx.player.setControl(true, 'run');
      ctx.state.request('playing', 'run_started');
    });
  }

  /**
   * A new run starts with the player as she was when the game booted: alive, full health, a full cylinder, the
   * starting reserve, the seventh round as at the start (whatever the last run left, and also when she was dead on the
   * title or in the ending). A copy each time: applySave may keep what it is given.
   */
  private resetPlayer(): void {
    const fresh = this.freshPlayer;
    if (fresh) this.player.applySave(JSON.parse(JSON.stringify(fresh)) as PlayerSave);
  }

  private continueRun(): Promise<void> {
    const stored = this.ctx.save.readStored();
    if (!stored) return this.play();
    return this.run(async () => {
      const { ctx } = this;
      if (!ctx.state.request('loading', 'continue')) return;
      try {
        await ctx.world.beginRun(stored);
        ctx.save.commit(stored);
        this.restoreTrio(stored);
      } catch (err) {
        // A save this build cannot apply (readStored checks its shape, not every id in it). Left in the slot it would
        // be offered again after every reload, and "Go on" would fail again: it is dropped, and the title comes back
        // without "Go on". A file that would not load is not the save's fault: that one is kept.
        const text = err instanceof Error ? err.message : String(err);
        if (!/failed to load/.test(text)) {
          ctx.save.clear();
          // an expected path (a save of an older build): one line, a warning, no stack (polish round 5, robustness)
          console.warn(`[flow] the stored save could not be applied and was dropped: ${text}`);
          this.lastFailure = { message: text, state: 'loading' };
          this.enemies.clearAll();
          ctx.player.setControl(false, 'title');
          await this.titleShot();
          ctx.state.request('title', 'save_unreadable');
          this.freePointer();
          this.showNotice(this.systemText('save_unreadable', 'The last count could not be read. Begin again.'));
          return;
        }
        throw err;
      }
      ctx.player.setControl(true, 'run');
      ctx.state.request('playing', 'run_resumed');
    });
  }

  private restartCheckpoint(): Promise<void> {
    return this.run(async () => {
      const { ctx } = this;
      const save = ctx.save.current;
      if (!save) return;
      if (!ctx.state.request('loading', 'restart_checkpoint')) return;
      await this.restore(save);
      ctx.state.request('playing', 'respawned');
    });
  }

  private quitToTitle(): Promise<void> {
    return this.run(async () => {
      const { ctx } = this;
      // through 'loading': the title is not shown over the place she quit in while the surface set comes back
      if (ctx.state.current !== 'paused' && ctx.state.current !== 'ending') return;
      if (!ctx.state.request('loading', 'quit')) return;
      this.core.clock.clearSlowMotion();
      this.enemies.clearAll();
      ctx.player.setControl(false, 'title');
      await this.titleShot();
      ctx.state.request('title', 'quit');
    });
  }

  /**
   * The title is the overhang doorway shot (ARCHITECTURE 3.4), also after a quit: before polish round 2 the menu lay
   * over wherever she had been (the Windlass and its lit mouths, for whoever sat down next). The surface set is made
   * resident again, the other sets are let go and she is stood on `player_start`, all behind the loading screen (the
   * caller asks for 'title' afterwards). The save is untouched ("Go on"), and no checkpoint is committed from here
   * (`shooting`, and the listener in the constructor).
   */
  private shooting = false;
  private async titleShot(): Promise<void> {
    const { ctx } = this;
    this.shooting = true;
    const state = ctx.state.current;
    try {
      await ctx.world.buildSet('surface');
      if (ctx.state.current !== state) return;
      for (const set of Object.keys(ctx.data.manifest.sets)) {
        if (set !== 'always' && set !== 'surface') ctx.assets.release(set as ResidentSet);
      }
      const start = ctx.data.layout.markers.find((m) => m.type === 'player_start');
      if (start) {
        // the look of the place she left (the bore's violet, a proven aqua, the Tally's exposure) does not come along
        const zone = ctx.data.zone(start.zone);
        ctx.render.setWrongFade(0);
        ctx.render.setExposure(1, 0);
        ctx.render.setMood(zone.moodIntro ?? zone.mood, 0);
        ctx.player.teleport(start.pos[0], start.pos[1], start.pos[2], start.rotY, 0);
      }
      ctx.player.setControl(false, 'title');
      if (!ctx.flags.test) void ctx.render.warmUp();
    } catch (err) {
      // the title still works over the old place; nothing is lost but the shot
      console.warn(`[flow] title shot: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.shooting = false;
    }
  }

  // ---- checkpoint ---------------------------------------------------------------------------------
  /** `movement` = 1-based index of the checkpoint's zone in layout.zones; `section` = its ordinal among that zone's checkpoints. */
  private numbering(id: CheckpointId): { movement: number; section: number } {
    const data = this.ctx.data;
    const marker = data.marker(id);
    if (!marker) return { movement: 1, section: 1 };
    const movement = data.layout.zones.findIndex((z) => z.id === marker.zone) + 1;
    let section = 0;
    for (const m of data.layout.markers) {
      if (m.type !== 'checkpoint' || m.zone !== marker.zone) continue;
      section++;
      if (m.id === id) break;
    }
    return { movement: Math.max(1, movement), section: Math.max(1, section) };
  }

  private readonly pendingIds: CheckpointId[] = ['cp_lip_start', 'cp_lip_start', 'cp_lip_start', 'cp_lip_start'];
  private readonly pendingPlayer: (PlayerSave | null)[] = [null, null, null, null];
  private pendingCount = 0;
  private commit(id: CheckpointId, player: PlayerSave | null): void {
    const { ctx } = this;
    const data: SaveData = {
      version: 1, checkpoint: id, tick: ctx.clock.tick,
      player: player ?? this.player.captureSave(), world: this.world.captureSave(), enemies: this.enemies.captureSave(),
    };
    ctx.save.commit(data);
    const n = this.numbering(id);
    this.savedPayload.id = id; this.savedPayload.movement = n.movement; this.savedPayload.section = n.section;
    ctx.events.emit('checkpoint/saved', this.savedPayload);
  }

  /** THE restore order. Core is its only caller. */
  private applying = false;
  private restoreTrio(save: SaveData): void {
    this.applying = true;
    try {
      this.enemies.applySave(save.enemies);
      this.world.applySave(save.world);
      this.player.applySave(save.player);
    } finally {
      this.applying = false;
    }
  }
  /**
   * Pass i4 (ruling R12: what the end card says is true). The run's time was restored with the checkpoint, so the card's
   * TIME was the sum of the successful attempts only, beside "Times she went down": five deaths at the Windlass in 114 s
   * of play read 0:19. Time played and deaths are the RUN's, not the checkpoint's: whenever she is put back on a
   * checkpoint of the run she is in (a death, "Restart from checkpoint", the net under the world) the save takes both
   * from the live count, and the stored save with it, so a reload after a death does not forget them either.
   */
  private carryStats(save: SaveData): void {
    const live = this.world.stats, kept = save.world.stats;
    if (!(live.playSeconds > kept.playSeconds) && !(live.deaths > kept.deaths)) return;
    kept.playSeconds = Math.max(kept.playSeconds, live.playSeconds);
    kept.deaths = Math.max(kept.deaths, live.deaths);
    if (save === this.ctx.save.current) this.ctx.save.commit(save);
  }
  private async restore(save: SaveData): Promise<void> {
    const { ctx } = this;
    this.core.clock.clearSlowMotion();
    this.carryStats(save);
    await ctx.world.restoreCheckpoint();
    this.restoreTrio(save);
    ctx.events.emit('player/respawned', { checkpoint: save.checkpoint });
    ctx.player.setControl(true, 'respawn');
  }

  // ---- death --------------------------------------------------------------------------------------
  private onDied(): void {
    if (!this.ctx.state.request('dead', 'player_died')) return;
    this.deathTick = this.ctx.clock.tick;
  }
  /** Called by the loop after the systems' fixedUpdate, every tick the sim runs. */
  fixedUpdate(): void {
    // the checkpoints reached during this tick (see the listener in the constructor)
    if (this.pendingCount > 0) {
      const n = this.pendingCount;
      this.pendingCount = 0;
      for (let i = 0; i < n; i++) { const p = this.pendingPlayer[i] ?? null; this.pendingPlayer[i] = null; this.commit(this.pendingIds[i] as CheckpointId, p); }
    }
    const { ctx } = this;
    if (this.deathTick < 0 && !this.restoring && ctx.state.current === 'playing' && this.player.position.y < this.killY) this.fellOut();
    if (this.deathTick < 0 || this.restoring) return;
    if (ctx.state.current !== 'dead') { this.deathTick = -1; return; }
    if (ctx.clock.tick - this.deathTick < DEATH_TICKS) return;
    this.restoring = true;
    this.deathTick = -1;
    void this.run(async () => {
      try {
        const save = ctx.save.current;
        if (!save) {
          // no checkpoint was ever committed: start the run again
          ctx.state.request('loading', 'respawn');
          this.resetPlayer();
          await ctx.world.beginRun(null);
          ctx.player.setControl(true, 'respawn');
        } else {
          const marker = ctx.data.marker(save.checkpoint);
          const set = marker ? ctx.data.zone(marker.zone).set : ctx.world.residentSet;
          if (set !== ctx.world.residentSet) ctx.state.request('loading', 'respawn');     // the resident set must change
          await this.restore(save);
        }
        ctx.state.request('playing', 'respawned');
      } finally {
        this.restoring = false;
      }
    });
  }

  /** 20 m under the lowest zone floor of the layout: nothing she can stand on is down there. */
  private readonly killY: number;
  /** how often the safety net caught her (the debug state shows it; it should stay 0) */
  fallsCaught = 0;
  /**
   * The safety net under the world (polish round 2, the blocker): a gap in the blockout let her walk off Front Street and
   * fall for ever, alive and 'playing'. Whatever hole is found next, she is put back on her last checkpoint with the
   * save it holds, exactly as a death would, without the death.
   */
  private fellOut(): void {
    const { ctx } = this;
    this.restoring = true;
    this.fallsCaught++;
    console.warn(`[flow] she fell out of the world at y ${this.player.position.y.toFixed(1)} (x ${this.player.position.x.toFixed(1)}, z ${this.player.position.z.toFixed(1)}): back to ${ctx.save.current ? ctx.save.current.checkpoint : 'the start'}`);
    void this.run(async () => {
      try {
        const save = ctx.save.current;
        if (!save) { this.resetPlayer(); await ctx.world.beginRun(null); ctx.player.setControl(true, 'respawn'); }
        else await this.restore(save);
      } finally {
        this.restoring = false;
      }
    });
  }

  // ---- debug hook paths -----------------------------------------------------------------------------
  /** `__dbg.checkpoint(id)`: await world.warpToCheckpoint(id), then the trio. */
  warp(id: CheckpointId): Promise<void> {
    return this.run(async () => {
      const { ctx } = this;
      await ctx.world.warpToCheckpoint(id);
      // the world commits the checkpoint it warped to (checkpoint/reached); if it did not, commit it here
      if (!ctx.save.current || ctx.save.current.checkpoint !== id) this.commit(id, null);
      const save = ctx.save.current as SaveData;
      this.restoreTrio(save);
      ctx.player.setControl(true, 'warp');
    });
  }
  /** Resolves when no flow job is running. */
  idle(): Promise<void> { return this.queue; }
}

function rendererString(ctx: GameContext): string {
  try {
    const gl = ctx.render.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  } catch {
    return '';
  }
}

/** Section 3.1's `boot(ctx, systems)`: 'boot' -> 'title' (and on into a run with ?cp= or ?autostart=1). */
export async function boot(ctx: GameContext, systems: readonly GameSystem[]): Promise<Flow> {
  const core = coreOf(ctx);
  const flow = new Flow(ctx, systems);
  core.flow = flow;
  await flow.boot();
  return flow;
}
