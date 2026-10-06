// Shared by the pipeline tests.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIX = path.join(ROOT, 'tests/pipeline/fixtures');
export const OVERLAY = path.join(FIX, 'manifest.json');
export const BLENDER = path.join(ROOT, 'tools/blender.sh');
export function node(args, opts = {}) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}
export function blender(script, args, env = {}) {
  const r = spawnSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script, '--', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}
/** Build the fixtures through the one command (cheap when nothing changed). */
export function buildFixtures() {
  const r = node(['tools/build-assets.mjs', '--manifest', OVERLAY, '--only', 'fixtures']);
  if (r.code !== 0) throw new Error('fixture build failed:\n' + r.out);
  return r.out;
}

// ---- placeholder copies of game assets (integration, polish round 2) --------------------------------------------------
// Every shipped game asset is final art now, and four tests are about what the pipeline does with a PLACEHOLDER file
// (the greybox rule, the check-glb exemption, the optimiser's guard, the dressing empties the placeholder zones carry).
// They build placeholder copies of a few game assets into the fixtures folders through the one build command and an
// overlay manifest: the same generator (blender/placeholders.py), never touching public/assets or blender/export.
import fs from 'node:fs';
export const PH_REL = 'tests/pipeline/fixtures/export/_placeholders';
/** the overlay manifest of the placeholder copies, relative to the repository (what `?overlay=` of fixture_view takes) */
export const PH_OVERLAY_REL = PH_REL + '/overlay.json';
export const PH_OVERLAY = path.join(ROOT, PH_OVERLAY_REL);
const PH_IDS = ['env_tally_house', 'env_the_lip', 'prop_crate'];
let phBuilt = false;
/** Build (once per process; a no-op when up to date) placeholder copies of env_tally_house, env_the_lip and prop_crate. -> the overlay path */
export function buildPlaceholderCopies() {
  if (phBuilt) return PH_OVERLAY;
  const A = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/assets.json'), 'utf8'));
  // the same manifest entries with a source that does not exist: the driver falls back to the placeholder generator
  const assets = Object.fromEntries(PH_IDS.map((id) => [id, { ...A.assets[id], source: `${PH_REL}/no_script_${id}.py` }]));
  const overlay = { meta: { title: 'placeholder copies of game assets for tests/pipeline', rawExportDir: PH_REL + '/raw', publicDir: 'tests/pipeline/fixtures/public/_placeholders' }, assets };
  fs.mkdirSync(path.dirname(PH_OVERLAY), { recursive: true });
  const text = JSON.stringify(overlay, null, 1);
  if (!fs.existsSync(PH_OVERLAY) || fs.readFileSync(PH_OVERLAY, 'utf8') !== text) fs.writeFileSync(PH_OVERLAY, text);
  const r = node(['tools/build-assets.mjs', '--manifest', PH_OVERLAY, '--placeholders', '--only', PH_IDS.join(',')]);
  if (r.code !== 0) throw new Error('placeholder copies failed:\n' + r.out);
  phBuilt = true;
  return PH_OVERLAY;
}
