// art-enemies-transit: the Transit as a 48 px black shape (ART_BIBLE 12 item 20) against every other creature whose
// shipped file is final, and its weak point in greyscale (item 22). Writes shots/art-enemies-transit/silhouettes.png
// and weakpoints_grey.png.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, openViewer, glow, frame, setClip, mask, fitMask, iou, maskPng, isPlaceholder, sheet, lstar, sharp, fs, path, startServer } from './transit_lib.mjs';

const OTHERS = [['enemy_bider', 'idle_stoop'], ['enemy_tamper', 'idle']];
const VIEWS = [['front', 0], ['side', 90]];

async function shape(server, asset, clip, yaw) {
  const game = await openViewer(server, asset, { yaw, pitch: 0 });
  try {
    if (await isPlaceholder(game, asset)) return null;
    await setClip(game, clip, 0);
    return fitMask(await mask(game), 48);
  } finally { await game.close(); }
}

test('transit: its 48 px silhouette cannot be confused with another creature (IoU < 0.6), front and side', async () => {
  const server = await startServer();
  try {
    const tiles = []; const lines = [];
    for (const [view, yaw] of VIEWS) {
      const mine = await shape(server, 'enemy_transit', 'aim_hold', yaw);
      tiles.push(await maskPng(mine, 64));
      // three legs under a head: at least two separate legs in the row a quarter of the way up, from both views
      const row = 36; let runs = 0, prev = 0;
      for (let x = 0; x < mine.width; x++) { const p = mine.data[row * mine.width + x]; if (p && !prev) runs++; prev = p; }
      assert.ok(runs >= 2, `${view}: ${runs} separate legs at a quarter of its height`);
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

test('transit: the lens core is at least 60 L* brighter than its bezel in greyscale, and is a dark ring round a bright centre', async () => {
  const server = await startServer();
  try {
    const game = await openViewer(server, 'enemy_transit', { yaw: 0, pitch: 0, dist: 2.0 }, { width: 640, height: 640 });
    let png, at;
    try {
      await glow(game);
      await setClip(game, 'idle_scan', 0);
      png = await frame(game);
      at = await game.page.evaluate(() => window.__dbg.ext.viewer.project('lens'));
    } finally { await game.close(); }
    const grey = await sharp(png).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
    const rgb = await sharp(png).removeAlpha().raw().toBuffer();
    const W = grey.info.width, H = grey.info.height, cx = Math.round(at.across * W), cy = Math.round((1 - at.up) * H);
    const L = (x) => { const i = (cy * W + x) * 3; return lstar(rgb[i], rgb[i + 1], rgb[i + 2]); };
    const core = L(cx);
    // walk right from the centre: the bright core ends, then a dark run (glass + bezel), then the pale drum
    let x = cx; while (x < W - 1 && L(x) > core - 25) x++;
    const coreR = x - cx; const dark = [];
    while (x < W - 1 && L(x) < 45) { dark.push(L(x)); x++; }
    const bezelR = x - cx;
    dark.sort((a, b) => a - b);
    const bezel = dark[Math.floor(dark.length / 2)];
    console.log(`  lens core L* ${core.toFixed(1)}, bezel L* ${bezel.toFixed(1)} (difference ${(core - bezel).toFixed(1)}); core radius ${coreR} px of ${bezelR} px to the bezel's outer edge (${(100 * coreR / bezelR).toFixed(0)} %)`);
    assert.ok(dark.length >= 6, 'a dark ring surrounds the core');
    assert.ok(core - bezel >= 60, `core ${core.toFixed(1)} vs bezel ${bezel.toFixed(1)}`);
    let pale = 0; for (let k = 1; k <= 14; k++) pale = Math.max(pale, L(Math.min(W - 1, x + k)));
    assert.ok(pale > 70, `the drum beyond the bezel is pale (L* ${pale.toFixed(1)})`);
    await sharp(png).greyscale().extract({ left: Math.max(0, cx - 160), top: Math.max(0, cy - 160), width: 320, height: 320 }).toFile(path.join(SHOTS, 'weakpoints_grey.png'));
  } finally { await server.close(); }
});
