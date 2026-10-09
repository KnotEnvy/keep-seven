// InstanceApi (code-render 4.7): one InstancedMesh per (asset, node), one draw call. An instance's colour is the flat
// light of the zone that holds it at add() time (ambient + half the key), times its tint; the shader adds the shape
// shading. Handles stay valid for the life of the instance; a removed slot is a zero-scale instance until it is reused.
import * as THREE from 'three';
import type { AssetId, GameContext, InstanceApi, InstanceHandle } from '../core/contracts.ts';
import { MOODS, M_AMBIENT, M_KEY } from './moods.ts';
import type { MoodKey } from './moods.ts';
import { FLAG_ADD, FLAG_GLOW } from './vfx/quads.ts';

interface InstancedSet { mesh: THREE.InstancedMesh; free: number[]; used: number; capacity: number; dirty: boolean; /** every drawn instance carries a glow (a stake in flight, the stone's round) */ glow: GlowSpec | null }
/** the glow of one instanced set: metres across, least pixels, metres pulled toward the eye, strength, how far up the thing it sits (in the asset's own metres), hue */
interface GlowSpec { readonly size: number; readonly minPx: number; readonly pull: number; readonly k: number; readonly up: number; readonly color: THREE.Color }
/** what the halo pass writes into (the quad batch) */
interface GlowSink { readonly data: Float32Array; next(): number }
/**
 * Instanced things that are their own light: a stake in flight (GDD 7.2: "hot orange with a white core"). End-on, the
 * 4 cm stake coming at her was a dark sliver six pixels across; each hot stake now carries a camera-facing flame glow
 * of GLOW_SIZE metres with a white heart, never under GLOW_MIN_PX on screen.
 */
const GLOW_SIZE = 0.3, GLOW_MIN_PX = 12, GLOW_PULL = 0.9;
const GLOW_COLOR = new THREE.Color(0xff9433);
/**
 * Look team creatures-props, pass i4 (the story reviewer: "the seventh round on the stone is a dark speck; its 'wrong
 * colour' band cannot be seen ... the violet band only becomes visible on the HUD after it is taken"). The round that
 * stands on the rim stone (`prop_cartridge_kept|round_violet`, drawn 3.4 times life size) carries the knots' violet as a
 * small breath of light at its band: KEPT_GLOW_SIZE metres across, never under KEPT_GLOW_MIN_PX on screen, and gone
 * with the round when it is taken. One quad of the halo batch; nothing on a tier's budget.
 */
const KEPT_GLOW_SIZE = 0.2, KEPT_GLOW_MIN_PX = 16, KEPT_GLOW_K = 0.5, KEPT_BAND_UP = 0.0165;
const GLOW_SETS: Readonly<Record<string, GlowSpec>> = {
  'proj_stake|stake_hot': { size: GLOW_SIZE, minPx: GLOW_MIN_PX, pull: GLOW_PULL, k: 1.1, up: 0, color: GLOW_COLOR },
  'prop_cartridge_kept|round_violet': { size: KEPT_GLOW_SIZE, minPx: KEPT_GLOW_MIN_PX, pull: 0.06, k: KEPT_GLOW_K, up: KEPT_BAND_UP, color: new THREE.Color(0xb24bff) },
};
/**
 * ... and the light of an instanced thing at blue hour (mood L6). The ledge and what is baked into it (the six spent
 * cases on the stone) are lit by the whole dusk sky in the bake; an instance took `ambient + key / 2` like everywhere
 * else, which at dusk is a third of that and ember-pink: the seventh round stood beside six brass cases as a dark red
 * speck. An instanced thing on the rim takes this light instead (linear; measured against the baked cases).
 */
const INST_DUSK: readonly [number, number, number] = [0.40, 0.38, 0.44];
class InstanceRef {
  set: InstancedSet | null = null;
  slot = 0; visible = true; x = 0; y = 0; z = 0; rot = 0; scale = 1;
  lr = 1; lg = 1; lb = 1; tr = 1; tg = 1; tb = 1;
  matrix = false;
}

const INITIAL_CAPACITY = 32;
/** metres (world): an instanced thing of the Tally House's zone below this hangs in the peg stair (see `add`) */
const INST_STAIR_Y = -0.3;

export class Instances implements InstanceApi {
  private readonly sets = new Map<string, InstancedSet>();
  private readonly setList: InstancedSet[] = [];
  private readonly refs: InstanceRef[] = [];
  private readonly freeRefs: number[] = [];
  count = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly color = new THREE.Color();

  constructor(private readonly ctx: GameContext, private readonly moodOf: (x: number, y: number, z: number) => MoodKey, private readonly twin: (m: THREE.Material, g: THREE.BufferGeometry) => THREE.Material) {}

  private set(asset: AssetId, node: string): InstancedSet | null {
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
      for (let p: THREE.Object3D | null = mesh; p; p = p.parent) if (p.name === node || p.userData.name === node) { source = mesh; break; }
    });
    const src = (source ?? first) as THREE.Mesh | null;
    if (!src) return null;
    const material = Array.isArray(src.material) ? src.material.map((m) => this.twin(m, src.geometry)) : this.twin(src.material, src.geometry);
    const set: InstancedSet = { mesh: this.makeMesh(src.geometry, material, INITIAL_CAPACITY, 'inst:' + key), free: [], used: 0, capacity: INITIAL_CAPACITY, dirty: false, glow: GLOW_SETS[key] ?? null };
    this.sets.set(key, set);
    this.setList.push(set);
    return set;
  }
  private makeMesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], capacity: number, name: string): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.count = 0;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true;
    // the colour attribute exists from the start, so the set's program never changes
    mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ctx.scene.dynamic.add(mesh);
    return mesh;
  }
  /** capacity grows by doubling (a load-time event: sets are filled when a zone is built) */
  private grow(set: InstancedSet): void {
    const old = set.mesh, capacity = set.capacity * 2;
    const mesh = this.makeMesh(old.geometry, old.material, capacity, old.name);
    for (let i = 0; i < set.used; i++) {
      old.getMatrixAt(i, this.m4); mesh.setMatrixAt(i, this.m4);
      old.getColorAt(i, this.color); mesh.setColorAt(i, this.color);
    }
    mesh.count = old.count;
    old.removeFromParent(); old.dispose();
    set.mesh = mesh; set.capacity = capacity;
  }
  private write(r: InstanceRef): void {
    const set = r.set as InstancedSet;
    if (!r.matrix) {
      const k = r.visible ? r.scale : 0;
      this.q.setFromAxisAngle(this.up, r.rot);
      this.m4.compose(this.v.set(r.x, r.y, r.z), this.q, this.s.set(k, k, k));
      set.mesh.setMatrixAt(r.slot, this.m4);
    }
    set.mesh.instanceMatrix.needsUpdate = true;
    set.dirty = true;
  }
  private writeColor(r: InstanceRef): void {
    const mesh = (r.set as InstancedSet).mesh;
    mesh.setColorAt(r.slot, this.color.setRGB(r.lr * r.tr, r.lg * r.tg, r.lb * r.tb));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  add(asset: AssetId, node: string, x: number, y: number, z: number, rotYRad: number, scale: number): InstanceHandle {
    const set = this.set(asset, node);
    if (!set) return -1;
    let slot = set.free.pop();
    if (slot === undefined) {
      if (set.used >= set.capacity) this.grow(set);
      slot = set.used++;
      set.mesh.count = set.used;
    }
    let h = this.freeRefs.pop();
    if (h === undefined) { h = this.refs.length; this.refs.push(new InstanceRef()); }
    const r = this.refs[h] as InstanceRef;
    r.set = set; r.slot = slot; r.visible = true; r.x = x; r.y = y; r.z = z; r.rot = rotYRad; r.scale = scale; r.matrix = false;
    // the zone's ambient and half its key, baked into the instance colour
    // Look team creatures-props, pass i3 (the reviewer's frames of the peg stair: red-brown coats on a mint wall): the
    // first flight under the hatch lies in the Tally House's zone while the surface is resident (layout `seam`), so what
    // hung there took the lamp-orange of the room above when she walked down, and the gallery's teal after a restore.
    // A thing under the hall's floor is lit by the stair it hangs in, as the view-model is (materials.ts VM_STAIR_Y).
    const key = this.moodOf(x, y, z);
    const mood = MOODS[key === 'L2' && y < INST_STAIR_Y ? 'L3' : key];
    r.lr = (mood[M_AMBIENT] as number) + 0.5 * (mood[M_KEY] as number);
    r.lg = (mood[M_AMBIENT + 1] as number) + 0.5 * (mood[M_KEY + 1] as number);
    r.lb = (mood[M_AMBIENT + 2] as number) + 0.5 * (mood[M_KEY + 2] as number);
    if (key === 'L6') { r.lr = INST_DUSK[0]; r.lg = INST_DUSK[1]; r.lb = INST_DUSK[2]; }
    r.tr = 1; r.tg = 1; r.tb = 1;
    this.write(r);
    this.writeColor(r);
    this.count++;
    return h;
  }
  private ref(h: InstanceHandle): InstanceRef | null {
    const r = this.refs[h];
    return r && r.set ? r : null;
  }
  setTransform(h: InstanceHandle, x: number, y: number, z: number, rotYRad: number, scale: number): void {
    const r = this.ref(h);
    if (!r) return;
    r.x = x; r.y = y; r.z = z; r.rot = rotYRad; r.scale = scale; r.matrix = false;
    this.write(r);
  }
  setMatrix(h: InstanceHandle, m: THREE.Matrix4): void {
    const r = this.ref(h);
    if (!r) return;
    r.matrix = true;
    const e = m.elements;
    r.x = e[12] as number; r.y = e[13] as number; r.z = e[14] as number;
    if (r.visible) (r.set as InstancedSet).mesh.setMatrixAt(r.slot, m);
    this.write(r);
  }
  setTint(h: InstanceHandle, red: number, green: number, blue: number): void {
    const r = this.ref(h);
    if (!r) return;
    r.tr = red; r.tg = green; r.tb = blue;
    this.writeColor(r);
  }
  setVisible(h: InstanceHandle, visible: boolean): void {
    const r = this.ref(h);
    if (!r || r.visible === visible) return;
    r.visible = visible;
    if (r.matrix) {
      // a matrix instance is hidden by a zero matrix and shown again by its owner's next setMatrix
      if (!visible) { this.m4.makeScale(0, 0, 0).setPosition(r.x, r.y, r.z); (r.set as InstancedSet).mesh.setMatrixAt(r.slot, this.m4); }
    }
    this.write(r);
  }
  remove(h: InstanceHandle): void {
    const r = this.ref(h);
    if (!r) return;
    const set = r.set as InstancedSet;
    r.visible = false; r.matrix = false;
    this.write(r);
    set.free.push(r.slot);
    // an empty set draws nothing at all
    if (set.free.length === set.used) { set.free.length = 0; set.used = 0; set.mesh.count = 0; }
    r.set = null;
    this.freeRefs.push(h);
    this.count--;
  }
  /** the light baked into an instance's colour (tests) */
  lightOf(h: InstanceHandle): [number, number, number] | null {
    const r = this.ref(h);
    return r ? [r.lr, r.lg, r.lb] : null;
  }
  get setCount(): number { return this.setList.length; }

  /** One glow per drawn instance of the glowing sets, into the quad batch; returns how many were written. */
  emitGlow(sink: GlowSink): number {
    const list = this.setList, cam = this.ctx.scene.camera.position;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const set = list[i] as InstancedSet;
      const g = set.glow;
      if (!g || set.mesh.count === 0 || !set.mesh.visible) continue;
      const m = set.mesh.instanceMatrix.array, c = g.color;
      for (let k = 0; k < set.mesh.count; k++) {
        const b = k * 16;
        // a hidden or free slot is a zero-scale matrix; a pooled one waits far under the world
        if ((m[b] as number) === 0 && (m[b + 1] as number) === 0 && (m[b + 2] as number) === 0) continue;
        if ((m[b + 13] as number) < -900) continue;
        const o = sink.next();
        if (o < 0) return n;
        const d = sink.data;
        // (`up` is along the instance's own Y, at its own scale: the band of a round drawn 3.4 times life size)
        const x = (m[b + 12] as number) + (m[b + 4] as number) * g.up, y = (m[b + 13] as number) + (m[b + 5] as number) * g.up, z = (m[b + 14] as number) + (m[b + 6] as number) * g.up;
        // drawn GLOW_PULL metres nearer in depth: coming at her, the stake's own dark end would sit in the glow's heart
        const dist = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
        d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = 0;
        d[o + 4] = 0; d[o + 5] = g.minPx; d[o + 6] = Math.min(0.5, g.pull / Math.max(dist, 0.5)); d[o + 7] = g.size;
        d[o + 8] = c.r; d[o + 9] = c.g; d[o + 10] = c.b; d[o + 11] = g.k;
        d[o + 12] = 0.95; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
        d[o + 16] = 1; d[o + 17] = 0; d[o + 18] = g.size; d[o + 19] = FLAG_ADD | FLAG_GLOW;
        n++;
      }
    }
    return n;
  }

  /** Once per frame: the bounds of the sets that changed, so a set out of view is culled as a whole. */
  update(): void {
    const list = this.setList;
    for (let i = 0; i < list.length; i++) {
      const set = list[i] as InstancedSet;
      if (!set.dirty) continue;
      set.dirty = false;
      if (set.mesh.count > 0) set.mesh.computeBoundingSphere();
    }
  }
  dispose(): void {
    for (const s of this.setList) { s.mesh.removeFromParent(); s.mesh.dispose(); }
    this.sets.clear(); this.setList.length = 0;
  }
}
