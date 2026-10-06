// The post chain per tier (ARCHITECTURE 8.2, code-render 4.1):
//   min   no composer: the shoulder tone map + grade are compiled into every material through CustomToneMapping,
//         the vignette is one alpha-blended quad, no grain. 0 full-screen passes.
//   low   postprocessing, HalfFloat buffers, ONE merged pass: tone map + grade + vignette + grain. 1 full-screen pass.
//   high  bloom merged into that pass (half-res luminance, 5 levels, additive, threshold BLOOM_THRESHOLD of DISPLAY white,
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
export const AO_RADIUS = 0.55, AO_INTENSITY = 10, AO_FAR = 45, AO_TAPS = 16, AO_FLOOR = 0.45;
/** the share of the depth range the view-model is drawn into where the world's depth is kept for the contact shade */
export const VM_DEPTH_RANGE = 0.05;
/** how much of the contact shade is left under a sky (the mood's M_SKY) */
export const AO_SKY = 0.35;
/** the share of the contact shade a lit surface loses, between two DISPLAY levels of its own light (polish round 5) */
export const AO_LIT = 0.7, AO_LIT_FROM = 0.30, AO_LIT_TO = 0.85;
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
		float w = max( 0.0, dot( v, n ) - 0.005 - 0.004 * dist ) / ( dd + 0.0004 ) * step( dd, r2 ) * ( 1.0 - dd / r2 );
		sum += w; top = max( top, w );
	}
	// polish round 5 (visual critic: "dithered dark speckles round the wall-lamp boxes and the stuck stakes"): what ONE
	// tap of sixteen finds is not a shade, it is the stipple: a stake a hand wide, the rim of a bezel. The strongest
	// tap is left out (a corner or a body over the plate is found by many and keeps its shade) ...
	sum = max( sum - top, 0.0 ) * ${(AO_TAPS / (AO_TAPS - 1)).toFixed(4)};
	// ... and a surface in a lamp's own pool takes less of it: the shade belongs to the fill, not to direct light
	float lit = dot( inputColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * uAoExposure;
	fade *= 1.0 - ${AO_LIT.toFixed(2)} * smoothstep( ${AO_LIT_FROM.toFixed(2)}, ${AO_LIT_TO.toFixed(2)}, lit );
	// never darker than AO_FLOOR of the baked light: a shade, not a hole
	float ao = mix( 1.0, max( 1.0 - sum * uAoK.x * ( uAoK.y / ${AO_TAPS}.0 ), ${AO_FLOOR.toFixed(2)} ), fade );
	outputColor = vec4( inputColor.rgb * ao, inputColor.a );
	if ( uAoK.w > 1.5 ) outputColor = vec4( vec3( ao * ao ) * 0.3, 1.0 );   // debug view (aoK.w = 2): the shade alone
}
`;
class ContactShadeEffect extends Effect {
  constructor(readonly depth: THREE.Uniform<THREE.Texture | null>, readonly proj: THREE.Uniform<THREE.Vector4>, readonly k: THREE.Uniform<THREE.Vector4>, exposure: THREE.Uniform<number>) {
    super('KeepContactShade', AO_FRAGMENT, { blendFunction: BlendFunction.SRC, uniforms: new Map<string, THREE.Uniform>([['uAoDepth', depth], ['uAoProj', proj], ['uAoK', k], ['uAoExposure', exposure]]) });
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
  private merged: EffectPass | null = null;
  private fxaa: EffectPass | null = null;
  private bloom: BloomEffect | null = null;
  /** High: the contact shade's depth texture (the input buffer's own depth attachment), its projection and its numbers */
  private readonly aoDepth = new THREE.Uniform<THREE.Texture | null>(null);
  private readonly aoProj = new THREE.Uniform(new THREE.Vector4(1, 1, 0.1, 1000));
  readonly aoK = new THREE.Uniform(new THREE.Vector4(AO_RADIUS, AO_INTENSITY, AO_FAR, 0));
  /** true while the scene's depth is kept for the contact shade: the view-model must then be drawn into VM_DEPTH_RANGE, not over a cleared depth */
  keepsDepth = false;
  private readonly vignetteMesh: THREE.Mesh;
  private readonly vignetteAspect = { value: 16 / 9 };
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
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

  /** Builds the chain of a tier (and disposes the one before). */
  configure(tier: RenderTier, features: Readonly<QualityFeatures>): void {
    const r = this.renderer;
    this.disposeChain();
    this.tier = tier;
    if (!features.composer) {
      r.toneMapping = THREE.CustomToneMapping;
      this.grainLow.value = 0; this.grainHigh.value = 0;
      return;
    }
    r.toneMapping = THREE.NoToneMapping;
    const composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false, multisampling: 0 });
    const grade = new GradeEffect(this.shared, this.exposure, this.vignette, this.grainLow, this.seed);
    if (features.bloom) {
      const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, mipmapBlur: true, luminanceThreshold: BLOOM_THRESHOLD, luminanceSmoothing: BLOOM_SMOOTHING, intensity: BLOOM_INTENSITY, radius: 0.8, levels: 5 });
      bloom.luminancePass.resolution.scale = 0.5;
      this.bloom = bloom;
      // the contact shade reads the scene's depth: the input buffer gets a depth texture before it is first drawn into
      const depth = new THREE.DepthTexture(1, 1);
      depth.name = 'keep_scene_depth';
      composer.inputBuffer.depthTexture = depth;
      this.aoDepth.value = depth;
      this.aoK.value.w = 1;
      this.keepsDepth = true;
      this.merged = new EffectPass(this.camera, new ContactShadeEffect(this.aoDepth, this.aoProj, this.aoK, this.exposure), bloom, grade);
    } else {
      this.merged = new EffectPass(this.camera, grade);
    }
    composer.addPass(this.merged);
    if (features.antialias === 'fxaa') {
      this.fxaa = new EffectPass(this.camera, new FXAAEffect(), new GrainEffect(this.grainHigh, this.seed));
      composer.addPass(this.fxaa);
    }
    this.composer = composer;
    r.autoClear = false;
    this.applyGrain();
  }
  /** grain belongs to the last pass: the merged one on Low, the FXAA one on High */
  applyGrain(): void {
    const on = this.composer !== null;
    this.grainLow.value = on && !this.fxaa ? this.grainAmount : 0;
    this.grainHigh.value = on && this.fxaa ? this.grainAmount : 0;
  }
  private disposeChain(): void {
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    this.merged = null; this.fxaa = null; this.bloom = null;
    this.aoDepth.value = null; this.aoK.value.w = 0; this.keepsDepth = false;
  }
  dispose(): void {
    this.disposeChain();
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
   * Bytes of the render targets really allocated at the current drawing-buffer size, by the per-pixel figures of
   * ARCHITECTURE 8.4 (`tiers.*.targets`): the canvas, the composer's two RGBA16F buffers and their depth, the bloom
   * chain, the shadow map. `msaa` is whether the WebGL context has antialias (only a context created for `min`).
   */
  renderTargetBytes(def: TierDef, msaa: boolean, shadowMapBytes: number): number {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const pixels = this.size.x * this.size.y;
    if (!this.composer) return Math.round(pixels * (msaa ? def.bytesPerPixel : 8));
    let perPixel = 8 + 16 + 4;
    if (this.bloom) perPixel += 2 + 5.33;
    return Math.round(pixels * perPixel) + shadowMapBytes;
  }
}
