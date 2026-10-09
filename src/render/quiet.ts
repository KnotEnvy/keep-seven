// Release pass p0 (performance critic: "about 5 kB allocated per tick plus drawn frame"). What three allocates inside
// one frame is mostly boxed numbers: a double handed to a function that is not inlined becomes a heap number. The
// frustum of every `renderer.render` (three per frame here, more with the post chain) is set by six
// `plane.setComponents(a, b, c, d).normalize()` calls: 24 boxed numbers a call, 600 to 700 B a frame in the profile
// (scratch/p0-team-render-tech/allocprof_before.log). `quietFrustum` replaces that one method with the same arithmetic
// written straight into the planes' fields. The result is identical to three's (tests/render/quiet.spec.ts).
import * as THREE from 'three';

type SetFrustum = (m: THREE.Matrix4, coordinateSystem?: THREE.CoordinateSystem, reversedDepth?: boolean) => THREE.Frustum;
let installed = false;

/** Installs the allocation-free `Frustum.setFromProjectionMatrix` (once; WebGL clip space, the only one this game draws with). */
export function quietFrustum(): void {
  if (installed) return;
  installed = true;
  const proto = THREE.Frustum.prototype as unknown as { setFromProjectionMatrix: SetFrustum };
  const original = proto.setFromProjectionMatrix;
  proto.setFromProjectionMatrix = function (this: THREE.Frustum, m: THREE.Matrix4, coordinateSystem: THREE.CoordinateSystem = THREE.WebGLCoordinateSystem, reversedDepth = false): THREE.Frustum {
    if (reversedDepth || coordinateSystem !== THREE.WebGLCoordinateSystem) return original.call(this, m, coordinateSystem, reversedDepth);
    const planes = this.planes, me = m.elements;
    const me0 = me[0] as number, me1 = me[1] as number, me2 = me[2] as number, me3 = me[3] as number;
    const me4 = me[4] as number, me5 = me[5] as number, me6 = me[6] as number, me7 = me[7] as number;
    const me8 = me[8] as number, me9 = me[9] as number, me10 = me[10] as number, me11 = me[11] as number;
    const me12 = me[12] as number, me13 = me[13] as number, me14 = me[14] as number, me15 = me[15] as number;
    for (let i = 0; i < 6; i++) {
      let x = 0, y = 0, z = 0, w = 0;
      switch (i) {
        case 0: x = me3 - me0; y = me7 - me4; z = me11 - me8; w = me15 - me12; break;
        case 1: x = me3 + me0; y = me7 + me4; z = me11 + me8; w = me15 + me12; break;
        case 2: x = me3 + me1; y = me7 + me5; z = me11 + me9; w = me15 + me13; break;
        case 3: x = me3 - me1; y = me7 - me5; z = me11 - me9; w = me15 - me13; break;
        case 4: x = me3 - me2; y = me7 - me6; z = me11 - me10; w = me15 - me14; break;       // far
        default: x = me3 + me2; y = me7 + me6; z = me11 + me10; w = me15 + me14; break;      // near
      }
      // Plane.normalize: the normal by its length, the constant by the same factor
      const inv = 1 / Math.sqrt(x * x + y * y + z * z);
      const p = planes[i] as THREE.Plane, n = p.normal;
      n.x = x * inv; n.y = y * inv; n.z = z * inv;
      p.constant = w * inv;
    }
    return this;
  };
}

/**
 * Pass i4 (performance: "play still allocates 5 kB per tick and drawn frame"). The profile's largest site was not in the
 * frame nor in the tick but between them: every skeleton that moved since the last frame marks its bone texture for an
 * upload (core's quiet update, assets.ts), and three's upload path builds the texture's cache key first: a
 * fourteen-element array joined into a string, 690 B a skeleton a frame (the hands alone in the yard; 2.0 kB with the
 * file's Biders: scratch/i4-team-render-tech/allocprof_before_low.log). `quietBones` hands the new matrices to the
 * texture three already made, itself: the same `texSubImage2D` three would issue (a float RGBA texture of the same
 * size, no flip, no premultiply), through three's own state cache, and marks the texture's version as uploaded. It is
 * called from a dynamic material's onBeforeRender: after three has updated the skeleton, before it binds the texture.
 * The FIRST upload of a bone texture (and any after a lost context or a dispose) is still three's: only then is there
 * no GL texture to write to. The shadow pass's depth materials have no such hook: a caster's bones go three's way.
 */
export function quietBones(renderer: THREE.WebGLRenderer, skeleton: THREE.Skeleton): void {
  const texture = skeleton.boneTexture;
  if (texture === null || !bonesOn) return;
  const props = (renderer.properties as unknown as { get(o: object): { __webglTexture?: WebGLTexture; __version?: number } }).get(texture);
  const version = texture.version;
  if (props.__version === version || props.__version === undefined || props.__webglTexture === undefined) return;
  const gl = renderer.getContext() as WebGL2RenderingContext, image = texture.image as { width: number; height: number };
  const data = skeleton.boneMatrices as Float32Array;
  if (data.length !== image.width * image.height * 4) return;
  if (typeof (renderer.state as unknown as { pixelStorei?: unknown }).pixelStorei !== 'function' || typeof (renderer.state as unknown as { activeTexture?: unknown }).activeTexture !== 'function') return;   // another three: its own way
  // Pre-release pass (final reviewer: "after a death in the Tally House on Low the shutters are bright yellow with blue
  // stripes, the poster solid blue"). The texture was bound on whatever unit happened to be active: the unit of the LAST
  // sampler three had bound for the draw before (uEmisMap of a skinned m_prop, unit 2). Three sets a material's samplers
  // only when the material or the program changes, so when the next skinned mesh shared both (two Biders, then the
  // shutters, the hatch and the share cloth: one material, one program) nothing put the emissive palette back and they
  // all read these bone matrices as their emissive map. The write goes through three's own scratch unit (the last one,
  // what `activeTexture()` without a slot selects; no program's sampler is ever given it), in three's cache of bindings.
  const state = renderer.state as unknown as { activeTexture(slot?: number): void; pixelStorei(name: number, value: number | boolean): void };
  state.activeTexture();
  renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
  // (through three's cache of the pixel store: a store set behind its back would leave the next image upload flipped)
  state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
  state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);
  state.pixelStorei(gl.UNPACK_ALIGNMENT, texture.unpackAlignment);
  state.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, image.width, image.height, gl.RGBA, gl.FLOAT, data);
  props.__version = version;
  bonesWritten++;
}
let bonesWritten = 0;
let bonesOn = true;
/** a test's switch: off, every bone texture goes three's own way again */
export function quietBonesSwitch(on: boolean): void { bonesOn = on; }
/** bone textures written by quietBones since the page loaded (tests) */
export function quietBonesWritten(): number { return bonesWritten; }
