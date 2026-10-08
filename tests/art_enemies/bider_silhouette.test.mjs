// art-enemies-bider: the Bider as a 48 px black shape (ART_BIBLE 12 item 20) against every other creature whose shipped
// file is final (a placeholder is skipped), and its weak point in greyscale (item 22). Writes
// shots/art-enemies-bider/silhouettes.png and weakpoints_grey.png.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, openViewer, glow, frame, setClip, mask, fitMask, iou, maskPng, isPlaceholder, sheet, lstar, sharp, path, startServer } from './bider_lib.mjs';

const OTHERS = [['enemy_transit', 'aim_hold'], ['enemy_tamper', 'idle']];
const VIEWS = [['front', 0], ['side', 90]];

async function shape(server, asset, clip, yaw) {
  const game = await openViewer(server, asset, { yaw, pitch: 0 });
  try {
    if (await isPlaceholder(game, asset)) return null;
    await setClip(game, clip, 0);
    return fitMask(await mask(game), 48);
  } finally { await game.close(); }
}

test('bider: its 48 px silhouette cannot be confused with another creature (IoU < 0.6), front and side', async () => {
  const server = await startServer();
  try {
    const tiles = []; const lines = [];
    for (const [view, yaw] of VIEWS) {
      const mine = await shape(server, 'enemy_bider', 'idle_stoop', yaw);
      tiles.push(await maskPng(mine, 64));
      for (const [other, clip] of OTHERS) {
        const o = await shape(server, other, clip, yaw);
        if (!o) { lines.push(`${view}: ${other} is a placeholder, skipped`); tiles.push(await maskPng({ width: 1, height: 48, data: new Uint8Array(48) }, 64)); continue; }
        const v = iou(mine, o);
        lines.push(`${view}: IoU with ${other} = ${v.toFixed(3)}`);
        tiles.push(await maskPng(o, 64));
        assert.ok(v < 0.6, `${view}: IoU with ${other} is ${v.toFixed(3)}`);
      }
    }
    await sheet(tiles, path.join(SHOTS, 'silhouettes.png'), { cols: 1 + OTHERS.length });
    console.log('  ' + lines.join('\n  '));
  } finally { await server.close(); }
});

test('bider: the knot core is at least 60 L* brighter than its dark collar in greyscale (lit as code-render will light it)', async () => {
  const server = await startServer();
  try {
    const game = await openViewer(server, 'enemy_bider', { yaw: 0, pitch: 20, dist: 1.6 }, { width: 640, height: 640 });
    let png, at;
    try {
      await glow(game);
      await setClip(game, 'idle_stoop', 0);
      png = await frame(game);
      at = await game.page.evaluate(() => window.__dbg.ext.viewer.project('crown'));
    } finally { await game.close(); }
    const rgb = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = rgb.info.width, H = rgb.info.height, cx = Math.round(at.across * W), cy = Math.round((1 - at.up) * H);
    const L = (x, y) => { const i = (y * W + x) * 3; return lstar(rgb.data[i], rgb.data[i + 1], rgb.data[i + 2]); };
    // within the knot's projected disc (its collar reaches ~130 px at this distance): the core = the brightest 5 %, the
    // bezel = the darkest 10 % (the collar); the two must be far apart in lightness
    const px = [];
    for (let y = cy - 130; y <= cy + 130; y++) for (let x = cx - 130; x <= cx + 130; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || Math.hypot(x - cx, y - cy) > 130) continue;
      px.push(L(x, y));
    }
    px.sort((a, b) => a - b);
    // pass i3 (look team creatures-props): the knot is bound glass now (bider_build.build_knot_bound). Its near-white heart
    // is seen between three lashings and is 41 % of the knot across, where the old central lobe was a flat white facet of
    // 48 %: in this 130 px disc (which also holds the hood and the background) it is the brightest 2 %, not 5 %
    const c = px[Math.floor(px.length * 0.98)], b = px[Math.floor(px.length * 0.10)];
    const c5 = px[Math.floor(px.length * 0.95)];
    console.log(`  knot core L* ${c.toFixed(1)} (brightest 2 %; brightest 5 %: ${c5.toFixed(1)}), collar L* ${b.toFixed(1)} (darkest 10 %): difference ${(c - b).toFixed(1)}`);
    assert.ok(c5 - b >= 45, `the glass round the heart is bright too: brightest 5 % ${c5.toFixed(1)} vs collar ${b.toFixed(1)}`);
    await sharp(png).greyscale().extract({ left: Math.max(0, cx - 170), top: Math.max(0, Math.min(H - 340, cy - 120)), width: 340, height: 340 }).toFile(path.join(SHOTS, 'weakpoints_grey.png'));
    assert.ok(c - b >= 60, `core ${c.toFixed(1)} vs collar ${b.toFixed(1)}`);
  } finally { await server.close(); }
});
