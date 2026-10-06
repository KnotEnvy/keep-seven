// Shared helpers of tests/art_weapons (art-weapons: the revolver, the ammunition family, tx_gun, tx_matcap_steel).
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, loadManifest, gltfIO, worldMatrix, mat4Point } from '../../tools/pipeline-lib.mjs';
import { openGame } from '../harness.mjs';

export { ROOT };
export const PIECE = 'art-weapons';
export const M = loadManifest();
export const IDS = ['weapon_revolver', 'pk_rounds_6', 'pk_rounds_12', 'prop_cartridge_lead', 'prop_cartridge_line', 'prop_cartridge_kept'];
export const REV = M.assets.weapon_revolver;
export const CLIPS = REV.animations.map((a) => a.name);
export const FPS = 30;
/** authored whole frames of a clip (the nearest whole frame to the manifest's seconds) */
export const frames = (clip) => { const x = REV.animations.find((a) => a.name === clip).seconds * FPS; return Math.abs(x - Math.floor(x) - 0.5) < 1e-6 ? Math.floor(x) : Math.round(x); };   // 0.15 s = 4 frames (blender/lib/anim.frames)
export const SHOTS = path.join(ROOT, 'shots', PIECE);

export function node(cmd, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, cmd), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** the revolver in the viewer, first person (the viewer's 52-degree view-model pass; the game's own pass is 40 degrees since polish round 3), no panel */
export const openViewer = (server, viewport = { width: 960, height: 540 }, query = {}) =>
  openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, viewport, query: { asset: 'weapon_revolver', shot: 1, ...query } });

/** angle in degrees between two unit quaternions [x, y, z, w] */
export const quatAngle = (a, b) => { const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])); return 2 * Math.acos(d) * 180 / Math.PI; };
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** rotate v by the unit quaternion q [x, y, z, w] */
export function rotate(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

/** SHIPPED GLB -> { nodes: { name: { pos, quat } }, meshes: [{ node, verts: [[x, y, z]], joints: [name of the heaviest joint per vertex | null], colors }] } in asset space, rest pose */
export async function loadGlb(id) {
  const io = await gltfIO();
  const doc = await io.read(M.assets[id]._pub);
  const nodes = {}, meshes = [];
  for (const n of doc.getRoot().listNodes()) {
    const m = worldMatrix(n);
    nodes[n.getName()] = { pos: [m[12], m[13], m[14]], m };
    const mesh = n.getMesh();
    if (!mesh) continue;
    const skin = n.getSkin(), names = skin ? skin.listJoints().map((j) => j.getName()) : null;
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), j0 = p.getAttribute('JOINTS_0'), w0 = p.getAttribute('WEIGHTS_0');
      const verts = [], joints = [], e = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, e);
        verts.push(skin ? [e[0], e[1], e[2]] : mat4Point(m, e));
        if (skin) { j0.getElement(i, j); w0.getElement(i, w); let k = 0; for (let q = 1; q < 4; q++) if (w[q] > w[k]) k = q; joints.push(names[j[k]]); } else joints.push(null);
      }
      const idx = p.getIndices();
      meshes.push({ node: n.getName(), verts, joints, tris: (idx ? idx.getCount() : verts.length) / 3 });
    }
  }
  return { nodes, meshes };
}
