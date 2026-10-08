// Release pass p0: the pure parts of the render team's fixes.
//   quietFrustum       the allocation-free Frustum.setFromProjectionMatrix gives three's own planes, bit for bit
//   benchmarkVerdict   an uncalibrated fill-rate result needs twice the threshold before the boot leaves Low for `min`
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { quietFrustum } from '../../src/render/quiet.ts';
import { MIN_MARGIN, MIN_THRESHOLD_MS, benchmarkVerdict } from '../../src/render/benchmark.ts';
import { tierFromBenchmark } from '../../src/core/quality.ts';

describe('quietFrustum', () => {
  it('gives the planes three computes, for perspective, shifted and orthographic projections, and still culls', () => {
    const cams: (THREE.PerspectiveCamera | THREE.OrthographicCamera)[] = [];
    for (const [fov, aspect, near, far] of [[52, 16 / 9, 0.1, 400], [40, 21 / 9, 0.02, 30], [75, 4 / 3, 0.05, 1200]] as const) {
      const c = new THREE.PerspectiveCamera(fov, aspect, near, far);
      c.position.set(3.2, 1.65, -7.5); c.rotation.set(0.21, -1.3, 0.04);
      cams.push(c);
    }
    const shifted = new THREE.PerspectiveCamera(40, 21 / 9, 0.02, 30);
    shifted.setViewOffset(1260, 540, 150, 0, 960, 540);
    cams.push(shifted, new THREE.OrthographicCamera(-26, 26, 26, -26, 1, 160));
    const matrices = cams.map((c) => { c.updateProjectionMatrix(); c.updateMatrixWorld(true); return new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse.copy(c.matrixWorld).invert()); });
    const before = matrices.map((m) => new THREE.Frustum().setFromProjectionMatrix(m).planes.map((p) => [p.normal.x, p.normal.y, p.normal.z, p.constant]));
    const reversed = new THREE.Frustum().setFromProjectionMatrix(matrices[0] as THREE.Matrix4, THREE.WebGLCoordinateSystem, true).planes.map((p) => p.constant);
    quietFrustum();
    quietFrustum();                                                    // installing twice is installing once
    matrices.forEach((m, i) => {
      const f = new THREE.Frustum().setFromProjectionMatrix(m);
      expect(f.planes.map((p) => [p.normal.x, p.normal.y, p.normal.z, p.constant])).toEqual(before[i]);
    });
    // what the game never uses is still three's own
    expect(new THREE.Frustum().setFromProjectionMatrix(matrices[0] as THREE.Matrix4, THREE.WebGLCoordinateSystem, true).planes.map((p) => p.constant)).toEqual(reversed);
    const cam = cams[0] as THREE.PerspectiveCamera, f = new THREE.Frustum().setFromProjectionMatrix(matrices[0] as THREE.Matrix4);
    const ahead = new THREE.Vector3(0, 0, -10).applyMatrix4(cam.matrixWorld), behind = new THREE.Vector3(0, 0, 10).applyMatrix4(cam.matrixWorld);
    expect(f.containsPoint(ahead)).toBe(true);
    expect(f.containsPoint(behind)).toBe(false);
    expect(f.intersectsSphere(new THREE.Sphere(behind, 11))).toBe(true);
  });
});

describe('benchmarkVerdict', () => {
  it('reports a result between the threshold and twice the threshold as the threshold, everything else as measured', () => {
    expect(MIN_THRESHOLD_MS).toBe(4);
    expect(benchmarkVerdict(0.3)).toBe(0.3);
    expect(benchmarkVerdict(2.5)).toBe(2.5);
    expect(benchmarkVerdict(4)).toBe(4);
    expect(benchmarkVerdict(4.01)).toBe(4);
    expect(benchmarkVerdict(MIN_THRESHOLD_MS * MIN_MARGIN)).toBe(4);
    expect(benchmarkVerdict(8.01)).toBe(8.01);
    expect(benchmarkVerdict(40)).toBe(40);
    expect(benchmarkVerdict(Number.NaN)).toBe(0);
    expect(benchmarkVerdict(-1)).toBe(0);
  });
  it('with the manager: an integrated-GPU guess stays on Low up to twice the threshold, goes to min beyond, and High is as before', () => {
    expect(tierFromBenchmark('low', benchmarkVerdict(3))).toBe('low');
    expect(tierFromBenchmark('low', benchmarkVerdict(5.5))).toBe('low');            // it was 'min'
    expect(tierFromBenchmark('low', benchmarkVerdict(8))).toBe('low');
    expect(tierFromBenchmark('low', benchmarkVerdict(8.5))).toBe('min');
    expect(tierFromBenchmark('low', benchmarkVerdict(0.4))).toBe('high');
    expect(tierFromBenchmark('high', benchmarkVerdict(0.4))).toBe('high');
    expect(tierFromBenchmark('high', benchmarkVerdict(6))).toBe('low');
    expect(tierFromBenchmark('min', benchmarkVerdict(6))).toBe('low');
  });
});
