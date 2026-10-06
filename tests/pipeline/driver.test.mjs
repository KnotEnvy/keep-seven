// The build driver (tools/build-assets.mjs) on a throwaway asset with a helper module and a by-product lightmap:
//   * a build that FAILS check-glb ships nothing: raw export, shipped GLB, raw and shipped lightmap all keep their bytes;
//   * a helper module imported by the asset script is an input: editing it rebuilds the asset;
//   * the by-product lightmap is reported with its asset (built / kept), after it;
//   * texture tables are hashed by the ENTRIES an asset read: appending a cell or reformatting the file changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, node } from './common.mjs';
import { tableEntriesHash, glbIsPlaceholder, pngIsPlaceholder } from '../../tools/pipeline-lib.mjs';

// everything lives in an ignored folder of the tree (the manifest's paths are repo-relative)
const REL = `tests/pipeline/fixtures/export/_driver_${process.pid}`;
const DIR = path.join(ROOT, REL);
const OVERLAY = path.join(DIR, 'manifest.json');
const RAW = path.join(DIR, 'raw/fixtures/drv_post.glb'), PUB = path.join(DIR, 'public/assets/fixtures/drv_post.glb');
const RAW_LM = path.join(DIR, 'raw/lm/lm_drv_post.png'), PUB_LM = path.join(DIR, 'public/assets/lm/lm_drv_post.webp');
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const shas = () => [RAW, PUB, RAW_LM, PUB_LM].map(sha);
const build = (...extra) => node(['tools/build-assets.mjs', '--manifest', OVERLAY, '--only', 'drv_post', ...extra]);
const common = (h, rod, light) => fs.writeFileSync(path.join(DIR, 'src/drv_common.py'), `POST_H = ${h}\nROD = ${rod ? 'True' : 'False'}\nLIGHT = ${light}\n`);
function strays() {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '.stamp' && e.name !== '.logs') walk(p); } else if (e.name.startsWith('.') || e.name.includes('.tmp')) out.push(path.relative(DIR, p)); } };
  walk(path.join(DIR, 'raw')); walk(path.join(DIR, 'public'));
  return out;
}

test.before(() => {
  fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'src/drv_post.py'), `
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")): _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender"))
import drv_common                                   # a helper module beside the script
from lib import scene, mesh, uv, material, vcol, bake, export

def main():
    args = scene.asset_args("drv_post.py"); scene.reset_scene()
    parts = [mesh.box("post", (0.2, 0.2, drv_common.POST_H), (0, 0, drv_common.POST_H / 2))]
    if drv_common.ROD: parts.append(mesh.box("rod", (0.02, 0.02, 1.0), (0.5, 0, 0.5)))      # a thin part: check-glb fails it
    post = mesh.join(parts, "drv_post_mesh")
    material.assign(post, "m_prop"); uv.map_to_palette(post, "steel"); vcol.tint(post, "steel"); vcol.compose_vertex_color(post, mode="ratio", jitter=0.0)
    bake.save_lightmap(bake.new_image("lm", 64, 64, (drv_common.LIGHT, drv_common.LIGHT, drv_common.LIGHT, 1.0)), "lm_drv_post")
    export.export_asset("drv_post", args.out)

scene.run(main)
`);
  // a "late" bake script (the shape of blender/env_exterior/bake_surface.py -> lm_surface): no asset, only a lightmap,
  // built from a helper module that zone scripts would share
  fs.writeFileSync(path.join(DIR, 'src/drv_bake_common.py'), 'LEVEL = 0.5\n');
  fs.writeFileSync(path.join(DIR, 'src/drv_bake.py'), `
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender"))
import drv_bake_common
from lib import scene, bake

def main():
    scene.reset_scene()
    v = drv_bake_common.LEVEL
    bake.save_lightmap(bake.new_image("lm", 64, 64, (v, v, v, 1.0)), "lm_drv_late")

scene.run(main)
`);
  fs.writeFileSync(OVERLAY, JSON.stringify({
    meta: { rawExportDir: `${REL}/raw`, publicDir: `${REL}/public` },
    assets: { drv_post: { path: 'assets/fixtures/drv_post.glb', source: `${REL}/src/drv_post.py`, owner: 'fixtures', category: 'fixtures', priority: 0, triBudget: 60, drawCalls: 1,
      materials: ['m_prop'], bake: 'AO', skinned: false, nodes: [], animations: [], collision: 'none', instanced: false, lightmapped: false, zone: null, sets: [], placedBy: 'code',
      pivot: 'base centre', placeholder: { shape: 'box', size: [0.2, 1.3, 0.2], anchor: 'base' } } },
    textures: { lm_drv_late: { path: 'assets/lm/lm_drv_late.webp', source: `${REL}/src/drv_bake.py`, owner: 'fixtures', kind: 'lightmap', size: [64, 64], format: 'rgba8', colorSpace: 'srgb',
      mips: false, wrap: 'clamp', sets: [], gpuBytes: 16384, lightmapScale: 2, uv: 1, neutralTexel: { px: [0, 0, 4, 4], uv: [0.03125, 0.03125], value: 1 } },
      lm_drv_post: { path: 'assets/lm/lm_drv_post.webp', source: `${REL}/src/drv_post.py`, owner: 'fixtures', kind: 'lightmap', size: [64, 64], format: 'rgba8', colorSpace: 'srgb',
      mips: false, wrap: 'clamp', sets: [], gpuBytes: 16384, lightmapScale: 2, uv: 1, neutralTexel: { px: [0, 0, 4, 4], uv: [0.03125, 0.03125], value: 1 } } },
  }));
});
test.after(() => { if (!process.env.KS_KEEP) fs.rmSync(DIR, { recursive: true, force: true }); });

test('driver: a passing build ships the asset with its lightmap and records what it depends on', () => {
  common(1.3, false, 0.6);
  const r = build();
  assert.equal(r.code, 0, r.out);
  const lines = r.out.trim().split('\n');
  assert.match(lines[0], /^built\s+drv_post .*tris 12\/60 dc 1\/1/);
  assert.match(lines[1], /^built\s+lm_drv_post .*by-product of/, 'the lightmap is reported as built, after its asset');
  for (const f of [RAW, PUB, RAW_LM, PUB_LM]) assert.ok(fs.existsSync(f), `${path.relative(DIR, f)} exists`);
  const deps = JSON.parse(fs.readFileSync(RAW + '.deps.json', 'utf8'));
  assert.deepEqual(deps.modules, [`${REL}/src/drv_common.py`], 'the helper module is recorded');
  assert.deepEqual(deps.tables, { palette: ['steel'] }, 'the palette cell it read is recorded');
  assert.deepEqual(strays(), [], 'no temporary file is left');
  const again = build();
  assert.match(again.out, /^skipped\s+drv_post/m); assert.match(again.out, /^skipped\s+lm_drv_post/m); assert.match(again.out, /2 skipped/);
});

test('driver: editing a helper module the script imports rebuilds the asset', () => {
  const before = sha(RAW);
  common(1.1, false, 0.6);
  const r = build();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^built\s+drv_post/m, 'the asset is stale when its helper changes');
  assert.notEqual(sha(RAW), before, 'the post is shorter now');
});

test('driver: a build that fails check-glb ships nothing and says so', () => {
  const before = shas();
  common(1.1, true, 0.9);                                  // a thin rod (fails) and a brighter lightmap
  const r = build();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^FAILED\s+drv_post: check-glb:\n\s+- mesh 'drv_post_mesh': 1 thin part/m);
  assert.match(r.out, /nothing was shipped: the previous raw export and shipped file are unchanged/);
  assert.match(r.out, /^kept\s+lm_drv_post .*drv_post FAILED: the shipped lightmap is unchanged/m);
  assert.deepEqual(shas(), before, 'raw GLB, shipped GLB, raw lightmap and shipped lightmap keep their bytes');
  assert.deepEqual(strays(), [], 'no temporary file is left');
  assert.equal(build().code, 1, 'it stays failed until it is fixed (no stamp was written)');
  // fixed: GLB and lightmap change together
  common(1.1, false, 0.9);
  const ok = build();
  assert.equal(ok.code, 0, ok.out);
  const after = shas();
  assert.equal(after[0], before[0], 'the same post as before the failure');
  assert.notEqual(after[2], before[2], 'the new lightmap arrived with the passing build');
  assert.notEqual(after[3], before[3]);
});

test('driver: a script that dies in Blender ships nothing either', () => {
  const before = shas();
  common('1.1 +', false, 0.2);                             // a syntax error in the helper
  const r = build();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^FAILED\s+drv_post: .*SyntaxError/m);
  assert.deepEqual(shas(), before); assert.deepEqual(strays(), []);
  common(1.1, false, 0.9);
  assert.match(build().out, /^skipped\s+drv_post/m, 'back to the built state: nothing to do');
});

test('driver: a lightmap with a bake script of its own is re-baked when the helper module it shares changes', () => {
  const RAW_LATE = path.join(DIR, 'raw/lm/lm_drv_late.png');
  const late = (...extra) => node(['tools/build-assets.mjs', '--manifest', OVERLAY, '--only', 'lm_drv_late', ...extra]);
  const a = late();
  assert.equal(a.code, 0, a.out); assert.match(a.out, /^built\s+lm_drv_late/m);
  const deps = JSON.parse(fs.readFileSync(RAW_LATE + '.deps.json', 'utf8'));
  assert.deepEqual(deps.modules, [`${REL}/src/drv_bake_common.py`], 'bake.save_lightmap recorded the helper module');
  assert.match(late().out, /^skipped\s+lm_drv_late/m, 'nothing changed: skipped');
  const before = sha(RAW_LATE);
  fs.writeFileSync(path.join(DIR, 'src/drv_bake_common.py'), 'LEVEL = 0.8\n');
  const b = late();
  assert.equal(b.code, 0, b.out); assert.match(b.out, /^built\s+lm_drv_late/m, 'stale when the shared helper changes');
  assert.notEqual(sha(RAW_LATE), before);
  assert.deepEqual(strays(), [], 'no temporary file is left');
  assert.ok(!fs.existsSync(RAW + '.png.deps.json') && !fs.existsSync(RAW_LM + '.deps.json'), 'a by-product lightmap writes no deps of its own (its asset has them)');
});

test('driver: --reset is the way back from a scripted asset to its placeholder', () => {
  const script = path.join(DIR, 'src/drv_post.py'), away = script + '.removed';
  // while the script exists there is nothing to reset: refused, nothing touched
  const before = shas();
  const refused = node(['tools/build-assets.mjs', '--manifest', OVERLAY, '--reset', 'drv_post']);
  assert.equal(refused.code, 2, refused.out);
  assert.match(refused.out, /--reset drv_post: its source script .*drv_post\.py exists/);
  assert.deepEqual(shas(), before, 'a refused reset removes nothing');
  // the artist removes the script: --placeholders alone keeps the final file and says how to go back
  fs.renameSync(script, away);
  try {
    const kept = build('--placeholders');
    assert.equal(kept.code, 0, kept.out);
    assert.match(kept.out, /^kept\s+drv_post .*final file, no source script.*--reset drv_post/m);
    assert.equal(sha(RAW), before[0], 'the final file is still there');
    const r = node(['tools/build-assets.mjs', '--manifest', OVERLAY, '--reset', 'drv_post']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^reset\s+drv_post: removed .*raw\/fixtures\/drv_post\.glb.*public\/assets\/fixtures\/drv_post\.glb/m);
    assert.match(r.out, /^reset\s+lm_drv_post: removed /m, 'the lightmap that script wrote goes with it');
    assert.match(r.out, /^built\s+drv_post .*placeholder/m); assert.match(r.out, /^built\s+lm_drv_post /m);
    assert.ok(glbIsPlaceholder(RAW, 'drv_post') && pngIsPlaceholder(RAW_LM), 'raw GLB and raw lightmap are placeholders again');
    assert.notEqual(sha(PUB), before[1], 'the shipped file is the placeholder');
    assert.deepEqual(strays(), []);
  } finally { fs.renameSync(away, script); }
  // the script is back: an ordinary build replaces the placeholder with the scripted asset again
  const back = build();
  assert.equal(back.code, 0, back.out);
  assert.match(back.out, /^built\s+drv_post/m);
  assert.equal(sha(RAW), before[0], 'the same bytes as before the reset');
});

test('texture tables are hashed by the entries an asset read, not by the file bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks_tab_'));
  try {
    const tab = { size: 256, cell: 16, cells: { steel: { col: 1, row: 2, hex: '#36525A' }, sand: { col: 0, row: 0, hex: '#CDA070' } } };
    const write = (t, indent) => fs.writeFileSync(path.join(dir, 'palette.json'), JSON.stringify(t, null, indent) + '\n');
    write(tab, 1);
    const used = { palette: ['steel'] };
    const h = tableEntriesHash(dir, used), whole = tableEntriesHash(dir, { palette: ['*'] });
    write({ cells: { ...tab.cells, new_cell: { col: 5, row: 5, hex: '#000000' } }, cell: 16, size: 256 }, 4);     // appended, reordered, re-indented
    assert.equal(tableEntriesHash(dir, used), h, 'an appended cell does not make a user of `steel` stale');
    assert.notEqual(tableEntriesHash(dir, { palette: ['*'] }), whole, 'a reader of the whole table is stale');
    write({ ...tab, cells: { ...tab.cells, sand: { col: 0, row: 0, hex: '#FFFFFF' } } }, 1);
    assert.equal(tableEntriesHash(dir, used), h, 'a change to a cell it never read does not count');
    write({ ...tab, cells: { ...tab.cells, steel: { col: 1, row: 2, hex: '#37525A' } } }, 1);
    assert.notEqual(tableEntriesHash(dir, used), h, 'a change to the cell it read does');
    write({ ...tab, cell: 8 }, 1);
    assert.notEqual(tableEntriesHash(dir, used), h, 'the table header (cell size) counts for everyone');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
