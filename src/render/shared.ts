// Uniform objects shared by every material of src/render (ARCHITECTURE 8.1: "all uniforms are shared objects") and the
// GLSL they feed: fog, the two radial pulse terms, wrong_fade, and the grade that the `min` tier inlines.
import * as THREE from 'three';
import { VERTEX_LIGHT_SCALE } from '../core/contracts.ts';

export interface Uniform<T> { value: T }
const u = <T>(value: T): Uniform<T> => ({ value });

export const PULSE_SLOTS = 2;
/** vec4 slots of the shared block (see `SharedUniforms.uK`), and where the pulse and the grade sit in it */
export const K_SLOTS = 20;
const K_PULSE_POS = 5, K_PULSE_COL = 7;
export const K_GRADE_A = 16, K_GRADE_B = 17;
/** the fog of the open air, for exterior things seen from inside a building (see `uExtFogA`) */
const K_EXT_A = 18, K_EXT_B = 19;

/** One instance per render system (a page has one). */
export class SharedUniforms {
  /** seconds of simulation (clock.simTime): every shader animation reads this, never a wall clock */
  readonly uTime = u(0);
  // ---- fog (the colour is the horizon's: the sky reads the same uniforms)
  readonly uFogColA = u(new THREE.Color(0.58, 0.38, 0.29));
  readonly uFogColB = u(new THREE.Color(0.85, 0.5, 0.24));
  /** x: weight of the sun dot product, y: weight per metre of distance */
  readonly uFogMix = u(new THREE.Vector2(1, 0));
  readonly uFogDensity = u(0.0058);
  /** x: base height (world y), y: falloff per metre, z: extra density at the base */
  readonly uFogHeight = u(new THREE.Vector3(0, 0.35, 0));
  readonly uSunDir = u(new THREE.Vector3(-0.686, 0.242, -0.686));
  // ---- the fog of the open air, for exterior things seen from inside a building (polish round 2: the yard through
  // the Tally House doorway was drawn under the hall's dark fog and a navy "sky", as if it were night outside).
  // Materials of exterior zones, the sky and dynamic things lit by an exterior zone blend to these by `uExtFog.y`.
  readonly uExtFogA = u(new THREE.Color(0.58, 0.38, 0.29));
  readonly uExtFogB = u(new THREE.Color(0.85, 0.5, 0.24));
  /** x: density per metre, y: weight (0 under an exterior mood: the mood's own fog; 1 under an interior mood) */
  readonly uExtFog = u(new THREE.Vector2(0.0058, 0));
  /** height of the drawing buffer in pixels (far cards keep a smallest size on screen) */
  readonly uViewportH = u(540);
  // ---- the radial pulse (muzzle flash, the ring at the seventh)
  /** xyz: centre, w: ring radius in metres (0 = a filled pulse) */
  readonly uPulsePos = u([new THREE.Vector4(0, -1e4, 0, 0), new THREE.Vector4(0, -1e4, 0, 0)]);
  /** rgb: colour x intensity, w: falloff width in metres */
  readonly uPulseCol = u([new THREE.Vector4(0, 0, 0, 1), new THREE.Vector4(0, 0, 0, 1)]);
  /** how much of the pulse is added whatever the surface colour (the pale ring), per slot */
  readonly uPulseAdd = u([0, 0]);
  /** the most a filled pulse adds to a dynamic surface, linear, before the tone map: PULSE_CAP / exposure (see PULSE_GLSL) */
  readonly uPulseCap = u(PULSE_CAP);
  // ---- wrong_fade
  /** x: fade 0..1, y: radius of the ring behind which the fade is 1 (0 = none), z: world height under which the bore's glow has turned */
  readonly uWrong = u(new THREE.Vector4(0, 0, -1e5, 0));
  readonly uWrongCentre = u(new THREE.Vector3());
  // ---- cloud shadow
  /** xy: offset, z: 1 / pattern size in metres, w: depth (0.18 = light x 0.82 .. 1) */
  readonly uCloud = u(new THREE.Vector4(0, 0, 1 / 90, 0));
  readonly uNoise = u<THREE.Texture | null>(null);
  // ---- the current mood's dynamic light (what an unbaked world-material mesh and an instanced set's shading use)
  readonly uDynFlat = u(new THREE.Color(1, 1, 1));
  /**
   * How much brighter than the scene's white an emissive thing is drawn (lamps, knots, the Rule): 1 without bloom, EMISSIVE_HDR
   * on the High tier, where the bloom's threshold sits above everything that is lit and under everything that is a light.
   */
  readonly uHdr = u(1);
  /** what the fixed white key of a placeholder zone becomes under the mood (1 under the Long Light) */
  readonly uPlaceLight = u(new THREE.Color(1, 1, 1));
  readonly uKeyDir = u(new THREE.Vector3(0, 1, 0));
  readonly uSkyCol = u(new THREE.Color(0.3, 0.4, 0.5));
  // ---- the grade (the `min` tier compiles it into every material; Low and High run it in the merged pass)
  /** rgb: tint, w: saturation */
  readonly uGradeA = u(new THREE.Vector4(1, 1, 1, 1));
  /** rgb: lift, w: contrast */
  readonly uGradeB = u(new THREE.Vector4(0, 0, 0, 1));
  /** 1 on materials that carry the grade uniforms; a foreign material has 0 and shows the plain curve */
  readonly uGradeOn = u(1);
  /** lamp flicker: 1, or 0 with Reduce Flashes (steady strips) */
  readonly uFlicker = u(1);
  /**
   * THE BLOCK: every value above, packed into one vec4 array, the only shared uniform a material uploads (K_GLSL maps
   * the names onto it). Why: three uploads every uniform of a material each time the material comes up, and its
   * setters read `.x` / `.r` of whatever object they are given; those reads are megamorphic, so V8 boxes each double
   * (measured with the sampling heap profiler: 2.0 KB a frame in setValueV3f alone, of a 6 KB allowance). An array
   * uniform is one call that reads nothing. `pack()` copies the values in once per frame.
   */
  readonly uK = u(new Float32Array(K_SLOTS * 4));

  /** Once per frame, before anything is drawn: the values above into the block. */
  pack(): void {
    const k = this.uK.value;
    const a = this.uFogColA.value, b = this.uFogColB.value, mix = this.uFogMix.value, h = this.uFogHeight.value, sun = this.uSunDir.value;
    k[0] = a.r; k[1] = a.g; k[2] = a.b; k[3] = this.uFogDensity.value;
    k[4] = b.r; k[5] = b.g; k[6] = b.b; k[7] = this.uTime.value;
    const add = this.uPulseAdd.value;
    k[8] = mix.x; k[9] = mix.y; k[10] = add[0] as number; k[11] = add[1] as number;
    k[12] = h.x; k[13] = h.y; k[14] = h.z; k[15] = this.uFlicker.value;
    k[16] = sun.x; k[17] = sun.y; k[18] = sun.z; k[19] = this.uViewportH.value;
    const pp = this.uPulsePos.value, pc = this.uPulseCol.value;
    for (let i = 0; i < PULSE_SLOTS; i++) {
      const p = pp[i] as THREE.Vector4, c = pc[i] as THREE.Vector4;
      let o = (K_PULSE_POS + i) * 4;
      k[o] = p.x; k[o + 1] = p.y; k[o + 2] = p.z; k[o + 3] = p.w;
      o = (K_PULSE_COL + i) * 4;
      k[o] = c.x; k[o + 1] = c.y; k[o + 2] = c.z; k[o + 3] = c.w;
    }
    const w = this.uWrong.value, wc = this.uWrongCentre.value, cl = this.uCloud.value;
    k[36] = w.x; k[37] = w.y; k[38] = w.z; k[39] = w.w;
    k[40] = wc.x; k[41] = wc.y; k[42] = wc.z; k[43] = 0;
    k[44] = cl.x; k[45] = cl.y; k[46] = cl.z; k[47] = cl.w;
    const dyn = this.uDynFlat.value, pl = this.uPlaceLight.value, kd = this.uKeyDir.value, sky = this.uSkyCol.value;
    k[48] = dyn.r; k[49] = dyn.g; k[50] = dyn.b; k[51] = this.uHdr.value;
    k[52] = pl.r; k[53] = pl.g; k[54] = pl.b; k[55] = this.uPulseCap.value;
    k[56] = kd.x; k[57] = kd.y; k[58] = kd.z; k[59] = 0;
    k[60] = sky.r; k[61] = sky.g; k[62] = sky.b; k[63] = 0;
    const ga = this.uGradeA.value, gb = this.uGradeB.value;
    k[64] = ga.x; k[65] = ga.y; k[66] = ga.z; k[67] = ga.w;
    k[68] = gb.x; k[69] = gb.y; k[70] = gb.z; k[71] = gb.w;
    const ea = this.uExtFogA.value, eb = this.uExtFogB.value, ef = this.uExtFog.value;
    let o = K_EXT_A * 4;
    k[o] = ea.r; k[o + 1] = ea.g; k[o + 2] = ea.b; k[o + 3] = ef.x;
    o = K_EXT_B * 4;
    k[o] = eb.r; k[o + 1] = eb.g; k[o + 2] = eb.b; k[o + 3] = ef.y;
  }

  /** The uniforms every lit or fogged material needs, by reference: the block, the noise texture, the grade switch. */
  attach(target: Record<string, Uniform<unknown>>): void {
    target.uK = this.uK; target.uNoise = this.uNoise; target.uGradeOn = this.uGradeOn;
  }
}

/**
 * The block's declaration and the names of its fields. Every chunk below starts with it; the guards make a second
 * inclusion a no-op. The declaration has a guard of its own because the `min` tier's tone-map hook declares the array
 * (and only the array: no macro leaks into a material that is not ours) in every tone-mapped fragment shader.
 */
export const K_DECL_GLSL = /* glsl */`
#ifndef KEEP_K_DECL
#define KEEP_K_DECL
uniform vec4 uK[ ${K_SLOTS} ];
#endif
`;
export const K_GLSL = /* glsl */`
${K_DECL_GLSL}
#ifndef KEEP_K
#define KEEP_K
#define uFogColA uK[ 0 ].xyz
#define uFogDensity uK[ 0 ].w
#define uFogColB uK[ 1 ].xyz
#define uTime uK[ 1 ].w
#define uFogMix uK[ 2 ].xy
#define uFogHeight uK[ 3 ].xyz
#define uFlicker uK[ 3 ].w
#define uSunDir uK[ 4 ].xyz
#define uViewportH uK[ 4 ].w
#define uWrong uK[ 9 ]
#define uWrongCentre uK[ 10 ].xyz
#define uCloud uK[ 11 ]
#define uDynFlat uK[ 12 ].xyz
#define uHdr uK[ 12 ].w
#define uPlaceLight uK[ 13 ].xyz
#define uPulseCap uK[ 13 ].w
#define uKeyDir uK[ 14 ].xyz
#define uSkyCol uK[ 15 ].xyz
#endif
`;

/** Fog: 1 - exp(-density x (distance + the height integral)); its colour is the horizon's for that heading. */
export const FOG_GLSL = /* glsl */`
${K_GLSL}
vec3 keepFogColour( vec3 dir, float dist ) {
	float s = dot( dir, uSunDir ) * 0.5 + 0.5;
	return mix( uFogColA, uFogColB, clamp( uFogMix.x * s * s + uFogMix.y * dist, 0.0, 1.0 ) );
}
float keepFogAmount( vec3 ray, float dist ) {
	float fk = clamp( uFogHeight.y * ray.y, -1.5, 30.0 );
	float fh = uFogHeight.z * exp( - uFogHeight.y * max( cameraPosition.y - uFogHeight.x, 0.0 ) );
	float hInt = fh * dist * ( abs( fk ) > 1e-3 ? ( 1.0 - exp( - fk ) ) / fk : 1.0 );
	return clamp( 1.0 - exp( - uFogDensity * ( dist + hInt ) ), 0.0, 1.0 );
}
vec3 keepFog( vec3 c, vec3 wpos ) {
	vec3 ray = wpos - cameraPosition;
	float dist = length( ray );
	return mix( c, keepFogColour( ray / max( dist, 1e-4 ), dist ), keepFogAmount( ray, dist ) );
}
// The same for a thing that stands in the open air (ext = 1): under an interior mood it keeps the Long Light's fog
// (uK[ ${K_EXT_A} ]: colour away from the sun + density, uK[ ${K_EXT_B} ]: colour toward the sun + weight), no height term.
vec3 keepFogColourE( vec3 dir, float dist, float ext ) {
	float w = ext * uK[ ${K_EXT_B} ].w;
	vec3 base = keepFogColour( dir, dist );
	if ( w <= 0.0 ) return base;
	float s = dot( dir, vec3( -0.686, 0.242, -0.686 ) ) * 0.5 + 0.5;
	return mix( base, mix( uK[ ${K_EXT_A} ].xyz, uK[ ${K_EXT_B} ].xyz, clamp( s * s, 0.0, 1.0 ) ), w );
}
float keepFogAmountE( vec3 ray, float dist, float ext ) {
	float w = ext * uK[ ${K_EXT_B} ].w;
	float base = keepFogAmount( ray, dist );
	if ( w <= 0.0 ) return base;
	return mix( base, clamp( 1.0 - exp( - uK[ ${K_EXT_A} ].w * dist ), 0.0, 1.0 ), w );
}
vec3 keepFogE( vec3 c, vec3 wpos, float ext ) {
	vec3 ray = wpos - cameraPosition;
	float dist = length( ray );
	return mix( c, keepFogColourE( ray / max( dist, 1e-4 ), dist, ext ), keepFogAmountE( ray, dist, ext ) );
}
`;

/**
 * The two radial pulse slots: a filled falloff (muzzle) or a band at a radius (the ring).
 *
 * Polish round 4 (critic: "the muzzle pulse turns nearby dynamic things into flat orange cut-outs"). A filled pulse was
 *   - on m_prop / m_gun: `colour x 3 x falloff^2 x (0.35 + 0.65 N.L)` in the VERTEX shader (one flat value over a face
 *     whose vertices are metres apart: the Windlass's plates);
 *   - on a world material, static or skinned (a Bider's cloth, the bore's door jambs): `colour x 3 x falloff^2 x albedo`
 *     with no normal at all.
 * Under an interior exposure of 1.75 to 2.5 the red channel of everything within about 4 m clipped: a Bider, the hand
 * and a jamb were one flat orange shape for the frames of a shot. Now every material that takes the pulse does this,
 * per pixel:
 *   - the irradiance is `keepPulseCore`: the pulse's colour, drawn toward its own white near the centre (PULSE_CORE);
 *   - what it adds to a surface is `keepPulseKnee( albedo x irradiance ) x N.L`: the knee holds the added radiance
 *     under PULSE_CAP of display white (uPulseCap = PULSE_CAP / exposure, linear, before the tone map), and N.L is
 *     applied AFTER the knee, so the shading of the form is never compressed away by the clamp;
 *   - N.L has a floor of PULSE_WRAP (bounce: a face turned away is dim, not black).
 * The normal is the interpolated one on m_prop / m_gun and the face's own (screen derivatives) on a world material,
 * which has no normal attribute. On the frames between shots `keepPulseOn()` is false and the pulse costs one uniform
 * test (it was two distances and a square per pixel of every world surface, always).
 * The ring (a slot with a radius) is as it was: `keepPulseLit` returns it, to be multiplied by the albedo.
 * The three numbers are the look teams' to tune; tests/render/pulse.test.mjs holds the behaviour, not the numbers.
 */
export const PULSE_CAP = 0.6, PULSE_WRAP = 0.12, PULSE_CORE = 0.7;
export const PULSE_GLSL = /* glsl */`
${K_GLSL}
// false on every frame between two shots: both slots are black and nothing of the pulse is paid for
bool keepPulseOn() {
	vec3 c = uK[ ${K_PULSE_COL} ].rgb + uK[ ${K_PULSE_COL} + 1 ].rgb;
	return c.r + c.g + c.b > 0.0;
}
// a filled pulse's irradiance at falloff f (0 at its edge, 1 at its centre): its colour, paler toward the centre
vec3 keepPulseCore( vec3 col, float f ) {
	float m = max( col.r, max( col.g, col.b ) );
	return mix( col, mix( col, vec3( m ), ${PULSE_CORE.toFixed(2)} ), smoothstep( 0.55, 1.0, f ) ) * ( f * f );
}
// the soft clamp of what a filled pulse adds to a dynamic surface: never more than uPulseCap in any channel, hue kept
vec3 keepPulseKnee( vec3 add ) {
	float cap = uPulseCap;
	return add * ( cap / ( cap + max( add.r, max( add.g, add.b ) ) ) );
}
// dynamic things. Returns the ring's light (as before); \`filled\` gets the filled pulses' irradiance (rgb, before the
// albedo and the knee) and their N.L weight (a): the caller adds keepPulseKnee( albedo * filled.rgb ) * filled.a
vec3 keepPulseLit( vec3 wpos, vec3 n, out vec4 filled ) {
	vec3 sum = vec3( 0.0 ), irr = vec3( 0.0 ), shaded = vec3( 0.0 );
	for ( int i = 0; i < ${PULSE_SLOTS}; i ++ ) {
		vec4 pp = uK[ ${K_PULSE_POS} + i ], pc = uK[ ${K_PULSE_COL} + i ];
		vec3 to = pp.xyz - wpos;
		float d = length( to );
		float f = clamp( 1.0 - abs( d - pp.w ) / pc.w, 0.0, 1.0 );
		if ( pp.w > 0.0 ) sum += pc.rgb * ( f * f );
		else {
			vec3 e = keepPulseCore( pc.rgb, f );
			irr += e;
			shaded += e * ( ${PULSE_WRAP.toFixed(2)} + ${(1 - PULSE_WRAP).toFixed(2)} * max( dot( n, to / max( d, 1e-3 ) ), 0.0 ) );
		}
	}
	// one weight for both slots: the shaded sum over the plain one (by the brightest channel)
	float mi = max( irr.r, max( irr.g, irr.b ) );
	filled = vec4( irr, mi > 1e-5 ? max( shaded.r, max( shaded.g, shaded.b ) ) / mi : 0.0 );
	return sum;
}
`;

/** wrong_fade at a point: the global value, or 1 behind the ring while it races outward. */
export const WRONG_GLSL = /* glsl */`
${K_GLSL}
float keepWrong( vec3 wpos ) {
	float behind = uWrong.y > 0.0 ? step( distance( wpos, uWrongCentre ), uWrong.y ) : 0.0;
	return max( uWrong.x, behind );
}
`;

/**
 * The grade (ART_BIBLE 11.1): saturation, contrast about mid-grey in square-root space, tint, then the lift. The lift
 * is what keeps every pixel at or above `#0B0D12` (the tone map has no toe). `vig` is the vignette's darkening, applied
 * before the lift so the corners keep the floor too.
 */
const gradeFn = (a: string, b: string): string => /* glsl */`
vec3 keepGrade( vec3 c, float vig ) {
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( vec3( l ), c, ${a}.w );
	vec3 s = max( ( sqrt( max( c, 0.0 ) ) - 0.5 ) * ${b}.w + 0.5, 0.0 );
	c = s * s * ${a}.rgb * ( 1.0 - vig );
	return c + ${b}.rgb * ( 1.0 - min( c, 1.0 ) );
}
`;
/** the merged post pass: the grade's two vectors are uniforms of its own */
export const GRADE_GLSL = /* glsl */`
uniform vec4 uGradeA;
uniform vec4 uGradeB;
${gradeFn('uGradeA', 'uGradeB')}`;
/** the `min` tier, inside every material: the grade read from the block (declared, no names defined) */
export const GRADE_INLINE_GLSL = /* glsl */`
${K_DECL_GLSL}
${gradeFn(`uK[ ${K_GRADE_A} ]`, `uK[ ${K_GRADE_B} ]`)}`;

export const VLS = VERTEX_LIGHT_SCALE.toFixed(1);

/** the three emissive hues and their cores (ART_BIBLE 2.1), linear */
export const HUE = {
  flame: new THREE.Color(0xff9433), flameCore: new THREE.Color(0xffe9b8),
  aqua: new THREE.Color(0x7cf2e2), aquaCore: new THREE.Color(0xe6fffb),
  violet: new THREE.Color(0xb24bff), violetCore: new THREE.Color(0xf0dcff),
  husk: new THREE.Color(0x8a8a92), smoke: new THREE.Color(0xb9a79c), sand: new THREE.Color(0xcda070),
  blade: new THREE.Color(0xffd9a8), white: new THREE.Color(0xffffff),
} as const;
