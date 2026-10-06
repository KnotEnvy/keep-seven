// Evidence frames of the interior zones (work order art-env-interior 5): `node tests/art_env_interior/evidence.mjs [zone ...]`
//
// Eye-level Cycles frames of the BAKED look (blender/env_interior/interior_shots.py: every surface emits what the
// runtime draws from the raw export: COLOR_0 x shared texture x 2 x lightmap x 2, plus the light layers the viewer's
// fallback material cannot show yet), written to shots/art-env-interior/cycles_<zone>_<view>.png at 960 x 540; the six
// lightmap / layer images as lm_<id>.png; and the squint test of ART_BIBLE 2.3 / 12.1 on the hero frames (value.mjs).
// The viewer frames of the same views are written by viewer.test.mjs (viewer_<zone>_<view>.png).
// Not a test (it only renders): the node test runner skips it (no *.test.mjs).
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT } from '../../tools/pipeline-lib.mjs';
import { squint } from './value.mjs';

const OUT = path.join(ROOT, 'shots', 'art-env-interior');
const EYE = 1.65;
const up = (p) => [p[0], p[1] + EYE, p[2]];
// [name, feet (game), look-at (game), extra interior_shots arguments]
const GROUPS = {
  env_tally_house: [
    { args: [], views: [
      ['enter_north', [-89, 0, -16.4], [-89, 1.4, -30]],
      ['daylight_stand', [-86, 0, -23.5], [-95.9, 3.6, -30.5]],
      ['knot_stand', [-91.9, 0, -35.5], [-92.6, 0.9, -34.35]],
      ['tally_wall', [-88.7, 0, -19.5], [-86.5, 1.4, -15]],
      ['hearth', [-88.5, 0, -22], [-82.5, 1.2, -18.3]],
      ['front_doors', [-91, 0, -28], [-82, 1.3, -28]],
    ] },
    { tag: '_exp1', args: ['--stops', '1'], views: [['enter_north', [-89, 0, -16.4], [-89, 1.4, -30]], ['hearth_to_nw', [-84.6, 0, -19.6], [-93, 1.0, -33]]] },
    { tag: '_hatch1', args: ['--stops', '1', '--layer', '1', '--layer-tint', 'aqua', '--on', 'strip_hatch'], views: [['hearth_to_nw', [-84.6, 0, -19.6], [-93, 1.0, -33]], ['hatch_close', [-89.5, 0, -29.5], [-92, 0.3, -33.5]]] },
  ],
  env_the_gallery: [
    { args: [], views: [
      ['landing1_up', [-86, -4, -33], [-91.5, -0.4, -33]],
      ['landing2_pegs', [-86, -8, -25], [-86.95, -7.2, -28.6]],
      ['stair_down', [-86, -4, -31.5], [-86, -8, -25]],
      ['mark_eye', [-82.2, -11.85, -15], [-60.2, -7.8, -12.9]],
      ['bay', [-86, -12, -16.8], [-87, -10.8, -11]],
      ['bay_plate', [-88, -12, -12], [-83.3, -10.4, -17.95]],
      ['baffle_east', [-57.5, -12, -14], [-20, -10.5, -14]],
      ['rack', [-45, -12, -13.2], [-41, -10.6, -17]],
    ] },
    { tag: '_fog', args: ['--fog', '#0F1C33,0.023'], views: [['baffle_east', [-57.5, -12, -14], [-20, -10.5, -14]], ['mark_eye', [-82.2, -11.85, -15], [-60.2, -7.8, -12.9]]] },
  ],
  env_lift_hall: [
    { args: [], views: [
      ['vista_tamper', [-17, -12, -14], [-6, -13.6, -25.3]],
      ['floor_east', [-12, -15, -14], [20, -12, -14]],
      ['ring', [10, -15, -14], [20.5, -12.5, -14]],
      ['cold_bay', [6, -15, 1.6], [8, -13.6, 5]],
      ['slot_from_rib', [3, -15, -7.6], [3, -13.4, 1.12]],
      ['diagram', [12, -15, -23.5], [20, -12.5, -21.5]],
      ['vault', [0, -15, -14], [3, -3, -16]],
      ['gantry', [-6, -15, -6], [-16, -11.5, -13]],
    ] },
    { tag: '_fog', args: ['--fog', '#0E1A2E,0.026'], views: [['floor_east', [-12, -15, -14], [20, -12, -14]], ['vista_tamper', [-17, -12, -14], [-6, -13.6, -25.3]]] },
  ],
  env_the_bore: [
    { tag: '_violet', args: ['--layer', '1', '--layer-tint', '#8A3CCC'], views: [
      ['vista_windlass', [14, -36, 83], [14, -40, 94]],
      ['mark1_bore', [14, -44, 91.1], [14, -45.5, 96]],
      ['mark4_bore', [14, -44, 100.9], [14, -45.5, 96]],
      ['chamber', [24, -44, 92], [5, -38, 101]],
      ['vault', [18, -44, 90], [12, -30, 98]],
      ['door_bay', [14, -44, 86], [14, -42.5, 80]],
    ] },
    { tag: '_aqua', args: ['--layer', '0.9', '--layer-tint', 'aqua', '--fade', '1', '--on', 'mark_glows'], views: [
      ['chamber', [24, -44, 92], [5, -38, 101]], ['mark1_bore', [14, -44, 91.1], [14, -45.5, 96]], ['vista_windlass', [14, -36, 83], [14, -40, 94]]] },
    { tag: '_fill', args: [], views: [
      ['chamber', [24, -44, 92], [5, -38, 101]],
      ['ante_door_wall', [14, -44, 72.5], [14, -42.5, 80]],
      ['ante_camp', [14, -44, 78], [11.5, -43.8, 70]],
      ['stair', [27, -36, 82.5], [27, -40, 75]],
    ] },
  ],
  env_lift_shaft: [
    { args: ['--on', 'lamp_bar_1,lamp_bar_2,lamp_bar_3,lamp_bar_4,lamp_bar_5,lamp_bar_6'], views: [['ride_south', [0, 0, 0], [0.5, 3.2, 3.2]], ['ride_up', [0, 0, 0], [0.3, 12, 0.6]], ['ride_north', [0.5, 0, 1], [-1, 2.5, -3.2]]] },
  ],
};
const HERO = {   // the squint test's frame per zone and the art bible's light : mid : dark
  env_tally_house: ['cycles_tally_house_enter_north_exp1.png', '8 : 22 : 70'],
  env_the_gallery: ['cycles_the_gallery_baffle_east_fog.png', '10 : 30 : 60'],
  env_lift_hall: ['cycles_lift_hall_floor_east_fog.png', '8 : 27 : 65'],
  env_the_bore: ['cycles_the_bore_chamber_violet.png', '12 : 28 : 60'],
};
const LIGHTMAPS = ['lm_tally', 'lm_tally_hatch', 'lm_gallery', 'lm_hall', 'lm_bore', 'lm_bore_glow'];

const want = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
for (const [asset, groups] of Object.entries(GROUPS)) {
  if (want.length && !want.some((w) => asset.includes(w))) continue;
  const zone = asset.replace(/^env_/, '');
  for (const g of groups) {
    const tmp = path.join(ROOT, 'scratch', 'art-env-interior', 'evidence', zone + (g.tag ?? ''));
    fs.mkdirSync(tmp, { recursive: true });
    const shots = g.views.map(([n, feet, to]) => `${n}=${up(feet).join(',')}>${to.join(',')}`).join(';');
    const r = spawnSync(path.join(ROOT, 'tools', 'blender.sh'), ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(ROOT, 'blender', 'env_interior', 'interior_shots.py'), '--', asset, tmp, '--shots', shots, ...g.args],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) { console.error(r.stdout.split('\n').filter((l) => /Error|Traceback|File /.test(l)).join('\n')); process.exit(1); }
    for (const [n] of g.views) {
      const dst = path.join(OUT, `cycles_${zone}_${n}${g.tag ?? ''}.png`);
      fs.copyFileSync(path.join(tmp, n + '.png'), dst);
      console.log(path.relative(ROOT, dst));
    }
  }
}
if (!want.length || want.includes('lm')) {
  for (const id of LIGHTMAPS) {
    const src = path.join(ROOT, 'public', 'assets', 'lm', id + '.webp'), dst = path.join(OUT, id + '.png');
    await sharp(src).resize(960, 960, { fit: 'inside' }).png().toFile(dst);
    console.log(path.relative(ROOT, dst), `${(fs.statSync(src).size / 1024).toFixed(0)} kB shipped`);
  }
}
console.log('\nsquint test (ART_BIBLE 2.3): the frame blurred to 32 x 18, L* bands dark < 22 <= mid < 45 <= light, and 3-means clusters');
for (const [asset, [file, target]] of Object.entries(HERO)) {
  const f = path.join(OUT, file);
  if (fs.existsSync(f)) console.log(`${asset.padEnd(16)} target ${target.padEnd(12)} ${await squint(f)}`);
}
