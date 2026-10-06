// The muzzle pulse on surfaces (polish round 4, critic: "the muzzle pulse turns nearby dynamic things into flat orange
// cut-outs"). Under an interior exposure a filled pulse clipped the red channel of everything near it, and a world
// material had no normal at all: a Bider, the hand and a jamb were one flat orange shape for the frames of a shot.
// What must hold on every material that takes the pulse (shared.ts PULSE_GLSL):
//   - form: a face turned to the pulse takes clearly more of it than a face turned away;
//   - a clamp: what the pulse adds is never more than PULSE_CAP of display white, in any channel;
//   - the centre is paler than the edge (toward the pulse's own white), not a deeper orange;
//   - a pulse that has ended leaves the frame exactly as it was.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { ext, frame, mean, openSandbox, srgbToLinear } from './util.mjs';

let server;
before(async () => { server = await startServer({ pieces: ['render'] }); });
after(async () => { await server.close(); });

const KNEE = 0.8;   // src/core/tonemap.ts TONE_MAP_KNEE
/** display bytes -> linear scene radiance x exposure (the shoulder curve undone; the grade is the identity here) */
function scene(rgb) {
  const c = rgb.map(srgbToLinear), m = Math.max(...c);
  if (m <= KNEE) return c;
  const u = Math.min(0.995, (m - KNEE) / (1 - KNEE)), back = KNEE + (1 - KNEE) * u / (1 - u);
  return c.map((v) => v * back / m);
}
const EXPOSURE = 2.5;                       // the Tally House's (moods.ts L2)
const MUZZLE = [3, 0.888, 0.099];           // vfx.ts muzzleFlash('lead') indoors: HUE.flame x 3
const PULSE_AT = [0, 1.5, 7.5], RADIUS = 7; // the player stands at (0, 0, 10) of the room, looking north
// three cards per material: turned to the pulse 1.7 m off, turned away from it at the same distance, turned to it 4.6 m off
const CARDS = { near: { x: -0.8, z: 6.0, yawDeg: 0 }, away: { x: 0.8, z: 6.0, yawDeg: 60 }, far: { x: 0.3, z: 3.0, yawDeg: 0 } };   // (none hides another from the eye)
const KINDS = [
  { name: 'm_prop (a creature, a door, the hand)', material: 'm_prop', bake: 'AO' },
  { name: 'a dynamic thing in a world material (a Bider\'s cloth)', material: 'm_frontier', bake: 'AO' },
  { name: 'a static world surface (a jamb)', material: 'm_frontier', bake: 'VL' },
];

for (const tier of ['low', 'min']) {
  test(`the muzzle pulse keeps the form of what it lights and never clips it (${tier})`, async () => {
    const game = await openSandbox(server, { scene: 'room', tier, viewport: { width: 640, height: 360 } });
    try {
      await game.step(5, true);
      await ext(game, 'render', 'override', { exposure: EXPOSURE, identity: true, grain: 0, vignette: 0, fog: 0 });
      const cap = await game.page.evaluate(async () => (await import('/src/render/shared.ts')).PULSE_CAP);
      assert.ok(cap > 0.3 && cap < 0.9, `PULSE_CAP ${cap}`);
      for (const kind of KINDS) {
        await ext(game, 'rsb', 'clearCards');
        const at = {};
        for (const [k, c] of Object.entries(CARDS)) {
          await ext(game, 'rsb', 'card', { color: 0x808080, material: kind.material, bake: kind.bake, x: c.x, y: 1.5, z: c.z, w: 0.7, h: 0.7, yawDeg: c.yawDeg, name: 'pulse_' + k });
          at[k] = await ext(game, 'rsb', 'project', c.x, 1.5, c.z);
        }
        await game.step(40, true);   // a dynamic card's zone light settles
        const read = async () => { const png = await frame(game); return Object.fromEntries(Object.keys(CARDS).map((k) => [k, scene(mean(png, at[k].x, at[k].y, 2))])); };
        const base = await read();
        const uniforms = await game.page.evaluate(([p, r, c]) => {
          const d = window.__dbg, ctx = d.ext.core.ctx(), o = d.ext.rsb.origin();
          ctx.render.vfx.pulse(p[0] + o[0], p[1] + o[1], p[2] + o[2], r, 0.07, c[0], c[1], c[2]);
          d.step(0, true);
          const s = d.ext.render.system().shared;
          return { col: [s.uPulseCol.value[0].toArray(), s.uPulseCol.value[1].toArray()], cap: s.uPulseCap.value };
        }, [PULSE_AT, RADIUS, MUZZLE]);
        assert.ok(uniforms.col.some((c) => Math.abs(c[0] - 3) < 1e-6), 'the pulse is at full strength in the frame that is read');
        assert.ok(Math.abs(uniforms.cap - cap / EXPOSURE) < 1e-6, `the cap follows the exposure: ${uniforms.cap}`);
        const lit = await read();
        const add = Object.fromEntries(Object.keys(CARDS).map((k) => [k, lit[k].map((v, i) => v - base[k][i])]));
        const top = (v) => Math.max(...v);
        const note = `${kind.name}: added near ${add.near.map((v) => v.toFixed(3))}, away ${add.away.map((v) => v.toFixed(3))}, far ${add.far.map((v) => v.toFixed(3))}; base near ${base.near.map((v) => v.toFixed(3))}`;
        // it is seen
        assert.ok(top(add.near) > 0.12, 'the face turned to the pulse is lit by it. ' + note);
        assert.ok(top(add.far) > 0.02, 'the pulse reaches 4.6 m. ' + note);
        // the clamp: never more than PULSE_CAP of display white (0.03: the sRGB byte's step near white)
        for (const k of Object.keys(CARDS)) assert.ok(top(add[k]) <= cap + 0.03, `${k}: the pulse adds ${top(add[k]).toFixed(3)} of display white, over the cap ${cap}. ${note}`);
        // form: the face turned away takes less than half of what the face turned to it takes, at the same distance
        assert.ok(top(add.away) < 0.5 * top(add.near), 'a face turned away takes clearly less. ' + note);
        // the centre is paler: green over red is higher near the pulse than at its edge (flame is 0.30)
        const gr = (v) => v[1] / Math.max(v[0], 1e-4);
        assert.ok(gr(add.near) > gr(add.far) + 0.08, `paler toward the centre: G/R near ${gr(add.near).toFixed(2)}, far ${gr(add.far).toFixed(2)}. ${note}`);
        assert.ok(gr(add.far) < 0.45 && add.far[2] < add.far[1], 'still the flame\'s colour at its edge. ' + note);
        // over: both slots black, the frame is the one before the shot
        await game.step(8, true);
        const rest = await game.page.evaluate(() => { const s = window.__dbg.ext.render.system().shared; return [s.uPulseCol.value[0].toArray(), s.uPulseCol.value[1].toArray()]; });
        assert.deepEqual(rest.map((c) => c.slice(0, 3)), [[0, 0, 0], [0, 0, 0]], 'both slots are at rest 8 ticks later');
        const again = await read();
        for (const k of Object.keys(CARDS)) for (let i = 0; i < 3; i++) assert.ok(Math.abs(again[k][i] - base[k][i]) < 0.012, `${k}: the frame after the pulse is the frame before it. ${note}`);
      }
    } finally { await game.close(); }
  });
}
