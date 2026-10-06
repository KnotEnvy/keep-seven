// The game's tone map (producer ruling): shoulder only, no toe, knee 0.8. One definition in src/core/tonemap.ts, used by
// the core stub renderer (and so by the viewer and every <id>_game.png) and to be used by src/render.
import { describe, expect, it } from 'vitest';
import { TONE_MAP_GLSL, TONE_MAP_KNEE, installToneMap, toneMap } from '../../src/core/tonemap.ts';
import { firstNonFinite, nonFiniteCount, roundDeep } from '../../src/core/math.ts';
import { ROOT, nodeFs } from './nodeApi.ts';

const srgb8 = (v: number): number => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
const linear = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

describe('the tone map', () => {
  it('has no toe: every dark palette colour is displayed as authored (three\'s Neutral showed steel 54,82,90 as 23,67,77)', () => {
    expect(TONE_MAP_KNEE).toBe(0.8);
    const palette: Record<string, [number, number, number]> = {
      steel: [54, 82, 90], steel_dark: [30, 47, 54], gun_blue: [28, 34, 48], cable: [27, 31, 36], walnut: [58, 35, 24], workcloth: [94, 70, 54], sand: [205, 160, 112], floor: [11, 13, 18],
    };
    for (const [name, rgb] of Object.entries(palette)) {
      const out = toneMap(linear(rgb[0]), linear(rgb[1]), linear(rgb[2]));
      expect(out.map(srgb8), name).toEqual(rgb);
    }
    expect(toneMap(0.8, 0.4, 0.2)).toEqual([0.8, 0.4, 0.2]);
    expect(toneMap(0, 0, 0)).toEqual([0, 0, 0]);
  });
  it('above the knee the brightest channel rolls off toward 1, continuously, with slope 1 at the knee, hue kept', () => {
    let last = 0.8;
    for (let m = 0.8; m <= 16; m += 0.01) {
      const [r, g, b] = toneMap(m, m / 2, m / 4);
      expect(r).toBeGreaterThanOrEqual(last - 1e-12);
      expect(r).toBeLessThan(1);
      expect(g / r).toBeCloseTo(0.5, 9);
      expect(b / r).toBeCloseTo(0.25, 9);
      last = r;
    }
    expect((toneMap(0.8001, 0, 0)[0] - 0.8) / 0.0001).toBeCloseTo(1, 2);
    expect(toneMap(1.6, 0.8, 0.4)[0]).toBeCloseTo(0.96, 9);       // 0.8 + 0.2 * 0.8 / 1.0
    expect(toneMap(2.0, 1.0, 0.5)[0]).toBeCloseTo(0.8 + 0.2 * 1.2 / 1.4, 9);
  });
  it('TONE_MAP_GLSL is that curve as three\'s CustomToneMapping, and installToneMap puts it into the shader chunk once', () => {
    expect(TONE_MAP_GLSL).toContain('vec3 CustomToneMapping( vec3 color )');
    expect(TONE_MAP_GLSL).toContain('if ( m <= 0.8 ) return color;');
    expect(TONE_MAP_GLSL).toContain('0.8 + 0.2 * t / ( t + 0.2 )');
    const chunk = { tonemapping_pars_fragment: 'uniform float toneMappingExposure;\nvec3 CustomToneMapping( vec3 color ) { return color; }\n' };
    installToneMap(chunk);
    expect(chunk.tonemapping_pars_fragment).toContain(TONE_MAP_GLSL);
    const once = chunk.tonemapping_pars_fragment;
    installToneMap(chunk);
    expect(chunk.tonemapping_pars_fragment).toBe(once);
    expect(() => installToneMap({ tonemapping_pars_fragment: 'no stub here' })).toThrow(/no CustomToneMapping stub/);
  });
  it('the real three r186 chunk still has the stub, and basicRender uses this module (no curve of its own, no Neutral)', async () => {
    const fs = await nodeFs();
    const chunk = fs.readFileSync(`${ROOT}/node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`, 'utf8');
    expect(chunk).toContain('vec3 CustomToneMapping( vec3 color ) { return color; }');
    const stub = fs.readFileSync(`${ROOT}/src/core/stubs/basicRender.ts`, 'utf8');
    expect(stub).toContain("import { installToneMap } from '../tonemap.ts';");
    expect(stub).toContain('r.toneMapping = THREE.CustomToneMapping;');
    expect(stub).not.toMatch(/toneMapping\s*=\s*THREE\.(Neutral|ACESFilmic|AgX|Reinhard|Cineon|Linear)ToneMapping/);
    expect(stub).not.toContain('vec3 CustomToneMapping');
  });
});

describe('roundDeep does not hide a NaN from its caller', () => {
  it('counts what it replaced by 0, and firstNonFinite names the place', () => {
    const before = nonFiniteCount();
    expect(roundDeep({ a: 1.23456789, b: [1, 2] })).toEqual({ a: 1.2346, b: [1, 2] });
    expect(nonFiniteCount()).toBe(before);
    const bad = { player: { x: 1, cylinder: [0, NaN] }, y: Infinity };
    expect(roundDeep(bad)).toEqual({ player: { x: 1, cylinder: [0, 0] }, y: 0 });
    expect(nonFiniteCount()).toBe(before + 2);
    expect(firstNonFinite(bad)).toEqual({ path: '.player.cylinder[1]', text: 'NaN' });
    expect(firstNonFinite({ a: 'NaN', b: null, c: true })).toBeNull();
  });
});
