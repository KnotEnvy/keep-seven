// The material factory (ARCHITECTURE 8.1, code-render 4.2): `render.material(blenderName, mesh, def)`.
//
//   m_frontier, m_pellam, m_sand   MeshBasicMaterial patched into the WORLD SHADER: vcol x detail.r x 2 x light,
//   m_flat, m_mask                 light = lightmap(UV1) x scale + light layer, or VERTEX_LIGHT_SCALE; cloud shadow;
//                                  the two radial pulse terms; fog. Variants by defines, one program per variant.
//   m_emis                         unlit lamp shader: lamp state per object, flicker, wrong_fade, halos through the pool
//   m_prop, m_gun                  one program for every dynamic or instanced object: per-object zone ambient + key
//
// Per-object values (zone light, emissive scale, lamp state) are uniforms of ONE shared ShaderMaterial, written in the
// material's onBeforeRender (three uploads them when `uniformsNeedUpdate` is set), so instances never clone a material.
import * as THREE from 'three';
import type { AssetDef, GameContext, LampApi, MoodId, ResidentSet, TextureId, ZoneId } from '../core/contracts.ts';
import { FOG_GLSL, HUE, K_GLSL, PULSE_GLSL, VLS, WRONG_GLSL } from './shared.ts';
import type { SharedUniforms, Uniform } from './shared.ts';
import { BORE_KERB_TOP_Y, MOODS, M_AMBIENT, M_KEY, M_KEY_DIR, M_RIM, M_SKY, M_VM_AMB, M_VM_KEY, M_VM_RIM, moodAt } from './moods.ts';
import type { MoodKey } from './moods.ts';
import { FLAG_ADD, FLAG_GLOW } from './vfx/quads.ts';

const DETAIL: Readonly<Record<string, TextureId>> = { m_frontier: 'tx_frontier_trim', m_pellam: 'tx_pellam_trim', m_sand: 'tx_sand' };
const SETS: readonly ResidentSet[] = ['surface', 'underground', 'coda'];
/** frames between two zone look-ups of one dynamic object */
const ZONE_EVERY = 12;
/** seconds of the cross-fade of a dynamic object's zone light */
const ZONE_FADE = 0.3;
const MAX_EMITTERS = 256;
const MAX_ISLANDS = 48;

function inPlaceholder(mesh: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (o.userData.placeholder === true) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------------------------------------------------

const glslVec3 = (c: THREE.Color): string => `vec3( ${c.r.toFixed(6)}, ${c.g.toFixed(6)}, ${c.b.toFixed(6)} )`;

/**
 * The per-object values of a dynamic object, one vec4 array written in onBeforeRender (one upload that reads nothing,
 * see SharedUniforms.uK): [0] zone ambient rgb + the emissive scale, [1] key rgb, [2] key direction, [3] rim rgb +
 * 1 for a thing of the view-model (its key and rim directions are then in VIEW space), [4] the view-model's rim direction.
 */
const OBJ_SLOTS = 5;
const OBJ_GLSL = /* glsl */`
uniform vec4 uObj[ ${OBJ_SLOTS} ];
#define uObjAmbient uObj[ 0 ].xyz
#define uObjEmissive uObj[ 0 ].w
#define uObjKey uObj[ 1 ].xyz
#define uObjKeyDir uObj[ 2 ].xyz
#define uObjExt uObj[ 2 ].w
#define uObjRim uObj[ 3 ].xyz
#define uObjVm uObj[ 3 ].w
#define uObjRimDir uObj[ 4 ].xyz
`;
/**
 * The view-model's rig (lead ruling R6, polish round 3), in VIEW space: +x right, +y up, +z toward the eye. The key
 * comes over her left shoulder from above, the rim from behind the gun on the left. See moods.ts VM_AMB.
 */
// The revolver is seen from behind: nearly all of its faces are side-on to the eye (their view normals lie in the
// screen plane), so a rim "by grazing angle" or a highlight about the eye's half vector floods or misses the whole gun.
// Both lights are therefore lobes in the screen plane: the key on what faces up and left (the side of the frame she sees,
// the left of every barrel and flute), the rim a narrow lobe on what faces straight up (top strap, hammer, the cylinder's crown).
const VM_KEY_DIR = new THREE.Vector3(-0.62, 0.70, 0.35).normalize(), VM_RIM_DIR = new THREE.Vector3(0.22, 0.93, -0.30).normalize();
/** dark steel shows by what it reflects: the gun's diffuse term is lifted by this, its hands take this share of the rig */
const GUN_GAIN = 1.0, VM_HANDS = 0.75;

const WORLD_VERT_PARS = /* glsl */`
#ifdef FARCARD
${K_GLSL}
#endif
varying vec3 vWPos;
#ifdef LM
varying vec2 vLm;
#endif
`;
const WORLD_VERT = /* glsl */`
{
	vec4 keepWp = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
	keepWp = instanceMatrix * keepWp;
	#endif
	vWPos = ( modelMatrix * keepWp ).xyz;
}
#ifdef LM
vLm = uv1;
#endif
#ifdef FARCARD
{
	// never smaller on screen than FARCARD_PX tall (layout: the Dowser's minPixels), scaled about its own origin
	vec4 keepO = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	float keepPx = FARCARD_H * uViewportH * projectionMatrix[ 1 ][ 1 ] * 0.5 / max( - keepO.z, 0.1 );
	float keepK = max( 1.0, FARCARD_PX / max( keepPx, 1e-3 ) );
	if ( keepK > 1.0 ) {
		mvPosition = modelViewMatrix * vec4( transformed * keepK, 1.0 );
		gl_Position = projectionMatrix * mvPosition;
	}
}
#endif
`;
const WORLD_FRAG_PARS = /* glsl */`
varying vec3 vWPos;
${FOG_GLSL}
${PULSE_GLSL}
${WRONG_GLSL}
#ifdef LM
varying vec2 vLm;
uniform sampler2D uLightmap;
#ifdef LAYER
uniform sampler2D uLayer;
uniform vec4 uLayerTint;
uniform vec4 uLayerAlt;
uniform vec4 uLayerAt;
uniform vec4 uLayerShape;
uniform vec4 uLayerWall;
#endif
#endif
#ifdef CLOUD
uniform sampler2D uNoise;
#endif
`;
const WORLD_MAP = /* glsl */`
#ifdef USE_MAP
	#ifdef DETAIL
	diffuseColor.rgb *= texture2D( map, vMapUv ).r * 2.0;
	#else
	diffuseColor.rgb *= texture2D( map, vMapUv ).rgb;
	#endif
#endif
`;
const WORLD_LIGHT = /* glsl */`
{
	vec3 keepLight;
	#if defined( LM )
	keepLight = texture2D( uLightmap, vLm ).rgb * LM_SCALE;
	#ifdef LAYER
	{
		// a light layer on the same UV1: tint x weight x texel x scale; the bore's turns violet -> aqua from the bottom up
		float turned = uLayerAlt.w * max( uWrong.x, 1.0 - smoothstep( uWrong.z - 3.0, uWrong.z, vWPos.y ) );
		// where the layer reaches (polish round 2: at full weight everywhere, the hatch's layer turned the Tally
		// House's adobe mint green and the bore's glow painted the whole chamber flat violet):
		//   uLayerAt     xyz + radius: only round that point (the hatch well, its frame, the floor by it)
		//   uLayerShape  x: the share that plain walls and floors take; undersides (ribs, the kerb: scaled by z) and
		//                everything under the height y take all of it (the pit is where the bore's light lives).
		//                x = 1: no shaping
		float reach = uLayerAt.w > 0.0 ? 1.0 - smoothstep( uLayerAt.w * 0.3, uLayerAt.w, distance( vWPos, uLayerAt.xyz ) ) : 1.0;
		if ( uLayerShape.x < 1.0 ) {
			vec3 gn = normalize( cross( dFdx( vWPos ), dFdy( vWPos ) ) );
			float under = clamp( - gn.y * 1.6 - 0.1, 0.0, 1.0 );
			float pit = 1.0 - smoothstep( uLayerShape.y - 0.4, uLayerShape.y + 0.5, vWPos.y );
			float own = max( under * uLayerShape.z, pit );
			reach *= mix( uLayerShape.x, 1.0, own );
			// plain walls and floors take the layer in uLayerWall's colour (the bore: its violet held half-way to the floor
			// strips' teal, polish round 3), the pit and the undersides in the layer's own
			keepLight += mix( mix( uLayerWall.rgb, uLayerTint.rgb, own ), uLayerAlt.rgb, turned ) * ( texture2D( uLayer, vLm ).r * uLayerTint.w * reach * LM_SCALE );
		} else
		keepLight += mix( uLayerTint.rgb, uLayerAlt.rgb, turned ) * ( texture2D( uLayer, vLm ).r * uLayerTint.w * reach * LM_SCALE );
	}
	#endif
	#elif defined( DYN )
	keepLight = uDynFlat;
	#elif defined( UNLIT )
	keepLight = vec3( 1.0 );
	#else
	keepLight = vec3( ${VLS} );
	#endif
	#ifdef PLACE
	keepLight *= uPlaceLight;
	#endif
	#ifdef CLOUD
	keepLight *= 1.0 - uCloud.w * ( 1.0 - texture2D( uNoise, vWPos.xz * uCloud.z + uCloud.xy ).r );
	#endif
	outgoingLight = diffuseColor.rgb * keepLight;
	if ( keepPulseOn() ) {
		// no normal attribute reaches a world material: the face's own, from screen derivatives (it always faces the eye).
		// shared.ts PULSE_GLSL: the ring as before, a filled pulse (the muzzle) shaded by N.L and held under the cap
		vec3 keepGn = cross( dFdx( vWPos ), dFdy( vWPos ) );
		vec4 keepFilled;
		vec3 keepRing = keepPulseLit( vWPos, keepGn / max( length( keepGn ), 1e-12 ), keepFilled );
		outgoingLight += keepRing * ( diffuseColor.rgb + uK[ 2 ].w ) + keepPulseKnee( diffuseColor.rgb * keepFilled.rgb ) * keepFilled.a;
	}
	#ifdef FARFOG
	{
		// the coda's far cards (the town 250 m off, the dusk mesas) are authored "as seen through haze": the blue hour's
		// fog would take 95 % of the town at that distance and leave its lit windows hanging in the air
		// (docs/requests/art-env-exterior.md 1). Their fog stops at 55 %.
		vec3 keepRay = vWPos - cameraPosition;
		float keepDist = length( keepRay );
		// look-dev, polish round 3 (R7): one cap for everything gave the mesa's foot 40 m off, the town 125 m off and the
		// rims 800 m off the same veil of ember haze: the land of the last image was one mid tone with no darks. The cap
		// now grows with distance (6 % to 160 m, 40 % from 800 m): the foot and the town stay dark, the far rims pale.
		outgoingLight = mix( outgoingLight, keepFogColour( keepRay / max( keepDist, 1e-4 ), keepDist ), min( keepFogAmount( keepRay, keepDist ), mix( 0.06, 0.40, smoothstep( 160.0, 800.0, keepDist ) ) ) );
	}
	#elif defined( FARCARD )
	{
		// a far figure card of the surface (the Dowser on the far mesa, 250 m off): authored pale against the mesa's
		// shadowed face, and that face is already three quarters haze. His own haze stops at 30 %.
		vec3 keepRay = vWPos - cameraPosition;
		float keepDist = length( keepRay );
		// look-dev, polish round 3 (lead ruling R4): he is now a DARK figure on the skyline against clear sky; 30 % haze
		// drew the near-black card mid-brown (L* 48). 2 %.
		outgoingLight = mix( outgoingLight, keepFogColourE( keepRay / max( keepDist, 1e-4 ), keepDist, 1.0 ), min( keepFogAmountE( keepRay, keepDist, 1.0 ), 0.02 ) );
	}
	#elif defined( EXT )
	outgoingLight = keepFogE( outgoingLight, vWPos, 1.0 );
	#else
	outgoingLight = keepFog( outgoingLight, vWPos );
	#endif
}
`;

const DYN_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
${FOG_GLSL}
${OBJ_GLSL}
varying vec3 vLight;
varying vec4 vFog;
varying vec2 vUv0;
varying vec3 vCol;
varying vec3 vWPos;
varying vec3 vRim;
varying vec3 vWN;
#ifdef GUN
varying vec3 vVN;
varying vec3 vKeyCol;
varying vec3 vKeyV;
varying vec3 vVP;
#endif
void main() {
	vUv0 = uv;
	vCol = vec3( 1.0 );
	#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	vCol = color.rgb;
	#endif
	#include <beginnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <begin_vertex>
	#ifdef BREATH
	// 2 mm of chest at 0.25 Hz, weight in UV1.x
	transformed += normal * ( 0.002 * sin( uTime * 1.5708 ) * uv1.x );
	#endif
	#include <skinning_vertex>
	mat4 mm = modelMatrix;
	#ifdef USE_INSTANCING
	mm = modelMatrix * instanceMatrix;
	#endif
	vec4 wp = mm * vec4( transformed, 1.0 );
	#ifdef WIND
	{
		// sway: weight = height above the pivot
		float w = max( transformed.y, 0.0 );
		float ph = uTime * 1.7 + mm[ 3 ].x * 0.9 + mm[ 3 ].z * 1.3;
		wp.x += sin( ph ) * 0.035 * w + sin( ph * 2.3 + 1.0 ) * 0.012 * w;
		wp.z += cos( ph * 0.8 ) * 0.03 * w;
	}
	#endif
	vWPos = wp.xyz;
	vec3 wn = mat3( mm ) * objectNormal;
	float wl = length( wn );
	wn = wl > 1e-6 ? wn / wl : vec3( 0.0, 1.0, 0.0 );
	#ifdef USE_INSTANCING
	vec3 base = vec3( 1.0 );
	#ifdef USE_INSTANCING_COLOR
	base = instanceColor;
	#endif
	vLight = base * ( 0.72 + 0.56 * max( dot( wn, uKeyDir ), 0.0 ) );
	vRim = vec3( 0.0 );
	#else
	{
		float fres = 1.0 - max( dot( wn, normalize( cameraPosition - wp.xyz ) ), 0.0 );
		if ( uObjVm > 0.5 ) {
			// the view-model: a key and a rim fixed to the VIEW (moods.ts VM_AMB), a little wrap so no face is flat black
			vec3 vn = normalize( mat3( viewMatrix ) * wn );
			float kd = dot( vn, uObjKeyDir );
			vLight = uObjAmbient * ( 0.7 + 0.3 * vn.y ) + uObjKey * ( 0.92 * max( kd, 0.0 ) + 0.08 * ( kd * 0.5 + 0.5 ) );
			float rk = max( dot( vn, uObjRimDir ), 0.0 );
			vRim = uObjRim * ( rk * rk * rk * rk );
		} else {
			vLight = uObjAmbient + uObjKey * max( dot( wn, uObjKeyDir ), 0.0 );
			// a cool fill on upright faces and the silhouette (the mood's M_RIM: the chamber's Windlass was lit from above only)
			vRim = uObjRim * ( ( 1.0 - abs( wn.y ) ) * 0.45 + fres * fres * 0.9 );
		}
	}
	#endif
	// the pulses are per pixel (polish round 4): at the vertices of a door leaf or a pillar 3 m tall the muzzle's light
	// was one flat value over the whole face
	vWN = wn;
	vec3 ray = wp.xyz - cameraPosition;
	float dist = length( ray );
	#ifdef USE_INSTANCING
	vFog = vec4( keepFogColour( ray / max( dist, 1e-4 ), dist ), keepFogAmount( ray, dist ) );
	#else
	vFog = vec4( keepFogColourE( ray / max( dist, 1e-4 ), dist, uObjExt ), keepFogAmountE( ray, dist, uObjExt ) );
	#endif
	#ifdef GUN
	vVN = normalize( mat3( viewMatrix ) * wn );
	vKeyCol = uObjAmbient + uObjKey;
	vKeyV = uObjVm > 0.5 ? uObjKeyDir : normalize( mat3( viewMatrix ) * uObjKeyDir );
	vVP = ( viewMatrix * wp ).xyz;
	#endif
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DYN_FRAG = /* glsl */`
#include <common>
${PULSE_GLSL}
${WRONG_GLSL}
${OBJ_GLSL}
uniform sampler2D uAlbedo;
uniform sampler2D uEmisMap;
uniform sampler2D uMatcap;
uniform float uFresnel;
varying vec3 vLight;
varying vec4 vFog;
varying vec2 vUv0;
varying vec3 vCol;
varying vec3 vWPos;
varying vec3 vRim;
varying vec3 vWN;
#ifdef GUN
varying vec3 vVN;
varying vec3 vKeyCol;
varying vec3 vKeyV;
varying vec3 vVP;
#endif
void main() {
	vec3 albedo = vCol;
	float gloss = 0.0;
	#ifdef TEXTURED
	vec4 texel = texture2D( uAlbedo, vUv0 );
	albedo *= texel.rgb;
	gloss = texel.a;
	#endif
	// a filled pulse (the muzzle): held under the cap per pixel, then shaded (shared.ts PULSE_GLSL)
	vec3 c = albedo * vLight;
	if ( keepPulseOn() ) {
		vec4 filled;
		vec3 ring = keepPulseLit( vWPos, normalize( vWN ), filled );
		c += albedo * ring + keepPulseKnee( albedo * filled.rgb ) * filled.a;
	}
	#ifdef GUN
	{
		vec3 vn = normalize( vVN );
		// Look-dev, polish round 3 (R6): blued steel is DARK and shows by what it mirrors. Round 3's first rig added a
		// flat share of the ambient to every face: each facet came out one even mid-grey (a plastic gun). Now the base
		// stays near the albedo and the faces mirror a small studio in VIEW space, looked up by the reflected EYE RAY
		// (per pixel, so a flat face carries a gradient and every barrel and flute a streak): a dark floor, a hard
		// bright horizon in the key's colour, the mood's ambient as the sky above it, and the key itself as a hot spot.
		c *= ${GUN_GAIN.toFixed(2)};
		float gl = max( gloss, 0.35 );
		vec3 ve = normalize( vVP );
		vec3 rf = reflect( ve, vn );
		float fr = 1.0 - max( dot( -ve, vn ), 0.0 );
		fr = 0.30 + 0.70 * fr * fr;
		float hz = rf.y + 0.20 * rf.x;
		float sky = smoothstep( -0.02, 0.10, hz );
		float band = sky * exp( -hz * 5.0 );
		vec3 env = uObjAmbient * ( 0.58 + 0.45 * sky * ( 0.35 + 0.65 * hz ) ) + uObjKey * ( 0.20 + 0.50 * band );   // look team gun, round 4: floors 0.45 / 0.17 -> 0.58 / 0.20 (seen from its side the gun shows more faces that mirror the floor: 4 to 11 % of it sat under L* 12 in the bore and on the rim)
		// a face turned to the eye mirrors her, not the room: dark (the blue reads there); and the blue tints what it mirrors
		env *= 1.0 - 0.45 * smoothstep( -0.10, 0.75, rf.z );
		env *= mix( vec3( 1.0 ), albedo / max( max( albedo.r, max( albedo.g, albedo.b ) ), 0.02 ), 0.55 );
		float nh = max( dot( rf, vKeyV ), 0.0 );
		float nk = max( dot( vn, vKeyV ), 0.0 );
		c += gl * ( fr * env + uObjKey * ( pow( nh, 24.0 ) * 0.9 + pow( nk, 6.0 ) * 0.10 ) );
		#ifdef TEXTURED
		c += texture2D( uMatcap, vn.xy * 0.5 + 0.5 ).rgb * gloss * vKeyCol * 0.35;
		#endif
		c += vRim * ( 0.25 + 0.75 * gl );
		// integration: a NARROW rim. The revolver is seen from behind and above: nearly every face of the barrel and the
		// frame is at a grazing angle, and rim^3 x 0.35 of the sky colour washed the whole gun pale teal out of doors on
		// High (shots/integrate-art/game_high/cp_street_clear.png). It stays the darkest thing in the frame.
		float rim = 1.0 - max( vn.z, 0.0 );
		float rim2 = rim * rim;
		c += uSkyCol * ( uFresnel * rim2 * rim2 * rim * 0.10 );
	}
	#else
	#ifdef TEXTURED
	{
		// emissive cells of tx_palette_emis; the knot pulse is 0.7 -> 1.0 at 1.5 Hz
		vec3 e = texture2D( uEmisMap, vUv0 ).rgb;
		float pulse = 0.85 + 0.15 * sin( uTime * 9.42478 );
		float wf = keepWrong( vWPos );
		float col = floor( vUv0.x * 16.0 );
		float violet = step( e.g * 1.3, e.b ) * step( e.g * 1.1, e.r );
		// wrong_fade: a knot's violet goes out (the husk grey is its albedo), a livery band's turns aqua
		float band = step( 5.5, col );
		vec3 turned = mix( vec3( 0.0 ), vec3( 0.2, 0.89, 0.76 ) * max( e.r, e.b ), band );
		e = mix( e, turned, wf * violet );
		c += e * ( uObjEmissive * pulse * uHdr );
	}
	#endif
	c += vRim * ( albedo * 0.6 + 0.05 );
	#endif
	c = mix( c, vFog.rgb, vFog.a );
	gl_FragColor = vec4( c, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

const EMIS_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
${FOG_GLSL}
uniform vec4 uLamp;
uniform int uLampMask;
varying vec2 vUv0;
varying vec3 vWPos;
varying vec4 vFog;
varying vec2 vEmis;
void main() {
	vUv0 = uv;
	vec3 vc = vec3( 1.0, 0.0, 0.0 );
	#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	vc = color.rgb;
	#endif
	#include <begin_vertex>
	#include <skinbase_vertex>
	#include <skinning_vertex>
	mat4 mm = modelMatrix;
	#ifdef USE_INSTANCING
	mm = modelMatrix * instanceMatrix;
	#endif
	vec4 wp = mm * vec4( transformed, 1.0 );
	vWPos = wp.xyz;
	float lit = 1.0;
	#ifdef LAMPS
	{
		int i = int( floor( uv1.x * uLamp.w ) );
		bool on = float( i ) < uLamp.x;
		if ( i < 32 && ( ( uLampMask >> i ) & 1 ) == 1 ) on = true;
		lit = on ? 1.0 : 0.0;
	}
	#endif
	// G: 0 steady, 0.5 flicker, 1 off until its lamp state is set
	if ( vc.g > 0.75 ) lit *= uLamp.z;
	else if ( vc.g > 0.25 ) {
		float bucket = floor( uTime * 9.0 ) + floor( wp.x * 0.37 + wp.z * 0.61 );
		float h = fract( sin( bucket * 12.9898 ) * 43758.5453 );
		lit *= mix( 0.8, 0.35 + 0.65 * step( 0.3, h ), uFlicker );
	}
	vEmis = vec2( vc.r * lit * uLamp.y, vc.b );
	vec3 ray = wp.xyz - cameraPosition;
	float dist = length( ray );
	vFog = vec4( keepFogColour( ray / max( dist, 1e-4 ), dist ), keepFogAmount( ray, dist ) );
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const EMIS_FRAG = /* glsl */`
#include <common>
${WRONG_GLSL}
uniform sampler2D uEmisMap;
const vec3 uFlatEmis = ${glslVec3(HUE.aqua)};
const vec3 uDark = ${glslVec3(new THREE.Color(0x0e1418))};
varying vec2 vUv0;
varying vec3 vWPos;
varying vec4 vFog;
varying vec2 vEmis;
void main() {
	#ifdef TEXTURED
	vec3 e = texture2D( uEmisMap, vUv0 ).rgb;
	#else
	vec3 e = uFlatEmis;
	#endif
	// wrong_fade (B takes part): what was violet turns to the works' aqua
	e = mix( e, vec3( 0.2, 0.89, 0.76 ) * max( e.r, max( e.g, e.b ) ), keepWrong( vWPos ) * vEmis.y );
	vec3 c = mix( uDark, e, min( vEmis.x, 1.0 ) ) * max( vEmis.x, 1.0 ) * mix( 1.0, uHdr, min( vEmis.x, 1.0 ) );
	#ifdef FARFOG
	// the lit windows of the town card, 250 m out in the blue hour: lamps, not paint. Their haze stops at 30 %.
	// (polish round 3: they burn half as bright again; they were "legible only as dots")
	// (polish round 4: an UNLIT pane took the same 30 % of the ember haze and stood on its dark wall, whose own haze
	// stops at 6 %, as a dull rose square. The cap follows the lamp: 6 % dark, 30 % lit.)
	c = mix( c * ( 1.0 + 0.6 * min( vEmis.x, 1.0 ) ), vFog.rgb, min( vFog.a * 0.6, mix( 0.06, 0.30, min( vEmis.x, 1.0 ) ) ) );
	#else
	c = mix( c, vFog.rgb, vFog.a * 0.6 );
	#endif
	gl_FragColor = vec4( c, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------------------------------
// Per-object state
// ---------------------------------------------------------------------------------------------------------------------

class PropState {
  ar = 1; ag = 1; ab = 1; kr = 0; kg = 0; kb = 0; dx = 0; dy = 1; dz = 0;
  /** the rim (the mood's cool fill, or the view-model rig's) */
  rr = 0; rg = 0; rb = 0;
  /** a thing of the view-model: lit by the view-model's rig, not by the zone (looked up with the zone) */
  vm = false;
  mood: MoodKey | '' = '';
  emissive = 1;
  frame = -1;
  countdown = 0;
  /** 1 when its mood is an exterior one (its fog is the open air's when seen from inside) */
  ext = 0;
  /** where it stood at its last zone look-up, and the factory's snap generation it has seen */
  readonly at = new Float32Array(3);
  gen = -1;
}

/** where the lamps of one emissive geometry are (object space), for the halo pool */
export interface LampInfo {
  count: number;
  /** x, y, z, size per lamp */
  at: Float32Array;
  /** intensity (COLOR_0.r), flicker group (G), wrong_fade share (B), hue index per lamp */
  rgbh: Float32Array;
}
class EmisState {
  count = 0; mask = 0; boost = 1; triggered = false;
  lastSeen = -1;
  info: LampInfo | null = null;
  lamps = 0;
  constructor(readonly mesh: THREE.Mesh) {}
}

/** what the halo pass writes into: the quad batch (an offset per instance, 20 floats the caller writes) */
export interface HaloSink { readonly data: Float32Array; next(): number }

/** A halo to write: its fields are set, then writeHalo copies them (a double passed as an argument would be boxed). */
export class HaloSpec { x = 0; y = 0; z = 0; size = 0; alpha = 0; minPx = 0; pull = 0.02; white = 0.35 }
/** One additive soft dot written straight into the batch. */
export function writeHalo(sink: HaloSink, h: HaloSpec, c: THREE.Color): void {
  const o = sink.next();
  if (o < 0) return;
  const d = sink.data;
  d[o] = h.x; d[o + 1] = h.y; d[o + 2] = h.z; d[o + 3] = 0;
  d[o + 4] = 0; d[o + 5] = h.minPx; d[o + 6] = h.pull; d[o + 7] = h.size;
  d[o + 8] = c.r; d[o + 9] = c.g; d[o + 10] = c.b; d[o + 11] = h.alpha;
  d[o + 12] = h.white; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
  // shape 1 (a soft dot), additive, a glow: bounded on screen and faded near the camera (quads.ts FLAG_GLOW)
  d[o + 16] = 1; d[o + 17] = 0; d[o + 18] = h.size; d[o + 19] = FLAG_ADD | FLAG_GLOW;
}
/** a lamp's halo is this much larger than the lamp, and never more than HALO_SIZE_MAX metres across */
const HALO_GROW = 0.8, HALO_SIZE_MAX = 0.75;
/**
 * Polish round 3 (visual critic: "lamp halos are soft blurred discs floating in front of their fixtures"): half the
 * radius, a tight falloff with a hot heart (quads.ts SHAPE_SOFT, its second parameter), and gone between HALO_FADE_NEAR
 * and HALO_FADE_FAR metres: at fight distance a lamp is its own emissive mesh, not a sprite.
 */
const HALO_FADE_NEAR = 16, HALO_FADE_FAR = 38;
/** lamps beyond HALO_FAR are far scenery (the town's windows from the rim): a pixel-sized glow, pulled nearer in depth */
const HALO_FAR = 110, HALO_FAR_MAX = 420;

/** hue of an emissive palette column (row 4 of tx_palette_emis: flame, core, aqua, core, violet, core, band, core) */
const HUE_BY_COLUMN: readonly THREE.Color[] = [HUE.flame, HUE.flameCore, HUE.aqua, HUE.aquaCore, HUE.violet, HUE.violetCore, HUE.violet, HUE.violetCore];

function lampInfoOf(geometry: THREE.BufferGeometry, lampCount: number, textured: boolean): LampInfo {
  const pos = geometry.getAttribute('position');
  const uv1 = geometry.getAttribute('uv1'), uv = geometry.getAttribute('uv'), col = geometry.getAttribute('color');
  const n = pos.count;
  // which lamp a vertex belongs to: its lamp index (lamp sets) or its island (anything else emissive)
  const group = new Int32Array(n);
  let groups = 0;
  if (lampCount > 0 && uv1) {
    groups = lampCount;
    for (let i = 0; i < n; i++) group[i] = Math.min(lampCount - 1, Math.max(0, Math.floor(uv1.getX(i) * lampCount)));
  } else {
    // islands: union vertices that share a triangle or a position
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (a: number): number => { let r = a; while (parent[r] !== r) r = parent[r] as number; while (parent[a] !== r) { const nx = parent[a] as number; parent[a] = r; a = nx; } return r; };
    const union = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    const index = geometry.getIndex();
    const tris = index ? index.count / 3 : n / 3;
    for (let t = 0; t < tris; t++) {
      const a = index ? index.getX(t * 3) : t * 3, b = index ? index.getX(t * 3 + 1) : t * 3 + 1, c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      union(a, b); union(b, c);
    }
    const welded = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(pos.getX(i) * 200)},${Math.round(pos.getY(i) * 200)},${Math.round(pos.getZ(i) * 200)}`;
      const seen = welded.get(key);
      if (seen === undefined) welded.set(key, i); else union(i, seen);
    }
    const ids = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let id = ids.get(r);
      if (id === undefined) { id = ids.size; ids.set(r, id); }
      group[i] = id;
    }
    groups = ids.size;
  }
  const count = Math.min(groups, lampCount > 0 ? groups : MAX_ISLANDS);
  const min = new Float32Array(count * 3).fill(Infinity), max = new Float32Array(count * 3).fill(-Infinity);
  const sum = new Float32Array(count * 4), num = new Float32Array(count);
  const rgbh = new Float32Array(count * 4);
  for (let i = 0; i < n; i++) {
    const g = group[i] as number;
    if (g >= count) continue;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    min[g * 3] = Math.min(min[g * 3] as number, x); min[g * 3 + 1] = Math.min(min[g * 3 + 1] as number, y); min[g * 3 + 2] = Math.min(min[g * 3 + 2] as number, z);
    max[g * 3] = Math.max(max[g * 3] as number, x); max[g * 3 + 1] = Math.max(max[g * 3 + 1] as number, y); max[g * 3 + 2] = Math.max(max[g * 3 + 2] as number, z);
    sum[g * 4] = (sum[g * 4] as number) + (col ? col.getX(i) : 1);
    sum[g * 4 + 1] = (sum[g * 4 + 1] as number) + (col ? col.getY(i) : 0);
    sum[g * 4 + 2] = (sum[g * 4 + 2] as number) + (col ? col.getZ(i) : 0);
    if ((num[g] as number) === 0) rgbh[g * 4 + 3] = textured && uv ? Math.min(7, Math.max(0, Math.floor(uv.getX(i) * 16))) : 2;
    num[g] = (num[g] as number) + 1;
  }
  const at = new Float32Array(count * 4);
  for (let g = 0; g < count; g++) {
    const k = Math.max(1, num[g] as number);
    at[g * 4] = ((min[g * 3] as number) + (max[g * 3] as number)) / 2;
    at[g * 4 + 1] = ((min[g * 3 + 1] as number) + (max[g * 3 + 1] as number)) / 2;
    at[g * 4 + 2] = ((min[g * 3 + 2] as number) + (max[g * 3 + 2] as number)) / 2;
    at[g * 4 + 3] = Math.max((max[g * 3] as number) - (min[g * 3] as number), (max[g * 3 + 1] as number) - (min[g * 3 + 1] as number), (max[g * 3 + 2] as number) - (min[g * 3 + 2] as number));
    rgbh[g * 4] = (sum[g * 4] as number) / k; rgbh[g * 4 + 1] = (sum[g * 4 + 1] as number) / k; rgbh[g * 4 + 2] = (sum[g * 4 + 2] as number) / k;
  }
  return { count, at, rgbh };
}

// ---------------------------------------------------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------------------------------------------------

interface WorldSpec {
  name: string; skin: boolean; hasColor: boolean; light: 'LM' | 'VL' | 'UNLIT' | 'DYN'; lmId: string; layerId: string;
  /** d: the detail texture of the material, p: the palette, k: the mask, -: none */
  tex: 'd' | 'p' | 'k' | '-';
  cloud: boolean; place: boolean; farFog: boolean; ext: boolean; farCard: boolean; cardHeight: number;
}
/** a three-vertex mesh of a shape (see MaterialFactory.note): what `renderer.compile` needs to pick the real mesh's program */
function probeMesh(material: THREE.Material, skin: boolean, inst: boolean, attrs: string, colourSize: number): THREE.Object3D {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  if (attrs.includes('n')) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  if (attrs.includes('u')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
  if (attrs.includes('v')) g.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(6), 2));
  if (colourSize > 0) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * colourSize).fill(1), colourSize));
  let mesh: THREE.Mesh;
  if (skin) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(12), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
    const sm = new THREE.SkinnedMesh(g, material);
    const bone = new THREE.Bone();
    sm.add(bone);
    sm.bind(new THREE.Skeleton([bone]));
    mesh = sm;
  } else if (inst) {
    const im = new THREE.InstancedMesh(g, material, 1);
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh = im;
  } else mesh = new THREE.Mesh(g, material);
  mesh.name = 'keep_probe';
  mesh.frustumCulled = false;
  return mesh;
}
interface DynSpec { name: string; hasColor: boolean; textured: boolean; wind: boolean; breath: boolean; variant: '' | 'skin' | 'inst' }
interface EmisSpec { hasColor: boolean; textured: boolean; lamps: boolean; variant: '' | 'skin' | 'inst'; /** far scenery of the coda (the town's windows) */ far: boolean }

interface LayerUniforms {
  tint: Uniform<THREE.Vector4>; alt: Uniform<THREE.Vector4>;
  /** xyz + radius: where the layer reaches (radius 0: everywhere) */
  at: Uniform<THREE.Vector4>;
  /** x: the share plain surfaces take, y: the height under which everything takes all of it, z: how much undersides take */
  shape: Uniform<THREE.Vector4>;
  /** rgb: the colour plain surfaces take the layer in */
  wall: Uniform<THREE.Vector4>;
  /** what a weight of 1 is worth in the shader */
  gain: number;
  weight: number; from: number; to: number; t: number; seconds: number;
}
/** the smallest a far figure card is drawn, in pixels of height (layout vista_dowser.minPixels: 3 wide by 8 tall) */
const FARCARD_MIN_PX = 9;
/**
 * lm_tally_hatch (polish round 2). The layer is a greyscale bake of the lit hatch well over the whole room; at weight 1
 * and pure aqua, on orange adobe at exposure 2, it turned the north half of the Tally House light yellow-green (wall
 * samples #96B07A, L* 64 to 75: a fourth colour on the largest surface of an 8 : 22 : 70 room). Now: the tint is aqua
 * mixed half with enamel white `#E6E2D0`, a weight of 1 is worth 0.4, and it reaches only HATCH_REACH metres from the
 * hatch (layout light_tally_hatch): the well, the lift frame and the floor by it.
 */
const HATCH_GAIN = 0.4, HATCH_REACH = 4.2;
/**
 * lm_bore_glow: plain walls, floor and rib faces take BORE_WALL of it (they stay petrol); the pit under the kerb top,
 * the kerb's underside and the ribs' undersides take all of it. Round 1 drew it at 1 everywhere: 15 to 27 % of a boss
 * frame was over OKLCH chroma 0.11 and the Windlass was dark violet on dark violet.
 */
const BORE_GAIN = 0.65, BORE_WALL = 0.6;
/**
 * Polish round 3 (visual critic: "walls flooded with saturated violet, 89 to 93 % of the frame under L* 35, the Windlass a
 * black mass on violet"): the violet belongs to the pit and the knots. Plain walls take the glow layer half-way to the
 * teal of the floor strips, so the room reads petrol with a violet heart, and the machine has something cool behind it.
 */
const BORE_WALL_TEAL = 0x58c8c0, BORE_WALL_MIX = 0.7;

export class MaterialFactory {
  readonly lamps: LampApi;
  private readonly cache = new Map<string, THREE.Material>();
  private readonly propStates = new WeakMap<THREE.Object3D, PropState>();
  private readonly emisStates = new WeakMap<THREE.Object3D, EmisState>();
  private readonly lampInfos = new WeakMap<THREE.BufferGeometry, LampInfo>();
  private readonly emitters: EmisState[] = [];
  private readonly layers = new Map<TextureId, LayerUniforms>();
  private readonly layerList: LayerUniforms[] = [];
  private readonly exterior = new Set<string>();
  private readonly zoneMood = new Map<string, MoodId>();
  private readonly propMaterials: THREE.ShaderMaterial[] = [];
  private readonly emisMaterials: THREE.ShaderMaterial[] = [];
  private frame = 0;
  private frameDt = 1 / 60;
  private readonly v = new THREE.Vector3();
  private readonly propOnBeforeRender: THREE.Material['onBeforeRender'];
  private readonly emisOnBeforeRender: THREE.Material['onBeforeRender'];
  /** true inside a sun blade (set by the vfx cards): the Tally House's key is on only there */
  bladeAt: (x: number, y: number, z: number) => boolean = () => false;
  /** programs known to this factory (tests) */
  readonly variants: string[] = [];
  readonly uFlicker: Uniform<number>;
  readonly uFresnel: Uniform<number> = { value: 0 };
  haloScale = 1;

  constructor(private readonly ctx: GameContext, private readonly shared: SharedUniforms) {
    this.uFlicker = shared.uFlicker;
    for (const z of ctx.data.layout.zones) {
      if (z.kind === 'exterior') this.exterior.add(z.id);
      this.zoneMood.set(z.id, z.mood);
    }
    this.propOnBeforeRender = (_r, _s, _c, _g, object) => { this.applyProp(object); };
    this.emisOnBeforeRender = (_r, _s, _c, _g, object) => { this.applyEmis(object); };
    this.lamps = {
      setMask: (lampSet, mask) => { this.eachEmis(lampSet, 0, mask); },
      setCount: (lampSet, count) => { this.eachEmis(lampSet, 1, count); },
      setBoost: (lampSet, boost) => { this.eachEmis(lampSet, 2, boost); },
    };
  }

  private texture(id: TextureId): THREE.Texture | null {
    return this.ctx.assets.isActive(id) ? this.ctx.assets.texture(id) : null;
  }

  material(name: string, mesh: THREE.Mesh, def: AssetDef | null): THREE.Material {
    if (name === 'm_emis') return this.emis(mesh, def);
    if (name === 'm_prop' || name === 'm_gun') return this.dynamic(name, mesh);
    return this.world(name, mesh, def);
  }

  // ---- world ------------------------------------------------------------------------------------------------------
  private world(name: string, mesh: THREE.Mesh, def: AssetDef | null): THREE.Material {
    const g = mesh.geometry;
    const hasColor = g.getAttribute('color') !== undefined;
    const hasUv1 = g.getAttribute('uv1') !== undefined;
    const bake = typeof mesh.userData.bake === 'string' ? (mesh.userData.bake as string) : '';
    const lmId = typeof mesh.userData.lightmap === 'string' ? (mesh.userData.lightmap as string) : '';
    const layerId = typeof mesh.userData.lightLayer === 'string' ? (mesh.userData.lightLayer as string) : '';
    const lm = bake === 'LM' && lmId !== '' && hasUv1 ? this.texture(lmId) : null;
    const layer = lm && layerId !== '' ? this.texture(layerId) : null;
    const zoneLit = bake === 'VL' || bake === 'LM' || (bake === '' && def !== null && def.chunks !== undefined);
    const unlit = bake === 'UNLIT' || (bake === '' && def !== null && def.bake === 'UNLIT');
    const textured = g.getAttribute('uv') !== undefined && !inPlaceholder(mesh);
    const detailId = DETAIL[name];
    const detail = textured && detailId ? this.texture(detailId) : null;
    const palette = textured && name === 'm_flat' ? this.texture('tx_palette') : null;
    const mask = textured && name === 'm_mask' ? this.texture('tx_mask') : null;
    const cloud = def !== null && def.zone !== null && this.exterior.has(def.zone) && this.texture('tx_noise') !== null;
    const light = lm ? 'LM' : zoneLit ? 'VL' : unlit ? 'UNLIT' : 'DYN';
    // a placeholder zone is lit by a fixed white key: under an interior mood that key takes the mood's level
    const place = (light === 'VL' || light === 'LM') && def !== null && def.chunks !== undefined && inPlaceholder(mesh);
    const skin = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
    // far scenery of the coda: an unlit m_flat card of an asset that is resident in the coda only
    const farFog = name === 'm_flat' && light === 'UNLIT' && def !== null && def.sets.length === 1 && def.sets[0] === 'coda';
    // a thing of the open air: a mesh of an exterior zone, or unlit zoneless scenery (the backdrops, the far cards).
    // Seen from inside a building it keeps the Long Light's fog (shared.ts keepFogE)
    const ext = !farFog && def !== null && (def.zone !== null ? this.exterior.has(def.zone) : light === 'UNLIT');
    // a far figure card: an unlit, zoneless, alpha-tested card (card_dowser)
    const farCard = name === 'm_mask' && light === 'UNLIT' && def !== null && def.zone === null && def.chunks === undefined;
    const cardHeight = farCard && def !== null ? Math.max(0.1, def.placeholder.size[1]) : 1;
    const spec: WorldSpec = {
      name, skin, hasColor, light, lmId: lm ? lmId : '', layerId: layer ? layerId : '', tex: detail ? 'd' : palette ? 'p' : mask ? 'k' : '-',
      cloud, place, farFog, ext, farCard, cardHeight,
    };
    const m = this.buildWorld(spec);
    this.note('w', spec, m, g, skin, false);
    return m;
  }
  /** The world material of a spec (built once; a set that was released and activated again has new texture objects). */
  private buildWorld(spec: WorldSpec): THREE.Material {
    const { name, skin, hasColor, light, lmId, layerId, cloud, place, farFog, ext, farCard, cardHeight } = spec;
    const lm = lmId !== '' ? this.texture(lmId) : null;
    const layer = layerId !== '' ? this.texture(layerId) : null;
    const detail = spec.tex === 'd' ? this.texture(DETAIL[name] as TextureId) : null;
    const palette = spec.tex === 'p' ? this.texture('tx_palette') : null;
    const mask = spec.tex === 'k' ? this.texture('tx_mask') : null;
    const key = `${name}|${skin ? 'k' : ''}|${hasColor ? 'c' : 'n'}|${light}:${lmId}|${layerId}|${spec.tex}|${cloud ? 'cl' : ''}|${place ? 'pl' : ''}|${farFog ? 'ff' : ''}|${ext ? 'x' : ''}|${farCard ? 'fc' + cardHeight.toFixed(2) : ''}`;
    const cached = this.cache.get(key) as (THREE.MeshBasicMaterial & { userData: { lm?: Uniform<THREE.Texture | null>; layer?: Uniform<THREE.Texture | null> } }) | undefined;
    if (cached) {
      // a set that was released and activated again has new texture objects (and a material built ahead of its set,
      // see prewarm, meets its lightmap here for the first time)
      if (cached.userData.lm && lm) cached.userData.lm.value = lm;
      if (cached.userData.layer && layer) cached.userData.layer.value = layer;
      if (detail || palette) cached.map = detail ?? palette;
      if (mask) cached.alphaMap = mask;
      return cached;
    }
    const m = new THREE.MeshBasicMaterial({ vertexColors: hasColor, fog: false });
    m.name = name;
    const defines: Record<string, string> = {};
    const scale = lmId !== '' ? this.ctx.data.manifest.textures[lmId]?.lightmapScale ?? 2 : 2;
    if (light === 'LM') { defines.LM = ''; defines.USE_UV1 = ''; defines.LM_SCALE = scale.toFixed(4); }
    if (layerId !== '') defines.LAYER = '';
    if (light === 'DYN') defines.DYN = '';
    if (light === 'UNLIT') defines.UNLIT = '';
    if (spec.tex === 'd') { defines.DETAIL = ''; m.map = detail; } else if (spec.tex === 'p') m.map = palette;
    if (cloud) defines.CLOUD = '';
    if (farFog) defines.FARFOG = '';
    if (farCard) { defines.FARCARD = ''; defines.FARCARD_H = cardHeight.toFixed(3); defines.FARCARD_PX = FARCARD_MIN_PX.toFixed(1); } else if (ext) defines.EXT = '';
    if (place) defines.PLACE = '';
    if (name === 'm_mask') {
      m.alphaTest = 0.5; m.side = THREE.DoubleSide; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
      if (spec.tex === 'k') { m.alphaMap = mask; defines.MASK = ''; }
    }
    m.defines = defines;
    const lmUniform: Uniform<THREE.Texture | null> = { value: lm };
    const layerUniform: Uniform<THREE.Texture | null> = { value: layer };
    const layerU = layerId !== '' ? this.layer(layerId) : null;
    m.userData.lm = lmUniform; m.userData.layer = layerUniform;
    const shared = this.shared;
    m.onBeforeCompile = (shader): void => {
      shared.attach(shader.uniforms as Record<string, Uniform<unknown>>);
      shader.uniforms.uLightmap = lmUniform; shader.uniforms.uLayer = layerUniform;
      if (layerU) { shader.uniforms.uLayerTint = layerU.tint; shader.uniforms.uLayerAlt = layerU.alt; shader.uniforms.uLayerAt = layerU.at; shader.uniforms.uLayerShape = layerU.shape; shader.uniforms.uLayerWall = layerU.wall; }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + WORLD_VERT_PARS)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_VERT);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + WORLD_FRAG_PARS)
        // the colour is white and opaque: without these two uniforms three has nothing of its own to upload per material
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( 1.0 );')
        .replace('#include <map_fragment>', WORLD_MAP)
        .replace('#include <alphamap_fragment>', '#ifdef MASK\ndiffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).r;\n#endif')
        .replace('#include <opaque_fragment>', WORLD_LIGHT + '\n#include <opaque_fragment>');
    };
    const programKey = 'keep_world|' + Object.keys(defines).sort().join(',') + (light === 'LM' ? '|s' + defines.LM_SCALE : '') + (farCard ? '|h' + defines.FARCARD_H : '') + (skin ? '|skin' : '');
    m.customProgramCacheKey = (): string => programKey;
    if (!this.variants.includes(programKey)) this.variants.push(programKey);
    this.cache.set(key, m);
    return m;
  }

  // ---- recipes: every program the stage needs, known before its set is there (polish round 3) --------------------------
  /**
   * A program is a material and the SHAPE of the mesh it meets (three compiles by vertex colours and their size, UV1,
   * normals, skinning, instancing). Every pair the factory hands out is noted as a recipe: a line of JSON from which the
   * same material and a three-vertex probe of the same shape can be built with no asset at hand. prewarm.ts holds the
   * recipes of a whole playthrough; the system compiles them behind the first loading screen, so the programs of the
   * gallery, the underground and the coda exist before she gets there (they were linked in the middle of play: at the
   * hatch, on the stair, in the proving lift).
   */
  private readonly recipes = new Map<string, string>();
  private readonly probes = new Map<string, THREE.Object3D>();
  private note(kind: 'w' | 'd' | 'e', spec: object, material: THREE.Material, g: THREE.BufferGeometry, skin: boolean, inst: boolean): void {
    const col = g.getAttribute('color');
    const shape = `${skin ? 's' : ''}${inst ? 'i' : ''}|${g.getAttribute('normal') ? 'n' : ''}${g.getAttribute('uv') ? 'u' : ''}${g.getAttribute('uv1') ? 'v' : ''}|${col ? col.itemSize : 0}`;
    const id = material.uuid + "#" + shape;
    if (this.recipes.has(id)) return;
    this.recipes.set(id, JSON.stringify({ k: kind, s: spec, shape }));
  }
  /** the recipes noted so far, sorted (the generator of prewarm.ts; tests) */
  recipeList(): string[] { return Array.from(new Set(this.recipes.values())).sort(); }
  /**
   * The probes of a list of recipes: one tiny mesh per recipe, carrying the very material object the real meshes will
   * get. Compiled by the system's warm-up (never drawn). A recipe that cannot be built here (a shared texture missing)
   * is skipped: its program then links when it is first met, as before.
   */
  prewarm(list: readonly string[]): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const line of list) {
      let probe = this.probes.get(line);
      if (!probe) {
        try {
          const r = JSON.parse(line) as { k: 'w' | 'd' | 'e'; s: unknown; shape: string };
          const [flags = '', attrs = '', colour = '0'] = r.shape.split('|');
          const skin = flags.includes('s'), inst = flags.includes('i');
          const material = r.k === 'w' ? this.buildWorld(r.s as WorldSpec) : r.k === 'd' ? this.buildDynamic(r.s as DynSpec) : this.buildEmis(r.s as EmisSpec);
          probe = probeMesh(material, skin, inst, attrs, Number(colour));
          this.probes.set(line, probe);
          // noted in the canonical form (a caller may mark a line to get a probe of its own: the shadow casters)
          this.recipes.set(material.uuid + "#" + r.shape, JSON.stringify({ k: r.k, s: r.s, shape: r.shape }));
        } catch { continue; }
      }
      out.push(probe);
    }
    return out;
  }

  /** the uniforms of one light layer texture: tint (rgb, w = weight) and what wrong_fade turns it into */
  private layer(id: TextureId): LayerUniforms {
    let l = this.layers.get(id);
    if (!l) {
      const bore = id === 'lm_bore_glow', hatch = id === 'lm_tally_hatch';
      // the bore's violet is held a quarter of the way toward a pale lavender: a large lit surface is never the pure hue
      const c = bore ? HUE.violet.clone().lerp(new THREE.Color(0xc8bcf0), 0.25) : hatch ? HUE.aqua.clone().lerp(new THREE.Color(0xe6e2d0), 0.5) : HUE.aqua;
      const gain = bore ? BORE_GAIN : hatch ? HATCH_GAIN : 1;
      const at = new THREE.Vector4(0, 0, 0, 0);
      if (hatch) {
        const m = this.ctx.data.layout.markers.find((x) => x.id === 'light_tally_hatch');
        if (m) at.set(m.pos[0], m.pos[1], m.pos[2], HATCH_REACH);
      }
      l = {
        tint: { value: new THREE.Vector4(c.r, c.g, c.b, bore ? gain : 0) },
        alt: { value: new THREE.Vector4(HUE.aqua.r * 0.9, HUE.aqua.g * 0.9, HUE.aqua.b * 0.9, bore ? 1 : 0) },
        at: { value: at },
        shape: { value: new THREE.Vector4(bore ? BORE_WALL : 1, BORE_KERB_TOP_Y, 1, 0) },
        wall: { value: ((w: THREE.Color) => new THREE.Vector4(w.r, w.g, w.b, 0))(bore ? c.clone().lerp(new THREE.Color(BORE_WALL_TEAL), BORE_WALL_MIX) : c) },
        gain,
        weight: bore ? 1 : 0, from: 0, to: bore ? 1 : 0, t: 1, seconds: 0,
      };
      this.layers.set(id, l);
      this.layerList.push(l);
    }
    return l;
  }
  setLightLayer(id: TextureId, weight: number, seconds: number): void {
    const l = this.layer(id);
    l.from = l.weight; l.to = weight; l.t = seconds > 0 ? 0 : 1; l.seconds = seconds;
    if (seconds <= 0) { l.weight = weight; l.tint.value.w = weight * l.gain; }
  }
  layerWeight(id: TextureId): number { return this.layers.get(id)?.weight ?? 0; }

  // ---- emissive ---------------------------------------------------------------------------------------------------
  private emis(mesh: THREE.Mesh, def: AssetDef | null): THREE.Material {
    const g = mesh.geometry;
    const spec: EmisSpec = {
      far: def !== null && def.sets.length === 1 && def.sets[0] === 'coda' && def.bake === 'UNLIT' && def.chunks === undefined,
      hasColor: g.getAttribute('color') !== undefined, textured: g.getAttribute('uv') !== undefined && !inPlaceholder(mesh),
      lamps: typeof mesh.userData.lampCount === 'number' && g.getAttribute('uv1') !== undefined,
      variant: (mesh as THREE.SkinnedMesh).isSkinnedMesh === true ? 'skin' : '',
    };
    const m = this.buildEmis(spec);
    this.note('e', spec, m, g, spec.variant === 'skin', false);
    return m;
  }
  private buildEmis(spec: EmisSpec): THREE.ShaderMaterial {
    const { hasColor, lamps } = spec;
    const map = spec.textured ? this.texture('tx_palette_emis') : null;
    const key = `m_emis|${hasColor ? 'c' : 'n'}|${map ? 't' : '-'}|${lamps ? 'l' : ''}|${spec.variant}|${spec.far ? 'f' : ''}`;
    const cached = this.cache.get(key) as THREE.ShaderMaterial | undefined;
    if (cached) return cached;
    const defines: Record<string, string> = {};
    if (map) defines.TEXTURED = '';
    if (lamps) { defines.LAMPS = ''; defines.USE_UV1 = ''; }
    if (spec.far) defines.FARFOG = '';
    const uniforms: Record<string, Uniform<unknown>> = {
      uEmisMap: { value: map }, uLamp: { value: new THREE.Vector4(1e6, 1, 0, 1) }, uLampMask: { value: 0 },
    };
    this.shared.attach(uniforms);
    const m = new THREE.ShaderMaterial({ name: 'm_emis', defines, uniforms, vertexShader: EMIS_VERT, fragmentShader: EMIS_FRAG, vertexColors: hasColor, fog: false });
    m.onBeforeRender = this.emisOnBeforeRender;
    m.userData.emis = spec;
    this.emisMaterials.push(m);
    this.variants.push('keep_emis|' + Object.keys(defines).sort().join(',') + '|' + spec.variant);
    this.cache.set(key, m);
    return m;
  }

  private emisState(mesh: THREE.Mesh): EmisState {
    let s = this.emisStates.get(mesh);
    if (!s) {
      s = new EmisState(mesh);
      const lampCount = typeof mesh.userData.lampCount === 'number' ? (mesh.userData.lampCount as number) : 0;
      s.lamps = lampCount;
      let info = this.lampInfos.get(mesh.geometry);
      if (!info) {
        const mat = mesh.material as THREE.ShaderMaterial;
        info = lampInfoOf(mesh.geometry, lampCount, mat.defines !== undefined && mat.defines.TEXTURED !== undefined);
        this.lampInfos.set(mesh.geometry, info);
      }
      s.info = info;
      this.emisStates.set(mesh, s);
      if (this.emitters.length < MAX_EMITTERS) this.emitters.push(s);
    }
    return s;
  }
  private applyEmis(object: THREE.Object3D): void {
    const mesh = object as THREE.Mesh;
    const s = this.emisState(mesh);
    s.lastSeen = this.frame;
    const m = mesh.material as THREE.ShaderMaterial;
    const lamp = (m.uniforms.uLamp as Uniform<THREE.Vector4>).value;
    const count = s.triggered ? s.count : 1e6, trig = s.triggered ? 1 : 0, n = s.lamps > 1 ? s.lamps : 1, mask = s.triggered ? s.mask | 0 : 0;
    const maskU = m.uniforms.uLampMask as Uniform<number>;
    if (lamp.x !== count || lamp.y !== s.boost || lamp.z !== trig || lamp.w !== n || maskU.value !== mask) {
      lamp.x = count; lamp.y = s.boost; lamp.z = trig; lamp.w = n; maskU.value = mask;
      m.uniformsNeedUpdate = true;
    }
  }
  private eachEmis(root: THREE.Object3D, what: 0 | 1 | 2, value: number): void {
    const mesh = root as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === 'm_emis') {
      const s = this.emisState(mesh);
      if (what === 0) { s.mask = value; s.triggered = true; } else if (what === 1) { s.count = value; s.triggered = true; } else s.boost = value;
    }
    const kids = root.children;
    for (let i = 0; i < kids.length; i++) this.eachEmis(kids[i] as THREE.Object3D, what, value);
  }
  /** tests and the sandbox: the lamp state of a lamp-set mesh */
  lampState(object: THREE.Object3D): { count: number; mask: number; boost: number; triggered: boolean } | null {
    const s = this.emisStates.get(object);
    return s ? { count: s.count, mask: s.mask, boost: s.boost, triggered: s.triggered } : null;
  }

  /** One halo per lit lamp of every emissive mesh that was drawn in the last frame (the Low tier's bloom substitute). */
  emitHalos(sink: HaloSink, wrong: number): number {
    const list = this.emitters, v = this.v, scale = this.haloScale;
    const cam = this.ctx.scene.camera.position;
    let n = 0;
    for (let e = list.length - 1; e >= 0; e--) {
      const s = list[e] as EmisState;
      if (s.lastSeen < this.frame - 1) {
        // not drawn for a long time and no longer in a scene: forget it
        if (s.lastSeen < this.frame - 600 && s.mesh.parent === null) { list[e] = list[list.length - 1] as EmisState; list.pop(); this.emisStates.delete(s.mesh); }
        continue;
      }
      const info = s.info;
      if (!info) continue;
      const mw = s.mesh.matrixWorld;
      const sx = mw.elements[0] as number, sy = mw.elements[1] as number, sz = mw.elements[2] as number;
      const objScale = Math.sqrt(sx * sx + sy * sy + sz * sz);
      for (let i = 0; i < info.count; i++) {
        const g = info.rgbh[i * 4 + 1] as number;
        let lit = info.rgbh[i * 4] as number;
        if (s.triggered) { if (!(i < s.count || (i < 32 && ((s.mask >>> i) & 1) === 1))) lit = 0; } else if (g > 0.75) lit = 0;
        if (g > 0.25 && g <= 0.75) lit *= 0.7;
        if (lit <= 0.02) continue;
        v.set(info.at[i * 4] as number, info.at[i * 4 + 1] as number, info.at[i * 4 + 2] as number).applyMatrix4(mw);
        const dx = v.x - cam.x, dy = v.y - cam.y, dz = v.z - cam.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > HALO_FAR_MAX * HALO_FAR_MAX) continue;
        // far scenery (the town's lit windows, 250 m from the rim): a glow of a few pixels, pulled nearer in depth so
        // the haze-coloured card it sits on does not cut it. Round 1 dropped every halo beyond 110 m.
        const far = d2 > HALO_FAR * HALO_FAR;
        let hue = HUE_BY_COLUMN[(info.rgbh[i * 4 + 3] as number) | 0] ?? HUE.aqua;
        const b = info.rgbh[i * 4 + 2] as number;
        if (wrong * b > 0.5 && (hue === HUE.violet || hue === HUE.violetCore)) hue = HUE.aqua;
        // polish round 2: 2.5 x the lamp up to 3.5 m gave the six bay lamps of the bore 3.25 m discs and the Windlass's
        // 26 gauge segments one white blob over its face. A halo is the lamp and half as much again, at most 1.5 m, and
        // a set of many lamps shares the light of eight.
        const size = Math.min(HALO_SIZE_MAX, Math.max(0.12, (info.at[i * 4 + 3] as number) * objScale * HALO_GROW) * (0.6 + 0.4 * scale));
        const dense = info.count > 8 ? 8 / info.count : 1;
        let fade = 1;
        if (!far) {
          const dist = Math.sqrt(d2);
          if (dist >= HALO_FADE_FAR) continue;
          if (dist > HALO_FADE_NEAR) fade = (HALO_FADE_FAR - dist) / (HALO_FADE_FAR - HALO_FADE_NEAR);
        }
        const o = sink.next();
        if (o < 0) return n;
        const d = sink.data;
        d[o] = v.x; d[o + 1] = v.y; d[o + 2] = v.z; d[o + 3] = 0;
        // (look-dev, polish round 3: the far glow at full strength with a white heart drew every lit window of the town as
        // a round orange dot over its pane. It is a soft bloom round a pane that keeps its shape: 24 px, 38 %, no heart.)
        d[o + 4] = 0; d[o + 5] = far ? 24 : 0; d[o + 6] = far ? 0.06 : 0.02; d[o + 7] = size;
        d[o + 8] = hue.r; d[o + 9] = hue.g; d[o + 10] = hue.b; d[o + 11] = (far ? 0.38 : 0.6 * dense * fade) * Math.min(1.6, lit * s.boost) * (far ? 1 : scale);
        d[o + 12] = far ? 0.0 : 0.85; d[o + 13] = far ? 0 : 1; d[o + 14] = 0; d[o + 15] = 0;
        // additive + a glow (quads.ts FLAG_GLOW): bounded on screen, faded near the camera
        d[o + 16] = 1; d[o + 17] = 0; d[o + 18] = size; d[o + 19] = FLAG_ADD | FLAG_GLOW;
        n++;
      }
    }
    return n;
  }

  // ---- dynamic ----------------------------------------------------------------------------------------------------
  private dynamic(name: string, mesh: THREE.Mesh): THREE.Material {
    const g = mesh.geometry;
    const spec: DynSpec = {
      name, hasColor: g.getAttribute('color') !== undefined, textured: g.getAttribute('uv') !== undefined && !inPlaceholder(mesh),
      wind: mesh.userData.wind === 1 || mesh.userData.wind === true,
      breath: (mesh.userData.breath === 1 || mesh.userData.breath === true) && g.getAttribute('uv1') !== undefined,
      // one material object per kind of object it is drawn on: three rebuilds the program's parameters (and allocates)
      // every time one material meets a plain, a skinned and an instanced mesh in turn
      variant: (mesh as THREE.SkinnedMesh).isSkinnedMesh === true ? 'skin' : '',
    };
    // dynamic casters of the High tier's sun shadow map
    mesh.castShadow = name !== 'm_gun';
    const m = this.buildDynamic(spec);
    this.note('d', spec, m, g, spec.variant === 'skin', false);
    return m;
  }
  private buildDynamic(spec: DynSpec): THREE.ShaderMaterial {
    const { name, hasColor, wind, breath } = spec;
    const gun = name === 'm_gun';
    const albedo = spec.textured ? this.texture(gun ? 'tx_gun' : 'tx_palette') : null;
    const key = `${name}|${hasColor ? 'c' : 'n'}|${albedo ? 't' : '-'}|${wind ? 'w' : ''}|${breath ? 'b' : ''}|${spec.variant}`;
    const cached = this.cache.get(key) as THREE.ShaderMaterial | undefined;
    if (cached) return cached;
    const defines: Record<string, string> = {};
    if (albedo) defines.TEXTURED = '';
    if (gun) defines.GUN = '';
    if (wind) defines.WIND = '';
    if (breath) { defines.BREATH = ''; defines.USE_UV1 = ''; }
    const uniforms: Record<string, Uniform<unknown>> = {
      uAlbedo: { value: albedo }, uEmisMap: { value: albedo && !gun ? this.texture('tx_palette_emis') : null },
      uMatcap: { value: gun ? this.texture('tx_matcap_steel') : null },
      uObj: { value: new Float32Array([1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]) }, uFresnel: this.uFresnel,
    };
    this.shared.attach(uniforms);
    const m = new THREE.ShaderMaterial({ name, defines, uniforms, vertexShader: DYN_VERT, fragmentShader: DYN_FRAG, vertexColors: hasColor, fog: false });
    m.onBeforeRender = this.propOnBeforeRender;
    m.userData.dyn = spec;
    this.propMaterials.push(m);
    this.variants.push('keep_dyn|' + Object.keys(defines).sort().join(',') + '|' + spec.variant);
    this.cache.set(key, m);
    return m;
  }
  /**
   * The material an InstancedMesh of `source`'s meshes draws with: its own object (see `dynamic`). Materials that are
   * not ours, or world materials, are returned as they are.
   */
  instancedTwin(source: THREE.Material, geometry?: THREE.BufferGeometry): THREE.Material {
    const spec = source.userData.dyn as DynSpec | undefined;
    if (spec) { const s: DynSpec = { ...spec, variant: 'inst' }, m = this.buildDynamic(s); if (geometry) this.note('d', s, m, geometry, false, true); return m; }
    const e = source.userData.emis as EmisSpec | undefined;
    if (e) { const s: EmisSpec = { ...e, variant: 'inst' }, m = this.buildEmis(s); if (geometry) this.note('e', s, m, geometry, false, true); return m; }
    return source;
  }

  private propState(object: THREE.Object3D): PropState {
    let s = this.propStates.get(object);
    if (!s) { s = new PropState(); s.countdown = object.id % ZONE_EVERY; this.propStates.set(object, s); }
    return s;
  }

  /** the zone light of a point: the mood of the zone that holds it (and of the bore's sub-volumes) */
  moodOf(x: number, y: number, z: number): MoodKey {
    const data = this.ctx.data;
    let zone: ZoneId | null = data.zoneAt(x, y, z, this.ctx.world.residentSet);
    for (let i = 0; i < SETS.length && zone === null; i++) zone = data.zoneAt(x, y, z, SETS[i] as ResidentSet);
    if (zone === null) return this.fallbackMood;
    return moodAt(zone, this.zoneMood.get(zone) ?? 'L1', y, z, this.shared.uWrong.value.x);
  }
  /** the mood a thing outside every zone takes (the sandbox rooms): the current one */
  fallbackMood: MoodKey = 'L1';

  private applyProp(object: THREE.Object3D): void {
    const mesh = object as THREE.Mesh;
    const m = mesh.material as THREE.ShaderMaterial;
    const s = this.propState(object);
    const o = (m.uniforms.uObj as Uniform<Float32Array>).value;
    // three uploads a material's uniforms only when told; it is told only when this object's values differ from what the
    // last object drawn with this material left there (objects of one zone share them: no upload). The array holds
    // 32-bit floats: compare with what it would hold.
    let dirty = o[3] !== Math.fround(s.emissive);
    o[3] = s.emissive;
    if ((object as THREE.InstancedMesh).isInstancedMesh !== true) {
      if (s.frame !== this.frame) {
        s.frame = this.frame;
        // Its zone is looked up every ZONE_EVERY drawn frames, and at once when it has moved a metre since the
        // last look-up. (Round 1 counted frames only: wherever frames are rare, in every scripted run and on a slow
        // machine, the revolver kept the light of a place she had left: the Long Light in the bore, the bore's violet
        // at the lip.) A jump of more than 3 m, or a snap asked by the system (a new run, a respawn, a warp), takes
        // the new light at once instead of cross-fading.
        const e = object.matrixWorld.elements, at = s.at;
        const mx = (e[12] as number) - (at[0] as number), my = (e[13] as number) - (at[1] as number), mz = (e[14] as number) - (at[2] as number);
        const moved = mx * mx + my * my + mz * mz;
        const snap = s.mood === '' || s.gen !== this.snapGen || moved > 9;
        if (--s.countdown <= 0 || snap || moved > 1) {
          s.countdown = ZONE_EVERY;
          s.gen = this.snapGen;
          at[0] = e[12] as number; at[1] = e[13] as number; at[2] = e[14] as number;
          s.mood = this.moodOf(e[12] as number, e[13] as number, e[14] as number);
          s.ext = (MOODS[s.mood] as Float32Array)[M_SKY] as number;
          s.vm = this.inViewModel(object);
          if (snap) { this.fadeK = 1; this.fadeProp(s, object); }
        }
        this.fadeK = Math.min(1, this.frameDt / ZONE_FADE);
        this.fadeProp(s, object);
      }
      const f = Math.fround;
      // integration seam (docs/requests/code-enemies.md 1.1): a mesh's `userData.tint` ([r, g, b], the Biders' four
      // workcloth tints) multiplies its zone light, which is its albedo tinted: colour = albedo x light.
      const tint = object.userData.tint as readonly number[] | undefined;
      const tr = tint ? (tint[0] as number) : 1, tg = tint ? (tint[1] as number) : 1, tb = tint ? (tint[2] as number) : 1;
      const ar = s.ar * tr, ag = s.ag * tg, ab = s.ab * tb, kr = s.kr * tr, kg = s.kg * tg, kb = s.kb * tb;
      const vm = s.vm ? 1 : 0;
      if (o[0] !== f(ar) || o[1] !== f(ag) || o[2] !== f(ab) || o[4] !== f(kr) || o[5] !== f(kg) || o[6] !== f(kb) || o[8] !== f(s.dx) || o[9] !== f(s.dy) || o[10] !== f(s.dz) || o[11] !== s.ext
        || o[12] !== f(s.rr) || o[13] !== f(s.rg) || o[14] !== f(s.rb) || o[15] !== vm) {
        o[0] = ar; o[1] = ag; o[2] = ab; o[4] = kr; o[5] = kg; o[6] = kb; o[8] = s.dx; o[9] = s.dy; o[10] = s.dz; o[11] = s.ext;
        o[12] = s.rr; o[13] = s.rg; o[14] = s.rb; o[15] = vm;
        o[16] = VM_RIM_DIR.x; o[17] = VM_RIM_DIR.y; o[18] = VM_RIM_DIR.z;
        dirty = true;
      }
    }
    if (dirty) m.uniformsNeedUpdate = true;
  }
  private fadeK = 1;
  private snapGen = 0;
  /** true for a mesh under the view-model root (the revolver and the hands) */
  private inViewModel(object: THREE.Object3D): boolean {
    const root = this.ctx.scene.viewModel;
    for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === root) return true;
    return false;
  }
  /** Every dynamic object takes the light of where it stands at its next draw, with no cross-fade (a new run, a respawn, a warp). */
  snapLights(): void { this.snapGen++; }
  /** one step of a dynamic object's zone light toward its mood, by this.fadeK */
  private fadeProp(s: PropState, object: THREE.Object3D): void {
    const k = this.fadeK, e = object.matrixWorld.elements;
    const x = e[12] as number, y = e[13] as number, z = e[14] as number;
    let mood = MOODS[s.mood === '' ? this.fallbackMood : s.mood];
    if (s.vm) {
      // the view-model's own rig (moods.ts VM_AMB): the mood's hues at display levels, directions fixed in view space.
      // Under the overhang it is L0's (the Long Light's colours behind a third of a stop of glare).
      if (s.mood === 'L1' && this.fallbackMood === 'L0') mood = MOODS.L0;
      const hands = ((object as THREE.Mesh).material as THREE.Material).name === 'm_gun' ? 1 : VM_HANDS;
      let vkr = (mood[M_VM_KEY] as number) * hands, vkg = (mood[M_VM_KEY + 1] as number) * hands, vkb = (mood[M_VM_KEY + 2] as number) * hands;
      if (s.mood === 'L2' && this.bladeAt(x, y, z)) {
        const l1 = MOODS.L1;
        vkr = (l1[M_KEY] as number) * 0.7 * hands; vkg = (l1[M_KEY + 1] as number) * 0.7 * hands; vkb = (l1[M_KEY + 2] as number) * 0.7 * hands;
      }
      const vr = (mood[M_VM_AMB] as number) * hands, vg = (mood[M_VM_AMB + 1] as number) * hands, vb = (mood[M_VM_AMB + 2] as number) * hands;
      const vrr = mood[M_VM_RIM] as number, vrg = mood[M_VM_RIM + 1] as number, vrb = mood[M_VM_RIM + 2] as number;
      s.dx = VM_KEY_DIR.x; s.dy = VM_KEY_DIR.y; s.dz = VM_KEY_DIR.z;
      if (s.ar === vr && s.ag === vg && s.ab === vb && s.kr === vkr && s.kg === vkg && s.kb === vkb && s.rr === vrr && s.rg === vrg && s.rb === vrb) return;
      s.ar += (vr - s.ar) * k; s.ag += (vg - s.ag) * k; s.ab += (vb - s.ab) * k;
      s.kr += (vkr - s.kr) * k; s.kg += (vkg - s.kg) * k; s.kb += (vkb - s.kb) * k;
      s.rr += (vrr - s.rr) * k; s.rg += (vrg - s.rg) * k; s.rb += (vrb - s.rb) * k;
      if (Math.abs(s.ar - vr) + Math.abs(s.kr - vkr) + Math.abs(s.kg - vkg) + Math.abs(s.rb - vrb) + Math.abs(s.ab - vb) < 2e-4) {
        s.ar = vr; s.ag = vg; s.ab = vb; s.kr = vkr; s.kg = vkg; s.kb = vkb; s.rr = vrr; s.rg = vrg; s.rb = vrb;
      }
      return;
    }
    let kr = mood[M_KEY] as number, kg = mood[M_KEY + 1] as number, kb = mood[M_KEY + 2] as number;
    let dx = mood[M_KEY_DIR] as number, dy = mood[M_KEY_DIR + 1] as number, dz = mood[M_KEY_DIR + 2] as number;
    let ak = 1;
    if (s.mood === 'L1' && this.fallbackMood === 'L0') {
      // under the overhang (the render mood is L0 until she steps out): no direct sun, baked bounce only (ART_BIBLE
      // 3.1). The Long Light's key on the revolver and the hand made them the brightest thing in the dark frame.
      kr *= 0.12; kg *= 0.12; kb *= 0.12; ak = 0.7;
    }
    if (s.mood === 'L2' && this.bladeAt(x, y, z)) {
      // inside a blade of sun: the key of the Long Light, x 1.2, from the sun
      const l1 = MOODS.L1;
      kr = (l1[M_KEY] as number) * 1.0909; kg = (l1[M_KEY + 1] as number) * 1.0909; kb = (l1[M_KEY + 2] as number) * 1.0909;
      dx = l1[M_KEY_DIR] as number; dy = l1[M_KEY_DIR + 1] as number; dz = l1[M_KEY_DIR + 2] as number;
    }
    // integration seam: a thing that has arrived writes nothing (nine float stores per dynamic mesh per frame were
    // 0.4 KB of boxed numbers per frame)
    const tar = (mood[M_AMBIENT] as number) * ak, tag = (mood[M_AMBIENT + 1] as number) * ak, tab = (mood[M_AMBIENT + 2] as number) * ak;
    const trr = mood[M_RIM] as number, trg = mood[M_RIM + 1] as number, trb = mood[M_RIM + 2] as number;
    if (s.ar === tar && s.ag === tag && s.ab === tab && s.kr === kr && s.kg === kg && s.kb === kb && s.dx === dx && s.dy === dy && s.dz === dz && s.rr === trr && s.rg === trg && s.rb === trb) return;
    s.rr += (trr - s.rr) * k; s.rg += (trg - s.rg) * k; s.rb += (trb - s.rb) * k;
    s.ar += (tar - s.ar) * k; s.ag += (tag - s.ag) * k; s.ab += (tab - s.ab) * k;
    s.kr += (kr - s.kr) * k; s.kg += (kg - s.kg) * k; s.kb += (kb - s.kb) * k;
    s.dx += (dx - s.dx) * k; s.dy += (dy - s.dy) * k; s.dz += (dz - s.dz) * k;
    const l = Math.hypot(s.dx, s.dy, s.dz);
    if (l > 1e-5) { s.dx /= l; s.dy /= l; s.dz /= l; } else { s.dx = 0; s.dy = 1; s.dz = 0; }
    // arrived: the exact target, so objects of one zone carry identical values
    if (Math.abs(s.ar - tar) + Math.abs(s.kr - kr) + Math.abs(s.kg - kg) + Math.abs(s.dy - dy) + Math.abs(s.dx - dx) + Math.abs(s.rg - trg) < 2e-4) {
      s.ar = tar; s.ag = tag; s.ab = tab; s.rr = trr; s.rg = trg; s.rb = trb;
      s.kr = kr; s.kg = kg; s.kb = kb; s.dx = dx; s.dy = dy; s.dz = dz;
    }
  }

  /** Emissive multiplier of every dynamic mesh at or under `object`. */
  setEmissive(object: THREE.Object3D, scale: number): void {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      const name = (mesh.material as THREE.Material).name;
      if (name === 'm_prop' || name === 'm_gun') this.propState(mesh).emissive = scale;
      else if (name === 'm_emis') this.emisState(mesh).boost = scale;
    }
    const kids = object.children;
    for (let i = 0; i < kids.length; i++) this.setEmissive(kids[i] as THREE.Object3D, scale);
  }
  emissiveOf(object: THREE.Object3D): number { return this.propStates.get(object)?.emissive ?? 1; }
  /** the zone light a dynamic object is drawn with right now: [ambient rgb, key rgb] (tests) */
  lightOf(object: THREE.Object3D): number[] | null {
    const s = this.propStates.get(object);
    return s ? [s.ar, s.ag, s.ab, s.kr, s.kg, s.kb, s.rr, s.rg, s.rb, s.vm ? 1 : 0] : null;
  }

  /** Once per rendered frame, before the scene is drawn. */
  beginFrame(frameDt: number): void {
    this.frame++;
    this.frameDt = frameDt;
    const layers = this.layerList;
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i] as LayerUniforms;
      if (l.t < 1) {
        l.t = l.seconds > 0 ? Math.min(1, l.t + frameDt / l.seconds) : 1;
        l.weight = l.from + (l.to - l.from) * l.t;
        l.tint.value.w = l.weight * l.gain;
      }
    }
  }
  /** every material the factory has handed out and still caches (a tier switch releases their programs) */
  allMaterials(): IterableIterator<THREE.Material> { return this.cache.values(); }
  get frameId(): number { return this.frame; }
  get programVariants(): number { return this.variants.length; }
  get emitterCount(): number { return this.emitters.length; }
}
