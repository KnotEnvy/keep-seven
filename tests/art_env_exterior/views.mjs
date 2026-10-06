// Shared view list and viewer-frame helper of tests/art_env_exterior (not a test file).
//   node tests/art_env_exterior/views.mjs [name ...] [--out shots/<piece>/sub]   writes viewer frames (the baked result, through the real loader)
// A view is { name, zone, eye: [x, y, z] (game space, the camera), at: [x, y, z] }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, openGame, ROOT } from '../harness.mjs';

export const PIECE = 'art-env-exterior';
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
export const marker = (id) => L.markers.find((m) => m.id === id);
const EYE = 1.65;
const up = (p, h = EYE) => [p[0], p[1] + h, p[2]];
const start = marker('player_start').pos, rule = marker('vista_rule').params.target, knee = marker('vista_kneeler');
const yardClear = marker('cp_yard_clear').pos, dowser = marker('vista_dowser').params.target, rim = marker('lift_arrival_rim').pos, plenty = marker('vista_plenty');

export const VIEWS = [
  { name: 'lip_doorway', zone: 'the_lip', eye: up(start), at: [start[0] - 2, start[1] + 1.2, start[2] - 40] },
  { name: 'lip_reach1', zone: 'the_lip', eye: [14, 14 + EYE, 92], at: [15, 11, 70] },
  { name: 'lip_reach2', zone: 'the_lip', eye: [18, 11.1 + EYE, 76], at: [19, 8, 55] },
  { name: 'lip_reach3', zone: 'the_lip', eye: [13, 7.3 + EYE, 53], at: [13, 4, 32] },
  { name: 'lip_reach4', zone: 'the_lip', eye: [12, 2.9 + EYE, 29.5], at: [9, 1.5, 5] },
  { name: 'lip_stand_gate', zone: 'the_lip', eye: [11, EYE, 0], at: [1, 2.6, 0.8] },
  { name: 'st_kneeler', zone: 'plenty_street', eye: up(knee.pos), at: knee.params.target },
  { name: 'st_x20', zone: 'plenty_street', eye: [-20, EYE, 0], at: [-60, 2.2, 0] },
  { name: 'st_x40', zone: 'plenty_street', eye: [-40, EYE, 0], at: [-80, 2.6, 0] },
  { name: 'st_x60', zone: 'plenty_street', eye: [-60, EYE, 0], at: [-100, 3.5, -1] },
  { name: 'yard_from_door', zone: 'plenty_street', eye: [-81.2, EYE, 0], at: [-101, 4.5, -3] },
  { name: 'yard_clear_west', zone: 'plenty_street', eye: up(yardClear), at: [dowser[0], yardClear[1] + EYE + 8, dowser[2]] },
  { name: 'yard_catwalk', zone: 'plenty_street', eye: [-87.5, 3.5 + EYE, 5.6], at: [-101, 2.5, -4] },
  { name: 'rim_arrival', zone: 'far_rim', eye: up(rim), at: [rim[0], rim[1] + 2.0, rim[2] - 40] },
  { name: 'rim_plenty', zone: 'far_rim', eye: up(plenty.pos), at: plenty.params.target },
];

/** openGame with retries: on this shared machine (load average over 100 at times) a first page load can outlast the
 *  harness's 30 s navigation limit; a retry is not an assertion on time, it only waits longer. */
export async function openRetry(server, opts, tries = 4) {
  let last;
  for (let k = 0; k < tries; k++) {
    try { return await openGame(server, opts); } catch (e) { last = e; if (!/Timeout|timeout/.test(String(e && e.message))) throw e; }
  }
  throw last;
}

/** Viewer frames of `views` (the zone page of sandbox/viewer.html, every unit of the resident set shown) -> PNG paths. */
export async function viewerFrames(views, { dir = path.join(ROOT, 'shots', PIECE), suffix = '_viewer', cells = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const server = await startServer();
  const out = [];
  try {
    const zones = [...new Set(views.map((v) => v.zone))];
    for (const zone of zones) {
      const game = await openRetry(server, { page: 'sandbox/viewer', piece: PIECE, query: { zone, shot: 1, cells: cells ? 1 : 0 }, start: false });
      try {
        for (const v of views.filter((x) => x.zone === zone)) {
          const url = await game.page.evaluate(async ({ eye, at }) => {
            const d = window.__dbg;
            d.ext.player?.fly?.(true);
            d.teleport(eye[0], eye[1] - 1.65, eye[2]);
            d.aimAt(at[0], at[1], at[2]);
            await d.ext.core.stepAsync(2, true);
            d.teleport(eye[0], eye[1] - 1.65, eye[2]);
            d.aimAt(at[0], at[1], at[2]);
            await d.ext.core.stepAsync(1, true);
            return d.capture();
          }, v);
          const file = path.join(dir, v.name + suffix + '.png');
          fs.writeFileSync(file, Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
          out.push(file);
        }
      } finally { await game.close(); }
    }
  } finally { await server.close(); }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const oi = args.indexOf('--out'); const dir = oi >= 0 ? path.join(ROOT, args.splice(oi, 2)[1]) : undefined;
  const names = args.filter((a) => !a.startsWith('--'));
  const views = names.length ? VIEWS.filter((v) => names.some((n) => v.name.startsWith(n))) : VIEWS;
  const files = await viewerFrames(views, { dir });
  for (const f of files) console.log(path.relative(ROOT, f));
}
