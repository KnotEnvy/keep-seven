// src/enemies/bider.ts: the Rusher (GDD 7.1; work order 4.2). HP 100, lunge 18, run 5.8 m/s, threat 1.
// dormant -> rise -> approach -> (circle) -> windup -> lunge -> recover -> approach; stumble, falter; felled or freed.
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../core/contracts.ts';
import type { DamageInfo, HitResponse, HitResult, LayoutMarker, SpawnRequest } from '../core/contracts.ts';
import { BIDER, CAPS, ENEMIES } from './defs.ts';
import type { Actor, Shared } from './internals.ts';
import { MAX_ACTORS, faceX, faceZ, respond } from './internals.ts';
import type { Lane } from './nav.ts';
import { moveBody, nextWaypoint, turnBody } from './nav.ts';

const DEF = ENEMIES.bider;
const R = DEF.bodyRadius, H = DEF.bodyHeight;
const RISE_OF: Readonly<Record<string, string>> = { scoop_kneel: 'kneel_to_stand', sit_table: 'rise_from_seat', queue_stand: 'turn_about' };
/** straight at her (with its fan offset) while she is in sight within this range; beyond it, or out of sight, the nav graph */
const DIRECT_RANGE = 30;
/** on the graph a Bider keeps to one side of the link by its fan offset, so a group does not walk the same line */
const FAN_LATERAL = 1.5;
const FAN_INSIDE = 4.5;
const TURN = 12;            // rad/s: a running body faces where it goes
const CYCLE = BIDER.windup + BIDER.lunge + BIDER.recover;

/** The approach offset least used by the Biders already up (0, +-12, +-25 degrees): a group fans out (GDD 7.1). */
function pickFan(S: Shared, e: Actor): number {
  const fans = BIDER.fanDeg;
  let best = 0, bestUse = Infinity;
  for (let f = 0; f < fans.length; f++) {
    const rad = (fans[f] as number) * Math.PI / 180;
    let use = 0;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const o = S.actors[i] as Actor;
      if (o !== e && o.used && o.alive && o.kind === 'bider' && Math.abs(o.fan - rad) < 1e-6) use++;
    }
    if (use < bestUse) { bestUse = use; best = rad; }
  }
  return best;
}

/** First state of a new Bider: its vignette loop, its entrance, or straight into the approach. */
export function beginBider(S: Shared, e: Actor, request: Readonly<SpawnRequest> | null, marker: LayoutMarker | null): void {
  e.fan = pickFan(S, e);
  e.circleDir = (e.serial & 1) === 0 ? 1 : -1;
  if (marker) {
    const p = marker.params;
    if (typeof p.lateralOffset === 'number') e.lateral = p.lateralOffset;
    if (typeof p.depthStagger === 'number') e.depth = p.depthStagger;
    if (typeof p.order === 'number' && e.order === 0) e.order = p.order;
    if (p.prop === 'cup' && S.ctx.assets.isActive('prop_cup_tin') && e.socket) {
      const cup = S.ctx.assets.instantiate('prop_cup_tin');
      cup.root.position.set(0, 0, 0); cup.root.rotation.set(0, 0, 0);
      e.socket.add(cup.root);
      e.cup = cup;
    }
  }
  e.laneFollow = e.lane >= 0;
  // a file or a held offset is its own formation: no fan
  if (e.laneFollow || e.lateral !== 0 || e.depth > 0) e.fan = 0;
  const dormant = request ? request.dormantClip : '';
  if (dormant !== '') {
    e.awake = false;
    e.dormantClip = dormant;
    S.pool.setState(e, 'dormant');
    S.pool.play(e, dormant, 0);
    return;
  }
  const entrance = request ? request.entrance : '';
  if (entrance === 'climb_out') { startRise(S, e, 'climb_out'); return; }
  S.pool.setState(e, 'approach');
  S.pool.play(e, 'run', 0);
}

function startRise(S: Shared, e: Actor, clip: string): void {
  e.awake = true;
  e.timer = BIDER.rise[clip] ?? 1.0;
  e.count = 0;
  S.pool.setState(e, 'rise');
  S.pool.play(e, clip, 0.05);
}

/** `wake`: a dormant Bider leaves its loop. */
export function wakeBider(S: Shared, e: Actor): void {
  if (e.state !== 'dormant' || !e.alive) return;
  let clip = RISE_OF[e.dormantClip] ?? 'kneel_to_stand';
  if (e.marker !== '') {
    const m = S.ctx.data.marker(e.marker);
    if (m && typeof m.params.rise === 'string' && BIDER.rise[m.params.rise] !== undefined) clip = m.params.rise;
  }
  startRise(S, e, clip);
  if (e.vignette !== '') S.hooks.vignetteActorGone(e);
}

// ---- going down ------------------------------------------------------------------------------------------
function goDown(S: Shared, e: Actor): void {
  S.pool.dropToken(e);
  S.pool.disableVolumes(e);
  e.alive = false;
  e.awake = true;
  e.down = 0;
  e.freeze = CAPS.killFreeze;
  if (e.shadow) { e.shadow.release(); e.shadow = null; }
  if (e.vignette !== '') S.hooks.vignetteActorGone(e);
}

/** Felled (GDD 7.1): 70 ms freeze, die_back 0.9 s, thrown 1.2 m along the shot; a static body after 3 s. */
export function fellBider(S: Shared, e: Actor, dirX: number, dirZ: number): void {
  if (!e.alive) return;
  const l = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (l > 1e-5) { e.dirX = dirX / l; e.dirZ = dirZ / l; } else { e.dirX = -faceX(e.yaw); e.dirZ = -faceZ(e.yaw); }
  const wasAwake = e.awake;
  goDown(S, e);
  e.hp = 0;
  e.moved = 0;
  S.pool.setState(e, 'felled');
  S.pool.play(e, 'die_back', 0);
  const p = S.ev.felled;
  p.x = e.x; p.y = e.y; p.z = e.z; p.id = e.id; p.encounter = e.encounter; p.counted = e.counted;
  S.ctx.events.emit('enemy/felled', p);
  // Biders within 1.2 m behind the thrown body stumble 0.4 s (GDD 6.7)
  if (!wasAwake) return;
  const ex = e.x + e.dirX * BIDER.thrown, ez = e.z + e.dirZ * BIDER.thrown;
  for (let i = 0; i < MAX_ACTORS; i++) {
    const o = S.actors[i] as Actor;
    if (o === e || !o.used || !o.alive || !o.awake || o.kind !== 'bider') continue;
    const bx = o.x - e.x, bz = o.z - e.z;
    if (bx * e.dirX + bz * e.dirZ <= 0) continue;                         // not behind it along the shot
    const dx = o.x - ex, dz = o.z - ez;
    if (dx * dx + dz * dz <= BIDER.stumbleFelledRange * BIDER.stumbleFelledRange) stumbleBider(S, o, BIDER.stumbleFelled);
  }
}

/** Freed (GDD 7.1): 70 ms freeze, the knot goes dark, sit_down 0.9 s, then sit_breathe; a static body after 3 s. */
export function freeBider(S: Shared, e: Actor, cause: 'crown' | 'line' | 'kept'): void {
  if (!e.alive) return;
  goDown(S, e);
  e.hp = 0;
  e.cause = cause;
  S.pool.setState(e, 'freed');
  S.pool.play(e, 'sit_down', 0);
  if (e.inst) S.ctx.render.setEmissive(e.inst.root, 0);
  const p = S.ev.freed;
  p.x = e.x; p.y = e.y; p.z = e.z; p.id = e.id; p.encounter = e.encounter; p.cause = cause; p.counted = e.counted;
  S.ctx.events.emit('enemy/freed', p);
  // a knot bursting within 4 m: stumble 0.5 s (GDD 6.7)
  if (cause !== 'crown') return;
  for (let i = 0; i < MAX_ACTORS; i++) {
    const o = S.actors[i] as Actor;
    if (o === e || !o.used || !o.alive || !o.awake || o.kind !== 'bider') continue;
    const dx = o.x - e.x, dz = o.z - e.z;
    if (dx * dx + dz * dz <= BIDER.stumbleKnotRange * BIDER.stumbleKnotRange) stumbleBider(S, o, BIDER.stumbleKnot);
  }
}

export function stumbleBider(S: Shared, e: Actor, seconds: number): void {
  if (e.state !== 'approach' && e.state !== 'circle' && e.state !== 'recover') return;
  e.resume = e.state;
  e.resumeFor = seconds;
  S.pool.setState(e, 'stumble');
  S.pool.play(e, 'stumble', 0.05);
}

/** Falter (GDD 7.1): 2 s, backs off 2 m, then the approach again. Cancels an attack in hand. */
export function falterBider(S: Shared, e: Actor, seconds: number): void {
  if (!e.alive || !e.awake) return;
  if (e.state === 'dormant' || e.state === 'rise' || e.state === 'vig_wait' || e.state === 'falter') return;
  S.pool.dropToken(e);
  e.resumeFor = seconds;
  S.pool.setState(e, 'falter');
  S.pool.play(e, 'falter', 0.1);
}

// ---- hits (GDD 6.7) ------------------------------------------------------------------------------------------
export function hitBider(S: Shared, e: Actor, hit: Readonly<HitResult>, damage: Readonly<DamageInfo>, out: HitResponse): void {
  if (!e.alive) { respond(out, 'passed', false, false, 0, 0); return; }
  const before = e.hp;
  const line = damage.ammo === 'line_round' || damage.ammo === 'kept_round';
  if (line) {
    // a line round frees wherever it hits, and goes on
    e.hp = 0;
    S.damaged(e, hit.part === 'crown' ? 'crown' : 'body', before);
    freeBider(S, e, damage.ammo === 'kept_round' ? 'kept' : 'line');
    respond(out, 'freed', false, false, before, 0);
    return;
  }
  if (hit.part === 'crown') {
    e.hp = 0;
    S.damaged(e, 'crown', before);
    freeBider(S, e, 'crown');
    respond(out, 'freed', true, false, before, 0);
    return;
  }
  const dealt = Math.min(before, damage.amount);
  e.hp = before - dealt;
  S.damaged(e, 'body', dealt);
  if (e.hp <= 0) {
    fellBider(S, e, damage.dx, damage.dz);
    respond(out, 'kill', true, false, dealt, 0);
    return;
  }
  e.freeze = CAPS.hitFreeze;
  respond(out, 'hit', true, false, dealt, e.hp);
}

// ---- thinking and moving -------------------------------------------------------------------------------------
function look(S: Shared, e: Actor): void {
  const r = S.sight(e.x, e.y + 1.3, e.z, S.px, S.py + 1.5, S.pz);
  if (r === 1) { e.sees = true; e.lost = 0; e.lkx = S.px; e.lky = S.py; e.lkz = S.pz; } else if (r === 0) e.sees = false;
}

/** Nearest Bider ahead of `e` along a lane axis (the direction of travel `sign`): the gap to it, or Infinity. */
function gapAhead(S: Shared, e: Actor, lane: Lane, s: number, sign: number, sameWaveOnly: boolean): number {
  let gap = Infinity;
  for (let i = 0; i < MAX_ACTORS; i++) {
    const o = S.actors[i] as Actor;
    if (o === e || !o.used || !o.alive || o.kind !== 'bider' || !o.awake) continue;
    if (sameWaveOnly && (o.wave !== e.wave || o.encounter !== e.encounter || o.order >= e.order)) continue;
    if (!sameWaveOnly && o.lane !== e.lane) continue;
    const os = (o.x - lane.cx) * lane.ax + (o.z - lane.cz) * lane.az;
    const d = (os - s) * sign;
    if (d > 0 && d < gap) gap = d;
  }
  return gap;
}

/** The lane volume a point is in, or null. */
function laneAt(S: Shared, e: Actor): Lane | null {
  const lanes = S.nav.lanes;
  if (e.lane >= 0) {
    const l = lanes[e.lane] as Lane;
    return S.nav.inLane(l, e.x, e.y, e.z) ? l : null;
  }
  for (let i = 0; i < lanes.length; i++) { const l = lanes[i] as Lane; if (S.nav.inLane(l, e.x, e.y, e.z)) return l; }
  return null;
}

/** Velocity of the approach, left in (S.v.x, S.v.z). Returns the speed it asked for. */
function approachVelocity(S: Shared, e: Actor, dist: number): number {
  const v = S.v;
  const speed = DEF.moveSpeed;
  const dxp = S.px - e.x, dzp = S.pz - e.z;
  // ---- in file, or holding a lateral offset, inside a lane volume
  const formation = e.laneFollow || e.lateral !== 0 || e.depth > 0;
  if (formation && dist > BIDER.circleRange + 0.5) {
    const lane = laneAt(S, e);
    if (lane) {
      const s = (e.x - lane.cx) * lane.ax + (e.z - lane.cz) * lane.az;
      const ps = (S.px - lane.cx) * lane.ax + (S.pz - lane.cz) * lane.az;
      const sign = ps >= s ? 1 : -1;
      // lateral axis: the lane axis turned a quarter left
      const lx = -lane.az, lz = lane.ax;
      const lat = (e.x - lane.cx) * lx + (e.z - lane.cz) * lz;
      const want = e.laneFollow ? 0 : e.lateral;
      let along = speed;
      const spacing = e.laneFollow ? BIDER.laneSpacing : e.depth;
      const gap = gapAhead(S, e, lane, s, sign, !e.laneFollow);
      if (gap < spacing + 0.5) along = Math.max(0, Math.min(speed, (gap - spacing) * 8));
      let side = (want - lat) * 6;
      if (side > 2) side = 2; else if (side < -2) side = -2;
      v.x = lane.ax * sign * along + lx * side;
      v.z = lane.az * sign * along + lz * side;
      return along;
    }
  }
  // ---- straight at her while she is in sight (or was a moment ago), fanning out by this Bider's offset
  const known = e.sees || e.lost <= BIDER.lostSightAfter;
  // polish round 4: only on her level. Straight at a player a storey up ended against the plinth under her (the hall
  // gantry): off her level the graph is walked, which knows the ramp.
  if (known && dist < DIRECT_RANGE && e.stuck >= 0 && Math.abs(S.py - e.y) < BIDER.directLevel) {
    let hx = dxp / (dist || 1), hz = dzp / (dist || 1);
    if (e.fan !== 0 && dist > FAN_INSIDE && e.stuck >= 0) {
      const c = Math.cos(e.fan), sn = Math.sin(e.fan);
      const rx = hx * c - hz * sn, rz = hx * sn + hz * c;
      hx = rx; hz = rz;
    }
    v.x = hx * speed; v.z = hz * speed;
    return speed;
  }
  // ---- along the nav graph, to her or to where she was last seen
  let goal: number;
  if (known) goal = S.nav.playerNode(S);
  else {
    goal = S.nav.nearest(e.lkx, e.lky, e.lkz);
    const dx = e.lkx - e.x, dz = e.lkz - e.z;
    if (dx * dx + dz * dz < 1.5 * 1.5) { e.lkx = S.px; e.lky = S.py; e.lkz = S.pz; }     // nothing there: go on to where she is
  }
  const wp = nextWaypoint(S, e, goal);
  let tx = S.px, tz = S.pz;
  if (wp >= 0) {
    tx = S.nav.x[wp] as number; tz = S.nav.z[wp] as number;
    if (e.fan !== 0 && dist > FAN_INSIDE && e.stuck >= 0) {
      // aside of the link, by the fan offset: the group spreads instead of walking one line of nodes
      const lx = tx - e.x, lz = tz - e.z, ll = Math.sqrt(lx * lx + lz * lz);
      if (ll > 1e-3) { const k = Math.sin(e.fan) * FAN_LATERAL / ll; tx += -lz * k; tz += lx * k; }
    }
  }
  const dx = tx - e.x, dz = tz - e.z;
  const l = Math.sqrt(dx * dx + dz * dz);
  if (l < 1e-4) { v.x = 0; v.z = 0; return 0; }
  v.x = dx / l * speed; v.z = dz / l * speed;
  return speed;
}

/**
 * Open ground: a Bider standing in a line between two others steps out of it for 0.6 s (GDD 21 test 3: no three
 * collinear within 0.5 m for more than 1 s). Called on its think, at 10 Hz.
 */
function unline(S: Shared, e: Actor): void {
  if (e.laneFollow || e.lateral !== 0 || e.depth > 0) return;
  for (let i = 0; i < MAX_ACTORS; i++) {
    const a = S.actors[i] as Actor;
    if (a === e || !a.used || !a.alive || !a.awake || a.kind !== 'bider' || a.state !== 'approach') continue;
    for (let j = i + 1; j < MAX_ACTORS; j++) {
      const b = S.actors[j] as Actor;
      if (b === e || !b.used || !b.alive || !b.awake || b.kind !== 'bider' || b.state !== 'approach') continue;
      const lx = b.x - a.x, lz = b.z - a.z, l2 = lx * lx + lz * lz;
      if (l2 < 1e-4) continue;
      const t = ((e.x - a.x) * lx + (e.z - a.z) * lz) / l2;
      if (t <= 0 || t >= 1) continue;
      const l = Math.sqrt(l2);
      const side = ((e.x - a.x) * lz - (e.z - a.z) * lx) / l;            // signed distance from the line
      if (Math.abs(side) >= 0.8) continue;
      const sign = side >= 0 ? 1 : -1;
      e.dodgeX = lz / l * sign; e.dodgeZ = -lx / l * sign;
      e.dodge = 0.6;
      return;
    }
  }
}

/** Steering separation: bodies do not collide, they keep 0.9 m apart outside a file. */
function separate(S: Shared, e: Actor): void {
  if (e.laneFollow) return;
  const v = S.v;
  for (let i = 0; i < MAX_ACTORS; i++) {
    const o = S.actors[i] as Actor;
    if (o === e || !o.used || !o.alive || !o.awake) continue;
    const dx = e.x - o.x, dz = e.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.9 * 0.9 || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), push = (0.9 - d) * 4;
    v.x += dx / d * push; v.z += dz / d * push;
  }
}

function walk(S: Shared, e: Actor, dt: number, asked: number): void {
  const v = S.v;
  const sx = e.x, sz = e.z;
  S.mx = v.x * dt; S.mz = v.z * dt; moveBody(S, e, R, H);
  const mx = e.x - sx, mz = e.z - sz;
  if (asked > 0.5) {
    const made = Math.sqrt(mx * mx + mz * mz);
    if (e.stuck < 0) e.stuck = Math.min(0, e.stuck + dt);                 // walking the graph for a while after being stuck
    else if (made < asked * dt * 0.3) { e.stuck += dt; if (e.stuck > 0.4) { e.stuck = -1.5; e.pathGoal = -1; } } else e.stuck = 0;
    if (v.x * v.x + v.z * v.z > 0.04) { S.ang = Math.atan2(-v.x, -v.z); S.turn = TURN * dt; turnBody(S, e); }
  }
}

function startWindup(S: Shared, e: Actor): void {
  // the fairness rules of GDD 7 are judged where the attack starts (where she can see it start or not), on the
  // horizontal angle: at its end the body is at her feet, which says nothing about whether she saw it coming
  e.unseen = !S.inViewFlat(e.x, e.z);
  // from outside her view within 6 m the cue is never shortened (Hard's -10 % does not apply to what she cannot see)
  const scale = S.tellScale(e.unseen, e.x, e.z);
  const seconds = BIDER.windup * scale;
  e.timer = seconds;
  // the direction is fixed here: the crouch points where the lunge will go
  const dx = S.px - e.x, dz = S.pz - e.z;
  const l = Math.sqrt(dx * dx + dz * dz) || 1;
  e.dirX = dx / l; e.dirZ = dz / l;
  e.yaw = Math.atan2(-e.dirX, -e.dirZ);
  S.pool.setState(e, 'windup');
  S.pool.play(e, 'lunge_windup', 0.05, 1 / scale);
  S.telegraph(e, 'lunge', seconds);
}

function endAttack(S: Shared, e: Actor): void {
  S.pool.dropToken(e);
  // outside her view cone a Bider attacks at half frequency (GDD 7): one more attack cycle of waiting
  if (e.unseen) S.tokens.delay(e.index, S.time + CAPS.tokenCooldown + CYCLE);
}

function swapToStatic(S: Shared, e: Actor): void {
  const asset = e.state === 'freed' ? 'bider_seated_static' : 'bider_felled_static';
  if (S.ctx.assets.isActive(asset)) S.pool.addStatic(asset, e.x, e.y, e.z, e.yaw + Math.PI);
  S.pool.release(e, true);
}

/** Is another Bider on the ring round her within the slot gap, on the side this one strafes toward (tx, tz)? */
function ringBlocked(S: Shared, e: Actor, tx: number, tz: number): boolean {
  const ex = e.x - S.px, ez = e.z - S.pz;
  const el = Math.sqrt(ex * ex + ez * ez);
  if (el < 1e-3) return false;
  const far = (BIDER.circleRange + 1.5) * (BIDER.circleRange + 1.5);
  const list = S.actors;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!o || o === e || !o.used || !o.alive || !o.awake || o.kind !== 'bider') continue;
    if (o.state !== 'circle' && o.state !== 'windup' && o.state !== 'recover') continue;
    if ((o.x - e.x) * tx + (o.z - e.z) * tz <= 0) continue;            // behind it
    const ox = o.x - S.px, oz = o.z - S.pz;
    const o2 = ox * ox + oz * oz;
    if (o2 > far || o2 < 1e-6 || Math.abs(o.y - e.y) > 1.2) continue;
    if ((ex * ox + ez * oz) / (el * Math.sqrt(o2)) > BIDER.circleGapCos) return true;
  }
  return false;
}

export function tickBider(S: Shared, e: Actor, dt: number): void {
  // ---- down: the same whether the AI is on or off
  if (!e.alive) {
    e.down += dt;
    if (e.state === 'felled') {
      if (e.moved < BIDER.thrown && e.t >= CAPS.killFreeze) {
        // thrown 1.2 m along the shot, most of it in the first 0.3 s
        const k = Math.min(BIDER.thrown - e.moved, (BIDER.thrown - e.moved) * 9 * dt + 0.6 * dt);
        e.moved += k;
        S.mx = e.dirX * k; S.mz = e.dirZ * k; moveBody(S, e, R, 0.8);
      }
    } else if (e.state === 'freed' && e.clip === 'sit_down' && e.t >= BIDER.sitDown + CAPS.killFreeze) {
      S.pool.play(e, 'sit_breathe', 0.2);
    }
    if (e.down >= CAPS.staticAfter) swapToStatic(S, e);
    return;
  }
  if (e.state === 'dormant') return;
  if (!S.ai) return;

  const think = ((S.tick + e.index) % CAPS.thinkEveryTicks) === 0;
  const dxp = S.px - e.x, dzp = S.pz - e.z;
  const dist = Math.sqrt(dxp * dxp + dzp * dzp);
  const level = Math.abs(S.py - e.y) < 1.6;
  if (!e.sees) e.lost += dt;

  switch (e.state) {
    case 'rise': {
      if (e.cup && e.clip === 'kneel_to_stand' && e.t >= BIDER.cupDetachAt) setCupDown(S, e);
      // integration seam (docs/requests/art-enemies-bider.md 1): `turn_about` is authored with the root's yaw baked out
      // and expects the root to turn +180 degrees to the figure's left LINEARLY over the clip. Snapping the yaw at the
      // end made the body twist, untwist and pop. The share of the half turn that belongs to this tick is added here.
      if (e.clip === 'turn_about' && e.timer > 0) {
        const now = Math.min(e.t, e.timer), before = Math.max(0, Math.min(e.t - dt, e.timer));
        e.yaw += Math.PI * (now - before) / e.timer;
      }
      if (e.t >= e.timer) {
        if (e.vignette === 'vig_tamper') { S.pool.setState(e, 'vig_wait'); S.pool.play(e, 'idle_stoop', 0.15); break; }
        S.pool.setState(e, 'approach');
        S.pool.play(e, 'run', 0.1);
      }
      break;
    }
    case 'vig_wait': break;
    case 'approach': {
      if (think) look(S, e);
      if (S.pAlive && level && dist <= BIDER.circleRange) {
        if (!S.hush && dist <= BIDER.windupRange && e.sees && S.pool.takeToken(e, 'melee')) { startWindup(S, e); break; }
        // the hush: nobody starts an attack while she loads the kept round; they hold on the 3 m ring
        if (S.hush || !S.tokens.available('melee', e.index, S.time)) {
          e.barkAt = 0;
          S.pool.setState(e, 'circle');
          S.pool.play(e, 'circle_strafe', 0.1);
          break;
        }
      }
      const asked = approachVelocity(S, e, dist);
      if (think && e.stuck >= 0) unline(S, e);
      if (e.dodge > 0 && e.stuck >= 0) {
        e.dodge -= dt;
        const v = S.v;
        v.x = v.x * 0.6 + e.dodgeX * 3.0; v.z = v.z * 0.6 + e.dodgeZ * 3.0;
      }
      separate(S, e);
      walk(S, e, dt, asked);
      break;
    }
    case 'circle': {
      if (think) look(S, e);
      e.barkAt -= dt;
      if (e.barkAt <= 0) {
        // the bark (audio answers enemy/state -> circle_strafe, ARCHITECTURE 3.6)
        e.barkAt = BIDER.barkEvery;
        const p = S.ev.state;
        p.id = e.id; p.kind = e.kind; p.from = 'circle'; p.to = 'circle_strafe';
        S.ctx.events.emit('enemy/state', p);
      }
      if (!S.hush && S.pAlive && level && dist <= BIDER.circleRange + 0.8 && e.sees && S.pool.takeToken(e, 'melee')) { startWindup(S, e); break; }
      if (dist > BIDER.circleRange + 2 || !level) { S.pool.setState(e, 'approach'); S.pool.play(e, 'run', 0.1); break; }
      // strafe at 3.0 m/s on a 3 m radius, facing her
      const ux = dist > 1e-4 ? dxp / dist : 0, uz = dist > 1e-4 ? dzp / dist : 1;
      const radial = (dist - BIDER.circleRange) * 3;
      const v = S.v;
      // polish round 3: it does not strafe into the slot of the one ahead of it on the ring (`circleGapCos`: 50 degrees
      // seen from her). Held there, the stuck rule below turns it round after 0.3 s: three or four round her spread out
      // instead of settling shoulder to shoulder.
      const tang = ringBlocked(S, e, -uz * e.circleDir, ux * e.circleDir) ? 0 : BIDER.circleSpeed;
      v.x = -uz * e.circleDir * tang + ux * radial;
      v.z = ux * e.circleDir * tang + uz * radial;
      separate(S, e);
      const sx = e.x, sz = e.z;
      S.mx = v.x * dt; S.mz = v.z * dt; moveBody(S, e, R, H);
      const made = Math.sqrt((e.x - sx) * (e.x - sx) + (e.z - sz) * (e.z - sz));
      if (made < BIDER.circleSpeed * dt * 0.3) { e.stuck += dt; if (e.stuck > 0.3) { e.circleDir = -e.circleDir; e.stuck = 0; } } else if (e.stuck > 0) e.stuck = 0;
      S.ang = Math.atan2(-ux, -uz); S.turn = TURN * dt; turnBody(S, e);
      break;
    }
    case 'windup': {
      if (e.t >= e.timer) {
        e.moved = 0; e.struck = false;
        S.pool.setState(e, 'lunge');
        S.pool.play(e, 'lunge', 0.03);
        S.attacked(e, 'lunge');
      }
      break;
    }
    case 'lunge': {
      // 2.2 m forward at most, and never into her: the body pulls up `standOff` short of her axis (the strike still
      // reaches 1.8 m), so the one that just hit her is in front of the camera, not inside it
      let step = Math.min(BIDER.lungeDistance - e.moved, BIDER.lungeDistance / BIDER.lunge * dt);
      if (step > 0 && level) {
        // where the lunge's line enters the stand-off circle about her: `room` metres ahead (none if it passes wide)
        const ahead = dxp * e.dirX + dzp * e.dirZ;
        const side2 = dist * dist - ahead * ahead;
        const so2 = BIDER.standOff * BIDER.standOff;
        if (ahead > 0 && side2 < so2) {
          const room = ahead - Math.sqrt(so2 - side2);
          if (room < step) step = room > 0 ? room : 0;
        }
      }
      if (step > 0) { e.moved += step; S.mx = e.dirX * step; S.mz = e.dirZ * step; moveBody(S, e, R, H); }
      if (!e.struck && S.pAlive && e.t >= BIDER.strikeAfter) strike(S, e);
      if (e.t >= BIDER.lunge) {
        endAttack(S, e);
        S.pool.setState(e, 'recover');
        S.pool.play(e, 'lunge_recover', 0.05);
      }
      break;
    }
    case 'recover': {
      if (dist > 1e-3) { S.ang = Math.atan2(-dxp, -dzp); S.turn = Math.PI * dt; turnBody(S, e); }
      // she walked into it (or it came down a step onto her): it backs out to the stand-off, never inside the camera
      if (level && dist < BIDER.standOff && dist > 1e-3) {
        const k = Math.min(BIDER.standOff - dist, 3.0 * dt);
        S.mx = -dxp / dist * k; S.mz = -dzp / dist * k; moveBody(S, e, R, H);
      }
      if (e.t >= BIDER.recover) { S.pool.setState(e, 'approach'); S.pool.play(e, 'run', 0.1); }
      break;
    }
    case 'stumble': {
      if (e.t >= e.resumeFor) {
        const to = e.resume === 'circle' ? 'circle' : 'approach';
        S.pool.setState(e, to);
        S.pool.play(e, to === 'circle' ? 'circle_strafe' : 'run', 0.1);
      }
      break;
    }
    case 'falter': {
      // backs off 2 m over the falter
      if (dist > 1e-3) {
        const k = BIDER.falterBack / BIDER.falter * dt;
        S.mx = -dxp / dist * k; S.mz = -dzp / dist * k; moveBody(S, e, R, H);
        S.ang = Math.atan2(-dxp, -dzp); S.turn = TURN * dt; turnBody(S, e);
      }
      if (e.t >= e.resumeFor) { S.pool.setState(e, 'approach'); S.pool.play(e, 'run', 0.1); }
      break;
    }
    default: break;
  }
}

/** The lunge's one hit: 18 once, within 1.8 m along the locked direction (GDD 7.1). */
function strike(S: Shared, e: Actor): void {
  const y = e.y + 1.0;
  const hit = S.ctx.collision.segmentHitsCapsule(e.x, y, e.z, e.x + e.dirX * BIDER.lungeReach, y, e.z + e.dirZ * BIDER.lungeReach, 0.25,
    S.px, S.py, S.pz, PLAYER_RADIUS, PLAYER_HEIGHT);
  if (!hit) return;
  e.struck = true;
  const d = S.dmg;
  d.kind = 'lunge'; d.source = 'bider'; d.sourceId = e.id;
  d.ox = e.x; d.oy = y; d.oz = e.z;
  S.hurt((DEF.attacks[0] as { damage: number }).damage);
}

/** The kneeler's cup (work order 4.6): 0.4 s into kneel_to_stand it leaves the hand and stays on the trough rim. */
function setCupDown(S: Shared, e: Actor): void {
  const cup = e.cup;
  if (!cup) return;
  e.cup = null;
  const p = S.v2;
  cup.root.updateWorldMatrix(true, false);
  const m = cup.root.matrixWorld.elements;
  p.x = m[12] as number; p.z = m[14] as number;
  cup.root.removeFromParent();
  if (S.ctx.assets.isActive('prop_cup_tin')) cup.release();
  // the trough rim is 0.5 m above the street (GDD 9.3 / art-props)
  S.pool.addStatic('prop_cup_tin', p.x, e.y + 0.5, p.z, 0);
}
