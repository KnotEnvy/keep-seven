// sandbox/render: the render piece's page (docs/workorders/code-render.md section 5). The real render system beside
// the five core stubs. Tier switch (min / Low / High) and the perf overlay are always on.
//   ?scene=zone:<id>   one of the seven zones: lightmaps, fog, sky, mood, the neighbours its cells show
//   ?scene=materials   every m_* on test meshes under each mood; the fixture room (lightmap + vertex light), layer and wrong_fade sliders
//   ?scene=vfx         every VfxId, line, ring, card and flash on a labelled grid, looping
//   ?scene=budget      the worst-case fight mock (&zone=<id> picks where; default plenty_street), firing every 0.48 s
//   ?scene=seventh     the ring, wrong_fade, the standing line (the "reduce flashes" button for the tint)
//   ?scene=cells       walk the real layout: the cell, its computed bound and the measured numbers
//   ?test=1            no real-time loop: drive it through window.__dbg (helpers under __dbg.ext.rsb)
import * as THREE from 'three';
import { createSandbox } from '../src/core/sandbox.ts';
import type { Sandbox } from '../src/core/sandbox.ts';
import type { CardKind, CheckpointId, FxHandle, LineKind, MoodId, RenderTier, VfxId, ZoneId } from '../src/core/contracts.ts';
import { createRenderSystem } from '../src/render/index.ts';
import { addCard, addLamps, buildFightMock } from '../src/render/dev/kit.ts';
import type { CardSpec, FightMock } from '../src/render/dev/kit.ts';

const ZONE_CHECKPOINT: Readonly<Record<ZoneId, CheckpointId>> = {
  the_lip: 'cp_lip_start', plenty_street: 'cp_street_clear', tally_house: 'cp_tally_hatch', the_gallery: 'cp_file_clear',
  lift_hall: 'cp_hall_gantry', the_bore: 'cp_boss_p1', far_rim: 'cp_rim',
};
const MOODS: readonly MoodId[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L5p', 'L6'];
const TIERS: readonly RenderTier[] = ['min', 'low', 'high'];
const ORIGIN: readonly [number, number, number] = [0, 500, 0];

/** the perf overlay is always on outside test mode */
if (!/[?&](test|perf)=1/.test(location.search)) {
  const q = new URLSearchParams(location.search);
  q.set('perf', '1');
  location.replace(location.pathname + '?' + q.toString());
}

interface State { sb: Sandbox | null; group: THREE.Group; cards: THREE.Mesh[]; mock: FightMock | null; shot: number; labels: { el: HTMLElement; at: THREE.Vector3 }[]; handles: FxHandle[]; loop: ((t: number) => void) | null }
const state: State = { sb: null, group: new THREE.Group(), cards: [], mock: null, shot: 0, labels: [], handles: [], loop: null };
state.group.name = 'render_sandbox';

function common(sb: Sandbox): void {
  const ctx = sb.ctx;
  state.sb = sb;
  ctx.scene.dynamic.add(state.group);
  sb.separator();
  for (const tier of TIERS) sb.button(tier, () => { ctx.quality.setTier(tier, 'user'); }, 'render tier');
  sb.separator();
  for (const mood of MOODS) sb.button(mood, () => { ctx.render.setMood(mood, 1.5); }, 'mood, cross-faded over 1.5 s');
  sb.separator();
  sb.button('reduce flashes', () => { ctx.options.set('reduceFlashes', !ctx.options.value.reduceFlashes); });
  const read = sb.readout('');
  const v = new THREE.Vector3();
  let frame = 0;
  sb.onFrame(() => {
    if (state.loop) state.loop(ctx.clock.simTime);
    // the readout and the labels are for a person: not drawn under ?test=1, and four times a second otherwise
    if (ctx.flags.test || (frame++ & 15) !== 0) return;
    const p = ctx.perf.last;
    read(`${p.tier}  ${p.drawCalls} calls  ${p.triangles} tris  ${((p.textureBytes + p.renderTargetBytes) / 1048576).toFixed(1)} MiB  ${p.programs} programs  fx ${p.particles}p ${p.decals}d`);
    // labels of the grid
    const cam = ctx.scene.camera;
    for (const l of state.labels) {
      v.copy(l.at).project(cam);
      const on = v.z > -1 && v.z < 1;
      l.el.style.display = on ? 'block' : 'none';
      if (on) { l.el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px'; l.el.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px'; }
    }
  });
  registerHelpers(sb);
}

function label(text: string, x: number, y: number, z: number): void {
  const el = document.createElement('div');
  el.className = 'label3d';
  el.textContent = text;
  document.body.appendChild(el);
  state.labels.push({ el, at: new THREE.Vector3(x, y, z) });
}

/** a 60 x 60 m floor far above the level (no zone: the current mood lights it), the player at its south end looking north */
async function testRoom(sb: Sandbox, surface: 'sand' | 'stone' = 'stone', z = 10): Promise<void> {
  await sb.room([{ shape: 'box', pos: [0, -0.5, 0], size: [240, 1, 240], rotY: 0, surface, role: 'floor' }], [0, 0, z], 0);
}

// ---- scenes ---------------------------------------------------------------------------------------------------------
async function sceneZone(sb: Sandbox): Promise<void> {
  const wanted = (sb.params.get('scene') ?? '').split(':')[1] ?? 'the_lip';
  const zone = (wanted in ZONE_CHECKPOINT ? wanted : 'the_lip') as ZoneId;
  await sb.start(ZONE_CHECKPOINT[zone]);
  sb.separator();
  for (const z of Object.keys(ZONE_CHECKPOINT)) sb.button(z, () => { const q = new URLSearchParams(location.search); q.set('scene', 'zone:' + z); location.search = q.toString(); });
}

async function sceneMaterials(sb: Sandbox): Promise<void> {
  const ctx = sb.ctx;
  await testRoom(sb);
  const [ox, oy, oz] = ORIGIN;
  // every material name on a card, with the bake classes it can meet
  const names: [string, CardSpec['bake'], number][] = [
    ['m_frontier', 'VL', 0x6e4e38], ['m_pellam', 'VL', 0xcfd6cc], ['m_sand', 'VL', 0xcda070], ['m_flat', 'UNLIT', 0xa3563a], ['m_mask', 'VL', 0x3a3a40],
    ['m_prop', 'AO', 0x5e4636], ['m_gun', 'AO', 0x1c2230],
  ];
  names.forEach(([material, bake, color], i) => {
    const x = ox - 6 + i * 2;
    state.cards.push(addCard(ctx, state.group, { color, material, bake, x, y: oy + 1.2, z: oz + 4, w: 1.6, h: 1.6, name: material }));
    label(material + ' ' + bake, x, oy + 2.2, oz + 4);
  });
  const lamps = addLamps(ctx, state.group, 6, ox + 0, oy + 2.8, oz + 4);
  label('m_emis lamp set', ox, oy + 3.1, oz + 4);
  ctx.render.lamps.setCount(lamps, 4);
  // the pipeline's fixture room: a lightmapped floor and vertex-lit walls in one mesh, and a light layer
  try {
    await sb.loadOverlay('tests/pipeline/fixtures/manifest.json');
    await sb.activate(['fixture_room']);
    const room = ctx.assets.instantiate('fixture_room');
    room.root.position.set(ox + 12, oy + 0.02, oz + 2);
    room.root.updateMatrixWorld(true);
    room.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && /collider/.test(m.name)) m.visible = false; });
    state.group.add(room.root);
    label('fixture_room: lightmap + vertex light + layer', ox + 12, oy + 3.2, oz + 2);
  } catch (err) {
    console.warn('sandbox/render: the fixture room is not built (run node --test tests/pipeline/ once): ' + String(err));
  }
  sb.separator();
  let layer = 0, wrong = 0;
  sb.button('layer +', () => { layer = Math.min(1, layer + 0.25); ctx.render.setLightLayer('lm_fixture_room_layer', layer, 0.5); }, 'light layer weight');
  sb.button('layer -', () => { layer = Math.max(0, layer - 0.25); ctx.render.setLightLayer('lm_fixture_room_layer', layer, 0.5); });
  sb.button('wrong_fade +', () => { wrong = Math.min(1, wrong + 0.25); ctx.render.setWrongFade(wrong); });
  sb.button('wrong_fade -', () => { wrong = Math.max(0, wrong - 0.25); ctx.render.setWrongFade(wrong); });
  const mood = sb.params.get('mood');
  if (mood && (MOODS as readonly string[]).includes(mood)) ctx.render.setMood(mood as MoodId, 0);
}

const LINES: readonly LineKind[] = ['tracer', 'ricochet', 'line_round', 'sighting_thread', 'lance_thread', 'relight_thread', 'standing_line', 'aqua_thread'];
const CARDS: readonly CardKind[] = ['sun_blade', 'sun_patch', 'lance', 'mouth_glow', 'aim_star', 'halo', 'last_fire', 'dowser_glint', 'sand_thread'];

/** A label drawn INTO the canvas (the evidence frames carry it): white text on a card facing south, unlit. */
function canvasLabel(text: string, x: number, y: number, z: number, width = 1.15): void {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 40;
  const g = c.getContext('2d');
  if (!g) return;
  g.font = '600 24px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0, 0, 0, 0.85)'; g.fillStyle = '#ffffff';
  g.strokeText(text, 128, 21, 250); g.fillText(text, 128, 21, 250);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 40 / 256), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, color: 0x8a8a8a }));
  mesh.position.set(x, y, z);
  mesh.renderOrder = 30;
  state.group.add(mesh);
}

/** the grid of the vfx scene: pages of six bursts (3 x 2), each read from 3.5 m; lines, cards and the floor effects beside them */
const VFX_ALL: readonly VfxId[] = [
  'impact_sand', 'impact_wood', 'impact_adobe', 'impact_metal', 'impact_ceramic', 'impact_stone', 'impact_cloth', 'powder_smoke', 'knot_burst', 'bider_freed',
  'bider_felled', 'transit_death', 'vent_open', 'stake_stick', 'stake_burst', 'slam_dust', 'charge_sparks', 'plate_spark', 'canister_burst', 'guard_shatter',
  'jug_burst', 'insulator_break', 'bottle_break', 'pickup_glint', 'lamp_answer', 'dust_short', 'embers', 'steam', 'lance_sparks',
];
const VFX_PER_PAGE = 6, VFX_PAGES = Math.ceil(VFX_ALL.length / VFX_PER_PAGE);
const VFX_PAGE_GAP = 9, VFX_LINES_X = -27, VFX_CARDS_X = 24.5;
function vfxSpot(i: number): [number, number, number] {
  const page = Math.floor(i / VFX_PER_PAGE), k = i % VFX_PER_PAGE;
  return [ORIGIN[0] + (page - (VFX_PAGES - 1) / 2) * VFX_PAGE_GAP + ((k % 3) - 1) * 1.35, ORIGIN[1] + 3.9 - Math.floor(k / 3) * 1.5, ORIGIN[2] + 1];
}
/** where to stand to read a part of the grid: [x, y (feet), z, yaw degrees] */
function vfxView(name: string): [number, number, number, number] {
  const [ox, oy, oz] = ORIGIN;
  if (name === 'lines') return [ox + VFX_LINES_X + 1.5, oy, oz + 5.2, 0];
  if (name === 'cards') return [ox + VFX_CARDS_X + 1.5, oy, oz + 6.4, 0];
  if (name === 'floor') return [ox + 0.5, oy, oz + 9.6, 0];
  const page = Math.max(0, Math.min(VFX_PAGES - 1, Number(name) | 0));
  return [ox + (page - (VFX_PAGES - 1) / 2) * VFX_PAGE_GAP, oy, oz + 4.5, 0];
}
function vfxRound(page: number): void {
  const fx = state.sb?.ctx.render.vfx;
  if (!fx) return;
  for (let i = page * VFX_PER_PAGE; i < Math.min(VFX_ALL.length, (page + 1) * VFX_PER_PAGE); i++) { const [x, y, z] = vfxSpot(i); fx.burst(VFX_ALL[i] as VfxId, x, y, z, 0, 1, 0.3); }
}
function vfxOneShots(round: number): void {
  const fx = state.sb?.ctx.render.vfx;
  if (!fx) return;
  const [ox, oy, oz] = ORIGIN;
  LINES.slice(0, 3).forEach((kind, i) => { const x = ox + VFX_LINES_X, y = oy + 4.3 + i * 0.4, z = oz + 1; fx.line(kind, x, y, z, x + 3, y, z - 1); });
  fx.ring('canister', ox - 0.5, oy, oz + 6, 1.0, 1.0, 0.5);
  fx.ring('slam', ox + 2.5, oy, oz + 6, 1.0, 1.0, 0.5);
  fx.muzzleFlash(round % 3 === 0 ? 'kept' : round % 3 === 1 ? 'lead' : 'line', ox - 2, oy + 1.0, oz + 7);
  for (let d = 0; d < 5; d++) fx.decal(['wood', 'adobe', 'metal', 'ceramic', 'stone'][d] as 'wood', ox + 4.2 + d * 0.3, oy + 0.01, oz + 7, 0, 1, 0);
}

async function sceneVfx(sb: Sandbox): Promise<void> {
  const ctx = sb.ctx, fx = ctx.render.vfx;
  await testRoom(sb, 'stone', 10);
  const mood = sb.params.get('mood');
  ctx.render.setMood(mood && (MOODS as readonly string[]).includes(mood) ? (mood as MoodId) : 'L3', 0);   // a dark room: every effect reads
  const [ox, oy, oz] = ORIGIN;
  // the names are drawn into the canvas (not DOM labels): the evidence frames and a person see the same thing
  const both = (text: string, x: number, y: number, z: number): void => { canvasLabel(text, x, y, z); };
  VFX_ALL.forEach((id, i) => { const [x, y, z] = vfxSpot(i); both(id, x, y - 0.62, z); });
  // persistent things: lines to the left, cards to the right, rings, the blob, the flash and the decals on the floor in front
  both('decals', ox + 4.8, oy + 0.3, oz + 7);
  LINES.forEach((kind, i) => {
    const h = fx.acquireLine(kind);
    const x = ox + VFX_LINES_X, y = oy + 0.5 + i * 0.45, z = oz + 1;
    if (h) { h.setPosition(x, y, z); h.setEnd(x + 3, y + 0.15, z - 1); h.setLevel(0.7); state.handles.push(h); }
    both(kind, x + 0.6, y + 0.2, z);
  });
  CARDS.forEach((kind, i) => {
    const h = fx.acquireCard(kind);
    const x = ox + VFX_CARDS_X + (i % 3) * 1.5, y = oy + 0.9 + Math.floor(i / 3) * 1.3, z = oz + 2;
    if (h) {
      h.setPosition(x, y, z); h.setLevel(0.85);
      if (kind === 'sun_blade') { h.setPosition(x - 0.4, y + 0.9, z - 1); h.setEnd(x + 0.5, y - 0.8, z + 0.5); } else if (kind === 'sun_patch') h.setEnd(x, y, z + 0.3);
      else h.setEnd(x + 1.1, y + 0.2, z);
      state.handles.push(h);
    }
    both(kind, x, y + 0.55, z);
  });
  const blob = fx.blobShadow();
  if (blob) { blob.setPosition(ox - 3, oy, oz + 6); state.handles.push(blob); both('blobShadow', ox - 3, oy + 0.3, oz + 6); }
  both('ring canister', ox - 0.5, oy + 0.3, oz + 6); both('ring slam', ox + 2.5, oy + 0.3, oz + 6); both('muzzleFlash', ox - 2, oy + 0.55, oz + 7);
  // looping: one page of bursts every 0.3 s (all 29 at once from 3.5 m would run into the overdraw caps), the one-shots every 1.5 s
  let next = 0, step = 0;
  state.loop = (t) => {
    if (ctx.flags.test || t < next) return;
    next = t + 0.3;
    const page = step % VFX_PAGES;
    if (page === 0) vfxOneShots(Math.floor(step / VFX_PAGES));
    vfxRound(page);
    step++;
  };
  sb.separator();
  const go = (name: string): void => { const [x, y, z, yaw] = vfxView(name); ctx.player.teleport(x, y, z, yaw, /^\d/.test(name) ? 26 : name === 'floor' ? -16 : 5); };
  for (let p = 0; p < VFX_PAGES; p++) sb.button('page ' + (p + 1), () => { go(String(p)); }, 'stand 3.5 m from six bursts');
  for (const name of ['lines', 'cards', 'floor']) sb.button(name, () => { go(name); });
}

async function sceneBudget(sb: Sandbox): Promise<void> {
  const ctx = sb.ctx;
  const wanted = sb.params.get('zone') ?? 'plenty_street';
  const zone = (wanted in ZONE_CHECKPOINT ? wanted : 'plenty_street') as ZoneId;
  await sb.start(ZONE_CHECKPOINT[zone]);
  ctx.player.setGodMode(true);
  await sb.activate(['enemy_bider', 'enemy_transit', 'enemy_tamper', 'proj_stake']);
  const p = ctx.player.position;
  state.mock = buildFightMock(ctx, p.x, p.y, p.z, ctx.player.yaw);
  // the loop fires every 0.48 s of game time (29 ticks) and advances the mock's mixers (not under ?test=1: the mixers are
  // the enemies' cost, 3.4 KB a tick of three's AnimationMixer for six of them, and the allocation test measures render's)
  let next = 0, last = ctx.clock.simTime;
  const animate = !ctx.flags.test || sb.params.get('animate') === '1';
  state.loop = (t) => {
    const dt = Math.max(0, t - last); last = t;
    if (state.mock && animate) for (const e of state.mock.enemies) if (e.mixer) e.mixer.update(dt);
    if (t >= next && state.mock) { next = t + 0.48; state.mock.fire(state.shot++); }
  };
  sb.separator();
  for (const z of Object.keys(ZONE_CHECKPOINT)) sb.button(z, () => { const q = new URLSearchParams(location.search); q.set('scene', 'budget'); q.set('zone', z); location.search = q.toString(); });
}

async function sceneSeventh(sb: Sandbox): Promise<void> {
  const ctx = sb.ctx;
  await sb.start('cp_boss_p3');
  ctx.player.setGodMode(true);
  const boss = ctx.data.layout.markers.find((m) => m.id === 'sp_windlass');
  const at = boss ? boss.pos : [14, -44, 96];
  sb.separator();
  sb.button('fire the seventh', () => { ctx.events.emit('boss/proven', { x: at[0] as number, y: at[1] as number, z: at[2] as number }); }, 'boss/proven: the ring');
  sb.button('reset', () => { ctx.render.setWrongFade(0); ctx.render.setMood('L5', 0.5); });
}

async function sceneCells(sb: Sandbox): Promise<void> {
  const ctx = sb.ctx;
  const cp = sb.params.get('cp');
  await sb.start((cp as CheckpointId | null) ?? 'cp_lip_start');
  ctx.player.setGodMode(true);
  sb.separator();
  const read = sb.readout('');
  const cells = ctx.data.manifest.visibility.cells;
  sb.onFrame(() => {
    const p = ctx.perf.last;
    const cell = cells.find((c) => c.id === ctx.world.cell);
    read(cell ? `${cell.id}: ${p.drawCalls} / ${cell.budget.drawCalls.typical} (${cell.budget.drawCalls.worst}) calls, ${p.triangles} / ${cell.budget.triangles} tris` : 'no cell');
  });
  for (const id of ['cp_lip_start', 'cp_street_clear', 'cp_yard_clear', 'cp_tally_hatch', 'cp_gallery_bay', 'cp_file_clear', 'cp_hall_gantry', 'cp_bore_ante', 'cp_rim'] as CheckpointId[]) {
    sb.button(id.replace('cp_', ''), () => { const q = new URLSearchParams(location.search); q.set('scene', 'cells'); q.set('cp', id); location.search = q.toString(); });
  }
}

// ---- helpers for tests (__dbg.ext.rsb) ------------------------------------------------------------------------------
function registerHelpers(sb: Sandbox): void {
  const ctx = sb.ctx;
  const fn = <T extends unknown[], R>(f: (...args: T) => R): ((...args: never[]) => unknown) => f as unknown as (...args: never[]) => unknown;
  ctx.debug.register('rsb', {
    /** a flat floor far above the level; the player at (0, 0, 10) of it looking north */
    room: fn((surface?: 'sand' | 'stone') => testRoom(sb, surface ?? 'stone')),
    /** a test card (positions relative to the room's origin); returns its index */
    card: fn((s: CardSpec) => { state.cards.push(addCard(ctx, state.group, { ...s, x: s.x + ORIGIN[0], y: s.y + ORIGIN[1], z: s.z + ORIGIN[2] })); return state.cards.length - 1; }),
    clearCards: fn(() => { for (const c of state.cards) { c.removeFromParent(); c.geometry.dispose(); } state.cards.length = 0; }),
    lamps: fn((count: number, x: number, y: number, z: number, group?: number) => { const m = addLamps(ctx, state.group, count, x + ORIGIN[0], y + ORIGIN[1], z + ORIGIN[2], 0.12, 0.2, group ?? 0); state.cards.push(m); return state.cards.length - 1; }),
    lampCount: fn((index: number, n: number) => { ctx.render.lamps.setCount(state.cards[index] as THREE.Mesh, n); }),
    lampMask: fn((index: number, mask: number) => { ctx.render.lamps.setMask(state.cards[index] as THREE.Mesh, mask); }),
    lampBoost: fn((index: number, boost: number) => { ctx.render.lamps.setBoost(state.cards[index] as THREE.Mesh, boost); }),
    origin: fn(() => ORIGIN.slice()),
    /** the vfx scene: the place to read a part of the grid from ('0'..'4', 'lines', 'cards', 'floor') as [x, y, z, yaw] */
    vfxView: fn((name: string) => vfxView(name)),
    vfxPages: fn(() => VFX_PAGES),
    /** the vfx scene: bursts the six effects of a page now / fires the rings, the flash, the one-shot lines and the decals */
    vfxRound: fn((page: number) => { vfxRound(page); }),
    vfxOneShots: fn((round: number) => { vfxOneShots(round); }),
    /** canvas pixel of a point given relative to the room's origin (x from the left, y from the top) and whether it is in front */
    project: fn((x: number, y: number, z: number, world?: boolean) => {
      const cam = ctx.scene.camera;
      cam.updateMatrixWorld(true);
      const v = new THREE.Vector3(x + (world ? 0 : ORIGIN[0]), y + (world ? 0 : ORIGIN[1]), z + (world ? 0 : ORIGIN[2])).project(cam);
      const c = ctx.render.renderer.domElement;
      return { x: (v.x + 1) / 2 * c.width, y: (1 - v.y) / 2 * c.height, inFront: v.z > -1 && v.z < 1 };
    }),
    /** loads the pipeline's fixture overlay and activates ids of it */
    fixtures: fn(async (ids: string[]) => { await sb.loadOverlay('tests/pipeline/fixtures/manifest.json'); await sb.activate(ids); return true; }),
    /** the fight mock at the player's place; returns what it built */
    mock: fn(async () => {
      await sb.activate(['enemy_bider', 'enemy_transit', 'enemy_tamper', 'proj_stake']);
      const p = ctx.player.position;
      if (state.mock) state.mock.dispose();
      state.mock = buildFightMock(ctx, p.x, p.y, p.z, ctx.player.yaw);
      return { enemies: state.mock.enemies.length, stakes: state.mock.stakes.length };
    }),
    /** one shot of the mock (flash, pulse, smoke, tracer, impact, decal) */
    fire: fn(() => { if (state.mock) state.mock.fire(state.shot++); }),
    /** advances the mock's mixers by `seconds` */
    animate: fn((seconds: number) => { if (state.mock) for (const e of state.mock.enemies) if (e.mixer) e.mixer.update(seconds); }),
    /** acquires up to `n` handles of a line or card kind; returns how many were handed out */
    acquireLines: fn((kind: LineKind, n: number) => { let got = 0; for (let i = 0; i < n; i++) { const h = ctx.render.vfx.acquireLine(kind); if (h) { got++; state.handles.push(h); } } return got; }),
    acquireCards: fn((kind: CardKind, n: number) => { let got = 0; for (let i = 0; i < n; i++) { const h = ctx.render.vfx.acquireCard(kind); if (h) { got++; state.handles.push(h); } } return got; }),
    /** places the last `n` handles: positions relative to the room's origin */
    place: fn((index: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, level: number) => {
      const h = state.handles[index];
      if (!h) return false;
      h.setPosition(ax + ORIGIN[0], ay + ORIGIN[1], az + ORIGIN[2]); h.setEnd(bx + ORIGIN[0], by + ORIGIN[1], bz + ORIGIN[2]); h.setLevel(level);
      return true;
    }),
    handles: fn(() => state.handles.length),
    releaseAll: fn(() => { for (const h of state.handles) h.release(); state.handles.length = 0; }),
    /** an instance of an active asset added to the view-model group, as code-player does (no transform of the group) */
    viewModel: fn(async (asset: string) => {
      await sb.activate([asset]);
      const inst = ctx.assets.instantiate(asset);
      ctx.scene.viewModel.add(inst.root);
      return true;
    }),
    /** a dynamic asset standing in the room: returns the name of its root */
    spawn: fn(async (asset: string, x: number, y: number, z: number, world?: boolean) => {
      await sb.activate([asset]);
      const inst = ctx.assets.instantiate(asset);
      if (world) inst.root.position.set(x, y, z); else inst.root.position.set(x + ORIGIN[0], y + ORIGIN[1], z + ORIGIN[2]);
      state.group.add(inst.root);
      state.cards.push(inst.root as THREE.Mesh);
      return state.cards.length - 1;
    }),
    outline: fn((index: number) => { ctx.render.setOutline(index < 0 ? null : (state.cards[index] as THREE.Object3D)); }),
    emissive: fn((index: number, scale: number) => { ctx.render.setEmissive(state.cards[index] as THREE.Object3D, scale); }),
    lightOfCard: fn((index: number) => {
      let out: number[] | null = null;
      const ext = (window as unknown as { __dbg: { ext: { render: { lightOf: (o: THREE.Object3D) => number[] | null } } } }).__dbg.ext.render;
      (state.cards[index] as THREE.Object3D).traverse((o) => { if (!out) out = ext.lightOf(o); });
      return out;
    }),
  });
}

void createSandbox({
  piece: 'render',
  systems: { render: createRenderSystem },
  scene: {
    layout: async (sb) => { common(sb); await sb.start('cp_lip_start'); },
    room: async (sb) => { common(sb); await testRoom(sb); },
    zone: async (sb) => { common(sb); await sceneZone(sb); },
    materials: async (sb) => { common(sb); await sceneMaterials(sb); },
    vfx: async (sb) => { common(sb); await sceneVfx(sb); },
    budget: async (sb) => { common(sb); await sceneBudget(sb); },
    seventh: async (sb) => { common(sb); await sceneSeventh(sb); },
    cells: async (sb) => { common(sb); await sceneCells(sb); },
  },
});
