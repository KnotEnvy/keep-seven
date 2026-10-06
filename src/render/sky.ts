// The sky: one triangle on the far plane, drawn last, dithered (code-render 4.3, tech-web 7).
//
// Its colour at the horizon IS the fog colour of that heading (it reads the fog uniforms), so far geometry dissolves
// into it. Above it: a glow band toward the sun, the mid band, the zenith; the sun disc and its halo. Indoors the three
// bands are the far fog colour and the triangle is simply the fog behind everything.
//
// THE RULE: a hairline at azimuth 0 (north, -Z) from the horizon past the zenith, leaning east (+X) by `lean` degrees,
// core 2 px, halo 10 px at 25 % (14 px at 35 % on the rim). Constant pixel width from screen derivatives; divided by
// the exposure so the glare ramp does not scale it. THE PLUMB THREAD: aqua, 2 px, dead vertical through a world point.
import * as THREE from 'three';
import { FOG_GLSL, HUE } from './shared.ts';
import type { SharedUniforms, Uniform } from './shared.ts';

const vec3 = (c: THREE.Color): string => `vec3( ${c.r.toFixed(6)}, ${c.g.toFixed(6)}, ${c.b.toFixed(6)} )`;

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
#define uZenith uSky[ 0 ].xyz
#define uMid uSky[ 1 ].xyz
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
  readonly rule = new THREE.Vector4(1 * Math.PI / 180, 10, 0.25, 1);
  /** xyz: a world point the thread rises from, w: on */
  readonly thread = new THREE.Vector4(0, 0, 0, 0);
  leanDeg = 1;

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
    k[0] = z.r; k[1] = z.g; k[2] = z.b;
    k[4] = m.r; k[5] = m.g; k[6] = m.b;
    k[8] = g.r; k[9] = g.g; k[10] = g.b;
    k[12] = sh.x; k[13] = sh.y; k[14] = sh.z; k[15] = sh.w;
    k[16] = sun.r; k[17] = sun.g; k[18] = sun.b; k[19] = exposure;
    k[20] = r.x; k[21] = r.y; k[22] = r.z; k[23] = r.w;
    k[24] = t.x; k[25] = t.y; k[26] = t.z; k[27] = t.w;
  }

  /** the Rule's lean (1 degree in the opening, 2 on the rim, where its halo is also wider and stronger) */
  setLean(deg: number): void {
    this.leanDeg = deg;
    this.rule.x = deg * Math.PI / 180;
    const rim = deg >= 1.5;
    this.rule.y = rim ? 14 : 10;
    this.rule.z = rim ? 0.35 : 0.25;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
