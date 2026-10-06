// Pure-logic checks of the render piece (no DOM, no WebGL): the mood table against the numbers of code-render 4.3, the
// grade's floor, the atlas table against the generator's, and the static checks of the feedback map.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { toneMap } from '../../src/core/tonemap.ts';
import {
  FLOOR_LINEAR, MOODS, MOOD_SIZE, M_RIM, M_VM_AMB, M_VM_KEY, M_VM_RIM, VM_AMB, VM_KEY, VM_RIM, M_GLOW, M_ZENITH, M_AMBIENT, M_CONTRAST, M_DENSITY, M_EXPOSURE, M_FOG_A, M_FOG_B, M_KEY, M_LIFT, M_PLACE, M_SATURATION, M_TINT, M_VIGNETTE,
  cellHeightExtra, grade, hexToLinear, lerpMood, linearToByte, moodAt,
} from '../../src/render/moods.ts';
import type { MoodKey } from '../../src/render/moods.ts';
import { CELL, FX_CELLS, FX_RECTS, cellPixels } from '../../src/render/vfx/atlas.ts';
import { AMBIENT_VFX, BODY_VFX, SHOOTABLE_VFX, SURFACE_VFX } from '../../src/render/feedback.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const KEYS = Object.keys(MOODS) as MoodKey[];

describe('mood table (code-render 4.3)', () => {
  it('has the eight moods of the contract and the two sub-volumes of the bore, all finite', () => {
    expect(KEYS.sort()).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L5a', 'L5c', 'L5p', 'L6', 'L6c']);
    for (const k of KEYS) { expect(MOODS[k].length).toBe(MOOD_SIZE); for (const v of MOODS[k]) expect(Number.isFinite(v)).toBe(true); }
  });
  it('L1 fog: 20 % at 40 m, 50 % at 120 m, 87 % at 350 m', () => {
    const d = MOODS.L1[M_DENSITY] as number;
    expect(1 - Math.exp(-d * 40)).toBeCloseTo(0.207, 2);
    expect(1 - Math.exp(-d * 120)).toBeCloseTo(0.501, 2);
    expect(1 - Math.exp(-d * 350)).toBeCloseTo(0.869, 2);
    // polish round 2: under the overhang the fog is the Long Light's own, not x 1.6 of it (the dark frame of the first image)
    expect(MOODS.L0[M_DENSITY]).toBeCloseTo(d, 6);
  });
  it('densities, exposures and grades are the table\'s', () => {
    const row = (k: MoodKey): number[] => [M_DENSITY, M_EXPOSURE, M_SATURATION, M_CONTRAST, M_VIGNETTE].map((i) => Math.round((MOODS[k][i] as number) * 1e4) / 1e4);
    expect(row('L1')).toEqual([0.0058, 1, 1, 1.06, 0.35]);
    // look-dev, polish round 3 (R7): every underground mood has a dark anchor (a third of the lift), more contrast and a
    // higher exposure, so a frame runs L* 8 to 60 instead of 18 to 45; the hall is neutral concrete, the gallery stays teal
    expect(row('L2')).toEqual([0.02, 2.5, 0.92, 1.16, 0.55]);
    expect(row('L3')).toEqual([0.023, 1.75, 0.88, 1.15, 0.5]);
    expect(row('L4')).toEqual([0.026, 1.9, 0.8, 1.16, 0.5]);
    // polish round 3 (the visual critic: 89 to 93 % of a boss frame under L* 35): the chamber is shown a third of a stop higher
    expect(row('L5')).toEqual([0.018, 2.2, 1, 1.18, 0.5]);
    expect(row('L5p')).toEqual([0.012, 1.8, 0.9, 1.15, 0.45]);
    // polish round 2 (the visuals critic): the blue hour's fog hid the lamps and the fire, the overhang was a haze
    // polish round 3 (R5, R7): half the fog again, a dark land under a lit sky (exposure down, contrast up)
    expect(row('L6')).toEqual([0.0032, 1.12, 0.95, 1.22, 0.5]);
    // look-dev, polish round 3 (R7, the first image): the rock frame is a dark anchor (contrast 1.20, half the lift)
    expect(row('L0')).toEqual([0.0058, 1.3, 0.9, 1.2, 0.45]);
    expect(Array.from(MOODS.L1.subarray(M_TINT, M_TINT + 3)).map((v) => +v.toFixed(3))).toEqual([1.06, 1, 0.92]);
    expect(Array.from(MOODS.L1.subarray(M_LIFT, M_LIFT + 3)).map((v) => +v.toFixed(3))).toEqual([0.015, 0.02, 0.04]);
  });
  it('polish round 3 (R6): every mood carries a rig for the view-model at display levels', () => {
    const lum = (m: Float32Array, at: number): number => 0.2126 * (m[at] as number) + 0.7152 * (m[at + 1] as number) + 0.0722 * (m[at + 2] as number);
    for (const k of KEYS) {
      const m = MOODS[k], ex = m[M_EXPOSURE] as number;
      // on screen (x exposure) the gun's ambient and key never fall under the floors, whatever the room
      // (the gallery's rig is held to 0.85 of them: the darkest room behind the gun)
      expect(lum(m, M_VM_AMB) * ex).toBeGreaterThanOrEqual(VM_AMB * 0.85 - 1e-4);
      expect(lum(m, M_VM_KEY) * ex).toBeGreaterThanOrEqual(VM_KEY * 0.85 - 1e-4);
      expect(lum(m, M_VM_RIM) * ex).toBeCloseTo(VM_RIM, 3);
      // the key is well over the ambient: form, not a flat fill
      expect(lum(m, M_VM_KEY)).toBeGreaterThan(lum(m, M_VM_AMB) * 2.5);
      // the ambient's hue is held toward grey: its strongest channel is under 2.2 x its weakest (the Long Light's own ambient is 3.5 x: "blue rubber gloves")
      const a = [m[M_VM_AMB] as number, m[M_VM_AMB + 1] as number, m[M_VM_AMB + 2] as number];
      expect(Math.max(...a) / Math.min(...a)).toBeLessThan(k === 'L1' || k === 'L0' ? 2.2 : 3.0);
    }
    // the bore, the dark rooms: the gun is as bright on screen there as under the overhang (within a third)
    const shown = (k: MoodKey): number => lum(MOODS[k], M_VM_KEY) * (MOODS[k][M_EXPOSURE] as number);
    for (const k of ['L2', 'L3', 'L4', 'L5', 'L5a', 'L6'] as MoodKey[]) { expect(shown(k)).toBeGreaterThanOrEqual(VM_KEY * 0.85 - 1e-3); expect(shown(k)).toBeLessThan(VM_KEY * (k === 'L6' ? 1.8 : 1.45)); }   // the blue hour's rig is x1.75: its grade's contrast (1.22) crushed the shadow side (18 % of the gun under L* 12)
    // under the overhang she stands in shade: the key is the rig's floor, not the Long Light's sun
    expect(shown('L0')).toBeLessThan(shown('L1') * 0.8);
  });
  it('polish round 3: the chamber gives dynamic things a cool fill; the blue hour has a dark zenith and a bright ember', () => {
    const lum = (m: Float32Array, at: number): number => 0.2126 * (m[at] as number) + 0.7152 * (m[at + 1] as number) + 0.0722 * (m[at + 2] as number);
    for (const k of ['L5', 'L5c', 'L5p'] as MoodKey[]) expect(lum(MOODS[k], M_RIM)).toBeGreaterThan(0.15);
    for (const k of ['L1', 'L2', 'L3', 'L4', 'L6'] as MoodKey[]) expect(lum(MOODS[k], M_RIM)).toBe(0);
    // L5's ambient is slate, not violet: blue is under twice the green (it was 3.1 x)
    expect((MOODS.L5[M_AMBIENT + 2] as number) / (MOODS.L5[M_AMBIENT + 1] as number)).toBeLessThan(2.6);
    // L6 on screen: the glow band over 0.45 linear, the zenith under 0.02, the fog away from the afterglow under 0.05
    const ex = MOODS.L6[M_EXPOSURE] as number;
    expect(lum(MOODS.L6, M_GLOW) * ex).toBeGreaterThan(0.45);
    expect(lum(MOODS.L6, M_ZENITH) * ex).toBeLessThan(0.02);
    expect(lum(MOODS.L6, M_FOG_A) * ex).toBeLessThan(0.05);
  });
  it('dynamic ambient and key are colour x strength (L1: #7A86D8 x 0.55, #FFD09A x 1.1)', () => {
    const a = [0, 0, 0], k = [0, 0, 0];
    hexToLinear(0x7a86d8, a, 0, 0.55); hexToLinear(0xffd09a, k, 0, 1.1);
    for (let i = 0; i < 3; i++) { expect(MOODS.L1[M_AMBIENT + i]).toBeCloseTo(a[i] as number, 5); expect(MOODS.L1[M_KEY + i]).toBeCloseTo(k[i] as number, 5); }
    // the Tally House has no key outside a blade
    expect(MOODS.L2[M_KEY]).toBe(0);
    // a placeholder zone keeps its authored light under the Long Light
    for (let i = 0; i < 3; i++) expect(MOODS.L1[M_PLACE + i]).toBeCloseTo(1, 5);
  });
  it('interior fog colours are display targets: stored divided by the mood\'s exposure', () => {
    const c = [0, 0, 0];
    hexToLinear(0x1c1318, c, 0);
    for (let i = 0; i < 3; i++) expect((MOODS.L2[M_FOG_A + i] as number) * 2.5).toBeCloseTo(c[i] as number, 5);
    hexToLinear(0x14343e, c, 0);
    for (let i = 0; i < 3; i++) expect((MOODS.L3[M_FOG_B + i] as number) * 1.75).toBeCloseTo(c[i] as number, 5);
  });
  it('a cross-fade is a plain blend and keeps directions unit length', () => {
    const out = new Float32Array(MOOD_SIZE);
    lerpMood(out, MOODS.L1, MOODS.L3, 0.5);
    expect(out[M_DENSITY]).toBeCloseTo((0.0058 + 0.023) / 2, 5);
    expect(Math.hypot(out[32] as number, out[33] as number, out[34] as number)).toBeCloseTo(1, 5);
  });
  it('the bore has three sub-volumes, and the proven chamber is L5p', () => {
    expect(moodAt('the_bore', 'L5', -44, 96, 0)).toBe('L5');
    expect(moodAt('the_bore', 'L5', -44, 72, 0)).toBe('L5a');
    expect(moodAt('the_bore', 'L5', -36, 83, 0)).toBe('L5c');
    expect(moodAt('the_bore', 'L5', -44, 96, 1)).toBe('L5p');
    expect(moodAt('plenty_street', 'L1', 0, 0, 0)).toBe('L1');
    // look team exterior, polish round 5: a dynamic thing inside the rim's rock frame (the lift cage) takes L6c, which is
    // L6 in everything but the dynamic ambient, key and fill (the frame, the fog, the sky and the view-model do not change)
    expect(moodAt('far_rim', 'L6', 18, 114, 0)).toBe('L6c');
    expect(moodAt('far_rim', 'L6', 18, 104, 0)).toBe('L6');
    for (let i = 0; i < MOOD_SIZE; i++) {
      const dyn = (i >= 26 && i < 35) || (i >= 54 && i < 57);   // M_AMBIENT, M_KEY, M_KEY_DIR; M_RIM
      if (!dyn && MOODS.L6c[i] !== MOODS.L6[i]) throw new Error(`L6c differs from L6 at field ${i}`);
    }
    expect(cellHeightExtra('the_lip', 'cell_lip_gully')).toBe(1.0);
    expect(cellHeightExtra('plenty_street', 'cell_street')).toBe(0.6);
    expect(cellHeightExtra('plenty_street', 'cell_yard')).toBe(0);
    expect(cellHeightExtra('tally_house', 'cell_tally')).toBe(-1);
  });
});

describe('polish round 2: the moods the critics measured', () => {
  it('L0 is the dark frame: the Long Light\'s fog and lift, no dust under the roof, a third of a stop of glare', () => {
    for (let i = 0; i < 3; i++) {
      expect(MOODS.L0[M_FOG_A + i]).toBeCloseTo(MOODS.L1[M_FOG_A + i] as number, 6);
      expect(MOODS.L0[M_FOG_B + i]).toBeCloseTo(MOODS.L1[M_FOG_B + i] as number, 6);
      // look-dev, polish round 3: under the roof the lift is about half the Long Light's (the frame's darks are darks)
      expect(MOODS.L0[M_LIFT + i]).toBeLessThanOrEqual(MOODS.L1[M_LIFT + i] as number);
      expect(MOODS.L0[M_LIFT + i]).toBeGreaterThanOrEqual(0.4 * (MOODS.L1[M_LIFT + i] as number));
    }
    expect(MOODS.L0[10]).toBe(0);                                   // M_HEIGHT_EXTRA
    expect(MOODS.L0[M_EXPOSURE]).toBeLessThanOrEqual(1.4);
    expect(MOODS.L0[M_CONTRAST]).toBeGreaterThanOrEqual(1.06);
  });
  it('the bore lights dynamic things with a cool key from above, not violet from below', () => {
    const k = MOODS.L5.subarray(M_KEY, M_KEY + 3);
    expect(k[1] as number).toBeGreaterThan(k[0] as number);         // aqua: green over red
    expect(k[1] as number).toBeGreaterThan(0.2);
    expect(MOODS.L5[33] as number).toBeGreaterThan(0.9);            // M_KEY_DIR.y: from above
    // the blue hour: 250 m of it leaves at least a fifth of the town (it took 95 % at 0.012)
    expect(1 - Math.exp(-(MOODS.L6[M_DENSITY] as number) * 250)).toBeLessThan(0.82);
  });
});

describe('tone map and grade', () => {
  it('black under every mood is at or above #0B0D12, vignette or not (the lift is the floor)', () => {
    for (const k of KEYS) {
      const m = MOODS[k];
      for (const vig of [0, m[M_VIGNETTE] as number]) {
        const c = grade([0, 0, 0], Array.from(m.subarray(M_TINT, M_TINT + 3)), Array.from(m.subarray(M_LIFT, M_LIFT + 3)), m[M_SATURATION] as number, m[M_CONTRAST] as number, vig);
        const bytes = c.map(linearToByte);
        expect(bytes[0], `${k} red`).toBeGreaterThanOrEqual(0x0b);
        expect(bytes[1], `${k} green`).toBeGreaterThanOrEqual(0x0d);
        expect(bytes[2], `${k} blue`).toBeGreaterThanOrEqual(0x12);
      }
    }
    expect(FLOOR_LINEAR.map(linearToByte)).toEqual([0x0b, 0x0d, 0x12]);
  });
  it('an identity grade after the shoulder curve leaves the dark palette colours as authored', () => {
    for (const hex of [0x36525a, 0x1e2f36, 0x1c2230, 0x1b1f24, 0x3a2318]) {
      const c: [number, number, number] = [0, 0, 0];
      hexToLinear(hex, c, 0);
      const t = toneMap(c[0], c[1], c[2]);
      const g = grade([t[0], t[1], t[2]], [1, 1, 1], [0, 0, 0], 1, 1, 0).map(linearToByte);
      expect(g).toEqual([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
    }
  });
  it('the merged pass and the min tier use core\'s curve by reference, and never three\'s Neutral', () => {
    const post = read('src/render/post.ts');
    expect(post).toContain("import { TONE_MAP_GLSL, installToneMap } from '../core/tonemap.ts'");
    expect(post).not.toMatch(/NeutralToneMapping|ToneMappingMode/);
    for (const f of fs.readdirSync(path.join(ROOT, 'src/render'), { recursive: true }) as string[]) {
      if (!f.endsWith('.ts')) continue;
      expect(read('src/render/' + f), f).not.toMatch(/NeutralToneMapping|ACESFilmicToneMapping/);
    }
  });
});

describe('fx atlas', () => {
  it('has the twenty cells of ART_BIBLE 9.1 in the generator\'s order and the manifest\'s regions', async () => {
    const generator: string = path.join(ROOT, 'tools/gen_fx_atlas.mjs');
    const gen = await import(/* @vite-ignore */ generator) as { CELLS: string[]; cellPixels: (i: number) => number[] };
    expect([...FX_CELLS]).toEqual(gen.CELLS);
    const manifest = JSON.parse(read('design/assets.json')) as { textures: Record<string, { regions?: string[]; size: number[] }> };
    expect(manifest.textures.tx_fx?.regions).toEqual(gen.CELLS);
    for (let i = 0; i < FX_CELLS.length; i++) expect(cellPixels(i)).toEqual(gen.cellPixels(i));
    expect(cellPixels(CELL.flash_d)).toEqual([768, 0, 256, 256]);
    expect(cellPixels(CELL.smoke_a)).toEqual([0, 256, 128, 128]);
    expect(cellPixels(CELL.dec_stone)).toEqual([896, 384, 128, 128]);
    // every rectangle lies inside its cell and inside the texture
    for (let i = 0; i < FX_CELLS.length; i++) {
      const [x, y, w, h] = cellPixels(i);
      const u0 = (FX_RECTS[i * 4] as number) * 1024, v0 = (FX_RECTS[i * 4 + 1] as number) * 512, du = (FX_RECTS[i * 4 + 2] as number) * 1024, dv = (FX_RECTS[i * 4 + 3] as number) * 512;
      expect(u0).toBeGreaterThan(x); expect(v0).toBeGreaterThan(y); expect(u0 + du).toBeLessThan(x + w); expect(v0 + dv).toBeLessThan(y + h);
    }
  });
});

describe('feedback map (static checks)', () => {
  const contracts = read('src/core/contracts.ts');
  const union = (name: string): string[] => {
    const m = new RegExp(`export type ${name} =([^;]+);`).exec(contracts);
    if (!m) throw new Error('no type ' + name);
    return Array.from((m[1] as string).matchAll(/'([a-z0-9_]+)'/g)).map((x) => x[1] as string);
  };
  it('feedback.ts names every VfxId at least once', () => {
    const src = read('src/render/feedback.ts');
    const ids = union('VfxId');
    expect(ids.length).toBe(29);
    for (const id of ids) expect(src.includes(`'${id}'`), id).toBe(true);
  });
  it('every VfxId has a recipe, every line, card and ring kind a pool', () => {
    const vfx = read('src/render/vfx/vfx.ts');
    for (const id of union('VfxId')) expect(new RegExp(`\\n  ${id}: \\[`).test(vfx), 'recipe ' + id).toBe(true);
    for (const k of union('LineKind')) expect(new RegExp(`\\n  ${k}: \\{ pool: \\d`).test(vfx), 'line ' + k).toBe(true);
    for (const k of union('CardKind')) expect(vfx.includes(`${k}:`), 'card ' + k).toBe(true);
    for (const k of union('RingKind')) expect(vfx.includes(`${k}:`), 'ring ' + k).toBe(true);
  });
  it('every surface has an impact, no impact is red, and every event of the order is subscribed', () => {
    for (const s of union('SurfaceType')) expect(Object.keys(SURFACE_VFX)).toContain(s);
    expect(SURFACE_VFX.sand).toBe('impact_sand'); expect(SURFACE_VFX.cloth).toBe('impact_cloth'); expect(SURFACE_VFX.none).toBe('');
    expect(BODY_VFX.bider).toBe('impact_cloth');
    expect(SHOOTABLE_VFX.jug).toBe('jug_burst'); expect(SHOOTABLE_VFX.dowser).toBe('dust_short');
    expect(AMBIENT_VFX.map((a) => a[0])).toEqual(['embers', 'steam']);
    const src = read('src/render/feedback.ts');
    for (const e of ['weapon/fired', 'combat/hit', 'combat/line_resolved', 'enemy/freed', 'enemy/felled', 'enemy/died', 'enemy/telegraph', 'enemy/attack', 'knot/burst', 'knot/regrown',
      'shootable/hit', 'breakable/broken', 'projectile/landed', 'projectile/burst', 'pickup/spawned', 'pickup/collected', 'boss/guard', 'boss/proven']) {
      expect(src.includes(`this.on('${e}'`), e).toBe(true);
    }
    const system = read('src/render/system.ts');
    for (const e of ['quality/changed', 'options/changed', 'load/set', 'game/state']) expect(system.includes(`on.on('${e}'`), e).toBe(true);
  });
  it('the emissive palette columns the shaders assume are the palette table\'s', () => {
    const palette = JSON.parse(read('blender/lib/palette.json')) as { cell: number; size: number; cells: Record<string, { col: number; row: number; emis?: string }> };
    expect(palette.size / palette.cell).toBe(16);
    const cols = ['flame', 'flame_core', 'aqua', 'aqua_core', 'violet', 'violet_core', 'violet_band', 'violet_band_core'].map((n) => palette.cells[n]?.col);
    expect(cols).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('src/render imports only itself, core, three and postprocessing', () => {
    for (const f of fs.readdirSync(path.join(ROOT, 'src/render'), { recursive: true }) as string[]) {
      if (!f.endsWith('.ts')) continue;
      for (const m of read('src/render/' + f).matchAll(/from '([^']+)'/g)) {
        const spec = m[1] as string;
        const ok = spec === 'three' || spec === 'postprocessing' || spec.startsWith('three/examples/jsm/') || (spec.startsWith('.') && !/\/(player|enemies|world|ui|audio)\//.test(path.posix.join('src/render', path.posix.dirname(f), spec)));
        expect(ok, `${f}: ${spec}`).toBe(true);
      }
    }
  });
});
