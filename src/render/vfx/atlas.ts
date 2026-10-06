// The layout of tx_fx (ART_BIBLE 9.1; drawn by tools/gen_fx_atlas.mjs, which carries the same table):
// 1024 x 512, premultiplied alpha. Row A: four 256 px cells; rows B and C: sixteen 128 px cells.
export const FX_CELLS = [
  'flash_a', 'flash_b', 'flash_c', 'flash_d',
  'smoke_a', 'smoke_b', 'dust_a', 'dust_b', 'spark', 'soft_dot', 'star4', 'shard',
  'splinter', 'sand_pour', 'mote_cluster', 'dec_wood', 'dec_adobe', 'dec_metal', 'dec_ceramic', 'dec_stone',
] as const;
export type FxCell = typeof FX_CELLS[number];

export const ATLAS_W = 1024, ATLAS_H = 512;
/** pixels kept clear inside a cell's edge so mip levels do not bleed a neighbour in */
const INSET = 3;

/** pixel rectangle [x, y, w, h] of a cell by index (rows from the top of the image) */
export function cellPixels(index: number): [number, number, number, number] {
  if (index < 4) return [index * 256, 0, 256, 256];
  const i = index - 4;
  return [(i % 8) * 128, 256 + Math.floor(i / 8) * 128, 128, 128];
}

/** u0, v0, du, dv of every cell (textures are uploaded with flipY = false: v runs down the image) */
export const FX_RECTS: Float32Array = (() => {
  const out = new Float32Array(FX_CELLS.length * 4);
  for (let i = 0; i < FX_CELLS.length; i++) {
    const [x, y, w, h] = cellPixels(i);
    out[i * 4] = (x + INSET) / ATLAS_W; out[i * 4 + 1] = (y + INSET) / ATLAS_H;
    out[i * 4 + 2] = (w - 2 * INSET) / ATLAS_W; out[i * 4 + 3] = (h - 2 * INSET) / ATLAS_H;
  }
  return out;
})();

export function cellIndex(name: FxCell): number { return FX_CELLS.indexOf(name); }

export const CELL = {
  flash_a: 0, flash_b: 1, flash_c: 2, flash_d: 3, smoke_a: 4, smoke_b: 5, dust_a: 6, dust_b: 7, spark: 8, soft_dot: 9, star4: 10, shard: 11,
  splinter: 12, sand_pour: 13, mote_cluster: 14, dec_wood: 15, dec_adobe: 16, dec_metal: 17, dec_ceramic: 18, dec_stone: 19,
} as const satisfies Record<FxCell, number>;
