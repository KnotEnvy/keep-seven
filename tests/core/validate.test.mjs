// The design validators run as tests: `npm run validate` (tools/validate_layout.mjs && tools/validate_assets.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../harness.mjs';

for (const tool of ['validate_layout.mjs', 'validate_assets.mjs']) {
  test(`tools/${tool} passes`, () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', tool)], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, `${tool} failed:\n${(r.stdout + r.stderr).split('\n').filter((l) => /FAIL|error|Error/.test(l)).slice(0, 20).join('\n')}`);
  });
}
test('src/core/contracts.ts is the document\'s block (extract_contracts --check)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/extract_contracts.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
