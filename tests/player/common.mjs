// Shared by the browser tests of src/player: one dev server per process (the harness shares it), the sandbox page with
// the real player beside five core stubs, and a few page-side helpers. Nothing here waits on real time.
import { openGame, startServer } from '../harness.mjs';

export const PIECE = 'code-player';
export const ORIGIN = [0, 500, 0];                          // src/core/sandbox.ts ROOM_ORIGIN
export const DT = 1 / 60;
/** only src/player/ is served from its own sources: another builder's half-written module cannot break these tests */
export const server = () => startServer({ pieces: ['player'] });

/** The sandbox page in a scene, the draw clip over, the gun ready. */
export async function sandbox(srv, scene = 'room', options = {}) {
  const game = await openGame(srv, { page: 'sandbox/player', piece: PIECE, start: false, query: { scene, ...(options.query ?? {}) }, ...options });
  await game.step(31);                                      // `draw` (0.5 s) on getting control
  return game;
}
/** A room of layout-style solids (room coordinates), she at `spawn` facing `yawDeg`, settled. */
export async function room(game, solids, spawn = [0, 0, 0], yawDeg = 0) {
  await game.page.evaluate(([s, at, yaw]) => window.__dbg.ext.sandbox.room(s, at, yaw), [solids, spawn, yawDeg]);
  await game.step(2);
}
export const FLOOR = { shape: 'box', pos: [0, -0.5, 0], size: [120, 1, 120], rotY: 0, surface: 'stone', role: 'floor' };
/** the player system's own snapshot */
export const me = async (game) => (await game.state()).systems.player;
export const ext = (game, name, method, ...args) => game.page.evaluate(([n, m, a]) => window.__dbg.ext[n][m](...a), [name, method, args]);
/** events after `seq`, optionally of one name: [{ seq, tick, name, payload }] */
export const eventsSince = (game, seq, name) => game.events(seq, name);
export const lastSeq = async (game) => (await game.events(0)).at(-1)?.seq ?? 0;
/** degrees between two directions */
export function angleDeg(a, b) {
  const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}
/** unit view direction for a yaw (0 faces -Z, positive turns left) and pitch (positive up), degrees */
export function dirOf(yawDeg, pitchDeg) {
  const y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180;
  return [-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
}
