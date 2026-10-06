// Sandbox and test helpers of the render piece (never imported by the game: only by sandbox/render.ts). They build
// test geometry through the REAL material factory (`ctx.render.material`), so a card on a sandbox page is drawn by the
// same programs as the level. Allocation is free here: nothing of this runs in play.
import * as THREE from 'three';
import type { AssetDef, GameContext, SurfaceType, VfxId } from '../../core/contracts.ts';
import { VERTEX_LIGHT_SCALE } from '../../core/contracts.ts';

export interface CardSpec {
  /** sRGB hex of the tint */
  color: number;
  x: number; y: number; z: number; w: number; h: number;
  /** Blender material name (default m_flat) */
  material?: string;
  /** bake class written on the mesh: UNLIT (colour as authored), VL (COLOR_0 = tint x light / 2), AO (dynamic light) */
  bake?: 'UNLIT' | 'VL' | 'AO' | 'LM';
  /** linear light multiplier baked into a VL card (the bake's output on that face), per channel */
  light?: [number, number, number];
  /** degrees about +Y; 0 faces +Z (toward a camera looking down -Z) */
  yawDeg?: number;
  /** lay it flat, facing up */
  floor?: boolean;
  /** LM: the lightmap texture id; every vertex's UV1 sits on its neutral texel (a vertex-lit vertex of a lightmapped mesh) */
  lightmap?: string;
  name?: string;
}

/** A flat test card with COLOR_0, through the real factory. Added under scene.dynamic. */
export function addCard(ctx: GameContext, group: THREE.Object3D, s: CardSpec): THREE.Mesh {
  const g = new THREE.PlaneGeometry(s.w, s.h, 1, 1);
  const c = new THREE.Color(s.color);        // linear
  const bake = s.bake ?? 'UNLIT';
  const k = bake === 'VL' || bake === 'LM' ? 1 / VERTEX_LIGHT_SCALE : 1;
  const light = s.light ?? [1, 1, 1];
  const colors = new Float32Array(4 * 3);
  for (let i = 0; i < 4; i++) { colors[i * 3] = c.r * light[0] * k; colors[i * 3 + 1] = c.g * light[1] * k; colors[i * 3 + 2] = c.b * light[2] * k; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  const mesh = new THREE.Mesh(g);
  mesh.name = s.name ?? 'card';
  mesh.userData.bake = bake;
  if (bake === 'LM' && s.lightmap) {
    const at = ctx.data.manifest.textures[s.lightmap]?.neutralTexel?.uv ?? [0, 0];
    g.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array([at[0], at[1], at[0], at[1], at[0], at[1], at[0], at[1]]), 2));
    mesh.userData.lightmap = s.lightmap;
  }
  mesh.userData.placeholder = true;
  mesh.material = ctx.render.material(s.material ?? 'm_flat', mesh, null);
  mesh.position.set(s.x, s.y, s.z);
  if (s.floor) mesh.rotation.x = -Math.PI / 2; else mesh.rotation.y = (s.yawDeg ?? 0) * Math.PI / 180;
  mesh.updateMatrixWorld(true);
  group.add(mesh);
  return mesh;
}

/** An emissive lamp-set mesh of `count` quads in a row (UV1.x = lamp index), through the real factory. */
export function addLamps(ctx: GameContext, group: THREE.Object3D, count: number, x: number, y: number, z: number, size = 0.12, gap = 0.2, flickerGroup = 0): THREE.Mesh {
  const pos = new Float32Array(count * 18), uv1 = new Float32Array(count * 12), col = new Float32Array(count * 18);
  for (let i = 0; i < count; i++) {
    const x0 = (i - (count - 1) / 2) * gap - size / 2, x1 = x0 + size, y0 = -size / 2, y1 = size / 2;
    pos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0], i * 18);
    for (let v = 0; v < 6; v++) { uv1[i * 12 + v * 2] = (i + 0.5) / count; uv1[i * 12 + v * 2 + 1] = 0.5; col[i * 18 + v * 3] = 1; col[i * 18 + v * 3 + 1] = flickerGroup; col[i * 18 + v * 3 + 2] = 1; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g);
  mesh.name = 'test_lamps';
  mesh.userData.lampCount = count;
  mesh.userData.placeholder = true;
  mesh.material = ctx.render.material('m_emis', mesh, null);
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  group.add(mesh);
  return mesh;
}

export interface FightMock { group: THREE.Group; enemies: { root: THREE.Object3D; mixer: THREE.AnimationMixer | null }[]; stakes: number[]; fire: (shot: number) => void; dispose: () => void }

const SURFACES: readonly SurfaceType[] = ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth'];

/**
 * The worst-case fight (code-render 5, `budget`): 6 skinned enemies, 18 stuck stakes and 8 in flight (one instanced
 * set), 48 decals, 2 canister rings and a slam ring, every line and card pool full, blob shadows. `fire(n)` is one shot:
 * flash, pulse, smoke, tracer, an impact and a decal, as the events of a real shot would ask for.
 * The assets must be active (the surface or the underground set, or sandbox.activate).
 */
export function buildFightMock(ctx: GameContext, cx: number, cy: number, cz: number, yawRad: number): FightMock {
  const group = new THREE.Group();
  group.name = 'fight_mock';
  ctx.scene.dynamic.add(group);
  const fx = ctx.render.vfx, f = { x: -Math.sin(yawRad), z: -Math.cos(yawRad) }, r = { x: Math.cos(yawRad), z: -Math.sin(yawRad) };
  const at = (ahead: number, side: number): [number, number] => [cx + f.x * ahead + r.x * side, cz + f.z * ahead + r.z * side];
  const enemies: FightMock['enemies'] = [];
  const kinds = ['enemy_bider', 'enemy_bider', 'enemy_bider', 'enemy_bider', 'enemy_transit', 'enemy_tamper'];
  let n = 0;
  for (const kind of kinds) {
    const id = ctx.assets.isActive(kind) ? kind : 'enemy_bider';
    if (!ctx.assets.isActive(id)) continue;
    const inst = ctx.assets.instantiate(id);
    const [x, z] = at(5 + (n % 3) * 2.5, (n - 2.5) * 1.8);
    inst.root.position.set(x, cy, z);
    inst.root.rotation.y = yawRad + Math.PI;
    group.add(inst.root);
    const def = ctx.data.manifest.assets[id] as AssetDef;
    const clip = def.animations.find((a) => a.loop) ?? def.animations[0];
    if (clip && inst.mixer) inst.action(clip.name).play();
    enemies.push({ root: inst.root, mixer: inst.mixer });
    const blob = fx.blobShadow();
    if (blob) blob.setPosition(x, cy, z);
    n++;
  }
  const stakes: number[] = [];
  if (ctx.assets.isActive('proj_stake')) {
    for (let i = 0; i < 18; i++) { const [x, z] = at(3 + (i % 6) * 1.5, -4 + Math.floor(i / 6) * 4); stakes.push(ctx.render.instances.add('proj_stake', 'stake_cool', x, cy + 0.3, z, i, 1)); }
    for (let i = 0; i < 8; i++) { const [x, z] = at(2 + i * 1.2, (i - 4) * 0.7); stakes.push(ctx.render.instances.add('proj_stake', 'stake_hot', x, cy + 1.3, z, i * 0.7, 1)); }
  }
  // every pool full
  for (let i = 0; i < 48; i++) { const [x, z] = at(6 + (i % 8) * 0.5, -3 + Math.floor(i / 8)); fx.decal(SURFACES[1 + (i % 5)] as SurfaceType, x, cy + 0.01, z, 0, 1, 0); }
  { const [x, z] = at(6, -3); fx.ring('canister', x, cy, z, 3.5, 1.0, 3600); }
  { const [x, z] = at(7, 3); fx.ring('canister', x, cy, z, 3.5, 1.0, 3600); }
  { const [x, z] = at(9, 0); fx.ring('slam', x, cy, z, 3.5, 1.0, 3600); }
  const kindsOfLine = ['sighting_thread', 'lance_thread', 'relight_thread', 'standing_line', 'aqua_thread'] as const;
  for (const kind of kindsOfLine) {
    for (let i = 0; i < 8; i++) {
      const h = fx.acquireLine(kind);
      if (!h) break;
      const [x, z] = at(4 + i, -5 + i * 1.3);
      h.setPosition(x, cy + 1.5, z); h.setEnd(cx, cy + 1.2, cz); h.setLevel(0.7);
    }
  }
  const kindsOfCard = ['mouth_glow', 'aim_star', 'halo', 'lance', 'sand_thread', 'dowser_glint', 'last_fire'] as const;
  for (const kind of kindsOfCard) {
    for (let i = 0; i < 16; i++) {
      const h = fx.acquireCard(kind);
      if (!h) break;
      const [x, z] = at(6 + (i % 4), -3 + i * 0.5);
      h.setPosition(x, cy + 1.2 + (i % 3) * 0.4, z); h.setEnd(x + 2, cy + 1.2, z + 1); h.setLevel(0.8);
    }
  }
  const fire = (shot: number): void => {
    const mx = cx + f.x * 0.56 + r.x * 0.075, my = cy + 1.58, mz = cz + f.z * 0.56 + r.z * 0.075;
    const [ex, ez] = at(8 + (shot % 5), ((shot * 7) % 9) - 4);
    fx.muzzleFlash('lead', mx, my, mz);
    fx.burst('powder_smoke', mx, my, mz, f.x, 0, f.z);
    fx.line('tracer', mx, my, mz, ex, cy + 0.9, ez);
    const surface = SURFACES[shot % SURFACES.length] as SurfaceType;
    fx.burst(('impact_' + surface) as VfxId, ex, cy + 0.9, ez, -f.x, 0.2, -f.z);
    fx.decal(surface, ex, cy + 0.02, ez, 0, 1, 0);
    ctx.render.addTrauma(0.25);
  };
  const dispose = (): void => { for (const h of stakes) ctx.render.instances.remove(h); group.removeFromParent(); };
  return { group, enemies, stakes, fire, dispose };
}
