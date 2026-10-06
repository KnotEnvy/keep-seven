// The same script and seed give a byte-identical raw GLB twice; another seed gives another file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, FIX, OVERLAY, blender } from './common.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ks_det_'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function build(script, name, seed, env = {}) {
  const out = path.join(TMP, name);
  const r = blender(script, ['--out', out, '--seed', String(seed)], env);
  assert.equal(r.code, 0, r.out.slice(-2000));
  return sha(out);
}

test('fixture_crate_panel (jitter, bevels, trim mapping, AO bake): same seed, same bytes', () => {
  const s = path.join(FIX, 'fixture_crate_panel.py'), env = { KS_MANIFEST_OVERLAY: OVERLAY };
  const a = build(s, 'a.glb', 1, env), b = build(s, 'b.glb', 1, env), c = build(s, 'c.glb', 2, env);
  assert.equal(a, b, 'two runs with seed 1 differ');
  assert.notEqual(a, c, 'seed 2 must give a different crate');
});
test('template_asset.py (rigid skin, clip, lamp set): same seed, same bytes', () => {
  const s = path.join(ROOT, 'blender/template_asset.py');
  assert.equal(build(s, 't1.glb', 1), build(s, 't2.glb', 1));
});
test('placeholders are deterministic (a skinned one and a zone)', () => {
  const s = path.join(ROOT, 'blender/placeholders.py');
  const run = (dir) => {
    // the generator writes to the manifest's raw paths: point an overlay's rawExportDir at a temp folder
    const ov = path.join(TMP, dir + '.json'); const raw = path.relative(ROOT, path.join(TMP, dir));
    const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/assets.json'), 'utf8'));
    fs.writeFileSync(ov, JSON.stringify({ meta: { rawExportDir: raw, publicDir: raw + '_pub' }, assets: { enemy_bider: M.assets.enemy_bider, env_tally_house: M.assets.env_tally_house } }));
    const r = blender(s, ['--assets', 'enemy_bider,env_tally_house'], { KS_MANIFEST_OVERLAY: ov });
    assert.equal(r.code, 0, r.out.slice(-2000));
    return [sha(path.join(TMP, dir, 'enemies/enemy_bider.glb')), sha(path.join(TMP, dir, 'env/env_tally_house.glb'))];
  };
  assert.deepEqual(run('p1'), run('p2'));
});
