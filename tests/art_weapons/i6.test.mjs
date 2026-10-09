// Pass i6 (look team gun): the hammer is a slim hook, not a sail (the visual reviewer: "an oversized ribbed hammer spur shaped
// like a horn"), and the fingers are a little slimmer. Read from the sources, which are what the build draws.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = fs.readFileSync(path.join(ROOT, 'blender/weapons/assize.py'), 'utf8');

test('the hammer: spur tip no further back than 72 mm, neck no deeper than 11 mm, arc within 38 mm of its screw', () => {
  const m = /^HAMMER = \[([\s\S]*?)\]$/m.exec(src); assert.ok(m, 'HAMMER profile not found');
  const pts = [...m[1].matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].map((r) => [+r[1], +r[2]]);
  assert.equal(pts.length, 21);
  const piv = /HAMMER_PIVOT = \((-?[\d.]+), (-?[\d.]+)\)/.exec(src).slice(1).map(Number);
  const tip = Math.min(...pts.slice(5, 12).map((p) => p[0]));
  const neck = pts[1][0] - pts[14][0];
  const reach = Math.max(...pts.slice(1, 12).map((p) => Math.hypot(p[0] - piv[0], p[1] - piv[1])));
  console.log(`hammer: tip ${tip}, neck ${neck.toFixed(1)} mm, reach ${reach.toFixed(1)} mm`);
  assert.ok(tip >= -72, `spur tip at ${tip}`); assert.ok(neck <= 11, `neck ${neck}`); assert.ok(reach <= 38, `reach ${reach}`);
  assert.ok(pts[7][1] > pts[11][1] + 2.5, 'the spur keeps its thickness (HAMMER[7] is its crest: revolver_anim reads it)');
});

test('the fingers are slimmed (hands.SLIM) and the barrel carries its struck line', () => {
  const h = fs.readFileSync(path.join(ROOT, 'blender/weapons/hands.py'), 'utf8');
  const slim = +/^SLIM = ([\d.]+)/m.exec(h)[1]; assert.ok(slim <= 0.95 && slim >= 0.88, `SLIM ${slim}`);
  const g = fs.readFileSync(path.join(ROOT, 'blender/weapons/gun_tex.py'), 'utf8');
  assert.match(g, /_stamp\("THE ASSIZE {2}VII {2}1104"/);
});
