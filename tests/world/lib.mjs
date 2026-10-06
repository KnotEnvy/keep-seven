// Shared helpers of tests/world (not a test file: run-dir only picks *.test.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, openGame, startServer } from '../harness.mjs';

export const PIECE = 'code-world';
export const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
export const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/assets.json'), 'utf8'));
export const STORY = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/story.json'), 'utf8'));
export const MiB = 1024 * 1024;
export const marker = (id) => LAYOUT.markers.find((m) => m.id === id);

/** one dev server per test file, serving only src/world/ (the other five slots are core stubs) */
export function server() { return startServer({ pieces: ['world'] }); }
/** the index page with the real world beside five core stubs */
export function open(srv, options = {}) { return openGame(srv, { piece: PIECE, ...options }); }

/** the last event sequence number (a mark to read events after) */
export async function mark(game) { const all = await game.events(0); return all.length ? all.at(-1).seq : 0; }
/** aim at an entity's volume (or a marker) and fire one lead round with the dummy player's ray */
export function shootScript(target, steps = 2) { return [{ aimAtEntity: [target] }, { tap: 'fire', steps }]; }
/** a round of `ammo` fired from the eye by the world's own debug helper (the dummy fires lead only) */
export function shoot(game, ammo = 'lead_round') { return game.page.evaluate((a) => window.__dbg.ext.world.shoot(a), ammo); }
export function status(game) { return game.page.evaluate(() => window.__dbg.ext.world.status()); }
export function hintClock(game, seconds) { return game.page.evaluate((s) => window.__dbg.ext.world.hintClock(s), seconds); }
/** the render stub's ring of look calls (setMood, lamps.setCount, setOutline ...) */
export async function renderCalls(game) { return (await game.state()).systems.render.calls; }
export { measureAlloc as measureAllocSafe } from '../harness.mjs';

/**
 * Steps that take the round on the stone as a player does. Polish round 4: aimed at the round, `E` takes it (the prompt
 * reads TAKE); aimed at the note, or between the two while the note is unread, `E` reads the note.
 */
export function takeRound(round) { return [{ aimAt: round.pos, steps: 2 }, { tap: 'interact', steps: 4 }]; }
