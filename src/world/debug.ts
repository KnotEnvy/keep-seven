// src/world/debug.ts: WorldDebug (the contract surface the debug hook and tests use) and the extras registered under
// window.__dbg.ext.world: the hint-clock fast-forward, a door forcer, show-everything, and a round fired from the eye
// by the rules of ARCHITECTURE 3.6 (the stub player fires lead only: the sandbox and the tests need a line round).
import { ColFlag, LAYER_SHOT, Layer, PLAYER_EYE } from '../core/contracts.ts';
import type { AmmoType, DamageInfo, DoorState, GameEvents, HitList, HitOutcome, HitResponse, HitResult, MarkerId, WorldDebug } from '../core/contracts.ts';
import { PUZZLES } from './internals.ts';
import type { State } from './internals.ts';

export function createDebug(s: State): WorldDebug {
  return {
    solvePuzzle: (id) => { if (s.puzzles[id]) s.puzzles[id].solve(); },
    clearEncounter: (id) => s.director.debugClear(id),
    flags: () => Array.from(s.flags).sort(),
  };
}

type Ext = (...args: never[]) => unknown;

/** Extras only: nothing here is needed by a test that must survive integration except through WorldDebug. */
export function registerDebug(s: State): void {
  const { ctx } = s;
  let list: HitList | null = null;
  const response: HitResponse = { outcome: 'impact', stops: true, stopsLine: true, damageDealt: 0, healthLeft: 0 };
  const damage: DamageInfo = { amount: 100, kind: 'bullet', source: 'player', sourceId: 'player', ammo: 'lead_round', shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
  const fired: GameEvents['weapon/fired'] = { shotId: 0, ammo: 'lead_round', chambersLeft: 6, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0, mx: 0, my: 0, mz: 0, endX: 0, endY: 0, endZ: 0 };
  const resolved: GameEvents['combat/line_resolved'] = { shotId: 0, bodies: 0, freed: 0, knots: 0, endX: 0, endY: 0, endZ: 0 };
  let shotId = 100000;
  /**
   * One round from the eye along the view: a lead round stops at the nearest hit; a line round (60 m) meets every
   * volume on its line and stops at the first thing that is not PIERCE or whose receiver says so. Returns the
   * outcomes in order. The 40 ms spacing of the real weapon is not simulated: the receivers are called at once.
   */
  const shoot = (ammo: AmmoType = 'lead_round'): string[] => {
    const col = ctx.collision;
    if (!list) list = col.createHitList();
    const pl = ctx.player, p = pl.position, f = pl.forward;
    const ox = p.x, oy = p.y + PLAYER_EYE, oz = p.z;
    const line = ammo === 'line_round';
    const range = line ? 60 : 200;
    damage.ammo = ammo; damage.amount = line ? 300 : 100; damage.shotId = ++shotId;
    damage.ox = ox; damage.oy = oy; damage.oz = oz; damage.dx = f.x; damage.dy = f.y; damage.dz = f.z;
    const out: string[] = [];
    const n = col.raycastAll(ox, oy, oz, f.x, f.y, f.z, range, LAYER_SHOT, list);
    let endX = ox + f.x * range, endY = oy + f.y * range, endZ = oz + f.z * range;
    let knots = 0, freed = 0, bodies = 0;
    for (let i = 0; i < n; i++) {
      const hit = list.hits[i] as HitResult;
      response.outcome = 'impact'; response.stops = true; response.stopsLine = true; response.damageDealt = 0; response.healthLeft = 0;
      if (hit.receiver) hit.receiver.onHit(hit, damage, response);
      else if ((hit.flags & ColFlag.GRILLE) !== 0) response.outcome = 'deflected';
      const outcome = response.outcome as HitOutcome;              // the receiver has written it
      out.push(`${hit.entity ? hit.entity.id : hit.solidId || 'world'}:${outcome}`);
      if (hit.entity && hit.entity.kind === 'knot' && outcome === 'broke') knots++;
      if (outcome === 'freed') { freed++; bodies++; } else if (outcome === 'kill') bodies++;
      const solid = hit.layer === Layer.WORLD || hit.layer === Layer.DYNAMIC;
      const stops = line ? (hit.receiver ? response.stopsLine : solid && (hit.flags & ColFlag.PIERCE) === 0) : (hit.receiver ? response.stops : true);
      if (stops) { endX = hit.x; endY = hit.y; endZ = hit.z; break; }
    }
    fired.shotId = shotId; fired.ammo = ammo; fired.ox = ox; fired.oy = oy; fired.oz = oz; fired.dx = f.x; fired.dy = f.y; fired.dz = f.z;
    fired.mx = ox; fired.my = oy; fired.mz = oz; fired.endX = endX; fired.endY = endY; fired.endZ = endZ;
    ctx.events.emit('weapon/fired', fired);
    if (line) {
      resolved.shotId = shotId; resolved.bodies = bodies; resolved.freed = freed; resolved.knots = knots; resolved.endX = endX; resolved.endY = endY; resolved.endZ = endZ;
      ctx.events.emit('combat/line_resolved', resolved);
    }
    return out;
  };
  ctx.debug.register('world', {
    /** add seconds to every hint clock (the four puzzles and the kept ladder): the fast-forward of the sandbox */
    hintClock: ((seconds: number) => { for (const id of PUZZLES) s.puzzles[id].addHintSeconds(seconds); s.kept.addHintSeconds(seconds); }) as Ext,
    forceDoor: ((id: MarkerId, state: DoorState) => s.doors.force(id, state)) as Ext,
    showAll: ((on: boolean) => s.build.showAll(on)) as Ext,
    shoot: ((ammo?: AmmoType) => shoot(ammo)) as Ext,
    /** markers built per zone, and what each file of the piece reports */
    status: (() => ({ stats: { ...s.stats, secrets: s.stats.secrets.slice() }, markers: s.build.counts(), story: s.story.debug(), director: s.director.debug(), interact: s.interact.debug(), ride: s.rides.debug(), ending: s.ending.debug(), kept: s.kept.debug() })) as Ext,
    /** the build spread over ticks (the real-time path) under the step hook: true / false, or null for the default */
    spread: ((on: boolean | null, gate: boolean | null = null) => s.build.setSpread(on, gate)) as Ext,
    buildBusy: (() => s.build.busy) as Ext,
    buildJob: (() => s.build.jobState()) as Ext,
    /** say a story key through the sequencer */
    say: ((key: string) => s.story.say(key)) as Ext,
  });
}
