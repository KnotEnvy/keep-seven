// node tests/art_enemies/transit_evidence.mjs [turn] [clips [name ...]] [far] [eye] [stake] [all]
//
// Evidence images of art-enemies-transit in shots/art-enemies-transit/, all through the REAL loader (sandbox/viewer.html)
// with the emissive palette added on top (transit_lib.glow: the fallback material does not draw m_prop's emissive cells):
//   turn    transit_turnaround.png      six views of the rest pose (front, 3/4, side, back 3/4, back, from below)
//   clips   transit_clip_<name>.png     every clip as two rows of frames: a 3/4 front view and a side view
//                                       (8 frames; die_fold and emerge 10); transit_emerge_every_frame.png
//   far     also transit_at_30m_zoom.png (the centre of the 30 m frame, x4 nearest)
//   far     transit_at_30m.png, transit_at_12m.png   under the L1 mood on sand-coloured ground (aim_hold pose)
//   eye     transit_lens_closeup.png    the drum and its weak point from six sides, glow on and off (cropped from a
//                                       large frame); transit_legs_closeup.png: the knee, bands, cuff and foot
//   stake   stake_views.png             proj_stake: hot and cool, side and 3/4
import { PIECE, SHOTS, manifest, openViewer, glow, frame, setClip, sheet, fs, path, sharp, startServer } from './transit_lib.mjs';

const want = new Set(process.argv.slice(2).filter((a) => ['turn', 'clips', 'far', 'eye', 'stake', 'all'].includes(a)));
const names = process.argv.slice(2).filter((a) => !want.has(a));
if (!want.size) want.add('all');
const on = (k) => want.has(k) || want.has('all');
fs.mkdirSync(SHOTS, { recursive: true });
const server = await startServer();
const A = 'enemy_transit';
const tile = { width: 420, height: 540 };

async function view(asset, query, fn, viewport = tile, glowScale = 1) {
  const game = await openViewer(server, asset, query, viewport);
  try { await glow(game, glowScale); return await fn(game); } finally { await game.close(); }
}

try {
  if (on('turn')) {
    const shots = [];
    for (const [yaw, pitch] of [[0, 6], [35, 14], [90, 6], [145, 14], [180, 6], [-40, 38]]) shots.push(await view(A, { yaw, pitch, dist: 2.7 }, frame));
    console.log(await sheet(shots, path.join(SHOTS, 'transit_turnaround.png'), { cols: 6 }));
  }
  if (on('clips')) {
    const clips = manifest().assets[A].animations.map((c) => c.name).filter((n) => !names.length || names.includes(n));
    for (const clip of clips) {
      const n = clip === 'die_fold' || clip === 'emerge' ? 10 : 8;
      const wide = clip === "die_fold" ? 3.7 : 2.7;
      const rows = [];
      for (const [yaw, pitch] of [[32, 10], [90, 4]]) {
        rows.push(...await view(A, { yaw, pitch, dist: wide }, async (game) => {
          const out = [];
          for (let i = 0; i < n; i++) { await setClip(game, clip, i / (n - 1)); out.push(await frame(game)); }
          return out;
        }, { width: 300, height: 380 }));
      }
      console.log(await sheet(rows, path.join(SHOTS, `transit_clip_${clip}.png`), { cols: n }));
    }
  }
  if (on('clips') && (!names.length || names.includes('emerge'))) {
    // emerge frame by frame (every frame 0..29, three rows of ten, 3/4 front): the unfold must have no pop
    const out = await view(A, { yaw: 32, pitch: 10, dist: 3.3 }, async (game) => {
      const o = [];
      for (let i = 0; i < 30; i++) { await setClip(game, 'emerge', i / 36); o.push(await frame(game)); }
      return o;
    }, { width: 300, height: 300 });
    console.log(await sheet(out, path.join(SHOTS, 'transit_emerge_every_frame.png'), { cols: 10 }));
  }
  if (on('far')) {
    for (const d of [30, 12]) {
      const b = await view(A, { dist: d, yaw: 12, pitch: 3, mood: 'L1', ground: 'sand', clip: 'aim_hold', t: 0 }, frame, { width: 960, height: 540 });
      fs.writeFileSync(path.join(SHOTS, `transit_at_${d}m.png`), b);
      console.log(path.join(SHOTS, `transit_at_${d}m.png`));
      if (d === 30) {                                    // the middle of the 30 m frame, four times up (nearest: the real pixels)
        const z = path.join(SHOTS, 'transit_at_30m_zoom.png');
        await sharp(b).extract({ left: 400, top: 190, width: 160, height: 120 }).resize(640, 480, { kernel: 'nearest' }).png().toFile(z);
        console.log(z);
      }
    }
  }
  if (on('eye')) {
    // the camera of a dist= shot looks at the middle of the bounding box (the hub): frame the whole asset in a tall
    // viewport and crop the drum out of the top of it (glow on, then off)
    const shots = [];
    for (const g of [1, 0]) for (const [yaw, pitch] of [[0, 0], [35, 5], [60, 5], [-90, 0], [90, 0], [180, 0]]) {
      const b = await view(A, { yaw, pitch, dist: 2.2 }, frame, { width: 1800, height: 1800 }, g);
      shots.push(await sharp(b).extract({ left: 620, top: 20, width: 560, height: 560 }).png().toBuffer());
    }
    console.log(await sheet(shots, path.join(SHOTS, 'transit_lens_closeup.png'), { cols: 6 }));
    // the legs: knee hinge, clamp bands, cuff, foot (the lower two thirds of the same framing)
    const legs = [];
    for (const [yaw, pitch] of [[20, 8], [75, 8], [150, 12]]) {
      const b = await view(A, { yaw, pitch, dist: 2.2 }, frame, { width: 1800, height: 1800 });
      legs.push(await sharp(b).extract({ left: 420, top: 620, width: 960, height: 1100 }).resize(640).png().toBuffer());
    }
    console.log(await sheet(legs, path.join(SHOTS, 'transit_legs_closeup.png'), { cols: 3 }));
  }
  if (on('stake')) {
    const shots = [];
    for (const [yaw, pitch] of [[90, 10], [40, 25], [150, 20]]) shots.push(await view('proj_stake', { yaw, pitch }, frame, { width: 420, height: 300 }));
    console.log(await sheet(shots, path.join(SHOTS, 'stake_views.png'), { cols: 3 }));
  }
} finally {
  await server.close();
}
console.log(`evidence in shots/${PIECE}/`);
