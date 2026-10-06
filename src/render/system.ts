// The render system (code-render order; ARCHITECTURE 8): renderer and tiers, moods / sky / fog / grade, the view-model
// pass, visibility, stats, warm-up, capture. The look is baked light, fog, sky and grade; nothing here lights at runtime
// beyond the two pulse slots and the per-zone ambient and key of dynamic objects.
//
// Frame: lateUpdate() advances everything that moves by itself (mood cross-fades, pulses, the quad batch) from the
// CLOCK, so drawing the same tick twice gives the same picture; render() only draws.
import * as THREE from 'three';
import { FIXED_DT } from '../core/contracts.ts';
import type {
  AssetDef, DebugSnapshot, GameContext, GameEvents, InstanceApi, LampApi, LayoutMarker, MoodId, PerfStats, RenderSystem, RenderTier, TextureId, VfxApi, ZoneId,
} from '../core/contracts.ts';
import { Feedback } from './feedback.ts';
import { Instances } from './instances.ts';
import { HaloSpec, MaterialFactory, writeHalo } from './materials.ts';
import {
  BORE_KERB_TOP_Y, MOODS, MOOD_SIZE, M_AMBIENT, M_CLOUD, M_CONTRAST, M_DENSITY, M_EXPOSURE, M_FOG_A, M_FOG_B, M_FOG_MIX_DIST, M_FOG_MIX_SUN, M_GLOW,
  M_HEIGHT_EXTRA, M_HEIGHT_FALLOFF, M_KEY, M_KEY_DIR, M_LIFT, M_MID, M_MID_SIN, M_PLACE, M_PULSE, M_RULE, M_SATURATION, M_SKY, M_SUN_COL, M_SUN_DIR, M_SUN_DISC,
  M_TINT, M_VIGNETTE, M_ZENITH, M_BLOOM_T, M_BLOOM_K, M_BLOOM_S, BLOOM_T_DEFAULT, BLOOM_K_DEFAULT, SHEEN, cellHeightExtra, isMoodKey, lerpMood, moodAt, smoothstep01,
} from './moods.ts';
import type { MoodKey } from './moods.ts';
import { AO_INTENSITY, AO_SKY, EMISSIVE_HDR, PostChain, VM_DEPTH_RANGE } from './post.ts';
import { HUE, SharedUniforms } from './shared.ts';
import { Sky } from './sky.ts';
import { Vfx, VFX_IDS } from './vfx/vfx.ts';
import { PREWARM } from './prewarm.ts';

const VIEWMODEL_FOV = 40;
const VIEWMODEL_NEAR = 0.02;
const DEFAULT_MOOD_FADE = 1.5;
/** trauma decays 1.8 per second; the shake is rotational: at most 1.2 degrees of pitch and yaw, 1.5 of roll */
const TRAUMA_DECAY = 1.8;
const SHAKE_PITCH = 1.2 * Math.PI / 180, SHAKE_YAW = 1.2 * Math.PI / 180, SHAKE_ROLL = 1.5 * Math.PI / 180;
const SHADOW_MAP_BYTES = 8 * 1024 * 1024;
/** half the side of the sun shadow map's square (High). Polish round 5: 18 -> 26 m, so a Bider coming up the street or across the yard carries its shadow from the first sight of it, not from 18 m (5 cm a texel under PCF; the map and its cost are the same) */
const SHADOW_HALF = 26;
/**
 * High: a dense lamp set (materials.ts LampInfo.dense, the Windlass's gauge) is drawn DENSE_OVER of the mood's bloom
 * threshold and never under DENSE_MIN of display white; DENSE_LUMA is the luminance of its aqua-white lamp value.
 */
const DENSE_OVER = 1.08, DENSE_MIN = 0.92, DENSE_LUMA = 0.95;
const MAX_OUTLINE_MESHES = 12;
/** share of a lit particle's light that is neutral (and how bright that neutral part is against the mood's brightest channel) */
const LIT_NEUTRAL = 0.3, LIT_NEUTRAL_GAIN = 1.5;

interface LayoutLight { x: number; y: number; z: number; zone: ZoneId; kind: 'practical' | 'strip' | 'lamp' | 'bore_glow' | 'hatch_glow'; flicker: boolean; flag: string; env: string }

const OUTLINE_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform vec2 uViewport;
void main() {
	#include <beginnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <begin_vertex>
	#include <skinning_vertex>
	vec4 wp = modelMatrix * vec4( transformed, 1.0 );
	vec4 clip = projectionMatrix * viewMatrix * wp;
	vec3 vn = mat3( viewMatrix ) * ( mat3( modelMatrix ) * objectNormal );
	float l = length( vn.xy );
	// two pixels outward in screen space, whatever the distance
	if ( l > 1e-5 ) clip.xy += ( vn.xy / l ) * ( 4.0 / uViewport ) * clip.w;
	gl_Position = clip;
}
`;
const OUTLINE_FRAG = /* glsl */`
uniform vec4 uOutline;
void main() {
	gl_FragColor = vec4( uOutline.rgb * uOutline.a, 0.0 );
	#include <colorspace_fragment>
}
`;

/** colour <- three floats of a mood (no double crosses a call: a boxed argument is an allocation) */
function rgbOf(c: THREE.Color, m: Float32Array, at: number): void { c.r = m[at] as number; c.g = m[at + 1] as number; c.b = m[at + 2] as number; }
function xyzOf(v: THREE.Vector3, m: Float32Array, at: number): void { v.x = m[at] as number; v.y = m[at + 1] as number; v.z = m[at + 2] as number; }

function labOf(r: number, g: number, b: number, out: [number, number, number]): [number, number, number] {
  const lin = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), fy = f(0.2126 * R + 0.7152 * G + 0.0722 * B), fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
  return out;
}

export class RenderSystemImpl implements RenderSystem {
  readonly id = 'render' as const;
  readonly vfx: VfxApi;
  readonly instances: InstanceApi;
  readonly lamps: LampApi;
  private gl: THREE.WebGLRenderer | null = null;
  private contextMsaa = false;
  private readonly shared = new SharedUniforms();
  private readonly materials: MaterialFactory;
  private readonly fx: Vfx;
  private readonly inst: Instances;
  private readonly feedback: Feedback;
  private post: PostChain | null = null;
  private sky: Sky | null = null;
  private readonly viewCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 16 / 9, VIEWMODEL_NEAR, 50);
  private readonly unsubscribe: (() => void)[] = [];
  // ---- size
  private cssWidth = 960;
  private cssHeight = 540;
  private appliedRatio = -1;
  private readonly bufferSize = new THREE.Vector2(960, 540);
  // ---- visibility
  private readonly visibleUnits = new Set<string>();
  private readonly plugNodes = new Set<string>();
  private readonly chunkIds = new Set<string>();
  private readonly drawnNodes = new Set<string>();
  private readonly visibleZones = new Set<string>();
  private readonly exteriorZones = new Set<string>();
  private readonly zoneMood = new Map<string, MoodId>();
  private visibleZoneCount = 0;
  // ---- mood
  private mood: MoodId = 'L1';
  private moodKey: MoodKey = 'L1';
  private readonly moodFrom = new Float32Array(MOOD_SIZE);
  private readonly moodTo = new Float32Array(MOOD_SIZE);
  private readonly moodCur = new Float32Array(MOOD_SIZE);
  private moodT = 1;
  private moodSeconds = DEFAULT_MOOD_FADE;
  private expFrom = 1; private expTo = 1; private expT = 1; private expSeconds = 0; private expMul = 1;
  private heightExtra = 0;
  private fogBase = 0;
  /** an exterior zone is among the drawn ones / how much of the open air's own fog and sky exterior things take (0 under an exterior mood) */
  private exteriorDrawn = false;
  private outside = 0;
  /** where the camera was at the last frame (a warp snaps the dynamic lights) */
  private readonly lastCam = new THREE.Vector3(1e9, 0, 0);
  private exposure = 1;
  private lastClock = -1;
  // ---- overrides for tests (ext.render.override)
  private overFog = -1; private overExposure = -1; private overGrain = -1; private overIdentity = false; private overVignette = -1; private overHeight = -1;
  /** the layout zone the player stands in right now (null in a sandbox room) */
  private zoneNow: ZoneId | null = null;
  // ---- options
  private screenShake = 1;
  private reduceMotion = false;
  private reduceFlashes = false;
  // ---- trauma
  private trauma = 0;
  private readonly savedQuat = new THREE.Quaternion();
  private readonly shakeQuat = new THREE.Quaternion();
  private readonly shakeEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private shaking = false;
  // ---- sky
  private threadVisible = false;
  // ---- shadow (High)
  private sun: THREE.DirectionalLight | null = null;
  private shadowMaterial: THREE.ShadowMaterial | null = null;
  private shadowOn = false;
  // ---- outline
  private outlineTarget: THREE.Object3D | null = null;
  private outlineMaterial: THREE.ShaderMaterial | null = null;
  /** the outline drawn on skinned meshes: a material object of its own (one program per material object) */
  private outlineSkinned: THREE.ShaderMaterial | null = null;
  private readonly outlineColor = new THREE.Vector4(0.8, 1, 0.97, 1);
  private readonly outlineViewport = new THREE.Vector2(960, 540);
  private readonly outlineMeshes: THREE.Mesh[] = [];
  private readonly outlineSaved: (THREE.Material | THREE.Material[])[] = [];
  // ---- layout lights (halos on placeholder zones, the lantern's gutter)
  private readonly lights: LayoutLight[] = [];
  private readonly haloSpec = new HaloSpec();
  private haloCount = 0;
  private readonly textureIds: TextureId[];
  private readonly scratch = new THREE.Vector3();
  private muzzleOf: THREE.Object3D | null = null;
  private muzzleFound: THREE.Object3D | null = null;
  private readonly clearColor = new THREE.Color();
  private coverageTarget: THREE.WebGLRenderTarget | null = null;
  private warmUps = 0;
  private configured = false;
  private warming = false;
  private framesDrawn = 0;
  private readonly exteriorAt: (x: number, y: number, z: number) => boolean;

  constructor(private readonly ctx: GameContext, private readonly canvas: HTMLCanvasElement) {
    const manifest = ctx.data.manifest, layout = ctx.data.layout;
    for (const p of manifest.visibility.plugs) this.plugNodes.add(p.node);
    for (const [id, unit] of Object.entries(manifest.visibility.units)) if (manifest.assets[unit.asset]?.chunks) this.chunkIds.add(id);
    for (const def of Object.values(manifest.assets)) for (const n of def.drawnNodes ?? []) this.drawnNodes.add(n);
    for (const z of layout.zones) { if (z.kind === 'exterior') this.exteriorZones.add(z.id); this.zoneMood.set(z.id, z.mood); }
    this.textureIds = Object.keys(manifest.textures);
    this.materials = new MaterialFactory(ctx, this.shared);
    this.fx = new Vfx(ctx, this.shared, {
      pulseScale: () => this.moodCur[M_PULSE] as number,
      proven: (seconds) => { this.setMood('L5p', seconds); },
      high: () => this.ctx.quality.features.particleScale >= 1,
      additiveCap: () => this.ctx.quality.features.additiveOverdrawCap,
      bladeCards: () => this.ctx.quality.features.bladeCards,
    });
    this.vfx = this.fx;
    this.materials.bladeAt = (x, y, z) => this.fx.bladeAt(x, y, z);
    this.inst = new Instances(ctx, (x, y, z) => this.materials.moodOf(x, y, z), (m, g) => this.materials.instancedTwin(m, g));
    this.instances = this.inst;
    this.lamps = this.materials.lamps;
    this.feedback = new Feedback(ctx, this.fx, () => this.ctx.clock.simTime, (e, out) => this.muzzleSeen(e, out));
    this.exteriorAt = (x, y, z) => {
      const zone = this.ctx.data.zoneAt(x, y, z, this.ctx.world.residentSet);
      return zone !== null && this.exteriorZones.has(zone);
    };
    this.moodCur.set(MOODS.L1); this.moodFrom.set(MOODS.L1); this.moodTo.set(MOODS.L1);
    // the open air's fog is the Long Light's: constants, written once
    rgbOf(this.shared.uExtFogA.value, MOODS.L1, M_FOG_A); rgbOf(this.shared.uExtFogB.value, MOODS.L1, M_FOG_B);
    this.shared.uExtFog.value.x = MOODS.L1[M_DENSITY] as number;
    for (const m of layout.markers) this.addLayoutLight(m);
  }

  private addLayoutLight(m: LayoutMarker): void {
    if (m.type !== 'light') return;
    const kind = m.params.kind;
    if (kind !== 'practical' && kind !== 'strip' && kind !== 'lamp' && kind !== 'bore_glow' && kind !== 'hatch_glow') return;
    const zone = this.ctx.data.layout.zones.find((z) => z.id === (m as LayoutMarker & { zone?: ZoneId }).zone);
    if (!zone) return;
    const flag = typeof m.params.switchedBy === 'string' ? m.params.switchedBy : '';
    this.lights.push({ x: m.pos[0], y: m.pos[1], z: m.pos[2], zone: zone.id, kind, flicker: m.params.flicker === true, flag, env: this.ctx.data.manifest.zones[zone.id].env });
  }

  // ---- renderer -----------------------------------------------------------------------------------------------------
  /** Created on first use (core asks for it at boot to read the GPU's name). */
  get renderer(): THREE.WebGLRenderer {
    if (!this.gl) {
      this.contextMsaa = this.ctx.quality.tier === 'min';
      const r = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: this.contextMsaa, alpha: false, depth: true, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false,
      });
      r.setPixelRatio(1);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.info.autoReset = false;
      r.autoClear = false;
      r.shadowMap.enabled = false;
      r.shadowMap.type = THREE.PCFShadowMap;
      r.shadowMap.autoUpdate = true;
      // three reads every program's and shader's info log at first use when this is on (its default): synchronous calls
      // that wait for the driver's compile. Only a developer reads them (polish round 3, performance).
      r.debug.checkShaderErrors = this.ctx.flags.dev;
      this.gl = r;
    }
    return this.gl;
  }

  init(): void {
    const { ctx } = this;
    const r = this.renderer;
    // the grade chunk must be in place before any material compiles (the `min` tier compiles it into every material)
    this.post = new PostChain(r, ctx.scene.camera, this.shared);
    this.sky = new Sky(this.shared);
    ctx.scene.scene.add(this.sky.mesh);
    ctx.scene.scene.fog = new THREE.FogExp2(0xc9a592, 0.0058);
    const fx = this.fx;
    ctx.scene.fx.add(fx.decals.mesh, fx.ambient.points, fx.quads.mesh, fx.particles.mesh);
    // the sun of the High tier's one shadow map: always in the scene (a fixed light count), only ever seen by the overlay
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.name = 'keep_sun';
    sun.castShadow = false;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -SHADOW_HALF; sun.shadow.camera.right = SHADOW_HALF; sun.shadow.camera.top = SHADOW_HALF; sun.shadow.camera.bottom = -SHADOW_HALF;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.03;
    ctx.scene.scene.add(sun, sun.target);
    this.sun = sun;
    this.shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.55, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, fog: false });
    this.shadowMaterial.name = 'keep_shadow';
    this.outlineMaterial = new THREE.ShaderMaterial({
      name: 'keep_outline', uniforms: { uOutline: { value: this.outlineColor }, uViewport: { value: this.outlineViewport } },
      vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.outlineSkinned = this.outlineMaterial.clone();
    this.outlineSkinned.uniforms = this.outlineMaterial.uniforms;
    ctx.assets.setMaterialResolver((name, mesh, def) => this.material(name, mesh, def));
    const on = ctx.events;
    this.unsubscribe.push(on.on('quality/changed', () => { this.applyTier(); }));
    this.unsubscribe.push(on.on('world/built', () => { this.applyVisibility(); }));
    this.unsubscribe.push(on.on('options/changed', () => { this.readOptions(); }));
    this.unsubscribe.push(on.on('load/set', (e) => { if (e.stage === 'activated') this.syncTextures(); }));
    this.unsubscribe.push(on.on('game/state', (e) => {
      if (e.to === 'loading') this.fx.clearTransient(); else if (e.to === 'paused') this.fx.paused();
      // another place behind the loading screen or the title: nothing keeps the light of where it was
      if (e.to === 'loading' || e.to === 'title' || e.from === 'loading') this.materials.snapLights();
    }));
    this.unsubscribe.push(on.on('game/new_run', () => { this.newRun(); }));
    this.unsubscribe.push(on.on('player/respawned', () => { this.fx.clearTransient(); this.feedback.clearPickups(); this.trauma = 0; this.materials.snapLights(); }));
    this.feedback.subscribe();
    this.readOptions();
    this.applyTier();
    this.registerDebug();
  }
  start(): void { this.syncTextures(); }

  private newRun(): void {
    this.fx.clearTransient();
    this.feedback.clearPickups();
    this.fx.cancelRing();
    this.fx.standingLine(0, 0, 0, false);
    this.shared.uWrong.value.set(0, 0, -1e5, 0);
    this.trauma = 0;
    this.expMul = 1; this.expFrom = 1; this.expTo = 1; this.expT = 1;
    // the revolver opens the run in the light of the place, not easing out of the last place's (polish round 2)
    this.materials.snapLights();
  }
  private readOptions(): void {
    const o = this.ctx.options.value;
    this.screenShake = Math.max(0, Math.min(1, o.screenShake));
    this.reduceMotion = o.reduceMotion;
    this.reduceFlashes = o.reduceFlashes;
    this.fx.reduceFlashes = o.reduceFlashes;
    // flicker is a flash: steady strips with Reduce Flashes
    this.materials.uFlicker.value = o.reduceFlashes ? 0 : 1;
  }
  /** the shared textures the effects sample (again after a set was released and activated) */
  private syncTextures(): void {
    const a = this.ctx.assets;
    this.fx.setAtlas(a.isActive('tx_fx') ? a.texture('tx_fx') : null);
    this.shared.uNoise.value = a.isActive('tx_noise') ? a.texture('tx_noise') : null;
  }

  /** The tier's post chain, shadow map and feature switches (also a runtime switch: Low <-> High <-> min, no reload). */
  private applyTier(): void {
    const q = this.ctx.quality, f = q.features, r = this.renderer;
    let changed = false;
    if (this.post && (!this.configured || this.post.tier !== q.tier)) { changed = this.configured; this.post.configure(q.tier, f); this.configured = true; }
    this.materials.haloScale = f.haloScale;
    this.materials.uFresnel.value = f.enamelFresnel ? 1 : 0;
    this.fx.decals.gamma.value = f.composer ? 1 : 1 / 2.2;
    const shadow = f.sunShadowMap;
    if (shadow !== this.shadowOn) {
      this.shadowOn = shadow;
      r.shadowMap.enabled = shadow;
      r.shadowMap.autoUpdate = shadow;
      if (this.shadowMaterial) this.shadowMaterial.visible = shadow;
      if (this.sun) { this.sun.castShadow = shadow; if (!shadow && this.sun.shadow.map) { this.sun.shadow.map.dispose(); (this.sun.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null; } }
      // the skinned caster probe of the warm-up carries a bone texture: it goes with the shadow map
      if (!shadow && this.casterProbes) this.casterProbes.traverse((o) => { const sk = (o as THREE.SkinnedMesh).skeleton; if (sk && sk.boneTexture) { sk.boneTexture.dispose(); sk.boneTexture = null; } });
      this.applyVisibility();
    }
    this.appliedRatio = -1;
    this.applySize();
    // another tier compiles other programs (tone map inline or not, the shadow pass): all of them now, in one hitch
    if (changed && this.framesDrawn > 0) { this.releasePrograms(); void this.warmUp(); }
  }

  /**
   * A tier switch at run time: every program of the tier that was left is let go (three keeps a material's programs of
   * every tone-mapping and shadow configuration it has ever been drawn with until the material is disposed), so toggling
   * the quality option does not pile them up. Textures and geometries are not touched; warmUp compiles the new tier's.
   */
  private releasePrograms(): void {
    const seen = new Set<THREE.Material>();
    const take = (o: THREE.Object3D): void => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      if (Array.isArray(m)) for (const x of m) seen.add(x); else seen.add(m);
    };
    const roots = this.ctx.scene;
    roots.scene.traverse(take);
    roots.viewModel.traverse(take);
    take(this.fx.flashMesh);
    const assets = this.ctx.assets, defs = this.ctx.data.manifest.assets;
    for (const id of Object.keys(defs)) if (assets.isActive(id)) assets.get(id).scene.traverse(take);
    for (const m of this.materials.allMaterials()) seen.add(m);
    if (this.outlineMaterial) seen.add(this.outlineMaterial);
    if (this.outlineSkinned) seen.add(this.outlineSkinned);
    if (this.shadowMaterial) seen.add(this.shadowMaterial);
    if (this.post) seen.add(this.post.vignetteMaterial);
    for (const m of seen) m.dispose();
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    this.feedback.dispose();
    this.inst.dispose();
    this.fx.dispose();
    if (this.sky) { this.sky.mesh.removeFromParent(); this.sky.dispose(); }
    if (this.post) this.post.dispose();
    if (this.coverageTarget) this.coverageTarget.dispose();
    if (this.shadowMaterial) this.shadowMaterial.dispose();
    if (this.outlineMaterial) this.outlineMaterial.dispose();
    if (this.outlineSkinned) this.outlineSkinned.dispose();
    if (this.gl) this.gl.dispose();
  }

  material(blenderMaterialName: string, mesh: THREE.Mesh, def: AssetDef | null): THREE.Material {
    return this.materials.material(blenderMaterialName, mesh, def);
  }

  // ---- size ---------------------------------------------------------------------------------------------------------
  private applySize(): void {
    const r = this.renderer, ratio = this.ctx.quality.pixelRatio;
    this.appliedRatio = ratio;
    r.setPixelRatio(ratio);
    r.setSize(this.cssWidth, this.cssHeight, false);
    if (this.post) this.post.setSize(this.cssWidth, this.cssHeight);
    r.getDrawingBufferSize(this.bufferSize);
    const cam = this.ctx.scene.camera;
    cam.aspect = this.cssWidth / Math.max(1, this.cssHeight);
    cam.updateProjectionMatrix();
    const v = this.viewCamera;
    v.aspect = cam.aspect;
    v.updateProjectionMatrix();
    // anchored to the right: wider than 16:9, the gun keeps its distance from the right edge (in screen heights). At
    // narrower shapes it is left where the projection puts it: holding the distance there would carry it over the centre.
    const shift = Math.max(0, 1 - (16 / 9) / v.aspect);
    v.projectionMatrix.elements[8] = -shift;
    v.projectionMatrixInverse.copy(v.projectionMatrix).invert();
    this.outlineViewport.copy(this.bufferSize);
  }
  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(1, Math.floor(cssWidth)); this.cssHeight = Math.max(1, Math.floor(cssHeight));
    this.applySize();
  }

  // ---- moods --------------------------------------------------------------------------------------------------------
  setMood(mood: MoodId, seconds: number): void {
    this.mood = mood;
    this.retarget(this.effectiveMood(), seconds);
  }
  /** the bore's sub-volumes change the fog and the dynamic light without the world saying so */
  private effectiveMood(): MoodKey {
    if (this.mood !== 'L5') return this.mood;
    const p = this.ctx.player.eye;
    return moodAt(this.ctx.world.zone, 'L5', p.y - 1.65, p.z, this.shared.uWrong.value.x);
  }
  private retarget(key: MoodKey, seconds: number): void {
    if (key === this.moodKey && this.moodT >= 1) return;
    this.moodKey = key;
    this.moodFrom.set(this.moodCur);
    this.moodTo.set(MOODS[key]);
    this.moodSeconds = seconds;
    this.moodT = seconds > 0 ? 0 : 1;
    if (seconds <= 0) this.moodCur.set(this.moodTo);
    this.materials.fallbackMood = key;
  }
  setExposure(multiplier: number, seconds: number): void {
    this.expFrom = this.expMul; this.expTo = multiplier; this.expSeconds = seconds; this.expT = seconds > 0 ? 0 : 1;
    if (seconds <= 0) this.expMul = multiplier;
  }
  setLightLayer(texture: TextureId, weight: number, seconds: number): void { this.materials.setLightLayer(texture, weight, seconds); }
  setWrongFade(value: number): void {
    const v = value <= 0 ? 0 : value >= 1 ? 1 : value;
    this.fx.cancelRing();
    this.shared.uWrong.value.set(v, 0, v >= 1 ? 1e5 : -1e5, 0);
    const boss = this.ctx.data.layout.markers.find((m) => m.id === 'sp_windlass');
    if (boss) this.fx.standingLine(boss.pos[0], boss.pos[1], boss.pos[2], v >= 1);
  }
  setEmissive(object: THREE.Object3D, scale: number): void { this.materials.setEmissive(object, scale); }
  addTrauma(amount: number): void { this.trauma = Math.min(1, Math.max(0, this.trauma + amount)); }
  setOutline(object: THREE.Object3D | null): void { this.outlineTarget = object; }
  setSky(ruleLeanDeg: number, threadVisible: boolean): void {
    if (this.sky) this.sky.setLean(ruleLeanDeg);
    this.threadVisible = threadVisible;
    if (threadVisible) {
      // the thread rises from the town card's socket (world coordinates; the manifest's place until the node is found)
      const out = this.sky ? this.sky.thread : null;
      if (!out) return;
      const def = this.ctx.data.manifest.assets.rim_town_card;
      const at = def?.nodePos?.socket_thread;
      let found = false;
      const card = this.ctx.scene.world.getObjectByName('rim_town_card');
      if (card) {
        card.traverse((o) => { if (!found && (o.name === 'socket_thread' || o.userData.name === 'socket_thread')) { o.getWorldPosition(this.scratch); found = true; } });
      }
      if (found) out.set(this.scratch.x, this.scratch.y, this.scratch.z, 1);
      else if (at) out.set(at[0], at[1], at[2], 1);
      else {
        const vista = this.ctx.data.layout.markers.find((m) => m.id === 'vista_plenty');
        const t = vista && Array.isArray(vista.params.target) ? (vista.params.target as number[]) : [-60, 4, 0];
        out.set(t[0] ?? -60, t[1] ?? 4, t[2] ?? 0, 1);
      }
    } else if (this.sky) this.sky.thread.w = 0;
  }

  /** Mood cross-fade, exposure ramp, fog of the place, grade: into the shared uniforms. `dt` is clock time. */
  private updateAtmosphere(dt: number): void {
    const s = this.shared, cur = this.moodCur, ctx = this.ctx;
    // the bore's sub-volumes
    if (this.mood === 'L5') { const key = this.effectiveMood(); if (key !== this.moodKey) this.retarget(key, DEFAULT_MOOD_FADE); }
    if (this.moodT < 1) {
      this.moodT = this.moodSeconds > 0 ? Math.min(1, this.moodT + dt / this.moodSeconds) : 1;
      lerpMood(cur, this.moodFrom, this.moodTo, smoothstep01(this.moodT));
    }
    if (this.expT < 1) {
      this.expT = this.expSeconds > 0 ? Math.min(1, this.expT + dt / this.expSeconds) : 1;
      this.expMul = this.expFrom + (this.expTo - this.expFrom) * smoothstep01(this.expT);
    }
    // fog
    rgbOf(s.uFogColA.value, cur, M_FOG_A);
    rgbOf(s.uFogColB.value, cur, M_FOG_B);
    s.uFogMix.value.x = cur[M_FOG_MIX_SUN] as number; s.uFogMix.value.y = cur[M_FOG_MIX_DIST] as number;
    s.uFogDensity.value = this.overFog >= 0 ? this.overFog : (cur[M_DENSITY] as number);
    xyzOf(s.uSunDir.value, cur, M_SUN_DIR);
    // the open air seen from inside (the yard through the Tally House doorway): exterior things and the sky keep the
    // Long Light's fog and sky while an exterior zone is drawn under an interior mood. Not divided by the room's
    // exposure: out there is the over-exposed part of the frame.
    const outW = this.exteriorDrawn ? 1 - (cur[M_SKY] as number) : 0;
    this.outside = outW;
    s.uExtFog.value.y = outW;
    s.uViewportH.value = this.bufferSize.y;
    // the height term stands on the ground of the place: the player's feet outdoors, the kerb top in the chamber
    const eye = ctx.player.eye;
    // the place she stands in, from the layout (a sandbox room above the level is in no zone and takes the mood's own)
    const feetY = eye.y - 1.65;
    const zone = ctx.state.current !== 'boot' ? ctx.data.zoneAt(eye.x, feetY, eye.z, ctx.world.residentSet) : null;
    this.zoneNow = zone;
    // the gully's dust belongs to the Long Light: under the overhang (L0) the mood's own 0 holds, so the rock frame stays dark
    const cellExtra = zone !== null && this.moodKey === 'L1' ? cellHeightExtra(zone, zone === ctx.world.zone ? ctx.world.cell : '') : -1;
    const targetExtra = this.overHeight >= 0 ? this.overHeight : cellExtra >= 0 ? cellExtra : (cur[M_HEIGHT_EXTRA] as number);
    const targetBase = this.moodKey === 'L5' ? BORE_KERB_TOP_Y : feetY;
    const k = Math.min(1, dt / 1.5);
    this.heightExtra += (targetExtra - this.heightExtra) * k;
    this.fogBase += (targetBase - this.fogBase) * Math.min(1, dt / 0.5);
    if (Math.abs(targetBase - this.fogBase) > 12) this.fogBase = targetBase;       // a ride or a warp: no slow drift
    const fh = s.uFogHeight.value;
    fh.x = this.fogBase; fh.y = cur[M_HEIGHT_FALLOFF] as number; fh.z = this.overHeight >= 0 ? this.overHeight : this.heightExtra;
    // cloud shadow: world space, 0.6 m/s toward the south-east
    const t = s.uTime.value, scale = s.uCloud.value.z;
    s.uCloud.value.x = -0.4243 * t * scale; s.uCloud.value.y = -0.4243 * t * scale; s.uCloud.value.w = cur[M_CLOUD] as number;
    // dynamic light of the current mood
    const dyn = s.uDynFlat.value;
    dyn.r = (cur[M_AMBIENT] as number) + 0.5 * (cur[M_KEY] as number); dyn.g = (cur[M_AMBIENT + 1] as number) + 0.5 * (cur[M_KEY + 1] as number); dyn.b = (cur[M_AMBIENT + 2] as number) + 0.5 * (cur[M_KEY + 2] as number);
    rgbOf(s.uPlaceLight.value, cur, M_PLACE);
    xyzOf(s.uKeyDir.value, cur, M_KEY_DIR);
    rgbOf(s.uSkyCol.value, cur, M_MID);
    // grade
    const ga = s.uGradeA.value, gb = s.uGradeB.value;
    if (this.overIdentity) { ga.x = 1; ga.y = 1; ga.z = 1; ga.w = 1; gb.x = 0; gb.y = 0; gb.z = 0; gb.w = 1; } else {
      ga.x = cur[M_TINT] as number; ga.y = cur[M_TINT + 1] as number; ga.z = cur[M_TINT + 2] as number; ga.w = cur[M_SATURATION] as number;
      gb.x = cur[M_LIFT] as number; gb.y = cur[M_LIFT + 1] as number; gb.z = cur[M_LIFT + 2] as number; gb.w = cur[M_CONTRAST] as number;
    }
    this.exposure = this.overExposure >= 0 ? this.overExposure : (cur[M_EXPOSURE] as number) * this.expMul;
    const post = this.post;
    if (post) {
      post.vignette.value.z = this.overVignette >= 0 ? this.overVignette : this.overIdentity ? 0 : (cur[M_VIGNETTE] as number);
      post.grainAmount = this.overGrain >= 0 ? this.overGrain : 0.035;
      // High: the mood's own bloom (an identity override measures the tone map: the plain one)
      post.bloomThreshold = this.overIdentity ? BLOOM_T_DEFAULT : (cur[M_BLOOM_T] as number);
      post.bloomIntensity = this.overIdentity ? BLOOM_K_DEFAULT : (cur[M_BLOOM_K] as number);
      post.bloomKnee = this.overIdentity ? 0 : (cur[M_BLOOM_S] as number);
      // the contact shade is a thing of rooms: under a sky it is held to AO_SKY of itself (on sunlit rock its stipple showed)
      post.aoK.value.y = AO_INTENSITY * (1 - (1 - AO_SKY) * (cur[M_SKY] as number));
      post.applyGrain();
    }
    // High (underground look, polish round 5): the sheen of the station's glaze eases to the mood's (moods.ts SHEEN), and a
    // dense lamp set (the Windlass's gauge) is held just over the mood's bloom threshold instead of EMISSIVE_HDR over
    // white: x (1 + (hdr - 1) x) of its lamp value is DENSE_OVER of the threshold on display (materials.ts EMIS_FRAG)
    {
      const bloom = ctx.quality.features.bloom && post !== null && !this.overIdentity;
      const sheen = bloom ? SHEEN[this.moodKey] ?? 0 : 0;
      s.uSheen.value += (sheen - s.uSheen.value) * Math.min(1, dt / 0.6);
      if (s.uSheen.value < 1e-3 && sheen === 0) s.uSheen.value = 0;
      let hold = 1;
      if (bloom && post) {
        const level = Math.max(post.bloomThreshold * DENSE_OVER, DENSE_MIN) / Math.max(this.exposure, 1e-3) / DENSE_LUMA, h = EMISSIVE_HDR - 1;
        hold = Math.min(1, h > 1e-3 ? (Math.sqrt(1 + 4 * h * level) - 1) / (2 * h) : level);
      }
      this.materials.denseHold = Math.round(hold * 64) / 64;
    }
    // sky
    const sky = this.sky;
    if (sky) {
      rgbOf(sky.zenith, cur, M_ZENITH);
      rgbOf(sky.mid, cur, M_MID);
      rgbOf(sky.glow, cur, M_GLOW);
      rgbOf(sky.sunCol, cur, M_SUN_COL);
      sky.shape.x = cur[M_MID_SIN] as number; sky.shape.y = cur[M_SKY] as number; sky.shape.z = (cur[M_SUN_DISC] as number) * (cur[M_SKY] as number); sky.shape.w = 1;
      const w = this.outside;
      if (w > 0) {
        // the sky through a doorway: the Long Light's, not the room's fog colour
        const l1 = MOODS.L1;
        sky.zenith.r += ((l1[M_ZENITH] as number) - sky.zenith.r) * w; sky.zenith.g += ((l1[M_ZENITH + 1] as number) - sky.zenith.g) * w; sky.zenith.b += ((l1[M_ZENITH + 2] as number) - sky.zenith.b) * w;
        sky.mid.r += ((l1[M_MID] as number) - sky.mid.r) * w; sky.mid.g += ((l1[M_MID + 1] as number) - sky.mid.g) * w; sky.mid.b += ((l1[M_MID + 2] as number) - sky.mid.b) * w;
        sky.glow.r += ((l1[M_GLOW] as number) - sky.glow.r) * w; sky.glow.g += ((l1[M_GLOW + 1] as number) - sky.glow.g) * w; sky.glow.b += ((l1[M_GLOW + 2] as number) - sky.glow.b) * w;
        sky.shape.x += ((l1[M_MID_SIN] as number) - sky.shape.x) * w; sky.shape.y += (1 - sky.shape.y) * w;
      }
      sky.rule.w = cur[M_RULE] as number;
      sky.thread.w = this.threadVisible ? (cur[M_SKY] as number) : 0;
    }
    // what a material that is not ours sees: three's own fog, near enough
    const fog = ctx.scene.scene.fog as THREE.FogExp2 | null;
    if (fog) { fog.color.r = s.uFogColA.value.r; fog.color.g = s.uFogColA.value.g; fog.color.b = s.uFogColA.value.b; fog.density = s.uFogDensity.value * 1.2; }
    // particles take the mood's flat light, held inside the displayable range; decals take the light of their surface
    const lit = this.fx.particles.lit.value, d = s.uDynFlat.value;
    lit.r = Math.min(1.3, d.r * 1.25); lit.g = Math.min(1.3, d.g * 1.25); lit.b = Math.min(1.3, d.b * 1.25);
    this.fx.ambient.lit.value.copy(lit);
    // a burst keeps some of its own hue under a strongly coloured light (dust in the aqua moods read as green smudges):
    // 30 % of its light is neutral, at the mood's own brightness
    const top = Math.min(1, Math.max(lit.r, lit.g, lit.b) * LIT_NEUTRAL_GAIN);
    lit.r = lit.r * (1 - LIT_NEUTRAL) + top * LIT_NEUTRAL; lit.g = lit.g * (1 - LIT_NEUTRAL) + top * LIT_NEUTRAL; lit.b = lit.b * (1 - LIT_NEUTRAL) + top * LIT_NEUTRAL;
  }

  // ---- frame --------------------------------------------------------------------------------------------------------
  lateUpdate(_frameDt: number, alpha: number): void {
    const ctx = this.ctx, clock = ctx.clock;
    if (this.appliedRatio !== ctx.quality.pixelRatio) this.applySize();
    // time advances by the clock, so a frame drawn twice at one tick is the same frame
    const now = clock.unscaledTime;
    // the game's own time since the last drawn frame (it stands still while paused). Not capped at a quarter second as
    // in round 1: a mood ramp, a light layer or the glare then advanced by drawn FRAMES, and wherever frames are rare
    // (every scripted run; a stalled tab) the 20 s glare was still on a minute later.
    const dt = this.lastClock < 0 ? 0 : Math.max(0, Math.min(60, now - this.lastClock));
    this.lastClock = now;
    const sim = clock.simTime - (1 - alpha) * FIXED_DT * clock.timeScale;
    this.shared.uTime.value = sim;
    this.updateAtmosphere(dt);
    this.materials.beginFrame(dt);
    // a warp (a debug jump, a ride's teleport, a restore): the camera is somewhere else, and so is every light
    const cp = ctx.scene.camera.position, lc = this.lastCam;
    if ((cp.x - lc.x) * (cp.x - lc.x) + (cp.y - lc.y) * (cp.y - lc.y) + (cp.z - lc.z) * (cp.z - lc.z) > 64) this.materials.snapLights();
    lc.copy(cp);
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    const cam = ctx.scene.camera;
    this.fx.update(dt, this.bufferSize.x, this.bufferSize.y, this.exposure, cam.quaternion);
    // ambient points: sand along the wind outdoors by day, motes in the blades indoors
    const high = ctx.quality.features.particleScale >= 1;
    const blades = this.fx.activeBlades();
    if (blades > 0) this.fx.ambient.set('motes', high ? 600 : 120);
    else if ((this.moodKey === 'L1' || this.moodKey === 'L0') && this.zoneNow !== null && this.exteriorZones.has(this.zoneNow)) {
      const gv = this.fx.ambient.ground.value;
      gv.x = ctx.player.eye.y - 1.65; gv.y = this.reduceMotion ? 0.5 : 1;
      this.fx.ambient.set('sand', high ? 400 : 200);
    } else this.fx.ambient.set('off', 0);
    // the quad batch: blobs, rings, cards, lines, then the halos of whatever emissive was drawn last frame
    const q = this.fx.quads;
    q.begin();
    this.fx.fillQuads(this.shadowOn, this.exteriorAt);
    this.haloCount = this.materials.emitHalos(q, this.shared.uWrong.value.x) + this.layoutHalos(sim) + this.inst.emitGlow(q);
    q.end();
    this.inst.update();
    this.feedback.update(this.visibleZones.has('the_bore'));
    this.updateOutline(sim);
    if (this.shadowOn) this.updateSun();
  }

  /**
   * Halos the layout asks for: the lantern and the embers always (they gutter: +-15 % at 7 to 9 Hz, never in the bake);
   * the strips, lamps and glows of a zone only while its GLB is a placeholder (final art carries emissive meshes, whose
   * halos come from the pool by themselves).
   */
  private layoutHalos(now: number): number {
    const lights = this.lights, ctx = this.ctx, q = this.fx.quads, h = this.haloSpec;
    const wrong = this.shared.uWrong.value.x;
    let n = 0;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i] as LayoutLight;
      if (!this.visibleZones.has(l.zone)) continue;
      h.x = l.x; h.y = l.y; h.z = l.z;
      if (l.kind === 'practical') {
        const gutter = this.reduceFlashes ? 1 : 1 + 0.10 * Math.sin(now * 6.2831853 * 7.3 + i) + 0.05 * Math.sin(now * 6.2831853 * 8.9 + i * 2.1);
        h.y = l.y + 0.12; h.size = 0.7; h.alpha = 0.5 * gutter;   // polish round 3: 0.9, a soft disc in front of the lantern
        writeHalo(q, h, HUE.flame);
        h.size = 0.22; h.alpha = 0.9 * gutter;
        writeHalo(q, h, HUE.flameCore);
        n += 2;
        continue;
      }
      if (!ctx.assets.isActive(l.env) || !ctx.assets.get(l.env).isPlaceholder) continue;
      if (l.flag !== '' && !ctx.world.flag(l.flag)) continue;
      if (l.kind === 'bore_glow') {
        h.y = l.y + 0.6; h.size = 9; h.alpha = 0.55;
        writeHalo(q, h, wrong > 0.5 ? HUE.aqua : HUE.violet);
      } else if (l.kind === 'hatch_glow') {
        h.y = l.y + 0.3; h.size = 4.5; h.alpha = 0.35;
        writeHalo(q, h, HUE.aqua);
      } else {
        let a = 0.5;
        if (l.flicker && !this.reduceFlashes) { const bucket = Math.floor(now * 9) + i * 7; const r = Math.sin(bucket * 12.9898) * 43758.5453; a *= (r - Math.floor(r)) > 0.3 ? 1 : 0.35; }
        h.size = l.kind === 'strip' ? 2.2 : 1.4; h.alpha = a;
        writeHalo(q, h, HUE.aqua);
        h.size = 0.45; h.alpha = a * 1.6;
        writeHalo(q, h, HUE.aquaCore);
        n++;
      }
      n++;
    }
    return n;
  }

  private updateOutline(now: number): void {
    // a 2 px aqua-white outline pulsing at 1 Hz
    const pulse = 0.55 + 0.45 * Math.sin(now * 6.2831853);
    const oc = this.outlineColor;
    oc.x = HUE.aquaCore.r; oc.y = HUE.aquaCore.g; oc.z = HUE.aquaCore.b; oc.w = this.reduceFlashes ? 0.7 : pulse;
  }
  private drawOutline(): void {
    const target = this.outlineTarget, mat = this.outlineMaterial;
    if (!target || !mat || target.parent === null) return;
    const meshes = this.outlineMeshes, saved = this.outlineSaved;
    meshes.length = 0; saved.length = 0;
    this.collectOutline(target);
    if (meshes.length === 0) return;
    const skinned = this.outlineSkinned ?? mat;
    for (let i = 0; i < meshes.length; i++) { const m = meshes[i] as THREE.Mesh; saved.push(m.material); m.material = (m as THREE.SkinnedMesh).isSkinnedMesh ? skinned : mat; }
    this.renderer.render(target, this.ctx.scene.camera);
    for (let i = 0; i < meshes.length; i++) (meshes[i] as THREE.Mesh).material = saved[i] as THREE.Material;
  }
  private collectOutline(o: THREE.Object3D): void {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && this.outlineMeshes.length < MAX_OUTLINE_MESHES && mesh.geometry.getAttribute('normal') !== undefined && (mesh as unknown as THREE.InstancedMesh).isInstancedMesh !== true) this.outlineMeshes.push(mesh);
    const kids = o.children;
    for (let i = 0; i < kids.length; i++) this.collectOutline(kids[i] as THREE.Object3D);
  }

  /** the shadow camera follows the player, snapped to its own texels so the shadow does not crawl */
  private updateSun(): void {
    const sun = this.sun;
    if (!sun) return;
    const outside = this.zoneNow !== null && this.exteriorZones.has(this.zoneNow) && (this.moodKey === 'L1' || this.moodKey === 'L0');
    // The sun casts for as long as the tier has the shadow map: three compiles every program by the number of shadow
    // casting lights, and switching `castShadow` at a doorway linked every material's program again in the middle of
    // play (polish round 3, performance: 4 links on entering the Tally House, 8 at the stair). Indoors and in the blue
    // hour the shadow PASS stops instead, and the overlay that shows its map is not drawn.
    this.renderer.shadowMap.autoUpdate = outside;
    if (this.shadowMaterial) this.shadowMaterial.visible = outside;
    if (!outside) return;
    const p = this.ctx.player.eye, s = this.shared.uSunDir.value;
    const texel = (SHADOW_HALF * 2) / 1024;
    const x = Math.round(p.x / texel) * texel, y = Math.round((p.y - 1.65) / texel) * texel, z = Math.round(p.z / texel) * texel;
    sun.target.position.set(x, y, z);
    sun.position.set(x + s.x * 70, y + s.y * 70, z + s.z * 70);
    sun.target.updateMatrixWorld();
  }

  /** The view-model's `muzzle` node (design/assets.json), looked up once per attached instance; null without one. */
  private muzzleNode(): THREE.Object3D | null {
    const vm = this.ctx.scene.viewModel, first = vm.children.length > 0 ? vm.children[0] as THREE.Object3D : null;
    if (first !== this.muzzleOf) {
      this.muzzleOf = first;
      this.muzzleFound = first ? vm.getObjectByName('muzzle') ?? null : null;
    }
    return this.muzzleFound;
  }

  /**
   * The muzzle of a shot as the WORLD camera must be given it (polish round 5). `weapon/fired` carries the muzzle as a
   * camera-space point of the view-model pass put into the world; that pass has its own projection (40 degrees, and a
   * shift on shapes wider than 16:9), so the world camera drew the smoke and the tracer's start nearer the crosshair
   * than the barrel. The point is moved across the view so that both projections put it on the same pixel, at the same
   * depth. Camera axes are rebuilt from the shot's aim (the camera object holds the pose of the last drawn frame).
   */
  private muzzleSeen(e: Readonly<GameEvents['weapon/fired']>, out: { x: number; y: number; z: number }): boolean {
    // right = aim x up, upward = right x aim
    let rx = -e.dz, rz = e.dx;
    const rl = Math.hypot(rx, rz);
    if (!(rl > 1e-3)) return false;
    rx /= rl; rz /= rl;
    const ux = -rz * e.dy, uy = rz * e.dx - rx * e.dz, uz = rx * e.dy;
    const vx = e.mx - e.ox, vy = e.my - e.oy, vz = e.mz - e.oz;
    const depth = vx * e.dx + vy * e.dy + vz * e.dz;
    if (!(depth > 1e-3)) return false;
    const vp = this.viewCamera.projectionMatrix.elements, wp = this.ctx.scene.camera.projectionMatrix.elements;
    const w0 = wp[0] as number, w5 = wp[5] as number;
    if (!(w0 > 1e-6) || !(w5 > 1e-6)) return false;
    const x = (vx * rx + vz * rz) * (vp[0] as number) / w0 - (vp[8] as number) * depth / w0;
    const y = (vx * ux + vy * uy + vz * uz) * (vp[5] as number) / w5;
    out.x = e.ox + e.dx * depth + rx * x + ux * y;
    out.y = e.oy + e.dy * depth + uy * y;
    out.z = e.oz + e.dz * depth + rz * x + uz * y;
    return true;
  }

  /** Camera space -> world: the group takes the world camera's pose, and the 52 degree camera stands where it does. */
  private poseViewModel(): void {
    const roots = this.ctx.scene, vm = roots.viewModel, cam = roots.camera;
    cam.updateMatrixWorld(true);
    vm.matrixAutoUpdate = false;
    vm.matrix.copy(cam.matrixWorld);
    vm.matrixWorldNeedsUpdate = true;
    vm.updateMatrixWorld(true);
    const v = this.viewCamera;
    v.matrixAutoUpdate = false;
    v.matrix.copy(cam.matrixWorld);
    v.matrixWorld.copy(cam.matrixWorld);
    v.matrixWorldInverse.copy(cam.matrixWorld).invert();
  }

  render(_frameDt: number, _alpha: number): void {
    const r = this.renderer, roots = this.ctx.scene, post = this.post as PostChain, cam = roots.camera;
    if (this.appliedRatio !== this.ctx.quality.pixelRatio) this.applySize();
    // what the materials read: the shared block and the sky's, packed from the values lateUpdate and the callers left
    this.shared.pack();
    if (this.sky) this.sky.pack(this.exposure);
    r.info.reset();
    // rotational shake, applied to the camera for this draw only: the player's aim is not touched
    this.shaking = false;
    if (this.trauma > 0.001 && !this.reduceMotion && this.screenShake > 0) {
      const t = this.shared.uTime.value, k = this.trauma * this.trauma * this.screenShake;
      this.savedQuat.copy(cam.quaternion);
      const e = this.shakeEuler;
      e.x = SHAKE_PITCH * k * (Math.sin(t * 43.7) * 0.6 + Math.sin(t * 71.3 + 1.7) * 0.4);
      e.y = SHAKE_YAW * k * (Math.sin(t * 39.1 + 0.9) * 0.6 + Math.sin(t * 67.9 + 2.3) * 0.4);
      e.z = SHAKE_ROLL * k * (Math.sin(t * 31.3 + 2.1) * 0.6 + Math.sin(t * 59.7 + 0.4) * 0.4);
      cam.quaternion.multiply(this.shakeQuat.setFromEuler(this.shakeEuler));
      this.shaking = true;
    }
    const target = post.sceneTarget;
    // the warm-up frame compiles and uploads everything but may not be seen: it is cut down to one pixel
    if (target) { target.scissorTest = this.warming; target.scissor.set(0, 0, this.warming ? 1 : target.width, this.warming ? 1 : target.height); }
    r.setScissor(0, 0, this.warming ? 1 : this.cssWidth, this.warming ? 1 : this.cssHeight);
    r.setScissorTest(this.warming);
    r.setRenderTarget(target);
    // the clear colour is the fog's; three is told only when it changed (its setter boxes what it reads)
    const fog = this.shared.uFogColA.value, cc = this.clearColor;
    if (cc.r !== fog.r || cc.g !== fog.g || cc.b !== fog.b || this.framesDrawn === 0) {
      cc.r = fog.r; cc.g = fog.g; cc.b = fog.b;
      r.setClearColor(cc, 1);
    }
    r.clear(true, true, false);
    const hasViewModel = roots.viewModel.children.length > 0;
    roots.viewModel.visible = false;
    quietSort(r, roots.scene);
    r.render(roots.scene, cam);
    if (this.outlineTarget) this.drawOutline();
    const flash = this.fx.flashMesh;
    if (hasViewModel || flash.visible) {
      // second pass: its own 52 degree projection over a cleared depth range; the group's children are in camera space
      this.poseViewModel();
      // High keeps the world's depth for the contact shade (post.ts): the view-model then goes into the nearest slice of
      // the depth range, in front of everything, instead of over a cleared depth
      const gl = post.keepsDepth ? r.getContext() : null;
      if (gl) gl.depthRange(0, VM_DEPTH_RANGE); else r.clearDepth();
      if (hasViewModel) {
        roots.viewModel.visible = true;
        r.render(roots.viewModel, this.viewCamera);
      }
      if (flash.visible) {
        // the sprite rides the muzzle as this frame draws it (the kick, the camera's recoil and the shake included)
        this.fx.rideMuzzle(this.muzzleNode(), this.viewCamera.matrixWorld);
        r.render(flash, this.viewCamera);
      }
      if (gl) gl.depthRange(0, 1);
    }
    post.finish(FIXED_DT, this.ctx.clock.tick, this.exposure);
    if (this.shaking) { cam.quaternion.copy(this.savedQuat); cam.updateMatrixWorld(true); }
    if (!this.warming) this.fx.frameDrawn();
    this.framesDrawn++;
  }

  capture(): string {
    this.render(0, 1);
    return this.canvas.toDataURL('image/png');
  }

  collectStats(out: PerfStats): void {
    const r = this.renderer, info = r.info;
    out.drawCalls = info.render.calls;
    out.triangles = info.render.triangles;
    out.points = info.render.points;
    out.lines = info.render.lines;
    out.programs = info.programs ? info.programs.length : 0;
    out.geometries = info.memory.geometries;
    out.textures = info.memory.textures;
    out.width = r.domElement.width;
    out.height = r.domElement.height;
    // the manifest's gpuBytes of every active texture (x4 for a one-channel texture that had to be uploaded as RGBA8),
    // plus the bone textures of the skinned things alive
    let bytes = 0;
    const assets = this.ctx.assets, ids = this.textureIds, defs = this.ctx.data.manifest.textures;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] as string;
      if (!assets.isActive(id)) continue;
      const def = defs[id];
      if (!def) continue;
      bytes += def.format === 'r8' && assets.texture(id).format !== THREE.RedFormat ? def.gpuBytes * 4 : def.gpuBytes;
    }
    out.textureBytes = bytes + out.enemiesAlive * 16384;
    const tier = this.ctx.data.manifest.tiers[this.ctx.quality.tier];
    out.renderTargetBytes = this.post ? this.post.renderTargetBytes(tier, this.contextMsaa, this.shadowOn ? SHADOW_MAP_BYTES : 0) : 0;
    out.visibleZones = this.visibleZoneCount;
    out.instances = this.inst.count;
    out.particles = this.fx.particles.alive();
    out.decals = this.fx.decals.alive;
  }

  // ---- warm-up, benchmark ---------------------------------------------------------------------------------------------
  /**
   * Compiles every program the active set can need and draws one hidden frame with every zone visible, so no program
   * compiles during play: the scene as it is, every active asset's template (skinned and plain), an instanced twin of
   * every instanced asset, the effect batches, the outline, the post chain.
   */
  warmUp(): Promise<void> {
    const r = this.renderer, roots = this.ctx.scene, post = this.post as PostChain;
    this.warmUps++;
    this.syncTextures();
    const hidden: THREE.Object3D[] = [];
    roots.world.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    roots.fx.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const prevTarget = r.getRenderTarget();
    r.setRenderTarget(post.sceneTarget);
    let pending: Promise<unknown> | null = null;
    try {
      const assets = this.ctx.assets, defs = this.ctx.data.manifest.assets;
      const twins: THREE.InstancedMesh[] = [];
      const white = new THREE.Color(1, 1, 1);
      for (const id of Object.keys(defs)) {
        if (!assets.isActive(id)) continue;
        const loaded = assets.get(id);
        r.compile(loaded.scene, roots.camera, roots.scene);
        if (!(defs[id] as AssetDef).instanced) continue;
        loaded.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
          const twin = new THREE.InstancedMesh(mesh.geometry, Array.isArray(mesh.material) ? mesh.material.map((x) => this.materials.instancedTwin(x, mesh.geometry)) : this.materials.instancedTwin(mesh.material, mesh.geometry), 1);
          twin.setColorAt(0, white);
          twins.push(twin);
        });
      }
      const group = new THREE.Group();
      for (const t of twins) group.add(t);
      if (twins.length) r.compile(group, roots.camera, roots.scene);
      for (const t of twins) t.dispose();
      // drawn on their own (not inside the scene): compiled the same way, so their programs match
      if (this.outlineMaterial) {
        const probe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), this.outlineMaterial);
        r.compile(probe, roots.camera);
        probe.geometry.dispose();
        // and on a skinned mesh of the active set, if there is one
        if (this.outlineSkinned) {
          let skinnedMesh: THREE.SkinnedMesh | null = null;
          roots.dynamic.traverse((o) => { if (!skinnedMesh && (o as THREE.SkinnedMesh).isSkinnedMesh) skinnedMesh = o as THREE.SkinnedMesh; });
          const sm = skinnedMesh as THREE.SkinnedMesh | null;
          if (sm) { const keep = sm.material; sm.material = this.outlineSkinned; r.compile(sm, roots.camera); sm.material = keep; }
        }
      }
      // every program of the whole stage, from the recipes of a playthrough (prewarm.ts): the sets that are not here yet
      const probes = new THREE.Group();
      for (const p of this.materials.prewarm(PREWARM)) probes.add(p);
      if (probes.children.length) r.compile(probes, roots.camera, roots.scene);
      probes.clear();
      r.compile(this.fx.flashMesh, this.viewCamera);
      roots.viewModel.visible = true;
      r.compile(roots.viewModel, this.viewCamera);
      pending = r.compileAsync(roots.scene, roots.camera);
      // the hidden frame: buffers upload, the post chain compiles
      this.lateUpdate(0, 1);
      for (const o of hidden) o.visible = true;
      this.warming = true;
      // High: the shadow pass runs in this frame whatever the place, over a plain, a skinned and an instanced caster, so
      // its three depth programs exist before the first enemy walks into the sun (they linked at ticks 691 and 1011)
      const casters = this.shadowOn ? this.shadowCasters() : null;
      if (casters) {
        r.shadowMap.autoUpdate = true;
        if (this.shadowMaterial) this.shadowMaterial.visible = true;
        if (this.sun) { casters.position.copy(this.sun.target.position); casters.updateMatrixWorld(true); }
        roots.scene.add(casters);
      }
      try { this.render(0, 1); } finally { if (casters) roots.scene.remove(casters); }
    } finally {
      this.warming = false;
      r.setScissorTest(false);
      for (const o of hidden) o.visible = false;
      r.setRenderTarget(prevTarget);
      // the effect batches go back to what their pools say
      this.lateUpdate(0, 1);
    }
    return pending ? pending.then(() => undefined, () => undefined) : Promise.resolve();
  }

  private casterProbes: THREE.Group | null = null;
  /** a plain, a skinned and an instanced shadow caster with the dynamic material of each kind (built once) */
  private shadowCasters(): THREE.Group {
    if (this.casterProbes) return this.casterProbes;
    const group = new THREE.Group();
    group.name = 'keep_caster_probes';
    for (const variant of ['', 'skin', 'inst'] as const) {
      const line = JSON.stringify({ c: 1, k: 'd', s: { name: 'm_prop', hasColor: true, textured: true, wind: false, breath: false, variant }, shape: `${variant === 'skin' ? 's' : variant === 'inst' ? 'i' : ''}|nu|4` });
      for (const p of this.materials.prewarm([line])) { p.castShadow = true; group.add(p); }
    }
    this.casterProbes = group;
    return group;
  }

  benchmark(): Promise<number> {
    const r = this.renderer;
    const passes = 8, rounds = 5;
    const rt = new THREE.WebGLRenderTarget(1280, 720, { depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uK: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform float uK; varying vec2 vUv; void main(){ vec3 c = vec3(0.0); for (int i = 0; i < 12; i++) { float f = float(i) + uK; c += 0.01 * vec3(sin(vUv.x * f * 7.0), cos(vUv.y * f * 5.0), sin((vUv.x + vUv.y) * f)); } gl_FragColor = vec4(c, 0.1); }',
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const px = new Uint8Array(4);
    const prev = r.getRenderTarget();
    const samples: number[] = [];
    for (let round = 0; round < rounds + 1; round++) {
      r.setRenderTarget(rt);
      const t0 = performance.now();
      for (let i = 0; i < passes; i++) { (mat.uniforms.uK as { value: number }).value = i + round; r.render(mesh, cam); }
      r.readRenderTargetPixels(rt, 0, 0, 1, 1, px);            // gl.finish() does not block in Chromium: sync with a read
      if (round > 0) samples.push((performance.now() - t0) / passes);
    }
    r.setRenderTarget(prev);
    rt.dispose(); mat.dispose(); geo.dispose();
    samples.sort((a, b) => a - b);
    return Promise.resolve(samples[samples.length >> 1] ?? 0);
  }

  // ---- visibility ---------------------------------------------------------------------------------------------------
  setVisible(units: readonly string[]): void {
    this.visibleUnits.clear();
    for (let i = 0; i < units.length; i++) this.visibleUnits.add(units[i] as string);
    this.applyVisibility();
  }
  /**
   * World decides what is drawn. Chunk meshes are `<chunk id>__<material>`; a zone's drawn nodes follow its chunks; plugs
   * are listed by name; chunkless world-space assets are units by their id. EVERY OTHER MESH of a zone GLB is never drawn
   * (collider_terrain would z-fight the whole gully).
   */
  private applyVisibility(): void {
    const world = this.ctx.scene.world, units = this.visibleUnits;
    this.visibleZones.clear();
    for (let i = 0; i < world.children.length; i++) {
      const top = world.children[i] as THREE.Object3D;
      const isZone = this.ctx.data.manifest.zones[top.name as ZoneId] !== undefined;
      if (!isZone) { top.visible = units.has(top.name); continue; }
      top.visible = true;
      const any = this.showChunks(top, this.exteriorZones.has(top.name));
      this.showNodes(top, any);
      if (any) this.visibleZones.add(top.name);
    }
    this.visibleZoneCount = this.visibleZones.size;
    let ext = false;
    for (const z of this.visibleZones) if (this.exteriorZones.has(z)) { ext = true; break; }
    this.exteriorDrawn = ext;
  }
  private chunkOf(o: THREE.Object3D): string {
    const cut = o.name.indexOf('__');
    if (cut <= 0) return '';
    const id = o.name.slice(0, cut);
    return this.chunkIds.has(id) ? id : '';
  }
  private showChunks(parent: THREE.Object3D, exterior: boolean): boolean {
    let any = false;
    for (let i = 0; i < parent.children.length; i++) {
      const o = parent.children[i] as THREE.Object3D;
      const chunk = this.chunkOf(o);
      if (chunk !== '') {
        o.visible = this.visibleUnits.has(chunk);
        if (o.visible) any = true;
        if (exterior) this.shadowOverlay(o);
      } else if (o.name !== 'keep_shadow' && this.showChunks(o, exterior)) any = true;
    }
    return any;
  }
  /** High: the ground chunks of exterior zones get a ShadowMaterial twin (the baked world itself receives nothing) */
  private shadowOverlay(chunk: THREE.Object3D): void {
    const mesh = chunk as THREE.Mesh;
    if (!mesh.isMesh || (mesh.material as THREE.Material).name !== 'm_sand') return;
    let overlay: THREE.Object3D | undefined;
    for (let i = 0; i < mesh.children.length; i++) if ((mesh.children[i] as THREE.Object3D).name === 'keep_shadow') overlay = mesh.children[i];
    if (!this.shadowOn) { if (overlay) overlay.visible = false; return; }
    if (!overlay && this.shadowMaterial) {
      const twin = new THREE.Mesh(mesh.geometry, this.shadowMaterial);
      twin.name = 'keep_shadow';
      twin.receiveShadow = true;
      twin.matrixAutoUpdate = false;
      twin.renderOrder = 2;
      mesh.add(twin);
      overlay = twin;
    }
    if (overlay) overlay.visible = true;
  }
  private showNodes(parent: THREE.Object3D, zoneDrawn: boolean): void {
    for (let i = 0; i < parent.children.length; i++) {
      const o = parent.children[i] as THREE.Object3D;
      if (this.chunkOf(o) !== '') continue;
      const name = typeof o.userData.name === 'string' ? (o.userData.name as string) : o.name;
      if (this.plugNodes.has(name)) o.visible = this.visibleUnits.has(name);
      else if (this.drawnNodes.has(name)) o.visible = zoneDrawn;
      else if ((o as THREE.Mesh).isMesh) o.visible = false;
      else this.showNodes(o, zoneDrawn);
    }
  }
  unitVisible(unit: string): boolean { return this.visibleUnits.has(unit); }
  zoneVisible(zone: ZoneId): boolean { return this.visibleZones.has(zone); }

  // ---- debug --------------------------------------------------------------------------------------------------------
  debugState(): DebugSnapshot {
    const c = this.fx.counts;
    return {
      system: 'render', tier: this.ctx.quality.tier, mood: this.mood, moodKey: this.moodKey, moodT: Math.round(this.moodT * 1e4) / 1e4,
      exposure: Math.round(this.exposure * 1e4) / 1e4, wrongFade: Math.round(this.shared.uWrong.value.x * 1e4) / 1e4,
      visibleUnits: Array.from(this.visibleUnits).sort(), visibleZones: Array.from(this.visibleZones).sort(),
      instances: this.inst.count, instancedSets: this.inst.setCount,
      particles: this.fx.particles.alive(), decals: this.fx.decals.alive, quads: this.fx.quads.count, halos: this.haloCount,
      bursts: c.bursts, lines: c.lines, rings: c.rings, flashes: c.flashes, pulses: c.pulses, decalsAsked: c.decals, provingRings: c.provingRings,
      quiet: c.quiet, capped: c.capped, additiveLoad: Math.round(this.fx.additiveLoad * 1e4) / 1e4, smokeLoad: Math.round(this.fx.smokeLoad * 1e4) / 1e4,
      trauma: Math.round(this.trauma * 1e4) / 1e4, fullScreenDraws: this.post ? this.post.fullScreenDraws : 0,
      pickups: this.feedback.livePickups, outline: this.outlineTarget ? this.outlineTarget.name : '',
      ruleLeanDeg: this.sky ? this.sky.leanDeg : 0, thread: this.threadVisible, warmUps: this.warmUps,
    };
  }

  private registerDebug(): void {
    const fn = <T extends unknown[], R>(f: (...args: T) => R): ((...args: never[]) => unknown) => f as unknown as (...args: never[]) => unknown;
    this.ctx.debug.register('render', {
      addInstances: fn((asset: string, node: string, count: number, x: number, y: number, z: number) => {
        const handles: number[] = [];
        for (let i = 0; i < count; i++) handles.push(this.instances.add(asset, node, x + i * 0.6, y, z, 0, 1));
        return handles;
      }),
      removeInstances: fn((handles: number[]) => { for (const h of handles) this.instances.remove(h); }),
      instanceLight: fn((h: number) => this.inst.lightOf(h)),
      unitVisible: fn((unit: string) => this.unitVisible(unit)),
      zoneVisible: fn((zone: ZoneId) => this.zoneVisible(zone)),
      /** the system itself, for page-side test code */
      system: fn(() => this),
      vfxIds: fn(() => VFX_IDS.slice()),
      /** { fog, height, exposure, grain, vignette, identity }: fixed values for display-target tests; a negative number or false gives the mood's back */
      override: fn((o: { fog?: number; exposure?: number; grain?: number; vignette?: number; identity?: boolean; height?: number }) => {
        if (o.height !== undefined) this.overHeight = o.height;
        if (o.fog !== undefined) this.overFog = o.fog;
        if (o.exposure !== undefined) this.overExposure = o.exposure;
        if (o.grain !== undefined) this.overGrain = o.grain;
        if (o.vignette !== undefined) this.overVignette = o.vignette;
        if (o.identity !== undefined) this.overIdentity = o.identity;
      }),
      /** the mood's numbers as they are now: fog colours, density, exposure, grade (linear) */
      mood: fn(() => ({ id: this.mood, key: this.moodKey, t: this.moodT, values: Array.from(this.moodCur), exposure: this.exposure, heightExtra: this.heightExtra, fogBase: this.fogBase })),
      setMoodKey: fn((key: string, seconds: number) => { if (isMoodKey(key)) { if (key !== 'L5a' && key !== 'L5c' && key !== 'L6c') this.mood = key; this.retarget(key, seconds); } }),
      programs: fn(() => (this.renderer.info.programs ? this.renderer.info.programs.length : 0)),
      /** every material x mesh-shape pair handed out since boot (the generator of prewarm.ts) */
      recipes: fn(() => this.materials.recipeList()),
      programNames: fn(() => (this.renderer.info.programs ?? []).map((p) => (p as unknown as { name: string }).name)),
      fullScreenDraws: fn(() => (this.post ? this.post.fullScreenDraws : 0)),
      composer: fn(() => this.post !== null && this.post.composer !== null),
      contextMsaa: fn(() => this.contextMsaa),
      r8: fn(() => { const a = this.ctx.assets; return a.isActive('tx_noise') ? a.texture('tx_noise').format === THREE.RedFormat : null; }),
      vfx: fn(() => ({
        ...this.fx.counts, particles: this.fx.particles.alive(), emitted: this.fx.particles.emitted, decals: this.fx.decals.alive, quads: this.fx.quads.count,
        additiveLoad: this.fx.additiveLoad, smokeLoad: this.fx.smokeLoad, halos: this.haloCount, ambient: this.fx.ambient.drawn, handled: { ...this.feedback.handled },
      })),
      lampState: fn((object: THREE.Object3D) => this.materials.lampState(object)),
      lightOf: fn((object: THREE.Object3D) => this.materials.lightOf(object)),
      layerWeight: fn((id: string) => this.materials.layerWeight(id)),
      trauma: fn(() => this.trauma),
      /** share of the frame's pixels within Delta E 25 of the violet `#B24BFF` (ART_BIBLE 2.4: under 2 % until the bore) */
      violetShare: fn(() => this.violetShare()),
      viewModelCoverage: fn(() => this.viewModelCoverage()),
      /**
       * Polish round 5: where the pass draws the muzzle and the flash sprite now (fractions of the frame, y up), and
       * where the last shot's smoke and tracer began, through the world camera. Read after a drawn frame.
       */
      muzzle: fn(() => {
        this.poseViewModel();
        const node = this.muzzleNode(), cam = this.ctx.scene.camera, f = this.fx.flashMesh, m = this.feedback.muzzle;
        const at = (v: THREE.Vector3, c: THREE.Camera): { x: number; y: number } => { v.project(c); return { x: (v.x + 1) / 2, y: (v.y + 1) / 2 }; };
        cam.updateMatrixWorld(true);
        cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
        return {
          node: node !== null,
          muzzle: node ? at(new THREE.Vector3().setFromMatrixPosition(node.matrixWorld), this.viewCamera) : null,
          flash: at(f.position.clone(), this.viewCamera), flashVisible: f.visible, rides: this.fx.counts.flashRides,
          smoke: at(new THREE.Vector3(m.x, m.y, m.z), cam), smokeWorld: [m.x, m.y, m.z],
        };
      }),
      viewModelProject: fn((x: number, y: number, z: number) => {
        this.poseViewModel();
        const v = this.scratch.set(x, y, z).project(this.viewCamera);
        return { x: (v.x + 1) / 2, y: (v.y + 1) / 2, inFront: v.z > -1 && v.z < 1 };
      }),
    });
  }

  private violetShare(): number {
    this.lateUpdate(0, 1);
    this.render(0, 1);
    const r = this.renderer, gl = r.getContext();
    const w = r.domElement.width, h = r.domElement.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ref = labOf(0xb2, 0x4b, 0xff, [0, 0, 0]), lab: [number, number, number] = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      labOf(px[i * 4] as number, px[i * 4 + 1] as number, px[i * 4 + 2] as number, lab);
      if (Math.hypot(lab[0] - ref[0], lab[1] - ref[1], lab[2] - ref[2]) <= 25) n++;
    }
    return n / (w * h);
  }

  private viewModelCoverage(): { coverage: number; minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } {
    const r = this.renderer, roots = this.ctx.scene;
    const w = this.cssWidth, h = this.cssHeight;
    let rt = this.coverageTarget;
    if (!rt || rt.width !== w || rt.height !== h) {
      if (rt) rt.dispose();
      rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
      this.coverageTarget = rt;
    }
    const out = { coverage: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, width: w, height: h };
    const prevTarget = r.getRenderTarget(), prevAlpha = r.getClearAlpha();
    const prevColor = r.getClearColor(this.clearColor).getHex();
    const wasVisible = roots.viewModel.visible;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    if (roots.viewModel.children.length > 0) {
      roots.viewModel.visible = true;
      this.poseViewModel();
      r.render(roots.viewModel, this.viewCamera);
    }
    const px = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, px);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    roots.viewModel.visible = wasVisible;
    let n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] === 0) continue;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (n > 0) { out.coverage = n / (w * h); out.minX = x0 / w; out.maxX = (x1 + 1) / w; out.minY = y0 / h; out.maxY = (y1 + 1) / h; }
    return out;
  }
}

/** the tiers a page can be asked for (sandbox buttons) */
export const RENDER_TIERS: readonly RenderTier[] = ['min', 'low', 'high'];

// ---- integration seam: the render list is sorted in place ------------------------------------------------------------
// three sorts its opaque and transparent lists with Array.prototype.sort, which allocates a scratch copy on every call
// (measured: 1.3 KB per frame of the 6 KB allowance with about a hundred items). The lists are rebuilt in scene order
// each frame, so they are nearly sorted: an in-place insertion sort with three's own two comparators gives the same
// order (both are total orders: they end on the unique item id) and allocates nothing.
interface SortItem { groupOrder: number; renderOrder: number; z: number; id: number; materialVariant: number; material: { id: number } }
interface SortList { opaque: SortItem[]; transmissive: SortItem[]; transparent: SortItem[]; sort: (a?: unknown, b?: unknown) => void; __quiet?: boolean }
/** true when `a` must be drawn after `b` (three's painterSortStable > 0); a boolean, so no number is boxed per call */
function painter(a: SortItem, b: SortItem): boolean {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder > b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder > b.renderOrder;
  if (a.material.id !== b.material.id) return a.material.id > b.material.id;
  if (a.materialVariant !== b.materialVariant) return a.materialVariant > b.materialVariant;
  if (a.z !== b.z) return a.z > b.z;
  return a.id > b.id;
}
/** three's reversePainterSortStable > 0 */
function reversePainter(a: SortItem, b: SortItem): boolean {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder > b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder > b.renderOrder;
  if (a.z !== b.z) return a.z < b.z;
  return a.id > b.id;
}
function insertionSort(list: SortItem[], after: (a: SortItem, b: SortItem) => boolean): void {
  for (let i = 1; i < list.length; i++) {
    const item = list[i] as SortItem;
    let j = i - 1;
    while (j >= 0 && after(list[j] as SortItem, item)) { list[j + 1] = list[j] as SortItem; j--; }
    list[j + 1] = item;
  }
}
/** Replaces the `sort` of the top-level render list of `scene` (once per list; a list lives as long as the renderer). */
function quietSort(r: THREE.WebGLRenderer, scene: THREE.Object3D): void {
  const list = (r as unknown as { renderLists: { get(scene: THREE.Object3D, depth: number): SortList } }).renderLists.get(scene, 0);
  if (list.__quiet === true) return;
  list.__quiet = true;
  list.sort = () => { insertionSort(list.opaque, painter); insertionSort(list.transmissive, reversePainter); insertionSort(list.transparent, reversePainter); };
}
