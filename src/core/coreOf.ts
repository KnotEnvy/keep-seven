// Where a context keeps core's own internals (release pass p0, closer). A LEAF module (type imports only), split out of
// context.ts: context.ts imports the stub systems and stubs/basicRender.ts needs `coreOf`, which made an import cycle
// context -> basicRender -> context. A cycle is harmless in plain modules, but the production build awaits the design
// data at the top of the module graph (dataFile.ts), and the bundler's lazy async module wrappers deadlock on a cycle:
// a build with stand-in slots (tests/harness.mjs `startServer({ mode: 'build', pieces })`) never booted.
import type { GameContext } from './contracts.ts';
import type { CoreInternals } from './context.ts';

const INTERNALS = new WeakMap<object, CoreInternals>();

export function coreOf(ctx: GameContext): CoreInternals {
  const c = INTERNALS.get(ctx);
  if (!c) throw new Error('not a context made by createContext()');
  return c;
}

/** createContext() only */
export function setCoreOf(ctx: GameContext, core: CoreInternals): void { INTERNALS.set(ctx, core); }
