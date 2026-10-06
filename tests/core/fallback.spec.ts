// The core fallback material (what sandbox/viewer.html, `<id>_game.png` and every sandbox draw with until src/render
// installs its own): a FINAL file's meshes get the shared texture of their material on UV0, so UV mapping can be
// checked through the real loader; placeholders keep plain vertex colour.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFallbackResolver } from '../../src/core/assets.ts';

const textures = new Map<string, THREE.Texture>();
const textureOf = (id: string): THREE.Texture | null => {
  if (id === 'tx_gun') return null;                                // not active
  let t = textures.get(id);
  if (!t) { t = new THREE.Texture(); t.name = id; textures.set(id, t); }
  return t;
};

function mesh(opts: { uv?: boolean; color?: boolean; placeholder?: boolean; userData?: Record<string, unknown> } = {}): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  if (opts.uv !== false) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
  if (opts.color !== false) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  const m = new THREE.Mesh(g);
  Object.assign(m.userData, opts.userData ?? {});
  const root = new THREE.Group();
  if (opts.placeholder) root.userData.placeholder = true;
  root.add(new THREE.Group().add(m));
  return m;
}
const compile = (m: THREE.Material): string => {
  const shader = { fragmentShader: 'a\n#include <map_fragment>\nb\n#include <alphamap_fragment>\nc', vertexShader: '', uniforms: {} };
  (m.onBeforeCompile as unknown as (s: typeof shader) => void)(shader);
  return shader.fragmentShader;
};

describe('createFallbackResolver', () => {
  const resolve = createFallbackResolver(textureOf, () => 2);
  it('world materials multiply their one-channel detail sheet (red x 2), not three\'s red-only colour map', () => {
    for (const [name, tex] of [['m_frontier', 'tx_frontier_trim'], ['m_pellam', 'tx_pellam_trim'], ['m_sand', 'tx_sand']] as const) {
      const m = resolve(name, mesh(), null) as THREE.MeshBasicMaterial;
      expect(m.map?.name).toBe(tex);
      expect(m.vertexColors).toBe(true);
      expect(m.userData.fallbackTexture).toBe(tex);
      const f = compile(m);
      expect(f).toContain('texture2D( map, vMapUv ).r * 2.0');
      expect(f).not.toContain('#include <map_fragment>');
      expect(m.customProgramCacheKey()).toBe('fallback_detail');
    }
  });
  it('m_prop shows the palette under COLOR_0, m_emis the emissive palette, m_mask is cut by tx_mask\'s red channel', () => {
    const prop = resolve('m_prop', mesh(), null) as THREE.MeshBasicMaterial;
    expect([prop.map?.name, prop.vertexColors]).toEqual(['tx_palette', true]);
    const emis = resolve('m_emis', mesh(), null) as THREE.MeshBasicMaterial;
    expect([emis.map?.name, emis.color.getHex(), emis.toneMapped]).toEqual(['tx_palette_emis', 0xffffff, false]);
    const mask = resolve('m_mask', mesh(), null) as THREE.MeshBasicMaterial;
    expect([mask.alphaMap?.name, mask.alphaTest, mask.map]).toEqual(['tx_mask', 0.5, null]);
    expect(compile(mask)).toContain('texture2D( alphaMap, vAlphaMapUv ).r');
    expect(compile(mask)).toContain('#include <map_fragment>');
  });
  it('no texture for a placeholder, a mesh without UV0, a material without one, or a texture that is not active', () => {
    const ph = resolve('m_prop', mesh({ placeholder: true }), null) as THREE.MeshBasicMaterial;
    expect([ph.map, ph.userData.fallbackTexture]).toEqual([null, '']);
    expect((resolve('m_emis', mesh({ placeholder: true }), null) as THREE.MeshBasicMaterial).color.getHex()).toBe(0x7cf2e2);
    expect((resolve('m_mask', mesh({ placeholder: true }), null) as THREE.MeshBasicMaterial).alphaMap).toBeNull();
    expect((resolve('m_pellam', mesh({ uv: false }), null) as THREE.MeshBasicMaterial).map).toBeNull();
    expect((resolve('m_flat', mesh(), null) as THREE.MeshBasicMaterial).map).toBeNull();
    expect((resolve('m_gun', mesh(), null) as THREE.MeshBasicMaterial).map).toBeNull();      // tx_gun is not active here
  });
  it('materials are shared per (name, colour, light, texture) and a lightmapped mesh keeps its lightmap beside the detail', () => {
    expect(resolve('m_prop', mesh(), null)).toBe(resolve('m_prop', mesh(), null));
    expect(resolve('m_prop', mesh(), null)).not.toBe(resolve('m_prop', mesh({ placeholder: true }), null));
    const lm = mesh({ userData: { bake: 'LM', lightmap: 'lm_test' } });
    lm.geometry.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(6), 2));
    const m = resolve('m_pellam', lm, null) as THREE.MeshBasicMaterial;
    expect([m.lightMap?.name, m.map?.name]).toEqual(['lm_test', 'tx_pellam_trim']);
    expect(m.lightMapIntensity).toBeCloseTo(Math.PI * 2, 6);
  });
});
