// src/enemies/tamper.ts: the Brute (GDD 7.3; work order 4.5). HP 1 200, slam 38, charge 35, walk 2.5 m/s, charge 9 m/s.
// vignette -> advance -> slam_windup -> slam -> slam_recover | charge_windup -> charge -> (charge_stun);
// stagger (a lead round in an open vent), line_stagger (a line round through a knot), flinch_plate, die.
// The vent lids are code-driven: the state says open, pool.ts turns the bones after the mixer.
import { ColFlag, PLAYER_HEIGHT, PLAYER_RADIUS } from '../core/contracts.ts';
import type { DamageInfo, HitResponse, HitResult, LayoutMarker, SpawnRequest } from '../core/contracts.ts';
import { CAPS, ENEMIES, TAMPER, TAMPER_WALK_RATE } from './defs.ts';
import type { Actor, Shared } from './internals.ts';
import { faceX, faceZ, respond } from './internals.ts';
import { moveBody, nextWaypoint, turnBody } from './nav.ts';

const DEF = ENEMIES.tamper;
const R = DEF.bodyRadius, H = DEF.bodyHeight;
const RAD = Math.PI / 180;
const SLAM_CYCLE = TAMPER.slamWindup + TAMPER.slam + TAMPER.slamRecover;
const KNOT_R = 0.28;

export function beginTamper(S: Shared, e: Actor, request: Readonly<SpawnRequest> | null, marker: LayoutMarker | null): void {
  e.ventChest = false; e.ventBack = false;
  const dormant = request ? request.dormantClip : '';
  if (dormant !== '') {
    // the bulkhead vignette: it pounds, facing the bulkhead, and ignores her
    const at = marker ? marker.params.bulkheadAt : undefined;
    if (Array.isArray(at) && typeof at[0] === 'number' && typeof at[2] === 'number') {
      e.yaw = Math.atan2(-(at[0] - e.x), -((at[2] as number) - e.z));
      e.rot.snap(e.yaw);
    }
    e.awake = false;
    e.dormantClip = dormant;
    e.count = 0;
    S.pool.setState(e, 'vignette');
    S.pool.play(e, dormant, 0);
    return;
  }
  S.pool.setState(e, 'advance');
  S.pool.play(e, 'walk', 0, TAMPER_WALK_RATE);
}

export function wakeTamper(S: Shared, e: Actor): void {
  if (e.state !== 'vignette' || !e.alive) return;
  e.awake = true;
  e.ventChest = false;
  S.pool.setState(e, 'advance');
  S.pool.play(e, 'walk', 0.2, TAMPER_WALK_RATE);
  if (e.vignette !== '') S.hooks.vignetteActorGone(e);
}

export function killTamper(S: Shared, e: Actor): void {
  if (!e.alive) return;
  S.pool.dropToken(e);
  S.pool.disableVolumes(e);
  const wasVignette = e.vignette !== '';
  e.alive = false; e.awake = true;
  e.hp = 0;
  e.down = 0;
  e.freeze = CAPS.killFreeze;
  e.ventChest = false; e.ventBack = false;
  if (e.shadow) { e.shadow.release(); e.shadow = null; }
  S.pool.setState(e, 'die');
  S.pool.play(e, 'die', 0);
  if (e.inst) S.ctx.render.setEmissive(e.inst.root, 0);
  const p = S.ev.died;
  p.x = e.x; p.y = e.y; p.z = e.z; p.id = e.id; p.kind = 'tamper'; p.encounter = e.encounter;
  S.ctx.events.emit('enemy/died', p);
  // every Bider alive falters 2 s (GDD 7.3)
  S.hooks.falterBiders(2.0, false);
  if (wasVignette) S.hooks.vignetteActorGone(e);
}

function crosses(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): boolean {
  const mx = cx - ox, my = cy - oy, mz = cz - oz;
  const t = mx * dx + my * dy + mz * dz;
  if (t < 0) return false;
  const d2 = mx * mx + my * my + mz * mz - t * t;
  return d2 <= r * r;
}

/** Does the shot's ray pass through the knot sphere behind a vent? (volume i: 0 chest, 1 back) */
function throughKnot(S: Shared, e: Actor, i: number, d: Readonly<DamageInfo>): boolean {
  const p = S.v2;
  if (!S.pool.objectPos(e.volNode[i] ?? null, p)) return false;
  return crosses(d.ox, d.oy, d.oz, d.dx, d.dy, d.dz, p.x, p.y, p.z, KNOT_R);
}

function leaveVignette(S: Shared, e: Actor): void {
  if (e.awake) return;
  e.awake = true;
  if (e.vignette !== '') S.hooks.vignetteActorGone(e);
}

function startStagger(S: Shared, e: Actor, line: boolean): void {
  S.pool.dropToken(e);
  e.ventChest = line; e.ventBack = line;
  S.pool.setState(e, line ? 'line_stagger' : 'stagger');
  // line_stagger plays the stagger clip at half speed (GDD 7.3: no new clip)
  S.pool.play(e, 'stagger', 0.05, line ? TAMPER.stagger / TAMPER.lineStagger : 1);
}

export function hitTamper(S: Shared, e: Actor, hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
  if (!e.alive) { respond(out, 'passed', false, false, 0, 0); return; }
  const before = e.hp;
  const vignette = e.state === 'vignette';
  const line = damage.ammo === 'line_round' || damage.ammo === 'kept_round';
  if (line) {
    // a flat 300 wherever it passes through the body, never more; through a knot it adds line_stagger (GDD 7.3)
    const knot = hit.part === 'vent_chest' || hit.part === 'vent_back';
    const dealt = Math.min(before, CAPS.lineRoundDamage);
    e.hp = before - dealt;
    S.damaged(e, hit.part, dealt);
    if (e.hp <= 0) { killTamper(S, e); respond(out, 'kill', false, false, dealt, 0); return; }
    leaveVignette(S, e);
    if (knot) {
      startStagger(S, e, true);
      e.freeze = CAPS.hitFreeze;
      respond(out, 'weak', false, false, dealt, e.hp);
      return;
    }
    e.flinch = TAMPER.flinchPlate;
    e.freeze = CAPS.hitFreeze;
    if (vignette) { S.pool.setState(e, 'advance'); S.pool.play(e, 'walk', 0.2, TAMPER_WALK_RATE); e.ventChest = false; }
    respond(out, 'hit', false, false, dealt, e.hp);
    return;
  }
  // lead: the knot sphere exists only while that vent is open, and only for a round that comes in at that vent's side.
  // Polish round 4: the two knots lie one behind the other on the body's axis, so a round into the chest plate also
  // crossed the back knot's sphere: a Tamper stunned on a rib, its back vent open, took 200 from in front, where no
  // vent shows. `along` > 0: the round travels the way the body faces (it comes from behind).
  const along = damage.dx * faceX(e.yaw) + damage.dz * faceZ(e.yaw);
  // (not in the bulkhead vignette: there the round into the vent is GDD 7.3's way to start the fight from the gantry behind it)
  const chest = e.ventChest && (vignette || along < TAMPER.ventSide) && throughKnot(S, e, 0, damage);
  const open = chest || (e.ventBack && along > -TAMPER.ventSide && throughKnot(S, e, 1, damage));
  if (open) {
    const dealt = Math.min(before, damage.amount * 2);
    e.hp = before - dealt;
    S.damaged(e, chest ? 'vent_chest' : 'vent_back', dealt);
    if (e.hp <= 0) { killTamper(S, e); respond(out, 'kill', true, false, dealt, 0); return; }
    leaveVignette(S, e);
    e.freeze = CAPS.hitFreeze;
    // during line_stagger a vent hit does its 200 and neither restarts nor shortens the state
    if (e.state !== 'line_stagger') startStagger(S, e, false);
    respond(out, 'weak', true, false, dealt, e.hp);
    return;
  }
  if (vignette) {
    // the bulkhead vignette: plate hits clank and do no damage (no chipping it down from the gantry)
    respond(out, 'deflected', true, false, 0, e.hp);
    return;
  }
  const dealt = Math.min(before, damage.amount * 0.25);
  e.hp = before - dealt;
  S.damaged(e, 'plate', dealt);
  if (e.hp <= 0) { killTamper(S, e); respond(out, 'kill', true, false, dealt, 0); return; }
  // flinch_plate: 0.2 m pushback, no interrupt
  e.flinch = TAMPER.flinchPlate;
  e.freeze = CAPS.hitFreeze;
  const l = Math.sqrt(damage.dx * damage.dx + damage.dz * damage.dz);
  if (l > 1e-4) { S.mx = damage.dx / l * TAMPER.pushback; S.mz = damage.dz / l * TAMPER.pushback; moveBody(S, e, R, H); }
  respond(out, 'deflected', true, false, dealt, e.hp);
}

function endAttack(S: Shared, e: Actor): void {
  S.pool.dropToken(e);
  if (e.unseen) S.tokens.delay(e.index, S.time + CAPS.tokenCooldown + SLAM_CYCLE);        // half frequency for an attack she could not see start
}

function slamDamage(S: Shared, e: Actor): boolean {
  const dx = S.px - e.ringX, dz = S.pz - e.ringZ, dy = S.py - e.ringY;
  if (dx * dx + dz * dz > TAMPER.slamRadius * TAMPER.slamRadius || Math.abs(dy) > 2.5 || !S.pAlive) return true;
  // line of sight required: ribs block (GDD 7.3)
  const los = S.sight(e.ringX, e.ringY + 1.0, e.ringZ, S.px, S.py + 1.0, S.pz);
  if (los < 0) return false;                      // the ray budget is spent this tick: ask again on the next
  if (los === 0) return true;
  const d = S.dmg;
  d.kind = 'slam'; d.source = 'tamper'; d.sourceId = e.id;
  d.ox = e.ringX; d.oy = e.ringY + 0.5; d.oz = e.ringZ;
  S.hurt((DEF.attacks[0] as { damage: number }).damage);
  e.count = 1;                                    // it landed (the pause before its next attack: the `slam` state's end)
  return true;
}

export function tickTamper(S: Shared, e: Actor, dt: number): void {
  if (!e.alive) { e.down += dt; return; }
  if (e.flinch > 0) e.flinch -= dt;
  if (e.state === 'vignette') {
    // the pounding: chest vent open through each wind-up, the ram lands 1.3 s into every 2.6 s
    const phase = e.t % TAMPER.poundLoop;
    e.ventChest = phase < TAMPER.poundWindup;
    const strikes = Math.floor((e.t + TAMPER.poundLoop - TAMPER.poundStrikeAt) / TAMPER.poundLoop);
    if (strikes > e.count) {
      e.count = strikes;
      const x = e.x + faceX(e.yaw) * TAMPER.slamReach, z = e.z + faceZ(e.yaw) * TAMPER.slamReach;
      S.attacked(e, 'pound');
      S.hooks.slamLanded(x, e.y, z, TAMPER.slamRadius);
    }
    return;
  }
  if (!S.ai) return;
  const think = ((S.tick + e.index) % CAPS.thinkEveryTicks) === 0;
  const dxp = S.px - e.x, dzp = S.pz - e.z;
  const dist = Math.sqrt(dxp * dxp + dzp * dzp);
  const level = Math.abs(S.py - e.y) < 2.0;
  const want = Math.atan2(-dxp, -dzp);

  switch (e.state) {
    case 'advance': {
      e.ventChest = false; e.ventBack = false;
      if (think) {
        const r = S.sight(e.x, e.y + 1.2, e.z, S.px, S.py + 1.2, S.pz);
        if (r >= 0) e.sees = r === 1;
        if (S.pAlive && level && dist <= TAMPER.slamRange) {
          // the arm comes down in front of it: it turns to her first
          let facing = (want - e.yaw) % (Math.PI * 2);
          if (facing > Math.PI) facing -= Math.PI * 2; else if (facing < -Math.PI) facing += Math.PI * 2;
          if (Math.abs(facing) < 0.6 && S.pool.takeToken(e, 'heavy')) { startSlam(S, e); break; }
        } else if (S.pAlive && level && e.sees && dist >= TAMPER.chargeMin && dist <= TAMPER.chargeMax && S.time - e.chargedAt > TAMPER.chargeEvery) {
          if (S.pool.takeToken(e, 'heavy')) {
            e.unseen = !S.inViewFlat(e.x, e.z);
            const scale = S.tellScale(e.unseen, e.x, e.z);
            const seconds = TAMPER.chargeWindup * scale;
            e.timer = seconds;
            S.pool.setState(e, 'charge_windup');
            S.pool.play(e, 'charge_windup', 0.1, 1 / scale);
            S.telegraph(e, 'charge', seconds);
            break;
          }
        }
      }
      // walk toward her: straight while she is in sight and near, else along the graph
      let heading = want;
      // polish round 4: and only on her level. Seen above it on the hall gantry, it walked to the plinth under her and
      // stayed there; now it takes the ramp (the graph), and on the gantry it is level with her and slams.
      // And not while it is wedged (`stuck` < 0): a charge stopped by the cabinet left it in the dead corner between
      // the cabinet, the ramp's side and the plinth, 4.8 m from a player at the ramp foot, walking into the cabinet
      // for as long as she stood there (26 s in a proxy run, plinked dead through its plate). Held 0.5 s, it takes the
      // graph round for `unwedge` seconds.
      if (e.stuck < 0 || !(e.sees && dist < 16 && Math.abs(S.py - e.y) < TAMPER.directLevel)) {
        const wp = nextWaypoint(S, e, S.nav.playerNode(S));
        if (wp >= 0) heading = Math.atan2(-((S.nav.x[wp] as number) - e.x), -((S.nav.z[wp] as number) - e.z));
      }
      S.ang = heading; S.turn = TAMPER.turnWalk * RAD * dt; turnBody(S, e);
      let off = (heading - e.yaw) % (Math.PI * 2);
      if (off > Math.PI) off -= Math.PI * 2; else if (off < -Math.PI) off += Math.PI * 2;
      if (Math.abs(off) < Math.PI / 3 && dist > 1.6) {
        const k = DEF.moveSpeed * dt;
        const sx = e.x, sz = e.z;
        S.mx = faceX(e.yaw) * k; S.mz = faceZ(e.yaw) * k; moveBody(S, e, R, H);
        const mx = e.x - sx, mz = e.z - sz;
        if (e.stuck < 0) e.stuck = Math.min(0, e.stuck + dt);
        else if (mx * mx + mz * mz < k * k * 0.09) { e.stuck += dt; if (e.stuck > 0.5) { e.stuck = -TAMPER.unwedge; e.pathGoal = -1; } } else e.stuck = 0;
      }
      break;
    }
    case 'slam_windup': {
      // polish round 3 (R3): the chest vent opens only for the last `slamVentLate` of the wind-up. Open from its first
      // tick, a round on sight staggered it every time and the arm never came down (13 to 19 s, no damage).
      e.ventChest = e.t >= e.timer - TAMPER.slamVentLateBy[S.difficultyId];   // polish round 4: by difficulty (defs.ts)
      if (e.t >= e.timer) {
        e.struck = false; e.count = 0;
        S.pool.setState(e, 'slam');
        S.pool.play(e, 'slam', 0.03);
        S.attacked(e, 'slam');
        S.hooks.slamLanded(e.ringX, e.ringY, e.ringZ, TAMPER.slamRadius);
      }
      break;
    }
    case 'slam': {
      e.ventChest = true;
      if (!e.struck) e.struck = slamDamage(S, e);
      if (e.t >= TAMPER.slam) {
        endAttack(S, e);
        // polish round 4 (fairness): a slam that landed is not followed by another attack until `slamAfterHit` after its
        // recover. It now reaches a player in a corner (it used to stun itself on the way), and three slams 2.8 s apart
        // were 114 of her 100 before she had got out of the first ring.
        if (e.count === 1) S.tokens.delay(e.index, S.time + TAMPER.slamRecover + TAMPER.slamAfterHit);
        S.pool.setState(e, 'slam_recover');
        S.pool.play(e, 'slam_recover', 0.05);
      }
      break;
    }
    case 'slam_recover': {
      e.ventChest = e.t < TAMPER.slamVentOpen;
      if (e.t >= TAMPER.slamRecover) { S.pool.setState(e, 'advance'); S.pool.play(e, 'walk', 0.2, TAMPER_WALK_RATE); }
      break;
    }
    case 'charge_windup': {
      S.ang = want; S.turn = TAMPER.turnWalk * RAD * dt; turnBody(S, e);
      if (e.t >= e.timer) {
        // the direction is fixed here
        e.dirX = faceX(e.yaw); e.dirZ = faceZ(e.yaw);
        e.moved = 0; e.struck = false; e.timer = 0;
        e.chargedAt = S.time;
        S.pool.setState(e, 'charge');
        S.pool.play(e, 'charge', 0.05);
        S.attacked(e, 'charge');
      }
      break;
    }
    case 'charge': {
      // 20 degrees per second: it cannot follow a side-step
      S.ang = want; S.turn = TAMPER.turnCharge * RAD * dt; turnBody(S, e);
      e.dirX = faceX(e.yaw); e.dirZ = faceZ(e.yaw);
      const k = TAMPER.chargeSpeed * dt;
      const sx = e.x, sz = e.z;
      S.mx = e.dirX * k; S.mz = e.dirZ * k; moveBody(S, e, R, H);
      const res = S.res;
      e.moved += k;
      if (!e.struck && S.pAlive && S.ctx.collision.segmentHitsCapsule(sx, e.y + 1.0, sz, e.x, e.y + 1.0, e.z, R, S.px, S.py, S.pz, PLAYER_RADIUS, PLAYER_HEIGHT)) {
        e.struck = true;
        const d = S.dmg;
        d.kind = 'charge'; d.source = 'tamper'; d.sourceId = e.id;
        d.ox = e.x; d.oy = e.y + 1.0; d.oz = e.z;
        S.hurt((DEF.attacks[1] as { damage: number }).damage);
        endAttack(S, e);
        S.pool.setState(e, 'advance');
        S.pool.play(e, 'walk', 0.25, TAMPER_WALK_RATE);
        break;
      }
      // a rib, the cabinet or a wall met head-on: stunned, back vent open (GDD 7.3)
      // Polish round 4: only a wall that really stops it. Any touch of a rib or the cabinet used to stun it: a graze of
      // the last 0.15 m of a corner, even a rib it was running away from. Against a player at the ramp foot it stunned
      // itself on five charges running, 17 m off, and never arrived. `e.timer` adds up how far walls have pushed it off
      // its line while it stays in contact: under `grazeDepth` it slides past and the charge goes on.
      if (res.hitWall) {
        const ox = e.x - (sx + e.dirX * k), oz = e.z - (sz + e.dirZ * k);
        e.timer += Math.sqrt(ox * ox + oz * oz);
      } else e.timer = 0;
      if (res.hitWall && e.timer > TAMPER.grazeDepth && ((res.wallFlags & ColFlag.STUNS_CHARGE) !== 0 || res.wallNx * e.dirX + res.wallNz * e.dirZ < -0.5)) {
        S.pool.dropToken(e);
        e.ventBack = true;
        S.pool.setState(e, 'charge_stun');
        S.pool.play(e, 'charge_stun', 0.03);
        break;
      }
      if (e.moved >= TAMPER.chargeDistance) {
        endAttack(S, e);
        S.pool.setState(e, 'advance');
        S.pool.play(e, 'walk', 0.25, TAMPER_WALK_RATE);
      }
      break;
    }
    case 'charge_stun': {
      e.ventBack = true;
      if (e.t >= TAMPER.chargeStun) { e.ventBack = false; S.pool.setState(e, 'advance'); S.pool.play(e, 'walk', 0.2, TAMPER_WALK_RATE); }
      break;
    }
    case 'stagger': {
      e.ventChest = false; e.ventBack = false;
      if (e.t >= TAMPER.stagger) { S.pool.setState(e, 'advance'); S.pool.play(e, 'walk', 0.2, TAMPER_WALK_RATE); }
      break;
    }
    case 'line_stagger': {
      e.ventChest = true; e.ventBack = true;
      if (e.t >= TAMPER.lineStagger) { e.ventChest = false; e.ventBack = false; S.pool.setState(e, 'advance'); S.pool.play(e, 'walk', 0.2, TAMPER_WALK_RATE); }
      break;
    }
    default: break;
  }
}

function startSlam(S: Shared, e: Actor): void {
  e.unseen = !S.inViewFlat(e.x, e.z);
  const scale = S.tellScale(e.unseen, e.x, e.z);
  const seconds = TAMPER.slamWindup * scale;
  e.timer = seconds;
  e.ventChest = false;
  e.ringX = e.x + faceX(e.yaw) * TAMPER.slamReach; e.ringY = e.y; e.ringZ = e.z + faceZ(e.yaw) * TAMPER.slamReach;
  S.pool.setState(e, 'slam_windup');
  S.pool.play(e, 'slam_windup', 0.1, 1 / scale);
  S.telegraph(e, 'slam', seconds);
  S.ctx.render.vfx.ring('slam', e.ringX, e.ringY, e.ringZ, TAMPER.slamRadius, seconds, TAMPER.slam);
}
