// src/audio: the procedural WebAudio engine (work order code-audio). Every sound is synthesized at runtime; there are
// no audio files. Nobody calls this system: it listens to events, and it alone emits `music/state` and the `cap_*`
// captions. This file exports exactly one factory.
import { PLAYER_EYE } from '../core/contracts.ts';
import type { AudioSystem, CreateAudioSystem, DebugSnapshot, EventName, GameContext, GameEvents, Unsubscribe } from '../core/contracts.ts';
import { bakeFor } from './bake.ts';
import { registerAudioDebug } from './debug.ts';
import { Engine } from './engine.ts';
import { Graph } from './graph.ts';
import type { MusicStateName } from './music.ts';

interface WebkitWindow { webkitAudioContext?: typeof AudioContext }

class AudioSystemImpl implements AudioSystem {
  readonly id = 'audio' as const;
  unlocked = false;
  readonly engine: Engine;
  context: AudioContext | null = null;
  graph: Graph | null = null;
  private readonly off: Unsubscribe[] = [];
  private readonly sayPayload: GameEvents['story/say'] = { key: '' };
  private readonly musicPayload: GameEvents['music/state'] = { state: 'silent', intensity: 0 };
  private readonly onVisibility = (): void => {
    const ac = this.context;
    if (!ac) return;
    if (document.hidden) void ac.suspend(); else if (this.unlocked) void ac.resume();
  };
  private readonly sync = (): void => {
    const ac = this.context, g = this.graph;
    if (ac && g) g.active = this.unlocked && ac.state === 'running';
    if (g && g.active) this.gestures(false);
  };
  /**
   * The UI calls unlock() inside the first user gesture. Should it not (a stand-in UI, a menu that forgets), the game
   * must not stay silent: the first real pointer or key press unlocks too. unlock() is idempotent; the listeners go
   * once the context runs. Synthetic events carry no user activation and are ignored.
   */
  private readonly onGesture = (e: Event): void => { if (e.isTrusted) this.unlock(); };
  private listening = false;
  private gestures(on: boolean): void {
    if (on === this.listening || typeof window === 'undefined') return;
    this.listening = on;
    if (on) { window.addEventListener('pointerdown', this.onGesture, true); window.addEventListener('keydown', this.onGesture, true); }
    else { window.removeEventListener('pointerdown', this.onGesture, true); window.removeEventListener('keydown', this.onGesture, true); }
  }

  constructor(private readonly ctx: GameContext) {
    this.engine = new Engine({
      tick: () => ctx.clock.tick,
      zone: () => ctx.world.zone,
      threat: () => ctx.enemies.threat,
      say: (key: string) => { this.sayPayload.key = key; ctx.events.emit('story/say', this.sayPayload); },
      music: (state: MusicStateName, intensity: 0 | 1 | 2 | 3) => { this.musicPayload.state = state; this.musicPayload.intensity = intensity; ctx.events.emit('music/state', this.musicPayload); },
      rng: ctx.rng.fork('audio'),             // pitch jitter, the wire and the ambience are seeded
    });
  }

  get voices(): number { return this.engine.voices; }

  init(): void {
    const { ctx, engine } = this;
    // The context is created at boot. Before a gesture it is suspended and resume() never resolves: nothing waits on it.
    try {
      const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : (window as unknown as WebkitWindow).webkitAudioContext;
      if (Ctor) {
        this.context = new Ctor({ latencyHint: 'interactive' });
        this.graph = new Graph(this.context, false);
        this.context.addEventListener('statechange', this.sync);
        engine.attach(this.graph);
        this.volumes();
        this.bake(this.graph);
        this.gestures(true);
      }
    } catch (err) {
      // no audio device, or a browser without WebAudio: the game runs silent and every handler still does its bookkeeping
      console.warn('[audio] no AudioContext: ' + (err instanceof Error ? err.message : String(err)));
      this.context = null; this.graph = null;
    }
    engine.music.game = ctx.state.current;
    for (const [name, handler] of engine.handlers) this.off.push(ctx.events.on(name as EventName, handler as (payload: Readonly<GameEvents[EventName]>) => void));
    this.off.push(ctx.events.on('options/changed', (e) => { if (e.key === 'volumeMaster' || e.key === 'volumeEffects' || e.key === 'volumeMusic') this.volumes(); }));
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    registerAudioDebug(ctx, this);
  }

  /** Pre-renders the shot's sounds off the main thread's frame (bake.ts); until they land, the recipes play. */
  private bake(graph: Graph): void {
    if (typeof OfflineAudioContext === 'undefined') return;
    bakeFor(this.engine.sounds, graph.sr).then((b) => { graph.baked = b; }, (err: unknown) => {
      console.warn('[audio] bake failed, the recipes play: ' + (err instanceof Error ? err.message : String(err)));
    });
  }

  private volumes(): void {
    const o = this.ctx.options.value;
    if (this.graph) this.graph.setVolumes(o.volumeMaster, o.volumeEffects, o.volumeMusic);
  }

  /** Called by the UI inside the first user gesture; safe to call repeatedly. */
  unlock(): void {
    this.unlocked = true;
    const ac = this.context;
    if (!ac) return;
    if (ac.state !== 'running') ac.resume().then(this.sync, () => { /* still locked: the next gesture tries again */ });
    this.sync();
  }

  recent(n: number): { name: string; tick: number }[] { return this.engine.recent(n); }

  fixedUpdate(): void {
    const pl = this.ctx.player, pos = pl.position, f = pl.forward;
    this.engine.setListener(pos.x, pos.y + PLAYER_EYE, pos.z, f.x, f.y, f.z);
    this.engine.fixedUpdate();
  }

  lateUpdate(): void {
    const pl = this.ctx.player, eye = pl.eye, f = pl.forward;
    this.engine.setListener(eye.x, eye.y, eye.z, f.x, f.y, f.z);
    this.engine.lateUpdate();
    this.ctx.perf.scratch.audioVoices = this.engine.voices;
  }

  debugState(): DebugSnapshot { return this.engine.debugState(); }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.gestures(false);
    const ac = this.context;
    if (ac) { ac.removeEventListener('statechange', this.sync); void ac.close(); }
    this.context = null; this.graph = null; this.engine.graph = null;
  }
}
export const createAudioSystem: CreateAudioSystem = (ctx) => new AudioSystemImpl(ctx);
