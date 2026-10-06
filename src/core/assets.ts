// AssetStore (ARCHITECTURE 7, 8.4): manifest-driven loading, resident sets, instance pools, and the missing-file
// fallback that lets the game boot with no asset files at all (dev / test only): placeholders are synthesised from the
// manifest and zone assets from the layout greybox.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VERTEX_LIGHT_SCALE } from './contracts.ts';
import type {
  AssetDef, AssetId, AssetInstance, AssetManifest, AssetStore, ClipDef, EventBus, GameEvents, LayoutData, LoadedAsset,
  MaterialResolver, ResidentSet, TextureDef, TextureId,
} from './contracts.ts';
import { buildZoneGreybox } from './greybox.ts';

type SetName = ResidentSet | 'always';

export interface AssetStoreDeps {
  manifest: AssetManifest;
  layout: LayoutData;
  events: EventBus;
  /** base URL the manifest paths are relative to ('./' in the game, '../' from a sandbox page) */
  baseUrl: string;
  /** dev / test: a missing file is replaced by a synthesised placeholder; otherwise it is a thrown load error */
  allowSynthesis: boolean;
  /** dev / test `?assets=none`: never fetch, always synthesise (proves the game boots with no asset files) */
  forceSynthesis?: boolean;
  /** test mode: no per-frame upload spreading, CPU data is kept on release so re-activation stays synchronous */
  test: boolean;
  /** true while texture uploads must be spread one per frame (state 'playing' outside test mode) */
  spreadUploads: () => boolean;
  /** true while uploads give the page a turn between textures without waiting for a frame (boot outside test mode) */
  sliceUploads?: () => boolean;
  /** waits between the tries of one request, ms (default 500, 1000, 2000: four tries in all) */
  retryDelays?: readonly number[];
  /** the renderer once it exists (uploads); null in unit tests */
  renderer: () => THREE.WebGLRenderer | null;
}
const RETRY_DELAYS: readonly number[] = [500, 1000, 2000];

export interface UploadReport {
  /** 'r8': RedFormat upload of an ImageBitmap works; 'rgba': it does not and R8 textures are uploaded as RGBA8 (4x the bytes); 'untested' */
  r8: 'r8' | 'rgba' | 'untested';
  glError: number;
  sample: [number, number, number, number];
  /** textures that came from files / were synthesised */
  texturesFromFiles: number; texturesSynthesised: number;
  assetsFromFiles: number; assetsSynthesised: number;
  /** requests asked again after a network failure */
  retries: number;
}

interface AssetEntry {
  id: AssetId; def: AssetDef;
  loading: Promise<void> | null;
  loaded: LoadedAssetImpl | null;
}
interface TextureEntry {
  id: TextureId; def: TextureDef;
  loading: Promise<void> | null;
  texture: THREE.Texture | null;
  placeholder: boolean;
  uploaded: boolean;
}

class LoadedAssetImpl implements LoadedAsset {
  readonly clips: Map<string, THREE.AnimationClip>;
  /** decided by the file: true when it contains a SkinnedMesh */
  readonly skinned: boolean;
  readonly names: Set<string>;
  readonly pool: AssetInstanceImpl[] = [];
  /** every skinned instance ever cloned from this asset: each owns a skeleton, and a skeleton owns a GPU bone texture */
  readonly skinnedInstances: AssetInstanceImpl[] = [];
  resolved = false;
  constructor(readonly id: AssetId, readonly def: AssetDef, readonly scene: THREE.Object3D, clips: Map<string, THREE.AnimationClip>, readonly isPlaceholder: boolean, readonly fromFile: boolean) {
    this.clips = clips;
    let skinned = false;
    scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
    this.skinned = skinned;
    this.names = new Set<string>([...def.nodes, ...(def.bones ?? [])]);
  }
}

function nameOf(o: THREE.Object3D): string {
  const original = o.userData.name;
  return typeof original === 'string' && original.length > 0 ? original : o.name;
}

const offsetMatrix = new THREE.Matrix4();
const quieted = new WeakSet<THREE.Skeleton>();
/**
 * three's Skeleton.update marks the bone texture for upload on every drawn frame, moved or not: a texSubImage and a
 * texture cache key string (0.2 to 0.3 KB) per skinned thing per frame. Eighteen of the props are rigid-skinned and
 * stand still nearly all the time (doors, shutters, the cradle, the lockers): this update writes the same matrices and
 * asks for an upload only when one of them changed.
 */
function quietSkeleton(skeleton: THREE.Skeleton): void {
  if (quieted.has(skeleton)) return;
  quieted.add(skeleton);
  skeleton.update = function quietUpdate(this: THREE.Skeleton): void {
    const bones = this.bones, inverses = this.boneInverses, out = this.boneMatrices as Float32Array | null;
    if (!out) return;
    let changed = false;
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      if (bone) offsetMatrix.multiplyMatrices(bone.matrixWorld, inverses[i] as THREE.Matrix4); else offsetMatrix.copy(inverses[i] as THREE.Matrix4);
      const e = offsetMatrix.elements, o = i * 16;
      for (let k = 0; k < 16; k++) {
        const v = Math.fround(e[k] as number);
        if (out[o + k] !== v) { out[o + k] = v; changed = true; }
      }
    }
    if (changed && this.boneTexture !== null) this.boneTexture.needsUpdate = true;
  };
}

function disposeSkeletons(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh && mesh.skeleton) mesh.skeleton.dispose();
  });
}

class AssetInstanceImpl implements AssetInstance {
  readonly id: AssetId;
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer | null;
  private nodes: Map<string, THREE.Object3D> | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  released = false;
  constructor(readonly asset: LoadedAssetImpl) {
    this.id = asset.id;
    this.root = asset.skinned ? SkeletonUtils.clone(asset.scene) : asset.scene.clone(true);
    if (asset.skinned) {
      this.root.traverse((o) => { const sk = (o as THREE.SkinnedMesh).skeleton; if ((o as THREE.SkinnedMesh).isSkinnedMesh && sk) quietSkeleton(sk); });
      asset.skinnedInstances.push(this);
    }
    this.mixer = asset.def.animations.length > 0 ? new THREE.AnimationMixer(this.root) : null;
  }
  private buildNodes(): Map<string, THREE.Object3D> {
    const map = new Map<string, THREE.Object3D>();
    const names = this.asset.names;
    this.root.traverse((o) => {
      const n = nameOf(o);
      if (!names.has(n)) return;
      const prev = map.get(n);
      // a name listed in both `nodes` and `bones` is the bone
      if (!prev || ((o as THREE.Bone).isBone && !(prev as THREE.Bone).isBone)) map.set(n, o);
    });
    return map;
  }
  node(name: string): THREE.Object3D {
    if (!this.asset.names.has(name)) throw new Error(`asset '${this.id}': '${name}' is not a node or bone in the manifest`);
    if (!this.nodes) this.nodes = this.buildNodes();
    const o = this.nodes.get(name);
    if (!o) throw new Error(`asset '${this.id}': the file has no node '${name}' (the manifest lists it)`);
    return o;
  }
  action(clip: string): THREE.AnimationAction {
    let a = this.actions.get(clip);
    if (a) return a;
    const c = this.asset.clips.get(clip);
    const def = this.asset.def.animations.find((d) => d.name === clip);
    if (!c || !def || !this.mixer) throw new Error(`asset '${this.id}': unknown clip '${clip}'`);
    a = this.mixer.clipAction(c);
    // the manifest's seconds are the gameplay duration: the authored clip (nearest frame) is stretched to it
    a.timeScale = c.duration > 1e-6 && def.seconds > 1e-6 ? c.duration / def.seconds : 1;
    a.setLoop(def.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !def.loop;
    this.actions.set(clip, a);
    return a;
  }
  release(): void {
    if (this.released) return;
    this.released = true;
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.mixer) this.mixer.stopAllAction();
    this.asset.pool.push(this);
  }
  /** Back from the pool: a clean transform. */
  reuse(): void {
    this.released = false;
    this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0); this.root.scale.set(1, 1, 1);
    this.root.visible = true;
    this.root.matrixAutoUpdate = true;
  }
}

// ============================================================================================================
// Fallback materials: unlit vertex colour (the resolver core installs until src/render installs its own)
// ============================================================================================================

/** UV0 detail sheets of the world materials (ARCHITECTURE 7.6: `vcol x detail(UV0).r x 2 x light`). */
const FALLBACK_DETAIL: Readonly<Record<string, TextureId>> = { m_frontier: 'tx_frontier_trim', m_pellam: 'tx_pellam_trim', m_sand: 'tx_sand' };
/** UV0 colour textures: the palette under COLOR_0 for `m_prop`, the gun's albedo for `m_gun`. */
const FALLBACK_ALBEDO: Readonly<Record<string, TextureId>> = { m_prop: 'tx_palette', m_gun: 'tx_gun' };

/** True for a mesh of a placeholder file (or a synthesised stand-in): its UVs are schematic. */
function inPlaceholder(mesh: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (o.userData.placeholder === true) return true;
  return false;
}

/**
 * Shared unlit materials by Blender material name: what sandbox/viewer.html, `<id>_game.png` and every sandbox show
 * until src/render installs its own. Vertex-lit meshes (extra `bake` VL, or zone assets) show COLOR_0 *
 * VERTEX_LIGHT_SCALE; a lightmapped mesh (`bake` LM with a `lightmap` extra and uv1) multiplies its lightmap in.
 *
 * A FINAL file (not a placeholder) with UV0 also gets the shared texture of its material, so an artist sees the UV
 * mapping through the real loader: `m_frontier` / `m_pellam` / `m_sand` multiply their detail sheet (red channel x 2),
 * `m_prop` multiplies `tx_palette`, `m_gun` `tx_gun`, `m_mask` is cut by `tx_mask` (red channel, alpha test 0.5) and
 * `m_emis` shows `tx_palette_emis`. Placeholders keep plain vertex colour (and `m_emis` a flat aqua): their UVs mean
 * nothing. It is unlit: no key light, matcap, lamp state or fog tuning.
 */
export function createFallbackResolver(textureOf: (id: TextureId) => THREE.Texture | null, lightmapScaleOf: (id: TextureId) => number): MaterialResolver {
  const cache = new Map<string, THREE.Material>();
  return (name, mesh, def) => {
    const extraBake = typeof mesh.userData.bake === 'string' ? (mesh.userData.bake as string) : '';
    const lmId = typeof mesh.userData.lightmap === 'string' ? (mesh.userData.lightmap as string) : '';
    const hasColor = mesh.geometry.getAttribute('color') !== undefined;
    const lm = extraBake === 'LM' && lmId !== '' && mesh.geometry.getAttribute('uv1') !== undefined ? textureOf(lmId) : null;
    const zoneLit = extraBake === 'VL' || (extraBake === '' && def !== null && def.chunks !== undefined);
    const textured = mesh.geometry.getAttribute('uv') !== undefined && !inPlaceholder(mesh);
    const detail = textured && FALLBACK_DETAIL[name] ? textureOf(FALLBACK_DETAIL[name] as TextureId) : null;
    const albedo = textured && FALLBACK_ALBEDO[name] ? textureOf(FALLBACK_ALBEDO[name] as TextureId) : null;
    const mask = textured && name === 'm_mask' ? textureOf('tx_mask') : null;
    const emis = textured && name === 'm_emis' ? textureOf('tx_palette_emis') : null;
    const tex = detail ? 'd' : albedo ? 'a' : mask ? 'k' : emis ? 'e' : '-';
    const key = `${name}|${hasColor ? 'c' : 'n'}|${lm ? 'lm:' + lmId : zoneLit ? 'vl' : 'flat'}|${tex}`;
    let m = cache.get(key);
    if (m) return m;
    if (name === 'm_emis') {
      const e = new THREE.MeshBasicMaterial({ color: emis ? 0xffffff : 0x7cf2e2, fog: false });
      if (emis) e.map = emis;
      e.toneMapped = false;
      m = e;
    } else {
      const b = new THREE.MeshBasicMaterial({ vertexColors: hasColor });
      if (lm) {
        b.lightMap = lm;
        b.lightMapIntensity = Math.PI * lightmapScaleOf(lmId);       // three divides the lightmap by pi
      } else if (zoneLit) {
        b.color.setRGB(VERTEX_LIGHT_SCALE, VERTEX_LIGHT_SCALE, VERTEX_LIGHT_SCALE);
      }
      if (albedo) b.map = albedo;
      if (detail) {
        // a one-channel detail sheet: grey, twice its value (0.5 is neutral), not three's red-only colour map
        b.map = detail;
        b.onBeforeCompile = (shader): void => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', 'diffuseColor.rgb *= texture2D( map, vMapUv ).r * 2.0;');
        };
        b.customProgramCacheKey = (): string => 'fallback_detail';
      }
      if (name === 'm_mask') {
        b.alphaTest = 0.5; b.side = THREE.DoubleSide; b.polygonOffset = true; b.polygonOffsetFactor = -1; b.polygonOffsetUnits = -1;
        if (mask) {
          b.alphaMap = mask;
          // three reads an alpha map's green channel; tx_mask is one red channel
          b.onBeforeCompile = (shader): void => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', 'diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).r;');
          };
          b.customProgramCacheKey = (): string => 'fallback_mask';
        }
      }
      m = b;
    }
    m.name = name;
    // unbaked (no lightmap, no zone vertex light, not emissive): its light is the renderer's to add
    m.userData.fallbackFlat = name !== 'm_emis' && !lm && !zoneLit;
    m.userData.fallbackTexture = detail ? FALLBACK_DETAIL[name] : albedo ? FALLBACK_ALBEDO[name] : mask ? 'tx_mask' : emis ? 'tx_palette_emis' : '';
    cache.set(key, m);
    return m;
  };
}

// ============================================================================================================
// Synthesised placeholders
// ============================================================================================================

const CATEGORY_COLOUR: Readonly<Record<AssetDef['category'], readonly [number, number, number]>> = {
  env: [0.34, 0.3, 0.24], props: [0.55, 0.33, 0.12], weapons: [0.22, 0.24, 0.27], enemies: [0.33, 0.2, 0.42], boss: [0.42, 0.14, 0.12],
};

/** Placeholder box in asset-local space, from its anchor (the same table as tools/validate_assets.mjs). */
export function placeholderLocalBox(def: AssetDef): { min: [number, number, number]; max: [number, number, number] } {
  const [sx, sy, sz] = def.placeholder.size;
  switch (def.placeholder.anchor) {
    case 'centre': return { min: [-sx / 2, -sy / 2, -sz / 2], max: [sx / 2, sy / 2, sz / 2] };
    case 'top': return { min: [-sx / 2, -sy, -sz / 2], max: [sx / 2, 0, sz / 2] };
    case 'back': return { min: [-sx / 2, -sy / 2, 0], max: [sx / 2, sy / 2, sz] };
    case 'back_base': return { min: [-sx / 2, 0, 0], max: [sx / 2, sy, sz] };
    case 'hinge': return { min: [0, 0, -sz / 2], max: [sx, sy, sz / 2] };
    default: return { min: [-sx / 2, 0, -sz / 2], max: [sx / 2, sy, sz / 2] };          // base, sill, world
  }
}

function shadeFlat(geometry: THREE.BufferGeometry, colour: readonly [number, number, number]): void {
  const normal = geometry.getAttribute('normal');
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // a fixed key from the upper front-left so the shape reads
    const k = normal ? 0.55 + 0.45 * Math.max(0, normal.getX(i) * -0.4 + normal.getY(i) * 0.75 + normal.getZ(i) * 0.53) : 1;
    colors[i * 3] = colour[0] * k; colors[i * 3 + 1] = colour[1] * k; colors[i * 3 + 2] = colour[2] * k;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** A lamp-set mesh: `count` quads in a row, lamp i with UV1.x = (i + 0.5) / count on all its vertices. */
function lampSetMesh(name: string, count: number, at: readonly [number, number, number]): THREE.Mesh {
  const size = 0.06, gap = 0.09;
  const pos = new Float32Array(count * 18), uv1 = new Float32Array(count * 12), uv = new Float32Array(count * 12);
  for (let i = 0; i < count; i++) {
    const x0 = at[0] + (i - (count - 1) / 2) * gap - size / 2, x1 = x0 + size, y0 = at[1] - size / 2, y1 = at[1] + size / 2, z = at[2];
    pos.set([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z], i * 18);
    uv.set([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], i * 12);
    for (let v = 0; v < 6; v++) { uv1[i * 12 + v * 2] = (i + 0.5) / count; uv1[i * 12 + v * 2 + 1] = 0.5; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g);
  mesh.name = name;
  mesh.userData.materialName = 'm_emis';
  mesh.userData.lampCount = count;
  return mesh;
}

/** The placeholder the store builds itself when a manifest file is missing (ARCHITECTURE 7.3, producer ruling 2). */
export function synthesiseAsset(id: AssetId, def: AssetDef, layout: LayoutData): { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip> } {
  let root: THREE.Object3D;
  const lampSets = def.lampSets ?? {};
  const nodePos = def.nodePos ?? {};
  const made = new Set<string>();
  if (def.placeholder.source === 'layout-solids' && def.zone) {
    root = buildZoneGreybox(layout, def.zone, def);
    // drawn nodes and other manifest nodes sit out of sight at the zone's lowest corner unless the manifest places them
    const zone = layout.zones.find((z) => z.id === def.zone);
    const hide: [number, number, number] = zone ? [zone.bounds.min[0] + 0.5, zone.bounds.min[1] - 0.5, zone.bounds.min[2] + 0.5] : [0, -100, 0];
    const drawn = new Set(def.drawnNodes ?? []);
    for (const name of def.nodes) {
      if (made.has(name)) continue;
      made.add(name);
      const at = nodePos[name] ?? hide;
      const lamps = lampSets[name];
      if (lamps !== undefined) root.add(lampSetMesh(name, lamps, at));
      else if (drawn.has(name)) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.02, 0, 0, 0, 0, 0.02]), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(0.02), 3));
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g);
        mesh.name = name; mesh.position.set(at[0], at[1], at[2]);
        mesh.userData.materialName = def.materials.find((m) => m !== 'm_mask' && m !== 'm_emis') ?? 'm_pellam';
        mesh.userData.bake = 'VL';
        root.add(mesh);
      } else {
        const empty = new THREE.Object3D();
        empty.name = name; empty.position.set(at[0], at[1], at[2]);
        root.add(empty);
      }
    }
  } else {
    root = new THREE.Group();
    const [sx, sy, sz] = def.placeholder.size;
    const box = placeholderLocalBox(def);
    let geometry: THREE.BufferGeometry;
    if (def.placeholder.shape === 'capsule') {
      const r = Math.min(sx, sz) / 2;
      geometry = new THREE.CapsuleGeometry(r, Math.max(0.01, sy - 2 * r), 3, 8);
    } else if (def.placeholder.shape === 'cylinder') geometry = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 12);
    else geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
    shadeFlat(geometry, CATEGORY_COLOUR[def.category] ?? CATEGORY_COLOUR.props);
    geometry.computeBoundingSphere();
    const body = new THREE.Mesh(geometry);
    body.name = id + '_placeholder';
    body.userData.materialName = def.materials[0] ?? 'm_prop';
    body.userData.bake = def.bake === 'LM' || def.bake === 'LM+VL' || def.bake === 'VL' ? 'VL' : def.bake;
    if (def.bake === 'VL' || def.bake === 'LM' || def.bake === 'LM+VL') {
      // vertex-lit convention: COLOR_0 = tint * light / VERTEX_LIGHT_SCALE
      const c = geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < c.count * 3; i++) (c.array as Float32Array)[i] = ((c.array as Float32Array)[i] as number) / VERTEX_LIGHT_SCALE;
    }
    root.add(body);
    // every manifest name once: a name in both `nodes` and `bones` is made once (final art makes it the bone)
    for (const name of [...(def.bones ?? []), ...def.nodes]) {
      if (made.has(name)) continue;
      made.add(name);
      const at = nodePos[name] ?? [0, 0, 0];
      const lamps = lampSets[name];
      if (lamps !== undefined) root.add(lampSetMesh(name, lamps, at));
      else {
        const empty = new THREE.Object3D();
        empty.name = name; empty.position.set(at[0], at[1], at[2]);
        root.add(empty);
      }
    }
  }
  root.name = id;
  root.userData.placeholder = true;
  const clips = new Map<string, THREE.AnimationClip>();
  for (const a of def.animations) clips.set(a.name, new THREE.AnimationClip(a.name, a.seconds, []));
  return { scene: root, clips };
}

/** Placeholder texture: small, right format and colour space; lightmaps display as neutral, light layers as off. */
export function synthesiseTexture(def: TextureDef, r8: boolean): THREE.Texture {
  const n = 8;
  let tex: THREE.DataTexture;
  if (def.format === 'r8' && r8) {
    const data = new Uint8Array(n * n);
    data.fill(def.kind === 'lightlayer' ? 0 : def.kind === 'mask' ? 255 : 128);
    tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  } else {
    const data = new Uint8Array(n * n * 4);
    // a lightmap texel of sRGB 188 is linear 0.5: times lightmapScale 2 it shows the vertex colour unchanged
    const v = def.kind === 'lightmap' ? 188 : def.kind === 'lightlayer' ? 0 : def.kind === 'mask' ? 255 : 128;
    for (let i = 0; i < n * n; i++) { data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
    if (def.kind === 'lightmap') { data[0] = 255; data[1] = 255; data[2] = 255; }       // the neutral texel (top-left block)
    tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  }
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function applyTextureSettings(tex: THREE.Texture, def: TextureDef, placeholder: boolean): void {
  tex.flipY = false;
  tex.colorSpace = def.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = def.wrap === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (!placeholder) {
    tex.generateMipmaps = def.mips;
    tex.minFilter = def.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
  }
  if (def.kind === 'lightmap' || def.kind === 'lightlayer') tex.channel = def.uv ?? 1;
  tex.needsUpdate = true;
}

// ============================================================================================================
// The store
// ============================================================================================================

export class AssetStoreImpl implements AssetStore {
  readonly manifest: AssetManifest;
  private readonly assets = new Map<AssetId, AssetEntry>();
  private readonly textures = new Map<TextureId, TextureEntry>();
  /** which sets claim an id (full or partial activation) */
  private readonly claims = new Map<SetName, Set<string>>();
  private readonly fullyActive = new Set<SetName>();
  private readonly prefetched = new Set<SetName>();
  private resolver: MaterialResolver;
  private loader: GLTFLoader | null = null;
  private readonly pending = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  private readonly setPayload: GameEvents['load/set'] = { set: 'surface', stage: 'prefetched' };
  private inFlight = 0;
  private idleWaiters: (() => void)[] = [];
  readonly report: UploadReport = {
    r8: 'untested', glError: 0, sample: [0, 0, 0, 0], texturesFromFiles: 0, texturesSynthesised: 0, assetsFromFiles: 0, assetsSynthesised: 0, retries: 0,
  };

  constructor(private readonly deps: AssetStoreDeps) {
    this.manifest = deps.manifest;
    this.resolver = createFallbackResolver((id) => this.textureOrNull(id), (id) => this.manifest.textures[id]?.lightmapScale ?? VERTEX_LIGHT_SCALE);
    this.pending.name = 'pending';
  }

  // ---- bookkeeping --------------------------------------------------------------------------
  private idsOf(set: SetName): { assets: string[]; textures: string[] } {
    const s = this.manifest.sets[set];
    if (!s) throw new Error(`unknown resident set '${set}'`);
    return { assets: s.assets ?? [], textures: s.textures };
  }
  private assetEntry(id: AssetId): AssetEntry {
    let e = this.assets.get(id);
    if (!e) {
      const def = this.manifest.assets[id];
      if (!def) throw new Error(`unknown asset '${id}'`);
      e = { id, def, loading: null, loaded: null };
      this.assets.set(id, e);
    }
    return e;
  }
  private textureEntry(id: TextureId): TextureEntry {
    let e = this.textures.get(id);
    if (!e) {
      const def = this.manifest.textures[id];
      if (!def) throw new Error(`unknown texture '${id}'`);
      e = { id, def, loading: null, texture: null, placeholder: false, uploaded: false };
      this.textures.set(id, e);
    }
    return e;
  }
  private claimed(id: string): boolean {
    for (const ids of this.claims.values()) if (ids.has(id)) return true;
    return false;
  }
  private track<T>(p: Promise<T>): Promise<T> {
    this.inFlight++;
    const done = (): void => {
      if (--this.inFlight === 0) { const w = this.idleWaiters; this.idleWaiters = []; for (const f of w) f(); }
    };
    p.then(done, done);
    return p;
  }
  /** Resolves when no fetch or activation is in flight (the debug hook waits on it between script steps). */
  idle(): Promise<void> {
    if (this.inFlight === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }
  get busy(): boolean { return this.inFlight > 0; }

  // ---- loading ------------------------------------------------------------------------------
  private url(path: string): string { return this.deps.baseUrl + path; }

  /**
   * One file. A request that fails on the network (a dropped connection, a 5xx, a body cut short) is tried again after
   * 0.5, 1 and 2 s: before polish round 2 one dropped request among the forty files of the underground set left the rest
   * of the session in an unlit or grey-box world. A 4xx or a dev server's fallback page is an answer, not a failure:
   * the file is not there, and asking again changes nothing.
   */
  private async fetchBinary(path: string): Promise<ArrayBuffer | null> {
    const delays = this.deps.retryDelays ?? RETRY_DELAYS;
    for (let attempt = 0; ; attempt++) {
      let transient = false;
      try {
        const res = await fetch(this.url(path));
        if (res.ok) {
          const type = res.headers.get('content-type') ?? '';
          if (type.includes('text/html')) return null;             // a dev server's fallback page is not our file
          return await res.arrayBuffer();
        }
        transient = res.status >= 500 || res.status === 408 || res.status === 429;
      } catch { transient = true; }
      if (!transient || attempt >= delays.length) return null;
      this.report.retries++;
      await new Promise<void>((resolve) => { setTimeout(resolve, delays[attempt] as number); });
    }
  }

  private missing(kind: string, id: string, path: string): void {
    if (!this.deps.allowSynthesis) throw new Error(`${kind} '${id}': file ${path} failed to load`);
  }

  /**
   * A load that failed is forgotten, so the next prefetch or activate asks again. (The rejected promise used to stay in
   * `loading` and answer every later request: one failure was a failure for the rest of the session.)
   */
  private forgetOnFailure(e: { loading: Promise<void> | null }, p: Promise<void>): Promise<void> {
    return p.catch((err: unknown) => { e.loading = null; throw err; });
  }

  private loadAsset(e: AssetEntry): Promise<void> {
    if (e.loaded) return Promise.resolve();
    if (e.loading) return e.loading;
    e.loading = this.track(this.forgetOnFailure(e, (async () => {
      const buffer = typeof fetch === 'function' && !this.deps.forceSynthesis ? await this.fetchBinary(e.def.path) : null;
      const isGlb = buffer !== null && buffer.byteLength > 12 && new Uint32Array(buffer.slice(0, 4))[0] === 0x46546c67;
      if (isGlb) {
        if (!this.loader) { await MeshoptDecoder.ready; this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); }
        const gltf = await this.loader.parseAsync(buffer as ArrayBuffer, this.url(e.def.path).replace(/[^/]*$/, ''));
        e.loaded = this.adoptFile(e, gltf.scene, gltf.animations);
        this.report.assetsFromFiles++;
      } else {
        this.missing('asset', e.id, e.def.path);
        const s = synthesiseAsset(e.id, e.def, this.deps.layout);
        s.scene.userData.placeholder = true;
        this.prepareTemplate(s.scene);
        e.loaded = new LoadedAssetImpl(e.id, e.def, s.scene, s.clips, true, false);
        this.report.assetsSynthesised++;
      }
      e.loading = null;
    })()));
    return e.loading;
  }

  /** Remember each mesh's Blender material name, drop the loader's materials, freeze static transforms. */
  private prepareTemplate(scene: THREE.Object3D): void {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (typeof mesh.userData.materialName !== 'string') {
        const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        mesh.userData.materialName = m && m.name ? m.name : 'm_prop';
        if (Array.isArray(mesh.material)) for (const x of mesh.material) x.dispose(); else if (mesh.material) mesh.material.dispose();
      }
      mesh.material = this.pending;
    });
    scene.updateMatrixWorld(true);
  }

  private adoptFile(e: AssetEntry, gltfScene: THREE.Object3D, animations: THREE.AnimationClip[]): LoadedAssetImpl {
    // one root node named by the asset id; tolerate a file whose scene IS the root
    let root: THREE.Object3D = gltfScene;
    if (gltfScene.children.length === 1 && nameOf(gltfScene.children[0] as THREE.Object3D) === e.id) root = gltfScene.children[0] as THREE.Object3D;
    else root.name = e.id;
    if (root.parent) root.parent.remove(root);
    this.prepareTemplate(root);
    const isPlaceholder = root.userData.placeholder === true || gltfScene.userData.placeholder === true;
    const def = e.def;
    // strip tracks that target code-driven bones (the exporter keys T/R/S on every bone in every clip)
    const driven = new Set((def.codeDriven ?? []).map((n) => THREE.PropertyBinding.sanitizeNodeName(n)));
    const clips = new Map<string, THREE.AnimationClip>();
    for (const clip of animations) {
      if (driven.size > 0) clip.tracks = clip.tracks.filter((t) => !driven.has(t.name.split('.')[0] ?? ''));
      clips.set(clip.name, clip);
    }
    // fail loudly at load: every manifest name and clip must be in the file. The game still boots on a stand-in.
    const present = new Set<string>();
    root.traverse((o) => { present.add(nameOf(o)); });
    for (const name of [...(def.bones ?? []), ...def.nodes]) {
      if (present.has(name)) continue;
      present.add(name);
      console.error(`[assets] ${def.path}: node '${name}' of the manifest is not in the file (a stand-in empty was added)`);
      const empty = new THREE.Object3D();
      empty.name = name;
      const at = def.nodePos?.[name];
      if (at) empty.position.set(at[0], at[1], at[2]);
      root.add(empty);
    }
    for (const a of def.animations) {
      if (clips.has(a.name)) continue;
      console.error(`[assets] ${def.path}: clip '${a.name}' of the manifest is not in the file (an empty clip stands in)`);
      clips.set(a.name, new THREE.AnimationClip(a.name, a.seconds, []));
    }
    return new LoadedAssetImpl(e.id, def, root, clips, isPlaceholder, true);
  }

  private loadTexture(e: TextureEntry): Promise<void> {
    if (e.texture) return Promise.resolve();
    if (e.loading) return e.loading;
    e.loading = this.track(this.forgetOnFailure(e, (async () => {
      const r8 = this.report.r8 !== 'rgba';
      let bitmap: ImageBitmap | null = null;
      if (typeof fetch === 'function' && typeof createImageBitmap === 'function' && !this.deps.forceSynthesis) {
        const buffer = await this.fetchBinary(e.def.path);
        if (buffer) {
          try {
            bitmap = await createImageBitmap(new Blob([buffer]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
          } catch { bitmap = null; }
        }
      }
      if (bitmap) {
        const tex = new THREE.Texture(bitmap);
        if (e.def.format === 'r8' && r8) tex.format = THREE.RedFormat;
        e.texture = tex; e.placeholder = false;
        this.report.texturesFromFiles++;
      } else {
        this.missing('texture', e.id, e.def.path);
        e.texture = synthesiseTexture(e.def, r8);
        e.placeholder = true;
        this.report.texturesSynthesised++;
      }
      e.texture.name = e.id;
      applyTextureSettings(e.texture, e.def, e.placeholder);
      e.uploaded = false;
      e.loading = null;
    })()));
    return e.loading;
  }

  prefetch(set: SetName, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const ids = this.idsOf(set);
    const total = ids.assets.length + ids.textures.length;
    let loaded = 0;
    const step = (): void => { loaded++; if (onProgress) onProgress(loaded, total); };
    const jobs: Promise<void>[] = [];
    for (const id of ids.textures) jobs.push(this.loadTexture(this.textureEntry(id)).then(step));
    for (const id of ids.assets) jobs.push(this.loadAsset(this.assetEntry(id)).then(step));
    const first = !this.prefetched.has(set);
    return this.track(Promise.all(jobs).then(() => {
      this.prefetched.add(set);
      if (first) { this.setPayload.set = set as ResidentSet; this.setPayload.stage = 'prefetched'; this.deps.events.emit('load/set', this.setPayload); }
    }));
  }

  // ---- activation ---------------------------------------------------------------------------
  private selection(set: SetName, only?: readonly string[]): { assets: string[]; textures: string[] } {
    const ids = this.idsOf(set);
    if (!only) return ids;
    return { assets: ids.assets.filter((i) => only.includes(i)), textures: ids.textures.filter((i) => only.includes(i)) };
  }
  private allLoaded(sel: { assets: string[]; textures: string[] }): boolean {
    for (const id of sel.textures) if (!this.textureEntry(id).texture) return false;
    for (const id of sel.assets) if (!this.assetEntry(id).loaded) return false;
    return true;
  }
  private claim(set: SetName, id: string): void {
    let ids = this.claims.get(set);
    if (!ids) { ids = new Set(); this.claims.set(set, ids); }
    ids.add(id);
  }
  private uploadTexture(e: TextureEntry): void {
    if (e.uploaded || !e.texture) return;
    const renderer = this.deps.renderer();
    if (renderer) renderer.initTexture(e.texture);
    e.uploaded = true;
  }
  private resolveMaterials(a: LoadedAssetImpl): void {
    a.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = this.resolver(mesh.userData.materialName as string, mesh, a.def);
    });
    a.resolved = true;
  }
  private finishActivation(set: SetName, only: readonly string[] | undefined): void {
    if (!only) this.fullyActive.add(set);
    this.setPayload.set = set as ResidentSet; this.setPayload.stage = 'activated';
    this.deps.events.emit('load/set', this.setPayload);
  }

  activate(set: SetName, only?: readonly string[]): Promise<void> {
    const sel = this.selection(set, only);
    const slice = this.deps.sliceUploads ? this.deps.sliceUploads() : false;
    if (this.allLoaded(sel) && !this.deps.spreadUploads() && !slice) {
      // everything is decoded and nothing has to be spread over frames: do it now, synchronously
      for (const id of sel.textures) { this.claim(set, id); this.uploadTexture(this.textureEntry(id)); }
      for (const id of sel.assets) { this.claim(set, id); const a = this.assetEntry(id).loaded as LoadedAssetImpl; if (!a.resolved) this.resolveMaterials(a); }
      this.finishActivation(set, only);
      return Promise.resolve();
    }
    return this.track((async () => {
      const jobs: Promise<void>[] = [];
      for (const id of sel.textures) jobs.push(this.loadTexture(this.textureEntry(id)));
      for (const id of sel.assets) jobs.push(this.loadAsset(this.assetEntry(id)));
      await Promise.all(jobs);
      for (const id of sel.textures) {
        const e = this.textureEntry(id);
        this.claim(set, id);
        if (!e.uploaded) {
          this.uploadTexture(e);
          // one texture upload per frame while the game is being played
          if (this.deps.spreadUploads() && typeof requestAnimationFrame === 'function') await new Promise<void>((r) => requestAnimationFrame(() => r()));
          else if (slice) await new Promise<void>((r) => { setTimeout(r, 0); });      // boot: the page answers between two uploads
        }
      }
      for (const id of sel.assets) { this.claim(set, id); const a = this.assetEntry(id).loaded as LoadedAssetImpl; if (!a.resolved) this.resolveMaterials(a); }
      this.finishActivation(set, only);
    })());
  }

  release(set: ResidentSet): void {
    const ids = this.claims.get(set);
    this.fullyActive.delete(set);
    if (!ids) return;
    this.claims.delete(set);
    const keepCpu = this.deps.test;
    for (const id of ids) {
      if (this.claimed(id)) continue;
      const t = this.textures.get(id);
      if (t && t.texture) {
        t.texture.dispose();
        t.uploaded = false;
        if (!keepCpu) {
          const image = t.texture.image as { close?: () => void } | null;
          if (image && typeof image.close === 'function') image.close();
          t.texture = null;
        }
      }
      const a = this.assets.get(id);
      if (a && a.loaded) {
        for (const inst of a.loaded.pool) if (inst.mixer) inst.mixer.uncacheRoot(inst.root);
        a.loaded.pool.length = 0;
        // Every clone of a skinned asset has its own Skeleton, and each skeleton its own RGBA32F bone texture on the GPU.
        // Nothing freed them: 15 to 25 textures stayed behind on every set swap and every quit-and-begin (polish round 2).
        // All of them, pooled or still held: a holder that draws its instance again gets a new texture from three.
        for (const inst of a.loaded.skinnedInstances) disposeSkeletons(inst.root);
        a.loaded.skinnedInstances.length = 0;
        a.loaded.scene.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });   // frees the GPU buffers
        a.loaded.resolved = false;
        if (!keepCpu) a.loaded = null;
      }
    }
    if (!keepCpu) this.prefetched.delete(set);
    this.setPayload.set = set; this.setPayload.stage = 'released';
    this.deps.events.emit('load/set', this.setPayload);
  }

  /**
   * Core only (the asset viewer): load and activate single ids outside any resident set, embedded props included.
   * They are claimed by 'always' and stay until the page goes away.
   */
  async activateLoose(ids: readonly string[]): Promise<void> {
    await this.track((async () => {
      for (const id of ids) {
        if (this.manifest.textures[id]) {
          const e = this.textureEntry(id);
          await this.loadTexture(e);
          this.claim('always', id);
          this.uploadTexture(e);
        }
      }
      for (const id of ids) {
        if (!this.manifest.assets[id]) continue;
        const e = this.assetEntry(id);
        await this.loadAsset(e);
        this.claim('always', id);
        const a = e.loaded as LoadedAssetImpl;
        if (!a.resolved) this.resolveMaterials(a);
      }
    })());
  }

  isActive(id: AssetId | TextureId): boolean {
    if (!this.claimed(id)) return false;
    const a = this.assets.get(id);
    if (a) return a.loaded !== null && a.loaded.resolved;
    const t = this.textures.get(id);
    return t !== undefined && t.texture !== null;
  }
  /** True when a whole set has been activated and not released. */
  isSetActive(set: SetName): boolean { return this.fullyActive.has(set); }

  get(id: AssetId): LoadedAsset {
    const e = this.assets.get(id);
    if (!e || !e.loaded || !this.claimed(id)) {
      if (!this.manifest.assets[id]) throw new Error(`unknown asset '${id}'`);
      throw new Error(`asset '${id}' is not active (activate a set that holds it first)`);
    }
    return e.loaded;
  }
  instantiate(id: AssetId): AssetInstance {
    const asset = this.get(id) as LoadedAssetImpl;
    const pooled = asset.pool.pop();
    if (pooled) { pooled.reuse(); return pooled; }
    return new AssetInstanceImpl(asset);
  }
  private textureOrNull(id: TextureId): THREE.Texture | null {
    const e = this.textures.get(id);
    return e && e.texture && this.claimed(id) ? e.texture : null;
  }
  texture(id: TextureId): THREE.Texture {
    const t = this.textureOrNull(id);
    if (!t) {
      if (!this.manifest.textures[id]) throw new Error(`unknown texture '${id}'`);
      throw new Error(`texture '${id}' is not active`);
    }
    return t;
  }
  clipSeconds(id: AssetId, clip: string): number {
    const def = this.manifest.assets[id];
    if (!def) throw new Error(`unknown asset '${id}'`);
    const c: ClipDef | undefined = def.animations.find((a) => a.name === clip);
    if (!c) throw new Error(`asset '${id}': unknown clip '${clip}'`);
    return c.seconds;
  }
  setMaterialResolver(resolver: MaterialResolver): void {
    this.resolver = resolver;
    // anything already active is re-resolved (render normally installs its resolver before the first activation)
    for (const e of this.assets.values()) if (e.loaded && e.loaded.resolved) this.resolveMaterials(e.loaded);
  }

  // ---- memory accounting and the R8 verdict (core and tests) ----------------------------------
  /** GPU bytes of one active texture as it was really uploaded: the manifest figure, x4 for an R8 texture that fell back to RGBA8. */
  gpuBytesOf(id: TextureId): number {
    const def = this.manifest.textures[id];
    if (!def) return 0;
    return def.format === 'r8' && this.report.r8 === 'rgba' ? def.gpuBytes * 4 : def.gpuBytes;
  }
  /** Sum over every active texture. */
  activeTextureBytes(): number {
    let n = 0;
    for (const e of this.textures.values()) if (e.texture && this.claimed(e.id)) n += this.gpuBytesOf(e.id);
    return n;
  }
  isPlaceholderTexture(id: TextureId): boolean { return this.textures.get(id)?.placeholder ?? false; }

  /**
   * Measures the R8 upload path research relied on (tech-web 2): an ImageBitmap uploaded with RedFormat must sample as
   * (v, 0, 0). When it does not, R8 textures are created as RGBA8 from here on and counted at four times their bytes.
   */
  async probeR8(): Promise<UploadReport> {
    const renderer = this.deps.renderer();
    if (!renderer || typeof createImageBitmap !== 'function' || typeof ImageData !== 'function') return this.report;
    const px = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) { px[i * 4] = 128; px[i * 4 + 1] = 128; px[i * 4 + 2] = 128; px[i * 4 + 3] = 255; }
    const bitmap = await createImageBitmap(new ImageData(px, 4, 4), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const tex = new THREE.Texture(bitmap);
    tex.format = THREE.RedFormat; tex.flipY = false; tex.generateMipmaps = false;
    tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
    const gl = renderer.getContext();
    while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
    const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    const material = new THREE.ShaderMaterial({
      uniforms: { t: { value: tex } }, depthTest: false, depthWrite: false,
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D t; void main(){ vec4 c = texture2D(t, vec2(0.5)); gl_FragColor = vec4(c.r, c.g, c.b, 1.0); }',
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(mesh, camera);
    const out = new Uint8Array(4);
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, out);
    renderer.setRenderTarget(prev);
    const err = gl.getError();
    this.report.glError = err;
    this.report.sample = [out[0] as number, out[1] as number, out[2] as number, out[3] as number];
    const ok = err === gl.NO_ERROR && Math.abs((out[0] as number) - 128) <= 2 && (out[1] as number) === 0 && (out[2] as number) === 0;
    this.report.r8 = ok ? 'r8' : 'rgba';
    tex.dispose(); rt.dispose(); material.dispose(); geometry.dispose(); bitmap.close();
    return this.report;
  }
}
