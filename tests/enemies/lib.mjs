// Shared by tests/enemies/*.test.mjs: one dev server for the directory (pieces: enemies only, so nobody else's
// half-written module can break these pages), the sandbox page per scene, and a page-side runner.
import { after, before } from 'node:test';
import { openGame, startServer } from '../harness.mjs';

export const PIECE = 'code-enemies';

let handle = null;
/** Call at the top of a test file: starts the dev server before its tests (the harness shares one per process) and closes it after. */
export function useServer() {
  // One handle per test file: the harness shares one dev server per process and counts its users, so every
  // startServer needs its own close (`node --test tests/enemies/` imports all nine files into one process; with one
  // shared handle eight users were never released and the run never exited after its last test).
  let mine = null;
  before(async () => { mine = await startServer({ pieces: ['enemies'] }); handle = mine; });
  after(async () => { if (mine) await mine.close(); if (handle === mine) handle = null; });
}
async function server() {
  if (!handle) handle = await startServer({ pieces: ['enemies'] });
  return handle;
}

/** The sandbox page (the real enemies system beside five core stubs) in one of its scenes: street, yard, file, hall, bore. */
export async function openScene(scene, options = {}) {
  const s = await server();
  return openGame(s, { page: 'sandbox/enemies', piece: PIECE, start: false, ...options, query: { scene, ...(options.query ?? {}) } });
}

/** The index page with src/enemies in its slot and core stubs in the other five. */
export async function openIndex(options = {}) {
  const s = await server();
  return openGame(s, { piece: PIECE, ...options });
}

/**
 * Run a function inside the page: `fn(dbg, e, core, arg)` with dbg = window.__dbg, e = dbg.ext.enemies, core = dbg.ext.core.
 * The function is serialised: no closures. Page-side helpers: `H.until(test, max)` steps one tick at a time until
 * `test()` is truthy (returns ticks stepped, or -1), `H.events(sinceSeq, re)` filters the event ring by name.
 */
export function inPage(game, fn, arg = null) {
  return game.page.evaluate(async ({ src, a }) => {
    const dbg = window.__dbg, core = dbg.ext.core, e = dbg.ext.enemies;
    const H = {
      async until(test, max = 600) { for (let i = 0; i < max; i++) { if (test()) return i; await core.stepAsync(1); } return test() ? max : -1; },
      seq() { return dbg.events().at(-1)?.seq ?? 0; },
      events(since, re) { return dbg.events(since).filter((x) => re.test(x.name)); },
      names(since, re) { return dbg.events(since).filter((x) => re.test(x.name)).map((x) => x.name); },
      calls() { return dbg.state().systems.render.calls; },
    };
    // eslint-disable-next-line no-new-func
    const run = new Function('H', 'return (' + src + ')')(H);
    return run(dbg, e, core, a);
  }, { src: fn.toString(), a: arg });
}
