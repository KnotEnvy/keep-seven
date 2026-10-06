// src/enemies/transit.ts: the Marksman (GDD 7.2; work order 4.3). HP 200, stake 22, walk 3.5 m/s, threat 2, max alive 2.
// emerge -> relocate -> plant -> aim (0.9 s tell) -> fire -> cooldown; relocates after two shots from a point;
// sidestep under the crosshair; flinch on a body hit (an aim in progress restarts from plant); die_fold.
import { PLAYER_EYE } from '../core/contracts.ts';
import type { DamageInfo, HitResponse, HitResult, LayoutMarker, SpawnRequest } from '../core/contracts.ts';
import { CAPS, ENEMIES, TRANSIT, TRANSIT_WALK_RATE } from './defs.ts';
import type { Actor, Shared } from './internals.ts';
import { respond } from './internals.ts';
import { moveBody, nextWaypoint, turnBody } from './nav.ts';

const DEF = ENEMIES.transit;
const R = DEF.bodyRadius, H = DEF.bodyHeight;
const LENS_Y = 1.62;
const TURN = 4.2;                 // rad/s (240 degrees per second)
const CYCLE = TRANSIT.aim + TRANSIT.fire + TRANSIT.cooldown;

export function beginTransit(S: Shared, e: Actor, request: Readonly<SpawnRequest> | null, marker: LayoutMarker | null): void {
  e.fresh = true;
  e.wantPoint = -1;
  e.namedPoint = -1;
  if (marker && typeof marker.params.firingPoint === 'string') {
    const i = S.nav.ids.indexOf(marker.params.firingPoint);
    if (i >= 0) e.namedPoint = i;
  }
  const entrance = request ? request.entrance : '';
  if (entrance === 'emerge' || entrance === 'doorway') {
    e.timer = TRANSIT.emerge;
    S.pool.setState(e, 'emerge');
    S.pool.play(e, 'emerge', 0);
    return;
  }
  S.pool.setState(e, 'relocate');
  S.pool.play(e, 'walk', 0, TRANSIT_WALK_RATE);
}

function dropAim(S: Shared, e: Actor): void {
  if (e.thread) { e.thread.release(); e.thread = null; }
  if (e.star) { e.star.release(); e.star = null; }
  S.pool.dropToken(e);
}

function leavePoint(S: Shared, e: Actor): void {
  if (e.point >= 0 && e.point < S.nav.owner.length && S.nav.owner[e.point] === e.index) S.nav.owner[e.point] = -1;
  e.point = -1;
}

/**
 * One firing point a think is looked at from: has it a sight line to her? (GDD 7.2: points are scored on line of sight.)
 * Round robin over the points through the budgeted ray, so the whole module still casts at most four a tick.
 */
function scout(S: Shared): void {
  const nav = S.nav, list = nav.firing;
  if (list.length === 0) return;
  const i = nav.fpCursor % list.length, n = list[i] as number;
  const r = S.sight(nav.x[n] as number, (nav.y[n] as number) + LENS_Y, nav.z[n] as number, S.px, S.py + 1.2, S.pz);
  if (r < 0) return;                                        // the budget is spent: the same point on the next think
  nav.fpSees[i] = r;
  nav.fpCursor = i + 1;
}

/**
 * The best authored firing point (GDD 7.2): scored on line of sight to her, the 12 to 25 m band, unoccupied, not used
 * in the last 10 s; a shorter walk breaks ties. -1 = none.
 */
export function choosePoint(S: Shared, e: Actor, avoid: number): number {
  const nav = S.nav, list = nav.firing;
  let best = -1, bestScore = -Infinity;
  const from = nav.nearest(e.x, e.y, e.z);
  const fx = from >= 0 ? (nav.x[from] as number) - e.x : 0, fz = from >= 0 ? (nav.z[from] as number) - e.z : 0;
  const lead = Math.sqrt(fx * fx + fz * fz);
  for (let i = 0; i < list.length; i++) {
    const n = list[i] as number;
    if (n === avoid) continue;
    if ((e.badPoints & (1 << i)) !== 0) continue;
    const own = nav.owner[n] as number;
    if (own !== -1 && own !== e.index) continue;
    const dx = (nav.x[n] as number) - S.px, dz = (nav.z[n] as number) - S.pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    let score = 0;
    const sees = nav.fpSees[i] as number;
    if (sees === 1) score += TRANSIT.scoreSight; else if (sees === 0) score -= TRANSIT.scoreSight;
    if (d >= TRANSIT.bandMin && d <= TRANSIT.bandMax) score += TRANSIT.scoreBand;
    else if (d < TRANSIT.bandMin) score -= (TRANSIT.bandMin - d) * 2 + (d < TRANSIT.backOff ? 20 : 0);
    else score -= (d - TRANSIT.bandMax) * 0.8;
    if (S.time - (nav.usedAt[n] as number) < TRANSIT.pointReuse) score -= TRANSIT.scoreReused;
    // the walk there, by the route (a catwalk 13 m away up a stair is a 30 m walk); no route: not a candidate
    const walk = nav.routeLength(from, n);
    if (walk === Infinity) continue;
    score -= (lead + walk) * TRANSIT.scorePerMetre;
    if (n === e.namedPoint && e.stood === 0) score += TRANSIT.scoreNamed;        // the point its spawn marker names
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best;
}

function markBad(S: Shared, e: Actor, node: number): void {
  const list = S.nav.firing;
  for (let i = 0; i < list.length && i < 31; i++) if (list[i] === node) e.badPoints |= 1 << i;
}

function startRelocate(S: Shared, e: Actor, avoid: number): boolean {
  const n = choosePoint(S, e, avoid);
  if (n < 0) return false;
  leavePoint(S, e);
  e.wantPoint = n;
  e.pathGoal = -1;
  e.shots = 0;
  e.blind = 0;
  if (e.state !== 'relocate') { S.pool.setState(e, 'relocate'); S.pool.play(e, 'walk', 0.15, TRANSIT_WALK_RATE); }
  return true;
}

/** True when no authored firing point is known to have a sight line to her (and every one has been looked at). */
function noPointSees(S: Shared): boolean {
  const sees = S.nav.fpSees;
  for (let i = 0; i < sees.length; i++) if (sees[i] !== 0) return false;
  return true;
}

/**
 * Is there a Transit within `seekApart` that this one gives way to? One that stands with a sight of her (it found her
 * through the same door), or one with a lower pool index that stands blind or is itself seeking. The index is the
 * tie-break: of two blind Transits side by side exactly one goes looking, and of two that seek together the second
 * follows `seekApart` behind the first (they used to arrive in one step and plant on one spot).
 */
function crowded(S: Shared, e: Actor): boolean {
  const list = S.actors;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!o || o === e || !o.used || !o.alive || o.kind !== 'transit' || o.state === 'relocate' || o.state === 'emerge') continue;
    if (o.state === 'seek' ? o.index > e.index : !o.sees && o.index > e.index) continue;
    const dx = o.x - e.x, dz = o.z - e.z;
    if (dx * dx + dz * dz < TRANSIT.seekApart * TRANSIT.seekApart) return true;
  }
  return false;
}

/** Nearest other standing Transit is at least `passApart` away (polish round 4: where a passing Transit may plant). */
function clearOfOthers(S: Shared, e: Actor): boolean {
  const list = S.actors;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!o || o === e || !o.used || !o.alive || o.kind !== 'transit') continue;
    const dx = o.x - e.x, dz = o.z - e.z;
    if (dx * dx + dz * dz < TRANSIT.passApart * TRANSIT.passApart) return false;
  }
  return true;
}

/** Leave the point and walk toward her along the graph until she is in sight (state `seek`). */
function startSeek(S: Shared, e: Actor, pass = false): boolean {
  if (pass) e.pathGoal = -1;
  if (nextWaypoint(S, e, S.nav.playerNode(S)) < 0) return false;
  leavePoint(S, e);
  e.pass = pass;
  e.wantPoint = -1;
  e.shots = 0;
  e.blind = 0;
  e.stuck = 0;
  e.seekNode = -1; e.seekBest = Infinity;
  S.pool.setState(e, 'seek');
  S.pool.play(e, 'walk', 0.15, TRANSIT_WALK_RATE);
  return true;
}

/**
 * A seek that ended without a sight of her (as near as the graph goes, out of time, or walled in): it plants where it
 * stands, facing where she was, and holds there `seekHold` seconds before it thinks of moving again (polish round 3:
 * it used to relocate, seek and relocate in turn: 138 m walked and 2 400 degrees turned in 90 s without ever seeing her).
 */
function holdBlind(S: Shared, e: Actor): void {
  e.pathGoal = -1;
  startPlant(S, e);
  e.chooseAt = S.time + TRANSIT.seekHold;
}

function startPlant(S: Shared, e: Actor): void {
  e.timer = TRANSIT.plant;
  e.blind = 0;
  S.pool.setState(e, 'plant');
  S.pool.play(e, 'plant', 0.05);
}

function startAim(S: Shared, e: Actor, tx: number, ty: number, tz: number): void {
  const seconds = TRANSIT.aim * S.difficulty.telegraphScale;
  e.timer = seconds;
  e.aimX = tx; e.aimY = ty; e.aimZ = tz;
  e.miss = false;
  e.count = 0;
  S.pool.setState(e, 'aim');
  S.pool.play(e, 'aim_hold', 0.1);
  e.thread = S.ctx.render.vfx.acquireLine('sighting_thread');
  e.star = S.ctx.render.vfx.acquireCard('aim_star');
  S.telegraph(e, 'aim', seconds);
}

export function killTransit(S: Shared, e: Actor): void {
  if (!e.alive) return;
  dropAim(S, e);
  leavePoint(S, e);
  S.pool.disableVolumes(e);
  e.alive = false;
  e.hp = 0;
  e.down = 0;
  e.freeze = CAPS.killFreeze;
  if (e.shadow) { e.shadow.release(); e.shadow = null; }
  S.pool.setState(e, 'die_fold');
  S.pool.play(e, 'die_fold', 0);
  if (e.inst) S.ctx.render.setEmissive(e.inst.root, 0);
  const p = S.ev.died;
  p.x = e.x; p.y = e.y; p.z = e.z; p.id = e.id; p.kind = 'transit'; p.encounter = e.encounter;
  S.ctx.events.emit('enemy/died', p);
  if (e.vignette !== '') S.hooks.vignetteActorGone(e);
}

export function hitTransit(S: Shared, e: Actor, hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
  if (!e.alive) { respond(out, 'passed', false, false, 0, 0); return; }
  const before = e.hp;
  const line = damage.ammo === 'line_round' || damage.ammo === 'kept_round';
  // the lens is a weak point from the front; a round from behind meets the drum (the sphere sits inside the head)
  const lens = hit.part === 'lens' && (damage.dx * -Math.sin(e.yaw) + damage.dz * -Math.cos(e.yaw)) < 0.17;
  const amount = line ? Math.max(damage.amount, CAPS.lineRoundDamage) : damage.amount * (lens ? 2 : 1);
  const dealt = Math.min(before, amount);
  e.hp = before - dealt;
  S.damaged(e, lens ? 'lens' : 'body', dealt);
  if (e.hp <= 0) {
    killTransit(S, e);
    respond(out, 'kill', !line, false, dealt, 0);
    return;
  }
  // a body hit: flinch 0.25 s; an aim in progress is cancelled and restarts from plant (GDD 7.2)
  e.freeze = CAPS.hitFreeze;
  dropAim(S, e);
  if (e.bell) { e.bell = false; S.hooks.vignetteActorGone(e); e.resume = 'relocate'; }
  else e.resume = e.state === 'relocate' || e.state === 'emerge' ? 'relocate' : 'plant';
  S.pool.setState(e, 'flinch');
  S.pool.play(e, 'flinch', 0.03);
  respond(out, lens ? 'weak' : 'hit', true, false, dealt, e.hp);
}

/** A shot was fired in its encounter: it knows where she is (GDD 7.2: hears shots anywhere in its encounter). */
export function transitHears(S: Shared, e: Actor): void {
  if (!e.alive || e.kind !== 'transit' || e.bell) return;
  e.heard = true;
  e.lkx = S.px; e.lky = S.py; e.lkz = S.pz;
}

function look(S: Shared, e: Actor, dist: number): void {
  const r = S.sight(e.x, e.y + LENS_Y, e.z, S.px, S.py + 1.2, S.pz);
  if (r < 0) return;
  let sees = r === 1 && dist <= TRANSIT.sight;
  if (sees && !e.heard) {
    // 120 degree cone about its facing
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const dx = S.px - e.x, dz = S.pz - e.z;
    if ((dx * fx + dz * fz) / (dist || 1) < TRANSIT.coneCos) sees = false;
  }
  e.sees = sees;
  if (sees) { e.heard = true; e.lost = 0; e.lkx = S.px; e.lky = S.py; e.lkz = S.pz; }
}

/** The stake leaves the muzzle toward the frozen aim point. */
function fire(S: Shared, e: Actor): void {
  const m = S.v2;
  if (!S.pool.nodePos(e, 'stake_muzzle', m)) { m.x = e.x; m.y = e.y + 1.46; m.z = e.z; }
  const dx = e.aimX - m.x, dy = e.aimY - m.y, dz = e.aimZ - m.z;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const s = S.shot;
  s.ox = m.x; s.oy = m.y; s.oz = m.z;
  s.dx = dx / l; s.dy = dy / l; s.dz = dz / l;
  s.speed = TRANSIT.stakeSpeed;
  s.damage = (DEF.attacks[0] as { damage: number }).damage;
  s.kind = 'stake'; s.source = 'transit'; s.sourceId = e.id; s.encounter = e.encounter;
  s.harmful = !e.bell;
  // the bell is a target, not a solid: the stake sticks where it meets it
  s.maxDistance = e.bell ? l : 0;
  if (e.bell) e.timer = l / TRANSIT.stakeSpeed;             // the stake's flight: the scene is not over before it lands
  S.stakes.fire(s);
  S.attacked(e, 'stake');
}

export function tickTransit(S: Shared, e: Actor, dt: number): void {
  if (!e.alive) { e.down += dt; return; }
  if (!S.ai) return;
  const think = ((S.tick + e.index) % CAPS.thinkEveryTicks) === 0;
  const dxp = S.px - e.x, dzp = S.pz - e.z;
  const dist = Math.sqrt(dxp * dxp + dzp * dzp);
  if (!e.sees) e.lost += dt;

  switch (e.state) {
    case 'emerge': {
      if (think && !e.bell) {
        // while it unfolds it finds out which firing points have a sight of her, and whether the door it stands in has
        scout(S);
        const r = S.sight(e.x, e.y + LENS_Y, e.z, S.px, S.py + 1.2, S.pz);
        if (r >= 0) e.sees = r === 1;
      }
      if (e.t < e.timer) break;
      if (e.bell) { startPlant(S, e); break; }
      // a sight of her where it stands, not inside the 8 m it backs off from and not beyond the band: it plants and
      // aims there (GDD 7.2: line of sight first);
      // the point its marker names is where it relocates to after its two shots
      if (e.sees && dist >= TRANSIT.backOff && dist <= TRANSIT.bandMax) { e.lkx = S.px; e.lky = S.py; e.lkz = S.pz; startPlant(S, e); break; }
      if (!startRelocate(S, e, -1)) startPlant(S, e);
      break;
    }
    case 'relocate': {
      if (think) { look(S, e, dist); scout(S); e.blind += CAPS.thinkEveryTicks / 60; }
      let n = e.wantPoint;
      if (n < 0 || n >= S.nav.count) { if (!startRelocate(S, e, -1)) startPlant(S, e); break; }
      if (think && e.blind >= 1.0 && S.nav.fpSees[S.nav.firingIndex(n)] === 0) {
        // the point it is walking to has no sight of her (she moved, or it was chosen before anyone had looked): choose again
        e.blind = 0;
        const better = choosePoint(S, e, -1);
        if (better >= 0 && better !== n) { e.wantPoint = better; e.pathGoal = -1; n = better; }
      }
      const wp = nextWaypoint(S, e, n);
      if (wp < 0) {
        const dx = (S.nav.x[n] as number) - e.x, dz = (S.nav.z[n] as number) - e.z;
        if (dx * dx + dz * dz < 1.0 && e.pathLen > 0) {
          // on the point
          e.point = n; S.nav.owner[n] = e.index; S.nav.usedAt[n] = S.time; e.shots = 0; e.stood++;
          startPlant(S, e);
        } else {
          // no route there (a shut door): never ask for it again
          markBad(S, e, n);
          if (!startRelocate(S, e, -1)) startPlant(S, e);
        }
        break;
      }
      const tx = (S.nav.x[wp] as number) - e.x, tz = (S.nav.z[wp] as number) - e.z;
      const l = Math.sqrt(tx * tx + tz * tz) || 1;
      const sx = e.x, sz = e.z;
      S.mx = tx / l * DEF.moveSpeed * dt; S.mz = tz / l * DEF.moveSpeed * dt; moveBody(S, e, R, H);
      const made = Math.sqrt((e.x - sx) * (e.x - sx) + (e.z - sz) * (e.z - sz));
      if (made < DEF.moveSpeed * dt * 0.3) { e.stuck += dt; if (e.stuck > 1.0) { e.stuck = 0; markBad(S, e, n); if (!startRelocate(S, e, -1)) startPlant(S, e); } } else e.stuck = 0;
      S.ang = Math.atan2(-tx, -tz); S.turn = TURN * dt; turnBody(S, e);
      break;
    }
    case 'plant': {
      if (e.bell) {
        if (e.t >= e.timer) {
          S.pool.takeToken(e, 'ranged');
          startAim(S, e, e.aimX, e.aimY, e.aimZ);
        }
        break;
      }
      if (think) { look(S, e, dist); scout(S); }
      // face where she is, or was last known (it came into the fight knowing where it was going)
      const fx = e.sees ? S.px : e.lkx, fz = e.sees ? S.pz : e.lkz;
      S.ang = Math.atan2(-(fx - e.x), -(fz - e.z)); S.turn = TURN * dt; turnBody(S, e);
      if (e.t < e.timer) break;
      if (e.clip === 'plant') S.pool.play(e, 'idle_scan', 0.15);
      if (sidestep(S, e, dist, dt)) break;
      if (e.sees && S.pAlive) {
        e.blind = 0;
        // she is inside 8 m: back off, when an authored point has a sight of her to back off to (polish round 3: one that
        // had walked up to find her backed off blind at once and never fired)
        if (think && dist < TRANSIT.backOff && S.time >= e.chooseAt && !noPointSees(S)) {
          e.chooseAt = S.time + 1.0;
          if (startRelocate(S, e, e.point)) break;
        }
        if (S.pool.takeToken(e, 'ranged')) startAim(S, e, S.px, S.py + 1.2, S.pz);
      } else {
        e.blind += dt;
        if (e.blind > TRANSIT.blindAfter && think && S.time >= e.chooseAt) {
          e.chooseAt = S.time + 1.0;
          // no sight of her from here: to a point that has one; if none is known to, it holds a while longer, then moves anyway
          const n = choosePoint(S, e, e.point);
          if (n >= 0 && S.nav.fpSees[S.nav.firingIndex(n)] === 1) startRelocate(S, e, e.point);
          // no authored point has a sight of where she stands (she holds at a gate, behind a corner): it goes to find
          // her, walking toward her until it sees her (polish round 2: the yard went dead for a player at its gate).
          // Polish round 3: however near she is; and when it already stands as near as the graph goes it holds there,
          // facing where she was, instead of pacing to another blind point.
          // Polish round 4: held behind a Transit that sees her (it gave way in the doorway and stood there blind for
          // the rest of the fight): after `passAfter` it walks on past that one to a place of its own with a sight of her.
          else if (noPointSees(S)) {
            if (e.blind > TRANSIT.seekAfter) {
              if (!crowded(S, e)) { if (startSeek(S, e)) break; }
              else if (e.blind > TRANSIT.passAfter && startSeek(S, e, true)) break;
            }
          }
          else if (n >= 0 && e.blind > TRANSIT.blindGiveUp) startRelocate(S, e, e.point);
        }
      }
      break;
    }
    case 'aim': {
      const seconds = e.timer;
      const left = seconds - e.t;
      if (!e.bell) {
        // the head is still for the last 0.4 s; the thread stops tracking for the last 0.25 s
        if (left > TRANSIT.headStill) { S.ang = Math.atan2(-dxp, -dzp); S.turn = TURN * dt; turnBody(S, e); }
        if (left > TRANSIT.threadFreeze) { e.aimX = S.px; e.aimY = S.py + 1.2; e.aimZ = S.pz; }
        else if (e.count === 0) freezeAim(S, e);
      } else {
        const bx = e.aimX - e.x, bz = e.aimZ - e.z;
        if (left > TRANSIT.headStill) { S.ang = Math.atan2(-bx, -bz); S.turn = TURN * dt; turnBody(S, e); }
      }
      if (e.thread || e.star) {
        const p = S.v2;
        if (!S.pool.objectPos(e.volNode[0] ?? null, p)) { p.x = e.x; p.y = e.y + LENS_Y; p.z = e.z; }
        if (e.thread) { e.thread.setPosition(p.x, p.y, p.z); e.thread.setEnd(e.aimX, e.aimY, e.aimZ); }
        if (e.star) { e.star.setPosition(p.x, p.y, p.z); e.star.setLevel(seconds > 0 ? Math.min(1, e.t / seconds) : 1); }
      }
      if (e.t >= seconds) {
        if (e.thread) { e.thread.release(); e.thread = null; }
        if (e.star) { e.star.release(); e.star = null; }
        fire(S, e);
        e.shots++;
        if (!e.bell) e.fresh = false;
        S.pool.setState(e, 'fire');
        S.pool.play(e, 'fire', 0.02);
      }
      break;
    }
    case 'fire': {
      if (e.t < TRANSIT.fire) break;
      S.pool.dropToken(e);
      if (!S.inView(e.x, e.y + LENS_Y, e.z)) S.tokens.delay(e.index, S.time + CAPS.tokenCooldown + CYCLE);     // half frequency out of view
      if (e.bell) {
        // the stake is on its way to the bell: it turns to her, and only then is the scene over (work order 4.6)
        S.pool.setState(e, 'bell_turn');
        S.pool.play(e, 'idle_scan', 0.15);
        break;
      }
      S.pool.setState(e, 'cooldown');
      S.pool.play(e, 'idle_scan', 0.15);
      break;
    }
    case 'bell_turn': {
      // it has not targeted her before this turn; a body hit in it ends the scene like any other (hitTransit)
      const want = Math.atan2(-dxp, -dzp);
      S.ang = want; S.turn = TURN * dt; turnBody(S, e);
      let off = (want - e.yaw) % (Math.PI * 2);
      if (off > Math.PI) off -= Math.PI * 2; else if (off < -Math.PI) off += Math.PI * 2;
      // held until the stake has landed (e.timer: its flight) and the head has come round
      if (e.t < TRANSIT.bellTurn || e.t < e.timer || Math.abs(off) > 0.05) break;
      e.bell = false;
      e.shots = 0;
      e.heard = true; e.lkx = S.px; e.lky = S.py; e.lkz = S.pz;
      S.hooks.vignetteActorGone(e);
      if (!startRelocate(S, e, -1)) startPlant(S, e);
      break;
    }
    case 'cooldown': {
      if (think) { look(S, e, dist); scout(S); }
      if (sidestep(S, e, dist, dt)) break;
      if (e.t < TRANSIT.cooldownBy[S.difficultyId]) break;   // polish round 4: by difficulty (defs.ts)
      // relocation rule: after 2 shots from one point; not from the one place it has a sight of her (it came to find her
      // and no authored point sees her): there it stands and goes on
      if (e.shots >= TRANSIT.shotsPerPoint) {
        if (e.sees && e.point < 0 && noPointSees(S)) e.shots = 0;
        else if (startRelocate(S, e, e.point)) break;
      }
      e.timer = 0;
      e.blind = 0;
      S.pool.setState(e, 'plant');
      break;
    }
    case 'seek': {
      if (think) { look(S, e, dist); scout(S); }
      // a sight of her inside its range: it plants where it stands and aims
      if (e.sees && dist <= TRANSIT.bandMax && (e.pass ? clearOfOthers(S, e) : !crowded(S, e))) { e.pass = false; e.lkx = S.px; e.lky = S.py; e.lkz = S.pz; startPlant(S, e); break; }
      // another Transit already stands on the way (it found her through the same door): this one holds `seekApart` short
      // of it rather than plant inside it (a passing one walks on: polish round 4)
      if (think && !e.pass && crowded(S, e)) { holdBlind(S, e); break; }
      // an authored point has come into sight of her meanwhile: that is where it would rather stand
      if (think && S.time >= e.chooseAt && !noPointSees(S)) { e.chooseAt = S.time + 1.0; if (startRelocate(S, e, -1)) break; }
      // polish round 3: it walks on until it sees her, however near she is (it stopped 8 m short, on the far side of a wall)
      const wp = e.t < TRANSIT.seekMax ? nextWaypoint(S, e, S.nav.playerNode(S)) : -1;
      if (wp < 0) { const passed = e.pass; e.pass = false; holdBlind(S, e); if (passed) e.chooseAt = S.time + TRANSIT.passRetry; break; }   // as near as it goes without a sight (or no route): it holds there
      const tx = (S.nav.x[wp] as number) - e.x, tz = (S.nav.z[wp] as number) - e.z;
      const l = Math.sqrt(tx * tx + tz * tz) || 1;
      // progress is measured on the distance to the node it walks to. A node it cannot stand on (a body in the way, a
      // post beside it) used to hold it for good, walking round the node and turning on the spot: after 0.75 s without
      // getting nearer the node counts as passed, and when it was the last one it holds there.
      if (wp !== e.seekNode) { e.seekNode = wp; e.seekBest = l; e.stuck = 0; }
      else if (l < e.seekBest - 0.02) { e.seekBest = l; e.stuck = 0; }
      else {
        e.stuck += dt;
        if (e.stuck > 0.75) {
          e.stuck = 0; e.seekNode = -1;
          e.pathAt++;
          if (e.pathAt >= e.pathLen) { const passed = e.pass; e.pass = false; holdBlind(S, e); if (passed) e.chooseAt = S.time + TRANSIT.passRetry; break; }
        }
      }
      S.mx = tx / l * DEF.moveSpeed * dt; S.mz = tz / l * DEF.moveSpeed * dt;
      if (e.pass) stepRound(S, e, dt);
      moveBody(S, e, R, H);
      if (l > 0.3) { S.ang = Math.atan2(-tx, -tz); S.turn = TURN * dt; turnBody(S, e); }
      break;
    }
    case 'sidestep': {
      const k = TRANSIT.sidestepDistance / TRANSIT.sidestep * dt;
      S.mx = e.dirX * k; S.mz = e.dirZ * k; moveBody(S, e, R, H);
      if (e.t >= TRANSIT.sidestep) startPlant(S, e);
      break;
    }
    case 'flinch': {
      if (e.t < TRANSIT.flinch) break;
      if (e.resume === 'relocate') { S.pool.setState(e, 'relocate'); S.pool.play(e, 'walk', 0.1, TRANSIT_WALK_RATE); if (e.wantPoint < 0) startRelocate(S, e, -1); } else startPlant(S, e);
      break;
    }
    default: break;
  }
}

/** A passing Transit steps round the bodies of the others instead of through them: a push away from each within 1.3 m, added to (S.mx, S.mz). */
function stepRound(S: Shared, e: Actor, dt: number): void {
  const list = S.actors;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!o || o === e || !o.used || !o.alive || o.kind !== 'transit') continue;
    const dx = e.x - o.x, dz = e.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1.3 * 1.3 || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), push = (1.3 - d) * 6 * dt;
    S.mx += dx / d * push; S.mz += dz / d * push;
  }
}

/** The thread stops tracking: the aim point is fixed, with the deliberate miss in it (first shot at a fresh target; x0.8 against a fast target). */
function freezeAim(S: Shared, e: Actor): void {
  e.count = 1;
  e.miss = e.fresh || (S.pSpeed > CAPS.fastTargetSpeed && !S.rng.chance(CAPS.fastTargetAccuracy));
  if (!e.miss) return;
  const dx = S.px - e.x, dz = S.pz - e.z;
  const l = Math.sqrt(dx * dx + dz * dz) || 1;
  // beside her, on the side she is not moving toward
  let sx = -dz / l, sz = dx / l;
  if (sx * S.pvx + sz * S.pvz > 0) { sx = -sx; sz = -sz; }
  e.aimX = S.px + sx * TRANSIT.missOffset; e.aimZ = S.pz + sz * TRANSIT.missOffset;
}

/** Sidestep when the crosshair rests on it for 0.6 s beyond 10 m, at most once per 3 s, never during an aim (GDD 7.2). */
function sidestep(S: Shared, e: Actor, dist: number, dt: number): boolean {
  // "on it" is the whole body, legs to drum (the two-body-shot kill is lined up there, not on the lens): her aim ray
  // within crosshairRadius of the body's vertical axis between crosshairLow and crosshairHigh
  const ex = e.x - S.px, ez = e.z - S.pz;
  const f2 = S.pfx * S.pfx + S.pfz * S.pfz;
  let on = false;
  // only when there is a sight line between them: a crosshair resting on the wall it stands behind is not on it
  if (e.sees && dist > TRANSIT.sidestepBeyond && f2 > 1e-6) {
    const t = (ex * S.pfx + ez * S.pfz) / f2;               // along her ray, where it passes the body's axis
    if (t > 0) {
      const hx = ex - S.pfx * t, hz = ez - S.pfz * t;
      const y = S.py + PLAYER_EYE + S.pfy * t - e.y;
      const dy = y < TRANSIT.crosshairLow ? TRANSIT.crosshairLow - y : y > TRANSIT.crosshairHigh ? y - TRANSIT.crosshairHigh : 0;
      on = hx * hx + hz * hz + dy * dy < TRANSIT.crosshairRadius * TRANSIT.crosshairRadius;
    }
  }
  if (on) e.crosshair += dt; else e.crosshair = 0;
  const l = dist || 1;
  if (e.crosshair < TRANSIT.sidestepAfter || S.time - e.sidestepAt < TRANSIT.sidestepEvery) return false;
  e.crosshair = 0;
  e.sidestepAt = S.time;
  let left = S.rng.chance(0.5);
  // perpendicular to her line of sight
  const px = -ez / l, pz = ex / l;
  // toward the side with room: firing points stand by walls, and a step into one is no step (an event, not a tick: two overlap tests)
  const k = left ? TRANSIT.sidestepDistance : -TRANSIT.sidestepDistance;
  const col = S.ctx.collision;
  if (!col.capsuleFree(e.x + px * k, e.y + 0.15, e.z + pz * k, R, H - 0.15) && col.capsuleFree(e.x - px * k, e.y + 0.15, e.z - pz * k, R, H - 0.15)) left = !left;
  e.dirX = left ? px : -px; e.dirZ = left ? pz : -pz;
  leavePoint(S, e);
  S.pool.setState(e, 'sidestep');
  S.pool.play(e, left ? 'sidestep_l' : 'sidestep_r', 0.05);
  return true;
}
