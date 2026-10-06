// data.ts: the one bindings lookup order, placement for every row of the ARCHITECTURE 9.2 table, nodeRest, zoneAt on the
// seam, cellAt, navPath. Plus the collider builder (greybox.ts), which the walk tests stand on.
import { describe, expect, it } from 'vitest';
import { ColFlag } from '../../src/core/contracts.ts';
import type { AssetBinding, LayoutMarker, LayoutSolid, Placement } from '../../src/core/contracts.ts';
import { SURFACE_TYPES as COLLISION_SURFACES } from '../../src/core/collision.ts';
import { createGameData } from '../../src/core/data.ts';
import { buildSolidColliders, solidFlags, solidLive, solidTriangles } from '../../src/core/greybox.ts';
import { SURFACE_TYPES } from '../../src/core/math.ts';

const data = createGameData({ strict: true });
const M = (id: string): LayoutMarker => data.marker(id) as LayoutMarker;
const place = (): Placement => ({ x: 0, y: 0, z: 0, rotYRad: 0, scale: 1 });

/** the validator's rule, written out again: asset-local vector -> world delta (rotation.y = rotY + 180 degrees) */
function rotateLocal(rotYDeg: number, v: readonly number[]): [number, number, number] {
  const t = ((rotYDeg + 180) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return [(v[0] as number) * c + (v[2] as number) * s, v[1] as number, -(v[0] as number) * s + (v[2] as number) * c];
}

describe('GameData: lookups', () => {
  it('indexes the three files', () => {
    expect(data.layout.meta.version).toBe(2);
    expect(data.layout.zones).toHaveLength(7);
    expect(data.layout.solids.length).toBe(309);
    expect(data.layout.markers.length).toBe(265);   // polish round 4: + ia_ammo_box_yard
    expect(data.layout.nav.nodes.length).toBe(472);
    expect(Object.keys(data.manifest.assets)).toHaveLength(84);
    expect(Object.keys(data.manifest.textures)).toHaveLength(18);
    expect(data.manifest.visibility.cells).toHaveLength(12);
    expect(data.marker('cp_rim')?.zone).toBe('far_rim');
    expect(data.markersOfType('checkpoint')).toHaveLength(17);
    expect(data.markersInZone('far_rim').length).toBeGreaterThan(3);
    expect(data.zone('the_bore').set).toBe('underground');
    expect(data.encounter('enc_tally').locksDoors).toContain('ia_hatch');
    expect(data.line('nar_tin').speaker).toBe('narrator');
    expect(data.ui('ui_title').length).toBeGreaterThan(0);
  });
  it('throws on unknown ids in test / dev mode and returns a fallback otherwise', () => {
    expect(() => data.marker('no_such_marker')).toThrow(/unknown marker/);
    expect(() => data.ui('ui_nope')).toThrow();
    expect(() => data.line('nar_nope')).toThrow();
    expect(() => data.navPath('n_lip_001', 'nowhere')).toThrow();
    const lax = createGameData({ strict: false });
    expect(lax.marker('no_such_marker')).toBeUndefined();
    expect(lax.ui('ui_nope')).toBe('ui_nope');
    expect(lax.navPath('n_lip_001', 'nowhere')).toEqual([]);
  });
});

describe('GameData.bindings: the one lookup order (9.1)', () => {
  const ids = (m: string): string[] => data.bindings(M(m)).map((b) => `${b.asset}:${b.mode}`);
  it('a door marker resolves through `door`; its params.interactable is not a second binding', () => {
    expect(M('ia_yard_door').params.interactable).toBe('ia_yard_door');
    expect(ids('ia_yard_door')).toEqual(['ia_yard_door:instance']);
    expect(ids('ia_hatch')).toEqual(['ia_hatch:instance']);
    expect(ids('door_jug_gate')).toEqual(['prop_stock_gate:instance', 'prop_well_sweep:instance']);   // an array value, in order
    expect(ids('door_lift_cage')).toEqual(['ia_lift_cage:partOf']);
  });
  it('a puzzle_element without params.interactable resolves through `puzzleElement`; with one, through `interactable`', () => {
    expect(M('shutter_s').params.interactable).toBeUndefined();
    expect(ids('shutter_s')).toEqual(['ia_shutter:instance']);
    expect(ids('ia_latch_s')).toEqual(['ia_shutter:partOf']);
    expect(ids('ia_jug_1')).toEqual(['ia_jug:variant']);
    expect(ids('pz_listening_lamps')).toEqual(['ia_bore_door:partOf']);
  });
  it('then params.interactable, pickup, readable, prop', () => {
    expect(ids('ia_lift_lever')).toEqual(['ia_lift_lever:instance']);
    expect(ids('pk_rounds_12_camp1')).toEqual(['pk_rounds_12:instance']);
    expect(ids('rd_note_lip')).toEqual(['rd_note:embedded']);
    expect(ids('prop_share_cloth')).toEqual(['prop_share_cloth:instance']);
    expect(ids('prop_tally_seated')).toEqual(['bider_table_static:instance']);
    expect(data.bindings(M('prop_tally_seated'))[0]?.per).toBe('seats');
  });
  it('an enemy_spawn resolves only its entrance (its params.prop is the vignette\'s hand prop)', () => {
    expect(M('sp_street_kneeler').params.prop).toBe('cup');
    expect(ids('sp_street_kneeler').some((x) => x.startsWith('prop_cup_tin'))).toBe(false);
    expect(ids('sp_yard_grate_1')).toEqual(['prop_grate:instance']);
  });
  it('a null binding and a marker that binds nothing give an empty list; the result is cached', () => {
    expect(data.bindings(M('cp_lip_start'))).toEqual([]);
    const camp = data.layout.markers.find((m) => m.type === 'prop' && data.manifest.bindings.prop[m.params.prop as string] === null);
    expect(camp).toBeDefined();
    expect(data.bindings(camp as LayoutMarker)).toEqual([]);
    expect(data.bindings(M('shutter_s'))).toBe(data.bindings(M('shutter_s')));
  });
  it('every marker of the layout resolves without throwing, and every binding has a mode', () => {
    let n = 0;
    for (const m of data.layout.markers) for (const b of data.bindings(m)) { n++; expect(['instance', 'variant', 'partOf', 'zoneNode', 'embedded', 'actor']).toContain(b.mode); }
    expect(n).toBeGreaterThan(100);
  });
});

describe('GameData.placement and nodeRest (9.2)', () => {
  /** every row of the table: [marker, asset, offset, scale] */
  const ROWS: [string, string, [number, number, number], number][] = [
    ['ia_jug_1', 'ia_jug', [0, 0.81, 0], 1], ['ia_jug_7', 'ia_jug', [0, 0.81, 0], 1],
    ['knot_yard_latch', 'knot_mech', [0, 0, -0.08], 1], ['knot_hatch_latch', 'knot_mech', [0, 0, -0.08], 1], ['knot_cold_bay', 'knot_mech', [0, 0, -0.08], 1],
    ['knot_a', 'knot_mech', [0, 0, -0.08], 1.25], ['knot_b', 'knot_mech', [0, 0, -0.08], 1.25], ['knot_c', 'knot_mech', [0, 0, -0.08], 1.25],
    ['ia_yard_bell', 'ia_yard_bell', [0, -2.2, 0], 1],
    ['ia_range_plate_1', 'ia_range_plate', [0, 0.45, 0], 1], ['ia_range_plate_3', 'ia_range_plate', [0, 0.45, 0], 1],
    ['shutter_s', 'ia_shutter', [0, -0.45, 0], 1], ['shutter_m', 'ia_shutter', [0, -0.45, 0], 1], ['shutter_n', 'ia_shutter', [0, -0.45, 0], 1],
    ['prop_share_cloth', 'prop_share_cloth', [0, 0.855, 0], 1],
    ['sec_loft_bell', 'sec_loft_bell', [0, 1.05, 0], 1],
    ['pz_sighting_loop', 'prop_sighting_loop', [0, -2.018, 0], 1],
    ['pz_proving_mark', 'prop_proving_step', [0, -0.15, 0], 1],
    ['ia_lift_lever', 'ia_lift_lever', [0, -1.2, 0], 1],
    ['door_bore', 'ia_bore_door', [0, 1.5, 0], 1],
    ['ia_hatch', 'ia_hatch', [0, 0.3, 0], 1],
    ['door_jug_gate', 'prop_stock_gate', [0, 0, -1.1], 1],
    ['ia_yard_door', 'ia_yard_door', [-1.3, 0, -0.44], 1], ['door_alley', 'prop_door_frontier', [-0.8, 0, 0], 1], ['door_tally', 'prop_door_frontier', [-0.8, 0, 0], 1],
    ['day_cell', 'prop_day_cell', [0, 0, -0.04], 1], ['ia_cradle', 'ia_cradle', [0, 0, -0.1], 1], ['prop_station_plate_4', 'prop_station_plate', [0, 0, -0.05], 1],
  ];
  it.each(ROWS)('%s -> %s', (markerId, asset, offset, scale) => {
    const m = M(markerId);
    const b = data.bindings(m).find((x) => x.asset === asset) as AssetBinding;
    expect(b, `binding of ${markerId}`).toBeDefined();
    expect(b.offset).toEqual(offset);
    expect(b.scale ?? 1).toBe(scale);
    const p = data.placement(m, b, place());
    const d = rotateLocal(m.rotY, offset.map((v) => v * scale));
    expect(p.x).toBeCloseTo(m.pos[0] + d[0], 9);
    expect(p.y).toBeCloseTo(m.pos[1] + d[1], 9);
    expect(p.z).toBeCloseTo(m.pos[2] + d[2], 9);
    expect(p.rotYRad).toBeCloseTo((m.rotY * Math.PI) / 180 + Math.PI, 12);
    expect(p.scale).toBe(scale);
  });
  it('the half-width doors: the pivot is the hinge, half the opening along local -X', () => {
    for (const [id, w] of [['ia_yard_door', 2.6], ['door_alley', 1.6], ['door_tally', 1.6]] as const) {
      const b = data.bindings(M(id))[0] as AssetBinding;
      expect(b.offset?.[0]).toBeCloseTo(-w / 2, 9);
      expect((M(id).size as number[])[0]).toBe(w);
    }
    // door_tally faces north (rotY 0): its asset +X is world -X after the half turn, so the hinge is on the east jamb
    const p = data.placement(M('door_tally'), data.bindings(M('door_tally'))[0] as AssetBinding, place());
    expect([p.x, p.y, p.z]).toEqual([expect.closeTo(-88.2, 6), 0, expect.closeTo(-14.5, 6)]);
  });
  it('a marker without an offset is the pivot; space: "world" is identity', () => {
    const m = M('pk_rounds_6_ledge');
    const p = data.placement(m, data.bindings(m)[0] as AssetBinding, place());
    expect([p.x, p.y, p.z, p.scale]).toEqual([...m.pos, 1]);
    const sweep = data.bindings(M('door_jug_gate')).find((b) => b.space === 'world') as AssetBinding;
    expect(data.placement(M('door_jug_gate'), sweep, place())).toEqual({ x: 0, y: 0, z: 0, rotYRad: 0, scale: 1 });
  });
  it('nodeRest puts a shot part on its marker: latch, cord, rope, ports, cage gates', () => {
    const out = { x: 0, y: 0, z: 0 };
    const parts: [string, number][] = [
      ['ia_latch_s', 0.06], ['ia_latch_m', 0.06], ['ia_latch_n', 0.06], ['ia_cloth_cord', 0.06], ['sec_loft_bell_rope', 0.06],
      ['ia_ask_port_1', 0.06], ['ia_ask_port_3', 0.06], ['ia_ask_port_8', 0.06], ['pz_listening_lamps', 0.06],
      ['door_lift_cage', 0.6], ['door_proving_lift', 0.6], ['ia_proving_lift', 0.06],
    ];
    for (const [partId, tolerance] of parts) {
      const part = M(partId);
      const b = data.bindings(part)[0] as AssetBinding;
      expect(b.mode, partId).toBe('partOf');
      const owner = M(b.owner as string);
      const ownerBinding = data.bindings(owner).find((x) => x.asset === b.asset) as AssetBinding;
      expect(data.nodeRest(owner, ownerBinding, b.node as string, out), partId).toBe(true);
      expect(Math.hypot(out.x - part.pos[0], out.y - part.pos[1], out.z - part.pos[2]), `${partId} is ${JSON.stringify(out)}`).toBeLessThanOrEqual(tolerance + 1e-6);
    }
    expect(data.nodeRest(M('shutter_s'), data.bindings(M('shutter_s'))[0] as AssetBinding, 'shutter_leaf', out)).toBe(false);   // no nodePos listed
  });
});

describe('GameData.zoneAt and cellAt', () => {
  it('the highest priority zone OF THE GIVEN SET wins; null outside every zone', () => {
    expect(data.zoneAt(16, 14, 107.5, 'surface')).toBe('the_lip');
    expect(data.zoneAt(-89, 0, -15, 'surface')).toBe('tally_house');          // the 2 m strip shared with plenty_street
    expect(data.zoneAt(-89, 0, -13, 'surface')).toBe('plenty_street');
    expect(data.zoneAt(-89, 1, -15, 'underground')).toBeNull();           // the gallery's bounds stop at y 0
    expect(data.zoneAt(14, 18, 114, 'coda')).toBe('far_rim');
    expect(data.zoneAt(0, 500, 0, 'surface')).toBeNull();
  });
  it('on the seam: tally_house while the surface set is resident, the_gallery after the swap', () => {
    const seam: [number, number, number][] = [[-90, -2, -33], [-86, -4, -33], [-86, -5.2, -30.2]];   // flight 1, landing 1, top of flight 2
    for (const [x, y, z] of seam) {
      expect(data.zoneAt(x, y, z, 'surface'), `surface at ${x},${y},${z}`).toBe('tally_house');
      expect(data.zoneAt(x, y, z, 'underground'), `underground at ${x},${y},${z}`).toBe('the_gallery');
    }
    expect(data.zoneAt(-86, -12, -16.8, 'underground')).toBe('the_gallery');
    expect(data.zoneAt(-86, -12, -16.8, 'surface')).toBeNull();               // below tally_house's bounds
  });
  it('every nav node of the critical path is in a zone of its set (or of a set it is flagged for)', () => {
    for (const id of data.layout.nav.criticalPath) {
      const n = data.navNode(id);
      expect(n, id).toBeDefined();
      if (!n) continue;
      const sets = n.sets ?? [data.zone(n.zone).set];
      for (const set of sets) expect(data.zoneAt(n.pos[0], n.pos[1], n.pos[2], set), `${id} in ${set}`).not.toBeNull();
    }
  });
  it('cellAt: the first cell of the zone whose box holds the feet, else the zone\'s box-less cell', () => {
    expect(data.cellAt('the_lip', 16, 14, 107.5).id).toBe('cell_lip_gully');
    expect(data.cellAt('the_lip', 8, 0, 4).id).toBe('cell_lip_gate');
    expect(data.cellAt('plenty_street', -40, 0, 0).id).toBe('cell_street');
    expect(data.cellAt('plenty_street', -89, 0, -10).id).toBe('cell_yard_door');
    expect(data.cellAt('plenty_street', -100, 0, 8).id).toBe('cell_yard');
    expect(data.cellAt('tally_house', -90, -2, -33).id).toBe('cell_tally_seam');
    expect(data.cellAt('tally_house', -89, 0, -24).id).toBe('cell_tally');
    expect(data.cellAt('the_gallery', -86, -6, -29).id).toBe('cell_gallery_stair');
    expect(data.cellAt('the_gallery', -50, -12, -14).id).toBe('cell_gallery');
    expect(data.cellAt('far_rim', 14, 18, 114).id).toBe('cell_rim');
  });
});

describe('GameData.navPath', () => {
  it('finds node-to-node and marker-to-marker paths over the links', () => {
    const p = data.navPath('n_lip_001', 'n_lip_004');
    expect(p[0]).toBe('n_lip_001');
    expect(p[p.length - 1]).toBe('n_lip_004');
    const links = new Set(data.layout.nav.links.map(([a, b]) => (a < b ? a + '|' + b : b + '|' + a)));
    for (let i = 1; i < p.length; i++) { const a = p[i - 1] as string, b = p[i] as string; expect(links.has(a < b ? a + '|' + b : b + '|' + a), `${a} - ${b}`).toBe(true); }
    expect(data.navPath('n_lip_002', 'n_lip_002')).toEqual(['n_lip_002']);
    const cp = data.navPath('cp_lip_start', 'cp_lip_gate');
    expect(cp.length).toBeGreaterThan(10);
  });
  it('crosses both lift rides from the start to the exit, and is no longer than the critical path', () => {
    const p = data.navPath('player_start', 'exit_rim');
    expect(p.length).toBeGreaterThan(50);
    for (const portal of data.layout.nav.portals) {
      const i = p.indexOf(portal.from);
      expect(i, portal.id).toBeGreaterThanOrEqual(0);
      expect(p[i + 1]).toBe(portal.to);
    }
    const length = (path: string[]): number => {
      let d = 0;
      for (let i = 1; i < path.length; i++) {
        const a = data.navNode(path[i - 1] as string), b = data.navNode(path[i] as string);
        if (!a || !b || data.portalBetween(a.id, b.id)) continue;
        d += Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
      }
      return d;
    };
    const critical = length(data.layout.nav.criticalPath);
    expect(critical).toBeCloseTo(data.layout.nav.criticalPathLength, 0);
    expect(length(p)).toBeLessThanOrEqual(critical + 1e-6);
  });
  it('is the shortest route: equal to a plain Dijkstra on 400 pairs inside a zone (no ride on the way)', () => {
    const nodes = data.layout.nav.nodes;
    const index = new Map(nodes.map((n, i) => [n.id, i] as const));
    const adj: [number, number][][] = nodes.map(() => []);
    for (const [a, b] of data.layout.nav.links) {
      const ia = index.get(a) as number, ib = index.get(b) as number;
      const pa = (nodes[ia] as { pos: number[] }).pos, pb = (nodes[ib] as { pos: number[] }).pos;
      const d = Math.hypot((pa[0] as number) - (pb[0] as number), (pa[1] as number) - (pb[1] as number), (pa[2] as number) - (pb[2] as number));
      (adj[ia] as [number, number][]).push([ib, d]); (adj[ib] as [number, number][]).push([ia, d]);
    }
    const dijkstra = (from: number, to: number): number => {
      const dist = nodes.map(() => Infinity), done = nodes.map(() => false);
      dist[from] = 0;
      for (;;) {
        let cur = -1;
        for (let i = 0; i < nodes.length; i++) if (!done[i] && (dist[i] as number) < (cur < 0 ? Infinity : (dist[cur] as number))) cur = i;
        if (cur < 0) return Infinity;
        if (cur === to) return dist[cur] as number;
        done[cur] = true;
        for (const [j, d] of adj[cur] as [number, number][]) if ((dist[cur] as number) + d < (dist[j] as number)) dist[j] = (dist[cur] as number) + d;
      }
    };
    const cost = (path: string[]): number => {
      let d = 0;
      for (let i = 1; i < path.length; i++) {
        const a = data.navNode(path[i - 1] as string) as { pos: number[] }, b = data.navNode(path[i] as string) as { pos: number[] };
        d += Math.hypot((a.pos[0] as number) - (b.pos[0] as number), (a.pos[1] as number) - (b.pos[1] as number), (a.pos[2] as number) - (b.pos[2] as number));
      }
      return d;
    };
    let seed = 12345, checked = 0;
    const next = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let k = 0; k < 4000 && checked < 400; k++) {
      const a = next(nodes.length), b = next(nodes.length);
      if ((nodes[a] as { zone: string }).zone !== (nodes[b] as { zone: string }).zone) continue;
      const want = dijkstra(a, b);
      if (!Number.isFinite(want)) continue;
      const path = data.navPath((nodes[a] as { id: string }).id, (nodes[b] as { id: string }).id);
      if (path.some((id, i) => i > 0 && data.portalBetween(path[i - 1] as string, id))) continue;
      expect(path[0]).toBe((nodes[a] as { id: string }).id);
      expect(path[path.length - 1]).toBe((nodes[b] as { id: string }).id);
      expect(cost(path), `${path[0]} -> ${path[path.length - 1]}`).toBeCloseTo(want, 6);
      checked++;
    }
    expect(checked).toBe(400);
    // the caller's array is reused and no route is the empty array
    const out: string[] = ['stale'];
    expect(data.navPathInto(0, 3, false, out)).toBe(out.length);
    expect(out[0]).toBe((nodes[0] as { id: string }).id);
  });
  it('openOnly respects the gates through world.doorState', () => {
    const doors: Record<string, string> = {};
    const gated = createGameData({ strict: true, doorState: (id) => (doors[id] === 'open' ? 'open' : 'closed') });
    expect(gated.navPath('n_lip_057', 'n_st_001', false).length).toBeGreaterThan(1);
    expect(gated.navPath('n_lip_057', 'n_st_001', true)).toEqual([]);          // door_jug_gate is shut
    doors.door_jug_gate = 'ajar';
    expect(gated.navPath('n_lip_057', 'n_st_001', true)).toEqual([]);          // only 'open' is passable
    doors.door_jug_gate = 'open';
    expect(gated.navPath('n_lip_057', 'n_st_001', true).length).toBeGreaterThan(1);
    expect(gated.gatesOfLink('n_st_113', 'n_st_117').slice().sort()).toEqual(['door_yard_gate', 'ia_yard_door']);
  });
});

describe('greybox: layout solids -> colliders', () => {
  const layout = data.layout;
  const all = layout.zones.map((z) => z.id);
  it('maps every LayoutSolid flag to its ColFlag', () => {
    const s = (flags: Partial<LayoutSolid>): LayoutSolid => ({ id: 'x', zone: 'the_lip', shape: 'box', role: 'wall', surface: 'stone', pos: [0, 0, 0], size: [1, 1, 1], rotY: 0, ...flags });
    expect(solidFlags(s({}))).toBe(0);
    expect(solidFlags(s({ pierce: true }))).toBe(ColFlag.PIERCE);
    expect(solidFlags(s({ grille: true }))).toBe(ColFlag.GRILLE);
    expect(solidFlags(s({ skipsShots: true }))).toBe(ColFlag.GRILLE);
    expect(solidFlags(s({ low: true }))).toBe(ColFlag.LOW);
    expect(solidFlags(s({ stunsCharge: true }))).toBe(ColFlag.STUNS_CHARGE);
    expect(solidFlags(s({ blocksBossFire: true }))).toBe(ColFlag.BLOCKS_BOSS_FIRE);
    expect(solidFlags(s({ invisible: true }))).toBe(ColFlag.INVISIBLE);
    expect(solidFlags(s({ playerOnly: true }))).toBe(ColFlag.BODY_ONLY);
    expect(solidFlags(s({ invisible: true, playerOnly: true, seeThrough: true }))).toBe(ColFlag.INVISIBLE | ColFlag.BODY_ONLY);
    expect(SURFACE_TYPES).toEqual(COLLISION_SURFACES);                           // the Uint8 surface code is shared with the engine
  });
  it('a solid is live when its zone is built or its `sets` holds the resident set', () => {
    const flight1 = layout.solids.find((s) => s.id === 'gl_flight_1') as LayoutSolid;
    const flight2 = layout.solids.find((s) => s.id === 'gl_flight_2') as LayoutSolid;
    const surface = ['the_lip', 'plenty_street', 'tally_house'] as const;
    expect(solidLive(flight1, surface, 'surface')).toBe(true);                   // the seam: under the shut hatch from boot
    expect(solidLive(flight2, surface, 'surface')).toBe(false);
    expect(solidLive(flight2, [...surface, 'the_gallery'], 'surface')).toBe(true);
    const built = buildSolidColliders(layout, surface, 'surface');
    expect(built.solidIds).toContain('gl_landing_1');
    expect(built.solidIds).not.toContain('gl_flight_2');
    expect(built.solidIds).toContain('st_loft_ladder');                          // dynamic solids are in the set; the world switches them
  });
  it('builds closed, outward-facing shapes: box 12 triangles, ramp, tube', () => {
    const volume = (tris: number[]): number => {
      let v = 0;
      for (let i = 0; i < tris.length; i += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.slice(i, i + 9) as [number, number, number, number, number, number, number, number, number];
        v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      }
      return v;
    };
    const base = { id: 's', zone: 'the_lip', role: 'floor', surface: 'stone', rotY: 30 } as const;
    const box: number[] = [];
    expect(solidTriangles({ ...base, shape: 'box', pos: [3, 1, -2], size: [2, 4, 6] }, box)).toBe(12);
    expect(volume(box)).toBeCloseTo(48, 6);                                      // positive: every face winds outward
    const ramp: number[] = [];
    solidTriangles({ ...base, shape: 'ramp', pos: [0, 2, 0], size: [2, 4, 6], rise: '-z', skirt: 1 }, ramp);
    expect(volume(ramp)).toBeCloseTo(2 * 6 * 4 / 2 + 2 * 6 * 1, 6);
    const wedge: number[] = [];
    expect(solidTriangles({ ...base, shape: 'ramp', pos: [0, 2, 0], size: [2, 4, 6], rise: '+x', skirt: 0 }, wedge)).toBe(8);   // the low side is degenerate
    expect(volume(wedge)).toBeCloseTo(24, 6);
    const tube: number[] = [];
    solidTriangles({ ...base, shape: 'cylinder', pos: [0, 0, 0], size: [8, 2, 8], innerRadius: 3 }, tube);
    expect(volume(tube)).toBeGreaterThan(Math.PI * (16 - 9) * 2 * 0.97);
    expect(volume(tube)).toBeLessThan(Math.PI * (16 - 9) * 2);
    // the ramp's top really rises along `rise`
    const ys = (x: number, z: number): number => { let top = -Infinity; for (let i = 0; i < ramp.length; i += 3) if (Math.abs((ramp[i] as number) - x) < 1e-6 && Math.abs((ramp[i + 2] as number) - z) < 1e-6) top = Math.max(top, ramp[i + 1] as number); return top; };
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    expect(ys(-1 * c + -3 * s, 1 * s + -3 * c)).toBeCloseTo(4, 6);               // local (-1, -3): the -z edge is the high one
    expect(ys(-1 * c + 3 * s, 1 * s + 3 * c)).toBeCloseTo(0, 6);
  });
  it('builds the full layout in under 5 ms with parallel per-triangle arrays', () => {
    let best = Infinity;
    let built = buildSolidColliders(layout, all, 'surface');
    for (let i = 0; i < 20; i++) { const t = performance.now(); built = buildSolidColliders(layout, all, 'surface'); best = Math.min(best, performance.now() - t); }
    expect(built.solidIds).toHaveLength(309);
    expect(built.positions.length).toBe(built.triangles * 9);
    expect(built.triSurface.length).toBe(built.triangles);
    expect(built.triFlags.length).toBe(built.triangles);
    expect(built.triSolid.length).toBe(built.triangles);
    expect(built.triangles).toBeGreaterThan(306 * 8);
    const guard = built.solidIds.indexOf('bo_kerb_guard');
    const t = built.triSolid.indexOf(guard);
    expect((built.triFlags[t] as number) & ColFlag.BODY_ONLY).toBe(ColFlag.BODY_ONLY);
    expect(best, `best of 20: ${best.toFixed(2)} ms`).toBeLessThan(5);
  });
});
