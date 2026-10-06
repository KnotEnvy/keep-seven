// src/core/contracts.ts is section 5 of docs/ARCHITECTURE.md, verbatim: `node tools/extract_contracts.mjs --check`.
import { describe, expect, it } from 'vitest';
import * as contracts from '../../src/core/contracts.ts';
import { NODE, ROOT, nodeChildProcess } from './nodeApi.ts';

describe('contracts', () => {
  it('match the document (extract_contracts --check)', async () => {
    const cp = await nodeChildProcess();
    const r = cp.spawnSync(NODE, ['tools/extract_contracts.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.stdout + r.stderr).toContain('contracts.ts matches');
    expect(r.status).toBe(0);
  });
  it('hold the constants the engine is built on', () => {
    expect(contracts.FIXED_DT).toBeCloseTo(1 / 60, 12);
    expect(contracts.MAX_STEPS_PER_FRAME).toBe(5);
    expect(contracts.SYSTEM_ORDER).toEqual(['player', 'enemies', 'world', 'render', 'audio', 'ui']);
    expect(contracts.ACTIONS).toHaveLength(12);
    expect(contracts.MAX_LINE_HITS).toBe(16);
    expect(contracts.LAYER_SOLID).toBe(contracts.Layer.WORLD | contracts.Layer.DYNAMIC);
  });
});
