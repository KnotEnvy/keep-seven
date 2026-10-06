// evidence.mjs (not a test): every evidence image of docs/workorders/art-env-exterior.md section 5 into shots/art-env-exterior/.
//   node tests/art_env_exterior/evidence.mjs [sheets] [cycles] [silhouettes] [lightmaps] [viewer]     (no argument: all of them)
//   sheets       <id>_sheet.png, <id>_cycles.png, <id>_game.png for the six assets (tools/preview-asset.mjs; zones also _views / _lightmap)
//   cycles       <view>_cycles.png: eye-level Cycles previews of every view of views.mjs, lit by the real bake light, fogged as the mood table says
//   silhouettes  sil_overhang_mouth.png, sil_street_skyline.png: black on white
//   lightmaps    lm_surface.png, lm_rim.png (the baked atlases, 1024 px)
//   viewer       <view>_viewer.png: the baked result through the real loader (the same frames viewer.test.mjs writes)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT } from '../harness.mjs';
import { VIEWS, viewerFrames, PIECE } from './views.mjs';

const OUT = path.join(ROOT, 'shots', PIECE);
const want = process.argv.slice(2);
const on = (k) => !want.length || want.includes(k);
const IDS = ['env_the_lip', 'env_plenty_street', 'env_far_rim', 'rim_town_card', 'env_backdrop_day', 'env_backdrop_dusk'];
const ZONED = new Set(['env_the_lip', 'env_plenty_street', 'env_far_rim']);
const run = (cmd, args, env = {}, tries = 4) => {
  let r;
  for (let k = 0; k < tries; k++) {                        // a page load can time out on the loaded machine: try again
    r = runOnce(cmd, args, env);
    if (r.status === 0) return;
    if (!/Timeout/.test(r.stdout + r.stderr)) break;
  }
  console.log((r.stdout + r.stderr).split('\n').slice(-25).join('\n')); throw new Error(`${cmd} ${args.join(' ')} -> ${r.status}`);
};
const runOnce = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 28 });
  const tail = (r.stdout + r.stderr).split('\n').filter((l) => /VIEW|wrote|error|Error|Traceback|shots\//.test(l)).slice(-30).join('\n');
  if (tail) console.log(tail);
  return r;
};
const spec = (v) => `${v.eye.map((x) => (+x).toFixed(3)).join(',')}>${v.at.map((x) => (+x).toFixed(3)).join(',')}`;
const blenderViews = (views, scene, extra = [], suffix = '_cycles', names = null) => run(path.join(ROOT, 'tools/blender.sh'),
  ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(ROOT, 'blender/env_exterior/render_views.py'), '--', '--out', OUT,
    `--names=${(names ?? views.map((v) => v.name + suffix)).join(',')}`, `--shots=${views.map(spec).join(';')}`, '--scene', scene, ...extra], { KS_EXT_FAST: process.env.KS_EXT_FAST ?? '0' });

fs.mkdirSync(OUT, { recursive: true });
if (on('sheets')) for (const id of IDS) run('node', ['tools/preview-asset.mjs', id, '--cycles', '--game', ...(ZONED.has(id) ? ['--zone'] : []), '--piece', PIECE]);
if (on('cycles')) {
  blenderViews(VIEWS.filter((v) => v.zone !== 'far_rim'), 'surface', ['--samples', '96']);
  blenderViews(VIEWS.filter((v) => v.zone === 'far_rim'), 'rim', ['--samples', '96']);
}
if (on('silhouettes')) {
  const pick = (n) => VIEWS.find((v) => v.name === n);
  // --silhouette N: black = what stands within N metres along the view axis (the mouth's frame, not the gully beyond it)
  blenderViews([pick('lip_doorway')], 'surface', ['--samples', '8', '--silhouette', '7.9', '--fog', '0'], '', ['sil_overhang_mouth']);
  blenderViews([pick('st_x20')], 'surface', ['--samples', '8', '--silhouette', '100000', '--fog', '0'], '', ['sil_street_skyline']);
  blenderViews([pick('rim_arrival')], 'rim', ['--samples', '8', '--silhouette', '5.4', '--fog', '0'], '', ['sil_rim_frame']);
}
if (on('lightmaps')) for (const id of ['lm_surface', 'lm_rim']) {
  await sharp(path.join(ROOT, 'blender/export/lm', id + '.png')).resize(1024, 1024, { kernel: 'lanczos3' }).png().toFile(path.join(OUT, id + '.png'));
  console.log(`shots/${PIECE}/${id}.png`);
}
if (on('viewer')) for (const f of await viewerFrames(VIEWS)) console.log(path.relative(ROOT, f));
