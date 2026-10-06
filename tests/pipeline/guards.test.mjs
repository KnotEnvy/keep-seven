// What a build must REFUSE, each as a one-line mutation of a script that builds (critic round 3):
//   * the fixture room (a mixed LM + VL chunk) without its vertex bake, and with the bake on some objects only;
//   * a standalone LM + VL prop whose vertex bake is restricted to too few faces, and one with an object left out of
//     uv.unwrap_lightmap;
//   * a script that points its meshes at a lightmap and does not write it in the same run (--allow-stale-lightmap ships
//     it and says so);
// and what it must SAY: bake warnings are counted on the item's one-line result.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, FIX, node } from './common.mjs';
import { glbJson, pngIsPlaceholder } from '../../tools/pipeline-lib.mjs';

const REL = `tests/pipeline/fixtures/export/_guard_${process.pid}`;
const DIR = path.join(ROOT, REL);
const OVERLAY = path.join(DIR, 'manifest.json');
const sha = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : 'missing');
const build = (id, ...extra) => node(['tools/build-assets.mjs', '--manifest', OVERLAY, '--only', id, ...extra]);
const ROOM = { raw: path.join(DIR, 'raw/fixtures/fixture_room.glb'), pub: path.join(DIR, 'public/assets/fixtures/fixture_room.glb'),
  lm: path.join(DIR, 'raw/lm/lm_fixture_room.png'), lmPub: path.join(DIR, 'public/assets/lm/lm_fixture_room.webp') };
const roomShas = () => Object.values(ROOM).map(sha);
const ROOM_SRC = fs.readFileSync(path.join(FIX, 'fixture_room.py'), 'utf8');
const VL_CALL = /vcol\.bake_vertex_light\(lit \+ stool[^)\n]*\)/;

/** The fixture room with its vertex-light call replaced by `call` (a Python expression). */
function room(call) {
  assert.match(ROOM_SRC, VL_CALL, 'fixture_room.py still has the vertex-light call this test mutates');
  fs.writeFileSync(path.join(DIR, 'src/fixture_room.py'), ROOM_SRC.replace(VL_CALL, call));
}
/** The console: a plinth whose top is lightmapped, a body and the plinth's sides vertex-lit, one mesh. `mode` is the mutation. */
const console_ = (mode) => fs.writeFileSync(path.join(DIR, 'src/grd_common.py'), `MODE = ${JSON.stringify(mode)}\n`);

test.before(() => {
  fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
  const M = JSON.parse(fs.readFileSync(path.join(FIX, 'manifest.json'), 'utf8'));
  const lm = { ...M.textures.lm_fixture_room, path: 'assets/lm/lm_grd_console.webp', source: `${REL}/src/grd_console.py`, size: [64, 64], gpuBytes: 16384,
    neutralTexel: { px: [0, 0, 4, 4], uv: [0.03125, 0.03125], value: 1 } };
  for (const e of [M.assets.fixture_room, M.textures.lm_fixture_room, M.textures.lm_fixture_room_layer]) e.source = `${REL}/src/fixture_room.py`;
  fs.writeFileSync(OVERLAY, JSON.stringify({
    meta: { rawExportDir: `${REL}/raw`, publicDir: `${REL}/public` },
    assets: { fixture_stool: M.assets.fixture_stool, fixture_room: M.assets.fixture_room,
      grd_console: { path: 'assets/fixtures/grd_console.glb', source: `${REL}/src/grd_console.py`, owner: 'fixtures', category: 'fixtures', priority: 0, triBudget: 400, drawCalls: 1,
        materials: ['m_pellam'], bake: 'LM+VL', skinned: false, nodes: [], animations: [], collision: 'none', instanced: false, lightmapped: true, lightmaps: ['lm_grd_console'],
        zone: null, sets: [], placedBy: 'code', pivot: 'base centre', placeholder: { shape: 'box', size: [1.6, 0.9, 1.1], anchor: 'base' } } },
    textures: { lm_fixture_room: M.textures.lm_fixture_room, lm_fixture_room_layer: M.textures.lm_fixture_room_layer, lm_grd_console: lm },
    zones: M.zones,
  }));
  fs.writeFileSync(path.join(DIR, 'src/grd_console.py'), `
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender"))
import grd_common
from lib import scene, mesh, uv, material, vcol, bake, export

LM = "lm_grd_console"; MODE = grd_common.MODE

def part(name, size, centre, tint):
    ob = mesh.box(name, size, centre)
    material.assign(ob, "m_pellam"); uv.map_to_trim(ob, None, "tx_pellam_trim", "steel"); vcol.tint(ob, tint)
    mesh.tessellate_max_edge(ob, 0.4)
    vcol.compose_vertex_color(ob, mode='tint', jitter=0.0)
    return ob

def main():
    args = scene.asset_args("grd_console.py"); scene.reset_scene()
    plinth = part("plinth", (1.6, 1.1, 0.12), (0, 0, 0.06), "concrete"); body = part("body", (0.9, 0.5, 0.8), (0, 0.1, 0.52), "enamel")
    mesh.delete_faces(plinth, lambda f, c, n: n.z < -0.9)
    bake.use_cycles('CPU', samples=16); bake.set_world((1.0, 1.0, 1.0), 1.0)
    top = lambda p: p.normal.z > 0.9
    uv.unwrap_lightmap([plinth] if MODE == "not_unwrapped" else [plinth, body], LM, faces={"plinth": top, "body": []})
    if MODE == "not_unwrapped": uv.ensure_layers(body, lightmap=True)        # a UV1 layer that nobody filled
    img, _ = bake.bake_lightmap([plinth], LM, samples=16, denoise=False)
    if MODE != "no_lightmap_file": bake.save_lightmap(img, LM)
    lit = {"plinth": (lambda p: not top(p)), "body": None}
    if MODE == "faces_short": lit["body"] = lambda p: p.normal.y < -0.9      # only the front of the body: the rest is forgotten
    if MODE == "double": lit["plinth"] = None                                # the lightmapped top is vertex-lit as well
    if MODE == "unlit_object": vcol.bake_vertex_light([body], samples=16)    # the plinth's sides are forgotten
    else: vcol.bake_vertex_light([plinth, body], samples=16, faces=lit)
    ob = mesh.join([plinth, body], "grd_console_mesh")                       # the marks survive the join
    export.export_asset("grd_console", args.out)

scene.run(main)
`);
});
test.after(() => { if (!process.env.KS_KEEP) fs.rmSync(DIR, { recursive: true, force: true }); });

test('guard: the room builds; without its vertex bake (a mixed LM + VL chunk) it FAILS and ships nothing', () => {
  room('vcol.bake_vertex_light(lit + stool, samples=64)');
  const ok = build('fixture_stool,fixture_room');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /^built\s+fixture_room .*tris \d+\/4000 dc 2\/2/m);
  const extras = (glbJson(ROOM.raw).nodes ?? []).find((n) => n.name === 'chunk_fx_room__m_pellam')?.extras ?? {};
  assert.equal(extras.bake, 'LM'); assert.equal(extras.lightmap, 'lm_fixture_room');
  assert.ok(!JSON.stringify(glbJson(ROOM.raw)).includes('ks_vl'), 'the per-face mark is not exported');
  const before = roomShas();
  // forget the vertex bake altogether: every wall, the ceiling and the embedded stool would ship at tint x 2
  room('0.0');
  const r = build('fixture_room');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^FAILED\s+fixture_room: RuntimeError: merge_chunks\(fixture_room\): \d+ objects have vertex-lit faces that were never vertex-lit/m);
  assert.match(r.out, /COLOR_0 x 2/); assert.match(r.out, /vcol\.bake_vertex_light/);
  assert.match(r.out, /^\s+- ceiling: \d+ of \d+ faces \(e\.g\. at Blender \(/m, 'the objects are named, with a place to look');
  assert.match(r.out, /^\s+- emb_fixture_stool_\d+_\d+: /m, 'the embedded prop too');
  assert.doesNotMatch(r.out, /^\s+- floor\d/m, 'the lightmapped floor is not reported');
  assert.match(r.out, /nothing was shipped/);
  assert.deepEqual(roomShas(), before, 'raw GLB, shipped GLB and both lightmaps keep their bytes');
});

test('guard: lighting only some of the objects fails too, and names the others', () => {
  const before = roomShas();
  room('vcol.bake_vertex_light(stool, samples=64)');                     // the embedded prop is lit, the walls are forgotten
  const r = build('fixture_room');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^FAILED\s+fixture_room: RuntimeError: merge_chunks\(fixture_room\)/m);
  assert.match(r.out, /^\s+- wn0: /m); assert.match(r.out, /^\s+- ceiling: /m);
  assert.doesNotMatch(r.out, /^\s+- emb_fixture_stool/m, 'the lit prop is not reported');
  assert.deepEqual(roomShas(), before);
  room('vcol.bake_vertex_light(lit + stool, samples=64)');
  assert.equal(build('fixture_room').code, 0, 'the unmutated room builds again');
});

test('guard: a standalone LM + VL prop: a faces= restricted bake that misses faces, an unlit object, an object without lightmap UVs', () => {
  console_('ok');
  const ok = build('grd_console');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /^built\s+grd_console .*dc 1\/1$/m, 'the control builds, with no warning on its line');
  assert.match(ok.out, /^built\s+lm_grd_console .*by-product of/m);
  const RAW = path.join(DIR, 'raw/fixtures/grd_console.glb'), before = sha(RAW);
  for (const [mode, re] of [
    ['faces_short', /mesh 'grd_console_mesh' \(bake LM, lightmap lm_grd_console\): \d+ of the \d+ faces whose UV1 is on the neutral texel .* were never vertex-lit/],
    ['unlit_object', /mesh 'grd_console_mesh' \(bake LM, lightmap lm_grd_console\): \d+ of the \d+ faces whose UV1 is on the neutral texel .* were never vertex-lit/],
    ['not_unwrapped', /mesh 'grd_console_mesh' \(bake LM, lightmap lm_grd_console\): \d+ faces have no lightmap UV/],
  ]) {
    console_(mode);
    const r = build('grd_console');
    assert.equal(r.code, 1, `${mode}: ${r.out}`);
    assert.match(r.out, /^FAILED\s+grd_console: RuntimeError: grd_console does not match its manifest entry/m, mode);
    assert.match(r.out, re, mode);
    assert.equal(sha(RAW), before, `${mode}: nothing was shipped`);
  }
});

test('driver: bake warnings are counted on the one-line result and printed by --verbose', () => {
  console_('double');                                                     // the lightmapped top is vertex-lit as well: a WARNING, not an error
  const r = build('grd_console');
  assert.equal(r.code, 0, r.out);
  const line = r.out.split('\n').find((l) => l.startsWith('built    grd_console'));
  assert.match(line, /\(1 warning: see .*raw\/\.logs\/grd_console\.log\)$/, line);
  const log = fs.readFileSync(path.join(DIR, 'raw/.logs/grd_console.log'), 'utf8');
  assert.match(log, /^WARNING grd_console_mesh: \d+ lightmapped faces .* were ALSO vertex-lit/m);
  const v = build('grd_console', '--force', '--verbose');
  assert.match(v.out, /^WARNING grd_console_mesh: /m, '--verbose prints the warning itself');
});

test('driver: a lightmap the meshes point at and the script did not write FAILS the asset; --allow-stale-lightmap ships it and says so', () => {
  console_('ok');
  assert.equal(build('grd_console').code, 0);
  const files = ['raw/fixtures/grd_console.glb', 'public/assets/fixtures/grd_console.glb', 'raw/lm/lm_grd_console.png', 'public/assets/lm/lm_grd_console.webp'].map((f) => path.join(DIR, f));
  const before = files.map(sha);
  console_('no_lightmap_file');
  const r = build('grd_console');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^FAILED\s+grd_console: its lightmap lm_grd_console was not written in this run, although mesh 'grd_console_mesh' points at it/m);
  assert.match(r.out, /--allow-stale-lightmap/); assert.match(r.out, /nothing was shipped/);
  assert.match(r.out, /^kept\s+lm_grd_console .*grd_console FAILED: the shipped lightmap is unchanged/m);
  assert.deepEqual(files.map(sha), before, 'GLB and lightmap, raw and shipped, keep their bytes');
  const a = build('grd_console', '--allow-stale-lightmap');
  assert.equal(a.code, 0, a.out);
  assert.match(a.out, /^built\s+grd_console .*\(STALE LIGHTMAP lm_grd_console: not written in this run, shipped under --allow-stale-lightmap\)$/m);
  assert.match(a.out, /^skipped\s+lm_grd_console .*STALE/m);
  assert.equal(sha(files[2]), before[2], 'the old lightmap is still there'); assert.equal(pngIsPlaceholder(files[2]), false);
});
