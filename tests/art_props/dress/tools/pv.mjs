// Evidence tool of art-props-dress (not a test): previews of ONE VARIANT of an asset, which tools/preview-asset.mjs cannot
// do (it shows every variant node on top of the others).
//
//   node tests/art_props/dress/tools/pv.mjs <id> [--v <variant node>] [--sheet] [--cycles] [--game] [--name <stem>]
//        [--dist 0.4 --yaw 35 --pitch 20]   the viewer's camera for --game
//        [--angles "0:10;60:25"] [--zoom 1.5] [--bounds=x0,y0,z0,x1,y1,z1] [--views 4] [--size 640]   the Blender sheets
//
// Writes shots/art-props-dress/<stem>_sheet.png | _cycles.png | _game.png; stem = <id> or <id>-<variant>.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, rel, loadManifest } from '../../../../tools/pipeline-lib.mjs';
import { variantNames } from '../../../../tools/check-glb.mjs';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const value = (n) => {
  const j = argv.findIndex((x) => x.startsWith(n + '='));
  if (j >= 0) return argv.splice(j, 1)[0].slice(n.length + 1);
  const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v;
};
const SHEET = flag('--sheet'), CYCLES = flag('--cycles'), GAME = flag('--game');
const variant = value('--v'), nameArg = value('--name'), piece = value('--piece') ?? 'art-props-dress';
const frame = [];
for (const k of ['--zoom', '--angles', '--bounds', '--elev']) { const v = value(k); if (v !== null) frame.push(`${k}=${v}`); }
const views = value('--views'), size = value('--size'), cols = value('--cols');
const q = {};
for (const k of ['dist', 'yaw', 'pitch', 'mood', 'ground']) { const v = value('--' + k); if (v !== null) q[k] = v; }
const id = argv[0];
const M = loadManifest(null), a = M.assets[id];
if (!a) { console.error(`unknown asset '${id}'`); process.exit(2); }
const variants = variantNames(a);
if (variant && !variants.includes(variant)) { console.error(`${id} has no variant '${variant}' (${variants.join(', ')})`); process.exit(2); }
const hide = variant ? variants.filter((v) => v !== variant) : [];
const stem = nameArg ?? (variant ? `${id}-${variant}` : id);
const dir = path.join(ROOT, 'shots', piece);
fs.mkdirSync(dir, { recursive: true });

function blender(out, args) {
  const r = spawnSync(path.join(ROOT, 'tools/blender.sh'), ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(ROOT, 'blender/tools/preview.py'), '--',
    a._raw, out, ...args, ...(hide.length ? ['--hide', hide.join(',')] : []), ...frame], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.error((r.stdout ?? '').split('\n').slice(-12).join('\n') + (r.stderr ?? '')); process.exit(1); }
  console.log(rel(out));
}
if (SHEET) blender(path.join(dir, `${stem}_sheet.png`), [...(views ? ['--views', views] : []), ...(cols ? ['--cols', cols] : []), ...(size ? ['--size', size] : [])]);
if (CYCLES) blender(path.join(dir, `${stem}_cycles.png`), ['--engine', 'CYCLES', '--views', views ?? '4', '--cols', cols ?? '2', '--size', size ?? '640', '--samples', '48']);
if (GAME) {
  const { startServer, openGame } = await import(path.join(ROOT, 'tests/harness.mjs'));
  const server = await startServer();
  let game = null;
  try {
    game = await openGame(server, { page: 'sandbox/viewer', piece, query: { asset: id, shot: 1, ...q }, start: false, allowErrors: true });
    if (hide.length) {
      await game.page.evaluate((names) => {
        const ctx = window.__dbg.ext.core.ctx();
        ctx.scene.scene.traverse((o) => { if (names.includes(o.name)) o.visible = false; });
      }, hide);
    }
    await game.step(2, true);
    console.log(rel(await game.shot(`${stem}_game`)));
  } finally {
    if (game) await game.close().catch((e) => console.error(String(e.message ?? e)));
    await server.close();
  }
}
