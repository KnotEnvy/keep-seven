// One instanced batch for every pooled quad that is not a particle: blob shadows, ground rings, cards, halos and the
// constant-pixel-width lines. It is refilled from the pools every frame (a few hundred floats), drawn in ONE call with
// premultiplied blending: an additive instance writes alpha 0, a darkening one (a blob) writes colour 0.
//
// Instance: 20 floats.
//   iA  a.xyz, mode            mode 0 billboard, 1 beam facing the camera, 2 plane, 3 beam with a fixed width axis
//   iB  b.xyz, width           billboard: (rotation, min px, depth pull, width m); beam: end point, width in m or px; plane: normal, width m
//                              depth pull: the share of its distance a billboard is drawn nearer in DEPTH only (its place on
//                              screen does not move): a halo is not cut by the wall its lamp sits on, the last fire is not
//                              buried in the plain it stands on
//   iC  r, g, b, alpha
//   iD  atlas rect, or four shape parameters
//   iE  shape, level, height m (billboard, plane) or dash m (beam) or the card's angle about its axis,
//       flags (1 additive, 2 width in px, 4 a glow: never larger on screen than HALO_MAX of the frame's height, faded
//       within 0.3 .. 2.5 m of the camera)
//
// A quad whose fade is under 2 % is collapsed in the vertex shader: it costs no fill (polish round 2: a halo with the
// camera inside it and a blade card faded by the near fade were still one full-screen blended layer each on Low).
import * as THREE from 'three';
import type { Uniform } from '../shared.ts';

export const QUAD_STRIDE = 20;
export const QUAD_CAPACITY = 448;

export const MODE_BILLBOARD = 0, MODE_BEAM = 1, MODE_PLANE = 2, MODE_CARD = 3;
export const SHAPE_ATLAS = 0, SHAPE_SOFT = 1, SHAPE_RING = 2, SHAPE_LINE = 3, SHAPE_BLOB = 4, SHAPE_MOUTH = 5, SHAPE_BLADE = 6, SHAPE_PATCH = 7, SHAPE_LANCE = 8, SHAPE_FIRE = 9;
export const FLAG_ADD = 1, FLAG_PX = 2, FLAG_GLOW = 4;
/** the largest a glow may be on screen: a share of the frame's height (its diameter) */
export const HALO_MAX = 0.07;

const VERT = /* glsl */`
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
attribute vec4 iD;
attribute vec4 iE;
uniform vec2 uViewport;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vD;
varying vec4 vE;
varying vec3 vX;
varying vec2 vLin;
void main() {
	vec2 q = position.xy;
	vUv = q + 0.5;
	vCol = iC; vD = iD; vE = iE;
	vX = vec3( 0.0, 1.0, 1.0 );
	vLin = vec2( q.y, 1.0 );
	float px = step( 1.5, mod( iE.w, 4.0 ) );
	float pxPerM = uViewport.y * projectionMatrix[ 1 ][ 1 ] * 0.5;
	vec4 clip;
	if ( iA.w < 0.5 ) {
		vec4 mv = viewMatrix * vec4( iA.xyz, 1.0 );
		vec2 size = vec2( iB.w, iE.z );
		float pxNow = max( size.y * pxPerM / max( - mv.z, 0.05 ), 1e-3 );
		float k = max( 1.0, iB.y / pxNow );
		if ( iE.w > 3.5 ) {
			// a glow: a bound on its size on screen, and nothing at all with the camera inside it
			k = min( k, max( uViewport.y * ${HALO_MAX.toFixed(3)}, iB.y ) / pxNow );
			float nearFade = smoothstep( 0.3, 2.5, - mv.z );
			if ( nearFade < 0.02 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
			vX.z = nearFade;
		}
		size *= k;
		float c = cos( iB.x ), s = sin( iB.x );
		float zc = mv.z;
		mv.xy += vec2( q.x * c - q.y * s, q.x * s + q.y * c ) * size;
		clip = projectionMatrix * mv;
		if ( iB.z > 0.0 ) {
			vec4 near = projectionMatrix * vec4( mv.xy, zc * ( 1.0 - iB.z ), 1.0 );
			clip.z = near.z / near.w * clip.w;
		}
		vX.y = max( - mv.z, 0.0 );
	} else if ( iA.w < 1.5 ) {
		vec4 va = viewMatrix * vec4( iA.xyz, 1.0 );
		vec4 vb = viewMatrix * vec4( iB.xyz, 1.0 );
		float nearZ = -0.06;
		if ( va.z > nearZ && vb.z > nearZ ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
		float ta = 0.0, tb = 1.0;
		if ( va.z > nearZ ) ta = ( nearZ - va.z ) / ( vb.z - va.z );
		else if ( vb.z > nearZ ) tb = ( nearZ - va.z ) / ( vb.z - va.z );
		float t = mix( ta, tb, vUv.x );
		vec4 pa = projectionMatrix * mix( va, vb, ta );
		vec4 pb = projectionMatrix * mix( va, vb, tb );
		vec2 dir = ( pb.xy / pb.w - pa.xy / pa.w ) * uViewport;
		float dl = length( dir );
		dir = dl > 1e-4 ? dir / dl : vec2( 1.0, 0.0 );
		vec4 p = projectionMatrix * mix( va, vb, t );
		float wpx = px > 0.5 ? iB.w : max( iB.w * pxPerM / max( p.w, 0.05 ), 1.5 );
		p.xy += vec2( - dir.y, dir.x ) * ( q.y * wpx * 2.0 / uViewport ) * p.w;
		clip = p;
		vUv.x = t;
		vX = vec3( distance( iA.xyz, iB.xyz ), p.w, wpx );
		// across a beam the coordinate must be linear ON SCREEN: a beam that comes at the eye has ends 300 : 1 apart in w,
		// and perspective-correct interpolation over its two triangles drew it as a wedge that thinned to a dotted hair
		// (polish round 3: the Transit's aim tell). q.y x w and w, divided again in the fragment shader.
		vLin = vec2( q.y * p.w, p.w );
	} else if ( iA.w < 2.5 ) {
		vec3 n = normalize( iB.xyz );
		vec3 tx = normalize( cross( abs( n.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ), n ) );
		vec3 ty = cross( n, tx );
		vec3 w = iA.xyz + tx * ( q.x * iB.w ) + ty * ( q.y * iE.z );
		vec4 mv = viewMatrix * vec4( w, 1.0 );
		clip = projectionMatrix * mv;
		vX.y = max( - mv.z, 0.0 );
	} else {
		vec3 ab = iB.xyz - iA.xyz;
		float len = length( ab );
		vec3 dir = ab / max( len, 1e-4 );
		vec3 s0 = cross( dir, vec3( 0.0, 1.0, 0.0 ) );
		s0 = length( s0 ) > 1e-3 ? normalize( s0 ) : vec3( 1.0, 0.0, 0.0 );
		vec3 s1 = cross( dir, s0 );
		vec3 side = s0 * cos( iE.z ) + s1 * sin( iE.z );
		vec3 w = iA.xyz + ab * vUv.x + side * ( q.y * iB.w );
		vec4 mv = viewMatrix * vec4( w, 1.0 );
		clip = projectionMatrix * mv;
		// a card fades edge-on and within 0.3 .. 2.5 m of the camera
		vec3 toCam = normalize( cameraPosition - w );
		vec3 cn = cross( dir, side );
		float facing = abs( dot( toCam, cn ) );
		vX = vec3( len, max( - mv.z, 0.0 ), smoothstep( 0.05, 0.45, facing ) * smoothstep( 0.3, 2.5, - mv.z ) );
		// the whole card is under 2 % (edge-on from every corner, or all of it within reach of the near fade): no fill.
		// Judged for the card, not per vertex, so a card is never bent.
		float best = 0.0;
		for ( int i = 0; i < 4; i ++ ) {
			vec3 cw = iA.xyz + ab * ( i < 2 ? 0.0 : 1.0 ) + side * ( ( mod( float( i ), 2.0 ) - 0.5 ) * iB.w );
			float cz = - ( viewMatrix * vec4( cw, 1.0 ) ).z;
			best = max( best, smoothstep( 0.05, 0.45, abs( dot( normalize( cameraPosition - cw ), cn ) ) ) * smoothstep( 0.3, 2.5, cz ) );
		}
		if ( best < 0.02 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
	}
	gl_Position = clip;
}
`;

const FRAG = /* glsl */`
uniform sampler2D uFx;
uniform float uTime;
uniform float uInvExposure;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vD;
varying vec4 vE;
varying vec3 vX;
varying vec2 vLin;
void main() {
	float shape = vE.x;
	float add = mod( vE.w, 2.0 );
	vec2 uvq = vec2( vUv.x, vLin.x / vLin.y + 0.5 );
	vec2 p = ( uvq - 0.5 ) * 2.0;
	float r = length( p );
	vec4 o;
	if ( shape < 0.5 ) {
		vec4 t = texture2D( uFx, vD.xy + vUv * vD.zw );
		o = vec4( t.rgb * vCol.rgb, t.a ) * vCol.a;
	} else if ( shape < 1.5 ) {
		float a = max( 1.0 - r * r, 0.0 );
		a *= a;
		// vD.y: a tight glow (a lamp's halo): the falloff cubed, so the light sits on its lamp with a hot heart
		a = mix( a, a * a * a, vD.y );
		o = vec4( mix( vCol.rgb, vec3( 1.0 ), vD.x * a * a ) * a, a ) * ( vCol.a * vX.z );
	} else if ( shape < 2.5 ) {
		// the ticked ground ring: an outline, eight ticks, a disc that fills to vE.y
		float edge = fwidth( r ) * 1.5;
		float line = smoothstep( 0.935 - edge, 0.935, r ) * ( 1.0 - smoothstep( 0.97, 0.97 + edge, r ) );
		float ang = atan( p.y, p.x );
		float tick = 1.0 - smoothstep( 0.035, 0.035 + edge * 0.5, abs( fract( ang * 1.2732395 + 0.5 ) - 0.5 ) * 0.7853982 * r );
		tick *= smoothstep( 0.74 - edge, 0.74, r ) * ( 1.0 - smoothstep( 0.935, 0.935 + edge, r ) );
		// underground look, pass i3: vD.x = 1 is a plain shock (the seventh's): no ticks, and a wake behind the crest
		// that falls off inward over vD.y of the radius. Every other ring leaves vD at 0 and is drawn as before.
		float wake = smoothstep( 0.935 - max( vD.y, 1e-3 ), 0.935, r ) * ( 1.0 - smoothstep( 0.935, 0.935 + edge, r ) );
		tick = mix( tick, wake * wake * 0.45, vD.x );
		float fill = ( 1.0 - smoothstep( vE.y * 0.935 - edge, vE.y * 0.935, r ) ) * 0.10;
		float front = ( 1.0 - smoothstep( 0.0, 0.05, abs( r - vE.y * 0.935 ) ) ) * 0.4 * step( vE.y, 0.999 );
		float a = clamp( line + tick + fill + front, 0.0, 1.0 );
		vec3 c = mix( vCol.rgb, vec3( 1.0, 0.95, 0.82 ), clamp( line * 0.45 + front, 0.0, 1.0 ) );
		o = vec4( c * a, a ) * vCol.a;
	} else if ( shape < 3.5 ) {
		// constant-width line: vD = core px, halo alpha, white core share, head (0 none)
		float v = abs( uvq.y - 0.5 ) * vX.z;
		float core = 1.0 - smoothstep( vD.x * 0.5 - 0.5, vD.x * 0.5 + 0.5, v );
		float h = max( 1.0 - v / max( vX.z * 0.5, 1e-3 ), 0.0 );
		float a = max( core, h * h * vD.y );
		float m = vUv.x * vX.x;
		if ( vE.z > 0.0 ) a *= step( fract( m / ( 2.0 * vE.z ) ), 0.5 );
		vec3 c = mix( vCol.rgb, vec3( 1.0 ), vD.z * ( 1.0 - smoothstep( vD.x * 0.15, vD.x * 0.35, v ) ) );
		if ( vD.w > 0.5 ) {
			// a head climbing to vE.y: nothing beyond it, bright at it
			float along = ( vE.y - vUv.x ) * vX.x;
			a *= step( 0.0, along );
			float head = exp( - along * along * 6.0 );
			c = mix( c, vec3( 1.0 ), head * 0.8 );
			a *= 0.55 + 0.45 * head;
		}
		o = vec4( c * a, a ) * vCol.a;
	} else if ( shape < 4.5 ) {
		// a blob shadow: a dark core under the feet, a soft edge
		float a = ( 1.0 - smoothstep( 0.3, 1.0, r ) ) * vCol.a;
		// pass i5: vE.y = a tight contact core over it, for feet in a building's shade (0 in the sun and indoors: the blob as it was)
		float c = ( 1.0 - smoothstep( 0.10, 0.50, r ) ) * vE.y;
		o = vec4( 0.0, 0.0, 0.0, a + ( 1.0 - a ) * c );
	} else if ( shape < 5.5 ) {
		// mouth glow: a disc growing with vE.y, white core, six radial ticks
		float lv = max( vE.y, 0.02 ) * 0.62;
		float disc = 1.0 - smoothstep( lv * 0.75, lv, r );
		float corew = 1.0 - smoothstep( lv * 0.2, lv * 0.55, r );
		float ang = atan( p.y, p.x );
		float tk = 1.0 - smoothstep( 0.02, 0.05, abs( fract( ang * 0.9549297 + 0.5 ) - 0.5 ) * 1.0471976 * r );
		tk *= smoothstep( lv + 0.04, lv + 0.08, r ) * ( 1.0 - smoothstep( 0.9, 0.98, r ) ) * step( 0.05, vE.y );
		float a = clamp( disc + tk * 0.9, 0.0, 1.0 );
		o = vec4( mix( vCol.rgb, vec3( 1.0 ), corew * 0.85 ) * a, a ) * vCol.a;
	} else if ( shape < 6.5 ) {
		float across = max( 1.0 - p.y * p.y, 0.0 );
		float along = smoothstep( 0.0, 0.06, vUv.x ) * ( 1.0 - smoothstep( 0.80, 1.0, vUv.x ) );
		float a = across * across * along * vX.z;
		o = vec4( vCol.rgb * a, a ) * vCol.a;
	} else if ( shape < 7.5 ) {
		vec2 e = smoothstep( vec2( 1.0 ), vec2( 0.55 ), abs( p ) );
		float a = e.x * e.y;
		o = vec4( vCol.rgb * a, a ) * vCol.a;
	} else if ( shape < 8.5 ) {
		float v = abs( p.y );
		float a = ( 1.0 - smoothstep( 0.35, 1.0, v ) ) * smoothstep( 0.0, 0.05, vUv.x ) * ( 1.0 - smoothstep( 0.95, 1.0, vUv.x ) );
		o = vec4( mix( vCol.rgb, vec3( 1.0 ), 1.0 - smoothstep( 0.1, 0.45, v ) ) * a, a ) * vCol.a;
	} else {
		// the last fire (pass i1: it was one near-white capsule): three tongues that lick at their own rates and lean
		// together, deep orange at their edges and tips, the flame's own orange in the body, and a pale yellow heart low
		// in the middle tongue only; vE.y = how far it has caught (the side tongues come last)
		float fy = p.y * 0.5 + 0.5;
		float a = 0.0, heart = 0.0;
		for ( int k = 0; k < 3; k ++ ) {
			float fk = float( k );
			float ph = fk * 2.1;
			float off = ( fk - 1.0 ) * 0.34;
			float hk = ( k == 1 ? 1.0 : ( k == 0 ? 0.62 : 0.74 ) ) * ( 0.86 + 0.14 * sin( uTime * ( 9.0 + 2.3 * fk ) + ph ) );
			float yy = fy / hk;
			float sway = ( 0.20 * yy * yy + 0.05 * yy ) * sin( uTime * ( 6.0 + 1.7 * fk ) + yy * ( 4.0 + fk ) + ph ) + 0.10 * yy * yy;
			float x = p.x - off * ( 1.0 - 0.45 * yy ) - sway;
			float w = mix( k == 1 ? 0.46 : 0.30, 0.02, pow( clamp( yy, 0.0, 1.0 ), 1.4 ) );
			float ak = ( 1.0 - smoothstep( w * 0.30, w, abs( x ) ) ) * ( 1.0 - smoothstep( 0.72, 1.0, yy ) ) * smoothstep( 0.0, 0.07, fy );
			a = max( a, ak );
			if ( k == 1 ) heart = ( 1.0 - smoothstep( w * 0.12, w * 0.62, abs( x ) ) ) * ( 1.0 - smoothstep( 0.18, 0.62, yy ) ) * smoothstep( 0.0, 0.10, fy );
		}
		vec3 c = mix( vCol.rgb * vec3( 1.0, 0.50, 0.26 ), vCol.rgb, smoothstep( 0.25, 0.8, a ) * ( 1.0 - 0.55 * fy ) );
		c = mix( c, vec3( 1.0, 0.86, 0.52 ), heart * 0.9 );
		o = vec4( c * a, a ) * vCol.a;
	}
	o.rgb *= mix( 1.0, uInvExposure, add );
	o.a *= 1.0 - add;
	gl_FragColor = o;
	#include <colorspace_fragment>
}
`;

export class QuadBatch {
  readonly mesh: THREE.Mesh;
  readonly data: Float32Array;
  private readonly buffer: THREE.InstancedInterleavedBuffer;
  private readonly geometry: THREE.InstancedBufferGeometry;
  count = 0;
  /** screen share covered by additive instances of this frame (estimate) */
  additive = 0;
  dropped = 0;
  readonly viewport: Uniform<THREE.Vector2> = { value: new THREE.Vector2(960, 540) };

  constructor(fx: Uniform<THREE.Texture | null>, time: Uniform<number>, invExposure: Uniform<number>, capacity = QUAD_CAPACITY) {
    this.data = new Float32Array(capacity * QUAD_STRIDE);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const buffer = new THREE.InstancedInterleavedBuffer(this.data, QUAD_STRIDE, 1);
    buffer.setUsage(THREE.DynamicDrawUsage);
    const names = ['iA', 'iB', 'iC', 'iD', 'iE'];
    for (let i = 0; i < names.length; i++) g.setAttribute(names[i] as string, new THREE.InterleavedBufferAttribute(buffer, 4, i * 4));
    g.instanceCount = 0;
    this.buffer = buffer;
    this.geometry = g;
    const material = new THREE.ShaderMaterial({
      name: 'keep_quads', uniforms: { uFx: fx, uTime: time, uInvExposure: invExposure, uViewport: this.viewport },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = 'keep_fx_quads';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }
  get capacity(): number { return this.data.length / QUAD_STRIDE; }

  begin(): void { this.count = 0; this.additive = 0; }
  /**
   * The offset of the next instance in `data` (its 20 floats are the caller's to write), or -1 when the batch is full.
   * Callers write the floats themselves: a call with twenty number arguments would box every double it passes.
   */
  next(): number {
    if (this.count >= this.capacity) { this.dropped++; return -1; }
    return QUAD_STRIDE * this.count++;
  }
  end(): void {
    this.geometry.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count > 0) this.buffer.needsUpdate = true;
  }
  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
