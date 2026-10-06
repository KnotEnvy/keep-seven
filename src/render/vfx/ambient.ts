// The two ambient point clouds, one THREE.Points and one draw call between them (only one is ever on):
//   motes  interior dust that exists only inside the sun blades: each point rides one blade's volume (40 a blade on Low)
//   sand   exterior blowing sand: short streaks hugging the ground, wrapped round the camera, along the wind (south-east)
// Everything is animated in the vertex shader from clock.simTime; the CPU does nothing per frame.
import * as THREE from 'three';
import type { Uniform } from '../shared.ts';

export const AMBIENT_POINTS = 600;
export const MAX_BLADES = 3;

const VERT = /* glsl */`
attribute float aSlot;
uniform float uTime;
uniform float uMode;
uniform vec4 uBladeA[ ${MAX_BLADES} ];
uniform vec3 uBladeB[ ${MAX_BLADES} ];
const vec3 uWind = vec3( 0.9, 0.0, 0.9 );
uniform vec4 uGround;
uniform vec2 uViewport;
varying vec4 vCol;
varying vec2 vStreak;
void main() {
	vec3 seed = position;
	vec3 p;
	float alpha;
	float sizeM;
	vStreak = vec2( 0.0 );
	if ( uMode < 0.5 ) {
		int bi = int( aSlot + 0.5 );
		vec4 a = uBladeA[ bi ];
		if ( a.w <= 0.0 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); gl_PointSize = 1.0; return; }
		vec3 ab = uBladeB[ bi ] - a.xyz;
		vec3 dir = normalize( ab );
		vec3 s0 = cross( dir, vec3( 0.0, 1.0, 0.0 ) );
		s0 = length( s0 ) > 1e-3 ? normalize( s0 ) : vec3( 1.0, 0.0, 0.0 );
		vec3 s1 = cross( dir, s0 );
		float t = fract( seed.y + uTime * 0.006 * ( 0.5 + seed.x ) );
		float ang = seed.z * 6.2831853 + uTime * 0.12 * ( seed.x - 0.5 );
		float rad = 0.5 * sqrt( fract( seed.z * 7.31 + seed.x ) );
		p = a.xyz + ab * t + ( s0 * cos( ang ) + s1 * sin( ang ) ) * rad + 0.04 * sin( seed.yzx * 6.2831853 + uTime * 0.35 );
		alpha = a.w * 0.55 * smoothstep( 0.0, 0.08, t ) * ( 1.0 - smoothstep( 0.85, 1.0, t ) );
		sizeM = 0.010 + 0.012 * seed.x;
		vCol = vec4( 1.0, 0.85, 0.66, alpha );
	} else {
		vec3 box = vec3( 26.0, 1.0, 26.0 );
		vec3 w = seed * box + uWind * uTime * ( 0.7 + 0.6 * seed.y );
		p.xz = mod( w.xz - cameraPosition.xz + box.xz * 0.5, box.xz ) - box.xz * 0.5 + cameraPosition.xz;
		p.y = uGround.x + 0.04 + seed.y * seed.y * 0.55 + 0.05 * sin( uTime * 1.3 + seed.x * 40.0 );
		alpha = uGround.y * ( 0.10 + 0.14 * seed.z );
		sizeM = 0.34;
		vCol = vec4( 0.72, 0.5, 0.32, alpha );
	}
	vec4 mv = viewMatrix * vec4( p, 1.0 );
	float dist = max( - mv.z, 0.05 );
	gl_Position = projectionMatrix * mv;
	float px = sizeM * uViewport.y * projectionMatrix[ 1 ][ 1 ] * 0.5 / dist;
	if ( uMode < 0.5 ) {
		vCol.a *= smoothstep( 0.3, 1.2, dist ) * clamp( px, 0.3, 1.0 );
		gl_PointSize = clamp( px, 1.5, 6.0 );
	} else {
		// a streak along the wind as it appears on screen
		vec4 q = projectionMatrix * viewMatrix * vec4( p + normalize( uWind ) * 0.3, 1.0 );
		vec2 d = ( q.xy / max( q.w, 1e-3 ) - gl_Position.xy / max( gl_Position.w, 1e-3 ) ) * uViewport;
		vStreak = length( d ) > 1e-3 ? normalize( d ) : vec2( 1.0, 0.0 );
		vCol.a *= smoothstep( 0.6, 2.0, dist ) * ( 1.0 - smoothstep( 9.0, 13.0, dist ) );
		gl_PointSize = clamp( px, 2.0, 40.0 );
	}
}
`;
const FRAG = /* glsl */`
uniform float uMode;
uniform vec3 uLit;
varying vec4 vCol;
varying vec2 vStreak;
void main() {
	vec2 p = gl_PointCoord * 2.0 - 1.0;
	p.y = - p.y;
	float a;
	vec3 c = vCol.rgb;
	if ( uMode < 0.5 ) {
		a = max( 1.0 - dot( p, p ), 0.0 );
		gl_FragColor = vec4( c * a * vCol.a, 0.0 );
	} else {
		float along = dot( p, vStreak );
		float across = dot( p, vec2( - vStreak.y, vStreak.x ) );
		a = max( 1.0 - along * along, 0.0 ) * ( 1.0 - smoothstep( 0.0, 0.07, abs( across ) ) );
		a *= vCol.a;
		gl_FragColor = vec4( c * uLit * a, a );
	}
	#include <colorspace_fragment>
}
`;

export class AmbientPoints {
  readonly points: THREE.Points;
  /** per blade: x, y, z of its start and its level (0 = off); flat, so the upload reads no object (SharedUniforms.uK) */
  readonly bladeA = new Float32Array(MAX_BLADES * 4);
  /** per blade: x, y, z of its end */
  readonly bladeB = new Float32Array(MAX_BLADES * 3);
  private readonly mode: Uniform<number> = { value: 0 };
  /** x: ground height under the player, y: strength */
  readonly ground: Uniform<THREE.Vector4> = { value: new THREE.Vector4(0, 1, 0, 0) };
  readonly viewport: Uniform<THREE.Vector2> = { value: new THREE.Vector2(960, 540) };
  readonly lit: Uniform<THREE.Color> = { value: new THREE.Color(1, 1, 1) };
  private readonly geometry: THREE.BufferGeometry;
  /** points drawn in the last frame */
  drawn = 0;

  constructor(time: Uniform<number>) {
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(AMBIENT_POINTS * 3), slot = new Float32Array(AMBIENT_POINTS);
    // a fixed, well-spread sequence: no random source is needed for seeds
    for (let i = 0; i < AMBIENT_POINTS; i++) {
      seeds[i * 3] = (i * 0.754877666) % 1; seeds[i * 3 + 1] = (i * 0.569840291) % 1; seeds[i * 3 + 2] = (i * 0.362372449 + 0.31) % 1;
      slot[i] = i % MAX_BLADES;
    }
    g.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    g.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
    this.geometry = g;
    const material = new THREE.ShaderMaterial({
      name: 'keep_ambient',
      uniforms: {
        uTime: time, uMode: this.mode, uBladeA: { value: this.bladeA }, uBladeB: { value: this.bladeB },
        uGround: this.ground, uViewport: this.viewport, uLit: this.lit,
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true,
    });
    this.points = new THREE.Points(g, material);
    this.points.name = 'keep_fx_ambient';
    this.points.frustumCulled = false;
    this.points.matrixAutoUpdate = false;
    this.points.renderOrder = 19;
    this.points.visible = false;
  }

  /** `kind`: 'off', 'motes' (count = points per blade x blades) or 'sand' */
  set(kind: 'off' | 'motes' | 'sand', count: number): void {
    if (kind === 'off' || count <= 0) { this.points.visible = false; this.drawn = 0; return; }
    this.mode.value = kind === 'motes' ? 0 : 1;
    const n = Math.min(AMBIENT_POINTS, count);
    this.geometry.setDrawRange(0, n);
    this.points.visible = true;
    this.drawn = n;
  }
  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
