#!/usr/bin/env node
// Renders design/layout.json as a labelled top-down map.
//   node tools/render_layout_map.mjs            -> docs/level-map.svg + docs/level-map.png
//   node tools/render_layout_map.mjs --crops    -> also per-panel 2x PNG crops in shots/level-design/
// North is up (north = -Z), east is right (+X).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { World, corners, topMax, aabb, rad } from './layout_geom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const world = new World(L.solids);
const nodeById = new Map(L.nav.nodes.map((n) => [n.id, n]));
const markerById = new Map(L.markers.map((m) => [m.id, m]));

// solids that carry a nav node are "walked" floors
const walked = new Set();
for (const n of L.nav.nodes) { const g = world.ground(n.pos[0], n.pos[2], n.pos[1], 0.05, 0.05); if (g) walked.add(g.solid.id); }

const PANELS = [
  { id: 'surface', title: 'SURFACE SET   the_lip  /  plenty_street  /  tally_house', zones: ['the_lip', 'plenty_street', 'tally_house'], x0: -113, x1: 34, z0: -40, z1: 113, s: 7, ox: 20, oy: 70 },
  { id: 'underground', title: 'UNDERGROUND SET (upper)   the_gallery (y -12, stair from y 0)  /  lift_hall (y -15)', zones: ['the_gallery', 'lift_hall'], x0: -97, x1: 30, z0: -38, z1: 10, s: 7, ox: 1080, oy: 70 },
  { id: 'bore', title: 'UNDERGROUND (lower)  the_bore (y -44, catwalk -36)', zones: ['the_bore'], x0: -5, x1: 33, z0: 62, z1: 119, s: 10, ox: 1080, oy: 470 },
  { id: 'rim', title: 'CODA SET  far_rim (y 18)', zones: ['far_rim'], x0: -4, x1: 32, z0: 98, z1: 123, s: 10, ox: 1500, oy: 470 },
];
const W = 1990, H = 1160;

const COL = {
  bg: '#14161a', panel: '#1c1f25', ink: '#e8e6df', dim: '#8d93a0',
  floor: { sand: '#cdb58a', wood: '#a98a63', adobe: '#c49a78', metal: '#7f8c98', ceramic: '#9fc0bc', stone: '#9a917f', cloth: '#b7a48f' },
  rock: '#5a4c40', wall: '#2c2f36', wallStroke: '#0c0d10', cover: '#e0792c', coverLow: '#b9905f', platform: '#6f7fa8', stairs: '#8aa0d6', blocker: '#4a4f5a',
  nav: '#3d6f9e', crit: '#ff3d3d',
  m: { player_start: '#3ddc5a', checkpoint: '#4aa3ff', enemy_spawn: '#ff4d4d', pickup: '#ffd23d', interactable: '#3de0e0', door: '#ff5fd2', puzzle_element: '#b56bff', trigger: '#ff9f43', readable: '#ffffff', prop: '#9aa0a8', vista: '#9effa0', light: '#ffe9a3', exit: '#3ddc5a' },
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (v) => Math.round(v * 10) / 10;

function panelSvg(P) {
  const X = (x) => f1(P.ox + (x - P.x0) * P.s), Z = (z) => f1(P.oy + (z - P.z0) * P.s);
  const inZone = (zid) => P.zones.includes(zid);
  const o = [];
  const pw = (P.x1 - P.x0) * P.s, ph = (P.z1 - P.z0) * P.s;
  o.push(`<rect x="${P.ox}" y="${P.oy}" width="${pw}" height="${ph}" fill="${COL.panel}" stroke="#343944"/>`);
  o.push(`<text x="${P.ox}" y="${P.oy - 8}" class="pt">${esc(P.title)}</text>`);
  o.push(`<clipPath id="clip_${P.id}"><rect x="${P.ox}" y="${P.oy}" width="${pw}" height="${ph}"/></clipPath><g clip-path="url(#clip_${P.id})">`);
  // 10 m grid
  for (let x = Math.ceil(P.x0 / 10) * 10; x <= P.x1; x += 10) o.push(`<line x1="${X(x)}" y1="${P.oy}" x2="${X(x)}" y2="${P.oy + ph}" class="grid"/><text x="${X(x) + 2}" y="${P.oy + ph - 3}" class="gl">x ${x}</text>`);
  for (let z = Math.ceil(P.z0 / 10) * 10; z <= P.z1; z += 10) o.push(`<line x1="${P.ox}" y1="${Z(z)}" x2="${P.ox + pw}" y2="${Z(z)}" class="grid"/><text x="${P.ox + 3}" y="${Z(z) - 2}" class="gl">z ${z}</text>`);

  // --- solids, lowest top first
  const sol = L.solids.filter((s) => inZone(s.zone) && s.role !== 'ceiling').sort((a, b) => topMax(a) - topMax(b));
  const shape = (s, attrs) => {
    if (s.shape === 'cylinder') {
      const r = (s.size[0] / 2) * P.s;
      if (s.innerRadius) { const ri = s.innerRadius * P.s, cx = X(s.pos[0]), cz = Z(s.pos[2]); return `<path fill-rule="evenodd" d="M${cx - r},${cz}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z M${cx - ri},${cz}a${ri},${ri} 0 1,0 ${2 * ri},0a${ri},${ri} 0 1,0 ${-2 * ri},0Z" ${attrs}/>`; }
      return `<circle cx="${X(s.pos[0])}" cy="${Z(s.pos[2])}" r="${f1(r)}" ${attrs}/>`;
    }
    return `<polygon points="${corners(s).map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" ${attrs}/>`;
  };
  for (const s of sol) {
    let fill, stroke = 'none', sw = 0, extra = '';
    const isFloor = walked.has(s.id) || s.role === 'floor';
    if (s.shape === 'ramp') { fill = s.role === 'terrain' ? COL.floor[s.surface] : COL.stairs; stroke = '#00000055'; sw = 0.6; if (s.dynamic) extra = ' stroke-dasharray="3 2" fill-opacity="0.6"'; }
    else if (isFloor && s.role !== 'cover') { fill = COL.floor[s.surface] || '#888'; if (s.role === 'platform') { stroke = COL.platform; sw = 1.5; } }
    else if (s.role === 'terrain') fill = COL.rock;
    else if (s.role === 'wall') { fill = s.prop === 'pipe_bank' ? '#46525e' : COL.wall; stroke = COL.wallStroke; sw = 0.5; }
    else if (s.role === 'cover') { fill = s.low ? COL.coverLow : COL.cover; stroke = '#3a1c05'; sw = 0.8; }
    else if (s.role === 'platform') { fill = COL.platform; stroke = '#222'; sw = 0.6; }
    else if (s.role === 'blocker') { fill = s.grille || s.invisible ? 'none' : COL.blocker; stroke = s.grille || s.invisible ? '#9aa0a8' : '#111'; sw = 0.8; if (s.grille || s.invisible) extra = ' stroke-dasharray="2 2"'; }
    else fill = '#777';
    if (s.grille && s.role === 'platform') extra = ' fill-opacity="0.75"';
    o.push(shape(s, `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra}`));
    if (s.pierce) o.push(shape(s, 'fill="none" stroke="#7CF2E2" stroke-width="1.2" stroke-dasharray="2 1.5"'));
    if (s.seam && (s.role === 'floor' || s.shape === 'ramp')) o.push(shape(s, 'fill="none" stroke="#ffe14d" stroke-width="1.4" stroke-dasharray="4 2"'));
    if (s.shape === 'ramp') { // uphill arrow
      const d = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[s.rise];
      const len = (d[0] ? s.size[0] : s.size[2]) * 0.32;
      const a = [s.pos[0] - d[0] * len, s.pos[2] - d[1] * len], b = [s.pos[0] + d[0] * len, s.pos[2] + d[1] * len];
      o.push(`<line x1="${X(a[0])}" y1="${Z(a[1])}" x2="${X(b[0])}" y2="${Z(b[1])}" stroke="#1b2030" stroke-width="1.2" marker-end="url(#up)"/>`);
    }
  }
  // zone outlines
  for (const z of L.zones.filter((z) => inZone(z.id))) {
    const b = z.bounds;
    o.push(`<rect x="${X(b.min[0])}" y="${Z(b.min[2])}" width="${f1((b.max[0] - b.min[0]) * P.s)}" height="${f1((b.max[2] - b.min[2]) * P.s)}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-dasharray="6 4"/>`);
  }
  // --- nav
  for (const [a, b] of L.nav.links) { const A = nodeById.get(a), B = nodeById.get(b); if (!inZone(A.zone) && !inZone(B.zone)) continue; o.push(`<line x1="${X(A.pos[0])}" y1="${Z(A.pos[2])}" x2="${X(B.pos[0])}" y2="${Z(B.pos[2])}" stroke="${COL.nav}" stroke-width="0.5" stroke-opacity="0.75"/>`); }
  for (const n of L.nav.nodes) if (inZone(n.zone)) { const fp = (n.tags || []).includes('firing_point'); o.push(`<circle cx="${X(n.pos[0])}" cy="${Z(n.pos[2])}" r="${fp ? 2.6 : 1.2}" fill="${fp ? '#ff8c1a' : COL.nav}"${fp ? ' stroke="#000" stroke-width="0.6"' : ''}/>`); }
  // critical path
  const cp = L.nav.criticalPath.map((id) => nodeById.get(id));
  let run = [];
  const flush = () => { if (run.length > 1) o.push(`<polyline points="${run.map((n) => `${X(n.pos[0])},${Z(n.pos[2])}`).join(' ')}" fill="none" stroke="${COL.crit}" stroke-width="2.2" stroke-opacity="0.9" stroke-linejoin="round" marker-mid="url(#dir)"/>`); run = []; };
  for (let i = 0; i < cp.length; i++) { const n = cp[i], p = cp[i - 1]; if (!inZone(n.zone) || (p && Math.hypot(n.pos[0] - p.pos[0], n.pos[2] - p.pos[2], n.pos[1] - p.pos[1]) > 12)) flush(); if (inZone(n.zone)) run.push(n); }
  flush();

  // --- markers
  const labels = [];
  const placed = [];
  const tryLabel = (x, y, text, color, prio) => labels.push({ x, y, text, color, prio });
  const short = (m) => m.id.replace(/^(ia_|pk_|sp_|door_|trg_|prop_|light_|vista_)/, '');
  const mk = L.markers.filter((m) => inZone(m.zone));
  // volumes first (under icons)
  for (const m of mk) {
    if (m.type !== 'trigger' && m.type !== 'exit') continue;
    const [sx, , sz] = m.size; const enc = m.params.encounter, lane = m.params.kind === 'lane', pz = m.params.role === 'volume';
    if (m.params.kind === 'bay') continue;
    const c = m.type === 'exit' ? COL.m.exit : enc ? '#ff4d4d' : lane ? '#7CF2E2' : pz ? COL.m.puzzle_element : COL.m.trigger;
    o.push(`<rect x="${X(m.pos[0] - sx / 2)}" y="${Z(m.pos[2] - sz / 2)}" width="${f1(sx * P.s)}" height="${f1(sz * P.s)}" fill="${c}" fill-opacity="${pz ? 0.04 : 0.1}" stroke="${c}" stroke-width="${enc || m.type === 'exit' ? 1.4 : 0.8}" stroke-dasharray="${lane ? '1 3' : '4 3'}"/>`);
    if (enc) tryLabel(X(m.pos[0]), Z(m.pos[2] - sz / 2) - 2, enc, '#ff8a8a', 3);
    else if (m.type === 'exit') tryLabel(X(m.pos[0]), Z(m.pos[2]), 'EXIT strip (armed only by ' + (m.params.requires || '?') + ')', COL.m.exit, 3);
    else if (/^trg_(dowser|stone|set_swap|hatch_close|lamps)$/.test(m.id)) tryLabel(X(m.pos[0] - sx / 2) + 2, Z(m.pos[2] + sz / 2) + 7, m.id, '#ffc78a', 2);
    else if (lane) tryLabel(X(m.pos[0]), Z(m.pos[2] + sz / 2) + 7, m.id + ' (file)', '#7CF2E2', 1);
    else if (pz) tryLabel(X(m.pos[0] - sx / 2) + 4, Z(m.pos[2] - sz / 2) + 9, 'puzzle: ' + m.params.puzzle, '#d0a8ff', 3);
  }
  for (const m of mk) {
    const x = X(m.pos[0]), y = Z(m.pos[2]); const c = COL.m[m.type];
    switch (m.type) {
      case 'player_start': o.push(`<polygon points="${x},${y - 8} ${x - 6},${y + 6} ${x + 6},${y + 6}" fill="${c}" stroke="#000"/>`); tryLabel(x, y - 11, 'PLAYER START', c, 4); break;
      case 'checkpoint': o.push(`<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="${c}" stroke="#000" stroke-width="0.7" transform="rotate(45 ${x} ${y})"/>`); tryLabel(x, y, m.id, c, 2); break;
      case 'enemy_spawn': { const e = m.params.enemy; const r = e === 'windlass' ? 9 : e === 'tamper' ? 6.5 : e === 'transit' ? 5 : 4; o.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#000" stroke-width="0.8"/><text x="${x}" y="${y + 2.6}" class="ic">${{ bider: 'B', transit: 'T', tamper: 'M', windlass: 'W' }[e]}</text>`); if (e !== 'bider' || /kneeler|gate|riser|vig/.test(m.id)) tryLabel(x, y, short(m), '#ff9a9a', 2); break; }
      case 'pickup': o.push(`<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="${c}" stroke="#000" stroke-width="0.7"/>`); tryLabel(x, y, m.params.pickup.replace('pk_', '') + (m.params.secret ? ' (secret)' : ''), c, 1); break;
      case 'interactable': o.push(`<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" rx="1.5" fill="${m.params.kind === 'knot' ? '#B24BFF' : c}" stroke="#000" stroke-width="0.7"/>`); if (!/proving_mark_[2-6]/.test(m.id)) tryLabel(x, y, m.id, m.params.kind === 'knot' ? '#d7a6ff' : c, 2); break;
      case 'door': { const r = rad(m.rotY), ux = Math.cos(r), uz = -Math.sin(r), hw = m.size[0] / 2; if (m.params.kind === 'hatch') o.push(`<rect x="${X(m.pos[0] - m.size[0] / 2)}" y="${Z(m.pos[2] - m.size[2] / 2)}" width="${m.size[0] * P.s}" height="${m.size[2] * P.s}" fill="none" stroke="${c}" stroke-width="2"/>`); else o.push(`<line x1="${X(m.pos[0] - ux * hw)}" y1="${Z(m.pos[2] - uz * hw)}" x2="${X(m.pos[0] + ux * hw)}" y2="${Z(m.pos[2] + uz * hw)}" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>`); tryLabel(x, y, m.id + (m.params.gate ? ` [${m.params.gate}]` : ''), c, 3); break; }
      case 'puzzle_element': o.push(`<circle cx="${x}" cy="${y}" r="3.2" fill="${c}" stroke="#000" stroke-width="0.7"/>`); if (!/ia_jug_[2-5]|ask_port_[2-8]|ia_latch/.test(m.id)) tryLabel(x, y, m.id.replace('ia_jug_1', 'ia_jug_1..6').replace('ia_ask_port_1', 'ia_ask_port_1..8'), '#d0a8ff', 2); break;
      case 'readable': o.push(`<rect x="${x - 3}" y="${y - 3.5}" width="6" height="7" fill="${c}" stroke="#000" stroke-width="0.8"/>`); tryLabel(x, y, m.id, c, 2); break;
      case 'prop': o.push(`<path d="M${x - 2.5},${y - 2.5}L${x + 2.5},${y + 2.5}M${x + 2.5},${y - 2.5}L${x - 2.5},${y + 2.5}" stroke="${c}" stroke-width="1.2"/>`); if (m.params.landmark || /camp|seated|watcher|cage|diagram|tally_wall|cloth|plate_4|daycell_plate|cup_two|lift_/.test(m.id)) tryLabel(x, y, short(m), '#c9ced6', 1); break;
      case 'vista': { const t = m.params.target; const dx = t[0] - m.pos[0], dz = t[2] - m.pos[2], l = Math.hypot(dx, dz) || 1, len = Math.min(l * P.s, 26); o.push(`<line x1="${x}" y1="${y}" x2="${f1(x + (dx / l) * len)}" y2="${f1(y + (dz / l) * len)}" stroke="${c}" stroke-width="1.3" stroke-dasharray="3 2" marker-end="url(#eye)"/><circle cx="${x}" cy="${y}" r="2.6" fill="${c}" stroke="#000" stroke-width="0.6"/>`); tryLabel(x, y, m.id + (m.params.bearingDeg !== undefined && m.id === 'vista_dowser' ? ` (az ${m.params.bearingDeg}, el ${m.params.elevationDeg}; sun az ${L.meta.sun.azimuthDeg})` : ''), c, m.id === 'vista_dowser' ? 3 : 1); break; }
      case 'light': o.push(`<circle cx="${x}" cy="${y}" r="1.8" fill="${m.params.hue === 'flame' ? '#FF9433' : m.params.hue === 'violet' ? '#B24BFF' : m.params.hue === 'aqua' ? '#7CF2E2' : c}" stroke="#000" stroke-width="0.4"/>`); break;
    }
  }
  // labels: greedy placement, highest priority first, eight candidate offsets
  labels.sort((a, b) => b.prio - a.prio);
  const boxes = [];
  for (const l of labels) {
    const w = l.text.length * 4.1 + 2, h = 8;
    const cands = [[6, 3], [-w - 6, 3], [-w / 2, -7], [-w / 2, 13], [6, -6], [6, 12], [-w - 6, -6], [-w - 6, 12], [10, 20], [-w - 10, 20], [10, -14], [-w - 10, -14]];
    let ok = null;
    for (const [dx, dy] of cands) {
      const bx = l.x + dx, by = l.y + dy - h + 1;
      if (bx < P.ox + 1 || bx + w > P.ox + pw - 1 || by < P.oy + 1 || by + h > P.oy + ph - 1) continue;
      if (boxes.some((b) => bx < b.x + b.w && bx + w > b.x && by < b.y + b.h && by + h > b.y)) continue;
      ok = { x: bx, y: by, w, h, tx: l.x + dx, ty: l.y + dy }; break;
    }
    if (!ok) continue;
    boxes.push(ok);
    o.push(`<text x="${f1(ok.tx)}" y="${f1(ok.ty)}" class="lb" fill="${l.color}">${esc(l.text)}</text>`);
  }
  // zone names
  for (const z of L.zones.filter((z) => inZone(z.id))) o.push(`<text x="${X(z.bounds.min[0]) + 5}" y="${Z(z.bounds.min[2]) + 13}" class="zn">${esc(z.id)}  (${z.mood}${z.moodIntro ? ', opens ' + z.moodIntro : ''})</text>`);
  // scale bar + north
  const bx = P.ox + pw - 10 * P.s - 14, by = P.oy + 16;
  o.push(`<line x1="${bx}" y1="${by}" x2="${bx + 10 * P.s}" y2="${by}" stroke="${COL.ink}" stroke-width="2"/><text x="${bx + 5 * P.s}" y="${by - 4}" class="sc" text-anchor="middle">10 m</text>`);
  o.push(`<path d="M${bx - 22},${by + 12}l5,-20l5,20l-5,-4z" fill="${COL.ink}"/><text x="${bx - 17}" y="${by + 22}" class="sc" text-anchor="middle">N</text>`);
  o.push('</g>');
  return o.join('\n');
}

function legend(x, y) {
  const o = [`<text x="${x}" y="${y}" class="pt">LEGEND</text>`];
  const items = [
    ['<rect x="0" y="-8" width="14" height="10" fill="#cdb58a"/>', 'walkable floor (tint = surface: sand, wood, adobe, stone, ceramic, metal)'],
    ['<rect x="0" y="-8" width="14" height="10" fill="#5a4c40"/>', 'rock / terrain mass'],
    ['<rect x="0" y="-8" width="14" height="10" fill="#2c2f36" stroke="#0c0d10"/>', 'wall'],
    ['<rect x="0" y="-8" width="14" height="10" fill="#e0792c" stroke="#3a1c05"/>', 'full-height cover (>= 2 m)'],
    ['<rect x="0" y="-8" width="14" height="10" fill="#b9905f" stroke="#3a1c05"/>', 'low cover / furniture'],
    ['<rect x="0" y="-8" width="14" height="10" fill="#8aa0d6"/><line x1="2" y1="-3" x2="12" y2="-3" stroke="#1b2030" marker-end="url(#up)"/>', 'ramp / stair (arrow points uphill)'],
    ['<rect x="0" y="-8" width="14" height="10" fill="none" stroke="#7CF2E2" stroke-dasharray="2 1.5"/>', 'pierce-tagged (line round passes)'],
    ['<rect x="0" y="-8" width="14" height="10" fill="none" stroke="#ffe14d" stroke-width="1.4" stroke-dasharray="4 2"/>', 'seam: resident in both surface and underground sets'],
    ['<rect x="0" y="-8" width="14" height="10" fill="none" stroke="#9aa0a8" stroke-dasharray="2 2"/>', 'grille / invisible or player-only blocker'],
    ['<line x1="0" y1="-3" x2="14" y2="-3" stroke="#ff3d3d" stroke-width="2.2"/>', `critical path (${Math.round(L.nav.criticalPathLength)} m)`],
    ['<line x1="0" y1="-3" x2="14" y2="-3" stroke="#3d6f9e"/><circle cx="7" cy="-3" r="1.5" fill="#3d6f9e"/>', 'nav graph;  <tspan fill="#ff8c1a">orange node</tspan> = Transit firing point'],
    ['<polygon points="7,-10 1,2 13,2" fill="#3ddc5a" stroke="#000"/>', 'player start'],
    ['<rect x="3.5" y="-7" width="7" height="7" fill="#4aa3ff" stroke="#000" transform="rotate(45 7 -3.5)"/>', 'checkpoint'],
    ['<circle cx="7" cy="-3" r="4.5" fill="#ff4d4d" stroke="#000"/>', 'enemy spawn  B bider, T transit, M tamper, W windlass'],
    ['<rect x="4" y="-6" width="6" height="6" fill="#ffd23d" stroke="#000"/>', 'pickup'],
    ['<rect x="3.5" y="-7" width="7" height="7" rx="1.5" fill="#3de0e0" stroke="#000"/>', 'interactable;  <tspan fill="#d7a6ff">violet = knot</tspan>'],
    ['<circle cx="7" cy="-3" r="3.2" fill="#b56bff" stroke="#000"/>', 'puzzle element'],
    ['<line x1="0" y1="-3" x2="14" y2="-3" stroke="#ff5fd2" stroke-width="3.2"/>', 'door / gate [G1..G7]'],
    ['<rect x="4" y="-7" width="6" height="7" fill="#fff" stroke="#000"/>', 'readable'],
    ['<rect x="0" y="-8" width="14" height="10" fill="#ff9f43" fill-opacity="0.15" stroke="#ff9f43" stroke-dasharray="4 3"/>', 'trigger volume (red = encounter, violet = puzzle)'],
    ['<line x1="0" y1="-3" x2="12" y2="-3" stroke="#9effa0" stroke-dasharray="3 2" marker-end="url(#eye)"/>', 'vista / sightline to a landmark'],
    ['<circle cx="7" cy="-3" r="2" fill="#7CF2E2"/>', 'light (aqua / flame / violet)'],
  ];
  items.forEach(([icon, text], i) => o.push(`<g transform="translate(${x},${y + 18 + i * 14.5})">${icon}<text x="20" y="0" class="lg">${text}</text></g>`));
  return o.join('\n');
}

const flow = [
  'FLOW  cp_lip_start > stop one > gully > G1 jug gate [seven_jugs] > street: enc_street > G2 yard door [knot] > yard: enc_yard > trg_dowser (sighting, due west) > tally door opens',
  '> [daylight] > G3 hatch [knot: ajar] > enc_tally > hatch opens > trg_hatch_close > trg_set_swap (flight 2) > proving bay > [proving_line] > G4 baffle > enc_file A + B',
  '> gantry > enc_matador (clock waves) > G5 lift (ride, cage turned 180) > catwalk > antechamber > [the_asking] > G6 bore door > enc_windlass (the seventh, through the',
  'kerb notch) > G7 proving lift (ride) > rim > trg_stone arms the ending > end',
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, Verdana, sans-serif">
<defs>
<marker id="up" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L8,4L0,8z" fill="#1b2030"/></marker>
<marker id="eye" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L8,4L0,8z" fill="#9effa0"/></marker>
<marker id="dir" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0,0L8,4L0,8z" fill="#ffd0d0"/></marker>
<style>
.pt{font-size:12px;font-weight:bold;fill:${COL.ink};letter-spacing:.5px}
.zn{font-size:11px;font-weight:bold;fill:#ffffff;fill-opacity:.8}
.lb{font-size:6.8px;paint-order:stroke;stroke:#0b0c0f;stroke-width:2.2px;stroke-linejoin:round}
.ic{font-size:6.5px;font-weight:bold;fill:#fff;text-anchor:middle}
.lg{font-size:9.5px;fill:${COL.ink}}
.gl{font-size:6.5px;fill:#5c6370}
.sc{font-size:9px;fill:${COL.ink}}
.grid{stroke:#ffffff;stroke-opacity:.06;stroke-width:1}
.fl{font-size:9.5px;fill:${COL.dim}}
</style>
</defs>
<rect width="${W}" height="${H}" fill="${COL.bg}"/>
<text x="20" y="28" font-size="20" font-weight="bold" fill="${COL.ink}">KEEP SEVEN — First Tally: Plenty — level blockout</text>
<text x="20" y="46" font-size="10.5" fill="${COL.dim}">design/layout.json v${L.meta.version}: ${L.zones.length} zones, ${L.solids.length} solids, ${L.markers.length} markers, ${L.nav.nodes.length} nav nodes, ${L.nav.links.length} links. Game space, metres, north (-Z) up. Sun low in the north-west (azimuth 315, elevation 14). Generated by tools/render_layout_map.mjs.</text>
${PANELS.map(panelSvg).join('\n')}
${legend(1500, 745)}
${flow.map((t, i) => `<text x="1080" y="${1000 + i * 13 + 96}" class="fl">${esc(t)}</text>`).join('\n')}
</svg>`;

fs.writeFileSync(path.join(ROOT, 'docs/level-map.svg'), svg);
await sharp(Buffer.from(svg), { density: 96 }).png().toFile(path.join(ROOT, 'docs/level-map.png'));
console.log('wrote docs/level-map.svg, docs/level-map.png');
if (process.argv.includes('--crops')) {
  const dir = path.join(ROOT, 'shots/level-design'); fs.mkdirSync(dir, { recursive: true });
  const K = 216 / 72; // librsvg renders 1 px per unit at density 72
  const big = await sharp(Buffer.from(svg), { density: 216 }).png().toBuffer();
  const crop = async (name, x, y, w, h) => sharp(big).extract({ left: Math.round(x * K), top: Math.round(y * K), width: Math.round(w * K), height: Math.round(h * K) }).toFile(path.join(dir, name + '.png'));
  const A = PANELS[0], X = (x) => A.ox + (x - A.x0) * A.s, Zc = (z) => A.oy + (z - A.z0) * A.s;
  await crop('map_lip', X(-2), Zc(8), 36 * 7 + 20, 105 * 7);
  await crop('map_street', X(-76), Zc(-18), 80 * 7, 36 * 7);
  await crop('map_yard_tally', X(-113), Zc(-40), 42 * 7, 58 * 7);
  await crop('map_forecourt', X(-8), Zc(-12), 36 * 7, 46 * 7);
  const B = PANELS[1]; await crop('map_gallery', B.ox - 2, B.oy - 20, 64 * 7, 48 * 7 + 24); await crop('map_hall', B.ox + 62 * 7, B.oy - 20, 65 * 7 + 4, 48 * 7 + 24);
  const C = PANELS[2]; await crop('map_bore', C.ox - 2, C.oy - 20, 38 * 10 + 4, 57 * 10 + 24);
  const D = PANELS[3]; await crop('map_rim', D.ox - 2, D.oy - 20, 36 * 10 + 4, 25 * 10 + 24);
  console.log('wrote crops to shots/level-design/');
}
