// The post chain per tier (ARCHITECTURE 8.2, code-render 4.1):
//   min   no composer: the shoulder tone map + grade are compiled into every material through CustomToneMapping,
//         the vignette is one alpha-blended quad, no grain. 0 full-screen passes.
//   low   postprocessing, HalfFloat buffers, ONE merged pass: tone map + grade + vignette + grain. 1 full-screen pass.
//   high  the contact shade, the sun shafts, the air light and the bloom merged into that pass (half-res luminance, 5 levels, additive, threshold BLOOM_THRESHOLD of DISPLAY white,
//         intensity BLOOM_INTENSITY), then FXAA as
//         a second pass with the grain in it (FXAA would smear a grain laid down before it). 12 full-screen passes.
// The tone map is core's TONE_MAP_GLSL, the very string basicRender installs (producer ruling 15): no toe, knee 0.8.
import * as THREE from 'three';
import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, FXAAEffect } from 'postprocessing';
import type { QualityFeatures, RenderTier, TierDef } from '../core/contracts.ts';
import { TONE_MAP_GLSL, installToneMap } from '../core/tonemap.ts';
import { GRADE_GLSL, GRADE_INLINE_GLSL } from './shared.ts';
import type { SharedUniforms } from './shared.ts';
import { FLOOR_LINEAR } from './moods.ts';

const FLOOR_GLSL = `vec3( ${FLOOR_LINEAR[0].toFixed(6)}, ${FLOOR_LINEAR[1].toFixed(6)}, ${FLOOR_LINEAR[2].toFixed(6)} )`;
/** inner radius, outer radius (in screen heights from the centre) of the vignette */
const VIGNETTE_INNER = 0.45, VIGNETTE_OUTER = 1.05;
/**
 * The High tier's bloom (polish round 3: High measured within one grey level of Low in 49 matched frames). Its threshold
 * was 1.0 of the SCENE's linear light before the exposure: under the interior moods (exposure x1.5 to x2) nothing but
 * the muzzle flash ever reached it, and no lamp bloomed. The threshold is now a DISPLAY level: BLOOM_THRESHOLD divided
 * by the frame's exposure, every frame; emissive things are drawn EMISSIVE_HDR times brighter on this tier
 * (SharedUniforms.uHdr), so lamps, knots, the Rule and the flash are over it and lit surfaces are under it.
 */
export const BLOOM_THRESHOLD = 1.15, BLOOM_INTENSITY = 0.9, EMISSIVE_HDR = 2.0;
/** the luminance pass's own knee, in scene light (a mood may ask for a wider one: moods.ts M_BLOOM_S) */
export const BLOOM_SMOOTHING = 0.15;

/**
 * `min`: put the grade behind core's curve inside three's CustomToneMapping hook. Core's text stays in the chunk
 * unchanged (installToneMap remains idempotent); a material that does not carry the grade uniforms (uGradeOn = 0) shows
 * the plain curve.
 */
export function installInlineGrade(): void {
  installToneMap(THREE.ShaderChunk);
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  if (chunk.includes('keepShoulderCurve')) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(TONE_MAP_GLSL, `#define CustomToneMapping keepShoulderCurve
${TONE_MAP_GLSL}
#undef CustomToneMapping
uniform float uGradeOn;
${GRADE_INLINE_GLSL}
vec3 CustomToneMapping( vec3 color ) {
	color = keepShoulderCurve( color );
	return uGradeOn > 0.5 ? max( keepGrade( color, 0.0 ), ${FLOOR_GLSL} ) : color;
}`);
}

const SHOULDER = TONE_MAP_GLSL.replace('CustomToneMapping', 'keepShoulder').replace('toneMappingExposure', 'uExposure');
if (!SHOULDER.includes('keepShoulder') || !SHOULDER.includes('uExposure')) throw new Error('post: TONE_MAP_GLSL no longer has the names the merged pass renames');

const HASH = /* glsl */`
float keepHash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
`;

const GRADE_FRAGMENT = /* glsl */`
uniform float uExposure;
uniform vec3 uVignette;
uniform float uGrain;
uniform float uSeed;
${SHOULDER}
${GRADE_GLSL}
${HASH}
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
	vec3 c = keepShoulder( max( inputColor.rgb, 0.0 ) );
	vec2 d = ( uv - 0.5 ) * vec2( aspect, 1.0 );
	float vig = smoothstep( uVignette.x, uVignette.y, length( d ) ) * uVignette.z;
	c = keepGrade( c, vig );
	// grain in square-root space (about display space): it is also the dither that hides sky and fog banding
	vec3 s = sqrt( c ) + ( keepHash( uv * resolution + uSeed * 61.7 ) - 0.5 ) * uGrain;
	c = s * s;
	outputColor = vec4( max( c, ${FLOOR_GLSL} ), inputColor.a );
}
`;

const GRAIN_FRAGMENT = /* glsl */`
uniform float uGrain;
uniform float uSeed;
${HASH}
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
	vec3 s = sqrt( max( inputColor.rgb, 0.0 ) ) + ( keepHash( uv * resolution + uSeed * 61.7 ) - 0.5 ) * uGrain;
	outputColor = vec4( max( s * s, ${FLOOR_GLSL} ), inputColor.a );
}
`;

/**
 * The High tier's contact shade (polish round 4, lead ruling R9; CLAUDE.md's High column: "optional AO"). In the station
 * and the bore nothing blooms but a few lamps, and High measured 0.3 to 0.5 of 255 from Low there. What a baked room
 * lacks is the shade of what was not in the bake: an enemy's feet on the plate, a crate against a wall, the cage in its
 * well, the gun's side of a pillar. One term in the merged pass, from the scene's own depth (no normal pass, no second
 * scene draw, no extra target: the composer's input buffer carries a depth TEXTURE on this tier instead of a depth
 * renderbuffer): AO_TAPS taps on a spiral of AO_RADIUS metres round the point, each weighed by how far it stands over
 * the surface's plane (the normal is the depth's own differences). The view-model is drawn into the nearest VM_DEPTH_RANGE of
 * the depth range (system.ts) and takes and gives no shade; the sky takes none; the shade is gone by AO_FAR metres.
 */
export const AO_RADIUS = 0.55, AO_INTENSITY = 20, AO_FAR = 45, AO_TAPS = 16, AO_FLOOR = 0.45;
/**
 * Underground look, pass i1 (visual reviewer: "dirty dark halos round small wall props in the lift cage; the wall bands
 * get grainy dark edges; Low shows the same frame clean"). A thing must stand AO_THIN metres over a surface before it
 * shades it (it was 5 mm): a plate, a band, a bezel or a seam a finger proud of a wall is in the bake and in its own
 * drawing, and what the taps made of it was a stippled smudge wider than the thing. Feet, crates, pillars and bodies
 * stand far over it and keep their shade (AO_INTENSITY 15 -> 20: with the thin things gone the creases that are left carry
 * the term). And a pale lit wall (the cages' enamel) loses more of the shade, sooner (AO_LIT 0.7 / 0.30 / 0.85 -> 0.8 / 0.25 / 0.70).
 */
export const AO_THIN = 0.028;
/** the share of the depth range the view-model is drawn into where the world's depth is kept for the contact shade */
export const VM_DEPTH_RANGE = 0.05;
const VM_DEPTH_RANGE_TEXT = VM_DEPTH_RANGE.toFixed(3);
/** how much of the contact shade is left under a sky (the mood's M_SKY) */
export const AO_SKY = 0.75;
/** the share of the contact shade a lit surface loses, between two DISPLAY levels of its own light (polish round 5) */
export const AO_LIT = 0.8, AO_LIT_FROM = 0.25, AO_LIT_TO = 0.70;
/** the most one tap of the contact shade may weigh, before its falloff (release pass p0) */
export const AO_TAP = 0.55;
const AO_FRAGMENT = /* glsl */`
uniform highp sampler2D uAoDepth;
uniform vec4 uAoProj;   // tan(half fov) x, y; near; far
uniform vec4 uAoK;      // radius in metres, strength, far fade in metres, on
uniform float uAoExposure;
vec3 keepAoPos( const in vec2 uv, const in float d ) {
	float z = ( uAoProj.z * uAoProj.w ) / ( ( uAoProj.w - uAoProj.z ) * d - uAoProj.w );
	return vec3( ( uv * 2.0 - 1.0 ) * uAoProj.xy * - z, z );
}
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
	outputColor = inputColor;
	float d = texture2D( uAoDepth, uv ).r;
	if ( uAoK.w < 0.5 || d >= 0.99999 || d <= ${VM_DEPTH_RANGE.toFixed(3)} ) return;
	vec3 p = keepAoPos( uv, d );
	float dist = - p.z;
	float fade = 1.0 - smoothstep( uAoK.z * 0.5, uAoK.z, dist );
	if ( fade <= 0.0 ) return;
	// the surface's plane from its nearer neighbours on each axis (a derivative across a silhouette would tilt it)
	vec3 px = keepAoPos( uv + vec2( texelSize.x, 0.0 ), texture2D( uAoDepth, uv + vec2( texelSize.x, 0.0 ) ).r ) - p;
	vec3 mx = p - keepAoPos( uv - vec2( texelSize.x, 0.0 ), texture2D( uAoDepth, uv - vec2( texelSize.x, 0.0 ) ).r );
	vec3 py = keepAoPos( uv + vec2( 0.0, texelSize.y ), texture2D( uAoDepth, uv + vec2( 0.0, texelSize.y ) ).r ) - p;
	vec3 my = p - keepAoPos( uv - vec2( 0.0, texelSize.y ), texture2D( uAoDepth, uv - vec2( 0.0, texelSize.y ) ).r );
	vec3 n = normalize( cross( abs( px.z ) < abs( mx.z ) ? px : mx, abs( py.z ) < abs( my.z ) ? py : my ) );
	// radius on screen (in uv), never more than 4.5 % of the height: sixteen fixed taps spread wider than that draw a
	// bezel's or a cable's shade as sixteen stepped copies of it on a wall at arm's length
	float r = min( uAoK.x / ( 2.0 * uAoProj.y * dist ), 0.045 );
	vec2 ruv = vec2( r * uAoProj.y / uAoProj.x, r );
	// the spiral is turned per pixel by an interleaved gradient: the same spiral everywhere drew a lamp bezel's shade as
	// stepped copies of the bezel, four turns over 2 x 2 pixels as a screen door; this is a fine stipple inside the capped
	// radius, of the grain's own size, and the FXAA pass and the grain after it take it in
	float turn = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
	float sum = 0.0, top = 0.0;
	float r2 = uAoK.x * uAoK.x;
	for ( int i = 0; i < ${AO_TAPS}; i ++ ) {
		float t = ( float( i ) + 0.5 ) / ${AO_TAPS}.0;
		float a = turn + float( i ) * 2.3999632;
		vec2 at = uv + vec2( cos( a ), sin( a ) ) * ruv * sqrt( t );
		float ds = texture2D( uAoDepth, at ).r;
		if ( ds <= ${VM_DEPTH_RANGE.toFixed(3)} ) continue;
		vec3 v = keepAoPos( at, ds ) - p;
		float dd = dot( v, v );
		// over the plane by more than 5 mm and 0.4 % of the distance (flat ground at a grazing angle shades nothing), and inside the radius
		// release pass p0 (visual reviewer: "dark speckle round the dispenser on High"): a tap's say is capped at AO_TAP
		// before its falloff. Uncapped, a box 0.3 m proud of a wall was worth 2 to 6 a tap, two taps of sixteen took the
		// wall to AO_FLOOR, and the shade was a hard-edged dark blot half a metre wide with the stipple as its edge; capped,
		// the shade grows with the SHARE of the taps that find the box: a ramp from the contact outward
		float w = min( max( 0.0, dot( v, n ) - ${AO_THIN.toFixed(3)} - 0.004 * dist ) / ( dd + 0.0004 ), ${AO_TAP.toFixed(2)} ) * step( dd, r2 ) * ( 1.0 - dd / r2 );
		sum += w; top = max( top, w );
	}
	// polish round 5 (visual critic: "dithered dark speckles round the wall-lamp boxes and the stuck stakes"): what ONE
	// tap of sixteen finds is not a shade, it is the stipple: a stake a hand wide, the rim of a bezel. The strongest
	// tap is left out (a corner or a body over the plate is found by many and keeps its shade) ...
	sum = max( sum - top, 0.0 ) * ${(AO_TAPS / (AO_TAPS - 1)).toFixed(4)};
	// ... and a surface in a lamp's own pool takes less of it: the shade belongs to the fill, not to direct light
	float lit = dot( inputColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * uAoExposure;
	fade *= 1.0 - ${AO_LIT.toFixed(2)} * smoothstep( ${AO_LIT_FROM.toFixed(2)}, ${AO_LIT_TO.toFixed(2)}, lit );
	// never darker than AO_FLOOR of the baked light: a shade, not a hole (p0: approached on a shoulder, not met at an edge)
	float ao = mix( 1.0, 1.0 - ${(1 - AO_FLOOR).toFixed(2)} * ( 1.0 - exp( - sum * uAoK.x * ( uAoK.y / ${AO_TAPS}.0 ) / ${(1 - AO_FLOOR).toFixed(2)} ) ), fade );
	outputColor = vec4( inputColor.rgb * ao, inputColor.a );
	if ( uAoK.w > 1.5 ) outputColor = vec4( vec3( ao * ao ) * 0.3, 1.0 );   // debug view (aoK.w = 2): the shade alone
}
`;
class ContactShadeEffect extends Effect {
  constructor(readonly depth: THREE.Uniform<THREE.Texture | null>, readonly proj: THREE.Uniform<THREE.Vector4>, readonly k: THREE.Uniform<THREE.Vector4>, exposure: THREE.Uniform<number>) {
    super('KeepContactShade', AO_FRAGMENT, { blendFunction: BlendFunction.SRC, uniforms: new Map<string, THREE.Uniform>([['uAoDepth', depth], ['uAoProj', proj], ['uAoK', k], ['uAoExposure', exposure]]) });
  }
}

/**
 * The High tier's sun shafts (look team exterior, release pass p0; lead ruling R9: in the gully, at the lip gate and in
 * the yard High drew Low's frame, 0.8 to 2.3 of 255 apart). Outdoors by day the dust of the Long Light hangs in the air
 * and the sun stands 14 degrees up: what the baked world lacks is the light IN that air. One more term of the merged
 * pass, from the depth the contact shade already reads (no target, no extra pass): from each pixel SHAFT_TAPS steps
 * toward the sun's place on screen, over at most SHAFT_REACH screen heights, counting the sky it crosses (nearer steps
 * weigh more); the share is added in the sun's colour, falling off with the distance from the sun on screen. So the sky
 * spills over the roof lines, the derrick's lattice and the gate's timbers in streaks that point away from the sun,
 * and a wall that hides the sun has a lit edge. The view-model stands in front of the air and takes none; with the sun
 * behind her (SHAFT_FACE) or without a sun disc (indoors, the blue hour) the term is off. Low and min have none of it.
 */
export const SHAFT_K = 0.2, SHAFT_TAPS = 16, SHAFT_REACH = 0.62, SHAFT_DECAY = 0.90, SHAFT_FALL = 2.6, SHAFT_SKY = 0.2, SHAFT_NEAR = 18, SHAFT_FAR = 80;
/**
 * The sun's veil (look team exterior, pass i1; R9: the yard and the lip gate were still 1.5 to 2.0 of 255 from Low). The
 * shafts need sky between her and the sun; across the yard and through the gate there is a wall there. What the dusty
 * air of the Long Light does whatever stands in the way is glow between her and the middle distance on the sun's side
 * of the frame: VEIL_K of the shafts' strength, on things VEIL_FROM to VEIL_TO metres off, gone again by VEIL_END (the
 * mesa, the pylon line and the figure on the skyline keep their dark), falling off with the distance from the sun on
 * screen by VEIL_FALL (wider than the shafts). The sky and the view-model take none. Same pass, no new sample.
 * `PostChain.shaftVeil` is the system's: VEIL_K in the open under the Long Light (the forecourt, the street, the yard),
 * VEIL_GULLY of it between the gully's walls (the sun never reaches that air: at full strength the gully went to milk),
 * nothing under the overhang (L0: the mouth is the frame's one bright thing and must not spread).
 */
export const VEIL_GULLY = 0.5;
export const VEIL_K = 0.70, VEIL_FROM = 5, VEIL_TO = 28, VEIL_END_FROM = 70, VEIL_END_TO = 130, VEIL_FALL = 0.45;
/** the veil on a dark thing as a share of itself, and the scene light (linear) between which a thing counts as dark or lit (exterior look, pass i3) */
export const VEIL_DARK = 0.30, VEIL_LIT: readonly [number, number] = [0.06, 0.40];
/** cosine of the angle between the view and the sun where the shafts start and where they are whole */
export const SHAFT_FACE_FROM = 0.12, SHAFT_FACE_TO = 0.5;
const SHAFT_FRAGMENT = /* glsl */`
uniform highp sampler2D uShDepth;
uniform vec4 uShSun;   // the sun on screen (uv) x, y; strength; seed
uniform vec3 uShCol;
uniform vec2 uShProj;  // near, far
uniform float uShVeil;
${HASH}
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
	outputColor = inputColor;
	if ( uShSun.z < 0.002 ) return;
	float own = texture2D( uShDepth, uv ).r;
	if ( own <= ${VM_DEPTH_RANGE_TEXT} ) return;
	vec2 to = ( uShSun.xy - uv ) * vec2( aspect, 1.0 );
	float len = max( length( to ), 1e-4 );
	vec2 stp = to / len * ( min( len, ${SHAFT_REACH.toFixed(2)} ) / ${SHAFT_TAPS}.0 ) / vec2( aspect, 1.0 );
	float j = keepHash( uv * resolution + uShSun.w * 37.1 );
	float sum = 0.0, w = 1.0, all = 0.0;
	for ( int i = 0; i < ${SHAFT_TAPS}; i ++ ) {
		vec2 at = uv + stp * ( float( i ) + j );
		vec2 in01 = step( vec2( 0.0 ), at ) * step( at, vec2( 1.0 ) );
		sum += step( 0.99999, texture2D( uShDepth, at ).r ) * in01.x * in01.y * w;
		all += w;
		w *= ${SHAFT_DECAY.toFixed(2)};
	}
	// The sky is its own light already: it takes SHAFT_SKY of the term (a halo round the sun, not a bleached sky), and so
	// does whatever stands far off against it: a pylon, a mesa, the figure on the skyline keep their dark against the sky
	// (at one share for all, a thin far silhouette was lifted to the sky's level). The shafts are in the NEAR air.
	float dist = ( uShProj.x * uShProj.y ) / ( uShProj.y - own * ( uShProj.y - uShProj.x ) );
	float k = sum / all / ( 1.0 + len * len * ${SHAFT_FALL.toFixed(2)} ) * mix( 1.0, ${SHAFT_SKY.toFixed(2)}, smoothstep( ${SHAFT_NEAR.toFixed(1)}, ${SHAFT_FAR.toFixed(1)}, dist ) );
	float veil = ( 1.0 - step( 0.99999, own ) ) * smoothstep( ${VEIL_FROM.toFixed(1)}, ${VEIL_TO.toFixed(1)}, dist ) * ( 1.0 - smoothstep( ${VEIL_END_FROM.toFixed(1)}, ${VEIL_END_TO.toFixed(1)}, dist ) ) / ( 1.0 + len * len * ${VEIL_FALL.toFixed(2)} );
	// exterior look, pass i3 (the visual reviewer: "in the street High's haze lowers contrast, so Low arguably looks crisper";
	// R9): the veil was one level added to everything in its range, and what it did to a shaded wall or the dark of a
	// doorway was milk. The dusty air glows where there is light BEHIND it to carry: a lit thing takes the veil whole
	// (VEIL_LIT), a dark one VEIL_DARK of it; VEIL_K is 0.70 (0.85). The lit side warms, the shade keeps its depth.
	veil *= mix( ${VEIL_DARK.toFixed(2)}, 1.0, smoothstep( ${VEIL_LIT[0].toFixed(2)}, ${VEIL_LIT[1].toFixed(2)}, dot( inputColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
	outputColor.rgb += uShCol * ( ( k + uShVeil * veil ) * uShSun.z );
}
`;
class SunShaftEffect extends Effect {
  constructor(depth: THREE.Uniform<THREE.Texture | null>, sun: THREE.Uniform<THREE.Vector4>, col: THREE.Uniform<THREE.Vector3>, proj: THREE.Uniform<THREE.Vector2>, veil: THREE.Uniform<number>) {
    super('KeepSunShafts', SHAFT_FRAGMENT, { blendFunction: BlendFunction.SRC, uniforms: new Map<string, THREE.Uniform>([['uShDepth', depth], ['uShSun', sun], ['uShCol', col], ['uShProj', proj], ['uShVeil', veil]]) });
  }
}

/**
 * The High tier's heat shimmer (render-tech, pass i1; ART_BIBLE 3.2 and 10: "heat shimmer on the horizon band (High
 * only): post UV offset"; QualityFeatures.heatShimmer had no reader). Outdoors by day the air over the plain boils: the
 * merged pass reads its input up to SHIMMER_PX pixels higher or lower along a slow wave, inside a band of SHIMMER_BAND
 * degrees either side of the horizon (whole at the horizon, nothing at the band's edge: the far skyline boils, the
 * figure on the mesa 12 degrees up does not) and only where the scene is far (SHIMMER_NEAR to SHIMMER_FAR metres; the sky counts as far). Near
 * things, the view-model and everything off the horizon are read where they are. It moves with the game's clock (a
 * frame drawn twice is the same frame) and is off with Reduce Motion, indoors and in the blue hour. No pass, no target.
 */
export const SHIMMER_PX = 1.2, SHIMMER_BAND = 7, SHIMMER_NEAR = 60, SHIMMER_FAR = 160;
const SHIMMER_FRAGMENT = /* glsl */`
uniform highp sampler2D uHsDepth;
uniform vec4 uHs;       // the horizon's height on screen (uv); the band's half height (uv); the offset (uv); the clock
uniform vec2 uHsProj;   // near, far
void mainUv( inout vec2 uv ) {
	if ( uHs.z <= 0.0 ) return;
	float band = ( uv.y - uHs.x ) / uHs.y;
	band = 1.0 - band * band;
	if ( band <= 0.0 ) return;
	float d = texture2D( uHsDepth, uv ).r;
	float dist = d >= 0.99999 ? 1e4 : ( uHsProj.x * uHsProj.y ) / ( uHsProj.y - d * ( uHsProj.y - uHsProj.x ) );
	float far = smoothstep( ${SHIMMER_NEAR.toFixed(1)}, ${SHIMMER_FAR.toFixed(1)}, dist );
	if ( far <= 0.0 ) return;
	float w = 0.6 * sin( uv.x * 190.0 + uHs.w * 5.1 ) + 0.4 * sin( uv.x * 71.0 - uHs.w * 3.3 + uv.y * 40.0 );
	uv.y += w * uHs.z * band * far;
}
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) { outputColor = inputColor; }
`;
class HeatShimmerEffect extends Effect {
  constructor(depth: THREE.Uniform<THREE.Texture | null>, hs: THREE.Uniform<THREE.Vector4>, proj: THREE.Uniform<THREE.Vector2>) {
    super('KeepHeatShimmer', SHIMMER_FRAGMENT, { blendFunction: BlendFunction.SRC, uniforms: new Map<string, THREE.Uniform>([['uHsDepth', depth], ['uHs', hs], ['uHsProj', proj]]) });
  }
}

/**
 * The High tier's air light (render-tech, pass i1; lead ruling R9: under the station's lamps and round the bore High drew
 * Low's frame, 0.6 to 1.8 of 255 apart). The works are full of dust and the lamps stand in it: what a baked room lacks is
 * the light IN that air. One more term of the merged pass, from the depth the contact shade already reads (no target, no
 * extra pass, no texture): for each of up to AIR_MAX lamps the light scattered toward the eye along the pixel's own ray,
 * from the eye to the surface it ends on, in closed form (inverse-square falloff from a lamp at perpendicular distance h:
 * (atan((T - b) / h) - atan((t0 - b) / h)) / h for a ray from t0 to T whose foot is at b). So a lamp glows in the air round
 * itself, the glow is CUT by whatever stands in front of the lamp (a pillar, the Windlass, the gun hand's side of a
 * door), and it thickens down a long gallery. A lamp's reach is a window on h (no light beyond it; nothing pops when a
 * lamp enters the set). The ray starts AIR_START metres from the eye: standing in a lamp's own pool lifts nothing but
 * the air beyond arm's length. The view-model stands in front of the air and takes none. Low and min have none of it.
 *
 * The lamps are chosen by the system every frame (system.ts `gatherAir`): the lit lamps of the emissive meshes of the
 * drawn zones and the layout's fires and glows, the AIR_MAX strongest as seen from the eye.
 */
export const AIR_MAX = 12;
/** the display level one lamp of level 1 adds on a ray that passes 1 m from it (moods.ts AIR scales it by mood) */
export const AIR_K = 0.06;
/** a lamp's light fades between these distances from the eye, the longest ray counted, the soft core of a lamp (metres) */
export const AIR_NEAR = 20, AIR_FAR = 36, AIR_RAY = 48, AIR_CORE = 0.30;
/** the air nearer the eye than this is not counted (metres): a lamp she stands under glows where it is, it does not wash the frame */
export const AIR_START = 1.5;
/** a lamp nearer the eye than AIR_CLOSE_TO metres fades from the air, and is gone at AIR_CLOSE_FROM (AirLights.offer) */
export const AIR_CLOSE_FROM = 1.2, AIR_CLOSE_TO = 3.5;
/**
 * Render-tech, pass i3 (R9; the visual reviewer: from the lift hall's gantry and on the rim High drew Low's frame, 3.7 and
 * 3.3 of 255 apart: "light shafts under the pendant lamps", "a lamp-glow halo under each town window"). Two more shapes
 * of the SAME term (the same loop, the same lamps, the same closed form; no pass, no target, no texture, no program):
 *
 *   the cone   a lamp whose face looks DOWN (a pendant's disc, a ceiling strip: AirLights.cone, from the lamp's own
 *              geometry) throws its light down through the dust: the light scattered along the part of the pixel's ray
 *              that lies inside a cone under the lamp (half angle AIR_CONE_ANGLE degrees, apex at the lamp, the world's
 *              down as its axis), with the same inverse-square falloff. A shaft of light stands under each pendant, cut
 *              by the pillars and the floor (the ray ends on them) and gone AIR_CONE_REACH metres to the side of the lamp.
 *              Its strength is the mood's (moods.ts AIR_CONE; `PostChain.airCone`, 0 = none: the branch is skipped).
 *   the far    a lamp further off than AIR_FAR was dropped: the town's windows from the rim (130 m). Under a mood
 *   glow       that names a far glow (moods.ts AIR_GLOW; `AirLights.farK`) a lamp
 *              between AIR_NEAR and AIR_GLOW_FAR keeps its place in the set: its reach grows with its distance (never
 *              under AIR_GLOW_ANGLE radians as seen from the eye) and its level with it, so the glow round a far lamp is
 *              as wide on screen as it is round a near one, with a wide soft core (AIR_GLOW_CORE: a pool of glow round a window that keeps the pane's shape, not a hot dot over it). Its ray is counted to the surface it ends on
 *              however far (the near lamps' rays stop at AIR_RAY): what stands in front of the lamp cuts the glow, a
 *              thing bloom cannot do. Without a far glow a lamp fades between AIR_NEAR and AIR_FAR as before.
 * Low and min have none of it; under a mood without the two numbers the frame is the frame before this pass.
 */
export const AIR_CONE_ANGLE = 34, AIR_CONE_REACH = 9;
/** the length of a ray's crossing of the cone, against its distance from the lamp, at which the cone is whole (its side is soft below it) */
export const AIR_CONE_SOFT = 1.3;
/** what a lamp that is in the frame by its cone alone weighs against the others when the set is full */
export const AIR_CONE_ONLY = 0.1;
export const AIR_GLOW_ANGLE = 0.07, AIR_GLOW_FAR = 420;
/** the square of a far lamp's soft core as a share of its reach squared (a near lamp's is AIR_CORE) */
export const AIR_GLOW_CORE = 0.09;
const AIR_FRAGMENT = /* glsl */`
uniform highp sampler2D uAirDepth;
uniform vec4 uAirProj;                 // tan(half fov) x, y; near; far
uniform vec4 uAirPos[ ${AIR_MAX} ];    // view space x, y, z; reach (negative: a far lamp, its ray is not cut at the longest ray)
uniform vec4 uAirCol[ ${AIR_MAX} ];    // rgb x level; the share of the lamp's light that is a cone under it
uniform vec4 uAirK;                    // lamps; strength in scene light; longest ray; core squared
uniform vec4 uAirCone;                 // the cone's strength (0: none); cos squared of its half angle; its reach to the side squared; unused
uniform vec3 uAirDown;                 // the world's down, in view space
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
	outputColor = inputColor;
	if ( uAirK.x < 0.5 ) return;
	float d = texture2D( uAirDepth, uv ).r;
	if ( d <= ${VM_DEPTH_RANGE_TEXT} ) return;
	vec3 ray = vec3( ( uv * 2.0 - 1.0 ) * uAirProj.xy, - 1.0 );
	float rl = length( ray );
	float lin = d >= 0.99999 ? 1e5 : ( uAirProj.z * uAirProj.w ) / ( uAirProj.w - d * ( uAirProj.w - uAirProj.z ) );
	float depth = min( lin, uAirK.z );
	float T = depth * rl, Tfar = lin * rl;
	if ( T <= ${AIR_START.toFixed(2)} ) return;
	vec3 dir = ray / rl;
	vec3 sum = vec3( 0.0 );
	for ( int i = 0; i < ${AIR_MAX}; i ++ ) {
		if ( float( i ) >= uAirK.x ) break;
		vec4 L = uAirPos[ i ];
		float b = dot( dir, L.xyz );
		float perp2 = max( dot( L.xyz, L.xyz ) - b * b, 0.0 );
		float win = 1.0 - perp2 / ( L.w * L.w );
		// (a far lamp's core grows with its reach: a soft glow round a window 90 m off, not a hot dot over its pane)
		float h = sqrt( perp2 + ( L.w < 0.0 ? max( uAirK.w, L.w * L.w * ${AIR_GLOW_CORE.toFixed(3)} ) : uAirK.w ) );
		if ( win > 0.0 ) sum += uAirCol[ i ].rgb * ( ( atan( ( ( L.w < 0.0 ? Tfar : T ) - b ) / h ) - atan( ( ${AIR_START.toFixed(2)} - b ) / h ) ) / h * win * win );
		// pass i3, the cone under a lamp that looks down: the part [ ca, cb ] of the ray inside it. With v = t dir - L and
		// s = v . down, a point is inside where s >= 0 and s s >= cos2 v . v: a quadratic in t
		float ck = uAirCol[ i ].w * uAirCone.x;
		float cw = 1.0 - perp2 / uAirCone.z;
		if ( ck <= 0.0 || cw <= 0.0 ) continue;
		float da = dot( dir, uAirDown ), la = dot( L.xyz, uAirDown );
		float qa = da * da - uAirCone.y, qb = uAirCone.y * b - da * la, qc = la * la - uAirCone.y * dot( L.xyz, L.xyz );
		if ( abs( qa ) < 1e-4 ) qa = qa < 0.0 ? - 1e-4 : 1e-4;
		float disc = qb * qb - qa * qc;
		float ca = ${AIR_START.toFixed(2)}, cb = T;
		if ( disc < 0.0 ) {
			// the ray never crosses the cone's side: outside it for good, or (a ray steeper than the cone) inside one of its two halves
			if ( qa < 0.0 ) continue;
			if ( da > 0.0 ) ca = max( ca, la / da ); else cb = min( cb, la / da );
		} else {
			float sq = sqrt( disc );
			float r1 = ( - qb - sq ) / qa, r2 = ( - qb + sq ) / qa;
			float lo = min( r1, r2 ), hi = max( r1, r2 );
			if ( qa < 0.0 ) {
				// in and out through the side of ONE half: the lower one?
				if ( 0.5 * ( lo + hi ) * da - la <= 0.0 ) continue;
				ca = max( ca, lo ); cb = min( cb, hi );
			} else if ( da > 0.0 ) ca = max( ca, hi ); else cb = min( cb, lo );
		}
		if ( cb <= ca ) continue;
		// a ray that only grazes the cone crosses little of it, and the crossing grows as a square root from the cone's side:
		// a drawn edge. The share falls off again by how long the crossing is, seen from the lamp: the side is a soft one
		float cm = 0.5 * ( ca + cb ) - b;
		float soft = smoothstep( 0.0, ${AIR_CONE_SOFT.toFixed(2)}, ( cb - ca ) / sqrt( perp2 + cm * cm + uAirK.w ) );
		sum += uAirCol[ i ].rgb * ( ( atan( ( cb - b ) / h ) - atan( ( ca - b ) / h ) ) / h * ck * cw * cw * soft );
	}
	outputColor.rgb += sum * uAirK.y;
}
`;
class AirLightEffect extends Effect {
  constructor(depth: THREE.Uniform<THREE.Texture | null>, proj: THREE.Uniform<THREE.Vector4>, pos: THREE.Uniform<Float32Array>, col: THREE.Uniform<Float32Array>, k: THREE.Uniform<THREE.Vector4>, cone: THREE.Uniform<THREE.Vector4>, down: THREE.Uniform<THREE.Vector3>) {
    super('KeepAirLight', AIR_FRAGMENT, { blendFunction: BlendFunction.SRC, uniforms: new Map<string, THREE.Uniform>([['uAirDepth', depth], ['uAirProj', proj], ['uAirPos', pos], ['uAirCol', col], ['uAirK', k], ['uAirCone', cone], ['uAirDown', down]]) });
  }
}

/**
 * The lamps of the air light, gathered once a frame. A candidate's fields are set, then offer() weighs it (a double
 * passed as an argument would be boxed): it is dropped when its reach is wholly outside the view or beyond AIR_FAR, faded
 * between AIR_NEAR and AIR_FAR and at arm's length, and kept if it is among the AIR_MAX strongest so far.
 */
export class AirLights {
  /** x, y, z (world), reach (negative: a far lamp of the far glow, pass i3) */
  readonly world = new Float32Array(AIR_MAX * 4);
  /** r, g, b (x level x fade), the cone's share (pass i3) */
  readonly col = new Float32Array(AIR_MAX * 4);
  private readonly score = new Float32Array(AIR_MAX);
  count = 0;
  /** candidates offered / kept in the last gathering */
  offered = 0;
  x = 0; y = 0; z = 0; reach = 4; r = 1; g = 1; b = 1; level = 1;
  /** pass i3: the share of the candidate's light that is a cone under it (0..1: how far its face looks down); the caller sets it with the other fields */
  cone = 0;
  /** pass i3: the mood's far glow (moods.ts AIR_GLOW; 0 = none: a lamp is gone at AIR_FAR). Set before begin() */
  farK = 0;
  /** pass i3: the mood has a cone (PostChain.airCone is over 0). Set before begin() */
  coneOn = false;
  /** lamps of the last gathering that stand beyond AIR_NEAR and are kept by the far glow, and lamps with a cone */
  far = 0; cones = 0;
  private readonly view = new Float32Array(16);
  private tx = 1; private ty = 1;
  begin(camera: THREE.PerspectiveCamera): void {
    this.count = 0; this.offered = 0; this.far = 0; this.cones = 0;
    camera.updateMatrixWorld();
    const w = camera.matrixWorld.elements, v = this.view, e = camera.projectionMatrix.elements;
    // the pose itself: its first three columns are the view's right, up and back, its fourth the eye
    for (let i = 0; i < 16; i++) v[i] = w[i] as number;
    this.tx = 1 / (e[0] as number); this.ty = 1 / (e[5] as number);
  }
  offer(): void {
    this.offered++;
    const v = this.view;
    const dx = this.x - (v[12] as number), dy = this.y - (v[13] as number), dz = this.z - (v[14] as number);
    const d2 = dx * dx + dy * dy + dz * dz, farK = this.farK;
    let R = this.reach;
    if (d2 >= (farK > 0 ? AIR_GLOW_FAR * AIR_GLOW_FAR : AIR_FAR * AIR_FAR) || !(this.level > 0.01)) return;
    // pass i3, the far glow: beyond AIR_NEAR the lamp's reach is never under AIR_GLOW_ANGLE as seen from the eye
    const far = farK > 0 && d2 > AIR_NEAR * AIR_NEAR;
    let dist = 0, ft = 1;
    if (far || d2 > AIR_NEAR * AIR_NEAR) {
      dist = Math.sqrt(d2);
      ft = (AIR_FAR - dist) / (AIR_FAR - AIR_NEAR);
      if (ft < 0) ft = 0;
      if (far) { const wide = dist * AIR_GLOW_ANGLE; if (wide > R) R += (wide - R) * (1 - ft * ft * (3 - 2 * ft)); }
    }
    // view space: right, up, back are the pose's first three columns
    const vx = dx * (v[0] as number) + dy * (v[1] as number) + dz * (v[2] as number);
    const vy = dx * (v[4] as number) + dy * (v[5] as number) + dz * (v[6] as number);
    const vz = dx * (v[8] as number) + dy * (v[9] as number) + dz * (v[10] as number);
    // (pass i3: a lamp with a cone is in the frame as long as its cone may be: the shaft under a pendant that hangs over the top of the frame)
    const C = this.coneOn && this.cone > 0 && R < AIR_CONE_REACH ? AIR_CONE_REACH : R;
    if (vz > C) return;
    const ahead = -vz, tx = this.tx, ty = this.ty;
    if (Math.abs(vx) > ahead * tx + C * Math.sqrt(1 + tx * tx) || Math.abs(vy) > ahead * ty + C * Math.sqrt(1 + ty * ty)) return;
    // ... and a lamp that is in the frame by its cone alone never takes the place of one whose own glow is in it
    const coneOnly = C > R && (vz > R || Math.abs(vx) > ahead * tx + R * Math.sqrt(1 + tx * tx) || Math.abs(vy) > ahead * ty + R * Math.sqrt(1 + ty * ty));
    if (dist === 0) dist = Math.sqrt(d2);
    const fade = ft >= 1 ? 1 : ft * ft * (3 - 2 * ft);
    // a lamp at arm's length is a veil over the whole frame, not a glow round the lamp: it fades as she walks up to it
    // (whole from AIR_CLOSE_TO metres, gone at AIR_CLOSE_FROM)
    const nt = (dist - AIR_CLOSE_FROM) / (AIR_CLOSE_TO - AIR_CLOSE_FROM), near = nt >= 1 ? 1 : nt <= 0 ? 0 : nt * nt * (3 - 2 * nt);
    // (the far glow: what the near fade takes, a far lamp keeps as farK of itself, and its level grows with its distance as
    // its reach does: the light a ray gathers past a lamp falls with the ray's distance from it in METRES)
    const seen = this.level * (fade + (far ? (1 - fade) * (farK < 1 ? farK : 1) : 0)) * near * (coneOnly ? AIR_CONE_ONLY : 1), score = this.score;
    const level = this.level * (fade + (far ? (1 - fade) * farK * dist / AIR_FAR : 0)) * near;
    if (!(seen > 0.005 * (coneOnly ? AIR_CONE_ONLY : 1))) return;
    let at = this.count;
    if (at >= AIR_MAX) {
      at = 0;
      for (let i = 1; i < AIR_MAX; i++) if ((score[i] as number) < (score[at] as number)) at = i;
      if ((score[at] as number) >= seen) return;
    } else this.count++;
    score[at] = seen;
    const w = this.world, c = this.col;
    w[at * 4] = this.x; w[at * 4 + 1] = this.y; w[at * 4 + 2] = this.z; w[at * 4 + 3] = far ? -R : R;
    // a far lamp has no cone: at that distance a shaft under it is a pixel wide
    c[at * 4] = this.r * level; c[at * 4 + 1] = this.g * level; c[at * 4 + 2] = this.b * level; c[at * 4 + 3] = far ? this.cone * fade : this.cone;
  }
  /** after the gathering: how many of the kept lamps are far ones and how many carry a cone (a test's and the debug hook's) */
  tally(): void {
    let far = 0, cones = 0;
    for (let i = 0; i < this.count; i++) { if ((this.world[i * 4 + 3] as number) < 0) far++; if ((this.col[i * 4 + 3] as number) > 0.01) cones++; }
    this.far = far; this.cones = cones;
  }
}

class GradeEffect extends Effect {
  constructor(shared: SharedUniforms, readonly exposure: THREE.Uniform<number>, readonly vignette: THREE.Uniform<THREE.Vector3>, readonly grain: THREE.Uniform<number>, readonly seed: THREE.Uniform<number>) {
    super('KeepGrade', GRADE_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', exposure], ['uVignette', vignette], ['uGrain', grain], ['uSeed', seed],
        ['uGradeA', shared.uGradeA as THREE.Uniform], ['uGradeB', shared.uGradeB as THREE.Uniform],
      ]),
    });
  }
}
class GrainEffect extends Effect {
  constructor(grain: THREE.Uniform<number>, seed: THREE.Uniform<number>) {
    super('KeepGrain', GRAIN_FRAGMENT, { blendFunction: BlendFunction.SRC, uniforms: new Map<string, THREE.Uniform>([['uGrain', grain], ['uSeed', seed]]) });
  }
}

const VIGNETTE_VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
const VIGNETTE_FRAG = /* glsl */`
uniform vec3 uVignette;
uniform float uAspect;
varying vec2 vUv;
void main() {
	vec2 d = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
	float vig = smoothstep( uVignette.x, uVignette.y, length( d ) ) * uVignette.z;
	// toward the floor colour, not toward black: the corners keep "nothing under #0B0D12"
	gl_FragColor = vec4( ${FLOOR_GLSL}, vig );
	#include <colorspace_fragment>
}
`;

export class PostChain {
  /** exposure after the mood and the ramp of setExposure (the merged pass multiplies; `min` sets toneMappingExposure) */
  readonly exposure = new THREE.Uniform(1);
  /** x inner radius, y outer radius, z strength */
  readonly vignette = new THREE.Uniform(new THREE.Vector3(VIGNETTE_INNER, VIGNETTE_OUTER, 0.35));
  readonly grainLow = new THREE.Uniform(0.035);
  readonly grainHigh = new THREE.Uniform(0);
  readonly seed = new THREE.Uniform(0);
  /** the amount of grain the tier shows when nothing overrides it */
  grainAmount = 0.035;
  /** the mood's bloom (High): a display level and an intensity, set by the system every frame (moods.ts M_BLOOM_T / M_BLOOM_K) */
  bloomThreshold = BLOOM_THRESHOLD;
  bloomIntensity = BLOOM_INTENSITY;
  /** the knee over the threshold as a display level; 0 = BLOOM_SMOOTHING of scene light, as before the moods had a say */
  bloomKnee = 0;
  tier: RenderTier = 'low';
  composer: EffectComposer | null = null;
  /** one chain per kind of tier, kept for the life of the renderer (configure) */
  private readonly chains = new Map<string, Chain>();
  private current: Chain | null = null;
  private merged: EffectPass | null = null;
  private fxaa: EffectPass | null = null;
  private bloom: BloomEffect | null = null;
  /** High: the contact shade's depth texture (the input buffer's own depth attachment), its projection and its numbers */
  private readonly aoDepth = new THREE.Uniform<THREE.Texture | null>(null);
  private readonly aoProj = new THREE.Uniform(new THREE.Vector4(1, 1, 0.1, 1000));
  readonly aoK = new THREE.Uniform(new THREE.Vector4(AO_RADIUS, AO_INTENSITY, AO_FAR, 0));
  /** High: the sun shafts (SunShaftEffect). The system sets `shaftK` (0 = none) and `shaftCol` from the mood; finish() puts the sun on screen */
  shaftK = 0;
  readonly shaftSun = new THREE.Uniform(new THREE.Vector4(0.5, 0.5, 0, 0));
  readonly shaftCol = new THREE.Uniform(new THREE.Vector3(1, 0.8, 0.5));
  private readonly shaftProj = new THREE.Uniform(new THREE.Vector2(0.05, 2000));
  /** High: the sun's veil as a share of the shafts' strength (VEIL_K under the Long Light, 0 under the overhang); the system's */
  readonly shaftVeil = new THREE.Uniform(0);
  /** High: the air light (AirLightEffect). The system fills `air` and sets `airK` (a display level; 0 = none) every frame; finish() puts the lamps into view space */
  readonly air = new AirLights();
  airK = 0;
  /** High, pass i3: the strength of the cone under a lamp that looks down (moods.ts AIR_CONE, eased by the system; 0 = none) */
  airCone = 0;
  private readonly airConeU = new THREE.Uniform(new THREE.Vector4(0, Math.cos(AIR_CONE_ANGLE * Math.PI / 180) ** 2, AIR_CONE_REACH * AIR_CONE_REACH, 0));
  private readonly airDown = new THREE.Uniform(new THREE.Vector3(0, -1, 0));
  /** High: the heat shimmer (HeatShimmerEffect): 0..1, set by the system every frame; `shimmerTime` is the game's clock */
  shimmer = 0;
  shimmerTime = 0;
  private readonly shimmerU = new THREE.Uniform(new THREE.Vector4(0.5, 0.05, 0, 0));
  private readonly airPos = new THREE.Uniform(new Float32Array(AIR_MAX * 4));
  private readonly airCol = new THREE.Uniform(this.air.col);
  private readonly airU = new THREE.Uniform(new THREE.Vector4(0, 0, AIR_RAY, AIR_CORE * AIR_CORE));
  /** true while the scene's depth is kept for the contact shade: the view-model must then be drawn into VM_DEPTH_RANGE, not over a cleared depth */
  keepsDepth = false;
  readonly vignetteMesh: THREE.Mesh;
  private readonly vignetteAspect = { value: 16 / 9 };
  readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();
  /** full-screen draws of the last frame (0 / 1 / 12 by tier) */
  fullScreenDraws = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly camera: THREE.Camera, private readonly shared: SharedUniforms) {
    installInlineGrade();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const material = new THREE.ShaderMaterial({
      uniforms: { uVignette: this.vignette, uAspect: this.vignetteAspect }, vertexShader: VIGNETTE_VERT, fragmentShader: VIGNETTE_FRAG,
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false,
    });
    this.vignetteMesh = new THREE.Mesh(geometry, material);
    this.vignetteMesh.frustumCulled = false;
    this.vignetteMesh.matrixAutoUpdate = false;
  }

  /**
   * The chain of a tier. Release pass p0: a chain is built ONCE per kind (Low's, High's) and kept. Leaving a tier frees
   * the chain's render targets (the GPU memory) but not its passes, so their programs stay linked: coming back to a tier
   * links nothing (it was 2 programs for Low's chain and 9 for High's on every switch).
   */
  configure(tier: RenderTier, features: Readonly<QualityFeatures>): void {
    const r = this.renderer;
    this.leaveChain();
    this.tier = tier;
    if (!features.composer) {
      r.toneMapping = THREE.CustomToneMapping;
      this.grainLow.value = 0; this.grainHigh.value = 0;
      return;
    }
    r.toneMapping = THREE.NoToneMapping;
    const chain = this.chainOf(features);
    this.current = chain;
    this.composer = chain.composer; this.merged = chain.merged; this.fxaa = chain.fxaa; this.bloom = chain.bloom;
    if (chain.depth) { this.aoDepth.value = chain.depth; this.aoK.value.w = 1; this.keepsDepth = true; }
    r.autoClear = false;
    this.applyGrain();
  }
  private chainOf(features: Readonly<QualityFeatures>): Chain {
    const key = (features.bloom ? 'b' : '-') + (features.antialias === 'fxaa' ? 'f' : '-');
    const kept = this.chains.get(key);
    if (kept) return kept;
    const r = this.renderer;
    const composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false, multisampling: 0 });
    const grade = new GradeEffect(this.shared, this.exposure, this.vignette, this.grainLow, this.seed);
    let merged: EffectPass, bloom: BloomEffect | null = null, depth: THREE.DepthTexture | null = null, fxaa: EffectPass | null = null;
    if (features.bloom) {
      bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, mipmapBlur: true, luminanceThreshold: BLOOM_THRESHOLD, luminanceSmoothing: BLOOM_SMOOTHING, intensity: BLOOM_INTENSITY, radius: 0.8, levels: 5 });
      bloom.luminancePass.resolution.scale = 0.5;
      // the contact shade reads the scene's depth: the input buffer gets a depth texture before it is first drawn into
      depth = new THREE.DepthTexture(1, 1);
      depth.name = 'keep_scene_depth';
      composer.inputBuffer.depthTexture = depth;
      merged = new EffectPass(this.camera, new HeatShimmerEffect(this.aoDepth, this.shimmerU, this.shaftProj), new ContactShadeEffect(this.aoDepth, this.aoProj, this.aoK, this.exposure), new SunShaftEffect(this.aoDepth, this.shaftSun, this.shaftCol, this.shaftProj, this.shaftVeil), new AirLightEffect(this.aoDepth, this.aoProj, this.airPos, this.airCol, this.airU, this.airConeU, this.airDown), bloom, grade);
    } else {
      merged = new EffectPass(this.camera, grade);
    }
    composer.addPass(merged);
    if (features.antialias === 'fxaa') {
      fxaa = new EffectPass(this.camera, new FXAAEffect(), new GrainEffect(this.grainHigh, this.seed));
      composer.addPass(fxaa);
    }
    const chain: Chain = { composer, merged, fxaa, bloom, depth, targets: [] };
    collectTargets(composer, chain.targets, new Set(), 0);
    this.chains.set(key, chain);
    return chain;
  }
  /**
   * The chain of a tier that is NOT the current one, built and its two pass programs compiled (nothing is drawn, no
   * target is allocated): what the system's neighbour warm-up asks for, so an automatic step to that tier links nothing.
   * Returns the number of pass materials handed to the compiler.
   */
  prepare(features: Readonly<QualityFeatures>): number {
    if (!features.composer) return 0;
    const r = this.renderer, chain = this.chainOf(features);
    if (chain === this.current) return 0;
    const prev = r.getRenderTarget(), tone = r.toneMapping;
    // an intermediate pass draws into a float target (linear), the last one onto the canvas: the two program kinds
    const scratch = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    let n = 0;
    r.toneMapping = THREE.NoToneMapping;
    try {
      for (const pass of [chain.merged, chain.fxaa]) {
        if (!pass) continue;
        const p = pass as unknown as { scene: THREE.Scene | null; camera: THREE.Camera | null; renderToScreen: boolean };
        if (!p.scene || !p.camera) continue;
        r.setRenderTarget(p.renderToScreen ? null : scratch);
        r.compile(p.scene, p.camera);
        n++;
      }
    } finally {
      r.toneMapping = tone;
      r.setRenderTarget(prev);
      scratch.dispose();
      // compiling asked nothing of the chain's own targets; a size they were given at construction costs nothing either
      for (const t of chain.targets) t.dispose();
    }
    return n;
  }
  /** the chain that is being left: its targets go back to the driver (three allocates them again when they are next drawn into) */
  private leaveChain(): void {
    if (this.current) for (const t of this.current.targets) t.dispose();
    this.current = null;
    this.composer = null; this.merged = null; this.fxaa = null; this.bloom = null;
    this.aoDepth.value = null; this.aoK.value.w = 0; this.keepsDepth = false; this.shaftSun.value.z = 0; this.airU.value.x = 0; this.airConeU.value.x = 0; this.shimmerU.value.z = 0;
  }
  /** grain belongs to the last pass: the merged one on Low, the FXAA one on High */
  applyGrain(): void {
    const on = this.composer !== null;
    this.grainLow.value = on && !this.fxaa ? this.grainAmount : 0;
    this.grainHigh.value = on && this.fxaa ? this.grainAmount : 0;
  }
  dispose(): void {
    this.leaveChain();
    for (const c of this.chains.values()) c.composer.dispose();
    this.chains.clear();
    this.vignetteMesh.geometry.dispose();
    (this.vignetteMesh.material as THREE.Material).dispose();
  }

  get vignetteMaterial(): THREE.Material { return this.vignetteMesh.material as THREE.Material; }

  /** after renderer.setPixelRatio / setSize: the composer's buffers follow the drawing buffer */
  setSize(cssWidth: number, cssHeight: number): void {
    if (this.composer) this.composer.setSize(cssWidth, cssHeight, false);
    this.vignetteAspect.value = cssWidth / Math.max(1, cssHeight);
  }

  /** where the scene is drawn: the composer's HalfFloat buffer, or the canvas on `min` */
  get sceneTarget(): THREE.WebGLRenderTarget | null { return this.composer ? this.composer.inputBuffer : null; }

  /** after the scene and the view-model are in sceneTarget: the full-screen part of the frame */
  finish(frameDt: number, tick: number, exposure: number): void {
    const r = this.renderer;
    this.seed.value = tick % 1024;
    this.exposure.value = exposure;
    if (this.keepsDepth) {
      const cam = this.camera as THREE.PerspectiveCamera, e = cam.projectionMatrix.elements, p = this.aoProj.value;
      p.x = 1 / (e[0] as number); p.y = 1 / (e[5] as number); p.z = cam.near; p.w = cam.far;
      // the sun's place on screen (the camera's pose is this frame's by now) and how far she faces it
      const v = cam.matrixWorldInverse.elements, sd = this.shared.uSunDir.value, sh = this.shaftSun.value;
      const vx = (v[0] as number) * sd.x + (v[4] as number) * sd.y + (v[8] as number) * sd.z, vy = (v[1] as number) * sd.x + (v[5] as number) * sd.y + (v[9] as number) * sd.z, face = -((v[2] as number) * sd.x + (v[6] as number) * sd.y + (v[10] as number) * sd.z);
      const ft = (face - SHAFT_FACE_FROM) / (SHAFT_FACE_TO - SHAFT_FACE_FROM), fw = ft <= 0 ? 0 : ft >= 1 ? 1 : ft * ft * (3 - 2 * ft);
      sh.z = this.shaftK * fw; sh.w = tick % 64;
      this.shaftProj.value.set(cam.near, cam.far);
      if (sh.z > 0) { sh.x = 0.5 + 0.5 * (vx / face) * (e[0] as number); sh.y = 0.5 + 0.5 * (vy / face) * (e[5] as number); }
      // the heat shimmer: where the horizon stands on screen for this frame's pitch
      const hs = this.shimmerU.value;
      r.getDrawingBufferSize(this.size);
      hs.z = this.shimmer > 1e-3 ? this.shimmer * SHIMMER_PX / Math.max(1, this.size.y) : 0;
      if (hs.z > 0) {
        // the world's up in view space is (v[4], v[5], v[6]); a direction on the horizon straight ahead, (0, y, -1), is square to it: y = uz / uy
        const uy = v[5] as number, uz = v[6] as number;
        hs.x = 0.5 + 0.5 * (Math.abs(uy) > 1e-3 ? uz / uy : 1e3) * (e[5] as number);
        hs.y = 0.5 * Math.tan(SHIMMER_BAND * Math.PI / 180) * (e[5] as number);
        hs.w = this.shimmerTime;
      }
      // the air light's lamps, into this frame's view space (the camera's pose is final here: the shake is in it)
      const air = this.air, au = this.airU.value, n = this.airK > 1e-4 ? air.count : 0;
      au.x = n; au.y = this.airK / (Math.PI * Math.max(exposure, 1e-3));
      this.airConeU.value.x = n > 0 ? this.airCone : 0;
      if (n > 0) {
        // the world's up in view space is (v[4], v[5], v[6])
        this.airDown.value.set(-(v[4] as number), -(v[5] as number), -(v[6] as number));
        const w = air.world, o = this.airPos.value;
        for (let i = 0; i < n; i++) {
          const x = w[i * 4] as number, y = w[i * 4 + 1] as number, z = w[i * 4 + 2] as number;
          o[i * 4] = (v[0] as number) * x + (v[4] as number) * y + (v[8] as number) * z + (v[12] as number);
          o[i * 4 + 1] = (v[1] as number) * x + (v[5] as number) * y + (v[9] as number) * z + (v[13] as number);
          o[i * 4 + 2] = (v[2] as number) * x + (v[6] as number) * y + (v[10] as number) * z + (v[14] as number);
          o[i * 4 + 3] = w[i * 4 + 3] as number;
        }
      }
    }
    if (this.bloom) {
      const t = this.bloomThreshold / Math.max(exposure, 1e-3), lm = this.bloom.luminanceMaterial;
      if (lm.threshold !== t) lm.threshold = t;
      if (this.bloom.intensity !== this.bloomIntensity) this.bloom.intensity = this.bloomIntensity;
      const sm = this.bloomKnee > 0 ? this.bloomKnee / Math.max(exposure, 1e-3) : BLOOM_SMOOTHING;
      if (lm.smoothing !== sm) lm.smoothing = sm;
    }
    this.shared.uHdr.value = this.bloom ? EMISSIVE_HDR : 1;
    if (!this.composer) {
      r.toneMappingExposure = exposure;
      if (this.vignette.value.z > 0.001) r.render(this.vignetteMesh, this.quadCamera);
      this.fullScreenDraws = 0;
      return;
    }
    const merged = this.merged as EffectPass, c = this.composer;
    if (this.fxaa) {
      merged.render(r, c.inputBuffer, c.outputBuffer, frameDt, false);
      this.fxaa.render(r, c.outputBuffer, c.inputBuffer, frameDt, false);
      this.fullScreenDraws = 12;
    } else {
      merged.render(r, c.inputBuffer, c.outputBuffer, frameDt, false);
      this.fullScreenDraws = 1;
    }
    r.setRenderTarget(null);
  }

  /**
   * Bytes of the render targets REALLY allocated now (release pass p0), counted from the targets themselves and checked
   * against a hook on the GL calls in tests/render/release_p0.test.mjs:
   *   canvas          colour + depth, 8 bytes a pixel (the manifest's `min` figure when the context has antialias)
   *   chain targets   every target of the current chain that three has allocated: RGBA16F 8 bytes a pixel, + 4 for a depth
   *                   attachment (renderbuffer or texture)
   *   shadow map      the caller's figure (0 while three has not made it)
   */
  allocatedBytes(def: TierDef, msaa: boolean, shadowMapBytes: number): number {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const pixels = this.size.x * this.size.y;
    if (!this.current) return Math.round(pixels * (msaa ? def.bytesPerPixel : 8));
    let bytes = pixels * 8;
    const targets = this.current.targets, props = r.properties as unknown as { get(o: object): { __webglFramebuffer?: unknown } };
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i] as THREE.WebGLRenderTarget;
      if (props.get(t).__webglFramebuffer === undefined) continue;
      const type = t.texture.type;
      const texel = type === THREE.HalfFloatType ? 8 : type === THREE.FloatType ? 16 : 4;
      bytes += t.width * t.height * (texel + (t.depthBuffer ? 4 : 0));
    }
    return Math.round(bytes) + shadowMapBytes;
  }
  /**
   * What the perf counter reports: never under what is allocated, never under the manifest's ledger for the tier
   * (`tiers.*.bytesPerPixel`, ARCHITECTURE 8.4) at the current drawing buffer.
   *
   * The per-pixel formula this replaces left out the depth of High's second scene buffer (it claimed 77.9 MiB where GL
   * held 85.8 at 1920 x 1080): High now reports the real figure. On Low the ledger counts a second scene buffer that is
   * never drawn into (28 bytes a pixel where 20 are allocated): the ledger's figure stands there until the manifest is
   * corrected (docs/requests/render-tech.md), because the budget tests of every team compare this counter with it.
   */
  renderTargetBytes(def: TierDef, msaa: boolean, shadowMapBytes: number, ledgerFixedBytes: number): number {
    const allocated = this.allocatedBytes(def, msaa, shadowMapBytes);
    if (!this.current) return allocated;
    const ledger = Math.round(this.size.x * this.size.y * def.bytesPerPixel) + ledgerFixedBytes;
    return allocated > ledger ? allocated : ledger;
  }
}

interface Chain {
  composer: EffectComposer; merged: EffectPass; fxaa: EffectPass | null; bloom: BloomEffect | null; depth: THREE.DepthTexture | null;
  /** every render target the composer, its passes and their effects own */
  targets: THREE.WebGLRenderTarget[];
}
/** Every WebGLRenderTarget reachable from a composer through its own fields (passes, effects, their inner passes). */
function collectTargets(node: unknown, out: THREE.WebGLRenderTarget[], seen: Set<unknown>, depth: number): void {
  if (node === null || typeof node !== 'object' || seen.has(node) || depth > 12) return;
  seen.add(node);
  const o = node as Record<string, unknown> & { isWebGLRenderTarget?: boolean; isMaterial?: boolean; isTexture?: boolean; isObject3D?: boolean; isBufferGeometry?: boolean };
  if (o.isWebGLRenderTarget === true) { out.push(node as THREE.WebGLRenderTarget); return; }
  if (o.isMaterial === true || o.isTexture === true || o.isObject3D === true || o.isBufferGeometry === true) return;
  if (node instanceof THREE.WebGLRenderer || ArrayBuffer.isView(node) || node instanceof Map || node instanceof Set) return;
  if (Array.isArray(node)) { for (const x of node) collectTargets(x, out, seen, depth + 1); return; }
  for (const k of Object.keys(o)) collectTargets(o[k], out, seen, depth + 1);
}
