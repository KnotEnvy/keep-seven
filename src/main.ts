// Composition root (ARCHITECTURE 3.1). There are no module-level singletons: everything hangs off the context.
//
// `?stubs=all` or `?stubs=world,enemies` (dev / test, and a build with ?debug=1) leaves the CORE STUB in the named
// slots instead of the piece's system, and does not even load that piece's module. It is how a piece is run "wired in
// beside core stubs for the other five" (`?stubs=enemies,world,render,audio,ui` for the player), and how the
// stub-level tests of tests/core stay independent of six work-in-progress modules (tests/harness.mjs `stubs`).
import { SYSTEM_ORDER } from './core/contracts.ts';
import type { GameSystem, SystemId } from './core/contracts.ts';
import { coreOf, createContext, parseRunFlags } from './core/context.ts';
import { installDebugHook, reportBootFailure } from './core/debugHook.ts';
import { boot } from './core/flow.ts';
import { orderSystems, startLoop } from './core/loop.ts';

/**
 * Pass i4. `__KEEP7_HOOK__` is written by vite.config.mts: FALSE in a release build, where the debug hook and its driver
 * (`installDebugHook`: walking by input, scripts, cheats) are not in the script at all, and the parameters that need it
 * (`?test=1`, which also stops the frame loop, `?debug=1`, `?cp=`) are not read. True in the dev server and in a build
 * made with KEEP7_HOOK=1 (the tests' builds). Undefined under vitest and node: true.
 */
declare const __KEEP7_HOOK__: boolean | undefined;
const HOOK: boolean = typeof __KEEP7_HOOK__ === 'undefined' || __KEEP7_HOOK__;
/** location.search without the parameters only a page with the hook may honour */
function publicSearch(search: string): string {
  if (HOOK) return search;
  const q = new URLSearchParams(search);
  for (const key of ['test', 'debug', 'cp', 'autostart', 'stubs', 'assets']) q.delete(key);
  const text = q.toString();
  return text === '' ? '' : '?' + text;
}

/** The slots that keep their core stub. Empty unless the page is a dev / test / debug page. */
function stubbedSlots(search: string, allowed: boolean): ReadonlySet<SystemId> {
  const out = new Set<SystemId>();
  const value = new URLSearchParams(search).get('stubs');
  if (!value || !allowed) return out;
  if (value === 'all') { for (const id of SYSTEM_ORDER) out.add(id); return out; }
  for (const name of value.split(',')) {
    if (name === '') continue;
    if (!(SYSTEM_ORDER as readonly string[]).includes(name)) throw new Error(`?stubs=: '${name}' is not a system (${SYSTEM_ORDER.join(', ')}, or all)`);
    out.add(name as SystemId);
  }
  return out;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  // Ruling R20 (pass i4): a visitor without a mouse and keyboard is told so by index.html BEFORE the game downloads. The
  // page's inline script leaves a promise here when it shows that notice; it resolves when the visitor asks for the game
  // anyway. Nothing of the 9 MB of models and textures is asked for until then (the script and the design data are in).
  const gate = (window as unknown as { __keep7Gate?: Promise<void> }).__keep7Gate;
  if (gate) await gate;
  // the URL parameters of ARCHITECTURE 11.1
  const search = publicSearch(location.search);
  const flags = parseRunFlags(search, import.meta.env.DEV);
  // (pass i4, performance: the boot ran one main-thread task of 160 to 410 ms from the design data's arrival to the first
  // screen; the page now gets a turn between the context, each system's construction and each init)
  const breathe = (): Promise<void> | null => (flags.test ? null : new Promise<void>((resolve) => { setTimeout(resolve, 0); }));

  const ctx = createContext({ canvas, uiRoot, flags, search });      // core services + inert stubs in the six system slots
  document.title = ctx.data.ui('ui_title');
  await breathe();
  const stub = stubbedSlots(search, flags.test || flags.dev);
  const stubs = coreOf(ctx).stubs;
  const slot: Record<SystemId, GameSystem> = { ...stubs };
  // order is free: a factory may not call another system. A stubbed slot's module is never imported.
  if (!stub.has('render')) slot.render = ctx.render = (await import('./render/index.ts')).createRenderSystem(ctx, canvas);
  await breathe();
  if (!stub.has('audio')) slot.audio = ctx.audio = (await import('./audio/index.ts')).createAudioSystem(ctx);
  if (!stub.has('player')) slot.player = ctx.player = (await import('./player/index.ts')).createPlayerSystem(ctx);
  if (!stub.has('enemies')) slot.enemies = ctx.enemies = (await import('./enemies/index.ts')).createEnemySystem(ctx);
  if (!stub.has('world')) slot.world = ctx.world = (await import('./world/index.ts')).createWorldSystem(ctx);
  await breathe();
  if (!stub.has('ui')) slot.ui = ctx.ui = (await import('./ui/index.ts')).createUiSystem(ctx, uiRoot);
  const systems: GameSystem[] = orderSystems(SYSTEM_ORDER.map((id) => slot[id]));
  if (flags.test || flags.dev) {
    ctx.debug.register('core', {
      /** which slots hold core's own stub object (a piece's module never counts, even while it still wraps the stub class) */
      stubs: (() => SYSTEM_ORDER.filter((id) => systems.some((s) => s.id === id && s === stubs[id]))) as (...args: never[]) => unknown,
    });
  }
  for (const s of systems) { await s.init(); await breathe(); }   // subscribe to events, build DOM, create renderer
  await boot(ctx, systems);                                  // 'boot' -> 'title'
  startLoop(ctx, systems);                                   // not started when flags.test
  if (HOOK) installDebugHook(ctx, systems);                  // flags.test || flags.dev; not in a release build at all
}

// index.html's #preload (the name, the mark and the line) takes itself away when the game puts anything into #ui;
// a boot that fails before that must not leave it over the failure notice (closer, pass i1)
main().catch((err: unknown) => { document.getElementById('preload')?.remove(); reportBootFailure(err); });
