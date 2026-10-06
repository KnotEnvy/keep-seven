// createContext(): builds every core service and puts the six core stubs in the system slots (ARCHITECTURE 3.1).
import * as THREE from 'three';
import { PLAYER_EYE } from './contracts.ts';
import type {
  CheckpointId, DebugRegistry, GameSystem, MutableGameContext, GameContext, RenderTier, RunFlags, SceneRoots, SystemId,
} from './contracts.ts';
import { AssetStoreImpl } from './assets.ts';
import { GameClockImpl } from './clock.ts';
import { createCollisionWorld } from './collision.ts';
import { createGameData } from './data.ts';
import type { GameDataImpl } from './data.ts';
import { EventBusImpl } from './events.ts';
import { InputImpl } from './input.ts';
import { MemoryStorage, OptionsStoreImpl, browserStorage } from './options.ts';
import type { KeyValueStorage } from './options.ts';
import { PerfMonitorImpl } from './perf.ts';
import { QualityManagerImpl } from './quality.ts';
import { createRng } from './rng.ts';
import type { Mulberry32 } from './rng.ts';
import { SaveStoreImpl } from './save.ts';
import { GameStateMachineImpl } from './state.ts';
import { createBasicRender } from './stubs/basicRender.ts';
import { createDummyPlayer } from './stubs/dummyPlayer.ts';
import { createNullAudio } from './stubs/nullAudio.ts';
import { createNullEnemies } from './stubs/nullEnemies.ts';
import { createNullUi } from './stubs/nullUi.ts';
import { createNullWorld } from './stubs/nullWorld.ts';
import type { Loop } from './loop.ts';
import type { Flow } from './flow.ts';

/** URL parameters that are not part of RunFlags (ARCHITECTURE 11.1). */
export interface UrlExtras {
  autostart: boolean;
  perf: boolean;
  persist: boolean;
  scene: string;
  params: URLSearchParams;
}

export class DebugRegistryImpl implements DebugRegistry {
  readonly ext: Record<string, Record<string, (...args: never[]) => unknown>> = {};
  constructor(private readonly enabled: boolean) {}
  register(name: string, api: Record<string, (...args: never[]) => unknown>): void {
    if (!this.enabled) return;
    this.ext[name] = { ...(this.ext[name] ?? {}), ...api };
  }
}

/** Everything core keeps beside the contract surface. Only src/core may use it. */
export interface CoreInternals {
  readonly events: EventBusImpl;
  readonly clock: GameClockImpl;
  readonly rng: Mulberry32;
  readonly state: GameStateMachineImpl;
  readonly input: InputImpl;
  readonly options: OptionsStoreImpl;
  readonly save: SaveStoreImpl;
  readonly data: GameDataImpl;
  readonly assets: AssetStoreImpl;
  readonly quality: QualityManagerImpl;
  readonly perf: PerfMonitorImpl;
  readonly debug: DebugRegistryImpl;
  readonly storage: KeyValueStorage;
  readonly canvas: HTMLCanvasElement;
  readonly uiRoot: HTMLElement;
  readonly url: UrlExtras;
  /** the core stub of each slot (what a sandbox runs beside the one real system) */
  readonly stubs: Record<SystemId, GameSystem>;
  /** called after every lateUpdate and before render.render (sandbox viewer camera, overlays) */
  readonly frameHooks: ((frameDt: number, alpha: number) => void)[];
  /** the last `player/control` event (the contract has no accessor); enabled is null before the first one */
  readonly control: { enabled: boolean | null; reason: string };
  /** first uncaught error or console.error text */
  error: string | null;
  loop: Loop | null;
  flow: Flow | null;
}

const INTERNALS = new WeakMap<object, CoreInternals>();
export function coreOf(ctx: GameContext): CoreInternals {
  const c = INTERNALS.get(ctx);
  if (!c) throw new Error('not a context made by createContext()');
  return c;
}

const TIERS: readonly string[] = ['min', 'low', 'high'];

/** Parses the URL parameters of ARCHITECTURE 11.1. `dev` is true on the dev server. */
export function parseRunFlags(search: string, dev: boolean, sandbox: string | null = null): RunFlags {
  const q = new URLSearchParams(search);
  const tier = q.get('tier');
  const seed = Number.parseInt(q.get('seed') ?? '1', 10);
  const test = q.get('test') === '1', devPage = dev || q.get('debug') === '1';
  // `cp` (and `autostart`, parseUrlExtras) are development facilities: a public page honours neither without ?debug=1
  const cp = devPage || test ? q.get('cp') : null;
  return {
    test,
    dev: devPage,
    seed: Number.isFinite(seed) ? seed : 1,
    tierOverride: tier !== null && TIERS.includes(tier) ? (tier as RenderTier) : null,
    startCheckpoint: cp ? (cp as CheckpointId) : null,
    sandbox,
  };
}
export function parseUrlExtras(search: string, dev = true): UrlExtras {
  const q = new URLSearchParams(search);
  return { autostart: dev && q.get('autostart') === '1', perf: q.get('perf') === '1', persist: q.get('persist') === '1', scene: q.get('scene') ?? '', params: q };
}

export interface CreateContextOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  flags: RunFlags;
  /** location.search (default: the page's) */
  search?: string;
  /** where manifest paths resolve from: './' for index.html, '../' for a page in sandbox/ */
  assetBase?: string;
}

export function createContext(options: CreateContextOptions): MutableGameContext {
  const { canvas, uiRoot, flags } = options;
  const search = options.search ?? (typeof location !== 'undefined' ? location.search : '');
  const url = parseUrlExtras(search, flags.dev || flags.test);
  const recording = flags.test || flags.dev;

  const events = new EventBusImpl();
  const storage: KeyValueStorage = flags.test && !url.persist ? new MemoryStorage() : browserStorage();
  const optionsStore = new OptionsStoreImpl(storage, events);
  const clock = new GameClockImpl(events, () => optionsStore.value.reduceMotion);
  if (recording) events.enableRecording(() => clock.tick);
  const rng = createRng(flags.seed);
  const state = new GameStateMachineImpl(events);
  const win = typeof window !== 'undefined' ? window : null;
  const input = new InputImpl(events, optionsStore, { window: win, document: typeof document !== 'undefined' ? document : null, element: canvas });
  const data = createGameData({ strict: recording });
  const save = new SaveStoreImpl(storage, (id) => data.layout.markers.some((m) => m.id === id && m.type === 'checkpoint'));
  const quality = new QualityManagerImpl({
    flags, manifest: data.manifest, options: optionsStore, events, storage,
    devicePixelRatio: () => (win ? win.devicePixelRatio || 1 : 1),
  });
  const perf = new PerfMonitorImpl();
  const debug = new DebugRegistryImpl(recording);
  const collision = createCollisionWorld();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(optionsStore.value.fov, 16 / 9, 0.05, 2000);
  camera.position.set(0, PLAYER_EYE, 0);
  const world = new THREE.Group(); world.name = 'world';
  const dynamic = new THREE.Group(); dynamic.name = 'dynamic';
  const fx = new THREE.Group(); fx.name = 'fx';
  const viewModel = new THREE.Group(); viewModel.name = 'viewModel';
  scene.add(world, dynamic, fx, viewModel, camera);
  const roots: SceneRoots = { scene, camera, world, dynamic, fx, viewModel };

  // the asset store needs the renderer of whichever render system ends up in the slot
  const ctxRef: { ctx: MutableGameContext | null } = { ctx: null };
  const assets = new AssetStoreImpl({
    manifest: data.manifest, layout: data.layout, events,
    baseUrl: options.assetBase ?? './',
    allowSynthesis: recording,
    forceSynthesis: recording && url.params.get('assets') === 'none',
    test: flags.test,
    spreadUploads: () => !flags.test && state.current === 'playing',
    sliceUploads: () => !flags.test && state.current === 'boot',
    renderer: () => (ctxRef.ctx ? ctxRef.ctx.render.renderer : null),
  });

  const partial = {
    flags, data, events, clock, rng, state, input, options: optionsStore, save, assets, quality, collision, scene: roots, perf, debug,
  };
  // the stubs are constructed against the context object they will live in
  const ctx = partial as unknown as MutableGameContext;
  const core: CoreInternals = {
    events, clock, rng, state, input, options: optionsStore, save, data, assets, quality, perf, debug, storage, canvas, uiRoot, url,
    stubs: {} as Record<SystemId, GameSystem>, frameHooks: [], control: { enabled: null, reason: '' }, error: null, loop: null, flow: null,
  };
  if (recording) events.on('player/control', (e) => { core.control.enabled = e.enabled; core.control.reason = e.reason; });
  INTERNALS.set(ctx, core);

  const player = createDummyPlayer(ctx);
  const enemies = createNullEnemies(ctx);
  const worldStub = createNullWorld(ctx);
  const render = createBasicRender(ctx, canvas);
  const audio = createNullAudio(ctx);
  const ui = createNullUi(ctx, uiRoot);
  ctx.player = player; ctx.enemies = enemies; ctx.world = worldStub; ctx.render = render; ctx.audio = audio; ctx.ui = ui;
  core.stubs.player = player; core.stubs.enemies = enemies; core.stubs.world = worldStub;
  core.stubs.render = render; core.stubs.audio = audio; core.stubs.ui = ui;
  ctxRef.ctx = ctx;

  data.setDoorState((id) => ctx.world.doorState(id));
  // what the asset store really loaded, and the R8 upload verdict (tests and the foundation report read it)
  debug.register('assets', {
    report: (() => ({ ...assets.report, activeTextureBytes: assets.activeTextureBytes() })) as (...args: never[]) => unknown,
    isPlaceholder: ((id: string) => assets.get(id).isPlaceholder) as (...args: never[]) => unknown,
  });
  events.on('options/changed', (e) => {
    if (e.key === 'bindings') input.rebind();
    if (e.key === 'graphics' || e.key === 'resolutionScale') quality.onOptionChanged(e.key);
  });

  if (recording && win) {
    // first uncaught error or console.error: the harness fails a test on it
    const note = (text: string): void => { if (core.error === null) core.error = text; };
    win.addEventListener('error', (e) => note(e.message || String(e.error)));
    win.addEventListener('unhandledrejection', (e) => note('unhandled rejection: ' + String((e.reason as Error | undefined)?.stack ?? e.reason)));
    const original = console.error.bind(console);
    console.error = (...args: unknown[]): void => { note(args.map((a) => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' ')); original(...args); };
  }
  return ctx;
}
