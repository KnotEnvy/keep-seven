// Generates design/assets.json — the asset manifest (docs/ARCHITECTURE.md sections 7, 8 and 9).
// Change this generator, never the JSON, then run:
//   node tools/gen_assets.mjs && node tools/validate_assets.mjs
// Sources: docs/GDD.md (clip tables, ids, cut order 20.1), docs/ART_BIBLE.md section 4 (textures) and 7 (assets),
// design/layout.json (opening sizes, cage sizes, markers: read here so the manifest cannot drift from the blockout).
// Where this file renames a node the art bible lists (lamp sets, variant nodes, boss bones), this file wins
// (ART_BIBLE.md header) and docs/ARCHITECTURE.md section 7.6 lists every difference.
//
// Revision 2 (after the pre-production critic round):
//   - every asset and clip has a `priority` (0 | 1 | 2) and props are split into two sub-owners
//   - every binding has a `mode`; `offset`, `nodePos` and `hitPoint` tie marker positions to asset pivots
//   - zone GLBs have an explicit chunk plan; `visibility.cells` says what is drawn from where;
//     per-zone triangle and draw-call numbers are COMPUTED from that (everything drawn while the player is in the zone)
//   - render-target memory is computed per quality tier; Medium is gone; a hidden `min` tier exists
//   - no in-file instancing (gltf-transform instance()) anywhere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cellBudget, markerBindings, renderTargetBytes } from './validate_assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'design/assets.json');
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const marker = (id) => { const m = L.markers.find((x) => x.id === id); if (!m) throw new Error(`gen_assets: layout marker ${id} missing`); return m; };

// ---------------------------------------------------------------- helpers
const range = (prefix, n, from = 1) => Array.from({ length: n }, (_, i) => `${prefix}${i + from}`);
/** clip(name, seconds, { loop, priority, fallback }) — priority defaults to the asset's */
const clip = (name, seconds, o = {}) => ({ name, loop: o.loop ?? false, seconds, ...(o.priority !== undefined ? { priority: o.priority } : {}), ...(o.fallback ? { fallback: o.fallback } : {}) });
const loop = (name, seconds, o = {}) => clip(name, seconds, { ...o, loop: true });
const ALL_SETS = ['surface', 'underground', 'coda'];
const r3 = (n) => +n.toFixed(3);

/** Opening size [w, h] shared by every door marker in `ids` (throws when they differ). */
function opening(...ids) {
  const sizes = ids.map((id) => marker(id).size);
  for (const s of sizes) if (!s || s[0] !== sizes[0][0] || s[1] !== sizes[0][1]) throw new Error(`gen_assets: door markers ${ids} do not share one opening size`);
  return [sizes[0][0], sizes[0][1]];
}
/** Cage interior [w, h, d] of a ride from nav.portals. */
function cage(rideId) {
  const p = L.nav.portals.find((x) => x.id === rideId);
  if (!p) throw new Error(`gen_assets: nav.portals has no ${rideId}`);
  return p.cageInterior;
}

const OWNER_DIR = { props_mech: 'props/mech', props_dress: 'props/dress' };
const assets = {};
/**
 * @param {string} id
 * @param {object} a  owner, category, triBudget, priority, size (placeholder [x,y,z] metres, game space) are required.
 *   anchor: where the pivot sits in the placeholder box:
 *     base (bottom centre) | centre | top (top centre) | back (centre of the back face, asset faces +Z) |
 *     back_base (bottom edge of the back face) | hinge (bottom of the -X edge) | world (authored in world coordinates)
 *   rigid: moving parts of a rigid-skinned prop (becomes skinned: true, bones: ['root', ...rigid]; the parts are also listed first in nodes)
 */
function asset(id, a) {
  if (assets[id]) throw new Error(`duplicate asset ${id}`);
  if (![0, 1, 2].includes(a.priority)) throw new Error(`asset ${id}: priority 0|1|2 required`);
  // `rigid: [parts]` = a multi-part animated prop: ONE rigid-skinned mesh per material (one weight per vertex) on a small
  // armature `root` + one bone per moving part, so it stays at one draw call per material (ARCHITECTURE 7.2).
  // As on every skinned asset, a name in both `bones` and `nodes` IS the bone (`nodes` = every name code may look up).
  if (a.rigid && (a.skinned !== undefined || a.bones)) throw new Error(`asset ${id}: use either rigid or skinned + bones`);
  if (a.rigid) a = { ...a, skinned: true, bones: ['root', ...a.rigid], nodes: [...a.rigid, ...(a.nodes ?? [])] };
  const skinned = a.skinned ?? false;
  const materials = a.materials ?? ['m_prop'];
  const lampSetCount = Object.keys(a.lampSets ?? {}).length;
  // one draw call per non-emissive material, one per lamp set (or one for a static m_emis part)
  const minCalls = materials.filter((m) => m !== 'm_emis').length + (materials.includes('m_emis') ? Math.max(1, lampSetCount) : 0);
  assets[id] = {
    path: `assets/${a.category}/${id}.glb`,
    source: a.source ?? `blender/${OWNER_DIR[a.owner] ?? a.owner}/${id}.py`,
    owner: a.owner,
    category: a.category,
    priority: a.priority,
    triBudget: a.triBudget,
    drawCalls: a.drawCalls ?? minCalls,
    materials,
    bake: a.bake ?? 'AO',
    skinned,
    ...(a.bones ? { bones: a.bones } : {}),
    nodes: a.nodes ?? [],
    ...(a.nodePos ? { nodePos: a.nodePos } : {}),
    ...(a.hitPoint ? { hitPoint: a.hitPoint } : {}),
    ...(a.lampSets ? { lampSets: a.lampSets } : {}),
    ...(a.codeDriven ? { codeDriven: a.codeDriven } : {}),
    animations: (a.animations ?? []).map((c) => ({ ...c, priority: c.priority ?? a.priority })),
    collision: a.collision ?? 'none',
    instanced: a.instanced ?? false,
    lightmapped: (a.lightmaps ?? []).length > 0,
    ...(a.lightmaps ? { lightmaps: a.lightmaps } : {}),
    ...(a.lightLayers ? { lightLayers: a.lightLayers } : {}),
    zone: a.zone ?? null,
    sets: a.sets ?? ALL_SETS,
    placedBy: a.placedBy ?? 'layout',
    pivot: a.pivot ?? 'base centre',
    placeholder: { shape: a.shape ?? 'box', size: a.size, anchor: a.anchor ?? 'base', ...(a.placeholderSource ? { source: a.placeholderSource } : {}) },
    ...(a.chunks ? { chunks: a.chunks } : {}),
    ...(a.drawnNodes ? { drawnNodes: a.drawnNodes } : {}),
    ...(a.notes ? { notes: a.notes } : {}),
  };
}

// ---------------------------------------------------------------- zone GLBs: explicit chunk plans
// A zone GLB's static geometry is exported as exactly these meshes: one per (chunk, material), named
// `<chunk id>__<material>`. Draw calls of a zone asset = sum of chunk materials + its drawn named nodes.
// `box` is the layout-space region whose solids the chunk covers ([minX, minY, minZ], [maxX, maxY, maxZ]);
// `part: "high"` = only what stands more than 3 m above the walkable ground (the skyline shell, vertex-lit),
// `part: "low"` = the ground and everything up to 3 m above it, omitted = everything in the box.
// `solids` (with part "high") names the layout solids a skyline chunk is built over instead of a height rule.
const chunk = (id, tris, materials, box, part, solids) => ({ id, tris, materials, drawCalls: materials.length, box: { min: box[0], max: box[1] }, ...(part ? { part } : {}), ...(solids ? { solids } : {}) });
const sumTris = (chunks) => chunks.reduce((n, c) => n + c.tris, 0);
const sumCalls = (chunks, drawnNodes) => chunks.reduce((n, c) => n + c.drawCalls, 0) + drawnNodes;
function zoneAsset(id, a) {
  const tris = sumTris(a.chunks);
  const materials = [...new Set([...a.chunks.flatMap((c) => c.materials), ...(a.extraMaterials ?? [])])];
  asset(id, { ...a, category: 'env', priority: 0, triBudget: tris, materials, drawCalls: sumCalls(a.chunks, (a.drawnNodes ?? []).length), bake: 'LM+VL',
    placedBy: 'origin', pivot: 'world origin', anchor: 'world', placeholderSource: 'layout-solids' });
}

// Pass i3 (ruling R14: budgets may move between assets while every cell holds 120 000). The reviewers named the walk
// down the gully and the forecourt (the first minute), the hung coats, the townsfolk at the table, the crown knot and
// the last image. Plans were cut toward the built meshes where nothing was asked for and given where it was:
//   chunk_lip_upper 7 000 -> 8 500, chunk_lip_mid 4 000 -> 6 000, chunk_lip_gate 5 000 -> 6 500 (the gully and forecourt)
//   chunk_st_east 14 000 -> 13 400, chunk_st_west 16 000 -> 15 700, chunk_st_yard 13 000 -> 12 700, chunk_st_works 7 000 -> 6 400,
//   env_backdrop_day 2 000 -> 1 700 (each still above its built mesh; the zone script holds env_plenty_street to the
//   sum of its chunks WITH its four drawn nodes: 48 033 built of 48 200)
//   chunk_rim_ledge 14 000 -> 16 000, rim_town_card 600 -> 1 200 (the last image; cell_rim stands at a third of its cap)
//   chunk_gl_stair and chunk_gl_bay 4 000 -> 3 200, chunk_lh_hall 30 000 -> 28 500; the gallery's dressing 6 000 -> 8 500
//   so that prop_coat_hung can be 600 for its three variants (28 coats hang there)
//   chunk_bo_ante 8 000 -> 6 500, chunk_bo_chamber 32 000 -> 33 500 (the boss room)
//   bider_table_static 600 -> 900, enemy_bider 2 500 -> 2 600 (the crown knot)
// Closer, pass i3: chunk_gl_stair and chunk_gl_bay back to 4 000 each, paid by chunk_lh_hall 28 500 -> 26 900 (built 25 380).
// The real game drew 56 280 triangles from cell_gallery_stair against a ledger of 55 190 (tests/core/budget.test.mjs): the
// gallery's instanced dressing is submitted whole from every cell of the zone (a hidden instance is a zero-scale one), the
// 28 coats are 184 triangles each now, and the stair's share of the dressing allowance had been cut with its chunks.
// The ledger this file prints: worst cells cell_street / cell_yard 119 788, cell_lip_gate 119 507, cell_gallery 118 700.
// No texture changed: the seam stage is 55.3 of 64 MiB on Low.
// Pass i4 (ruling R14, the cross-cutting fixer). The reviewers name plain ground and flat rock faces outdoors, the pursued
// man standing in the sky, a blocky wall stump in the sighting view, a pylon that is a prism, a rim stone that is a box, a
// last image whose lower half is one dune, hats that are flat-shaded, a sighting loop that is a black disc and a Tamper
// that is smooth shapes at slam range. The view-model gives back what three passes did not spend (11 745 built):
//   weapon_revolver 18 000 -> 14 000 (2 255 free): 4 000 triangles in EVERY cell
//   chunk_lip_rock 8 000 -> 9 200, chunk_lip_upper 8 500 -> 9 500, chunk_lip_gate 6 500 -> 7 300 (ledges, fallen slabs, the
//   pylon), paid in part by chunk_lip_mid 6 000 -> 5 000 (4 733 built)
//   chunk_st_east 13 400 -> 13 800, chunk_st_west 15 700 -> 16 000, chunk_st_yard 12 700 -> 13 400 (the wall stump, rubble,
//   stones and scrub merged into the ground), chunk_st_works 6 400 -> 6 500
//   env_backdrop_day 1 700 -> 2 100 (a ledge or spur under the pursued man, at his depth and scale)
//   chunk_rim_ledge 16 000 -> 19 000, prop_rim_stone 240 -> 1 200 (a hero prop), env_backdrop_dusk 2 000 -> 3 200 (the fire's
//   ground, lit dune crests, smoke), prop_cartridge_kept 144 -> 240 (the banded round)
//   enemy_tamper and tamper_cold_static 4 000 -> 5 000 (seams and rivets at 1.5 m), boss_windlass 8 000 -> 8 400 (lamp cards)
//   prop_hat_hung 50 -> 110 with the gallery's dressing 8 500 -> 10 000 (24 hats), prop_sighting_loop 220 -> 320,
//   chunk_ty_hall 17 000 -> 17 200 (the face behind the hatch frame)
//   prop_wagon_tipped 1 200 -> 1 500 (the wheel: built at exactly 1 200), prop_water_cart 900 -> 1 100 (asked in pass i3);
//   both are merged into their street chunks, whose plans above pay for them
//   chunk_gl_stair and chunk_gl_bay 4 000 -> 3 200 (2 868 and 2 818 built): the closer of pass i3 had raised them to cover the
//   stair cell's dressing; the ledger now counts a cell's own zone's dressing whole (tools/validate_assets.mjs cellBudget)
// The ledger this file prints: worst cells cell_street / cell_yard, cell_lip_gate, cell_gallery; every one under 120 000.
// No texture and no draw call changed.
// ---------------------------------------------------------------- env_exterior
zoneAsset('env_the_lip', {
  owner: 'env_exterior', nodes: ['collider_terrain'], collision: 'mesh', lightmaps: ['lm_surface'], zone: 'the_lip', sets: ['surface'], size: [32, 27, 120],
  chunks: [
    chunk('chunk_lip_rock', 9200, ['m_frontier'], [[0, -1, -9], [32, 26, 111]], 'high'),
    chunk('chunk_lip_upper', 9500, ['m_sand', 'm_frontier', 'm_mask'], [[0, -1, 54], [32, 26, 111]], 'low'),
    chunk('chunk_lip_mid', 5000, ['m_sand', 'm_frontier'], [[0, -1, 30], [32, 26, 54]], 'low'),
    chunk('chunk_lip_gate', 7300, ['m_sand', 'm_frontier', 'm_pellam', 'm_mask'], [[0, -1, -9], [32, 26, 30]], 'low'),
  ],
  notes: 'Overhang, gully, gate piers, dead pylon. chunk_lip_rock is every rock face more than 3 m above the path, the overhang roof and the pylon mast above 3 m (vertex-lit): it is the skyline seen from the street and the yard. collider_terrain replaces the layout solids of role "terrain" (must stay within 0.25 m of them).',
});
zoneAsset('env_plenty_street', {
  owner: 'env_exterior', nodes: ['pump_rotor', 'pump_tail', 'drum_lamp', 'plug_door_tally'], lampSets: { drum_lamp: 1 }, codeDriven: ['pump_rotor', 'pump_tail'], extraMaterials: ['m_emis'], drawnNodes: ['pump_rotor', 'pump_tail', 'drum_lamp', 'plug_door_tally'],
  lightmaps: ['lm_surface'], zone: 'plenty_street', sets: ['surface'], size: [111, 20, 32],
  chunks: [
    chunk('chunk_st_east', 13800, ['m_sand', 'm_frontier', 'm_pellam', 'm_mask'], [[-37, -1, -16], [0, 16, 16]]),
    chunk('chunk_st_west', 16000, ['m_sand', 'm_frontier', 'm_mask'], [[-80, -1, -16], [-37, 16, 16]]),
    chunk('chunk_st_yard', 13400, ['m_sand', 'm_frontier', 'm_mask'], [[-111, -1, -16], [-80, 20, 16]]),
    chunk('chunk_st_works', 6500, ['m_frontier', 'm_pellam'], [[-111, -1, -16], [-80, 20, 16]], 'high',
      ['yd_drum', 'yd_pump_tower', 'yd_tank', 'yd_tank_deck', 'yd_tank_boards', 'yd_tank_ramp', 'yd_tank_stilt_1', 'yd_tank_stilt_2', 'yd_tank_stilt_3', 'yd_tank_stilt_4']),
  ],
  notes: 'Front Street (east and west halves split at x = -37, the gate court belongs to the west half) and the pump yard. chunk_st_works is the yard\'s tall machinery: the whole drum, the wind-pump derrick and the tank on its stilts with deck and ramp (the skyline seen down the street and from the jug gate). chunk_st_yard is the yard ground, walls, stubs, shed, cart and the Tally House exterior. pump_rotor is spun by code at 9 deg/s. drum_lamp is the aqua status lamp by the drum door. plug_door_tally is a black panel filling the Tally House doorway just inside the leaf (m_frontier, COLOR_0 black): world shows it while the door is open and the hall interior is not drawn.',
});
zoneAsset('env_far_rim', {
  owner: 'env_exterior', lightmaps: ['lm_rim'], zone: 'far_rim', sets: ['coda'], size: [32, 8, 21],
  chunks: [chunk('chunk_rim_ledge', 19000, ['m_sand', 'm_frontier', 'm_mask'], [[-2, 17, 100], [30, 25, 121]])],
});
asset('rim_town_card', {
  owner: 'env_exterior', category: 'env', priority: 0, triBudget: 1200, materials: ['m_flat', 'm_emis'], bake: 'UNLIT',
  nodes: ['town_windows', 'socket_thread'], lampSets: { town_windows: 48 }, zone: 'far_rim', sets: ['coda'],
  placedBy: 'origin', pivot: 'world origin', anchor: 'world', size: [104, 25, 1],
  notes: 'Authored in world coordinates: the town (about 104 x 25 m) is drawn 12.5 m east of the layout vista_plenty target, 117 to 142 m from the ledge, and one leaning dead line pylon stands as a card 42 m out from the ledge at game (-0.9, 3.2 to 25, 61) (polish round 4; the size field is the town alone). 48 panes and 16 window pools (a second face of the same lamp). town_windows lights the first `lamps` quads (lighting order spreads outward from the Tally House).',
});
asset('env_backdrop_day', {
  owner: 'env_exterior', category: 'env', priority: 0, triBudget: 2100, materials: ['m_flat'], bake: 'UNLIT',
  nodes: ['socket_dowser', 'socket_rule_base'], sets: ['surface'], placedBy: 'origin', pivot: 'world origin', anchor: 'world', size: [1600, 120, 1600],
  notes: 'Mesa cards, pylon line, cloud cards. One mesh, one draw call. Drawn with fog. socket_dowser is on the bearing of layout vista_dowser (due west of the yard).',
});
asset('env_backdrop_dusk', {
  owner: 'env_exterior', category: 'env', priority: 0, triBudget: 3200, materials: ['m_flat'], bake: 'UNLIT',
  nodes: ['socket_last_fire'], sets: ['coda'], placedBy: 'origin', pivot: 'world origin', anchor: 'world', size: [1600, 120, 1600],
  notes: 'Mesa cards, pylon line, the flat and the last fire\'s socket; since polish round 5 it also carries the wings of the rim\'s own cliff (26 m west and 33 m east of the ledge: the zone\'s chunk may not leave its box, this card may) and the rock under the ledge\'s two ends. One mesh, one draw call, unlit.',
});

// ---------------------------------------------------------------- env_interior
zoneAsset('env_tally_house', {
  owner: 'env_interior', nodes: ['strip_hatch'], lampSets: { strip_hatch: 1 }, extraMaterials: ['m_emis'], drawnNodes: ['strip_hatch'],
  lightmaps: ['lm_tally'], lightLayers: ['lm_tally_hatch'], zone: 'tally_house', sets: ['surface'], size: [16, 7, 24],
  chunks: [chunk('chunk_ty_hall', 17200, ['m_frontier', 'm_pellam', 'm_mask'], [[-97, -1, -38], [-81, 6, -14]])],
  notes: 'strip_hatch and the lm_tally_hatch light layer switch on with hatch_powered. The eleven chairs, the latch block and its cowl (layout ty_latch_*), and the pictogram plate on the west-wall conduit are zone geometry.',
});
zoneAsset('env_the_gallery', {
  owner: 'env_interior', nodes: ['strip_flicker', 'violet_hairline'], lampSets: { strip_flicker: 1, violet_hairline: 1 }, drawnNodes: ['strip_flicker', 'violet_hairline'],
  lightmaps: ['lm_gallery'], zone: 'the_gallery', sets: ['underground'], size: [77, 13, 27],
  chunks: [
    chunk('chunk_gl_stair', 3200, ['m_pellam', 'm_emis'], [[-95, -13, -36], [-83, 0, -18.5]]),
    chunk('chunk_gl_bay', 3200, ['m_pellam', 'm_mask', 'm_emis'], [[-95, -13, -18.5], [-81, -6, -9]]),
    chunk('chunk_gl_gallery', 18000, ['m_pellam', 'm_mask', 'm_emis'], [[-81, -13, -19], [-18, -6, -9]]),
  ],
  notes: 'Peg stair, proving bay, gallery. chunk_gl_stair holds the seam (flight 1, landing 1 and their shaft walls) and is drawn while the surface set is resident once the hatch is powered. The 3.6 m gallery module is baked once and copied by the script (shared lightmap UVs), then merged: no instancing. Stair strips are baked lit.',
});
zoneAsset('env_lift_hall', {
  owner: 'env_interior', nodes: ['diagram_lamps'], lampSets: { diagram_lamps: 7 }, drawnNodes: ['diagram_lamps'], lightmaps: ['lm_hall'],
  zone: 'lift_hall', sets: ['underground'], size: [47, 14, 37],
  chunks: [chunk('chunk_lh_hall', 26900, ['m_pellam', 'm_mask', 'm_emis'], [[-19, -16, -29], [28, -2, 8]])],
  notes: 'Includes the ramp-foot switchgear cabinet (layout lh_ramp_cabinet), the cage bay and the cold bay.',
});
asset('env_lift_shaft', {
  owner: 'env_interior', category: 'env', priority: 1, triBudget: 800, drawCalls: 7, materials: ['m_pellam', 'm_emis'], bake: 'VL',
  nodes: range('lamp_bar_', 6), codeDriven: range('lamp_bar_', 6), sets: ['underground', 'coda'], placedBy: 'code',
  pivot: 'cage floor centre', size: [6.4, 12, 6.4],
  notes: 'Dark-ride shell shown round the player during both lift rides (scaled to the cage in use); code scrolls the six lamp bars upward. Nothing else is drawn during a ride.',
});
zoneAsset('env_the_bore', {
  owner: 'env_interior', nodes: ['bore_axis', 'bore_glow', 'bay_lamps', 'mark_glows', 'ante_diagram_lamps'],
  lampSets: { bore_glow: 1, bay_lamps: 6, mark_glows: 6, ante_diagram_lamps: 7 }, drawnNodes: ['bore_glow', 'bay_lamps', 'mark_glows', 'ante_diagram_lamps'],
  lightmaps: ['lm_bore'], lightLayers: ['lm_bore_glow'], zone: 'the_bore', sets: ['underground'], size: [34, 16, 53],
  chunks: [
    chunk('chunk_bo_ante', 6500, ['m_pellam', 'm_mask', 'm_emis'], [[-3, -45, 64], [31, -29, 80.3]]),
    chunk('chunk_bo_chamber', 33500, ['m_pellam', 'm_mask', 'm_emis'], [[-3, -51, 80.3], [31, -29, 117]]),
  ],
  notes: 'chunk_bo_ante is the antechamber and the stair down to it; chunk_bo_chamber is everything south of the door wall (arrival bay, catwalk, chamber, bore shaft, proving-lift room). The chamber is one 60 degree sector baked once and copied five times about bore_axis by the script (shared lightmap UVs, copied vertex light), then merged into chunk_bo_chamber: no instancing; the triangle budget counts all six. mark_glows = the six proving marks (index = bay - 1). bore_glow participates in wrong_fade. The kerb is 0.6 m high in a 35 degree notch in front of each mark and 1.2 m at the six merlons (layout bo_kerb, bo_kerb_hi_*).',
});

// ---------------------------------------------------------------- props (two sub-owners with disjoint folders) and ammunition (weapons)
// props_mech  blender/props/mech/   doors, gates, shutters, hatch, baffle, bore door, cages, lockers, puzzle elements: everything with a clip or a hit target
// props_dress blender/props/dress/  readables, camp props, furniture, dressing, cards; also tx_mask and both palettes
// weapons     blender/weapons/      the revolver, plus the ammunition family (cartridges and round pickups must match the gun's rounds)
const M = (id, a) => asset(id, { owner: 'props_mech', category: 'props', ...a });
const D = (id, a) => asset(id, { owner: 'props_dress', category: 'props', ...a });
const W = (id, a) => asset(id, { owner: 'weapons', category: 'props', ...a });

// pickups and ammunition
W('pk_rounds_6', { priority: 0, triBudget: 120, instanced: true, size: [0.14, 0.06, 0.09] });
W('pk_rounds_12', { priority: 0, triBudget: 180, instanced: true, size: [0.18, 0.07, 0.12] });
D('pk_canteen', { priority: 0, triBudget: 220, instanced: true, size: [0.24, 0.09, 0.24] });
W('prop_cartridge_lead', { priority: 1, triBudget: 80, instanced: true, nodes: ['round_live', 'round_spent'], placedBy: 'zone', pivot: 'case head centre', shape: 'cylinder', size: [0.012, 0.041, 0.012] });
W('prop_cartridge_line', { priority: 0, triBudget: 48, instanced: true, placedBy: 'code', pivot: 'case head centre', shape: 'cylinder', size: [0.012, 0.041, 0.012] });
W('prop_cartridge_kept', {
  priority: 0, triBudget: 240, instanced: true, nodes: ['round_sealed', 'round_spent', 'round_violet'], pivot: 'case head centre', shape: 'cylinder', size: [0.012, 0.041, 0.012],
  notes: 'round_violet is ia_stone_round (runtime, taken by the player); six round_spent are zone-baked on the rim stone.',
});
M('ia_ammo_box', { priority: 0, triBudget: 400, materials: ['m_prop', 'm_emis', 'm_mask'], rigid: ['flap'], nodes: ['lamp'], lampSets: { lamp: 1 }, animations: [clip('dispense', 0.4)], pivot: 'back-plate centre at floor level', anchor: 'back_base', size: [0.6, 0.9, 0.25] });
M('ia_line_locker', { priority: 0, triBudget: 500, materials: ['m_prop', 'm_emis', 'm_mask'], rigid: ['door'], nodes: ['lamp', 'round_slot'], lampSets: { lamp: 1 }, animations: [clip('open', 0.5), clip('close', 0.5)], pivot: 'back centre at floor level', anchor: 'back_base', size: [0.6, 1.2, 0.3] });

// the gate, the street, the yard
const [gateW, gateH] = opening('door_jug_gate');
M('ia_jug', {
  priority: 0, triBudget: 400, instanced: true, nodes: ['jug_intact', 'jug_broken'], pivot: 'cord top', anchor: 'top', shape: 'cylinder', size: [0.32, 1.02, 0.32],
  hitPoint: [0, -0.81, 0], notes: 'The jug body (0.42 m) hangs 0.6 m below the pivot: body centre 0.81 m below it. Layout jug markers are body centres (the hit sphere); the binding offset puts the pivot on the hook.',
});
M('prop_stock_gate', {
  priority: 0, triBudget: 500, materials: ['m_prop', 'm_frontier'], rigid: ['gate_bar'], nodes: [...range('hook_', 6)], codeDriven: ['gate_bar'], collision: 'box',
  pivot: 'bottom centre of the hurdle, closed', size: [gateW + 0.6, gateH + 0.1, 0.35],
  nodePos: Object.fromEntries(range('hook_', 6).map((k, i) => [k, [r3(-1.75 + 0.7 * i), 2.36, -0.15]])),
  notes: `Sized to door_jug_gate (${gateW} x ${gateH} m): bar ${gateW + 0.6} m, hurdle ${gateW - 0.1} x 2.35 m. hook_n are children of gate_bar, on the face away from the street (asset -Z), 0.7 m apart. Jugs and their hit spheres follow the hooks as code raises gate_bar.`,
});
M('prop_well_sweep', { priority: 1, triBudget: 600, rigid: ['sweep_arm'], nodes: [], codeDriven: ['sweep_arm'], sets: ['surface'], pivot: 'world origin (authored in place: post beside the gate, arm tip at layout prop_pylon.sweepTo)', anchor: 'world', size: [5.5, 3.4, 0.6] });
D('prop_wagon_tipped', { priority: 0, triBudget: 1500, bake: 'VL', placedBy: 'zone', size: [3.6, 2.1, 1.5] });
D('prop_trough_pump', { priority: 0, triBudget: 450, bake: 'VL', placedBy: 'zone', size: [2.4, 1.6, 0.6] });
D('prop_cup_tin', { priority: 0, triBudget: 60, instanced: true, shape: 'cylinder', size: [0.09, 0.08, 0.09] });
D('prop_water_cart', { priority: 1, triBudget: 1100, bake: 'VL', placedBy: 'zone', size: [3.2, 2.1, 1.6] });
const [yardGateW, yardGateH] = opening('door_yard_gate');
M('prop_yard_gate', { priority: 1, triBudget: 400, rigid: ['leaf_l', 'leaf_r'], nodes: [], animations: [clip('burst_open', 0.5)], collision: 'box', pivot: 'hinge line centre at ground', size: [yardGateW, yardGateH - 0.1, 0.15] });
const [yardDoorW, yardDoorH] = opening('ia_yard_door');
M('ia_yard_door', {
  priority: 0, triBudget: 300, nodes: ['leaf', 'socket_knot'], animations: [clip('open', 0.8)], collision: 'box', pivot: 'hinge axis at ground', anchor: 'hinge', size: [yardDoorW, yardDoorH, 0.12],
  nodePos: { socket_knot: [2.25, 1.3, -0.14] }, notes: 'socket_knot is on the street face (asset -Z), 1.3 m up and 0.95 m from the door centre toward the latch edge: where layout knot_yard_latch sits.',
});
M('knot_mech', {
  priority: 0, triBudget: 220, nodes: ['knot_live'], pivot: 'collar back centre', anchor: 'back', shape: 'cylinder', size: [0.42, 0.42, 0.2], hitPoint: [0, 0, 0.08],
  notes: 'Used for knot_yard_latch, knot_hatch_latch, knot_cold_bay and knot_a/b/c (scale 1.25). The knot centre (the layout marker, the hit sphere) is 0.08 m in front of the pivot.',
});
M('ia_yard_bell', { priority: 1, triBudget: 260, rigid: ['bell'], nodes: [], animations: [clip('ring', 1.2)], pivot: 'post base', size: [0.4, 2.6, 0.4], nodePos: { bell: [0, 2.2, 0] }, hitPoint: [0, 2.2, 0] });
M('sec_loft_bell', {
  priority: 2, triBudget: 300, rigid: ['rope', 'bell', 'ladder'], nodes: [], animations: [clip('fall', 0.9)], pivot: 'hoist arm tip', anchor: 'top', size: [0.5, 3.2, 0.5],
  nodePos: { rope: [0, -0.6, 0], bell: [0, -1.2, 0] },
});
const [frontierW, frontierH] = opening('door_alley', 'door_tally');
M('prop_door_frontier', { priority: 0, triBudget: 160, nodes: ['leaf'], animations: [clip('open', 0.6)], collision: 'box', pivot: 'hinge axis at ground', anchor: 'hinge', size: [frontierW, frontierH, 0.08] });
D('prop_lantern', { priority: 1, triBudget: 360, instanced: true, nodes: ['lantern_lit', 'lantern_dark'], placedBy: 'dressing', pivot: 'bail top', anchor: 'top', size: [0.16, 0.34, 0.16] });
D('prop_bottle', { priority: 2, triBudget: 180, instanced: true, nodes: ['bottle_a', 'bottle_b', 'bottle_c'], placedBy: 'dressing', shape: 'cylinder', size: [0.08, 0.28, 0.08] });
D('prop_crate', { priority: 2, triBudget: 300, instanced: true, collision: 'box', placedBy: 'dressing', size: [0.7, 0.7, 0.7], notes: 'Collider is tagged pierce.' });
D('prop_barrel', { priority: 2, triBudget: 330, instanced: true, collision: 'box', placedBy: 'dressing', shape: 'cylinder', size: [0.6, 0.9, 0.6] });
D('prop_sack', { priority: 2, triBudget: 120, instanced: true, placedBy: 'dressing', size: [0.7, 0.3, 0.4] });
D('prop_strain_cloth', { priority: 2, triBudget: 60, instanced: true, placedBy: 'dressing', pivot: 'top edge', anchor: 'top', size: [0.8, 0.8, 0.02] });
D('card_dowser', { priority: 0, triBudget: 2, materials: ['m_mask'], bake: 'UNLIT', nodes: ['glint'], placedBy: 'code', sets: ['surface'], pivot: 'feet', size: [0.9, 2.0, 0.02] });

// the Dowser's stops and readables
D('prop_camp_ash', { priority: 0, triBudget: 600, materials: ['m_prop', 'm_emis'], bake: 'VL', nodes: ['ash_cold', 'ash_embers'], placedBy: 'zone', pivot: 'centre at ground', shape: 'cylinder', size: [0.7, 0.12, 0.7], notes: 'ash_embers is stop three only (the bore antechamber). ash_cold is the town\'s ash in the Tally House firebox. Not used at stop one.' });
D('prop_coffee_pot', { priority: 0, triBudget: 160, bake: 'VL', placedBy: 'zone', shape: 'cylinder', size: [0.16, 0.22, 0.16] });
D('prop_kettle', { priority: 1, triBudget: 180, bake: 'VL', placedBy: 'zone', shape: 'cylinder', size: [0.2, 0.18, 0.2] });
D('prop_flat_stone', { priority: 1, triBudget: 60, bake: 'VL', placedBy: 'zone', size: [0.5, 0.08, 0.35] });
D('rd_note', { priority: 0, triBudget: 120, materials: ['m_prop'], bake: 'VL', nodes: ['note_lip', 'note_hearth', 'note_cradle', 'note_stone'], placedBy: 'zone', pivot: 'centre', anchor: 'centre', size: [0.13, 0.01, 0.2] });
D('rd_ledger', { priority: 1, triBudget: 120, bake: 'VL', placedBy: 'zone', size: [0.3, 0.05, 0.42] });
D('rd_rain_tally', { priority: 2, triBudget: 60, materials: ['m_prop', 'm_mask'], bake: 'VL', placedBy: 'zone', size: [0.22, 0.3, 0.02] });
D('rd_plate', { priority: 0, triBudget: 750, materials: ['m_prop', 'm_mask'], bake: 'VL', nodes: ['plate_line', 'plate_proving', 'plate_service'], placedBy: 'zone', pivot: 'back centre', anchor: 'back', size: [0.6, 0.34, 0.02] });

// Tally House
const tableSolid = L.solids.find((s) => s.id === 'ty_table');
D('prop_tally_table', { priority: 0, triBudget: 900, bake: 'VL', placedBy: 'zone', sets: ['surface'], pivot: 'centre at floor', size: [tableSolid.size[0], tableSolid.size[1], tableSolid.size[2]] });
D('prop_chair', { priority: 0, triBudget: 150, bake: 'VL', placedBy: 'zone', sets: ['surface'], size: [0.45, 0.95, 0.45], notes: 'Eleven copies are merged into env_tally_house by the zone script (no instancing).' });
D('prop_head_chair', { priority: 0, triBudget: 180, bake: 'VL', placedBy: 'zone', sets: ['surface'], size: [0.5, 0.85, 0.5] });
D('prop_bench', { priority: 2, triBudget: 90, bake: 'VL', placedBy: 'zone', sets: ['surface'], size: [2.2, 0.45, 0.3] });
const [shutterW, shutterH] = opening('shutter_s', 'shutter_m', 'shutter_n');
M('ia_shutter', {
  priority: 0, triBudget: 160, rigid: ['shutter_leaf', 'latch'], nodes: [], animations: [clip('drop_open', 0.5)], sets: ['surface'], pivot: 'hinge axis centre (bottom edge of the leaf)', anchor: 'sill', size: [shutterW, shutterH, 0.05],
  nodePos: { latch: [0, -0.55, 0.06] }, notes: 'The pivot is 0.45 m below the opening centre (the shutter_* marker); latch is the white insulator 0.55 m below the pivot and 0.06 m proud of the wall: exactly the ia_latch_* marker.',
});
M('prop_share_cloth', {
  priority: 0, triBudget: 200, materials: ['m_prop', 'm_mask'], skinned: true, bones: ['cloth_root', 'cloth_1', 'cloth_2', 'cloth_3'], nodes: ['cord', 'cloth'], animations: [clip('fall', 1.2)],
  sets: ['surface'], pivot: 'cord top', anchor: 'top', size: [1.6, 1.46, 0.03], nodePos: { cord: [0, 0, 0], cloth: [0, -0.855, 0] },
});
M('prop_day_cell', { priority: 0, triBudget: 200, materials: ['m_prop', 'm_emis'], nodes: ['cell_face'], lampSets: { cell_face: 1 }, sets: ['surface'], pivot: 'back centre', anchor: 'back', size: [0.6, 0.6, 0.08], notes: 'The pictogram plate is not on this asset: it is zone geometry of env_tally_house (layout prop_daycell_plate).' });
const hatch = marker('ia_hatch');
M('ia_hatch', {
  priority: 0, triBudget: 500, materials: ['m_prop', 'm_emis'], rigid: ['leaf_a', 'leaf_b'], nodes: ['socket_knot', 'latch_lamp'], lampSets: { latch_lamp: 1 },
  animations: [clip('open', 1.0), clip('close', 1.0)], collision: 'box', sets: ['surface', 'underground'], pivot: 'opening centre at floor level', anchor: 'top', size: [hatch.size[0], 0.12, hatch.size[2]],
  nodePos: { socket_knot: [1.6, 0.9, 1.35] },
  notes: 'Rectangular, two leaves sliding apart. `open` is linear in time: code holds it at 15 % for the "ajar" state (0.3 m gap, still impassable). socket_knot marks layout knot_hatch_latch; the latch block and its cowl are zone geometry of env_tally_house.',
});

// gallery and stair
D('prop_coat_hung', { priority: 0, triBudget: 600, instanced: true, nodes: ['coat_long', 'coat_short', 'coat_shawl'], placedBy: 'dressing', sets: ['underground'], pivot: 'peg (top)', anchor: 'top', size: [0.5, 1.1, 0.15] });
D('prop_hat_hung', { priority: 1, triBudget: 110, instanced: true, placedBy: 'dressing', sets: ['underground'], pivot: 'peg', anchor: 'top', shape: 'cylinder', size: [0.38, 0.14, 0.38] });
D('prop_boots_pair', { priority: 1, triBudget: 90, instanced: true, placedBy: 'dressing', sets: ['underground'], size: [0.3, 0.28, 0.25] });
M('ia_range_plate', { priority: 1, triBudget: 100, rigid: ['plate'], nodes: [], animations: [clip('ring', 0.8)], sets: ['underground'], pivot: 'hook', anchor: 'top', size: [0.7, 0.8, 0.04], hitPoint: [0, -0.45, 0], notes: 'A disc 0.7 m across whose centre hangs 0.45 m below the hook. Collision is the pierce-tagged layout solid ia_range_plate_n_solid.' });
M('prop_proving_step', { priority: 0, triBudget: 160, materials: ['m_prop', 'm_emis', 'm_mask'], nodes: ['mark_glow'], lampSets: { mark_glow: 1 }, sets: ['underground'], size: [1.6, 0.15, 1.6], notes: 'Collision is the layout solid gl_mark_step.' });
const loopUp = marker('pz_sighting_loop').params.ringCentreAboveFloor;
M('prop_sighting_loop', { priority: 0, triBudget: 320, materials: ['m_prop', 'm_emis'], nodes: ['loop_rim'], lampSets: { loop_rim: 1 }, sets: ['underground'], pivot: 'post base', size: [0.62, r3(loopUp + 0.31), 0.1], nodePos: { loop_rim: [0, loopUp, 0] } });
const [baffleW, baffleH] = opening('ia_baffle');
M('ia_baffle', { priority: 0, triBudget: 500, materials: ['m_prop', 'm_emis', 'm_mask'], rigid: ['leaf_l', 'leaf_r'], nodes: ['door_lamps'], lampSets: { door_lamps: 3 }, animations: [clip('open', 3.0)], collision: 'box', sets: ['underground'], pivot: 'sill centre', size: [baffleW, baffleH, 0.3], notes: 'The lamp bar mounts on the wall above the lintel, outside the leaf area.' });

// lift hall and bore
const [farW, farH] = opening('door_gallery_far');
M('prop_door_pellam', { priority: 0, triBudget: 220, rigid: ['leaf'], nodes: [], animations: [clip('open', 1.0), clip('close', 1.0)], collision: 'box', pivot: 'sill centre, closed', size: [farW, farH, 0.12], notes: 'The gallery far door only. The yard drum door is zone geometry of env_plenty_street.' });
M('prop_grate', { priority: 1, triBudget: 40, materials: ['m_prop', 'm_mask'], rigid: ['lid'], nodes: [], animations: [clip('flip_open', 0.4)], pivot: 'hinge edge centre', anchor: 'centre', size: [1.2, 0.06, 1.2] });
const [coldW, coldH] = opening('door_cold_bay');
M('ia_cold_bay_shutter', { priority: 2, triBudget: 260, rigid: ['shutter'], nodes: ['socket_knot'], animations: [clip('open', 1.5)], collision: 'box', sets: ['underground'], pivot: 'sill centre', size: [coldW, coldH, 0.1], nodePos: { socket_knot: [3.0, 1.6, -0.62] }, notes: 'Collider is tagged pierce. socket_knot marks layout knot_cold_bay (seen through the inspection slot beside the shutter).' });
const hallCage = cage('ride_lift_hall'), provingCage = cage('ride_proving_lift');
M('ia_lift_cage', {
  priority: 0, triBudget: 900, materials: ['m_prop', 'm_emis', 'm_mask'], rigid: ['gate'], nodes: ['gate_lamp'], lampSets: { gate_lamp: 1 }, animations: [clip('gate_open', 1.0), clip('gate_close', 1.0)],
  collision: 'box', sets: ['underground'], pivot: 'floor centre', size: [hallCage[0], hallCage[1], hallCage[2]], nodePos: { gate: [0, 0, r3(hallCage[2] / 2 - 0.05)] },
  notes: `The hall lift cage, interior ${hallCage.join(' x ')} m (w x h x d, from nav.portals ride_lift_hall). The gate fills the whole +Z side. Two instances: lift_depart_hall and lift_arrival_bore (the same cage turned half a turn). The box collider is the gate only; cage walls are layout solids.`,
});
M('ia_proving_lift_cage', {
  priority: 0, triBudget: 700, materials: ['m_prop', 'm_emis', 'm_mask'], rigid: ['gate'], nodes: ['gate_lamp', 'control'], lampSets: { gate_lamp: 1 }, animations: [clip('gate_open', 1.0), clip('gate_close', 1.0)],
  collision: 'box', sets: ['underground', 'coda'], pivot: 'floor centre', size: [provingCage[0], provingCage[1], provingCage[2]],
  nodePos: { gate: [0, 0, r3(provingCage[2] / 2 - 0.05)], control: [0, 1.2, r3(-(provingCage[2] / 2 - 0.2))] },
  notes: `The proving lift cage, interior ${provingCage.join(' x ')} m (from nav.portals ride_proving_lift), a 3 x 3 m gate on the +Z side. control is the call plate on the back wall (layout ia_proving_lift). Built from the same parts as ia_lift_cage (1.2 m module), not scaled from it. Two instances: lift_depart_bore, lift_arrival_rim.`,
});
M('ia_lift_lever', { priority: 0, triBudget: 180, rigid: ['lever'], nodes: [], animations: [clip('throw', 0.6)], sets: ['underground'], size: [0.3, 1.6, 0.3], nodePos: { lever: [0, 1.0, 0] } });
const portAngle = (k) => ((k - 1) * Math.PI) / 4;
M('ia_bore_door', {
  priority: 0, triBudget: 1400, materials: ['m_prop', 'm_emis'], rigid: ['door_disc'], nodes: [...range('port_', 8), 'port_lamps', 'listen_lamps'],
  lampSets: { port_lamps: 8, listen_lamps: 12 }, animations: [clip('open', 2.5)], collision: 'box', sets: ['underground'], pivot: 'disc centre', anchor: 'centre', size: [3.0, 3.0, 0.25],
  nodePos: { ...Object.fromEntries(range('port_', 8).map((k, i) => [k, [r3(Math.sin(portAngle(i + 1))), r3(Math.cos(portAngle(i + 1))), 0.145]])), listen_lamps: [0, 0, 0.145] },
  notes: 'port_n are empties at the socket centres on the antechamber face (asset +Z), on a 1.0 m ring, numbered clockwise from the top as seen from the antechamber. listen_lamps fill clockwise from the top.',
});
M('ia_cradle', { priority: 0, triBudget: 400, materials: ['m_prop', 'm_emis'], nodes: ['cradle_lamp', 'mark_lamps'], lampSets: { cradle_lamp: 1, mark_lamps: 7 }, sets: ['underground'], pivot: 'back centre', anchor: 'back', size: [0.5, 1.1, 0.2], notes: 'Load-bearing. mark_lamps index 6 (the seventh disc) is dark until the proof.' });
D('ia_proving_mark', { priority: 0, triBudget: 60, bake: 'LM', placedBy: 'zone', sets: ['underground'], pivot: 'centre at floor', shape: 'cylinder', size: [0.5, 0.01, 0.5], notes: 'Embedded in the bore sector by the zone script; its glow is lamp set mark_glows on env_the_bore.' });
M('prop_station_plate', { priority: 0, triBudget: 220, materials: ['m_prop', 'm_emis'], nodes: ['plate_lamp'], lampSets: { plate_lamp: 1 }, pivot: 'back centre', anchor: 'back', size: [0.8, 0.8, 0.03] });
// pass i5 (closer, ruling R19; asked by creatures-props): the stone's rock faces go on the zone's own m_frontier with the cliffs' strata row (a second mesh; brass and seat stay m_prop)
D('prop_rim_stone', { priority: 0, triBudget: 1200, materials: ['m_prop', 'm_frontier'], drawCalls: 2, bake: 'VL', placedBy: 'zone', sets: ['coda'], size: [0.9, 0.12, 0.5] });

// ---------------------------------------------------------------- weapons
// Release pass p0, ruling R14: the view-model (the revolver and the hands) is one object on screen every second. It has
// three times its old triangle budget (18 000, was 6 000), a third draw call (`m_hands`: a glove or skin material of its
// own; `m_prop`, the palette, stays allowed) and three textures of its own beside tx_gun and tx_matcap_steel:
// tx_gun_detail, tx_hands, tx_hands_detail (below). The 12 000 triangles were taken from visibility chunks whose built
// meshes stand far under their plan (the chunk table: chunk_lip_gate, chunk_st_east / yard / works, chunk_gl_stair / bay /
// gallery, chunk_lh_hall), from env_backdrop_day and from the effects allowance: every cell still holds 120 000 and
// the seam stage 64 MiB on Low (the ledger this file prints).
asset('weapon_revolver', {
  owner: 'weapons', category: 'weapons', priority: 0, triBudget: 14000, drawCalls: 3, materials: ['m_gun', 'm_hands', 'm_prop'], skinned: true,
  bones: ['root', 'gun', 'cylinder', 'hammer', 'trigger', 'gate', 'ejector', ...range('round_', 6), 'arm_r', 'hand_r', 'thumb_r_1', 'thumb_r_2',
    'index_r_1', 'index_r_2', 'grip_r', 'arm_l', 'hand_l', 'thumb_l_1', 'thumb_l_2', 'index_l_1', 'index_l_2', 'fingers_l',
    'round_hand_lead', 'round_hand_line', 'round_hand_kept', 'kept_loop'],
  nodes: ['gun_mesh', 'arms_mesh', 'gun', 'cylinder', 'hammer', ...range('round_', 6), 'kept_loop', 'muzzle', 'eject', 'cam_look'],
  codeDriven: [...range('round_', 6), 'kept_loop'],
  animations: [
    loop('idle', 3.0), loop('sprint', 0.68), clip('draw', 0.5), clip('fire', 0.48), clip('dry_fire', 0.15),
    clip('reload_open', 0.35), clip('reload_round', 0.30), clip('reload_close', 0.30), clip('reload_fast_close', 0.20),
    clip('load_line', 0.55), clip('unload_line', 0.35), clip('load_kept', 1.8), clip('unload_kept', 0.3), clip('fire_kept', 1.2), clip('take_round', 1.0),
  ],
  placedBy: 'code', pivot: 'camera (authored in camera space, barrel toward -Z)', anchor: 'centre', size: [0.3, 0.3, 0.6],
  notes: 'muzzle, eject, cam_look are empties. round_n and kept_loop are scaled by code (no clip may key them).',
});

// ---------------------------------------------------------------- enemies (bider, transit) and boss (windlass, tamper: the two Pellam machines)
const E = (id, a) => asset(id, { owner: 'enemies', category: 'enemies', placedBy: 'code', ...a });
const B = (id, a) => asset(id, { owner: 'boss', placedBy: 'code', ...a });
const sides = (names) => names.flatMap((n) => [`${n}_l`, `${n}_r`]);
E('enemy_bider', {
  priority: 0, triBudget: 2600, skinned: true,
  bones: ['root', 'hips', 'spine', 'chest', 'neck', 'head', ...sides(['shoulder', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'coat_tail'])],
  nodes: ['root', 'head', 'crown', 'hand_socket_r'],
  animations: [
    loop('idle_stoop', 2.0), loop('run', 0.62), loop('circle_strafe', 0.8, { priority: 2, fallback: 'run' }), clip('lunge_windup', 0.5), clip('lunge', 0.35), clip('lunge_recover', 0.6),
    clip('stumble', 0.4), loop('falter', 1.0, { priority: 2, fallback: 'stumble' }), clip('die_back', 0.9), clip('sit_down', 0.9), loop('sit_breathe', 4.0, { priority: 1 }), loop('sit_table', 4.0),
    clip('rise_from_seat', 1.2), clip('climb_out', 1.2), loop('scoop_kneel', 2.4), clip('kneel_to_stand', 1.0), loop('queue_stand', 3.0), clip('turn_about', 1.5),
  ],
  shape: 'capsule', size: [0.5, 1.4, 0.5], notes: 'Faces +Z. Root motion is baked out of every clip (code moves it). crown and hand_socket_r are empties.',
});
E('bider_seated_static', { priority: 0, triBudget: 500, instanced: true, shape: 'capsule', size: [0.55, 0.85, 0.7], pivot: 'ground contact' });
E('bider_felled_static', { priority: 0, triBudget: 450, instanced: true, size: [1.5, 0.35, 0.6], pivot: 'ground contact' });
E('bider_table_static', { priority: 0, triBudget: 900, instanced: true, shape: 'capsule', size: [0.5, 1.25, 0.6], pivot: 'seat (floor under the chair)', sets: ['surface'], placedBy: 'layout' });
E('enemy_transit', {
  priority: 0, triBudget: 2000, skinned: true, sets: ['surface'],
  bones: ['root', 'head', 'leg_a_upper', 'leg_a_lower', 'leg_b_upper', 'leg_b_lower', 'leg_c_upper', 'leg_c_lower'],
  nodes: ['root', 'head', 'lens', 'stake_muzzle'],
  animations: [loop('idle_scan', 3.0, { priority: 1 }), loop('walk', 0.9), clip('emerge', 1.2), clip('plant', 0.3), loop('aim_hold', 0.6), clip('fire', 0.25), clip('flinch', 0.25, { priority: 1 }),
    clip('sidestep_l', 0.4, { priority: 2, fallback: 'walk' }), clip('sidestep_r', 0.4, { priority: 2, fallback: 'walk' }), clip('die_fold', 1.0)],
  shape: 'cylinder', size: [1.1, 1.9, 1.1],
});
E('proj_stake', { priority: 0, triBudget: 48, instanced: true, nodes: ['stake_hot', 'stake_cool'], pivot: 'tip', anchor: 'centre', size: [0.04, 0.04, 0.6], notes: 'Shared pool: 8 in flight + 18 stuck (Transits and the Windlass).' });
B('enemy_tamper', {
  category: 'enemies', priority: 0, triBudget: 5000, skinned: true, sets: ['underground'],
  bones: ['root', 'pelvis', 'barrel', 'arm_r_upper', 'arm_r_ram', 'arm_l', 'leg_l_upper', 'leg_l_foot', 'leg_r_upper', 'leg_r_foot', 'vent_chest', 'vent_back'],
  nodes: ['root', 'vent_chest_knot', 'vent_back_knot', 'ram_head', 'foot_spark'],
  animations: [loop('idle', 2.4), loop('walk', 1.2), clip('slam_windup', 1.0), clip('slam', 0.3), clip('slam_recover', 1.5), clip('charge_windup', 0.8), loop('charge', 0.5),
    clip('charge_stun', 2.0), clip('stagger', 1.5), clip('flinch_plate', 0.2, { priority: 1 }), clip('die', 2.2), loop('pound_bulkhead', 2.6, { priority: 1 })],
  size: [1.6, 2.4, 1.4],
  notes: 'State line_stagger (GDD 7.3 revision 2) plays `stagger` at half speed while code holds vent_chest and vent_back open: both vent bones must be openable additively over any clip (key them only in stagger, charge_stun and die).',
});
B('tamper_cold_static', { category: 'enemies', priority: 2, triBudget: 5000, bake: 'VL', placedBy: 'zone', sets: ['underground'], size: [1.6, 2.4, 1.4] });
B('boss_windlass', {
  category: 'boss', priority: 0, triBudget: 8400, materials: ['m_prop', 'm_emis'], skinned: true, sets: ['underground'],
  bones: ['root', 'arm_yaw', 'drum_spin', ...range('mouth_', 6), ...range('knot_', 6), 'guard', ...range('guard_piece_', 5), 'pawl_l', 'pawl_r', 'cable_a', 'cable_b', 'cable_c'],
  nodes: ['arm_yaw', 'drum_spin', ...range('mouth_', 6), ...range('knot_', 6), 'guard', 'pawl_l', 'pawl_r',
    ...range('knot_', 6).map((k) => `${k}_hit`), 'pawl_l_hit', 'pawl_r_hit', 'muzzle_top', 'canister_muzzle', ...range('thread_anchor_', 6),
    'body_mesh', 'boss_lamps', 'gauge'],
  lampSets: { boss_lamps: 14, gauge: 26 },
  codeDriven: ['arm_yaw', 'drum_spin', ...range('knot_', 6), 'pawl_l', 'pawl_r'],
  animations: [loop('idle_sway', 4.0, { priority: 1 }), clip('present', 1.0), clip('mouth_open', 0.2), clip('mouth_close', 0.2), clip('guard_slide_on', 1.2), clip('guard_drop', 0.6),
    clip('guard_raise', 0.6), clip('guard_shatter', 1.0), clip('sag_death', 3.0)],
  pivot: 'bore axis at chamber floor level, arm heading +Z at yaw 0', shape: 'cylinder', size: [5.0, 13.0, 5.0],
  notes: 'One rigid-skinned body mesh (body_mesh) plus two lamp-set meshes: 3 draw calls. boss_lamps indices: 0-5 mouth lamps 1-6, 6-11 knot cores 1-6, 12 pawl_l core, 13 pawl_r core. gauge indices 0-25 = pips (10, 10, 6). mouth_open / mouth_close are authored on mouth_1 and retargeted by code; idle_sway keys root only.',
});
B('proj_canister', { category: 'boss', priority: 0, triBudget: 80, instanced: true, sets: ['underground'], pivot: 'centre', anchor: 'centre', shape: 'cylinder', size: [0.35, 0.3, 0.35] });

// ---------------------------------------------------------------- resident sets of runtime props (default: all three)
const S = ['surface'], U = ['underground'], SU = ['surface', 'underground'];
const SET_OVERRIDES = {
  ia_ammo_box: SU, ia_line_locker: U, ia_jug: S, prop_stock_gate: S, prop_cup_tin: S, prop_yard_gate: S, ia_yard_door: S,
  knot_mech: SU, ia_yard_bell: S, sec_loft_bell: S, prop_door_frontier: S, prop_lantern: S, prop_bottle: S, prop_crate: SU, prop_barrel: SU,
  prop_sack: S, prop_strain_cloth: S, prop_door_pellam: U, prop_grate: SU, prop_station_plate: U, prop_cartridge_line: U, prop_cartridge_kept: ['coda'],
  enemy_bider: SU, bider_seated_static: SU, bider_felled_static: SU, proj_stake: SU,
};
for (const [id, s] of Object.entries(SET_OVERRIDES)) {
  if (!assets[id]) throw new Error(`SET_OVERRIDES: unknown asset ${id}`);
  assets[id].sets = s;
}

// ---------------------------------------------------------------- textures
const MB = 1024 * 1024;
const BYTES = { r8: 1, rgba8: 4 };
const textures = {};
function tex(id, t) {
  const [w, h] = t.size;
  const mips = t.mips ?? true;
  const gpuBytes = Math.round(w * h * BYTES[t.format] * (mips ? 4 / 3 : 1));
  textures[id] = {
    path: `assets/${t.kind === 'lightmap' || t.kind === 'lightlayer' ? 'lm' : 'tex'}/${id}.webp`,
    source: t.source ?? `blender/tex/${id}.py`,
    owner: t.owner,
    kind: t.kind,
    size: t.size,
    format: t.format,
    colorSpace: t.colorSpace ?? (t.format === 'r8' ? 'none' : 'srgb'),
    mips,
    wrap: t.wrap ?? 'repeat',
    sets: t.sets ?? ['always'],
    gpuBytes,
    ...(t.lightmapScale ? { lightmapScale: t.lightmapScale } : {}),
    ...(t.uv ? { uv: t.uv } : {}),
    ...(t.neutralTexel ? { neutralTexel: t.neutralTexel } : {}),
    ...(t.usedBy ? { usedBy: t.usedBy } : {}),
    ...(t.regions ? { regions: t.regions } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
  };
}
const FLAT_NOTE = 'Region `flat` is a uniform 0.5 grey cell: embedded props and far scenery merged into a zone chunk point UV0 at it and carry their palette colour in COLOR_0, so they need no material of their own.';
tex('tx_frontier_trim', { owner: 'env_exterior', kind: 'detail', size: [1024, 512], format: 'r8', usedBy: ['m_frontier'],
  regions: ['plank_a', 'plank_b', 'plank_end', 'adobe', 'tin', 'strata', 'strap', 'cord', 'flat'], notes: FLAT_NOTE });
tex('tx_pellam_trim', { owner: 'env_interior', kind: 'detail', size: [1024, 512], format: 'r8', usedBy: ['m_pellam'],
  regions: ['panel', 'panel_rib', 'steel', 'floor', 'concrete', 'cable', 'flat'], notes: FLAT_NOTE });
tex('tx_sand', { owner: 'env_exterior', kind: 'detail', size: [512, 512], format: 'r8', usedBy: ['m_sand'] });
tex('tx_mask', { owner: 'props_dress', kind: 'mask', size: [1024, 512], format: 'r8', wrap: 'clamp', usedBy: ['m_mask'],
  regions: ['mark_cast', 'mark_brush_a', 'mark_brush_b', 'mark_brush_c', 'strike', 'numerals', 'wordmark', 'station', 'plate_lines', 'picto_daycell', 'picto_line',
    'picto_charge', 'picto_misc', 'tally', 'family_marks', 'grille', 'louvre', 'card_edges', 'card_dowser'],
  notes: 'Alpha-test 0.5 on the red channel. grille and louvre tile; give them their own UV island with repeat handled in geometry.' });
tex('tx_palette', { owner: 'props_dress', kind: 'palette', size: [256, 256], format: 'rgba8', wrap: 'clamp', usedBy: ['m_flat', 'm_prop'], notes: 'Built for real by the foundation pipeline in phase 2; props_dress owns later revisions. Pass i2: rows 6 to 15 (y 96..255) are no longer free: they hold the cloth atlas (blender/tex/cloth_atlas.py) with regions hood (0,96,256,80), coat (0,176,160,80), sleeve (160,176,48,80), weave (208,176,48,80); an m_prop UV0 is a cell centre, a point in a cloth region OR a point in a knot region. Pass i3: columns 10 to 15 of rows 2 to 5 (x 160..255, y 32..95) hold the knot atlas (blender/tex/knot_atlas.py): knot (160,32,64,64), knot_dead (224,32,32,32), cord (224,64,32,16), cord_dead (224,80,32,16); never name a cell past column 9 in rows 2 to 5. Append-only, like the cells.' });
tex('tx_palette_emis', { owner: 'props_dress', kind: 'emissive', size: [256, 256], format: 'rgba8', wrap: 'clamp', usedBy: ['m_emis', 'm_prop'], notes: 'Built for real by the foundation pipeline in phase 2; props_dress owns later revisions. Pass i3: no longer black except eight cells: the knot block (x 160..255, y 32..95) holds the light in the glass of the townspeople\'s knot (blender/tex/knot_atlas.py); the dead regions are black.' });
tex('tx_gun', { owner: 'weapons', kind: 'albedo', size: [1024, 512], format: 'rgba8', wrap: 'clamp', usedBy: ['m_gun'], notes: 'RGB albedo, A = gloss mask.' });
tex('tx_matcap_steel', { owner: 'weapons', kind: 'matcap', size: [256, 256], format: 'rgba8', wrap: 'clamp', usedBy: ['m_gun'] });
// ruling R14 (release pass p0): the view-model's own texture set. 2.33 MiB in all; the seam stage on Low goes 61.0 -> 63.3 of 64.
tex('tx_gun_detail', { owner: 'weapons', kind: 'detail', size: [1024, 512], format: 'r8', wrap: 'clamp', usedBy: ['m_gun'],
  notes: 'R14. One channel in tx_gun\'s UV layout: surface detail of the revolver (height: engraving, knurling, screw slots, pitting, edge wear), 0.5 = flat. The shader turns it into a bump and a cavity term.' });
tex('tx_hands', { owner: 'weapons', kind: 'albedo', size: [512, 512], format: 'rgba8', wrap: 'clamp', usedBy: ['m_hands'],
  notes: 'R14. RGB albedo of the hands and forearms (a glove or skin, cuff, seams), A = gloss mask. UV0 of the meshes that use m_hands.' });
tex('tx_hands_detail', { owner: 'weapons', kind: 'detail', size: [512, 512], format: 'r8', wrap: 'clamp', usedBy: ['m_hands'],
  notes: 'R14. One channel in tx_hands\' UV layout: height (stitching, creases, knuckles, grain), 0.5 = flat.' });
tex('tx_fx', { owner: 'render', kind: 'fx', size: [1024, 512], format: 'rgba8', wrap: 'clamp', source: 'tools/gen_fx_atlas.mjs', usedBy: ['vfx'],
  regions: ['flash_a', 'flash_b', 'flash_c', 'flash_d', 'smoke_a', 'smoke_b', 'dust_a', 'dust_b', 'spark', 'soft_dot', 'star4', 'shard', 'splinter', 'sand_pour',
    'mote_cluster', 'dec_wood', 'dec_adobe', 'dec_metal', 'dec_ceramic', 'dec_stone'],
  notes: 'Row A: four 256 px cells; rows B-C: sixteen 128 px cells (ART_BIBLE 9.1). Drawn by script with sharp; premultiplied alpha.' });
tex('tx_noise', { owner: 'render', kind: 'noise', size: [128, 128], format: 'r8', source: 'tools/gen_fx_atlas.mjs', usedBy: ['world', 'vfx'] });

const VERTEX_LIGHT_SCALE = 2;
// Lightmaps: the 4 x 4 texel block at the top-left corner is painted white after the bake ("neutral texel"). A vertex-lit
// vertex of a lightmapped mesh puts its UV1 at the block centre, so light = 1.0 x lightmapScale = VERTEX_LIGHT_SCALE and its
// COLOR_0 (tint x light / VERTEX_LIGHT_SCALE) is displayed exactly as on a pure vertex-lit mesh. Light layers are black there.
const lm = (id, t) => tex(id, { kind: 'lightmap', format: 'rgba8', mips: false, wrap: 'clamp', uv: 1, lightmapScale: VERTEX_LIGHT_SCALE,
  neutralTexel: { px: [0, 0, 4, 4], uv: [2 / t.size[0], 2 / t.size[1]], value: t.kind === 'lightlayer' ? 0 : 1 }, ...t });
lm('lm_surface', { owner: 'env_exterior', size: [2048, 2048], sets: ['surface'], source: 'blender/env_exterior/bake_surface.py',
  notes: 'Shared by env_the_lip and env_plenty_street (exterior). One bake scene holds both zones.' });
lm('lm_tally', { owner: 'env_interior', size: [1024, 1024], sets: ['surface'], source: 'blender/env_interior/env_tally_house.py' });
lm('lm_tally_hatch', { owner: 'env_interior', kind: 'lightlayer', format: 'r8', size: [512, 512], sets: ['surface'], source: 'blender/env_interior/env_tally_house.py',
  notes: 'Greyscale aqua up-light from the open hatch; same UV1 as lm_tally; tinted aqua and faded in by weight (hatch_powered).' });
lm('lm_gallery', { owner: 'env_interior', size: [1024, 1024], sets: ['underground'], source: 'blender/env_interior/env_the_gallery.py' });
lm('lm_hall', { owner: 'env_interior', size: [1024, 1024], sets: ['underground'], source: 'blender/env_interior/env_lift_hall.py' });
lm('lm_bore', { owner: 'env_interior', size: [1024, 1024], sets: ['underground'], source: 'blender/env_interior/env_the_bore.py',
  notes: 'Fill layer: six aqua bay lamps, embers, cradle lamp, AO. No bore light in this layer.' });
lm('lm_bore_glow', { owner: 'env_interior', kind: 'lightlayer', format: 'r8', size: [1024, 1024], sets: ['underground'], source: 'blender/env_interior/env_the_bore.py',
  notes: 'Greyscale light from the bore alone; tinted violet -> aqua by wrong_fade (bottom-up by world height).' });
lm('lm_rim', { owner: 'env_exterior', size: [512, 512], sets: ['coda'], source: 'blender/env_exterior/env_far_rim.py' });

// ---------------------------------------------------------------- bindings: layout reference -> asset
// A binding is { asset, mode, node?, ... } or an array of them, or null (no runtime asset: zone geometry or code only).
// mode (docs/ARCHITECTURE.md section 9):
//   instance  world instantiates the asset once per marker that resolves to this binding
//   variant   as instance, showing only the variant node `node`
//   partOf    nothing is instantiated: the marker is a part (`node`, or the root) of the instance that marker `owner` created
//   zoneNode  nothing is instantiated: `node` (optionally lamp `index`) of a zone GLB that is already in the scene
//   embedded  nothing is instantiated: the mesh was merged into the zone GLB by the zone script; world adds only interaction
//   actor     spawned and animated by src/enemies (encounter members and vignette actors), never by world
// offset [x, y, z]: asset-local metres from the marker to the pivot (pivot = marker.pos + R * offset * scale); default 0.
// follow {owner, node}: the instance and its hit volume keep their rest offset from that node of the owner marker's instance.
// space "world": the asset is authored in world coordinates and is added at identity.
// per "seats": one instance per entry of marker.params.seats.
const b = (assetId, mode, node, extra) => ({ asset: assetId, mode, ...(node ? { node } : {}), ...(extra ?? {}) });
const family = (prefix, n, make) => Object.fromEntries(range(prefix, n).map((k, i) => [k, make(i + 1)]));
const KNOT = { offset: [0, 0, -0.08] };
const bindings = {
  pickup: { pk_rounds_6: b('pk_rounds_6', 'instance'), pk_rounds_12: b('pk_rounds_12', 'instance'), pk_canteen: b('pk_canteen', 'instance') },
  enemy: { bider: b('enemy_bider', 'actor'), transit: b('enemy_transit', 'actor'), tamper: b('enemy_tamper', 'actor'), windlass: b('boss_windlass', 'actor') },
  interactable: {
    ...family('ia_jug_', 6, (i) => b('ia_jug', 'variant', 'jug_intact', { offset: [0, 0.81, 0], follow: { owner: 'door_jug_gate', node: `hook_${i}` } })),
    ia_jug_7: b('ia_jug', 'variant', 'jug_intact', { offset: [0, 0.81, 0] }),
    ia_ammo_box: b('ia_ammo_box', 'instance'),
    ia_yard_door: b('ia_yard_door', 'partOf', null, { owner: 'ia_yard_door' }),
    knot_yard_latch: b('knot_mech', 'instance', null, KNOT),
    sec_loft_bell_rope: b('sec_loft_bell', 'partOf', 'rope', { owner: 'sec_loft_bell' }),
    ia_yard_bell: b('ia_yard_bell', 'instance', null, { offset: [0, -2.2, 0] }),
    ia_latch_s: b('ia_shutter', 'partOf', 'latch', { owner: 'shutter_s' }), ia_latch_m: b('ia_shutter', 'partOf', 'latch', { owner: 'shutter_m' }), ia_latch_n: b('ia_shutter', 'partOf', 'latch', { owner: 'shutter_n' }),
    ia_cloth_cord: b('prop_share_cloth', 'partOf', 'cord', { owner: 'prop_share_cloth' }),
    ia_hatch: b('ia_hatch', 'partOf', null, { owner: 'ia_hatch' }),
    knot_hatch_latch: b('knot_mech', 'instance', null, KNOT),
    ia_line_locker_bay: b('ia_line_locker', 'instance'), ia_line_locker_hall: b('ia_line_locker', 'instance'), ia_line_locker_secret: b('ia_line_locker', 'instance'), ia_line_locker_bore: b('ia_line_locker', 'instance'),
    ...family('ia_range_plate_', 3, () => b('ia_range_plate', 'instance', null, { offset: [0, 0.45, 0] })),
    knot_a: b('knot_mech', 'instance', null, { ...KNOT, scale: 1.25 }), knot_b: b('knot_mech', 'instance', null, { ...KNOT, scale: 1.25 }), knot_c: b('knot_mech', 'instance', null, { ...KNOT, scale: 1.25 }),
    ia_baffle: b('ia_baffle', 'partOf', null, { owner: 'ia_baffle' }),
    ia_lift_lever: b('ia_lift_lever', 'instance', null, { offset: [0, -1.2, 0] }),
    knot_cold_bay: b('knot_mech', 'instance', null, KNOT),
    ia_cradle: b('ia_cradle', 'instance', null, { offset: [0, 0, -0.1] }),
    ...family('ia_ask_port_', 8, (i) => b('ia_bore_door', 'partOf', `port_${i}`, { owner: 'door_bore' })),
    ...family('ia_proving_mark_', 6, (i) => b('env_the_bore', 'zoneNode', 'mark_glows', { index: i - 1 })),
    ia_proving_lift: b('ia_proving_lift_cage', 'partOf', 'control', { owner: 'lift_depart_bore' }),
    ia_stone_round: b('prop_cartridge_kept', 'variant', 'round_violet', { scale: 3.4 }),   // pass i4: it was 2.6, a dark speck 12 px tall at standing distance (story-a); the six spent cases beside it are zone-baked
  },
  prop: {
    cold_camp: null,
    dead_pylon: null,
    cup: b('prop_cup_tin', 'instance'),
    struck_door_mark: null,
    insulator_bell: b('sec_loft_bell', 'instance', null, { offset: [0, 1.05, 0] }),
    wind_pump_tower: b('env_plenty_street', 'zoneNode', 'pump_rotor'),
    share_cloth: b('prop_share_cloth', 'instance', null, { offset: [0, 0.855, 0] }),
    tally_wall: null,
    head_chair: null,
    barred_front_doors: null,
    bider_table_static: b('bider_table_static', 'instance', null, { per: 'seats' }),
    peg_rows: null,
    bider_watcher: b('enemy_bider', 'actor', null, { vignette: 'vig_watcher', fallback: 'bider_seated_static' }),
    range_firing_point: null,
    ring_lift_portal: null,
    wall_diagram_lift_head: null,
    cage_lift: b('ia_lift_cage', 'instance'),
    tamper_clean_static: null,
    station_plate: b('prop_station_plate', 'instance', null, { offset: [0, 0, -0.05] }),
    proving_lift_cage: b('ia_proving_lift_cage', 'instance'),
  },
  door: {
    door_jug_gate: [b('prop_stock_gate', 'instance', null, { offset: [0, 0, -1.1] }), b('prop_well_sweep', 'instance', null, { space: 'world' })],
    door_yard_gate: b('prop_yard_gate', 'instance'),
    ia_yard_door: b('ia_yard_door', 'instance', null, { offset: [r3(-yardDoorW / 2), 0, -0.44] }),
    door_alley: b('prop_door_frontier', 'instance', null, { offset: [r3(-frontierW / 2), 0, 0] }),
    door_tally: b('prop_door_frontier', 'instance', null, { offset: [r3(-frontierW / 2), 0, 0] }),
    ia_hatch: b('ia_hatch', 'instance', null, { offset: [0, r3(hatch.size[1]), 0] }),
    ia_baffle: b('ia_baffle', 'instance'),
    door_gallery_far: b('prop_door_pellam', 'instance'),
    door_lift_cage: b('ia_lift_cage', 'partOf', 'gate', { owner: 'lift_depart_hall', tolerance: 0.6 }),
    door_cold_bay: b('ia_cold_bay_shutter', 'instance'),
    door_bore: b('ia_bore_door', 'instance', null, { offset: [0, 1.5, 0] }),
    door_proving_lift: b('ia_proving_lift_cage', 'partOf', 'gate', { owner: 'lift_depart_bore', tolerance: 0.6 }),
  },
  puzzleElement: {
    shutter_s: b('ia_shutter', 'instance', null, { offset: [0, -0.45, 0] }), shutter_m: b('ia_shutter', 'instance', null, { offset: [0, -0.45, 0] }), shutter_n: b('ia_shutter', 'instance', null, { offset: [0, -0.45, 0] }),
    day_cell: b('prop_day_cell', 'instance', null, { offset: [0, 0, -0.04] }),
    pz_proving_mark: b('prop_proving_step', 'instance', null, { offset: [0, -0.15, 0] }),
    pz_sighting_loop: b('prop_sighting_loop', 'instance', null, { offset: [0, -loopUp, 0] }),
    pz_listening_lamps: b('ia_bore_door', 'partOf', 'listen_lamps', { owner: 'door_bore' }),
    bore_opening: null,
  },
  readable: {
    rd_note_lip: b('rd_note', 'embedded', 'note_lip'), rd_note_hearth: b('rd_note', 'embedded', 'note_hearth'), rd_note_cradle: b('rd_note', 'embedded', 'note_cradle'), rd_note_stone: b('rd_note', 'embedded', 'note_stone'),
    rd_ledger: b('rd_ledger', 'embedded'), rd_rain_tally: b('rd_rain_tally', 'embedded'),
    rd_plate_line: b('rd_plate', 'embedded', 'plate_line'), rd_plate_proving: b('rd_plate', 'embedded', 'plate_proving'), rd_plate_service: b('rd_plate', 'embedded', 'plate_service'),
  },
  // keyed by spawn `entrance`: what world instantiates at an enemy_spawn marker with that entrance
  entrance: { doorway: null, emerge: null, climb_out: b('prop_grate', 'instance', null, { offset: [0, 0.03, 0] }) },
  // layout solids that carry a `prop` tag: which asset the zone script embeds over that solid (null = modelled as part of the zone itself)
  solidProp: {
    tipped_wagon_bed: b('prop_wagon_tipped', 'embedded'), adobe_wall_stub: null, ceramic_rib: null, pump_post: b('prop_trough_pump', 'embedded'), dry_trough: b('prop_trough_pump', 'embedded'),
    wind_pump_drum: null, water_cart: b('prop_water_cart', 'embedded'), water_tank: null, tank_shed: null,
    tally_table: b('prop_tally_table', 'embedded'), tally_table_end: null, hearth: null, hearthstone: null, head_chair: b('prop_head_chair', 'embedded'),
    brass_mark_step: null, pipe_bank: null, hall_rib: null, bore_rib: null, flat_stone: b('prop_rim_stone', 'embedded'),
  },
  // zone-embedded assets and the layout marker (or solid) that fixes their position
  zoneEmbedded: {
    prop_camp_one: [b('prop_flat_stone', 'embedded'), b('prop_coffee_pot', 'embedded'), b('prop_cartridge_lead', 'embedded', 'round_spent')],
    prop_camp_two: [b('prop_camp_ash', 'embedded', 'ash_cold')],
    prop_camp_three: [b('prop_camp_ash', 'embedded', 'ash_embers'), b('prop_kettle', 'embedded')],
    prop_head_chair: [b('prop_head_chair', 'embedded')],
    prop_tally_seated: [b('prop_chair', 'embedded')],
    prop_front_doors: [b('prop_bench', 'embedded')],
    sec_cold_bay: [b('tamper_cold_static', 'embedded')],
    rd_note_stone: [b('prop_cartridge_kept', 'embedded', 'round_spent')],
    ...family('ia_proving_mark_', 6, () => [b('ia_proving_mark', 'embedded')]),
  },
};

// ---------------------------------------------------------------- quality tiers and render-target memory
// Bytes per drawing-buffer pixel of every render target a tier allocates, at the tier's largest buffer.
// canvas: RGBA8 colour + depth24 (the context always has depth so a demotion to `min` needs no new context).
const px = (w, h) => w * h;
const tierDef = (t) => ({ ...t, bytesPerPixel: +t.targets.reduce((n, x) => n + x.bytesPerPixel, 0).toFixed(2), renderTargetBytes: renderTargetBytes(t) });
const tiers = {
  min: tierDef({
    userSelectable: false, composer: false, antialias: 'context_msaa', bloom: false, sunShadowMap: false,
    maxPixelRatio: 1.0, minPixelRatio: 0.5, maxBufferHeight: 648, maxBufferPixels: px(1152, 648), textureBudgetMB: 64,
    drawCalls: { typical: 100, worst: 150 }, triangles: 120000, fullScreenDraws: 0,
    targets: [{ name: 'canvas colour, 4 samples + resolve', bytesPerPixel: 20 }, { name: 'canvas depth, 4 samples', bytesPerPixel: 16 }],
    notes: 'Hidden emergency tier: no composer; Neutral tone map + grade inlined into every material through CustomToneMapping; context MSAA when the context was created for this tier (boot or ?tier=min), none after a runtime demotion.',
  }),
  low: tierDef({
    userSelectable: true, composer: true, antialias: 'none', bloom: false, sunShadowMap: false,
    maxPixelRatio: 1.0, minPixelRatio: 0.5, maxBufferHeight: 768, maxBufferPixels: px(1366, 768), textureBudgetMB: 64,
    drawCalls: { typical: 100, worst: 150 }, triangles: 120000, fullScreenDraws: 1,
    // release pass p0 (closer): ONE scene buffer. Low's single merged pass draws to the canvas, so the composer's second
    // buffer is never allocated (render-tech's GL hook, tests/render/release_p0.test.mjs): 20 bytes a pixel, not 28
    targets: [{ name: 'canvas colour + depth', bytesPerPixel: 8 }, { name: 'one RGBA16F scene buffer', bytesPerPixel: 8 }, { name: 'scene depth', bytesPerPixel: 4 }],
  }),
  high: tierDef({
    userSelectable: true, composer: true, antialias: 'fxaa', bloom: true, sunShadowMap: true,
    maxPixelRatio: 1.5, minPixelRatio: 0.7, maxBufferHeight: 1080, maxBufferPixels: px(1920, 1080), textureBudgetMB: 128,
    drawCalls: { typical: 220, worst: 220 }, triangles: 400000, fullScreenDraws: 12,
    targets: [{ name: 'canvas colour + depth', bytesPerPixel: 8 }, { name: 'two RGBA16F scene buffers', bytesPerPixel: 16 }, { name: 'scene depth, one per scene buffer', bytesPerPixel: 8 },
      { name: 'half-resolution RGBA16F luminance', bytesPerPixel: 2 }, { name: 'bloom mip chain, 5 levels down and up', bytesPerPixel: 5.33 }],
    fixed: [{ name: '1024 x 1024 sun shadow map (depth + colour)', bytes: 8 * MB }],
  }),
};

// ---------------------------------------------------------------- resident sets and stages
const sets = {};
for (const s of ['always', ...ALL_SETS]) {
  const texIds = Object.keys(textures).filter((k) => textures[k].sets.includes(s));
  sets[s] = {
    zones: L.zones.filter((z) => z.set === s).map((z) => z.id),
    textures: texIds,
    textureBytes: texIds.reduce((n, k) => n + textures[k].gpuBytes, 0),
  };
}
for (const s of ALL_SETS) {
  sets[s].assets = Object.keys(assets).filter((k) => assets[k].placedBy !== 'zone' && assets[k].sets.includes(s));
  sets[s].residentTextureMB = +((sets[s].textureBytes + sets.always.textureBytes) / MB).toFixed(2);
}
delete sets.always.zones;

// dressing the zone artist may place as inst_* / brk_* empties (check-glb enforces these per zone GLB)
const DRESSING = {
  the_lip: { tris: 1000, drawCalls: 2, assets: ['prop_bottle', 'prop_sack'] },
  plenty_street: { tris: 6000, drawCalls: 6, assets: ['prop_lantern', 'prop_bottle', 'prop_crate', 'prop_barrel', 'prop_sack', 'prop_strain_cloth'] },
  tally_house: { tris: 2000, drawCalls: 3, assets: ['prop_lantern', 'prop_bottle', 'prop_sack'] },
  the_gallery: { tris: 10000, drawCalls: 5, assets: ['prop_coat_hung', 'prop_hat_hung', 'prop_boots_pair', 'prop_crate'] },
  lift_hall: { tris: 2000, drawCalls: 3, assets: ['prop_crate', 'prop_barrel'] },
  the_bore: { tris: 1000, drawCalls: 2, assets: ['prop_crate', 'prop_barrel'] },
  far_rim: { tris: 500, drawCalls: 1, assets: [] },
};
for (const [z, d] of Object.entries(DRESSING)) for (const id of d.assets) {
  if (assets[id]?.placedBy !== 'dressing') throw new Error(`DRESSING.${z}: ${id} is not a dressing asset`);
  if (!assets[id].sets.includes(L.zones.find((x) => x.id === z).set)) throw new Error(`DRESSING.${z}: ${id} is not resident in that zone's set`);
}

// ---------------------------------------------------------------- visibility cells
// A "unit" is anything world can show or hide through render.setVisible(): a zone chunk, or an `origin` asset that has no chunks.
const units = {};
for (const [id, a] of Object.entries(assets)) {
  if (a.placedBy !== 'origin') continue;
  if (a.chunks) for (const c of a.chunks) units[c.id] = { asset: id, zone: a.zone, tris: c.tris, drawCalls: c.drawCalls, box: c.box, ...(c.part ? { part: c.part } : {}), ...(c.solids ? { solids: c.solids } : {}) };
  else units[id] = { asset: id, zone: a.zone, tris: a.triBudget, drawCalls: a.drawCalls };
}
const BOX = (min, max) => ({ min, max });
const LIP = ['chunk_lip_rock', 'chunk_lip_upper', 'chunk_lip_mid', 'chunk_lip_gate'];
const STREET = ['chunk_st_east', 'chunk_st_west', 'chunk_st_yard', 'chunk_st_works'];
const GALLERY = ['chunk_gl_stair', 'chunk_gl_bay', 'chunk_gl_gallery'];
const BORE = ['chunk_bo_ante', 'chunk_bo_chamber'];
// Cells are tested in order; the first cell of the player's zone whose box contains the feet wins (a cell without a box is the zone's default).
// show: always drawn from this cell. showIf: drawn while the condition holds:
//   { door, state: "closed" | "not_closed" }  the door marker's state ("ajar", "opening", "open", "closing" are all not_closed)
//   { flag, value: true }                     world.flag(name)
//   notDuring: encounters that cannot be live while the condition holds (budget only; the reason is in `why`)
// accept: units that the blockout says could be glimpsed from this cell but are deliberately not drawn, with the reason.
// tools/validate_assets.mjs ray-tests every hidden unit against the blockout: a hidden unit that can be seen must be listed under accept.
const cells = [
  { id: 'cell_lip_gully', zone: 'the_lip', box: BOX([0, -1, 9], [32, 26, 111]), show: [...LIP, 'chunk_st_east', 'env_backdrop_day'],
    why: 'The overhang and the four reaches down to the forecourt. The 12 to 22 m gully walls hide the town: only the tops of the first facades show over the gate wall.' },
  { id: 'cell_lip_gate', zone: 'the_lip', show: [...LIP, 'chunk_st_east', 'chunk_st_west', 'chunk_st_works', 'env_backdrop_day'],
    accept: [{ unit: 'chunk_st_yard', why: 'the yard floor and walls can be glimpsed only through door_yard_gate and ia_yard_door together, 80 m or more away (both are shut the first time she stands here); the yard skyline (drum, wind-pump, tank) is chunk_st_works and is drawn' }],
    why: 'The forecourt: the whole street is seen through the jug gate, and the gully back up to the overhang.' },
  { id: 'cell_street', zone: 'plenty_street', box: BOX([-80, -1, -16], [0, 16, 16]), show: [...STREET, 'chunk_lip_rock', 'chunk_lip_gate', 'env_backdrop_day'],
    accept: [{ unit: 'chunk_ty_hall', plug: 'plug_door_tally', why: 'a sliver through door_alley and door_tally: the doorway shows plug_door_tally' }],
    why: 'Front Street and the gate court. Of the lip only the skyline rock, the gate wall, the forecourt and the last reach can be seen (the blockout rays reach nothing above z = 30 at path level).' },
  { id: 'cell_yard_door', zone: 'plenty_street', box: BOX([-97, -1, -16], [-81, 16, -4]), show: ['chunk_st_west', 'chunk_st_yard', 'chunk_st_works', 'chunk_lip_rock', 'env_backdrop_day'],
    showIf: [
      { units: ['chunk_ty_hall'], door: 'door_tally', state: 'not_closed', notDuring: ['enc_street', 'enc_yard'], why: 'door_tally opens only after the sighting, which needs enc_yard clear' },
      { units: ['chunk_st_east'], door: 'door_tally', state: 'closed', why: 'the east half of the street (60 m off: about 1 % of the blockout rays from this strip reach it, through both gateways) is traded for the hall interior at the moment the door opens' },
    ],
    why: 'The 12 m strip in front of the Tally House door: the only place the hall interior is drawn from outside.' },
  { id: 'cell_yard', zone: 'plenty_street', show: [...STREET, 'chunk_lip_rock', 'chunk_lip_gate', 'env_backdrop_day'],
    accept: [{ unit: 'chunk_ty_hall', plug: 'plug_door_tally', why: 'from the rest of the yard the open Tally House door is a dark doorway: plug_door_tally' }],
    why: 'The pump yard.' },
  { id: 'cell_tally_seam', zone: 'tally_house', box: BOX([-97, -5.5, -38], [-81, -0.35, -14]), show: ['chunk_ty_hall'],
    showIf: [{ units: ['chunk_gl_stair', 'chunk_gl_bay'], flag: 'hatch_powered', value: true, why: 'the staged gallery stair (it is what she stands on) and, pass i4, the proving bay she looks into down flight 2 through the stair\'s mouth (it was the sky\'s fog in a 2 m x 5 m rectangle until trg_set_swap)' }],
    why: 'Peg-stair flight 1, landing 1 and the top of flight 2 while the surface set is resident (zoneAt gives tally_house here until trg_set_swap).' },
  { id: 'cell_tally', zone: 'tally_house', show: ['chunk_ty_hall'],
    showIf: [
      { units: ['chunk_st_yard', 'chunk_st_works', 'env_backdrop_day'], door: 'door_tally', state: 'not_closed', notDuring: ['enc_street', 'enc_yard', 'enc_tally'], why: 'door_tally opens only after enc_yard is clear and the sighting is over, and enc_tally locks it again' },
      { units: ['chunk_gl_stair'], door: 'ia_hatch', state: 'not_closed', why: 'ajar or open: the stair shows through the gap' },
    ],
    accept: [{ unit: 'chunk_st_west', why: '3 of 5 040 blockout rays reach the gatehouse roof over the yard wall through the 1.6 m door' }],
    why: 'The hall.' },
  { id: 'cell_gallery_stair', zone: 'the_gallery', box: BOX([-95, -9.5, -36], [-83, 0, -18.5]), show: ['chunk_gl_stair', 'chunk_gl_bay'],
    why: 'The peg stair after the swap. The hatch above is shut; the bay shows at the foot of flight 3.' },
  { id: 'cell_gallery', zone: 'the_gallery', show: GALLERY,
    showIf: [{ units: ['chunk_lh_hall'], door: 'door_gallery_far', state: 'not_closed', why: 'wave B of enc_file opens it and it stays open until trg_enc_matador' }],
    why: 'Proving bay and gallery.' },
  { id: 'cell_hall', zone: 'lift_hall', show: ['chunk_lh_hall'],
    showIf: [{ units: ['chunk_gl_gallery', 'chunk_gl_bay'], door: 'door_gallery_far', state: 'not_closed', why: 'the gallery seen back through the far door from the gantry' }],
    why: 'The lift hall, gantry, cage bay and cold bay. During a ride only env_lift_shaft and the cage are drawn.' },
  { id: 'cell_bore', zone: 'the_bore', show: BORE, why: 'Arrival bay, catwalk, antechamber and chamber: the catwalk looks into the chamber through its grille.' },
  { id: 'cell_rim', zone: 'far_rim', show: ['chunk_rim_ledge', 'rim_town_card', 'env_backdrop_dusk'], why: 'The far rim.' },
];

// A plug is a black panel in a doorway of the near zone's GLB. World shows it while `door` is not closed and `unit` is hidden,
// so an interior that is not drawn reads as a dark doorway instead of a hole.
const PLUGS = [{ node: 'plug_door_tally', asset: 'env_plenty_street', door: 'door_tally', unit: 'chunk_ty_hall' }];

// ---------------------------------------------------------------- budgets (model: tools/validate_assets.mjs cellBudget)
const ALLOW = {
  gunTris: assets.weapon_revolver.triBudget, gunDrawCalls: assets.weapon_revolver.drawCalls,
  fxTris: 1700,                       // ART_BIBLE 9.2 Low column at pool caps: sand streaks 200 quads, decals 48, halos ~50, burst quads ~150, cards, rings, blob shadows: about 1 000 triangles; x 1.7 (it was doubled: release pass p0, ruling R14)
  fxDrawCalls: { typical: 6, worst: 11 }, // blob shadows, decals, halos (3) + particles additive and blended, lines, rings, cards, dust (<= 8)
  skyDrawCalls: 1,
  staticBodyTris: Math.max(assets.bider_seated_static.triBudget, assets.bider_felled_static.triBudget), staticBodyDrawCalls: 2,
  bossAddBodies: 15,                  // GDD 8: 6 adds in phase 2, up to 9 in phase 3a
  projectileTris: 26 * assets.proj_stake.triBudget + 3 * assets.proj_canister.triBudget, projectileDrawCalls: 3,
  pickupDropTris: 6 * assets.pk_rounds_12.triBudget, // dropped pickups alive at once
  // GDD 7: never more than 6 enemies alive outside the boss room. Encounters are sequential except these pairs.
  liveCap: 6,
  overlaps: [{ encounters: ['enc_file', 'enc_matador'], why: 'wave B of enc_file opens door_gallery_far: the player can reach trg_enc_matador with Biders of the File still up' }],
};
const zones = Object.fromEntries(L.zones.map((z) => [z.id, { set: z.set, dressing: DRESSING[z.id] }]));
const model = { assets, bindings, tiers, allowances: ALLOW, zones, visibility: { units, cells } };
for (const c of cells) c.budget = cellBudget(model, L, c);
for (const z of L.zones) {
  const env = Object.keys(assets).find((k) => assets[k].zone === z.id && assets[k].chunks);
  const own = cells.filter((c) => c.zone === z.id);
  zones[z.id] = {
    set: z.set, env,
    chunks: assets[env].chunks.map((c) => c.id),
    cells: own.map((c) => c.id),
    dressing: DRESSING[z.id],
    // everything the visibility rules allow to be drawn while the player is in this zone, whatever the camera faces
    triangles: Math.max(...own.map((c) => c.budget.triangles)),
    drawCalls: { typical: Math.max(...own.map((c) => c.budget.drawCalls.typical)), worst: Math.max(...own.map((c) => c.budget.drawCalls.worst)) },
  };
}

// ---------------------------------------------------------------- stages (what is resident when)
// The seam (docs/ARCHITECTURE.md 3.6): from world/hatch_powered until trg_set_swap the gallery is staged beside the surface set.
const seamZone = 'the_gallery';
const seamAssets = [...new Set([
  zones[seamZone].env,
  ...L.markers.filter((m) => m.zone === seamZone).flatMap((m) => markerBindings(model, m)).filter((x) => x.bind.mode === 'instance' || x.bind.mode === 'variant').map((x) => x.bind.asset),
  ...DRESSING[seamZone].assets,
])].filter((id) => !assets[id].sets.includes('surface'));
const stage = (id, when, resident, staged) => {
  const textureBytes = sets.always.textureBytes + sets[resident].textureBytes + (staged?.textures ?? []).reduce((n, t) => n + textures[t].gpuBytes, 0);
  return { id, when, resident, ...(staged ? { staged } : {}), textureBytes,
    totalMB: Object.fromEntries(Object.entries(tiers).map(([t, d]) => [t, +((textureBytes + d.renderTargetBytes) / MB).toFixed(1)])) };
};
const stages = [
  stage('surface', 'boot, or a restore to a surface checkpoint before hatch_powered', 'surface'),
  stage('seam', 'world/hatch_powered until trg_set_swap', 'surface', { zone: seamZone, assets: seamAssets, textures: assets[zones[seamZone].env].lightmaps }),
  stage('underground', 'trg_set_swap until the proving lift ride', 'underground'),
  stage('coda', 'the proving lift ride onward', 'coda'),
];

// ---------------------------------------------------------------- write
const manifest = {
  meta: {
    title: 'KEEP SEVEN — asset manifest',
    version: 2,
    generator: 'tools/gen_assets.mjs',
    spec: 'docs/ARCHITECTURE.md sections 7, 8 and 9',
    sources: ['docs/GDD.md', 'docs/ART_BIBLE.md', 'design/layout.json'],
    layoutVersion: L.meta.version,
    units: 'm, game space (+Y up, -Z forward). placeholder.size, offset, nodePos and hitPoint are [x, y, z]; asset-local axes: +Z is the asset\'s front, +Y up.',
    owners: ['env_exterior', 'env_interior', 'props_mech', 'props_dress', 'weapons', 'enemies', 'boss', 'render'],
    ownerFolders: { env_exterior: 'blender/env_exterior', env_interior: 'blender/env_interior', props_mech: 'blender/props/mech', props_dress: 'blender/props/dress', weapons: 'blender/weapons', enemies: 'blender/enemies', boss: 'blender/boss', render: 'tools' },
    pieces: { props: ['props_mech', 'props_dress'] },
    categories: ['env', 'props', 'weapons', 'enemies', 'boss'],
    priority: {
      0: 'on the critical path and seen within 5 m, or load-bearing for a puzzle, a fight or the story. Final before any P1 work starts.',
      1: 'on the path but not load-bearing: a placeholder here is noticed but breaks nothing.',
      2: 'dressing, secrets and polish clips (GDD 20.1 cut order). A P2 clip may ship as its `fallback` clip under its own name.',
    },
    enums: {
      bake: ['LM', 'VL', 'LM+VL', 'AO', 'UNLIT'],
      collision: ['none', 'box', 'mesh', 'separate:<id>'],
      placedBy: {
        origin: 'authored in world coordinates; loaded with its set and added at identity',
        zone: 'imported, lit in place and merged into its zone GLB by the zone script; never loaded on its own at runtime',
        layout: 'instantiated at runtime by src/world from design/layout.json markers through `bindings`',
        dressing: 'instantiated at runtime from `inst_*` / `brk_*` empties in a zone GLB (instanced)',
        code: 'spawned by a system (enemies, projectiles, view-model, lift shaft, cards)',
      },
      placeholderShape: ['box', 'capsule', 'cylinder'],
      placeholderAnchor: {
        base: 'pivot at the centre of the bottom face; the asset stands on a surface', sill: 'pivot at the centre of the bottom face; the asset is mounted in an opening', centre: 'pivot at the centre', top: 'pivot at the centre of the top face',
        back: 'pivot at the centre of the back (-Z) face', back_base: 'pivot at the middle of the bottom edge of the back face',
        hinge: 'pivot at the bottom of the -X edge, mid thickness', world: 'authored in world coordinates',
      },
      bindingMode: ['instance', 'variant', 'partOf', 'zoneNode', 'embedded', 'actor'],
    },
    rawExportDir: 'blender/export',
    publicDir: 'public',
    vertexLightScale: VERTEX_LIGHT_SCALE,
  },
  assets,
  textures,
  tiers,
  allowances: ALLOW,
  zones,
  visibility: { units, cells, plugs: PLUGS },
  sets,
  stages,
  bindings,
};
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 1) + '\n');
const nA = Object.keys(assets).length;
const tris = Object.values(assets).reduce((n, a) => n + a.triBudget, 0);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${nA} assets (${tris} tris budgeted), ${Object.keys(textures).length} textures`);
for (const s of stages) console.log(`  stage ${s.id}: textures ${(s.textureBytes / MB).toFixed(1)} MiB; with render targets min ${s.totalMB.min} / low ${s.totalMB.low} / high ${s.totalMB.high} MiB`);
for (const c of cells) console.log(`  ${c.id.padEnd(20)} static ${String(c.budget.staticTris).padStart(6)}  dynamic ${String(c.budget.dynamicTris).padStart(6)}  total ${String(c.budget.triangles).padStart(6)}  calls ${c.budget.drawCalls.typical}/${c.budget.drawCalls.worst}  (${c.budget.when}) ${JSON.stringify(c.budget.parts)}`);
const byOwner = {};
for (const a of Object.values(assets)) { byOwner[a.owner] ??= { assets: 0, clips: 0, p0: 0 }; byOwner[a.owner].assets++; byOwner[a.owner].clips += a.animations.length; if (a.priority === 0) byOwner[a.owner].p0++; }
for (const [o, v] of Object.entries(byOwner)) console.log(`  owner ${o.padEnd(13)} ${v.assets} assets (${v.p0} P0), ${v.clips} clips`);
