// art-enemies-bider evidence (not a test): node tests/art_enemies/bider_evidence.mjs
// Writes into shots/art-enemies-bider/: bider_at_30m.png (the L1 mood on sand, 30 m), file_of_six.png (six instances,
// four coat tints and +-5 % hood scale on `head`, as code-enemies varies them), bider_table_row.png (nine
// bider_table_static at the tally table's seat spacing of 1.8 m, on the real prop_chair / prop_tally_table files),
// bider_game_close.png (a close look through the real loader with the emissive added as code-render will),
// and the 8-frame strips of sit_down and die_back (enemy_bider__sit_down_8.png, enemy_bider__die_back_8.png).
import { spawnSync } from 'node:child_process';
import { openViewer, glow, frame, setClip, sheet, startServer, sharp, path, fs, SHOTS, ROOT, frames } from './bider_lib.mjs';

fs.mkdirSync(SHOTS, { recursive: true });
const server = await startServer();
const out = (n) => path.join(SHOTS, n);
try {
  // ---- 30 m under L1
  {
    const g = await openViewer(server, 'enemy_bider', { dist: 30, pitch: 3, yaw: 0, mood: 'L1', ground: 'sand' });
    try { await glow(g); await setClip(g, 'run', 0.3); fs.writeFileSync(out('bider_at_30m.png'), await frame(g)); } finally { await g.close(); }
    // and a 4x crop of the figure, nearest-neighbour, to see the pixels it really gets
    const m = await sharp(out('bider_at_30m.png')).metadata();
    await sharp(out('bider_at_30m.png')).extract({ left: Math.round(m.width / 2 - 40), top: Math.round(m.height / 2 - 40), width: 80, height: 80 })
      .resize(320, 320, { kernel: 'nearest' }).toFile(out('bider_at_30m_zoom.png'));
  }
  // ---- a close look in the real loader, glowing
  {
    const g = await openViewer(server, 'enemy_bider', { dist: 2.4, pitch: 8, yaw: 25, mood: 'L1', ground: 'sand' });
    try { await glow(g); await setClip(g, 'idle_stoop', 0); fs.writeFileSync(out('bider_game_close.png'), await frame(g)); } finally { await g.close(); }
  }
  // ---- the file of six
  {
    const g = await openViewer(server, 'enemy_bider', { dist: 5.2, pitch: 9, yaw: 62, mood: 'L1', ground: 'sand' });
    try {
      await g.page.evaluate(async () => {
        const ctx = window.__dbg.ext.core.ctx();
        const holder = ctx.scene.dynamic.getObjectByName('viewer_holder');
        const tints = [[1, 1, 1], [0.86, 0.80, 0.74], [1.08, 1.02, 0.92], [0.78, 0.80, 0.84]];
        const scales = [1.0, 1.05, 0.96, 1.03, 0.95, 1.01];
        const phases = [0.0, 0.31, 0.62, 0.15, 0.47, 0.78];
        for (let i = 0; i < 6; i++) {
          const inst = i === 0 ? null : ctx.assets.instantiate('enemy_bider');
          const root = inst ? inst.root : holder.children.find((c) => c.userData && c.userData.asset) || holder.children[0];
          if (inst) { holder.add(root); root.position.set(0.35 * (i % 2) - 0.1, 0, -1.6 * i); }
          root.traverse((o) => {
            if (o.isMesh) { o.material = o.material.clone(); const t = tints[i % 4]; if (o.material.color) o.material.color.setRGB(t[0], t[1], t[2]); }
          });
          root.getObjectByName('head').scale.setScalar(scales[i]);
          if (inst) { const a = inst.action('run'); a.play(); inst.mixer.setTime(phases[i] * 0.62); root.userData.ksInst = inst; }
        }
      });
      await setClip(g, 'run', 0.0); await glow(g);
      fs.writeFileSync(out('file_of_six.png'), await frame(g));
    } finally { await g.close(); }
  }
  // ---- the table row: nine statics on the real chair and table files, 1.8 m apart, both sides
  {
    const g = await openViewer(server, 'bider_table_static', { dist: 9.0, pitch: 22, yaw: 55, mood: 'L2' });
    try {
      const note = await g.page.evaluate(async () => {
        const ctx = window.__dbg.ext.core.ctx();
        await ctx.assets.activateLoose(['prop_chair', 'prop_tally_table']);
        const holder = ctx.scene.dynamic.getObjectByName('viewer_holder');
        const first = holder.children[0];
        // the table runs along X here; seats at x = -7.2 .. 7.2 every 1.8 m, on both long sides
        const table = ctx.assets.instantiate('prop_tally_table').root; table.rotation.y = Math.PI / 2; holder.add(table);
        let n = 0;
        for (let k = 0; k < 9; k++) {
          const side = k % 2 ? 1 : -1, x = -7.2 + 1.8 * k;
          const seat = new first.position.constructor(x, 0, side * 0.86);
          const chair = ctx.assets.instantiate('prop_chair').root; chair.position.copy(seat); chair.rotation.y = side > 0 ? 0 : Math.PI; holder.add(chair);
          const b = k === 0 ? first : ctx.assets.instantiate('bider_table_static').root;
          if (k) holder.add(b);
          b.position.copy(seat); b.rotation.y = side > 0 ? Math.PI : 0;
          b.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); const j = 0.9 + 0.2 * ((k * 37) % 10) / 10; if (o.material.color) o.material.color.setRGB(j, j * 0.97, j * 0.93); } });
          n++;
        }
        return `${n} statics; chair ${ctx.assets.get('prop_chair').isPlaceholder ? 'placeholder' : 'final'}, table ${ctx.assets.get('prop_tally_table').isPlaceholder ? 'placeholder' : 'final'}`;
      });
      console.log('table row: ' + note);
      await glow(g); fs.writeFileSync(out('bider_table_row.png'), await frame(g));
    } finally { await g.close(); }
  }
  // ---- the table static on the real chair, close (1.7 m): from the side, behind, above and below seat level
  {
    const bufs = [];
    for (const [yaw, pitch] of [[120, 10], [180, 15], [240, 10], [150, 40], [90, 0], [200, -8]]) {
      const g = await openViewer(server, 'bider_table_static', { yaw, pitch, dist: 1.7 });
      try {
        await g.page.evaluate(async () => {
          const ctx = window.__dbg.ext.core.ctx();
          await ctx.assets.activateLoose(['prop_chair']);
          const holder = ctx.scene.dynamic.getObjectByName('viewer_holder');
          const chair = ctx.assets.instantiate('prop_chair').root; chair.position.copy(holder.children[0].position); holder.add(chair);
        });
        await glow(g); bufs.push(await frame(g));
      } finally { await g.close(); }
    }
    await sheet(bufs, out('bider_table_chair_close.png'), { cols: 3 });
  }
  // ---- the two bodies that stay in the world, close, under L1 on sand
  for (const [id, views] of [['bider_seated_static', [[20, 25, 2.2], [150, 25, 2.2], [90, 20, 2.2], [250, 30, 2.2], [180, 12, 2.0], [0, 12, 1.6]]], ['bider_felled_static', [[20, 30, 3.0], [110, 30, 3.0], [200, 30, 3.0], [290, 30, 3.0], [60, 15, 2.2], [0, 80, 3.0]]]]) {
    const bufs = [];
    for (const [yaw, pitch, dist] of views) {
      const g = await openViewer(server, id, { yaw, pitch, dist, mood: 'L1', ground: 'sand' });
      try { await glow(g); bufs.push(await frame(g)); } finally { await g.close(); }
    }
    await sheet(bufs, out(id + '_close.png'), { cols: 3 });
  }
} finally { await server.close(); }
// the ordered file name of the hood close-up (front, three-quarter, top): the Cycles sheet made by
//   node tools/preview-asset.mjs enemy_bider --cycles --name bider_hood_closeup --bounds=... (see docs/requests/art-enemies-bider.md)
if (fs.existsSync(out('bider_hood_closeup_cycles.png'))) fs.copyFileSync(out('bider_hood_closeup_cycles.png'), out('bider_hood_closeup.png'));

// ---- 8-frame strips of the two clips the order asks for at 8 frames
for (const [clip, az] of [['sit_down', 70], ['die_back', 70]]) {
  const n = frames(clip); const fr = Array.from({ length: 8 }, (_, i) => Math.round(i * n / 7)).join(',');
  const r = spawnSync(path.join(ROOT, 'tools/blender.sh'), ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(ROOT, 'blender/tools/preview.py'), '--',
    path.join(ROOT, 'blender/export/enemies/enemy_bider.glb'), out(`enemy_bider__${clip}_8.png`), '--clip', clip, '--frames', fr, '--cols', '8', '--size', '360', `--angles=${az}:10`], { encoding: 'utf8' });
  console.log(`${clip}: frames ${fr} -> ${r.status === 0 ? 'ok' : 'FAILED ' + r.stderr.slice(-300)}`);
}
console.log('written to ' + path.relative(ROOT, SHOTS));
