// art-enemies-bider: the pose contracts (work order art-enemies 5), read with __dbg.ext.viewer.pose / setClip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { openViewer, setClip, pose, assetBox, startServer, frames, path, ROOT } from './bider_lib.mjs';

let server;
test.before(async () => { server = await startServer(); });
test.after(async () => { await server.close(); });

const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180 / Math.PI;
function rot(q, v) {                                       // rotate v by quaternion q = [x, y, z, w]
  const [x, y, z, w] = q, [a, b, c] = v;
  const ix = w * a + y * c - z * b, iy = w * b + z * a - x * c, iz = w * c + x * b - y * a, iw = -x * a - y * b - z * c;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
function mul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

test('sit_down ends where sit_breathe begins (every bone within 1 mm and 0.5 degrees)', async () => {
  const g = await openViewer(server, 'enemy_bider');
  try {
    await setClip(g, 'sit_down', 1); const a = await pose(g);
    await setClip(g, 'sit_breathe', 0); const b = await pose(g);
    let worstD = 0, worstA = 0;
    for (const n of Object.keys(a)) {
      const d = Math.hypot(...a[n].pos.map((x, i) => x - b[n].pos[i])); const ang = angle(a[n].quat, b[n].quat);
      worstD = Math.max(worstD, d); worstA = Math.max(worstA, ang);
      assert.ok(d < 0.001 && ang < 0.5, `${n}: ${(d * 1000).toFixed(2)} mm, ${ang.toFixed(2)} deg`);
    }
    console.log(`  worst ${(worstD * 1000).toFixed(3)} mm, ${worstA.toFixed(3)} deg`);
  } finally { await g.close(); }
});

for (const [id, clip, t] of [['bider_seated_static', 'sit_down', 1], ['bider_felled_static', 'die_back', 1], ['bider_table_static', 'sit_table', 0]]) {
  test(`${id}: its bounding box matches ${clip} at t=${t} within 3 cm`, async () => {
    const g = await openViewer(server, 'enemy_bider');
    let a, b;
    try { await setClip(g, clip, t); await g.step(1, true); a = await assetBox(g); } finally { await g.close(); }
    const h = await openViewer(server, id);
    try { await h.step(1, true); b = await assetBox(h); } finally { await h.close(); }
    // bider_table_static carries the SMALL live knot the order asks for (radius 0.075 m against 0.123): its top is lower by design
    const d = [...a.min.map((x, i) => Math.abs(x - b.min[i])), ...a.max.map((x, i) => (id === 'bider_table_static' && i === 1 ? 0 : Math.abs(x - b.max[i])))];
    if (id === 'bider_table_static') console.log(`  top: skinned ${a.max[1].toFixed(3)}, static ${b.max[1].toFixed(3)} (the small knot); not compared`);
    console.log(`  skinned ${a.min.map((x) => x.toFixed(3))} .. ${a.max.map((x) => x.toFixed(3))}; static ${b.min.map((x) => x.toFixed(3))} .. ${b.max.map((x) => x.toFixed(3))}; worst ${(Math.max(...d) * 100).toFixed(1)} cm`);
    assert.ok(Math.max(...d) <= 0.03, `worst ${Math.max(...d).toFixed(3)} m`);
  });
}

test('sit_table: both hands at y 0.76-0.82 m; kneel_to_stand frame 12: hand_socket_r at y 0.50 +- 0.05 m', async () => {
  const g = await openViewer(server, 'enemy_bider');
  try {
    for (const t of [0, 0.25, 0.5, 0.75]) {
      await setClip(g, 'sit_table', t); const p = await pose(g, ['hand_l', 'hand_r']);
      for (const n of ['hand_l', 'hand_r']) assert.ok(p[n].pos[1] >= 0.76 && p[n].pos[1] <= 0.82, `sit_table t=${t} ${n} y ${p[n].pos[1]}`);
    }
    await setClip(g, 'kneel_to_stand', 12 / frames('kneel_to_stand')); const s = await pose(g, ['hand_socket_r']);
    const up = rot(s.hand_socket_r.quat, [0, 1, 0]);
    console.log(`  hand_socket_r on frame 12: (${s.hand_socket_r.pos.map((x) => x.toFixed(3))}), its up axis (${up.map((x) => x.toFixed(2))})`);
    assert.ok(Math.abs(s.hand_socket_r.pos[1] - 0.5) <= 0.05, `y ${s.hand_socket_r.pos[1]}`);
    assert.ok(up[1] > 0.9, 'the cup stands upright when it is let go');
  } finally { await g.close(); }
});

test('die_back: no face-up frame in its last 10 frames (the hood front points away from +Z or down)', async () => {
  const g = await openViewer(server, 'enemy_bider');
  try {
    await setClip(g, '', 0); const rest = (await pose(g, ['head'])).head.quat;
    const front0 = [0, -0.33, 0.95];                           // the hood's front in the rest pose (19 degrees below level), game space
    const n = frames('die_back'); const out = [];
    for (let f = n - 10; f <= n; f++) {
      await setClip(g, 'die_back', f / n); const q = (await pose(g, ['head'])).head.quat;
      const fr = rot(mul(q, inv(rest)), front0);
      out.push(`f${f} (${fr.map((x) => x.toFixed(2))})`);
      assert.ok(fr[2] <= 0.05 || fr[1] < -0.3, `frame ${f}: the hood front ${fr} faces the camera and is not turned down`);
      assert.ok(fr[1] < 0.2, `frame ${f}: face-up (${fr})`);
    }
    console.log('  ' + out.join(' '));
  } finally { await g.close(); }
});

// prop_chair (art-props, final): seat top 0.45 m, footprint x -0.226..0.228, z -0.255..0.219, back posts and slats at z -0.255..-0.22 up to 0.95 m.
// bider_table_static shares the chair's origin (the floor under the seat) and must not pass through its seat or its back.
test('bider_table_static sits ON prop_chair: nothing inside the seat board, nothing behind the backrest plane', async () => {
  const io = new NodeIO();
  const box = async (file) => {
    const doc = await io.read(path.join(ROOT, file)); const out = [];
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) out.push(a.getElement(i, [])); }
    return out;
  };
  const chair = await box('blender/export/props/prop_chair.glb');
  const cmax = [0, 1, 2].map((k) => Math.max(...chair.map((v) => v[k]))), cmin = [0, 1, 2].map((k) => Math.min(...chair.map((v) => v[k])));
  console.log(`  chair ${cmin.map((x) => x.toFixed(3))} .. ${cmax.map((x) => x.toFixed(3))}`);
  assert.ok(Math.abs(cmax[1] - 0.95) < 0.05 && cmin[2] < -0.22, 'the chair this test was written against (0.95 m tall, its back at -z) has changed: re-measure');
  const v = await box('blender/export/enemies/bider_table_static.glb');
  const inSeat = v.filter(([x, y, z]) => x > cmin[0] && x < cmax[0] && z > cmin[2] && z < cmax[2] - 0.004 && y > 0.25 && y < 0.449);
  const behind = v.filter(([x, y, z]) => x > cmin[0] && x < cmax[0] && z < -0.215 && y < cmax[1]);
  const wings = v.filter(([x, y, z]) => z < cmin[2] && y < 0.45);
  console.log(`  ${v.length} vertices: ${inSeat.length} inside the seat board, ${behind.length} behind the backrest plane, ${wings.length} behind the chair below the seat; rearmost z ${Math.min(...v.map((p) => p[2])).toFixed(3)}`);
  assert.equal(inSeat.length, 0, `inside the seat: ${JSON.stringify(inSeat.slice(0, 3))}`);
  assert.equal(behind.length, 0, `behind the backrest: ${JSON.stringify(behind.slice(0, 3))}`);
  assert.equal(wings.length, 0);
});
