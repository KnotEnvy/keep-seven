// Test page of tests/pipeline: shows any asset (manifest or fixture) through the REAL loader, src/core/assets.ts
// (GLTFLoader + meshopt, material names -> the core fallback resolver, lightmaps on uv1), without booting the game.
//   ?asset=<id>[&overlay=1][&yaw=35&pitch=20&dist=..][&tx=..&ty=..&tz=..][&clip=<name>&t=<0..1>]
// window.__dbg is the minimal subset the harness needs (ready, error, step, capture); window.__fx holds the probes.
import * as THREE from 'three';
import manifest from '../../design/assets.json';
import layout from '../../design/layout.json';
import { AssetStoreImpl } from '../../src/core/assets.ts';

const q = new URLSearchParams(location.search);
const dbg = { ready: false, error: null, step() { render(); return 0; }, capture() { render(); return canvas.toDataURL('image/png'); }, state() { return {}; } };
window.__dbg = dbg;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setSize(960, 540, false);
renderer.setClearColor(0x15171a);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 960 / 540, 0.05, 500);
function render() { renderer.render(scene, camera); }

async function main() {
  const M = structuredClone(manifest);
  // overlay=1: the fixtures' manifest; overlay=<path from the repository root>: that overlay manifest
  const ov = q.get('overlay');
  if (ov && ov !== '0') {
    const O = await (await fetch(ov === '1' ? '/tests/pipeline/fixtures/manifest.json' : '/' + ov)).json();
    const pub = O.meta.publicDir + '/';
    for (const kind of ['assets', 'textures']) for (const [id, e] of Object.entries(O[kind] ?? {})) { e.path = pub + e.path; M[kind][id] = e; }
  }
  const store = new AssetStoreImpl({ manifest: M, layout, events: { emit() {}, on() { return () => {}; } }, baseUrl: '/', allowSynthesis: false, test: true,
    spreadUploads: () => false, renderer: () => renderer });
  const id = q.get('asset');
  const def = M.assets[id];
  if (!def) throw new Error(`unknown asset '${id}'`);
  await store.activateLoose([...(def.lightmaps ?? []), ...(def.lightLayers ?? []), id]);
  const loaded = store.get(id);
  const inst = store.instantiate(id);
  scene.add(inst.root);
  inst.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inst.root), centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
  const yaw = (num('yaw', 35) * Math.PI) / 180, pitch = (num('pitch', 20) * Math.PI) / 180, dist = num('dist', size.length() * 0.95 + 0.4);
  const target = new THREE.Vector3(num('tx', centre.x), num('ty', centre.y), num('tz', centre.z));
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  if (q.get('clip') && inst.mixer) {
    const a = inst.action(q.get('clip')); a.reset().play(); a.paused = true;
    a.time = num('t', 0) * a.getClip().duration; inst.mixer.update(0);
  }
  let tris = 0, calls = 0;
  inst.root.traverse((o) => { if (o.isMesh) { calls++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  document.getElementById('info').textContent = `${id}${loaded.isPlaceholder ? ' [PLACEHOLDER]' : ''}   ${tris} tris / ${def.triBudget}   ${calls} draw calls / ${def.drawCalls}   (real loader: src/core/assets.ts)`;

  const nameOf = (o) => (typeof o.userData.name === 'string' && o.userData.name ? o.userData.name : o.name);
  window.__fx = {
    isPlaceholder: loaded.isPlaceholder,
    /** every mesh: name, material name, attribute names, userData */
    meshes() {
      const out = [];
      inst.root.traverse((o) => { if (o.isMesh) out.push({ name: nameOf(o), material: o.userData.materialName, skinned: !!o.isSkinnedMesh, attributes: Object.keys(o.geometry.attributes),
        userData: JSON.parse(JSON.stringify(o.userData)), lightMap: !!o.material.lightMap, lightMapName: o.material.lightMap ? o.material.lightMap.name : null }); });
      return out;
    },
    /** per-vertex colour (normalised floats), uv and uv1 of a mesh */
    vertices(meshName) {
      let m = null;
      inst.root.traverse((o) => { if (o.isMesh && nameOf(o) === meshName) m = o; });
      if (!m) return null;
      const g = m.geometry, c = g.attributes.color, u = g.attributes.uv, u1 = g.attributes.uv1, p = g.attributes.position, out = [];
      for (let i = 0; i < p.count; i++) out.push({ p: [p.getX(i), p.getY(i), p.getZ(i)], c: c ? [c.getX(i), c.getY(i), c.getZ(i)] : null, uv: u ? [u.getX(i), u.getY(i)] : null, uv1: u1 ? [u1.getX(i), u1.getY(i)] : null });
      return { count: p.count, colorType: c ? c.array.constructor.name : null, colorNormalized: c ? c.normalized : null, vertices: out };
    },
    /** the dressing empties of a zone as the runtime sees them: object name, userData (asset, node, wind), world position */
    dressing() {
      const out = [];
      inst.root.updateMatrixWorld(true);
      inst.root.traverse((o) => {
        if (!/^(inst|brk)_\d{3}$/.test(nameOf(o))) return;
        const v = o.getWorldPosition(new THREE.Vector3());
        out.push({ name: nameOf(o), userData: JSON.parse(JSON.stringify(o.userData)), pos: [v.x, v.y, v.z], rotY: o.rotation.y, isMesh: !!o.isMesh, children: o.children.length });
      });
      return out;
    },
    /** AssetInstance.node(name) -> world position, kind; throws on a missing node */
    node(name) {
      const o = inst.node(name); const v = o.getWorldPosition(new THREE.Vector3());
      return { pos: [v.x, v.y, v.z], isBone: !!o.isBone, isMesh: !!o.isMesh, type: o.type };
    },
    /** play a clip through AssetInstance.action() and report when it finishes */
    clip(name) {
      const a = inst.action(name); const authored = a.getClip().duration;
      a.reset().play();
      const dt = 1 / 240; let t = 0, finishedAt = null;
      const onFinish = () => { finishedAt = t + dt; };       // fires inside update(dt)
      inst.mixer.addEventListener('finished', onFinish);
      for (let i = 0; i < 2400 && finishedAt === null; i++) { inst.mixer.update(dt); t += dt; }
      inst.mixer.removeEventListener('finished', onFinish);
      return { authored, timeScale: a.timeScale, finishedAt, manifest: store.clipSeconds(id, name) };
    },
    pixel(x, y) {
      render();
      const gl = renderer.getContext(), b = new Uint8Array(4);
      gl.readPixels(x, renderer.domElement.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return [b[0], b[1], b[2]];
    },
    project(p) { const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera); return [Math.round((v.x + 1) / 2 * 960), Math.round((1 - v.y) / 2 * 540)]; },
  };
  render();
  dbg.ready = true;
}
main().catch((e) => { dbg.error = String(e && e.stack ? e.stack : e); console.error(dbg.error); });
