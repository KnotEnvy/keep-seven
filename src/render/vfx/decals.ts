// Bullet decals: a pool of 48 quads lying on the surface they hit, one draw call, written only when a decal is added
// (the oldest is replaced: at the revolver's cadence 48 shots are 23 s, so each lives at least 20 s).
// A decal DARKENS what is under it (a multiply blend cut out by the atlas alpha): it takes the baked light of its wall,
// so a hole in a shadowed wall is darker than the shadow, never a pale coin lit by the mood's flat light.
import * as THREE from 'three';
import type { SurfaceType } from '../../core/contracts.ts';
import { FOG_GLSL } from '../shared.ts';
import type { SharedUniforms, Uniform } from '../shared.ts';
import { CELL, FX_RECTS } from './atlas.ts';

export const DECAL_POOL = 48;
const STRIDE = 12;

const VERT = /* glsl */`
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
${FOG_GLSL}
varying vec2 vUv;
varying vec4 vFog;
void main() {
	vec3 n = normalize( iB.xyz );
	vec3 tx = normalize( cross( abs( n.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ), n ) );
	vec3 ty = cross( n, tx );
	float c = cos( iB.w ), s = sin( iB.w );
	vec2 q = vec2( position.x * c - position.y * s, position.x * s + position.y * c ) * iA.w;
	vec3 w = iA.xyz + n * 0.004 + tx * q.x + ty * q.y;
	vUv = iC.xy + ( position.xy + 0.5 ) * iC.zw;
	vec3 ray = w - cameraPosition;
	float dist = length( ray );
	vFog = vec4( keepFogColour( ray / max( dist, 1e-4 ), dist ), keepFogAmount( ray, dist ) );
	gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
}
`;
const FRAG = /* glsl */`
uniform sampler2D uFx;
uniform float uDecalGamma;
varying vec2 vUv;
varying vec4 vFog;
void main() {
	vec4 t = texture2D( uFx, vUv );
	if ( t.a < 0.5 ) discard;
	// the factor the surface is multiplied by: the mark's own tone against a pale wall, fading out into the fog
	vec3 k = clamp( t.rgb / t.a * 1.35, 0.0, 1.0 );
	k = mix( k, vec3( 1.0 ), vFog.a );
	// uDecalGamma: 1 into the linear scene buffer; 1 / 2.2 on \`min\`, whose framebuffer holds display values
	gl_FragColor = vec4( pow( k, vec3( uDecalGamma ) ), 1.0 );
}
`;

const SURFACE_CELL: Readonly<Record<SurfaceType, number>> = {
  sand: -1, wood: CELL.dec_wood, adobe: CELL.dec_adobe, metal: CELL.dec_metal, ceramic: CELL.dec_ceramic, stone: CELL.dec_stone, cloth: -1, none: -1,
};

export class DecalPool {
  readonly mesh: THREE.Mesh;
  private readonly data = new Float32Array(DECAL_POOL * STRIDE);
  private readonly buffer: THREE.InstancedInterleavedBuffer;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private cursor = 0;
  alive = 0;
  requested = 0;
  /** 1 when the decals are drawn into a linear buffer (Low, High), 1 / 2.2 when straight to the canvas (`min`) */
  readonly gamma: Uniform<number> = { value: 1 };

  constructor(fx: Uniform<THREE.Texture | null>, shared: SharedUniforms) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const buffer = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    buffer.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', new THREE.InterleavedBufferAttribute(buffer, 4, 0));
    g.setAttribute('iB', new THREE.InterleavedBufferAttribute(buffer, 4, 4));
    g.setAttribute('iC', new THREE.InterleavedBufferAttribute(buffer, 4, 8));
    g.instanceCount = 0;
    this.buffer = buffer; this.geometry = g;
    const uniforms: Record<string, Uniform<unknown>> = { uFx: fx, uDecalGamma: this.gamma };
    shared.attach(uniforms);
    const material = new THREE.ShaderMaterial({
      name: 'keep_decals', uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false, toneMapped: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = 'keep_fx_decals';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  /** false for a surface that takes none (sand, cloth) */
  add(surface: SurfaceType, x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, rot: number): boolean {
    this.requested++;
    const cell = SURFACE_CELL[surface];
    if (cell < 0) return false;
    const d = this.data, o = this.cursor * STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = nx; d[o + 5] = ny; d[o + 6] = nz; d[o + 7] = rot;
    d[o + 8] = FX_RECTS[cell * 4] as number; d[o + 9] = FX_RECTS[cell * 4 + 1] as number; d[o + 10] = FX_RECTS[cell * 4 + 2] as number; d[o + 11] = FX_RECTS[cell * 4 + 3] as number;
    this.cursor = (this.cursor + 1) % DECAL_POOL;
    if (this.alive < DECAL_POOL) this.alive++;
    this.geometry.instanceCount = this.alive;
    this.buffer.needsUpdate = true;
    this.mesh.visible = true;
    return true;
  }
  clear(): void {
    this.cursor = 0; this.alive = 0;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }
  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
