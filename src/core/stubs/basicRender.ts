// Core stub for the render slot: a plain WebGL2 renderer that draws the scene unlit with vertex colours and plain fog,
// then the view-model in a second pass. Units, instances, stats, capture, warm-up and the benchmark really work; the
// look calls (vfx, moods, exposure ...) are recorded no-ops that tests can read back from debugState().calls.
//
// Colour: values up to 0.8 (linear) are displayed EXACTLY as authored (no toe, no desaturation: a dark palette colour
// in a frame of this renderer is the colour in the file); only above 0.8 does a shoulder roll the brightest channel
// off toward 1.0, hue kept, because baked vertex light reaches 2 x tint on pale surfaces. That curve is THE GAME'S tone
// map (producer ruling): it lives in src/core/tonemap.ts (TONE_MAP_GLSL, installToneMap) for src/render to use as well.
//
// The view-model: children of `scene.viewModel` are in CAMERA SPACE (camera at the origin, looking down -Z, +Y up, as
// art-weapons authors the gun). Before the second pass this renderer copies the world camera's matrixWorld onto the
// group and draws it with a 52 degree camera at the same pose. Whoever adds things to the group never transforms the
// group itself, only what it added (kick, bob, sway).
//
// `__dbg.ext.render.moodLook(true)` (the asset viewer's `&mood=`) gives `setMood` a minimal look: the mood's fog and
// clear colour and one flat ambient + key tint on unbaked (prop, creature, gun) materials. Off by default: the game's
// greybox frames have one look.
import * as THREE from 'three';
import type {
  AssetDef, CardKind, DebugSnapshot, FlashKind, FxHandle, GameContext, InstanceApi, InstanceHandle, LampApi, LineKind, MoodId,
  PerfStats, RenderSystem, RingKind, SurfaceType, TextureId, VfxApi, VfxId, ZoneId,
} from '../contracts.ts';
import { createFallbackResolver } from '../assets.ts';
import { coreOf } from '../context.ts';
import type { CoreInternals } from '../context.ts';
import { round4 } from '../math.ts';
import { installToneMap } from '../tonemap.ts';

const CALL_RING = 256;
const VIEWMODEL_FOV = 52;
const DEFAULT_FOG = 0x8a7a62, DEFAULT_FOG_NEAR = 60, DEFAULT_FOG_FAR = 420;
/**
 * The mood table of code-render 4.3, cut down to what an unlit stub can show: fog colour and density, the dynamic
 * ambient and key (colour x strength) and the exposure. Used only while the mood look is on.
 */
const MOODS: Readonly<Record<MoodId, { fog: number; density: number; ambient: number; ambientK: number; key: number; keyK: number; exposure: number }>> = {
  L0: { fog: 0xe6e2d0, density: 0.0093, ambient: 0x7a86d8, ambientK: 0.55, key: 0xffd09a, keyK: 1.1, exposure: 1.0 },
  L1: { fog: 0xedbb86, density: 0.0058, ambient: 0x7a86d8, ambientK: 0.55, key: 0xffd09a, keyK: 1.1, exposure: 1.0 },
  L2: { fog: 0x2e222b, density: 0.020, ambient: 0x4a3a44, ambientK: 0.35, key: 0x000000, keyK: 0, exposure: 2.0 },
  L3: { fog: 0x0f1c33, density: 0.023, ambient: 0x1e3a5c, ambientK: 0.45, key: 0x7cf2e2, keyK: 0.5, exposure: 1.6 },
  L4: { fog: 0x0e1a2e, density: 0.026, ambient: 0x1e3a5c, ambientK: 0.40, key: 0x7cf2e2, keyK: 0.45, exposure: 1.6 },
  L5: { fog: 0x2a1b4a, density: 0.018, ambient: 0x4a3a7a, ambientK: 0.45, key: 0xb24bff, keyK: 0.5, exposure: 1.5 },
  L5p: { fog: 0x12343c, density: 0.012, ambient: 0x2a6a70, ambientK: 0.50, key: 0x7cf2e2, keyK: 0.6, exposure: 1.5 },
  L6: { fog: 0x4d5578, density: 0.012, ambient: 0x4a5a96, ambientK: 0.50, key: 0xff9e6b, keyK: 0.35, exposure: 1.8 },
};
/** an unlit material has no normal to light: the key counts at this share (a surface half turned to it) */
const FLAT_KEY_SHARE = 0.5;
const NO_HANDLE: FxHandle = { setPosition() {}, setEnd() {}, setLevel() {}, setVisible() {}, release() {} };

interface InstancedSet { mesh: THREE.InstancedMesh; free: number[]; used: number; capacity: number }
interface InstanceRef { set: InstancedSet; slot: number; visible: boolean; x: number; y: number; z: number; rot: number; scale: number }

class BasicRender implements RenderSystem {
  readonly id = 'render' as const;
  readonly vfx: VfxApi;
  readonly instances: InstanceApi;
  readonly lamps: LampApi;
  private gl: THREE.WebGLRenderer | null = null;
  private readonly core: CoreInternals;
  private readonly resolve: (name: string, mesh: THREE.Mesh, def: AssetDef | null) => THREE.Material;
  private readonly calls: string[] = [];
  private callHead = 0;
  private callCount = 0;
  private readonly viewCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 16 / 9, 0.01, 50);
  private readonly visibleUnits = new Set<string>();
  private readonly plugNodes = new Set<string>();
  private readonly chunkIds = new Set<string>();
  private readonly drawnNodes = new Set<string>();
  private visibleZoneCount = 0;
  private readonly visibleZones = new Set<string>();
  private cssWidth = 960;
  private cssHeight = 540;
  private appliedRatio = -1;
  private readonly sets = new Map<string, InstancedSet>();
  private readonly refs: (InstanceRef | null)[] = [];
  private readonly freeRefs: number[] = [];
  private instanceCount = 0;
  private readonly lampMasks = new Map<THREE.Object3D, { mask: number; count: number; boost: number }>();
  private readonly textureIds: TextureId[];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly unsubscribe: (() => void)[] = [];
  /** the unbaked fallback materials handed out so far (the mood look tints them) */
  private readonly flatMaterials = new Set<THREE.MeshBasicMaterial>();
  private readonly moodTint = new THREE.Color(1, 1, 1);
  private readonly scratchColor = new THREE.Color();
  private moodLook = false;
  private mood: MoodId = 'L1';
  private coverageTarget: THREE.WebGLRenderTarget | null = null;

  constructor(private readonly ctx: GameContext, private readonly canvas: HTMLCanvasElement) {
    this.core = coreOf(ctx);
    const manifest = ctx.data.manifest;
    this.resolve = createFallbackResolver(
      (id) => (ctx.assets.isActive(id) ? ctx.assets.texture(id) : null),
      (id) => manifest.textures[id]?.lightmapScale ?? 2,
    );
    for (const p of manifest.visibility.plugs) this.plugNodes.add(p.node);
    for (const [id, unit] of Object.entries(manifest.visibility.units)) if (manifest.assets[unit.asset]?.chunks) this.chunkIds.add(id);
    for (const def of Object.values(manifest.assets)) for (const n of def.drawnNodes ?? []) this.drawnNodes.add(n);
    this.textureIds = Object.keys(manifest.textures);

    const log = (name: string): void => this.record(name);
    this.vfx = {
      burst: (id: VfxId) => log('vfx.burst:' + id),
      decal: (surface: SurfaceType) => log('vfx.decal:' + surface),
      line: (kind: LineKind) => log('vfx.line:' + kind),
      acquireLine: (kind: LineKind) => { log('vfx.acquireLine:' + kind); return NO_HANDLE; },
      ring: (kind: RingKind) => log('vfx.ring:' + kind),
      acquireCard: (kind: CardKind) => { log('vfx.acquireCard:' + kind); return NO_HANDLE; },
      muzzleFlash: (kind: FlashKind) => log('vfx.muzzleFlash:' + kind),
      pulse: () => log('vfx.pulse'),
      provingRing: () => log('vfx.provingRing'),
      blobShadow: () => { log('vfx.blobShadow'); return NO_HANDLE; },
    };
    this.instances = {
      add: (asset, node, x, y, z, rotYRad, scale) => this.addInstance(asset, node, x, y, z, rotYRad, scale),
      setTransform: (h, x, y, z, rotYRad, scale) => this.setInstanceTransform(h, x, y, z, rotYRad, scale),
      setMatrix: (h, m) => { const r = this.refs[h]; if (r) { r.set.mesh.setMatrixAt(r.slot, m); r.set.mesh.instanceMatrix.needsUpdate = true; } },
      setTint: (h, r, g, b) => this.setInstanceTint(h, r, g, b),
      setVisible: (h, visible) => { const r = this.refs[h]; if (r) { r.visible = visible; this.writeInstance(r); } },
      remove: (h) => this.removeInstance(h),
    };
    this.lamps = {
      setMask: (lampSet, mask) => { this.lampState(lampSet).mask = mask; log('lamps.setMask:' + lampSet.name + ':' + mask); },
      setCount: (lampSet, count) => { this.lampState(lampSet).count = count; log('lamps.setCount:' + lampSet.name + ':' + count); },
      setBoost: (lampSet, boost) => { this.lampState(lampSet).boost = boost; log('lamps.setBoost:' + lampSet.name); },
    };
  }

  /** Created on first use, so a stub that is replaced before init() never opens a WebGL context. */
  get renderer(): THREE.WebGLRenderer {
    if (!this.gl) {
      const r = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: this.ctx.quality.tier === 'min', alpha: false, depth: true, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false,
      });
      r.setPixelRatio(1);
      r.outputColorSpace = THREE.SRGBColorSpace;
      // NOT NeutralToneMapping: its toe subtracts about the smallest channel from dark colours (steel 54,82,90 was
      // shown as 23,67,77), so no dark palette colour could be judged in a frame. See the header.
      installToneMap(THREE.ShaderChunk);                    // src/core/tonemap.ts: the game's curve (shoulder only, knee 0.8)
      r.toneMapping = THREE.CustomToneMapping;
      r.info.autoReset = false;
      r.autoClear = false;
      r.setClearColor(DEFAULT_FOG, 1);
      this.gl = r;
    }
    return this.gl;
  }

  private record(name: string): void {
    this.calls[this.callHead] = name;
    this.callHead = (this.callHead + 1) % CALL_RING;
    if (this.callCount < CALL_RING) this.callCount++;
  }
  private lampState(o: THREE.Object3D): { mask: number; count: number; boost: number } {
    let s = this.lampMasks.get(o);
    if (!s) { s = { mask: 0, count: 0, boost: 1 }; this.lampMasks.set(o, s); }
    return s;
  }

  // ---- lifecycle ----------------------------------------------------------------------------------
  init(): void {
    const { ctx } = this;
    void this.renderer;
    ctx.assets.setMaterialResolver((name, mesh, def) => this.material(name, mesh, def));
    ctx.scene.scene.fog = new THREE.Fog(DEFAULT_FOG, DEFAULT_FOG_NEAR, DEFAULT_FOG_FAR);
    this.unsubscribe.push(ctx.events.on('quality/changed', () => this.applySize()));
    this.unsubscribe.push(ctx.events.on('world/built', () => this.applyVisibility()));
    this.applySize();
    ctx.debug.register('render', {
      /** tests and sandboxes: a row of `count` instances of (asset, node) starting at a point; returns the handles */
      addInstances: ((asset: string, node: string, count: number, x: number, y: number, z: number) => {
        const handles: number[] = [];
        for (let i = 0; i < count; i++) handles.push(this.instances.add(asset, node, x + i * 0.6, y, z, 0, 1));
        return handles;
      }) as (...args: never[]) => unknown,
      removeInstances: ((handles: number[]) => { for (const h of handles) this.instances.remove(h); }) as (...args: never[]) => unknown,
      unitVisible: ((unit: string) => this.unitVisible(unit)) as (...args: never[]) => unknown,
      zoneVisible: ((zone: ZoneId) => this.zoneVisible(zone)) as (...args: never[]) => unknown,
      /** true: setMood changes the picture (fog, clear colour, a flat ambient + key tint on unbaked materials); see the header */
      moodLook: ((on: boolean) => { this.moodLook = on; this.applyMood(); }) as (...args: never[]) => unknown,
      /** the tint the mood look multiplies unbaked materials by, linear [r, g, b] ([1, 1, 1] while it is off) */
      moodTint: (() => [this.moodTint.r, this.moodTint.g, this.moodTint.b]) as (...args: never[]) => unknown,
      /**
       * What the view-model pass covers: `{ coverage, minX, maxX, minY, maxY, width, height }`, coverage as a fraction
       * of the frame, the box of the covered pixels in screen fractions (x from the left, y from the BOTTOM; all 0
       * when nothing is drawn). Drawn alone into a target of the canvas's size with the 52 degree camera.
       */
      viewModelCoverage: (() => this.viewModelCoverage()) as (...args: never[]) => unknown,
      /** [x, y] screen fractions (x from the left, y from the bottom) and depth sign of a world point seen by the 52 degree view-model camera */
      viewModelProject: ((x: number, y: number, z: number) => {
        this.poseViewModel();
        const v = this.v.set(x, y, z).project(this.viewCamera);
        return { x: (v.x + 1) / 2, y: (v.y + 1) / 2, inFront: v.z > -1 && v.z < 1 };
      }) as (...args: never[]) => unknown,
    });
  }
  start(): void { /* nothing to pool */ }
  dispose(): void {
    for (const u of this.unsubscribe) u();
    for (const s of this.sets.values()) { s.mesh.removeFromParent(); s.mesh.dispose(); }
    this.sets.clear();
    if (this.coverageTarget) this.coverageTarget.dispose();
    if (this.gl) this.gl.dispose();
  }

  material(blenderMaterialName: string, mesh: THREE.Mesh, def: AssetDef | null): THREE.Material {
    const m = this.resolve(blenderMaterialName, mesh, def);
    if (m.userData.fallbackFlat === true && !this.flatMaterials.has(m as THREE.MeshBasicMaterial)) {
      this.flatMaterials.add(m as THREE.MeshBasicMaterial);
      (m as THREE.MeshBasicMaterial).color.copy(this.moodTint);
    }
    return m;
  }

  /** The mood look (see the header): fog, clear colour and the flat tint of the current mood, or the one default look. */
  private applyMood(): void {
    const fog = this.ctx.scene.scene.fog as THREE.Fog | null;
    const r = this.renderer;
    if (!this.moodLook) {
      this.moodTint.setRGB(1, 1, 1);
      if (fog) { fog.color.setHex(DEFAULT_FOG); fog.near = DEFAULT_FOG_NEAR; fog.far = DEFAULT_FOG_FAR; }
      r.setClearColor(DEFAULT_FOG, 1);
    } else {
      const m = MOODS[this.mood];
      const a = this.scratchColor.setHex(m.ambient);
      const ar = a.r * m.ambientK, ag = a.g * m.ambientK, ab = a.b * m.ambientK;
      const k = this.scratchColor.setHex(m.key), share = m.keyK * FLAT_KEY_SHARE;
      this.moodTint.setRGB((ar + k.r * share) * m.exposure, (ag + k.g * share) * m.exposure, (ab + k.b * share) * m.exposure);
      // 1 - exp(-density x d) as a straight line through its value at 40 m
      if (fog) { fog.color.setHex(m.fog); fog.near = 0; fog.far = 40 / (1 - Math.exp(-m.density * 40)); }
      r.setClearColor(m.fog, 1);
    }
    for (const mat of this.flatMaterials) mat.color.copy(this.moodTint);
  }

  /** Camera space -> world: the group takes the world camera's pose, and the 52 degree camera stands where it does. */
  private poseViewModel(): void {
    const roots = this.ctx.scene, vm = roots.viewModel, cam = roots.camera;
    cam.updateMatrixWorld(true);
    vm.matrixAutoUpdate = false;
    vm.matrix.copy(cam.matrixWorld);
    vm.matrixWorldNeedsUpdate = true;
    vm.updateMatrixWorld(true);
    this.viewCamera.matrixAutoUpdate = false;
    this.viewCamera.matrix.copy(cam.matrixWorld);
    this.viewCamera.matrixWorld.copy(cam.matrixWorld);
    this.viewCamera.matrixWorldInverse.copy(cam.matrixWorld).invert();
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
    const prevColor = r.getClearColor(this.scratchColor).getHex();
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

  // ---- drawing ------------------------------------------------------------------------------------
  private applySize(): void {
    const r = this.renderer, ratio = this.ctx.quality.pixelRatio;
    this.appliedRatio = ratio;
    r.setPixelRatio(ratio);
    r.setSize(this.cssWidth, this.cssHeight, false);
    const cam = this.ctx.scene.camera;
    cam.aspect = this.cssWidth / Math.max(1, this.cssHeight);
    cam.updateProjectionMatrix();
    this.viewCamera.aspect = cam.aspect;
    this.viewCamera.updateProjectionMatrix();
  }
  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(1, Math.floor(cssWidth)); this.cssHeight = Math.max(1, Math.floor(cssHeight));
    this.applySize();
  }

  render(_frameDt: number, _alpha: number): void {
    const r = this.renderer, roots = this.ctx.scene;
    if (this.appliedRatio !== this.ctx.quality.pixelRatio) this.applySize();
    r.info.reset();
    r.setRenderTarget(null);
    r.clear(true, true, false);
    const hasViewModel = roots.viewModel.children.length > 0;
    roots.viewModel.visible = false;
    r.render(roots.scene, roots.camera);
    if (hasViewModel) {
      // second pass: its own 52 degree projection over a cleared depth range; the group's children are in camera space
      roots.viewModel.visible = true;
      this.poseViewModel();
      r.clearDepth();
      r.render(roots.viewModel, this.viewCamera);
    }
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
    // estimate: the manifest's gpuBytes of every active texture
    let bytes = 0;
    const assets = this.core.assets, ids = this.textureIds;
    for (let i = 0; i < ids.length; i++) { const id = ids[i] as string; if (assets.isActive(id)) bytes += assets.gpuBytesOf(id); }
    out.textureBytes = bytes;
    // the render targets a real renderer of this tier allocates at the current buffer size (ARCHITECTURE 8.4)
    const tier = this.ctx.data.manifest.tiers[this.ctx.quality.tier];
    let fixed = 0;
    if (tier.fixed) for (let i = 0; i < tier.fixed.length; i++) fixed += (tier.fixed[i] as { bytes: number }).bytes;
    out.renderTargetBytes = Math.round(tier.bytesPerPixel * out.width * out.height) + fixed;
    out.visibleZones = this.visibleZoneCount;
    out.instances = this.instanceCount;
    out.particles = 0; out.decals = 0;
  }

  warmUp(): Promise<void> {
    const r = this.renderer, roots = this.ctx.scene;
    // compile with everything visible, then draw one hidden frame so buffers upload
    const hidden: THREE.Object3D[] = [];
    roots.world.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    r.compile(roots.scene, roots.camera);
    r.info.reset();
    r.render(roots.scene, roots.camera);
    for (const o of hidden) o.visible = false;
    return Promise.resolve();
  }

  benchmark(): Promise<number> {
    const r = this.renderer;
    const passes = 8, rounds = 5;
    const rt = new THREE.WebGLRenderTarget(1280, 720, { depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
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

  // ---- visibility ---------------------------------------------------------------------------------
  setVisible(units: readonly string[]): void {
    this.visibleUnits.clear();
    for (let i = 0; i < units.length; i++) this.visibleUnits.add(units[i] as string);
    this.applyVisibility();
  }
  /**
   * Chunk meshes are `<chunk id>__<material>`; a zone's drawn nodes (manifest `drawnNodes`) follow its chunks; plugs are
   * listed by name; any other mesh of a zone GLB (collider_terrain) is never drawn.
   */
  private applyVisibility(): void {
    const world = this.ctx.scene.world, units = this.visibleUnits;
    this.visibleZones.clear();
    for (let i = 0; i < world.children.length; i++) {
      const top = world.children[i] as THREE.Object3D;
      const isZone = this.ctx.data.manifest.zones[top.name as ZoneId] !== undefined;
      if (!isZone) { top.visible = units.has(top.name); continue; }      // a chunkless world-space asset: its id is the unit
      top.visible = true;
      const any = this.showChunks(top);
      this.showNodes(top, any);
      if (any) this.visibleZones.add(top.name);
    }
    this.visibleZoneCount = this.visibleZones.size;
  }
  private chunkOf(o: THREE.Object3D): string {
    const cut = o.name.indexOf('__');
    if (cut <= 0) return '';
    const id = o.name.slice(0, cut);
    return this.chunkIds.has(id) ? id : '';
  }
  private showChunks(parent: THREE.Object3D): boolean {
    let any = false;
    for (let i = 0; i < parent.children.length; i++) {
      const o = parent.children[i] as THREE.Object3D;
      const chunk = this.chunkOf(o);
      if (chunk !== '') { o.visible = this.visibleUnits.has(chunk); if (o.visible) any = true; } else if (this.showChunks(o)) any = true;
    }
    return any;
  }
  private showNodes(parent: THREE.Object3D, zoneDrawn: boolean): void {
    for (let i = 0; i < parent.children.length; i++) {
      const o = parent.children[i] as THREE.Object3D;
      if (this.chunkOf(o) !== '') continue;
      const name = typeof o.userData.name === 'string' ? (o.userData.name as string) : o.name;
      if (this.plugNodes.has(name)) o.visible = this.visibleUnits.has(name);
      else if (this.drawnNodes.has(name)) o.visible = zoneDrawn;
      else if ((o as THREE.Mesh).isMesh) o.visible = false;               // a collision mesh, or anything the plan does not name
      else this.showNodes(o, zoneDrawn);
    }
  }
  unitVisible(unit: string): boolean { return this.visibleUnits.has(unit); }
  zoneVisible(zone: ZoneId): boolean { return this.visibleZones.has(zone); }

  // ---- instancing -----------------------------------------------------------------------------------
  private instancedSet(asset: string, node: string): InstancedSet | null {
    const key = asset + '|' + node;
    const have = this.sets.get(key);
    if (have) return have;
    if (!this.ctx.assets.isActive(asset)) return null;
    const loaded = this.ctx.assets.get(asset);
    let source: THREE.Mesh | null = null;
    let first: THREE.Mesh | null = null;
    loaded.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!first) first = mesh;
      if (source) return;
      // the named node itself, or a mesh below it
      for (let p: THREE.Object3D | null = mesh; p; p = p.parent) if (p.name === node || p.userData.name === node) { source = mesh; break; }
    });
    const src = (source ?? first) as THREE.Mesh | null;
    if (!src) return null;
    const capacity = 64;
    const mesh = new THREE.InstancedMesh(src.geometry, src.material, capacity);
    mesh.name = 'inst:' + key;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    this.ctx.scene.dynamic.add(mesh);
    const set: InstancedSet = { mesh, free: [], used: 0, capacity };
    this.sets.set(key, set);
    return set;
  }
  private grow(set: InstancedSet): void {
    const old = set.mesh, capacity = set.capacity * 2;
    const mesh = new THREE.InstancedMesh(old.geometry, old.material, capacity);
    mesh.name = old.name; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
    for (let i = 0; i < set.used; i++) { old.getMatrixAt(i, this.m4); mesh.setMatrixAt(i, this.m4); }
    if (old.instanceColor) { const c = new THREE.Color(); for (let i = 0; i < set.used; i++) { old.getColorAt(i, c); mesh.setColorAt(i, c); } }
    mesh.count = old.count;
    old.removeFromParent(); old.dispose();
    this.ctx.scene.dynamic.add(mesh);
    set.mesh = mesh; set.capacity = capacity;
  }
  private writeInstance(r: InstanceRef): void {
    const k = r.visible ? r.scale : 0;
    this.q.setFromAxisAngle(this.up, r.rot);
    this.m4.compose(this.v.set(r.x, r.y, r.z), this.q, this.s.set(k, k, k));
    r.set.mesh.setMatrixAt(r.slot, this.m4);
    r.set.mesh.instanceMatrix.needsUpdate = true;
  }
  private addInstance(asset: string, node: string, x: number, y: number, z: number, rotYRad: number, scale: number): InstanceHandle {
    const set = this.instancedSet(asset, node);
    if (!set) return -1;
    let slot = set.free.pop();
    if (slot === undefined) {
      if (set.used >= set.capacity) this.grow(set);
      slot = set.used++;
      set.mesh.count = set.used;
    }
    const ref: InstanceRef = { set, slot, visible: true, x, y, z, rot: rotYRad, scale };
    this.writeInstance(ref);
    const h = this.freeRefs.pop() ?? this.refs.length;
    this.refs[h] = ref;
    this.instanceCount++;
    return h;
  }
  private setInstanceTransform(h: InstanceHandle, x: number, y: number, z: number, rotYRad: number, scale: number): void {
    const r = this.refs[h];
    if (!r) return;
    r.x = x; r.y = y; r.z = z; r.rot = rotYRad; r.scale = scale;
    this.writeInstance(r);
  }
  private readonly tint = new THREE.Color();
  private setInstanceTint(h: InstanceHandle, r: number, g: number, b: number): void {
    const ref = this.refs[h];
    if (!ref) return;
    ref.set.mesh.setColorAt(ref.slot, this.tint.setRGB(r, g, b));
    if (ref.set.mesh.instanceColor) ref.set.mesh.instanceColor.needsUpdate = true;
  }
  private removeInstance(h: InstanceHandle): void {
    const r = this.refs[h];
    if (!r) return;
    r.visible = false;
    this.writeInstance(r);
    r.set.free.push(r.slot);
    // an empty set draws nothing at all (a freed slot in a live set is a zero-scale instance until it is reused)
    if (r.set.free.length === r.set.used) { r.set.free.length = 0; r.set.used = 0; r.set.mesh.count = 0; }
    this.refs[h] = null;
    this.freeRefs.push(h);
    this.instanceCount--;
  }

  // ---- recorded no-ops ------------------------------------------------------------------------------
  setMood(mood: MoodId, _seconds: number): void {
    this.record('setMood:' + mood);
    this.mood = mood;
    if (this.moodLook) this.applyMood();
  }
  setExposure(multiplier: number, _seconds: number): void { this.record('setExposure:' + round4(multiplier)); }
  setLightLayer(texture: TextureId, weight: number, _seconds: number): void { this.record('setLightLayer:' + texture + ':' + round4(weight)); }
  setWrongFade(value: number): void { this.record('setWrongFade:' + round4(value)); }
  setEmissive(object: THREE.Object3D, scale: number): void { this.record('setEmissive:' + object.name + ':' + round4(scale)); }
  addTrauma(amount: number): void { this.record('addTrauma:' + round4(amount)); }
  setOutline(object: THREE.Object3D | null): void { this.record('setOutline:' + (object ? object.name : 'null')); }
  setSky(ruleLeanDeg: number, threadVisible: boolean): void { this.record('setSky:' + round4(ruleLeanDeg) + ':' + threadVisible); }

  debugState(): DebugSnapshot {
    const calls: string[] = [];
    const start = this.callCount < CALL_RING ? 0 : this.callHead;
    for (let i = 0; i < this.callCount; i++) calls.push(this.calls[(start + i) % CALL_RING] as string);
    return {
      stub: 'basicRender', tier: this.ctx.quality.tier,
      visibleUnits: Array.from(this.visibleUnits).sort(), visibleZones: Array.from(this.visibleZones).sort(),
      instances: this.instanceCount, calls,
    };
  }
}

export function createBasicRender(ctx: GameContext, canvas: HTMLCanvasElement): RenderSystem {
  return new BasicRender(ctx, canvas);
}
