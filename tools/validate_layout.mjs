#!/usr/bin/env node
// Validates design/layout.json. Exits non-zero on any failure.
//   node tools/validate_layout.mjs [path/to/layout.json] [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, aabb, topAt, bottomOf, topMax, inBounds, rad, WALKABLE } from './layout_geom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const file = args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'design/layout.json');
const L = JSON.parse(fs.readFileSync(file, 'utf8'));
const story = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/story.json'), 'utf8'));

const errors = [], warnings = [], info = [];
let currentCheck = '';
const checks = [];
const err = (m) => errors.push(`[${currentCheck}] ${m}`);
const warn = (m) => warnings.push(`[${currentCheck}] ${m}`);
function check(name, fn) {
  currentCheck = name; const before = errors.length;
  try { fn(); } catch (e) { err('validator crashed: ' + e.stack); }
  checks.push({ name, ok: errors.length === before, n: errors.length - before });
}

// ---------------------------------------------------------------- constants from the GDD
const PLAYER = { radius: 0.35, height: 1.8 };
const DOOR_MIN = { w: 1.2, h: 2.2 };
const SCOPE = { maxX: 300, maxZ: 300 }; // GDD 9: the whole stage fits inside 300 x 300 m
const SHAPES = ['box', 'ramp', 'cylinder', 'heightfield'];
const ROLES = ['floor', 'wall', 'ceiling', 'cover', 'platform', 'stairs', 'terrain', 'blocker'];
const MTYPES = ['player_start', 'checkpoint', 'enemy_spawn', 'pickup', 'interactable', 'door', 'puzzle_element', 'trigger', 'readable', 'prop', 'vista', 'light', 'exit'];
const SURFACES = ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth'];
const ZONES = ['the_lip', 'plenty_street', 'tally_house', 'the_gallery', 'lift_hall', 'the_bore', 'far_rim'];
const ENEMIES = ['bider', 'transit', 'tamper', 'windlass'];
const PUZZLES = ['seven_jugs', 'daylight', 'proving_line', 'the_asking'];
const GENERIC = new Set(['ia_ammo_box', 'pk_rounds_6', 'pk_rounds_12', 'pk_canteen']);
const range = (p, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${p}${a + i}`);
// every id GDD section 14 / 18 / 10 / 13 names that must exist as a marker (or encounter)
const REQUIRED_MARKERS = [
  'ia_line_locker_bay', 'ia_line_locker_hall', 'ia_line_locker_secret', 'ia_line_locker_bore',
  ...range('ia_jug_', 1, 7), 'knot_yard_latch', 'ia_yard_door', 'ia_yard_bell',
  'ia_latch_s', 'ia_latch_m', 'ia_latch_n', 'shutter_s', 'shutter_m', 'shutter_n', 'ia_cloth_cord',
  'knot_hatch_latch', 'ia_hatch', ...range('ia_range_plate_', 1, 3), 'knot_a', 'knot_b', 'knot_c', 'ia_baffle',
  'knot_cold_bay', 'ia_lift_lever', ...range('ia_ask_port_', 1, 8), 'ia_cradle', ...range('ia_proving_mark_', 1, 6),
  'ia_proving_lift', 'ia_stone_round', 'sec_loft_bell_rope', 'sec_loft_bell', 'sec_cold_bay',
  'rd_note_lip', 'rd_rain_tally', 'rd_ledger', 'rd_note_hearth', 'rd_plate_line', 'rd_plate_proving', 'rd_plate_service', 'rd_note_cradle', 'rd_note_stone',
  'cp_lip_start', 'cp_lip_gate', 'cp_street_clear', 'cp_yard_clear', 'cp_tally_enter', 'cp_tally_hatch', 'cp_gallery_bay', 'cp_gallery_baffle', 'cp_file_clear',
  'cp_hall_gantry', 'cp_hall_clear', 'cp_bore_ante', 'cp_boss_p1', 'cp_boss_p2', 'cp_boss_p3', 'cp_boss_proven', 'cp_rim',
];
const REQUIRED_ENCOUNTERS = { enc_street: { bider: 8 }, enc_yard: { transit: 3, bider: 4 }, enc_tally: { bider: 2 }, enc_file: { bider: 9 }, enc_matador: { tamper: 1, bider: 4 }, enc_windlass: { windlass: 1 } };
// GDD section 14 "Fixed placements": zone -> generic id -> minimum count (secret items included)
const FIXED = {
  the_lip: { pk_rounds_12: 1, pk_rounds_6: 1, ia_ammo_box: 1 },
  plenty_street: { pk_rounds_6: 2, pk_canteen: 2, pk_rounds_12: 2 },
  tally_house: { ia_ammo_box: 1, pk_rounds_12: 1, pk_canteen: 1 },
  the_gallery: { ia_ammo_box: 1, pk_canteen: 1 },
  lift_hall: { pk_rounds_12: 3, pk_canteen: 2 },
  the_bore: { pk_rounds_12: 1, pk_canteen: 2, ia_ammo_box: 3 },
};
const STORY_KEY = /^(nar|stn|rv|hint|cap|card|rd|obj|ui)_[a-z0-9_]+$/;
const ID_REF = /^(ia|knot|sp|cp|trg|door|fp|shutter|lift|pz|lane|sec|n|pk|prop|bay)_[a-z0-9_]+$/;
const SETS = ['surface', 'underground', 'coda'];
const EYE = 1.65, JUMP_APEX = 1.0;

const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const zoneById = new Map((L.zones || []).map((z) => [z.id, z]));
const markerById = new Map((L.markers || []).map((m) => [m.id, m]));
const solidById = new Map((L.solids || []).map((s) => [s.id, s]));
const nodeById = new Map(((L.nav || {}).nodes || []).map((n) => [n.id, n]));
const fmt = (p) => `(${p.map((v) => v.toFixed(2)).join(', ')})`;
function deepStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => deepStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => deepStrings(x, out));
  return out;
}

// ================================================================ 1. schema
check('schema', () => {
  if (!L.meta || L.meta.units !== 'm' || !/three/.test(L.meta.space || '') || typeof L.meta.version !== 'number') err('meta must be { units: "m", space: "three (+Y up)", version: <number> }');
  for (const k of ['zones', 'solids', 'markers', 'encounters']) if (!Array.isArray(L[k]) || !L[k].length) err(`${k} must be a non-empty array`);
  if (!L.nav || !Array.isArray(L.nav.nodes) || !Array.isArray(L.nav.links)) err('nav must have nodes[] and links[]');
  for (const z of L.zones || []) {
    if (typeof z.id !== 'string' || typeof z.name !== 'string') err(`zone ${z.id}: id and name required`);
    if (!['exterior', 'interior'].includes(z.kind)) err(`zone ${z.id}: kind must be exterior|interior`);
    if (!z.bounds || !isVec(z.bounds.min) || !isVec(z.bounds.max)) err(`zone ${z.id}: bounds {min,max} required`);
    else for (let i = 0; i < 3; i++) if (z.bounds.max[i] <= z.bounds.min[i]) err(`zone ${z.id}: bounds are inverted on axis ${i}`);
    if (typeof z.mood !== 'string' || !/^L[0-6]$/.test(z.mood)) err(`zone ${z.id}: mood must be an ART_BIBLE mood key L0..L6`);
    if (!Array.isArray(z.neighbors)) err(`zone ${z.id}: neighbors[] required`);
    if (!SETS.includes(z.set)) err(`zone ${z.id}: set must be surface|underground|coda`);
    if (typeof z.priority !== 'number') err(`zone ${z.id}: priority (number) required: the higher priority wins zoneAt where same-set zones overlap`);
  }
  for (const id of ZONES) if (!zoneById.has(id)) err(`missing GDD zone ${id}`);
  for (const s of L.solids || []) {
    const w = `solid ${s.id}`;
    if (typeof s.id !== 'string') err(`${w}: id required`);
    if (!SHAPES.includes(s.shape)) err(`${w}: bad shape ${s.shape}`);
    if (!ROLES.includes(s.role)) err(`${w}: bad role ${s.role}`);
    if (!SURFACES.includes(s.surface)) err(`${w}: bad surface ${s.surface}`);
    if (!isVec(s.pos) || !isVec(s.size)) err(`${w}: pos and size must be [x,y,z]`);
    else if (s.size.some((v) => v <= 0)) err(`${w}: size must be positive`);
    if (typeof s.rotY !== 'number') err(`${w}: rotY (deg) required`);
    if (!zoneById.has(s.zone)) err(`${w}: unknown zone ${s.zone}`);
    if (s.shape === 'ramp') {
      if (!['+x', '-x', '+z', '-z'].includes(s.rise)) err(`${w}: ramp needs rise (+x|-x|+z|-z)`);
      else if (isVec(s.size)) {
        const run = s.rise.endsWith('x') ? s.size[0] : s.size[2];
        const deg = (Math.atan2(s.size[1], run) * 180) / Math.PI;
        if (deg > 45.01) err(`${w}: slope ${deg.toFixed(1)} deg exceeds the 45 deg walkable limit`);
      }
    }
    if (s.shape === 'cylinder' && isVec(s.size) && Math.abs(s.size[0] - s.size[2]) > 1e-6) err(`${w}: cylinder size must be [d,h,d]`);
    if (s.sets !== undefined && (!Array.isArray(s.sets) || !s.sets.every((x) => SETS.includes(x)) || !s.sets.includes(zoneById.get(s.zone)?.set))) err(`${w}: sets must list resident sets and include its own zone's set`);
    if (s.seam && !s.sets) err(`${w}: seam solids must carry sets`);
    if (s.shape === 'heightfield') err(`${w}: heightfield is reserved and not supported by the greybox generator in version 1`);
  }
  for (const m of L.markers || []) {
    const w = `marker ${m.id}`;
    if (typeof m.id !== 'string') err(`${w}: id required`);
    if (!MTYPES.includes(m.type)) err(`${w}: bad type ${m.type}`);
    if (!isVec(m.pos)) err(`${w}: pos must be [x,y,z]`);
    if (typeof m.rotY !== 'number') err(`${w}: rotY (deg) required`);
    if (m.size !== undefined && (!isVec(m.size) || m.size.some((v) => v <= 0))) err(`${w}: size must be positive [x,y,z]`);
    if (!m.params || typeof m.params !== 'object') err(`${w}: params object required`);
    if (!zoneById.has(m.zone)) err(`${w}: unknown zone ${m.zone}`);
    if (['door', 'trigger', 'exit'].includes(m.type) && !m.size) err(`${w}: ${m.type} needs a size`);
    if (m.params?.sets !== undefined && (!Array.isArray(m.params.sets) || !m.params.sets.every((x) => SETS.includes(x)))) err(`${w}: params.sets must list resident sets`);
    if (m.type === 'enemy_spawn' && !ENEMIES.includes(m.params?.enemy)) err(`${w}: params.enemy must be one of ${ENEMIES}`);
    if (m.type === 'pickup' && !GENERIC.has(m.params?.pickup)) err(`${w}: params.pickup must be a GDD pickup id`);
    if (m.type === 'readable' && !(story.readables || {})[m.params?.readable]) err(`${w}: params.readable must be a key of story.readables`);
    if (m.type === 'puzzle_element' && m.params?.puzzle && !PUZZLES.includes(m.params.puzzle)) err(`${w}: unknown puzzle ${m.params.puzzle}`);
  }
  for (const n of L.nav?.nodes || []) {
    if (typeof n.id !== 'string' || !isVec(n.pos)) err(`nav node ${n.id}: id and pos required`);
    if (!zoneById.has(n.zone)) err(`nav node ${n.id}: unknown zone ${n.zone}`);
  }
  for (const l of L.nav?.links || []) if (!Array.isArray(l) || l.length !== 2 || l[0] === l[1]) err(`nav link ${JSON.stringify(l)}: must be a pair of distinct node ids`);
  for (const e of L.encounters || []) {
    if (typeof e.id !== 'string' || typeof e.trigger !== 'string' || !Array.isArray(e.waves) || !Array.isArray(e.locksDoors)) err(`encounter ${e.id}: id, zone, trigger, waves[], locksDoors[] required`);
    for (const w of e.waves || []) if (!Array.isArray(w.spawns) || !w.spawns.length || typeof w.delay !== 'number') err(`encounter ${e.id}: each wave needs spawns[] and a numeric delay`);
  }
  if ((L.markers || []).filter((m) => m.type === 'player_start').length !== 1) err('exactly one player_start marker is required');
  if ((L.markers || []).filter((m) => m.type === 'exit').length < 1) err('an exit marker is required');
});

// ================================================================ 2. unique ids
check('unique ids', () => {
  const seen = new Map();
  const add = (id, what) => { if (seen.has(id)) err(`duplicate id "${id}" (${seen.get(id)} and ${what})`); else seen.set(id, what); };
  L.zones.forEach((z) => add(z.id, 'zone')); L.solids.forEach((s) => add(s.id, 'solid'));
  L.markers.forEach((m) => add(m.id, 'marker')); L.nav.nodes.forEach((n) => add(n.id, 'nav node')); L.encounters.forEach((e) => add(e.id, 'encounter'));
  const lk = new Set();
  for (const [a, b] of L.nav.links) { const k = a < b ? `${a}|${b}` : `${b}|${a}`; if (lk.has(k)) err(`duplicate nav link ${a} - ${b}`); lk.add(k); }
});

// ================================================================ 3. zone containment
check('zone bounds', () => {
  for (const s of L.solids) {
    const z = zoneById.get(s.zone); if (!z) continue;
    const bb = aabb(s);
    if (!inBounds(bb.min, z.bounds, 0.011) || !inBounds(bb.max, z.bounds, 0.011)) err(`solid ${s.id} ${fmt(bb.min)}..${fmt(bb.max)} leaves zone ${z.id} ${fmt(z.bounds.min)}..${fmt(z.bounds.max)}`);
  }
  for (const m of L.markers) { const z = zoneById.get(m.zone); if (z && !inBounds(m.pos, z.bounds, 0.011)) err(`marker ${m.id} ${fmt(m.pos)} is outside zone ${z.id}`); }
  for (const n of L.nav.nodes) { const z = zoneById.get(n.zone); if (z && !inBounds(n.pos, z.bounds, 0.011)) err(`nav node ${n.id} ${fmt(n.pos)} is outside zone ${z.id}`); }
  // zones of the same resident set may share a wall but must not otherwise overlap
  for (let i = 0; i < L.zones.length; i++) for (let j = i + 1; j < L.zones.length; j++) {
    const a = L.zones[i], b = L.zones[j]; if (a.set !== b.set) continue;
    const ov = [0, 1, 2].map((k) => Math.min(a.bounds.max[k], b.bounds.max[k]) - Math.max(a.bounds.min[k], b.bounds.min[k]));
    if (ov.every((v) => v > 2.5)) err(`zones ${a.id} and ${b.id} (set ${a.set}) overlap by ${ov.map((v) => v.toFixed(1)).join(' x ')} m`);
    else if (ov.every((v) => v > 1.01) && a.priority === b.priority) err(`zones ${a.id} and ${b.id} (set ${a.set}) overlap by ${ov.map((v) => v.toFixed(1)).join(' x ')} m with equal priority: zoneAt is ambiguous there`);
  }
  for (const z of L.zones) for (const nb of z.neighbors) {
    if (!zoneById.has(nb)) err(`zone ${z.id}: neighbor ${nb} does not exist`);
    else if (!zoneById.get(nb).neighbors.includes(z.id)) err(`zone ${z.id} lists ${nb} as a neighbor but not the reverse`);
  }
});

// ================================================================ 4. references
check('references', () => {
  const storyHas = (k) => (story.lines && k in story.lines) || (story.readables && k in story.readables) || (story.objectives && k in story.objectives) || (story.ui && k in story.ui);
  const idExists = (k) => zoneById.has(k) || markerById.has(k) || solidById.has(k) || nodeById.has(k) || L.encounters.some((e) => e.id === k) || GENERIC.has(k);
  const scan = (owner, obj) => {
    for (const s of deepStrings(obj)) {
      if (STORY_KEY.test(s) && !storyHas(s)) err(`${owner}: story key "${s}" is not in design/story.json`);
      else if (!STORY_KEY.test(s) && ID_REF.test(s) && !idExists(s)) err(`${owner}: reference "${s}" matches no marker, solid, nav node or encounter`);
      if (/^enc_[a-z_]+$/.test(s) && !L.encounters.some((e) => e.id === s)) err(`${owner}: encounter "${s}" does not exist`);
    }
  };
  for (const m of L.markers) scan(`marker ${m.id}`, m.params);
  for (const z of L.zones) if (z.card && !storyHas(z.card)) err(`zone ${z.id}: card ${z.card} is not in story.json`);
  for (const s of L.solids) { if (s.enabledBy && !markerById.has(s.enabledBy)) err(`solid ${s.id}: enabledBy ${s.enabledBy} is not a marker`); if (s.interactable && !markerById.has(s.interactable)) err(`solid ${s.id}: interactable ${s.interactable} is not a marker`); }
  for (const e of L.encounters) {
    if (!zoneById.has(e.zone)) err(`encounter ${e.id}: unknown zone ${e.zone}`);
    if (!markerById.has(e.trigger)) err(`encounter ${e.id}: trigger ${e.trigger} is not a marker`);
    for (const d of e.locksDoors) if (markerById.get(d)?.type !== 'door') err(`encounter ${e.id}: locksDoors entry ${d} is not a door marker`);
    for (const w of e.waves) for (const s of w.spawns) {
      const sm = markerById.get(s);
      if (!sm || sm.type !== 'enemy_spawn') err(`encounter ${e.id}: spawn ${s} is not an enemy_spawn marker`);
      else if (sm.zone !== e.zone) {
        const d = markerById.get(sm.params.entersThrough);
        if (!d || d.type !== 'door' || !(zoneById.get(e.zone)?.neighbors || []).includes(sm.zone)) err(`encounter ${e.id}: spawn ${s} is in zone ${sm.zone}, not ${e.zone} (allowed only from a neighbour zone with params.entersThrough = a door)`);
        else if (!e.waves.some((w) => w.spawns.includes(s) && w.opensDoor === d.id)) err(`encounter ${e.id}: spawn ${s} enters through ${d.id} but its wave does not open that door`);
      }
    }
    scan(`encounter ${e.id}`, { waves: e.waves.map((w) => ({ ...w, spawns: [] })), onClear: e.onClear });
  }
  for (const [a, b] of L.nav.links) { if (!nodeById.has(a)) err(`nav link: unknown node ${a}`); if (!nodeById.has(b)) err(`nav link: unknown node ${b}`); }
  for (const g of L.nav.gates || []) { if (markerById.get(g.door)?.type !== 'door') err(`nav gate: ${g.door} is not a door`); for (const n of g.link) if (!nodeById.has(n)) err(`nav gate: unknown node ${n}`); }
  for (const p of L.nav.portals || []) { for (const n of [p.from, p.to]) if (!nodeById.has(n)) err(`nav portal: unknown node ${n}`); if (!markerById.has(p.via)) err(`nav portal: via ${p.via} is not a marker`); }
  for (const n of L.nav.criticalPath || []) if (!nodeById.has(n)) err(`criticalPath: unknown node ${n}`);
  // every spawn marker should be used by an encounter or be vignette-only
  const used = new Set(L.encounters.flatMap((e) => e.waves.flatMap((w) => w.spawns)));
  for (const m of L.markers) if (m.type === 'enemy_spawn' && !used.has(m.id) && !m.params.vignetteOnly) err(`spawn ${m.id} is not used by any encounter`);
});

// ================================================================ 5. GDD coverage
check('GDD ids', () => {
  for (const id of REQUIRED_MARKERS) if (!markerById.has(id)) err(`GDD id ${id} has no marker`);
  for (const [id, comp] of Object.entries(REQUIRED_ENCOUNTERS)) {
    const e = L.encounters.find((x) => x.id === id);
    if (!e) { err(`GDD encounter ${id} is missing`); continue; }
    const counts = {};
    for (const w of e.waves) if (!w.repeating) for (const s of w.spawns) { const k = markerById.get(s)?.params?.enemy; counts[k] = (counts[k] || 0) + 1; }
    for (const [k, n] of Object.entries(comp)) if (counts[k] !== n) err(`encounter ${id}: GDD wants ${n} ${k}, spawns give ${counts[k] || 0}`);
  }
  for (const p of PUZZLES) {
    if (!L.markers.some((m) => m.params?.puzzle === p && m.params?.role === 'volume' && m.type === 'trigger')) err(`puzzle ${p} has no volume trigger`);
    const vol = L.markers.find((m) => m.params?.puzzle === p && m.params?.role === 'volume');
    const box = L.markers.filter((m) => m.params?.interactable === 'ia_ammo_box').map((m) => Math.hypot(m.pos[0] - vol?.params.standSpot[0], m.pos[2] - vol?.params.standSpot[2]));
    if (vol && Math.min(...box) > 10.5) err(`puzzle ${p}: no ia_ammo_box within 10 m of its stand spot (nearest ${Math.min(...box).toFixed(1)} m)`);
  }
  for (const e of ENEMIES) if (!L.markers.some((m) => m.type === 'enemy_spawn' && m.params.enemy === e)) err(`enemy ${e} is never spawned`);
  for (const [zone, want] of Object.entries(FIXED)) for (const [kind, n] of Object.entries(want)) {
    const have = L.markers.filter((m) => m.zone === zone && (m.params?.pickup === kind || m.params?.interactable === kind) && !m.params.conditional).length;
    if (have < n) err(`fixed placements: zone ${zone} needs ${n} x ${kind}, has ${have}`);
  }
  const cards = new Set(L.zones.map((z) => z.card));
  for (const c of ['card_i', 'card_ii', 'card_iii', 'card_iv', 'card_v', 'card_vi', 'card_vii']) {
    if (!cards.has(c)) err(`movement card ${c} is not assigned to a zone`);
    if (!L.markers.some((m) => m.type === 'trigger' && (m.params.cards || []).includes(c))) err(`movement card ${c} has no trigger`);
  }
  for (const lb of story.meta?.load_bearing || []) if (/^(rd|ia)_/.test(lb) && !markerById.has(lb)) err(`load-bearing ${lb} (story.json meta) has no marker`);
});

// ================================================================ geometry-based checks
const world = new World(L.solids);
const staticSolids = L.solids.filter((s) => !s.dynamic);
function pointInSolid(p, skip) {
  for (const s of staticSolids) {
    if (skip && skip(s)) continue;
    const t = topAt(s, p[0], p[2], 0);
    if (t !== null && p[1] < t - 1e-6 && p[1] > bottomOf(s) + 1e-6) return s;
  }
  return null;
}

check('nav nodes', () => {
  for (const n of L.nav.nodes) {
    const g = world.ground(n.pos[0], n.pos[2], n.pos[1], 0.05, 0.05);
    if (!g) { err(`nav node ${n.id} ${fmt(n.pos)} has no floor solid beneath it`); continue; }
    const inside = pointInSolid([n.pos[0], n.pos[1] + 0.9, n.pos[2]]);
    if (inside) err(`nav node ${n.id} ${fmt(n.pos)} is inside solid ${inside.id}`);
    const bl = world.blocker(n.pos[0], n.pos[2], n.pos[1], PLAYER.radius);
    if (bl) err(`nav node ${n.id} ${fmt(n.pos)} has no room for a ${PLAYER.radius} m body (touches ${bl.id})`);
    if (g.solid.zone !== n.zone && !(zoneById.get(g.solid.zone)?.neighbors || []).includes(n.zone)) err(`nav node ${n.id} (zone ${n.zone}) stands on ${g.solid.id} of zone ${g.solid.zone}`);
  }
});

check('nav links', () => {
  let longest = 0;
  for (const [a, b] of L.nav.links) {
    const A = nodeById.get(a), B = nodeById.get(b); if (!A || !B) continue;
    const d = Math.hypot(A.pos[0] - B.pos[0], A.pos[2] - B.pos[2]); longest = Math.max(longest, d);
    if (d > 7) err(`nav link ${a} - ${b} is ${d.toFixed(1)} m long (limit 7)`);
    const why = world.walk(A.pos, B.pos, PLAYER.radius, 0.2) || world.walk(B.pos, A.pos, PLAYER.radius, 0.2);
    if (why) err(`nav link ${a} - ${b}: ${why}`);
  }
  info.push(`longest nav link ${longest.toFixed(2)} m`);
});

check('nav connectivity', () => {
  const adj = new Map(L.nav.nodes.map((n) => [n.id, []]));
  for (const [a, b] of L.nav.links) { adj.get(a)?.push(b); adj.get(b)?.push(a); }
  for (const p of L.nav.portals || []) { adj.get(p.from)?.push(p.to); adj.get(p.to)?.push(p.from); }
  const nearest = (m) => { let best = null, bd = Infinity; for (const n of L.nav.nodes) { if (n.zone !== m.zone) continue; const d = Math.hypot(n.pos[0] - m.pos[0], n.pos[2] - m.pos[2]) + 3 * Math.abs(n.pos[1] - m.pos[1]); if (d < bd) { bd = d; best = n; } } return { n: best, d: bd }; };
  const start = L.markers.find((m) => m.type === 'player_start'), exit = L.markers.find((m) => m.type === 'exit');
  const s = nearest(start), e = nearest(exit);
  if (!s.n || s.d > 1.5) return err(`no nav node within 1.5 m of player_start`);
  if (!e.n || e.d > 4) return err(`no nav node within 4 m of the exit marker`);
  const seen = new Set([s.n.id]), q = [s.n.id];
  while (q.length) { const u = q.shift(); for (const v of adj.get(u) || []) if (!seen.has(v)) { seen.add(v); q.push(v); } }
  if (!seen.has(e.n.id)) err(`nav graph: exit node ${e.n.id} is not reachable from player_start node ${s.n.id}`);
  const lost = L.nav.nodes.filter((n) => !seen.has(n.id));
  if (lost.length) err(`nav graph: ${lost.length} node(s) unreachable from player_start: ${lost.slice(0, 12).map((n) => n.id).join(', ')}${lost.length > 12 ? ' ...' : ''}`);
  // every checkpoint, spawn, door and encounter trigger must have a reachable node nearby
  for (const m of L.markers) {
    if (!['checkpoint', 'enemy_spawn', 'door'].includes(m.type) || m.params.boss) continue;
    const r = nearest(m); const lim = m.type === 'door' ? 3.5 : 3.2;
    if (!r.n || r.d > lim || !seen.has(r.n.id)) err(`${m.type} ${m.id} ${fmt(m.pos)}: nearest reachable nav node is ${r.n ? r.d.toFixed(1) + ' m away' : 'missing'} (limit ${lim})`);
  }
  // critical path must be a real walk
  const cpath = L.nav.criticalPath || [];
  if (!cpath.length) err('nav.criticalPath is missing');
  const linkSet = new Set(L.nav.links.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const portalSet = new Set((L.nav.portals || []).flatMap((p) => [`${p.from}|${p.to}`, `${p.to}|${p.from}`]));
  for (let i = 0; i < cpath.length - 1; i++) if (cpath[i] !== cpath[i + 1] && !linkSet.has(`${cpath[i]}|${cpath[i + 1]}`) && !portalSet.has(`${cpath[i]}|${cpath[i + 1]}`)) err(`criticalPath: ${cpath[i]} -> ${cpath[i + 1]} is not a link or portal`);
  if (cpath.length && (cpath[0] !== s.n.id || cpath[cpath.length - 1] !== e.n.id)) err('criticalPath must run from the player_start node to the exit node');
  // no jump on the critical path: every link height change is carried by a walkable solid (verified by `nav links`)
});

check('doors', () => {
  for (const d of L.markers.filter((m) => m.type === 'door')) {
    if (d.params.kind === 'hatch') {
      if (d.size[0] < DOOR_MIN.w || d.size[2] < DOOR_MIN.w) err(`hatch ${d.id}: opening ${d.size[0]} x ${d.size[2]} m is under ${DOOR_MIN.w} m`);
      // the hole must be open: no static solid in the hatch volume just below floor level
      for (const fx of [-0.4, 0, 0.4]) for (const fz of [-0.35, 0, 0.35]) { const p = [d.pos[0] + fx * d.size[0], d.pos[1] + d.size[1] / 2, d.pos[2] + fz * d.size[2]]; const s = pointInSolid(p, (x) => x.shape === 'ramp'); if (s) err(`hatch ${d.id}: ${s.id} fills the opening at ${fmt(p)}`); }
      continue;
    }
    const [w, h] = d.size;
    if (w < DOOR_MIN.w) err(`door ${d.id}: ${w} m wide (min ${DOOR_MIN.w})`);
    if (h < DOOR_MIN.h) err(`door ${d.id}: ${h} m tall (min ${DOOR_MIN.h})`);
    const r = rad(d.rotY), ux = Math.cos(r), uz = -Math.sin(r); // local X (width) in world
    const g = world.ground(d.pos[0], d.pos[2], d.pos[1], 0.3, 0.3);
    if (!g) err(`door ${d.id} ${fmt(d.pos)}: no floor at the threshold`);
    // the stated opening must really be clear in the static solids (player-sized sweep through it)
    for (const fw of [-1, -0.5, 0, 0.5, 1]) for (const y of [0.25, 1.1, DOOR_MIN.h - 0.05]) for (const ft of [-0.4, 0, 0.4]) {
      const off = fw * (Math.max(w, DOOR_MIN.w) / 2 - 0.05);
      const p = [d.pos[0] + ux * off - uz * ft * 0 + (-uz) * 0, d.pos[1] + y, d.pos[2] + uz * off];
      // step through the wall thickness along local Z
      p[0] += Math.sin(r) * ft; p[2] += Math.cos(r) * ft;
      const s = pointInSolid(p);
      if (s) { err(`door ${d.id}: opening is not clear, ${s.id} intrudes at ${fmt(p)} (need ${Math.max(w, DOOR_MIN.w)} x ${DOOR_MIN.h} m)`); break; }
    }
    // and something must actually frame it: solid within 0.6 m of each jamb
    for (const side of [-1, 1]) { const p = [d.pos[0] + ux * side * (w / 2 + 0.3), d.pos[1] + 1.0, d.pos[2] + uz * side * (w / 2 + 0.3)]; if (!pointInSolid(p)) warn(`door ${d.id}: no wall solid at the ${side < 0 ? 'left' : 'right'} jamb ${fmt(p)} (door wider than marked, or free-standing)`); }
  }
});

check('floors under markers', () => {
  for (const m of L.markers) {
    if (!['player_start', 'checkpoint', 'pickup', 'enemy_spawn'].includes(m.type) || m.params.boss) continue; // the boss hangs over the bore
    const onProp = m.type === 'pickup';
    const g = onProp ? world.support(m.pos[0], m.pos[2], m.pos[1], 0.05) : world.ground(m.pos[0], m.pos[2], m.pos[1], 0.05, 0.05);
    if (!g || Math.abs(g.y - m.pos[1]) > 0.05) { err(`${m.type} ${m.id} ${fmt(m.pos)}: no ${onProp ? 'supporting solid' : 'floor'} at its feet${g ? ` (nearest top ${g.y.toFixed(2)})` : ''}`); continue; }
    if (m.params.dormant === 'sit_table') continue; // seated at the table
    const bl = world.blocker(m.pos[0], m.pos[2], m.pos[1], m.type === 'pickup' ? 0.15 : PLAYER.radius - 0.05);
    if (bl) err(`${m.type} ${m.id} ${fmt(m.pos)} intersects solid ${bl.id}`);
    const head = pointInSolid([m.pos[0], m.pos[1] + PLAYER.height, m.pos[2]]);
    if (head && m.type !== 'pickup') err(`${m.type} ${m.id}: no headroom (${head.id})`);
  }
  // spawn distance: GDD 10 — at least 12 m from the player (approximated by the encounter trigger)
  for (const e of L.encounters) { const t = markerById.get(e.trigger); if (!t) continue; for (const w of e.waves) for (const s of w.spawns) { const sm = markerById.get(s); if (!sm || sm.params.add) continue; const d = Math.hypot(sm.pos[0] - t.pos[0], sm.pos[2] - t.pos[2]); if (d < 12) err(`encounter ${e.id}: spawn ${s} is ${d.toFixed(1)} m from its trigger (min 12)`); } }
});

check('scope', () => {
  const ext = (zs) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const z of zs) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], z.bounds.min[i]); mx[i] = Math.max(mx[i], z.bounds.max[i]); } return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]; };
  const all = ext(L.zones);
  info.push(`footprint ${all[0].toFixed(0)} x ${all[2].toFixed(0)} m, ${all[1].toFixed(0)} m of height`);
  if (all[0] > SCOPE.maxX || all[2] > SCOPE.maxZ) err(`total footprint ${all[0]} x ${all[2]} m exceeds ${SCOPE.maxX} x ${SCOPE.maxZ}`);
  const surf = ext(L.zones.filter((z) => z.set === 'surface'));
  info.push(`surface set ${surf[0].toFixed(0)} x ${surf[2].toFixed(0)} m`);
  if (L.solids.length > 600) err(`${L.solids.length} solids: the blockout should stay under 600`);
  if (L.nav.nodes.length > 800) err(`${L.nav.nodes.length} nav nodes: keep under 800`);
  if (L.nav.criticalPathLength) info.push(`critical path ${L.nav.criticalPathLength.toFixed(0)} m`);
});

// ================================================================ design metrics (warnings)
check('arena metrics', () => {
  // full-height cover (>= 2.0 m tall above the floor it stands on) within reach of every combat node
  const arenas = [
    { name: 'street', zone: 'plenty_street', test: (p) => p[0] > -52 && p[0] < -6 && Math.abs(p[2]) < 7, limit: 9 },
    { name: 'yard', zone: 'plenty_street', test: (p) => p[0] < -81 && p[1] < 1, limit: 9 },
    { name: 'lift hall', zone: 'lift_hall', test: (p) => p[1] < -14.5 && p[0] < 20 && p[2] < 0, limit: 9 },
    { name: 'bore chamber', zone: 'the_bore', test: (p) => p[1] < -43.5 && p[2] > 81.5 && p[2] < 111, limit: 9 },
  ];
  for (const a of arenas) {
    const covers = L.solids.filter((s) => s.zone === a.zone && (s.role === 'cover' || s.prop === 'hearth') && s.size[1] >= 2.0 && !s.low);
    let worst = 0, worstNode = null, count = 0;
    for (const n of L.nav.nodes) {
      if (n.zone !== a.zone || !a.test(n.pos)) continue; count++;
      let best = Infinity;
      for (const c of covers) { const bb = aabb(c); if (bb.min[1] > n.pos[1] + 0.5 || bb.max[1] < n.pos[1] + 2) continue; const dx = Math.max(bb.min[0] - n.pos[0], 0, n.pos[0] - bb.max[0]), dz = Math.max(bb.min[2] - n.pos[2], 0, n.pos[2] - bb.max[2]); best = Math.min(best, Math.hypot(dx, dz)); }
      if (best > worst) { worst = best; worstNode = n; }
    }
    info.push(`${a.name}: ${count} nav nodes, ${covers.length} full-height cover solids, farthest node from cover ${worst.toFixed(1)} m`);
    if (worst > a.limit) warn(`${a.name}: node ${worstNode.id} ${fmt(worstNode.pos)} is ${worst.toFixed(1)} m from full-height cover (target <= ${a.limit})`);
    if (count < 12) warn(`${a.name}: only ${count} nav nodes`);
  }
  // nav density in combat zones: average link length
  const firing = L.nav.nodes.filter((n) => (n.tags || []).includes('firing_point'));
  if (firing.length < 5) warn(`only ${firing.length} Transit firing points tagged`);
  for (const f of firing) { const door = markerById.get('ia_yard_door'); const d = Math.hypot(f.pos[0] - door.pos[0], f.pos[2] - door.pos[2]); if (d < 8) warn(`firing point ${f.id} is ${d.toFixed(1)} m from the yard door (band is 12-25 m)`); }
});

// ================================================================ revision 2: sight, story wiring, staging rules
const setOfZone = (zid) => zoneById.get(zid)?.set;
const inSet = (s, set) => !set || setOfZone(s.zone) === set || (s.sets || []).includes(set);
const sightSolids = L.solids.filter((s) => !s.dynamic && !s.seeThrough && !s.grille && !s.invisible && !s.playerOnly).map((s) => ({ s, bb: aabb(s) }));
/** First solid a straight ray a -> b meets (sampled every `step` m, at most maxDist m), or null.
 *  Only solids resident in `set` count; see-through, invisible, player-only and dynamic solids never block. */
function firstHit(a, b, { set, maxDist = 90, step = 0.04, ignore } = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d), run = Math.min(len, maxDist);
  const e = [a[0] + (d[0] * run) / len, a[1] + (d[1] * run) / len, a[2] + (d[2] * run) / len];
  const lo = [0, 1, 2].map((i) => Math.min(a[i], e[i])), hi = [0, 1, 2].map((i) => Math.max(a[i], e[i]));
  const cand = sightSolids.filter(({ s, bb }) => inSet(s, set) && !(ignore && ignore(s)) && [0, 1, 2].every((i) => bb.max[i] >= lo[i] && bb.min[i] <= hi[i]));
  if (!cand.length) return null;
  for (let t = step; t < run; t += step) {
    const p = [a[0] + (d[0] * t) / len, a[1] + (d[1] * t) / len, a[2] + (d[2] * t) / len];
    for (const { s, bb } of cand) {
      if (p[0] < bb.min[0] || p[0] > bb.max[0] || p[1] < bb.min[1] || p[1] > bb.max[1] || p[2] < bb.min[2] || p[2] > bb.max[2]) continue;
      const top = topAt(s, p[0], p[2], 0);
      if (top !== null && p[1] < top && p[1] > bottomOf(s)) return s;
    }
  }
  return null;
}
/** Standable sample points (feet) on a grid inside a marker volume. */
function standable(m, grid = 0.5) {
  const out = [];
  for (let x = m.pos[0] - m.size[0] / 2 + 0.2; x <= m.pos[0] + m.size[0] / 2 - 0.2 + 1e-6; x += grid) for (let z = m.pos[2] - m.size[2] / 2 + 0.2; z <= m.pos[2] + m.size[2] / 2 - 0.2 + 1e-6; z += grid) {
    const g = world.ground(x, z, m.pos[1] + 0.3, 0.6, 2.5); if (!g) continue;
    if (world.blocker(x, z, g.y, PLAYER.radius)) continue;
    out.push([x, g.y, z]);
  }
  return out;
}
const azimuth = (from, to) => (((Math.atan2(to[0] - from[0], -(to[2] - from[2])) * 180) / Math.PI) + 360) % 360;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

check('sightlines', () => {
  // every vista: the marker's eye must see its target
  for (const v of L.markers.filter((m) => m.type === 'vista')) {
    if (!isVec(v.params.target)) { err(`vista ${v.id}: params.target [x,y,z] required`); continue; }
    const eye = [v.pos[0], v.pos[1] + EYE, v.pos[2]];
    const hit = firstHit(eye, v.params.target, { set: setOfZone(v.zone) });
    if (hit) err(`vista ${v.id}: the line from ${fmt(eye)} to its target is blocked by ${hit.id}`);
  }
  // the Dowser (GDD 9.3): clear of the sun, and seen from (nearly) everywhere the beat can start
  const dv = markerById.get('vista_dowser'), dt = markerById.get('trg_dowser'), sun = L.meta.sun;
  if (!dv || !dt) return err('vista_dowser / trg_dowser missing');
  if (dt.params.vista !== 'vista_dowser' || dt.params.holdsDoor !== 'door_tally') err('trg_dowser must name vista_dowser and hold door_tally until the sighting is over');
  const pts = standable(dt);
  let blocked = 0, worstSep = 360, minEl = 90; const blockers = {};
  for (const p of pts) {
    const eye = [p[0], p[1] + EYE, p[2]], t = dv.params.target;
    worstSep = Math.min(worstSep, angDiff(azimuth(eye, t), sun.azimuthDeg));
    minEl = Math.min(minEl, (Math.atan2(t[1] - eye[1], Math.hypot(t[0] - eye[0], t[2] - eye[2])) * 180) / Math.PI);
    const hit = firstHit(eye, t, { set: 'surface' });
    if (hit) { blocked++; blockers[hit.id] = (blockers[hit.id] || 0) + 1; }
  }
  info.push(`Dowser: seen from ${pts.length - blocked} of ${pts.length} standable points in trg_dowser; ${worstSep.toFixed(1)} deg of azimuth from the sun at worst; elevation ${minEl.toFixed(1)} deg${blocked ? '; blocked by ' + JSON.stringify(blockers) : ''}`);
  if (pts.length < 40) err(`trg_dowser has only ${pts.length} standable sample points`);
  if (blocked > pts.length * 0.08) err(`the Dowser is hidden from ${blocked} of ${pts.length} points of trg_dowser (limit 8 %): ${JSON.stringify(blockers)}`);
  if (worstSep < 25) err(`the Dowser card is only ${worstSep.toFixed(1)} deg of azimuth from the sun (GDD 9.3: at least 25)`);
  for (const n of L.nav.nodes) if (inBounds(n.pos, { min: [dt.pos[0] - dt.size[0] / 2, dt.pos[1] - 0.1, dt.pos[2] - dt.size[2] / 2], max: [dt.pos[0] + dt.size[0] / 2, dt.pos[1] + 1, dt.pos[2] + dt.size[2] / 2] })) {
    const hit = firstHit([n.pos[0], n.pos[1] + EYE, n.pos[2]], dv.params.target, { set: 'surface' });
    if (hit) warn(`nav node ${n.id} inside trg_dowser cannot see the Dowser (${hit.id})`);
  }
  const cpy = markerById.get('cp_yard_clear');
  if (cpy && firstHit([cpy.pos[0], cpy.pos[1] + EYE, cpy.pos[2]], dv.params.target, { set: 'surface' })) err('cp_yard_clear cannot see the Dowser');
  // the door approach must lie inside the trigger: every nav link into door_tally from the yard starts in it
  const door = markerById.get('door_tally');
  const half = [dt.size[0] / 2, dt.size[2] / 2];
  if (Math.abs(door.pos[0] - dt.pos[0]) > half[0] - 1 || Math.abs(door.pos[2] + 1 - dt.pos[2]) > half[1]) err('trg_dowser does not cover the approach to door_tally');
  // set swap: the hatch must be shut and out of sight where the surface set unloads
  const sw = markerById.get('trg_set_swap'), hatch = markerById.get('ia_hatch'), hc = markerById.get('trg_hatch_close');
  if (!sw || !hatch || !hc) return err('trg_set_swap / trg_hatch_close / ia_hatch missing');
  if (hatch.params.closesBehind !== 'trg_hatch_close' || hc.params.closes !== 'ia_hatch') err('ia_hatch must be closed by trg_hatch_close');
  if (sw.params.after !== 'trg_hatch_close') err('trg_set_swap must come after trg_hatch_close');
  if (!(hc.pos[1] <= -3.5)) err('trg_hatch_close must sit at or below y -3.5');
  let seen = 0, tested = 0;
  for (const p of standable(sw, 0.4)) for (const fx of [-0.45, 0, 0.45]) for (const fz of [-0.4, 0, 0.4]) {
    tested++;
    const t = [hatch.pos[0] + fx * hatch.size[0], hatch.pos[1], hatch.pos[2] + fz * hatch.size[2]];
    if (!firstHit([p[0], p[1] + EYE, p[2]], t, {})) seen++;
  }
  if (!tested) err('trg_set_swap has no standable point');
  if (seen) err(`the hatch opening is in line of sight from trg_set_swap (${seen} of ${tested} rays): the surface set would be seen unloading`);
  info.push(`set swap: hatch opening hidden from trg_set_swap on ${tested - seen} of ${tested} rays`);
});

check('story wiring', () => {
  const once = new Set(story.meta?.rules?.once_only || []);
  const PLAY = new Set(['lines', 'line', 'thenLine', 'parley', 'refused', 'kept']);
  const plays = new Map(), objs = new Map();
  const walk = (owner, v, playing) => {
    if (typeof v === 'string') { if (playing && /^(nar|stn|rv)_/.test(v)) plays.set(v, [...(plays.get(v) || []), owner]); return; }
    if (Array.isArray(v)) return v.forEach((x) => walk(owner, x, playing));
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (k === 'objective' && typeof x === 'string') objs.set(x, [...(objs.get(x) || []), owner]);
      walk(owner, x, playing || PLAY.has(k));
    }
  };
  for (const m of L.markers) walk(m.id, m.params, false);
  for (const e of L.encounters) walk(e.id, { waves: e.waves, onClear: e.onClear }, false);
  for (const [k, owners] of plays) if (owners.length > 1 && !once.has(k)) err(`story line ${k} is played from ${owners.length} places (${owners.join(', ')}): keep it in one, or list it in story.json meta.rules.once_only`);
  else if (owners.length > 1) warn(`once-only line ${k} is named by ${owners.join(', ')}`);
  for (const k of Object.keys(story.objectives || {})) {
    const o = objs.get(k) || [];
    if (o.length !== 1) err(`objective ${k} must be set by exactly one marker or encounter (GDD 12.2); found ${o.length}${o.length ? ': ' + o.join(', ') : ''}`);
  }
  for (const k of objs.keys()) if (!(k in (story.objectives || {}))) err(`objective ${k} is not in story.json`);
  // revision 2 wiring that other documents rely on
  const has = (id, key, line) => deepStrings(markerById.get(id)?.params?.[key]).includes(line);
  if (!has('shutter_m', 'lines', 'nar_tally_chair_2')) err('shutter_m must play nar_tally_chair_2 after nar_tally_chair');
  if (!has('ia_cradle', 'lines', 'nar_cradle_2')) err('ia_cradle must play nar_cradle then nar_cradle_2');
  if (!deepStrings(L.encounters.find((e) => e.id === 'enc_file')?.waves).includes('nar_file_more')) err('enc_file wave B must play nar_file_more');
  if (markerById.get('knot_yard_latch')?.params.objective !== 'obj_yard') err('knot_yard_latch must set obj_yard');
  if (L.encounters.find((e) => e.id === 'enc_windlass')?.onClear?.checkpoint) err('enc_windlass.onClear must not commit a checkpoint (cp_boss_proven commits on the kept round)');
  const lamps = markerById.get('pz_listening_lamps');
  if (lamps?.params.fillSecondsEach !== 0.75) err('pz_listening_lamps.fillSecondsEach must be 0.75 (GDD 13.4)');
});

check('staging rules', () => {
  // --- ending: only the stone arms it (GDD 9.8)
  const exit = L.markers.find((m) => m.type === 'exit'), stone = markerById.get('trg_stone');
  if (exit.params.requires !== 'trg_stone') err(`${exit.id} must carry requires: "trg_stone" (walking to the edge must not end the stage)`);
  if (stone && exit) { const ov = [0, 2].every((i) => Math.abs(stone.pos[i] - exit.pos[i]) < (stone.size[i] + exit.size[i]) / 2); if (ov) err('exit_rim overlaps trg_stone: entering the stone volume would end the stage at once'); }
  const fs_ = markerById.get('cp_rim')?.params.failSafes || [];
  if (!fs_.some((f) => f.afterSeconds === 60) || !fs_.some((f) => f.afterSeconds === 150)) err('cp_rim needs the 60 s and 150 s fail-safes (GDD 9.8)');
  // --- enc_tally: the hatch is locked, ajar on the knot, open on clear; nobody goes below with it live
  const tally = L.encounters.find((e) => e.id === 'enc_tally'), hatch = markerById.get('ia_hatch'), knot = markerById.get('knot_hatch_latch');
  if (!tally.locksDoors.includes('ia_hatch')) err('enc_tally must lock ia_hatch');
  if (hatch.params.ajarOn !== 'knot_hatch_latch' || hatch.params.opensOn !== 'enc_tally clear') err('ia_hatch must go ajar on knot_hatch_latch and open on "enc_tally clear"');
  for (const id of ['trg_set_swap', 'trg_hatch_close']) if (markerById.get(id)?.params.requires !== 'enc_tally clear') err(`${id} must require "enc_tally clear"`);
  // --- GDD test 4: wherever the knot can be hit from, both risers are at least 12 m away
  const risers = tally.waves.flatMap((w) => w.spawns).map((id) => markerById.get(id));
  const tz = zoneById.get('tally_house').bounds;
  const targets = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((o) => o.map((v, i) => knot.pos[i] + v * knot.params.hitRadius * 0.9));
  const pts = [];
  for (let x = tz.min[0] + 1.2; x <= tz.max[0] - 1.2; x += 0.4) for (let z = tz.min[2] + 1.2; z <= tz.max[2] - 1.2; z += 0.4) {
    const onHatch = Math.abs(x - hatch.pos[0]) < hatch.size[0] / 2 && Math.abs(z - hatch.pos[2]) < hatch.size[2] / 2; // the shut or ajar lid is walkable
    if (!onHatch && !world.ground(x, z, 0, 0.35, 0.35)) continue;
    if (world.blocker(x, z, 0, PLAYER.radius)) continue;
    pts.push([x, 0, z]);
  }
  for (const n of L.nav.nodes) if (n.zone === 'tally_house') pts.push(n.pos);
  let can = 0, worst = Infinity; const bad = [];
  for (const p of pts) {
    const hit = [EYE, EYE + JUMP_APEX].some((h) => targets.some((t) => !firstHit([p[0], p[1] + h, p[2]], t, { set: 'surface' })));
    if (!hit) continue; can++;
    const d = Math.min(...risers.map((r) => Math.hypot(r.pos[0] - p[0], r.pos[2] - p[2])));
    worst = Math.min(worst, d); if (d < 12) bad.push(`${fmt(p)} ${d.toFixed(1)} m`);
  }
  info.push(`tally rise: knot_hatch_latch can be hit from ${can} of ${pts.length} standable points; nearest riser from any of them ${worst.toFixed(1)} m`);
  if (!can) err('knot_hatch_latch cannot be hit from anywhere');
  if (bad.length) err(`knot_hatch_latch can be hit from ${bad.length} point(s) under 12 m from a riser: ${bad.slice(0, 6).join('; ')}`);
  if (!L.nav.nodes.some((n) => (n.tags || []).includes('knot_stand') && targets.some((t) => !firstHit([n.pos[0], n.pos[1] + EYE, n.pos[2]], t, { set: 'surface' })))) err('no knot_stand nav node sees knot_hatch_latch');
  // --- seam: the solids under the hatch must be resident in both sets
  for (const id of ['gl_flight_1', 'gl_landing_1']) { const s = solidById.get(id); if (!s?.seam || !['surface', 'underground'].every((x) => (s.sets || []).includes(x))) err(`${id} must be a seam solid resident in surface and underground`); }
  // --- enc_matador runs on the clock (GDD 10)
  const mat = L.encounters.find((e) => e.id === 'enc_matador');
  const at = Object.fromEntries(mat.waves.map((w) => [w.id, w.atSeconds]));
  if (at.B !== 15 || at.C !== 35 || mat.waves.some((w) => /HP/.test(w.when))) err('enc_matador waves B and C must be atSeconds 15 and 35 (polish round 3: were 40 and 65) with no HP condition');
  // --- repeating adds: distance to the player, not to the trigger
  for (const e of L.encounters) for (const w of e.waves) if (w.repeating) {
    if (typeof w.minPlayerDistance !== 'number') { err(`encounter ${e.id} wave ${w.id}: repeating spawns need minPlayerDistance`); continue; }
    const sp = w.spawns.map((id) => markerById.get(id)); let worstFar = Infinity, at = null;
    for (const n of L.nav.nodes) if (n.zone === e.zone && Math.abs(n.pos[1] - sp[0].pos[1]) < 0.5) { const far = Math.max(...sp.map((m) => Math.hypot(m.pos[0] - n.pos[0], m.pos[2] - n.pos[2]))); if (far < worstFar) { worstFar = far; at = n; } }
    info.push(`${e.id} adds: the farthest grate is at least ${worstFar.toFixed(1)} m from any floor node (worst at ${at.id})`);
    if (worstFar < w.minPlayerDistance) err(`encounter ${e.id} wave ${w.id}: from ${at.id} every spawn is within ${worstFar.toFixed(1)} m (minPlayerDistance ${w.minPlayerDistance})`);
  }
  // --- rides: the two cages of a portal are the same room (GDD 9.6)
  for (const p of L.nav.portals || []) {
    const T = p.transform, dep = markerById.get(p.cages?.[0]), arr = markerById.get(p.cages?.[1]);
    if (!T || !isVec(T.from) || !isVec(T.to) || typeof T.yawDeg !== 'number' || !dep || !arr || !isVec(p.cageInterior)) { err(`portal ${p.id || p.via}: id, cages [depart, arrive], cageInterior and transform {from,to,yawDeg} required`); continue; }
    if ([0, 1, 2].some((i) => Math.abs(dep.pos[i] - T.from[i]) > 1e-6 || Math.abs(arr.pos[i] - T.to[i]) > 1e-6)) err(`portal ${p.id}: transform from/to must be the cage markers' positions`);
    const [w, h, d] = p.cageInterior, c = Math.cos(rad(T.yawDeg)), sn = Math.sin(rad(T.yawDeg));
    const gate = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] }[dep.params.gateSide];
    if (!gate) { err(`portal ${p.id}: ${dep.id} needs params.gateSide`); continue; }
    let diff = 0, full = 0, tested = 0;
    for (let lx = -w / 2 - 0.25; lx <= w / 2 + 0.3; lx += 0.3) for (let lz = -d / 2 - 0.25; lz <= d / 2 + 0.3; lz += 0.3) for (let y = 0.15; y <= h + 0.3; y += 0.35) {
      if (gate[0] * lx > w / 2 - 1e-6 || gate[1] * lz > d / 2 - 1e-6) continue; // beyond the gate plane the two places differ
      const a = [T.from[0] + lx, T.from[1] + y, T.from[2] + lz], b = [T.to[0] + lx * c + lz * sn, T.to[1] + y, T.to[2] - lx * sn + lz * c];
      const sa = !!pointInSolid(a), sb = !!pointInSolid(b); tested++;
      if (sa !== sb) diff++;
      const inside = Math.abs(lx) < w / 2 - 0.05 && Math.abs(lz) < d / 2 - 0.05 && y < h - 0.05;
      if (inside && (sa || sb)) full++;
    }
    info.push(`${p.id}: cages ${dep.id} / ${arr.id} match on ${tested - diff} of ${tested} lattice points (interior ${w} x ${h} x ${d})`);
    if (diff) err(`portal ${p.id}: the two cages differ at ${diff} of ${tested} lattice points`);
    if (full) err(`portal ${p.id}: ${full} lattice points inside the stated cage interior are solid`);
    const nf = nodeById.get(p.from), nt = nodeById.get(p.to);
    if (nf && nt) { const lx = nf.pos[0] - T.from[0], lz = nf.pos[2] - T.from[2]; const q = [T.to[0] + lx * c + lz * sn, T.to[1], T.to[2] - lx * sn + lz * c]; if (!world.ground(q[0], q[2], q[1], 0.1, 0.1) || world.blocker(q[0], q[2], q[1], PLAYER.radius)) err(`portal ${p.id}: the image of ${nf.id} is not standable`); }
  }
  for (const [doorId, cageId] of [['door_lift_cage', 'lift_depart_hall']]) { const dd = markerById.get(doorId), cg = markerById.get(cageId); if (dd.size[1] > cg.params.interior[1] + 1e-6) err(`${doorId} is ${dd.size[1]} m tall against a ${cg.params.interior[1]} m cage`); }
});

check('kept round', () => {
  // GDD 6.6 rule 4 and acceptance test 8, from the centre of each proving mark
  const bo = markerById.get('bore_opening'), vol = bo?.params.volume, kerb = solidById.get('bo_kerb');
  if (!vol || vol.shape !== 'cylinder') return err('bore_opening.params.volume {shape: cylinder, radius, top, bottom, axis} required');
  const floorY = markerById.get('ia_proving_mark_1').pos[1];
  if (Math.abs(vol.top - (floorY + 1.2)) > 1e-6 || Math.abs(bo.pos[1] - vol.top) > 1e-6) err('bore target volume top (and the marker y) must be kerb-top height, floor + 1.2 m');
  const inVol = (p) => Math.hypot(p[0] - vol.axis[0], p[2] - vol.axis[2]) < vol.radius && p[1] < vol.top && p[1] > vol.bottom;
  const enters = (eye, yawRad, pitchDeg, real) => { // real: honour the kerb and every other solid
    const cp = Math.cos(rad(pitchDeg)), dir = [Math.sin(yawRad) * cp, -Math.sin(rad(pitchDeg)), -Math.cos(yawRad) * cp];
    for (let t = 0.02; t < 14; t += 0.02) {
      const p = [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
      if (inVol(p)) return true;
      if (real) for (const { s, bb } of sightSolids) { if (s.zone !== 'the_bore' || p[0] < bb.min[0] || p[0] > bb.max[0] || p[1] < bb.min[1] || p[1] > bb.max[1] || p[2] < bb.min[2] || p[2] > bb.max[2]) continue; const top = topAt(s, p[0], p[2], 0); if (top !== null && p[1] < top && p[1] > bottomOf(s)) return false; }
    }
    return false;
  };
  let minWindow = 90;
  for (let k = 1; k <= 6; k++) {
    const m = markerById.get(`ia_proving_mark_${k}`), eye = [m.pos[0], m.pos[1] + EYE, m.pos[2]];
    const yaw0 = Math.atan2(vol.axis[0] - eye[0], -(vol.axis[2] - eye[2]));
    for (let pitch = 5; pitch <= 60; pitch += 5) for (let dy = -25; dy <= 25; dy += 5) if (!enters(eye, yaw0 + rad(dy), pitch, false)) err(`${m.id}: an aim ${pitch} deg down, ${dy} deg off the axis does not enter the bore target volume (test 8)`);
    if (enters(eye, yaw0, 0, false) || enters(eye, yaw0, -5, false)) err(`${m.id}: a level aim at the far wall enters the bore target volume`);
    let lo = null, hi = null;
    for (let pitch = 0; pitch <= 80; pitch += 0.5) if (enters(eye, yaw0, pitch, true)) { if (lo === null) lo = pitch; hi = pitch; }
    const win = lo === null ? 0 : hi - lo; minWindow = Math.min(minWindow, win);
    if (win < 20) err(`${m.id}: through the real kerb the bore opening is visible over only ${win.toFixed(1)} deg of pitch (${lo}..${hi}); need at least 20`);
    if (k === 1) info.push(`kept round: from a proving mark the open bore is seen from ${lo} to ${hi} deg below the horizon through the kerb notch; the target volume accepts 5..60 deg within +-25 deg of the axis`);
  }
  const guard = solidById.get('bo_kerb_guard');
  if (!guard?.playerOnly || Math.abs(topMax(guard) - (floorY + 1.2)) > 1e-6) err('bo_kerb_guard must be a player-only blocker to floor + 1.2 m (the kerb stays uncrossable)');
  if (kerb && topMax(kerb) - floorY > JUMP_APEX + 0.2 + 1e-6 && minWindow < 20) err('kerb too high in front of the marks');
});

// ================================================================ report
const counts = { zones: L.zones.length, solids: L.solids.length, markers: L.markers.length, navNodes: L.nav.nodes.length, navLinks: L.nav.links.length, encounters: L.encounters.length };
if (!quiet) {
  console.log(`layout: ${path.relative(ROOT, file)}`);
  console.log(`counts: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : ` (${c.n})`}`);
  for (const i of info) console.log(`  info ${i}`);
  for (const w of warnings) console.log(`  warn ${w}`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors.slice(0, 80)) console.error('  ' + e);
  if (errors.length > 80) console.error(`  ... and ${errors.length - 80} more`);
  process.exit(1);
}
console.log(`\nlayout valid: ${checks.length} checks passed, ${warnings.length} warning(s)`);
