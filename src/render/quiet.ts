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
