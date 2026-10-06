// The shared asset and zone viewer (foundation-core's for good).
//   ?asset=<id>   the asset through the real asset store on a neutral ground: manifest nodes as labelled axes, lamp sets
//                 cycling, clip buttons (manifest versus authored seconds), triangles and draw calls against the budget,
//                 the placeholder flag.   &yaw= &pitch= &dist=  the orbit camera
//                 &mood=<L0..L6, L5p>   the mood's fog, sky colour and a flat ambient + key tint (the stub renderer's
//                 "mood look": no key direction, no specular; the Cycles sheet still carries the real look)
//                 &ground=sand          a sand-coloured ground instead of stone
//                 &shot=1&clip=<name>&t=<0..1>   one deterministic frame for art tests (no cycling, no labels, the
//                 panel and the button bar hidden: the frame is the picture)
//                 &view=viewmodel       FIRST PERSON: the asset goes into ctx.scene.viewModel (camera space) and is drawn
//                 by the 52 degree view-model pass over the room, the world camera level at eye height; no orbit.
//                 It is the default for an asset whose manifest pivot is the camera (weapon_revolver); &view=orbit
//                 turns it off. Then __dbg.ext.viewer.project(node) -> { across, up, inFront } (screen fractions:
//                 across from the left, up from the bottom) and __dbg.ext.viewer.coverage() -> { coverage, minX,
//                 maxX, minY, maxY } (fraction of the frame the view-model covers and the box of its pixels)
//                 FOR ART TESTS (any asset page): __dbg.ext.viewer.pose(names?) -> per node or bone its position,
//                 quaternion and scale in ASSET space (and `local`, relative to its parent);
//                 setBone(name, { rot: [xDeg, yDeg, zDeg], scale }) turns / scales a code-driven bone on top of the
//                 clip's pose (applied after the mixer, every frame; null clears it);
//                 setClip(name, t01) holds a clip at a time without reloading the page.
//                 A &shot=1 frame without &dist= is fitted: the asset's bounding box fills 90 % of the frame.
//   ?zone=<id>    the zone GLB with its lightmaps, a walk camera on the real colliders, a visibility-cells toggle
//   no parameter  an index of every asset and zone
//   &overlay=<url> (dev / test) merges an overlay manifest ({ meta.publicDir, assets, textures }) over design/assets.json
//                 before anything loads, so assets that are not game assets (the pipeline fixtures:
//                 overlay=tests/pipeline/fixtures/manifest.json) are shown by the same store, materials and camera
import * as THREE from 'three';
import type { AssetDef, AssetInstance, CheckpointId, MoodId, ZoneId } from '../src/core/contracts.ts';
import { coreOf } from '../src/core/context.ts';
import { ROOM_ORIGIN, createSandbox } from '../src/core/sandbox.ts';
import type { Sandbox } from '../src/core/sandbox.ts';
import { DEG2RAD } from '../src/core/math.ts';

const panel = (): HTMLElement => document.getElementById('panel') as HTMLElement;
const num = (v: string | null, fallback: number): number => { const n = v === null ? NaN : Number.parseFloat(v); return Number.isFinite(n) ? n : fallback; };

function countGeometry(root: THREE.Object3D): { triangles: number; drawCalls: number; skinned: boolean } {
  let triangles = 0, drawCalls = 0, skinned = false;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name.startsWith('collider_')) return;        // collision meshes are never drawn
    drawCalls++;
    if ((m as unknown as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    const g = m.geometry;
    triangles += Math.floor((g.index ? g.index.count : g.getAttribute('position').count) / 3);
  });
  return { triangles, drawCalls, skinned };
}

/** `&shot=1`: the frame is the picture. The panel (still readable as text by a test), the button bar and the UI stub's log are not drawn. */
function hideChrome(): void {
  for (const id of ['panel', 'bar', 'ui']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
}

/** `?overlay=<url relative to the project root>` (dev / test): see Sandbox.loadOverlay. */
async function applyOverlay(sb: Sandbox): Promise<void> {
  const url = sb.params.get('overlay');
  if (url) await sb.loadOverlay(url);
}

async function viewAsset(sb: Sandbox): Promise<void> {
  const { ctx } = sb;
  const core = coreOf(ctx);
  const q = sb.params;
  await applyOverlay(sb);
  const id = q.get('asset') ?? '';
  const def: AssetDef | undefined = ctx.data.manifest.assets[id];
  if (!def) { panel().textContent = `unknown asset '${id}'`; throw new Error(`viewer: unknown asset '${id}'`); }
  const shot = q.get('shot') === '1';
  const ext = (ctx.debug as unknown as { ext: Record<string, Record<string, (...args: unknown[]) => unknown>> }).ext;
  const pivot = String((def as unknown as { pivot?: string }).pivot ?? '');
  const firstPerson = q.get('view') === 'viewmodel' || (q.get('view') !== 'orbit' && pivot.startsWith('camera'));
  if (shot) hideChrome();
  const ground = q.get('ground') === 'sand' ? 'sand' : 'stone';
  await sb.room([{ shape: 'box', pos: [0, -0.25, 0], size: [60, 0.5, 60], rotY: 0, surface: ground, role: 'floor' }], [0, 0, 8]);
  ctx.player.setControl(false, 'viewer');
  ext.player?.camera?.(false);
  const mood = q.get('mood');
  if (mood) {
    // the stub renderer's mood look; the room's ground takes the same tint (it is not an asset material)
    ext.render?.moodLook?.(true);
    ctx.render.setMood(mood as MoodId, 0);
    const tint = (ext.render?.moodTint?.() as number[] | undefined) ?? [1, 1, 1];
    const room = ctx.scene.dynamic.getObjectByName('sandbox_room');
    room?.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.MeshBasicMaterial).color.multiply(new THREE.Color(tint[0] ?? 1, tint[1] ?? 1, tint[2] ?? 1)); });
  }
  await sb.activate([id]);

  const loaded = ctx.assets.get(id);
  const inst: AssetInstance = ctx.assets.instantiate(id);
  const worldSpace = def.placeholder.anchor === 'world';
  const box = new THREE.Box3().setFromObject(inst.root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const holder = new THREE.Group();
  holder.name = 'viewer_holder';
  // stand it on the ground: assets authored in world coordinates are brought to the room by their bounding box
  if (worldSpace) holder.position.set(ROOM_ORIGIN[0] - centre.x, ROOM_ORIGIN[1] - box.min.y, ROOM_ORIGIN[2] - centre.z);
  else holder.position.set(ROOM_ORIGIN[0], ROOM_ORIGIN[1] + Math.max(0, -box.min.y), ROOM_ORIGIN[2]);
  holder.add(inst.root);
  if (firstPerson) {
    // camera space: straight into the view-model group, untransformed (the render system gives the group the camera's pose)
    holder.position.set(0, 0, 0);
    ctx.scene.viewModel.add(holder);
  } else ctx.scene.dynamic.add(holder);
  holder.updateMatrixWorld(true);
  const target = new THREE.Box3().setFromObject(inst.root).getCenter(new THREE.Vector3());
  const radius = Math.max(0.25, size.length() / 2);

  // manifest nodes as labelled axes
  const names = Array.from(new Set([...def.nodes, ...(def.bones ?? [])]));
  const labels: { el: HTMLElement; node: THREE.Object3D }[] = [];
  const missing: string[] = [];
  for (const name of names) {
    let node: THREE.Object3D;
    try { node = inst.node(name); } catch { missing.push(name); continue; }
    if (shot) continue;
    const axes = new THREE.AxesHelper(Math.min(0.3, Math.max(0.04, radius * 0.12)));
    (axes.material as THREE.Material).depthTest = false;
    axes.renderOrder = 10;
    node.add(axes);
    if (def.nodes.includes(name)) {
      const el = document.createElement('div');
      el.className = 'label3d'; el.textContent = name;
      document.body.appendChild(el);
      labels.push({ el, node });
    }
  }

  // clips: manifest seconds versus authored seconds
  const say = sb.readout('');
  let playing = '';
  const play = (name: string): void => {
    const mixer = inst.mixer;
    if (!mixer) return;
    withMixer(() => {
      mixer.stopAllAction();
      playing = name;
      if (name !== '') inst.action(name).reset().play();
    });
  };
  for (const a of def.animations) {
    const authored = loaded.clips.get(a.name)?.duration ?? 0;
    sb.button(`${a.name} ${a.seconds.toFixed(2)}s / ${authored.toFixed(2)}s${a.loop ? ' loop' : ''}`, () => play(playing === a.name ? '' : a.name), 'manifest seconds / authored seconds');
  }
  const lampSets = Object.entries(def.lampSets ?? {});
  let lampTick = 0;

  const counted = countGeometry(inst.root);
  const lines = [
    `${id}${loaded.isPlaceholder ? '   [PLACEHOLDER]' : '   [final]'}`,
    `owner ${def.owner}   priority ${def.priority}   bake ${def.bake}   placedBy ${def.placedBy}`,
    `triangles  ${counted.triangles} / budget ${def.triBudget}${counted.triangles > def.triBudget ? '   << OVER' : ''}`,
    `meshes     ${counted.drawCalls} in the file / draw-call budget ${def.drawCalls} per instance (variant nodes show one at a time)`,
    `skinned    file ${counted.skinned}   manifest ${def.skinned}`,
    `size       ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m   placeholder ${def.placeholder.size.join(' x ')} (${def.placeholder.anchor})`,
    `nodes ${def.nodes.length}   bones ${(def.bones ?? []).length}   clips ${def.animations.length}   lamp sets ${lampSets.map(([n, c]) => `${n}:${c}`).join(' ') || '-'}`,
  ];
  if (firstPerson) lines.push(`view       first person: 52 degree view-model pass, camera space (pivot: ${pivot || 'forced by &view=viewmodel'})`);
  if (mood) lines.push(`mood       ${mood} (stub mood look: fog + flat ambient / key tint)   ground ${ground}`);
  if (missing.length) lines.push(`MISSING in the file: ${missing.join(', ')}`);
  // what the fallback material really bound, and the meshes it could only draw unlit and flat
  const bound = new Set<string>(), unbaked: string[] = [];
  inst.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name.startsWith('collider_')) return;
    const mat = m.material as THREE.Material;
    const tex = typeof mat.userData.fallbackTexture === 'string' ? (mat.userData.fallbackTexture as string) : '';
    bound.add(tex ? `${mat.name}:${tex}` : mat.name);
    if (mat.name !== 'm_emis' && typeof m.userData.bake !== 'string') unbaked.push(m.name);
  });
  lines.push(`materials  ${Array.from(bound).join('  ')}${loaded.isPlaceholder ? '   (placeholder: no textures)' : ''}`);
  const baked = /VL|LM/.test(String(def.bake));
  if (baked && unbaked.length && !loaded.isPlaceholder) lines.push(`MISSING bake extra (manifest bake ${def.bake}; drawn flat, without baked light): ${unbaked.join(', ')}`);
  panel().textContent = lines.join('\n');

  // orbit camera
  let yaw = num(q.get('yaw'), 35) * DEG2RAD, pitch = num(q.get('pitch'), 18) * DEG2RAD, dist = num(q.get('dist'), radius * 1.8 + 0.35);
  const cam = ctx.scene.camera;
  // A shot without &dist= is FITTED: the distance at which the eight corners of the asset's bounding box just fit
  // inside SHOT_FILL of the frame, for this yaw, pitch and aspect. (It was radius x 2.6 + 0.6, which left a prop at a
  // quarter of the frame's width: too small to judge trim mapping or decals at 960 x 540.)
  const SHOT_FILL = 0.9;
  const fitBox = new THREE.Box3().setFromObject(inst.root);
  const fitShot = (): { distance: number; position: THREE.Vector3; dir: THREE.Vector3 } => {
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3().crossVectors(dir, right);
    const tanV = Math.tan(cam.fov * DEG2RAD / 2) * SHOT_FILL, tanH = tanV * cam.aspect;
    // the corners in the camera's basis: across, up, and toward the camera
    const xs: number[] = [], ys: number[] = [], zs: number[] = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? fitBox.max.x : fitBox.min.x, i & 2 ? fitBox.max.y : fitBox.min.y, i & 4 ? fitBox.max.z : fitBox.min.z).sub(target);
      xs.push(v.dot(right)); ys.push(v.dot(up)); zs.push(v.dot(dir));
    }
    // at depth d the camera may stand anywhere across [lo, hi] and still hold every corner: the smallest d with room
    // both across and up is the fit, and the middle of each interval centres the picture
    const room = (c: number[], tan: number, d: number): [number, number] => {
      let lo = -Infinity, hi = Infinity;
      for (let i = 0; i < 8; i++) { const w = (d - (zs[i] as number)) * tan; lo = Math.max(lo, (c[i] as number) - w); hi = Math.min(hi, (c[i] as number) + w); }
      return [lo, hi];
    };
    let near = Math.max(...zs) + 0.1, far = near + 1;
    const fits = (d: number): boolean => { const a = room(xs, tanH, d), b2 = room(ys, tanV, d); return a[0] <= a[1] && b2[0] <= b2[1]; };
    while (!fits(far) && far < 1e4) far *= 2;
    if (!fits(near)) for (let i = 0; i < 48; i++) { const mid = (near + far) / 2; if (fits(mid)) far = mid; else near = mid; }
    else far = near;
    const a = room(xs, tanH, far), b2 = room(ys, tanV, far);
    const position = new THREE.Vector3().copy(target).addScaledVector(right, (a[0] + a[1]) / 2).addScaledVector(up, (b2[0] + b2[1]) / 2).addScaledVector(dir, far);
    return { distance: far, position, dir };
  };

  // ---- poses for art tests -----------------------------------------------------------------------------------------
  const findNode = (name: string): THREE.Object3D => {
    try { return inst.node(name); } catch { /* not a manifest name: any object of the file */ }
    const o = inst.root.getObjectByName(name);
    if (!o) throw new Error(`ext.viewer: '${id}' has no node or bone '${name}'`);
    return o;
  };
  interface Override { node: THREE.Object3D; rot: THREE.Quaternion | null; scale: THREE.Vector3 | null; baseQ: THREE.Quaternion; baseS: THREE.Vector3 }
  const overrides = new Map<string, Override>();
  // An override sits ON TOP of whatever the mixer (or nothing) left in the bone. Around everything the mixer does
  // (an update, a clip started or stopped: it also remembers a bone's value as its "original" when it binds) the
  // overrides are taken off and put back, so a turn is never added twice and never leaks into the rest pose.
  const liftOverrides = (): void => { for (const o of overrides.values()) { o.node.quaternion.copy(o.baseQ); o.node.scale.copy(o.baseS); } };
  const applyOverrides = (): void => {
    for (const o of overrides.values()) {
      o.baseQ.copy(o.node.quaternion); o.baseS.copy(o.node.scale);
      if (o.rot) o.node.quaternion.multiply(o.rot);
      if (o.scale) o.node.scale.copy(o.scale);
    }
  };
  const withMixer = (fn: () => void): void => { liftOverrides(); fn(); applyOverrides(); };
  const arr3 = (v: THREE.Vector3): number[] => [v.x, v.y, v.z];
  const arr4 = (v: THREE.Quaternion): number[] => [v.x, v.y, v.z, v.w];
  const poseOf = (names?: string[]): Record<string, unknown> => {
    holder.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(inst.root.matrixWorld).invert();
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
    const out: Record<string, unknown> = {};
    for (const name of names ?? Array.from(new Set([...def.nodes, ...(def.bones ?? [])]))) {
      const node = findNode(name);
      m.multiplyMatrices(inverse, node.matrixWorld).decompose(pos, quat, scale);
      out[name] = { pos: arr3(pos), quat: arr4(quat), scale: arr3(scale), local: { pos: arr3(node.position), quat: arr4(node.quaternion), scale: arr3(node.scale) }, isBone: (node as THREE.Bone).isBone === true };
    }
    return out;
  };
  const setBone = (name: string, to: { rot?: number[]; scale?: number | number[] } | null): unknown => {
    const node = findNode(name);
    const rot = to?.rot, sc = to?.scale;
    if (rot !== undefined && (rot.length !== 3 || !rot.every((x) => Number.isFinite(x)))) throw new Error(`ext.viewer.setBone: rot is [xDeg, yDeg, zDeg] (got ${JSON.stringify(rot)})`);
    if (sc !== undefined && !(typeof sc === 'number' ? Number.isFinite(sc) : sc.length === 3 && sc.every((x) => Number.isFinite(x)))) throw new Error(`ext.viewer.setBone: scale is a number or [x, y, z] (got ${JSON.stringify(sc)})`);
    liftOverrides();
    let o = overrides.get(name);
    if (!o) {
      o = { node, rot: null, scale: null, baseQ: node.quaternion.clone(), baseS: node.scale.clone() };
      overrides.set(name, o);
    }
    o.rot = rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler((rot[0] as number) * DEG2RAD, (rot[1] as number) * DEG2RAD, (rot[2] as number) * DEG2RAD, 'XYZ')) : null;
    o.scale = sc === undefined ? null : typeof sc === 'number' ? new THREE.Vector3(sc, sc, sc) : new THREE.Vector3(sc[0], sc[1], sc[2]);
    if (!o.rot && !o.scale) overrides.delete(name);
    applyOverrides();
    return poseOf([name])[name];
  };
  const project = (node: THREE.Object3D): { across: number; up: number; inFront: boolean } => {
    const p = node.getWorldPosition(new THREE.Vector3());
    if (firstPerson) {
      const r = ext.render?.viewModelProject?.(p.x, p.y, p.z) as { x: number; y: number; inFront: boolean } | undefined;
      return r ? { across: r.x, up: r.y, inFront: r.inFront } : { across: 0, up: 0, inFront: false };
    }
    p.project(cam);
    return { across: (p.x + 1) / 2, up: (p.y + 1) / 2, inFront: p.z > -1 && p.z < 1 };
  };
  ctx.debug.register('viewer', {
    /** where a manifest node (or bone) of the shown asset is on screen: fractions across from the left and up from the bottom */
    project: ((name: string) => { cam.updateMatrixWorld(true); ctx.scene.viewModel.updateMatrixWorld(true); return project(inst.node(name)); }) as (...args: never[]) => unknown,
    /** first person only: the share of the frame the view-model covers and the box of its pixels (ext.render.viewModelCoverage) */
    coverage: (() => {
      if (!firstPerson) throw new Error('ext.viewer.coverage: the asset is not shown in first person (add &view=viewmodel)');
      return ext.render?.viewModelCoverage?.();
    }) as (...args: never[]) => unknown,
    firstPerson: (() => firstPerson) as (...args: never[]) => unknown,
    /**
     * pose(names?) -> { <name>: { pos: [x, y, z], quat: [x, y, z, w], scale: [x, y, z], local: { pos, quat, scale }, isBone } }
     * for the given nodes / bones (default: every manifest node and bone; any object name of the file is accepted).
     * `pos`, `quat`, `scale` are in ASSET space (relative to the asset's root: game metres, +Y up, as the manifest's
     * `nodePos`), with the clip pose of `&clip=&t=` / setClip and every setBone override applied; `local` is relative
     * to the node's parent.
     */
    pose: ((names?: string[]) => poseOf(names)) as (...args: never[]) => unknown,
    /**
     * setBone(name, { rot: [xDeg, yDeg, zDeg], scale: s | [x, y, z] }) -> the bone's pose(). For bones that CODE drives
     * (a vent lid at +80 degrees, a hidden part at scale 0). `rot` is an XYZ Euler turn in the bone's own frame, applied
     * ON TOP of the pose the clip gives it (or of its rest pose), after the mixer, on every frame until changed;
     * `scale` replaces the bone's scale. `null` (or {}) clears the override.
     */
    setBone: setBone as (...args: never[]) => unknown,
    /** setClip(name, t01) -> { clip, time, seconds }: every action stopped, this clip held at t01 x its length ('' = the rest pose) */
    setClip: ((name: string, t01 = 0) => {
      if (!inst.mixer) { if (name === '') return { clip: '', time: 0, seconds: 0 }; throw new Error(`ext.viewer.setClip: '${id}' has no clips`); }
      const mixer = inst.mixer;
      let time = 0, seconds = 0;
      withMixer(() => {
        mixer.stopAllAction();
        playing = '';
        if (name !== '') {
          const action = inst.action(name);
          action.reset().play();
          action.paused = true;
          seconds = action.getClip().duration;
          time = Math.min(1, Math.max(0, t01)) * seconds;
          action.time = time;
        }
        mixer.update(0);
      });
      return { clip: name, time, seconds };
    }) as (...args: never[]) => unknown,
    /**
     * framing() -> { distance, fitted, width, height }: the camera's depth from the asset's centre along the view
     * direction, the depth a fitted shot uses, and
     * the share of the frame's width and height that the asset's bounding box spans as the camera stands now (after a
     * frame was drawn). A &shot=1 frame without &dist= has the larger of the two at 0.9.
     */
    framing: (() => {
      cam.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? fitBox.max.x : fitBox.min.x, i & 2 ? fitBox.max.y : fitBox.min.y, i & 4 ? fitBox.max.z : fitBox.min.z).project(cam);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      const fit = fitShot();
      return { distance: v.copy(cam.position).sub(target).dot(fit.dir), fitted: fit.distance, width: (maxX - minX) / 2, height: (maxY - minY) / 2 };
    }) as (...args: never[]) => unknown,
  });
  if (firstPerson) {
    cam.clearViewOffset();
    cam.position.set(ROOM_ORIGIN[0], ROOM_ORIGIN[1] + 1.65, ROOM_ORIGIN[2] + 8);
    cam.rotation.set(num(q.get('pitch'), 0) * DEG2RAD, num(q.get('yaw'), 0) * DEG2RAD, 0, 'YXZ');
    cam.updateMatrixWorld(true);
  }
  if (!ctx.flags.test && !firstPerson) {
    const canvas = core.canvas;
    let drag = false;
    canvas.addEventListener('mousedown', () => { drag = true; });
    window.addEventListener('mouseup', () => { drag = false; });
    window.addEventListener('mousemove', (e) => { if (drag) { yaw -= e.movementX * 0.006; pitch = Math.min(1.5, Math.max(-1.5, pitch + e.movementY * 0.006)); } });
    canvas.addEventListener('wheel', (e) => { dist = Math.max(0.2, dist * (e.deltaY > 0 ? 1.1 : 0.9)); e.preventDefault(); }, { passive: false });
  }
  if (shot) {
    const clip = q.get('clip');
    if (clip && inst.mixer) {
      const action = inst.action(clip);
      action.reset().play();
      action.paused = true;
      action.time = Math.min(1, Math.max(0, num(q.get('t'), 0))) * action.getClip().duration;
      inst.mixer.update(0);
    }
  }
  // the asset is framed in the part of the page the panel and the button bar leave free (not in a shot: the canvas
  // alone is the picture there)
  const explicitDist = q.get('dist') !== null;
  let fit = 1, framed = '';
  const frame = (): void => {
    const w = core.canvas.clientWidth, h = core.canvas.clientHeight;
    const pr = panel().getBoundingClientRect(), br = (document.getElementById('bar') as HTMLElement).getBoundingClientRect();
    const top = pr.height > 0 ? pr.bottom : 0, bottom = br.height > 0 ? br.top : h;
    const key = `${w}x${h}:${top}:${bottom}`;
    if (key === framed || w === 0 || h === 0) return;
    framed = key;
    const free = Math.max(80, bottom - top);
    cam.setViewOffset(w, h, 0, Math.round(h / 2 - (top + free / 2)), w, h);
    fit = h / free;
  };
  sb.onFrame((frameDt) => {
    if (!firstPerson) {
      if (!shot) frame();
      if (shot && !explicitDist) {
        const f = fitShot();                                   // fitted and centred on the bounding box as seen from here
        cam.position.copy(f.position);
        cam.lookAt(f.position.clone().sub(f.dir));
      } else {
        const d = explicitDist ? dist : dist * fit;
        cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(yaw) * Math.cos(pitch) * d);
        cam.lookAt(target);
      }
      cam.updateMatrixWorld(true);
    }
    if (shot) return;
    if (inst.mixer && playing !== '') { const mixer = inst.mixer; withMixer(() => mixer.update(frameDt)); }
    if (lampSets.length && (lampTick++ % 30) === 0) {
      const k = Math.floor(lampTick / 30);
      for (const [name, count] of lampSets) ctx.render.lamps.setCount(inst.node(name), k % (count + 1));
      say(`lamps ${lampSets.map(([name, count]) => `${name} ${k % (count + 1)}/${count}`).join('  ')}${playing ? '   clip ' + playing : ''}`);
    }
    const w = core.canvas.clientWidth, h = core.canvas.clientHeight;
    for (const l of labels) {
      const at = project(l.node);
      l.el.style.display = at.inFront ? 'block' : 'none';
      if (at.inFront) { l.el.style.left = `${at.across * w}px`; l.el.style.top = `${(1 - at.up) * h}px`; }
    }
  });
}

async function viewZone(sb: Sandbox): Promise<void> {
  const { ctx } = sb;
  const q = sb.params;
  const zone = (q.get('zone') ?? '') as ZoneId;
  const info = ctx.data.manifest.zones[zone];
  if (!info) { panel().textContent = `unknown zone '${zone}'`; throw new Error(`viewer: unknown zone '${zone}'`); }
  const cp = ctx.data.markersOfType('checkpoint').find((m) => m.zone === zone);
  await sb.start((cp ? cp.id : 'cp_lip_start') as CheckpointId);
  ctx.player.setGodMode(true);
  const ext = (ctx.debug as unknown as { ext: Record<string, Record<string, (on: boolean) => void>> }).ext;
  if (q.get('shot') === '1') hideChrome();
  let cells = q.get('cells') !== '0';
  const apply = (): void => { ext.world?.showAll?.(!cells); };
  const button = sb.button('', () => { cells = !cells; label(); apply(); }, 'visibility cells: on = what the player\'s cell shows; off = every unit of the resident set');
  const label = (): void => { button.textContent = cells ? 'cells: on' : 'cells: off (everything)'; };
  label(); apply();
  let fly = false;
  sb.button('fly', () => { fly = !fly; (ext.player?.fly as ((on: boolean) => void) | undefined)?.(fly); });
  const env = ctx.assets.get(info.env);
  const counted = countGeometry(env.scene);
  const say = (): void => {
    const p = ctx.perf.last;
    panel().textContent = [
      `${zone}   ${info.env}${env.isPlaceholder ? '   [PLACEHOLDER]' : '   [final]'}`,
      `zone GLB   ${counted.triangles} tris / budget ${env.def.triBudget}   ${counted.drawCalls} calls / budget ${env.def.drawCalls}`,
      `lightmaps  ${(env.def.lightmaps ?? []).join(', ') || '-'}   layers ${(env.def.lightLayers ?? []).join(', ') || '-'}`,
      `frame      ${p.drawCalls} calls / ${info.drawCalls.typical}-${info.drawCalls.worst}   ${p.triangles} tris / ${info.triangles}`,
      `cell       ${ctx.world.cell}   chunks ${info.chunks.join(' ')}`,
      `click the view to walk (WASD, mouse)   F3: perf overlay`,
    ].join('\n');
  };
  // the hook runs BEFORE the frame is drawn and counted: write the line once the frame's counters are in (a
  // microtask), every frame under ?test=1 (a stepped page draws few frames), every fifth otherwise
  let n = 0;
  sb.onFrame(() => { if (ctx.flags.test || (n++ % 5) === 0) queueMicrotask(say); });
  say();
}

/**
 * `__dbg.ext.viewer`: load one asset through the real store and hold it to its manifest entry. Returns the problems
 * (an empty list is a pass): node names, clip names and lengths, triangles and draw calls against the budget.
 */
function registerChecks(sb: Sandbox): void {
  const { ctx } = sb;
  const check = async (id: string): Promise<string[]> => {
    const def = ctx.data.manifest.assets[id];
    if (!def) return [`unknown asset`];
    const problems: string[] = [];
    await sb.activate([id]);
    const loaded = ctx.assets.get(id);
    const inst = ctx.assets.instantiate(id);
    for (const name of new Set([...def.nodes, ...(def.bones ?? [])])) {
      try { inst.node(name); } catch { problems.push(`node ${name} does not resolve`); }
    }
    try { inst.node('no_such_node_in_any_manifest'); problems.push('node() accepted a name outside the manifest'); } catch { /* expected */ }
    for (const a of def.animations) {
      try {
        const action = inst.action(a.name);
        const seconds = action.getClip().duration / action.timeScale;
        if (Math.abs(seconds - a.seconds) > 1e-6) problems.push(`clip ${a.name} lasts ${seconds} s, the manifest says ${a.seconds}`);
        if ((action.loop === THREE.LoopRepeat) !== a.loop) problems.push(`clip ${a.name} loop flag`);
        if (ctx.assets.clipSeconds(id, a.name) !== a.seconds) problems.push(`clipSeconds(${a.name})`);
      } catch { problems.push(`clip ${a.name} is missing`); }
    }
    if ((inst.mixer !== null) !== (def.animations.length > 0)) problems.push('mixer presence');
    // triangles only: draw calls per instance depend on which variant node is shown (tools/check-glb.mjs holds art to those)
    const counted = countGeometry(inst.root);
    if (counted.triangles > def.triBudget) problems.push(`${counted.triangles} triangles > budget ${def.triBudget}`);
    if (typeof loaded.isPlaceholder !== 'boolean') problems.push('isPlaceholder');
    let pending = 0;
    inst.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).name === 'pending') pending++; });
    if (pending) problems.push(`${pending} meshes without a resolved material`);
    inst.release();
    if (ctx.assets.instantiate(id) !== inst) problems.push('a released instance is not reused from the pool');
    inst.release();
    return problems;
  };
  ctx.debug.register('viewer', {
    assetIds: (() => Object.keys(ctx.data.manifest.assets)) as (...args: never[]) => unknown,
    check: check as (...args: never[]) => unknown,
    placeholders: (() => Object.keys(ctx.data.manifest.assets).filter((id) => ctx.assets.isActive(id) && ctx.assets.get(id).isPlaceholder)) as (...args: never[]) => unknown,
  });
}

async function index(sb: Sandbox): Promise<void> {
  const { ctx } = sb;
  await applyOverlay(sb);
  registerChecks(sb);
  const el = panel();
  el.style.pointerEvents = 'auto';
  el.style.whiteSpace = 'normal';
  el.style.maxWidth = '70vw';
  const add = (text: string, href: string): void => {
    const a = document.createElement('a');
    a.textContent = text; a.href = href; a.style.cssText = 'color:#7cf2e2;margin-right:10px;display:inline-block';
    el.appendChild(a);
  };
  for (const z of ctx.data.layout.zones) add('zone:' + z.id, `?zone=${z.id}`);
  el.appendChild(document.createElement('hr'));
  const keep = sb.params.get('overlay') ? `&overlay=${encodeURIComponent(sb.params.get('overlay') ?? '')}` : '';
  for (const id of Object.keys(ctx.data.manifest.assets)) add(id, `?asset=${id}${keep}`);
}

const params = new URLSearchParams(location.search);
void createSandbox({
  piece: 'viewer',
  scene: params.has('asset') ? { asset: viewAsset } : params.has('zone') ? { zone: viewZone } : { index },
});
