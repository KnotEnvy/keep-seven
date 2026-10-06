// THE GAME'S TONE MAP (producer ruling, binding): a shoulder-only curve with NO TOE, knee 0.8.
//
// Linear values up to 0.8 are displayed exactly as authored (no toe, no desaturation: a dark palette colour on screen is
// the colour in the file); only above 0.8 does a shoulder roll the BRIGHTEST channel off toward 1.0, hue kept, with
// slope 1 at the knee and never reaching 1 (baked vertex light reaches 2 x tint on pale surfaces).
//
// It is NOT three's NeutralToneMapping, whose toe subtracts up to 0.04 linear from every colour (steel 54,82,90 would be
// shown as 23,67,77, gun_blue 28,34,48 as 3,16,37).
//
// The core stub renderer (src/core/stubs/basicRender.ts), and through it sandbox/viewer.html and every <id>_game.png,
// uses exactly this. `src/render` MUST apply the same curve before its grade, so that what artists judge in the viewer is
// what the game shows before grade. Two ways:
//   - a plain WebGLRenderer pass: `installToneMap(THREE.ShaderChunk)` once before any material compiles, then
//     `renderer.toneMapping = THREE.CustomToneMapping` (what basicRender does);
//   - a merged post pass: paste TONE_MAP_GLSL (rename the function, define `toneMappingExposure` or delete that line and
//     multiply by your exposure first) and call it on the linear colour before the grade.
// `toneMap()` below is the same curve in JS, for tests.

/** linear values at and below this are displayed untouched */
export const TONE_MAP_KNEE = 0.8;

const K = TONE_MAP_KNEE.toFixed(1), R = (1 - TONE_MAP_KNEE).toFixed(1);
/** The curve as GLSL, in the shape of three's `CustomToneMapping` hook (it reads the `toneMappingExposure` uniform). */
export const TONE_MAP_GLSL = `vec3 CustomToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	float m = max( color.r, max( color.g, color.b ) );
	if ( m <= ${K} ) return color;
	float t = m - ${K};
	return color * ( ( ${K} + ${R} * t / ( t + ${R} ) ) / m );
}`;

const STOCK = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
/**
 * Puts TONE_MAP_GLSL in place of three's empty CustomToneMapping (pass `THREE.ShaderChunk`). Idempotent; throws when
 * three's chunk no longer has the stub to replace. Then set `renderer.toneMapping = THREE.CustomToneMapping`.
 */
export function installToneMap(shaderChunk: { tonemapping_pars_fragment: string }): void {
  const chunk = shaderChunk.tonemapping_pars_fragment;
  if (chunk.includes(TONE_MAP_GLSL)) return;
  if (!chunk.includes(STOCK)) throw new Error('installToneMap: three\'s tonemapping chunk has no CustomToneMapping stub to replace');
  shaderChunk.tonemapping_pars_fragment = chunk.replace(STOCK, TONE_MAP_GLSL);
}

/** The same curve in JS: linear RGB (already multiplied by the exposure) in, linear display RGB out (written to `out`). */
export function toneMap(r: number, g: number, b: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const m = Math.max(r, g, b);
  let k = 1;
  if (m > TONE_MAP_KNEE) {
    const t = m - TONE_MAP_KNEE, room = 1 - TONE_MAP_KNEE;
    k = (TONE_MAP_KNEE + room * t / (t + room)) / m;
  }
  out[0] = r * k; out[1] = g * k; out[2] = b * k;
  return out;
}
