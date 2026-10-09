// src/world/sightRock.ts: the rimrock the pursued man stands on (exterior look, pass i4; lead rulings R4 and R18).
//
// His card is drawn SIGHT_MIN_PX tall from wherever she stands (director.ts), which is ten times a man's size at 250 m:
// on the pale far mesa he read as a giant, or as a cut-out in front of it, and wherever the card's enlargement and the
// mesa's own top disagreed by a few pixels there was sky under his boots. So he is given ground AT HIS OWN SCALE and at
// his own depth: a dark promontory of rimrock, measured in his heights, scaled about his feet by the same rule that
// scales him. It is scenery, not part of the beat: it stands there whenever the street is built, before he is seen and
// after he has gone down its far side. One mesh, one draw call, some 600 triangles (pass i6: it was 250), no texture, no fog (like his card:
// the L1 haze would lift it to the far mesa's value and he would be on nothing again).
//
// The outline is drawn in "heights" (1 = his drawn height): u to her right as she looks at him (north), v up from his
// feet. Only about 1.5 heights of it stand over the yard wall from the checkpoint; the rest is there for the other
// places she may stand.
import * as THREE from 'three';

/** the outline's top, left to right: [u, v, kind]; kind 0 caprock (flat, lit along its edge), 1 cliff, 2 scree */
// Exterior look, pass i6 (the visual reviewer: "the mesa reads as a block about four of his heights wide, so he looks
// like a giant on a nearby boulder rather than a man 250 m away"). The promontory was a knob with a 0.9-height summit and
// steps half his height tall on both shoulders: everything about it was HIS size. It is a MESA's rim now: a level
// caprock thirteen heights long that runs out of sight behind the tank and the house on either side of the gap he is
// seen in, broken only by low steps (a seventh of his height) and one notch east of him, with its cliffs far out at
// both ends; under the cap the face is laid in thin LEVEL beds (STRATA: six to his height), and the air between is
// twice as thick (HAZE_K). He is a small upright mark on a long horizontal, which is what a man on a rim is.
const TOP: readonly (readonly [number, number, number])[] = [
  [-13.0, -5.6, 2], [-10.0, -3.9, 2], [-8.2, -2.8, 2], [-7.5, -1.6, 1], [-7.2, -0.56, 1],
  [-6.9, -0.50, 0], [-5.4, -0.46, 0], [-5.28, -0.26, 1], [-4.4, -0.23, 0], [-2.9, -0.20, 0], [-2.82, -0.12, 1],
  [-1.6, -0.10, 0], [-0.62, -0.09, 1], [-0.5, -0.01, 0], [-0.4, 0.0, 0], [0.25, 0.0, 0], [0.5, -0.045, 0], [0.62, -0.055, 1], [0.72, -0.10, 0],
  [1.5, -0.11, 0], [1.58, -0.24, 1], [2.5, -0.26, 0], [3.3, -0.25, 0],
  [3.38, -0.60, 1], [3.7, -0.63, 0], [3.82, -0.35, 1], [4.6, -0.33, 0], [6.1, -0.39, 0], [6.3, -0.60, 1], [6.7, -1.7, 1],
  [7.6, -2.7, 2], [9.5, -3.8, 2], [13.0, -5.5, 2],
];
// (he stands on the rim's one proud slab, a twelfth of his height over the caprock beside it: with the view turned off
// him the rim's line rolls a pixel or two on screen, and rock level with his feet beside him was read as part of him:
// tests/world/sighting.test.mjs)
/** the level beds of the face under the cap (heights below his feet) and the tone of the band over each, then of the last one */
const STRATA: readonly number[] = [-0.14, -0.20, -0.43, -0.50, -0.78];
const STRATA_TONE: readonly number[] = [1.0, 0.74, 0.97, 0.80, 0.93, 0.84];
/** under the outline: the caprock's lit lip, the cliff's beds, the scree, and the foot (far below the yard wall) */
const FOOT = -7.0;
// linear colours (the frame's grade and exposure are applied after): the body is the yard walls' shadow, a step paler
// than his ink, far darker than the mesa behind; the lip and the north faces take the low sun
const LIP: readonly [number, number, number] = [0.40, 0.165, 0.085];
const LIT: readonly [number, number, number] = [0.30, 0.118, 0.066];
const BODY: readonly [number, number, number] = [0.105, 0.048, 0.046];
const BED: readonly [number, number, number] = [0.074, 0.034, 0.036];
const SCREE: readonly [number, number, number] = [0.165, 0.082, 0.070];
const SCREE_LOW: readonly [number, number, number] = [0.21, 0.115, 0.095];

/** the air between: a fifth of the L1 haze (the far mesa behind it is three quarters haze), so it reads as the NEARER rim */
const HAZE: readonly [number, number, number] = [0.80, 0.50, 0.27], HAZE_K = 0.13;      // pass i6: 0.07 (distance)

/** how far the rock's face stands in front of his card, in metres (the mesa's scree apron stands 6 m in front of it) */
export const SIGHT_ROCK_FRONT = 9;

export function buildSightRock(): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const quad = (u0: number, a0: number, b0: number, u1: number, a1: number, b1: number, ca: readonly number[], cb: readonly number[], k0 = 1, k1 = 1): void => {
    // (u0,a0)-(u1,a1) is the upper edge, (u0,b0)-(u1,b1) the lower; colour ca above, cb below
    const pu = [u0, u1, u1, u0, u1, u0], pv = [b0, b1, a1, b0, a1, a0], up = [0, 0, 1, 0, 1, 1], kk = [k0, k1, k1, k0, k1, k0];
    for (let i = 0; i < 6; i++) {
      pos.push(0, pv[i] as number, -(pu[i] as number));
      const c = up[i] ? ca : cb, k = kk[i] as number;
      for (let j = 0; j < 3; j++) col.push((c[j] as number) * k * (1 - HAZE_K) + (HAZE[j] as number) * HAZE_K);
    }
  };
  for (let i = 0; i < TOP.length - 1; i++) {
    const [u0, v0, kind] = TOP[i] as readonly [number, number, number], [u1, v1] = TOP[i + 1] as readonly [number, number, number];
    // a face that looks north-west (its top falls to the right) takes the sun; one that looks south is in its own shade
    const sunny = v1 < v0 - 0.02;
    const n0 = 0.86 + 0.28 * Math.abs(Math.sin(u0 * 7.3 + 1.1)), n1 = 0.86 + 0.28 * Math.abs(Math.sin(u1 * 7.3 + 1.1));
    if (kind === 2) {
      quad(u0, v0, FOOT, u1, v1, FOOT, sunny ? SCREE_LOW : SCREE, SCREE_LOW, n0, n1);
      continue;
    }
    const lip = kind === 0 ? 0.035 : 0.0;
    const face = sunny ? LIT : BODY;
    // the bed line under the cap: it steps with the outline, so the rock reads as laid in courses
    const m0 = Math.min(v0 - 0.3, -1.05 + 0.1 * Math.sin(u0 * 2.1)), m1 = Math.min(v1 - 0.3, -1.05 + 0.1 * Math.sin(u1 * 2.1));
    if (lip > 0) quad(u0, v0, v0 - lip, u1, v1, v1 - lip, LIP, LIP, n0, n1);
    // pass i6: the face under the cap in LEVEL beds (STRATA), each its own tone, cut by the outline
    {
      const t0 = v0 - lip, t1 = v1 - lip, lo = sunny ? BODY : BED;
      for (let k = 0; k <= STRATA.length; k++) {
        const hi = k === 0 ? 1e3 : (STRATA[k - 1] as number), low = k === STRATA.length ? -1e3 : (STRATA[k] as number);
        const a0 = Math.min(t0, hi), a1 = Math.min(t1, hi), b0 = Math.max(m0, low), b1 = Math.max(m1, low);
        if (a0 - b0 < 1e-4 && a1 - b1 < 1e-4) continue;
        const tone = STRATA_TONE[k] as number, f = (k + 0.5) / (STRATA.length + 1);
        const c = [face[0] + (lo[0] - face[0]) * f * 0.7, face[1] + (lo[1] - face[1]) * f * 0.7, face[2] + (lo[2] - face[2]) * f * 0.7];
        quad(u0, a0, Math.min(a0, b0), u1, a1, Math.min(a1, b1), c, c, n0 * tone, n1 * tone);
      }
    }
    quad(u0, m0, m0 - 0.06, u1, m1, m1 - 0.06, BED, BED);
    const s0 = Math.min(m0 - 0.5, -2.2 + 0.25 * Math.sin(u0 * 1.3)), s1 = Math.min(m1 - 0.5, -2.2 + 0.25 * Math.sin(u1 * 1.3));
    quad(u0, m0 - 0.06, s0, u1, m1 - 0.06, s1, sunny ? LIT : BODY, BODY, n0 * 0.92, n1 * 0.92);
    quad(u0, s0, FOOT, u1, s1, FOOT, SCREE, SCREE_LOW, n0, n1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  mat.name = 'world_sight_rock';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'world_sight_rock';
  mesh.matrixAutoUpdate = true;
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}
