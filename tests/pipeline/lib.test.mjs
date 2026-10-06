// blender/lib is frozen after phase 2: before that, EVERY public function is called at least once by something a test
// runs. The worked examples (four fixtures, the template, the placeholder generator, the texture scripts) and
// fixtures/lib_smoke.py are run under fixtures/lib_trace.py, which records the calls; the union must be the whole API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, FIX, OVERLAY, BLENDER, buildFixtures } from './common.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ks_lib_'));
const TAG = `libtest${process.pid}`;
test.after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, 'tests/pipeline/fixtures/export', '_libtest'), { recursive: true, force: true });
  const lm = path.join(FIX, 'export/lm');                                  // lightmaps the room fixture staged
  if (fs.existsSync(lm)) for (const f of fs.readdirSync(lm)) if (f.includes(TAG)) fs.rmSync(path.join(lm, f));
});

function traced(name, script, args, env = {}) {
  return new Promise((resolve) => {
    const trace = path.join(TMP, name + '.trace.json');
    const p = spawn(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(FIX, 'lib_trace.py'), '--', trace, script, ...args],
      { cwd: ROOT, env: { ...process.env, KS_STAGE_TAG: TAG, ...env } });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ name, code, out, trace: fs.existsSync(trace) ? JSON.parse(fs.readFileSync(trace, 'utf8')) : null }));
  });
}

test('every public function of blender/lib is called by a script the tests run', async () => {
  buildFixtures();                                                        // the room embeds the stool's raw export
  const fx = { KS_MANIFEST_OVERLAY: OVERLAY };
  // the placeholder generator writes to the manifest's raw paths: an overlay points them into an ignored folder
  const rawDir = 'tests/pipeline/fixtures/export/_libtest';
  const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/assets.json'), 'utf8'));
  const phOverlay = path.join(TMP, 'ph.json');
  fs.writeFileSync(phOverlay, JSON.stringify({ meta: { rawExportDir: rawDir, publicDir: rawDir + '/pub' },
    assets: { enemy_bider: M.assets.enemy_bider, env_the_lip: M.assets.env_the_lip, prop_door_frontier: M.assets.prop_door_frontier },
    textures: { tx_fx: M.textures.tx_fx, lm_rim: M.textures.lm_rim } }));
  const jobs = [
    ...['fixture_stool', 'fixture_probe', 'fixture_crate_panel', 'fixture_room'].map((id) => () => traced(id, path.join(FIX, id + '.py'), ['--out', path.join(TMP, id + '.glb'), '--seed', '1'], fx)),
    () => traced('template', path.join(ROOT, 'blender/template_asset.py'), ['--out', path.join(TMP, 'template.glb'), '--seed', '1']),
    () => traced('smoke', path.join(FIX, 'lib_smoke.py'), ['--out', path.join(TMP, 'smoke')], fx),
    () => traced('placeholders', path.join(ROOT, 'blender/placeholders.py'), ['--assets', 'enemy_bider,env_the_lip,prop_door_frontier', '--textures', 'tx_fx,lm_rim'], { KS_MANIFEST_OVERLAY: phOverlay }),
    ...fs.readdirSync(path.join(ROOT, 'blender/tex')).filter((f) => f.endsWith('.py')).map((f) => () => traced(f, path.join(ROOT, 'blender/tex', f), ['--out', path.join(TMP, f.replace('.py', '.png'))])),
  ];
  const results = await Promise.all(jobs.map((j) => j()));
  const pub = new Set(), called = new Set();
  for (const r of results) {
    assert.equal(r.code, 0, `${r.name} failed:\n${r.out.split('\n').filter((l) => /SMOKE FAIL|Error|Traceback|^\s+File|assert/i.test(l)).slice(-25).join('\n')}`);
    assert.ok(r.trace, `${r.name} wrote its trace`);
    for (const k of r.trace.public) pub.add(k);
    for (const k of r.trace.called) called.add(k);
  }
  const smoke = results.find((r) => r.name === 'smoke');
  assert.match(smoke.out, /SMOKE ALL OK/);
  const missing = [...pub].filter((k) => !called.has(k)).sort();
  console.log(`    ${called.size} of ${pub.size} public functions of blender/lib called by ${results.length} scripts`);
  assert.ok(pub.size >= 200, `the tracer saw the library (${pub.size} functions)`);
  assert.deepEqual(missing, [], `library functions no test exercises (call them in tests/pipeline/fixtures/lib_smoke.py): ${missing.join(', ')}`);
});

test('the script header finds blender/lib from anywhere in the tree and gives up at the filesystem root', async () => {
  // CLAUDE.md sends experiments to scratch/: a copy of the template there must build, and a copy outside the repository
  // must stop with a message (the loop used to spin forever at "/", a 30-minute timeout under the build driver)
  const { spawnSync } = await import('node:child_process');
  const run = (script, out) => spawnSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script, '--', '--out', out, '--seed', '1'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  const src = fs.readFileSync(path.join(ROOT, 'blender/template_asset.py'), 'utf8');
  const inTree = path.join(ROOT, 'tests/pipeline/fixtures/export', '_libtest', 'deep', 'er');
  fs.mkdirSync(inTree, { recursive: true });
  fs.writeFileSync(path.join(inTree, 'ia_ammo_box_copy.py'), src);
  const a = run(path.join(inTree, 'ia_ammo_box_copy.py'), path.join(TMP, 'copy.glb'));
  assert.equal(a.error, undefined, 'no timeout'); assert.equal(a.status, 0, (a.stdout + a.stderr).split('\n').slice(-8).join('\n'));
  assert.match(a.stdout, /EXPORTED ia_ammo_box/); assert.ok(fs.existsSync(path.join(TMP, 'copy.glb')));
  fs.writeFileSync(path.join(TMP, 'outside.py'), src);
  const b = run(path.join(TMP, 'outside.py'), path.join(TMP, 'outside.glb'));
  assert.equal(b.error, undefined, 'no timeout: the loop ends at the filesystem root'); assert.notEqual(b.status, 0);
  assert.match(b.stdout + b.stderr, /blender\/lib not found above .*outside\.py/);
  for (const f of ['fixture_stool.py', 'fixture_probe.py', 'fixture_crate_panel.py', 'fixture_room.py', 'lib_smoke.py', 'lib_trace.py'])
    assert.match(fs.readFileSync(path.join(FIX, f), 'utf8'), /if os\.path\.dirname\(_d\) == _d: raise SystemExit/, `${f} has the bounded header`);
});
