// The import rule of ARCHITECTURE 1: a file under src/<module>/ may import from its own folder, from src/core/, and from
// three, three/examples/jsm/*.js, three-mesh-bvh, postprocessing. It may not import from another module's folder.
import { describe, expect, it } from 'vitest';
import { ROOT, nodeFs } from './nodeApi.ts';
import type { Fs } from './nodeApi.ts';

const MODULES = ['player', 'enemies', 'render', 'world', 'ui', 'audio'];
const PACKAGES = [/^three$/, /^three\/examples\/jsm\/.+\.js$/, /^three-mesh-bvh$/, /^postprocessing$/];

function walk(fs: Fs, dir: string, out: string[]): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) walk(fs, p, out);
    else if (/\.(ts|mts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
function importsOf(source: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m = re.exec(source); m; m = re.exec(source)) out.push((m[1] ?? m[2]) as string);
  return out;
}
function resolve(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return parts.join('/');
}

describe('the import rule', () => {
  it('modules import only their own folder, src/core and the allowed packages', async () => {
    const fs = await nodeFs();
    const problems: string[] = [];
    let files = 0;
    for (const mod of MODULES) {
      for (const file of walk(fs, `${ROOT}/src/${mod}`, [])) {
        files++;
        for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
          const rel = file.slice(ROOT.length + 1);
          if (spec.startsWith('.')) {
            const target = resolve(file, spec).slice(ROOT.length + 1);
            const ok = target.startsWith(`src/${mod}/`) || target.startsWith('src/core/');
            if (!ok) problems.push(`${rel} imports ${spec} (${target})`);
          } else if (spec.startsWith('three/addons/')) problems.push(`${rel} imports ${spec}: use three/examples/jsm/<path>.js`);
          else if (!PACKAGES.some((p) => p.test(spec))) problems.push(`${rel} imports package ${spec}`);
        }
      }
    }
    expect(files).toBeGreaterThanOrEqual(MODULES.length);
    expect(problems).toEqual([]);
  });

  it('src/core never imports a module folder, and three addons are spelled three/examples/jsm/<path>.js everywhere', async () => {
    const fs = await nodeFs();
    const problems: string[] = [];
    for (const file of [...walk(fs, `${ROOT}/src`, []), ...walk(fs, `${ROOT}/sandbox`, [])]) {
      const rel = file.slice(ROOT.length + 1);
      for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
        if (spec.startsWith('three/addons/')) problems.push(`${rel} imports ${spec}`);
        if (rel.startsWith('src/core/') && spec.startsWith('.')) {
          const target = resolve(file, spec).slice(ROOT.length + 1);
          if (!target.startsWith('src/core/') && !target.startsWith('design/')) problems.push(`${rel} imports ${spec} (${target})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('each module index exports exactly its factory', async () => {
    const fs = await nodeFs();
    const want: Record<string, string> = {
      player: 'createPlayerSystem', enemies: 'createEnemySystem', render: 'createRenderSystem', world: 'createWorldSystem', ui: 'createUiSystem', audio: 'createAudioSystem',
    };
    for (const mod of MODULES) {
      const src = fs.readFileSync(`${ROOT}/src/${mod}/index.ts`, 'utf8');
      expect(src, mod).toMatch(new RegExp(`export\\s+(const|function)\\s+${want[mod]}\\b`));
    }
  });
});
