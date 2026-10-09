// Pre-release pass (render): what the GPU really samples, against what three believes it bound.
// `installSamplerWatch` runs IN THE PAGE (page.evaluate(installSamplerWatch)). While `window.__samplers.on` is true,
// every draw call is checked: for each sampler2D of the program in use, the texture bound on the sampler's unit (asked
// of the context itself, not of any cache) must be the GL texture of the value three holds for that uniform (the
// material's uniform, or the skeleton's bone texture). A mismatch is a stale or clobbered binding: the material and
// the uniform are right in JS and the picture is wrong. Rows go to `window.__samplers.bad`.
//   window.__samplers = { on, draws, checked, bad: ['<object> [<material>] <sampler>: unit <n> holds <what>, wants <what>'] }
// `frameStats` (Node side) reads a PNG data URL: how many pixels are garish (the look of a data texture read as colour).
import { PNG } from 'pngjs';

export function installSamplerWatch() {
  if (window.__samplers) return;
  const sys = window.__dbg.ext.render.system(), r = sys.renderer, gl = r.getContext();
  const W = window.__samplers = { on: false, draws: 0, checked: 0, bad: [], cur: null };
  const raw = { getParameter: gl.getParameter.bind(gl), activeTexture: gl.activeTexture.bind(gl), getUniform: gl.getUniform.bind(gl) };
  const samplers = new WeakMap();
  const of = (prog) => {
    let s = samplers.get(prog);
    if (s) return s;
    s = [];
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(prog, i); if (u && u.type === gl.SAMPLER_2D && u.size === 1 && !u.name.includes('[')) s.push({ name: u.name, loc: gl.getUniformLocation(prog, u.name) }); }
    samplers.set(prog, s);
    return s;
  };
  const label = (glTex) => {
    if (!glTex) return 'nothing';
    let found = '';
    const look = (t, where) => { if (!found && t && t.isTexture && r.properties.get(t).__webglTexture === glTex) found = (t.name || where) + (t.image ? ` ${t.image.width}x${t.image.height}` : ''); };
    window.__dbg.ext.core.ctx().scene.scene.traverse((o) => {
      if (o.skeleton && o.skeleton.boneTexture) look(o.skeleton.boneTexture, `the bone texture of ${o.name}`);
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { const u = r.properties.get(m).uniforms; if (u) for (const k of Object.keys(u)) look(u[k] && u[k].value, `${m.name}.${k}`); }
    });
    return found || 'a texture of no material in the scene';
  };
  const check = () => {
    if (!W.on) return;
    W.draws++;
    const cur = W.cur, prog = raw.getParameter(gl.CURRENT_PROGRAM);
    if (!cur || !prog) return;
    const list = of(prog);
    if (!list.length) return;
    const uniforms = r.properties.get(cur.material).uniforms, active = raw.getParameter(gl.ACTIVE_TEXTURE);
    for (const s of list) {
      const value = s.name === 'boneTexture' ? (cur.object.skeleton ? cur.object.skeleton.boneTexture : null) : uniforms && uniforms[s.name] ? uniforms[s.name].value : null;
      if (!value || !value.isTexture) continue;
      const want = r.properties.get(value).__webglTexture;
      if (!want) continue;
      const unit = raw.getUniform(prog, s.loc);
      raw.activeTexture(gl.TEXTURE0 + unit);
      const got = raw.getParameter(gl.TEXTURE_BINDING_2D);
      W.checked++;
      if (got !== want && W.bad.length < 200) W.bad.push(`${cur.object.name || cur.object.type} [${cur.material.name}] ${s.name}: unit ${unit} holds ${label(got)}, wants ${value.name || s.name}`);
    }
    raw.activeTexture(active);
  };
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = gl[name].bind(gl); gl[name] = function (...a) { check(); return o(...a); }; }
  const direct = r.renderBufferDirect.bind(r);
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    W.cur = { object, material };
    try { return direct(camera, scene, geometry, material, object, group); } finally { W.cur = null; }
  };
}

/** a canvas frame (PNG data URL): { png, garish } where garish = pixels with one channel far over another and bright (pure yellow, blue, green, red) */
export function frameStats(url) {
  const png = PNG.sync.read(Buffer.from(url.split(',')[1], 'base64')), d = png.data;
  let garish = 0;
  for (let i = 0; i < d.length; i += 4) { const hi = Math.max(d[i], d[i + 1], d[i + 2]), lo = Math.min(d[i], d[i + 1], d[i + 2]); if (hi > 200 && hi - lo > 170 && (d[i + 2] > 200 || d[i + 1] > 200)) garish++; }
  return { png, garish };
}
/** pixels of two frames of one size whose largest channel difference is over `over` (0..255) */
export function differing(a, b, over = 48) {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > over) n++;
  return n;
}
