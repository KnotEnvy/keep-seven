// Pooled particles: one instanced batch, ONE draw call, no per-frame CPU work. A particle is written once when it is
// emitted (start point, velocity, birth time, life, sizes, colours) and the vertex shader moves it from clock.simTime;
// a dead slot collapses to nothing. The ring buffer overwrites the oldest when the pool is full.
//
// Instance: 24 floats.
//   iP  p0.xyz, birth time        iV  v0.xyz, life           iS  size0, size1, gravity, drag
//   iC  colour0.rgb, alpha        iK  colour1.rgb, flags      iR  cell, rotation, spin, fade-in share
// flags: 1 additive, 2 stretched along its velocity (sparks), 4 lit by the mood's ambient (dust, smoke, chips);
//        + 8 x the sprite's smallest size on screen in pixels (0 none): a hit must answer at any range
import * as THREE from 'three';
import type { Rng } from '../../core/contracts.ts';
import type { Uniform } from '../shared.ts';
import { FX_CELLS, FX_RECTS } from './atlas.ts';

export const PARTICLE_STRIDE = 24;
export const PARTICLE_CAPACITY = 640;
export const P_ADD = 1, P_STRETCH = 2, P_LIT = 4;

const VERT = /* glsl */`
attribute vec4 iP;
attribute vec4 iV;
attribute vec4 iS;
attribute vec4 iC;
attribute vec4 iK;
attribute vec4 iR;
uniform float uTime;
uniform vec2 uViewport;
uniform vec4 uRects[ ${FX_CELLS.length} ];
varying vec2 vUv;
varying vec4 vCol;
varying float vAdd;
varying float vLit;
void main() {
	// born at the tick's time, drawn at the frame's (which is up to one tick earlier): the first frame shows it at age 0
	float age = uTime - iP.w;
	if ( age < -0.05 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
	age = max( age, 0.0 );
	float k = iV.w > 0.0 ? age / iV.w : 2.0;
	if ( k >= 1.0 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
	float drag = iS.w;
	float tt = drag > 1e-3 ? ( 1.0 - exp( - drag * age ) ) / drag : age;
	vec3 p = iP.xyz + iV.xyz * tt;
	p.y -= 0.5 * iS.z * age * age;
	vec4 mv = viewMatrix * vec4( p, 1.0 );
	float size = mix( iS.x, iS.y, k );
	float minPx = floor( iK.w / 8.0 + 0.01 );
	float flags = iK.w - minPx * 8.0;
	// never smaller on screen than its minimum, however far it is
	float pxPerM = uViewport.y * projectionMatrix[ 1 ][ 1 ] * 0.5 / max( - mv.z, 0.05 );
	size *= max( 1.0, minPx / max( size * pxPerM, 1e-3 ) );
	// ... and never a lens-filling smudge: a sprite is at most 30 % of the frame's height (steam and dust at arm's length)
	size *= min( 1.0, uViewport.y * 0.30 / max( size * pxPerM, 1e-3 ) );
	vAdd = mod( flags, 2.0 );
	float stretch = step( 1.5, mod( flags, 4.0 ) );
	vLit = step( 3.5, flags );
	vec2 q = position.xy;
	vec2 off;
	if ( stretch > 0.5 ) {
		vec3 vel = iV.xyz * exp( - drag * age );
		vel.y -= iS.z * age;
		vec2 d = ( viewMatrix * vec4( vel, 0.0 ) ).xy;
		float sp = length( vel );
		float dl = length( d );
		d = dl > 1e-4 ? d / dl : vec2( 0.0, 1.0 );
		float len = clamp( sp * 0.035, size, size * 7.0 );
		off = d * ( q.y * len ) + vec2( - d.y, d.x ) * ( q.x * size * 0.45 );
	} else {
		float a = iR.y + iR.z * age;
		float c = cos( a ), s = sin( a );
		off = vec2( q.x * c - q.y * s, q.x * s + q.y * c ) * size;
	}
	mv.xy += off;
	gl_Position = projectionMatrix * mv;
	vec4 rect = uRects[ int( iR.x + 0.5 ) ];
	vUv = rect.xy + ( q + 0.5 ) * rect.zw;
	float fade = smoothstep( 0.0, max( iR.w, 1e-3 ), k ) * ( 1.0 - k * k );
	vCol = vec4( mix( iC.rgb, iK.rgb, k ), iC.a * fade );
}
`;
const FRAG = /* glsl */`
uniform sampler2D uFx;
uniform vec3 uLit;
uniform float uInvExposure;
varying vec2 vUv;
varying vec4 vCol;
varying float vAdd;
varying float vLit;
void main() {
	vec4 t = texture2D( uFx, vUv );
	vec3 c = t.rgb * vCol.rgb * mix( vec3( 1.0 ), uLit, vLit ) * mix( 1.0, uInvExposure, vAdd );
	gl_FragColor = vec4( c * vCol.a, t.a * vCol.a * ( 1.0 - vAdd ) );
	#include <colorspace_fragment>
}
`;

/** What one emit() call throws: a cone of `count` sprites about a normal. Colours are linear. */
export interface ParticleSpec {
  cell: number;
  flags: number;
  /** metres per second */
  speedMin: number; speedMax: number;
  /** half-angle of the cone about the normal in radians (PI = every direction) */
  spread: number;
  /** velocity added whatever the normal (rise, drift) */
  vx: number; vy: number; vz: number;
  gravity: number; drag: number;
  lifeMin: number; lifeMax: number;
  size0: number; size1: number;
  r0: number; g0: number; b0: number; r1: number; g1: number; b1: number;
  alpha: number;
  spin: number;
  /** share of the life spent fading in */
  fadeIn: number;
  /** metres the start point is scattered about the origin */
  scatter: number;
  /** the sprite's smallest size on screen in pixels (0 to 31; 0 = none) */
  minPx: number;
}

export function spec(p: Partial<ParticleSpec> & { cell: number }): ParticleSpec {
  return {
    flags: 0, speedMin: 1, speedMax: 2, spread: 0.6, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, lifeMin: 0.4, lifeMax: 0.6,
    size0: 0.1, size1: 0.2, r0: 1, g0: 1, b0: 1, r1: 1, g1: 1, b1: 1, alpha: 1, spin: 0, fadeIn: 0.05, scatter: 0, minPx: 0, ...p,
  };
}

export class ParticleBatch {
  readonly mesh: THREE.Mesh;
  private readonly data: Float32Array;
  private readonly expiry: Float32Array;
  private readonly buffer: THREE.InstancedInterleavedBuffer;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private cursor = 0;
  private used = 0;
  private lastExpiry = -1;
  /** what the mood's ambient makes of a lit sprite */
  readonly lit: Uniform<THREE.Color> = { value: new THREE.Color(1, 1, 1) };
  /** emitted since boot (tests) */
  emitted = 0;
  /** the time a particle is stamped with: the simulation's at the tick that emits it (set by Vfx; see Vfx.now) */
  now: () => number = () => this.time.value;

  constructor(fx: Uniform<THREE.Texture | null>, private readonly time: Uniform<number>, invExposure: Uniform<number>, viewport: Uniform<THREE.Vector2>, private readonly rng: Rng, readonly capacity = PARTICLE_CAPACITY) {
    this.data = new Float32Array(capacity * PARTICLE_STRIDE);
    this.expiry = new Float32Array(capacity).fill(-1);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const buffer = new THREE.InstancedInterleavedBuffer(this.data, PARTICLE_STRIDE, 1);
    buffer.setUsage(THREE.DynamicDrawUsage);
    const names = ['iP', 'iV', 'iS', 'iC', 'iK', 'iR'];
    for (let i = 0; i < names.length; i++) g.setAttribute(names[i] as string, new THREE.InterleavedBufferAttribute(buffer, 4, i * 4));
    g.instanceCount = 0;
    this.buffer = buffer;
    this.geometry = g;
    const rects: THREE.Vector4[] = [];
    for (let i = 0; i < FX_CELLS.length; i++) rects.push(new THREE.Vector4(FX_RECTS[i * 4], FX_RECTS[i * 4 + 1], FX_RECTS[i * 4 + 2], FX_RECTS[i * 4 + 3]));
    const material = new THREE.ShaderMaterial({
      name: 'keep_particles', uniforms: { uFx: fx, uTime: time, uViewport: viewport, uRects: { value: rects }, uLit: this.lit, uInvExposure: invExposure },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = 'keep_fx_particles';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 21;
    this.mesh.visible = false;
  }

  /**
   * Throws `count` sprites from a point in a cone about (nx, ny, nz). `scale` multiplies size and speed; `alphaScale`
   * multiplies opacity.
   */
  emit(s: ParticleSpec, count: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, scale: number, alphaScale: number): void {
    const d = this.data, rng = this.rng, now = this.now();
    // an orthonormal basis about the normal
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-5) { nx = 0; ny = 1; nz = 0; l = 1; }
    nx /= l; ny /= l; nz /= l;
    let tx: number, ty: number, tz: number;
    if (Math.abs(ny) < 0.9) { tx = nz; ty = 0; tz = -nx; } else { tx = 1; ty = 0; tz = 0; }
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const cosMax = Math.cos(s.spread);
    for (let i = 0; i < count; i++) {
      const o = this.cursor * PARTICLE_STRIDE;
      const cz = 1 - rng.next() * (1 - cosMax), sn = Math.sqrt(Math.max(0, 1 - cz * cz)), ph = rng.next() * 6.2831853;
      const cx = Math.cos(ph) * sn, cy = Math.sin(ph) * sn;
      const speed = (s.speedMin + (s.speedMax - s.speedMin) * rng.next()) * scale;
      const life = s.lifeMin + (s.lifeMax - s.lifeMin) * rng.next();
      const sc = s.scatter * scale;
      d[o] = x + (rng.next() - 0.5) * sc; d[o + 1] = y + (rng.next() - 0.5) * sc; d[o + 2] = z + (rng.next() - 0.5) * sc; d[o + 3] = now;
      d[o + 4] = (tx * cx + bx * cy + nx * cz) * speed + s.vx; d[o + 5] = (ty * cx + by * cy + ny * cz) * speed + s.vy; d[o + 6] = (tz * cx + bz * cy + nz * cz) * speed + s.vz; d[o + 7] = life;
      const jitter = 0.8 + 0.4 * rng.next();
      d[o + 8] = s.size0 * scale * jitter; d[o + 9] = s.size1 * scale * jitter; d[o + 10] = s.gravity; d[o + 11] = s.drag;
      d[o + 12] = s.r0; d[o + 13] = s.g0; d[o + 14] = s.b0; d[o + 15] = s.alpha * alphaScale;
      d[o + 16] = s.r1; d[o + 17] = s.g1; d[o + 18] = s.b1; d[o + 19] = s.flags + 8 * s.minPx;
      d[o + 20] = s.cell; d[o + 21] = rng.next() * 6.2831853; d[o + 22] = (rng.next() - 0.5) * 2 * s.spin; d[o + 23] = s.fadeIn;
      const end = now + life;
      this.expiry[this.cursor] = end;
      if (end > this.lastExpiry) this.lastExpiry = end;
      this.cursor = (this.cursor + 1) % this.capacity;
      if (this.used < this.capacity) this.used++;
    }
    this.emitted += count;
    this.buffer.needsUpdate = true;
    this.geometry.instanceCount = this.used;
    this.mesh.visible = true;
  }

  /** Once per frame: nothing to simulate; an empty pool is not drawn at all. */
  update(): void {
    if (this.mesh.visible && this.time.value >= this.lastExpiry) this.mesh.visible = false;
  }
  /** particles alive right now */
  alive(): number {
    if (!this.mesh.visible) return 0;
    const now = this.time.value, e = this.expiry;
    let n = 0;
    for (let i = 0; i < this.used; i++) if ((e[i] as number) > now) n++;
    return n;
  }
  /** Drops everything (a restart, a warp). */
  clear(): void {
    this.expiry.fill(-1); this.data.fill(0);
    this.cursor = 0; this.used = 0; this.lastExpiry = -1;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
    this.buffer.needsUpdate = true;
  }
  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
