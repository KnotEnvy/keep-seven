// createSandbox(): context + loop + core stubs for the slots a page does not supply, the debug hook, ?test=1, ?scene=,
// a button bar and the perf overlay (ARCHITECTURE 12). A sandbox page imports this and its own module only.
import * as THREE from 'three';
import type {
  AssetDef, CheckpointId, CreateAudioSystem, CreateEnemySystem, CreatePlayerSystem, CreateRenderSystem, CreateUiSystem, CreateWorldSystem,
  DebugHook, GameSystem, LayoutSolid, MutableGameContext, SystemId,
} from './contracts.ts';
import { coreOf, createContext, parseRunFlags } from './context.ts';
import { installDebugHook, reportBootFailure } from './debugHook.ts';
import { boot } from './flow.ts';
import type { Flow } from './flow.ts';
import { buildGreyboxGeometry, greyboxMaterial, solidFlags, solidTriangles } from './greybox.ts';
import { orderSystems, startLoop } from './loop.ts';
import { surfaceIndex } from './math.ts';

export interface SandboxSystems {
  player?: CreatePlayerSystem; enemies?: CreateEnemySystem; world?: CreateWorldSystem;
  render?: CreateRenderSystem; audio?: CreateAudioSystem; ui?: CreateUiSystem;
}
export type SandboxScene = (sandbox: Sandbox) => void | Promise<void>;
export interface SandboxOptions {
  /** names the sandbox (RunFlags.sandbox) */
  piece: string;
  /** the real system(s) under test; every other slot keeps its core stub */
  systems?: SandboxSystems;
  /** named scenes: `?scene=<name>` picks one, the first is the default; each also gets a button */
  scene?: Record<string, SandboxScene>;
}
/** a solid of a sandbox room: the layout's conventions, without the level bookkeeping */
export type RoomSolid = Pick<LayoutSolid, 'shape' | 'pos' | 'size' | 'rotY' | 'surface'> & Partial<LayoutSolid>;

/** Where the test rooms are built: far above the level, outside every zone. */
export const ROOM_ORIGIN: readonly [number, number, number] = [0, 500, 0];

export class Sandbox {
  readonly params: URLSearchParams;
  /** the scene that is running */
  sceneName = '';
  hook: DebugHook | null = null;
  private readonly bar: HTMLElement;
  private roomGroup: THREE.Group | null = null;
  constructor(readonly ctx: MutableGameContext, readonly systems: readonly GameSystem[], private readonly flow: Flow, readonly piece: string) {
    this.params = coreOf(ctx).url.params;
    let bar = document.getElementById('bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'bar'; document.body.appendChild(bar); }
    this.bar = bar;
  }

  /** A button in the bar. */
  button(label: string, onClick: () => void, title = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    this.bar.appendChild(b);
    return b;
  }
  /** A text readout in the bar; call the returned function to change it. */
  readout(initial = ''): (text: string) => void {
    const span = document.createElement('span');
    span.className = 'readout'; span.textContent = initial;
    this.bar.appendChild(span);
    let shown = initial;
    return (text: string): void => { if (text !== shown) { shown = text; span.textContent = text; } };
  }
  /** A visual break between groups of buttons. */
  separator(): void { const s = document.createElement('span'); s.className = 'sep'; this.bar.appendChild(s); }

  /** Title -> playing in the real layout, optionally at a checkpoint (the debug hook's start()). */
  async start(checkpoint?: CheckpointId): Promise<void> {
    await this.flow.play();
    if (checkpoint && checkpoint !== this.ctx.world.checkpoint) await this.flow.warp(checkpoint);
  }
  /**
   * Dev / test only: merge an overlay manifest ({ meta.publicDir, assets, textures }; `url` relative to the project
   * root, e.g. 'tests/pipeline/fixtures/manifest.json') over design/assets.json before anything of it loads, so assets
   * that are not game assets (the pipeline fixtures) come through the same store. Their paths are relative to the
   * overlay's meta.publicDir. Returns the ids it added. Never in a production build.
   */
  async loadOverlay(url: string): Promise<string[]> {
    if (!import.meta.env.DEV) return [];
    const res = await fetch('../' + url.replace(/^\/+/, ''));
    if (!res.ok) throw new Error(`sandbox: overlay manifest '${url}' not found (${res.status})`);
    const overlay = await res.json() as { meta?: { publicDir?: string }; assets?: Record<string, AssetDef>; textures?: Record<string, { path: string }> };
    const pub = overlay.meta?.publicDir ? overlay.meta.publicDir.replace(/\/+$/, '') + '/' : '';
    const manifest = this.ctx.data.manifest as unknown as { assets: Record<string, { path: string }>; textures: Record<string, { path: string }> };
    const ids: string[] = [];
    for (const [id, e] of Object.entries(overlay.assets ?? {})) { manifest.assets[id] = { ...e, path: pub + e.path }; ids.push(id); }
    for (const [id, e] of Object.entries(overlay.textures ?? {})) { manifest.textures[id] = { ...e, path: pub + e.path }; ids.push(id); }
    return ids;
  }
  /**
   * Load and activate single assets or textures outside any resident set (a fixture from loadOverlay, an embedded
   * prop, an asset of a set the scene has not activated), with the lightmaps and light layers an asset names. After
   * it resolves, `ctx.assets.get / instantiate / texture` accept them; materials come from whichever resolver the
   * render slot installed. They stay until the page goes away.
   */
  async activate(ids: readonly string[]): Promise<void> {
    const all: string[] = [];
    for (const id of ids) {
      const def = this.ctx.data.manifest.assets[id];
      if (!def && !this.ctx.data.manifest.textures[id]) throw new Error(`sandbox.activate: '${id}' is neither an asset nor a texture of the manifest`);
      if (def) for (const t of [...(def.lightmaps ?? []), ...(def.lightLayers ?? [])]) if (!all.includes(t)) all.push(t);
      if (!all.includes(id)) all.push(id);
    }
    await coreOf(this.ctx).assets.activateLoose(all);
  }
  /** Called after every lateUpdate, before the frame is drawn. */
  onFrame(fn: (frameDt: number, alpha: number) => void): void { coreOf(this.ctx).frameHooks.push(fn); }

  /**
   * Replace the static colliders with a room made of solids (positions relative to ROOM_ORIGIN) and draw it.
   * The level is hidden; the player is put at `spawn` (room coordinates) with control.
   */
  async room(solids: readonly RoomSolid[], spawn: readonly [number, number, number] = [0, 0, 0], yawDeg = 0): Promise<void> {
    const { ctx } = this;
    await this.flow.play();
    const placed: LayoutSolid[] = solids.map((s, i) => ({
      id: s.id ?? `room_${i}`, zone: 'the_lip', role: s.role ?? 'floor', ...s,
      pos: [s.pos[0] + ROOM_ORIGIN[0], s.pos[1] + ROOM_ORIGIN[1], s.pos[2] + ROOM_ORIGIN[2]],
    } as LayoutSolid));
    const flat: number[] = [], surface: number[] = [], flags: number[] = [], solid: number[] = [], ids: string[] = [];
    placed.forEach((s, i) => {
      const n = solidTriangles(s, flat);
      ids.push(s.id);
      for (let t = 0; t < n; t++) { surface.push(surfaceIndex(s.surface)); flags.push(solidFlags(s)); solid.push(i); }
    });
    ctx.collision.setStatic(Float32Array.from(flat), Uint8Array.from(surface), Uint8Array.from(flags), Uint16Array.from(solid), ids);
    if (this.roomGroup) { this.roomGroup.removeFromParent(); this.roomGroup.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
    const group = new THREE.Group();
    group.name = 'sandbox_room';
    const mesh = new THREE.Mesh(buildGreyboxGeometry(placed.filter((s) => !s.invisible), ctx.data.layout.meta.sun.toSun), greyboxMaterial());
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    ctx.scene.dynamic.add(group);
    this.roomGroup = group;
    ctx.render.setVisible([]);
    const doors = ctx.scene.dynamic.getObjectByName('stub_doors');     // the stub world's door boxes belong to the hidden level
    if (doors) doors.visible = false;
    ctx.player.teleport(spawn[0] + ROOM_ORIGIN[0], spawn[1] + ROOM_ORIGIN[1], spawn[2] + ROOM_ORIGIN[2], yawDeg, 0);
    ctx.player.setControl(true, 'sandbox');
  }
  /** A 40 x 40 m floor with four walls, a 30 degree ramp, a 0.2 / 0.35 / 0.5 m step row and two crates. */
  boxRoom(): Promise<void> {
    return this.room([
      { shape: 'box', pos: [0, -0.5, 0], size: [40, 1, 40], rotY: 0, surface: 'stone', role: 'floor' },
      { shape: 'box', pos: [0, 2, -20.5], size: [42, 5, 1], rotY: 0, surface: 'adobe', role: 'wall' },
      { shape: 'box', pos: [0, 2, 20.5], size: [42, 5, 1], rotY: 0, surface: 'adobe', role: 'wall' },
      { shape: 'box', pos: [-20.5, 2, 0], size: [1, 5, 40], rotY: 0, surface: 'adobe', role: 'wall' },
      { shape: 'box', pos: [20.5, 2, 0], size: [1, 5, 40], rotY: 0, surface: 'adobe', role: 'wall' },
      { shape: 'ramp', pos: [-8, 1, -10], size: [4, 2, 3.464], rotY: 0, surface: 'wood', role: 'stairs', rise: '-z', skirt: 0 },
      { shape: 'box', pos: [-8, 1, -13.7], size: [4, 2, 4], rotY: 0, surface: 'wood', role: 'platform' },
      { shape: 'box', pos: [2, 0.1, -8], size: [2, 0.2, 2], rotY: 0, surface: 'metal', role: 'platform' },
      { shape: 'box', pos: [5, 0.175, -8], size: [2, 0.35, 2], rotY: 0, surface: 'metal', role: 'platform' },
      { shape: 'box', pos: [8, 0.25, -8], size: [2, 0.5, 2], rotY: 0, surface: 'metal', role: 'platform' },
      { shape: 'box', pos: [-3, 0.5, -5], size: [1, 1, 1], rotY: 20, surface: 'wood', role: 'cover', low: true },
      { shape: 'cylinder', pos: [4, 0.6, -3], size: [0.9, 1.2, 0.9], rotY: 0, surface: 'ceramic', role: 'cover', low: true },
    ], [0, 0, 6]);
  }
}

/** Builds the page: context, systems (real or stub), boot, the chosen scene, loop, debug hook. */
export async function createSandbox(options: SandboxOptions): Promise<Sandbox> {
  try {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const uiRoot = document.getElementById('ui') as HTMLElement;
    const flags = parseRunFlags(location.search, import.meta.env.DEV, options.piece);
    const ctx = createContext({ canvas, uiRoot, flags, assetBase: '../' });
    const core = coreOf(ctx);
    const given = options.systems ?? {};
    const made: Partial<Record<SystemId, GameSystem>> = {};
    if (given.render) { const s = given.render(ctx, canvas); ctx.render = s; made.render = s; }
    if (given.audio) { const s = given.audio(ctx); ctx.audio = s; made.audio = s; }
    if (given.player) { const s = given.player(ctx); ctx.player = s; made.player = s; }
    if (given.enemies) { const s = given.enemies(ctx); ctx.enemies = s; made.enemies = s; }
    if (given.world) { const s = given.world(ctx); ctx.world = s; made.world = s; }
    if (given.ui) { const s = given.ui(ctx, uiRoot); ctx.ui = s; made.ui = s; }
    const systems = orderSystems((Object.keys(core.stubs) as SystemId[]).map((id) => made[id] ?? core.stubs[id]));
    for (const s of systems) await s.init();
    const flow = await boot(ctx, systems);
    const sandbox = new Sandbox(ctx, systems, flow, options.piece);

    const scenes = options.scene ?? {};
    const names = Object.keys(scenes);
    const wanted = core.url.scene;
    const base = wanted.split(':')[0] ?? '';
    const name = names.includes(wanted) ? wanted : names.includes(base) ? base : names[0] ?? '';
    sandbox.sceneName = name;
    for (const n of names) {
      const b = sandbox.button(n, () => { const q = new URLSearchParams(location.search); q.set('scene', n); location.search = q.toString(); }, 'scene');
      if (n === name) b.classList.add('active');
    }
    if (names.length) sandbox.separator();
    const run = scenes[name];
    if (run) await run(sandbox);

    if (!flags.test) {
      // no menus in a sandbox: a click on the canvas takes the pointer and unlocks audio
      canvas.addEventListener('click', () => {
        ctx.input.requestPointerLock();
        ctx.audio.unlock();
        if (ctx.state.current === 'paused') ctx.state.request('playing', 'resume');
      });
    }
    // `__dbg.ext.sandbox`: a test builds its own room (the layout's solid conventions, positions relative to
    // ROOM_ORIGIN) instead of depending on a scene of the page
    ctx.debug.register('sandbox', {
      room: ((solids: readonly RoomSolid[], spawn?: readonly [number, number, number], yawDeg?: number) => sandbox.room(solids, spawn, yawDeg)) as (...args: never[]) => unknown,
      boxRoom: (() => sandbox.boxRoom()) as (...args: never[]) => unknown,
      origin: (() => ROOM_ORIGIN.slice()) as (...args: never[]) => unknown,
      activate: ((ids: readonly string[]) => sandbox.activate(ids)) as (...args: never[]) => unknown,
      loadOverlay: ((url: string) => sandbox.loadOverlay(url)) as (...args: never[]) => unknown,
    });
    startLoop(ctx, systems);
    sandbox.hook = installDebugHook(ctx, systems);
    return sandbox;
  } catch (err) {
    reportBootFailure(err);
    throw err;
  }
}
