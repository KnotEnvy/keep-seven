#!/usr/bin/env node
// Generates design/layout.json — the blockout of KEEP SEVEN, stage one ("First Tally: Plenty").
// Run:  node tools/gen_layout.mjs
// The JSON is OUTPUT. Edit this script, never the JSON. Then run tools/validate_layout.mjs
// and tools/render_layout_map.mjs.
//
// Compass: north = -Z, east = +X, south = +Z, west = -X (matches docs/ART_BIBLE.md).
// Sun: azimuth 315 (north-west), elevation 14.
// Revision 2 (after the pre-production critic round): see docs/LEVEL.md section 10.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, rad, topAt } from './layout_geom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r2 = (v) => Math.round(v * 1000) / 1000;
const V = (x, y, z) => [r2(x), r2(y), r2(z)];

const zones = [], solids = [], markers = [], encounters = [];
const ids = new Set();
function uid(id) { if (ids.has(id)) throw new Error('duplicate id ' + id); ids.add(id); return id; }

// ---------------------------------------------------------------- solid helpers
function box(id, zone, role, surface, x0, x1, y0, y1, z0, z1, extra = {}) {
  if (x1 <= x0 || y1 <= y0 || z1 <= z0) throw new Error('degenerate box ' + id);
  solids.push({ id: uid(id), zone, shape: 'box', pos: V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), size: V(x1 - x0, y1 - y0, z1 - z0), rotY: 0, role, surface, ...extra });
}
/** Oriented box: centre (cx,cz), base at y0, height h. */
function obox(id, zone, role, surface, cx, y0, cz, sx, h, sz, rotY, extra = {}) {
  solids.push({ id: uid(id), zone, shape: 'box', pos: V(cx, y0 + h / 2, cz), size: V(sx, h, sz), rotY: r2(rotY), role, surface, ...extra });
}
function ramp(id, zone, surface, x0, x1, z0, z1, yLow, yHigh, rise, extra = {}) {
  solids.push({ id: uid(id), zone, shape: 'ramp', pos: V((x0 + x1) / 2, (yLow + yHigh) / 2, (z0 + z1) / 2), size: V(x1 - x0, yHigh - yLow, z1 - z0), rotY: 0, role: extra.role || 'stairs', surface, rise, skirt: 1, ...extra });
}
function cyl(id, zone, role, surface, cx, y0, cz, radius, h, extra = {}) {
  solids.push({ id: uid(id), zone, shape: 'cylinder', pos: V(cx, y0 + h / 2, cz), size: V(radius * 2, h, radius * 2), rotY: 0, role, surface, ...extra });
}
/** Wall running along X (thickness z0..z1) with openings [{a,b,top,sill}] measured in x. */
function wallAlongX(id, zone, surface, xa, xb, z0, z1, y0, y1, openings = [], extra = {}) {
  let cur = xa, k = 0;
  for (const o of [...openings].sort((p, q) => p.a - q.a)) {
    if (o.a > cur) box(`${id}_${k++}`, zone, 'wall', surface, cur, o.a, y0, y1, z0, z1, extra);
    if (o.top !== undefined && o.top < y1) box(`${id}_lintel${k++}`, zone, 'wall', surface, o.a, o.b, o.top, y1, z0, z1, extra);
    if (o.sill !== undefined && o.sill > y0) box(`${id}_sill${k++}`, zone, 'wall', surface, o.a, o.b, y0, o.sill, z0, z1, extra);
    cur = o.b;
  }
  if (xb > cur) box(`${id}_${k++}`, zone, 'wall', surface, cur, xb, y0, y1, z0, z1, extra);
}
/** Wall running along Z (thickness x0..x1) with openings measured in z. */
function wallAlongZ(id, zone, surface, za, zb, x0, x1, y0, y1, openings = [], extra = {}) {
  let cur = za, k = 0;
  for (const o of [...openings].sort((p, q) => p.a - q.a)) {
    if (o.a > cur) box(`${id}_${k++}`, zone, 'wall', surface, x0, x1, y0, y1, cur, o.a, extra);
    if (o.top !== undefined && o.top < y1) box(`${id}_lintel${k++}`, zone, 'wall', surface, x0, x1, o.top, y1, o.a, o.b, extra);
    if (o.sill !== undefined && o.sill > y0) box(`${id}_sill${k++}`, zone, 'wall', surface, x0, x1, y0, o.sill, o.a, o.b, extra);
    cur = o.b;
  }
  if (zb > cur) box(`${id}_${k++}`, zone, 'wall', surface, x0, x1, y0, y1, cur, zb, extra);
}

// ---------------------------------------------------------------- marker helpers
/** Marker. pos = centre of the bottom face for volumes and floor-standing things;
 *  the anchor point for wall-mounted things. size = [x,y,z] before rotY (volumes),
 *  or [width,height,thickness] for doors. */
function mk(id, zone, type, pos, params = {}, rotY = 0, size) {
  const m = { id: uid(id), zone, type, pos: V(...pos), rotY: r2(rotY) };
  if (size) m.size = V(...size);
  m.params = params;
  markers.push(m);
  return m;
}
const FACE = { n: 0, w: 90, s: 180, e: -90 }; // yaw that faces that compass direction
const pickup = (id, zone, kind, pos, params = {}) => mk(id, zone, 'pickup', pos, { pickup: kind, ...params });
const spawn = (id, zone, enemy, pos, rotY, params = {}) => mk(id, zone, 'enemy_spawn', pos, { enemy, ...params }, rotY);
const door = (id, zone, pos, rotY, w, h, params = {}, thick = 1) => mk(id, zone, 'door', pos, params, rotY, [w, h, thick]);
/** Both resident sets hold these (the peg-stair seam): see meta.conventions.seam. */
const SEAM = { seam: true, sets: ['surface', 'underground'] };
const bearingOf = (from, to) => (((Math.atan2(to[0] - from[0], -(to[2] - from[2])) * 180) / Math.PI) + 360) % 360;
const trig = (id, zone, pos, size, params = {}) => mk(id, zone, 'trigger', pos, params, 0, size);
const cp = (id, zone, pos, rotY, params = {}) => mk(id, zone, 'checkpoint', pos, { when: params.when, ...params }, rotY);

// ================================================================ ZONES
const SUN = { azimuthDeg: 315, elevationDeg: 14 };
const SUN_TRAVEL = (() => { // unit vector the light travels along
  const e = rad(SUN.elevationDeg), a = rad(SUN.azimuthDeg);
  const toSun = [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
  return toSun.map((v) => -v);
})();

function zone(id, name, kind, set, min, max, mood, neighbors, extra = {}) {
  // priority: where two zones of the same resident set overlap, the higher priority wins zoneAt (interiors beat exteriors)
  zones.push({ id, name, kind, set, priority: kind === 'interior' ? 10 : 0, bounds: { min: V(...min), max: V(...max) }, mood, neighbors, ...extra });
}
zone('the_lip', 'The Lip', 'exterior', 'surface', [0, -1, -9], [32, 26, 111], 'L1', ['plenty_street'], { moodIntro: 'L0', card: 'card_i' });
zone('plenty_street', 'Plenty: Front Street and the pump yard', 'exterior', 'surface', [-111, -1, -16], [0, 16, 16], 'L1', ['the_lip', 'tally_house'], { card: 'card_ii' });
zone('tally_house', 'The Tally House', 'interior', 'surface', [-97, -5.5, -38], [-81, 6, -14], 'L2', ['plenty_street', 'the_gallery'], { card: 'card_iii', note: 'bounds reach down to y -5.5 so that zoneAt(surface) is tally_house on the seam (peg-stair flight 1 and landing 1) until trg_set_swap' });
zone('the_gallery', 'Peg stair, proving bay and gallery', 'interior', 'underground', [-95, -13, -36], [-18, 0, -9], 'L3', ['tally_house', 'lift_hall'], { card: 'card_iv' });
zone('lift_hall', 'The Lift Hall', 'interior', 'underground', [-19, -16, -29], [28, -2, 8], 'L4', ['the_gallery', 'the_bore'], { card: 'card_v' });
zone('the_bore', 'The Bore: catwalk, antechamber, chamber', 'interior', 'underground', [-3, -45, 64], [31, -29, 117], 'L5', ['lift_hall', 'far_rim'], { card: 'card_vi' });
zone('far_rim', 'The Far Rim', 'exterior', 'coda', [-2, 17, 100], [30, 25, 121], 'L6', ['the_bore'], { card: 'card_vii' });

// ================================================================ 1. THE LIP
{
  const Z = 'the_lip';
  // --- overhang: 12 wide x 9 deep x 3 high, floor y 14
  box('lip_oh_floor', Z, 'floor', 'stone', 8, 20, 13, 14, 101, 110);
  box('lip_oh_ceiling', Z, 'ceiling', 'stone', 7, 21, 17, 18, 101, 111);
  box('lip_oh_wall_back', Z, 'terrain', 'stone', 7, 21, 13, 17, 110, 111);
  box('lip_oh_wall_w', Z, 'terrain', 'stone', 7, 8, 13, 17, 101, 110);
  box('lip_oh_wall_e', Z, 'terrain', 'stone', 20, 21, 13, 17, 101, 110);
  // --- gully segments (walked south to north, falling 14 m)
  // S0 apron (flat), then four wedge ramps, then the forecourt.
  box('lip_s0_floor', Z, 'terrain', 'sand', 7, 21, 13, 14, 93, 101);
  box('lip_s0_wall_w', Z, 'terrain', 'stone', 3, 7, 13, 18, 93, 101);
  box('lip_s0_wall_e_n', Z, 'terrain', 'stone', 21, 25, 13, 18, 93, 94);
  box('lip_s0_wall_e_s', Z, 'terrain', 'stone', 21, 25, 13, 18, 99, 101);
  box('lip_s0_wall_e_back', Z, 'terrain', 'stone', 25, 27, 13, 18, 93, 101);
  box('lip_ledge', Z, 'platform', 'stone', 21, 25, 13, 14.5, 94, 99, { note: 'optional 0.5 m step-up (jump) with pk_rounds_6' });
  const segs = [
    { n: 's1', x0: 7, x1: 21, z0: 78, z1: 93, lo: 11.5, hi: 14, wall: 10 },
    { n: 's2', x0: 10, x1: 28, z0: 54, z1: 78, lo: 7.5, hi: 11.5, wall: 13 },
    { n: 's3', x0: 5, x1: 21, z0: 30, z1: 54, lo: 3, hi: 7.5, wall: 15 },
    { n: 's4', x0: 2, x1: 22, z0: 9, z1: 30, lo: 0, hi: 3, wall: 9 },
  ];
  segs.forEach((s, i) => {
    ramp(`lip_${s.n}_slope`, Z, 'sand', s.x0, s.x1, s.z0, s.z1, s.lo, s.hi, '+z', { role: 'terrain' });
    const top = Math.min(26, s.hi + s.wall);
    box(`lip_${s.n}_wall_w`, Z, 'terrain', 'stone', Math.max(0, s.x0 - 4), s.x0, s.lo - 1, top, s.z0, s.z1);
    box(`lip_${s.n}_wall_e`, Z, 'terrain', 'stone', s.x1, Math.min(32, s.x1 + 4), s.lo - 1, top, s.z0, s.z1);
    // end caps where the next (lower, northern) segment is wider or offset
    const nx = segs[i + 1];
    if (nx) {
      if (nx.x0 < s.x0) box(`lip_${s.n}_lowcap_w`, Z, 'terrain', 'stone', Math.max(0, nx.x0 - 4), s.x0, s.lo - 1, top, s.z0, s.z0 + 3);
      if (nx.x1 > s.x1) box(`lip_${s.n}_lowcap_e`, Z, 'terrain', 'stone', s.x1, Math.min(32, nx.x1 + 4), s.lo - 1, top, s.z0, s.z0 + 3);
      if (nx.x0 > s.x0) box(`lip_${nx.n}_highcap_w`, Z, 'terrain', 'stone', Math.max(0, s.x0 - 4), nx.x0, nx.lo - 1, top, nx.z1 - 3, nx.z1);
      if (nx.x1 < s.x1) box(`lip_${nx.n}_highcap_e`, Z, 'terrain', 'stone', nx.x1, Math.min(32, s.x1 + 4), nx.lo - 1, top, nx.z1 - 3, nx.z1);
    }
  });
  // boulders: break the straight sightline down the gully, give the eye stepping stones
  const slopeY = (z) => { for (const s of segs) if (z >= s.z0 && z <= s.z1) return s.lo + ((z - s.z0) / (s.z1 - s.z0)) * (s.hi - s.lo); return z > 93 ? 14 : 0; };
  [[11, 84, 3, 2.4, 2.6, 15], [22.5, 66, 4, 3, 3.4, -20], [8.5, 45, 3.2, 2.6, 3, 30], [17.5, 22, 2.6, 2.2, 2.4, 10]].forEach(([x, z, sx, h, sz, rot], i) =>
    obox(`lip_boulder_${i + 1}`, Z, 'cover', 'stone', x, slopeY(z) - 1, z, sx, h + 1, sz, rot));
  // rock spurs: the gully snakes instead of running as a straight chute; each hides the next reach
  [[20.5, 86, 5, 4, 40], [9.5, 71, 6, 4, -35], [27.5, 60, 6, 4, 35], [20.5, 47, 6, 4, 40], [5.5, 37, 5, 4, -40], [21.5, 19, 6, 4, 35]].forEach(([x, z, sx, sz, rot], i) =>
    obox(`lip_spur_${i + 1}`, Z, 'terrain', 'stone', x, slopeY(z) - 2, z, sx, 9, sz, rot, { note: 'rock spur' }));
  // --- forecourt (flat) and the jug gate wall
  box('lip_fc_floor', Z, 'terrain', 'sand', 0, 22, -1, 0, -7, 9);
  wallAlongZ('lip_gate_wall', Z, 'adobe', -9, 9, 0, 2, 0, 5, [{ a: -2, b: 2, top: 2.8 }]);
  box('lip_fc_wall_n', Z, 'wall', 'adobe', 0, 26, 0, 3, -9, -7, { note: 'low town wall: the pylon line and the Rule are seen over it' });
  box('lip_fc_wall_e', Z, 'terrain', 'stone', 22, 26, -1, 9, -7, 9);
  box('lip_pylon', Z, 'blocker', 'metal', 3, 5, 0, 16, 5.5, 7.5, { landmark: 'dead_pylon', note: 'lattice pylon footprint; stub arm reaches north-west over the gate' });

  // --- markers
  mk('player_start', Z, 'player_start', [16, 14, 107.5], { note: 'inside the black overhang, looking north down the gully (the doorway shot)' }, FACE.n);
  cp('cp_lip_start', Z, [16, 14, 107.5], FACE.n, { when: 'start' });
  trig('trg_open', Z, [14, 14, 101], [12, 3, 9], { lines: ['nar_open_1', 'nar_open_2'], objective: 'obj_lip_camp', once: true, note: 'whole overhang; fires on first control (obj_lip_camp is the start objective)' });
  mk('prop_camp_one', Z, 'prop', [11.5, 14, 104.5], { prop: 'cold_camp', camp: 1, stop: 1, fire: false, contents: ['a swept patch of floor (no ash, no fire)', 'flat stone', 'coffee pot, the coffee gone to tar', 'spent case'], note: 'stop one: GDD 9.2 revision 2. No ash here; the only fire he leaves is stop three' });
  mk('rd_note_lip', Z, 'readable', [11.373, 14.085, 104.546], { readable: 'rd_note_lip', under: 'a spent case on the flat stone' });
  pickup('pk_rounds_12_camp1', Z, 'pk_rounds_12', [10.8, 14, 105.4], { line: 'nar_tin', dowsers: true });
  trig('trg_glare', Z, [14, 14, 97], [14, 3, 4], { lines: ['nar_seven', 'nar_rule'], cards: ['card_title', 'card_i'], exposureRamp: { from: 'L0', to: 'L1', seconds: 20 }, once: true });
  mk('vista_rule', Z, 'vista', [14, 14, 100], { subject: 'the Rule and the pylon line', bearingDeg: 0, target: V(14, 60, -900), note: 'due north over the low forecourt wall; nothing taller than 3 m may stand north of z = -7 between x 0 and 26' }, FACE.n);
  pickup('pk_rounds_6_ledge', Z, 'pk_rounds_6', [23, 14.5, 96.5]);
  mk('prop_pylon', Z, 'prop', [4, 0, 6.5], { prop: 'dead_pylon', landmark: true, height: 16, stubArmTo: V(2.8, 7.6, 4.4), sweepTo: V(1, 4.2, 0) });
  // seven_jugs
  for (let i = 1; i <= 6; i++) mk(`ia_jug_${i}`, Z, 'puzzle_element', [2.25, 1.55, -1.75 + (i - 1) * 0.7], { puzzle: 'seven_jugs', role: 'jug', index: i, scaleDegree: i, interactable: `ia_jug_${i}`, hitRadius: 0.22, follows: 'the gate bar: the hit sphere rides the jug hook as the bar rises 0.2 m per jug (GDD 13.1); this pos is the rest position' });
  mk('ia_jug_7', Z, 'puzzle_element', [2.8, 7.0, 4.4], { puzzle: 'seven_jugs', role: 'seventh_jug', index: 7, scaleDegree: 7, interactable: 'ia_jug_7', hitRadius: 0.24, leaksSand: true, note: 'on the pylon stub arm, above and left of the gate as approached' });
  door('door_jug_gate', Z, [1, 0, 0], 90, 4, 2.8, { gate: 'G1', puzzle: 'seven_jugs', opens: 'gate_height = 0.2 * min(jugs,6), 2.6 at 7', staysOpen: true, connects: ['the_lip', 'plenty_street'] });
  trig('trg_pz_jugs', Z, [12, 0, 1], [20, 4, 16], { puzzle: 'seven_jugs', role: 'volume', objective: 'obj_lip_gate', lines: { firstJug: 'nar_jugs_sand', gateOpen: 'nar_jugs_open' }, hints: { T2: 'hint_jugs_2', T3: 'hint_jugs_3', T4: 'hint_jugs_4' }, standSpot: V(11, 0, 0) });
  mk('ia_ammo_box_lip', Z, 'interactable', [8, 0, -6.9], { interactable: 'ia_ammo_box', mount: 'wall' }, FACE.s);
  cp('cp_lip_gate', Z, [5, 0, 0], FACE.w, { when: 'jug gate open', objective: 'obj_street' });
  mk('light_lip_gate_glint', Z, 'light', [2.8, 7.0, 4.4], { kind: 'breadcrumb', note: 'the leaking sand thread catches the sun: the only moving thing in frame' });
}

// ================================================================ 2. PLENTY: STREET + YARD
const STREET = { x0: -73, x1: 0, zHalf: 7, facadeDepth: 5, alleyOuter: 15 };
{
  const Z = 'plenty_street';
  box('st_floor', Z, 'terrain', 'sand', -73, 0, -1, 0, -16, 16);
  box('st_court_floor', Z, 'terrain', 'sand', -80, -73, -1, 0, -16, 16);
  box('st_yard_floor', Z, 'terrain', 'sand', -111, -80, -1, 0, -15, 15);
  box('st_wall_n', Z, 'wall', 'adobe', -80, 0, 0, 4, -16, -15);
  box('st_wall_s', Z, 'wall', 'adobe', -74, 0, 0, 4, 15, 16);
  // polish round 2 (blocker): the north alley (z -15..-12, between st_wall_n and the assay office) was open at its east
  // end: she walked through the drawn wall there (env_plenty_street has one, its face at x 0.03) and off the floor at
  // (0.1, 0, -14.66), and fell for ever. The south alley is closed by lip_s4_wall_w; this is the missing northern
  // collider. A 0.1 m slab against the drawn face, because a zone's solids stay inside its bounds (x <= 0).
  box('st_alley_cap_n', Z, 'wall', 'adobe', -0.1, 0, 0, 4, -15, -12, { note: 'the collider of the wall drawn at the east end of the north alley (x 0.03 in env_plenty_street)' });
  // facades: nine. [id, x0, x1, height, name]
  const north = [['n1', -13, 0, 5.5, 'assay office'], ['n3', -44, -30, 6.5, 'boarding house'], ['n4', -60, -47, 5, 'dry goods'], ['n5', -73, -63, 5.5, 'chandler']];
  const south = [['s1', -20, 0, 6, 'livery'], ['s2', -38, -23, 5, 'smithy'], ['s3', -56, -41, 6.5, 'meeting rooms']];
  for (const [n, a, b, h, name] of north) box(`st_facade_${n}`, Z, 'wall', 'adobe', a, b, 0, h, -12, -7, { facade: name, leanDeg: 3 });
  for (const [n, a, b, h, name] of south) box(`st_facade_${n}`, Z, 'wall', 'adobe', a, b, 0, h, 7, 12, { facade: name, leanDeg: 3 });
  // n2 feed store with the loft (secret sec_loft_bell)
  box('st_facade_n2_base', Z, 'platform', 'adobe', -30, -16, 0, 3, -12, -7, { facade: 'feed store', leanDeg: 2, note: 'its top is the loft floor (y 3)' });
  box('st_loft_wall_back', Z, 'wall', 'wood', -30, -16, 3, 6, -12, -11.5);
  box('st_loft_wall_w', Z, 'wall', 'wood', -30, -29.5, 3, 6, -11.5, -7.5);
  box('st_loft_wall_e', Z, 'wall', 'wood', -16.5, -16, 3, 6, -11.5, -7.5);
  wallAlongX('st_loft_wall_front', Z, 'wood', -30, -16, -7.5, -7, 3, 6, [{ a: -24, b: -22.4, top: 5.3 }]);
  box('st_loft_roof', Z, 'ceiling', 'wood', -30, -16, 6, 6.3, -12, -7);
  box('st_loft_porch', Z, 'platform', 'wood', -24.2, -22.2, 0, 3, -7, -5.6, { note: 'porch block under the loft door; landing for the fallen ladder' });
  ramp('st_loft_ladder', Z, 'wood', -28.2, -24.2, -7, -5.6, 0, 3, '+x', { dynamic: true, enabledBy: 'sec_loft_bell_rope', note: 'the fallen loft ladder, collides as a 37 degree ramp once the bell rope is shot' });
  // s4 saddlery with the wave-C doorway
  box('st_facade_s4_w', Z, 'wall', 'adobe', -73, -67.2, 0, 5.5, 7, 12, { facade: 'saddlery', leanDeg: 4 });
  box('st_facade_s4_e', Z, 'wall', 'adobe', -65.2, -59, 0, 5.5, 7, 12, { facade: 'saddlery' });
  box('st_facade_s4_back', Z, 'wall', 'adobe', -67.2, -65.2, 0, 5.5, 11.5, 12);
  box('st_facade_s4_lintel', Z, 'wall', 'adobe', -67.2, -65.2, 2.6, 5.5, 7, 11.5);
  // west end: yard gate wall, gate court, gatehouse blocks, yard east wall
  wallAlongZ('st_wall_w', Z, 'adobe', -12, 15, -74, -73, 0, 4, [{ a: -2, b: 2, top: 3 }]);
  box('st_gatehouse_n', Z, 'wall', 'adobe', -80, -74, 0, 4.5, -12, -5);
  box('st_gatehouse_s', Z, 'wall', 'adobe', -80, -74, 0, 4.5, 5, 16);
  wallAlongZ('yd_wall_e', Z, 'adobe', -16, 15, -80, -79, 0, 3.4, [{ a: -13.8, b: -12.2, top: 2.4 }, { a: -1.3, b: 1.3, top: 2.8 }]);
  box('yd_wall_n_w', Z, 'wall', 'adobe', -111, -97, 0, 3, -15, -14);
  box('yd_wall_n_e', Z, 'wall', 'adobe', -81, -80, 0, 3, -15, -14);
  box('yd_wall_s', Z, 'wall', 'adobe', -111, -80, 0, 3, 14, 15);
  box('yd_wall_w', Z, 'wall', 'adobe', -111, -110, 0, 3, -14, 14);

  // --- street cover, alternating sides, centre lane (|z| < 1.5) kept clear for wave C
  obox('st_cover_wagon', Z, 'cover', 'wood', -10 + 1.2 * Math.cos(rad(20)), 0, 3.6 - 1.2 * Math.sin(rad(20)), 1.5, 2.1, 1.6, 20, { prop: 'tipped_wagon_bed', propPivot: V(-10, 0, 3.6), note: 'integration: the wheel end of prop_wagon_tipped (full-height cover); the bed is st_wagon_bed' });
  obox('st_wagon_bed', Z, 'cover', 'wood', -10 - 0.65 * Math.cos(rad(20)), 0, 3.6 + 0.65 * Math.sin(rad(20)), 2.2, 1.6, 1.6, 20, { prop: 'tipped_wagon_bed' });
  obox('st_cover_stub_a', Z, 'cover', 'adobe', -19, 0, -3.8, 0.7, 2.3, 2.6, 0, { prop: 'adobe_wall_stub' });
  obox('st_cover_rib', Z, 'cover', 'ceramic', -28, 0, 4.4, 1.6, 2.2, 4.5, -20, { prop: 'ceramic_rib', landmark: true, note: 'a rib of the old works surfacing like a whale back' });
  obox('st_cover_stub_b', Z, 'cover', 'adobe', -37, 0, -3.8, 0.7, 2.4, 2.6, 0, { prop: 'adobe_wall_stub' });
  obox('st_cover_pump_post', Z, 'cover', 'wood', -46.6, 0, -3.3, 1.3, 2.6, 1.3, 0, { prop: 'pump_post' });
  obox('st_trough', Z, 'cover', 'wood', -44.5, 0, -3.1, 2.6, 0.6, 0.9, 0, { prop: 'dry_trough', low: true });

  // --- yard: drum, tank, stubs, cart, shed
  cyl('yd_drum', Z, 'cover', 'ceramic', -101, 0, -3, 4, 6, { prop: 'wind_pump_drum', landmark: true });
  cyl('yd_pump_tower', Z, 'blocker', 'wood', -101, 6, -3, 2, 8, { note: 'the timber tower on the drum, 6..14 m: blocks sightlines (the Dowser line passes north of it)' });
  obox('yd_cover_cart', Z, 'cover', 'wood', -86 - 0.45 * Math.cos(rad(15)), 0, -3.5 + 0.45 * Math.sin(rad(15)), 2.2, 2.0, 1.62, 15, { prop: 'water_cart', propPivot: V(-86, 0, -3.5) });
  obox('yd_cart_shafts', Z, 'cover', 'wood', -86 + 1.16 * Math.cos(rad(15)), 0, -3.5 - 1.16 * Math.sin(rad(15)), 1.14, 0.45, 0.9, 15, { prop: 'water_cart', low: true });
  obox('yd_cover_stub_1', Z, 'cover', 'adobe', -92, 0, -9, 3, 2.3, 0.7, 0, { prop: 'adobe_wall_stub' });
  obox('yd_cover_stub_2', Z, 'cover', 'adobe', -97, 0, 6.2, 0.7, 2.3, 3, 0, { prop: 'adobe_wall_stub' });
  obox('yd_cover_stub_3', Z, 'cover', 'adobe', -105, 0, 6, 3, 2.3, 0.7, 0, { prop: 'adobe_wall_stub' });
  box('yd_tank_deck', Z, 'platform', 'wood', -88, -83, 3.2, 3.5, 5, 10, { note: 'tank catwalk, 3.5 m: the problem position' });
  cyl('yd_tank', Z, 'blocker', 'metal', -85.5, 3.5, 7.5, 1.5, 2.6, { prop: 'water_tank' });
  [[-87.8, 5.2], [-83.2, 5.2], [-87.8, 9.8], [-83.2, 9.8]].forEach(([x, z], i) => obox(`yd_tank_stilt_${i + 1}`, Z, 'blocker', 'wood', x, 0, z, 0.4, 3.2, 0.4, 0));
  box('yd_tank_boards', Z, 'cover', 'wood', -88, -83, 0, 3.2, 4.8, 5.0, { note: 'stilts boarded on the north side: full-height cover facing the yard' });
  ramp('yd_tank_ramp', Z, 'wood', -95, -88, 8.2, 9.8, 0, 3.5, '+x', { note: 'optional ramp to the tank catwalk' });
  box('yd_shed', Z, 'wall', 'adobe', -110, -106, 0, 3, 10, 14, { prop: 'tank_shed', note: 'T3 emerges from its east door' });

  // --- markers: street
  trig('trg_enc_street', Z, [-3, 0, 0], [3, 3, 6], { encounter: 'enc_street', cards: ['card_ii'], lines: ['nar_kneeler', 'nar_plenty'], note: 'passing the jug gate posts. Polish round 5: the kneeler line first (behind nar_plenty it was said after the kneeler was down). Wave A stays at 3 s: a trial of 6 s, so the line would begin while it kneels, took the cost out of the fight (scratch/r5-fixer/proxy/a_street_*: plain 0 / 0 / 0, careless 0 / 0 / 54)' });
  mk('vista_kneeler', Z, 'vista', [-2, 0, 0], { subject: 'the kneeler at the dry trough, 43 m down the street centre', target: V(-44.5, 0.8, -1.9) }, FACE.w);
  trig('lane_street', Z, [-37, 0, 0], [58, 3, 3], { kind: 'lane', note: 'Biders follow in file here (wave C)' });
  spawn('sp_street_kneeler', Z, 'bider', [-44.5, 0, -1.9], FACE.n, { dormant: 'scoop_kneel', rise: 'kneel_to_stand', wave: 'A', prop: 'cup', vignette: { id: 'vig_kneeler' } });
  // polish round 4 (R3): wave B comes out of the two alley mouths NEAREST the gate (north x -14.5, south x -21.5), beside
  // and behind where she stands when the kneeler falls, not from beside the kneeler 30 m up the street: four Biders
  // down a long sight line one by one cost every proxy nothing. Each stands in its alley out of sight of the mouth.
  spawn('sp_street_alley_n', Z, 'bider', [-17.5, 0, -13.5], FACE.e, { entrance: 'doorway', wave: 'B' });
  spawn('sp_street_alley_s', Z, 'bider', [-24.5, 0, 13.5], FACE.e, { entrance: 'doorway', wave: 'B' });
  // polish round 3 (R3): two per alley, so four come at her from two sides at once (seven spread along the street cost a plain player nothing)
  spawn('sp_street_alley_n2', Z, 'bider', [-19.2, 0, -13.5], FACE.e, { entrance: 'doorway', wave: 'B' });
  spawn('sp_street_alley_s2', Z, 'bider', [-26.2, 0, 13.5], FACE.e, { entrance: 'doorway', wave: 'B' });
  for (let i = 0; i < 2; i++) spawn(`sp_street_saddlery_${i + 1}`, Z, 'bider', [-66.2, 0, 8.0 + i * 1.5], FACE.n, { entrance: 'doorway', wave: 'C', file: true, order: i + 1 });
  spawn('sp_street_gate', Z, 'bider', [-77, 0, 0], FACE.e, { entrance: 'doorway', wave: 'D', burstsDoor: 'door_yard_gate', note: 'the eighth' });
  pickup('pk_rounds_6_wagon', Z, 'pk_rounds_6', [-10.6, 0, 5.2]);
  pickup('pk_rounds_6_alley', Z, 'pk_rounds_6', [-30, 0, 13.5]);
  pickup('pk_canteen_trough', Z, 'pk_canteen', [-42.6, 0, -3.1]);
  trig('trg_marks', Z, [-64, 0, 0], [14, 3, 14], { lines: ['nar_marks'], requires: 'enc_street clear', once: true });
  const doorMarks = [[-6.5, -7, 's'], [-37, -7, 's'], [-53.5, -7, 's'], [-68, -7, 's'], [-10, 7, 'n'], [-30.5, 7, 'n'], [-48.5, 7, 'n'], [-62, 7, 'n'], [-20, -7, 's']];
  doorMarks.forEach(([x, z, f], i) => mk(`prop_door_mark_${i + 1}`, Z, 'prop', [x, 1.5, z], { prop: 'struck_door_mark', variant: i === 8 ? 'mark_brush_c' : i % 2 ? 'mark_brush_b' : 'mark_brush_a' }, FACE[f]));
  door('door_yard_gate', Z, [-73.5, 0, 0], 90, 4, 3, { cue: 'gate_bang', opens: 'burst outward by wave D of enc_street', staysOpen: true });
  pickup('pk_rounds_12_yard_gate', Z, 'pk_rounds_12', [-84.6, 0, -1.9], { note: 'polish round 3: inside the yard by the water cart, on the fight\'s side of the door (it stood outside the gate, and a plain player ran dry in the yard)' });
  cp('cp_street_clear', Z, [-70, 0, 0], FACE.w, { when: 'enc_street clear' });
  door('ia_yard_door', Z, [-79.5, 0, 0], 90, 2.6, 2.8, { gate: 'G2', interactable: 'ia_yard_door', opensOn: 'knot_yard_latch', staysOpen: true });
  mk('knot_yard_latch', Z, 'interactable', [-78.92, 1.3, 0.95], { interactable: 'knot_yard_latch', kind: 'knot', hitRadius: 0.16, opens: 'ia_yard_door', startsEncounter: 'enc_yard', lines: ['nar_first_knot'], objective: 'obj_yard', hint: { T2: 'hint_yard_knot', atSeconds: 60 } }, FACE.e);
  // secret 1
  mk('sec_loft_bell_rope', Z, 'interactable', [-23.2, 5.05, -8.0], { interactable: 'sec_loft_bell_rope', secret: 'sec_loft_bell', kind: 'shootable', drops: 'st_loft_ladder', hitRadius: 0.12, note: 'insulator bell seen through the open loft door from the street' });
  mk('sec_loft_bell', Z, 'prop', [-23.2, 4.6, -8.0], { prop: 'insulator_bell', secret: 'sec_loft_bell' });
  pickup('pk_rounds_12_loft', Z, 'pk_rounds_12', [-20, 3, -9.8], { secret: 'sec_loft_bell' });
  mk('rd_rain_tally', Z, 'readable', [-27, 3.9, -11.4], { readable: 'rd_rain_tally', secret: 'sec_loft_bell', mount: 'wall' }, FACE.s);
  // --- markers: yard
  mk('prop_wind_pump', Z, 'prop', [-101, 0, -3], { prop: 'wind_pump_tower', landmark: true, towerHeight: 14, drumDiameter: 8, missingVane: true });
  mk('ia_yard_bell', Z, 'interactable', [-94, 2.2, 2.5], { interactable: 'ia_yard_bell', kind: 'shootable', note: 'an insulator on a post at the yard centre; T1 stakes it in the vignette' });
  spawn('sp_yard_t1', Z, 'transit', [-96.2, 0, -2.4], FACE.e, { entrance: 'emerge', door: 'drum door', wave: 'A', vignette: { id: 'vig_yard_bell', stakes: 'ia_yard_bell', seconds: 4, line: 'stn_yard_wake', thenLine: 'nar_transit', shootable: true } });
  spawn('sp_yard_t2', Z, 'transit', [-96.2, 0, -3.6], FACE.e, { entrance: 'emerge', door: 'drum door', wave: 'B', firingPoint: 'fp_yard_catwalk' });
  spawn('sp_yard_t3', Z, 'transit', [-105.2, 0, 12], FACE.e, { entrance: 'emerge', door: 'tank shed', wave: 'B', firingPoint: 'fp_yard_far_wall' });
  spawn('sp_yard_grate_1', Z, 'bider', [-102, 0, 2.2], FACE.s, { entrance: 'climb_out', wave: 'B+6s' });
  spawn('sp_yard_grate_2', Z, 'bider', [-100, 0, 2.2], FACE.s, { entrance: 'climb_out', wave: 'B+6s' });
  spawn('sp_yard_alley_1', Z, 'bider', [-76.5, 0, -13.5], FACE.w, { entrance: 'doorway', wave: 'B+16s', door: 'door_alley' });
  spawn('sp_yard_alley_2', Z, 'bider', [-75, 0, -13.5], FACE.w, { entrance: 'doorway', wave: 'B+16s', door: 'door_alley' });
  door('door_alley', Z, [-79.5, 0, -13], 90, 1.6, 2.4, { opens: 'with the last wave of enc_yard', staysOpen: true, note: 'street-side alley door; afterwards a loop back to the north alley' });
  pickup('pk_canteen_cart', Z, 'pk_canteen', [-86.6, 0, -1.9]);
  // --- the sighting (GDD 9.3). The Dowser stands due WEST: 45 degrees of azimuth clear of the sun (315), on the
  // shadowed east face of the far mesa, 2 degrees under the sun's elevation. The beat can only start inside
  // trg_dowser, a volume in front of the tally door from which the line is verified clear (validator: 'sightlines').
  const DOWSER = { from: V(-88, 0, -10.5), bearingDeg: 270, elevationDeg: 12, distance: 250 };
  DOWSER.target = (() => { const h = DOWSER.distance * Math.cos(rad(DOWSER.elevationDeg)), a = rad(DOWSER.bearingDeg); return V(DOWSER.from[0] + h * Math.sin(a), 1.65 + DOWSER.distance * Math.sin(rad(DOWSER.elevationDeg)), DOWSER.from[2] - h * Math.cos(a)); })();
  cp('cp_yard_clear', Z, DOWSER.from, FACE.w, { when: 'enc_yard clear', note: 'a restart faces west, at the Dowser' });
  trig('trg_dowser', Z, [-88.5, 0, -10.7], [13, 4, 5.8], { requires: 'enc_yard clear', vista: 'vista_dowser', vignette: { id: 'vig_dowser' },
    startsWhen: 'the player is inside this volume AND the card is within the view cone (GDD 9.3); until then nothing is narrated',
    clockSeconds: 12, goesWhen: 'looked away for 2 s after she has looked AT him (inside 15 degrees) for 1 s; the 12 s clock no longer takes him off the mesa (lead ruling R4)',
    lines: { seen: 'nar_dowser_seen', shot: 'nar_dowser_shot', gone: 'nar_dowser_gone' },
    holdsDoor: 'door_tally', doorOpensWhen: 'nar_dowser_gone has played (card on screen at least 1 s), or 12 s after this volume is first entered, whichever is first; the 12 s clock waits for the end of nar_dowser_seen while that line is on screen (polish round 4)',
    drawsEye: 'a sun-glint off the rod every 1.5 s (star4 sprite) from the moment enc_yard is clear; the tally door stays shut and dark, so the glint is the only new thing in the yard',
    once: true, note: 'x -95..-82, z -13.6..-7.8: every approach to door_tally crosses it' });
  mk('vista_dowser', Z, 'vista', DOWSER.from, { subject: 'the Dowser on the far mesa, a dark figure on the skyline against clear sky (lead ruling R4)', target: DOWSER.target, bearingDeg: DOWSER.bearingDeg, elevationDeg: DOWSER.elevationDeg, distance: DOWSER.distance, sunSeparationDeg: 45, visibleSeconds: 12, minPixels: [9, 28], card: 'billboard on env_backdrop_day at this bearing', from: 'trg_dowser', note: 'due west over the 3 m yard wall, passing 0.6 m north of the pump drum; never behind the tally house' }, FACE.w);
  door('door_tally', Z, [-89, 0, -14.5], 0, 1.6, 2.4, { opens: 'the sighting is over (trg_dowser.doorOpensWhen)', heldBy: 'trg_dowser', connects: ['plenty_street', 'tally_house'] });
  mk('light_yard_tally_door', Z, 'light', [-89, 2.6, -13.8], { kind: 'breadcrumb', litWhen: 'door_tally opens; or 20 s after enc_yard clear if trg_dowser has not been entered (the door itself still waits for the trigger rule)', note: 'the tally door stands a hand open on black: the only dark doorway in a sunlit wall' });
}

// ================================================================ 3. TALLY HOUSE
// Interior x -96..-82 (14 m), z -37..-15 (22 m), 5 m to a flat viga roof.
const TALLY = { x0: -96, x1: -82, z0: -37, z1: -15, h: 5 };
const HATCH = { x0: -93, x1: -89, z0: -34, z1: -32 };
// The hatch latch sits in a cowl on the floor just north of the hatch, open to the NORTH only: the knot can be hit
// only from the strip between the hatch and the north wall, 13.5 m or more from both riser chairs (GDD 10, test 4).
const KNOT = { x: -92.6, y: 0.9, z: -34.35 };
{
  const Z = 'tally_house';
  const T = TALLY;
  // floor (0.3 m slab so the peg stair has headroom under it), leaving the hatch hole
  box('ty_floor_n', Z, 'floor', 'wood', T.x0, T.x1, -0.3, 0, T.z0, HATCH.z0);
  box('ty_floor_hw', Z, 'floor', 'wood', T.x0, HATCH.x0, -0.3, 0, HATCH.z0, HATCH.z1);
  box('ty_floor_he', Z, 'floor', 'wood', HATCH.x1, T.x1, -0.3, 0, HATCH.z0, HATCH.z1);
  box('ty_floor_s', Z, 'floor', 'wood', T.x0, T.x1, -0.3, 0, HATCH.z1, T.z1);
  box('ty_ceiling', Z, 'ceiling', 'wood', T.x0 - 1, T.x1 + 1, T.h, T.h + 0.4, T.z0 - 1, T.z1 + 1);
  box('ty_wall_w', Z, 'wall', 'adobe', T.x0 - 1, T.x0, 0, T.h, T.z0 - 1, T.z1 + 1, { note: 'three shutter windows are cut by the art pass at the shutter_* markers; collision stays solid' });
  box('ty_wall_e', Z, 'wall', 'adobe', T.x1, T.x1 + 1, 0, T.h, T.z0 - 1, T.z1 + 1, { note: 'front doors (barred with benches) are dressing on this wall' });
  box('ty_wall_n', Z, 'wall', 'adobe', T.x0, T.x1, 0, T.h, T.z0 - 1, T.z0);
  wallAlongX('ty_wall_s', Z, 'adobe', T.x0, T.x1, T.z1, T.z1 + 1, 0, T.h, [{ a: -89.8, b: -88.2, top: 2.4 }]);
  // the long table and the seated rows (risers' two chairs are left clear)
  box('ty_table', Z, 'cover', 'wood', -89.7, -88.3, 0, 0.8, -29.6, -18.6, { prop: 'tally_table', low: true });
  box('ty_seats_w', Z, 'blocker', 'wood', -90.6, -89.7, 0, 1.3, -29.2, -20.8, { note: 'five seated figures and chairs, west side' });
  box('ty_seats_e', Z, 'blocker', 'wood', -88.3, -87.4, 0, 1.3, -28.3, -21.7, { note: 'four seated figures and chairs, east side' });
  obox('ty_table_end', Z, 'cover', 'wood', -84.6, 0, -35.6, 2.6, 0.8, 1.4, 8, { prop: 'tally_table_end', low: true, note: 'the table end dragged aside to bare the hatch' });
  // latch cowl (see KNOT): back wall on the hatch edge, two cheeks, a hood, the latch block under the knot
  box('ty_latch_cowl_back', Z, 'blocker', 'ceramic', KNOT.x - 0.7, KNOT.x + 0.7, 0, 1.5, -34.15, -34.0, { dress: 'hatch latch cowl', note: 'blocks every line to the knot from the south, the lanes and the closed hatch' });
  box('ty_latch_cowl_w', Z, 'blocker', 'ceramic', KNOT.x - 0.7, KNOT.x - 0.55, 0, 1.5, -34.5, -34.15, { dress: 'hatch latch cowl' });
  box('ty_latch_cowl_e', Z, 'blocker', 'ceramic', KNOT.x + 0.55, KNOT.x + 0.7, 0, 1.5, -34.5, -34.15, { dress: 'hatch latch cowl' });
  box('ty_latch_cowl_hood', Z, 'blocker', 'ceramic', KNOT.x - 0.55, KNOT.x + 0.55, 1.4, 1.5, -34.5, -34.15, { dress: 'hatch latch cowl' });
  box('ty_latch_block', Z, 'blocker', 'ceramic', KNOT.x - 0.3, KNOT.x + 0.3, 0, 0.7, -34.5, -34.15, { dress: 'hatch latch block' });
  // hearth (east wall, south end) and the chair that is not one of theirs
  box('ty_hearth', Z, 'wall', 'adobe', -83.2, -82, 0, 2.6, -20, -16.6, { prop: 'hearth' });
  box('ty_hearthstone', Z, 'platform', 'stone', -84.6, -83.2, 0, 0.3, -20, -16.6, { prop: 'hearthstone' });
  obox('ty_head_chair', Z, 'cover', 'wood', -85.5, 0, -20, 0.7, 1.3, 0.7, 45, { prop: 'head_chair', low: true, note: 'pulled out to face the seated' });

  // --- daylight: windows are back-projected along the true sun vector from each landing.
  const [tx, ty, tz] = SUN_TRAVEL;
  const dropPerX = -ty / tx, zPerX = tz / tx; // per metre of eastward travel
  const WIN = { yc: 4.5, w: 1.2, h: 0.9, latchY: 3.5 };
  const at = (zw, d) => V(T.x0 + d, WIN.yc - dropPerX * d, zw + zPerX * d);
  const shutters = {
    s: { zw: -24, lands: 'tally wall (south wall, east of the door)', line: ['nar_tally_wall'], hits: [{ what: 'tally_wall', d: (T.z1 - -24) / zPerX }] },
    m: { zw: -30.5, lands: 'the head chair, then the hearthstone and firebox', line: ['nar_tally_chair', 'nar_tally_chair_2', 'nar_ask', 'nar_tally_hearth'], hits: [{ what: 'head_chair', d: 10.5 }, { what: 'hearthstone', d: (WIN.yc - 0.3) / dropPerX }] },
    n: { zw: -36.3, lands: 'the share cloth; once the cloth is down, the day-cell hung above the hatch', line: ['nar_tally_cloth'], hits: [{ what: 'share_cloth', d: 1.8 }, { what: 'day_cell', d: 3.5 }] },
  };
  const land = {};
  for (const [k, s] of Object.entries(shutters)) {
    s.hits.forEach((h) => { land[h.what] = at(s.zw, h.d); });
    mk(`shutter_${k}`, Z, 'puzzle_element', [T.x0, WIN.yc, s.zw], { puzzle: 'daylight', role: 'shutter', latch: `ia_latch_${k}`, lands: s.lands, lines: s.line, lineStartsWhen: 'the landing patch is within 30 degrees of the crosshair, or 4 s after the drop (GDD 13.2)', window: { width: WIN.w, height: WIN.h, yMin: r2(WIN.yc - WIN.h / 2), yMax: r2(WIN.yc + WIN.h / 2) }, blade: { travel: SUN_TRAVEL.map(r2), hits: s.hits.map((h) => ({ what: h.what, pos: at(s.zw, h.d), travelX: r2(h.d) })) } }, FACE.e, [WIN.w, WIN.h, 0.2]);
    mk(`ia_latch_${k}`, Z, 'puzzle_element', [T.x0 + 0.06, WIN.latchY, s.zw], { puzzle: 'daylight', role: 'latch', interactable: `ia_latch_${k}`, opens: `shutter_${k}`, hitRadius: 0.14, note: 'white ceramic insulator; a rod runs up to the shutter' }, FACE.e);
  }
  mk('ia_cloth_cord', Z, 'puzzle_element', [land.share_cloth[0], 4.72, land.share_cloth[2]], { puzzle: 'daylight', role: 'cord', interactable: 'ia_cloth_cord', drops: 'prop_share_cloth', hitRadius: 0.12 });
  mk('prop_share_cloth', Z, 'prop', land.share_cloth, { prop: 'share_cloth', size: [1.6, 1.5], hungFrom: 'rafter, one cord', note: 'centre of the cloth; plane faces the north shutter (perpendicular to the blade)' }, 45);
  mk('day_cell', Z, 'puzzle_element', land.day_cell, { puzzle: 'daylight', role: 'day_cell', diameter: 0.6, hungFrom: 'tie-beam above the hatch', facesShutter: 'shutter_n', lines: ['stn_tally_wake_1', 'stn_tally_wake_2'], raises: 'hatch_powered', objective: 'obj_tally_hatch', stripsTo: 'knot_hatch_latch', pictogramPlate: 'prop_daycell_plate' }, 45);
  mk('prop_daycell_plate', Z, 'prop', [T.x0 + 0.05, 1.5, -32.8], { zoneGeometry: 'env_tally_house', pictogram: 'picto_daycell', mount: 'wall', note: 'sun, arrow, disc, open hatch: where the day-cell cable comes down the west wall, at eye height' }, FACE.e);
  mk('prop_tally_wall', Z, 'prop', [land.tally_wall[0], land.tally_wall[1], T.z1 - 0.02], { prop: 'tally_wall', extent: { x: [-88.0, -82.0], y: [0.4, 3.2] }, wrapsOnto: 'east wall, z -16.6..-15', sunPatch: { centre: land.tally_wall, size: [WIN.w, WIN.h] }, note: 'the last four days of chalk are written where the blade lands' }, FACE.n);
  mk('prop_head_chair', Z, 'prop', [-85.5, 0, -20], { prop: 'head_chair', sunAt: land.head_chair }, 45);
  mk('prop_camp_two', Z, 'prop', [-83.9, 0.3, -18.4], { prop: 'cold_camp', camp: 2, stop: 2, fire: false, contents: ['the firebox holds the town\'s own ash, four days cold (dressing; nobody narrates it)', 'his cup on the hearthstone: see prop_cup_two'], sunAt: land.hearthstone, note: 'stop two is a chair and a cup, not a fire (GDD 9.4 revision 2)' });
  mk('prop_cup_two', Z, 'prop', [-83.8, 0.3, -18.2], { prop: 'cup', stop: 2, line: 'nar_tally_hearth is spoken by shutter_m; this is its subject', note: 'his cup, the dregs dried to a ring' });
  mk('rd_note_hearth', Z, 'readable', [-84.0, 0.32, -18.9], { readable: 'rd_note_hearth' });
  pickup('pk_rounds_12_camp2', Z, 'pk_rounds_12', [-84.2, 0.3, -17.3], { dowsers: true });
  pickup('pk_canteen_hearth', Z, 'pk_canteen', [-83.7, 0.3, -19.5]);
  mk('rd_ledger', Z, 'readable', [-89, 0.795, -29.2], { readable: 'rd_ledger', on: 'head of the table, north end' });
  // polish round 4 (R1): a cartridge point inside the yard door, on the yard face of the east wall south of the door:
  // a poor shot ran wholly dry in the yard, six deaths running, with no source of rounds on the fight's side
  mk('ia_ammo_box_yard', 'plenty_street', 'interactable', [-80.25, 0, 3.2], { interactable: 'ia_ammo_box', mount: 'wall', note: 'inside the yard door (polish round 4)' }, FACE.w);
  mk('ia_ammo_box_tally', Z, 'interactable', [-90.6, 0, -15.1], { interactable: 'ia_ammo_box', mount: 'wall' }, FACE.n);
  mk('light_tally_lantern', Z, 'light', [-89, 0.95, -18.9], { kind: 'practical', hue: 'flame', radius: 3.5, baked: true, gutters: true, on: 'south end of the table' });
  mk('prop_front_doors', Z, 'prop', [T.x1 - 0.02, 0, -28], { prop: 'barred_front_doors', barredWith: 'benches', width: 2.4 }, FACE.w);
  // seated: 11 chairs, 6 west and 5 east. The two nearest the south end are the risers.
  const seatsW = [-19.6, -21.4, -23.2, -25.0, -26.8, -28.6].map((z) => V(-90.15, 0, z));
  const seatsE = [-20.5, -22.3, -24.1, -25.9, -27.7].map((z) => V(-87.85, 0, z));
  const RISERS = [seatsW[0], seatsE[0]];
  mk('prop_tally_seated', Z, 'prop', [-89, 0, -24], { prop: 'bider_table_static', instanced: true, count: 9, seats: [...seatsW.slice(1).map((p) => ({ pos: p, rotY: FACE.e })), ...seatsE.slice(1).map((p) => ({ pos: p, rotY: FACE.w }))], lampsBase: 9 });
  spawn('sp_tally_riser_w', Z, 'bider', seatsW[0], FACE.e, { dormant: 'sit_table', rise: 'rise_from_seat', cue: 'cap_chairs', cueLead: 0.8 });
  spawn('sp_tally_riser_e', Z, 'bider', seatsE[0], FACE.w, { dormant: 'sit_table', rise: 'rise_from_seat', cue: 'cap_chairs', cueLead: 0.8 });
  // hatch
  mk('ia_hatch', Z, 'door', [(HATCH.x0 + HATCH.x1) / 2, -0.3, (HATCH.z0 + HATCH.z1) / 2], { gate: 'G3', kind: 'hatch', interactable: 'ia_hatch', leaves: 2, cue: 'hatch_iris',
    states: { shut: 'walkable lid', ajar: 'on knot_hatch_latch: the leaves part 0.3 m and stop (hold the open clip at 15 %); IMPASSABLE, the lid collider stays; aqua comes up through the gap', open: 'enc_tally clear: opens fully with its cue within 1.5 s of the second riser going down', closed: 'trg_hatch_close, once the player stands on the first landing' },
    ajarOn: 'knot_hatch_latch', ajarGap: 0.3, opensOn: 'enc_tally clear', requires: 'hatch_powered', closesBehind: 'trg_hatch_close', connects: ['tally_house', 'the_gallery'] }, 0, [HATCH.x1 - HATCH.x0, 0.3, HATCH.z1 - HATCH.z0]);
  mk('knot_hatch_latch', Z, 'interactable', [KNOT.x, KNOT.y, KNOT.z], { interactable: 'knot_hatch_latch', kind: 'knot', hitRadius: 0.16, litBy: 'hatch_powered', releases: 'ia_hatch', releasesTo: 'ajar', startsEncounter: 'enc_tally', lines: ['nar_two_rise'], faces: 'north',
    cowl: ['ty_latch_cowl_back', 'ty_latch_cowl_w', 'ty_latch_cowl_e', 'ty_latch_cowl_hood'], hittableFrom: 'the strip north of the hatch (z < -34.5) only', minRiserDistance: 12, risers: ['sp_tally_riser_w', 'sp_tally_riser_e'],
    note: 'house-rule exception (GDD 13): the knot itself is not visible from the daylight stand spot; the lit cowl and the aqua strips running to it are' }, FACE.n);
  mk('light_tally_hatch', Z, 'light', [-91, 0.1, -33], { kind: 'hatch_glow', hue: 'aqua', radius: 5, switchedBy: 'hatch_powered' });
  trig('trg_tally_enter', Z, [-89, 0, -16.6], [6, 3, 3], { cards: ['card_iii'], lines: ['nar_tally_1', 'nar_tally_2', 'nar_tally_3'], exposure: '+1 stop over 1.5 s', once: true });
  cp('cp_tally_enter', Z, [-89, 0, -16.4], FACE.n, { when: 'entering the hall' });
  trig('trg_pz_daylight', Z, [-89, 0, -26], [14, 5, 22], { puzzle: 'daylight', role: 'volume', hints: { T2: 'hint_daylight_2', T3: 'hint_daylight_3', T4: 'hint_daylight_4' }, standSpot: V(-86, 0, -23.5) });
  cp('cp_tally_hatch', Z, [-94.5, 0, -33], FACE.e, { when: 'enc_tally clear' });
}

// ================================================================ 4. THE GALLERY (peg stair, proving bay, gallery)
const GAL = { floor: -12, ceil: -7, x0: -81, x1: -19, axisZ: -14, baffleX: -59 };
{
  const Z = 'the_gallery';
  // --- peg stair: three flights of 4 m, two landings, 2 m wide. Collides as ramps.
  // SEAM: flight 1, landing 1 and the shaft walls round them are walked while the SURFACE set is resident (before
  // trg_set_swap) and again from below afterwards, so they belong to both sets (flag `seam`, `sets`).
  ramp('gl_flight_1', Z, 'wood', -93, -87, -34, -32, -4, 0, '-x', SEAM);
  box('gl_landing_1', Z, 'floor', 'stone', -87, -85, -5, -4, -34, -32, SEAM);
  ramp('gl_flight_2', Z, 'wood', -87, -85, -32, -26, -8, -4, '-z');
  box('gl_landing_2', Z, 'floor', 'stone', -87, -83.6, -9, -8, -26, -24, { note: 'second landing and the watcher niche (east 1.4 m)' });
  ramp('gl_flight_3', Z, 'wood', -87, -85, -24, -18, -12, -8, '-z');
  box('gl_shaft_wall_n', Z, 'wall', 'stone', -94, -84, -5, -0.3, -35, -34, SEAM);
  box('gl_shaft_wall_w_end', Z, 'wall', 'stone', -94, -93, -5, -0.3, -34, -32, SEAM);
  box('gl_shaft_wall_s1', Z, 'wall', 'stone', -94, -87, -5, -0.3, -32, -31, SEAM);
  box('gl_shaft_wall_w', Z, 'wall', 'stone', -88, -87, -13, -0.3, -31, -18, SEAM);
  box('gl_shaft_wall_e1', Z, 'wall', 'stone', -85, -84, -9, -0.3, -34, -26, SEAM);
  box('gl_shaft_wall_e2', Z, 'wall', 'stone', -85, -84, -13, -0.3, -24, -18);
  box('gl_niche_wall_n', Z, 'wall', 'stone', -84, -82.6, -9, -5.4, -27, -26);
  box('gl_niche_wall_e', Z, 'wall', 'stone', -83.6, -82.6, -9, -5.4, -26, -24);
  box('gl_niche_wall_s', Z, 'wall', 'stone', -84, -82.6, -9, -5.4, -24, -23);
  box('gl_niche_ceiling', Z, 'ceiling', 'stone', -85, -82.6, -5.4, -5, -27, -23);
  box('gl_shaft_wall_over_niche', Z, 'wall', 'stone', -85, -84, -5, -0.3, -26, -24);
  box('gl_shaft_ceiling', Z, 'ceiling', 'stone', -88, -84, -1, -0.3, -31, -18, SEAM);
  // --- proving bay 10 x 8
  const F = GAL.floor, C = GAL.ceil;
  box('gl_bay_floor', Z, 'floor', 'ceramic', -92, -81, F - 1, F, -19, -9);
  box('gl_bay_ceiling', Z, 'ceiling', 'ceramic', -92, -81, C, C + 0.5, -19, -9);
  wallAlongX('gl_bay_wall_n', Z, 'ceramic', -92, -81, -19, -18, F, C, [{ a: -87, b: -85, top: F + 5 }]);
  box('gl_bay_wall_w', Z, 'wall', 'ceramic', -92, -91, F, C, -18, -10);
  box('gl_bay_wall_s', Z, 'wall', 'ceramic', -92, -81, F, C, -10, -9);
  box('gl_mark_step', Z, 'platform', 'metal', -83, -81.4, F, F + 0.15, -15.8, -14.2, { prop: 'brass_mark_step', puzzle: 'proving_line' });
  [-86.5, -88, -89.5].forEach((x, i) => box(`ia_range_plate_${i + 1}_solid`, Z, 'cover', 'ceramic', x - 0.05, x + 0.05, F + 0.6, F + 1.9, -11.5, -10.4, { pierce: true, interactable: `ia_range_plate_${i + 1}` }));
  // --- gallery 62 x 7 x 5, 3 m walkway between pipe banks
  box('gl_floor', Z, 'floor', 'ceramic', GAL.x0, GAL.x1 + 1, F - 1, F, -18.5, -9.5);
  box('gl_ceiling', Z, 'ceiling', 'ceramic', GAL.x0, GAL.x1, C, C + 0.5, -18.5, -9.5);
  box('gl_wall_n', Z, 'wall', 'ceramic', GAL.x0, GAL.x1, F, C, -18.5, -17.5);
  box('gl_wall_s', Z, 'wall', 'ceramic', GAL.x0, GAL.x1, F, C, -10.5, -9.5);
  for (const [n, a, b] of [['w', GAL.x0, GAL.baffleX - 0.5], ['e', GAL.baffleX + 0.5, GAL.x1]]) {
    box(`gl_pipes_n_${n}`, Z, 'wall', 'metal', a, b, F, F + 3, -17.5, -15.5, { prop: 'pipe_bank' });
    box(`gl_pipes_s_${n}`, Z, 'wall', 'metal', a, b, F, F + 3, -12.5, -10.5, { prop: 'pipe_bank' });
  }
  wallAlongZ('gl_baffle_wall', Z, 'ceramic', -17.5, -10.5, GAL.baffleX - 0.5, GAL.baffleX + 0.5, F, C, [{ a: -15.5, b: -12.5, top: F + 3 }]);

  // --- markers: stair
  trig('trg_hatch_close', Z, [-86, -4, -33], [2, 3, 2], { closes: 'ia_hatch', requires: 'enc_tally clear', when: 'the player is fully below y -3.5 (feet on the first landing)', ...SEAM, note: 'first landing. The hatch shuts overhead; if the player walks back up, the stair is still there and the hatch stays shut' });
  trig('trg_set_swap', Z, [-86, -6.4, -29.5], [2, 3.3, 2], { requires: 'enc_tally clear', after: 'trg_hatch_close', residentSet: { unload: 'surface', load: 'underground' }, keeps: 'everything flagged seam', note: 'on flight 2, past the first turn: the hatch is shut and out of line of sight (validator: sightlines)' });
  trig('trg_peg_stair', Z, [-86, -6.5, -29], [2, 3, 6], { cards: ['card_iv'], lines: ['nar_pegs_1', 'nar_pegs_2'], once: true });
  mk('prop_peg_rows', Z, 'prop', [-86, -6, -29], { prop: 'peg_rows', flights: ['gl_flight_1', 'gl_flight_2', 'gl_flight_3'], emptyRatio: 0.2, lowRowBare: true, oneCoatStill: true });
  mk('prop_watcher', Z, 'prop', [-84.2, -8, -25], { prop: 'bider_watcher', clip: 'sit_breathe', headYawClampDeg: 60, noHitVolume: true }, FACE.w);
  trig('trg_watcher', Z, [-86, -8, -25], [2, 3, 2], { lines: ['nar_watcher_1', 'nar_watcher_2'], vignette: { id: 'vig_watcher' }, once: true });
  ['gl_flight_1', 'gl_flight_2', 'gl_flight_3'].forEach((f, i) => mk(`light_stair_${i + 1}`, Z, 'light', [[-90, -86, -86][i], [-0.9, -3.5, -7.5][i], [-33, -29, -21][i]], { kind: 'strip', hue: 'aqua', switchedBy: 'cell_lit', flight: f, ...(i === 0 ? SEAM : {}) }));
  // --- markers: bay
  cp('cp_gallery_bay', Z, [-86, F, -16.8], FACE.s, { when: 'foot of the stair', objective: 'obj_gallery' });
  mk('rd_plate_proving', Z, 'readable', [-83.3, F + 1.6, -17.95], { readable: 'rd_plate_proving', mount: 'wall', loadBearing: true, castRelief: 'picto_charge', lines: ['nar_plate_1', 'nar_plate_2', 'nar_plate_3'], note: 'on the critical path, beside the brass mark' }, FACE.s);
  mk('ia_line_locker_bay', Z, 'interactable', [-83.6, F, -10.25], { interactable: 'ia_line_locker_bay', gives: 1, rule: 'dispenses whenever the player holds 0 line rounds and proving_line is unsolved; one more on solve', hint: 'ui_hint_line', cue: 'cap_locker_chime' }, FACE.n);
  mk('rd_plate_line', Z, 'readable', [-85, F + 1.6, -10.05], { readable: 'rd_plate_line', mount: 'wall', pictogram: 'picto_line' }, FACE.n);
  [-86.5, -88, -89.5].forEach((x, i) => mk(`ia_range_plate_${i + 1}`, Z, 'interactable', [x, F + 1.25, -10.95], { interactable: `ia_range_plate_${i + 1}`, kind: 'shootable', pierce: true, scaleDegree: [1, 3, 5][i], solid: `ia_range_plate_${i + 1}_solid` }, FACE.e));
  mk('prop_range_stand', Z, 'prop', [-84.4, F, -10.95], { prop: 'range_firing_point', note: 'stand here, face west: the three plates sit edge-on in a row' }, FACE.w);
  mk('ia_ammo_box_bay', Z, 'interactable', [-89.5, F, -17.9], { interactable: 'ia_ammo_box', mount: 'wall' }, FACE.s);
  pickup('pk_canteen_bay', Z, 'pk_canteen', [-90.2, F, -16.2]);
  // --- proving_line: the three knots lie on one line through eye height above the mark
  const eye = V(-82.2, F + 0.15 + 1.65, -15.0), knotC = V(-60.2, F + 4.2, -12.9);
  const onLine = (d) => V(eye[0] + d, eye[1] + ((knotC[1] - eye[1]) * d) / 22, eye[2] + ((knotC[2] - eye[2]) * d) / 22);
  mk('pz_proving_mark', Z, 'puzzle_element', [-82.2, F + 0.15, -15.0], { puzzle: 'proving_line', role: 'mark', step: 'gl_mark_step', eye, snapMaxDeg: 3, snapT4Deg: 10, snapRadiusAtKnotA: 0.6 }, FACE.e);
  mk('pz_sighting_loop', Z, 'puzzle_element', onLine(2), { puzzle: 'proving_line', role: 'sighting_loop', diameter: 0.5, ringCentreAboveFloor: r2(onLine(2)[1] - F), postFrom: V(-80.2, F, -14.81) }, FACE.e);
  mk('knot_a', Z, 'puzzle_element', onLine(8), { puzzle: 'proving_line', role: 'knot', interactable: 'knot_a', on: 'pipe elbow arching from the north bank', regrowSeconds: 3, hitRadius: 0.2 }, FACE.w);
  mk('knot_b', Z, 'puzzle_element', onLine(15), { puzzle: 'proving_line', role: 'knot', interactable: 'knot_b', on: 'valve bonnet on a cross pipe', regrowSeconds: 3, hitRadius: 0.2 }, FACE.w);
  mk('knot_c', Z, 'puzzle_element', knotC, { puzzle: 'proving_line', role: 'knot', interactable: 'knot_c', on: 'ceiling conduit, right of the door', regrowSeconds: 3, hitRadius: 0.2 }, FACE.w);
  trig('trg_pz_proving_line', Z, [-78, F, -14], [26, 5, 8], { puzzle: 'proving_line', role: 'volume', lines: { firstLine: 'nar_line_first' }, hints: { T2: 'hint_line_2', T3: 'hint_line_3' }, standSpot: V(-82.2, F + 0.15, -15) });
  door('ia_baffle', Z, [GAL.baffleX, F, GAL.axisZ], 90, 3, 3, { gate: 'G4', interactable: 'ia_baffle', cue: 'baffle_grind', opensOn: 'proving_line solved', openSeconds: 3, pierce: true, lamps: 3, closesBehind: true, startsEncounter: 'enc_file', hairline: 'violet under the door' });
  cp('cp_gallery_baffle', Z, [-80, F, -14], FACE.e, { when: 'proving_line solved', restocks: 'ia_line_locker_bay', objective: 'obj_file' });
  trig('lane_gallery', Z, [-39, F, GAL.axisZ], [40, 3, 3], { kind: 'lane', note: 'the File: Biders follow in file, no overtaking' });
  for (let i = 0; i < 6; i++) spawn(`sp_file_${i + 1}`, Z, 'bider', [-21.5 - i * 1.6, F, GAL.axisZ], FACE.e, { dormant: 'queue_stand', rise: 'turn_about', file: true, order: i + 1 });
  // polish round 5 (R3 / R10: the file cost nothing in three rounds of number changes): two who did not queue come down
  // flight 3 of the peg stair BEHIND her as she nears the far door with the file down. Out of sight of the bay and the
  // gallery (the bay's north wall), on the stair's own nav nodes; they run through the bay and down the walkway after her.
  [[-86, -20.2], [-86, -21.6]].forEach(([x, z], i) => spawn(`sp_file_${i + 10}`, Z, 'bider', [x, r2(F + ((-18 - z) / 6) * 4), z], FACE.s, { entrance: 'doorway', wave: 'R', encounter: 'enc_file', file: false, laneFollowing: false, order: i + 10, note: 'the rear pair (polish round 5): on flight 3, behind the bay wall, out of sight of the bay and the gallery; released when she nears the far door with the file down to one (src/world/director.ts WAVE_RULES enc_file/R)' }));
  trig('trg_file_lines', Z, [-57, F, GAL.axisZ], [3, 3, 3], { lines: { seen: 'nar_file', lined: 'nar_file_lined' } });
  door('door_gallery_far', Z, [-18.5, F, GAL.axisZ], 90, 3, 3, { opens: 'enc_file wave B: it slides open to let the three in, and stays open', closesBehind: 'trg_enc_matador', connects: ['the_gallery', 'lift_hall'] });
  cp('cp_file_clear', Z, [-23, F, GAL.axisZ], FACE.e, { when: 'enc_file clear' });
  for (let i = 0; i < 8; i++) mk(`light_gallery_strip_${i + 1}`, Z, 'light', [-77 + i * 8, C - 0.1, GAL.axisZ], { kind: 'strip', hue: 'aqua', flicker: i === 5, note: 'receding to a point; one in eight flickers' });
  mk('light_gallery_mark', Z, 'light', [-82.2, C - 0.1, -15], { kind: 'lamp', hue: 'aqua', steady: true, note: 'the one steady lamp, over the brass mark' });
}

// ================================================================ 5. LIFT HALL
const HALL = { x0: -18, x1: 20, z0: -28, z1: 0, floor: -15, ceil: -3, ribX: [-9, -3, 3, 9, 15], ribZ: [-18, -10] };
// One lift cage shape for both ends of the hall ride: interior 6 x 6 x 3.5 m, gate 6 x 3.5 m on one side,
// lever on the wall opposite the gate. ia_lift_cage is sized by these numbers.
const CAGE = { w: 6, d: 6, h: 3.5, hall: V(24, -15, -14), bore: V(2, -36, 83) };
{
  const Z = 'lift_hall';
  const H = HALL, F = H.floor, C = H.ceil;
  box('lh_floor', Z, 'floor', 'ceramic', H.x0 - 1, H.x1 + 1, F - 1, F, H.z0 - 1, H.z1 + 1);
  box('lh_cage_floor', Z, 'floor', 'metal', 21, 28, F - 1, F, -18, -10);
  box('lh_ceiling', Z, 'ceiling', 'ceramic', H.x0 - 1, H.x1 + 1, C, C + 1, H.z0 - 1, H.z1 + 1);
  wallAlongZ('lh_wall_w', Z, 'ceramic', H.z0 - 1, H.z1 + 1, H.x0 - 1, H.x0, F, C, [{ a: -15.5, b: -12.5, sill: -12, top: -9 }]);
  box('lh_wall_n', Z, 'wall', 'ceramic', H.x0, H.x1, F, C, H.z0 - 1, H.z0, { note: 'the sealed bulkhead the Tamper pounds is dressing on this wall at x = -6' });
  wallAlongX('lh_wall_s', Z, 'ceramic', H.x0, H.x1, H.z1, H.z1 + 1, F, C, [{ a: 2.8, b: 3.2, sill: F + 1.1, top: F + 2.2 }, { a: 4.5, b: 7.5, top: F + 3 }]);
  wallAlongZ('lh_wall_e', Z, 'ceramic', H.z0 - 1, H.z1 + 1, H.x1, H.x1 + 1, F, C, [{ a: -17, b: -11, top: F + CAGE.h }]);
  // gantry (3 m up) and ramp
  box('lh_gantry', Z, 'platform', 'metal', -18, -13, F, F + 3, -19, -9, { note: 'entry gantry; solid plinth of switchgear beneath' });
  ramp('lh_gantry_ramp', Z, 'metal', -18, -15, -9, -3, F, F + 3, '-z');
  // ten ribs
  H.ribX.forEach((x, i) => H.ribZ.forEach((z, j) => box(`lh_rib_${j ? 's' : 'n'}${i + 1}`, Z, 'cover', 'ceramic', x - 0.8, x + 0.8, F, C, z - 1.2, z + 1.2, { prop: 'hall_rib', stunsCharge: true })));
  // lift cage behind the ring: interior x 21..27, z -17..-11, 3.5 m high; gate on the west (hall) side
  box('lh_cage_wall_n', Z, 'wall', 'metal', 21, 28, F, F + CAGE.h, -18, -17);
  box('lh_cage_wall_s', Z, 'wall', 'metal', 21, 28, F, F + CAGE.h, -11, -10);
  box('lh_cage_wall_e', Z, 'wall', 'metal', 27, 28, F, F + CAGE.h, -17, -11);
  box('lh_cage_ceiling', Z, 'ceiling', 'metal', 21, 28, F + CAGE.h, F + CAGE.h + 0.5, -18, -10);
  // full-height cover at the ramp foot (the Tamper's first charge arrives here); clear of every 1 m Tamper lane
  box('lh_ramp_cabinet', Z, 'cover', 'ceramic', -14.6, -13.4, F, F + 2.4, -5.4, -4.2, { dress: 'switchgear cabinet, bolted down', stunsCharge: true, note: 'the one exception to the clear floor: it stands in the dead corner between the ramp and the gantry plinth' });
  // secret cold bay
  box('lh_bay_floor', Z, 'floor', 'ceramic', 1, 11, F - 1, F, 1, 8);
  box('lh_bay_wall_w', Z, 'wall', 'ceramic', 1, 2, F, F + 4, 1, 8);
  box('lh_bay_wall_e', Z, 'wall', 'ceramic', 10, 11, F, F + 4, 1, 8);
  box('lh_bay_wall_s', Z, 'wall', 'ceramic', 2, 10, F, F + 4, 7, 8);
  box('lh_bay_ceiling', Z, 'ceiling', 'ceramic', 1, 11, F + 4, F + 4.5, 1, 8);

  trig('trg_hall_gantry', Z, [-16.5, F + 3, -14], [3, 3, 3], { cards: ['card_v'], lines: ['nar_tamper_1'], vignette: { id: 'vig_tamper', seconds: 8, skippable: true, actors: ['sp_hall_tamper', 'sp_hall_vig_bider'], clip: 'pound_bulkhead', caption: 'cap_tamper_pound' }, once: true });
  cp('cp_hall_gantry', Z, [-16.5, F + 3, -14], FACE.e, { when: 'entering the gantry', objective: 'obj_hall' });
  // enc_file wave B waits here, behind door_gallery_far, and runs west through it (GDD 10). Not in file.
  // (polish round 5: a fourth, sp_file_12, so the answer to the line shot is six: the two on the stair and these four)
  [[-17.0, -15.0, -1, 7], [-15.4, -14.0, 0, 8], [-13.8, -13.0, 1, 9], [-13.8, -14.7, -0.4, 12]].forEach(([x, z, off, n]) => spawn(`sp_file_${n}`, Z, 'bider', [x, F + 3, z], FACE.w, { entrance: 'doorway', wave: 'B', entersThrough: 'door_gallery_far', encounter: 'enc_file', file: false, laneFollowing: false, lateralOffset: off, depthStagger: 1.2, order: n, note: 'the ambush (polish round 4; four since round 5): spawned behind the shut door_gallery_far 1 s before it bursts open; they gather behind it and come through together' }));
  mk('vista_tamper', Z, 'vista', [-17, F + 3, -14], { subject: 'the Tamper pounding the sealed bulkhead, 16 m off and 3 m below', target: V(-6, F + 1.4, -25.3) }, -43);
  pickup('pk_rounds_12_gantry', Z, 'pk_rounds_12', [-14, F + 3, -18]);
  pickup('pk_canteen_gantry', Z, 'pk_canteen', [-14, F + 3, -16.8]);
  mk('ia_line_locker_hall', Z, 'interactable', [-17.75, F, -1.6], { interactable: 'ia_line_locker_hall', gives: 1, once: true, cue: 'cap_locker_chime' }, FACE.e);
  trig('trg_enc_matador', Z, [-16.5, F, -2.2], [3, 3, 2.4], { encounter: 'enc_matador', closes: 'door_gallery_far', alsoStartsOn: 'a vent hit or any line round on the Tamper during the vignette (GDD 7.3)', note: 'stepping off the ramp' });
  spawn('sp_hall_tamper', Z, 'tamper', [-6, F, -25.3], FACE.n, { dormant: 'pound_bulkhead', state: 'vignette', bulkheadAt: V(-6, F + 1.5, -28), vignetteDamage: 'plate 0; a vent hit or a line round does normal damage and starts enc_matador' });
  spawn('sp_hall_vig_bider', Z, 'bider', [-4.4, F, -23.8], FACE.s, { entrance: 'climb_out', vignetteOnly: true, felledBySlam: true, counted: false });
  [[12, -24.5], [12, -3.5], [18, -22], [18, -6]].forEach(([x, z], i) => spawn(`sp_hall_grate_${i + 1}`, Z, 'bider', [x, F, z], FACE.w, { entrance: 'climb_out', wave: i < 2 ? 'B' : 'C' }));
  mk('prop_hall_ring', Z, 'prop', [20, F, -14], { prop: 'ring_lift_portal', landmark: true, diameter: 9, note: 'a portal built for loads; frames the 6 x 3.5 m cage gate' }, FACE.w);
  mk('prop_hall_diagram', Z, 'prop', [19.95, F + 1, -21.5], { prop: 'wall_diagram_lift_head', height: 4, geometry: true }, FACE.w);
  trig('trg_hall_diagram', Z, [17.5, F, -21.5], [4, 3, 5], { requires: 'enc_matador clear', lines: ['nar_mark_1', 'nar_mark_2', 'nar_mark_3'], once: true });
  pickup('pk_rounds_12_cage', Z, 'pk_rounds_12', [18.8, F, -9.6], { availableAfter: 'enc_matador' });
  pickup('pk_canteen_cage', Z, 'pk_canteen', [18.8, F, -8.4], { availableAfter: 'enc_matador' });
  cp('cp_hall_clear', Z, [16, F, -14], FACE.e, { when: 'enc_matador clear' });
  door('door_lift_cage', Z, [20.5, F, -14], 90, CAGE.w, CAGE.h, { gate: 'G5', opens: 'enc_matador clear', closesBehind: true, note: 'the cage gate: 6 x 3.5 m, the full west side of the cage' });
  mk('ia_lift_lever', Z, 'interactable', [26.8, F + 1.2, -14], { interactable: 'ia_lift_lever', requires: 'enc_matador clear', ride: { id: 'ride_lift_hall', seconds: 25, lines: ['stn_lift_1', 'stn_lift_2', 'stn_lift_3'], to: 'lift_arrival_bore' } }, FACE.w);
  mk('lift_depart_hall', Z, 'prop', CAGE.hall, { prop: 'cage_lift', portalTo: 'lift_arrival_bore', interior: [CAGE.w, CAGE.h, CAGE.d], gateSide: 'west' }, FACE.w);
  // secret 2
  door('door_cold_bay', Z, [6, F, 0.5], 0, 3, 3, { secret: 'sec_cold_bay', kind: 'shutter', pierce: true, opensOn: 'knot_cold_bay' });
  mk('knot_cold_bay', Z, 'interactable', [3, F + 1.6, 1.12], { interactable: 'knot_cold_bay', kind: 'knot', secret: 'sec_cold_bay', hitRadius: 0.16, opens: 'door_cold_bay', seenThrough: 'a 0.4 m inspection slot in the south wall, in line with rib s3' }, FACE.n);
  mk('sec_cold_bay', Z, 'prop', [8, F, 4.5], { prop: 'tamper_clean_static', secret: 'sec_cold_bay', band: 'aqua' }, FACE.n);
  mk('ia_line_locker_secret', Z, 'interactable', [9.75, F, 3], { interactable: 'ia_line_locker_secret', gives: 1, once: true, secret: 'sec_cold_bay' }, FACE.w);
  pickup('pk_rounds_12_cold_bay', Z, 'pk_rounds_12', [4, F, 5.5], { secret: 'sec_cold_bay' });
  mk('rd_plate_service', Z, 'readable', [6, F + 1.6, 6.95], { readable: 'rd_plate_service', mount: 'wall', secret: 'sec_cold_bay' }, FACE.n);
  for (let i = 0; i < 5; i++) for (const z of [-22.5, -14, -5.5]) mk(`light_hall_${i + 1}_${z === -14 ? 'c' : z < -14 ? 'n' : 's'}`, Z, 'light', [-12 + i * 7.5, C - 0.2, z], { kind: 'lamp', hue: 'aqua', note: 'rows receding east into fog toward the ring' });
}

// ================================================================ 6. THE BORE
const BORE = { cx: 14, cz: 96, floor: -44, ceil: -30, R: 15, boreR: 3, kerbR: 3.6, kerbH: 1.2, kerbLow: 0.6, catY: -36 };
// The proving lift: one cage shape at both ends (bore and rim), 62 m apart vertically, no yaw.
const PCAGE = { w: 4, d: 4, h: 3.5, bore: V(14, -44, 114), rim: V(14, 18, 114) };
const polar = (bearingDeg, r) => [BORE.cx + r * Math.sin(rad(bearingDeg)), BORE.cz - r * Math.cos(rad(bearingDeg))];
{
  const Z = 'the_bore';
  const B = BORE, F = B.floor, C = B.ceil;
  // chamber floor (annulus round the 6 m bore), kerb, roof
  cyl('bo_floor', Z, 'floor', 'ceramic', B.cx, F - 1, B.cz, B.R + 1, 1, { innerRadius: B.boreR });
  // kerb: 0.6 m all round, raised to 1.2 m in six 25 degree merlons at the rib bearings. In front of each proving
  // mark that leaves a 35 degree (2 m) notch at 0.6 m through which the bore is seen and shot into. An invisible
  // player-only ring keeps the whole kerb uncrossable (1.2 m; jump apex 1.0 m).
  cyl('bo_kerb', Z, 'blocker', 'ceramic', B.cx, F, B.cz, B.kerbR, B.kerbLow, { innerRadius: B.boreR, note: 'kerb base, 0.6 m' });
  for (let k = 0; k < 6; k++) { const b = 30 + 60 * k, [x, z] = polar(b, (B.boreR + B.kerbR) / 2); obox(`bo_kerb_hi_${k + 1}`, Z, 'blocker', 'ceramic', x, F + B.kerbLow, z, 1.6, B.kerbH - B.kerbLow, B.kerbR - B.boreR, 180 - b, { bearingDeg: b, note: 'kerb merlon to 1.2 m, 25 degrees of arc at a rib bearing' }); }
  cyl('bo_kerb_guard', Z, 'blocker', 'ceramic', B.cx, F + B.kerbLow, B.cz, B.kerbR, B.kerbH - B.kerbLow, { innerRadius: B.boreR, invisible: true, playerOnly: true, note: 'collision for bodies only: shots, sight and the kept-round test pass through' });
  cyl('bo_ceiling', Z, 'ceiling', 'ceramic', B.cx, C, B.cz, B.R + 1, 0.5, { innerRadius: 0 });
  // wall ring: 24 segments; bearings 0 (bore door), 180 (proving lift), 30 and 330 (catwalk) are special
  const segW = 2 * (B.R + 1) * Math.tan(rad(7.5)) + 0.05;
  for (let b = 0; b < 360; b += 15) {
    const [x, z] = polar(b, B.R + 0.5);
    if (b === 0 || b === 180) continue;
    if (b === 30 || b === 330 || b === 45 || b === 315) {
      const hi = b >= 315 ? B.catY + CAGE.h + 0.5 : B.catY + 2.6; // the arrival cage bay stands in the north-west segments
      obox(`bo_wall_${b}_lo`, Z, 'wall', 'ceramic', x, F, z, segW, B.catY - 0.3 - F, 1, 180 - b);
      obox(`bo_wall_${b}_hi`, Z, 'wall', 'ceramic', x, hi, z, segW, C - hi, 1, 180 - b);
    } else obox(`bo_wall_${b}`, Z, 'wall', 'ceramic', x, F, z, segW, C - F, 1, 180 - b);
  }
  wallAlongX('bo_wall_door', Z, 'ceramic', 8, 20, 80, 81, F, C, [{ a: 12.5, b: 15.5, top: F + 3 }]);
  wallAlongX('bo_wall_lift', Z, 'ceramic', 11.5, 16.5, 111, 112, F, C, [{ a: 12.5, b: 15.5, top: F + 3 }]);
  // six ribs, 1.6 thick, 3 m radial, at 9 m radius; bays between them
  for (let k = 0; k < 6; k++) {
    const b = 30 + 60 * k, [x, z] = polar(b, 9);
    obox(`bo_rib_${k + 1}`, Z, 'cover', 'ceramic', x, F, z, 1.6, C - F, 3, 180 - b, { prop: 'bore_rib', bearingDeg: b, blocksBossFire: true });
  }
  // arrival cage, catwalk (inside the chamber, 8 m up), east landing
  const cy = B.catY;
  // arrival cage bay: the SAME cage as the lift hall's, turned 180 degrees (gate on the east, onto the catwalk).
  // interior x -1..5, z 80..86, 3.5 m high, centre CAGE.bore.
  const ch = cy + CAGE.h;
  box('bo_arrival_floor', Z, 'floor', 'metal', -2, 5, cy - 0.3, cy, 79, 87);
  box('bo_arrival_wall_w', Z, 'wall', 'metal', -2, -1, cy, ch, 79, 87);
  box('bo_arrival_wall_n', Z, 'wall', 'metal', -1, 5.4, cy, ch, 79, 80);
  box('bo_arrival_wall_s', Z, 'wall', 'metal', -1, 5.4, cy, ch, 86, 87);
  box('bo_arrival_ceiling', Z, 'ceiling', 'metal', -2, 5.4, ch, ch + 0.5, 79, 87);
  // bulkhead outside the gate: a 2 x 2.6 m hatchway onto the catwalk
  box('bo_arrival_front_n', Z, 'wall', 'metal', 5, 5.4, cy, ch, 80, 82);
  box('bo_arrival_front_s', Z, 'wall', 'metal', 5, 5.4, cy, ch, 84, 86);
  box('bo_arrival_front_lintel', Z, 'wall', 'metal', 5, 5.4, cy + 2.6, ch, 82, 84);
  box('bo_arrival_pass_n', Z, 'wall', 'metal', 5.4, 8.6, cy, cy + 2.7, 80, 82);
  box('bo_arrival_pass_ceiling', Z, 'ceiling', 'metal', 5.4, 9, cy + 2.7, ch + 0.5, 80, 86);
  box('bo_catwalk', Z, 'platform', 'metal', 5, 23, cy - 0.3, cy, 82, 84, { grille: true, note: '18 m of grille from the cage bay to the east landing, 8 m above the chamber floor' });
  box('bo_catwalk_grille_n', Z, 'blocker', 'metal', 8.6, 19.4, cy, cy + 2.6, 81.9, 82, { grille: true, seeThrough: true, skipsShots: true });
  box('bo_catwalk_grille_s', Z, 'blocker', 'metal', 5.4, 22.6, cy, cy + 2.6, 84, 84.1, { grille: true, seeThrough: true, skipsShots: true });
  box('bo_catwalk_grille_top', Z, 'ceiling', 'metal', 5, 23, cy + 2.6, cy + 2.7, 81.9, 84.1, { grille: true, seeThrough: true, skipsShots: true });
  box('bo_landing_e', Z, 'floor', 'metal', 23, 28, cy - 0.3, cy, 82, 84);
  box('bo_landing_e_wall_n', Z, 'wall', 'stone', 19.4, 26, cy, cy + 2.6, 80, 82);
  box('bo_landing_e_wall_s', Z, 'wall', 'stone', 22.6, 29, cy - 1, cy + 2.6, 84, 86);
  box('bo_stair_wall_e', Z, 'wall', 'stone', 28, 29, F, cy + 2.6, 73, 84);
  ramp('bo_stair_1', Z, 'metal', 26, 28, 76, 82, cy - 4, cy, '+z');
  box('bo_stair_wall_w', Z, 'wall', 'stone', 25, 26, cy - 4, cy + 2.6, 76, 80);
  box('bo_stair_landing', Z, 'floor', 'metal', 26, 28, cy - 5, cy - 4, 74, 76);
  box('bo_stair_wall_n', Z, 'wall', 'stone', 20, 29, F, cy + 2.6, 73, 74);
  ramp('bo_stair_2', Z, 'metal', 20, 26, 74, 76, F, cy - 4, '+x');
  box('bo_stair_wall_s2', Z, 'wall', 'stone', 20, 26, F, cy - 1, 76, 77);
  box('bo_stair_ceiling', Z, 'ceiling', 'stone', 20, 29, cy + 2.6, cy + 3, 73, 86);
  // antechamber 10 x 14 x 5
  box('bo_ante_floor', Z, 'floor', 'ceramic', 8, 20, F - 1, F, 65, 81);
  box('bo_ante_ceiling', Z, 'ceiling', 'ceramic', 8, 20, F + 5, F + 5.5, 65, 80);
  box('bo_ante_wall_w', Z, 'wall', 'ceramic', 8, 9, F, F + 5, 65, 80);
  box('bo_ante_wall_n', Z, 'wall', 'ceramic', 9, 19, F, F + 5, 65, 66);
  wallAlongZ('bo_ante_wall_e', Z, 'ceramic', 65, 80, 19, 20, F, F + 5, [{ a: 74, b: 76, top: F + 3 }]);
  // proving lift cage beyond the south gate: interior x 12..16, z 112..116, 3.5 m; gate wall z 111..112 with a 3 x 3 opening
  box('bo_plift_floor', Z, 'floor', 'metal', 11, 17, F - 1, F, 112, 117);
  box('bo_plift_wall_w', Z, 'wall', 'metal', 11, 12, F, F + 3.5, 112, 117);
  box('bo_plift_wall_e', Z, 'wall', 'metal', 16, 17, F, F + 3.5, 112, 117);
  box('bo_plift_wall_s', Z, 'wall', 'metal', 12, 16, F, F + 3.5, 116, 117);
  box('bo_plift_ceiling', Z, 'ceiling', 'metal', 11, 17, F + 3.5, F + 4, 112, 117);

  // --- markers: arrival, catwalk
  mk('lift_arrival_bore', Z, 'prop', CAGE.bore, { prop: 'cage_lift', portalFrom: 'lift_depart_hall', interior: [CAGE.w, CAGE.h, CAGE.d], gateSide: 'east', gate: 'the instance\'s own gate node opens on arrival; no door marker' }, FACE.e);
  trig('trg_bore_arrive', Z, [6, cy, 83], [2, 2.6, 2], { cards: ['card_vi'], once: true });
  trig('trg_windlass_seen', Z, [14, cy, 83], [6, 2.6, 2], { lines: ['nar_windlass_seen'], bossLooksAtPlayer: true, once: true });
  mk('vista_windlass', Z, 'vista', [14, cy, 83], { subject: 'the Windlass over the violet bore, from above through the grille', target: V(14, F + 4, 94) }, FACE.s);
  mk('light_bore_violet', Z, 'light', [B.cx, F - 0.5, B.cz], { kind: 'bore_glow', hue: 'violet', becomes: 'aqua after the seventh, bottom up', sixFold: true });
  // --- markers: antechamber
  cp('cp_bore_ante', Z, [17.5, F, 75], FACE.w, { when: 'entering the antechamber', objective: 'obj_ante' });
  trig('trg_ante_enter', Z, [17.5, F, 75], [3, 3, 2], { lines: ['nar_embers_1', 'nar_embers_2'], once: true });
  mk('prop_camp_three', Z, 'prop', [11.5, F, 70], { prop: 'cold_camp', camp: 3, stop: 3, fire: true, contents: ['embers, still orange', 'kettle, still warm'], note: 'the only fire he leaves' });
  mk('light_ante_embers', Z, 'light', [11.5, F + 0.15, 70], { kind: 'practical', hue: 'flame', radius: 3, note: 'the first warm light below ground, and it is his' });
  pickup('pk_rounds_12_camp3', Z, 'pk_rounds_12', [10.6, F, 71.2], { dowsers: true });
  pickup('pk_canteen_ante_1', Z, 'pk_canteen', [10.4, F, 68.8]);
  pickup('pk_canteen_ante_2', Z, 'pk_canteen', [17.6, F, 67.4]);
  mk('ia_ammo_box_ante', Z, 'interactable', [9.25, F, 76], { interactable: 'ia_ammo_box', mount: 'wall' }, FACE.e);
  mk('ia_cradle', Z, 'interactable', [10.9, F + 1.5, 79.9], { interactable: 'ia_cradle', kind: 'look_target', lookRange: 4, lookSeconds: 0.5, lines: ['nar_cradle', 'nar_cradle_2'], alsoPlaysWhen: 'stn_ask_3 is put, if not yet heard (the question lights the cradle)', side: 'right of the door as faced (west)', loadBearing: true, lit: true, empty: true, markAbove: 'six-and-one, seventh lamp dark' }, FACE.n);
  mk('rd_note_cradle', Z, 'readable', [10.9, F + 0.9, 79.85], { readable: 'rd_note_cradle', mount: 'wall', under: 'ia_cradle' }, FACE.n);
  mk('prop_station_plate_4', Z, 'prop', [16.3, F + 2.0, 79.95], { prop: 'station_plate', numeral: 4, geometry: true, answers: 'stn_ask_1' }, FACE.n);
  mk('prop_ante_diagram', Z, 'prop', [17.7, F + 0.6, 79.95], { prop: 'wall_diagram_lift_head', height: 2.4, geometry: true, answers: 'stn_ask_2' }, FACE.n);
  const portC = [14, F + 1.5, 79.98]; // 2 cm proud of the disc face (z 80.0)
  for (let k = 1; k <= 8; k++) { const a = rad((k - 1) * 45); mk(`ia_ask_port_${k}`, Z, 'puzzle_element', [portC[0] - 1.0 * Math.sin(a), portC[1] + 1.0 * Math.cos(a), portC[2]], { puzzle: 'the_asking', role: 'port', number: k, interactable: `ia_ask_port_${k}`, hitRadius: 0.2, note: 'clockwise from the top as seen from the antechamber' }, FACE.n); }
  mk('pz_listening_lamps', Z, 'puzzle_element', portC, { puzzle: 'the_asking', role: 'listening_lamps', count: 12, ringRadius: 1.42, fillSecondsEach: 0.75, darkOnQuestions: [1, 2], fillsOnlyInside: 'trg_pz_asking', startsAfter: 'the stn_ask_3 subtitle', cradleLampSteps: true, caption: 'cap_listening' }, FACE.n);
  trig('trg_pz_asking', Z, [14, F, 76], [10, 5, 8], { puzzle: 'the_asking', role: 'volume', reaskSeconds: 20, note: 'the antechamber within 8 m of the door: the listening ring fills only in here', lines: { q1: 'stn_ask_1', q2: 'stn_ask_2', q3: 'stn_ask_3', wrong: 'stn_ask_wrong', done: 'stn_ask_done' }, answers: [4, 6, 'hold fire'], hints: { T2: 'hint_ask_2', T3: 'hint_ask_3', T3num: 'hint_ask_3_num' }, standSpot: V(14, F, 74) });
  door('door_bore', Z, [14, F, 80.125], 0, 3, 3, { gate: 'G6', kind: 'disc', opensOn: 'the_asking solved', closesBehind: true, ports: 8, note: 'disc 0.25 m thick, its antechamber face at z 80.0, flush with the wall' }, 0.25);
  // --- markers: chamber
  trig('trg_enc_windlass', Z, [14, F, 83.5], [3, 3, 2], { encounter: 'enc_windlass', objective: 'obj_boss', seals: 'door_bore', parley: ['stn_parley_1', 'nar_parley', 'rv_ask', 'stn_parley_2', 'stn_parley_3', 'stn_parley_4'], refused: 'stn_parley_refused', kept: 'nar_parley_kept' });
  spawn('sp_windlass', Z, 'windlass', [B.cx, F, B.cz], FACE.n, { boss: true, armPivot: V(B.cx, F, B.cz), drumCentreOut: 2.0, drumCentreHeight: 4.0, drumDiameter: 5.0, armIndexBearings: [0, 60, 120, 180, 240, 300], arcDeg: 35, pawlHeight: 6, pawlSpacing: 3.2 });
  mk('bore_opening', Z, 'puzzle_element', [B.cx, F + B.kerbH, B.cz], { role: 'bore_opening', keptRoundTarget: true,
    volume: { shape: 'cylinder', radius: B.boreR, top: r2(F + B.kerbH), bottom: r2(F - 6), axis: V(B.cx, 0, B.cz) },
    test: 'the kept round fires when the aim ray enters this volume; bo_kerb*, bo_kerb_guard and the Windlass are ignored (GDD 6.6 rule 4)',
    notches: { bearingsDeg: [0, 60, 120, 180, 240, 300], arcDeg: 35, kerbHeight: B.kerbLow }, lines: { lead: 'stn_bore_lead', line: 'stn_bore_line_short', notInBore: 'nar_down_the_bore', denied: 'nar_not_for_firing', seal: 'nar_seal', hint1: 'hint_kept_1', office: 'nar_office', kept: 'nar_kept', proven: 'stn_proven', hint2: 'hint_kept_2' },
    note: 'pos is the centre of the TOP disc (kerb-top height, y -42.8), not the floor' });
  trig('trg_bore_kill', Z, [B.cx, F - 1, B.cz], [B.boreR * 2, 1, B.boreR * 2], { kind: 'kill', shape: 'cylinder', note: 'unreachable in normal play (kerb)' });
  for (let k = 0; k < 6; k++) {
    const b = 60 * k, [x, z] = polar(b, 4.9);
    mk(`ia_proving_mark_${k + 1}`, Z, 'interactable', [x, F, z], { interactable: `ia_proving_mark_${k + 1}`, kind: 'floor_mark', bay: k + 1, bearingDeg: b, radius: 0.5, leaveRadius: 2.5, prompt: 'ui_prompt_kept', litFrom: 'the first tick of phase 3a', armSwingsTo: ((k + 3) % 6) + 1 }, 180 - b);
    const [bx, bz] = polar(b, 11.5);
    mk(`bay_${k + 1}`, Z, 'trigger', [bx, F, bz], { kind: 'bay', bay: k + 1, bearingDeg: b, arcDeg: [b - 30, b + 30], note: 'boss arm index ' + (k + 1) }, 0, [1, 3, 1]);
  }
  [90, 210, 330].forEach((b, i) => { const [x, z] = polar(b, 4.5); spawn(`sp_bore_grate_${i + 1}`, Z, 'bider', [x, F, z], 180 - b + 180, { entrance: 'climb_out', bearingDeg: b, add: true, radius: 4.5 }); });
  [[90, 'e'], [270, 'w']].forEach(([b, n]) => { const [x, z] = polar(b, B.R - 0.25); mk(`ia_ammo_box_bore_${n}`, Z, 'interactable', [x, F, z], { interactable: 'ia_ammo_box', mount: 'wall', bossRoom: true, gives: 18, cooldownSeconds: 10, bearingDeg: b, note: 'behind a rib: the obvious place to reload' }, b === 90 ? FACE.w : FACE.e); });
  { const [x, z] = polar(168, B.R - 0.3); mk('ia_line_locker_bore', Z, 'interactable', [x, F, z], { interactable: 'ia_line_locker_bore', gives: 1, rule: 'once per attempt at phase 2; opens with stn_boss_guard_set', bearingDeg: 168 }, FACE.n); }
  pickup('pk_rounds_12_mercy', Z, 'pk_rounds_12', [16.2, F, 82.2], { conditional: 'after 2 deaths in the same boss phase' });
  cp('cp_boss_p1', Z, [14, F, 83.5], FACE.s, { when: 'boss phase 1 start (parley marked heard)' });
  cp('cp_boss_p2', Z, [14, F, 84], FACE.s, { when: 'boss phase 2 start', line: 'stn_boss_guard_set' });
  cp('cp_boss_p3', Z, [14, F, 84.5], FACE.s, { when: 'boss phase 3a start', objective: 'obj_boss_unproven' });
  cp('cp_boss_proven', Z, [14, F, 85], FACE.s, { when: 'the kept round fired', objective: 'obj_boss_dry' });
  door('door_proving_lift', Z, [14, F, 111.5], 0, 3, 3, { gate: 'G7', opens: 'boss dead (stn_service, stn_thanks)', lamp: 'aqua gate lamp on the far wall' });
  mk('ia_proving_lift', Z, 'interactable', [14, F + 1.2, 115.8], { interactable: 'ia_proving_lift', requires: 'boss dead', ride: { id: 'ride_proving_lift', seconds: 12, lines: ['nar_lift_up'], to: 'lift_arrival_rim', residentSet: { unload: 'underground', load: 'coda' } } }, FACE.n);
  mk('lift_depart_bore', Z, 'prop', PCAGE.bore, { prop: 'proving_lift_cage', portalTo: 'lift_arrival_rim', interior: [PCAGE.w, PCAGE.h, PCAGE.d], gateSide: 'north', gateOpening: [3, 3], note: 'a lift for people: 4 x 4 x 3.5 m. NOT ia_lift_cage (6 x 6): needs its own asset' }, FACE.n);
}

// ================================================================ 7. FAR RIM
{
  const Z = 'far_rim';
  box('rim_floor', Z, 'terrain', 'stone', -1, 29, 17, 18, 101, 117);
  box('rim_rock_w', Z, 'terrain', 'stone', -1, 12, 18, 24, 111, 121);
  box('rim_rock_e', Z, 'terrain', 'stone', 16, 29, 18, 24, 111, 121);
  box('rim_rock_back', Z, 'terrain', 'stone', 12, 16, 18, 24, 116, 121);
  // the cage room matches the bore end exactly: interior x 12..16, z 112..116, 3.5 m; gate wall z 111..112, opening 3 x 3
  box('rim_cage_ceiling', Z, 'ceiling', 'stone', 12, 16, 18 + PCAGE.h, 24, 112, 116);
  box('rim_cage_lintel', Z, 'ceiling', 'stone', 12.5, 15.5, 21, 24, 111, 112, { note: 'black rock frame: the opening shot composition, reversed' });
  box('rim_cage_jamb_w', Z, 'terrain', 'stone', 12, 12.5, 18, 24, 111, 112);
  box('rim_cage_jamb_e', Z, 'terrain', 'stone', 15.5, 16, 18, 24, 111, 112);
  box('rim_edge_n', Z, 'blocker', 'stone', -1, 29, 18, 21, 100, 101, { invisible: true, note: 'cliff edge above the overhang; no fall' });
  box('rim_edge_w', Z, 'blocker', 'stone', -2, -1, 18, 21, 100, 111, { invisible: true });
  box('rim_edge_e', Z, 'blocker', 'stone', 29, 30, 18, 21, 100, 111, { invisible: true });
  obox('rim_boulder_1', Z, 'cover', 'stone', 21, 18, 105, 3, 1.6, 2.2, 25);
  obox('rim_boulder_2', Z, 'cover', 'stone', 8.5, 18, 108.2, 2.2, 1.1, 1.6, -15);
  obox('rim_stone', Z, 'cover', 'stone', 1.6 - 0.33 * Math.cos(rad(20)), 18, 102.4 + 0.33 * Math.sin(rad(20)), 1.95, 0.35, 0.9, 20, { prop: 'flat_stone', low: true, note: 'integration: the collider is the drawn shelf + slab, as long as the shelf (1.95 m); depth and height stay 0.9 / 0.35 so n_rim_003 stays standable and the stone stays a step; seat 7 of prop_rim_stone (its pivot) is at ia_stone_round' });

  mk('lift_arrival_rim', Z, 'prop', PCAGE.rim, { prop: 'proving_lift_cage', portalFrom: 'lift_depart_bore', interior: [PCAGE.w, PCAGE.h, PCAGE.d], gateSide: 'north', gateOpening: [3, 3] }, FACE.n);
  cp('cp_rim', Z, PCAGE.rim, FACE.n, { when: 'the lift opens on the rim', objective: 'obj_rim',
    failSafes: [{ afterSeconds: 60, unless: 'trg_stone', does: 'the stone glint doubles in size and rate (light_rim_stone_glint)', pointerLine: 'nar_stone_1' }, { afterSeconds: 150, unless: 'trg_stone', does: 'the ending proceeds down the leave branch from wherever she stands' }] });
  trig('trg_rim_arrive', Z, [14, 18, 110.5], [4, 3, 2], { cards: ['card_vii'], lines: ['nar_rim_1', 'nar_rim_2', 'nar_rim_3'], once: true });
  mk('vista_rim_rule', Z, 'vista', [14, 18, 110], { subject: 'the Rule, leaning two degrees now', bearingDeg: 0, target: V(14, 60, -900) }, FACE.n);
  mk('vista_plenty', Z, 'vista', [6, 18, 104], { subject: 'Plenty as a silhouette card with flame-lit windows and the plumb aqua thread', target: V(-60, 4, 0), windowQuads: 48, lampsFormula: '9 + freed, skipping 19 (ten freed gives 20)' }, 35);
  trig('trg_lamps', Z, [5, 18, 104.5], [10, 3, 6], { lines: ['nar_lamps', 'nar_lamps_count'], once: true, note: 'the north-west part of the ledge (x 0..10, z 101.5..107.5): the town view and the stone share a frame from here' });
  mk('light_rim_stone_glint', Z, 'light', [1.6, 18.4, 102.4], { kind: 'glint', sprite: 'aim_star', everySeconds: 2.5, hue: 'brass', note: 'the six case mouths: the only brass glint on the ledge; doubles at the 60 s fail-safe' });
  mk('ia_stone_round', Z, 'interactable', [1.6, 18.356, 102.4], { interactable: 'ia_stone_round', prompt: 'ui_prompt_take', clip: 'take_round', lines: { taken: ['nar_take_1', 'nar_take_2'], left: 'nar_leave' }, sixSpentCases: true, arms: 'exit_rim' });
  mk('rd_note_stone', Z, 'readable', [1.2, 18.362, 102.5], { readable: 'rd_note_stone', under: 'the first spent case' });
  trig('trg_stone', Z, [2.5, 18, 103], [5, 3, 4], { lines: ['nar_stone_1', 'nar_stone_2', 'nar_stone_3', 'nar_stone_4'], arms: 'exit_rim', endAfterSeconds: 25, endBranch: 'leave', once: true, note: 'the ONLY thing that arms the ending (GDD 9.8). Lead ruling R5: the 25 s count only while she is more than 4 m from the stone after nar_stone_4 has been heard; coming back starts them again' });
  mk('vista_fire', Z, 'vista', [10, 18, 102], { subject: 'one small fire on the plain along the pylon line', target: V(40, -10, -420), minPixels: 4, kindles: 'when the ending starts', caption: 'cap_fire_kindles' }, FACE.n);
  mk('exit_rim', Z, 'exit', [18, 18, 101.2], { ends: 'stage', card: 'card_end', requires: 'trg_stone', armedWhen: 'trg_stone has fired AND its four lines have finished (or 25 s, whichever is first)',
    endsWhen: ['ia_stone_round taken (take branch)', 'trg_stone + 25 s (leave branch)', 'this strip entered AFTER trg_stone has fired (leave branch)', 'cp_rim + 150 s (leave branch, fail-safe)'],
    lines: ['nar_fire', 'nar_last'], note: 'before trg_stone has fired the north edge is only a view: walking into this strip does nothing' }, 0, [20, 3, 1.6]);
}

// ================================================================ ENCOUNTERS
encounters.push(
  { id: 'enc_street', zone: 'plenty_street', trigger: 'trg_enc_street', maxAlive: 5, composition: { bider: 8 }, locksDoors: [],
    waves: [
      { id: 'A', spawns: ['sp_street_kneeler'], delay: 3, when: 'trigger; the kneeler finishes its scoop and sets the cup down' },
      { id: 'B', spawns: ['sp_street_alley_n', 'sp_street_alley_s', 'sp_street_alley_n2', 'sp_street_alley_s2'], delay: 0, when: 'A down, or 3 s after A is hit, or 8 s after A rises: four out of the two alley mouths nearest the gate, beside and behind her' },
      { id: 'C', spawns: ['sp_street_saddlery_1', 'sp_street_saddlery_2'], delay: 0, when: 'B down to 2, or 2 s after B: the file of two arrives while the alleys are still up', lane: 'lane_street' },
      { id: 'D', spawns: ['sp_street_gate'], delay: 2, when: 'C down; two seconds of nothing, then the yard gate bursts' },
    ], onClear: { checkpoint: 'cp_street_clear', lines: ['nar_street_after'], objective: 'obj_yard_door' } },
  { id: 'enc_yard', zone: 'plenty_street', trigger: 'knot_yard_latch', maxAlive: 4, composition: { transit: 3, bider: 4 }, locksDoors: ['door_tally'],
    waves: [
      { id: 'A', spawns: ['sp_yard_t1'], delay: 4, when: 'after the bell vignette' },
      { id: 'B', spawns: ['sp_yard_t2', 'sp_yard_t3'], delay: 0, when: 'T1 dead, or 14 s' },
      { id: 'B2', spawns: ['sp_yard_grate_1', 'sp_yard_grate_2'], delay: 2, when: 'B + 2 s: the grate Biders climb out while the Transits are still planting' },
      { id: 'B3', spawns: ['sp_yard_alley_1', 'sp_yard_alley_2'], delay: 10, when: 'B + 10 s and at most 3 alive', opensDoor: 'door_alley' },
    ], onClear: { checkpoint: 'cp_yard_clear', objective: 'obj_tally', then: 'trg_dowser', door: 'door_tally stays shut until the sighting is over (trg_dowser.doorOpensWhen)' } },
  { id: 'enc_tally', zone: 'tally_house', trigger: 'knot_hatch_latch', maxAlive: 2, composition: { bider: 2 }, locksDoors: ['door_tally', 'ia_hatch'],
    waves: [{ id: 'A', spawns: ['sp_tally_riser_w', 'sp_tally_riser_e'], delay: 0.8, when: 'the knot bursts: the hatch parts to ajar (impassable); cap_chairs plays 0.8 s before movement' }],
    onClear: { checkpoint: 'cp_tally_hatch', lines: ['nar_nine'], opens: 'ia_hatch', opensWithinSeconds: 1.5 } },
  { id: 'enc_file', zone: 'the_gallery', trigger: 'ia_baffle', maxAlive: 6, composition: { bider: 12 }, locksDoors: ['door_gallery_far'],
    waves: [
      { id: 'A', spawns: ['sp_file_1', 'sp_file_2', 'sp_file_3', 'sp_file_4', 'sp_file_5', 'sp_file_6'], delay: 3, when: 'the baffle grinds open over 3 s; turn_about 1.5 s', lane: 'lane_gallery' },
      { id: 'R', spawns: ['sp_file_10', 'sp_file_11'], delay: 0, when: 'the rear pair (polish round 5, R3 / R10): once wave A is down to one, when she comes within 16 m of door_gallery_far (or 25 s after the file was down to one), two who did not queue start down flight 3 of the peg stair behind her and run the length of the gallery after her; nar_file_behind names them (src/world/director.ts WAVE_RULES enc_file/R, FILE_NEAR_REAR)', lines: ['nar_file_behind'], laneFollowing: false },
      { id: 'B', spawns: ['sp_file_7', 'sp_file_8', 'sp_file_9', 'sp_file_12'], delay: 4, when: 'the ambush at the far door (polish round 4; four, and timed from the rear pair, since round 5): FILE_REAR (4 s) after the rear pair start, the four are spawned behind the shut door_gallery_far; nar_file_more, a bang on the door, and it bursts open FILE_BURST (1 s) later, so both ends of the walkway reach her within about two seconds. With the file still standing neither wave comes (src/world/director.ts WAVE_RULES enc_file/B)', afterWaveDownSeconds: 4, orAtSeconds: 25, notRead: 'afterWaveDownSeconds and orAtSeconds are no longer read for this wave', opensDoor: 'door_gallery_far', doorStaysOpen: true, lines: ['nar_file_more'], laneFollowing: false, lateralOffsets: [-1, 0, 1, -0.4], depthStagger: 1.2 },
    ],
    onClear: { checkpoint: 'cp_file_clear', clearRule: 'all twelve down' } },
  { id: 'enc_matador', zone: 'lift_hall', trigger: 'trg_enc_matador', maxAlive: 3, composition: { tamper: 1, bider: 4 }, locksDoors: ['door_gallery_far', 'door_lift_cage'],
    waves: [
      { id: 'A', spawns: ['sp_hall_tamper'], delay: 0, when: 'trigger' },
      { id: 'B', spawns: ['sp_hall_grate_1', 'sp_hall_grate_2'], delay: 0, atSeconds: 15, cancelledIf: 'the Tamper is dead at t = 15 s', when: 't = 15 s on the encounter clock; never on the Tamper\'s health' },
      { id: 'C', spawns: ['sp_hall_grate_3', 'sp_hall_grate_4'], delay: 0, atSeconds: 35, cancelledIf: 'the Tamper is dead at t = 35 s', when: 't = 35 s on the encounter clock' },
    ], onClear: { checkpoint: 'cp_hall_clear', lines: ['nar_tamper_dead'], objective: 'obj_lift', clearRule: 'the Tamper is dead and every Bider already spawned is down; a cancelled wave does not hold the encounter open' } },
  { id: 'enc_windlass', zone: 'the_bore', trigger: 'trg_enc_windlass', maxAlive: 4, composition: { windlass: 1, bider: 'adds: 6 in phase 2, up to 9 in phase 3a' }, locksDoors: ['door_bore', 'door_proving_lift'],
    waves: [
      { id: 'boss', spawns: ['sp_windlass'], delay: 0, when: 'door crossed' },
      { id: 'adds', spawns: ['sp_bore_grate_1', 'sp_bore_grate_2', 'sp_bore_grate_3'], delay: 0, when: 'phase 2: 2 per haul, cap 3 alive; phase 3a: one every 8 s', repeating: true,
        pick: 'the grate FARTHEST from the player at spawn time (never the nearest)', minPlayerDistance: 7, ifTooClose: 'hold the spawn and retry each second', note: 'the 12 m rule cannot hold at the kerb foot of a 30 m room: the farthest grate is 7.4 m away at worst and over 10 m for a player on the outer ring; emergence is the full 1.5 s and shootable' },
    ], onClear: { lines: ['stn_service', 'stn_thanks'], objective: 'obj_proving_lift', note: 'no checkpoint here: cp_boss_proven commits when the kept round is fired (GDD 18)' } },
);

// ================================================================ NAV GRAPH
const world = new World(solids);
const nodes = [];
const ABBR = { the_lip: 'lip', plenty_street: 'st', tally_house: 'ty', the_gallery: 'gl', lift_hall: 'lh', the_bore: 'bo', far_rim: 'rim' };
const counters = {};
function addNode(zone, x, z, yRef, opts = {}) {
  const g = world.ground(x, z, yRef, 0.6);
  if (!g) { if (opts.must) throw new Error(`nav node has no floor at ${x},${z} (${zone})`); return null; }
  const clear = opts.clear ?? 0.45;
  const bl = world.blocker(x, z, g.y, clear);
  if (bl) { if (opts.must) throw new Error(`nav node at ${x},${z} (${zone}) is inside/too near ${bl.id}`); return null; }
  for (const n of nodes) if (Math.hypot(n.pos[0] - x, n.pos[2] - z) < 1.2 && Math.abs(n.pos[1] - g.y) < 1) { if (opts.tags) n.tags = [...(n.tags || []), ...opts.tags]; if (opts.id) { ids.delete(n.id); n.id = uid(opts.id); } return n; }
  counters[zone] = (counters[zone] || 0) + 1;
  const n = { id: opts.id || `n_${ABBR[zone]}_${String(counters[zone]).padStart(3, '0')}`, zone, pos: V(x, g.y, z) };
  if (opts.tags) n.tags = opts.tags;
  if (opts.sets) n.sets = opts.sets;
  n._clear = clear; n._max = opts.maxLink ?? 6.2;
  nodes.push(n); uid(n.id);
  return n;
}
function grid(zone, x0, x1, z0, z1, step, yRef, opts = {}) {
  const sx = opts.stepX ?? step, sz = opts.stepZ ?? step;
  for (let x = x0; x <= x1 + 1e-6; x += sx) for (let z = z0; z <= z1 + 1e-6; z += sz) addNode(zone, x, z, typeof yRef === 'function' ? yRef(x, z) : yRef, opts);
}
const M = (x, z, y, zone, opts = {}) => addNode(zone, x, z, y, { must: true, ...opts });

// lip (no enemies: sparse)
M(16, 107.5, 14, 'the_lip'); M(14, 103, 14, 'the_lip'); M(14, 98, 14, 'the_lip'); M(14, 94, 14, 'the_lip');
const lipY = (x, z) => (z > 93 ? 14 : z > 78 ? 11.5 + ((z - 78) / 15) * 2.5 : z > 54 ? 7.5 + ((z - 54) / 24) * 4 : z > 30 ? 3 + ((z - 30) / 24) * 4.5 : z > 9 ? ((z - 9) / 21) * 3 : 0);
grid('the_lip', 10, 18, 80.5, 90.5, 5, lipY, { stepX: 4 });
grid('the_lip', 13, 25, 56.5, 76.5, 5, lipY, { stepX: 4 });
grid('the_lip', 8, 18, 32.5, 52.5, 5, lipY, { stepX: 5 });
grid('the_lip', 5, 19, 11.5, 27.5, 5.3, lipY, { stepX: 4.6 });
grid('the_lip', 4.5, 19.5, -4.5, 6, 3.5, 0, { stepX: 5 });
M(3.6, 0, 0, 'the_lip'); M(1, 0, 0, 'the_lip');
// street
M(-2, 0, 0, 'plenty_street');
grid('plenty_street', -70, -6, -5.4, 5.4, 3.6, 0, { stepX: 4 });
grid('plenty_street', -70, -2, -13.5, -13.5, 4, 0);
grid('plenty_street', -70, -2, 13.5, 13.5, 4, 0);
for (const x of [-14.5, -45.5, -61.5]) { M(x, -9.5, 0, 'plenty_street'); M(x, -13.5, 0, 'plenty_street'); }
for (const x of [-21.5, -39.5, -57.5]) { M(x, 9.5, 0, 'plenty_street'); M(x, 13.5, 0, 'plenty_street'); }
M(-66.2, 8.2, 0, 'plenty_street'); M(-66.2, 10.6, 0, 'plenty_street');
M(-73.5, 0, 0, 'plenty_street'); grid('plenty_street', -77, -77, -3, 3, 3, 0); M(-79.5, 0, 0, 'plenty_street');
M(-76.5, -13.5, 0, 'plenty_street'); M(-79.5, -13, 0, 'plenty_street'); M(-73.5, -13.5, 0, 'plenty_street');
// yard
grid('plenty_street', -108, -82, -12, 12, 4, 0, { stepX: 3.7 });
M(-96.2, -3, 0, 'plenty_street', { tags: ['transit_door'] });
M(-96.5, 9, 0, 'plenty_street'); M(-91.5, 9, 1.75, 'plenty_street'); M(-88.5, 9, 3.5, 'plenty_street');
M(-87.5, 9.2, 3.5, 'plenty_street'); M(-87.5, 5.6, 3.5, 'plenty_street', { id: 'fp_yard_catwalk', tags: ['firing_point', 'problem_position'] });
M(-85.5, 9.5, 3.5, 'plenty_street', { tags: ['firing_point'] }); M(-83.5, 9.4, 3.5, 'plenty_street'); M(-83.5, 5.6, 3.5, 'plenty_street'); M(-85.5, 5.5, 3.5, 'plenty_street');
M(-107.5, -11.5, 0, 'plenty_street', { id: 'fp_yard_far_wall', tags: ['firing_point'] });
for (const [x, z, id] of [[-104.5, 0.5, 'fp_yard_drum_w'], [-95, -10.5, 'fp_yard_stub_n'], [-99.5, 10.5, 'fp_yard_south'], [-84.5, -11.8, 'fp_yard_ne'], [-107.5, 8.5, 'fp_yard_sw']]) M(x, z, 0, 'plenty_street', { id, tags: ['firing_point'] });
M(-89, -14.5, 0, 'plenty_street');
// tally
grid('tally_house', -94.5, -91.9, -35.5, -16.5, 3.8, 0, { stepX: 2.6 });
grid('tally_house', -86.6, -83.6, -35.5, -16.5, 3.8, 0, { stepX: 3.0 });
M(-92.6, -36.1, 0, 'tally_house', { tags: ['knot_stand'] }); M(-89, -16.6, 0, 'tally_house'); M(-89, -36, 0, 'tally_house'); M(-89, -30.8, 0, 'tally_house'); M(-94.5, -33, 0, 'tally_house'); M(-88.1, -33, 0, 'tally_house');
// gallery: stair, bay, walkway
for (const [x, y] of [[-92.5, 0], [-90, -2], [-86, -4]]) M(x, -33, y, 'the_gallery', { tags: ['seam'], sets: SEAM.sets }); M(-86, -29, -6, 'the_gallery'); M(-86, -25, -8, 'the_gallery'); M(-86, -21, -10, 'the_gallery'); M(-86, -17, -12, 'the_gallery');
grid('the_gallery', -89.5, -82.5, -16.5, -12, 2.25, -12, { stepX: 3.5 });
grid('the_gallery', -79, -21, -14, -14, 4, -12, { stepX: 4 });
M(-59, -14, -12, 'the_gallery'); M(-18.5, -14, -12, 'the_gallery');
// lift hall
M(-16.5, -14, -12, 'lift_hall'); M(-14.5, -17, -12, 'lift_hall'); M(-14.5, -11, -12, 'lift_hall'); M(-16.5, -10, -12, 'lift_hall'); M(-16.5, -6, -13.5, 'lift_hall'); M(-16.5, -2, -15, 'lift_hall');
grid('lift_hall', -12, 18, -26, -2, 4, -15, { stepX: 3, clear: 1.0, maxLink: 5.2 });
M(22, -14, -15, 'lift_hall'); M(24.5, -14, -15, 'lift_hall', { id: 'n_lh_cage' });
M(6, 0.5, -15, 'lift_hall'); M(6, 3.5, -15, 'lift_hall'); M(3.5, 5, -15, 'lift_hall');
// bore
M(2, 83, -36, 'the_bore', { id: 'n_bo_arrival' });
for (const x of [5.5, 9.5, 14, 18.5, 22.5]) M(x, 83, -36, 'the_bore');
M(27, 83, -36, 'the_bore'); M(27, 79, -38, 'the_bore'); M(27, 75, -40, 'the_bore'); M(23, 75, -42, 'the_bore'); M(19.5, 75, -44, 'the_bore');
grid('the_bore', 11, 17, 68, 78, 3.3, -44, { stepX: 3 });
M(14, 80.5, -44, 'the_bore'); M(14, 83.5, -44, 'the_bore');
for (let b = 0; b < 360; b += 30) { const [x, z] = polar(b, 5.8); M(x, z, -44, 'the_bore', { tags: b % 60 === 0 ? ['bay_inner'] : ['rib_inner'] }); }
for (let b = 0; b < 360; b += 60) { const [x, z] = polar(b, 9); M(x, z, -44, 'the_bore', { tags: ['bay_mid'] }); }
for (let b = 0; b < 360; b += 15) { const [x, z] = polar(b, 12.7); M(x, z, -44, 'the_bore', { tags: b % 60 === 30 ? ['rib_shelter'] : undefined }); }
M(14, 111.5, -44, 'the_bore'); M(14, 114, -44, 'the_bore', { id: 'n_bo_plift' });
// rim
M(14, 114, 18, 'far_rim', { id: 'n_rim_cage' }); M(14, 110, 18, 'far_rim');
grid('far_rim', 2, 26, 103, 109, 3, 18, { stepX: 4 });

// auto-link: every pair closer than the link limit whose straight walk is clear
const links = [];
for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
  const a = nodes[i], b = nodes[j];
  const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
  if (d > Math.min(a._max, b._max) || Math.abs(a.pos[1] - b.pos[1]) > 4.5) continue;
  const r = Math.min(a._clear, b._clear);
  if (world.walk(a.pos, b.pos, r) === null && world.walk(b.pos, a.pos, r) === null) links.push([a.id, b.id]);
}
// prune grid nodes the walk test left stranded (reported, never silent)
{
  const nb = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of links) { nb.get(a).push(b); nb.get(b).push(a); }
  for (const [a, b] of [['n_lh_cage', 'n_bo_arrival'], ['n_bo_plift', 'n_rim_cage']]) { nb.get(a).push(b); nb.get(b).push(a); }
  const seen = new Set([nodes[0].id]), q = [nodes[0].id];
  while (q.length) for (const v of nb.get(q.shift())) if (!seen.has(v)) { seen.add(v); q.push(v); }
  const lost = nodes.filter((n) => !seen.has(n.id));
  if (lost.length) console.warn(`pruned ${lost.length} stranded nav node(s): ${lost.map((n) => `${n.id} (${n.pos})`).join('; ')}`);
  if (lost.length > 6) throw new Error('too many stranded nav nodes: fix the grid');
  for (const n of lost) nodes.splice(nodes.indexOf(n), 1);
  for (let i = links.length - 1; i >= 0; i--) if (!seen.has(links[i][0]) || !seen.has(links[i][1])) links.splice(i, 1);
}
// doors crossed by links (AI must treat these links as shut while the door is shut)
const gates = [];
const doorMarkers = markers.filter((m) => m.type === 'door');
for (const [ia, ib] of links) {
  const a = nodes.find((n) => n.id === ia), b = nodes.find((n) => n.id === ib);
  for (const d of doorMarkers) {
    const horizontal = d.params.kind === 'hatch';
    const hw = (horizontal ? d.size[0] : d.size[0]) / 2, ht = horizontal ? d.size[2] / 2 : 0.75;
    let hit = false;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = a.pos[0] + (b.pos[0] - a.pos[0]) * t, z = a.pos[2] + (b.pos[2] - a.pos[2]) * t, y = a.pos[1] + (b.pos[1] - a.pos[1]) * t;
      const [lx, lz] = (() => { const dx = x - d.pos[0], dz = z - d.pos[2], rr = rad(d.rotY), c = Math.cos(rr), s = Math.sin(rr); return [dx * c - dz * s, dx * s + dz * c]; })();
      if (Math.abs(lx) <= hw && Math.abs(lz) <= ht && y > d.pos[1] - 1.5 && y < d.pos[1] + d.size[1] + 0.5) { hit = true; break; }
    }
    if (hit) gates.push({ link: [ia, ib], door: d.id });
  }
}
// Each ride is a rigid teleport between two identical cages: p' = to + R(yawDeg) * (p - from), yaw' = yaw + yawDeg.
// from / to are the cage floor centres (the lift_* markers).
const portals = [
  { id: 'ride_lift_hall', from: 'n_lh_cage', to: 'n_bo_arrival', via: 'ia_lift_lever', cages: ['lift_depart_hall', 'lift_arrival_bore'], cageInterior: [CAGE.w, CAGE.h, CAGE.d],
    transform: { from: CAGE.hall, to: CAGE.bore, yawDeg: 180 }, ride: 'lift down, 25 s dark ride (the cage does not move in world space: teleport). The arrival cage is the departure cage turned 180 degrees about its centre, so the gate she came in by on the west opens on the east' },
  { id: 'ride_proving_lift', from: 'n_bo_plift', to: 'n_rim_cage', via: 'ia_proving_lift', cages: ['lift_depart_bore', 'lift_arrival_rim'], cageInterior: [PCAGE.w, PCAGE.h, PCAGE.d],
    transform: { from: PCAGE.bore, to: PCAGE.rim, yawDeg: 0 }, ride: 'proving lift up, dark ride of at least 12 s (ia_proving_lift.params.ride.seconds) that also waits for the coda set to be built; underground -> coda resident-set swap' },
];

// critical path: ordered waypoints -> shortest route on the graph
const nearest = (p) => { let best = null, bd = 1e9; for (const n of nodes) { const d = Math.hypot(n.pos[0] - p[0], n.pos[2] - p[2]) + 3 * Math.abs(n.pos[1] - p[1]); if (d < bd) { bd = d; best = n; } } return best; };
const adj = new Map(nodes.map((n) => [n.id, []]));
const byId = new Map(nodes.map((n) => [n.id, n]));
for (const [a, b] of links) { const d = Math.hypot(...[0, 1, 2].map((i) => byId.get(a).pos[i] - byId.get(b).pos[i])); adj.get(a).push([b, d]); adj.get(b).push([a, d]); }
for (const p of portals) { adj.get(p.from).push([p.to, 0.1]); adj.get(p.to).push([p.from, 0.1]); }
function route(a, b) {
  const dist = new Map([[a, 0]]), prev = new Map(), open = new Set([a]);
  while (open.size) {
    let u = null; for (const k of open) if (u === null || dist.get(k) < dist.get(u)) u = k;
    open.delete(u); if (u === b) break;
    for (const [v, w] of adj.get(u)) { const nd = dist.get(u) + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); open.add(v); } }
  }
  if (!dist.has(b)) {
    const inside = [...dist.keys()], cand = [];
    for (const i of inside) for (const n of nodes) if (!dist.has(n.id)) { const p = byId.get(i).pos, d = Math.hypot(p[0] - n.pos[0], p[2] - n.pos[2]); if (d < 9 && Math.abs(p[1] - n.pos[1]) < 3) cand.push([d, i, n.id]); }
    cand.sort((p, q) => p[0] - q[0]);
    for (const [d, i, j] of cand.slice(0, 6)) console.error(`  ${i} ${byId.get(i).pos} -> ${j} ${byId.get(j).pos} (${d.toFixed(1)} m): ${world.walk(byId.get(i).pos, byId.get(j).pos, 0.45) || world.walk(byId.get(j).pos, byId.get(i).pos, 0.45) || 'too far for the link limit'}`);
    throw new Error(`critical path: no route ${a} -> ${b}`);
  }
  const out = [b]; while (out[0] !== a) out.unshift(prev.get(out[0])); return out;
}
const waypointIds = ['player_start', 'trg_glare', 'cp_lip_gate', 'trg_enc_street', 'sp_street_kneeler', 'cp_street_clear', 'ia_yard_door', 'ia_yard_bell', 'cp_yard_clear', 'cp_tally_enter', 'rd_ledger', 'knot_hatch_latch', 'cp_tally_hatch', 'trg_hatch_close', 'trg_set_swap', 'cp_gallery_bay', 'pz_proving_mark', 'ia_baffle', 'cp_file_clear', 'cp_hall_gantry', 'trg_enc_matador', 'cp_hall_clear', 'lift_depart_hall', 'lift_arrival_bore', 'trg_windlass_seen', 'cp_bore_ante', 'door_bore', 'cp_boss_p1', 'ia_proving_mark_1', 'lift_depart_bore', 'lift_arrival_rim', 'trg_stone', 'exit_rim'];
const mById = new Map(markers.map((m) => [m.id, m]));
let criticalPath = [];
for (let i = 0; i < waypointIds.length - 1; i++) {
  const a = nearest(mById.get(waypointIds[i]).pos).id, b = nearest(mById.get(waypointIds[i + 1]).pos).id;
  const seg = route(a, b);
  criticalPath = criticalPath.concat(criticalPath.length ? seg.slice(1) : seg);
}
let criticalLength = 0;
for (let i = 0; i < criticalPath.length - 1; i++) { const a = byId.get(criticalPath[i]).pos, b = byId.get(criticalPath[i + 1]).pos; const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < 30) criticalLength += d; }

// ================================================================ OUTPUT
const layout = {
  meta: {
    units: 'm', space: 'three (+Y up)', version: 2,
    title: 'KEEP SEVEN — First Tally: Plenty', generator: 'tools/gen_layout.mjs', source: 'docs/GDD.md',
    compass: { north: '-Z', east: '+X', south: '+Z', west: '-X' },
    sun: { ...SUN, toSun: SUN_TRAVEL.map((v) => r2(-v)), travel: SUN_TRAVEL.map(r2) },
    player: { radius: 0.35, height: 1.8, eye: 1.65, stepUp: 0.35, maxSlopeDeg: 45, jumpApex: 1.0 },
    conventions: {
      rotY: 'degrees about +Y, three.js sense: 0 faces -Z (north), 90 faces -X (west), 180 faces +Z, -90 faces +X',
      box: 'pos = centre, size = full extents [x,y,z], rotated by rotY',
      ramp: 'box footprint; top surface rises from pos.y - size.y/2 at the low edge to pos.y + size.y/2 at the high edge along local `rise` (+x|-x|+z|-z points uphill); solid beneath down to pos.y - size.y/2 - skirt',
      cylinder: 'pos = centre, size = [diameter, height, diameter]; innerRadius makes a tube or annulus',
      heightfield: 'reserved; not used in version 1 (the gully is wedge ramps; the art pass sculpts terrain over them)',
      markerPos: 'centre of the bottom face for volumes, floor-standing things and doors; the anchor point for wall-mounted and hanging things',
      markerSize: 'volumes: [x,y,z] extents before rotY; doors: [width, height, thickness] with local X = width, pos at the centre of the thickness; hatch (params.kind = hatch): [x, thickness, z]',
      solidFlags: { pierce: 'line rounds pass through (GDD 19.1)', dynamic: 'collider is off until enabledBy fires', grille: 'see-through; shots clank and skip', invisible: 'collision only, not drawn', playerOnly: 'collides with bodies only: shots, sight and aim tests pass through', low: 'cover below 2 m: does not hide a standing player', seam: 'see conventions.seam', dress: 'free-text dressing hint for the art pass (not an asset binding)' },
      seam: 'A solid, marker or nav node carrying `sets: [..]` is resident in EVERY listed set instead of only its zone\'s set. Used once: peg-stair flight 1, landing 1 and the shaft walls round them (flag `seam`), which are walked while surface is resident and stay when it unloads. Colliders, greybox and bake must include them in both sets.',
      zonePriority: 'zones carry `priority` (interior 10, exterior 0). zoneAt(x,y,z,set): of the zones of that set whose bounds contain the point, the highest priority wins. tally_house therefore wins the 2 m strip it shares with plenty_street, and its bounds reach down to y -5.5 so the seam is tally_house until trg_set_swap, the_gallery after.',
      storyKeys: 'a nar_/stn_/rv_/hint_ key is played from exactly one place (params lines / line / thenLine / parley / hints, or an encounter wave or onClear). pointerLine and alsoPlaysWhen name a second, conditional use of a line that is once-only. Each obj_* key is set by exactly one marker or encounter (GDD 12.2).',
      portals: 'nav.portals[].transform is the rigid teleport of a ride: p\' = to + R(yawDeg) * (p - from), yaw\' = yaw + yawDeg, about +Y. The two cages of a ride have identical interiors.',
      triggerKinds: { lane: 'Biders follow in file (GDD 19.2)', kill: 'kill volume', bay: 'boss arm index sector' },
      surfaces: { sand: 'm_sand', adobe: 'm_frontier', wood: 'm_frontier', stone: 'm_frontier (strata)', ceramic: 'm_pellam', metal: 'm_pellam (steel)', cloth: 'm_frontier' },
      moods: 'docs/ART_BIBLE.md section 3: L0 overhang/glare, L1 Long Light, L2 Tally House, L3 stair and gallery, L4 lift hall, L5 bore, L6 blue hour',
      residentSets: 'zones carry `set` (surface | underground | coda). Sets are never resident together, so zone bounds of different sets may overlap in world space (the_lip / far_rim).',
      nav: 'nodes sit on the floor (y = floor height). links are undirected straight walks, verified clear for a 0.45 m radius body (1.0 m in lift_hall, for the Tamper). nav.gates lists links that cross a door marker. nav.portals are the two lift rides (teleports). Node tags: firing_point (Transit), problem_position, bay_inner / bay_mid / rib_shelter (bore), seam (peg-stair flight 1 and landing 1), knot_stand (where knot_hatch_latch is shot from).',
    },
  },
  zones, solids, markers,
  nav: { nodes: nodes.map(({ _clear, _max, alias, ...n }) => n), links, gates, portals, criticalPath, criticalPathLength: r2(criticalLength) },
  encounters,
};
const out = path.join(ROOT, 'design/layout.json');
fs.writeFileSync(out, JSON.stringify(layout, null, 1).replace(/\[\n\s+(-?[\d.e-]+),\n\s+(-?[\d.e-]+),\n\s+(-?[\d.e-]+)\n\s+\]/g, '[$1, $2, $3]').replace(/\[\n\s+"([^"]+)",\n\s+"([^"]+)"\n\s+\]/g, '["$1", "$2"]') + '\n');
console.log(`wrote ${path.relative(ROOT, out)}: ${zones.length} zones, ${solids.length} solids, ${markers.length} markers, ${nodes.length} nav nodes, ${links.length} links, ${gates.length} gated links, critical path ${criticalLength.toFixed(0)} m over ${criticalPath.length} nodes`);
