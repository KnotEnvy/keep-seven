// The mood table of code-render 4.3 (ART_BIBLE 3 and 11.1) as numbers: fog, sky, dynamic ambient and key, grade.
// Pure data and arithmetic (no DOM, no three): unit-tested in tests/render/moods.spec.ts.
//
// A mood is one Float32Array of MOOD_SIZE numbers so that a cross-fade is one loop. Colours are LINEAR sRGB.
import type { MoodId, ZoneId } from '../core/contracts.ts';

/** the moods of the contract plus the two sub-volumes of the bore (ART_BIBLE 3.6) */
export type MoodKey = MoodId | 'L5a' | 'L5c' | 'L6c';

// ---- field offsets -------------------------------------------------------------------------------------------
export const M_FOG_A = 0;          // rgb: fog colour away from the sun (exterior) / near (interior)
export const M_FOG_B = 3;          // rgb: fog colour toward the sun / far
export const M_FOG_MIX_SUN = 6;    // weight of the one dot product (exterior)
export const M_FOG_MIX_DIST = 7;   // weight per metre of the distance term (interior: 1 / 40)
export const M_DENSITY = 8;        // per metre
export const M_HEIGHT_FALLOFF = 9; // per metre
export const M_HEIGHT_EXTRA = 10;  // extra density at the base (the zone may override: gully 1.5, street 0.6, yard 0)
export const M_ZENITH = 11;        // rgb
export const M_MID = 14;           // rgb
export const M_GLOW = 17;          // rgb: the horizon band toward the sun
export const M_MID_SIN = 20;       // sine of the elevation where the mid band sits
export const M_SUN_DISC = 21;      // 0 / 1
export const M_SUN_COL = 22;       // rgb
export const M_CLOUD = 25;         // cloud-shadow depth (0.18 = light x 0.82 .. 1.0)
export const M_AMBIENT = 26;       // rgb x strength: dynamic ambient
export const M_KEY = 29;           // rgb x strength: dynamic key
export const M_KEY_DIR = 32;       // xyz: direction TO the key
export const M_EXPOSURE = 35;
export const M_TINT = 36;          // rgb gain
export const M_LIFT = 39;          // rgb
export const M_SATURATION = 42;
export const M_CONTRAST = 43;
export const M_VIGNETTE = 44;
export const M_PULSE = 45;         // muzzle pulse scale (35 % outdoors by day)
export const M_SUN_DIR = 46;       // xyz: the direction the fog and the sky lean toward (the sun, the afterglow, the gallery axis)
export const M_RULE = 49;          // 1 where the Rule is drawn (exteriors)
export const M_SKY = 50;           // 1 where a sky is visible
export const M_PLACE = 51;         // rgb: what a placeholder zone's fixed white key becomes under this mood (1 under L1)
export const M_RIM = 54;          // rgb x strength: a cool fill on the sides and the silhouette of dynamic things (0 in most moods)
export const M_VM_AMB = 57;       // rgb: the view-model's own rig (polish round 3, lead ruling R6): ambient,
export const M_VM_KEY = 60;       //      key (from the upper left of the VIEW, not of the world)
export const M_VM_RIM = 63;       //      and a cool rim from behind-left
export const M_BLOOM_T = 66;      // High tier only: the bloom's threshold as a DISPLAY level (post.ts divides it by the exposure)
export const M_BLOOM_K = 67;      //                 its intensity
export const M_BLOOM_S = 68;      //                 and the width of its knee as a display level (0: the pass's own 0.15 of scene light)
export const MOOD_SIZE = 69;
/**
 * The High tier's bloom by mood (polish round 4, lead ruling R9: "High must look visibly richer than Low wherever a
 * player would compare them"; measured: 0.2 to 0.6 of 255 between the tiers on the first image, the rim and the last
 * image). One threshold for every place (1.15 of display white) let only emissive things bloom, and outdoors and in the
 * station there are few: the picture was Low's. A mood now names its own: where the frame is a dark land under a lit
 * sky (L6), a black frame round a blazing mouth (L0) or a dark station under white pools (L3, L4) the threshold sits
 * under the LIGHT of the frame, so the afterglow wraps the mesas' edge, the valley bleeds into the overhang and the
 * pools glow on the plate. Low and min have no bloom and read none of this.
 */
export const BLOOM_T_DEFAULT = 1.15, BLOOM_K_DEFAULT = 0.9;
/**
 * High tier only (underground look, polish round 5, lead ruling R9): how much of its baked light a lightmapped face of
 * the station mirrors at a grazing angle under each mood (SharedUniforms.uSheen; materials.ts WORLD_LIGHT). The works
 * are glazed ceramic and satin plate: the gallery's walkway, the hall's floor under its pendants and the chamber's
 * plate carry their lamps as streaks toward the eye. Adobe, plank and sand have none. Low and min draw none of it.
 */
export const SHEEN: Readonly<Partial<Record<MoodKey, number>>> = { L3: 2.2, L4: 3.0, L5: 2.2, L5c: 1.2, L5p: 2.2 };

/**
 * High tier only (render-tech, pass i1, lead ruling R9): the air light of each mood (post.ts AirLightEffect): how much of
 * AIR_K a lamp of this mood's rooms puts into the air between itself and the eye. A mood without an entry has none
 * (the Long Light's air is the sun shafts' and the fog's). These are the look teams' numbers: the mechanism reads only
 * this table. Low and min draw none of it.
 */
// underground look, pass i1: L2 0.8 -> 1.0, L4 1.2 -> 1.5, L5 1.2 -> 1.5, L5a 1.4 -> 2.2 (the antechamber and the Tamper's aisle were 3 to 4 of 255 from Low)
export const AIR: Readonly<Partial<Record<MoodKey, number>>> = { L2: 1.0, L3: 1.4, L4: 2.2, L5: 1.5, L5a: 2.2, L5c: 1.8, L5p: 1.2, L6: 0.8 };
/**
 * High tier only (render-tech, pass i3, R9: from the lift hall's gantry and on the rim High drew Low's frame, 3.7 and 3.3
 * of 255 apart). Two more shapes of the air light (post.ts AIR_CONE_ANGLE, AIR_GLOW_ANGLE), by mood:
 *   AIR_CONE   the strength of the cone of light under a lamp whose face looks down (the pendants of the hall, the
 *              gallery's and the chamber's ceiling lamps), as a multiple of the lamp's own glow: a shaft through the dust
 *   AIR_GLOW   how much of its glow a lamp keeps beyond post.ts AIR_FAR (it was dropped there): the town's windows from the
 *              rim, cut by whatever stands in front of the lamp. A far lamp's glow is a wide soft pool, far weaker a
 *              pixel than a near lamp's heart, and a mesh of many lamps shares the light of eight: measured on the
 *              windows 130 m off, 6 shows nothing, 18 is a warm pool on the wall round each lit window, 40 a round blob
 *              over the pane. The blue hour only: in the rooms the twelve places of the set go to the near lamps, and a
 *              far lamp that lost its place to one would go out at a stroke.
 * A mood without an entry has neither (and draws as before pass i3). The look teams' numbers; Low and min draw none of it.
 */
export const AIR_CONE: Readonly<Partial<Record<MoodKey, number>>> = { L3: 6, L4: 8, L5: 4, L5a: 3, L5c: 4, L5p: 4 };
export const AIR_GLOW: Readonly<Partial<Record<MoodKey, number>>> = { L6: 18 };
/**
 * High tier only (underground look, pass i3, R9: "drifting dust in the lamp cones"). The level of the motes that hang
 * in the station's air (vfx/ambient.ts 'air': 400 additive points in a 16 x 5 x 16 m box round the eye, one draw call).
 * The works only: the Tally House has its own motes in the sun's blades, the antechamber is the embers'. A mood without
 * an entry has none; Low and min draw none of it.
 */
export const AIR_DUST: Readonly<Partial<Record<MoodKey, number>>> = { L3: 0.7, L4: 0.8, L5: 0.6, L5c: 0.7, L5p: 0.8 };
/**
 * High tier only (render-tech, pass i3, R9: the rim). The glance of a light that stands low in the sky off the ground
 * (SharedUniforms.uGlance; materials.ts WORLD_LIGHT): [the light's strength as a DISPLAY level, in the mood's glow band's
 * colour; the lobe's exponent (low = wide)]. The blue hour only: the afterglow lies along the sand toward her, the
 * ripples' far sides carry it, and the foreground dune has a lit side. A mood without an entry has none. The look
 * teams' numbers; Low and min draw none of it.
 */
// exterior look, pass i3: 1.6 -> 2.1 (R9, the rim: the ledge's ripples and the stone's top carry the afterglow from every place she stands on it)
export const GLANCE: Readonly<Partial<Record<MoodKey, readonly [number, number]>>> = { L6: [2.1, 3], L6c: [2.1, 3] };
/**
 * High tier only (render-tech, pass i1, R9): how strongly the relief of a surface's detail texture follows the mood's sun
 * (SharedUniforms.uRelief; materials.ts WORLD_LIGHT). Only moods with a sun in the sky: the fog's lean of an interior mood
 * is not a light. The look teams' numbers; Low and min draw none of it.
 */
// exterior look, pass i1: L1 2.4 -> 3.6 (the yard and the gate court: the sunlit sand and adobe carry their grain on High)
export const RELIEF: Readonly<Partial<Record<MoodKey, number>>> = { L0: 2.4, L1: 3.6 };
/**
 * High tier only (render-tech, pass i2, R9: the street, the yard, the lift hall and the rim measured 2.1 to 2.9 of 255
 * from Low; most of each frame is a large face in SHADE, where the sun's relief above is nothing). The same relief under
 * the light that is not a sun (SharedUniforms.uReliefSky; materials.ts RELIEF_SKY_DIR): the sky over a shaded wall and
 * the sand in a building's shade, the lamps over a room's plate and its pillars. Under a mood with a sun it takes the
 * faces the bake left in shade; under the others every lightmapped face with a detail texture. The look teams' numbers;
 * Low and min draw none of it.
 */
export const RELIEF_SKY: Readonly<Partial<Record<MoodKey, number>>> = { L0: 1.6, L1: 2.4, L2: 1.2, L3: 1.6, L4: 2.0, L5: 1.6, L5a: 1.6, L5c: 1.6, L5p: 1.6, L6: 2.0, L6c: 2.0 };
/**
 * High tier only (render-tech, pass i2, R9: on the rim High drew Low's frame, 2.6 of 255 apart). The sun shafts and the
 * sun's veil (post.ts SunShaftEffect) ran only under a sun disc; the blue hour has none, but its afterglow is a light
 * low in the sky all the same (the mood's M_SUN_DIR). Under a mood named here the same term runs toward the afterglow,
 * in the glow band's colour, at this share of the shafts' strength: the sky spills past the rock frame, the pylon and
 * the town's roofs, and the air over the ledge glows on the afterglow's side. The look teams' number.
 */
export const SHAFT_DUSK: Readonly<Partial<Record<MoodKey, number>>> = { L6: 0.6, L6c: 0.6 };
/**
 * ... and the veil's share of them at dusk (post.ts VEIL_K is the Long Light's). The last image is dark shapes against a
 * lit sky: at the day's 0.85 the pylon, the windmill and the town's roofs were lifted to the sky's own level.
 */
export const SHAFT_DUSK_VEIL = 0.12;
/**
 * High tier only (render-tech, pass i1, R9: "real contact shadows from props and enemies" in every zone): where the ONE
 * shadow map of the tier looks in each mood. Outdoors by day it is the sun's (`dir` null: the mood's own sun direction);
 * in a room it hangs over her and looks down along `dir` (the direction TO the light): the lamps are overhead in every
 * room of the stage, so a Bider, the Tamper and the Windlass stand on a shadow of their own shape instead of a round blob.
 *   k      how dark the shadow is (the receiver's light x (1 - k))
 *   half   half the side of the map's square on the ground, metres (the map is 1024 texels: 26 -> 5 cm, 13 -> 2.5 cm)
 *   dist   how far from her feet the map's eye stands along `dir`; nothing nearer the light than that casts
 *   far    the map's depth: nothing more than `far - dist` beyond her feet receives
 * A mood without an entry has no shadow pass (the blue hour: no sun, no lamp overhead). The look teams' numbers.
 */
/**
 * Render-tech, pass i2 (R9; the visual reviewer: in the street, the yard and at the lip gate High drew Low's frame, 2.9 of
 * 255 apart: "make the sun shadow map cover props and building fronts at mid distance with a visibly darker, cooler
 * shadow tint"). Most of those frames is the fixed world's own shade, which is in the bake and which no map reaches.
 * Five more fields, all optional (without them a spec draws as before this pass):
 *   lit      the baked light (luminance of the lightmap, as the sparkle reads it) between which a receiver counts as
 *            standing in the bake's shade (below lit[0]) or in its sun (above lit[1]). With it:
 *   shade    the bake's own shade is deepened by this share of `k`, on every receiver inside the map's reach, whatever
 *            the map holds: High's shade is darker (and, with `tint`, cooler) than Low's. 0: not at all.
 *   inShade  the share of a MAP shadow that shows where the bake has shade (1: as in the sun, the look before this
 *            pass, a creature in a building's shade cast a second sun's shadow; 0: none).
 *   tint     the colour a shadow and the deepened shade are drawn TOWARD, as a display level (linear; divided by the
 *            exposure): the sky's fill. Black when absent.
 *   statics  the FIXED world of the exterior zones casts into the map too (SHADOW_CASTERS: the buildings, the rock, the
 *            Old-World works; not the sand): the map then draws the EDGE of a baked shadow at 5 cm a texel inside the
 *            bake's penumbra. It costs the casting chunks a second draw (measured: + 50 000 triangles and + 7 draw
 *            calls in the street). A lightmap blurs the shadow of a thin thing into a grey the gate above calls shade:
 *            with `inShade` the rails of a fence, an awning's posts and a cart's spokes lie across the street as
 *            shadows again. While the fixed world casts, the creatures keep their blob shadows (system.ts
 *            shadowCovers): in a building's shade the map holds the building, and the blob is what they stand on.
 * These are the look teams' numbers; the mechanism reads only this table.
 */
export interface ShadowSpec {
  readonly dir: readonly [number, number, number] | null; readonly k: number; readonly half: number; readonly dist: number; readonly far: number;
  readonly lit?: readonly [number, number]; readonly shade?: number; readonly inShade?: number; readonly tint?: readonly [number, number, number]; readonly statics?: boolean;
}
// exterior look, pass i3 (R9; the visual reviewer: "raise shadow darkness"): k 0.55 -> 0.60 (a cast shadow is darker), shade
// 0.45 -> 0.40 (the bake's own shade is deepened a little LESS: at 0.50 and over, the yard, which is all shade, lost the
// brick and plaster of its walls to one dark violet, and Low's wall was the richer of the two)
const SHADOW_SUN: ShadowSpec = { dir: null, k: 0.60, half: 26, dist: 70, far: 160, lit: [0.40, 0.62], shade: 0.40, inShade: 0.5, statics: true, tint: [0.020, 0.028, 0.060] };
/** under the overhang everything stands in the roof's shade and the frame is the first image: the shade is the bake's own there, and nothing fixed casts */
const SHADOW_ROOF: ShadowSpec = { ...SHADOW_SUN, shade: 0, statics: false };
const SHADOW_ROOM: ShadowSpec = { dir: [0.16, 1, 0.10], k: 0.42, half: 13, dist: 7, far: 15 };
/** the share of the map's half side between which a shadow fades out toward the map's edge (it was cut at the edge of the square) */
export const SHADOW_EDGE: readonly [number, number] = [0.72, 0.96];
/** the materials of a chunk mesh that cast into a map whose spec says `statics` (the sand does not: at 14 degrees of sun it would shade itself) */
export const SHADOW_CASTERS: readonly string[] = ['m_frontier', 'm_pellam'];
/**
 * ... and the zones whose chunks do. The town only: its fences, posts, carts and eaves are thin things a lightmap blurs.
 * In the gully the bake's light is not the sun's alone (the overhang's patch is two spots through the notch, the walls
 * carry a fill): the map shaded faces the bake shows lit (shots/i2-team-render-tech/lip/pair_back.jpg, pair_first.jpg).
 */
export const SHADOW_STATIC_ZONES: readonly ZoneId[] = ['plenty_street'];
export const SHADOWS: Readonly<Partial<Record<MoodKey, ShadowSpec>>> = {
  L0: SHADOW_ROOF, L1: SHADOW_SUN, L2: SHADOW_ROOM, L3: SHADOW_ROOM, L4: SHADOW_ROOM, L5: SHADOW_ROOM, L5a: SHADOW_ROOM, L5c: SHADOW_ROOM, L5p: SHADOW_ROOM,
};
/** the materials of a zone's chunk meshes that take the shadow (a twin of the mesh is drawn with the shadow material); the decal and emissive layers take none */
export const SHADOW_RECEIVERS: readonly string[] = ['m_sand', 'm_frontier', 'm_pellam'];

/**
 * The view-model's rig (polish round 3; R6: "clearly lit and readable in every zone's mood"). The revolver took the
 * zone's ambient and key like any prop: seen from behind and above, almost none of its faces met a world key, and under
 * the interior moods (ambient 0.02 to 0.06 linear before the exposure) dark steel was a black shape: mean L* 16 to 21
 * against 23 to 38 behind it, 0 % highlight pixels in five zones of eight. Now every mood carries a rig for the gun and
 * the hands, at DISPLAY levels (divided by the mood's exposure, so the gun is as bright on screen in the bore as in the
 * street): the mood's ambient held half-way to grey and never under VM_AMB, a key of the mood's hue held half-way to a
 * warm white and never under VM_KEY, a cool rim of VM_RIM. Their directions are fixed in VIEW space (materials.ts).
 */
export const VM_AMB = 0.11, VM_KEY = 0.55, VM_RIM = 0.60;
const VM_WARM = 0xffe2c0, VM_COOL = 0x9fd0e8;
const luma3 = (c: readonly number[]): number => 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
/** a hue at luminance 1 (linear) */
function hueOf(hex: number): number[] { const c = [0, 0, 0]; hexToLinearInto(hex, c, 1); const l = Math.max(luma3(c), 1e-4); return [c[0]! / l, c[1]! / l, c[2]! / l]; }

const S: readonly [number, number, number] = [-0.686, 0.242, -0.686];
/** ambient `#7A86D8` x 0.55 + half the key `#FFD09A` x 1.1, linear */
const L1_FLAT: number[] = (() => { const a = [0, 0, 0], k = [0, 0, 0]; hexToLinearInto(0x7a86d8, a, 0.55); hexToLinearInto(0xffd09a, k, 0.55); return [a[0]! + k[0]!, a[1]! + k[1]!, a[2]! + k[2]!]; })();

function hexToLinearInto(hex: number, out: number[], scale: number): void {
  for (let i = 0; i < 3; i++) {
    const c = ((hex >> (16 - 8 * i)) & 255) / 255;
    out[i] = (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * scale;
  }
}

/** sRGB hex -> linear r, g, b written at `at` */
export function hexToLinear(hex: number, out: Float32Array | number[], at: number, scale = 1): void {
  for (let i = 0; i < 3; i++) {
    const c = ((hex >> (16 - 8 * i)) & 255) / 255;
    out[at + i] = (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * scale;
  }
}
/** linear 0..1 -> sRGB byte */
export function linearToByte(v: number): number {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
}

interface MoodSpec {
  fogA: number; fogB: number; mixSun?: number; mixDist?: number; density: number; falloff?: number; extra?: number;
  zenith?: number; mid?: number; glow?: number; midSin?: number; sunDisc?: number; sunCol?: number; cloud?: number;
  ambient: number; ambientK: number; key: number; keyK: number; keyDir: readonly [number, number, number];
  exposure: number; tint: readonly [number, number, number]; lift: readonly [number, number, number];
  saturation: number; contrast: number; vignette: number; pulse: number;
  sunDir?: readonly [number, number, number]; rule?: number; sky?: number;
  /** the cool fill of dynamic things (hex, strength): see M_RIM */
  rim?: number; rimK?: number;
  /** hue of the view-model's rim (the zone's own edge light). When absent: VM_COOL under a sky, the hue of the view-model's key in a room (look team gun, pass i2: a cool rim on every upward face of the gun in the lamp-orange rooms was "a constant cyan-white stripe in every mood") */
  vmRim?: number;
  /** how much of their hue the view-model's ambient and key keep (the rest is white / a warm white); 0.5 and 0.7 when absent (look team gun, pass i2: the Tally House) */
  vmAmbSat?: number; vmKeySat?: number;
  /** hue of the view-model's key where the room's own light is not the mood's key (look team gun, round 5: the Tally House's lamp-orange; without it a mood with keyK 0 lit the gun warm white in an orange room) */
  vmKey?: number;
  /** hue of the view-model's ambient, when the room's bounce is not the mood's ambient hue (look team gun, round 5) */
  vmAmb?: number;
  /** the view-model rig's level in this mood against the floors (a bright room wants more, a dark gallery less); 1 when absent */
  vmK?: number;
  /** the share of that level the rig's AMBIENT takes (look team gun, release pass p0: at dusk the gun's body comes down a third and its key, the highlights, stays); 1 when absent */
  vmAmbK?: number;
  /** she stands in shade (L0, under the overhang): the view-model's key is the rig's floor in a warm white, not the mood's sun */
  vmShade?: boolean;
  /** the exposure is a glare over another mood's colours (L0): fog and sky are not divided by it */
  glare?: boolean;
  /** High tier: the bloom's threshold (a display level) and intensity in this mood; BLOOM_T_DEFAULT / BLOOM_K_DEFAULT when absent */
  bloomT?: number; bloomK?: number;
  /** High tier: how far over the threshold a thing is before it blooms in full (a display level): a wide knee has no edge in a sky's gradient */
  bloomS?: number;
}

function build(s: MoodSpec): Float32Array {
  const m = new Float32Array(MOOD_SIZE);
  // Fog and sky colours are DISPLAY targets (ART_BIBLE 3): the mood's exposure multiplies the whole frame afterwards, so
  // they are stored divided by it. L0 is the exception: its exposure is the glare over L1's own colours.
  const d = s.glare ? 1 : 1 / s.exposure;
  hexToLinear(s.fogA, m, M_FOG_A, d); hexToLinear(s.fogB, m, M_FOG_B, d);
  m[M_FOG_MIX_SUN] = s.mixSun ?? 0; m[M_FOG_MIX_DIST] = s.mixDist ?? 0;
  m[M_DENSITY] = s.density; m[M_HEIGHT_FALLOFF] = s.falloff ?? 0.35; m[M_HEIGHT_EXTRA] = s.extra ?? 0;
  // without a sky the three bands are the far fog colour: the triangle behind everything is the fog
  hexToLinear(s.zenith ?? s.fogB, m, M_ZENITH, d); hexToLinear(s.mid ?? s.fogB, m, M_MID, d); hexToLinear(s.glow ?? s.fogB, m, M_GLOW, d);
  m[M_MID_SIN] = s.midSin ?? 0.4226;
  m[M_SUN_DISC] = s.sunDisc ?? 0; hexToLinear(s.sunCol ?? 0xffe9b8, m, M_SUN_COL);
  m[M_CLOUD] = s.cloud ?? 0;
  hexToLinear(s.ambient, m, M_AMBIENT, s.ambientK); hexToLinear(s.key, m, M_KEY, s.keyK);
  const kd = s.keyDir, kl = Math.hypot(kd[0], kd[1], kd[2]) || 1;
  m[M_KEY_DIR] = kd[0] / kl; m[M_KEY_DIR + 1] = kd[1] / kl; m[M_KEY_DIR + 2] = kd[2] / kl;
  m[M_EXPOSURE] = s.exposure;
  for (let i = 0; i < 3; i++) { m[M_TINT + i] = s.tint[i] as number; m[M_LIFT + i] = s.lift[i] as number; }
  m[M_SATURATION] = s.saturation; m[M_CONTRAST] = s.contrast; m[M_VIGNETTE] = s.vignette; m[M_PULSE] = s.pulse;
  const sd = s.sunDir ?? S, sl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
  m[M_SUN_DIR] = sd[0] / sl; m[M_SUN_DIR + 1] = sd[1] / sl; m[M_SUN_DIR + 2] = sd[2] / sl;
  m[M_RULE] = s.rule ?? 0; m[M_SKY] = s.sky ?? 0;
  // the flat dynamic light of the mood relative to the Long Light's, held back toward grey (a placeholder is a sketch
  // of the room's level, not of its colour)
  let luma = 0;
  const place = [0, 0, 0];
  for (let i = 0; i < 3; i++) place[i] = ((m[M_AMBIENT + i] as number) + 0.5 * (m[M_KEY + i] as number)) / (L1_FLAT[i] as number);
  luma = 0.2126 * (place[0] as number) + 0.7152 * (place[1] as number) + 0.0722 * (place[2] as number);
  // ... and at the level the room is shown at: the mood's exposure lifts it again afterwards
  const level = s.glare ? 1 : Math.min(1, 1 / s.exposure);
  for (let i = 0; i < 3; i++) m[M_PLACE + i] = Math.min(1.2, (luma + ((place[i] as number) - luma) * 0.55) * level);
  if (s.rim !== undefined) hexToLinear(s.rim, m, M_RIM, s.rimK ?? 0);
  // the view-model's rig, at display levels
  const ex = Math.max(s.exposure, 1e-3);
  const amb = [m[M_AMBIENT] as number, m[M_AMBIENT + 1] as number, m[M_AMBIENT + 2] as number];
  const key = [m[M_KEY] as number, m[M_KEY + 1] as number, m[M_KEY + 2] as number];
  const vmK = s.vmK ?? 1;
  const ambL = Math.max(luma3(amb), VM_AMB / ex) * vmK * (s.vmAmbK ?? 1), keyL = (s.vmShade ? VM_KEY / ex : Math.max(luma3(key), VM_KEY / ex)) * vmK;
  const ambH = hueOf(s.vmAmb ?? s.ambient), keyH = hueOf(s.vmKey ?? (s.keyK > 0 && !s.vmShade ? s.key : VM_WARM)), warm = hueOf(VM_WARM);
  const rimH = s.vmRim !== undefined || s.sky ? hueOf(s.vmRim ?? VM_COOL) : keyH;
  const aS = s.vmAmbSat ?? 0.5, kS = s.vmKeySat ?? 0.7;
  for (let i = 0; i < 3; i++) {
    m[M_VM_AMB + i] = (aS * (ambH[i] as number) + 1 - aS) * ambL;
    m[M_VM_KEY + i] = (kS * (keyH[i] as number) + (1 - kS) * (warm[i] as number)) * keyL;
    m[M_VM_RIM + i] = (rimH[i] as number) * VM_RIM / ex;
  }
  m[M_BLOOM_T] = s.bloomT ?? BLOOM_T_DEFAULT; m[M_BLOOM_K] = s.bloomK ?? BLOOM_K_DEFAULT; m[M_BLOOM_S] = s.bloomS ?? 0;
  return m;
}

const L1: MoodSpec = {
  fogA: 0xc9a592, fogB: 0xedbb86, mixSun: 1, density: 0.0058, falloff: 0.35, extra: 0,
  zenith: 0x2c5a6e, mid: 0x8fb0a0, glow: 0xf3c58e, midSin: 0.4226, sunDisc: 1, sunCol: 0xffe9b8, cloud: 0.18,
  ambient: 0x7a86d8, ambientK: 0.55, key: 0xffd09a, keyK: 1.1, keyDir: S,
  exposure: 1.0, tint: [1.06, 1.0, 0.92], lift: [0.015, 0.020, 0.040], saturation: 1.0, contrast: 1.06, vignette: 0.35, pulse: 0.35,
  sunDir: S, rule: 1, sky: 1,
  bloomT: 0.55, bloomS: 0.35, bloomK: 0.9,
  // look team gun, pass i1 (the visual reviewer: "the same cold cobalt under a red rock overhang and a setting sun"): the
  // Long Light's ambient is a blue-violet (the shade of its sky on the sand) and the steel mirrored it on every face. What
  // the gun mirrors out of doors is the sky overhead, a slate teal; the sun keeps the key, the band and the ground. Under
  // the overhang (L0) the fill is the red rock's bounce
  vmAmb: 0x7c98a8,
};

/**
 * L0, the overhang (ART_BIBLE 2.3 and 3.1; polish round 2). The first image of the demo is "black overhang, blazing
 * valley": 25 : 5 : 70, the rock frame `#2A1A1E` to `#48272D`, only the mouth bright. Round 1 held the whole glare
 * (x2.4, fog toward `#E6E2D0` at x1.6 and not divided by the exposure, lift 0.03, contrast 0.96) for as long as she
 * stood inside: the frame measured L* 41 / 45 / 55 / 62 / 72 with 1 % of it dark, and the first 80 m of the gully were
 * cream. Now: the Long Light's own fog and lift, no dust term under the roof (the gully's 1.5 starts with L1), one
 * third of a stop of glare left to settle over the 20 s ramp (x1.3 -> x1.0, saturation 0.9 -> 1.0), contrast 1.10 and
 * a deeper vignette so the frame stays a frame. Fog and sky are L1's own, not divided by the exposure: the valley
 * through the mouth is the over-exposed part.
 */
const L0_EXPOSURE = 1.3;

export const MOODS: Readonly<Record<MoodKey, Float32Array>> = {
  // look-dev, polish round 3 (R7, the first image): the rock frame was L* 24 to 33 (no dark anchor: p5 24). Under the
  // roof the grade's lift is halved and the contrast is 1.20: the roof and the side walls fall to L* 14 to 22, the slot
  // and the sun patch stay where they were.
  L0: build({ ...L1, vmAmb: 0x8a6a5c, glare: true, vmShade: true, exposure: L0_EXPOSURE, tint: [1.05, 1.0, 0.94], lift: [0.008, 0.010, 0.020], saturation: 0.9, contrast: 1.20, vignette: 0.45, bloomT: 0.42, bloomS: 0.35, bloomK: 1.0 }),
  L1: build(L1),
  L2: build({
    fogA: 0x1c1318, fogB: 0x1c1318, density: 0.020, falloff: 0.35, extra: 0,
    // creatures and props, pass i1 (the visual reviewer: the seated dead are "bald grey ball heads"): the dynamic ambient was a
    // dim mauve (`#4A3A44` x 0.35) in a room whose every baked surface is lamp-orange: a linen hood under it came out a cold
    // grey at L* 38, a dead thing among warm boards. It is the boards' own bounce now, 2.5 times the light: the hoods are
    // the pale warm accents of the room (ART_BIBLE 3.2). Its luminance stays under the view-model rig's floor (VM_AMB /
    // exposure = 0.044), so the gun's own light does not move
    // ... and the shape shading of an instanced thing (materials.ts: 0.72 + 0.56 N.L along the key's direction; the key
    // itself stays 0 outside a blade) comes from the lamps overhead, not from the Long Light's low sun through a wall:
    // a seated head has a lit crown and a shaded jaw
    ambient: 0xcb9587, ambientK: 0.118, key: 0xffd09a, keyK: 0, keyDir: [0.16, 1, 0.10],
    // look team gun, pass i2 (both visual reviewers: "flat pale pewter in the shutter-lit Tally House", "the palest, coolest
    // object in a deep orange room"; measured mean L* 30.4 over a background of 18 to 24, 2.9 % over L* 60): the rig's
    // ambient was half white and its key a third white, at the floors every room has, and the steel's blue tinted both
    // grey. This is the one room whose every surface is lamp-orange and dark: the ambient is the boards' own bounce and
    // 0.72 of the share (the body of the steel falls to the room's level), the key is the lamp flame at 0.76 with most of
    // its hue, the rim follows the key (see vmRim). tests/render/moods.spec holds every OTHER mood at 0.85 of the floors.
    vmK: 0.764, vmAmbK: 0.66, vmAmbSat: 0.7, vmKeySat: 0.8,   // was vmK 0.86 (r5); closer, pass i3: vmAmbK 0.72 -> 0.66 (after the final rebuild the room behind the gun measured L* 22.9, the steel 25.8: tests/art_weapons/i3_real holds it within 2)
    vmAmb: 0x784d3a, vmKey: 0xffaa66,   // was 0x8a6450, 0xffa866 (r5: the lamp-lit boards are this room's light)
    exposure: 2.5, tint: [1.05, 0.98, 0.90], lift: [0.012, 0.007, 0.009], saturation: 0.92, contrast: 1.16, vignette: 0.55, pulse: 1,
    // underground look, pass i1 (R9): the Tally House had no bloom of its own (the plain 1.15: only the Biders' lamps). The
    // lamp-lit table, the shutters' patches of sun on the boards and the street door are the lights of this room and glow
    bloomT: 0.62, bloomS: 0.40, bloomK: 0.9,
  }),
  L3: build({
    fogA: 0x0a1424, fogB: 0x14343e, mixDist: 1 / 40, density: 0.023, extra: 0,
    // look team creatures-props, pass i3 (the reviewer: "a plain black ring on a thin black pole stands unlit against the lit
    // corridor"): the stair and the gallery light a dynamic thing from straight above only, so every upright face (the
    // sighting loop and its post, a Bider's flank, a door leaf) had the ambient alone, L* 15 beside walls at L* 55. A
    // teal fill on upright faces and the silhouette, as the chamber has had since polish round 3 (M_RIM), at half its level
    rim: 0x7cf2e2, rimK: 0.5,
    ambient: 0x1e3a5c, ambientK: 0.45, key: 0x7cf2e2, keyK: 0.5, keyDir: [0, 1, 0], vmK: 1.24,   // pass i1: 1.14 -> 1.24 (the cap of tests/render/moods.spec; the darker steel: 0.9 % of highlight and 3.2 % under L* 12 in the gallery) <- release pass p0: 1.08 -> 1.14 (highlights 2.2 % with the hand in the frame)
   //   // look team gun r5: 0.95 -> 1.08 (the darker studio left 2.2 % of highlight in the gallery)
   
    exposure: 1.75, tint: [0.96, 1.0, 1.04], lift: [0.004, 0.008, 0.016], saturation: 0.88, contrast: 1.15, vignette: 0.50, pulse: 1,
    sunDir: [1, 0, 0],
    bloomT: 0.55, bloomS: 0.40, bloomK: 1.0,
  }),
  L4: build({
    fogA: 0x0a1322, fogB: 0x122a36, mixDist: 1 / 40, density: 0.026, extra: 0,
    ambient: 0x1e3a5c, ambientK: 0.40, key: 0x7cf2e2, keyK: 0.45, keyDir: [0, 1, 0],
    vmK: 1.25,   // look-dev r3: the gun's reflections are its light now; at 1 the hall left 12 % of it under L* 12
    exposure: 1.9, tint: [1.0, 1.0, 1.0], lift: [0.004, 0.007, 0.014], saturation: 0.80, contrast: 1.16, vignette: 0.50, pulse: 1,
    sunDir: [1, 0, 0],
    // underground look, polish round 5: 0.55 -> 0.68. The ring's lit surround (a field at about 0.6 to 0.75 of display
    // white from the hall's checkpoint) bloomed into one flat mint sheet on High; the pools and lamps are over 1 and still glow
    bloomT: 0.68, bloomS: 0.40, bloomK: 1.0,
  }),
  // the chamber, unproven: violet from the bore; the height term stands on the kerb top
  L5: build({
    fogA: 0x15122c, fogB: 0x15122c, density: 0.018, falloff: 0.35, extra: 1.2,
    // polish round 2: a violet key from below on a violet-lit room drew the Windlass as a dark violet shape on dark
    // violet (15 to 27 % of the frame over OKLCH chroma 0.11). Dynamic things in the chamber take a cool aqua key from
    // the six bay lamps above (the drum face gets a lit top plane and a dark underside); the bore's violet stays in
    // the ambient, held back.
    // polish round 3: lit from above only, its flanks and back were a black mass at fight distance. A slate ambient
    // (no longer violet), and a teal fill on upright faces and the silhouette (M_RIM); the grade's violet cast is halved.
    ambient: 0x41507a, ambientK: 0.55, key: 0x7cf2e2, keyK: 0.35, keyDir: [0.12, 1, -0.2], rim: 0x9ad2d8, rimK: 1.0,
    vmK: 1.38,   // pass i1: 1.35 -> 1.38 (the darker steel: mean L* 23.6 against the plate's 32) <- (r5: stands) <- look-dev r3: the view-model in the chamber (21 % of the gun under L* 12 at 1)
    exposure: 2.2, tint: [1.0, 0.98, 1.04], lift: [0.006, 0.005, 0.014], saturation: 1.0, contrast: 1.18, vignette: 0.50, pulse: 1,
    // underground look, polish round 5 (R7, R9): the boss room on High. At the plain 1.15 only the lamps bloomed; the
    // bore's own light in the pit and the bay pools on the plate are the lights of this frame and now glow
    bloomT: 0.80, bloomS: 0.45, bloomK: 0.9,
  }),
  // the antechamber: the Dowser's embers, not violet
  L5a: build({
    fogA: 0x1a1420, fogB: 0x1a1420, density: 0.015, extra: 0,
    // integration: the baked room is dark violet-slate with one small pool of ember light at the camp; a 0.6 ember KEY
    // on every dynamic thing in the room drew the enamel bore door, the cradle and the station plate bright orange
    // against it (shots/integrate-art/game_low/x_cradle.png). The embers are a hint of warmth on them, not their light.
    ambient: 0x3a3252, ambientK: 0.45, key: 0xff9433, keyK: 0.16, keyDir: [-0.4, -0.35, -0.85], vmK: 1.44,
    // look team gun, release pass p0 (the visual reviewer: "pink-lilac in the amber antechamber"): the baked room is
    // ember-lit concrete; the mood's violet-slate ambient under an ember key drew the steel pink. The rig takes the room's umber
    vmAmb: 0x5e4c3c, vmKey: 0xffa462,
    // closer, polish round 2 (docs/requests/art-env-interior.md, fixer row 2): the antechamber is not violet (ART_BIBLE 2.4):
    // a warm lift and tint instead of the chamber's
    // underground look, release pass p0: saturation 0.78 -> 0.92. The embers' pool was re-baked lower (it clipped to a
    // mustard and took the station plate with it on High); at 0.78 the unclipped orange drew as tan
    exposure: 1.3, tint: [1.03, 1.0, 0.97], lift: [0.010, 0.006, 0.007], saturation: 0.92, contrast: 1.18, vignette: 0.55, pulse: 1,
    bloomT: 0.62, bloomS: 0.40, bloomK: 1.0,   // underground look, pass i1: 0.75 / 0.9 -> 0.62 / 1.0 (the embers' pool on the floor glows too) <- polish round 5: the embers and the cradle's lamp glow on High
  }),
  // the catwalk: lit from below through the grille
  L5c: build({
    fogA: 0x181230, fogB: 0x181230, density: 0.018, extra: 0,
    ambient: 0x4a4a78, ambientK: 0.40, key: 0x9a8ed0, keyK: 0.5, keyDir: [0, -1, 0], rim: 0x9ad2d8, rimK: 0.4,
    // look team gun, release pass p0 (the visual reviewer: "saturated violet in the proving-lift cage"): the catwalk, the
    // cage and the stair are teal enamel under aqua lamps; the mood's violet (the bore's light from below, for the Windlass)
    // drew the gun violet in a green room. The rig takes the lamps' slate-teal and a soft aqua key
    vmAmb: 0x3c5560, vmKey: 0x9adfd2, vmK: 1.3,   // pass i1: the darker steel left 16 % of the gun under L* 12 on the catwalk at 1
    exposure: 1.7, tint: [1.0, 0.98, 1.04], lift: [0.008, 0.005, 0.016], saturation: 1.0, contrast: 1.16, vignette: 0.55, pulse: 1,
    bloomT: 0.48, bloomS: 0.45, bloomK: 1.0,   // underground look, polish round 5: from the dark catwalk the lit drum, the pit and the bay pools are the lights of the frame (the Windlass is first seen from here); at 0.8 High drew Low's frame (0.6 of 255 apart)
  }),
  L5p: build({
    fogA: 0x0c262c, fogB: 0x0c262c, density: 0.012, extra: 0,
    ambient: 0x2a6a70, ambientK: 0.50, key: 0x7cf2e2, keyK: 0.6, keyDir: [0, -1, 0], rim: 0xbfeee6, rimK: 0.5,
    vmK: 1.3,   // look-dev r3
    exposure: 1.8, tint: [0.96, 1.02, 1.02], lift: [0.004, 0.010, 0.014], saturation: 0.90, contrast: 1.15, vignette: 0.45, pulse: 1,
    bloomT: 0.75, bloomS: 0.45, bloomK: 1.0,   // underground look, polish round 5: the proven chamber glows aqua on High
  }),
  // blue hour: the ember band is the horizon toward the afterglow, cold `#4D5578` in the east; fog equals it all round
  L6: build({
    // polish round 2: 0.012 with a height extra of 0.8 took the plain, the town's lamps and the fire (the ending's
    // three subjects, 250 to 520 m out) into one flat haze. The ledge stands above the dust: 0.0065, extra 0.25.
    // polish round 3 (lead rulings R5, R7; the critic: "everything in the L* 25 to 51 band, the horizon glow a
    // hard-edged band"): the last image is a DARK land under a lit sky. Half the fog again and a fog that goes dark, not
    // pale (`#2C3454` away from the afterglow, `#B0705A` toward it); the sky a three-stop gradient over 15 degrees
    // (ember `#FFB888` at the horizon, `#3C4674` above it, `#0E1630` overhead) instead of a 1 degree stripe; the exposure
    // down from x1.8 to x1.12 and the contrast up, so the ledge, the mesas and the plain fall under L* 20 and the
    // afterglow, the fire and the lamps are the lights of the frame.
    fogA: 0x2c3454, fogB: 0xb0705a, mixSun: 1, density: 0.0032, falloff: 0.35, extra: 0.15,
    // look-dev, polish round 3: the ember met the blue inside 13 degrees and read as a band with two soft edges. The
    // mid stop is a dusk violet and sits 25 degrees up: ember -> violet -> night over the whole height of the frame.
    zenith: 0x0e1630, mid: 0x443c72, glow: 0xffb888, midSin: 0.4226, sunDisc: 0,
    ambient: 0x4a5a96, ambientK: 0.50, key: 0xff9e6b, keyK: 0.35, keyDir: [-0.70, 0.10, -0.70],
    // the grade's contrast (1.22) crushes the rig's shadow side: 18 % of the view-model sat under L* 12 at vmK 1
    // look team gun, release pass p0 (the visual reviewer: "at the dusk rim it is the brightest large object in the frame,
    // mean L 26.8 against 13.3"): the body (the rig's ambient) comes down a sixth (R6's black bound stops it there); the key keeps the
    // highlights (R6 wants 2 % of them); the ambient's hue is the dusk's slate, not its violet (ember on violet was pink)
    vmAmbK: 0.9, vmAmb: 0x485470,   // pass i3: 1.0 -> 0.9 (both visual reviewers: "pale silver at dusk", mean L* 24 against the dune's 14.6; the steel's body is a cooled grey of the room now (materials.ts GUN_AMB_SAT) and its toe holds R6's black bound) <- pass i1: 0.84 -> 1.0, the steel's body is dark by its material now (mean L* 22 on the rim, it was 26.7) and 7 % of it fell under L* 12 //   // (0.68, the floor of tests/render/moods.spec, left 4.4 % of the view-model under L* 12 and 2.1 % of highlight on the rim: R6's bounds are 4 and 2; vmK 1.1 x 0.78 the same)
    vmK: 1.4,   // (pass i3: stands; the body comes down by vmAmbK) <- pass i1: 1.32 -> 1.4 (3.5 % of the darker steel under L* 12 on the rim; its mean is L* 23, it was 26.7) <- release pass p0: 1.25 -> 1.32 (the hands are a third of the view-model now and carry no highlight: 2.1 % of it was over L* 60) <- look team gun r4: 0.9 left 8 % of the view-model under L* 12, 1.05 left 5 and 1.15 left 4.1 (tests/render polish3 R6 allows 4); at 1.25 its mean is about L* 28. Was 0.9 -> polish r4 (exterior look): 1.35 made the gun the lightest large shape of the last image (mean L* 32 over a ledge of 13); at 0.9 its body sits near L* 24 and only its highlight is bright
    exposure: 1.12, tint: [0.98, 0.98, 1.06], lift: [0.005, 0.007, 0.018], saturation: 0.95, contrast: 1.22, vignette: 0.50, pulse: 0.7,
    sunDir: [-0.70, 0.10, -0.70], rule: 1, sky: 1,
    bloomT: 0.25, bloomS: 0.40, bloomK: 1.15,   // exterior look, pass i3: 1.0 -> 1.15 (the two lines, the windows and the fire carry a little more of their light into the dusk on High)
  }),
  // the rim's lift cage (look team exterior, polish round 5): filled from L6 below (rimCage)
  L6c: new Float32Array(MOOD_SIZE),
};

/**
 * L6c, the rock room the proving lift opens from (look team exterior, polish round 5; the visual critic: "the cage
 * interior is pure black with no lit surface"). The cage is enamel black-teal (albedo about 0.03): under the blue hour's
 * dynamic light (ambient 0.5, an ember key of 0.35 from the north-west, exposure 1.12) every panel of it drew at L* 7,
 * one flat ink with the gate's opening cut out of it. A DYNAMIC thing that stands inside the frame (z beyond
 * RIM_CAGE_MIN_Z: only the cage does) takes the afterglow that comes in through the gate instead: an ember key from
 * the north, a little above the horizon (the back wall and the floor toward the gate take it, the side walls do
 * not), a dusk-violet ambient, and a fill on upright faces. Everything else is L6's, the view-model's rig included:
 * the frame, the fog, the sky and the revolver do not change when she steps out.
 */
function rimCage(from: Float32Array, out: Float32Array): void {
  out.set(from);
  hexToLinear(0x6a5a96, out, M_AMBIENT, RIM_CAGE_AMBIENT); hexToLinear(0xff9e6b, out, M_KEY, RIM_CAGE_KEY);
  out[M_KEY_DIR] = 0; out[M_KEY_DIR + 1] = 0.24; out[M_KEY_DIR + 2] = -0.97;
  hexToLinear(0x9a7aa8, out, M_RIM, RIM_CAGE_FILL);
}
export const RIM_CAGE_AMBIENT = 0.5, RIM_CAGE_KEY = 2.4, RIM_CAGE_FILL = 1.2;
/** the rim's cage stands south of the cliff's face (z 111): a dynamic thing beyond this z is inside the rock */
export const RIM_CAGE_MIN_Z = 111.8;
rimCage(MOODS.L6, MOODS.L6c);

export function isMoodKey(s: string): s is MoodKey { return Object.prototype.hasOwnProperty.call(MOODS, s); }

/** out = a + (b - a) * t, field by field; directions are re-normalised */
export function lerpMood(out: Float32Array, a: Float32Array, b: Float32Array, t: number): void {
  for (let i = 0; i < MOOD_SIZE; i++) out[i] = (a[i] as number) + ((b[i] as number) - (a[i] as number)) * t;
  normalise3(out, M_KEY_DIR); normalise3(out, M_SUN_DIR);
}
function normalise3(m: Float32Array, at: number): void {
  const x = m[at] as number, y = m[at + 1] as number, z = m[at + 2] as number;
  const l = Math.hypot(x, y, z);
  if (l > 1e-6) { m[at] = x / l; m[at + 1] = y / l; m[at + 2] = z / l; } else { m[at] = 0; m[at + 1] = 1; m[at + 2] = 0; }
}
export function smoothstep01(t: number): number { const x = t <= 0 ? 0 : t >= 1 ? 1 : t; return x * x * (3 - 2 * x); }

/** The bore's sub-volumes (ART_BIBLE 3.6): antechamber and its stair north of z 80.3, the catwalk level above y -38. */
export const BORE_ANTE_MAX_Z = 80.3;
export const BORE_CATWALK_MIN_Y = -38.5;
/** top of the kerb round the bore mouth: where the chamber's height fog stands */
export const BORE_KERB_TOP_Y = -43.4;

/**
 * The mood whose dynamic ambient and key light a thing standing at a point of a zone. `zoneMood` is the layout's mood
 * of that zone; `wrong` is wrong_fade (the proven chamber is L5p).
 */
export function moodAt(zone: ZoneId | null, zoneMood: MoodId, y: number, z: number, wrong: number): MoodKey {
  if (zone === 'far_rim' && zoneMood === 'L6' && z > RIM_CAGE_MIN_Z) return 'L6c';
  if (zone !== 'the_bore') return zoneMood;
  if (z < BORE_ANTE_MAX_Z && y < BORE_CATWALK_MIN_Y) return 'L5a';
  if (y >= BORE_CATWALK_MIN_Y) return wrong >= 0.5 ? 'L5p' : 'L5c';
  return wrong >= 0.5 ? 'L5p' : 'L5';
}

/**
 * Height-fog extra of exterior cells under the Long Light: 1.0 in the gully, 0.6 on the street, 0 in the yard
 * (ART_BIBLE 3.2 says 1.5 for the gully: with the eye 1.65 m up in that dust it measured 35 % at 40 m against the
 * same table's "20 % at 40 m", and rocks 20 m off dissolved; 1.0 gives 27 %). -1 = the mood's own.
 */
export function cellHeightExtra(zone: ZoneId | '', cell: string): number {
  if (zone === 'the_lip') return 1.0;
  if (zone === 'plenty_street') return cell === 'cell_yard' || cell === 'cell_yard_door' ? 0 : 0.6;
  return -1;
}

// ---- the grade, in JS, for tests (the GLSL twin is GRADE_GLSL in post.ts) -----------------------------------------
/** saturation, contrast (about mid-grey, in square-root space), tint, then the lift that keeps every pixel above the floor */
export function grade(rgb: [number, number, number], tint: readonly number[], lift: readonly number[], saturation: number, contrast: number, vignette = 0): [number, number, number] {
  const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  for (let i = 0; i < 3; i++) {
    let c = l + ((rgb[i] as number) - l) * saturation;
    const s = (Math.sqrt(Math.max(c, 0)) - 0.5) * contrast + 0.5;
    c = s <= 0 ? 0 : s * s;
    c *= tint[i] as number;
    c *= 1 - vignette;
    c = c + (lift[i] as number) * (1 - Math.min(c, 1));
    rgb[i] = c;
  }
  return rgb;
}
/** `#0B0D12` in linear: nothing but UI is darker on screen */
export const FLOOR_LINEAR: readonly [number, number, number] = [0.003347, 0.004025, 0.006049];
