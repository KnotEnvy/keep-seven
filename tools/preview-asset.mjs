// node tools/preview-asset.mjs <id> [--clip <name>|all] [--cycles] [--game] [--zone] [--piece <shots folder>] [--name <file stem>] [--manifest overlay.json]
//                                    [--zoom 2] [--angles "az:el;az:el"] [--elev 35] [--bounds x0,y0,z0,x1,y1,z1]
//                                    [--dist 2 --yaw -30 --pitch 15]   (the --game frame: the viewer's camera)
// node tools/preview-asset.mjs --textures [texture ids...] [--piece <shots folder>]
// node tools/preview-asset.mjs --lib [--piece <shots folder>]
//
// Evidence images in shots/<piece>/: the PIECE that builds the asset or texture (pipeline-lib `pieceOf`: the manifest
// owner, and for the three split orders the builder by id: art-props-mech / -dress, art-enemies-bider / -transit,
// art-boss-windlass / -tamper), so your evidence lands in your own folder without a flag. --piece <folder> overrides it
// (a critic's folder, a scratch run); --name <stem> replaces the id in the file names (before / after pairs). Reads the RAW export (blender/export/...: Blender cannot
// import the meshopt-compressed shipped file), so build first.
//   (always)       <id>_sheet.png         8-view Workbench turntable with vertex colours (+ palette / emissive colours), ~1 s;
//                                         every view fitted to the subject (about 10 % of the tile to spare). A ROOM or ZONE
//                                         (an asset with a chunk plan) is shown as a dollhouse: from 50 degrees up with
//                                         back faces culled, lightmapped faces x their lightmap, vertex-lit faces x 2
//   --clip <name>  <id>__<clip>.png       five frames at 0, 25, 50, 75, 100 %   (--clip all: every manifest clip)
//   --cycles       <id>_cycles.png        lit beauty sheet, the shared textures applied by blender/lib's preview materials.
//                                         A room or zone: the same dollhouse with every surface showing its BAKED light
//                                         (COLOR_0 x texture x lightmap x 2 / COLOR_0 x texture x 2), as the game draws it
//   --game         <id>_game.png          one frame of sandbox/viewer.html?asset=<id>&shot=1 through the REAL loader, with
//                                         triangles and draw calls burnt in (with --zone: ?zone=<zone id>, the frame's
//                                         measured calls and triangles against the zone's budget); works with --manifest
//   --zone         zones: <id>_sheet.png becomes a dollhouse (a plan view and three 3/4 views framed to the zone's layout
//                  bounds, roof cut away), plus <id>_views.png (eye-level shots from the zone's vista and checkpoint
//                  markers) and <id>_lightmap.png (its lightmap atlas, placeholder or baked)
//   --zoom F / --angles "0:10;35:20" / --elev DEG / --bounds x0,y0,z0,x1,y1,z1 (a Blender box)   close-ups: the sheets (and
//                  clip strips) are framed on that box, from those azimuth:elevation pairs (0 = from the front, -Y), F times closer
//   --lib          knot_sheet.png, mark_sheet.png: the shared knot and mark of blender/lib, from the front (lib_sheets.py)
//   --textures     tx_<id>.png, tx_<id>_tiled.png, palette_named.png, mask_regions.png (blender/tools/texture_sheets.py).
//                  With texture ids: each into the shots folder of the piece that owns its script (tx_gun -> art-weapons,
//                  tx_palette -> art-props-mech). Without ids: the six final shared textures, one overview in
//                  shots/foundation-pipeline/
// Open every image you cite.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, rel, loadManifest, loadLayout, overlayArg, pieceOf } from './pipeline-lib.mjs';

const argv = process.argv.slice(2);
const M = loadManifest(overlayArg(argv)), L = loadLayout();
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const value = (n) => {                                                   // `--name value` or `--name=value` (use the second for a value that starts with -)
  const j = argv.findIndex((x) => x.startsWith(n + '='));
  if (j >= 0) return argv.splice(j, 1)[0].slice(n.length + 1);
  const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v;
};
const CYCLES = flag('--cycles'), GAME = flag('--game'), ZONE = flag('--zone'), TEXTURES = flag('--textures');
const clipArg = value('--clip'), pieceArg = value('--piece'), nameArg = value('--name');
// close-ups: passed through to the Workbench and Cycles sheets (blender/tools/preview.py)
const FRAME = [];
for (const k of ['--zoom', '--angles', '--bounds', '--elev']) { const v = value(k); if (v !== null) FRAME.push(`${k}=${v}`); }
// the --game frame: the viewer's own camera parameters (sandbox/viewer.html &dist= &yaw= &pitch=), e.g. --dist 2 for a close look
const GAME_Q = {};
for (const k of ['dist', 'yaw', 'pitch']) { const v = value('--' + k); if (v !== null) GAME_Q[k] = v; }
const BLENDER = path.join(ROOT, 'tools/blender.sh');

function blender(script, args) {
  const r = spawnSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(ROOT, script), '--', ...args],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...(M._overlay ? { KS_MANIFEST_OVERLAY: M._overlay } : {}) } });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const line = out.split('\n').find((l) => /^(PREVIEW|SHEETS)/.test(l));
  if (r.status !== 0 || !line) {
    const why = out.split('\n').filter((l) => l.trim() && !/^EGL Error|^MESA|^Blender|INFO/.test(l)).slice(-4).join('\n  ');
    throw new Error(`blender ${script} failed:\n  ${why}`);
  }
  return line;
}
const toBlender = (p) => [p[0], -p[2], p[1]];
const v3 = (p) => p.map((x) => +x.toFixed(3)).join(',');

if (flag('--lib')) {
  const dir = path.join(ROOT, 'shots', pieceArg ?? 'foundation-pipeline');
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(ROOT, 'blender/tools/lib_sheets.py')], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.error((r.stdout ?? '') + (r.stderr ?? '')); process.exit(1); }
  console.log(((r.stdout ?? '').split('\n').filter((l) => /^(KNOT|MARK)/.test(l))).join('\n'));
  // from the front only (the back of the board is blank), each view fitted to the objects: a straight view and a raking one
  for (const [blend, name, aspect, size] of [['lib_knot', 'knot_sheet', '4.2', '300'], ['lib_mark', 'mark_sheet', '2.1', '600']]) {
    console.log(blender('blender/tools/preview.py', [path.join(ROOT, 'blender/blend', blend + '.blend'), path.join(dir, name + '.png'),
      '--engine', 'CYCLES', '--samples', '48', '--angles=0:4;28:16', '--fit', '--cols', '1', '--size', size, '--aspect', aspect]));
  }
  process.exit(0);
}
if (TEXTURES) {
  // named textures go to the piece that owns them (tx_gun -> shots/art-weapons/); the overview of all of them is the pipeline's
  const groups = new Map();
  const put = (piece, id) => { if (!groups.has(piece)) groups.set(piece, []); if (id) groups.get(piece).push(id); };
  if (!argv.length) put(pieceArg ?? 'foundation-pipeline', null);
  for (const id of argv) {
    if (!M.textures[id]) { console.error(`unknown texture '${id}'. Usage: node tools/preview-asset.mjs --textures [texture ids...] [--piece <shots folder>]`); process.exit(2); }
    put(pieceArg ?? pieceOf(M, id) ?? 'foundation-pipeline', id);
  }
  for (const [piece, ids] of groups) console.log(blender('blender/tools/texture_sheets.py', [path.join(ROOT, 'shots', piece), ...ids]));
  if (!argv.length && !pieceArg) console.log('(all shared textures: an overview in shots/foundation-pipeline/. Name texture ids to write your own into the shots folder of your piece.)');
  process.exit(0);
}
const stray = argv.filter((x) => x.startsWith('--'));
if (stray.length || argv.length > 1) { console.error(`unknown argument(s): ${(stray.length ? stray : argv.slice(1)).join(' ')}\nUsage: node tools/preview-asset.mjs <id> [--clip <name>|all] [--cycles] [--game] [--zone] [--piece <folder>] [--name <stem>] [--zoom F] [--angles "az:el;..."] [--elev DEG] [--bounds=x0,y0,z0,x1,y1,z1] [--dist M --yaw DEG --pitch DEG] [--manifest overlay.json]`); process.exit(2); }
const id = argv[0];
const a = M.assets[id];
if (!a) { console.error(`unknown asset '${id}'. Usage: node tools/preview-asset.mjs <id> [--clip <name>|all] [--cycles] [--game] [--zone]`); process.exit(2); }
if (!fs.existsSync(a._raw)) { console.error(`no raw export at ${rel(a._raw)}: run node tools/build-assets.mjs --only ${id}${fs.existsSync(path.join(ROOT, a.source ?? 'x')) ? '' : ' --placeholders'}`); process.exit(1); }
const piece = pieceArg ?? pieceOf(M, id) ?? 'foundation-pipeline';
const dir = path.join(ROOT, 'shots', piece);
fs.mkdirSync(dir, { recursive: true });
const stem = nameArg ?? id;
const made = [];
const preview = (out, args, frame = FRAME) => { console.log(blender('blender/tools/preview.py', [a._raw, out, ...args, ...frame])); made.push(out); };

const zone = a.zone ? L.zones.find((z) => z.id === a.zone) : null;
// a room or zone (an asset with a chunk plan) is looked INTO: from above, back faces culled; interiors of the layout with
// everything above the lowest ceiling cut away (their walls and roofs are solids, which culling alone does not open)
const DOLLHOUSE = ['--cull', '--elev', '50'];
if (a.chunks && zone?.kind === 'interior') {
  const ceil = L.solids.filter((s) => s.zone === zone.id && s.role === 'ceiling').map((s) => s.pos[1] - s.size[1] / 2);
  if (ceil.length) DOLLHOUSE.push('--cut-above', String(Math.min(...ceil) - 0.05));
}
if (ZONE && zone) {
  // dollhouse: a plan view and three 3/4 views, each framed to the zone's own layout bounds (not to whatever far
  // skyline the file also holds); interiors are opened by cutting everything above the lowest ceiling
  const b0 = toBlender(zone.bounds.min), b1 = toBlender(zone.bounds.max);
  const base = Math.abs(b1[0] - b0[0]) >= Math.abs(b1[1] - b0[1]) ? 0 : 90;           // look across the long axis, so it runs along the tile
  const args = [`--angles=${base}:90;${base}:42;${base + 180}:42;${base + 35}:48`, '--fit', `--bounds=${v3(b0)},${v3(b1)}`, '--cols', '2', '--size', '640', '--aspect', '1.5'];
  if (zone.kind === 'interior') {
    const ceil = L.solids.filter((s) => s.zone === zone.id && s.role === 'ceiling').map((s) => s.pos[1] - s.size[1] / 2);
    if (ceil.length) args.push('--cut-above', String(Math.min(...ceil) - 0.05));
  }
  preview(path.join(dir, `${stem}_sheet.png`), args);
  const marks = L.markers.filter((m) => m.zone === zone.id && (m.type === 'vista' || m.type === 'checkpoint'));
  if (marks.length) {
    const shots = marks.slice(0, 8).map((m) => {
      const eye = [m.pos[0], m.pos[1] + 1.65, m.pos[2]];
      const yaw = ((m.rotY ?? 0) * Math.PI) / 180;
      const tgt = m.params?.target ?? [eye[0] - Math.sin(yaw) * 10, eye[1] - 0.5, eye[2] - Math.cos(yaw) * 10];
      return `${v3(toBlender(eye))}>${v3(toBlender(tgt))}`;
    });
    if (shots.length % 2 === 1 && shots.length > 1) {                    // an odd count would leave an empty tile: add an overview
      const c = [0, 1, 2].map((k) => (zone.bounds.min[k] + zone.bounds.max[k]) / 2), top = zone.bounds.max[1];
      const span = Math.max(zone.bounds.max[0] - zone.bounds.min[0], zone.bounds.max[2] - zone.bounds.min[2]);
      shots.push(`${v3(toBlender([c[0] + span * 0.35, top + span * 0.3, c[2] + span * 0.35]))}>${v3(toBlender(c))}`);
    }
    preview(path.join(dir, `${stem}_views.png`), ['--size', '360', '--aspect', '1.7778', '--cols', shots.length === 1 ? '1' : '2', `--shots=${shots.join(';')}`], []);
  }
  for (const lm of [...(a.lightmaps ?? []), ...(a.lightLayers ?? [])]) {
    const t = M.textures[lm];
    if (t && fs.existsSync(t._raw)) {
      const out = path.join(dir, `${stem}_lightmap${lm === a.lightmaps?.[0] ? '' : '_' + lm}.png`);
      await sharp(t._raw).resize(1024, 1024, { fit: 'inside', kernel: 'nearest' }).png().toFile(out);
      made.push(out); console.log(`LIGHTMAP ${lm} -> ${rel(out)}`);
    }
  }
} else preview(path.join(dir, `${stem}_sheet.png`), a.chunks ? DOLLHOUSE : []);

if (clipArg) {
  const clips = clipArg === 'all' ? (a.animations ?? []).map((c) => c.name) : [clipArg];
  for (const c of clips) preview(path.join(dir, `${stem}__${c}.png`), ['--clip', c, '--cols', '5', '--size', '384']);
}
if (CYCLES) {
  preview(path.join(dir, `${stem}_cycles.png`), a.chunks
    ? ['--engine', 'CYCLES', '--views', '4', '--cols', '2', '--size', '640', '--samples', '16', '--baked', ...DOLLHOUSE]
    : ['--engine', 'CYCLES', '--views', '4', '--cols', '2', '--size', '640', '--samples', '48', ...(zone ? ['--sun', 'layout'] : [])]);
}

if (GAME) {
  const harness = path.join(ROOT, 'tests/harness.mjs');
  if (!fs.existsSync(harness)) { console.error('--game needs tests/harness.mjs and sandbox/viewer.html (foundation-core)'); process.exit(1); }
  const { startServer, openGame } = await import(harness);
  const server = await startServer();
  let game = null;
  try {
    const zoneShot = !!(zone && ZONE && !a._fixture);
    const query = zoneShot ? { zone: zone.id } : { asset: id, shot: 1, ...GAME_Q };
    if (M._overlay) query.overlay = rel(M._overlay);                     // assets of an overlay manifest (fixtures) through the same viewer
    game = await openGame(server, { page: 'sandbox/viewer', piece, query, start: false, allowErrors: true });
    await game.step(2, true);
    if (zoneShot) {
      // The viewer's zone panel is written by its rAF loop, which does not run under ?test=1: its `frame` line would
      // read "0 calls ... 0 tris". Measure through the debug hook (four drawn ticks, per-field maxima) and burn THAT in.
      const perf = await game.dbg('perfRun', 4);
      if (!(perf.drawCalls > 0 && perf.triangles > 0)) throw new Error(`the zone frame measured ${perf.drawCalls} draw calls and ${perf.triangles} triangles: nothing was drawn`);
      const z = M.zones[zone.id];
      await game.page.evaluate((line) => {
        const el = document.getElementById('panel'); if (!el) return;
        const lines = (el.textContent ?? '').split('\n'); const i = lines.findIndex((l) => l.startsWith('frame'));
        if (i >= 0) lines[i] = line; else lines.push(line);
        el.textContent = lines.join('\n');
      }, `frame      ${perf.drawCalls} calls / ${z.drawCalls.typical}-${z.drawCalls.worst}   ${perf.triangles} tris / ${z.triangles}   (measured: __dbg.perfRun)`);
    }
    const info = await game.page.evaluate(() => document.getElementById('panel')?.textContent ?? '');
    const file = await game.shot(`${stem}_game`);
    made.push(file);
    console.log(`GAME ${rel(file)}\n  ${info.split('\n').slice(0, 5).join('\n  ')}`);
  } finally {
    if (game) await game.close().catch((e) => console.error(String(e.message ?? e)));
    await server.close();
  }
}
console.log(made.map((f) => rel(f)).join('\n'));
