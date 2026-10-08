// The sky: one triangle on the far plane, drawn last, dithered (code-render 4.3, tech-web 7).
//
// Its colour at the horizon IS the fog colour of that heading (it reads the fog uniforms), so far geometry dissolves
// into it. Above it: a glow band toward the sun, the mid band, the zenith; the sun disc and its halo. Indoors the three
// bands are the far fog colour and the triangle is simply the fog behind everything.
//
// THE RULE: a hairline at azimuth 0 (north, -Z) from the horizon past the zenith, leaning east (+X) by `lean` degrees,
// core 2 px, halo 10 px at 25 % (14 px at 35 % on the rim). The lean is 6 degrees in the opening and 9 on the rim (pass i2).
// Constant pixel width from screen derivatives; divided by
// the exposure so the glare ramp does not scale it. THE PLUMB THREAD: aqua, 2 px, dead vertical through a world point.
//
// CLOUDS (pass i2; the visual reviewer: "four or five flat orange polygons with hard straight edges that read as
// placeholders against an otherwise soft sky"): the faceted cloud cards of env_backdrop_day are gone and the sky draws
// its own: long soft bars on a deck overhead (the sky direction projected on a plane, stretched along the wind), cut
// out of the shared noise texture (two taps, sky pixels only), thin edges lit by the low sun or the afterglow, thick
// middles in the sky's own shade, fading into the horizon's haze and thinning overhead. By day a few bars in the
// west; in the blue hour two or three dark ones with ember undersides. Behind the Rule and the thread.
import * as THREE from 'three';
import { FOG_GLSL, HUE } from './shared.ts';
import type { SharedUniforms, Uniform } from './shared.ts';

const vec3 = (c: THREE.Color): string => `vec3( ${c.r.toFixed(6)}, ${c.g.toFixed(6)}, ${c.b.toFixed(6)} )`;

/** the clouds' cover: the share of the noise's range a cloud is cut from (lower: more sky covered), by day and in the blue hour */
export const CLOUD_DAY = 0.50, CLOUD_DUSK = 0.54;

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
	vec4 view = inverse( projectionMatrix ) * vec4( position.xy, 1.0, 1.0 );
	vDir = ( view.xyz / view.w ) * mat3( viewMatrix );
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}
`;
const FRAG = /* glsl */`
#include <common>
${FOG_GLSL}
// one array, packed once a frame (see SharedUniforms.uK for why)
uniform vec4 uSky[ 7 ];
uniform sampler2D uNoise;
#define uZenith uSky[ 0 ].xyz
#define uCloudCover uSky[ 0 ].w
#define uMid uSky[ 1 ].xyz
#define uStars uSky[ 1 ].w
#define uGlow uSky[ 2 ].xyz
#define uSkyShape uSky[ 3 ]
#define uSunCol uSky[ 4 ].xyz
#define uExposure uSky[ 4 ].w
#define uRule uSky[ 5 ]
#define uThread uSky[ 6 ]
const vec3 uRuleCore = ${vec3(HUE.violetCore)};
const vec3 uRuleHalo = ${vec3(HUE.violet)};
const vec3 uThreadCol = ${vec3(HUE.aqua)};
varying vec3 vDir;
float keepSkyHash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
void main() {
	vec3 d = normalize( vDir );
	float up = max( d.y, 0.0 );
	vec2 hxz = d.xz / max( length( d.xz ), 1e-4 );
	// the horizon colour of this heading: exactly the fog colour
	vec3 hz = keepFogColourE( vec3( hxz.x, 0.0, hxz.y ), 1e4, 1.0 );
	float s = dot( vec3( hxz.x, 0.0, hxz.y ), normalize( vec3( uSunDir.x, 0.0, uSunDir.z ) + 1e-5 ) ) * 0.5 + 0.5;
	vec3 band = mix( hz, uGlow, uSkyShape.y * ( 0.25 + 0.75 * s * s ) );
	vec3 col = mix( hz, band, smoothstep( 0.0, uSkyShape.x * 0.18, up ) );
	col = mix( col, uMid, smoothstep( uSkyShape.x * 0.12, uSkyShape.x, up ) );
	col = mix( col, uZenith, smoothstep( uSkyShape.x, 1.0, up ) );
	// sun: a 1.6 degree disc and a halo to 14 degrees
	float sd = dot( d, uSunDir );
	col += uSunCol * ( uSkyShape.z * 0.30 * pow( clamp( ( sd - 0.9703 ) / 0.0297, 0.0, 1.0 ), 2.0 ) );
	col = mix( col, uSunCol * 3.0, uSkyShape.z * smoothstep( 0.99955, 0.99965, sd ) );
	float inv = 1.0 / max( uExposure, 1e-3 );
	// stars (exterior look, pass i3; R7 the last image, R9 the rim: the upper two thirds of the last frame are sky): the
	// first stars of the blue hour, only where the sky has gone dark (overhead and away from the afterglow), behind the
	// clouds. A lattice on the sky's own plane; a cell in thirteen carries one on High (uStars 1: they twinkle a little),
	// one in thirty on Low; each a point of constant size on screen. No texture, sky pixels only, nothing by day.
	if ( uStars * uSkyShape.y > 0.0 && d.y > 0.10 ) {
		float keepDusk = 1.0 - smoothstep( 0.15, 0.35, uMid.g / max( uGlow.r, 1e-3 ) );
		float keepDark = 1.0 - smoothstep( 0.02, 0.085, dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) * uExposure );
		if ( keepDusk * keepDark > 0.0 ) {
			vec2 sp = d.xz / ( 0.30 + d.y ) * 40.0;
			vec2 sc = floor( sp );
			float h1 = keepSkyHash( sc ), h2 = keepSkyHash( sc + 17.3 ), h3 = keepSkyHash( sc + 41.7 );
			vec2 so = sp - sc - ( 0.2 + 0.6 * vec2( h2, h3 ) );
			float spx = length( so ) / max( length( fwidth( sp ) ) * 0.7071, 1e-6 );
			float big = h3 * h3 * h3;
			float star = step( 1.0 - 0.075 * uStars, h1 ) * ( 1.0 - smoothstep( 0.30 + 0.40 * big, 0.85 + 0.65 * big, spx ) );
			float tw = 1.0 - step( 0.9, uStars ) * 0.3 * ( 0.5 + 0.5 * sin( uTime * ( 1.3 + 3.1 * h2 ) + h1 * 40.0 ) );
			col += mix( vec3( 0.80, 0.88, 1.0 ), vec3( 1.0, 0.90, 0.76 ), h2 ) * ( star * tw * ( 0.16 + 0.62 * big ) * keepDusk * keepDark * smoothstep( 0.12, 0.40, d.y ) * inv * uSkyShape.y );
		}
	}
	// clouds
	if ( uSkyShape.y * uCloudCover > 0.0 && d.y > 0.012 ) {
		// day or blue hour, read from the bands themselves (a pale mid band under a day sky, a dark one at dusk): the sun
		// disc's strength is not carried through a doorway's fade, the bands are
		float day = smoothstep( 0.15, 0.35, uMid.g / max( uGlow.r, 1e-3 ) );
		vec2 cp = d.xz / ( d.y + 0.11 );
		// bars that lie north-east to south-west (across the evening wind), four times as long as they are deep
		vec2 q = vec2( cp.x * 0.070 + cp.y * 0.040, cp.y * 0.250 - cp.x * 0.144 ) + uCloud.xy * 0.35 + vec2( 0.31, 0.12 );
		float den = texture2D( uNoise, q ).r * 0.70 + texture2D( uNoise, q * 3.3 + 0.37 ).r * 0.30;
		float thr = mix( ${CLOUD_DUSK.toFixed(3)}, ${CLOUD_DAY.toFixed(3)}, day );
		float band = smoothstep( 0.012, 0.085, d.y ) * ( 1.0 - smoothstep( 0.30, 0.62, d.y ) );
		float a = smoothstep( thr, thr + mix( 0.22, 0.15, day ), den ) * band * uSkyShape.y * uCloudCover;
		if ( a > 0.0 ) {
			float thin = 1.0 - smoothstep( thr + 0.06, thr + 0.30, den );
			float lit = clamp( thin * 0.55 + s * s * 0.75, 0.0, 1.0 );
			// in the blue hour only the bars low over the afterglow are lit; overhead they are the night's own
			lit *= mix( 1.0 - 0.75 * smoothstep( 0.08, 0.36, d.y ), 1.0, day );
			vec3 shade = mix( mix( uMid, uZenith, 0.35 ), hz, 0.45 ) * mix( 0.58, 0.90, day );
			// (the glow band's colour, not the sun's: the bands follow the exposure through a doorway's fade, the sun's colour does not)
			vec3 light = uGlow * mix( 1.06, 1.24, day ) + vec3( 0.05, 0.035, 0.0 ) * day;
			col = mix( col, mix( shade, light, lit ), a * 0.92 * ( 0.55 + 0.45 * smoothstep( 0.012, 0.16, d.y ) ) );
		}
	}
	// the Rule
	if ( uRule.w > 0.0 ) {
		float rd = dot( d, vec3( cos( uRule.x ), - sin( uRule.x ), 0.0 ) );
		float px = abs( rd ) / max( fwidth( rd ), 1e-6 );
		float along = step( 0.0, d.y ) * smoothstep( -0.34, -0.24, - d.z ) * uRule.w;
		float halo = ( 1.0 - smoothstep( 1.0, uRule.y * 0.5, px ) ) * uRule.z;
		col = mix( col, uRuleHalo * inv, halo * along );
		col = mix( col, uRuleCore * ( inv * uHdr ), ( 1.0 - smoothstep( 0.6, 1.4, px ) ) * along );
	}
	// the plumb thread from the town
	if ( uThread.w > 0.0 ) {
		vec3 to = uThread.xyz - cameraPosition;
		vec3 tn = normalize( cross( vec3( 0.0, 1.0, 0.0 ), to ) );
		float td = dot( d, tn );
		float px = abs( td ) / max( fwidth( td ), 1e-6 );
		float tl = length( to );
		float along = step( to.y / max( tl, 1e-3 ), d.y ) * step( 0.0, dot( d.xz, to.xz ) ) * ( 1.0 - smoothstep( 0.55, 0.9, d.y ) ) * uThread.w;
		col = mix( col, uThreadCol * inv, ( 1.0 - smoothstep( 0.6, 1.4, px ) ) * along );
	}
	col += ( keepSkyHash( gl_FragCoord.xy ) - 0.5 ) * 0.006 * uSkyShape.w;
	gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly zenith = new THREE.Color();
  readonly mid = new THREE.Color();
  readonly glow = new THREE.Color();
  /** x: sine of the mid band's elevation, y: glow strength, z: sun disc strength, w: dither */
  readonly shape = new THREE.Vector4(0.4226, 1, 1, 1);
  readonly sunCol = new THREE.Color();
  /** x: lean in radians, y: halo width in px, z: halo alpha, w: strength (the mood's: 0 indoors) */
  readonly rule = new THREE.Vector4(6 * Math.PI / 180, 10, 0.25, 1);
  /** xyz: a world point the thread rises from, w: on */
  readonly thread = new THREE.Vector4(0, 0, 0, 0);
  leanDeg = 6;
  /** the clouds: 1 drawn, 0 not (a test that measures the sky's gradient or the Rule's width switches them off) */
  cloudCover = 1;
  /** the blue hour's stars: 1 on High (all of them, twinkling), about 0.45 on Low (the brighter half, still), 0 none (pass i3) */
  stars = 0.45;
  /** ... and a test's switch for them, as cloudCover is for the clouds (a test that compares two frames taken at different times: they twinkle on High) */
  starCover = 1;

  private readonly packed = new Float32Array(7 * 4);

  constructor(shared: SharedUniforms) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const uniforms: Record<string, Uniform<unknown>> = { uSky: { value: this.packed } };
    shared.attach(uniforms);
    const material = new THREE.ShaderMaterial({
      name: 'keep_sky', uniforms, vertexShader: VERT, fragmentShader: FRAG,
      depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, fog: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'keep_sky';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 1000;
  }

  /** Once per frame, before the scene is drawn: the fields above and this frame's exposure into the uniform array. */
  pack(exposure: number): void {
    const k = this.packed, z = this.zenith, m = this.mid, g = this.glow, sh = this.shape, sun = this.sunCol, r = this.rule, t = this.thread;
    k[0] = z.r; k[1] = z.g; k[2] = z.b; k[3] = this.cloudCover;
    k[4] = m.r; k[5] = m.g; k[6] = m.b; k[7] = this.stars * this.starCover;
    k[8] = g.r; k[9] = g.g; k[10] = g.b;
    k[12] = sh.x; k[13] = sh.y; k[14] = sh.z; k[15] = sh.w;
    k[16] = sun.r; k[17] = sun.g; k[18] = sun.b; k[19] = exposure;
    k[20] = r.x; k[21] = r.y; k[22] = r.z; k[23] = r.w;
    k[24] = t.x; k[25] = t.y; k[26] = t.z; k[27] = t.w;
  }

  /** the Rule's lean (6 degrees in the opening, 9 on the rim, where its halo is also wider and stronger) */
  setLean(deg: number): void {
    this.leanDeg = deg;
    this.rule.x = deg * Math.PI / 180;
    const rim = deg >= 7.5;
    this.rule.y = rim ? 14 : 10;
    this.rule.z = rim ? 0.35 : 0.25;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
