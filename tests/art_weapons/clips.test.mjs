// (pose().scale is the world scale and reads 1 for a bone scaled to 0: the tests use local.scale.)
// art-weapons 5: the fifteen clips through the real loader (sandbox/viewer.html, first person): bones are read with
// __dbg.ext.viewer.pose() after setClip(name, t01), in asset space = camera space.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { CLIPS, REV, frames, openViewer, quatAngle, dist, rotate } from './lib.mjs';

let server, game, P;
const BONES = REV.bones;
const HAND_ROUNDS = ['round_hand_lead', 'round_hand_line', 'round_hand_kept'];
const TAN = Math.tan(26 * Math.PI / 180), ASPECT = 16 / 9;
const inFrustum = (p, margin = 0) => -p[2] > 0.02 && Math.abs(p[0]) < -p[2] * TAN * ASPECT * (1 - margin) && Math.abs(p[1]) < -p[2] * TAN * (1 - margin);
// the middle of the kept round's band: 16.5 mm from the case head along the bone (its +Y)
const band = (b) => { const d = rotate(b.quat, [0, 0.0165, 0]); return [b.pos[0] + d[0], b.pos[1] + d[1], b.pos[2] + d[2]]; };

// a suite, so the hooks are this file's own (a directory run imports every file into one process)
describe('art-weapons clips', () => {
before(async () => {
  server = await startServer({ pieces: [] });
  game = await openViewer(server);
  // every bone of every clip on every authored frame, in one round trip
  P = await game.page.evaluate(({ clips, bones }) => {
    const v = window.__dbg.ext.viewer, out = {};
    const slim = (p) => { const o = {}; for (const b of bones) o[b] = { pos: p[b].pos, quat: p[b].quat, scale: p[b].local.scale, lq: p[b].local.quat, lp: p[b].local.pos }; return o; };
    for (const [name, n] of clips) { out[name] = []; for (let f = 0; f <= n; f++) { v.setClip(name, f / n); out[name].push(slim(v.pose(bones))); } }
    v.setClip('', 0); window.__dbg.step(1, true); out.__rest = slim(v.pose(bones));
    return out;
  }, { clips: CLIPS.map((c) => [c, frames(c)]), bones: BONES });
});
after(async () => { await game.close(); await server.close(); });

const worst = (a, b, skip = []) => {
  let mm = 0, deg = 0, sc = 0, at = '';
  for (const n of BONES) {
    if (skip.includes(n)) continue;
    const hidden = a[n].scale[0] < 1e-3 && b[n].scale[0] < 1e-3;      // a round scaled to nothing has no pose to compare
    const d = hidden ? 0 : dist(a[n].pos, b[n].pos) * 1000, r = hidden ? 0 : quatAngle(a[n].quat, b[n].quat), s = Math.abs(a[n].scale[0] - b[n].scale[0]);
    if (d > mm) { mm = d; at = n; } if (r > deg) { deg = r; if (r > 0.5) at = n; } sc = Math.max(sc, s);
  }
  return { mm, deg, sc, at };
};

test('the rest pose is idle at t = 0; idle and sprint loop without a pop; idle breathes 3 mm and rolls 0.4 degrees', () => {
  const idle = P.idle, w0 = worst(P.__rest, idle[0], HAND_ROUNDS);
  assert.ok(w0.mm < 0.05 && w0.deg < 0.05, `rest pose and idle frame 0 differ: ${JSON.stringify(w0)}`);
  for (const c of ['idle', 'sprint']) {
    const w = worst(P[c][0], P[c].at(-1));
    console.log(`${c}: first vs last frame ${w.mm.toFixed(3)} mm, ${w.deg.toFixed(3)} deg`);
    assert.ok(w.mm < 0.05 && w.deg < 0.05 && w.sc < 1e-3, `${c} does not close: ${JSON.stringify(w)}`);
  }
  const ys = idle.map((p) => p.gun.pos[1]); const rise = (Math.max(...ys) - Math.min(...ys)) * 1000;
  const roll = Math.max(...idle.map((p) => quatAngle(p.gun.quat, idle[0].gun.quat)));
  console.log(`idle: the gun rises and falls ${rise.toFixed(2)} mm, turns up to ${roll.toFixed(2)} deg from frame 0`);
  assert.ok(rise > 2.5 && rise < 3.6, `idle breath ${rise} mm`);
  assert.ok(roll > 0.3 && roll < 1.0, `idle roll ${roll} deg`);
  for (const p of idle) for (const b of HAND_ROUNDS) assert.ok(p[b].scale[0] < 1e-3, 'a hand round shows in idle');
  // the largest step between neighbouring frames of sprint is a stride, not a pop
  const sp = P.sprint; let step = 0;
  for (let f = 1; f < sp.length; f++) step = Math.max(step, dist(sp[f].gun.pos, sp[f - 1].gun.pos));
  const across = Math.max(...sp.map((p) => p.gun.pos[1])) - Math.min(...sp.map((p) => p.gun.pos[1]));
  console.log(`sprint: the gun pumps ${(across * 1000).toFixed(0)} mm, largest frame step ${(step * 1000).toFixed(1)} mm`);
  assert.ok(across > 0.03 && across < 0.06, `sprint pump ${across}`);
});

test('fire, draw, reload_close, reload_fast_close, load_line, unload_line, load_kept, unload_kept, take_round end on the idle pose (1 mm, 0.5 degrees)', () => {
  const idle = P.idle[0];
  for (const c of ['fire', 'draw', 'reload_close', 'reload_fast_close', 'load_line', 'unload_line', 'load_kept', 'unload_kept', 'take_round']) {
    const w = worst(P[c].at(-1), idle);
    console.log(`${c}: last frame vs idle ${w.mm.toFixed(3)} mm, ${w.deg.toFixed(3)} deg`);
    assert.ok(w.mm < 1.0 && w.deg < 0.5 && w.sc < 1e-3, `${c} does not end on idle: ${JSON.stringify(w)}`);
  }
});

test('fire: hammer down on frame 0, kick 0.08 m and 20 degrees, cylinder turns 60 degrees on frames 4-9 with a half-cock stop; chains from idle', () => {
  const f = P.fire, idle = P.idle[0];
  const hammerFallen = quatAngle(f[0].hammer.lq, idle.hammer.lq);
  console.log(`fire: hammer on frame 0 is ${hammerFallen.toFixed(1)} deg from full cock`);
  assert.ok(hammerFallen > 40, 'the hammer has not fallen on frame 0');
  // apart from the mechanism (hammer, trigger, cylinder, trigger finger), frame 0 is the idle pose: no pop when a shot starts
  const w = worst(f[0], idle, ['hammer', 'trigger', 'cylinder', 'index_r_1', 'index_r_2', 'round_1', 'round_2', 'round_3', 'round_4', 'round_5', 'round_6']);
  assert.ok(w.mm < 1.0 && w.deg < 0.5, `fire frame 0 is not the idle pose: ${JSON.stringify(w)}`);
  const turn = quatAngle(f[4].cylinder.lq, f[9].cylinder.lq), before = quatAngle(f[0].cylinder.lq, f[4].cylinder.lq), afterTurn = quatAngle(f[9].cylinder.lq, f.at(-1).cylinder.lq);
  console.log(`fire: cylinder turns ${turn.toFixed(2)} deg between frames 4 and 9 (${before.toFixed(2)} before, ${afterTurn.toFixed(2)} after)`);
  assert.ok(Math.abs(turn - 60) <= 0.5, `cylinder turn ${turn}`);
  assert.ok(before < 0.01 && afterTurn < 0.01, 'the cylinder moves outside frames 4-9');
  // the cylinder ends where idle has it (six-fold symmetry: -60 at the start is the same picture)
  assert.ok(quatAngle(f.at(-1).cylinder.lq, idle.cylinder.lq) < 0.01);
  // two clicks: the hammer pauses at half cock (frames 6-7) and reaches full cock on frame 9
  const h = f.map((p) => quatAngle(p.hammer.lq, idle.hammer.lq));
  console.log('fire: hammer angle from full cock per frame: ' + h.map((x) => x.toFixed(0)).join(' '));
  assert.ok(Math.abs(h[4] - h[0]) < 0.5, 'the hammer moves before frame 4');
  assert.ok(Math.abs(h[6] - h[7]) < 2.0 && h[6] > 15 && h[6] < 35, 'no half-cock stop on frames 6-7');
  assert.ok(h[9] < 3.0 && h[10] < 0.5, 'not at full cock by frame 9-10');
  const back = Math.max(...f.map((p) => p.gun.pos[2] - idle.gun.pos[2])), rise = Math.max(...f.map((p) => quatAngle(p.gun.quat, idle.gun.quat)));
  const peak = f.findIndex((p) => p.gun.pos[2] - idle.gun.pos[2] === back);
  console.log(`fire: kick ${(back * 1000).toFixed(1)} mm back, ${rise.toFixed(1)} deg, peak on frame ${peak}`);
  assert.ok(Math.abs(back - 0.08) < 0.008 && Math.abs(rise - 20) < 2.0 && peak <= 4);
});

test('dry_fire: the hammer falls, a 2 mm nod, nothing else; fire_kept: 0.11 m, 26 degrees, the hammer stays down', () => {
  const d = P.dry_fire, idle = P.idle[0];
  assert.ok(worst(d[0], idle).mm < 0.05);
  assert.ok(quatAngle(d.at(-1).hammer.lq, idle.hammer.lq) > 40, 'dry_fire: the hammer is not down at the end');
  const nod = Math.max(...d.map((p) => dist(p.gun.pos, idle.gun.pos))) * 1000;
  console.log(`dry_fire: nod ${nod.toFixed(2)} mm`);
  assert.ok(nod > 1.0 && nod < 3.5);
  for (const p of d) assert.ok(quatAngle(p.cylinder.lq, idle.cylinder.lq) < 0.01 && quatAngle(p.gate.lq, idle.gate.lq) < 0.01);
  const k = P.fire_kept;
  for (const [i, p] of k.entries()) assert.ok(quatAngle(p.hammer.lq, idle.hammer.lq) > 40, `fire_kept: the hammer leaves the frame on frame ${i}`);
  for (const p of k) assert.ok(quatAngle(p.cylinder.lq, idle.cylinder.lq) < 0.01, 'fire_kept turns the cylinder');
  const back = Math.max(...k.map((p) => p.gun.pos[2] - idle.gun.pos[2])), rise = Math.max(...k.map((p) => quatAngle(p.gun.quat, idle.gun.quat)));
  const w = worst(k.at(-1), idle, ['hammer', 'trigger', 'index_r_1', 'index_r_2']);
  console.log(`fire_kept: kick ${(back * 1000).toFixed(1)} mm back, ${rise.toFixed(1)} deg; last frame vs idle (hammer, trigger apart) ${w.mm.toFixed(3)} mm, ${w.deg.toFixed(3)} deg`);
  assert.ok(Math.abs(back - 0.11) < 0.01 && Math.abs(rise - 26) < 2.5);
  assert.ok(w.mm < 1.0 && w.deg < 0.5);
  // the return takes 0.6 s: the gun is still more than 5 degrees up 0.3 s after the peak
  assert.ok(quatAngle(k[14].gun.quat, idle.gun.quat) > 5, 'fire_kept returns too fast');
});

test('the reload chains: open -> round x 6 -> close; the round is home on frame 5; the cylinder clicks 60 degrees; the gate opens', () => {
  const o = P.reload_open, r = P.reload_round, c = P.reload_close, fc = P.reload_fast_close, idle = P.idle[0];
  assert.ok(worst(o[0], idle, HAND_ROUNDS).mm < 1.0, 'reload_open does not start on idle');
  const a = worst(o.at(-1), r[0]), b = worst(r[0], r.at(-1)), d = worst(r.at(-1), c[0], HAND_ROUNDS), e = worst(r.at(-1), fc[0], HAND_ROUNDS);
  console.log(`reload chain: open->round ${a.mm.toFixed(3)} mm ${a.deg.toFixed(3)} deg; round first=last ${b.mm.toFixed(3)} mm ${b.deg.toFixed(3)} deg; round->close ${d.mm.toFixed(3)} mm; round->fast_close ${e.mm.toFixed(3)} mm`);
  for (const w of [a, b, d, e]) assert.ok(w.mm < 1.0 && w.deg < 0.5, JSON.stringify(w));
  assert.ok(b.sc < 1e-3);
  const gate = quatAngle(r[0].gate.lq, idle.gate.lq), roll = quatAngle(r[0].gun.quat, idle.gun.quat);
  console.log(`reload pose: gate open ${gate.toFixed(0)} deg, gun turned ${roll.toFixed(0)} deg from idle`);
  assert.ok(gate > 80 && roll > 40);
  // the round travels along its own axis into the gate and is deepest on frame 5, then vanishes (it is in the chamber)
  const head = r.map((p) => p.round_hand_lead.pos), gunZ = r.map((p) => p.cylinder.pos);
  const gap = head.map((h, i) => dist(h, gunZ[i]));
  const home = gap.indexOf(Math.min(...gap.slice(0, 6)));
  console.log('reload_round: case head to cylinder bone per frame (mm): ' + gap.map((x) => (x * 1000).toFixed(0)).join(' ') + '; visible: ' + r.map((p) => (p.round_hand_lead.scale[0] > 0.5 ? 1 : 0)).join(''));
  assert.equal(home, 5, 'the round is not pushed home on frame 5');
  assert.ok(r[5].round_hand_lead.scale[0] > 0.5 && r[6].round_hand_lead.scale[0] < 1e-3, 'the round should vanish into the chamber after frame 5');
  assert.ok(r[0].round_hand_lead.scale[0] > 0.5 && r.at(-1).round_hand_lead.scale[0] > 0.5, 'the next round is not in the fingers at the ends of the clip');
  const turn = quatAngle(r[5].cylinder.lq, r[7].cylinder.lq);
  assert.ok(Math.abs(turn - 60) <= 0.5, `reload_round: the cylinder clicks ${turn} deg`);
  assert.ok(quatAngle(r.at(-1).cylinder.lq, r[0].cylinder.lq) < 0.01);
});

test('the special rounds: line and kept rounds show only where the clip handles them; the cylinder returns; kept_loop is never keyed', () => {
  const vis = (clip, bone) => P[clip].map((p) => (p[bone].scale[0] > 0.5 ? 1 : 0)).join('');
  console.log(`load_line   lead ${vis('load_line', 'round_hand_lead')} line ${vis('load_line', 'round_hand_line')}`);
  console.log(`unload_line line ${vis('unload_line', 'round_hand_line')}`);
  console.log(`load_kept   kept ${vis('load_kept', 'round_hand_kept')}`);
  console.log(`unload_kept kept ${vis('unload_kept', 'round_hand_kept')}`);
  console.log(`take_round  kept ${vis('take_round', 'round_hand_kept')}`);
  assert.match(vis('load_line', 'round_hand_line'), /^0+1+0+$/); assert.match(vis('unload_line', 'round_hand_line'), /^0+1+0+$/);
  assert.match(vis('load_kept', 'round_hand_kept'), /^0+1+0+$/); assert.match(vis('unload_kept', 'round_hand_kept'), /^0+1+0+$/);
  assert.match(vis('take_round', 'round_hand_kept'), /^0+1+0+$/);
  // load_kept (polish round 4, re-staged): the left hand comes up with the kept round already in its fingers (frame 1)
  // and seats it on frame 38; the cuff loop, which code hides at 0.9 s, stays under the frame (next test)
  assert.equal(vis('load_kept', 'round_hand_kept').indexOf('1'), 1, 'load_kept: round_hand_kept should appear on frame 1');
  assert.equal(vis('load_kept', 'round_hand_kept').lastIndexOf('1'), 38, 'load_kept: round_hand_kept should be seated (hidden) after frame 38');
  const rest = P.__rest;
  for (const c of CLIPS) for (const p of P[c]) for (const b of REV.codeDriven) assert.ok(quatAngle(p[b].lq, rest[b].lq) < 1e-3 && dist(p[b].lp, rest[b].lp) < 1e-6 && Math.abs(p[b].scale[0] - 1) < 1e-6, `${c} moves the code-driven bone ${b}`);
  for (const c of ['load_line', 'unload_line', 'load_kept', 'unload_kept']) {
    const most = Math.max(...P[c].map((p) => quatAngle(p.cylinder.lq, rest.cylinder.lq)));
    assert.ok(Math.abs(most - 60) < 0.5, `${c}: the cylinder brings the chamber to the gate (60 deg), got ${most}`);
  }
});

// Polish round 3 (lead ruling R6, both critics: "a cartridge standing on the forearm cuff", "the sleeve fills the frame"): in
// the ordinary loading clips the left forearm now leaves by the bottom edge and the cuff with its loop stays under the
// frame; the loop is shown where it is the subject: load_kept (whole, then drawn) and take_round (seated). This replaces
// the order's "in frame during every reload clip" (docs/requests/art-weapons.md section 8).
// Polish round 4: load_kept shows the round in the FINGERS from its first frames (both critics: the cuff pose was a dark
// forearm column held for 1.2 s), so there the loop must stay OUT of the frame until code hides it (0.9 s, frame 27).
test('the kept round in its cuff loop: out of the 16:9 frame in load_kept until code hides it (frame 27), in the frame in take_round at the seat', () => {
  const seenIn = (c) => P[c].map((p, i) => (inFrustum(band(p.kept_loop), 0.0) ? i : -1)).filter((i) => i >= 0);
  const lk = seenIn('load_kept'), tr = seenIn('take_round');
  console.log(`kept_loop in frame: load_kept ${lk[0]}..${lk.at(-1)} (${lk.length} frames); take_round ${tr[0]}..${tr.at(-1)} (${tr.length} frames); reload_round ${seenIn('reload_round').length} frames`);
  for (let f = 0; f <= 27; f++) assert.ok(!lk.includes(f), `load_kept: the loop on the cuff is in the frame on frame ${f}, beside the round in the fingers`);
  for (let f = 22; f <= 26; f++) assert.ok(tr.includes(f), `take_round: the loop is out of the frame on frame ${f}`);
});

// Polish round 3: the round travels INTO the chamber in view: in reload_round the pinched round is inside the frame,
// right of the centre line and clear of the bottom edge on every frame before the seat; in load_kept the round held up
// in the light (frames 30-37) is at least 40 px long at 720p and stands still.
test('reload_round: the round goes in inside the frame (frames 0-5); load_kept: the shown round is >= 40 px at 720p and near still (frames 9-16), and goes in inside the frame (30-38)', () => {
  const screen = (p) => [0.5 + p[0] / -p[2] / (2 * TAN * ASPECT), 0.5 + p[1] / -p[2] / (2 * TAN)];
  const rows = [];
  for (let f = 0; f <= 5; f++) {
    const [across, up] = screen(P.reload_round[f].round_hand_lead.pos);
    rows.push(`${f}: ${(across * 100).toFixed(0)} % / ${(up * 100).toFixed(0)} %`);
    assert.ok(across > 0.55 && across < 0.9 && up > 0.3 && up < 0.8, `reload_round frame ${f}: the round is at ${across}, ${up}`);
  }
  console.log('reload_round: the round (across / up) ' + rows.join('; '));
  let least = 1e9, drift = 0;
  for (let f = 9; f <= 16; f++) {
    const b = P.load_kept[f].round_hand_kept, nose = rotate(b.quat, [0, 0.041, 0]).map((x, i) => x + b.pos[i]);
    const a = screen(b.pos), c = screen(nose), px = Math.hypot((c[0] - a[0]) * 1280, (c[1] - a[1]) * 720);
    least = Math.min(least, px); drift = Math.max(drift, dist(b.pos, P.load_kept[9].round_hand_kept.pos) * 1000);
    assert.ok(a[0] > 0.5 && a[0] < 0.75 && a[1] > 0.35 && a[1] < 0.75, `load_kept frame ${f}: the held round is at ${a}`);
  }
  console.log(`load_kept: the held round is at least ${least.toFixed(0)} px long at 720p on frames 9-16, drifts ${drift.toFixed(1)} mm`);
  for (let f = 30; f <= 38; f++) {
    const [across, up] = screen(P.load_kept[f].round_hand_kept.pos);
    assert.ok(across > 0.55 && across < 0.9 && up > 0.3 && up < 0.8, `load_kept frame ${f}: the round going in is at ${across}, ${up}`);
  }
  assert.ok(least >= 40, `the held round is ${least} px long`);
  assert.ok(drift < 15, `the held round drifts ${drift} mm`);
});

test('nothing snaps: no bone of the gun hand jumps more than 13 cm, none of the left arm more than 20 cm, between neighbouring frames', () => {
  let top = { mm: 0 }, topL = { mm: 0 }, topR = { deg: 0 }, topRL = { deg: 0 }, calm = { mm: 0 };
  const KICK = ['fire', 'fire_kept'];                            // the recoil is meant to be violent: 80 / 110 mm in three or four frames
  const MECH = ['gate', 'hammer', 'trigger', 'cylinder', 'round_1', 'round_2', 'round_3', 'round_4', 'round_5', 'round_6'];   // they click: that is the point
  for (const c of CLIPS) for (let f = 1; f < P[c].length; f++) for (const b of BONES) {
    if (HAND_ROUNDS.includes(b)) continue;                       // they appear and vanish by design
    const d = dist(P[c][f][b].pos, P[c][f - 1][b].pos) * 1000, r = quatAngle(P[c][f][b].quat, P[c][f - 1][b].quat);
    const left = /_l(_|$)|kept_loop/.test(b);                    // the left hand crosses the frame in three frames in the 0.3 s clips
    if (left) { if (d > topL.mm) topL = { mm: d, c, f, b }; } else if (d > top.mm) top = { mm: d, c, f, b };
    if (!left && !KICK.includes(c) && b !== 'arm_r' && d > calm.mm) calm = { mm: d, c, f, b };   // arm_r's head is the elbow: under the frame, and (polish round 3) it swings out of the lower right corner in the loading pose
    if (!MECH.includes(b) && r > (left ? topRL : topR).deg) { if (left) topRL = { deg: r, c, f, b }; else topR = { deg: r, c, f, b }; }
  }
  console.log(`largest frame-to-frame step: gun hand ${top.mm.toFixed(0)} mm (${top.c} frame ${top.f}, ${top.b}); left arm ${topL.mm.toFixed(0)} mm (${topL.c} frame ${topL.f}, ${topL.b}); ${topR.deg.toFixed(0)} deg (${topR.c} frame ${topR.f}, ${topR.b})`);
  console.log(`largest gun-hand step outside the two recoil clips: ${calm.mm.toFixed(0)} mm (${calm.c} frame ${calm.f}, ${calm.b})`);
  assert.ok(top.mm < 130, JSON.stringify(top));
  assert.ok(calm.mm < 95, JSON.stringify(calm));          // every other move eases in: no whip from a standstill
  // polish round 2: the left arm now rests under the frame and comes straight UP to the gate (it no longer crosses the frame from the left): its
  // elbow travels 0.45 m in the four frames a 0.3 s clip leaves it. The bound is the one in this test's title.
  assert.ok(topL.mm < 200, JSON.stringify(topL));
  console.log(`largest left-arm turn: ${topRL.deg.toFixed(0)} deg (${topRL.c} frame ${topRL.f}, ${topRL.b})`);
  assert.ok(topR.deg < 55, JSON.stringify(topR));
  assert.ok(topRL.deg < 60, JSON.stringify(topRL));       // the left hand comes from under the frame to the gate in three frames in the 0.3 s clips
});
});
