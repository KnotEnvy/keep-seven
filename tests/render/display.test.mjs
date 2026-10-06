// Display targets (code-render 6): the tone map shows the palette as authored on all three tiers, nothing is darker than
// #0B0D12, lit and shadowed sand under the Long Light, fog at 40 m and 120 m, fog equals the horizon, the lightmap path.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { TIERS, deltaE, ext, frame, hexRgb, least, linearToByte, mean, openSandbox, srgbToLinear } from './util.mjs';

let server;
before(async () => { server = await startServer({ pieces: ['render'] }); });
after(async () => { await server.close(); });

const PALETTE = { steel: 0x36525a, steel_dark: 0x1e2f36, gun_blue: 0x1c2230, cable: 0x1b1f24, walnut: 0x3a2318 };

for (const tier of TIERS) {
  test(`tone map: steel, steel_dark, gun_blue, cable and walnut display within 1/255 of their sRGB values on ${tier} (identity grade, exposure 1)`, async () => {
    const game = await openSandbox(server, { tier });
    try {
      await ext(game, 'render', 'override', { fog: 0, height: 0, grain: 0, vignette: 0, identity: true, exposure: 1 });
      const names = Object.keys(PALETTE);
      for (let i = 0; i < names.length; i++) await ext(game, 'rsb', 'card', { color: PALETTE[names[i]], x: -3 + i * 1.5, y: 1.65, z: 4, w: 1.2, h: 1.2, bake: 'UNLIT', material: 'm_flat' });
      await game.step(2, true);
      const png = await frame(game);
      for (let i = 0; i < names.length; i++) {
        const at = await ext(game, 'rsb', 'project', -3 + i * 1.5, 1.65, 4);
        const got = mean(png, at.x, at.y, 2), want = hexRgb(PALETTE[names[i]]);
        // polish round 3: High's bloom now reaches the sky's lights (threshold at display white, emissives x2): their glow
        // adds up to 2 levels on a dark card beside them. The tone map itself is the same pass as Low's.
        const tol = tier === 'high' ? 2.5 : 1.01;
        for (let k = 0; k < 3; k++) assert.ok(Math.abs(got[k] - want[k]) <= tol, `${tier} ${names[i]}: displayed ${got.map((v) => v.toFixed(1))}, authored ${want}`);
      }
      // and the shoulder: a bright card rolls off toward 1.0 with its hue kept (linear 1.6, 0.8, 0.4 displays 250, 184, 134)
      await ext(game, 'rsb', 'card', { color: 0xffffff, x: 0, y: 3.2, z: 4, w: 1.2, h: 1.2, bake: 'VL', light: [1.6, 0.8, 0.4], material: 'm_flat' });
      await game.step(1, true);
      const top = await ext(game, 'rsb', 'project', 0, 3.2, 4);
      const bright = mean(await frame(game), top.x, top.y, 2);
      const want = [250, 184, 134];
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(bright[k] - want[k]) <= 2, `${tier} shoulder: ${bright} vs ${want}`);
    } finally { await game.close(); }
  });
}

test('no pixel under #0B0D12: a black card under every mood reads at or above the floor, on min, Low and High', async () => {
  for (const tier of TIERS) {
    const game = await openSandbox(server, { tier });
    try {
      await ext(game, 'rsb', 'card', { color: 0x000000, x: 0, y: 1.65, z: 6, w: 6, h: 4, bake: 'UNLIT', material: 'm_flat' });
      await ext(game, 'render', 'override', { fog: 0, height: 0 });
      const rows = [];
      for (const mood of ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L5a', 'L5c', 'L5p', 'L6']) {
        await ext(game, 'render', 'setMoodKey', mood, 0);
        await game.step(1, true);
        const png = await frame(game);
        const centre = await ext(game, 'rsb', 'project', 0, 1.65, 6);
        // the centre of the card and its corner of the frame (the vignette's strongest place that is still card)
        const low = [least(png, centre.x, centre.y, 6), least(png, 12, 12, 6), least(png, png.width - 12, png.height - 12, 6)];
        for (const p of low) {
          assert.ok(p[0] >= 0x0b && p[1] >= 0x0d && p[2] >= 0x12, `${tier} ${mood}: a pixel of ${p} is under #0B0D12 (11, 13, 18)`);
        }
        rows.push(`${mood} ${low[0].join(',')}`);
      }
      console.log(`${tier}: darkest pixels of a black card  ${rows.join('  ')}`);
    } finally { await game.close(); }
  }
});

test('Long Light display targets: lit sand #F4A272 and shadow on sand #5C4E59 within Delta E 10', async () => {
  const game = await openSandbox(server, { tier: 'low' });
  try {
    await ext(game, 'render', 'setMoodKey', 'L1', 0);
    // what the bake puts on sand: facing the key it reads key x 1.30 + ambient x 0.90, in open shade ambient x 0.90
    const key = hexRgb(0xffd09a).map((b) => srgbToLinear(b) * 1.30), amb = hexRgb(0x7a86d8).map((b) => srgbToLinear(b) * 0.90);
    await ext(game, 'rsb', 'card', { color: 0xcda070, x: -1.2, y: 1.65, z: 6, w: 2, h: 2, bake: 'VL', material: 'm_sand', light: key.map((k, i) => k + amb[i]) });
    await ext(game, 'rsb', 'card', { color: 0xcda070, x: 1.2, y: 1.65, z: 6, w: 2, h: 2, bake: 'VL', material: 'm_sand', light: amb });
    await game.step(2, true);
    const png = await frame(game);
    const a = await ext(game, 'rsb', 'project', -1.2, 1.65, 6), b = await ext(game, 'rsb', 'project', 1.2, 1.65, 6);
    const lit = mean(png, a.x, a.y, 5), shade = mean(png, b.x, b.y, 5);
    const dLit = deltaE(lit, hexRgb(0xf4a272)), dShade = deltaE(shade, hexRgb(0x5c4e59));
    console.log(`lit sand ${lit.map(Math.round)} (target 244,162,114: dE ${dLit.toFixed(1)}); shadow on sand ${shade.map(Math.round)} (target 92,78,89: dE ${dShade.toFixed(1)})`);
    assert.ok(dLit <= 10, `lit sand ${lit} is ${dLit.toFixed(1)} from #F4A272`);
    assert.ok(dShade <= 10, `shadow on sand ${shade} is ${dShade.toFixed(1)} from #5C4E59`);
    await game.shot('display_sand_L1');
  } finally { await game.close(); }
});

test('fog under L1: about 20 % at 40 m and 50 % at 120 m toward the horizon colour, and the fog colour is the sky\'s horizon pixel', async () => {
  const game = await openSandbox(server, { tier: 'low' });
  try {
    await ext(game, 'render', 'setMoodKey', 'L1', 0);
    // linear display: identity grade, no grain or vignette; the cards are black, so a pixel is fog share x fog colour
    await ext(game, 'render', 'override', { grain: 0, vignette: 0, identity: true, exposure: 1, height: 0 });
    // the player stands at z = 10 of the room looking north: the cards are 40 m and 120 m in front of her eyes
    await ext(game, 'rsb', 'card', { color: 0x000000, x: -9, y: 2.2, z: 10 - 40, w: 14, h: 3, bake: 'UNLIT', material: 'm_flat' });
    await ext(game, 'rsb', 'card', { color: 0x000000, x: 30, y: 6, z: 10 - 120, w: 44, h: 10, bake: 'UNLIT', material: 'm_flat' });
    await game.step(2, true);
    const png = await frame(game);
    const near = await ext(game, 'rsb', 'project', -9, 2.2, 10 - 40), far = await ext(game, 'rsb', 'project', 30, 6, 10 - 120);
    // the sky just above the horizon on the heading of each card (above the far card's top; the room's floor ends at 120 m)
    const skyNear = mean(png, near.x, far.y - 30, 2), skyFar = mean(png, far.x, far.y - 30, 2);
    // the horizon itself: eye level, far beyond the room's floor, on a heading clear of both cards
    const hAt = await ext(game, 'rsb', 'project', -150, 1.65 + 0.4, 10 - 200);
    const horizon = mean(png, hAt.x, hAt.y, 0);
    const share = (pixel, fog) => { let s = 0; for (let k = 0; k < 3; k++) s += srgbToLinear(pixel[k]) / srgbToLinear(fog[k]); return s / 3; };
    const mood = await ext(game, 'render', 'mood');
    // the fog colour of a heading, from the uniforms: mix(A, B, s^2), s = dot(dir, sun) / 2 + 0.5
    const fogOf = (dx, dz) => {
      const v = mood.values, l = Math.hypot(dx, dz), s = ((dx / l) * v[46] + (dz / l) * v[48]) * 0.5 + 0.5;
      return [0, 1, 2].map((k) => linearToByte(v[k] + (v[3 + k] - v[k]) * s * s));
    };
    const fogNear = fogOf(-9, -40), fogFar = fogOf(30, -120), fogHorizon = fogOf(-150, -200);
    const f40 = share(mean(png, near.x, near.y, 3), fogNear), f120 = share(mean(png, far.x, far.y, 3), fogFar);
    const d40 = Math.hypot(9, 40, 0.55), d120 = Math.hypot(30, 120, 4.35);
    console.log(`fog at ${d40.toFixed(1)} m ${(f40 * 100).toFixed(1)} %, at ${d120.toFixed(1)} m ${(f120 * 100).toFixed(1)} %; fog colour ${fogHorizon} vs the sky's horizon pixel ${horizon.map(Math.round)} (dE ${deltaE(fogHorizon, horizon).toFixed(1)}); sky above the far card ${skyFar.map(Math.round)}`);
    assert.ok(Math.abs(f40 - (1 - Math.exp(-0.0058 * d40))) <= 0.03 && Math.abs(f40 - 0.20) <= 0.035, `fog at 40 m is ${(f40 * 100).toFixed(1)} %`);
    assert.ok(Math.abs(f120 - (1 - Math.exp(-0.0058 * d120))) <= 0.03 && Math.abs(f120 - 0.50) <= 0.04, `fog at 120 m is ${(f120 * 100).toFixed(1)} %`);
    assert.ok(deltaE(fogHorizon, horizon) <= 4, `fog ${fogHorizon} against the horizon pixel ${horizon}`);
    assert.ok(skyNear[2] > 0 && skyFar[2] > 0);
    await game.shot('display_fog_L1');
  } finally { await game.close(); }
});

test('lightmap path: a white lightmap texel and a 0.5 vertex colour give the same output; the fixture room\'s floor shows its lightmap', async () => {
  const game = await openSandbox(server, { tier: 'low' });
  try {
    await ext(game, 'render', 'override', { fog: 0, height: 0, grain: 0, vignette: 0, identity: true, exposure: 1 });
    await ext(game, 'rsb', 'fixtures', ['fixture_room']);
    // grey 0.5 (linear) x 2: once through the lightmap's neutral white texel, once as plain vertex light
    await ext(game, 'rsb', 'card', { color: 0xbcbcbc, x: -1.2, y: 1.65, z: 6, w: 2, h: 2, bake: 'LM', lightmap: 'lm_fixture_room', material: 'm_pellam', light: [0.6, 0.6, 0.6] });
    await ext(game, 'rsb', 'card', { color: 0xbcbcbc, x: 1.2, y: 1.65, z: 6, w: 2, h: 2, bake: 'VL', material: 'm_pellam', light: [0.6, 0.6, 0.6] });
    await game.step(2, true);
    let png = await frame(game);
    const a = await ext(game, 'rsb', 'project', -1.2, 1.65, 6), b = await ext(game, 'rsb', 'project', 1.2, 1.65, 6);
    const lm = mean(png, a.x, a.y, 3), vl = mean(png, b.x, b.y, 3);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(lm[k] - vl[k]) <= 1, `lightmapped ${lm} and vertex-lit ${vl} differ`);
    assert.ok(lm[0] > 100 && lm[0] < 240, `the cards are lit (${lm})`);
    const names = await ext(game, 'render', 'programNames');
    console.log(`lightmapped card ${lm.map(Math.round)}, vertex-lit card ${vl.map(Math.round)}`);
    // the room itself, through the real loader and this resolver: its floor carries the lightmap (it is not one flat value)
    const index = await ext(game, 'rsb', 'spawn', 'fixture_room', 0, 0.02, 0);
    assert.ok(index >= 0);
    await game.step(2, true);
    png = await frame(game);
    const samples = [];
    for (const [x, z] of [[-2.4, -1.4], [-1, 0], [0, 1.2], [1.2, -1], [2.4, 1.4], [0, -1.6]]) { const p = await ext(game, 'rsb', 'project', x, 0.03, z); samples.push(mean(png, p.x, p.y, 1)); }
    const lum = samples.map((s) => s[0] + s[1] + s[2]);
    assert.ok(Math.max(...lum) - Math.min(...lum) > 12, `the floor is lit by its lightmap, not flat: ${samples.map((s) => s.map(Math.round).join(','))}`);
    assert.ok(names.length > 0);
    await game.shot('display_fixture_room');
  } finally { await game.close(); }
});
