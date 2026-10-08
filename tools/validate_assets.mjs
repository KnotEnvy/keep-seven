#!/usr/bin/env node
// Validates design/assets.json against its own schema and against design/layout.json.
// Exits non-zero on any failure.
//   node tools/validate_assets.mjs [--quiet] [--files] [--pvs] [--manifest=<path>] [--layout=<path>]
// --files also checks that every runtime asset and texture exists under public/ (off by default:
//         the manifest is written before the placeholder generator has run).
// --pvs   prints, for every visibility cell, which units the blockout says can be seen from it.
//
// The budget model (what is drawn from a visibility cell, and how many triangles and draw calls that can be)
// lives here and is exported, so tools/gen_assets.mjs writes the numbers with the same code that checks them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { aabb, topAt, bottomOf } from './layout_geom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MB = 1024 * 1024;
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const RUNTIME_MODES = new Set(['instance', 'variant']);
export const BINDING_MODES = ['instance', 'variant', 'partOf', 'zoneNode', 'embedded', 'actor'];
export const VIGNETTE_IDS = ['vig_kneeler', 'vig_yard_bell', 'vig_tamper', 'vig_dowser', 'vig_watcher'];
export const RIDE_IDS = ['ride_lift_hall', 'ride_proving_lift'];
/** CLAUDE.md hard caps. A tier in the manifest may be stricter, never looser. */
export const CAPS = { low: { typical: 100, worst: 150, triangles: 120000, textureMB: 64 }, high: { typical: 220, worst: 220, triangles: 400000, textureMB: 128 } };

// =====================================================================================================
// Shared model
// =====================================================================================================

/** The bindings a layout marker resolves to. A door marker is bound once, through `door` (its params.interactable is not a second binding). */
export function markerBindings(M, m) {
  const B = M.bindings, p = m.params ?? {}, out = [];
  const add = (group, key) => { for (const bind of asList(B[group]?.[key])) out.push({ group, key, bind }); };
  // an enemy_spawn resolves only its entrance: its params.prop is the hand prop of its vignette, which src/enemies attaches
  if (m.type === 'enemy_spawn') { if (p.entrance !== undefined) add('entrance', p.entrance); return out; }
  if (m.type === 'door') add('door', m.id);
  else if (m.type === 'puzzle_element' && p.interactable === undefined) add('puzzleElement', m.id);
  if (m.type !== 'door' && p.interactable !== undefined) add('interactable', p.interactable);
  if (p.pickup !== undefined) add('pickup', p.pickup);
  if (p.readable !== undefined) add('readable', p.readable);
  if (p.prop !== undefined) add('prop', p.prop);
  return out;
}

/** asset-local vector -> world delta for a marker (assets face +Z; a marker's rotY 0 faces -Z: rotation.y = rotY + 180 degrees) */
export function rotateLocal(rotYDeg, v) {
  const t = ((rotYDeg + 180) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
/** world position of the asset pivot for (marker, binding) */
export function pivotOf(m, bind) {
  if (bind.space === 'world') return [0, 0, 0];
  const k = bind.scale ?? 1, o = bind.offset ?? [0, 0, 0];
  const d = rotateLocal(m.rotY ?? 0, [o[0] * k, o[1] * k, o[2] * k]);
  return [m.pos[0] + d[0], m.pos[1] + d[1], m.pos[2] + d[2]];
}
/** world position of an asset-local point of the instance (marker, binding) */
export function localToWorld(m, bind, local) {
  const k = bind.scale ?? 1, p = pivotOf(m, bind), d = rotateLocal(m.rotY ?? 0, [local[0] * k, local[1] * k, local[2] * k]);
  return [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
}
/** placeholder box in asset-local space as [min, max], from its anchor */
export function placeholderLocalBox(a) {
  const [sx, sy, sz] = a.placeholder.size;
  switch (a.placeholder.anchor) {
    case 'centre': return [[-sx / 2, -sy / 2, -sz / 2], [sx / 2, sy / 2, sz / 2]];
    case 'top': return [[-sx / 2, -sy, -sz / 2], [sx / 2, 0, sz / 2]];
    case 'back': return [[-sx / 2, -sy / 2, 0], [sx / 2, sy / 2, sz]];
    case 'back_base': return [[-sx / 2, 0, 0], [sx / 2, sy, sz]];
    case 'hinge': return [[0, 0, -sz / 2], [sx, sy, sz / 2]];
    default: return [[-sx / 2, 0, -sz / 2], [sx / 2, sy, sz / 2]];   // base, sill
  }
}
/** world AABB of the placeholder of (marker, binding) */
export function placeholderWorldBox(M, m, bind) {
  const [lo, hi] = placeholderLocalBox(M.assets[bind.asset]);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
    const w = localToWorld(m, bind, [x, y, z]);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
  }
  return { min, max };
}

const inBox = (p, box) => p[0] >= box.min[0] && p[0] <= box.max[0] && p[1] >= box.min[1] - 0.5 && p[1] <= box.max[1] + 0.5 && p[2] >= box.min[2] && p[2] <= box.max[2];

/** every combination of door states and flags a cell's conditions name: [{ on: condition[], label }] */
export function conditionStates(conds) {
  const keys = [...new Set(conds.map((c) => (c.door ? `door:${c.door}` : `flag:${c.flag}`)))];
  const out = [];
  for (let mask = 0; mask < (1 << keys.length); mask++) {
    const value = Object.fromEntries(keys.map((k, i) => [k, Boolean(mask & (1 << i))]));   // door: true = not closed; flag: true = set
    const on = conds.filter((c) => (c.door ? value[`door:${c.door}`] === (c.state === 'not_closed') : value[`flag:${c.flag}`] === c.value));
    const label = keys.map((k) => `${k.slice(5)} ${k.startsWith('door') ? (value[k] ? 'open' : 'closed') : (value[k] ? 'set' : 'unset')}`).join(', ') || 'always';
    out.push({ on, label });
  }
  return out;
}

/**
 * Everything the visibility rules allow to be drawn from one cell, whatever the camera faces.
 * Needs M.assets, M.bindings, M.tiers, M.allowances, M.zones[z].dressing, M.visibility.units and the layout.
 * Returns the heaviest state: { when, staticTris, dynamicTris, triangles, parts, drawCalls: { typical, worst } }.
 */
export function cellBudget(M, L, cell) {
  const A = M.assets, U = M.visibility.units, ALLOW = M.allowances, B = M.bindings;
  const markerById = new Map(L.markers.map((m) => [m.id, m]));
  const enemyAsset = (kind) => A[B.enemy[kind].asset];
  const encountersOf = (zone) => L.encounters.filter((e) => e.zone === zone);
  const membersOf = (e) => {
    const pool = [];
    for (const [kind, n] of Object.entries(e.composition)) { const a = enemyAsset(kind); const count = typeof n === 'number' ? n : e.maxAlive; for (let i = 0; i < count; i++) pool.push(a); }
    return pool.sort((x, y) => y.triBudget - x.triBudget);
  };
  const loadOf = (list) => ({ tris: list.reduce((n, a) => n + a.triBudget, 0), calls: list.reduce((n, a) => n + a.drawCalls, 0) });
  const liveLoad = (encs) => {
    const options = encs.map((e) => loadOf(membersOf(e).slice(0, e.maxAlive)));
    for (const o of ALLOW.overlaps ?? []) {
      const both = encs.filter((e) => o.encounters.includes(e.id));
      if (both.length > 1) options.push(loadOf(both.flatMap((e) => membersOf(e).slice(0, e.maxAlive)).sort((x, y) => y.triBudget - x.triBudget).slice(0, ALLOW.liveCap)));
    }
    return options.sort((x, y) => y.tris - x.tris)[0] ?? { tris: 0, calls: 0 };
  };
  const bodiesOf = (e) => Object.entries(e.composition).reduce((n, [kind, c]) => n + (kind === 'bider' ? (typeof c === 'number' ? c : ALLOW.bossAddBodies) : 0), 0);
  const hasProjectiles = (zone) => encountersOf(zone).some((e) => 'transit' in e.composition || 'windlass' in e.composition);
  const zoneNodeCalls = (zone) => { const a = Object.values(A).find((x) => x.zone === zone && x.chunks); return a ? a.drawCalls - a.chunks.reduce((n, c) => n + c.drawCalls, 0) : 0; };
  const zoneChunkTris = (zone) => Object.values(U).filter((u) => u.zone === zone && u.box).reduce((n, u) => n + u.tris, 0);

  const states = [];
  for (const { on, label } of conditionStates(cell.showIf ?? [])) {
    const visible = [...new Set([...cell.show, ...on.flatMap((c) => c.units)])];
    const excluded = new Set(on.flatMap((c) => c.notDuring ?? []));
    const zonesSeen = [...new Set(visible.map((u) => U[u].zone).filter(Boolean))];
    /** is a layout position inside a visible chunk of its zone? (`high` shells hold no markers) */
    const seen = (zone, pos) => visible.some((u) => U[u].zone === zone && U[u].part !== 'high' && (!U[u].box || inBox(pos, U[u].box)));
    const staticTris = visible.reduce((n, u) => n + U[u].tris, 0);
    const staticCalls = visible.reduce((n, u) => n + U[u].drawCalls, 0) + zonesSeen.reduce((n, z) => n + zoneNodeCalls(z), 0);
    // runtime props standing in a visible chunk (a variant instance is budgeted at the whole asset: conservative)
    let propTris = 0, propCalls = 0;
    const seenSets = new Set();
    for (const m of L.markers) {
      if (!zonesSeen.includes(m.zone) || !seen(m.zone, m.pos)) continue;
      for (const { bind } of markerBindings(M, m)) {
        if (!RUNTIME_MODES.has(bind.mode)) continue;
        const a = A[bind.asset], count = bind.per === 'seats' ? (m.params.seats?.length ?? 1) : 1;
        propTris += a.triBudget * count;
        if (!a.instanced) propCalls += a.drawCalls;
        else { const k = `${bind.asset}/${bind.node ?? ''}`; if (!seenSets.has(k)) { seenSets.add(k); propCalls += 1; } }
      }
    }
    // dressing in proportion to the share of the zone's chunks that is visible
    const share = (z) => visible.filter((u) => U[u].zone === z && U[u].box).reduce((n, u) => n + U[u].tris, 0) / zoneChunkTris(z);
    const dressTris = Math.round(zonesSeen.reduce((n, z) => n + M.zones[z].dressing.tris * share(z), 0));
    const dressCalls = zonesSeen.reduce((n, z) => n + M.zones[z].dressing.drawCalls, 0);
    // enemies: an encounter of another zone counts only if one of its spawn markers stands in a visible chunk
    const relevant = zonesSeen.flatMap(encountersOf).filter((e) => e.zone === cell.zone || e.waves.some((w) => w.spawns.some((id) => { const m = markerById.get(id); return m && seen(m.zone, m.pos); })));
    const live = liveLoad(relevant.filter((e) => !excluded.has(e.id)));
    const actors = L.markers.filter((m) => zonesSeen.includes(m.zone) && m.params?.prop && B.prop[m.params.prop]?.mode === 'actor' && seen(m.zone, m.pos)).map((m) => A[B.prop[m.params.prop].asset]);
    const actorTris = actors.reduce((n, a) => n + a.triBudget, 0), actorCalls = actors.reduce((n, a) => n + a.drawCalls, 0);
    const bodies = relevant.reduce((n, e) => n + bodiesOf(e), 0);
    const bodyTris = bodies * ALLOW.staticBodyTris, bodyCalls = bodies ? ALLOW.staticBodyDrawCalls : 0;
    const proj = zonesSeen.some(hasProjectiles);
    const dynamicTris = Math.round(ALLOW.gunTris + ALLOW.fxTris + ALLOW.pickupDropTris + propTris + dressTris + live.tris + actorTris + bodyTris + (proj ? ALLOW.projectileTris : 0));
    const baseCalls = ALLOW.skyDrawCalls + M.tiers.low.fullScreenDraws + ALLOW.gunDrawCalls + staticCalls + propCalls + dressCalls + actorCalls + bodyCalls + (proj ? ALLOW.projectileDrawCalls : 0);
    states.push({
      when: label, staticTris, dynamicTris, triangles: staticTris + dynamicTris,
      parts: { props: Math.round(propTris), dressing: dressTris, live: live.tris, actors: actorTris, bodies: bodyTris },
      callParts: { fixed: ALLOW.skyDrawCalls + M.tiers.low.fullScreenDraws + ALLOW.gunDrawCalls, static: staticCalls, props: propCalls, dressing: dressCalls, enemies: live.calls + actorCalls, bodies: bodyCalls, projectiles: proj ? ALLOW.projectileDrawCalls : 0, fx: ALLOW.fxDrawCalls.worst },
      drawCalls: { typical: baseCalls + Math.ceil(live.calls / 2) + ALLOW.fxDrawCalls.typical, worst: baseCalls + live.calls + ALLOW.fxDrawCalls.worst },
    });
  }
  const top = states.reduce((a, s) => (s.triangles > a.triangles ? s : a));
  return { ...top, drawCalls: { typical: Math.max(...states.map((s) => s.drawCalls.typical)), worst: Math.max(...states.map((s) => s.drawCalls.worst)) } };
}

/** per-tier render-target bytes at the tier's largest buffer */
export function renderTargetBytes(tier) {
  const perPixel = tier.targets.reduce((n, x) => n + x.bytesPerPixel, 0);
  return Math.round(perPixel * tier.maxBufferPixels + (tier.fixed ?? []).reduce((n, x) => n + x.bytes, 0));
}

// ---------------------------------------------------------------- blockout line of sight (for the visibility cells)
class Blockout {
  constructor(L, set) {
    const zoneSet = new Map(L.zones.map((z) => [z.id, z.set]));
    // a door between two resident sets is shut whenever only one of them is resident: it occludes
    const shutDoors = L.markers
      .filter((m) => m.type === 'door' && m.size && (m.params.connects ?? []).some((z) => zoneSet.get(z) === set) && (m.params.connects ?? []).some((z) => zoneSet.get(z) !== set))
      .map((m) => (m.params.kind === 'hatch'
        ? { id: m.id, shape: 'box', pos: [m.pos[0], m.pos[1] + m.size[1] / 2, m.pos[2]], size: m.size, rotY: m.rotY }
        : { id: m.id, shape: 'box', pos: [m.pos[0], m.pos[1] + m.size[1] / 2, m.pos[2]], size: m.size, rotY: m.rotY }));
    this.solids = [...L.solids, ...shutDoors]
      .filter((s) => (s.zone === undefined || zoneSet.get(s.zone) === set || s.sets?.includes(set)) && !s.grille && !s.seeThrough && !s.invisible && !s.playerOnly && !s.dynamic)
      .map((s) => { const bb = aabb(s); return { s, bb, step: Math.max(0.04, Math.min(0.25, Math.min(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) / 2)) }; });
  }
  inside(s, x, y, z) { if (y <= bottomOf(s)) return false; const t = topAt(s, x, z, 0); return t !== null && y < t; }
  /** true when nothing solid lies strictly between a and b */
  clear(a, b) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) return true;
    for (const { s, bb, step } of this.solids) {
      let t0 = 0, t1 = 1, miss = false;
      for (let i = 0; i < 3 && !miss; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (a[i] < bb.min[i] || a[i] > bb.max[i]) miss = true; continue; }
        let u0 = (bb.min[i] - a[i]) / d[i], u1 = (bb.max[i] - a[i]) / d[i];
        if (u0 > u1) [u0, u1] = [u1, u0];
        t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
        if (t0 > t1) miss = true;
      }
      if (miss) continue;
      const n = Math.max(1, Math.ceil(((t1 - t0) * len) / step));
      for (let i = 0; i <= n; i++) {
        const t = t0 + ((t1 - t0) * i) / n;
        if (t <= 0.002 || t >= 0.998) continue;
        if (this.inside(s, a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t)) return false;
      }
    }
    return true;
  }
}
const every = (list, max) => { if (!(max < list.length)) return list; const k = list.length / max; return Array.from({ length: max }, (_, i) => list[Math.floor(i * k)]); };

/** the cell a position of `zone` falls in (first match in order; a cell without a box is the zone default) */
export function cellAt(M, zone, pos) {
  const inside = (b) => pos.every((v, i) => v >= b.min[i] && v <= b.max[i]);
  return M.visibility.cells.find((c) => c.zone === zone && (!c.box || inside(c.box)));
}

/** nav nodes the player can stand on while in a cell: the zone's own, plus seam nodes resident in the zone's set */
export function cellNodes(M, L, cell, max = Infinity) {
  const z = L.zones.find((x) => x.id === cell.zone);
  const inZone = (p) => p.every((v, i) => v >= z.bounds.min[i] && v <= z.bounds.max[i]);
  return every(L.nav.nodes.filter((n) => (n.zone === cell.zone || (n.sets?.includes(z.set) && inZone(n.pos))) && cellAt(M, cell.zone, n.pos)?.id === cell.id), max);
}

/**
 * For each cell: which units of its resident set can be seen from it in the blockout, by sampled rays.
 * Returns [{ cell, unit, seen, rays }]. A hidden unit with seen > 0 is a pop-in risk.
 */
export function blockoutVisibility(M, L, { maxEyes = 30, maxTargets = 90 } = {}) {
  const U = M.visibility.units, zoneSet = new Map(L.zones.map((z) => [z.id, z.set]));
  const worlds = new Map();
  const world = (set) => { if (!worlds.has(set)) worlds.set(set, new Blockout(L, set)); return worlds.get(set); };
  const targetsOf = (unit) => {
    const u = U[unit], pts = [];
    if (!u.box) return pts;
    const exterior = L.zones.find((z) => z.id === u.zone)?.kind === 'exterior';   // the tops of an interior's walls are not part of it
    const solids = L.solids.filter((s) => s.zone === u.zone && inBox(s.pos, u.box) && !s.invisible && !s.dynamic);
    const tops = (list) => { for (const s of list) { const bb = aabb(s), y = bb.max[1] + 0.05, i = 0.1; pts.push([(bb.min[0] + bb.max[0]) / 2, y, (bb.min[2] + bb.max[2]) / 2], [bb.min[0] + i, y, bb.min[2] + i], [bb.max[0] - i, y, bb.min[2] + i], [bb.min[0] + i, y, bb.max[2] - i], [bb.max[0] - i, y, bb.max[2] - i]); } };
    if (u.solids) tops(L.solids.filter((s) => u.solids.includes(s.id)));
    else if (u.part === 'high') tops(solids.filter((s) => s.size[1] >= 3.3 && s.role !== 'floor' && s.role !== 'ceiling' && s.shape !== 'ramp'));
    else {
      for (const n of every(L.nav.nodes.filter((n) => n.zone === u.zone && inBox(n.pos, u.box)), 40)) pts.push([n.pos[0], n.pos[1] + 0.3, n.pos[2]], [n.pos[0], n.pos[1] + 2.5, n.pos[2]]);
      if (u.part !== 'low' && exterior) tops(every(solids.filter((s) => s.role !== 'floor' && s.role !== 'ceiling').sort((x, y) => y.size[1] - x.size[1]), 24));
    }
    return every(pts, maxTargets);
  };
  const out = [];
  for (const cell of M.visibility.cells) {
    const set = zoneSet.get(cell.zone), w = world(set);
    const eyes = cellNodes(M, L, cell, maxEyes).flatMap((n) => {
      const stand = [n.pos[0], n.pos[1] + 1.65, n.pos[2]], jump = [n.pos[0], n.pos[1] + 2.65, n.pos[2]];
      return w.clear(stand, jump) ? [stand, jump] : [stand];
    });
    for (const [unit, u] of Object.entries(U)) {
      if (!u.box || zoneSet.get(u.zone) !== set) continue;
      const targets = targetsOf(unit);
      let seen = 0;
      for (const e of eyes) for (const t of targets) if (w.clear(e, t)) seen++;
      out.push({ cell: cell.id, unit, seen, rays: eyes.length * targets.length });
    }
  }
  return out;
}

// =====================================================================================================
// Validation
// =====================================================================================================
function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes('--quiet');
  const checkFiles = args.includes('--files');
  const argPath = (name, fallback) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? path.resolve(a.slice(name.length + 3)) : path.join(ROOT, fallback); };
  const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

  let M, L;
  try {
    M = readJson(argPath('manifest', 'design/assets.json'));
    L = readJson(argPath('layout', 'design/layout.json'));
  } catch (e) {
    console.error('FAIL: cannot parse design JSON: ' + e.message);
    process.exit(1);
  }

  const errors = [], checks = [], infos = [];
  let current = '';
  const err = (m) => errors.push(`[${current}] ${m}`);
  const info = (m) => infos.push(m);
  function check(name, fn) {
    current = name; const before = errors.length;
    try { fn(); } catch (e) { err('validator crashed: ' + e.stack); }
    checks.push({ name, ok: errors.length === before, n: errors.length - before });
  }

  const A = M.assets ?? {}, T = M.textures ?? {}, B = M.bindings ?? {}, U = M.visibility?.units ?? {}, CELLS = M.visibility?.cells ?? [];
  const OWNERS = new Set(M.meta?.owners ?? []);
  const CATEGORIES = new Set(M.meta?.categories ?? []);
  const BAKES = new Set(M.meta?.enums?.bake ?? []);
  const PLACED = new Set(Object.keys(M.meta?.enums?.placedBy ?? {}));
  const SHAPES = new Set(M.meta?.enums?.placeholderShape ?? []);
  const ANCHORS = new Set(Object.keys(M.meta?.enums?.placeholderAnchor ?? {}));
  const SETS = new Set(['surface', 'underground', 'coda']);
  const MATERIALS = new Set(['m_frontier', 'm_pellam', 'm_sand', 'm_flat', 'm_mask', 'm_emis', 'm_prop', 'm_gun', 'm_hands']);
  const CHUNK_MATERIALS = new Set(['m_sand', 'm_frontier', 'm_pellam', 'm_mask', 'm_emis']);   // m_flat and m_prop are folded into these (ARCHITECTURE 7.5)
  const NAME_RE = /^[a-z][a-z0-9_]*$/;            // snake_case, no dots or spaces (GLTFLoader would rename them)
  const zoneIds = new Set(L.zones.map((z) => z.id));
  const zoneById = new Map(L.zones.map((z) => [z.id, z]));
  const markerById = new Map(L.markers.map((m) => [m.id, m]));
  const clipNames = (id) => new Set((A[id]?.animations ?? []).map((c) => c.name));
  const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /** every name code may look up on an asset: listed nodes plus bones */
  const nodeNames = (id) => new Set([...(A[id]?.nodes ?? []), ...(A[id]?.bones ?? [])]);

  // ---------------------------------------------------------------- 1. schema
  check('asset schema', () => {
    if (Object.keys(A).length === 0) err('no assets');
    for (const [id, a] of Object.entries(A)) {
      const at = `asset ${id}`;
      if (!NAME_RE.test(id)) err(`${at}: id must be snake_case`);
      if (!CATEGORIES.has(a.category)) err(`${at}: unknown category "${a.category}"`);
      if (!OWNERS.has(a.owner)) err(`${at}: unknown owner "${a.owner}"`);
      const folder = M.meta?.ownerFolders?.[a.owner];
      if (!folder) err(`${at}: owner "${a.owner}" has no folder in meta.ownerFolders`);
      else if (!String(a.source).startsWith(folder + '/')) err(`${at}: source "${a.source}" is outside its owner's folder ${folder}/`);
      if (a.path !== `assets/${a.category}/${id}.glb`) err(`${at}: path must be assets/${a.category}/${id}.glb, got "${a.path}"`);
      if (![0, 1, 2].includes(a.priority)) err(`${at}: priority must be 0, 1 or 2`);
      if (!Number.isInteger(a.triBudget) || a.triBudget <= 0) err(`${at}: triBudget must be a positive integer`);
      if (!Number.isInteger(a.drawCalls) || a.drawCalls < 1) err(`${at}: drawCalls must be an integer >= 1`);
      if (!BAKES.has(a.bake)) err(`${at}: unknown bake class "${a.bake}"`);
      if (!PLACED.has(a.placedBy)) err(`${at}: unknown placedBy "${a.placedBy}"`);
      if (typeof a.instanced !== 'boolean' || typeof a.lightmapped !== 'boolean' || typeof a.skinned !== 'boolean') err(`${at}: instanced, lightmapped, skinned must be booleans`);
      if (!(a.collision === 'none' || a.collision === 'box' || a.collision === 'mesh' || /^separate:[a-z0-9_]+$/.test(a.collision))) err(`${at}: bad collision "${a.collision}"`);
      if (a.collision?.startsWith('separate:') && !A[a.collision.slice(9)]) err(`${at}: collision asset "${a.collision.slice(9)}" is not in the manifest`);
      if (a.zone !== null && !zoneIds.has(a.zone)) err(`${at}: zone "${a.zone}" is not a layout zone`);
      if (!Array.isArray(a.sets) || a.sets.length === 0 || a.sets.some((s) => !SETS.has(s))) err(`${at}: sets must be a non-empty subset of surface/underground/coda`);
      if (a.zone) { const zs = zoneById.get(a.zone)?.set; if (a.sets.length !== 1 || a.sets[0] !== zs) err(`${at}: zone ${a.zone} is in set ${zs} but asset sets are ${a.sets}`); }
      for (const m of a.materials ?? []) if (!MATERIALS.has(m)) err(`${at}: unknown material "${m}"`);
      if (!a.materials?.length) err(`${at}: materials missing`);
      // nodes, bones, lamp sets
      const seen = new Set();
      for (const n of a.nodes ?? []) { if (!NAME_RE.test(n)) err(`${at}: node "${n}" must be snake_case`); if (seen.has(n)) err(`${at}: duplicate node "${n}"`); seen.add(n); }
      if (a.skinned && !(a.bones?.length)) err(`${at}: skinned assets must list bones`);
      if (!a.skinned && a.bones) err(`${at}: bones listed on a non-skinned asset`);
      const boneSeen = new Set();
      for (const n of a.bones ?? []) { if (!NAME_RE.test(n)) err(`${at}: bone "${n}" must be snake_case`); if (boneSeen.has(n)) err(`${at}: duplicate bone "${n}"`); boneSeen.add(n); }
      for (const [n, count] of Object.entries(a.lampSets ?? {})) {
        if (!seen.has(n)) err(`${at}: lamp set "${n}" is not listed in nodes`);
        if (!Number.isInteger(count) || count < 1 || count > 64) err(`${at}: lamp set "${n}" count must be 1..64`);
        if (!a.materials.includes('m_emis')) err(`${at}: lamp sets need material m_emis`);
      }
      for (const n of a.codeDriven ?? []) if (!nodeNames(id).has(n)) err(`${at}: codeDriven "${n}" is neither a node nor a bone`);
      for (const [n, p] of Object.entries(a.nodePos ?? {})) {
        if (!nodeNames(id).has(n)) err(`${at}: nodePos "${n}" is neither a node nor a bone`);
        if (!isVec3(p)) err(`${at}: nodePos.${n} must be [x, y, z]`);
      }
      if (a.hitPoint !== undefined && !isVec3(a.hitPoint)) err(`${at}: hitPoint must be [x, y, z]`);
      // draw calls: one per non-emissive material, one per lamp set (or one for a static emissive part); zone assets by their chunk plan
      if (!a.chunks) {
        const lampSets = Object.keys(a.lampSets ?? {}).length;
        const need = a.materials.filter((m) => m !== 'm_emis').length + (a.materials.includes('m_emis') ? Math.max(1, lampSets) : 0);
        if (a.drawCalls < need) err(`${at}: drawCalls ${a.drawCalls} is below what its materials and lamp sets need (${need})`);
      }
      // animations
      const cn = new Set();
      for (const c of a.animations ?? []) {
        if (!NAME_RE.test(c.name ?? '')) err(`${at}: clip name "${c.name}" must be snake_case`);
        if (cn.has(c.name)) err(`${at}: duplicate clip "${c.name}"`); cn.add(c.name);
        if (typeof c.loop !== 'boolean') err(`${at}: clip ${c.name}: loop must be boolean`);
        if (!(c.seconds > 0)) err(`${at}: clip ${c.name}: seconds must be > 0`);
        if (![0, 1, 2].includes(c.priority)) err(`${at}: clip ${c.name}: priority must be 0, 1 or 2`);
        if (c.priority < a.priority) err(`${at}: clip ${c.name}: priority ${c.priority} is above its asset's (${a.priority})`);
      }
      for (const c of a.animations ?? []) {
        if (c.fallback === undefined) continue;
        if (c.priority !== 2) err(`${at}: clip ${c.name}: only a priority 2 clip may name a fallback`);
        const f = (a.animations ?? []).find((x) => x.name === c.fallback);
        if (!f) err(`${at}: clip ${c.name}: fallback "${c.fallback}" is not a clip of this asset`);
        else if (f.priority === 2) err(`${at}: clip ${c.name}: fallback "${c.fallback}" is itself priority 2`);
      }
      if (a.instanced && (a.skinned || (a.animations?.length ?? 0) > 0)) err(`${at}: instanced assets cannot be skinned or animated`);
      if (a.instanced && a.drawCalls !== 1) err(`${at}: instanced assets must be one draw call`);
      // lightmaps
      if (a.lightmapped !== ((a.lightmaps?.length ?? 0) > 0)) err(`${at}: lightmapped must equal "has lightmaps"`);
      for (const t of [...(a.lightmaps ?? []), ...(a.lightLayers ?? [])]) {
        if (!T[t]) err(`${at}: lightmap "${t}" is not in textures`);
        else if (!a.sets.every((s) => T[t].sets.includes(s))) err(`${at}: lightmap "${t}" is not resident in the asset's sets`);
      }
      for (const t of a.lightmaps ?? []) if (T[t] && T[t].kind !== 'lightmap') err(`${at}: "${t}" is not kind lightmap`);
      for (const t of a.lightLayers ?? []) if (T[t] && T[t].kind !== 'lightlayer') err(`${at}: "${t}" is not kind lightlayer`);
      // placeholder
      const p = a.placeholder;
      if (!p || !SHAPES.has(p.shape)) err(`${at}: placeholder.shape must be box, capsule or cylinder`);
      if (!Array.isArray(p?.size) || p.size.length !== 3 || p.size.some((v) => !(v > 0))) err(`${at}: placeholder.size must be three positive numbers`);
      if (!ANCHORS.has(p?.anchor)) err(`${at}: placeholder.anchor "${p?.anchor}" is not one of ${[...ANCHORS].join(', ')}`);
      if ((a.placedBy === 'origin') !== (p?.anchor === 'world') && !(p?.anchor === 'world' && a.placedBy === 'layout')) err(`${at}: placeholder.anchor "world" belongs to assets authored in world coordinates (placedBy origin, or a layout binding with space "world")`);
    }
  });

  check('zone chunk plans', () => {
    const chunkIds = new Set();
    for (const z of L.zones) {
      const envs = Object.entries(A).filter(([, a]) => a.zone === z.id && a.chunks);
      if (envs.length !== 1) { err(`zone ${z.id}: exactly one asset with a chunk plan is required, found ${envs.length}`); continue; }
      const [id, a] = envs[0];
      if (a.placedBy !== 'origin' || a.category !== 'env') err(`asset ${id}: a chunked zone asset must be category env, placedBy origin`);
      if (a.chunks.reduce((n, c) => n + c.tris, 0) !== a.triBudget) err(`asset ${id}: triBudget ${a.triBudget} is not the sum of its chunks`);
      const drawn = (a.drawnNodes ?? []).length;
      for (const n of a.drawnNodes ?? []) if (!a.nodes.includes(n)) err(`asset ${id}: drawnNodes "${n}" is not listed in nodes`);
      for (const n of [...Object.keys(a.lampSets ?? {}), ...(a.codeDriven ?? [])]) if (!(a.drawnNodes ?? []).includes(n)) err(`asset ${id}: "${n}" is a lamp set or a code-driven mesh and must be listed in drawnNodes`);
      const calls = a.chunks.reduce((n, c) => n + c.drawCalls, 0) + drawn;
      if (a.drawCalls !== calls) err(`asset ${id}: drawCalls ${a.drawCalls} must be chunk materials (${calls - drawn}) + drawn named nodes (${drawn})`);
      if (a.drawCalls > 16) err(`asset ${id}: ${a.drawCalls} draw calls: a zone GLB may not exceed 16`);
      for (const c of a.chunks) {
        const at = `asset ${id} chunk ${c.id}`;
        if (!/^chunk_[a-z0-9_]+$/.test(c.id)) err(`${at}: id must be chunk_<name>`);
        if (chunkIds.has(c.id)) err(`${at}: duplicate chunk id`); chunkIds.add(c.id);
        if (!Number.isInteger(c.tris) || c.tris <= 0) err(`${at}: tris must be a positive integer`);
        if (!c.materials?.length || c.materials.length > 4) err(`${at}: a chunk has 1 to 4 materials`);
        for (const m of c.materials ?? []) if (!CHUNK_MATERIALS.has(m)) err(`${at}: material "${m}" is not allowed in a zone chunk (fold m_flat / m_prop into the structure material)`);
        if (c.drawCalls !== c.materials.length) err(`${at}: drawCalls must equal the number of materials`);
        if (!isVec3(c.box?.min) || !isVec3(c.box?.max) || c.box.min.some((v, i) => v >= c.box.max[i])) err(`${at}: box must be {min, max}`);
        if (c.part !== undefined && !['high', 'low'].includes(c.part)) err(`${at}: part must be "high" or "low"`);
        for (const sid of c.solids ?? []) if (!L.solids.some((s) => s.id === sid && s.zone === z.id)) err(`${at}: solids names "${sid}", which is not a solid of zone ${z.id}`);
        if (c.solids && c.part !== 'high') err(`${at}: a chunk built over named solids is a skyline chunk (part "high")`);
        for (const m of c.materials ?? []) if (!a.materials.includes(m)) err(`${at}: material "${m}" is missing from the asset's materials`);
      }
      // every solid and nav node of the zone must fall in a chunk that can hold it
      const holds = a.chunks.filter((c) => c.part !== 'high');
      for (const n of L.nav.nodes) if (n.zone === z.id && !holds.some((c) => inBox(n.pos, c.box))) err(`asset ${id}: nav node ${n.id} of zone ${z.id} is in no chunk box`);
      for (const s of L.solids) if (s.zone === z.id && !s.invisible && !a.chunks.some((c) => inBox(s.pos, c.box))) err(`asset ${id}: solid ${s.id} of zone ${z.id} is in no chunk box`);
      if (!M.zones?.[z.id] || JSON.stringify(M.zones[z.id].chunks) !== JSON.stringify(a.chunks.map((c) => c.id))) err(`zones.${z.id}.chunks does not match ${id}`);
    }
  });

  check('texture schema', () => {
    for (const [id, t] of Object.entries(T)) {
      const at = `texture ${id}`;
      if (!NAME_RE.test(id)) err(`${at}: id must be snake_case`);
      if (!OWNERS.has(t.owner)) err(`${at}: unknown owner "${t.owner}"`);
      if (!/^assets\/(tex|lm)\/[a-z0-9_]+\.webp$/.test(t.path ?? '')) err(`${at}: bad path "${t.path}"`);
      if (path.basename(t.path ?? '', '.webp') !== id) err(`${at}: file name must equal the id`);
      if (!['r8', 'rgba8'].includes(t.format)) err(`${at}: format must be r8 or rgba8`);
      if (!Array.isArray(t.size) || t.size.some((v) => !Number.isInteger(v) || (v & (v - 1)) !== 0)) err(`${at}: size must be powers of two`);
      if (!Array.isArray(t.sets) || t.sets.some((s) => s !== 'always' && !SETS.has(s))) err(`${at}: bad sets`);
      if (t.kind === 'lightmap' || t.kind === 'lightlayer') {
        if (t.mips !== false || t.uv !== 1) err(`${at}: lightmaps need mips false and uv 1`);
        if (t.lightmapScale !== M.meta?.vertexLightScale) err(`${at}: lightmapScale must equal meta.vertexLightScale (${M.meta?.vertexLightScale}) so the neutral texel displays vertex light unchanged`);
        if (!t.neutralTexel || t.neutralTexel.value !== (t.kind === 'lightmap' ? 1 : 0)) err(`${at}: neutralTexel must be declared (value 1 on lightmaps, 0 on light layers)`);
      }
      if (t.kind === 'detail' && t.usedBy?.some((m) => m === 'm_frontier' || m === 'm_pellam') && !t.regions?.includes('flat')) err(`${at}: structure trim sheets need a "flat" region`);
      const bytes = t.size[0] * t.size[1] * (t.format === 'r8' ? 1 : 4) * (t.mips ? 4 / 3 : 1);
      if (Math.abs(bytes - t.gpuBytes) > 2) err(`${at}: gpuBytes ${t.gpuBytes} does not match size/format/mips (${Math.round(bytes)})`);
    }
  });

  // ---------------------------------------------------------------- 2. tiers and memory
  check('tiers and memory', () => {
    const tiers = M.tiers ?? {};
    for (const name of ['min', 'low', 'high']) if (!tiers[name]) err(`tiers.${name} missing`);
    if (Object.keys(tiers).length !== 3) err(`tiers must be exactly min, low, high (CLAUDE.md and the options menu define Low and High; min is hidden)`);
    for (const [name, t] of Object.entries(tiers)) {
      const cap = name === 'high' ? CAPS.high : CAPS.low;
      if (renderTargetBytes(t) !== t.renderTargetBytes) err(`tiers.${name}.renderTargetBytes is stale`);
      if (t.textureBudgetMB > cap.textureMB) err(`tiers.${name}.textureBudgetMB exceeds the ${cap.textureMB} MB cap`);
      if (t.triangles > cap.triangles) err(`tiers.${name}.triangles exceeds the cap`);
      if (t.drawCalls.typical > cap.typical || t.drawCalls.worst > cap.worst) err(`tiers.${name}.drawCalls exceeds the cap`);
      if (!(t.maxBufferPixels > 0) || !(t.maxBufferHeight > 0) || t.minPixelRatio > t.maxPixelRatio) err(`tiers.${name}: bad buffer limits`);
      if (t.userSelectable !== (name !== 'min')) err(`tiers.${name}.userSelectable must be ${name !== 'min'}`);
      if (t.composer === false && (t.bloom || t.targets.some((x) => /RGBA16F/.test(x.name)))) err(`tiers.${name}: a tier without the composer has no scene buffers or bloom`);
    }
    const always = Object.values(T).filter((t) => t.sets.includes('always')).reduce((n, t) => n + t.gpuBytes, 0);
    for (const s of SETS) {
      const own = Object.values(T).filter((t) => t.sets.includes(s)).reduce((n, t) => n + t.gpuBytes, 0);
      if (M.sets?.[s] && M.sets[s].textureBytes !== own) err(`sets.${s}.textureBytes is stale`);
    }
    const stages = M.stages ?? [];
    for (const s of SETS) if (!stages.some((x) => x.resident === s && !x.staged)) err(`stages: no plain stage for set ${s}`);
    for (const st of stages) {
      const own = Object.values(T).filter((t) => t.sets.includes(st.resident)).reduce((n, t) => n + t.gpuBytes, 0);
      const extra = (st.staged?.textures ?? []).reduce((n, id) => n + (T[id]?.gpuBytes ?? NaN), 0);
      const bytes = always + own + extra;
      if (bytes !== st.textureBytes) err(`stages.${st.id}.textureBytes is stale`);
      for (const id of st.staged?.textures ?? []) if (!T[id]) err(`stages.${st.id}: staged texture "${id}" unknown`);
      for (const id of st.staged?.assets ?? []) if (!A[id]) err(`stages.${st.id}: staged asset "${id}" unknown`);
      for (const [name, t] of Object.entries(tiers)) {
        const total = (bytes + renderTargetBytes(t)) / MB;
        if (total > t.textureBudgetMB) err(`stage ${st.id}, tier ${name}: ${total.toFixed(1)} MiB of textures + render targets exceeds ${t.textureBudgetMB} MiB`);
        if (Math.abs((st.totalMB?.[name] ?? -1) - total) > 0.06) err(`stages.${st.id}.totalMB.${name} is stale`);
      }
    }
    // the seam stage must hold everything a walk down flight 1 touches
    const seam = stages.find((x) => x.staged);
    if (!seam) err('stages: the seam stage (surface resident, the_gallery staged) is missing');
    else {
      const zoneAsset = Object.entries(A).find(([, a]) => a.zone === seam.staged.zone && a.chunks)?.[0];
      if (!seam.staged.assets.includes(zoneAsset)) err(`stages.${seam.id}: staged assets must include ${zoneAsset}`);
      for (const t of A[zoneAsset]?.lightmaps ?? []) if (!seam.staged.textures.includes(t)) err(`stages.${seam.id}: staged textures must include ${t}`);
      for (const m of L.markers) if (m.zone === seam.staged.zone) for (const { bind } of markerBindings(M, m)) {
        if (RUNTIME_MODES.has(bind.mode) && !A[bind.asset].sets.includes(seam.resident) && !seam.staged.assets.includes(bind.asset)) err(`stages.${seam.id}: ${bind.asset} (marker ${m.id}) is neither resident nor staged`);
      }
    }
  });

  // ---------------------------------------------------------------- 3. bindings
  const allBindings = [];
  for (const [group, table] of Object.entries(B)) for (const [key, v] of Object.entries(table)) for (const bind of asList(v)) allBindings.push({ group, key, bind, where: `bindings.${group}.${key}` });
  /** the instance binding a marker owns for an asset (partOf / follow owners) */
  const ownedInstance = (markerId, assetId) => {
    const m = markerById.get(markerId);
    if (!m) return null;
    const hit = markerBindings(M, m).find((x) => RUNTIME_MODES.has(x.bind.mode) && x.bind.asset === assetId);
    return hit ? { m, bind: hit.bind } : null;
  };

  check('bindings resolve', () => {
    for (const { bind, where, group } of allBindings) {
      if (!bind || typeof bind.asset !== 'string') { err(`${where}: binding must be {asset, mode, node?}, an array of them, or null`); continue; }
      const a = A[bind.asset];
      if (!a) { err(`${where}: asset "${bind.asset}" is not in the manifest`); continue; }
      if (!BINDING_MODES.includes(bind.mode)) { err(`${where}: mode "${bind.mode}" is not one of ${BINDING_MODES.join(', ')}`); continue; }
      if (bind.node && !nodeNames(bind.asset).has(bind.node)) err(`${where}: asset "${bind.asset}" has no node "${bind.node}"`);
      if (bind.offset !== undefined && !isVec3(bind.offset)) err(`${where}: offset must be [x, y, z]`);
      if (bind.scale !== undefined && !(bind.scale > 0)) err(`${where}: scale must be > 0`);
      switch (bind.mode) {
        case 'variant':
          if (!bind.node) err(`${where}: a variant binding names its variant node`);
          // falls through
        case 'instance':
          if (a.placedBy === 'zone') err(`${where}: ${bind.asset} is zone-embedded and cannot be instantiated at runtime`);
          if (a.placedBy === 'origin') err(`${where}: ${bind.asset} is a world-space asset loaded with its set; bind its nodes with mode zoneNode`);
          if ((bind.space === 'world') !== (a.placeholder.anchor === 'world')) err(`${where}: space "world" and placeholder.anchor "world" go together`);
          if (bind.mode === 'instance' && bind.node) err(`${where}: mode instance takes no node (use variant, or partOf for a part)`);
          break;
        case 'partOf':
          if (typeof bind.owner !== 'string') { err(`${where}: partOf needs owner (a layout marker id)`); break; }
          if (!markerById.has(bind.owner)) { err(`${where}: partOf owner "${bind.owner}" is not a layout marker`); break; }
          if (!ownedInstance(bind.owner, bind.asset)) err(`${where}: owner marker "${bind.owner}" does not instantiate ${bind.asset}`);
          if (bind.node && !a.nodePos?.[bind.node]) err(`${where}: partOf node "${bind.node}" needs a position in ${bind.asset}.nodePos`);
          break;
        case 'zoneNode':
          if (a.placedBy !== 'origin') err(`${where}: zoneNode needs a world-space asset (placedBy origin)`);
          if (!bind.node) err(`${where}: zoneNode names its node`);
          if (bind.index !== undefined && !(Number.isInteger(bind.index) && bind.index >= 0 && bind.index < (a.lampSets?.[bind.node] ?? 0))) err(`${where}: index ${bind.index} is outside lamp set ${bind.node}`);
          break;
        case 'embedded':
          break;
        case 'actor':
          if (!a.skinned) err(`${where}: an actor is a skinned asset spawned by src/enemies`);
          if (bind.vignette !== undefined && !VIGNETTE_IDS.includes(bind.vignette)) err(`${where}: unknown vignette "${bind.vignette}"`);
          if (bind.fallback !== undefined && !A[bind.fallback]) err(`${where}: fallback asset "${bind.fallback}" unknown`);
          break;
      }
      if (bind.follow) {
        if (!markerById.has(bind.follow.owner)) err(`${where}: follow owner "${bind.follow.owner}" is not a layout marker`);
        else {
          const owner = markerBindings(M, markerById.get(bind.follow.owner)).find((x) => RUNTIME_MODES.has(x.bind.mode) && A[x.bind.asset]?.nodePos?.[bind.follow.node]);
          if (!owner) err(`${where}: follow node "${bind.follow.node}" has no position on an instance of marker ${bind.follow.owner}`);
        }
      }
      if ((group === 'solidProp' || group === 'zoneEmbedded' || group === 'readable') && bind.mode !== 'embedded') err(`${where}: bindings.${group} entries are mode embedded`);
      if (group === 'enemy' && bind.mode !== 'actor') err(`${where}: bindings.enemy entries are mode actor`);
      if (group === 'pickup' && (bind.mode !== 'instance' || !a.instanced)) err(`${where}: pickups are instanced runtime assets`);
    }
    // every zone-embedded asset must be claimed by an embedded binding, or it would never be placed
    const claimed = new Set(allBindings.filter((x) => x.bind?.mode === 'embedded').map((x) => x.bind.asset));
    for (const [id, a] of Object.entries(A)) if (a.placedBy === 'zone' && !claimed.has(id)) err(`asset ${id} is placedBy zone but no embedded binding places it`);
    // every layout-placed asset must be reachable from a binding
    const bound = new Set(allBindings.map((x) => x.bind?.asset));
    for (const [id, a] of Object.entries(A)) if (a.placedBy === 'layout' && !bound.has(id)) err(`asset ${id} is placedBy layout but no binding references it`);
  });

  // ---------------------------------------------------------------- 4. layout references
  check('layout zones', () => {
    for (const z of L.zones) if (!Object.values(A).some((a) => a.zone === z.id && a.category === 'env' && a.placedBy === 'origin')) err(`zone ${z.id} has no env asset`);
  });

  check('layout marker params', () => {
    const need = (group, key, where) => {
      if (!B[group] || !(key in B[group])) { err(`${where}: "${key}" has no entry in bindings.${group}`); return undefined; }
      return B[group][key];
    };
    const maskRegions = new Set(T.tx_mask?.regions ?? []);
    const vignettesSeen = new Set();
    for (const m of L.markers) {
      const p = m.params ?? {}, at = `marker ${m.id}`;
      if (p.pickup !== undefined) { need('pickup', p.pickup, at); if (!A[p.pickup]) err(`${at}: pickup "${p.pickup}" is not an asset id`); }
      if (p.interactable !== undefined) need('interactable', p.interactable, at);
      if (p.readable !== undefined) need('readable', p.readable, at);
      if (p.prop !== undefined) need('prop', p.prop, at);
      if (m.type === 'door') need('door', m.id, at);
      if (m.type === 'puzzle_element' && p.interactable === undefined) need('puzzleElement', m.id, at);
      for (const k of ['pictogram', 'castRelief', 'variant']) if (p[k] !== undefined && !maskRegions.has(p[k])) err(`${at}: params.${k} "${p[k]}" is not a tx_mask region`);
      if (p.enemy !== undefined) {
        const bind = need('enemy', p.enemy, at);
        const enemyAsset = bind?.asset;
        if (enemyAsset) {
          const clips = clipNames(enemyAsset);
          for (const k of ['dormant', 'rise']) if (p[k] !== undefined && !clips.has(p[k])) err(`${at}: params.${k} "${p[k]}" is not a clip of ${enemyAsset}`);
          if (p.entrance !== undefined) {
            need('entrance', p.entrance, at);
            if (p.entrance !== 'doorway' && !clips.has(p.entrance)) err(`${at}: entrance "${p.entrance}" is not a clip of ${enemyAsset}`);
          }
        }
      }
      if (m.type === 'prop' && p.clip !== undefined) {
        const a = B.prop?.[p.prop]?.asset;
        if (a && !clipNames(a).has(p.clip)) err(`${at}: params.clip "${p.clip}" is not a clip of ${a}`);
      }
      if (m.type === 'interactable' && p.clip !== undefined && !clipNames('weapon_revolver').has(p.clip)) err(`${at}: params.clip "${p.clip}" is not a view-model clip`);
      if (p.vignette !== undefined) {
        if (!VIGNETTE_IDS.includes(p.vignette.id)) err(`${at}: params.vignette.id "${p.vignette.id}" is not a VignetteId`);
        else vignettesSeen.add(p.vignette.id);
        if (p.vignette.clip !== undefined && !['enemy_bider', 'enemy_transit', 'enemy_tamper'].some((e) => clipNames(e).has(p.vignette.clip))) err(`${at}: vignette clip "${p.vignette.clip}" is not a clip of any enemy`);
      }
      if (p.drops !== undefined && !A[p.drops] && !L.solids.some((s) => s.id === p.drops) && !markerById.has(p.drops)) err(`${at}: params.drops "${p.drops}" is neither an asset, a solid nor a marker`);
      // resident-set sanity: a runtime asset bound to this marker must be resident in every set the marker lives in
      const sets = p.sets ?? [zoneById.get(m.zone)?.set];
      for (const { bind } of markerBindings(M, m)) {
        const a = A[bind.asset];
        if (!a || !RUNTIME_MODES.has(bind.mode)) continue;
        for (const s of sets) if (!a.sets.includes(s)) err(`${at}: asset ${bind.asset} is not resident in set "${s}" (sets: ${a.sets})`);
      }
      if (p.enemy !== undefined) { const a = A[B.enemy?.[p.enemy]?.asset]; if (a && !a.sets.includes(zoneById.get(m.zone)?.set)) err(`${at}: enemy asset is not resident in the marker's set`); }
    }
    for (const id of VIGNETTE_IDS) if (!vignettesSeen.has(id)) err(`vignette ${id} is anchored by no layout marker (params.vignette.id)`);
    const rides = (L.nav.portals ?? []).map((p) => p.id);
    for (const id of RIDE_IDS) if (!rides.includes(id)) err(`nav.portals has no ride "${id}"`);
    for (const id of rides) if (!RIDE_IDS.includes(id)) err(`nav.portals ride "${id}" is not a RideId`);
  });

  check('layout solid props', () => {
    for (const s of L.solids) if (s.prop !== undefined && !(B.solidProp && s.prop in B.solidProp)) err(`solid ${s.id}: prop "${s.prop}" has no entry in bindings.solidProp`);
    for (const s of L.solids) if (s.interactable !== undefined && !(s.interactable in (B.interactable ?? {}))) err(`solid ${s.id}: interactable "${s.interactable}" has no binding`);
  });

  check('layout encounters', () => {
    for (const e of L.encounters) for (const k of Object.keys(e.composition ?? {})) if (!B.enemy?.[k]) err(`encounter ${e.id}: enemy "${k}" has no binding`);
    for (const o of M.allowances?.overlaps ?? []) for (const id of o.encounters) if (!L.encounters.some((e) => e.id === id)) err(`allowances.overlaps: unknown encounter ${id}`);
  });

  // ---------------------------------------------------------------- 5. placement: marker position versus asset pivot
  check('placement', () => {
    // support surfaces by resident set
    const zoneSetOf = (zone) => zoneById.get(zone)?.set;
    const supportAt = (set, x, z, yRef) => {
      let best = null;
      for (const s of L.solids) {
        if (s.dynamic || s.role === 'ceiling' || !(zoneSetOf(s.zone) === set || s.sets?.includes(set))) continue;
        const t = topAt(s, x, z, 0);
        if (t === null || t > yRef) continue;
        if (best === null || t > best) best = t;
      }
      return best;
    };
    const placed = [];   // { m, bind, pivot }
    for (const m of L.markers) {
      for (const { bind, group, key } of markerBindings(M, m)) {
        const a = A[bind.asset], at = `marker ${m.id} -> bindings.${group}.${key}`;
        if (!a) continue;
        if (bind.mode === 'partOf') {
          const owner = ownedInstance(bind.owner, bind.asset);
          if (!owner) continue;
          if (bind.node) {
            const p = a.nodePos?.[bind.node];
            if (!p) continue;
            const w = localToWorld(owner.m, owner.bind, p), tol = bind.tolerance ?? 0.06, d = dist(w, m.pos);
            if (d > tol) err(`${at}: node ${bind.asset}/${bind.node} of the instance at ${bind.owner} is at (${w.map((v) => v.toFixed(3)).join(', ')}), ${d.toFixed(3)} m from this marker (tolerance ${tol})`);
          }
          continue;
        }
        if (!RUNTIME_MODES.has(bind.mode) || bind.space === 'world') continue;
        if (bind.per === 'seats') { if (!Array.isArray(m.params.seats) || !m.params.seats.length) err(`${at}: per "seats" needs marker.params.seats`); continue; }
        const pivot = pivotOf(m, bind);
        placed.push({ m, bind, pivot, at });
        // (a) the hit point of a shootable asset is the marker
        if (a.hitPoint) {
          const w = localToWorld(m, bind, a.hitPoint), d = dist(w, m.pos);
          if (d > 0.02) err(`${at}: the marker is ${d.toFixed(3)} m from ${bind.asset}'s hit point (binding offset must be minus hitPoint): the visible target and its hit sphere would separate`);
        } else if (m.params.hitRadius !== undefined) err(`${at}: the marker has a hit sphere but ${bind.asset} declares no hitPoint`);
        // (b) the marker (what the player aims at or walks to) is on the placeholder
        const box = placeholderWorldBox(M, m, bind), pad = 0.2;   // door markers sit mid-wall, their leaves on a wall face: the opening check below covers them
        if (m.type !== 'door' && m.pos.some((v, i) => v < box.min[i] - pad || v > box.max[i] + pad)) err(`${at}: the marker lies outside ${bind.asset}'s placeholder (${box.min.map((v) => v.toFixed(2))} .. ${box.max.map((v) => v.toFixed(2))}): marker and pivot disagree; fix the binding offset`);
        // (c) floor-standing things stand on something
        if (['base', 'back_base', 'hinge'].includes(a.placeholder.anchor) && !bind.follow) {
          const probe = a.placeholder.anchor === 'back_base' ? localToWorld(m, bind, [0, 0, 0.15]) : pivot;
          const sets = m.params.sets ?? [zoneSetOf(m.zone)];
          const ground = supportAt(sets[0], probe[0], probe[2], pivot[1] + 0.3);
          if (ground === null || Math.abs(ground - pivot[1]) > 0.16) err(`${at}: ${bind.asset} is anchored at its base but its pivot (y ${pivot[1].toFixed(2)}) is ${ground === null ? 'over nothing' : `${(pivot[1] - ground).toFixed(2)} m from the surface under it (y ${ground.toFixed(2)})`}`);
        }
        // follow: the followed node's rest position is this instance's pivot
        if (bind.follow) {
          const om = markerById.get(bind.follow.owner);
          const ob = om && markerBindings(M, om).find((x) => RUNTIME_MODES.has(x.bind.mode) && A[x.bind.asset]?.nodePos?.[bind.follow.node]);
          if (ob) {
            const w = localToWorld(om, ob.bind, A[ob.bind.asset].nodePos[bind.follow.node]), d = dist(w, pivot);
            if (d > 0.05) err(`${at}: follows ${bind.follow.owner}/${bind.follow.node} at (${w.map((v) => v.toFixed(3)).join(', ')}) but its pivot rests ${d.toFixed(3)} m away`);
          }
        }
      }
    }
    // two instances of a non-instanced asset on top of each other = one object bound twice
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const p = placed[i], q = placed[j];
      if (p.bind.asset !== q.bind.asset || A[p.bind.asset].instanced) continue;
      const bp = placeholderWorldBox(M, p.m, p.bind), bq = placeholderWorldBox(M, q.m, q.bind);
      let overlap = 1, volume = 1;
      for (let k = 0; k < 3; k++) { overlap *= Math.max(0, Math.min(bp.max[k], bq.max[k]) - Math.max(bp.min[k], bq.min[k])); volume *= bp.max[k] - bp.min[k]; }
      if (overlap > 0.2 * volume) err(`${p.at} and ${q.at}: two instances of ${p.bind.asset} overlap by ${Math.round((100 * overlap) / volume)} % (${dist(p.pivot, q.pivot).toFixed(2)} m apart): they resolve to the same object; make one of them partOf the other`);
    }
    // openings: a door asset fills its door marker
    for (const m of L.markers) {
      if (m.type !== 'door' || !m.size) continue;
      for (const { bind } of markerBindings(M, m)) {
        if (bind.mode !== 'instance' || bind.space === 'world') continue;
        const a = A[bind.asset], hatch = m.params.kind === 'hatch';
        const want = hatch ? [m.size[0], m.size[2]] : [m.size[0], m.size[1]], have = hatch ? [a.placeholder.size[0], a.placeholder.size[2]] : [a.placeholder.size[0], a.placeholder.size[1]];
        if (a.collision !== 'box') continue;
        if (have[0] < want[0] - 0.05 || have[1] < want[1] - 0.15 || have[1] > want[1] + 0.15) err(`marker ${m.id}: opening ${want.join(' x ')} m but ${bind.asset}'s placeholder is ${have.join(' x ')} m`);
      }
    }
    for (const p of L.nav.portals ?? []) {
      const cageMarker = markerById.get(p.cages?.[0]);
      const bind = cageMarker && markerBindings(M, cageMarker).find((x) => x.bind.mode === 'instance')?.bind;
      if (!bind) { err(`ride ${p.id}: its departure cage marker instantiates nothing`); continue; }
      const s = A[bind.asset].placeholder.size;
      if (s.some((v, i) => Math.abs(v - p.cageInterior[i]) > 0.01)) err(`ride ${p.id}: cage asset ${bind.asset} is ${s.join(' x ')} m but the layout cage interior is ${p.cageInterior.join(' x ')} m`);
      for (const id of p.cages) { const m = markerById.get(id); if (!m || !markerBindings(M, m).some((x) => x.bind.asset === bind.asset && x.bind.mode === 'instance')) err(`ride ${p.id}: cage marker ${id} does not instantiate ${bind.asset}`); }
    }
  });

  // ---------------------------------------------------------------- 6. visibility cells and budgets
  check('visibility cells', () => {
    // units = every chunk and every chunkless origin asset
    const want = {};
    for (const [id, a] of Object.entries(A)) {
      if (a.placedBy !== 'origin') continue;
      if (a.chunks) for (const c of a.chunks) want[c.id] = { tris: c.tris, drawCalls: c.drawCalls, zone: a.zone };
      else want[id] = { tris: a.triBudget, drawCalls: a.drawCalls, zone: a.zone };
    }
    for (const [id, w] of Object.entries(want)) { const u = U[id]; if (!u) err(`visibility.units.${id} missing`); else if (u.tris !== w.tris || u.drawCalls !== w.drawCalls || u.zone !== w.zone) err(`visibility.units.${id} is stale`); }
    for (const id of Object.keys(U)) if (!want[id]) err(`visibility.units.${id} is not a chunk or a world-space asset`);
    const ids = new Set();
    for (const c of CELLS) {
      const at = `cell ${c.id}`;
      if (ids.has(c.id)) err(`${at}: duplicate id`); ids.add(c.id);
      const z = zoneById.get(c.zone);
      if (!z) { err(`${at}: unknown zone ${c.zone}`); continue; }
      if (c.box) for (let i = 0; i < 3; i++) if (c.box.min[i] < z.bounds.min[i] - 0.01 || c.box.max[i] > z.bounds.max[i] + 0.01 || c.box.min[i] >= c.box.max[i]) { err(`${at}: box must lie inside the bounds of zone ${c.zone}`); break; }
      const setOf = (u) => (U[u]?.zone ? zoneById.get(U[u].zone).set : A[U[u]?.asset]?.sets?.[0]);
      const stagedZone = (M.stages ?? []).find((s) => s.staged && s.resident === z.set)?.staged.zone;
      const checkUnits = (list, where) => { for (const u of list ?? []) { if (!U[u]) { err(`${at}: ${where} names unknown unit "${u}"`); continue; } if (setOf(u) !== z.set && U[u].zone !== stagedZone) err(`${at}: ${where} unit ${u} is not resident with zone ${c.zone}`); } };
      checkUnits(c.show, 'show');
      for (const k of c.showIf ?? []) {
        checkUnits(k.units, 'showIf');
        if (k.door !== undefined) { if (markerById.get(k.door)?.type !== 'door') err(`${at}: showIf door "${k.door}" is not a door marker`); if (!['closed', 'not_closed'].includes(k.state)) err(`${at}: showIf door state must be closed or not_closed`); }
        else if (typeof k.flag !== 'string' || typeof k.value !== 'boolean') err(`${at}: showIf needs {door, state} or {flag, value}`);
        for (const e of k.notDuring ?? []) if (!L.encounters.some((x) => x.id === e)) err(`${at}: notDuring names unknown encounter ${e}`);
        if (!k.why) err(`${at}: every showIf carries a why`);
        if (U[k.units?.[0]]?.zone && setOf(k.units[0]) !== z.set && !(k.flag || k.door)) err(`${at}: staged units need a condition`);
      }
      for (const acc of c.accept ?? []) { if (!U[acc.unit]) err(`${at}: accept names unknown unit ${acc.unit}`); if (!acc.why) err(`${at}: every accept carries a why`); }
      // a cell draws its own ground
      const own = Object.keys(U).filter((u) => U[u].zone === c.zone && U[u].part !== 'high');
      const nodes = cellNodes(M, L, c);
      if (!nodes.length) err(`${at}: no nav node of zone ${c.zone} falls in this cell`);
      const shownAlways = new Set(c.show), shownEver = new Set([...c.show, ...(c.showIf ?? []).flatMap((k) => k.units ?? [])]);
      for (const n of nodes) {
        const holder = own.find((u) => inBox(n.pos, U[u].box));
        if (holder && !shownEver.has(holder)) { err(`${at}: nav node ${n.id} stands in ${holder}, which this cell never shows`); break; }
        if (holder && !shownAlways.has(holder) && !n.sets) { err(`${at}: nav node ${n.id} stands in ${holder}, which this cell shows only conditionally`); break; }
      }
      if (!c.why) err(`${at}: why missing`);
    }
    for (const z of L.zones) {
      const own = CELLS.filter((c) => c.zone === z.id);
      if (!own.length) { err(`zone ${z.id} has no visibility cell`); continue; }
      if (own[own.length - 1].box) err(`zone ${z.id}: its last cell must be the default (no box)`);
      if (own.slice(0, -1).some((c) => !c.box)) err(`zone ${z.id}: only its last cell may omit the box`);
      if (JSON.stringify(M.zones?.[z.id]?.cells) !== JSON.stringify(own.map((c) => c.id))) err(`zones.${z.id}.cells is stale`);
    }
    // plugs: a black panel in a doorway, shown while the door is not closed and the unit behind it is hidden
    for (const pl of M.visibility?.plugs ?? []) {
      const at = `plug ${pl.node}`;
      if (!A[pl.asset]?.drawnNodes?.includes(pl.node)) err(`${at}: must be a drawn node of ${pl.asset}`);
      if (markerById.get(pl.door)?.type !== 'door') err(`${at}: door "${pl.door}" is not a door marker`);
      if (!U[pl.unit]) err(`${at}: unknown unit ${pl.unit}`);
    }
    for (const c of CELLS) for (const acc of c.accept ?? []) {
      if (acc.plug !== undefined && !(M.visibility?.plugs ?? []).some((pl) => pl.node === acc.plug && pl.unit === acc.unit)) err(`cell ${c.id}: accept names plug "${acc.plug}", which does not cover ${acc.unit}`);
    }
    // the seam: wherever a tally_house cell can show the staged stair, the stage must exist
    const seam = (M.stages ?? []).find((s) => s.staged);
    if (seam && !CELLS.some((c) => zoneById.get(c.zone)?.set === seam.resident && (c.showIf ?? []).some((k) => k.units.some((u) => U[u]?.zone === seam.staged.zone)))) err('no cell of the resident set shows the staged zone: the seam would be walked unseen');
  });

  check('budgets', () => {
    const low = M.tiers?.low;
    if (!low) return;
    const capTris = Math.min(low.triangles, CAPS.low.triangles), capTyp = Math.min(low.drawCalls.typical, CAPS.low.typical), capWorst = Math.min(low.drawCalls.worst, CAPS.low.worst);
    for (const c of CELLS) {
      if (!zoneById.has(c.zone)) continue;
      const b = cellBudget(M, L, c);
      if (!c.budget || c.budget.triangles !== b.triangles || c.budget.drawCalls.typical !== b.drawCalls.typical || c.budget.drawCalls.worst !== b.drawCalls.worst) err(`cell ${c.id}: stored budget is stale (recomputed ${b.triangles} triangles, ${b.drawCalls.typical}/${b.drawCalls.worst} calls)`);
      if (b.triangles > capTris) err(`cell ${c.id}: ${b.triangles} triangles can be drawn (${b.staticTris} static + ${b.dynamicTris} dynamic, state "${b.when}"), over the ${capTris} cap`);
      if (b.drawCalls.typical > capTyp) err(`cell ${c.id}: ${b.drawCalls.typical} draw calls typical, over ${capTyp}`);
      if (b.drawCalls.worst > capWorst) err(`cell ${c.id}: ${b.drawCalls.worst} draw calls worst, over ${capWorst}`);
      if (!quiet) info(`${c.id.padEnd(19)} ${String(b.triangles).padStart(6)} triangles (${b.staticTris} static + ${b.dynamicTris} dynamic), ${b.drawCalls.typical}/${b.drawCalls.worst} draw calls, heaviest when: ${b.when}`);
    }
    for (const z of L.zones) {
      const zb = M.zones?.[z.id];
      if (!zb) { err(`zone ${z.id} has no entry in manifest.zones`); continue; }
      if (zb.set !== z.set) err(`zones.${z.id}.set is ${zb.set}, layout says ${z.set}`);
      if (!A[zb.env] || A[zb.env].zone !== z.id) err(`zones.${z.id}.env "${zb.env}" is not an asset of that zone`);
      const own = CELLS.filter((c) => c.zone === z.id).map((c) => cellBudget(M, L, c));
      if (!own.length) continue;
      const tri = Math.max(...own.map((b) => b.triangles)), typ = Math.max(...own.map((b) => b.drawCalls.typical)), worst = Math.max(...own.map((b) => b.drawCalls.worst));
      if (zb.triangles !== tri || zb.drawCalls?.typical !== typ || zb.drawCalls?.worst !== worst) err(`zones.${z.id}: triangles / drawCalls must be the maximum over its cells (${tri}, ${typ}/${worst}): they mean "everything drawn while the player is in this zone"`);
      if (!(zb.dressing?.tris >= 0) || !(zb.dressing?.drawCalls >= 0)) err(`zones.${z.id}.dressing missing`);
    }
  });

  check('visibility against the blockout', () => {
    const pvs = blockoutVisibility(M, L);
    const byCell = new Map(CELLS.map((c) => [c.id, c]));
    for (const r of pvs) {
      const c = byCell.get(r.cell);
      const shown = new Set([...c.show, ...(c.showIf ?? []).flatMap((k) => k.units)]);
      const accepted = (c.accept ?? []).find((a) => a.unit === r.unit);
      if (args.includes('--pvs')) info(`pvs ${r.cell.padEnd(19)} ${r.unit.padEnd(17)} ${String(r.seen).padStart(5)} / ${r.rays} rays ${shown.has(r.unit) ? 'shown' : accepted ? 'ACCEPTED hidden' : r.seen ? 'HIDDEN BUT SEEN' : 'hidden'}`);
      if (shown.has(r.unit)) { if (accepted) err(`cell ${r.cell}: ${r.unit} is both shown and accepted as hidden`); continue; }
      if (r.seen > 0 && !accepted) err(`cell ${r.cell}: ${r.unit} is hidden but the blockout shows it on ${r.seen} of ${r.rays} sampled rays: it would pop in. Show it, or list it under accept with the reason`);
      if (accepted) info(`cell ${r.cell}: ${r.unit} accepted as hidden (${r.seen} of ${r.rays} rays see it): ${accepted.why}`);
    }
  });

  // the cell table printed in docs/ARCHITECTURE.md 7.5 must carry the computed numbers
  check('architecture tables', () => {
    const doc = path.join(ROOT, 'docs/ARCHITECTURE.md');
    if (!fs.existsSync(doc)) return;
    const rows = new Map();
    for (const line of fs.readFileSync(doc, 'utf8').split('\n')) {
      const m = line.match(/^\| `(cell_[a-z_]+)` \|.*\| ([\d ]+) \| (\d+) \/ (\d+) \|$/);
      if (m) rows.set(m[1], { triangles: Number(m[2].replace(/ /g, '')), typical: Number(m[3]), worst: Number(m[4]) });
    }
    for (const c of CELLS) {
      const r = rows.get(c.id), b = c.budget;
      if (!r) err(`docs/ARCHITECTURE.md 7.5 has no row for ${c.id}`);
      else if (b && (r.triangles !== b.triangles || r.typical !== b.drawCalls.typical || r.worst !== b.drawCalls.worst)) err(`docs/ARCHITECTURE.md 7.5 row ${c.id} says ${r.triangles}, ${r.typical} / ${r.worst}; the manifest says ${b.triangles}, ${b.drawCalls.typical} / ${b.drawCalls.worst}`);
    }
    for (const id of rows.keys()) if (!CELLS.some((c) => c.id === id)) err(`docs/ARCHITECTURE.md 7.5 has a row for ${id}, which is not a cell`);
  });

  // ---------------------------------------------------------------- 7. priorities and owners
  check('priorities and owners', () => {
    const pieces = M.meta?.pieces ?? {};
    for (const [piece, owners] of Object.entries(pieces)) for (const o of owners) if (!OWNERS.has(o)) err(`meta.pieces.${piece}: unknown owner ${o}`);
    // nothing on a "never cut" list may be below priority 0 (GDD 20.1)
    const never = ['weapon_revolver', 'rd_plate', 'ia_cradle', 'enemy_bider', 'prop_trough_pump', 'prop_cup_tin', 'card_dowser', 'env_backdrop_day', 'ia_shutter', 'prop_day_cell', 'prop_rim_stone', 'prop_cartridge_kept', 'rim_town_card', 'ia_ammo_box'];
    for (const id of never) if (A[id] && A[id].priority !== 0) err(`asset ${id} is on the GDD 20.1 "never cut" list and must be priority 0`);
    // runtime assets on a critical-path gate must be priority 0
    for (const m of L.markers) if (m.type === 'door' && m.params?.gate) for (const { bind } of markerBindings(M, m)) {
      if (RUNTIME_MODES.has(bind.mode) && bind.space !== 'world' && A[bind.asset].priority !== 0) err(`marker ${m.id} is gate ${m.params.gate}: ${bind.asset} must be priority 0`);
    }
    // secrets are priority 2
    const count = {};
    for (const a of Object.values(A)) { count[a.owner] ??= [0, 0, 0, 0]; count[a.owner][a.priority]++; count[a.owner][3] += a.animations.length; }
    if (!quiet) for (const [o, c] of Object.entries(count)) info(`owner ${o.padEnd(13)} P0 ${String(c[0]).padStart(2)}  P1 ${String(c[1]).padStart(2)}  P2 ${String(c[2]).padStart(2)}  clips ${c[3]}`);
  });

  // ---------------------------------------------------------------- 8. GDD ids that must exist with exact clip lists
  check('GDD clip tables', () => {
    const expect = {
      weapon_revolver: ['idle', 'sprint', 'draw', 'fire', 'dry_fire', 'reload_open', 'reload_round', 'reload_close', 'reload_fast_close', 'load_line', 'unload_line', 'load_kept', 'unload_kept', 'fire_kept', 'take_round'],
      enemy_bider: ['idle_stoop', 'run', 'circle_strafe', 'lunge_windup', 'lunge', 'lunge_recover', 'stumble', 'falter', 'die_back', 'sit_down', 'sit_breathe', 'sit_table', 'rise_from_seat', 'climb_out', 'scoop_kneel', 'kneel_to_stand', 'queue_stand', 'turn_about'],
      enemy_transit: ['idle_scan', 'walk', 'emerge', 'plant', 'aim_hold', 'fire', 'flinch', 'sidestep_l', 'sidestep_r', 'die_fold'],
      enemy_tamper: ['idle', 'walk', 'slam_windup', 'slam', 'slam_recover', 'charge_windup', 'charge', 'charge_stun', 'stagger', 'flinch_plate', 'die', 'pound_bulkhead'],
      boss_windlass: ['idle_sway', 'present', 'mouth_open', 'mouth_close', 'guard_slide_on', 'guard_drop', 'guard_raise', 'guard_shatter', 'sag_death'],
    };
    for (const [id, names] of Object.entries(expect)) {
      if (!A[id]) { err(`required asset ${id} missing`); continue; }
      const have = clipNames(id);
      for (const n of names) if (!have.has(n)) err(`${id}: clip "${n}" (GDD) missing`);
      for (const n of have) if (!names.includes(n)) err(`${id}: clip "${n}" is not in the GDD table`);
    }
    for (const id of ['bider_seated_static', 'bider_felled_static', 'bider_table_static', 'proj_stake', 'proj_canister', 'pk_rounds_6', 'pk_rounds_12', 'pk_canteen', 'ia_ammo_box', 'ia_line_locker', 'ia_cradle', 'ia_bore_door']) {
      if (!A[id]) err(`required asset ${id} missing`);
    }
  });

  // ---------------------------------------------------------------- 9. files (optional)
  if (checkFiles) {
    check('files exist', () => {
      const pub = path.join(ROOT, M.meta?.publicDir ?? 'public');
      for (const [id, a] of Object.entries(A)) if (a.placedBy !== 'zone' && !fs.existsSync(path.join(pub, a.path))) err(`asset ${id}: ${a.path} missing under public/`);
      for (const [id, t] of Object.entries(T)) if (!fs.existsSync(path.join(pub, t.path))) err(`texture ${id}: ${t.path} missing under public/`);
    });
  }

  // ---------------------------------------------------------------- report
  if (!quiet) {
    for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}${c.ok ? '' : ` (${c.n})`}`);
    for (const i of infos) console.log('  info ' + i);
    const refs = L.markers.filter((m) => markerBindings(M, m).length || m.params?.enemy).length;
    console.log(`${Object.keys(A).length} assets, ${Object.keys(T).length} textures, ${CELLS.length} visibility cells, ${refs} layout markers with asset references, ${L.solids.filter((s) => s.prop).length} tagged solids`);
  }
  if (errors.length) {
    for (const e of errors) console.error('  ' + e);
    console.error(`FAIL: ${errors.length} error(s)`);
    process.exit(1);
  }
  if (!quiet) console.log(`assets.json OK (${checks.length} checks)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
