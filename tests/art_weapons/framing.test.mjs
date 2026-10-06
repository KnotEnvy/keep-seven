// art-weapons 5: the idle pose through the real loader and the viewer's 52-degree view-model pass (the game draws it at 40 degrees since polish round 3: this is about the asset), at 16:9, 4:3 and 21:9.
// Coverage, nothing left of the vertical centre line, the muzzle's place (16:9), the bore's direction, the loading clips'
// framing; and "the darkest object in the frame" under the L1 and L4 mood looks.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { startServer } from '../harness.mjs';
import { SHOTS, openViewer, rotate, frames } from './lib.mjs';

let server;
// a suite, so the hooks are this file's own (a directory run imports every file into one process)
describe('art-weapons framing', () => {
before(async () => { server = await startServer({ pieces: [] }); });
after(async () => { await server.close(); });

// GDD 12.2: the cylinder ring is 64 px across at 1080p in the bottom right, the seventh beside it (20 px, lower right), the
// reserve numeral beneath. The box below is that group with its margin, as fractions of the frame HEIGHT from the corner.
const HUD = { w: 150 / 1080, h: 130 / 1080 };

async function measure(viewport, name) {
  const game = await openViewer(server, viewport);
  try {
    await game.step(1, true);
    const out = await game.page.evaluate(() => {
      const v = window.__dbg.ext.viewer;
      v.setClip('idle', 0); window.__dbg.step(1, true);
      return { muzzle: v.project('muzzle'), look: v.project('cam_look'), cov: v.coverage(), pose: v.pose(['muzzle', 'cam_look', 'gun']) };
    });
    const file = await game.shot('_' + name);
    const { width, height } = viewport;
    const hw = Math.round(HUD.w * height), hh = Math.round(HUD.h * height);
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${width - hw - 0.5}" y="${height - hh - 0.5}" width="${hw}" height="${hh}" fill="none" stroke="#ff3bd4" stroke-width="1"/>
      <line x1="${width / 2}" y1="0" x2="${width / 2}" y2="${height}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>
      <circle cx="${out.muzzle.across * width}" cy="${(1 - out.muzzle.up) * height}" r="5" fill="none" stroke="#35ff6a" stroke-width="1"/></svg>`;
    await sharp(file).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(SHOTS, name + '.png'));
    fs.rmSync(file);
    return out;
  } finally { await game.close(); }
}

// Polish round 2: the idle placement is no longer ART_BIBLE 8.3's (muzzle (0.075, -0.070, -0.56) at 58 % / 37 %, bore on
// the crosshair: the gun seen from straight behind, 4 % of the frame). The gun is held nearer and turned 12 degrees inboard,
// 4 degrees up, so its left side, cylinder and hammer are seen: docs/requests/art-weapons.md section 7.
test('idle framing at 16:9: muzzle 56 % / 43 %, coverage 6 to 12 %, right of the centre line, the bore 12 degrees inboard and 4 up', async () => {
  const o = await measure({ width: 960, height: 540 }, 'viewmodel_idle_16x9');
  console.log(`16:9  muzzle ${(o.muzzle.across * 100).toFixed(1)} % across, ${(o.muzzle.up * 100).toFixed(1)} % up; coverage ${(o.cov.coverage * 100).toFixed(1)} %; pixels x ${o.cov.minX.toFixed(3)}..${o.cov.maxX.toFixed(3)} y ${o.cov.minY.toFixed(3)}..${o.cov.maxY.toFixed(3)}`);
  assert.ok(Math.abs(o.muzzle.across - 0.558) <= 0.02, `muzzle across ${o.muzzle.across}`);
  assert.ok(Math.abs(o.muzzle.up - 0.433) <= 0.02, `muzzle up ${o.muzzle.up}`);
  assert.ok(o.muzzle.inFront);
  assert.ok(o.cov.coverage <= 0.12, `coverage ${o.cov.coverage}`);
  assert.ok(o.cov.coverage >= 0.06, `the gun has no presence: coverage ${o.cov.coverage}`);
  assert.ok(o.cov.minX >= 0.5, `a view-model pixel lies left of the centre line (minX ${o.cov.minX})`);
  assert.ok(Math.abs(o.look.across - 0.5) < 0.002 && Math.abs(o.look.up - 0.5) < 0.002, 'cam_look is not at the crosshair');
  // the muzzle node's own -Z is the bore axis: 12 degrees inboard (toward -X) and 4 degrees up of the view axis (-Z)
  const m = o.pose.muzzle;
  const axis = rotate(m.quat, [0, 0, -1]);
  const yaw = Math.atan2(-axis[0], -axis[2]) * 180 / Math.PI, pitch = Math.asin(axis[1]) * 180 / Math.PI;
  console.log(`bore: muzzle (${m.pos.map((x) => x.toFixed(4)).join(', ')}); ${yaw.toFixed(2)} degrees inboard, ${pitch.toFixed(2)} degrees up`);
  assert.ok(Math.hypot(m.pos[0] - 0.052, m.pos[1] + 0.034, m.pos[2] + 0.52) < 0.004, `the muzzle is not at (0.052, -0.034, -0.52): ${m.pos}`);
  assert.ok(Math.abs(yaw - 12) < 0.6 && Math.abs(pitch - 4) < 0.6, `bore ${yaw} / ${pitch}`);
});

// Polish round 2 (ART_BIBLE 12 item 26 on every clip, not only idle): the loading clips stay in the right half of the frame
// and under 18 % of it; the left hand comes up from below. sprint is exempt by the order (the left hand swings into the
// lower-left corner); load_kept and take_round (the cuff turned up to the eye) may take a fifth of the frame.
test('every loading clip: coverage <= 18 % and nothing left of the centre line on every frame (16:9)', async () => {
  const game = await openViewer(server, { width: 960, height: 540 });
  try {
    await game.step(1, true);
    const clips = ['reload_open', 'reload_round', 'reload_close', 'reload_fast_close', 'load_line', 'unload_line', 'unload_kept', 'load_kept', 'take_round', 'fire', 'fire_kept', 'dry_fire', 'idle'];
    const out = await game.page.evaluate(({ clips }) => {
      const v = window.__dbg.ext.viewer, res = {};
      for (const [c, n] of clips) {
        let cov = 0, minX = 1;
        for (let f = 0; f <= n; f++) { v.setClip(c, f / n); window.__dbg.step(1, true); const k = v.coverage(); if (k.coverage > cov) cov = k.coverage; if (k.coverage > 0 && k.minX < minX) minX = k.minX; }
        res[c] = { cov, minX };
      }
      return res;
    }, { clips: clips.map((c) => [c, frames(c)]) });
    console.log(Object.entries(out).map(([c, r]) => `${c} ${(r.cov * 100).toFixed(1)} % / left edge ${r.minX.toFixed(3)}`).join('; '));
    for (const [c, r] of Object.entries(out)) {
      // polish round 3: load_kept and take_round (input is locked, the round is the subject) may reach 6 % of the width past the centre line
      assert.ok(r.minX >= (c === 'load_kept' || c === 'take_round' ? 0.44 : 0.5), `${c}: a pixel left of the centre line (${r.minX})`);
      assert.ok(r.cov <= (c === 'load_kept' || c === 'take_round' ? 0.20 : 0.18), `${c}: coverage ${r.cov}`);
    }
  } finally { await game.close(); }
});

test('idle framing at 4:3 and 21:9: coverage <= 18 %, nothing left of the centre line (muzzle fractions reported)', async () => {
  for (const [name, viewport] of [['viewmodel_idle_4x3', { width: 720, height: 540 }], ['viewmodel_idle_21x9', { width: 1260, height: 540 }]]) {
    const o = await measure(viewport, name);
    console.log(`${name.slice(15)}  muzzle ${(o.muzzle.across * 100).toFixed(1)} % across, ${(o.muzzle.up * 100).toFixed(1)} % up; coverage ${(o.cov.coverage * 100).toFixed(1)} %; minX ${o.cov.minX.toFixed(3)}`);
    assert.ok(o.cov.coverage <= 0.18, `${name}: coverage ${o.cov.coverage}`);
    assert.ok(o.cov.minX >= 0.5, `${name}: minX ${o.cov.minX}`);
  }
});

// mean luminance (sRGB 0..255, Rec. 709 weights) of the pixels inside a box, and of the gun's steel
async function regions(file, boxes) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = {};
  for (const [k, [x0, y0, x1, y1]] of Object.entries(boxes)) {
    let s = 0, n = 0;
    for (let y = Math.round(y0 * info.height); y < Math.round(y1 * info.height); y++) for (let x = Math.round(x0 * info.width); x < Math.round(x1 * info.width); x++) {
      const i = (y * info.width + x) * 3; s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++;
    }
    out[k] = s / n;
  }
  return out;
}

test('the gun is the darkest object in the frame under the L1 (daylight) and L4 (lift hall) mood looks', async () => {
  for (const [name, query] of [['viewmodel_in_L1', { mood: 'L1', ground: 'sand' }], ['viewmodel_in_L4', { mood: 'L4' }]]) {
    const game = await openViewer(server, { width: 960, height: 540 }, query);
    let frame, gun;
    try {
      await game.page.evaluate(() => { window.__dbg.ext.viewer.setClip('idle', 0); window.__dbg.step(1, true); });
      // where the gun's steel is on screen: between the muzzle and the cylinder, sampled along the barrel
      gun = await game.page.evaluate(() => { const v = window.__dbg.ext.viewer; return { a: v.project('muzzle'), b: v.project('cylinder') }; });
      const tmp = await game.shot('_' + name);
      frame = path.join(SHOTS, name + '.png'); fs.renameSync(tmp, frame);
    } finally { await game.close(); }
    const { data, info } = await sharp(frame).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const lum = (x, y) => { const i = (Math.round((1 - y) * info.height) * info.width + Math.round(x * info.width)) * 3; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
    let s = 0, n = 0;
    for (let k = 3; k <= 9; k++) { const u = k / 10; s += lum(gun.a.across + (gun.b.across - gun.a.across) * u, gun.a.up + (gun.b.up - gun.a.up) * u); n++; }
    const steel = s / n;
    const r = await regions(frame, { sky: [0.05, 0.05, 0.45, 0.4], ground: [0.05, 0.75, 0.45, 0.95], wall_right: [0.75, 0.1, 0.95, 0.4] });
    // every pixel of the frame that is NOT view-model: the darkest 1 % of the room
    const room = [];
    for (let y = 0; y < info.height; y += 3) for (let x = 0; x < Math.floor(info.width * 0.5); x += 3) { const i = (y * info.width + x) * 3; room.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]); }
    room.sort((a, b) => a - b);
    const darkest = room[Math.floor(room.length * 0.01)];
    console.log(`${name}: gun steel ${steel.toFixed(1)}; room: sky ${r.sky.toFixed(1)}, ground ${r.ground.toFixed(1)}, right ${r.wall_right.toFixed(1)}, darkest 1 % of the left half ${darkest.toFixed(1)} (sRGB luminance 0..255)`);
    assert.ok(steel < r.sky && steel < r.ground, `${name}: the gun (${steel}) is not darker than the sky (${r.sky}) and the ground (${r.ground})`);
    assert.ok(steel <= darkest + 1.0, `${name}: something in the room (${darkest}) is darker than the gun's steel (${steel})`);
  }
});
});
